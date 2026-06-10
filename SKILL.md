---
name: markdown-preview
description: Render a Markdown spec, plan, or review into a styled HTML page (GitHub dark theme + rendered Mermaid diagrams) and open it in the default browser for visual review. Fully offline — uses vendored marked + mermaid, no network. Use after writing or revising a superpowers spec/plan/review markdown, or when the user asks to preview a markdown file, open it in the browser, or "see the plan visually". A Stop hook can auto-open the file that was just edited before a review hand-off.
---

# Markdown Preview

Render Markdown to a browser page with real Mermaid diagrams, fully offline.

## On demand
```
node <skill-dir>/scripts/preview.mjs <file.md>
```
With no argument, it renders the newest markdown under `docs/superpowers/specs` or
`docs/superpowers/plans` in the current project.

## Automatic (Stop hook)
`scripts/auto-preview.mjs` is built to run from a `Stop` hook. On each turn end it opens a
watched superpowers spec/plan **only if it changed since it was last opened** — i.e. when it
was the file just edited before handing it to the user for review — and is a silent no-op
otherwise. Enable it by adding to `~/.claude/settings.json`:
```jsonc
{ "hooks": { "Stop": [ { "hooks": [
  { "type": "command",
    "command": "node \"<skill-dir>/scripts/auto-preview.mjs\"" } ] } ] } }
```

## Authoring tip
Write architecture/flow diagrams as ` ```mermaid ` fenced blocks so they render as real
diagrams instead of ASCII art.

## What counts as a spec/plan
Scoped to the superpowers workflow for now (`scripts/watched.mjs`): `docs/superpowers/specs`
and `docs/superpowers/plans`. Widen the `WATCHED_DIRS` list to cover more later.

## Offline assets
`assets/` holds vendored `marked.min.js`, `mermaid.min.js`, and `github-markdown-dark.css`,
inlined into the generated HTML — no network needed.
