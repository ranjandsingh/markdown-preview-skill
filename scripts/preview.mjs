#!/usr/bin/env node
// On-demand previewer. Ensures the offline preview server for THIS project is running (each
// project root gets its own server/port), then opens the tab — optionally pinned to a file:
//   node scripts/preview.mjs path/to/doc.md   # open pinned to that file
//   node scripts/preview.mjs                    # open on the newest watched doc

import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { openInBrowser } from "./render.mjs";
import { findServer } from "./preview-server.mjs";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_SCRIPT = join(SKILL_DIR, "scripts", "preview-server.mjs");

const arg = process.argv[2];
const root = process.cwd();

let found = await findServer(root);
if (!found) {
  spawn(process.execPath, [SERVER_SCRIPT, root], { stdio: "ignore", detached: true }).unref();
  for (let i = 0; i < 8 && !found; i++) {          // let it pick a port and bind
    await new Promise(r => setTimeout(r, 300));
    found = await findServer(root);
  }
}
if (!found) {
  console.error("Could not start a preview server for " + root);
  process.exit(1);
}

let url = `http://localhost:${found.port}`;
if (arg) url += `/?file=${encodeURIComponent(relative(root, resolve(arg)).split(sep).join("/"))}`;
openInBrowser(url);
console.log(`Opening ${url}`);
