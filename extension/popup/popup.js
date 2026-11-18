const startRecordingBtn = document.getElementById('start-recording');

startRecordingBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
        action: 'open-recording-page'
    });
});
