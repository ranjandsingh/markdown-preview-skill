# markdown-preview-skill

**v0.8.0** · A Claude Code **skill** that renders your Markdown — specs, plans, ADRs, reviews —
into a styled HTML page (GitHub dark theme + real **Mermaid** diagrams) and keeps a **single
browser tab live** as the docs change. **Fully offline**: a tiny `127.0.0.1` server and vendored
`marked` + `mermaid`, no network.

> Replaces the v0.1.0 static-snapshot previewer. Instead of re-opening a new tab with a frozen
> render each time, one tab now **updates in place** and **follows the newest watched doc**.

## What it does

- **One persistent tab per project**, showing the document currently under review. Each
  project root gets its own server (ports `7437`–`7444`, matched by root), so concurrent
  sessions in different projects never see each other's content.
- **Follows the workflow** — the tab tracks the *most recently modified* watched Markdown
  (spec → plan → ADR), switching content in the same tab.
- **Sidebar file tree** — browse every markdown doc as a collapsible folder tree; click to pin
  a file, click **⚡ Auto** to follow the newest again. A footer toggle switches between the
  **Watched** folders and **All files** (every `.md` in the project, minus `node_modules`,
  `.git`, and build dirs). Sidebar visibility, folder state, and scope persist per browser.
- **Updates in place over SSE** — only when a file actually changes. No new tabs, no full-page
  reload, scroll position preserved, Mermaid re-rendered only on change. Pinned docs
  live-reload too; All-files scope live-reloads via a lazy whole-project watcher
  (macOS/Windows).
- **In-markdown navigation** — `#anchor` links scroll to headings (GitHub-style ids are
  generated), relative links to other `.md` files open in place (including `other.md#section`),
  and external links open a new tab so the live preview survives. Every doc gets a shareable
  `?file=` URL and the browser back/forward buttons walk your reading history.
- **Clickable file mentions** — a path like `docs/plans/foo.md` written as inline code or
  plain text becomes a link when that file actually exists (resolved from the project root
  or the current doc's folder). No markdown link syntax required.
- **Full-text search** — press `/` and type; all-words matching across every markdown file's
  content and path (always the whole project), filename hits ranked first, snippet previews
  with highlights. Click a result to open the doc with matches highlighted and the clicked
  occurrence scrolled into view; `Esc` returns to the tree.
- **Self-cleaning** — the server shuts itself down ~60s after you close the tab. ~40 MB while
  open, ~0% CPU idle.
- **Offline & safe** — bound to `127.0.0.1` only; the raw-markdown route serves only files
  inside your configured watch folders (or, in All-files scope, only `.md` files inside the
  project root — never `.env` or anything else).

## Install

### As a plugin (recommended)
Ships the Stop hook automatically — no `settings.json` editing.

1. `/plugin marketplace add ranjandsingh/markdown-preview-skill`
2. `/plugin install markdown-preview@ranjan-skills`
3. Restart Claude Code.

### Via the skills CLI ([skills.sh](https://skills.sh/))
Works for Claude Code, Cursor, Codex, and any agent the CLI supports:
```
npx skills add ranjandsingh/markdown-preview-skill
```
> Installs the **skill only** (on-demand previews). For the automatic Stop hook, use the
> plugin above or the installer below.

### Via npx (installer with Stop hook)
One shot, straight from GitHub — copies the skill into `~/.claude/skills/markdown-preview/`
and registers the Stop hook in `~/.claude/settings.json` (idempotent):
```
npx github:ranjandsingh/markdown-preview-skill
```
Uninstall (removes the skill dir and only its own hook):
```
npx github:ranjandsingh/markdown-preview-skill --uninstall
```

### Manual
Copy `SKILL.md`, `scripts/`, and `assets/` into `~/.claude/skills/markdown-preview/`, then add
the Stop hook to `~/.claude/settings.json`:
```jsonc
{ "hooks": { "Stop": [ { "hooks": [
  { "type": "command",
    "command": "node \"<skill-dir>/scripts/auto-preview.mjs\"" } ] } ] } }
```

## Use

**Automatic** — with the Stop hook installed, finishing a turn that **edited a watched doc**
ensures the server is running and one tab is open; subsequent edits update that tab live.
Turns that touch no watched doc never open anything, and a tab you closed stays closed until
a doc changes again (freshness gate).

**On-demand:**
```
node scripts/preview.mjs path/to/doc.md   # open the tab pinned to a specific file
node scripts/preview.mjs                    # open the tab on the newest watched doc
```

## Configuration

By default the server watches:
```
docs/superpowers/specs
docs/superpowers/plans
docs/adr
```
Override per project with `.markdown-preview.json` at the project root:
```json
{ "watch": ["docs/superpowers/specs", "docs/superpowers/plans", "docs/adr", "docs/design"] }
```
The `watch` list **replaces** the defaults. `MARKDOWN_PREVIEW_WATCH` (comma-separated) **extends**
it for ad-hoc use. Paths are relative to the project root and scanned recursively.

## How it works

```
Stop hook ── ensures ──► preview-server.mjs (127.0.0.1)
   │                        ├─ GET /        shell page (vendored css/marked/mermaid + SSE client)
   │  opens once            ├─ GET /events  SSE stream (?scope=all ⇒ lazy root watcher)
   ▼                        ├─ GET /raw     current/pinned doc's markdown (path-validated)
 one browser tab ◄── SSE ───┤  GET /list    watched files, or ?scope=all for the whole project
   search + tree sidebar    ├─ GET /search  word-AND full-text over all project markdown
   sidebar tree + #out      └─ fs.watch(watch dirs) → debounce → broadcast "update"
   swap in place               idle-shutdown when no tab is connected
```
The page parses markdown with the already-loaded `marked`, so the rendering path (Mermaid
fenced blocks, dark theme) matches the original skill exactly.

## Layout
```
SKILL.md                 # skill manifest (name + description triggers)
CLAUDE.md                # repo rules for AI agents (commits, planning artifacts)
.markdown-preview.json   # default watch config
scripts/
  watched.mjs            # resolve watch dirs (config + env) and find newest / list docs
  render.mjs             # render the shell page; open a URL in the browser
  preview-server.mjs     # persistent offline server: routes, watcher, idle-shutdown
  preview.mjs            # on-demand CLI (ensure server, open tab)
  auto-preview.mjs       # Stop hook: ensure server + one tab
  install.mjs            # npx installer (copy skill + register hook; --uninstall)
assets/                  # vendored marked.min.js, mermaid.min.js, github-markdown-dark.css
test/                    # node:test suites
.claude-plugin/          # plugin + marketplace manifests (distribution)
hooks/hooks.json         # Stop hook shipped with the plugin
```

## Publishing

Packaged as a Claude Code plugin in a single-plugin marketplace, so others install it with the
two `/plugin` commands above. Push to a public GitHub repo and tag the release
(`git tag v0.8.0 && git push --tags`) so the plugin version and git tag match.

## Versioning

See [CHANGELOG.md](CHANGELOG.md). This is **v0.8.0**.
