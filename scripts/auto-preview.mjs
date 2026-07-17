#!/usr/bin/env node
// Stop-hook entrypoint. When a watched doc was actually edited since the last time this
// hook acted (the freshness gate), it guarantees that an offline preview server and one
// browser tab exist. Turns that touch no watched doc do nothing — and a deliberately
// closed tab stays closed until a doc changes again. If a tab is already connected, the
// server's watcher pushes updates over SSE, so no reopening is ever needed. Always exits 0.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { openInBrowser } from "./render.mjs";
import { MARKER, PORTS } from "./preview-server.mjs";
import { newestWatched } from "./watched.mjs";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_SCRIPT = join(SKILL_DIR, "scripts", "preview-server.mjs");
const SEEN_FILE = join(SKILL_DIR, ".last-open.json");

// Pure decision: given a /health response (or null if unreachable), what should we do?
//   no server  -> spawn it and open a tab
//   server, 0 connected tabs -> open a tab (the previous one was closed)
//   server, >=1 connected tab -> nothing (SSE already pushes updates to it)
export function decide(health) {
  if (!health) return { spawn: true, open: true };
  return { spawn: false, open: health.clients === 0 };
}

// Pure freshness gate: act only when the newest watched doc is newer than what this hook
// has already acted on. `seen` maps absolute path -> last acted-on mtimeMs.
export function isFresh(seen, newest) {
  if (!newest) return false;
  const last = seen[newest.path];
  return last === undefined || newest.mtime > last;
}

function readSeen() {
  try { return JSON.parse(readFileSync(SEEN_FILE, "utf8")) ?? {}; } catch { return {}; }
}

// Record the acted-on mtime; prune entries whose files no longer exist so the map
// doesn't grow forever across projects.
function writeSeen(seen, newest) {
  seen[newest.path] = newest.mtime;
  for (const p of Object.keys(seen)) if (!existsSync(p)) delete seen[p];
  try { writeFileSync(SEEN_FILE, JSON.stringify(seen)); } catch { /* best effort */ }
}

// Stop hooks receive a JSON payload on stdin that includes the project `cwd`.
function projectCwd() {
  try {
    if (process.stdin.isTTY) return process.cwd();
    const raw = readFileSync(0, "utf8");
    const j = raw && raw.trim() ? JSON.parse(raw) : null;
    if (j && typeof j.cwd === "string") return j.cwd;
  } catch { /* ignore */ }
  return process.cwd();
}

function readPort() {
  try { return JSON.parse(readFileSync(MARKER, "utf8")).port; } catch { return PORTS[0]; }
}

async function health(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function main() {
  const root = projectCwd();

  const newest = newestWatched(root);
  const seen = readSeen();
  if (!isFresh(seen, newest)) return; // nothing was edited: leave the user's tabs alone

  const port = readPort();
  const action = decide(await health(port));

  if (action.spawn) {
    spawn(process.execPath, [SERVER_SCRIPT, root], { stdio: "ignore", detached: true }).unref();
    await new Promise(r => setTimeout(r, 400)); // let it bind + write its marker
  }
  // After a fresh spawn the server has written the marker with its actual chosen port.
  if (action.open) openInBrowser(`http://localhost:${action.spawn ? readPort() : port}`);
  writeSeen(seen, newest); // recorded even when a connected tab handled it via SSE
}

// Only run when invoked directly (so importing `decide` in tests has no side effects).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => {}).finally(() => process.exit(0));
}
