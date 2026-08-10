# Runtime Overlay Body Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent SillyTavern's clipped `#sheld` chat host from cutting off the top of the Directive runtime shell.

**Architecture:** The shared Directive overlay root becomes a document-level portal whose preferred host is `document.body`. SillyTavern bootstrap supplies the active document without overriding that host selection, while fallback hosts remain available for incomplete documents.

**Tech Stack:** Browser-native JavaScript modules, fake DOM integration tests, Node.js assertions.

## Global Constraints

- Preserve the existing Directive shell dimensions, centering, backdrop, routes, and mobile composition.
- Do not add CSS offsets tied to SillyTavern's current top-bar height.
- Keep `#sheld` and the chat parent only as fallbacks when no document body or document element exists.
- Do not add runtime dependencies.

---

### Task 1: Portal Runtime Overlays Outside The Chat Host

**Files:**
- Modify: `tools/scripts/test-directive-runtime-overlay-host.mjs`
- Modify: `src/ui/directive-overlay-root.js`
- Modify: `src/hosts/sillytavern/bootstrap.js`

**Interfaces:**
- Consumes: `configureDirectiveOverlayRoot({ document })` during SillyTavern bootstrap.
- Produces: `getDirectiveOverlayRoot()` whose created root is a direct child of `document.body` whenever a body exists.

- [ ] **Step 1: Write the failing host regression**

Create a fake `#sheld` element before mounting the runtime shell, then retain the existing body-level assertion:

```js
const sheld = fakeDocument.createElement('div');
sheld.id = 'sheld';
fakeDocument.body.appendChild(sheld);

const shown = await showDirectiveRuntimePanel({ opener });
const overlay = fakeDocument.getElementById('directive-runtime-overlay');
assert.equal(overlay.parentNode, fakeDocument.body,
  'runtime overlay must escape SillyTavern #sheld clipping');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-directive-runtime-overlay-host.mjs`

Expected: FAIL because the current default overlay host prefers `#sheld`.

- [ ] **Step 3: Implement the body portal**

Change `defaultHostForDocument(documentRef)` to return hosts in this order:

```js
return documentRef?.body
  || documentRef?.documentElement
  || documentRef?.getElementById?.('sheld')
  || documentRef?.querySelector?.('#chat')?.parentElement
  || null;
```

Change SillyTavern bootstrap to avoid overriding that order:

```js
configureDirectiveOverlayRoot({
  document: ctx.document || globalThis.document
});
```

- [ ] **Step 4: Run focused verification and verify GREEN**

Run: `node tools/scripts/test-directive-runtime-overlay-host.mjs; node tools/scripts/test-character-creator-assist-dialog.mjs; node tools/scripts/test-expanded-interface-shell.mjs`

Expected: all three scripts pass.

- [ ] **Step 5: Run the full alpha gate**

Run: `npm.cmd test`

Expected: all focused checks pass with no regression.

- [ ] **Step 6: Commit the fix**

```text
fix(ui): escape clipped chat overlay host
```
