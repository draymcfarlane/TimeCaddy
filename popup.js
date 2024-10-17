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
    
    if (isEditMode) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'site-checkbox';
      checkbox.dataset.hostname = hostname;
      listItem.appendChild(checkbox);
    }
    
    const websiteName = hostname.replace(/^www\./, '').split('.')[0];
    listItem.innerHTML += `${websiteName} (Limit: ${siteData.limit} minutes) - ${siteData.isTracking ? 'Tracking' : 'Not Tracking'}`;
    
    if (siteData.reminder) {
      listItem.innerHTML += ` - Reminder: ${siteData.reminder.text} at ${siteData.reminder.percentage}%`;
    }
    
    if (siteData.schedule) {
      listItem.innerHTML += ` - Schedule: ${siteData.schedule.startTime} to ${siteData.schedule.stopTime}`;
    }
    
    const categorySelect = document.createElement('select');
    categorySelect.innerHTML = '<option value="">No Category</option>';
    categories.forEach(category => {
      categorySelect.innerHTML += `<option value="${category.name}" ${siteData.category === category.name ? 'selected' : ''}>${category.name}</option>`;
    });
    categorySelect.onchange = (e) => updateSiteCategory(hostname, e.target.value);
    
    listItem.appendChild(categorySelect);
    
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
    `;
    dialog.innerHTML = `
      <h3>Edit Settings for ${hostname}</h3>
      <label>
        <input type="radio" name="timeType" value="limit" ${!siteData.schedule ? 'checked' : ''}>
        Set Time Limit
      </label>
      <label>
        <input type="radio" name="timeType" value="schedule" ${siteData.schedule ? 'checked' : ''}>
        Set Schedule
      </label>
      <div id="limitSettings" ${siteData.schedule ? 'style="display:none;"' : ''}>
        <input type="number" id="timeLimit" value="${siteData.limit || ''}" placeholder="Time limit in minutes">
      </div>
      <div id="scheduleSettings" ${!siteData.schedule ? 'style="display:none;"' : ''}>
        <input type="time" id="startTime" value="${siteData.schedule ? siteData.schedule.startTime : ''}">
        <input type="time" id="stopTime" value="${siteData.schedule ? siteData.schedule.stopTime : ''}">
      </div>
      <div>
        <input type="text" id="reminderText" value="${siteData.reminder ? siteData.reminder.text : ''}" placeholder="Reminder text">
        <input type="number" id="reminderPercentage" value="${siteData.reminder ? siteData.reminder.percentage : ''}" placeholder="Reminder percentage">
      </div>
      <button id="saveSettings">Save</button>
      <button id="cancelEdit">Cancel</button>
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
      const newData = { ...siteData };
      const timeType = document.querySelector('input[name="timeType"]:checked').value;
      if (timeType === 'limit') {
        newData.limit = parseInt(document.getElementById('timeLimit').value);
        delete newData.schedule;
      } else {
        newData.schedule = {
          startTime: document.getElementById('startTime').value,
          stopTime: document.getElementById('stopTime').value
        };
        delete newData.limit;
      }
      const reminderText = document.getElementById('reminderText').value;
      const reminderPercentage = parseInt(document.getElementById('reminderPercentage').value);
      if (reminderText && reminderPercentage) {
        newData.reminder = { text: reminderText, percentage: reminderPercentage };
      } else {
        delete newData.reminder;
      }
      chrome.storage.local.set({ [hostname]: newData }, () => {
        document.body.removeChild(dialog);
        updateSiteList();
      });
    });

    document.getElementById('cancelEdit').addEventListener('click', () => {
      document.body.removeChild(dialog);
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

  function formatTime(minutes) {
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      if (remainingMinutes === 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''}`;
      } else {
        return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
      }
    }
  }

  function addNewCategory() {
    const name = prompt("Enter category name:");
    const limit = parseInt(prompt("Enter time limit in minutes:"));
    if (name && !isNaN(limit)) {
      chrome.storage.sync.get('categories', (data) => {
        const categories = data.categories || [];
        if (!categories.some(cat => cat.name === name)) {
          categories.push({ name, suggestedLimit: limit });
          chrome.storage.sync.set({ categories }, updateCategoryList);
        } else {
          alert("Category already exists!");
        }
      });
    }
  }

  function editCategory(index) {
    chrome.storage.sync.get('categories', (data) => {
      const categories = data.categories || [];
      const category = categories[index];
      const newName = prompt("Enter new category name:", category.name);
      const newLimit = parseInt(prompt("Enter new time limit in minutes:", category.suggestedLimit));
      if (newName && !isNaN(newLimit)) {
        categories[index] = { name: newName, suggestedLimit: newLimit };
        chrome.storage.sync.set({ categories }, updateCategoryList);
      }
    });
  }

  addNewCategoryBtn.addEventListener('click', addNewCategory);
  searchButton.addEventListener('click', () => updateCategoryList(categorySearch.value));
  categorySearch.addEventListener('input', (e) => updateCategoryList(e.target.value));

  // Handle site settings updates
  function updateSiteInLists(hostname, newData) {
    // Update in Track section
    const timeList = document.getElementById('timeList');
    const trackListItem = Array.from(timeList.children).find(li => li.textContent.includes(hostname));
    if (trackListItem) {
      const websiteName = hostname.replace(/^www\./, '').split('.')[0];
      const timeSpent = newData.time / 1000;
      const hours = Math.floor(timeSpent / 3600);
      const minutes = Math.floor((timeSpent % 3600) / 60);
      const seconds = Math.floor(timeSpent % 60);
      trackListItem.textContent = `${websiteName}: ${hours}h ${minutes}m ${seconds}s (Limit: ${newData.limit} minutes)`;
    }

// Update in Manage section
const siteList = document.getElementById('siteList');
const manageListItem = Array.from(siteList.children).find(div => div.textContent.includes(hostname));
if (manageListItem) {
  const websiteName = hostname.replace(/^www\./, '').split('.')[0];
  manageListItem.childNodes[0].textContent = `${websiteName} (Limit: ${newData.limit} minutes) - ${newData.isTracking ? 'Tracking' : 'Not Tracking'}`;
}
}

// Listen for site settings updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
if (request.action === "siteSettingsUpdated") {
  updateSiteInLists(request.hostname, request.newData);
}
if (request.action === "updateTime") {
  updateTimeList();
}
});

// Initial population of the lists
updateTimeList();
updateSiteList();
updateCategoryList();

// Category tab functionality
const categoryTab = document.getElementById('categories');
const categorySearchInput = categoryTab.querySelector('#categorySearch');
const addCategoryBtn = categoryTab.querySelector('#addNewCategory');
const categoryListElement = categoryTab.querySelector('.category-list');

categorySearchInput.addEventListener('input', (e) => {
updateCategoryList(e.target.value);
});

addCategoryBtn.addEventListener('click', () => {
const name = prompt("Enter category name:");
const limit = parseInt(prompt("Enter suggested time limit (in minutes):"));
if (name && !isNaN(limit)) {
  chrome.storage.sync.get('categories', (data) => {
    const categories = data.categories || [];
    if (!categories.some(cat => cat.name === name)) {
      categories.push({ name, suggestedLimit: limit });
      chrome.storage.sync.set({ categories }, () => {
        updateCategoryList();
      });
    } else {
      alert("Category already exists!");
    }
  });
}
});

function updateCategoryList(filterText = '') {
chrome.storage.sync.get('categories', (data) => {
  const categories = data.categories || [];
  const filteredCategories = categories.filter(category => 
    category.name.toLowerCase().includes(filterText.toLowerCase())
  );
  
  // Clear existing categories (except headers)
  while (categoryListElement.children.length > 3) {
    categoryListElement.removeChild(categoryListElement.lastChild);
  }

  filteredCategories.forEach((category, index) => {
    const editBtn = document.createElement('button');
    editBtn.textContent = 'edit';
    editBtn.onclick = () => editCategory(index);

    const nameDiv = document.createElement('div');
    nameDiv.textContent = category.name;

    const timeDiv = document.createElement('div');
    timeDiv.textContent = formatTime(category.suggestedLimit);

    categoryListElement.appendChild(editBtn);
    categoryListElement.appendChild(nameDiv);
    categoryListElement.appendChild(timeDiv);
  });
});
}

function editCategory(index) {
chrome.storage.sync.get('categories', (data) => {
  const categories = data.categories || [];
  const category = categories[index];
  const newName = prompt("Enter new category name:", category.name);
  const newLimit = parseInt(prompt("Enter new suggested time limit (in minutes):", category.suggestedLimit));
  if (newName && !isNaN(newLimit)) {
    categories[index] = { name: newName, suggestedLimit: newLimit };
    chrome.storage.sync.set({ categories }, () => {
      updateCategoryList();
    });
  }
});
}

// Settings tab functionality
// Add any global settings functionality here if needed

// Helper function to format time
function formatTime(minutes) {
if (minutes < 60) {
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
} else {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else {
    return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
  }
}
}
});