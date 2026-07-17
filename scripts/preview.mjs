#!/usr/bin/env node
// On-demand previewer. Ensures the offline preview server is running, then opens the tab —
// optionally pinned to a specific file:
//   node scripts/preview.mjs path/to/doc.md   # open pinned to that file
//   node scripts/preview.mjs                    # open on the newest watched doc

import { readFileSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { openInBrowser } from "./render.mjs";
import { MARKER, PORTS } from "./preview-server.mjs";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_SCRIPT = join(SKILL_DIR, "scripts", "preview-server.mjs");

const arg = process.argv[2];
const root = process.cwd();

function readPort() {
  try { return JSON.parse(readFileSync(MARKER, "utf8")).port; } catch { return PORTS[0]; }
}
async function up(port) {
  try { return (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) })).ok; }
  catch { return false; }
}

let port = readPort();
if (!(await up(port))) {
  spawn(process.execPath, [SERVER_SCRIPT, root], { stdio: "ignore", detached: true }).unref();
  await new Promise(r => setTimeout(r, 400)); // let it bind + write its marker
  port = readPort();
}

let url = `http://localhost:${port}`;
if (arg) url += `/?file=${encodeURIComponent(relative(root, resolve(arg)).split(sep).join("/"))}`;
openInBrowser(url);
console.log(`Opening ${url}`);
