---
name: markdown-preview
description: Render Markdown (specs, plans, ADRs, reviews) into a styled GitHub-dark HTML page with live-rendered Mermaid diagrams, served by a tiny offline localhost server so a single browser tab updates in place as the docs change. A sidebar file tree lets you browse and navigate every markdown doc in the project (watched folders or all files). Fully offline — vendored marked + mermaid, no network. Use after writing or revising a markdown spec/plan/review, or when the user asks to preview a markdown file, browse the project's markdown docs in the browser, or "see the plan visually". A Stop hook can keep the current doc live in the browser before a review hand-off.
---

# Markdown Preview

Render Markdown to a live browser page with real Mermaid diagrams, fully offline. One
persistent tab at `http://localhost:7437` follows the **newest watched doc** and updates
**in place** over SSE — no new tabs, no flicker, scroll preserved. The server binds to
`127.0.0.1` only and self-shuts-down ~60s after the tab closes.

## Sidebar file tree
A collapsible sidebar (☰ to toggle) shows a folder tree of the project's markdown. Click a
file to pin it; click **⚡ Auto — follow newest** to resume following the latest edit. The
footer switches scope: **Watched** (configured folders) or **All files** (every `.md` in the
project, skipping `node_modules`, `.git`, build dirs). Pinned docs live-reload too; in
All-files scope the server watches the whole project root while such a tab is connected
(macOS/Windows; Linux live-reload covers watched dirs only). Sidebar visibility, folder
open state, and scope persist per browser.

## On demand
```
node <skill-dir>/scripts/preview.mjs <file.md>   # ensure server, open tab pinned to a file
node <skill-dir>/scripts/preview.mjs              # open on the newest watched doc
```

## Automatic (Stop hook)
`scripts/auto-preview.mjs` runs from a `Stop` hook. It acts only when a watched doc was
**actually edited** since it last acted (freshness gate): then it ensures the preview server
is running and one browser tab is open. Turns that touch no watched doc do nothing, and a
deliberately closed tab stays closed until a doc changes again. If a tab is already
connected, the server's file watcher already pushed the update over SSE. Enable it in
`~/.claude/settings.json`:
```jsonc
{ "hooks": { "Stop": [ { "hooks": [
  { "type": "command",
    "command": "node \"<skill-dir>/scripts/auto-preview.mjs\"" } ] } ] } }
```

## Configuring watched folders
By default the server watches `docs/superpowers/specs`, `docs/superpowers/plans`, and
`docs/adr`. Override per project with `.markdown-preview.json` at the project root:
```json
{ "watch": ["docs/superpowers/specs", "docs/superpowers/plans", "docs/adr", "docs/design"] }
```
The `watch` list **replaces** the defaults. `MARKDOWN_PREVIEW_WATCH` (comma-separated)
**extends** it for ad-hoc use. Paths are relative to the project root and scanned recursively.

> Linux note: recursive `fs.watch` isn't supported for nested dirs on Linux; the server falls
> back to a 1s mtime poll there. macOS and Windows watch recursively natively.

## Authoring tip
Write architecture/flow diagrams as ` ```mermaid ` fenced blocks so they render as real
diagrams instead of ASCII art.

## Offline assets
`assets/` holds vendored `marked.min.js`, `mermaid.min.js`, and `github-markdown-dark.css`,
inlined into the served shell page — no network needed.
