import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { install, uninstall } from "../scripts/install.mjs";

function tmpClaudeDir() { return mkdtempSync(join(tmpdir(), "mpi-")); }

function settings(dir) { return JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")); }

test("install copies the skill and registers the Stop hook", () => {
  const dir = tmpClaudeDir();
  const { dest, hooked } = install(dir);
  assert.equal(hooked, true);
  assert.ok(existsSync(join(dest, "SKILL.md")));
  assert.ok(existsSync(join(dest, "scripts", "auto-preview.mjs")));
  assert.ok(existsSync(join(dest, "assets", "marked.min.js")));
  const s = settings(dir);
  assert.ok(s.hooks.Stop.some(g => g.hooks.some(h => h.command.includes("auto-preview.mjs"))));
});

test("install is idempotent — no duplicate hook on re-run", () => {
  const dir = tmpClaudeDir();
  install(dir);
  const { hooked } = install(dir);
  assert.equal(hooked, false);
  assert.equal(settings(dir).hooks.Stop.length, 1);
});

test("install preserves existing settings keys and other hooks", () => {
  const dir = tmpClaudeDir();
  writeFileSync(join(dir, "settings.json"), JSON.stringify({
    model: "opus",
    hooks: { Stop: [{ hooks: [{ type: "command", command: "echo other" }] }] },
  }));
  install(dir);
  const s = settings(dir);
  assert.equal(s.model, "opus");
  assert.equal(s.hooks.Stop.length, 2);
});

test("uninstall removes the skill dir and only our hook", () => {
  const dir = tmpClaudeDir();
  writeFileSync(join(dir, "settings.json"), JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: "command", command: "echo other" }] }] },
  }));
  const { dest } = install(dir);
  const { unhooked } = uninstall(dir);
  assert.equal(unhooked, true);
  assert.equal(existsSync(dest), false);
  const s = settings(dir);
  assert.equal(s.hooks.Stop.length, 1);
  assert.equal(s.hooks.Stop[0].hooks[0].command, "echo other");
});

test("install refuses to clobber an unparseable settings.json", () => {
  const dir = tmpClaudeDir();
  writeFileSync(join(dir, "settings.json"), "{ not json");
  assert.throws(() => install(dir), /Cannot parse/);
  assert.equal(readFileSync(join(dir, "settings.json"), "utf8"), "{ not json");
});
