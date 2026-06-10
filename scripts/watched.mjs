// Which markdown files count as "a spec/plan to review". Scoped to the superpowers
// workflow for now (specs from brainstorming, plans from writing-plans). Widen later.

import { join } from "node:path";
import { readdirSync, statSync, existsSync } from "node:fs";

export const WATCHED_DIRS = [
  "docs/superpowers/specs",
  "docs/superpowers/plans",
];

// Newest *.md across the watched dirs under `root`, or null. Returns { path, mtime }.
export function newestWatched(root) {
  let best = null;
  for (const rel of WATCHED_DIRS) {
    const dir = join(root, rel);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.toLowerCase().endsWith(".md")) continue;
      const path = join(dir, name);
      let mtime;
      try { mtime = statSync(path).mtimeMs; } catch { continue; }
      if (!best || mtime > best.mtime) best = { path, mtime };
    }
  }
  return best;
}
