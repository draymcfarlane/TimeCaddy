// Preset categories
const presetCategories = [
  { name: "Social Media", suggestedLimit: 30 },
  { name: "Video Streaming", suggestedLimit: 60 },
  { name: "Gaming", suggestedLimit: 60 },
  { name: "News", suggestedLimit: 30 },
  { name: "Productivity", suggestedLimit: 120 },
  { name: "Education", suggestedLimit: 90 },
  { name: "Shopping", suggestedLimit: 30 },
  { name: "Other", suggestedLimit: 60 }
];

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
      timeList.innerHTML = ''; // Clear existing list
      for (const [hostname, siteData] of Object.entries(data)) {
        if (siteData.isTracking) {
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
          if (siteData.category) {
            listItem.textContent += ` [${siteData.category}]`;
          }
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
        console.log("Updating site list with data:", data);
        const siteList = document.getElementById('siteList');
        siteList.innerHTML = ''; // Clear existing list
        
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
        
        console.log("Site list updated");
      });
    });
  }

  function createSiteListItem(hostname, siteData, categories) {
    const listItem = document.createElement('div');
    
    if (isEditMode) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'site-checkbox';
      checkbox.dataset.hostname = hostname;
      listItem.appendChild(checkbox);
    }
    
    const websiteName = hostname.replace(/^www\./, '').split('.')[0]; // Extract website name
    listItem.innerHTML += `${websiteName} (Limit: ${siteData.limit} minutes) - ${siteData.isTracking ? 'Tracking' : 'Not Tracking'}`;
    
    const categorySelect = document.createElement('select');
    categorySelect.innerHTML = '<option value="">No Category</option>';
    categories.forEach(category => {
      categorySelect.innerHTML += `<option value="${category.name}" ${siteData.category === category.name ? 'selected' : ''}>${category.name}</option>`;
    });
    categorySelect.onchange = (e) => updateSiteCategory(hostname, e.target.value);
    
    listItem.appendChild(categorySelect);
    
    return listItem;
  }

  // Rerun tracking for a site
  function rerunTracking(hostname) {
    chrome.storage.local.get(hostname, (data) => {
      const siteData = data[hostname];
      siteData.isTracking = true;
      siteData.time = 0; // Reset time
      chrome.storage.local.set({ [hostname]: siteData }, () => {
        updateSiteList();
        updateTimeList();
      });
    });
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
      console.log("Attempting to delete sites:", hostnamesToDelete);
      
      chrome.storage.local.remove(hostnamesToDelete, () => {
        if (chrome.runtime.lastError) {
          console.error("Error deleting sites:", chrome.runtime.lastError);
        } else {
          console.log("Sites should now be deleted.");
          hostnamesToDelete.forEach(hostname => chrome.alarms.clear(hostname));
          
          // Verify deletion
          chrome.storage.local.get(hostnamesToDelete, (result) => {
            const remainingSites = Object.keys(result);
            if (remainingSites.length > 0) {
              console.warn("Some sites were not deleted:", remainingSites);
            } else {
              console.log("All selected sites were successfully deleted.");
            }
            
            // Update the UI
            updateSiteList();
            updateTimeList();
            
            // Log final storage state
            chrome.storage.local.get(null, (data) => {
              console.log("Final storage contents:", data);
            });
          });
        }
      });
    }
  }

  // Reminder functionality
  const reminderText = document.getElementById('reminderText');
  const reminderPercentage = document.getElementById('reminderPercentage');
  const addReminderBtn = document.getElementById('addReminder');
  const reminderList = document.getElementById('reminderList');

  function updateReminderList() {
    chrome.storage.sync.get('reminders', (data) => {
      const reminders = data.reminders || [];
      reminderList.innerHTML = '';
      reminders.forEach((reminder, index) => {
        const li = document.createElement('li');
        li.textContent = `${reminder.text} (at ${reminder.percentage}%)`;
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.onclick = () => removeReminder(index);
        li.appendChild(removeBtn);
        reminderList.appendChild(li);
      });
    });
  }

  function addReminder() {
    const text = reminderText.value.trim();
    const percentage = parseInt(reminderPercentage.value);
    if (text && percentage > 0 && percentage < 100) {
      chrome.storage.sync.get('reminders', (data) => {
        const reminders = data.reminders || [];
        reminders.push({ text, percentage });
        chrome.storage.sync.set({ reminders }, () => {
          updateReminderList();
          reminderText.value = '';
          reminderPercentage.value = '';
        });
      });
    }
  }

  function removeReminder(index) {
    chrome.storage.sync.get('reminders', (data) => {
      const reminders = data.reminders || [];
      reminders.splice(index, 1);
      chrome.storage.sync.set({ reminders }, updateReminderList);
    });
  }

  addReminderBtn.addEventListener('click', addReminder);

  // Category functionality
  const categoryName = document.getElementById('categoryName');
  const categoryLimit = document.getElementById('categoryLimit');
  const addCategoryBtn = document.getElementById('addCategory');
  const categoryList = document.getElementById('categoryList');

  function updateCategoryList() {
    chrome.storage.sync.get('categories', (data) => {
      const categories = data.categories || [];
      categoryList.innerHTML = '';
      categories.forEach((category, index) => {
        const li = document.createElement('li');
        li.textContent = `${category.name} (Suggested: ${category.suggestedLimit} min)`;
        if (index >= presetCategories.length) {
          const removeBtn = document.createElement('button');
          removeBtn.textContent = 'Remove';
          removeBtn.onclick = () => removeCategory(index);
          li.appendChild(removeBtn);
        }
        categoryList.appendChild(li);
      });
    });
  }

  function addCategory() {
    const name = categoryName.value.trim();
    const limit = parseInt(categoryLimit.value);
    if (name && limit > 0) {
      chrome.storage.sync.get('categories', (data) => {
        const categories = data.categories || [];
        if (!categories.some(cat => cat.name === name)) {
          categories.push({ name, suggestedLimit: limit });
          chrome.storage.sync.set({ categories }, () => {
            updateCategoryList();
            categoryName.value = '';
            categoryLimit.value = '';
          });
        }
      });
    }
  }

  function removeCategory(index) {
    chrome.storage.sync.get('categories', (data) => {
      const categories = data.categories || [];
      if (index >= presetCategories.length) {
        categories.splice(index, 1);
        chrome.storage.sync.set({ categories }, updateCategoryList);
      } else {
        alert("Preset categories cannot be removed.");
      }
    });
  }

  addCategoryBtn.addEventListener('click', addCategory);

  // Initial population of the lists
  updateTimeList();
  updateSiteList();
  updateReminderList();
  updateCategoryList();

  // Listen for live updates
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateTime") {
      updateTimeList();
    }
  });
});