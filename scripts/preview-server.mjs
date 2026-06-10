// Persistent, offline localhost preview server. Serves the shell page and the raw markdown
// for the current (or pinned) watched document, plus an SSE stream for live updates.
// (SSE + watcher: Task 5. Idle-shutdown: Task 6. CLI entry: Task 7.)

import http from "node:http";
import { readFileSync, realpathSync } from "node:fs";
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

export function createPreviewServer({ root, port = 7437, idleMs = 60_000 }) {
  const clients = new Set();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(renderShell());
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
    res.writeHead(404); res.end();
  });

  return new Promise((res) => {
    server.listen(port, "127.0.0.1", () => {
      res({ server, port: server.address().port, clients, close: () => new Promise(r => server.close(r)) });
    });
  });
}
