# DECtalk Live

In-browser [DECtalk](https://en.wikipedia.org/wiki/DECtalk) speech synthesizer, using [`@echogarden/dectalk-wasm`](https://github.com/echogarden-project/dectalk-wasm).

**Live site:** [https://onnxscibroccoli.github.io/dectalk-live/](https://onnxscibroccoli.github.io/dectalk-live/)

Nine US English voices (Paul, Betty, Harry, Frank, Dennis, Kit, Ursula, Rita, Wendy), speaking rate, phoneme markup, WAV download. Synthesis runs entirely in the browser via WebAssembly threads.

The Emscripten build needs a pre-warmed pthread pool and cross-origin isolation (`COOP` / `COEP`). GitHub Pages gets that from a [COI service worker](https://github.com/gzuidhof/coi-serviceworker).
