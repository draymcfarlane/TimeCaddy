document.addEventListener('DOMContentLoaded', () => {
    // Display time spent on websites
    chrome.storage.local.get(null, (data) => {
      const timeList = document.getElementById('timeList');
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
  
    // Set time limit for a website
    document.getElementById('setLimit').addEventListener('click', () => {
      const website = document.getElementById('websiteInput').value;
      const limit = parseInt(document.getElementById('limitInput').value);
  
      if (website && !isNaN(limit)) {
        chrome.storage.local.get(website, (data) => {
          chrome.storage.local.set({
            [website]: {
              time: data[website] ? data[website].time || 0 : 0,
              limit: limit
            }
          }, () => {
            alert(`Time limit set for ${website}: ${limit} minutes`);
          });
        });
      } else {
        alert('Please enter a valid website and time limit.');
      }
    });
  });