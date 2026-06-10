#!/usr/bin/env node
// On-demand previewer. Render a specific markdown file, or the newest superpowers
// spec/plan in the current project, and open it in the browser.
//
//   node scripts/preview.mjs <file.md>
//   node scripts/preview.mjs            # newest docs/superpowers/{specs,plans}/*.md

import { resolve } from "node:path";
import { newestWatched } from "./watched.mjs";
import { renderAndOpen } from "./render.mjs";

const arg = process.argv[2];
const file = arg ? resolve(arg) : newestWatched(process.cwd())?.path;

if (!file) {
  console.error("No file given and no superpowers spec/plan found under the current project.");
  process.exit(1);
}

const out = renderAndOpen(file);
console.log(`Rendered ${file}\n   -> ${out} (opening in browser)`);
