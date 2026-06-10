// Persistent, offline localhost preview server. Serves the shell page and the raw markdown
// for the current (or pinned) watched document, plus an SSE stream for live updates.
// (SSE + watcher: Task 5. Idle-shutdown: Task 6. CLI entry: Task 7.)

import http from "node:http";
import { readFileSync, realpathSync, watch } from "node:fs";
import { resolve, sep } from "node:path";
import { renderShell } from "./render.mjs";
import { resolveWatchDirs, newestWatched, listWatched } from "./watched.mjs";

function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
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

export function createPreviewServer({
  root,
  port = 7437,
  idleMs = Number(process.env.PREVIEW_IDLE_MS) || 60_000,
  onIdleExit = () => process.exit(0),
}) {
  const clients = new Set();

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
    if (url.pathname === "/health") return json(res, 200, { clients: clients.size });
    if (url.pathname === "/list") return json(res, 200, listWatched(root));
    if (url.pathname === "/raw") {
      const f = url.searchParams.get("f");
      let file;
      if (f) {
        const candidate = resolve(root, f);
        if (!withinWatchDirs(root, candidate)) return json(res, 403, { error: "forbidden" });
        file = candidate;
      } else {
        file = newestWatched(root)?.path;
      }
      if (!file) return json(res, 404, { error: "no document" });
      try {
        return json(res, 200, { file: file.replace(root + sep, ""), markdown: readFileSync(file, "utf8") });
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
      const drop = () => { clients.delete(res); armIdle(); };
      res.on("error", drop);
      req.on("close", drop);
      return;
    }
    res.writeHead(404); res.end();
  });

  function broadcast() {
    const best = newestWatched(root);
    const payload = JSON.stringify({ file: best ? best.path.replace(root + sep, "") : null });
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

  return new Promise((res) => {
    server.listen(port, "127.0.0.1", () => {
      armIdle();
      res({ server, port: server.address().port, clients,
        close: () => new Promise(r => {
          clearTimeout(idleTimer);
          clearTimeout(debounce);
          if (pollTimer) clearInterval(pollTimer);
          watchers.forEach(w => w.close());
          for (const c of clients) { try { c.end(); } catch { /* ignore */ } }
          clients.clear();
          server.closeAllConnections?.();
          server.close(r);
        }) });
    });
  });
}
