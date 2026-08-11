# Person Card Handle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace individual People record drag glyphs with the supplied two-line SVG while leaving category drag glyphs and all reorder behavior unchanged.

**Architecture:** Store the supplied vector as a repo-owned icon, add one person-only class at the People journal construction boundary, and override only that class's pseudo-element with a CSS mask. The existing shared reorder binder and category handle presentation remain untouched.

**Tech Stack:** Browser-native JavaScript modules, CSS masks, SVG, Node.js assertion scripts, Playwright visual conformance.

## Global Constraints

- Category reorder handles remain unchanged: the current dotted glyph, 32px hit target, blue color, and existing focus treatment.
- Desktop and mobile person-card reorder handles use the supplied two-horizontal-line SVG.
- Person handles retain the existing 32px interactive width and accessible `Reorder <name>` label.
- Mouse, touch, keyboard, cross-category movement, persistence, Command Bearing, and story state remain unchanged.

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
