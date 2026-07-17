#!/usr/bin/env node
// npx installer. Copies the skill into <claude-dir>/skills/markdown-preview and registers
// the Stop hook in <claude-dir>/settings.json, so `npx github:ranjandsingh/markdown-preview-skill`
// is a one-shot manual install. Idempotent; `--uninstall` reverses both.
//
//   npx github:ranjandsingh/markdown-preview-skill
//   npx github:ranjandsingh/markdown-preview-skill --uninstall

import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK_MARKER = "skills/markdown-preview/scripts/auto-preview.mjs";

const toPosix = (p) => p.split("\\").join("/");

function skillDir(claudeDir) {
  return join(claudeDir, "skills", "markdown-preview");
}

function hookCommand(claudeDir) {
  return `node "${toPosix(join(skillDir(claudeDir), "scripts", "auto-preview.mjs"))}"`;
}

function isOurHook(h) {
  return h?.type === "command" && typeof h.command === "string" && toPosix(h.command).includes(HOOK_MARKER);
}

// Read settings.json. Missing file => {}. Unparseable file => null (caller must abort
// rather than clobber whatever the user has there).
function readSettings(claudeDir) {
  const p = join(claudeDir, "settings.json");
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

function writeSettings(claudeDir, settings) {
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(settings, null, 2) + "\n");
}

// Add our Stop hook if no matcher group already carries it.
function addHook(settings, claudeDir) {
  const stop = ((settings.hooks ??= {}).Stop ??= []);
  if (stop.some(g => (g.hooks ?? []).some(isOurHook))) return false;
  stop.push({ hooks: [{ type: "command", command: hookCommand(claudeDir) }] });
  return true;
}

// Drop our hook; prune matcher groups, Stop, and hooks when they become empty.
function removeHook(settings) {
  const stop = settings.hooks?.Stop;
  if (!Array.isArray(stop)) return false;
  let removed = false;
  for (const g of stop) {
    const before = g.hooks?.length ?? 0;
    g.hooks = (g.hooks ?? []).filter(h => !isOurHook(h));
    if (g.hooks.length !== before) removed = true;
  }
  settings.hooks.Stop = stop.filter(g => g.hooks.length > 0);
  if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop;
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return removed;
}

export function install(claudeDir) {
  const settings = readSettings(claudeDir);
  if (settings === null) throw new Error(`Cannot parse ${join(claudeDir, "settings.json")} — fix it and re-run.`);

  const dest = skillDir(claudeDir);
  mkdirSync(dest, { recursive: true });
  for (const entry of ["SKILL.md", "scripts", "assets", ".markdown-preview.json"]) {
    cpSync(join(PKG_ROOT, entry), join(dest, entry), { recursive: true, force: true });
  }
  const hooked = addHook(settings, claudeDir);
  writeSettings(claudeDir, settings);
  return { dest, hooked };
}

export function uninstall(claudeDir) {
  const settings = readSettings(claudeDir);
  if (settings === null) throw new Error(`Cannot parse ${join(claudeDir, "settings.json")} — fix it and re-run.`);

  const dest = skillDir(claudeDir);
  rmSync(dest, { recursive: true, force: true });
  const unhooked = removeHook(settings);
  writeSettings(claudeDir, settings);
  return { dest, unhooked };
}

// Ran as a CLI (directly or via the npx bin shim)? npx executes the script through a
// symlinked node_modules, so realpath both sides before comparing; fall back to matching
// the invoked basename against the script / bin name.
function isMain() {
  if (!process.argv[1]) return false;
  const norm = (p) => { try { p = realpathSync(p); } catch { /* keep as-is */ } return process.platform === "win32" ? p.toLowerCase() : p; };
  const self = fileURLToPath(import.meta.url);
  if (norm(resolve(process.argv[1])) === norm(self)) return true;
  return ["install.mjs", "markdown-preview-skill"].includes(basename(process.argv[1]));
}

if (isMain()) {
  const claudeDir = process.env.CLAUDE_DIR || join(homedir(), ".claude");
  try {
    if (process.argv.includes("--uninstall")) {
      const { dest } = uninstall(claudeDir);
      console.log(`Removed ${dest} and its Stop hook from settings.json.`);
    } else {
      const { dest, hooked } = install(claudeDir);
      console.log(`Installed skill to ${dest}`);
      console.log(hooked ? "Registered the Stop hook in settings.json." : "Stop hook already registered — left as is.");
      console.log("Restart Claude Code to pick it up.");
    }
  } catch (e) {
    console.error(String(e.message ?? e));
    process.exit(1);
  }
}
