document.addEventListener('DOMContentLoaded', () => {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      document.getElementById(button.dataset.tab).classList.add('active');
    });
  });

  // Display time spent on websites
  function updateTimeList() {
    chrome.storage.local.get(null, (data) => {
      const timeList = document.getElementById('timeList');
      timeList.innerHTML = ''; // Clear existing list
      for (const [hostname, siteData] of Object.entries(data)) {
        const listItem = document.createElement('li');
        const timeSpent = siteData.time / 1000; // Convert milliseconds to seconds
        const hours = Math.floor(timeSpent / 3600);
        const minutes = Math.floor((timeSpent % 3600) / 60);
        const seconds = Math.floor(timeSpent % 60);
        const websiteName = hostname.replace(/^www\./, '').split('.')[0]; // Extract website name
        listItem.textContent = `${websiteName}: ${hours}h ${minutes}m ${seconds}s`;
        if (siteData.limit) {
          listItem.textContent += ` (Limit: ${siteData.limit} minutes)`;
        }
        timeList.appendChild(listItem);
      }
    });
  }

  // Display managed sites
  function updateSiteList() {
    chrome.storage.local.get(null, (data) => {
      const siteList = document.getElementById('siteList');
      siteList.innerHTML = ''; // Clear existing list
      for (const [hostname, siteData] of Object.entries(data)) {
        const listItem = document.createElement('li');
        const websiteName = hostname.replace(/^www\./, '').split('.')[0]; // Extract website name
        listItem.textContent = `${websiteName} (Limit: ${siteData.limit} minutes)`;
        
        // Add remove button for each site
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.className = 'remove-btn';
        removeBtn.onclick = () => removeSite(hostname);
        listItem.appendChild(removeBtn);
        
        siteList.appendChild(listItem);
      }
    });
  }

  // Remove a single site from tracking
  function removeSite(hostname) {
    chrome.storage.local.remove(hostname, () => {
      chrome.alarms.clear(hostname);
      updateSiteLists();
    });
  }

  // Clear all tracked data
  document.getElementById('clearAll').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all tracked data?')) {
      chrome.storage.local.clear(() => {
        chrome.alarms.clearAll();
        updateSiteLists();
      });
    }
  });

  // Update both site lists
  function updateSiteLists() {
    updateTimeList();
    updateSiteList();
  }

  // Initial population of the lists
  updateSiteLists();

  // Listen for live updates
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateTime") {
      updateTimeList();
    }
  });
});