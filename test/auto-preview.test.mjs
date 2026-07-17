import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, isFresh } from "../scripts/auto-preview.mjs";

test("unreachable server => spawn and open", () => {
  assert.deepEqual(decide(null), { spawn: true, open: true });
});

test("server up, no clients => open only", () => {
  assert.deepEqual(decide({ clients: 0 }), { spawn: false, open: true });
});

test("server up with a connected tab => do nothing (SSE pushes the update)", () => {
  assert.deepEqual(decide({ clients: 2 }), { spawn: false, open: false });
});

test("freshness gate: no watched doc => not fresh", () => {
  assert.equal(isFresh({}, null), false);
});

test("freshness gate: never-seen doc => fresh", () => {
  assert.equal(isFresh({}, { path: "/p/spec.md", mtime: 100 }), true);
});

test("freshness gate: doc edited since last acted-on => fresh", () => {
  assert.equal(isFresh({ "/p/spec.md": 100 }, { path: "/p/spec.md", mtime: 200 }), true);
});

test("freshness gate: unchanged doc => not fresh (closed tab stays closed)", () => {
  assert.equal(isFresh({ "/p/spec.md": 200 }, { path: "/p/spec.md", mtime: 200 }), false);
});
