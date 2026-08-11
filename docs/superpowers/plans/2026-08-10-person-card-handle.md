# Person Card Handle and Certified Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace individual People record drag glyphs with the supplied two-line SVG and restore the frozen certified no-reflow drag behavior while leaving category drag glyphs unchanged.

**Architecture:** Store the supplied vector as a repo-owned icon, add one person-only class at the People journal construction boundary, and override only that class's pseudo-element with a CSS mask. Extend the shared reorder binder with an opt-in deferred-drop mode used only by People records: the source stays connected, drop markers change during movement, and the controller commits once on pointer-up.

**Tech Stack:** Browser-native JavaScript modules, CSS masks, SVG, Node.js assertion scripts, Playwright visual conformance.

## Global Constraints

- Category reorder handles remain unchanged: the current dotted glyph, 32px hit target, blue color, and existing focus treatment.
- Desktop and mobile person-card reorder handles use the supplied two-horizontal-line SVG.
- Person handles retain the existing 32px interactive width and accessible `Reorder <name>` label.
- Mouse, touch, keyboard, cross-category movement, persistence, Command Bearing, and story state remain unchanged.
- Person-card pointer dragging must not relocate a placeholder or reflow the roster before pointer-up.
- The frozen mockup at `docs/design/mockups/directive-expanded-interface.html:972-1065` is authoritative for People-card pointer behavior.

---

### Task 1: Apply the Person-Only Handle Glyph

**Files:**
- Create: `assets/icons/handle-person.svg`
- Modify: `src/ui/people-journal.js:101-143`
- Modify: `styles/directive.css:3594-3596`
- Test: `tools/scripts/test-certified-people-panel.mjs:71-82`
- Test: `tools/scripts/test-expanded-interface-visual-conformance.mjs:208-289`

**Interfaces:**
- Consumes: `personReorderHandle(person, category, controller, rerender, options)` and the existing `.collection-drag-handle` contract.
- Produces: `.collection-person-drag-handle`, a person-only presentation hook used on desktop and mobile records.

- [ ] **Step 1: Write the failing component assertions**

Add assertions that the two fixture people rendered in both desktop and mobile compositions produce four person-only handles, while category handles do not receive the person-only class:

```js
assert.equal(byClass('collection-person-drag-handle').length, 4);
const categoryHandles = byClass('collection-category-head')
  .flatMap((head) => head.children)
  .filter((node) => node.className.split(/\s+/).includes('collection-drag-handle'));
assert.equal(categoryHandles.some((node) => node.className.split(/\s+/).includes('collection-person-drag-handle')), false);
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `node tools/scripts/test-certified-people-panel.mjs`

Expected: FAIL because no element has class `collection-person-drag-handle`.

- [ ] **Step 3: Add the browser presentation assertions**

In the People route visual block, inspect both pseudo-elements:

```js
const handleStyles = await page.evaluate(() => {
  const person = document.querySelector('.collection-person-drag-handle');
  const category = document.querySelector('.collection-category > .collection-category-head > .collection-drag-handle');
  const personStyle = getComputedStyle(person, '::before');
  const categoryStyle = getComputedStyle(category, '::before');
  return {
    personMask: personStyle.maskImage || personStyle.webkitMaskImage,
    categoryBackground: categoryStyle.backgroundImage,
    categoryMask: categoryStyle.maskImage || categoryStyle.webkitMaskImage
  };
});
assert.match(handleStyles.personMask, /handle-person\.svg/);
assert.match(handleStyles.categoryBackground, /radial-gradient/);
assert.doesNotMatch(handleStyles.categoryMask, /handle-person\.svg/);
```

- [ ] **Step 4: Run visual conformance and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because the person handle class and SVG mask are absent.

- [ ] **Step 5: Add the supplied SVG asset**

Create `assets/icons/handle-person.svg` from the attached source geometry:

```svg
<?xml version="1.0" encoding="utf-8"?>
<svg width="800px" height="800px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 10h16M4 14h16" stroke="#000000" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 6: Add the person-only class**

Immediately after constructing the handle in `personReorderHandle`, add the presentation hook without changing binder options or event handlers:

```js
handle.classList.add('collection-person-drag-handle');
```

- [ ] **Step 7: Apply the SVG mask override**

Keep the default dotted rule intact and add:

```css
.directive-expanded-shell .collection-person-drag-handle::before {
  width: 20px;
  height: 20px;
  background: currentColor;
  -webkit-mask: url("../assets/icons/handle-person.svg") center / 20px 20px no-repeat;
  mask: url("../assets/icons/handle-person.svg") center / 20px 20px no-repeat;
}
```

- [ ] **Step 8: Verify GREEN and the unchanged interaction contract**

Run:

```powershell
node tools/scripts/test-certified-people-panel.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
node tools/scripts/test-reorderable-collection.mjs
```

Expected: all three commands PASS, including desktop/mobile, pointer, touch, keyboard, cross-category, and persistence coverage.

- [ ] **Step 9: Run the complete gate**

Run: `npm.cmd test`

Expected: all focused checks PASS.

- [ ] **Step 10: Commit**

```powershell
git add assets/icons/handle-person.svg src/ui/people-journal.js styles/directive.css tools/scripts/test-certified-people-panel.mjs tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "feat(people): distinguish person drag handles"
```

### Task 2: Restore Certified No-Reflow Person Dragging

**Files:**
- Modify: `src/ui/expanded-interface-reorder.js:39-238`
- Modify: `src/ui/people-journal.js:101-144`
- Modify: `styles/directive.css:3597-3624`
- Test: `tools/scripts/test-expanded-interface-visual-conformance.mjs:258-291`

**Interfaces:**
- Consumes: `bindPresentationReorderHandle(handle, options)` and its existing `onDrop({ id, input, fromList, toList, toIndex })` callback.
- Produces: opt-in `deferredDrop: true`, `dropBeforeClass`, and `dropTargetClass` options. Existing callers retain placeholder behavior by default.

- [ ] **Step 1: Write the failing active-drag regression**

Before pointer-up in the existing Mara drag scenario, capture the source row and roster geometry, then assert the certified transient state:

```js
const sourceGeometry = await peoplePage.locator('.people-desktop-journal .collection-person-row').evaluateAll((rows) => rows.map((row) => ({
  id: row.dataset.personId,
  top: row.getBoundingClientRect().top
})));
await peoplePage.mouse.move(maraBox.x + maraBox.width / 2, maraBox.y + maraBox.height / 2);
await peoplePage.mouse.down();
await peoplePage.mouse.move(bridgeDropBox.x + bridgeDropBox.width / 2, bridgeDropBox.y + bridgeDropBox.height / 2, { steps: 8 });
assert.equal(await peoplePage.locator('.mobile-drag-placeholder').count(), 0);
assert.equal(await peoplePage.locator('.collection-person-row[data-person-id="mara-whitaker"].is-dragging').count(), 1);
assert.equal(await peoplePage.locator('.collection-person-row.is-drop-before, .collection-category.is-drop-target').count(), 1);
assert.deepEqual(await peoplePage.locator('.people-desktop-journal .collection-person-row').evaluateAll((rows) => rows.map((row) => ({
  id: row.dataset.personId,
  top: row.getBoundingClientRect().top
}))), sourceGeometry);
```

- [ ] **Step 2: Run visual conformance and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because the current binder creates and relocates `.mobile-drag-placeholder` and detaches the source row.

- [ ] **Step 3: Add an opt-in deferred-drop path**

Extend the binder options:

```js
deferredDrop = false,
dropBeforeClass = 'is-drop-before',
dropTargetClass = 'is-drop-target'
```

When `deferredDrop` is true:

- Keep `state.item` in place and add `is-dragging` during activation.
- Do not create or move a placeholder.
- Keep the ghost's original horizontal position and update only its `top`.
- On each move, clear old marker classes, resolve `dropList` and the hovered item, then mark either the next insertion row or destination category.
- Store the destination list and insertion row in state.
- On pointer-up, derive `toIndex` from destination children after filtering out the source ID and call the existing `onDrop` once.
- On cancel, remove the ghost, source fade, and markers without calling `onDrop`.

- [ ] **Step 4: Enable deferred drop for person records only**

In `personReorderHandle`, pass:

```js
deferredDrop: true,
dropBeforeClass: 'is-drop-before',
dropTargetClass: 'is-drop-target'
```

Do not change category handle options.

- [ ] **Step 5: Restore certified transient styling**

Add the source fade and marker rules from the frozen mockup, adapted to current selectors:

```css
.directive-expanded-shell .collection-person-row { position: relative; }
.directive-expanded-shell .collection-person-row.is-dragging { opacity: .28; }
.directive-expanded-shell .collection-person-row.is-drop-before::before { content: ""; position: absolute; z-index: 2; inset: -2px 4px auto; height: 3px; background: var(--directive-expanded-blue); border-radius: 3px; }
.directive-expanded-shell .collection-category.is-drop-target > .collection-category-head { box-shadow: inset 0 0 0 2px rgba(119, 167, 239, .72); }
```

- [ ] **Step 6: Verify GREEN and all reorder inputs**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
node tools/scripts/test-reorderable-collection.mjs
node tools/scripts/test-certified-people-panel.mjs
```

Expected: all commands PASS; the active-drag assertions prove no reflow, while existing pointer, touch, keyboard, cross-category, focus, and reload assertions remain green.

- [ ] **Step 7: Inspect the drag in the local browser**

Reload the local People route and drag a desktop person across at least three rows. Confirm the roster remains stationary during movement, the ghost stays horizontally aligned, one drop marker is visible, and the committed order matches the marker.

- [ ] **Step 8: Run the complete gate and commit**

Run: `npm.cmd test`

Expected: all focused checks PASS.

```powershell
git add docs/superpowers/specs/2026-08-10-person-card-handle-design.md docs/superpowers/plans/2026-08-10-person-card-handle.md src/ui/expanded-interface-reorder.js src/ui/people-journal.js styles/directive.css tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "fix(people): restore certified drag behavior"
```
