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
        } else if (data[hostname].limit && data[hostname].isTracking) {
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
    chrome.storage.local.get([hostname, 'reminders', 'categories'], (data) => {
      if (data[hostname] && data[hostname].isTracking) {
        const currentTime = data[hostname].time || 0;
        const newTime = currentTime + timeSpent;
        const siteLimit = data[hostname].limit * 60 * 1000; // Convert limit to milliseconds

        // Check category limit
        let categoryLimit = Infinity;
        if (data[hostname].category && data.categories && data.categories[data[hostname].category]) {
          categoryLimit = data.categories[data[hostname].category] * 60 * 1000;
        }

        const limit = Math.min(siteLimit, categoryLimit);

        chrome.storage.local.set({
          [hostname]: {
            ...data[hostname],
            time: newTime
          }
        }, () => {
          // Notify popup to update
          chrome.runtime.sendMessage({action: "updateTime", hostname: hostname, time: newTime});

// Check reminders
const reminders = data.reminders || [];
reminders.forEach(reminder => {
  const reminderThreshold = limit * (reminder.percentage / 100);
  if (newTime >= reminderThreshold && currentTime < reminderThreshold) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Time Management Reminder',
      message: reminder.text
    });
  }
});

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
limit: request.limit,
isTracking: true,
category: request.category || null
}
}, () => {
if (request.limit) {
chrome.alarms.create(request.hostname, { delayInMinutes: request.limit });
}
sendResponse({success: true});
});
return true; // Indicates we will send a response asynchronously
} else if (request.action === "ignoreSite") {
ignoredSites.add(request.hostname);
sendResponse({success: true});
} else if (request.action === "updateSiteLimit") {
chrome.storage.local.get(request.hostname, (data) => {
const siteData = data[request.hostname] || {};
siteData.limit = request.newLimit;
chrome.storage.local.set({
[request.hostname]: siteData
}, () => {
chrome.alarms.clear(request.hostname);
const remainingTime = (siteData.limit * 60 * 1000 - (siteData.time || 0)) / 60000;
if (remainingTime > 0) {
chrome.alarms.create(request.hostname, { delayInMinutes: remainingTime });
}
sendResponse({success: true});
});
});
return true;
} else if (request.action === "stopTracking") {
chrome.storage.local.get(request.hostname, (data) => {
const siteData = data[request.hostname] || {};
siteData.isTracking = false;
chrome.storage.local.set({
[request.hostname]: siteData
}, () => {
chrome.alarms.clear(request.hostname);
sendResponse({success: true});
});
});
return true;
} else if (request.action === "updateSiteCategory") {
chrome.storage.local.get(request.hostname, (data) => {
const siteData = data[request.hostname] || {};
siteData.category = request.category;
chrome.storage.local.set({
[request.hostname]: siteData
}, () => {
sendResponse({success: true});
});
});
return true;
}
});