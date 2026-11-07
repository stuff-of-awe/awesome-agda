# SPDX-License-Identifier: MPL-2.0
"""Configuration checks for the secret scanner caller (requires PyYAML)."""

import unittest
from pathlib import Path

import yaml


WORKFLOW = Path(__file__).resolve().parents[1] / ".github/workflows/secret-scanner.yml"
SCANNER = (
    "hyperpolymath/standards/.github/workflows/secret-scanner-reusable.yml"
    "@571cc734cd69fb846032ec77a662aa8ee4fc32cd"
)


class SecretScannerWorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # BaseLoader keeps the GitHub Actions key "on" as a string.
        cls.workflow = yaml.load(WORKFLOW.read_text(encoding="utf-8"), Loader=yaml.BaseLoader)
        cls.scan = cls.workflow["jobs"]["scan"]

    def test_calls_the_reviewed_reusable_scanner(self):
        self.assertEqual(self.scan["uses"], SCANNER)

    def test_caller_does_not_forward_secrets(self):
        # This also rejects a named secret mapping, not just "inherit".
        self.assertNotIn("secrets", self.scan)

    def test_caller_grants_only_the_scanner_permission(self):
        # A job-level permission block replaces the workflow-level block.
        permissions = self.scan.get("permissions", self.workflow.get("permissions"))
        self.assertEqual(permissions, {"contents": "read"})

    def test_scanner_still_runs_on_pull_requests_and_main_pushes(self):
        triggers = self.workflow["on"]
        self.assertIn("pull_request", triggers)
        self.assertEqual(set(triggers["push"]["branches"]), {"main", "master"})


if __name__ == "__main__":
    unittest.main()
