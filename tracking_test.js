// Separate tracking system
class TimeTracker {
    constructor() {
        this.activeTabId = null;
        this.startTime = null;
        this.intervalId = null;
        this.trackingStates = new Map(); // Stores tracking state for each hostname
    }

    // Initialize tracking for a site
    initializeTracking(hostname, initialLimit, totalExtendedTime = 0) {
        const trackingState = {
            isTracking: true,
            isPaused: false,
            time: 0,
            initialLimit,
            totalExtendedTime,
            lastUpdateTime: Date.now()
        };
        this.trackingStates.set(hostname, trackingState);
        this.updateAlarm(hostname);
    }

    // Update time limit without affecting tracking
    updateTimeLimit(hostname, newLimit, newExtendedTime) {
        const state = this.trackingStates.get(hostname);
        if (!state) return;

        state.initialLimit = newLimit;
        state.totalExtendedTime = newExtendedTime;
        this.updateAlarm(hostname);
    }

    // Update alarm based on current state
    updateAlarm(hostname) {
        const state = this.trackingStates.get(hostname);
        if (!state || !state.isTracking || state.isPaused) return;

        const totalLimit = (state.initialLimit + state.totalExtendedTime) * 60 * 1000;
        const remainingTime = (totalLimit - state.time) / 60000;

        if (remainingTime > 0) {
            chrome.alarms.clear(hostname);
            chrome.alarms.create(hostname, { delayInMinutes: remainingTime });
        }
    }

    // Start tracking for active tab
    startTracking(tabId) {
        this.stopTracking(); // Clean up any existing tracking
        this.activeTabId = tabId;
        this.startTime = Date.now();
        
        chrome.tabs.get(tabId, (tab) => {
            const hostname = new URL(tab.url).hostname;
            const state = this.trackingStates.get(hostname);
            
            if (state && state.isTracking && !state.isPaused) {
                this.intervalId = setInterval(() => this.updateTime(hostname), 1000);
                this.updateAlarm(hostname);
            }
        });
    }

    // Stop tracking
    stopTracking() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.activeTabId = null;
        this.startTime = null;
    }

    // Update tracked time
    updateTime(hostname) {
        const state = this.trackingStates.get(hostname);
        if (!state || !state.isTracking || state.isPaused) return;

        const now = Date.now();
        const timeSpent = now - state.lastUpdateTime;
        state.time += timeSpent;
        state.lastUpdateTime = now;

        const totalLimit = (state.initialLimit + state.totalExtendedTime) * 60 * 1000;
        
        // Update storage
        chrome.storage.local.get(hostname, (data) => {
            const siteData = data[hostname] || {};
            chrome.storage.local.set({
                [hostname]: {
                    ...siteData,
                    time: state.time
                }
            }, () => {
                chrome.runtime.sendMessage({
                    action: "updateTime",
                    hostname: hostname,
                    time: state.time
                });

                // Check if time limit reached
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
            });
        });
    }

    // Pause tracking
    pauseTracking(hostname) {
        const state = this.trackingStates.get(hostname);
        if (!state) return;

        state.isPaused = true;
        chrome.alarms.clear(hostname);
        this.stopTracking();
    }

    // Resume tracking
    resumeTracking(hostname) {
        const state = this.trackingStates.get(hostname);
        if (!state) return;

        state.isPaused = false;
        state.lastUpdateTime = Date.now();
        this.updateAlarm(hostname);
    }

    // Get current state
    getState(hostname) {
        return this.trackingStates.get(hostname);
    }
}

// Test the implementation
const tracker = new TimeTracker();

// Test updating time limit without affecting tracking
function testTimeUpdate() {
    const hostname = 'example.com';
    
    // Initialize tracking
    tracker.initializeTracking(hostname, 30); // 30 minutes initial limit
    
    // Update time limit without affecting tracking
    setTimeout(() => {
        tracker.updateTimeLimit(hostname, 45, 0); // Update to 45 minutes
        console.log('Time limit updated, tracking state:', tracker.getState(hostname));
    }, 5000);
}

// Export for integration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TimeTracker;
}
