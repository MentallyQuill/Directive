# Crew Card Visual Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center the compact PC fallback emblem and make the desktop person-card landing outline use the held card's square corner geometry.

**Architecture:** Keep the shared media placeholder and drag binder unchanged. Correct both mismatches through selectors scoped to the desktop Crew roster's compact player frame and person-card drop slot, then protect the rendered geometry with the existing Playwright visual-conformance suite.

**Tech Stack:** CSS, JavaScript, Node.js, Playwright, `node:assert/strict`

## Global Constraints

- Preserve package portraits, uploaded portraits, and larger detail placeholders.
- Preserve category dragging, mobile card rounding, reorder timing, and reorder behavior.
- The compact fallback emblem center must be within one pixel of the `48px` frame center.
- The held desktop person card and person-card destination outline must both compute to `0px` corner radii.

---

### Task 1: Match compact portrait and drag-slot geometry

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: the rendered `.people-row-image.directive-player-portrait-frame`, `.directive-media-placeholder-icon`, `.directive-media-placeholder-label`, `.people-drag-ghost`, and `.people-card-drop-slot` elements.
- Produces: browser-protected computed geometry without changing JavaScript interfaces.

- [ ] **Step 1: Add failing compact-emblem assertions**

After opening the desktop People fixture, measure the fallback frame and mask icon from real DOM geometry:

```js
const compactPlayerFallback = await peoplePage.locator(
  '.people-desktop-journal .people-row-image.directive-player-portrait-frame'
).evaluate((frame) => {
  const icon = frame.querySelector('.directive-asset-mask-icon');
  const label = frame.querySelector('.directive-media-placeholder-label');
  const frameRect = frame.getBoundingClientRect();
  const iconRect = icon.getBoundingClientRect();
  return {
    frameCenterX: frameRect.left + frameRect.width / 2,
    frameCenterY: frameRect.top + frameRect.height / 2,
    iconCenterX: iconRect.left + iconRect.width / 2,
    iconCenterY: iconRect.top + iconRect.height / 2,
    labelDisplay: getComputedStyle(label).display
  };
});
assert.ok(Math.abs(compactPlayerFallback.iconCenterX - compactPlayerFallback.frameCenterX) <= 1);
assert.ok(Math.abs(compactPlayerFallback.iconCenterY - compactPlayerFallback.frameCenterY) <= 1);
assert.equal(compactPlayerFallback.labelDisplay, 'none');
```

- [ ] **Step 2: Add failing held-card/slot corner assertions**

While the existing Mara drag is active, capture both computed radii:

```js
const cardCornerGeometry = await peoplePage.evaluate(() => ({
  ghost: getComputedStyle(document.querySelector('.people-drag-ghost')).borderRadius,
  slot: getComputedStyle(document.querySelector('.people-card-drop-slot')).borderRadius
}));
assert.deepEqual(cardCornerGeometry, { ghost: '0px', slot: '0px' });
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: FAIL because the icon's vertical center is clipped away from the frame center and the slot computes to `5px`.

- [ ] **Step 4: Add the minimal scoped CSS**

Add beside the existing Crew thumbnail and drop-slot rules:

```css
.directive-expanded-shell .people-row-image.directive-player-portrait-frame .directive-media-placeholder {
  min-height: 0;
  gap: 0;
}
.directive-expanded-shell .people-row-image.directive-player-portrait-frame .directive-media-placeholder-label { display: none; }
.directive-expanded-shell .people-card-drop-slot { border-radius: 0; }
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: `Expanded interface visual conformance passed 25 route/viewports and the approved modal state.`

- [ ] **Step 6: Inspect the active desktop drag visually**

Start the fixture server, open the desktop People route, lift the PC card, and capture an active-drag screenshot. Verify the fallback emblem is centered and the lifted card and fixed destination outline share square corners.

- [ ] **Step 7: Run the complete gate**

Run:

```powershell
npm.cmd test
```

Expected: `[v1-gate] passed 97 focused checks.`

- [ ] **Step 8: Commit**

```powershell
git add styles/directive.css tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "fix(people): align card drag geometry"
```
