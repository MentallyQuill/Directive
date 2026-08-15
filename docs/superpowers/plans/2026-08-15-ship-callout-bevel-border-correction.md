# Ship Callout Bevel Border Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace clipped rectangular callout borders with continuously painted 4px beveled edges and make every Ship leader solid at the approved 1.5px/2px weights.

**Architecture:** Keep the button's approved polygon silhouette, but use its background as the outer edge rather than clipping a rectangular border. Paint the inner surface and left accent with pseudo-elements below the existing content, and restore the unchanged rectangular accordion treatment at the existing 820px breakpoint. Change only SVG stroke presentation for leaders; preserve geometry and interactions.

**Tech Stack:** CSS, JavaScript ES modules, Playwright/Chromium browser certification, Node.js assertion scripts.

## Global Constraints

- Keep the approved 4px desktop bevel, 120-205px intrinsic width, `L${task.level}` placement, title ellipsis, reward row, and selection behavior.
- Paint a continuous one-pixel outer beveled edge with a 3px inner bevel and retain the 3px violet/amber left accent.
- Disable polygon surface layers at `max-width: 820px` and restore the existing accordion border, background, radius, and content positioning.
- Make all Ship leaders solid with 1.5px default and 2px active widths.
- Preserve leader geometry, colors, anchors, crossings, task authority, mobile badge composition, and accordion behavior.
- Preserve unrelated dirty work and concurrent commits.

---

### Task 1: Add failing rendered contracts

**Files:**
- Modify: `tools/scripts/test-cohesion-ship-visual.mjs:12-17`
- Modify: `tools/scripts/test-cohesion-ship-visual.mjs:203-227`

**Interfaces:**
- Consumes: rendered `.ship-task-button`, its `::before`/`::after` pseudo-elements, and `.ship-task-leader` SVG polylines.
- Produces: computed-style proof for the polygon edge layers, responsive rollback, and leader stroke contract at every certified viewport.

- [ ] **Step 1: Add the Android desktop-site viewport**

Add this entry between tablet and mobile:

```js
{ width: 980, height: 720, label: 'android-desktop-site' },
```

- [ ] **Step 2: Add failing callout-layer assertions**

Extend `desktopCalloutContract` with real computed pseudo-element styles:

```js
const before = getComputedStyle(button, '::before');
const after = getComputedStyle(button, '::after');
return {
  // existing fields
  borderTopWidth: style.borderTopWidth,
  beforeContent: before.content,
  beforeInset: before.inset,
  beforeClipPath: before.clipPath,
  afterContent: after.content,
  afterWidth: after.width,
};
```

For `viewport.width > 820`, require:

```js
assert.equal(desktopCalloutContract.every(({ borderTopWidth }) => borderTopWidth === '0px'), true);
assert.equal(desktopCalloutContract.every(({ beforeContent }) => beforeContent !== 'none'), true);
assert.equal(desktopCalloutContract.every(({ beforeInset }) => beforeInset === '1px'), true);
assert.equal(desktopCalloutContract.every(({ beforeClipPath }) => beforeClipPath !== 'none'), true);
assert.equal(desktopCalloutContract.every(({ afterContent }) => afterContent !== 'none'), true);
assert.equal(desktopCalloutContract.every(({ afterWidth }) => afterWidth === '3px'), true);
```

For `viewport.width <= 820`, require:

```js
assert.equal(desktopCalloutContract.every(({ borderTopWidth }) => borderTopWidth === '1px'), true);
assert.equal(desktopCalloutContract.every(({ beforeContent, afterContent }) => beforeContent === 'none' && afterContent === 'none'), true);
```

- [ ] **Step 3: Add failing leader-style assertions**

After the existing leader count assertions, evaluate all leader styles:

```js
const leaderStyles = await page.locator('.ship-task-leader').evaluateAll((leaders) => leaders.map((leader) => {
  const style = getComputedStyle(leader);
  return {
    active: leader.classList.contains('is-active'),
    dasharray: style.strokeDasharray,
    width: Number.parseFloat(style.strokeWidth),
  };
}));
assert.equal(leaderStyles.every(({ dasharray }) => dasharray === 'none'), true, `${viewport.label} leaders are solid`);
assert.equal(leaderStyles.every(({ active, width }) => Math.abs(width - (active ? 2 : 1.5)) < .01), true, `${viewport.label} leader widths`);
```

- [ ] **Step 4: Run the browser test and verify RED**

Run:

```powershell
node tools/scripts/test-cohesion-ship-visual.mjs
```

Expected: FAIL because desktop callouts still compute a 1px rectangular border with no pseudo-element layers, and leaders still compute a dashed 1px/1.5px stroke.

---

### Task 2: Paint genuine beveled edges and solid leaders

**Files:**
- Modify: `styles/directive.css:4677-4751`
- Modify: `styles/directive.css:4838-4851`

**Interfaces:**
- Consumes: existing `.ship-task-button` children and state classes plus `.ship-task-leader.is-active`.
- Produces: continuous polygon edge painting, responsive rectangular rollback, and unchanged leader geometry with new stroke presentation.

- [ ] **Step 1: Replace the clipped rectangular border with layered variables**

In the desktop button rule, define:

```css
--ship-task-edge: rgba(155, 130, 207, .5);
--ship-task-accent: var(--directive-expanded-violet);
--ship-task-surface: rgba(12, 15, 24, .94);
```

Then replace the rectangular border/background declarations with:

```css
background: var(--ship-task-edge);
border: 0;
isolation: isolate;
```

Keep the existing 4px outer `clip-path`.

- [ ] **Step 2: Add the inner surface, left accent, and content stacking**

Add:

```css
.directive-expanded-shell .ship-task-button::before {
  content: "";
  position: absolute;
  z-index: 0;
  inset: 1px;
  background: var(--ship-task-surface);
  clip-path: polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px);
  pointer-events: none;
}
.directive-expanded-shell .ship-task-button::after {
  content: "";
  position: absolute;
  z-index: 1;
  top: 4px;
  bottom: 4px;
  left: 0;
  width: 3px;
  background: var(--ship-task-accent);
  pointer-events: none;
}
.directive-expanded-shell .ship-task-button > * { position: relative; z-index: 2; }
```

Change hover/selection to update variables while retaining the existing text/icon state:

```css
.directive-expanded-shell .ship-task-button:hover,
.directive-expanded-shell .ship-task-button.is-selected {
  --ship-task-edge: #ffa24f;
  --ship-task-accent: #ffa24f;
  --ship-task-surface: rgba(25, 22, 30, .98);
}
```

- [ ] **Step 3: Restore the responsive accordion presentation**

Inside `@media (max-width: 820px)`, add to the button override:

```css
background: var(--ship-task-surface);
border: 1px solid var(--ship-task-edge);
border-left: 3px solid var(--ship-task-accent);
isolation: auto;
```

Disable the polygon layers and stacking changes:

```css
.directive-expanded-shell .ship-task-button::before,
.directive-expanded-shell .ship-task-button::after { content: none; }
.directive-expanded-shell .ship-task-button > * { position: static; z-index: auto; }
```

Retain the current `clip-path: none`, rounded closed/open radii, and accordion widths.

- [ ] **Step 4: Make leader strokes solid at the approved weights**

Change only the presentation declarations:

```css
.directive-expanded-shell .ship-task-leader {
  stroke-width: 1.5;
  stroke-dasharray: none;
}
.directive-expanded-shell .ship-task-leader.is-active { stroke-width: 2; }
```

- [ ] **Step 5: Run the focused browser test and verify GREEN**

Run:

```powershell
node tools/scripts/test-cohesion-ship-visual.mjs
```

Expected: PASS across desktop, tablet, Android desktop-site, mobile, and compact-mobile viewports with zero overlap and crossing assertions unchanged.

---

### Task 3: Visual review, full gate, and scoped publication

**Files:**
- Review: generated `artifacts/cohesion-ship-visual/*.png`
- Verify: all task-owned files

**Interfaces:**
- Consumes: the corrected CSS and browser assertions.
- Produces: visually certified, fully tested, scoped commits published to `origin/main` without unrelated history.

- [ ] **Step 1: Inspect generated desktop screenshots**

Inspect 1440x900, 1024x768, and 980x720 initial and selected screenshots. Confirm every callout has continuous top, diagonal, side, and bottom edge painting; left accents terminate cleanly at the bevel; solid leaders remain subordinate to the ship; and selected amber states remain balanced.

- [ ] **Step 2: Run focused structural and interaction checks**

Run:

```powershell
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-cohesion-ship-interaction.mjs
node tools/scripts/test-cohesion-ship-visual.mjs
```

Expected: all three scripts exit 0.

- [ ] **Step 3: Run the full repository gate**

Run:

```powershell
npm.cmd test
git diff --check
```

Expected: the alpha gate reports all focused checks passing and the diff check exits 0.

- [ ] **Step 4: Review and commit only scoped files**

Run:

```powershell
git status --short
git diff -- styles/directive.css tools/scripts/test-cohesion-ship-visual.mjs docs/superpowers/specs/2026-08-15-ship-callout-bevel-border-correction-design.md docs/superpowers/plans/2026-08-15-ship-callout-bevel-border-correction.md
git add -- styles/directive.css tools/scripts/test-cohesion-ship-visual.mjs docs/superpowers/plans/2026-08-15-ship-callout-bevel-border-correction.md
git commit -m "fix(ship): paint continuous bevel edges"
```

- [ ] **Step 5: Reconcile and publish only the scoped branch tip**

Use GitHub CLI with network permission to verify current remote `main`. If remote advanced, fetch and merge `origin/main` into this branch without reset or force-push, rerun the full gate, then push the verified scoped tip to `origin/main`. Confirm with `gh api` that the correction commit is an ancestor of current remote `main`.
