#!/usr/bin/env node
// Stop-hook entrypoint. Intended to run when Claude finishes a turn (about to hand back
// to the user). It opens the newest watched superpowers spec/plan in the browser ONLY IF
// that file changed since it was last opened — i.e. it was the file just edited before the
// review hand-off. Silent no-op otherwise. Never blocks; always exits 0.

import { join, dirname, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { newestWatched } from "./watched.mjs";
import { renderAndOpen } from "./render.mjs";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MARKER = join(SKILL_DIR, ".last-open.json");

// Stop hooks receive a JSON payload on stdin that includes the project `cwd`.
function projectCwd() {
  try {
    if (process.stdin.isTTY) return process.cwd();
    const raw = readFileSync(0, "utf8");
    if (raw && raw.trim()) {
      const j = JSON.parse(raw);
      if (j && typeof j.cwd === "string") return j.cwd;
    }
  } catch { /* ignore */ }
  return process.cwd();
}

const loadMarker = () => { try { return JSON.parse(readFileSync(MARKER, "utf8")); } catch { return {}; } };
const saveMarker = (o) => { try { writeFileSync(MARKER, JSON.stringify(o)); } catch { /* ignore */ } };

try {
  const best = newestWatched(projectCwd());
  if (!best) process.exit(0);

  const marker = loadMarker();
  if (marker[best.path] && marker[best.path] >= best.mtime) process.exit(0); // unchanged → skip

  marker[best.path] = best.mtime;
  saveMarker(marker);
  renderAndOpen(best.path);
} catch { /* never let a preview failure disrupt the session */ }
process.exit(0);
