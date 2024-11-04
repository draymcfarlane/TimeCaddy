document.addEventListener('DOMContentLoaded', () => {
  let isEditMode = false;

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all buttons and contents
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked button and corresponding content
      button.classList.add('active');
      document.getElementById(button.dataset.tab).classList.add('active');
    });
  });

  // Set initial active tab if none is active
  if (!document.querySelector('.tab-btn.active')) {
    document.querySelector('.tab-btn').classList.add('active');
    document.querySelector('.tab-content').classList.add('active');
  }

  // Display time spent on websites
  function updateTimeList() {
    chrome.storage.local.get(null, (data) => {
      const timeList = document.getElementById('timeList');
      timeList.innerHTML = '';
      for (const [hostname, siteData] of Object.entries(data)) {
        if (siteData.isTracking) {
          const listItem = document.createElement('li');
          const timeSpent = siteData.time / 1000;
          const hours = Math.floor(timeSpent / 3600);
          const minutes = Math.floor((timeSpent % 3600) / 60);
          const seconds = Math.floor(timeSpent % 60);
          const websiteName = hostname.replace(/^www\./, '').split('.')[0];
          
          let displayText = `${websiteName}: ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
          displayText += ` (Original limit: ${siteData.initialLimit} minutes`;
          
          if (siteData.totalExtendedTime > 0) {
            displayText += `, Extended by: ${siteData.totalExtendedTime} minutes`;
          }
          displayText += ')';
          
          if (siteData.category) {
            displayText += ` [${siteData.category}]`;
          }
          
          listItem.textContent = displayText;

          // Add stop tracking button
          const stopButton = document.createElement('button');
          stopButton.textContent = 'Stop Tracking';
          stopButton.onclick = () => stopTracking(hostname);
          listItem.appendChild(stopButton);
          
          timeList.appendChild(listItem);
        }
      }
    });
  }

  // Display managed sites
  function updateSiteList() {
    chrome.storage.sync.get('categories', (categoryData) => {
      const categories = categoryData.categories || [];
      chrome.storage.local.get(null, (data) => {
        const siteList = document.getElementById('siteList');
        siteList.innerHTML = '';
        
        const sites = Object.entries(data).filter(([hostname, siteData]) => 
          typeof siteData === 'object' && siteData.hasOwnProperty('isTracking')
        );
        
        if (sites.length === 0) {
          siteList.innerHTML = '<div>No sites are currently being tracked.</div>';
        } else {
          sites.forEach(([hostname, siteData]) => {
            const listItem = createSiteListItem(hostname, siteData, categories);
            siteList.appendChild(listItem);
          });
        }
      });
    });
  }

  function createSiteListItem(hostname, siteData, categories) {
    const listItem = document.createElement('div');
    listItem.className = 'site-list-item';
    
    if (isEditMode) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'site-checkbox';
      checkbox.dataset.hostname = hostname;
      listItem.appendChild(checkbox);
    }
    
    const websiteName = hostname.replace(/^www\./, '').split('.')[0];
    let displayText = `${websiteName} (Original limit: ${siteData.initialLimit} minutes`;
    
    if (siteData.totalExtendedTime > 0) {
      displayText += `, Extended by: ${siteData.totalExtendedTime} minutes`;
    }
    displayText += `) - ${siteData.isTracking ? 'Tracking' : 'Not Tracking'}`;

    if (siteData.reminder) {
      displayText += ` - Reminder: "${siteData.reminder.text}" at ${siteData.reminder.percentage}%`;
    }
    
    const textDiv = document.createElement('div');
    textDiv.textContent = displayText;
    listItem.appendChild(textDiv);
    
    const categorySelect = document.createElement('select');
    categorySelect.innerHTML = '<option value="">No Category</option>';
    categories.forEach(category => {
      categorySelect.innerHTML += `<option value="${category.name}" ${siteData.category === category.name ? 'selected' : ''}>${category.name}</option>`;
    });
    categorySelect.onchange = (e) => updateSiteCategory(hostname, e.target.value);
    listItem.appendChild(categorySelect);
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'site-actions';

    const rerunButton = document.createElement('button');
    rerunButton.textContent = 'Rerun';
    rerunButton.onclick = () => rerunTracking(hostname);
    actionsDiv.appendChild(rerunButton);

    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.onclick = () => editSiteSettings(hostname, siteData);
    actionsDiv.appendChild(editButton);

    listItem.appendChild(actionsDiv);
    return listItem;
  }

  // Create overlay for modal dialogs
  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
    `;
    return overlay;
  }

  function editSiteSettings(hostname, siteData) {
    const overlay = createOverlay();
    document.body.appendChild(overlay);

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      z-index: 1001;
      width: 280px;
    `;
    dialog.innerHTML = `
      <h3 style="margin-top: 0;">Edit Settings for ${hostname}</h3>
      <div>
        <label>Original Time Limit (minutes):
          <input type="number" id="originalLimit" value="${siteData.initialLimit}" min="1">
        </label>
      </div>
      <div>
        <label>Extended Time (minutes):
          <input type="number" id="extendedTime" value="${siteData.totalExtendedTime || 0}" min="0">
        </label>
      </div>
      <div>
        <label>Reminder Text:
          <input type="text" id="reminderText" value="${siteData.reminder ? siteData.reminder.text : ''}" placeholder="Enter reminder message">
        </label>
      </div>
      <div>
        <label>Reminder Percentage:
          <input type="number" id="reminderPercentage" value="${siteData.reminder ? siteData.reminder.percentage : ''}" min="0" max="100" placeholder="Enter percentage (0-100)">
        </label>
      </div>
      <div style="margin-top: 15px; text-align: right;">
        <button id="saveSettings" style="margin-right: 10px; background: #4CAF50;">Save</button>
        <button id="cancelEdit" style="background: #9e9e9e;">Cancel</button>
      </div>
    `;
    document.body.appendChild(dialog);

    function closeDialog() {
      document.body.removeChild(dialog);
      document.body.removeChild(overlay);
    }

    document.getElementById('saveSettings').addEventListener('click', () => {
      const newOriginalLimit = parseInt(document.getElementById('originalLimit').value);
      const newExtendedTime = parseInt(document.getElementById('extendedTime').value);
      const reminderText = document.getElementById('reminderText').value.trim();
      const reminderPercentage = parseInt(document.getElementById('reminderPercentage').value);
      
      const updatedData = {
        ...siteData,
        initialLimit: newOriginalLimit,
        totalExtendedTime: newExtendedTime
      };

      if (reminderText && !isNaN(reminderPercentage) && reminderPercentage >= 0 && reminderPercentage <= 100) {
        updatedData.reminder = {
          text: reminderText,
          percentage: reminderPercentage
        };
      } else if (!reminderText && !reminderPercentage) {
        delete updatedData.reminder;
      } else {
        alert('Please enter both reminder text and a valid percentage (0-100), or leave both empty');
        return;
      }

      if (siteData.isTracking) {
        closeDialog();
        
        const confirmOverlay = createOverlay();
        document.body.appendChild(confirmOverlay);
        
        const confirmDialog = document.createElement('div');
        confirmDialog.style.cssText = `
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          z-index: 1001;
          width: 280px;
          text-align: center;
        `;
        
        confirmDialog.innerHTML = `
          <h3 style="margin-top: 0;">Time Management Extension</h3>
          <p style="margin: 15px 0;">Changes require restarting tracking.</p>
          <button id="restartNow" style="
            width: 100%;
            padding: 10px;
            margin: 5px 0;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          ">Save changes and restart tracking now</button>
          <button id="saveOnly" style="
            width: 100%;
            padding: 10px;
            margin: 5px 0;
            background: #2196F3;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          ">Save changes without restarting</button>
          <button id="cancelChanges" style="
            width: 100%;
            padding: 10px;
            margin: 5px 0;
            background: #9e9e9e;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          ">Cancel</button>
        `;

        document.body.appendChild(confirmDialog);

        function closeConfirmDialog() {
          document.body.removeChild(confirmDialog);
          document.body.removeChild(confirmOverlay);
        }

        document.getElementById('restartNow').addEventListener('click', () => {
          chrome.runtime.sendMessage({
            action: "updateSiteSettings",
            hostname: hostname,
            settings: {
              ...updatedData,
              isTracking: false,
              time: 0
            },
            preserveTracking: false
          }, () => {
            closeConfirmDialog();
            chrome.runtime.sendMessage({
              action: "rerunTracking",
              hostname: hostname,
              preserveSettings: true
            });
          });
        });

        document.getElementById('saveOnly').addEventListener('click', () => {
          chrome.runtime.sendMessage({
            action: "updateSiteSettings",
            hostname: hostname,
            settings: updatedData,
            preserveTracking: true
          }, () => {
            closeConfirmDialog();
            updateSiteList();
            updateTimeList();
          });
        });

        document.getElementById('cancelChanges').addEventListener('click', closeConfirmDialog);
      } else {
        chrome.runtime.sendMessage({
          action: "updateSiteSettings",
          hostname: hostname,
          settings: updatedData,
          preserveTracking: true
        }, () => {
          closeDialog();
          updateSiteList();
          updateTimeList();
        });
      }
    });

    document.getElementById('cancelEdit').addEventListener('click', closeDialog);
  }

  function stopTracking(hostname) {
    const overlay = createOverlay();
    document.body.appendChild(overlay);

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      z-index: 1001;
      width: 280px;
      text-align: center;
    `;
    
    dialog.innerHTML = `
      <h3 style="margin-top: 0;">Time Management Extension</h3>
      <p style="margin: 15px 0;">Are you sure you want to stop tracking this site?</p>
      <button id="confirmStop" style="
        width: 100%;
        padding: 10px;
        margin: 5px 0;
        background: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      ">Stop Tracking</button>
      <button id="cancelStop" style="
        width: 100%;
        padding: 10px;
        margin: 5px 0;
        background: #9e9e9e;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      ">Cancel</button>
    `;

    document.body.appendChild(dialog);

    function closeDialog() {
      document.body.removeChild(dialog);
      document.body.removeChild(overlay);
    }

    document.getElementById('confirmStop').addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: "stopTracking",
        hostname: hostname
      }, () => {
        closeDialog();
        updateTimeList();
        updateSiteList();
      });
    });

    document.getElementById('cancelStop').addEventListener('click', closeDialog);
  }

  function rerunTracking(hostname) {
    const overlay = createOverlay();
    document.body.appendChild(overlay);

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      z-index: 1001;
      width: 280px;
      text-align: center;
    `;
    
    dialog.innerHTML = `
      <h3 style="margin-top: 0;">Time Management Extension</h3>
      <p style="margin: 15px 0;">Choose an option:</p>
      <button id="keepSettings" style="
        width: 100%;
        padding: 10px;
        margin: 5px 0;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      ">Reset tracking and keep current time settings</button>
      <button id="removeSettings" style="
        width: 100%;
        padding: 10px;
        margin: 5px 0;
        background: #f44336;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      ">Reset tracking and remove time extensions</button>
      <button id="cancelRerun" style="
        width: 100%;
        padding: 10px;
        margin: 5px 0;
        background: #9e9e9e;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      ">Cancel</button>
    `;

    document.body.appendChild(dialog);

    function closeDialog() {
      document.body.removeChild(dialog);
      document.body.removeChild(overlay);
    }

    document.getElementById('keepSettings').addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: "rerunTracking",
        hostname: hostname,
        preserveSettings: true
      }, () => {
        closeDialog();
        updateTimeList();
        updateSiteList();
      });
    });

    document.getElementById('removeSettings').addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: "rerunTracking",
        hostname: hostname,
        preserveSettings: false
      }, () => {
        closeDialog();
        updateTimeList();
        updateSiteList();
      });
    });

    document.getElementById('cancelRerun').addEventListener('click', closeDialog);
  }

  function updateSiteCategory(hostname, category) {
    chrome.storage.local.get(hostname, (data) => {
      const siteData = data[hostname];
      siteData.category = category || null;
      chrome.storage.local.set({ [hostname]: siteData }, updateSiteList);
    });
  }

  // Edit mode toggle
  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit';
  editBtn.id = 'editBtn';
  editBtn.addEventListener('click', toggleEditMode);
  document.getElementById('manage').insertBefore(editBtn, document.getElementById('siteList'));

  function toggleEditMode() {
    isEditMode = !isEditMode;
    editBtn.textContent = isEditMode ? 'Close' : 'Edit';
    updateSiteList();
    toggleEditModeElements();
  }

  function toggleEditModeElements() {
    const checkAllBtn = document.getElementById('checkAllBtn');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    
    if (isEditMode) {
      if (!checkAllBtn) {
        const newCheckAllBtn = document.createElement('button');
        newCheckAllBtn.textContent = 'Check All';
        newCheckAllBtn.id = 'checkAllBtn';
        newCheckAllBtn.addEventListener('click', toggleCheckAll);
        document.getElementById('manage').appendChild(newCheckAllBtn);
      }
      
      if (!deleteSelectedBtn) {
        const newDeleteSelectedBtn = document.createElement('button');
        newDeleteSelectedBtn.textContent = 'Delete Selected';
        newDeleteSelectedBtn.id = 'deleteSelectedBtn';
        newDeleteSelectedBtn.addEventListener('click', deleteSelected);
        document.getElementById('manage').appendChild(newDeleteSelectedBtn);
      }
    } else {
      if (checkAllBtn) checkAllBtn.remove();
      if (deleteSelectedBtn) deleteSelectedBtn.remove();
    }
  }

  function toggleCheckAll() {
    const checkboxes = document.querySelectorAll('.site-checkbox');
    const checkAllBtn = document.getElementById('checkAllBtn');
    const areAllChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(cb => cb.checked = !areAllChecked);
    checkAllBtn.textContent = areAllChecked ? 'Check All' : 'Uncheck All';
  }

  function deleteSelected() {
    const selectedCheckboxes = document.querySelectorAll('.site-checkbox:checked');
    const hostnamesToDelete = Array.from(selectedCheckboxes).map(cb => cb.dataset.hostname);
    
    if (hostnamesToDelete.length > 0) {
      const overlay = createOverlay();
      document.body.appendChild(overlay);

      const dialog = document.createElement('div');
      dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 1001;
        width: 280px;
        text-align: center;
      `;
      
      dialog.innerHTML = `
        <h3 style="margin-top: 0;">Time Management Extension</h3>
        <p style="margin: 15px 0;">Are you sure you want to delete ${hostnamesToDelete.length} selected sites?</p>
        <button id="confirmDelete" style="
          width: 100%;
          padding: 10px;
          margin: 5px 0;
          background: #f44336;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        ">Delete Selected Sites</button>
        <button id="cancelDelete" style="
          width: 100%;
          padding: 10px;
          margin: 5px 0;
          background: #9e9e9e;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        ">Cancel</button>
      `;

      document.body.appendChild(dialog);

      function closeDialog() {
        document.body.removeChild(dialog);
        document.body.removeChild(overlay);
      }

      document.getElementById('confirmDelete').addEventListener('click', () => {
        chrome.storage.local.remove(hostnamesToDelete, () => {
          hostnamesToDelete.forEach(hostname => chrome.alarms.clear(hostname));
          closeDialog();
          updateSiteList();
          updateTimeList();
        });
      });

      document.getElementById('cancelDelete').addEventListener('click', closeDialog);
    }
  }

  // Initial population of lists
  updateTimeList();
  updateSiteList();

  // Listen for live updates
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateTime") {
      updateTimeList();
    } else if (request.action === "siteSettingsUpdated") {
      updateTimeList();
      updateSiteList();
    }
  });

  // Add window resize handler for dialog positioning
  window.addEventListener('resize', () => {
    const dialog = document.querySelector('.edit-dialog');
    if (dialog) {
      const rect = dialog.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      if (rect.right > viewportWidth) {
        dialog.style.left = (viewportWidth - rect.width - 20) + 'px';
      }
      if (rect.bottom > viewportHeight) {
        dialog.style.top = (viewportHeight - rect.height - 20) + 'px';
      }
    }
  });

  // Add keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Escape key closes dialogs
    if (e.key === 'Escape') {
      const dialog = document.querySelector('.edit-dialog');
      if (dialog) {
        document.body.removeChild(dialog);
      }
      if (isEditMode) {
        toggleEditMode();
      }
    }
    
    // Enter key in edit mode confirms changes
    if (e.key === 'Enter' && !e.shiftKey) {
      const saveButton = document.querySelector('#saveSettings');
      if (saveButton) {
        saveButton.click();
      }
    }
  });
});
