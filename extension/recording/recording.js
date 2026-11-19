const startRecordingBtn = document.getElementById('start-recording');
const pauseRecordingBtn = document.getElementById('pause-recording');
const stopRecordingBtn = document.getElementById('stop-recording');
const recordScreen = document.getElementById('record-screen');
const recordMicrophone = document.getElementById('record-microphone');
const video = document.getElementById('video');
const status = document.getElementById('status');
const previewPlaceholder = document.getElementById('preview-placeholder');

let mediaRecorder = null;
let recordedChunks = [];
let mediaStream = null;
let isRecording = false;

pauseRecordingBtn.hidden = true;
stopRecordingBtn.disabled = true;


// 1. Setup the media streams
async function streamSetup(options) {
    if (!options.screen && !options.audio) {
        throw new Error('Please select at least one recording option');
    }

    if (options.screen && options.audio) {
        const [screenResult, audioResult] = await Promise.allSettled([
            navigator.mediaDevices.getDisplayMedia({ video: true }),
            navigator.mediaDevices.getUserMedia({ audio: true })
        ]);

        if (
            screenResult.status === 'rejected' ||
            audioResult.status === 'rejected'
        ) {
            if (screenResult.status === 'fulfilled') {
                screenResult.value.getTracks().forEach(track => track.stop());
            }

            if (audioResult.status === 'fulfilled') {
                audioResult.value.getTracks().forEach(track => track.stop());
            }

            throw new Error('Failed to get screen or microphone permission');
        }

        const screenStream = screenResult.value;
        const audioStream = audioResult.value;

        return new MediaStream([
            ...screenStream.getVideoTracks(),
            ...audioStream.getAudioTracks()
        ]);
    }

    if (options.screen) {
        return navigator.mediaDevices.getDisplayMedia({
            video: true
        });
    }

    return navigator.mediaDevices.getUserMedia({
        audio: true
    });
}


// Update the preview placeholder
function resetPreview() {
    video.srcObject = null;
    video.hidden = true;

    previewPlaceholder.hidden = false;

    previewPlaceholder.querySelector('h3').textContent = 'Ready to record?';
    previewPlaceholder.querySelector('p').textContent =
        'Your screen preview will appear here';
}


// Start recording
async function startRecording() {
    // Resume recording if it was paused
    if (mediaRecorder?.state === 'paused') {
        mediaRecorder.resume();

        startRecordingBtn.hidden = true;
        startRecordingBtn.disabled = false;
        pauseRecordingBtn.hidden = false;
        pauseRecordingBtn.disabled = false;

        status.textContent = 'Recording...';
        startRecordingBtn.textContent = 'Start Recording';
        document.body.dataset.state = 'recording';
        return;
    }

    if (isRecording || mediaStream) return;

    const options = {
        screen: recordScreen.checked,
        audio: recordMicrophone.checked
    };

    try {
        status.textContent = 'Requesting permissions...';
        startRecordingBtn.disabled = true;

        mediaStream = await streamSetup(options);

        const hasVideo = mediaStream.getVideoTracks().length > 0;

        // Show video preview or audio placeholder
        if (hasVideo) {
            video.srcObject = mediaStream;
            video.hidden = false;
            previewPlaceholder.hidden = true;

            video.muted = true;

            video.play().catch(error => {
                console.warn('Video preview failed:', error);
            });
        } else {
            video.hidden = true;
            previewPlaceholder.hidden = false;

            previewPlaceholder.querySelector('h3').textContent =
                'Audio recording';

            previewPlaceholder.querySelector('p').textContent =
                'Microphone recording is in progress';
        }

        recordedChunks = [];

        // Choose MIME type according to the stream
        let mimeType;

        if (hasVideo) {
            mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
                ? 'video/webm;codecs=vp9,opus'
                : 'video/webm';
        } else {
            mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
        }

        mediaRecorder = new MediaRecorder(mediaStream, { mimeType });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = saveRecording;

        mediaRecorder.start();

        isRecording = true;

        startRecordingBtn.hidden = true;
        pauseRecordingBtn.hidden = false;
        stopRecordingBtn.disabled = false;
        recordScreen.disabled = true;
        recordMicrophone.disabled = true;

        status.textContent = 'Recording...';
        document.body.dataset.state = 'recording';

        // Stop if the user ends screen sharing
        mediaStream.getVideoTracks().forEach(track => {
            track.addEventListener('ended', stopRecording, { once: true });
        });

    } catch (error) {
        console.error('Recording failed:', error);

        status.textContent = error.message;

        cleanup();

        startRecordingBtn.disabled = false;
        stopRecordingBtn.disabled = true;
        recordScreen.disabled = false;
        recordMicrophone.disabled = false;
    }
}

// Pause recording
async function pauseRecording() {
    if (mediaRecorder?.state === 'recording') {
        mediaRecorder.pause();

        pauseRecordingBtn.hidden = true;

        startRecordingBtn.hidden = false;
        startRecordingBtn.disabled = false;
        startRecordingBtn.textContent = 'Resume Recording';

        document.body.dataset.state = 'paused';
        status.textContent = 'Paused';
    }
};

// Stop recording
function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

    status.textContent = 'Processing recording...';
    document.body.dataset.state = 'processing';

    stopRecordingBtn.disabled = true;

    mediaRecorder.stop();
    isRecording = false;
}


// Save the recorded file
function saveRecording() {
    const mimeType = mediaRecorder.mimeType || 'video/webm';

    if (recordedChunks.length > 0) {
        const blob = new Blob(recordedChunks, {
            type: mimeType
        });

        const url = URL.createObjectURL(blob);

        const downloadLink = document.createElement('a');

        downloadLink.href = url;
        downloadLink.download = `yaptap-recording-${Date.now()}.webm`;

        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();

        // Give the browser time to use the URL
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);

        status.textContent = 'Recording saved successfully!';
    } else {
        status.textContent = 'No recording data was captured.';
    }

    cleanup();

    startRecordingBtn.disabled = false;
    stopRecordingBtn.disabled = true;
    recordScreen.disabled = false;
    recordMicrophone.disabled = false;
}


// Cleanup
function cleanup() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    resetPreview();

    mediaRecorder = null;
    recordedChunks = [];
    isRecording = false;

    startRecordingBtn.hidden = false;
    startRecordingBtn.textContent = 'Start Recording';
    pauseRecordingBtn.hidden = true;

    document.body.dataset.state = 'idle';
}


// Button events
startRecordingBtn.addEventListener('click', startRecording);
pauseRecordingBtn.addEventListener('click', pauseRecording);
stopRecordingBtn.addEventListener('click', stopRecording);