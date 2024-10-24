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
      showTimeSettingsPrompt(hostname, category, suggestedLimit);
    });

    document.getElementById('noBtn').addEventListener('click', () => {
      document.body.removeChild(dialog);
      chrome.runtime.sendMessage({action: "ignoreSite", hostname: hostname});
    });
  });
}

function showTimeSettingsPrompt(hostname, category, suggestedLimit) {
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
    <h3>Time Settings for ${hostname}</h3>
    <label>
      <input type="radio" name="timeType" value="limit" checked>
      Set Time Limit
    </label>
    <label>
      <input type="radio" name="timeType" value="schedule">
      Set Schedule
    </label>
    <div id="limitSettings">
      <input type="number" id="timeLimit" value="${suggestedLimit}" placeholder="Time limit in minutes">
    </div>
    <div id="scheduleSettings" style="display:none;">
      <input type="time" id="startTime">
      <input type="time" id="stopTime">
    </div>
    <div>
      <input type="text" id="reminderText" placeholder="Reminder text">
      <input type="number" id="reminderPercentage" placeholder="Reminder percentage">
    </div>
    <button id="saveSettings">Save</button>
  `;
  document.body.appendChild(dialog);

  const limitSettings = document.getElementById('limitSettings');
  const scheduleSettings = document.getElementById('scheduleSettings');
  document.querySelectorAll('input[name="timeType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'limit') {
        limitSettings.style.display = 'block';
        scheduleSettings.style.display = 'none';
      } else {
        limitSettings.style.display = 'none';
        scheduleSettings.style.display = 'block';
      }
    });
  });

  document.getElementById('saveSettings').addEventListener('click', () => {
    const timeType = document.querySelector('input[name="timeType"]:checked').value;
    let settings = { category };
    if (timeType === 'limit') {
      settings.limit = parseInt(document.getElementById('timeLimit').value);
    } else {
      settings.schedule = {
        startTime: document.getElementById('startTime').value,
        stopTime: document.getElementById('stopTime').value
      };
    }
    const reminderText = document.getElementById('reminderText').value;
    const reminderPercentage = parseInt(document.getElementById('reminderPercentage').value);
    if (reminderText && reminderPercentage) {
      settings.reminder = { text: reminderText, percentage: reminderPercentage };
    }
    chrome.runtime.sendMessage({
      action: "addSite",
      hostname: hostname,
      ...settings
    }, (response) => {
      if (response.success) {
        alert(`Site ${hostname} added successfully!`);
      }
    });
    document.body.removeChild(dialog);
  });
}

function showTimeLimitReachedNotification(hostname, data = {}) {
  chrome.storage.local.get(hostname, (siteData) => {
    if (overlayElement) {
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

    const initialLimit = siteData[hostname].initialLimit;
    const totalExtendedTime = siteData[hostname].totalExtendedTime || 0;
    const totalTime = initialLimit + totalExtendedTime;

    notification.innerHTML = `
      <p>Time limit reached for ${hostname}!</p>
      <p>Original limit: ${initialLimit} minutes</p>
      ${totalExtendedTime > 0 ? `<p>Extended time: ${totalExtendedTime} minutes</p>` : ''}
      <p>Total time: ${totalTime} minutes</p>
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
        chrome.runtime.sendMessage({
          action: "extendTime",
          hostname: hostname,
          additionalTime: parseInt(additionalTime)
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
      chrome.runtime.sendMessage({
        action: "dismissNotification",
        hostname: hostname,
        dismissDuration: 5 * 60 * 1000 // 5 minutes in milliseconds
      }, () => {
        if (overlayElement) {
          document.body.removeChild(overlayElement);
          overlayElement = null;
        }
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

function showScheduledTrackingPrompt(action, hostname) {
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
    <p>${action === 'start' ? 'Start' : 'Stop'} scheduled tracking for ${hostname}?</p>
    <button id="yesBtn">Yes</button>
    <button id="noBtn">No</button>
  `;

  document.body.appendChild(dialog);

  document.getElementById('yesBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: action === 'start' ? 'startTracking' : 'stopTracking',
      hostname: hostname
    });
    document.body.removeChild(dialog);
  });

  document.getElementById('noBtn').addEventListener('click', () => {
    document.body.removeChild(dialog);
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "promptTrack") {
    createPromptDialog(request.hostname);
  } else if (request.action === "showTimeLimitReached") {
    showTimeLimitReachedNotification(request.hostname, request);
  } else if (request.action === "showCustomReminder") {
    showCustomReminder(request.message);
  } else if (request.action === "startScheduledTracking") {
    showScheduledTrackingPrompt('start', request.hostname);
  } else if (request.action === "stopScheduledTracking") {
    showScheduledTrackingPrompt('stop', request.hostname);
  }
});

// Ensure overlay is removed when navigating away from the page
window.addEventListener('beforeunload', () => {
  if (overlayElement) {
    document.body.removeChild(overlayElement);
    overlayElement = null;
  }
});