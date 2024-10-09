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
        } else if (data[hostname].isTracking) {
          if (data[hostname].schedule) {
            checkSchedule(hostname, data[hostname].schedule);
          } else if (data[hostname].limit) {
            const timeSpent = data[hostname].time || 0;
            const limitMs = data[hostname].limit * 60 * 1000;
            if (timeSpent < limitMs) {
              const remainingTime = (limitMs - timeSpent) / 60000;
              chrome.alarms.create(hostname, { delayInMinutes: remainingTime });
            } else {
              chrome.tabs.sendMessage(tabId, {action: "showTimeLimitReached", hostname: hostname});
            }
          }
        }
      });
    }
  });

  intervalId = setInterval(saveTimeForActiveTab, 1000);
}

function saveTimeForActiveTab() {
  const endTime = new Date();
  const timeSpent = endTime - startTime;

  chrome.tabs.get(activeTabId, (tab) => {
    const hostname = new URL(tab.url).hostname;
    chrome.storage.local.get(hostname, (siteData) => {
      if (siteData[hostname] && siteData[hostname].isTracking) {
        const currentTime = siteData[hostname].time || 0;
        const newTime = currentTime + timeSpent;

        chrome.storage.local.set({
          [hostname]: {
            ...siteData[hostname],
            time: newTime
          }
        }, () => {
          chrome.runtime.sendMessage({action: "updateTime", hostname: hostname, time: newTime});

          if (siteData[hostname].reminder) {
            const reminderThreshold = (siteData[hostname].limit * 60 * 1000) * (siteData[hostname].reminder.percentage / 100);
            if (newTime >= reminderThreshold && currentTime < reminderThreshold) {
              chrome.tabs.sendMessage(activeTabId, {
                action: "showCustomReminder",
                message: siteData[hostname].reminder.text
              });
            }
          }

          if (siteData[hostname].limit) {
            const limitMs = siteData[hostname].limit * 60 * 1000;
            if (newTime >= limitMs && currentTime < limitMs) {
              chrome.tabs.sendMessage(activeTabId, {action: "showTimeLimitReached", hostname: hostname});
              chrome.alarms.clear(hostname);
            }
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
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0] && new URL(tabs[0].url).hostname === alarm.name) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "showTimeLimitReached", hostname: alarm.name});
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "addSite") {
    chrome.storage.local.set({
      [request.hostname]: {
        time: 0,
        limit: request.limit,
        schedule: request.schedule,
        reminder: request.reminder,
        isTracking: true,
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
      const updatedData = {
        ...data[request.hostname],
        ...request.settings
      };
      chrome.storage.local.set({ [request.hostname]: updatedData }, () => {
        if (updatedData.limit) {
          chrome.alarms.clear(request.hostname);
          const remainingTime = (updatedData.limit * 60 * 1000 - (updatedData.time || 0)) / 60000;
          if (remainingTime > 0) {
            chrome.alarms.create(request.hostname, { delayInMinutes: remainingTime });
          }
        }
        sendResponse({success: true});
      });
    });
    return true;
  }
});