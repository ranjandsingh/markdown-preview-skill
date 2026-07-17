# Changelog

All notable changes to this skill are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

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
