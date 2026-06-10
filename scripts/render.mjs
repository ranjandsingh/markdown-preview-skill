// Core renderer: turn a Markdown file into a self-contained, OFFLINE HTML page
// (GitHub dark theme + rendered Mermaid diagrams) and open it in the default browser.
// All assets are inlined from ../assets, so the output works from file:// with no network.

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(SKILL_DIR, "assets");

// Escape any literal close-tags so inlined content can't break out of its host tag.
const safeScript = (s) => s.replace(/<\/script/gi, "<\\/script");
const safeStyle = (s) => s.replace(/<\/style/gi, "<\\/style");

export function renderHtml(file) {
  const md = readFileSync(file, "utf8");
  const title = basename(file);
  const css = safeStyle(readFileSync(join(ASSETS, "github-markdown-dark.css"), "utf8"));
  const markedJs = safeScript(readFileSync(join(ASSETS, "marked.min.js"), "utf8"));
  const mermaidJs = safeScript(readFileSync(join(ASSETS, "mermaid.min.js"), "utf8"));
  const srcMd = md.replace(/<\/script>/gi, "<\\/script>");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${css}</style>
<style>
  body { margin:0; background:#0d1117; }
  .markdown-body { box-sizing:border-box; max-width:980px; margin:0 auto; padding:48px 40px 120px; }
  .mermaid { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:16px; text-align:center; }
  .filebar { position:sticky; top:0; z-index:5; background:#161b22; border-bottom:1px solid #30363d;
             color:#8b949e; font:13px/1.4 ui-monospace,SFMono-Regular,monospace; padding:10px 40px; }
</style>
<script>${markedJs}</script>
<script>${mermaidJs}</script>
</head><body>
<div class="filebar">${file}</div>
<article id="out" class="markdown-body">Rendering…</article>
<script type="text/markdown" id="src">${srcMd}</script>
<script>
  (function () {
    // Custom code renderer: emit mermaid blocks as <pre class="mermaid">, else default.
    // Handles both marked signatures (token object vs positional args).
    marked.use({
      renderer: {
        code: function (arg, infostring) {
          var isObj = arg && typeof arg === "object";
          var text = isObj ? arg.text : arg;
          var lang = (isObj ? (arg.lang || "") : (infostring || "")).trim().split(/\\s+/)[0];
          if (lang === "mermaid") return '<pre class="mermaid">' + text + "</pre>";
          return false; // fall back to marked's default code rendering
        },
      },
    });
    document.getElementById("out").innerHTML = marked.parse(document.getElementById("src").textContent);
    mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });
    mermaid.run({ querySelector: ".mermaid" });
  })();
</script>
</body></html>`;
}

export function openInBrowser(path) {
  const opener =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", path]]
    : process.platform === "darwin" ? ["open", [path]]
    : ["xdg-open", [path]];
  spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref();
}

export function renderAndOpen(file) {
  const out = join(tmpdir(), basename(file).replace(/\.md$/i, "") + ".preview.html");
  writeFileSync(out, renderHtml(file));
  openInBrowser(out);
  return out;
}
