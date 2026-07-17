// Persistent, offline localhost preview server. Serves the shell page and the raw markdown
// for the current (or pinned) watched document, plus an SSE stream for live updates.
// (SSE + watcher: Task 5. Idle-shutdown: Task 6. CLI entry: Task 7.)

import http from "node:http";
import { readFileSync, realpathSync, watch, writeFileSync } from "node:fs";
import { resolve, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderShell } from "./render.mjs";
import { resolveWatchDirs, newestWatched, listWatched, listAll } from "./watched.mjs";

function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

// Root-relative path with forward slashes — the client's tree keys on these.
function posixRel(root, file) {
  return file.replace(root + sep, "").split(sep).join("/");
}

// Is `target` inside one of the watch dirs? Resolves symlinks to prevent escape.
function withinWatchDirs(root, target) {
  let real;
  try { real = realpathSync(target); } catch { return false; }
  return resolveWatchDirs(root).some(dir => {
    let realDir;
    try { realDir = realpathSync(dir); } catch { return false; }
    return real === realDir || real.startsWith(realDir + sep);
  });
}

// All-scope containment: a real *.md inside the project root. The .md restriction matters
// here — unlike the curated watch dirs, the root holds things like .env that must never
// be served.
function withinRoot(root, target) {
  if (!target.toLowerCase().endsWith(".md")) return false;
  let real, realRoot;
  try { real = realpathSync(target); realRoot = realpathSync(root); } catch { return false; }
  return real === realRoot || real.startsWith(realRoot + sep);
}

export function createPreviewServer({
  root,
  port = 7437,
  idleMs = Number(process.env.PREVIEW_IDLE_MS) || 60_000,
  onIdleExit = () => process.exit(0),
}) {
  const clients = new Set();
  const allScopeClients = new Set();

  // Lazy root watcher: exists only while an all-scope tab is connected, so browse-all
  // live-reload costs nothing when nobody uses it. No-op where recursive watch is
  // unsupported (Linux) — the watched-dirs watcher/poll still runs.
  let rootWatcher = null;
  function syncRootWatcher() {
    if (allScopeClients.size > 0 && !rootWatcher) {
      try { rootWatcher = watch(root, { recursive: true }, scheduleBroadcast); } catch { rootWatcher = null; }
    } else if (allScopeClients.size === 0 && rootWatcher) {
      rootWatcher.close();
      rootWatcher = null;
    }
  }

  // Self-shutdown: once the last tab disconnects, exit after `idleMs` so no orphan lingers.
  let idleTimer = null;
  function armIdle() {
    clearTimeout(idleTimer);
    if (clients.size === 0) idleTimer = setTimeout(() => { if (clients.size === 0) onIdleExit(); }, idleMs);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/") {
      try {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(renderShell());
      } catch { return json(res, 500, { error: "render failed" }); }
    }
    const allScope = url.searchParams.get("scope") === "all";
    if (url.pathname === "/health") {
      return json(res, 200, { root, clients: clients.size, allScope: allScopeClients.size, rootWatcher: !!rootWatcher });
    }
    if (url.pathname === "/list") return json(res, 200, allScope ? listAll(root) : listWatched(root));
    if (url.pathname === "/raw") {
      const f = url.searchParams.get("f");
      let file;
      if (f) {
        const candidate = resolve(root, f);
        // Watch-dir files OR any in-root *.md: markdown links may point outside the watch
        // dirs (e.g. ../../README.md), and those must load in every scope.
        if (!withinWatchDirs(root, candidate) && !withinRoot(root, candidate)) {
          return json(res, 403, { error: "forbidden" });
        }
        file = candidate;
      } else {
        file = newestWatched(root)?.path;
      }
      if (!file) return json(res, 404, { error: "no document" });
      try {
        return json(res, 200, { file: posixRel(root, file), markdown: readFileSync(file, "utf8") });
      } catch { return json(res, 404, { error: "unreadable" }); }
    }
    if (url.pathname === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write("event: ready\ndata: {}\n\n");
      clearTimeout(idleTimer);
      clients.add(res);
      if (allScope) { allScopeClients.add(res); syncRootWatcher(); }
      const drop = () => {
        clients.delete(res);
        if (allScope) { allScopeClients.delete(res); syncRootWatcher(); }
        armIdle();
      };
      res.on("error", drop);
      req.on("close", drop);
      return;
    }
    res.writeHead(404); res.end();
  });

  function broadcast() {
    const best = newestWatched(root);
    const payload = JSON.stringify({ file: best ? posixRel(root, best.path) : null });
    for (const res of clients) {
      if (res.destroyed || !res.writable) { clients.delete(res); continue; }
      try { res.write(`event: update\ndata: ${payload}\n\n`); } catch { clients.delete(res); }
    }
  }

  let debounce = null;
  const scheduleBroadcast = () => { clearTimeout(debounce); debounce = setTimeout(broadcast, 120); };

  // Prefer native recursive fs.watch (Windows/macOS). Where it's unsupported (Linux throws
  // ERR_FEATURE_UNAVAILABLE_ON_PLATFORM), fall back to a 1s mtime-poll so live-reload still works.
  let pollTimer = null;
  const watchers = [];
  for (const dir of resolveWatchDirs(root)) {
    try {
      watchers.push(watch(dir, { recursive: true }, scheduleBroadcast));
    } catch {
      if (!pollTimer) {
        let last = newestWatched(root)?.mtime ?? 0;
        pollTimer = setInterval(() => {
          const m = newestWatched(root)?.mtime ?? 0;
          if (m > last) { last = m; broadcast(); }
        }, 1000);
        pollTimer.unref?.();
      }
    }
  }

  return new Promise((res, rej) => {
    server.once("error", rej);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", rej);
      armIdle();
      res({ server, port: server.address().port, clients,
        close: () => new Promise(r => {
          clearTimeout(idleTimer);
          clearTimeout(debounce);
          if (pollTimer) clearInterval(pollTimer);
          if (rootWatcher) { rootWatcher.close(); rootWatcher = null; }
          watchers.forEach(w => w.close());
          for (const c of clients) { try { c.end(); } catch { /* ignore */ } }
          clients.clear();
          server.closeAllConnections?.();
          server.close(r);
        }) });
    });
  });
}

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MARKER = resolve(SKILL_DIR, ".preview-server.json");
export const PORTS = [7437, 7438, 7439, 7440, 7441, 7442, 7443, 7444];

// Roots must compare equal across sessions that spell the same directory differently
// (symlinks, 8.3 names, drive-letter case on Windows).
function normRoot(p) {
  let r = p;
  try { r = realpathSync(p); } catch { /* keep as-is */ }
  return process.platform === "win32" ? r.toLowerCase() : r;
}

// Each project root gets its own server. Probe the known ports and return
// { port, health } for the server that serves `root`, or null if none does —
// a server for a *different* root never matches, so sessions can't cross-see content.
export async function findServer(root, ports = PORTS) {
  const want = normRoot(resolve(root));
  for (const port of ports) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(400) });
      if (!r.ok) continue;
      const health = await r.json();
      if (typeof health.root === "string" && normRoot(health.root) === want) return { port, health };
    } catch { /* refused, timeout, not ours — try next */ }
  }
  return null;
}

async function tryListen(root, port) {
  try { return await createPreviewServer({ root, port }); }
  catch (e) { if (e && e.code === "EADDRINUSE") return null; throw e; }
}

// Best-effort hint map { normalizedRoot: { port, pid } } — discovery always goes through
// findServer/health, so a stale marker can't point a session at the wrong project.
function writeMarker(root, port) {
  let map = {};
  try {
    const j = JSON.parse(readFileSync(MARKER, "utf8"));
    if (j && typeof j === "object" && !j.port) map = j; // ignore the pre-0.6 single-server shape
  } catch { /* start fresh */ }
  map[normRoot(root)] = { port, pid: process.pid };
  writeFileSync(MARKER, JSON.stringify(map));
}

// Run directly:  node scripts/preview-server.mjs [root]
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
  const existing = await findServer(root);
  if (existing) {
    console.log(`Preview server already on http://localhost:${existing.port} (watching ${root})`);
    process.exit(0);
  }
  let srv = null;
  for (const p of PORTS) { srv = await tryListen(root, p); if (srv) break; }
  if (!srv) { console.error("No free preview port"); process.exit(1); }
  writeMarker(root, srv.port);
  console.log(`Preview server on http://localhost:${srv.port} (watching ${root})`);
}
