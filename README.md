# YapTap

Screen recording made simple. A good listener, just for you.

YapTap is a Chrome extension (Manifest V3) that records your screen, your microphone, or both, and saves the result straight to your downloads folder. There are no accounts, no servers and no uploads. Everything happens in your browser.

![YapTap popup and recording page](docs/preview.png)

## Features

- Record your screen, your microphone, or both together
- Live preview of what you're recording
- One-click stop, with automatic download of the finished file
- Recording stops on its own if you end screen sharing from Chrome's own bar
- Nothing leaves your machine

## Install (development)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the folder that contains `manifest.json`.
5. Pin YapTap from the puzzle-piece menu so it's always in your toolbar.

After you edit any file, click the reload icon on the YapTap card in `chrome://extensions`, then reopen the popup or recording tab.

## How to use

1. Click the YapTap icon in the toolbar, then **Start Recording**. This opens the recording page in a new tab.
2. Choose what to record: **Record Screen**, **Record Microphone**, or both. At least one must be selected.
3. Click **Start Recording**. Chrome asks which screen, window or tab to share, and for microphone access if you selected it.
4. Click **Stop Recording** when you're done. The file downloads automatically as `yaptap-recording-<timestamp>.webm`.

### Good to know

- Screen recording captures video only. It doesn't capture system or tab audio. Add the microphone option if you want narration.
- Microphone-only recordings are saved as audio in a `.webm` file.
- Video is encoded as VP9 + Opus when the browser supports it, otherwise as standard WebM.
- The recording page has to stay open while you record. Closing the tab ends the recording.

## Project structure

```
extension/
├── manifest.json          Extension config, icons, popup and service worker
├── background/
│   └── background.js      Opens the recording page when the popup asks for it
├── popup/                 The small window opened from the toolbar icon
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── recording/             The full-page recorder
│   ├── recording.html
│   ├── recording.css
│   └── recording.js       Capture, preview, MediaRecorder and file saving
├── shared/
│   └── theme.css          Palette, font, reset and shared button styles
├── icons/                 Extension icons (16, 32, 48, 128 px)
└── images/                Logo files (SVG + PNG): full, stacked and mark only
```

## How it works

- `popup.js` sends an `open-recording-page` message. `background.js` receives it and opens `recording/recording.html` in a new tab.
- `recording.js` uses `navigator.mediaDevices.getDisplayMedia()` for the screen and `getUserMedia()` for the microphone. It combines the tracks into one `MediaStream`, records it with `MediaRecorder`, and turns the chunks into a downloadable `Blob` when you stop.
- The extension requests no special permissions in `manifest.json`.

## Design and theming

The look comes from `shared/theme.css`. Change a variable there and both pages update.

| Variable | Colour | Role |
|---|---|---|
| `--yt-blue` | `#397CB8` | Primary buttons, icons, checkboxes |
| `--yt-bg` | `#F4F8FC` | Page background |
| `--yt-navy` | `#193B61` | Text, Stop button while recording |
| `--yt-yellow` | `#FFD25F` | Accent, the live recording dot |

**Font:** the design uses a rounded sans-serif (Nunito). To bundle it, save the font as `extension/fonts/Nunito.woff2` and uncomment the `@font-face` block in `shared/theme.css`. Without it, the UI falls back to your system font.

**Recording state:** `recording.js` sets `document.body.dataset.state` to `recording`, `processing` or `idle`. The CSS uses this to show the pulsing yellow dot and the navy Stop button, so you can style new states without touching the logic.

## Roadmap ideas

- Settings page (the design includes a gear icon in the recording header)
- Pause and resume
- Countdown before recording starts
- MP4 export
