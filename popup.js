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
    listItem.innerHTML += `${websiteName} (${siteData.limit ? 'Limit: ' + siteData.limit + ' minutes' : 'Scheduled'}) - ${siteData.isTracking ? 'Tracking' : 'Not Tracking'}`;
    
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
    // ... (existing editSiteSettings function remains unchanged)
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
    // ... (existing toggleEditModeElements function remains unchanged)
  }

  function toggleCheckAll() {
    // ... (existing toggleCheckAll function remains unchanged)
  }

  function deleteSelected() {
    // ... (existing deleteSelected function remains unchanged)
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

  // Initial population of the lists
  updateTimeList();
  updateSiteList();
  updateCategoryList();

  // Listen for live updates
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateTime") {
      updateTimeList();
    }
  });
});