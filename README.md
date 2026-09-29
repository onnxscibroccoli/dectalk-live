# DECtalk Live

**Status:** Published browser-based speech synthesizer  
**Repository:** `onnxscibroccoli/dectalk-live`  
**Documentation snapshot:** 2026-09-28 23:12 EDT

DECtalk Live is an in-browser DECtalk speech-synthesis demonstration. It runs the synthesis engine in the browser through WebAssembly rather than sending text to a remote speech service.

## What it does

The published application provides:

- nine US English voices;
- speaking-rate control;
- phoneme markup;
- WAV download;
- browser-local synthesis.

The implementation uses `@echogarden/dectalk-wasm`.

## Repository contents

There are seven tracked files:

- `site/index.html` — application page.
- `site/app.js` — browser application logic.
- `site/styles.css` — presentation.
- `site/bridge-worker.js` — worker bridge.
- `site/coi-serviceworker.js` — cross-origin-isolation support.
- `site/favicon.svg` — icon.
- `README.md` — project documentation.

## Why the service worker matters

The Emscripten build uses WebAssembly threads. The browser must therefore have the appropriate cross-origin isolation environment. The repository includes a COI service worker to provide that behavior on GitHub Pages.

## Development cycle

**PUBLISHED / SMALL STABLE DEMO.**

Recent history shows the site publishing through GitHub Pages rather than an Actions-based deployment workflow.

## Use

The public site is:

```
https://onnxscibroccoli.github.io/dectalk-live/
```

For local development, serve the `site/` directory from a local HTTP server rather than opening `index.html` directly, because browser security headers and worker behavior matter.

## AI model instructions

An AI changing the synthesis layer should preserve browser-local execution and the cross-origin-isolation requirements.

Before modifying `bridge-worker.js` or the COI service worker, understand the WebAssembly threading model.

Do not claim that the application supports arbitrary DECtalk voices or arbitrary browser environments without testing them. The README's nine voices are the documented supported set.

**Bottom line:** a small, focused browser/WASM speech-synthesis application that is already publicly published.
