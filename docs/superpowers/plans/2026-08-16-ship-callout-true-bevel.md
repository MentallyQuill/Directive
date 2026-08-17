# Ship Callout True Bevel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop Ship callout chamfers with rectangular 3px light/dark bevel planes while preserving compact sizing, responsive accordions, and the approved leader lines.

**Architecture:** The existing desktop button remains the sole callout surface. Its polygon clipping and pseudo-element shell are removed in favor of four explicit border planes; the existing `max-width: 820px` rule continues to own the unchanged accordion presentation.

**Tech Stack:** CSS, JavaScript, Node.js, Playwright.

## Global Constraints

- Change only desktop callouts beside the Ship graphic.
- Keep desktop callout widths title-sized and preserve `L{n}` before the category symbol.
- Desktop callouts use no corner clipping and a 3px bevel.
- Mobile badges, mobile accordion rows, and desktop accordion rows remain unchanged.
- Leader lines remain solid at 1.5px normally and 2px highlighted.

---

### Task 1: Replace the chamfer contract with a true-bevel contract

**Files:**
- Modify: `tools/scripts/test-cohesion-ship-visual.mjs`

**Interfaces:**
- Consumes: computed styles from `.ship-task-button` at each certified viewport.
- Produces: a browser-level regression contract for intact corners and directional bevel planes.

- [ ] **Step 1: Change the desktop computed-style assertions**

Capture `borderTopColor`, `borderRightColor`, `borderBottomColor`, `borderLeftColor`, and `borderTopWidth`. For viewports wider than 820px, require `clipPath === 'none'`, a 3px border on every card, equal light top/left colors, equal dark bottom/right colors, and different light/dark planes. Require both pseudo-elements to compute `content: none`.

- [ ] **Step 2: Preserve the responsive contract**

For viewports at or below 820px, retain the existing assertions for `clipPath === 'none'`, a 1px top border, hidden desktop level, and disabled pseudo-elements.

- [ ] **Step 3: Run the visual test and verify RED**

Run:

```powershell
node tools/scripts/test-cohesion-ship-visual.mjs
```

Expected: FAIL because the current desktop cards compute a polygon `clip-path` and a 0px border.

---

### Task 2: Paint rectangular bevel planes and certify the correction

**Files:**
- Modify: `styles/directive.css`
- Modify: `docs/superpowers/plans/2026-08-16-ship-callout-true-bevel.md`

**Interfaces:**
- Consumes: existing normal, hover, selected, and responsive `.ship-task-button` states.
- Produces: compact desktop cards with intact corners and a shallow directional bevel.

- [ ] **Step 1: Replace the desktop polygon shell**

Remove the desktop bevel-size variable, polygon `clip-path`, polygon pseudo-element surfaces, isolation, and child stacking. Restore the dark surface as the button background. Set a 3px solid border with a lighter top/left color and darker bottom/right color, plus a restrained 2px radius.

- [ ] **Step 2: Preserve the interaction colors**

Keep the normal violet edge family. On hover and selection, change the light plane to orange and the dark plane to burnt orange while retaining the current dark selected surface.

- [ ] **Step 3: Keep the responsive rows unchanged**

Leave the current `max-width: 820px` button geometry, 1px border, 3px left accent, 4px radius, and pseudo-element disabling behavior intact. Remove only declarations that existed to undo the desktop polygon implementation and are no longer necessary.

- [ ] **Step 4: Run focused verification and inspect screenshots**

Run:

```powershell
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-cohesion-ship-interaction.mjs
node tools/scripts/test-cohesion-ship-visual.mjs
git diff --check
```

Inspect the initial and selected screenshots at 1440x900, 1024x768, and 980x720. Confirm intact rectangular corners, visible but restrained bevel depth, and unchanged leader routing and weights. Inspect 390x844 and 360x500 to confirm accordion rows remain unchanged.

- [ ] **Step 5: Run the full gate**

Run:

```powershell
npm.cmd test
```

Expected: all focused checks pass.

- [ ] **Step 6: Review, commit, reconcile, and publish**

Stage only the design, plan, CSS, and Ship visual-test files. Commit the correction, fetch current GitHub `main`, merge any concurrent work without resetting or force-pushing, rerun the full gate if the merge changes the branch, push the scoped branch tip to `origin/main`, and confirm the code commit is an ancestor of remote `main`.
