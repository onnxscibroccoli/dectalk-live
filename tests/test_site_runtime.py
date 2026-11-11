"""Check source integrity without downloading potentially restricted binaries."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from check_site_runtime import audit

SITE = {
    "index.html": "<html lang='en'><main></main></html>",
    "app.js": "console.log('init')",
    "bridge-worker.js": "const { default: initializer } = await import('./dectalk.js');",
    "coi-serviceworker.js": "self.addEventListener('fetch', ()=>{});",
    "styles.css": "body {}",
}


class SiteRuntimeAuditTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        for name, contents in SITE.items():
            (self.root / name).write_text(contents)

    def test_absent_wasm_is_reported_as_blocker_not_speech_success(self):
        x = audit(self.root)
        self.assertEqual(x["runtime_integrity"], "MISSING_OR_EMPTY")
        self.assertEqual(x["missing_required_runtime"], ["dectalk.js", "dectalk.wasm"])
        self.assertEqual(x["functional_browser_synthesis"], "NOT_VERIFIED")
        self.assertFalse(x["publication_authorized"])

    def test_even_with_binary_mock_license_remains_review_required(self):
        (self.root / "dectalk.js").write_text("export default function(){}")
        (self.root / "dectalk.wasm").write_bytes(b"\\0asm")
        x = audit(self.root)
        self.assertEqual(x["runtime_integrity"], "FILES_PRESENT_ONLY")
        self.assertEqual(x["license_provenance"], "HUMAN_REVIEW_REQUIRED")
        self.assertFalse(x["publication_authorized"])

    def test_empty_binary_does_not_count_as_runtime(self):
        (self.root / "dectalk.js").write_text("mock")
        (self.root / "dectalk.wasm").write_bytes(b"")
        self.assertEqual(audit(self.root)["missing_required_runtime"], ["dectalk.wasm"])

    def test_missing_core_source_is_error(self):
        (self.root / "bridge-worker.js").unlink()
        with self.assertRaisesRegex(ValueError, "required static site"):
            audit(self.root)

    def test_changed_worker_import_is_error_until_contract_review(self):
        (self.root / "bridge-worker.js").write_text("await import('./new-engine.js')")
        with self.assertRaisesRegex(ValueError, "unexpected DECtalk"):
            audit(self.root)


if __name__ == "__main__":
    unittest.main()
