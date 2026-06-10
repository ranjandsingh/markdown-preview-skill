import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createPreviewServer, PORTS, MARKER } from "../scripts/preview-server.mjs";

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

test("GET /health reports client count", async () => {
  const { srv, base } = await start(fixture());
  const j = await (await fetch(base + "/health")).json();
  assert.equal(j.clients, 0);
  await srv.close();
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
