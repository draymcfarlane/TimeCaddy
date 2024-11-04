// Time Tracker Implementation
class TimeTracker {
    constructor() {
        this.activeTabId = null;
        this.startTime = null;
        this.intervalId = null;
        this.trackingStates = new Map();
        this.ignoredSites = new Set();
        this.setupListeners();
    }

    setupListeners() {
        chrome.tabs.onActivated.addListener((activeInfo) => {
            this.handleTabChange(activeInfo.tabId);
        });

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tabId === this.activeTabId) {
                this.handleTabChange(tabId);
            }
        });

        chrome.alarms.onAlarm.addListener((alarm) => {
            this.handleAlarm(alarm);
        });
    }

    handleTabChange(tabId) {
        if (this.activeTabId) {
            this.saveTimeForActiveTab();
        }

        if (this.intervalId) {
            clearInterval(this.intervalId);
        }

        this.activeTabId = tabId;
        this.startTime = new Date();

        chrome.tabs.get(tabId, (tab) => {
            const hostname = new URL(tab.url).hostname;
            if (this.ignoredSites.has(hostname)) return;

            chrome.storage.local.get(hostname, (data) => {
                if (!data[hostname]) {
                    // Show prompt for new site
                    chrome.tabs.sendMessage(tabId, {
                        action: "promptTrack",
                        hostname: hostname
                    });
                } else {
                    const state = this.trackingStates.get(hostname);
                    if (state && state.isTracking && !state.isPaused) {
                        this.startTrackingForHostname(hostname);
                    }
                }
            });
        });
    }

    startTrackingForHostname(hostname) {
        const state = this.trackingStates.get(hostname);
        if (!state || !state.isTracking || state.isPaused) return;

        this.startTime = new Date();
        this.intervalId = setInterval(() => this.saveTimeForActiveTab(), 1000);
        
        const totalLimit = (state.initialLimit + (state.totalExtendedTime || 0)) * 60 * 1000;
        const remainingTime = (totalLimit - state.time) / 60000;
        
        if (remainingTime > 0) {
            chrome.alarms.create(hostname, { delayInMinutes: remainingTime });
        }
    }

    saveTimeForActiveTab() {
        const endTime = new Date();
        const timeSpent = endTime - this.startTime;

        chrome.tabs.get(this.activeTabId, (tab) => {
            const hostname = new URL(tab.url).hostname;
            const state = this.trackingStates.get(hostname);
            
            if (state && state.isTracking && !state.isPaused) {
                state.time += timeSpent;
                this.updateStorage(hostname, state);
            }
        });

        this.startTime = new Date();
    }

    updateStorage(hostname, state) {
        chrome.storage.local.get(hostname, (data) => {
            const siteData = data[hostname] || {};
            const updatedData = {
                ...siteData,
                time: state.time
            };

            chrome.storage.local.set({ [hostname]: updatedData }, () => {
                chrome.runtime.sendMessage({
                    action: "updateTime",
                    hostname: hostname,
                    time: state.time
                });

                // Check time limit
                const totalLimit = (state.initialLimit + (state.totalExtendedTime || 0)) * 60 * 1000;
                if (state.time >= totalLimit) {
                    this.pauseTracking(hostname);
                    chrome.tabs.sendMessage(this.activeTabId, {
                        action: "showTimeLimitReached",
                        hostname: hostname,
                        currentTime: state.time,
                        initialLimit: state.initialLimit,
                        totalExtendedTime: state.totalExtendedTime
                    });
                }

                // Handle reminder if set
                if (state.reminder) {
                    const reminderThreshold = totalLimit * (state.reminder.percentage / 100);
                    if (state.time >= reminderThreshold && (state.time - timeSpent) < reminderThreshold) {
                        chrome.tabs.sendMessage(this.activeTabId, {
                            action: "showCustomReminder",
                            message: state.reminder.text
                        });
                    }
                }
            });
        });
    }

    updateTimeLimit(hostname, newLimit, newExtendedTime) {
        const state = this.trackingStates.get(hostname);
        if (!state) return;

        state.initialLimit = newLimit;
        state.totalExtendedTime = newExtendedTime;

        const totalLimit = (newLimit + newExtendedTime) * 60 * 1000;
        const remainingTime = (totalLimit - state.time) / 60000;

        if (remainingTime > 0 && state.isTracking && !state.isPaused) {
            chrome.alarms.clear(hostname);
            chrome.alarms.create(hostname, { delayInMinutes: remainingTime });
        }
    }

    initializeTracking(hostname, settings) {
        const trackingState = {
            isTracking: true,
            isPaused: false,
            time: settings.time || 0,
            initialLimit: settings.initialLimit,
            totalExtendedTime: settings.totalExtendedTime || 0,
            reminder: settings.reminder
        };
        
        this.trackingStates.set(hostname, trackingState);
        
        if (trackingState.isTracking && !trackingState.isPaused) {
            const totalLimit = (settings.initialLimit + (settings.totalExtendedTime || 0)) * 60 * 1000;
            const remainingTime = (totalLimit - (settings.time || 0)) / 60000;
            
            if (remainingTime > 0) {
                chrome.alarms.create(hostname, { delayInMinutes: remainingTime });
            }
        }
    }

    pauseTracking(hostname) {
        const state = this.trackingStates.get(hostname);
        if (!state) return;

        state.isPaused = true;
        chrome.alarms.clear(hostname);
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    resumeTracking(hostname) {
        const state = this.trackingStates.get(hostname);
        if (!state) return;

        state.isPaused = false;
        this.startTrackingForHostname(hostname);
    }

    ignoreSite(hostname) {
        this.ignoredSites.add(hostname);
    }

    handleAlarm(alarm) {
        if (alarm.name.startsWith('dismiss_')) {
            const hostname = alarm.name.replace('dismiss_', '');
            this.handleDismissAlarm(hostname);
        } else {
            this.handleTimeLimitAlarm(alarm.name);
        }
    }

    handleDismissAlarm(hostname) {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0] && new URL(tabs[0].url).hostname === hostname) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "showTimeLimitReached",
                    hostname: hostname
                });
            }
        });
    }

    handleTimeLimitAlarm(hostname) {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0] && new URL(tabs[0].url).hostname === hostname) {
                this.pauseTracking(hostname);
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "showTimeLimitReached",
                    hostname: hostname
                });
            }
        });
    }
}

// Initialize tracker
const tracker = new TimeTracker();

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

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "addSite") {
        const settings = {
            time: 0,
            initialLimit: request.limit,
            totalExtendedTime: 0,
            schedule: request.schedule,
            reminder: request.reminder,
            isTracking: true,
            isPaused: false,
            category: request.category
        };

        chrome.storage.local.set({
            [request.hostname]: settings
        }, () => {
            tracker.initializeTracking(request.hostname, settings);
            sendResponse({success: true});
        });
        return true;
    } else if (request.action === "ignoreSite") {
        tracker.ignoreSite(request.hostname);
        sendResponse({success: true});
    } else if (request.action === "updateSiteSettings") {
        chrome.storage.local.get(request.hostname, (data) => {
            const currentSiteData = data[request.hostname] || {};
            const updatedData = {
                ...currentSiteData,
                ...request.settings
            };

            chrome.storage.local.set({ [request.hostname]: updatedData }, () => {
                // Update tracking without disturbing current state
                tracker.updateTimeLimit(
                    request.hostname,
                    updatedData.initialLimit,
                    updatedData.totalExtendedTime || 0
                );

                chrome.runtime.sendMessage({
                    action: "siteSettingsUpdated",
                    hostname: request.hostname,
                    newData: updatedData
                });
                sendResponse({success: true});
            });
        });
        return true;
    } else if (request.action === "rerunTracking") {
        chrome.storage.local.get(request.hostname, (data) => {
            const siteData = data[request.hostname];
            const updatedData = {
                ...siteData,
                isTracking: true,
                isPaused: false,
                time: 0,
                totalExtendedTime: request.preserveSettings ? siteData.totalExtendedTime : 0
            };

            chrome.storage.local.set({ [request.hostname]: updatedData }, () => {
                tracker.initializeTracking(request.hostname, updatedData);
                chrome.runtime.sendMessage({
                    action: "siteSettingsUpdated",
                    hostname: request.hostname,
                    newData: updatedData
                });
                sendResponse({success: true});
            });
        });
        return true;
    }
});

// Initial setup
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        chrome.storage.sync.set({ categories: presetCategories }, () => {
            console.log("Preset categories have been set.");
        });
    }
});
