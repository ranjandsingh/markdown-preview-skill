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
  html, body { height:100%; }
  body { margin:0; background:#0d1117; display:flex; flex-direction:column; }
  .markdown-body { box-sizing:border-box; max-width:980px; margin:0 auto; padding:48px 40px 120px; }
  .mermaid { background:#161b22; border:1px solid #30363d; border-radius:8px; padding:16px; text-align:center; }
  .filebar { flex:0 0 auto; background:#161b22; border-bottom:1px solid #30363d;
             color:#8b949e; font:13px/1.4 ui-monospace,SFMono-Regular,monospace; padding:8px 16px;
             display:flex; gap:12px; align-items:center; }
  #sidebartoggle { background:none; color:#8b949e; border:1px solid #30363d; border-radius:6px;
                   padding:2px 8px; cursor:pointer; font:inherit; }
  #sidebartoggle:hover { background:#0d1117; color:#c9d1d9; }
  .layout { flex:1 1 auto; display:flex; min-height:0; }
  #sidebar { flex:0 0 260px; display:flex; flex-direction:column; min-height:0; overflow-y:auto;
             border-right:1px solid #21262d; padding:10px 8px 0;
             font:13px/1.6 ui-monospace,SFMono-Regular,monospace; color:#8b949e; }
  body.nosidebar #sidebar { display:none; }
  #main { flex:1 1 auto; overflow-y:auto; min-width:0; }
  .item { padding:3px 8px; border-radius:6px; cursor:pointer; white-space:nowrap;
          overflow:hidden; text-overflow:ellipsis; transition:background .1s ease; }
  .item:hover { background:#161b22; color:#c9d1d9; }
  .item.active { background:#1f6feb33; color:#e6edf3; }
  .item.auto { color:#7ee787; margin-bottom:8px; }
  #tree { flex:1 1 auto; }
  #sidebar summary { cursor:pointer; padding:3px 8px; border-radius:6px; color:#c9d1d9;
                     user-select:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #sidebar summary:hover { background:#161b22; }
  #sidebar .children { margin-left:10px; border-left:1px solid #21262d; padding-left:6px; }
  .scopebar { position:sticky; bottom:0; flex:0 0 auto; background:#0d1117;
              border-top:1px solid #21262d; padding:8px 6px; }
  #scopetoggle { width:100%; background:#161b22; color:#c9d1d9; border:1px solid #30363d;
                 border-radius:6px; padding:5px 8px; cursor:pointer; font:inherit; }
  #scopetoggle:hover { border-color:#8b949e; }
</style>
<script>${markedJs}</script>
<script>${mermaidJs}</script>
</head><body>
<div class="filebar">
  <button id="sidebartoggle" title="Toggle sidebar">&#9776;</button>
  <span id="label">connecting…</span>
</div>
<div class="layout">
  <nav id="sidebar">
    <div id="auto" class="item auto" title="Follow the most recently modified doc">&#9889; Auto — follow newest</div>
    <div id="tree"></div>
    <div class="scopebar">
      <button id="scopetoggle" title="Switch between the configured watch folders and every markdown file in the project"></button>
    </div>
  </nav>
  <div id="main"><article id="out" class="markdown-body">Loading…</article></div>
</div>
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
  var scope = localStorage.getItem("mp.scope") === "all" ? "all" : "watched";
  var showing = "";   // rel of the doc currently rendered (for highlight in Auto mode)
  var es = null;

  if (localStorage.getItem("mp.sidebar") === "0") document.body.classList.add("nosidebar");

  function scopeQs(prefix) { return scope === "all" ? prefix + "scope=all" : ""; }

  function renderMarkdown(md) {
    var main = document.getElementById("main");
    var y = main.scrollTop;
    document.getElementById("out").innerHTML = marked.parse(md);
    mermaid.run({ querySelector: ".mermaid" }).then(function () { main.scrollTop = y; });
    main.scrollTop = y;
  }

  function highlight() {
    var items = document.querySelectorAll("#sidebar .item");
    for (var i = 0; i < items.length; i++) items[i].classList.remove("active");
    var target = pinned || showing;
    var el = document.querySelector('#tree .item[data-rel="' + (target || "").replace(/"/g, '\\\\"') + '"]');
    if (el) el.classList.add("active");
    if (!pinned) document.getElementById("auto").classList.add("active");
  }

  function loadDoc(rel) {
    var url = "/raw" + (rel ? "?f=" + encodeURIComponent(rel) + scopeQs("&") : scopeQs("?"));
    fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      showing = d.file;
      document.getElementById("label").textContent = d.file;
      renderMarkdown(d.markdown);
      highlight();
    });
  }

  function pin(rel) {
    pinned = rel;
    loadDoc(pinned); // "" => server's current newest
    highlight();
  }

  function buildTree(files) {
    var rootNode = { dirs: {}, files: [] };
    files.forEach(function (f) {
      var parts = f.rel.split("/");
      var node = rootNode;
      for (var i = 0; i < parts.length - 1; i++) {
        node = node.dirs[parts[i]] || (node.dirs[parts[i]] = { dirs: {}, files: [] });
      }
      node.files.push({ name: parts[parts.length - 1], rel: f.rel });
    });
    return rootNode;
  }

  function renderTree(node, container, prefix) {
    Object.keys(node.dirs).sort().forEach(function (name) {
      var det = document.createElement("details");
      var key = "mp.open." + prefix + name;
      det.open = localStorage.getItem(key) !== "0";
      det.addEventListener("toggle", function () { localStorage.setItem(key, det.open ? "1" : "0"); });
      var sum = document.createElement("summary");
      sum.textContent = name;
      sum.title = prefix + name;
      det.appendChild(sum);
      var inner = document.createElement("div");
      inner.className = "children";
      renderTree(node.dirs[name], inner, prefix + name + "/");
      det.appendChild(inner);
      container.appendChild(det);
    });
    node.files.sort(function (a, b) { return a.name < b.name ? -1 : 1; }).forEach(function (f) {
      var el = document.createElement("div");
      el.className = "item file";
      el.textContent = f.name;
      el.title = f.rel;
      el.setAttribute("data-rel", f.rel);
      el.addEventListener("click", function () { pin(f.rel); });
      container.appendChild(el);
    });
  }

  function refreshList() {
    fetch("/list" + scopeQs("?")).then(function (r) { return r.json(); }).then(function (files) {
      var tree = document.getElementById("tree");
      tree.textContent = "";
      renderTree(buildTree(files), tree, "");
      highlight();
    });
  }

  function renderScopeToggle() {
    document.getElementById("scopetoggle").textContent =
      scope === "all" ? "Scope: All files" : "Scope: Watched";
  }

  // SSE scope is connection-time state, so switching scope reconnects the stream.
  function connect() {
    if (es) es.close();
    es = new EventSource("/events" + scopeQs("?"));
    es.addEventListener("update", function () {
      refreshList();
      loadDoc(pinned); // reload whatever is showing — pinned docs live-update too
    });
    es.onopen = function () { refreshList(); loadDoc(pinned); };
  }

  document.getElementById("auto").addEventListener("click", function () { pin(""); });

  document.getElementById("scopetoggle").addEventListener("click", function () {
    scope = scope === "all" ? "watched" : "all";
    localStorage.setItem("mp.scope", scope);
    renderScopeToggle();
    connect();
  });

  document.getElementById("sidebartoggle").addEventListener("click", function () {
    var hidden = document.body.classList.toggle("nosidebar");
    localStorage.setItem("mp.sidebar", hidden ? "0" : "1");
  });

  renderScopeToggle();
  connect();
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
