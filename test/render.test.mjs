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

test("shell has the sidebar tree instead of the old dropdown", () => {
  const html = renderShell();
  assert.match(html, /id="sidebar"/);
  assert.match(html, /id="tree"/);
  assert.match(html, /Auto — follow newest/);
  assert.doesNotMatch(html, /id="filepick"/); // dropdown is gone
});

test("shell makes file-path mentions clickable", () => {
  const html = renderShell();
  assert.match(html, /linkifyFileRefs/);   // mention scanner present
  assert.match(html, /data-rel/);          // mentions carry their resolved rel
  assert.match(html, /filelink/);          // styled as links
  assert.match(html, /scope=all/);         // validated against the full project file list
});

test("shell wires in-markdown navigation", () => {
  const html = renderShell();
  assert.match(html, /addHeadingIds/);      // #anchor targets generated
  assert.match(html, /scrollIntoView/);     // anchor + cross-doc hash scrolling
  assert.match(html, /closest/);            // delegated link click handler
  assert.match(html, /window\.open/);       // external links → new tab
  assert.match(html, /pushState/);          // pins update the URL
  assert.match(html, /popstate/);           // back/forward navigates docs
});

test("shell wires pinning, scopes, and persistence", () => {
  const html = renderShell();
  assert.match(html, /"\/raw"/);            // raw route wired
  assert.match(html, /\?f=/);               // …with the file-pin query
  assert.match(html, /location\.search/);   // reads ?file= for initial pin
  assert.match(html, /scope=all/);          // all-files scope wiring
  assert.match(html, /id="scopetoggle"/);   // Watched / All files switch
  assert.match(html, /localStorage/);       // sidebar/scope/folder persistence
  assert.match(html, /id="sidebartoggle"/); // filebar ☰ button
});
