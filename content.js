// content.js

function createPromptDialog(hostname) {
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border: 1px solid #ccc;
    padding: 20px;
    z-index: 10000;
    box-shadow: 0 0 10px rgba(0,0,0,0.1);
  `;
  dialog.innerHTML = `
    <p>Do you want to track time for ${hostname}?</p>
    <button id="yesBtn">Yes</button>
    <button id="noBtn">No</button>
  `;
  document.body.appendChild(dialog);

  document.getElementById('yesBtn').addEventListener('click', () => {
    document.body.removeChild(dialog);
    showTimeLimitPrompt(hostname);
  });

  document.getElementById('noBtn').addEventListener('click', () => {
    document.body.removeChild(dialog);
    chrome.runtime.sendMessage({action: "ignoreSite", hostname: hostname});
  });
}

function showTimeLimitPrompt(hostname) {
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    border: 1px solid #ccc;
    padding: 20px;
    z-index: 10000;
    box-shadow: 0 0 10px rgba(0,0,0,0.1);
  `;
  dialog.innerHTML = `
    <p>Set time limit for ${hostname}:</p>
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

  document.getElementById('setLimit').addEventListener('click', () => {
    const hours = parseInt(hourSelect.value);
    const minutes = parseInt(minuteSelect.value);
    const limit = hours * 60 + minutes;

    chrome.runtime.sendMessage({
      action: "addSite",
      hostname: hostname,
      limit: limit
    }, (response) => {
      if (response.success) {
        alert(`Site ${hostname} added successfully!`);
      }
    });

    document.body.removeChild(dialog);
  });
}

function showTimeLimitReachedNotification(hostname) {
  chrome.storage.local.get('dismissedNotifications', (result) => {
    const dismissedNotifications = result.dismissedNotifications || {};
    const currentTime = Date.now();
    
    if (dismissedNotifications[hostname] && dismissedNotifications[hostname] > currentTime) {
      // Notification is still dismissed, don't show it
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'timeLimit-overlay';
    overlay.style.cssText = `
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
      <button id="dismissBtn" style="
        background: white;
        color: #ff4d4d;
        border: none;
        padding: 10px 20px;
        margin-top: 10px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 18px;
      ">Dismiss for 5 minutes</button>
    `;

    overlay.appendChild(notification);
    document.body.appendChild(overlay);

    document.getElementById('dismissBtn').addEventListener('click', () => {
      const overlayElement = document.getElementById('timeLimit-overlay');
      if (overlayElement) {
        document.body.removeChild(overlayElement);
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "promptTrack") {
    createPromptDialog(request.hostname);
  } else if (request.action === "showTimeLimitReached") {
    showTimeLimitReachedNotification(request.hostname);
  }
});

// Check for time limit reached on page load
chrome.storage.local.get(null, (data) => {
  const hostname = window.location.hostname;
  if (data[hostname] && data[hostname].limit) {
    const timeSpent = data[hostname].time || 0;
    const limitMs = data[hostname].limit * 60 * 1000;
    if (timeSpent >= limitMs) {
      showTimeLimitReachedNotification(hostname);
    }
  }
});