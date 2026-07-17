import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createPreviewServer, findServer, PORTS, MARKER } from "../scripts/preview-server.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "mps-"));
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  writeFileSync(join(root, ".markdown-preview.json"), JSON.stringify({ watch: ["docs"] }));
  writeFileSync(join(root, "docs", "adr", "0001.md"), "# Hello\n\n```mermaid\ngraph TD;A-->B\n```");
  return root;
}
async function start(root) {
  const srv = await createPreviewServer({ root, port: 0, idleMs: 50_000 });
  return { srv, base: `http://127.0.0.1:${srv.port}` };
}

test("GET / returns the shell page", async () => {
  const { srv, base } = await start(fixture());
  const r = await fetch(base + "/");
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /id="out"/);
  await srv.close();
});

test("GET /health reports client count and the served root", async () => {
  const root = fixture();
  const { srv, base } = await start(root);
  const j = await (await fetch(base + "/health")).json();
  assert.equal(j.clients, 0);
  assert.equal(typeof j.root, "string");
  assert.ok(j.root.length > 0);
  await srv.close();
});

test("findServer matches each project root to its own server", async () => {
  const rootA = fixture();
  const rootB = fixture();
  const a = await createPreviewServer({ root: rootA, port: 0, idleMs: 50_000 });
  const b = await createPreviewServer({ root: rootB, port: 0, idleMs: 50_000 });
  const ports = [a.port, b.port];

  const foundA = await findServer(rootA, ports);
  assert.equal(foundA.port, a.port);
  const foundB = await findServer(rootB, ports);
  assert.equal(foundB.port, b.port);
  assert.equal(typeof foundB.health.clients, "number");

  const foundC = await findServer(mkdtempSync(join(tmpdir(), "mps-")), ports);
  assert.equal(foundC, null); // no server for that root => caller must spawn one

  await a.close();
  await b.close();
});

test("GET /list returns watched markdown", async () => {
  const { srv, base } = await start(fixture());
  const j = await (await fetch(base + "/list")).json();
  assert.ok(j.find(f => f.rel.endsWith("0001.md")));
  await srv.close();
});

test("GET /raw returns newest doc markdown when no f given", async () => {
  const { srv, base } = await start(fixture());
  const j = await (await fetch(base + "/raw")).json();
  assert.match(j.markdown, /# Hello/);
  await srv.close();
});

test("GET /raw rejects paths outside watch dirs", async () => {
  const { srv, base } = await start(fixture());
  const r = await fetch(base + "/raw?f=" + encodeURIComponent("../../etc/passwd"));
  assert.equal(r.status, 403);
  await srv.close();
});

test("GET /raw rejects an existing file outside the watch dirs", async () => {
  const outside = mkdtempSync(join(tmpdir(), "outside-"));
  const secret = join(outside, "secret.md");
  writeFileSync(secret, "# secret");
  const { srv, base } = await start(fixture());
  const r = await fetch(base + "/raw?f=" + encodeURIComponent(secret)); // absolute path, real file
  assert.equal(r.status, 403);
  await srv.close();
});

test("createPreviewServer rejects when the port is already in use", async () => {
  const a = await createPreviewServer({ root: fixture(), port: 0, idleMs: 50_000 });
  await assert.rejects(
    createPreviewServer({ root: fixture(), port: a.port, idleMs: 50_000 }),
    /EADDRINUSE/
  );
  await a.close();
});

test("PORTS and MARKER are exported sensibly", () => {
  assert.equal(PORTS[0], 7437);
  assert.ok(MARKER.endsWith(".preview-server.json"));
});

test("server exits (via onIdleExit) after idle grace with no clients", async () => {
  const root = fixture();
  let exited = false;
  const srv = await createPreviewServer({ root, port: 0, idleMs: 150, onIdleExit: () => { exited = true; } });
  await sleep(300);
  assert.equal(exited, true);
  await srv.close();
});

// fixture() plus an .md outside the watch dirs (but inside the root) and one in node_modules.
function fixtureAll() {
  const root = fixture();
  mkdirSync(join(root, "notes"), { recursive: true });
  writeFileSync(join(root, "notes", "extra.md"), "# Extra");
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(root, "node_modules", "pkg", "README.md"), "# dep");
  writeFileSync(join(root, ".env"), "SECRET=1");
  return root;
}

const recursiveWatch = process.platform !== "linux";

function sse(base, path, ac) {
  return fetch(base + path, { signal: ac.signal, headers: { accept: "text/event-stream" } });
}

test("GET /list?scope=all includes out-of-watch files; plain /list does not", async () => {
  const { srv, base } = await start(fixtureAll());
  const all = await (await fetch(base + "/list?scope=all")).json();
  assert.ok(all.find(f => f.rel === "notes/extra.md"));
  assert.ok(!all.find(f => f.rel.includes("node_modules")));
  const watched = await (await fetch(base + "/list")).json();
  assert.ok(!watched.find(f => f.rel === "notes/extra.md"));
  await srv.close();
});

test("GET /raw serves any in-root .md regardless of scope, still rejects escapes", async () => {
  const { srv, base } = await start(fixtureAll());
  const withScope = await fetch(base + "/raw?scope=all&f=" + encodeURIComponent("notes/extra.md"));
  assert.equal(withScope.status, 200);
  assert.match((await withScope.json()).markdown, /# Extra/);
  // md-links can point outside the watch dirs — /raw allows in-root .md without scope too
  const noScope = await fetch(base + "/raw?f=" + encodeURIComponent("notes/extra.md"));
  assert.equal(noScope.status, 200);
  const escape = await fetch(base + "/raw?scope=all&f=" + encodeURIComponent("../../etc/passwd"));
  assert.equal(escape.status, 403);
  await srv.close();
});

test("GET /raw never serves non-markdown root files like .env", async () => {
  const { srv, base } = await start(fixtureAll());
  for (const qs of ["f=.env", "scope=all&f=.env"]) {
    const r = await fetch(base + "/raw?" + qs);
    assert.equal(r.status, 403, qs);
  }
  await srv.close();
});

test("lazy root watcher attaches with an all-scope client and detaches after", async () => {
  const { srv, base } = await start(fixtureAll());
  let h = await (await fetch(base + "/health")).json();
  assert.equal(h.allScope, 0);
  assert.equal(h.rootWatcher, false);

  const ac = new AbortController();
  await sse(base, "/events?scope=all", ac);
  await sleep(100);
  h = await (await fetch(base + "/health")).json();
  assert.equal(h.allScope, 1);
  if (recursiveWatch) assert.equal(h.rootWatcher, true);

  ac.abort();
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    h = await (await fetch(base + "/health")).json();
    if (h.allScope === 0 && h.rootWatcher === false) break;
    await sleep(50);
  }
  assert.equal(h.allScope, 0);
  assert.equal(h.rootWatcher, false);
  await srv.close();
});

test("editing an out-of-watch file pushes SSE update to an all-scope client", { skip: !recursiveWatch }, async () => {
  const root = fixtureAll();
  const srv = await createPreviewServer({ root, port: 0, idleMs: 50_000 });
  const base = `http://127.0.0.1:${srv.port}`;

  const events = [];
  const ac = new AbortController();
  const stream = await sse(base, "/events?scope=all", ac);
  const reader = stream.body.getReader();
  const pump = (async () => {
    const dec = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      events.push(dec.decode(value));
    }
  })();

  await sleep(100);
  writeFileSync(join(root, "notes", "extra.md"), "# Extra edited");
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && !events.join("").includes("event: update")) {
    await sleep(50);
  }
  ac.abort();
  await pump.catch(() => {});
  assert.ok(events.join("").includes("event: update"));
  await srv.close();
});

test("editing a watched file pushes an SSE update", async () => {
  const root = fixture();
  const srv = await createPreviewServer({ root, port: 0, idleMs: 50_000 });
  const base = `http://127.0.0.1:${srv.port}`;

  const events = [];
  const ac = new AbortController();
  const stream = await fetch(base + "/events", { signal: ac.signal, headers: { accept: "text/event-stream" } });
  const reader = stream.body.getReader();
  const pump = (async () => {
    const dec = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      events.push(dec.decode(value));
    }
  })();

  await sleep(50);
  writeFileSync(join(root, "docs", "adr", "0002.md"), "# New ADR");
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && !events.join("").includes("event: update")) {
    await sleep(50);
  }
  ac.abort();
  await pump.catch(() => {});
  assert.ok(events.join("").includes("event: update"));
  await srv.close();
});
