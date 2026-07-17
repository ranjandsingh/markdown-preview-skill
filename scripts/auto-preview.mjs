#!/usr/bin/env node
// Stop-hook entrypoint. Guarantees that an offline preview server and exactly one browser
// tab exist. It never renders or re-opens redundantly: if a tab is already connected, the
// server's watcher pushes updates over SSE, so this hook does nothing. Always exits 0.

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { openInBrowser } from "./render.mjs";
import { MARKER, PORTS } from "./preview-server.mjs";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_SCRIPT = join(SKILL_DIR, "scripts", "preview-server.mjs");

// Pure decision: given a /health response (or null if unreachable), what should we do?
//   no server  -> spawn it and open a tab
//   server, 0 connected tabs -> open a tab (the previous one was closed)
//   server, >=1 connected tab -> nothing (SSE already pushes updates to it)
export function decide(health) {
  if (!health) return { spawn: true, open: true };
  return { spawn: false, open: health.clients === 0 };
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
  const port = readPort();
  const action = decide(await health(port));

  if (action.spawn) {
    spawn(process.execPath, [SERVER_SCRIPT, root], { stdio: "ignore", detached: true }).unref();
    await new Promise(r => setTimeout(r, 400)); // let it bind + write its marker
  }
  // After a fresh spawn the server has written the marker with its actual chosen port.
  if (action.open) openInBrowser(`http://localhost:${action.spawn ? readPort() : port}`);
}

// Only run when invoked directly (so importing `decide` in tests has no side effects).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(() => {}).finally(() => process.exit(0));
}
