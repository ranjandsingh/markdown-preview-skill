import { test } from "node:test";
import assert from "node:assert/strict";
import { renderShell } from "../scripts/render.mjs";

test("shell inlines vendored assets and the SSE client, with no baked markdown", () => {
  const html = renderShell();
  assert.match(html, /<style>/);            // CSS inlined
  assert.match(html, /marked/);             // marked inlined
  assert.match(html, /mermaid/);            // mermaid inlined
  assert.match(html, /EventSource\(/);      // SSE client present
  assert.match(html, /id="out"/);           // render target present
  assert.doesNotMatch(html, /text\/markdown/); // no baked <script type=text/markdown>
});

test("shell wires the file dropdown and ?file pin", () => {
  const html = renderShell();
  assert.match(html, /id="filepick"/);
  assert.match(html, /\/raw\?f=/);
  assert.match(html, /location\.search/);   // reads ?file= for initial pin
});
