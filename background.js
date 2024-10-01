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
  // If there was an active tab, save its time
  if (activeTabId) {
    saveTimeForActiveTab();
  }

  // Clear existing interval
  if (intervalId) {
    clearInterval(intervalId);
  }

  // Set the new active tab and start time
  activeTabId = tabId;
  startTime = new Date();

  // Check if this tab should be tracked
  chrome.tabs.get(tabId, (tab) => {
    const hostname = new URL(tab.url).hostname;
    if (!ignoredSites.has(hostname)) {
      chrome.storage.local.get(hostname, (data) => {
        if (!data[hostname]) {
          // Ask user if they want to track this site
          chrome.tabs.sendMessage(tabId, {action: "promptTrack", hostname: hostname});
        } else if (data[hostname].limit) {
          // Check if time spent is already over the limit
          const timeSpent = data[hostname].time || 0;
          const limitMs = data[hostname].limit * 60 * 1000; // Convert limit to milliseconds
          if (timeSpent < limitMs) {
            const remainingTime = (limitMs - timeSpent) / 60000; // Convert to minutes
            chrome.alarms.create(hostname, { delayInMinutes: remainingTime });
          } else {
            // Time limit already exceeded
            chrome.tabs.sendMessage(tabId, {action: "showTimeLimitReached", hostname: hostname});
          }
        }
      });
    }
  });

  // Start interval for live updates
  intervalId = setInterval(saveTimeForActiveTab, 1000); // Update every second
}

function saveTimeForActiveTab() {
  const endTime = new Date();
  const timeSpent = endTime - startTime;

  chrome.tabs.get(activeTabId, (tab) => {
    const hostname = new URL(tab.url).hostname;
    chrome.storage.local.get(hostname, (data) => {
      if (data[hostname]) {
        const currentTime = data[hostname].time || 0;
        const newTime = currentTime + timeSpent;
        const limit = data[hostname].limit * 60 * 1000; // Convert limit to milliseconds

        chrome.storage.local.set({
          [hostname]: {
            time: newTime,
            limit: data[hostname].limit
          }
        }, () => {
          // Notify popup to update
          chrome.runtime.sendMessage({action: "updateTime", hostname: hostname, time: newTime});

          // Check if time limit has been reached
          if (newTime >= limit && currentTime < limit) {
            chrome.tabs.sendMessage(activeTabId, {action: "showTimeLimitReached", hostname: hostname});
            chrome.alarms.clear(hostname);
          }
        });
      }
    });
  });

  // Reset start time for next interval
  startTime = new Date();
}

// Listen for alarms (time limits reached)
chrome.alarms.onAlarm.addListener((alarm) => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0] && new URL(tabs[0].url).hostname === alarm.name) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "showTimeLimitReached", hostname: alarm.name});
    }
  });
});

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "addSite") {
    chrome.storage.local.set({
      [request.hostname]: {
        time: 0,
        limit: request.limit
      }
    }, () => {
      const limitMs = request.limit * 60 * 1000; // Convert limit to milliseconds
      chrome.alarms.create(request.hostname, { delayInMinutes: request.limit });
      sendResponse({success: true});
    });
    return true; // Indicates we will send a response asynchronously
  } else if (request.action === "ignoreSite") {
    ignoredSites.add(request.hostname);
    sendResponse({success: true});
  }
});