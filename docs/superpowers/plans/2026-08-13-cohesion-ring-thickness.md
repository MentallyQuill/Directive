# Cohesion Ring Thickness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every curved Cohesion segment exactly four times thicker while keeping the twenty rounded segments visibly separate.

**Architecture:** Retain the existing two-layer SVG ring and all Cohesion state classes. Change only the CSS stroke widths and the shared arc-end trim used to generate each segment path; extend Playwright geometry coverage so both thickness and separation remain certified.

**Tech Stack:** Browser-native SVG, CSS, Node assertions, Playwright Chromium.

## Global Constraints

- Desktop stroke width is exactly `clamp(20px, 2.8vw, 32px)`.
- Stroke width at 820px and below is exactly `15px`.
- All twenty segments retain rounded caps, existing state colors, ownership, preview, and front/back layering.
- Neighboring visual gaps remain between four and eight CSS pixels at every certified viewport.
- Preserve unrelated `debug.log`, attachment, and documentation changes.

---

### Task 1: Certify four-times-thicker geometry

**Files:**
- Modify: `tools/scripts/test-cohesion-ship-visual.mjs`

**Interfaces:**
- Consumes: computed `strokeWidth` for `.ship-cohesion-segment` at the existing certified viewports.
- Produces: failing assertions requiring `20..32px` desktop strokes and `15px` mobile strokes while retaining the existing four-to-eight-pixel gap contract.

- [ ] **Step 1: Add the thickness assertions**

Capture `Number.parseFloat(getComputedStyle(segments[0]).strokeWidth)` in the existing geometry record. For widths above 820px assert `20 <= strokeWidth <= 32`; otherwise assert `Math.abs(strokeWidth - 15) <= 0.1`.

- [ ] **Step 2: Run the visual test and confirm RED**

```powershell
node tools/scripts/test-cohesion-ship-visual.mjs
```

Expected: fail because the baseline strokes are `5..8px` desktop and `3.75px` mobile.

### Task 2: Thicken strokes and preserve separation

**Files:**
- Modify: `styles/directive.css`
- Modify: `src/ui/ship-journal.js`

**Interfaces:**
- Consumes: `cohesionArcPath(index)` and existing segment state selectors.
- Produces: four-times-thicker strokes and symmetrically shortened arc paths.

- [ ] **Step 1: Quadruple the CSS stroke widths**

Replace desktop `clamp(5px, .7vw, 8px)` with `clamp(20px, 2.8vw, 32px)` and mobile `3.75px` with `15px`.

- [ ] **Step 2: Increase the arc-end trim**

Increase both per-segment angular trims from `1.9` degrees to `4.75` degrees. Do not change radius, segment count, layer assignment, or index order.

- [ ] **Step 3: Run Playwright and confirm GREEN**

```powershell
node tools/scripts/test-cohesion-ship-visual.mjs
```

Expected: `Cohesion Ship Playwright visual certification passed.`

- [ ] **Step 4: Inspect generated screenshots**

Inspect desktop 1440x900, mobile 390x844, and compact mobile 360x500 images for distinct segments, round caps, correct hull occlusion, and no title or accordion overlap.

### Task 3: Verify and publish

**Files:**
- Verify: all modified specification, plan, renderer, CSS, and visual test files.

**Interfaces:**
- Consumes: the completed geometry change.
- Produces: a tested commit merged and pushed to `main`.

- [ ] **Step 1: Run the full gate**

```powershell
npm.cmd test
```

Expected: all 124 focused checks pass.

- [ ] **Step 2: Commit only intended files**

```powershell
git add docs/superpowers/specs/2026-08-13-cohesion-command-work-design.md docs/superpowers/plans/2026-08-13-cohesion-ring-thickness.md src/ui/ship-journal.js styles/directive.css tools/scripts/test-cohesion-ship-visual.mjs
git commit -m "style(ship): thicken cohesion ring"
```

- [ ] **Step 3: Merge, retest, and push main**

Merge the feature branch without discarding concurrent `main` commits, rerun `npm.cmd test`, push `main`, and verify local and GitHub API SHAs match.
