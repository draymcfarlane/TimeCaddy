let overlayElement = null;

function createPromptDialog(hostname) {
  chrome.storage.sync.get('categories', (data) => {
    const categories = data.categories || [];
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: white;
      border: 1px solid #ccc;
      padding: 20px;
      z-index: 2147483647;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    `;
    dialog.innerHTML = `
      <p>Do you want to track time for ${hostname}?</p>
      <select id="categorySelect">
        <option value="">Select a category</option>
        ${categories.map(cat => `<option value="${cat.name}" data-limit="${cat.suggestedLimit}">${cat.name} (Suggested: ${cat.suggestedLimit} min)</option>`).join('')}
        <option value="new">Create new category</option>
      </select>
      <button id="yesBtn">Yes</button>
      <button id="noBtn">No</button>
    `;
    document.body.appendChild(dialog);

    document.getElementById('yesBtn').addEventListener('click', () => {
      const categorySelect = document.getElementById('categorySelect');
      let category = categorySelect.value;
      let suggestedLimit = categorySelect.selectedOptions[0].dataset.limit;
      if (category === 'new') {
        category = prompt("Enter new category name:");
        suggestedLimit = prompt("Enter suggested time limit (in minutes):");
        if (category && suggestedLimit) {
          categories.push({ name: category, suggestedLimit: parseInt(suggestedLimit) });
          chrome.storage.sync.set({ categories });
        }
      }
      document.body.removeChild(dialog);
      showTimeLimitPrompt(hostname, category, suggestedLimit);
    });

    document.getElementById('noBtn').addEventListener('click', () => {
      document.body.removeChild(dialog);
      chrome.runtime.sendMessage({action: "ignoreSite", hostname: hostname});
    });
  });
}

function showTimeLimitPrompt(hostname, category, suggestedLimit) {
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border: 1px solid #ccc;
    padding: 20px;
    z-index: 2147483647;
    box-shadow: 0 0 10px rgba(0,0,0,0.1);
  `;
  dialog.innerHTML = `
    <p>Set time limit for ${hostname}:</p>
    <p>Suggested limit: ${suggestedLimit} minutes</p>
    <select id="hourSelect"></select>
    <select id="minuteSelect"></select>
    <button id="setLimit">Set Limit</button>
  `;
  document.body.appendChild(dialog);

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

  // Set default values based on suggested limit
  hourSelect.value = Math.floor(suggestedLimit / 60);
  minuteSelect.value = suggestedLimit % 60;

  document.getElementById('setLimit').addEventListener('click', () => {
    const hours = parseInt(hourSelect.value);
    const minutes = parseInt(minuteSelect.value);
    const limit = hours * 60 + minutes;

    chrome.runtime.sendMessage({
      action: "addSite",
      hostname: hostname,
      limit: limit,
      category: category
    }, (response) => {
      if (response.success) {
        alert(`Site ${hostname} added successfully!`);
      }
    });

    document.body.removeChild(dialog);
  });
}

function showTimeLimitReachedNotification(hostname) {
  chrome.storage.local.get(['dismissedNotifications', hostname], (result) => {
    const dismissedNotifications = result.dismissedNotifications || {};
    const currentTime = Date.now();
    const siteData = result[hostname] || {};
    
    if (dismissedNotifications[hostname] && dismissedNotifications[hostname] > currentTime) {
      // Notification is still dismissed, don't show it
      return;
    }

    if (overlayElement) {
      // If an overlay already exists, remove it
      document.body.removeChild(overlayElement);
    }

    overlayElement = document.createElement('div');
    overlayElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 2147483647;
    `;

    const notification = document.createElement('div');
    notification.style.cssText = `
      background: #ff4d4d;
      color: white;
      padding: 20px;
      border-radius: 5px;
      font-size: 24px;
      text-align: center;
    `;

    notification.innerHTML = `
      <p>Time limit reached for ${hostname}!</p>
      <button id="extendBtn" style="
        background: white;
        color: #ff4d4d;
        border: none;
        padding: 10px 20px;
        margin: 10px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 18px;
      ">Extend Time</button>
      <button id="stopBtn" style="
        background: white;
        color: #ff4d4d;
        border: none;
        padding: 10px 20px;
        margin: 10px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 18px;
      ">Stop Tracking</button>
      <button id="dismissBtn" style="
        background: white;
        color: #ff4d4d;
        border: none;
        padding: 10px 20px;
        margin: 10px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 18px;
      ">Dismiss for 5 minutes</button>
    `;

    overlayElement.appendChild(notification);
    document.body.appendChild(overlayElement);

    document.getElementById('extendBtn').addEventListener('click', () => {
      const additionalTime = prompt("Enter additional time in minutes:", "30");
      if (additionalTime !== null) {
        const newLimit = siteData.limit + parseInt(additionalTime);
        chrome.runtime.sendMessage({
          action: "updateSiteLimit",
          hostname: hostname,
          newLimit: newLimit
        }, () => {
          if (overlayElement) {
            document.body.removeChild(overlayElement);
            overlayElement = null;
          }
        });
      }
    });

    document.getElementById('stopBtn').addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: "stopTracking",
        hostname: hostname
      }, () => {
        if (overlayElement) {
          document.body.removeChild(overlayElement);
          overlayElement = null;
        }
      });
    });

    document.getElementById('dismissBtn').addEventListener('click', () => {
      if (overlayElement) {
        document.body.removeChild(overlayElement);
        overlayElement = null;
      }
      
      // Set dismissal time for 5 minutes from now
      dismissedNotifications[hostname] = currentTime + 5 * 60 * 1000;
      chrome.storage.local.set({ dismissedNotifications: dismissedNotifications }, () => {
        // Schedule the notification to reappear after 5 minutes
        setTimeout(() => {
          showTimeLimitReachedNotification(hostname);
        }, 5 * 60 * 1000);
      });
    });
  });
}

function showCustomReminder(message) {
  const reminderElement = document.createElement('div');
  reminderElement.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #4CAF50;
    color: white;
    padding: 10px;
    text-align: center;
    z-index: 2147483647;
  `;
  reminderElement.textContent = message;
  document.body.appendChild(reminderElement);

  setTimeout(() => {
    document.body.removeChild(reminderElement);
  }, 5000);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "promptTrack") {
    createPromptDialog(request.hostname);
  } else if (request.action === "showTimeLimitReached") {
    showTimeLimitReachedNotification(request.hostname);
  } else if (request.action === "showCustomReminder") {
    showCustomReminder(request.message);
  }
});

// Check for time limit reached on page load
chrome.storage.local.get(null, (data) => {
  const hostname = window.location.hostname;
  if (data[hostname] && data[hostname].limit && data[hostname].isTracking) {
    const timeSpent = data[hostname].time || 0;
    const limitMs = data[hostname].limit * 60 * 1000;
    if (timeSpent >= limitMs) {
      showTimeLimitReachedNotification(hostname);
    }
  }
});

// Ensure overlay is removed when navigating away from the page
window.addEventListener('beforeunload', () => {
  if (overlayElement) {
    document.body.removeChild(overlayElement);
    overlayElement = null;
  }
});