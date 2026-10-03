# DECtalk Live

**Status:** Published browser-based speech synthesizer  
**Repository:** `onnxscibroccoli/dectalk-live`  
**Documentation snapshot:** 2026-10-03 EDT

DECtalk Live is an in-browser DECtalk speech-synthesis demonstration. It runs the synthesis engine in the browser through WebAssembly rather than sending text to a remote speech service.

## What it does

The published application provides:

- nine US English voices;
- speaking-rate control;
- phoneme markup;
- WAV download;
- browser-local synthesis;
- SUPERSOUND 3D Gielis-superformula visualization driven directly by the DECtalk playback AnalyserNode;
- live shape, deformation, FFT weighting, material, color-mapping, and wireframe controls;
- adaptive mobile rendering quality with reduced-motion support.

The implementation uses `@echogarden/dectalk-wasm`.

## Repository contents

There are seven tracked files:

- `site/index.html` — application page.
- `site/app.js` — browser application logic.
- `site/styles.css` — presentation.
- `site/bridge-worker.js` — worker bridge.
- `site/coi-serviceworker.js` — cross-origin-isolation support.
- `site/favicon.svg` — icon.
- `site/supersound.js` — Three.js/WebGL superformula renderer; it consumes the existing Web Audio analyser and does not own synthesis/playback.
- `README.md` — project documentation.

## SUPERSOUND audio path

The visualizer is an integration layer, not a second audio subsystem:

```text
DECtalk WASM -> synthesized WAV -> HTMLAudioElement -> MediaElementSource
                                               |
                                               v
                                          AnalyserNode
                                           /        \
                                  speakers          SUPERSOUND
```

The existing DECtalk playback graph remains authoritative. `site/supersound.js` only reads FFT/time-domain samples from that analyser. If the Three.js CDN import or WebGL initialization fails, speech synthesis and playback continue and the page shows a visualizer fallback.

On lower-power/mobile devices the visualizer uses fewer superformula vertices, a lower device-pixel-ratio ceiling, less frequent normal recomputation, and a reduced idle frame rate.

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


## Cross-Repository Knowledge Graph

**GRAPH TAG: `OMNIKALI-KG-2026-09-28`**

This repository participates in the OmniKali cross-project knowledge graph. **Future AI agents MUST read the graph before making cross-repository architectural changes.** It records repository ownership, dependencies, validated evidence, known failure modes, development state, and consolidation rules.

Graph file: [`.omnikali/project-knowledge-graph.md`](.omnikali/project-knowledge-graph.md)

**Agent rule:** do not treat this README or repository name as proof of runtime capability. Verify against tests, acceptance evidence, production contracts, and live behavior. Preserve restore points before risky changes, make the smallest atomic change, record evidence and timestamps, and update the graph whenever architecture, ownership, dependencies, proof, or failure knowledge changes.
