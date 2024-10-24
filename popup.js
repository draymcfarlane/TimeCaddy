document.addEventListener('DOMContentLoaded', () => {
  let isEditMode = false;

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
    
    // Add checkbox for edit mode
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
    
    const textDiv = document.createElement('div');
    textDiv.textContent = displayText;
    listItem.appendChild(textDiv);
    
    // Add category selector
    const categorySelect = document.createElement('select');
    categorySelect.innerHTML = '<option value="">No Category</option>';
    categories.forEach(category => {
      categorySelect.innerHTML += `<option value="${category.name}" ${siteData.category === category.name ? 'selected' : ''}>${category.name}</option>`;
    });
    categorySelect.onchange = (e) => updateSiteCategory(hostname, e.target.value);
    listItem.appendChild(categorySelect);
    
    // Add rerun button
    const rerunButton = document.createElement('button');
    rerunButton.textContent = 'Rerun';
    rerunButton.onclick = () => rerunTracking(hostname);
    listItem.appendChild(rerunButton);

    // Add edit button
    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.onclick = () => editSiteSettings(hostname, siteData);
    listItem.appendChild(editButton);

    return listItem;
  }

  function editSiteSettings(hostname, siteData) {
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 20px;
    border: 1px solid #ccc;
    z-index: 1000;
    width: 300px;
  `;
  dialog.innerHTML = `
    <h3>Edit Settings for ${hostname}</h3>
    <div>
      <label>Original Time Limit (minutes):
        <input type="number" id="originalLimit" value="${siteData.initialLimit}">
      </label>
    </div>
    <div>
      <label>Extended Time (minutes):
        <input type="number" id="extendedTime" value="${siteData.totalExtendedTime || 0}">
      </label>
    </div>
    <div>
      <label>Reminder Text:
        <input type="text" id="reminderText" value="${siteData.reminder ? siteData.reminder.text : ''}" placeholder="Enter reminder text">
      </label>
    </div>
    <div>
      <label>Reminder Percentage:
        <input type="number" id="reminderPercentage" value="${siteData.reminder ? siteData.reminder.percentage : ''}" placeholder="Enter percentage (0-100)">
      </label>
    </div>
    <button id="saveSettings">Save</button>
    <button id="cancelEdit">Cancel</button>
  `;
  document.body.appendChild(dialog);

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

    // Handle reminder settings
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
      if (confirm('Changes will take effect when tracking is restarted. Stop tracking now?')) {
        updatedData.isTracking = false;
      }
    }

    chrome.storage.local.set({ [hostname]: updatedData }, () => {
      document.body.removeChild(dialog);
      updateSiteList();
      updateTimeList();
    });
  });

  document.getElementById('cancelEdit').addEventListener('click', () => {
    document.body.removeChild(dialog);
  });
}

  function stopTracking(hostname) {
    chrome.runtime.sendMessage({
      action: "stopTracking",
      hostname: hostname
    }, () => {
      // Remove from Track tab immediately
      const timeList = document.getElementById('timeList');
      const item = Array.from(timeList.children).find(li => li.textContent.includes(hostname));
      if (item) {
        timeList.removeChild(item);
      }
      updateSiteList(); // Update Manage tab
    });
  }

  function rerunTracking(hostname) {
    if (confirm('This will reset the tracking and remove any time extensions. Continue?')) {
      chrome.runtime.sendMessage({
        action: "rerunTracking",
        hostname: hostname,
      }, () => {
        updateTimeList();
        updateSiteList();
      });
    }
  }

  // Update site category
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
    
    if (hostnamesToDelete.length > 0 && confirm(`Are you sure you want to delete ${hostnamesToDelete.length} selected sites?`)) {
      chrome.storage.local.remove(hostnamesToDelete, () => {
        hostnamesToDelete.forEach(hostname => chrome.alarms.clear(hostname));
        updateSiteList();
        updateTimeList();
      });
    }
  }

  // Category functionality
  const categorySearch = document.getElementById('categorySearch');
  const searchButton = document.getElementById('searchButton');
  const addNewCategoryBtn = document.getElementById('addNewCategory');
  const categoryList = document.querySelector('.category-list');

  function updateCategoryList(filterText = '') {
    chrome.storage.sync.get('categories', (data) => {
      const categories = data.categories || [];
      const filteredCategories = categories.filter(category => 
        category.name.toLowerCase().includes(filterText.toLowerCase())
      );
      
      // Clear existing categories (except headers)
      while (categoryList.children.length > 3) {
        categoryList.removeChild(categoryList.lastChild);
      }

      filteredCategories.forEach((category, index) => {
        const editBtn = document.createElement('button');
        editBtn.textContent = 'edit';
        editBtn.onclick = () => editCategory(index);

        const nameDiv = document.createElement('div');
        nameDiv.textContent = category.name;

        const timeDiv = document.createElement('div');
        timeDiv.textContent = formatTime(category.suggestedLimit);

        categoryList.appendChild(editBtn);
        categoryList.appendChild(nameDiv);
        categoryList.appendChild(timeDiv);
      });
    });
  }

  // Initial population of the lists
  updateTimeList();
  updateSiteList();
  updateCategoryList();

  // Listen for live updates
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateTime") {
      updateTimeList();
    } else if (request.action === "siteSettingsUpdated") {
      updateTimeList();
      updateSiteList();
    }
  });
});