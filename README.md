# markdown-preview-skill

A Claude Code **skill** that renders a Markdown spec/plan/review into a styled HTML page
(GitHub dark theme + rendered **Mermaid** diagrams) and opens it in the default browser —
**fully offline** (vendored `marked` + `mermaid`).

This repository is the **tracked source**. The working copy is installed at
`~/.claude/skills/markdown-preview/` so the skill is available across all projects.

## Layout
```
SKILL.md              # skill manifest (name + description triggers)
scripts/
  render.mjs          # core: Markdown -> self-contained offline HTML -> open browser
  watched.mjs         # which dirs count as specs/plans (superpowers-scoped for now)
  preview.mjs         # on-demand CLI
  auto-preview.mjs    # Stop-hook entrypoint (opens only the just-edited file)
assets/               # vendored marked.min.js, mermaid.min.js, github-markdown-dark.css
docs/
  markdown-preview-skill-plan.md   # the design/plan for this skill
```

## Install / update the global copy
Copy `SKILL.md`, `scripts/`, and `assets/` into `~/.claude/skills/markdown-preview/`, then
add the `Stop` hook from `SKILL.md` to `~/.claude/settings.json`.

## Use
```
node scripts/preview.mjs path/to/spec.md   # render a specific file
node scripts/preview.mjs                    # newest superpowers spec/plan in cwd
```

## Behavior of the automatic open
The `Stop` hook opens a watched file **only when it changed since it was last opened**, so it
fires when you've just edited a spec/plan and are handing it over for review — not on every
turn. State is tracked in `.last-open.json` (gitignored).
