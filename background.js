let activeTabId = null;
let startTime = null;

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

  // Set the new active tab and start time
  activeTabId = tabId;
  startTime = new Date();

  // Check if there's a time limit for this tab
  chrome.tabs.get(tabId, (tab) => {
    const hostname = new URL(tab.url).hostname;
    chrome.storage.local.get(hostname, (data) => {
      if (data[hostname] && data[hostname].limit) {
        const timeLimit = data[hostname].limit * 60 * 1000; // Convert minutes to milliseconds
        chrome.alarms.create(hostname, { delayInMinutes: data[hostname].limit });
      }
    });
  });
}

// Save time spent on the active tab
function saveTimeForActiveTab() {
  const endTime = new Date();
  const timeSpent = endTime - startTime;

  chrome.tabs.get(activeTabId, (tab) => {
    const hostname = new URL(tab.url).hostname;
    chrome.storage.local.get(hostname, (data) => {
      const currentTime = data[hostname] ? data[hostname].time || 0 : 0;
      chrome.storage.local.set({
        [hostname]: {
          time: currentTime + timeSpent,
          limit: data[hostname] ? data[hostname].limit : null
        }
      });
    });
  });
}

// Listen for alarms (time limits reached)
chrome.alarms.onAlarm.addListener((alarm) => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0] && new URL(tabs[0].url).hostname === alarm.name) {
      alert(`Time limit reached for ${alarm.name}`);
    }
  });
});
