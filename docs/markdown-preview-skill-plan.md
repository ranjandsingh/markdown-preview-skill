# Plan: a "markdown-preview" skill that auto-opens specs/plans in the browser

**Status:** Draft plan (uncommitted by request)
**Goal:** Package the current `scripts/preview-spec.mjs` behavior into a reusable Claude Code
**skill** so that any spec / plan / review markdown is rendered (GitHub styling + Mermaid
diagrams) and opened in the browser — and make it fire **automatically** whenever a new such
markdown is written.

---

## 1. The core design decision: skill vs hook

These are two different mechanisms and the request needs **both**:

| Mechanism | Triggered by | Good for | Limitation |
|---|---|---|---|
| **Skill** | The model decides, based on the skill's `description` | Reusable instructions + bundled script; on-demand "preview this file" | *Not* guaranteed-automatic — it relies on the model choosing to invoke it |
| **Hook** | The harness, deterministically, on an event (e.g. `PostToolUse` on `Write`) | Truly automatic "every time a spec file is written, open it" | Just runs a command; no reasoning |

> The harness rule: **automated "whenever X" behaviors require a hook**, because the harness —
> not the model — executes them. A skill is how we *describe and package* the capability; the
> hook is what makes it *automatic*.

**Recommendation:** ship a **skill** (the portable capability + script) **and** an optional
**hook** that calls the skill's script on spec/plan writes. Users who want it fully automatic
enable the hook; everyone else invokes the skill on demand (`/markdown-preview`).

---

## 2. Skill structure

```
markdown-preview/
├── SKILL.md                 # instructions + when-to-use (required)
├── scripts/
│   └── preview.mjs          # the renderer (generalized from preview-spec.mjs)
└── assets/                  # OPTIONAL: vendored marked.js + mermaid.js + css for offline
    ├── marked.min.js
    ├── mermaid.esm.min.mjs
    └── github-markdown-dark.css
```

The script is the generalized `scripts/preview-spec.mjs` we already have:
- Accept a file path arg; with no arg, pick the newest markdown under a set of watched globs
  (`docs/**/specs/*.md`, `docs/**/plans/*.md`, `**/*-plan.md`, `**/*-review.md`).
- Render to a temp HTML with `marked` + `mermaid` + GitHub-dark CSS; open via the platform opener.
- Add a `--offline` flag that inlines the vendored `assets/` instead of CDN links.
- Exit cleanly with a one-line summary (path rendered → temp html).

---

## 3. SKILL.md draft

```md
---
name: markdown-preview
description: Render a Markdown spec, plan, or review to a styled HTML page (GitHub CSS +
  Mermaid diagrams) and open it in the browser for visual review. Use after writing or
  revising any spec/plan/review markdown, or when the user asks to preview/open/visualize a
  markdown file or "see the plan visually".
---

# Markdown Preview

## Quick start
Render and open a file in the default browser:
    node scripts/preview.mjs <file.md>
No argument renders the newest spec/plan/review markdown in the project.

## When to use
- Immediately after writing or substantially revising a spec, plan, or review markdown.
- When the user asks to "preview", "open in browser", or "see it visually".

## Workflow
1. Resolve the target file (explicit arg, else newest matching watched globs).
2. Run `node <skill-dir>/scripts/preview.mjs <file>`.
3. Tell the user it opened, with the rendered temp path.
4. Prefer ```mermaid fenced blocks for diagrams so they render as real flowcharts.

## Offline
Pass `--offline` to inline vendored libs from `assets/` (no network needed).
```

Keep SKILL.md under ~100 lines; the script carries the logic, so no REFERENCE.md is needed.

---

## 4. The hook (makes it automatic)

A `PostToolUse` hook in `.claude/settings.json` (project) or `~/.claude/settings.json` (global)
that runs the previewer after a matching markdown file is written/edited:

```jsonc
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            // Only fire for spec/plan/review markdown; the script no-ops otherwise.
            "command": "node ./scripts/preview.mjs --if-spec \"$CLAUDE_FILE_PATH\""
          }
        ]
      }
    ]
  }
}
```

- `--if-spec` makes the script **filter by path** (specs/plans/reviews) and silently exit for
  anything else, so the hook is safe on every write.
- Debounce: if rapid successive edits are noisy, the script can skip re-opening if it opened the
  same file < N seconds ago (track last-open in a temp marker file).
- This is the piece that delivers "automatically open whenever there is a new markdown to review."

> Note: the exact env var for the written path depends on the harness hook API; the plan's
> implementation step verifies the correct variable (and JSON-on-stdin shape) before finalizing.

---

## 5. Packaging & distribution options

| Option | Where it lives | Reuse | Notes |
|---|---|---|---|
| **Personal skill** | `~/.claude/skills/markdown-preview/` | All your projects | Simplest; pairs with a **global** hook in `~/.claude/settings.json` |
| **Project skill** | `.claude/skills/markdown-preview/` | This repo (and teammates via git) | Commit it; pairs with a project hook |
| **Plugin** | a `claude-plugins` plugin | Shareable broadly | Most work; only if you want to publish it |

Recommended: **personal skill + global hook** (since you want this on every project, not just
Control Tower), with the script vendored for offline use.

---

## 6. Implementation steps (when we build it)

1. Generalize `scripts/preview-spec.mjs` → `preview.mjs`: add watched-glob resolution,
   `--if-spec` path filter, `--offline`, and the debounce marker.
2. (Offline) Vendor `marked`, `mermaid`, and the CSS into `assets/`; wire `--offline` to inline them.
3. Create the skill dir + `SKILL.md` (§3) in `~/.claude/skills/markdown-preview/`.
4. Add the `PostToolUse` hook (§4); **verify the real hook env var / stdin contract** against
   the harness docs before trusting `$CLAUDE_FILE_PATH`.
5. Test: (a) `/markdown-preview` on-demand; (b) write a dummy `docs/...-plan.md` and confirm the
   hook auto-opens it; (c) write a non-spec `.md` and confirm it does **not** open; (d) `--offline`.
6. Update the existing `spec-browser-preview` memory to point at the skill once it exists.

---

## 7. Open questions for the user

1. **Scope:** personal (all projects) or just this repo?
2. **Automatic vs on-demand:** enable the hook (fully automatic on every spec write), or keep it
   on-demand via the skill command?
3. **Offline:** vendor the libs (works with no network) or keep the lighter CDN version?
4. **Watched patterns:** which paths count as "a spec/plan/review"? Proposed:
   `docs/**/specs/*.md`, `docs/**/plans/*.md`, `**/*-plan.md`, `**/*-review.md`.

---

## 8. Relationship to existing work

- Reuses `scripts/preview-spec.mjs` (already in this repo, committed).
- Supersedes the manual step in the `spec-browser-preview` memory by making it a packaged,
  auto-triggered capability rather than a "remember to run the script" note.
