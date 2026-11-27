// SPDX-License-Identifier: MPL-2.0
// Run with: bun test tests/secret-scanner-workflow.test.js

import { expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const reviewedScanner =
  "hyperpolymath/standards/.github/workflows/secret-scanner-reusable.yml" +
  "@571cc734cd69fb846032ec77a662aa8ee4fc32cd";

const checks = {
  pin: "calls the reviewed reusable scanner",
  secrets: "caller does not forward secrets",
  permissions: "caller grants only the scanner permission",
  triggers: "scanner still runs on pull requests and main pushes",
};

function workflow({
  scanner = reviewedScanner,
  permissions = "  contents: read",
  jobFields = "",
  pullRequest = "  pull_request:",
  branches = "[main, master]",
} = {}) {
  return `name: Secret Scanner
on:
${pullRequest}
  push:
    branches: ${branches}
permissions:
${permissions}
jobs:
  scan:
    uses: ${scanner}
${jobFields}
`;
}

// The command loads YAML relative to the script and exits the process. Give
// each invocation its own directory tree so it never reads or edits the real workflow.
function runChecker(yaml) {
  const root = mkdtempSync(join(tmpdir(), "secret-scanner-test-"));
  try {
    const scripts = join(root, "tests");
    const workflows = join(root, ".github", "workflows");
    const script = join(scripts, "secret-scanner-workflow.js");
    mkdirSync(scripts);
    mkdirSync(workflows, { recursive: true });
    copyFileSync(join(import.meta.dir, "secret-scanner-workflow.js"), script);
    if (yaml !== undefined) {
      writeFileSync(join(workflows, "secret-scanner.yml"), yaml);
    }

    const result = Bun.spawnSync([process.execPath, script], {
      cwd: scripts,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5_000,
    });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function expectChecks({ exitCode, stdout, stderr }, failed = []) {
  expect(stderr).toBe("");
  expect(exitCode).toBe(failed.length ? 1 : 0);
  const lines = stdout.split("\n");
  for (const check of Object.values(checks)) {
    expect(lines).toContain(`${failed.includes(check) ? "FAIL  " : "ok    "}${check}`);
  }
  expect(lines).toContain(
    failed.length ? `Ran 4 checks: FAILED (failures=${failed.length})` : "Ran 4 checks: OK",
  );
}

test("passes with the reviewed scanner, inherited read permission, and an empty pull_request key", () => {
  expectChecks(runChecker(workflow()));
});

test("treats push branches as an unordered set", () => {
  expectChecks(runChecker(workflow({ branches: "['master', main, main]" })));
});

test("uses job permissions in place of broader workflow permissions", () => {
  expectChecks(runChecker(workflow({
    permissions: "  contents: write\n  issues: write",
    jobFields: "    permissions:\n      contents: read",
  })));
});

test.each([
  ["a mutable scanner ref", { scanner: reviewedScanner.replace(/@.*/, "@main") }, checks.pin],
  ["inherited secrets", { jobFields: "    secrets: inherit" }, checks.secrets],
  ["named secret forwarding", { jobFields: "    secrets:\n      token: placeholder" }, checks.secrets],
  ["an empty secrets key", { jobFields: "    secrets:" }, checks.secrets],
  ["an additional permission", { permissions: "  contents: read\n  issues: read" }, checks.permissions],
  ["a job permission override", { jobFields: "    permissions:\n      contents: write" }, checks.permissions],
  ["an empty job permission override", { jobFields: "    permissions: {}" }, checks.permissions],
  ["a missing pull request trigger", { pullRequest: "  workflow_dispatch:" }, checks.triggers],
  ["a missing push branch", { branches: "[main]" }, checks.triggers],
  ["an extra push branch", { branches: "[main, master, release]" }, checks.triggers],
  ["a scalar push branch list", { branches: "main" }, checks.triggers],
])("rejects %s without failing unrelated checks", (_name, overrides, failed) => {
  expectChecks(runChecker(workflow(overrides)), [failed]);
});

test("reports a typed YAML scalar as text in the permission diagnostic", () => {
  const result = runChecker(workflow({ permissions: "  contents: true" }));
  expectChecks(result, [checks.permissions]);
  expect(result.stdout).toContain('{"contents":"true"}');
});

test("continues after failures and reports their total", () => {
  expectChecks(runChecker(workflow({
    scanner: reviewedScanner.replace(/@.*/, "@main"),
    jobFields: "    secrets: inherit",
  })), [checks.pin, checks.secrets]);
});

test.each([
  ["missing", undefined],
  ["malformed", "on: [\n"],
])("reports a load error for a %s workflow without running checks", (_name, yaml) => {
  const result = runChecker(yaml);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toMatch(/ERROR: cannot load .*secret-scanner\.yml:/);
  expect(result.stdout).toBe("");
});
