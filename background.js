const presetCategories = [
  { name: "Social Media", suggestedLimit: 30 },
  { name: "Video Streaming", suggestedLimit: 60 },
  { name: "Gaming", suggestedLimit: 60 },
  { name: "News", suggestedLimit: 30 },
  { name: "Productivity", suggestedLimit: 120 },
  { name: "Education", suggestedLimit: 90 },
  { name: "Shopping", suggestedLimit: 30 },
  { name: "Other", suggestedLimit: 60 }
];

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.sync.set({ categories: presetCategories }, () => {
      console.log("Preset categories have been set.");
    });
  }
});

let activeTabId = null;
let startTime = null;
let intervalId = null;
let ignoredSites = new Set();

// Listen for tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  handleTabChange(activeInfo.tabId);
});

// Listen for URL changes within the same tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tabId === activeTabId) {
    handleTabChange(tabId);
  }
});

// Handle tab changes
function handleTabChange(tabId) {
  if (activeTabId) {
    saveTimeForActiveTab();
  }

  if (intervalId) {
    clearInterval(intervalId);
  }

  activeTabId = tabId;
  startTime = new Date();

  chrome.tabs.get(tabId, (tab) => {
    const hostname = new URL(tab.url).hostname;
    if (!ignoredSites.has(hostname)) {
      chrome.storage.local.get(hostname, (data) => {
        if (!data[hostname]) {
          chrome.tabs.sendMessage(tabId, {action: "promptTrack", hostname: hostname});
        } else if (data[hostname].isTracking && !data[hostname].isPaused) {
          if (data[hostname].schedule) {
            checkSchedule(hostname, data[hostname].schedule);
          } else {
            const timeSpent = data[hostname].time || 0;
            const initialLimit = data[hostname].initialLimit;
            const totalExtendedTime = data[hostname].totalExtendedTime || 0;
            const totalTimeLimit = (initialLimit + totalExtendedTime) * 60 * 1000;

            if (timeSpent < totalTimeLimit) {
              const remainingTime = (totalTimeLimit - timeSpent) / 60000;
              chrome.alarms.create(hostname, { delayInMinutes: remainingTime });
            } else {
              pauseTracking(hostname, tabId);
              chrome.tabs.sendMessage(tabId, {
                action: "showTimeLimitReached", 
                hostname: hostname,
                currentTime: timeSpent,
                initialLimit: initialLimit,
                totalExtendedTime: totalExtendedTime
              });
            }
          }
        }
      });
    }
  });

  intervalId = setInterval(saveTimeForActiveTab, 1000);
}

function pauseTracking(hostname, tabId) {
  chrome.storage.local.get(hostname, (data) => {
    const siteData = data[hostname];
    const updatedData = {
      ...siteData,
      isPaused: true
    };
    chrome.storage.local.set({ [hostname]: updatedData }, () => {
      chrome.alarms.clear(hostname);
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    });
  });
}

function resumeTracking(hostname) {
  chrome.storage.local.get(hostname, (data) => {
    const siteData = data[hostname];
    const updatedData = {
      ...siteData,
      isPaused: false
    };
    chrome.storage.local.set({ [hostname]: updatedData }, () => {
      const totalLimit = (siteData.initialLimit + (siteData.totalExtendedTime || 0)) * 60 * 1000;
      const remainingTime = (totalLimit - siteData.time) / 60000;
      if (remainingTime > 0) {
        chrome.alarms.create(hostname, { delayInMinutes: remainingTime });
        startTime = new Date();
        intervalId = setInterval(saveTimeForActiveTab, 1000);
      }
    });
  });
}

function saveTimeForActiveTab() {
  const endTime = new Date();
  const timeSpent = endTime - startTime;

  chrome.tabs.get(activeTabId, (tab) => {
    const hostname = new URL(tab.url).hostname;
    chrome.storage.local.get(hostname, (siteData) => {
      if (siteData[hostname] && siteData[hostname].isTracking && !siteData[hostname].isPaused) {
        const currentTime = siteData[hostname].time || 0;
        const newTime = currentTime + timeSpent;
        const initialLimit = siteData[hostname].initialLimit;
        const totalExtendedTime = siteData[hostname].totalExtendedTime || 0;
        const totalTimeLimit = (initialLimit + totalExtendedTime) * 60 * 1000;

        chrome.storage.local.set({
          [hostname]: {
            ...siteData[hostname],
            time: newTime
          }
        }, () => {
          chrome.runtime.sendMessage({action: "updateTime", hostname: hostname, time: newTime});

          // Handle reminder
          if (siteData[hostname].reminder) {
            console.log('Checking reminder condition:', siteData[hostname].reminder);
            const reminderThreshold = totalTimeLimit * (siteData[hostname].reminder.percentage / 100);
            console.log('Current time:', newTime, 'Reminder threshold:', reminderThreshold);
            
            if (newTime >= reminderThreshold && currentTime < reminderThreshold) {
              console.log('Sending reminder message:', siteData[hostname].reminder.text);
              chrome.tabs.sendMessage(activeTabId, {
                action: "showCustomReminder",
                message: siteData[hostname].reminder.text
              });
            }
          }

          // Handle time limit
          if (newTime >= totalTimeLimit && currentTime < totalTimeLimit) {
            pauseTracking(hostname, activeTabId);
            chrome.tabs.sendMessage(activeTabId, {
              action: "showTimeLimitReached", 
              hostname: hostname,
              currentTime: newTime,
              initialLimit: initialLimit,
              totalExtendedTime: totalExtendedTime
            });
            chrome.alarms.clear(hostname);
          }
        });
      }
    });
  });

  startTime = new Date();
}

function checkSchedule(hostname, schedule) {
  const now = new Date();
  const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
  const [stopHour, stopMinute] = schedule.stopTime.split(':').map(Number);
  
  const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMinute);
  const stopTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), stopHour, stopMinute);
  
  if (now >= startTime && now < stopTime) {
    chrome.tabs.sendMessage(activeTabId, {action: "startScheduledTracking", hostname: hostname});
  } else if (now >= stopTime) {
    chrome.tabs.sendMessage(activeTabId, {action: "stopScheduledTracking", hostname: hostname});
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('dismiss_')) {
    const hostname = alarm.name.replace('dismiss_', '');
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0] && new URL(tabs[0].url).hostname === hostname) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "showTimeLimitReached", hostname: hostname});
      }
    });
  } else {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0] && new URL(tabs[0].url).hostname === alarm.name) {
        pauseTracking(alarm.name, tabs[0].id);
        chrome.tabs.sendMessage(tabs[0].id, {action: "showTimeLimitReached", hostname: alarm.name});
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "addSite") {
    chrome.storage.local.set({
      [request.hostname]: {
        time: 0,
        initialLimit: request.limit,
        totalExtendedTime: 0,
        schedule: request.schedule,
        reminder: request.reminder,
        isTracking: true,
        isPaused: false,
        category: request.category
      }
    }, () => {
      if (request.limit) {
        chrome.alarms.create(request.hostname, { delayInMinutes: request.limit });
      }
      sendResponse({success: true});
    });
    return true;
  } else if (request.action === "ignoreSite") {
    ignoredSites.add(request.hostname);
    sendResponse({success: true});
  } else if (request.action === "updateSiteSettings") {
    chrome.storage.local.get(request.hostname, (data) => {
      const currentSiteData = data[request.hostname] || {};
      let updatedData = { ...currentSiteData };

      if (request.settings.extendTime) {
        const newExtendedTime = (currentSiteData.totalExtendedTime || 0) + request.settings.extendTime;
        updatedData = {
          ...updatedData,
          totalExtendedTime: newExtendedTime,
          isPaused: false
        };
      } else {
        updatedData = { ...updatedData, ...request.settings };
      }

      chrome.storage.local.set({ [request.hostname]: updatedData }, () => {
        if (updatedData.initialLimit) {
          chrome.alarms.clear(request.hostname);
          const totalLimit = updatedData.initialLimit + (updatedData.totalExtendedTime || 0);
          if (updatedData.isTracking && !updatedData.isPaused) {
            chrome.alarms.create(request.hostname, { delayInMinutes: totalLimit });
          }
        }
        chrome.runtime.sendMessage({
          action: "siteSettingsUpdated",
          hostname: request.hostname,
          newData: updatedData
        });
        sendResponse({success: true});
      });
    });
    return true;
  } else if (request.action === "stopTracking") {
    chrome.storage.local.get(request.hostname, (data) => {
      const siteData = data[request.hostname];
      const updatedData = {
        ...siteData,
        isTracking: false,
        isPaused: false
      };
      chrome.storage.local.set({ [request.hostname]: updatedData }, () => {
        chrome.alarms.clear(request.hostname);
        sendResponse({success: true});
      });
    });
    return true;
  } else if (request.action === "rerunTracking") {
    chrome.storage.local.get(request.hostname, (data) => {
      const siteData = data[request.hostname];
      const updatedData = {
        ...siteData,
        isTracking: true,
        isPaused: false,
        time: 0,
        totalExtendedTime: request.preserveSettings ? siteData.totalExtendedTime : 0
      };
      chrome.storage.local.set({ [request.hostname]: updatedData }, () => {
        chrome.alarms.create(request.hostname, { delayInMinutes: updatedData.initialLimit });
        chrome.runtime.sendMessage({
          action: "siteSettingsUpdated",
          hostname: request.hostname,
          newData: updatedData
        });
        sendResponse({success: true});
      });
    });
    return true;
  } else if (request.action === "extendTime") {
    chrome.storage.local.get(request.hostname, (data) => {
      const siteData = data[request.hostname];
      const newExtendedTime = (siteData.totalExtendedTime || 0) + request.additionalTime;
      const updatedData = {
        ...siteData,
        totalExtendedTime: newExtendedTime,
        isPaused: false
      };

      chrome.storage.local.set({ [request.hostname]: updatedData }, () => {
        const totalLimit = (siteData.initialLimit + newExtendedTime) * 60 * 1000;
        const remainingTime = (totalLimit - siteData.time) / 60000;
        if (remainingTime > 0) {
          chrome.alarms.create(request.hostname, { delayInMinutes: remainingTime });
          startTime = new Date();
          intervalId = setInterval(saveTimeForActiveTab, 1000);
        }
        chrome.runtime.sendMessage({
          action: "siteSettingsUpdated",
          hostname: request.hostname,
          newData: updatedData
        });
        sendResponse({success: true});
      });
    });
    return true;
  } else if (request.action === "dismissNotification") {
    const dismissUntil = Date.now() + request.dismissDuration;
    chrome.storage.local.get(request.hostname, (data) => {
      const siteData = data[request.hostname] || {};
      const updatedData = {
        ...siteData,
        dismissedUntil: dismissUntil,
        isPaused: true
      };
      chrome.storage.local.set({ [request.hostname]: updatedData }, () => {
        chrome.alarms.create(`dismiss_${request.hostname}`, { when: dismissUntil });
        sendResponse({success: true});
      });
    });
    return true;
  }
});
