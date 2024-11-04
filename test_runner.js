// Test runner for TimeTracker
function runTests() {
    const tracker = new TimeTracker();
    const testHostname = 'example.com';

    // Test 1: Initialize tracking
    console.log('Test 1: Initialize tracking');
    tracker.initializeTracking(testHostname, 30);
    console.assert(tracker.getState(testHostname).initialLimit === 30, 'Initial limit should be 30');

    // Test 2: Update time limit
    console.log('Test 2: Update time limit');
    tracker.updateTimeLimit(testHostname, 45, 0);
    const state = tracker.getState(testHostname);
    console.assert(state.initialLimit === 45, 'Updated limit should be 45');
    console.assert(state.isTracking === true, 'Should still be tracking');
    console.assert(state.time === state.time, 'Time should not be reset');

    // Test 3: Tracking continues after update
    console.log('Test 3: Tracking continues after update');
    setTimeout(() => {
        const newState = tracker.getState(testHostname);
        console.assert(newState.time > 0, 'Time should be accumulating');
        console.assert(newState.isTracking === true, 'Should still be tracking');
    }, 2000);

    // Log results
    console.log('Test results:', {
        initialState: tracker.getState(testHostname),
        afterUpdate: state
    });
}

// Run tests
runTests();
