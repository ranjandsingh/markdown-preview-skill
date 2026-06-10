import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "../scripts/auto-preview.mjs";

test("unreachable server => spawn and open", () => {
  assert.deepEqual(decide(null), { spawn: true, open: true });
});

test("server up, no clients => open only", () => {
  assert.deepEqual(decide({ clients: 0 }), { spawn: false, open: true });
});

test("server up with a connected tab => do nothing (SSE pushes the update)", () => {
  assert.deepEqual(decide({ clients: 2 }), { spawn: false, open: false });
});
