// Which markdown files count as "a doc to review", and where they live.
// Resolution order: built-in defaults -> project .markdown-preview.json (replaces) ->
// MARKDOWN_PREVIEW_WATCH env (extends). Dirs are scanned recursively for the newest *.md.

import { join, resolve, isAbsolute, relative, sep } from "node:path";
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";

export const DEFAULT_DIRS = [
  "docs/superpowers/specs",
  "docs/superpowers/plans",
  "docs/adr",
];

function readConfig(root) {
  const p = join(root, ".markdown-preview.json");
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(j?.watch) ? j.watch : null;
  } catch { return null; }
}

function envDirs() {
  const raw = process.env.MARKDOWN_PREVIEW_WATCH;
  return raw ? raw.split(",").map(s => s.trim()).filter(Boolean) : [];
}

// Absolute, deduped list of watch dirs for `root`.
export function resolveWatchDirs(root) {
  const base = readConfig(root) ?? DEFAULT_DIRS;
  const all = [...base, ...envDirs()];
  const abs = all.map(d => (isAbsolute(d) ? d : resolve(root, d)));
  return [...new Set(abs)];
}

function* walkMd(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    // Symlinked dirs are intentionally not followed: isDirectory() is false for
    // symlinks (they report as isSymbolicLink()), avoiding loops and out-of-tree escapes.
    if (e.isDirectory()) yield* walkMd(full);
    else if (e.name.toLowerCase().endsWith(".md")) yield full;
  }
}

// Newest *.md across the watch dirs, or null. Returns { path, mtime }.
export function newestWatched(root) {
  let best = null;
  for (const dir of resolveWatchDirs(root)) {
    for (const path of walkMd(dir)) {
      let mtime;
      try { mtime = statSync(path).mtimeMs; } catch { continue; }
      if (!best || mtime > best.mtime) best = { path, mtime };
    }
  }
  return best;
}

// All watched *.md as { path, rel, mtime }, newest first (for the sidebar tree).
export function listWatched(root) {
  const out = [];
  for (const dir of resolveWatchDirs(root)) {
    for (const path of walkMd(dir)) {
      try { out.push({ path, rel: relative(root, path).split(sep).join("/"), mtime: statSync(path).mtimeMs }); }
      catch { /* skip */ }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

// Directory names never descended into by the all-scope scan, at any depth. Dot-folders
// (.git, .claude, .vscode, …) are all skipped by the walk itself.
export const IGNORED_DIRS = [
  "node_modules", "dist", "build", "out", "coverage", "vendor", "target", "venv", "__pycache__",
];

function* walkMdIgnoring(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (!e.name.startsWith(".") && !IGNORED_DIRS.includes(e.name)) yield* walkMdIgnoring(full);
    } else if (e.name.toLowerCase().endsWith(".md")) yield full;
  }
}

// Every *.md under the project root (browse-all scope), skipping IGNORED_DIRS.
// Same shape and order as listWatched.
export function listAll(root) {
  const out = [];
  for (const path of walkMdIgnoring(resolve(root))) {
    try { out.push({ path, rel: relative(root, path).split(sep).join("/"), mtime: statSync(path).mtimeMs }); }
    catch { /* skip */ }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
