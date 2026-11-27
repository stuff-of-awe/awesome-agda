// SPDX-License-Identifier: MPL-2.0

import { expect, test } from "bun:test";

const config = Bun.TOML.parse(await Bun.file(new URL("../mise.toml", import.meta.url)).text());

// Tool names from the policy behind PR #15, including previously removed tools.
const bannedTools = new Set([
    "node", "python", "go", "java", "npm", "yarn", "pip", "make", "gofmt",
    "black", "isort", "ruff", "pytest", "jest", "vitest", "prettier", "eslint",
]);

test("mise does not provision tools removed by the toolchain policy", () => {
    const toolNames = Object.keys(config.tools);
    const bannedDeclarations = toolNames.filter((name) => bannedTools.has(name.split(":").at(-1)));

    expect(bannedDeclarations).toEqual([]);
});

test("mise still declares the tools retained by the cleanup", () => {
    const toolNames = Object.keys(config.tools);

    expect(toolNames).toEqual(expect.arrayContaining([
        "rust", "zig", "bun", "deno", "pnpm", "just", "shfmt", "stylua", "cmake", "ninja",
    ]));
});

test("mise does not set Node or Python environment defaults", () => {
    const envSections = Array.isArray(config.env) ? config.env : [config.env ?? {}];
    const removedVariables = envSections.flatMap(Object.keys).filter(
        (name) => name === "NODE_ENV" || name.startsWith("PYTHON"),
    );

    expect(removedVariables).toEqual([]);
});

test("legacy build, test, lint, and format examples stay inactive", () => {
    const legacyNames = ["build", "test", "lint", "fmt"];
    const activeNames = [config.alias, config.tool_alias, config.tasks]
        .flatMap((section) => Object.keys(section ?? {}));

    expect(activeNames.filter((name) => legacyNames.includes(name))).toEqual([]);
});
