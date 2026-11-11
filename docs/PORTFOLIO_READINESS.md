# Portfolio reviewer readiness — dectalk-live

**Focus:** Browser speech synthesis demo based on attributed DECtalk WASM package  
**Current evidence status:** `SOURCE_PRESENT / ACCESSIBILITY_NOT_VERIFIED` (2026-11-11 snapshot; **not** production approval).  
**Tracking:** [repository issue](https://github.com/onnxscibroccoli/dectalk-live/issues/3) · [portfolio master ledger](https://github.com/onnxscibroccoli/broccoli-core/issues/102)  


## Inspect actual source
- [README.md](https://github.com/onnxscibroccoli/dectalk-live/blob/main/README.md)

**CI evidence:** no trustworthy workflow result was established during the initial portfolio audit. Mark NOT_VERIFIED until a run proves otherwise.

## First reviewer command (check prerequisites before executing)

```sh
npm test
```

This is a proposed reproduction command, **not a claim of executed testing**. Confirm the command exists in the current repository; record missing scripts/dependencies as NOT_VERIFIED rather than masking failures.

## Ordered implementation queue

1. [ ] Verify live static demo URL and document which package supplies synthesis.
2. [ ] Provide keyboard/focus and screen-reader playback checklist with observed results, not aspirational PASS.
3. [ ] Add the smallest smoke or static-file test appropriate for the actual repository.
4. [ ] Credit the upstream speech engine; focus claims on original UI/integration work.

## Evidence promotion gate

A project is not ready for a public professional demonstration merely because it has a README, an Actions schedule, or a test result unrelated to its claimed behavior. Provide exact source SHA, real test scope, negative controls, and meaningful limitations. Production or hardware assertions require an authorized real environment and appropriately scoped acceptance.

## Safe resumption

Inspect this issue and the master ledger, refresh the repo's `main` head and relevant PRs, implement the first unchecked item on a draft PR, attach exact test evidence and update the tracker. Avoid mass merging, secret exposure, false human review, and speculative employment claims.
