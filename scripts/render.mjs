// Render the static shell page for the live-reload preview, and open a URL in the browser.
// The page loads vendored marked + mermaid + GitHub-dark CSS, then fetches the current
// document's raw markdown from the server and renders it in place. No document is baked in.

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(SKILL_DIR, "assets");

const safeScript = (s) => s.replace(/<\/script/gi, "<\\/script");
const safeStyle = (s) => s.replace(/<\/style/gi, "<\\/style");

export function renderShell() {
  const css = safeStyle(readFileSync(join(ASSETS, "github-markdown-dark.css"), "utf8"));
  const markedJs = safeScript(readFileSync(join(ASSETS, "marked.min.js"), "utf8"));
  const mermaidJs = safeScript(readFileSync(join(ASSETS, "mermaid.min.js"), "utf8"));

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Markdown Preview</title>
<style>${css}</style>
<style>
  body { margin:0; background:#0d1117; }
  .markdown-body { box-sizing:border-box; max-width:980px; margin:0 auto; padding:48px 40px 120px; }
  .mermaid { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:16px; text-align:center; }
  .filebar { position:sticky; top:0; z-index:5; background:#161b22; border-bottom:1px solid #30363d;
             color:#8b949e; font:13px/1.4 ui-monospace,SFMono-Regular,monospace; padding:10px 40px;
             display:flex; gap:12px; align-items:center; }
  .filebar select { background:#0d1117; color:#c9d1d9; border:1px solid #30363d; border-radius:6px; padding:4px 8px; }
</style>
<script>${markedJs}</script>
<script>${mermaidJs}</script>
</head><body>
<div class="filebar">
  <span id="label">connecting…</span>
  <select id="filepick" title="Choose file (Auto follows the newest)">
    <option value="">Auto — follow newest</option>
  </select>
</div>
<article id="out" class="markdown-body">Loading…</article>
<script>
(function () {
  marked.use({ renderer: { code: function (arg, infostring) {
    var isObj = arg && typeof arg === "object";
    var text = isObj ? arg.text : arg;
    var lang = (isObj ? (arg.lang || "") : (infostring || "")).trim().split(/\\s+/)[0];
    if (lang === "mermaid") return '<pre class="mermaid">' + text + "</pre>";
    return false;
  } } });
  mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });

  var pinned = new URLSearchParams(location.search).get("file") || "";

  function renderMarkdown(md) {
    var y = window.scrollY;
    var out = document.getElementById("out");
    out.innerHTML = marked.parse(md);
    mermaid.run({ querySelector: ".mermaid" }).then(function () { window.scrollTo(0, y); });
    window.scrollTo(0, y);
  }

  function loadDoc(rel) {
    var url = rel ? ("/raw?f=" + encodeURIComponent(rel)) : "/raw";
    fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      document.getElementById("label").textContent = d.file;
      renderMarkdown(d.markdown);
    });
  }

  function refreshList() {
    fetch("/list").then(function (r) { return r.json(); }).then(function (files) {
      var sel = document.getElementById("filepick");
      var keep = sel.value;
      sel.length = 1;
      files.forEach(function (f) {
        var o = document.createElement("option");
        o.value = f.rel; o.textContent = f.rel; sel.appendChild(o);
      });
      sel.value = pinned || keep || "";
    });
  }

  document.getElementById("filepick").addEventListener("change", function (e) {
    pinned = e.target.value;
    loadDoc(pinned); // empty string => server's current newest
  });

  var es = new EventSource("/events");
  es.addEventListener("update", function () {
    refreshList();
    if (!pinned) loadDoc("");      // auto-follow newest
  });
  es.onopen = function () { refreshList(); loadDoc(pinned); };
})();
</script>
</body></html>`;
}

// Open a URL in the default browser (cross-platform), detached.
export function openInBrowser(url) {
  const opener =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref();
}
