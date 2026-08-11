# Crew Card Drag Visual Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the held crew card visibly track the pointer above Directive with the complete approved styling and smooth compositor motion.

**Architecture:** Keep the existing pointer, slot, ordering, and cleanup lifecycle. Replace the computed-style snapshot with CSS-variable theming on a body-level drag layer, drive the ghost through `translate3d`, and make the real browser suite prove active-drag stacking and presentation.

**Tech Stack:** Browser DOM APIs, CSS custom properties, Web Animations, Playwright browser conformance script, Node.js alpha gate.

## Global Constraints

- Preserve desktop handle activation, mobile whole-card `175ms` hold, `8px` scroll threshold, vertical track lock, `170ms` reflow, and `160ms` docking.
- Do not change category ordering behavior or campaign-scoped persistence.
- The held People card must visibly include its content and handle area, not only the selected-row left accent.
- Preserve unrelated current-main commits and all existing browser coverage.

---

### Task 1: Prove active-drag visibility failures

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs:430-480`

**Interfaces:**
- Consumes: the production People fixture at `/production?route=people`.
- Produces: active-drag assertions and `people-card-active-drag-1024x768.png`.

- [ ] **Step 1: Add one failing stacking/presentation test**

After `mouse.down()`, evaluate the real ghost, drag layer, and runtime shell and assert the literal contract:

```js
const heldCardPresentation = await peoplePage.locator('.people-drag-ghost').evaluate((ghost) => {
  const style = getComputedStyle(ghost);
  const layerZ = Number.parseInt(getComputedStyle(ghost.parentElement).zIndex, 10);
  const shellZ = Number.parseInt(getComputedStyle(document.querySelector('.directive-runtime-panel.directive-expanded-shell')).zIndex, 10);
  return {
    aboveShell: layerZ > shellZ,
    borderStyles: [style.borderTopStyle, style.borderRightStyle, style.borderBottomStyle, style.borderLeftStyle],
    background: style.backgroundColor,
    transform: style.transform,
    active: ghost.classList.contains('active'),
    inlineDeclarations: [ghost, ...ghost.querySelectorAll('*')].reduce((total, element) => total + element.style.length, 0)
  };
});
assert.deepEqual(heldCardPresentation.borderStyles, ['solid', 'solid', 'solid', 'solid']);
assert.equal(heldCardPresentation.aboveShell, true);
assert.notEqual(heldCardPresentation.background, 'rgba(0, 0, 0, 0)');
assert.equal(heldCardPresentation.active, false);
assert.ok(heldCardPresentation.inlineDeclarations < 100);
assert.match(heldCardPresentation.transform, /matrix|translate3d/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because `aboveShell` is false and the border/background/transform are overwritten.

- [ ] **Step 3: Save an active-drag screenshot before pointer-up**

```js
await peoplePage.screenshot({
  path: path.join(artifactRoot, 'people-card-active-drag-1024x768.png')
});
```

The screenshot remains a review artifact; assertions carry the automated gate.

- [ ] **Step 4: Commit the failing regression**

```bash
git add tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "test(people): expose hidden drag card"
```

### Task 2: Build the lightweight compositor ghost

**Files:**
- Modify: `src/ui/expanded-interface-reorder.js:1-445`
- Modify: `styles/directive.css:3680-3695`

**Interfaces:**
- Consumes: existing `bindPresentationReorderHandle()` options and pointer lifecycle.
- Produces: `applyGhostPosition(state, x, y, scale)` and a themed `.directive-drag-layer` above the runtime shell.

- [ ] **Step 1: Replace rendered-style copying with theme-variable copying**

```js
function copyInheritedCustomProperties(source, target) {
  const style = getComputedStyle(source);
  for (const property of style) {
    if (property.startsWith('--')) target.style.setProperty(property, style.getPropertyValue(property));
  }
}
```

Call this once for `previewSource` and `ghostHost`; do not write computed declarations onto the ghost subtree.

- [ ] **Step 2: Strip source-only state and initialize transform positioning**

```js
ghost.classList.remove('active', 'is-dragging', 'is-drop-before', 'is-drop-target');
Object.assign(ghost.style, {
  left: '0',
  top: '0',
  transform: `translate3d(${left}px, ${top}px, 0) scale(1.015)`,
  willChange: 'transform'
});
```

- [ ] **Step 3: Coalesce visual movement through animation frames**

Store the latest ghost `x/y`, schedule one `requestAnimationFrame`, and write one `translate3d(...) scale(...)` transform per frame. Cancel the frame in every terminal cleanup path.

- [ ] **Step 4: Convert docking to transform-only keyframes**

```js
state.ghost.animate([
  { transform: `translate3d(${ghostRect.left}px, ${ghostRect.top}px, 0) scale(1.015)`, boxShadow: liftedShadow },
  { transform: `translate3d(${slotRect.left}px, ${slotRect.top}px, 0) scale(1)`, boxShadow: dockedShadow }
], { duration, easing: reflowEasing, fill: 'forwards' });
```

- [ ] **Step 5: Raise and style the drag layer**

```css
.directive-expanded-shell.directive-drag-layer { z-index: 100100; }
.directive-expanded-shell .people-drag-ghost { will-change: transform; }
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: PASS with the active screenshot produced.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/ui/expanded-interface-reorder.js styles/directive.css
git commit -m "fix(people): render held card above shell"
```

### Task 3: Inspect and certify the corrected interaction

**Files:**
- Modify: `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md:517-520`

**Interfaces:**
- Consumes: the corrected local production fixture.
- Produces: desktop/mobile visual evidence, updated contract wording, and a merge-ready branch.

- [ ] **Step 1: Inspect desktop active drag in the browser**

Verify the complete portrait, copy, pips, and handle are visible under the pointer; the full card has a blue border and raised background; the slot remains visible beneath it; and vertical motion has no horizontal drift.

- [ ] **Step 2: Inspect mobile hold and docking in the browser**

Verify the complete expanded card lifts after the hold, follows the finger track, and docks without a flash, transparent frame, or stale selection stripe.

- [ ] **Step 3: Update the living contract**

Document the body-level themed layer, selection-state stripping, transform-only movement, and active-drag visual proof requirement.

- [ ] **Step 4: Run focused and full verification**

```bash
node tools/scripts/test-expanded-interface-visual-conformance.mjs
npm.cmd test
git diff --check
```

Expected: the visual suite and all focused alpha checks pass with no diff errors.

- [ ] **Step 5: Request independent review and fix Critical/Important findings**

Review the complete feature range against the design and this plan, with special attention to transform math, reduced motion, pointer cleanup, category defaults, and active screenshot coverage.

- [ ] **Step 6: Commit documentation and review fixes**

```bash
git add docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md
git commit -m "docs(ui): certify visible crew drag"
```
