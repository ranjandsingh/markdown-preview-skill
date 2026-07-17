# Changelog

All notable changes to this skill are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [0.8.0] — 2026-07-17
### Added
- **Full-text search** (`/` to focus): case-insensitive word-AND matching over every
  markdown file's content and path — always the whole project, independent of the sidebar
  scope. Results rank filename hits first with up-to-5 highlighted snippet lines each
  (capped at 50 files); clicking opens the doc with all matches marked and the clicked
  occurrence centered. `Esc` clears back to the tree; results refresh live over SSE.

## [0.7.0] — 2026-07-17
### Added
- **Clickable file mentions**: paths like `docs/plans/foo.md` written as inline code or
  plain text become navigable links when the file exists in the project — validated against
  the live file list, resolved root-relative first, then relative to the current doc.
### Changed
- The all-files scan now skips **every dot-folder** (`.git`, `.claude`, `.venv`, `.vscode`,
  …) plus `venv` and `__pycache__`, in addition to the existing build/dependency dirs.

## [0.6.0] — 2026-07-17
### Fixed
- **Per-project servers**: previously one global server (first session wins) served every
  session, so a second project's preview showed the first project's content. Now each
  project root gets its own server on its own port (`7437`–`7444`); the hook and previewer
  discover the right server by asking each port's `/health` which root it serves, and spawn
  a new one when this project has none. Same-root sessions still share one server; a server
  self-exits ~60s after its tab closes, so memory stays bounded to actively previewed
  projects.

## [0.5.0] — 2026-07-17
### Added
- **In-markdown navigation**: GitHub-style heading ids make `#anchor` links work; relative
  links to `.md` files navigate in place (with `other.md#section` support); external links
  open a new tab. `/raw` now serves any in-root `.md` regardless of scope so cross-folder
  links resolve (non-markdown files like `.env` remain forbidden).
- **URL sync + history**: the pinned doc is reflected in `?file=…` via `pushState`, making
  previews shareable; browser back/forward move through previously viewed docs.

## [0.4.0] — 2026-07-17
### Added
- **Sidebar file tree**: browse the project's markdown as a collapsible folder tree; click to
  pin, **⚡ Auto** to follow the newest. Visibility, folder state, and scope persist in
  `localStorage`. Replaces the filebar dropdown.
- **All-files scope**: a footer toggle switches from the watched folders to every `.md` in the
  project (skipping `node_modules`, `.git`, and build dirs). While an All-files tab is
  connected, a lazy recursive watcher on the project root makes those docs live-reload too
  (macOS/Windows).
### Fixed
- Pinned documents now live-reload on change; previously only Auto mode did.

## [0.3.1] — 2026-07-17
### Changed
- Stop hook now has a **freshness gate**: it only ensures the server + tab when a watched
  doc actually changed since the hook last acted. Unrelated turns no longer open a tab, and
  a deliberately closed tab stays closed until the next doc edit. State lives in
  `.last-open.json` (gitignored) and self-prunes entries for deleted files.

## [0.3.0] — 2026-07-17
### Added
- `npx` install path: `npx github:ranjandsingh/markdown-preview-skill` copies the skill into
  `~/.claude/skills/markdown-preview/` and registers the Stop hook in `settings.json`
  (idempotent; `--uninstall` reverses both, touching only its own hook).

## [0.2.0] — 2026-06-11
### Changed
- Replaced the static `file://` snapshot with an offline `127.0.0.1` live-reload server.
  A single browser tab now updates **in place** over SSE and follows the newest watched doc,
  instead of opening a new tab with a frozen render each turn.

### Added
- Configurable watch folders via `.markdown-preview.json` (defaults: `docs/superpowers/specs`,
  `docs/superpowers/plans`, `docs/adr`); `MARKDOWN_PREVIEW_WATCH` env extends the set.
- Filebar file picker and `?file=` pin; in-place Mermaid re-render with scroll preserved.
- Idle-shutdown: the server exits ~60s after the last tab disconnects (self-cleaning).
- Distribution as a Claude Code plugin + single-plugin marketplace (ships the Stop hook).

## [0.1.0]
- Initial skill: offline Markdown → browser renderer (GitHub dark theme + vendored Mermaid),
  with a Stop hook that opened the just-edited spec/plan as a static page.
