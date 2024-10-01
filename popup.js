document.addEventListener('DOMContentLoaded', () => {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      document.getElementById(button.dataset.tab).classList.add('active');
    });
  });

  // Populate hour and minute dropdowns
  const hourSelect = document.getElementById('hourSelect');
  const minuteSelect = document.getElementById('minuteSelect');

  for (let i = 0; i <= 23; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = i + ' hour' + (i !== 1 ? 's' : '');
    hourSelect.appendChild(option);
  }

  for (let i = 0; i <= 59; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = i + ' minute' + (i !== 1 ? 's' : '');
    minuteSelect.appendChild(option);
  }

  // Add site
  document.getElementById('addSite').addEventListener('click', () => {
    const hostname = document.getElementById('siteInput').value;
    const hours = parseInt(hourSelect.value);
    const minutes = parseInt(minuteSelect.value);
    const limit = hours * 60 + minutes;

    if (hostname && limit > 0) {
      chrome.runtime.sendMessage({
        action: "addSite",
        hostname: hostname,
        limit: limit
      }, (response) => {
        if (response.success) {
          alert(`Site ${hostname} added successfully!`);
          updateSiteLists();
        }
      });
    } else {
      alert('Please enter a valid website and time limit.');
    }
  });

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
        listItem.textContent = `${hostname} (Limit: ${siteData.limit} minutes)`;
        
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

// content.js (New file)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "promptTrack") {
    if (confirm(`Do you want to track time for ${request.hostname}?`)) {
      const saveOption = confirm("Do you want to save this site for future tracking?");
      const hours = prompt("Enter the number of hours (0-23):");
      const minutes = prompt("Enter the number of minutes (0-59):");
      const limit = parseInt(hours) * 60 + parseInt(minutes);
      
      if (limit > 0) {
        chrome.runtime.sendMessage({
          action: "addSite",
          hostname: request.hostname,
          limit: limit,
          save: saveOption
        });
      }
    }
  }
});