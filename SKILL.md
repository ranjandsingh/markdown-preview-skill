---
name: markdown-preview
description: Render Markdown (specs, plans, ADRs, reviews) into a styled GitHub-dark HTML page with live-rendered Mermaid diagrams, served by a tiny offline localhost server so a single browser tab updates in place as the docs change. A sidebar file tree lets you browse and navigate every markdown doc in the project (watched folders or all files), and full-text search finds words across all markdown with highlighted, jump-to-match results. Fully offline — vendored marked + mermaid, no network. Use after writing or revising a markdown spec/plan/review, or when the user asks to preview a markdown file, browse or search the project's markdown docs in the browser, or "see the plan visually". A Stop hook can keep the current doc live in the browser before a review hand-off.
---

# Markdown Preview

Render Markdown to a live browser page with real Mermaid diagrams, fully offline. One
persistent tab **per project** follows the **newest watched doc** and updates **in place**
over SSE — no new tabs, no flicker, scroll preserved. Each project root gets its own server
(ports `7437`–`7444`; discovery matches the server to the project, so concurrent sessions in
different projects never see each other's content). Servers bind to `127.0.0.1` only and
self-shut-down ~60s after their tab closes.

## Search
Press `/` (or click the sidebar box) and type — results replace the tree as you type:
case-insensitive, all words must match (content or path), filename hits first, snippet
lines with highlights. Search always covers **every** markdown file in the project,
regardless of the Watched/All-files toggle. Clicking a result opens the doc with every
match highlighted and scrolls to the clicked occurrence; `Esc` clears back to the tree.

## Navigation
Links inside rendered markdown work like GitHub: `#anchor` links scroll to headings,
relative links to other `.md` files open in the same tab (cross-doc anchors like
`other.md#section` land on the heading), and external links open a new tab. Plain
**mentions** of markdown files — a path in inline code or bare text like
`docs/plans/foo.md` — also become clickable when the file exists. The URL always reflects
the current doc (`?file=…`), so previews are shareable and back/forward navigate your
reading history.

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
**actually edited** since it last acted (freshness gate): then it ensures **this project's**
preview server is running and one browser tab is open. Turns that touch no watched doc do nothing, and a
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
