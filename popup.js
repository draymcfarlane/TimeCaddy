document.addEventListener('DOMContentLoaded', () => {
  // Display time spent on websites
  function updateTimeList() {
    chrome.storage.local.get(null, (data) => {
      const timeList = document.getElementById('timeList');
      timeList.innerHTML = ''; // Clear existing list
      for (const [hostname, siteData] of Object.entries(data)) {
        const listItem = document.createElement('li');
        const timeSpent = Math.round(siteData.time / 60000); // Convert milliseconds to minutes
        listItem.textContent = `${hostname}: ${timeSpent} minutes`;
        if (siteData.limit) {
          listItem.textContent += ` (Limit: ${siteData.limit} minutes)`;
        }
        
        // Add remove button for each site
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.className = 'remove-btn';
        removeBtn.onclick = () => removeSite(hostname);
        listItem.appendChild(removeBtn);
        
        timeList.appendChild(listItem);
      }
    });
  }

  // Remove a single site from tracking
  function removeSite(hostname) {
    chrome.storage.local.remove(hostname, () => {
      chrome.alarms.clear(hostname);
      updateTimeList();
    });
  }

  // Clear all tracked data
  document.getElementById('clearAll').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all tracked data?')) {
      chrome.storage.local.clear(() => {
        chrome.alarms.clearAll();
        updateTimeList();
      });
    }
  });

  // Initial population of the time list
  updateTimeList();
});