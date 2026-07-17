import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep, dirname } from "node:path";
import { resolveWatchDirs, newestWatched, listWatched, listAll } from "../scripts/watched.mjs";

function tmpRoot() { return mkdtempSync(join(tmpdir(), "mp-")); }
function write(p, body, mtime) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body ?? "# x");
  if (mtime) utimesSync(p, mtime, mtime);
}

test("defaults apply with no config file", () => {
  const root = tmpRoot();
  const dirs = resolveWatchDirs(root);
  assert.ok(dirs.some(d => d.endsWith(join("docs", "superpowers", "specs"))));
  assert.ok(dirs.some(d => d.endsWith(join("docs", "superpowers", "plans"))));
  assert.ok(dirs.some(d => d.endsWith(join("docs", "adr"))));
});

test("config file replaces the default list", () => {
  const root = tmpRoot();
  writeFileSync(join(root, ".markdown-preview.json"), JSON.stringify({ watch: ["a", "b"] }));
  const dirs = resolveWatchDirs(root);
  assert.deepEqual(dirs.map(d => d.replace(root + sep, "")).sort(), ["a", "b"]);
});

test("env var extends the set", () => {
  const root = tmpRoot();
  writeFileSync(join(root, ".markdown-preview.json"), JSON.stringify({ watch: ["a"] }));
  process.env.MARKDOWN_PREVIEW_WATCH = "c,d";
  try {
    const dirs = resolveWatchDirs(root);
    assert.ok(dirs.some(d => d.endsWith("c")) && dirs.some(d => d.endsWith("d")) && dirs.some(d => d.endsWith("a")));
  } finally {
    delete process.env.MARKDOWN_PREVIEW_WATCH;
  }
});

test("malformed config falls back to defaults", () => {
  for (const body of ['not json', '{}', '{"watch":"string"}', '{"watch":null}']) {
    const root = tmpRoot();
    writeFileSync(join(root, ".markdown-preview.json"), body);
    const dirs = resolveWatchDirs(root);
    assert.ok(dirs.some(d => d.endsWith(join("docs", "adr"))), `fallback for: ${body}`);
  }
});

test("newestWatched finds the most recent .md recursively", () => {
  const root = tmpRoot();
  writeFileSync(join(root, ".markdown-preview.json"), JSON.stringify({ watch: ["docs"] }));
  write(join(root, "docs", "old.md"), "# old", new Date("2020-01-01"));
  write(join(root, "docs", "nested", "new.md"), "# new", new Date("2030-01-01"));
  const best = newestWatched(root);
  assert.ok(best.path.endsWith("new.md"));
});

test("listWatched returns all md files with rel paths", () => {
  const root = tmpRoot();
  writeFileSync(join(root, ".markdown-preview.json"), JSON.stringify({ watch: ["docs"] }));
  write(join(root, "docs", "a.md"));
  write(join(root, "docs", "b.md"));
  const list = listWatched(root);
  assert.equal(list.length, 2);
  assert.ok(list.every(e => e.path && e.rel));
});

test("listAll finds every .md in the project, beyond watch dirs", () => {
  const root = tmpRoot();
  writeFileSync(join(root, ".markdown-preview.json"), JSON.stringify({ watch: ["docs"] }));
  write(join(root, "docs", "spec.md"));
  write(join(root, "README.md"));
  write(join(root, "src", "notes", "deep.md"));
  const rels = listAll(root).map(f => f.rel).sort();
  assert.deepEqual(rels, ["README.md", "docs/spec.md", "src/notes/deep.md"]);
});

test("listAll skips ignored directories at any depth", () => {
  const root = tmpRoot();
  write(join(root, "keep.md"));
  write(join(root, "node_modules", "pkg", "README.md"));
  write(join(root, ".git", "info.md"));
  write(join(root, "src", "node_modules", "nested.md"));
  write(join(root, "dist", "out.md"));
  const rels = listAll(root).map(f => f.rel);
  assert.deepEqual(rels, ["keep.md"]);
});

test("listAll uses posix rels and newest-first order", () => {
  const root = tmpRoot();
  write(join(root, "a", "old.md"), "# old", new Date("2020-01-01"));
  write(join(root, "b", "new.md"), "# new", new Date("2030-01-01"));
  const list = listAll(root);
  assert.equal(list[0].rel, "b/new.md");
  assert.ok(list.every(f => !f.rel.includes("\\")));
});
