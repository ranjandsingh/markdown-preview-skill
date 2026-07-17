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
  .filelink { color:#2f81f7; cursor:pointer; text-decoration:underline dotted; text-underline-offset:3px; }
  .filelink:hover { text-decoration:underline; }
  a.filelink { color:#2f81f7; }
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
  var pendingHash = location.hash || "";
  var allRels = null; // Set of every .md rel in the project — validates file-path mentions
  var es = null;

  if (localStorage.getItem("mp.sidebar") === "0") document.body.classList.add("nosidebar");

  function scopeQs(prefix) { return scope === "all" ? prefix + "scope=all" : ""; }

  // marked emits headings without ids — add GitHub-style slugs so #anchor links work.
  function addHeadingIds() {
    var used = {};
    var hs = document.querySelectorAll("#out h1,#out h2,#out h3,#out h4,#out h5,#out h6");
    for (var i = 0; i < hs.length; i++) {
      if (hs[i].id) continue;
      var slug = hs[i].textContent.trim().toLowerCase()
        .replace(/[^\\w\\- ]+/g, "").replace(/ +/g, "-");
      var n = used[slug] || 0;
      used[slug] = n + 1;
      hs[i].id = n ? slug + "-" + n : slug;
    }
  }

  // --- clickable file mentions -------------------------------------------------------
  // Paths like docs/plans/foo.md written as inline code or plain text become navigable,
  // but only when the path actually exists in the project (validated against /list).

  var PATH_RE = /(?:\\.{1,2}\\/)?(?:[\\w.-]+\\/)*[\\w.-]+\\.md/gi;

  function refreshRels() {
    fetch("/list?scope=all").then(function (r) { return r.json(); }).then(function (files) {
      allRels = {};
      files.forEach(function (f) { allRels[f.rel] = 1; });
      linkifyFileRefs(); // first /raw render may have beaten this fetch — re-run
    });
  }

  // Resolve a mentioned path against the project root, then against the current doc's dir.
  function resolveMention(token) {
    if (!allRels) return null;
    var clean = token.replace(/^\\.\\//, "");
    if (clean.charAt(0) !== "." && allRels[clean]) return clean;
    var parts = (showing || "").split("/").slice(0, -1);
    token.split("/").forEach(function (seg) {
      if (seg === "" || seg === ".") return;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    });
    var docRel = parts.join("/");
    return allRels[docRel] ? docRel : null;
  }

  function markLink(el, rel) {
    el.classList.add("filelink");
    el.setAttribute("data-rel", rel);
    el.title = rel;
  }

  function linkifyFileRefs() {
    if (!allRels) return;
    // inline code spans whose entire text is an existing .md path
    var codes = document.querySelectorAll("#out code:not([data-rel])");
    for (var i = 0; i < codes.length; i++) {
      var c = codes[i];
      if (c.parentElement && c.parentElement.tagName === "PRE") continue;
      var txt = c.textContent.trim();
      PATH_RE.lastIndex = 0;
      var m = PATH_RE.exec(txt);
      if (!m || m[0] !== txt) continue;
      var rel = resolveMention(txt);
      if (rel) markLink(c, rel);
    }
    // bare paths in plain text
    var walker = document.createTreeWalker(document.getElementById("out"), NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) {
      var n = walker.currentNode;
      var p = n.parentElement;
      var skip = false;
      while (p) {
        var t = p.tagName;
        if (t === "A" || t === "CODE" || t === "PRE" || t === "SCRIPT" || t === "STYLE" || t === "MARK") { skip = true; break; }
        if (p.id === "out") break;
        p = p.parentElement;
      }
      if (!skip && PATH_RE.test(n.nodeValue)) nodes.push(n);
      PATH_RE.lastIndex = 0;
    }
    nodes.forEach(function (node) {
      var text = node.nodeValue;
      var frag = document.createDocumentFragment();
      var last = 0, m2;
      PATH_RE.lastIndex = 0;
      while ((m2 = PATH_RE.exec(text))) {
        var rel = resolveMention(m2[0]);
        if (!rel) continue;
        frag.appendChild(document.createTextNode(text.slice(last, m2.index)));
        var a = document.createElement("a");
        a.textContent = m2[0];
        a.href = docUrl(rel);
        markLink(a, rel);
        frag.appendChild(a);
        last = m2.index + m2[0].length;
      }
      if (last === 0) return;
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  function renderMarkdown(md, newDoc) {
    var main = document.getElementById("main");
    var y = main.scrollTop;
    document.getElementById("out").innerHTML = marked.parse(md);
    addHeadingIds();
    linkifyFileRefs();
    // settle runs twice (sync, then after mermaid reflows layout) — capture the hash so
    // the second pass re-scrolls to the anchor instead of resetting to the top.
    var hash = pendingHash;
    pendingHash = "";
    var settle = function () {
      if (hash) {
        var t = document.getElementById(hash.slice(1));
        if (t) { t.scrollIntoView(); return; }
      }
      main.scrollTop = newDoc ? 0 : y;
    };
    mermaid.run({ querySelector: ".mermaid" }).then(settle);
    settle();
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
      var newDoc = d.file !== showing;
      showing = d.file;
      document.getElementById("label").textContent = d.file;
      renderMarkdown(d.markdown, newDoc);
      highlight();
    });
  }

  function docUrl(rel, hash) {
    return (rel ? "/?file=" + encodeURIComponent(rel) : "/") + (hash || "");
  }

  function pin(rel, hash, skipHistory) {
    pinned = rel;
    if (hash) pendingHash = hash;
    if (!skipHistory) history.pushState({ rel: rel }, "", docUrl(rel, hash));
    loadDoc(pinned); // "" => server's current newest
    highlight();
  }

  // Back/forward move between previously pinned docs.
  window.addEventListener("popstate", function (e) {
    var rel = (e.state && typeof e.state.rel === "string")
      ? e.state.rel
      : (new URLSearchParams(location.search).get("file") || "");
    pin(rel, location.hash || "", true);
  });

  // Links inside the rendered markdown: #anchors scroll natively (ids added above);
  // relative *.md links pin the target doc in place; external links open a new tab so
  // the live preview tab survives.
  document.getElementById("out").addEventListener("click", function (e) {
    var fl = e.target && e.target.closest ? e.target.closest("[data-rel]") : null;
    if (fl) {
      e.preventDefault();
      pin(fl.getAttribute("data-rel"));
      return;
    }
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (!href || href.charAt(0) === "#") return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.slice(0, 2) === "//") {
      e.preventDefault();
      window.open(a.href, "_blank");
      return;
    }
    e.preventDefault();
    var cut = href.indexOf("#");
    var path = cut === -1 ? href : href.slice(0, cut);
    var hash = cut === -1 ? "" : href.slice(cut);
    if (!/\\.md$/i.test(path)) return; // only markdown targets are navigable
    var base = (showing || "").split("/").slice(0, -1);
    path.split("/").forEach(function (seg) {
      if (seg === "" || seg === ".") return;
      if (seg === "..") base.pop();
      else base.push(seg);
    });
    pin(base.join("/"), hash);
  });

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
      refreshRels();
      refreshList();
      loadDoc(pinned); // reload whatever is showing — pinned docs live-update too
    });
    es.onopen = function () { refreshRels(); refreshList(); loadDoc(pinned); };
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

  history.replaceState({ rel: pinned }, "", docUrl(pinned, location.hash));
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
