#!/usr/bin/env python3
"""Read-only audit of DECtalk browser launch prerequisites.

The DECtalk WASM upstream package.json reports MIT while its LICENSE.md has
proprietary FONIX language. Do not auto-vendor or publish until rights are clear.
A green *audit* job is not proof that browser synthesis works.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys

MANDATORY_SITE = (
    "index.html", "app.js", "bridge-worker.js", "coi-serviceworker.js", "styles.css"
)
EXPECTED_RUNTIME = ("dectalk.js", "dectalk.wasm")


def audit(site: Path) -> dict:
    if not site.is_dir():
        raise ValueError("site source directory missing")
    files = {p.name for p in site.iterdir() if p.is_file()}
    missing_source = sorted(set(MANDATORY_SITE) - files)
    if missing_source:
        raise ValueError("required static site source missing: " + ", ".join(missing_source))
    # Validate source packaging contract; the deployed gh-pages branch carries
    # the worker under /dectalk/ while source has it in site/ root.
    app = (site / "app.js").read_text(encoding="utf-8")
    if './dectalk/bridge-worker.js' not in app:
        raise ValueError("app source no longer references expected deployed worker path")
    worker = (site / "bridge-worker.js").read_text(encoding="utf-8")
    if not re.search(r'import\s*\(\s*["\']\./dectalk\.js["\']\s*\)', worker):
        raise ValueError("unexpected DECtalk WASM entrypoint: update audit before changing contract")
    missing_runtime = sorted(set(EXPECTED_RUNTIME) - files)
    sizes = {
        name: (site / name).stat().st_size if name in files else 0
        for name in EXPECTED_RUNTIME
    }
    bad_runtime = sorted(name for name, size in sizes.items() if size <= 0)
    # Publishing is blocked regardless of file presence until upstream rights
    # are explicitly reconciled; do not parse package metadata as proof.
    return {
        "schema_version": 1,
        "audit_kind": "SOURCE_PREREQUISITE_SCAN_NOT_BROWSER_TEST",
        "runtime_integrity": (
            "MISSING_OR_EMPTY" if bad_runtime else "FILES_PRESENT_ONLY"
        ),
        "missing_required_runtime": bad_runtime,
        "asset_bytes": sizes,
        "source_tree_scope": "main/site only; published gh-pages bundle is separate",
        "published_gh_pages_bundle": "NOT_CHECKED_BY_THIS_SCRIPT",
        "license_provenance": "HUMAN_REVIEW_REQUIRED",
        "publication_authorized": False,
        "functional_browser_synthesis": "NOT_VERIFIED",
        "limitations": (
            "This audit examines only main/site; published gh-pages has a separate "
            "dectalk/ directory containing the JavaScript and WASM binaries, "
            "confirmed by GitHub metadata but not verified in a live browser. "
            "Upstream package metadata says MIT while upstream LICENSE.md "
            "contains proprietary FONIX restrictions. No further asset "
            "redistribution is authorized by this audit."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", type=Path, default=Path("site"))
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    obj = audit(args.site)
    out = json.dumps(obj, indent=2, sort_keys=True)
    print(out)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(out + "\n", encoding="utf-8")
    if obj["runtime_integrity"] == "MISSING_OR_EMPTY":
        print("SOURCE-ONLY AUDIT: bundled runtime absent from main/site; separate gh-pages bundle exists; browser not tested",
              file=sys.stderr)
    return 0  # audit ran; readiness is *not* a pass


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError) as exc:
        print("SITE SOURCE AUDIT FAILED: " + str(exc), file=sys.stderr)
        sys.exit(1)
