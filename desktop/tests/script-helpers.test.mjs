import assert from "node:assert/strict";
import test from "node:test";

import {
  extractBalancedBlock,
  extractOpeningTag,
  findUnexpectedRuntimeLogLines,
  hasLiteralBooleanAttribute,
} from "../scripts/script-helpers.mjs";

test("extractBalancedBlock stays inside the requested nested CSS block", () => {
  const css = `
@media (max-width: 1099px) {
  .focus-workspace { grid-template-columns: 72px minmax(0, 1fr); }
  @supports (color: color-mix(in srgb, red, blue)) {
    .nested { color: red; }
  }
}
.sentinel { grid-template-columns: 999px; }
`;

  const block = extractBalancedBlock(css, "@media (max-width: 1099px)");

  assert.match(block, /72px/);
  assert.match(block, /\.nested/);
  assert.doesNotMatch(block, /sentinel|999px/);
});

test("extractBalancedBlock ignores braces inside comments and strings", () => {
  const css = `@media (prefers-reduced-motion: reduce) {
    /* a misleading } brace */
    .sample::before { content: "{"; }
    .sample { animation: none; }
  }
  .outside { animation: spin 1s; }`;

  const block = extractBalancedBlock(css, "@media (prefers-reduced-motion: reduce)");

  assert.match(block, /animation: none/);
  assert.doesNotMatch(block, /outside|spin/);
});

test("extractBalancedBlock skips a matching marker inside a comment", () => {
  const css = `
/* @media (max-width: 799px) { .decoy { width: 1px; } } */
@media (max-width: 799px) {
  .real { width: 64px; }
}`;

  const block = extractBalancedBlock(css, "@media (max-width: 799px)");

  assert.match(block, /\.real/);
  assert.doesNotMatch(block, /decoy|1px/);
});

test("extractOpeningTag skips a matching tag inside an HTML comment", () => {
  const source = `
<!-- <details class="settings-advanced-details" OPEN> -->
<details class="settings-advanced-details" :open="diagnosticsOpen">`;

  const tag = extractOpeningTag(source, '<details class="settings-advanced-details"');

  assert.match(tag, /:open="diagnosticsOpen"/);
  assert.doesNotMatch(tag, /\bOPEN\b/);
});

test("opening tag inspection distinguishes bound and literal boolean attributes", () => {
  const source = `<details class="settings-advanced-details" data-note=">" :open="diagnosticsOpen" @toggle="onToggle">`;
  const tag = extractOpeningTag(source, '<details class="settings-advanced-details"');

  assert.match(tag, /:open="diagnosticsOpen"/);
  assert.equal(hasLiteralBooleanAttribute(tag, "open"), false);
  assert.equal(hasLiteralBooleanAttribute(tag.replace(':open="diagnosticsOpen"', "open"), "open"), true);
  assert.equal(hasLiteralBooleanAttribute("<details OPEN>", "open"), true);
});

test("runtime log inspection ignores normal debugger output and keeps failures", () => {
  const failures = findUnexpectedRuntimeLogLines([
    "DevTools listening on ws://127.0.0.1:9222/devtools/browser/example\n",
    "[TaskBridge] desktop ready\n",
    "[TaskBridge] desktop services failed to start\nError: connection lost\n",
    "UnhandledPromiseRejectionWarning: rejected\n",
  ]);

  assert.deepEqual(failures, [
    "[TaskBridge] desktop services failed to start",
    "Error: connection lost",
    "UnhandledPromiseRejectionWarning: rejected",
  ]);
});
