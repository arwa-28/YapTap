chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'open-recording-page') {
        chrome.tabs.create({
            url: chrome.runtime.getURL('recording/recording.html')
        })
        .catch(error => {
            console.error('Failed to open recording page:', error);
        });
    }
});
