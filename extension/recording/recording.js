// ---------- Elements ----------
const startRecordingBtn = document.getElementById('start-recording');
const startLabel = document.getElementById('start-label');
const pauseRecordingBtn = document.getElementById('pause-recording');
const stopRecordingBtn = document.getElementById('stop-recording');
const recordScreen = document.getElementById('record-screen');
const recordMicrophone = document.getElementById('record-microphone');
const recordSystemAudio = document.getElementById('record-system-audio');
const video = document.getElementById('video');
const status = document.getElementById('status');
const previewPlaceholder = document.getElementById('preview-placeholder');
const visualizerWrap = document.getElementById('visualizer-wrap');
const visualizer = document.getElementById('visualizer');
const visualizerLabel = document.getElementById('visualizer-label');
const countdownOverlay = document.getElementById('countdown');
const countdownNumber = document.getElementById('countdown-number');
const countdownCancelBtn = document.getElementById('countdown-cancel');
const timerEl = document.getElementById('timer');

// ---------- Settings ----------
const COUNTDOWN_SECONDS = 3;
const VIDEO_BITRATE = 2_500_000; // 2.5 Mbps is plenty for screen content
const AUDIO_BITRATE = 128_000;
const CHUNK_MS = 1000;           // flush data every second instead of one huge chunk at the end
const MAX_WIDTH = 1920;          // cap capture size: encoding 4K screens is very heavy on the CPU
const MAX_HEIGHT = 1080;
const OPFS_PREFIX = 'yaptap-';
const STALE_FILE_MS = 6 * 60 * 60 * 1000; // leftover temp recordings older than this get deleted

// ---------- State ----------
let mediaRecorder = null;
let recordedChunks = [];
let mediaStream = null;      // the stream that actually gets recorded
let sourceStreams = [];      // the raw streams from getDisplayMedia / getUserMedia (to stop later)
let audioCtx = null;
let analyser = null;
let vizFrame = null;
let countdownAbort = null;
let isRecording = false;

// Disk storage
let recordingHandle = null;  // temp file on disk (OPFS)
let diskWriter = null;
let writeQueue = Promise.resolve();
let writeFailed = false;
let previousFileName = null; // last saved temp file, removed when the next recording starts

// Timer
let elapsedBefore = 0;       // time from earlier segments (before pauses)
let segmentStart = null;     // performance.now() when the current segment began
let timerId = null;

pauseRecordingBtn.hidden = true;
stopRecordingBtn.disabled = true;


// ---------- Helpers ----------
function setStartLabel(text) {
    startLabel.textContent = text;
}

function lockOptions(locked) {
    recordScreen.disabled = locked;
    recordMicrophone.disabled = locked;
    recordSystemAudio.disabled = locked;
}

function stopSources() {
    sourceStreams.forEach(stream => stream.getTracks().forEach(track => track.stop()));
    sourceStreams = [];
}

function friendlyError(error) {
    switch (error?.name) {
        case 'NotAllowedError':
            return new Error('Permission was denied or cancelled.');
        case 'NotFoundError':
            return new Error('No microphone was found.');
        default:
            return error instanceof Error ? error : new Error('Something went wrong.');
    }
}


// ---------- Disk storage (OPFS) ----------
// Chunks are written to the browser's private file system (on the hard disk)
// instead of piling up in RAM. If it's unavailable we fall back to RAM.
async function openDiskFile() {
    try {
        const root = await navigator.storage.getDirectory();
        const handle = await root.getFileHandle(`${OPFS_PREFIX}${Date.now()}.webm`, { create: true });
        const writer = await handle.createWritable();
        return { handle, writer };
    } catch (error) {
        console.warn('Disk storage unavailable, using memory instead:', error);
        return null;
    }
}

async function removeDiskFile(name) {
    try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(name);
    } catch { /* already gone */ }
}

// Throw away a recording that failed or was cancelled
async function discardDiskFile() {
    try { await diskWriter?.abort(); } catch { }
    diskWriter = null;

    if (recordingHandle) await removeDiskFile(recordingHandle.name);
    recordingHandle = null;
}

// Delete old temp files that a crash or closed tab left behind
async function purgeOldRecordings() {
    try {
        const root = await navigator.storage.getDirectory();
        const cutoff = Date.now() - STALE_FILE_MS;

        for await (const [name, handle] of root.entries()) {
            if (handle.kind !== 'file' || !name.startsWith(OPFS_PREFIX)) continue;

            const file = await handle.getFile();
            if (file.lastModified < cutoff) await root.removeEntry(name);
        }
    } catch { }
}


// ---------- Timer (uses the clock, so pauses and slow tabs don't make it drift) ----------
function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');

    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function elapsedMs() {
    return elapsedBefore + (segmentStart === null ? 0 : performance.now() - segmentStart);
}

function renderTimer() {
    timerEl.textContent = formatTime(elapsedMs());
}

function startTimer() {
    elapsedBefore = 0;
    segmentStart = performance.now();
    timerEl.hidden = false;
    renderTimer();
    timerId = setInterval(renderTimer, 500);
}

function pauseTimer() {
    if (segmentStart === null) return;

    elapsedBefore += performance.now() - segmentStart;
    segmentStart = null;
    clearInterval(timerId);
    timerId = null;
    renderTimer();
}

function resumeTimer() {
    if (segmentStart !== null) return;

    segmentStart = performance.now();
    timerId = setInterval(renderTimer, 500);
}

function stopTimer() {
    clearInterval(timerId);
    timerId = null;
    elapsedBefore = 0;
    segmentStart = null;
    timerEl.hidden = true;
}


// ---------- 1. Setup the media streams ----------
async function streamSetup({ screen, mic, systemAudio }) {
    if (!screen && !mic && !systemAudio) {
        throw new Error('Please select at least one recording option');
    }

    // System audio can only come through getDisplayMedia, and Chrome always
    // needs a video request there, even when we only want the audio.
    const needDisplay = screen || systemAudio;

    const [displayResult, micResult] = await Promise.allSettled([
        needDisplay
            ? navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: MAX_WIDTH, max: MAX_WIDTH },
                    height: { ideal: MAX_HEIGHT, max: MAX_HEIGHT },
                    frameRate: { ideal: 30, max: 30 }
                },
                audio: systemAudio
            })
            : null,
        mic ? navigator.mediaDevices.getUserMedia({ audio: true }) : null
    ]);

    const displayStream = displayResult.value ?? null;
    const micStream = micResult.value ?? null;
    sourceStreams = [displayStream, micStream].filter(Boolean);

    const failed = [displayResult, micResult].find(r => r.status === 'rejected');
    if (failed) {
        stopSources();
        throw friendlyError(failed.reason);
    }

    // The user can untick "Share audio" in Chrome's picker, or pick a window
    // (windows have no audio). Tell them instead of silently recording nothing.
    const systemTracks = systemAudio ? displayStream.getAudioTracks() : [];
    if (systemAudio && systemTracks.length === 0) {
        stopSources();
        throw new Error(
            'No system audio was shared. Pick a tab or the entire screen and tick "Share audio".'
        );
    }

    // Collect every audio source
    const audioInputs = [];
    if (micStream) audioInputs.push(micStream);
    if (systemTracks.length) audioInputs.push(new MediaStream(systemTracks));

    let audioTrack = null;

    if (audioInputs.length) {
        // MediaRecorder only records ONE audio track, so two sources must be mixed.
        // Audio-only mode also needs the graph for the visualizer.
        // Otherwise skip the AudioContext and use the track directly (cheaper).
        const needGraph = audioInputs.length > 1 || !screen;

        if (needGraph) {
            audioCtx = new AudioContext();
            const mix = audioCtx.createGain();
            const destination = audioCtx.createMediaStreamDestination();

            audioInputs.forEach(stream => {
                audioCtx.createMediaStreamSource(stream).connect(mix);
            });

            mix.connect(destination);

            if (!screen) {
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 128;
                mix.connect(analyser); // never connect to audioCtx.destination, it would echo
            }

            audioCtx.resume().catch(() => { });
            audioTrack = destination.stream.getAudioTracks()[0];
        } else {
            audioTrack = audioInputs[0].getAudioTracks()[0];
        }
    }

    const displayVideoTrack = displayStream?.getVideoTracks()[0] ?? null;
    const tracks = [];

    if (screen && displayVideoTrack) tracks.push(displayVideoTrack);
    if (audioTrack) tracks.push(audioTrack);

    return {
        stream: new MediaStream(tracks),
        hasVideo: screen,
        // In audio-only mode this track is kept alive but NOT recorded.
        // We still listen to it so we know when the user stops sharing.
        displayVideoTrack
    };
}


// ---------- Preview ----------
function resetPreview() {
    video.srcObject = null;
    video.hidden = true;

    stopVisualizer();

    previewPlaceholder.hidden = false;

    previewPlaceholder.querySelector('h3').textContent = 'Ready to record?';
    previewPlaceholder.querySelector('p').textContent =
        'Your screen preview will appear here';
}

function showPreview(capture, options) {
    previewPlaceholder.hidden = true;

    if (capture.hasVideo) {
        video.srcObject = capture.stream;
        video.hidden = false;
        video.muted = true;

        video.play().catch(error => {
            console.warn('Video preview failed:', error);
        });
        return;
    }

    // Audio only: show a sound-reactive drawing instead of the video
    video.hidden = true;

    visualizerLabel.textContent =
        options.mic && options.systemAudio ? 'Microphone + system audio'
            : options.systemAudio ? 'System audio'
                : 'Microphone';

    visualizerWrap.hidden = false;
    startVisualizer();
}


// ---------- Audio visualizer ----------
function startVisualizer() {
    if (!analyser) return;

    // Size the canvas to its on-screen size (after it's visible) for crisp drawing
    const dpr = window.devicePixelRatio || 1;
    const rect = visualizer.getBoundingClientRect();
    visualizer.width = Math.round(rect.width * dpr);
    visualizer.height = Math.round(rect.height * dpr);

    const c = visualizer.getContext('2d');
    const theme = getComputedStyle(document.documentElement);
    const blue = theme.getPropertyValue('--yt-blue').trim() || '#397CB8';
    const yellow = theme.getPropertyValue('--yt-yellow').trim() || '#FFD25F';

    const data = new Uint8Array(analyser.frequencyBinCount);
    const { width: W, height: H } = visualizer;
    const BARS = 33;
    const CENTER = 16;
    const GAP = 4 * dpr;
    const barW = W / BARS;

    const draw = () => {
        if (!analyser) return;
        vizFrame = requestAnimationFrame(draw);

        analyser.getByteFrequencyData(data);
        const paused = mediaRecorder?.state === 'paused';

        c.clearRect(0, 0, W, H);

        for (let i = 0; i < BARS; i++) {
            // Low frequencies in the middle, higher ones toward the edges
            const distance = Math.abs(i - CENTER);
            const level = paused ? 0 : data[distance * 2] / 255;
            const h = Math.max(8 * dpr, level * H);

            const center = distance <= 1;

            c.fillStyle = center ? yellow : blue;
            c.beginPath();
            c.roundRect(i * barW + GAP / 2, (H - h) / 2, barW - GAP, h, (barW - GAP) / 2);
            c.fill();

            // Yellow is faint on the pale preview panel, so ring it like the live dot
            if (center) {
                c.strokeStyle = '#E0A526';
                c.lineWidth = 1.5 * dpr;
                c.stroke();
            }
        }
    };

    draw();
}

function stopVisualizer() {
    if (vizFrame) cancelAnimationFrame(vizFrame);
    vizFrame = null;
    visualizerWrap.hidden = true;
}


// ---------- Countdown ----------
function runCountdown(seconds) {
    countdownAbort = new AbortController();
    const { signal } = countdownAbort;

    document.body.dataset.state = 'countdown';
    status.textContent = 'Get ready…';

    return new Promise((resolve, reject) => {
        let remaining = seconds;
        let timerId = null;

        const finish = () => {
            clearInterval(timerId);
            countdownOverlay.hidden = true;
            countdownAbort = null;
        };

        const render = () => {
            countdownNumber.textContent = remaining;
            // restart the CSS animation for every number
            countdownNumber.classList.remove('tick');
            void countdownNumber.offsetWidth;
            countdownNumber.classList.add('tick');
        };

        signal.addEventListener('abort', () => {
            finish();
            reject(new DOMException('Countdown cancelled', 'AbortError'));
        }, { once: true });

        countdownOverlay.hidden = false;
        render();

        timerId = setInterval(() => {
            remaining -= 1;

            if (remaining <= 0) {
                finish();
                resolve();
            } else {
                render();
            }
        }, 1000);
    });
}


// ---------- Recorder options ----------
function getRecorderOptions(hasVideo) {
    // Order matters. If the PC gets hot or laggy while recording,
    // move the vp8 line above vp9 (vp8 is lighter on the CPU).
    const candidates = hasVideo
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        : ['audio/webm;codecs=opus', 'audio/webm'];

    const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type));

    const options = { audioBitsPerSecond: AUDIO_BITRATE };
    if (mimeType) options.mimeType = mimeType;
    if (hasVideo) options.videoBitsPerSecond = VIDEO_BITRATE;

    return options;
}


// ---------- Start / resume ----------
async function startRecording() {
    // Resume recording if it was paused
    if (mediaRecorder?.state === 'paused') {
        mediaRecorder.resume();
        resumeTimer();

        startRecordingBtn.hidden = true;
        startRecordingBtn.disabled = false;
        pauseRecordingBtn.hidden = false;
        pauseRecordingBtn.disabled = false;

        status.textContent = 'Recording...';
        setStartLabel('Start Recording');
        document.body.dataset.state = 'recording';
        return;
    }

    if (isRecording || mediaStream) return;

    // The previous recording was already downloaded, free its temp file
    if (previousFileName) {
        removeDiskFile(previousFileName);
        previousFileName = null;
    }

    const options = {
        screen: recordScreen.checked,
        mic: recordMicrophone.checked,
        systemAudio: recordSystemAudio.checked
    };

    try {
        status.textContent = 'Requesting permissions...';
        startRecordingBtn.disabled = true;
        lockOptions(true);

        const capture = await streamSetup(options);
        mediaStream = capture.stream;

        // If the user ends sharing from Chrome's bar, stop (or cancel the countdown)
        capture.displayVideoTrack?.addEventListener('ended', handleShareEnded, { once: true });

        showPreview(capture, options);

        // Countdown AFTER the picker, so the picker never ends up in the recording
        await runCountdown(COUNTDOWN_SECONDS);

        if (capture.displayVideoTrack?.readyState === 'ended') {
            throw new DOMException('Sharing ended', 'AbortError');
        }

        recordedChunks = [];
        writeFailed = false;
        writeQueue = Promise.resolve();

        // Prefer the hard disk; fall back to RAM if it isn't available
        const disk = await openDiskFile();
        recordingHandle = disk?.handle ?? null;
        diskWriter = disk?.writer ?? null;

        mediaRecorder = new MediaRecorder(mediaStream, getRecorderOptions(capture.hasVideo));

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size === 0) return;

            if (diskWriter) {
                // Chain the writes so chunks always land in order
                writeQueue = writeQueue
                    .then(() => diskWriter.write(event.data))
                    .catch(error => {
                        console.error('Disk write failed:', error);
                        if (!writeFailed) {
                            writeFailed = true;
                            status.textContent = 'Could not write to disk. Stopping…';
                            stopRecording();
                        }
                    });
            } else {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = finishRecording;

        mediaRecorder.start(CHUNK_MS);
        startTimer();

        isRecording = true;

        startRecordingBtn.hidden = true;
        pauseRecordingBtn.hidden = false;
        stopRecordingBtn.disabled = false;

        status.textContent = 'Recording...';
        document.body.dataset.state = 'recording';

    } catch (error) {
        const cancelled = error.name === 'AbortError';

        if (!cancelled) console.error('Recording failed:', error);

        status.textContent = cancelled ? 'Recording cancelled.' : error.message;

        await discardDiskFile();
        cleanup();
    }
}

function handleShareEnded() {
    if (isRecording) {
        stopRecording();
    } else {
        countdownAbort?.abort();
    }
}


// ---------- Pause ----------
function pauseRecording() {
    if (mediaRecorder?.state === 'recording') {
        mediaRecorder.pause();
        pauseTimer();

        pauseRecordingBtn.hidden = true;

        startRecordingBtn.hidden = false;
        startRecordingBtn.disabled = false;
        setStartLabel('Resume Recording');

        document.body.dataset.state = 'paused';
        status.textContent = 'Paused';
    }
}


// ---------- Stop ----------
function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

    status.textContent = 'Processing recording...';
    document.body.dataset.state = 'processing';

    pauseTimer(); // freeze the clock while the file is finalised
    stopRecordingBtn.disabled = true;

    mediaRecorder.stop();
    isRecording = false;
}


// ---------- Finish: flush to disk, then save ----------
async function finishRecording() {
    try {
        await writeQueue;                 // wait for every chunk to be written
        if (diskWriter) {
            await diskWriter.close();     // commits the file on disk
            diskWriter = null;
        }
        await saveRecording();
    } catch (error) {
        console.error('Saving failed:', error);
        status.textContent = 'Could not save the recording.';
        await discardDiskFile();
        cleanup();
    }
}


// ---------- Save the recorded file ----------
async function saveRecording() {
    const mimeType = mediaRecorder.mimeType || 'video/webm';
    let blob = null;

    if (recordingHandle && !writeFailed) {
        const file = await recordingHandle.getFile();
        // slice() is lazy: the data is read from disk, not loaded into RAM
        if (file.size > 0) blob = file.slice(0, file.size, mimeType);
    } else if (recordedChunks.length > 0) {
        blob = new Blob(recordedChunks, { type: mimeType });
    }

    if (blob) {
        const url = URL.createObjectURL(blob);

        const downloadLink = document.createElement('a');

        downloadLink.href = url;
        downloadLink.download = `yaptap-recording-${Date.now()}.webm`;

        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();

        // Large files need time to be handed to the download manager
        setTimeout(() => URL.revokeObjectURL(url), 60_000);

        // Keep the temp file until the next recording, the download may still be reading it
        previousFileName = recordingHandle?.name ?? null;

        status.textContent = 'Recording saved successfully!';
    } else {
        await discardDiskFile();
        status.textContent = 'No recording data was captured.';
    }

    cleanup();
}


// ---------- Cleanup ----------
function cleanup() {
    countdownOverlay.hidden = true;
    countdownAbort = null;

    stopSources();

    if (audioCtx) {
        audioCtx.close().catch(() => { });
        audioCtx = null;
    }
    analyser = null;

    mediaStream = null;
    mediaRecorder = null;
    recordedChunks = [];
    recordingHandle = null;
    diskWriter = null;
    writeQueue = Promise.resolve();
    writeFailed = false;
    isRecording = false;

    stopTimer();
    resetPreview();

    lockOptions(false);
    startRecordingBtn.hidden = false;
    startRecordingBtn.disabled = false;
    setStartLabel('Start Recording');
    pauseRecordingBtn.hidden = true;
    stopRecordingBtn.disabled = true;

    document.body.dataset.state = 'idle';
}


// ---------- Button events ----------
startRecordingBtn.addEventListener('click', startRecording);
pauseRecordingBtn.addEventListener('click', pauseRecording);
stopRecordingBtn.addEventListener('click', stopRecording);
countdownCancelBtn.addEventListener('click', () => countdownAbort?.abort());

// Remove temp recordings left over from a crash or a closed tab
purgeOldRecordings();
