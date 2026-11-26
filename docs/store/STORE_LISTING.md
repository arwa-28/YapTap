# Chrome Web Store: copy-paste answers for YapTap

## Store listing tab

**Name:** YapTap
**Summary (max 132 chars):** Record your screen, mic and system audio with pause/resume and a 3-2-1 countdown. Saved locally. No account.
**Category:** Productivity
**Language:** English

**Description:**

YapTap makes screen recording simple.

Click the YapTap icon, choose what to record, and press Start. A 3-2-1 countdown gets you ready, and when you're done your recording is saved straight to your Downloads folder.

WHAT YOU CAN DO
• Record your screen: the entire screen, a window, or a browser tab
• Record your microphone, your system or tab audio, or any mix of them (mixed into a single track)
• Audio only? Skip the screen and watch a live sound visualizer instead of a blank preview
• Start with a 3-2-1 countdown, with a Cancel button
• Pause and resume as often as you like, with a timer that stays accurate
• Stop in one click and the file downloads automatically (WebM)
• Long recordings are written to disk while you record, so they don't pile up in memory

PRIVATE BY DESIGN
Everything happens inside your browser. No account, no servers, no uploads, no analytics. Your recordings never leave your computer.

HOW IT WORKS
1. Click the YapTap icon and press Start Recording.
2. Choose Screen, Microphone, System Audio, or any combination.
3. Press Start Recording and pick what to share when Chrome asks.
4. Wait for the countdown, then record. Pause and resume whenever you need.
5. Press Stop Recording. Your file downloads automatically.

NOTES ON SYSTEM AUDIO
System audio comes from Chrome's share dialog: choose a tab or the entire screen and tick "Share audio". Tab audio works on every platform; full system audio is available on Windows and ChromeOS when sharing the entire screen, and is usually limited to tab audio on macOS. Sharing a single window does not include audio. If you record the microphone and system audio together, use headphones to avoid echo.

**Graphic assets:** store-icon-128.png, promo-small-440x280.png, promo-marquee-1400x560.png (optional), plus 1 to 5 screenshots (1280x800) you capture from the real extension.
**Support URL:** https://github.com/arwa-28/YapTap/issues

## Privacy tab

**Single purpose description:**
Record the user's screen, microphone and/or system audio and save the recording to the user's computer.

**Permission justifications:** The extension declares no permissions in its manifest, so there is nothing to justify. If the field appears, write: "YapTap requests no permissions. Screen capture uses getDisplayMedia and microphone uses getUserMedia, both gated by Chrome's own user prompts."

**Remote code:** No, I am not using remote code.

**Data usage:** Leave every data-type box unchecked (nothing is collected or transmitted). Tick all three certifications:
- I do not sell or transfer user data to third parties
- I do not use or transfer user data for purposes unrelated to the item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending

**Privacy policy URL:** https://github.com/arwa-28/YapTap/blob/main/PRIVACY.md
(Commit PRIVACY.md to the repo root first and put a real email at the bottom. The link must open without a login.)

## Test instructions (Distribution tab, "Additional instructions for reviewers")

No account or login needed.
1. Click the YapTap toolbar icon, then Start Recording. The recorder opens in a new tab.
2. Keep "Screen" ticked (optionally tick "Microphone" or "System Audio") and click Start Recording.
3. Chrome's share picker appears. Choose a tab or window and click Share. A 3-2-1 countdown runs, then the preview shows and the status reads "Recording...". Pause Recording and Resume Recording work at any time.
4. Click Stop Recording. A .webm file downloads automatically.
Nothing is uploaded; all processing is local.

## Distribution tab
**Visibility:** Public (or Unlisted while testing) **Pricing:** Free **Regions:** All
