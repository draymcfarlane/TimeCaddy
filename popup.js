document.addEventListener('DOMContentLoaded', () => {
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
           const siteList = document.getElementById('siteList');
           siteList.innerHTML = ''; // Clear existing list
           for (const [hostname, siteData] of Object.entries(data)) {
             if (typeof siteData === 'object' && siteData.hasOwnProperty('isTracking')) {
               const listItem = document.createElement('li');
               const websiteName = hostname.replace(/^www\./, '').split('.')[0]; // Extract website name
               listItem.textContent = `${websiteName} (Limit: ${siteData.limit} minutes) - ${siteData.isTracking ? 'Tracking' : 'Not Tracking'}`;
               
               const categorySelect = document.createElement('select');
               categorySelect.innerHTML = '<option value="">No Category</option>';
               categories.forEach(category => {
                 categorySelect.innerHTML += `<option value="${category}" ${siteData.category === category ? 'selected' : ''}>${category}</option>`;
               });
               categorySelect.onchange = (e) => updateSiteCategory(hostname, e.target.value);
               
               listItem.appendChild(categorySelect);
               
               const removeBtn = document.createElement('button');
               removeBtn.textContent = 'Remove';
               removeBtn.className = 'remove-btn';
               removeBtn.onclick = () => removeSite(hostname);
               listItem.appendChild(removeBtn);
               
               siteList.appendChild(listItem);
             }
           }
         });
       });
     }
   
     // Remove a single site from tracking
     function removeSite(hostname) {
       chrome.storage.local.remove(hostname, () => {
         chrome.alarms.clear(hostname);
         updateSiteList();
         updateTimeList();
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
   
     // Clear all tracked data
     document.getElementById('clearAll').addEventListener('click', () => {
       if (confirm('Are you sure you want to clear all tracked data?')) {
         chrome.storage.local.clear(() => {
           chrome.alarms.clearAll();
           updateSiteList();
           updateTimeList();
         });
       }
     });
   
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
     const addCategoryBtn = document.getElementById('addCategory');
     const categoryList = document.getElementById('categoryList');
   
     function updateCategoryList() {
       chrome.storage.sync.get('categories', (data) => {
         const categories = data.categories || [];
         categoryList.innerHTML = '';
         categories.forEach((category, index) => {
           const li = document.createElement('li');
           li.textContent = category;
           const removeBtn = document.createElement('button');
           removeBtn.textContent = 'Remove';
           removeBtn.onclick = () => removeCategory(index);
           li.appendChild(removeBtn);
           categoryList.appendChild(li);
         });
       });
     }
   
     function addCategory() {
       const name = categoryName.value.trim();
       if (name) {
         chrome.storage.sync.get('categories', (data) => {
           const categories = data.categories || [];
           if (!categories.includes(name)) {
             categories.push(name);
             chrome.storage.sync.set({ categories }, () => {
               updateCategoryList();
               categoryName.value = '';
             });
           }
         });
       }
     }
   
     function removeCategory(index) {
       chrome.storage.sync.get('categories', (data) => {
         const categories = data.categories || [];
         categories.splice(index, 1);
         chrome.storage.sync.set({ categories }, updateCategoryList);
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