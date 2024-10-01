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

  // Check if this tab should be tracked
  chrome.tabs.get(tabId, (tab) => {
    const hostname = new URL(tab.url).hostname;
    chrome.storage.local.get(hostname, (data) => {
      if (!data[hostname]) {
        // Ask user if they want to track this site
        if (confirm(`Do you want to track time for ${hostname}?`)) {
          const timeLimit = promptForTimeLimit();
          if (timeLimit) {
            chrome.storage.local.set({
              [hostname]: {
                time: 0,
                limit: timeLimit
              }
            });
            chrome.alarms.create(hostname, { delayInMinutes: timeLimit });
          }
        }
      } else if (data[hostname].limit) {
        chrome.alarms.create(hostname, { delayInMinutes: data[hostname].limit });
      }
    });
  });
}

function promptForTimeLimit() {
  const input = prompt("Enter time limit (format: 1h30m or 90m):");
  if (input) {
    const hours = input.match(/(\d+)h/);
    const minutes = input.match(/(\d+)m/);
    let totalMinutes = 0;
    if (hours) totalMinutes += parseInt(hours[1]) * 60;
    if (minutes) totalMinutes += parseInt(minutes[1]);
    return totalMinutes > 0 ? totalMinutes : null;
  }
  return null;
}

// Save time spent on the active tab
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
        });
      }
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