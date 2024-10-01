let activeTabId = null;
let startTime = null;
let intervalId = null;

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
    chrome.storage.local.get(hostname, (data) => {
      if (!data[hostname]) {
        // Ask user if they want to track this site
        chrome.tabs.sendMessage(tabId, {action: "promptTrack", hostname: hostname});
      } else if (data[hostname].limit) {
        chrome.alarms.create(hostname, { delayInMinutes: data[hostname].limit });
      }
    });
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
        chrome.storage.local.set({
          [hostname]: {
            time: currentTime + timeSpent,
            limit: data[hostname].limit
          }
        }, () => {
          // Notify popup to update
          chrome.runtime.sendMessage({action: "updateTime", hostname: hostname, time: currentTime + timeSpent});
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
      alert(`Time limit reached for ${alarm.name}`);
    }
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "addSite") {
    chrome.storage.local.set({
      [request.hostname]: {
        time: 0,
        limit: request.limit
      }
    }, () => {
      if (request.limit) {
        chrome.alarms.create(request.hostname, { delayInMinutes: request.limit });
      }
      sendResponse({success: true});
    });
    return true; // Indicates we will send a response asynchronously
  }
});