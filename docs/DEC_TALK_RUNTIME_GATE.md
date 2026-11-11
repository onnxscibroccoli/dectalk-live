# DECtalk browser runtime: dependency and redistribution gate

**As assessed 2026-11-11: NOT_VERIFIED / ASSET_MISSING / LICENSE_REVIEW_REQUIRED.**

The tracked page uses `site/bridge-worker.js` to import `./dectalk.js`. The current tracked `site/` directory has no `dectalk.js` or `dectalk.wasm` binaries. GitHub Pages successfully publishing HTML, CSS and JavaScript **does not establish browser synthesis functionality**.

The intended upstream source is `@echogarden/dectalk-wasm`, whose repository includes `wasm/dectalk.js` and `wasm/dectalk.wasm`. The package `package.json` declares `license: MIT`, but [its upstream LICENSE.md](https://github.com/echogarden-project/dectalk-wasm/blob/main/LICENSE.md) begins with proprietary ownership and copying restrictions associated with FONIX and predecessors. This difference needs authoritative provenance/legal clarification. Neither an npm package label nor public GitHub visibility is an adequate redistribution authorization for the underlying compiled speech engine.

**Do not automatically npm-install/vendor the binary into the public site, CDN, or GitHub Release until distribution rights are affirmatively resolved.** Attribution is required regardless.

## Automated, non-distributive audit

```sh
python3 -m unittest discover -s tests -p 'test_site_runtime.py' -v
python3 scripts/check_site_runtime.py --site site
```

The first command validates the scanner and its failure examples. The second reports exact source dependency presence and always distinguishes source checks from actual browser playback. A green CI audit is **not** a green application-runtime acceptance.

## Correct next engineering work

1. Request or confirm an explicit licensing basis for use and redistribution of the exact DECtalk source/binaries, including any dependencies inherited from FONIX/other owners.
2. If permission exists, create a pinned, reproducible build with complete runtime, checksum and license text, then validate it in real browsers with proper cross-origin-isolation headers.
3. If not, consider an independently licensed synthesis engine or the browser's native speech synthesis as a **clearly labeled alternative**, rather than marketing it as DECtalk.
4. Verify audible speech, nine voice profiles, WAV export, keyboard operation, accessible announcements, browser mobile behavior, and the visualizer failure fallback. Capture browser/CI evidence and accessible demo.
5. Only then change the status from `NOT_VERIFIED` and consider public artifact publication.

No credentials, sound recordings, user-entered text, or model API telemetry are required for this source audit.

Tracking: [runtime deficiency and license issue #5](https://github.com/onnxscibroccoli/dectalk-live/issues/5) · [portfolio campaign](https://github.com/onnxscibroccoli/broccoli-core/issues/102).
