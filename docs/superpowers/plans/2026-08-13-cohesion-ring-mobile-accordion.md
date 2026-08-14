# Curved Cohesion Ring and Mobile Accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tangent Cohesion markers with a layered curved ring and replace stretched mobile task cards with a compact, single-open accordion.

**Architecture:** `ship-journal.js` creates twenty SVG arc paths split across back and front layers around the existing ship image, while retaining one DOM node per authoritative Cohesion segment. The same task buttons remain desktop leader-line controls and become mobile accordion headers; each receives a dedicated hidden inline detail region, while desktop retains the existing shared detail region.

**Tech Stack:** Browser-native DOM and SVG, CSS responsive layout, Node assertion scripts, Playwright Chromium.

## Global Constraints

- Preserve all Cohesion authority, segment ownership, task generation, reward, hover/focus preview, and Command Bearing behavior.
- Render exactly twenty segment nodes: ten on the right/back layer and ten on the left/front layer.
- Use curved SVG paths with round caps and approximately four-to-eight CSS pixels between neighboring segments.
- Desktop keeps leader lines and one shared detail panel.
- At 820px and below, show a single-column task accordion with zero or one open region.
- Mobile detail bodies must not repeat the task title, icon, level eyebrow, or reward header.
- Keep unrelated work and tracked `debug.log` diagnostics out of commits.

---

### Task 1: Certify the new DOM and accordion contract

**Files:**
- Modify: `tools/scripts/test-certified-ship-panel.mjs`
- Modify: `tools/scripts/test-cohesion-ship-interaction.mjs`

**Interfaces:**
- Consumes: `renderShipPanel(body, view, actions)` and the existing fake DOM fixtures.
- Produces: failing assertions for layered SVG arcs, associated mobile regions, and exclusive disclosure.

- [ ] **Step 1: Add failing structural assertions**

Assert that `.ship-cohesion-segment` contains twenty `PATH` elements, `.ship-cohesion-ring-layer.is-back` and `.is-front` each contain ten, every segment path has an SVG arc command in `d`, and every task button controls a unique `.ship-task-mobile-panel`.

- [ ] **Step 2: Add failing accordion interaction assertions**

Verify all task headers begin with `aria-expanded="false"`; clicking task two makes only its region visible; clicking task one hides task two and reveals task one; clicking task one again returns to zero visible regions. Assert the inline region contains task sections but no `.ship-task-detail-header`.

- [ ] **Step 3: Run the focused tests and confirm RED**

Run:

```powershell
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-cohesion-ship-interaction.mjs
```

Expected: both fail because the current ring uses `SPAN` capsules and no per-task mobile detail regions exist.

### Task 2: Render curved layers and exclusive task disclosure

**Files:**
- Modify: `src/ui/ship-journal.js`

**Interfaces:**
- Consumes: `ship.cohesion.segments`, `ship.cohesion.visibleTasks`, and existing task/detail helpers.
- Produces: `createRing()` returning `{ root, segments }`, curved path nodes split across `.is-back` and `.is-front`, and one `.ship-task-mobile-panel` per task.

- [ ] **Step 1: Add the fixed-viewBox arc helper**

Create a helper that maps segment index `0..19` to a radius-44 arc centered at `(50, 50)`. Each sector spans 18 degrees and removes 1.5 degrees from both ends. Index zero begins in the upper-right quadrant; indices `0..9` occupy the right hemisphere and indices `10..19` occupy the left hemisphere.

- [ ] **Step 2: Replace capsule spans with SVG paths**

Create one back and one front SVG layer inside a non-stacking ring root. Give every path its state classes, stable `data-segment-index`, optional `data-task-id`, accessible label, and curved `d` value. Return the path array directly so preview logic does not depend on wrapper children.

- [ ] **Step 3: Split full and inline task detail composition**

Allow `createDetail()` to omit its header. Desktop shared detail calls the full variant. Each mobile panel calls the headerless variant so the expanded content begins with bound crew or `What needs your attention`.

- [ ] **Step 4: Add exclusive accordion state**

Create a unique panel id for each task. Set `aria-expanded="false"` initially and `hidden=true` on every mobile panel. On activation, select the task for desktop behavior, then open the requested mobile panel and close its peer; activating the already-open panel closes it. Keep focus and pointer handlers preview-only.

- [ ] **Step 5: Run focused DOM tests and confirm GREEN**

Run:

```powershell
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-cohesion-ship-interaction.mjs
```

Expected: `PASS certified Cohesion Ship panel` and `Cohesion Ship interactions passed.`

### Task 3: Implement the layered responsive presentation

**Files:**
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: the ring layer, task button, reward, summary, and mobile panel classes from Task 2.
- Produces: centered ship/ring geometry, `back < ship < front < leaders < tasks` stacking, desktop leader-line controls, and mobile accordion presentation.

- [ ] **Step 1: Style SVG ring layers and segment states**

Center both SVG layers over the ship with identical dimensions. Use `fill:none`, responsive non-scaling strokes, `stroke-linecap:round`, and state-specific stroke colors/glows. Give back, ship, front, leaders, and task controls increasing z-index values `1..5`.

- [ ] **Step 2: Bound the mobile ship canvas**

At 820px and below, set the first orbit row to `clamp(240px, 78vw, 310px)`. Center a ring no larger than the row minus its safety inset and give the ship visual the same bounded row. Remove negative ring overflow so its top remains below the header divider.

- [ ] **Step 3: Style compact accordion headers**

Use one column, `align-content:start`, and max-content rows. Each header uses a two-line grid with a 44px minimum hit area, icon/title/disclosure on line one, current phase plus compact reward on line two, and no fixed or fractional height. Style `[aria-expanded="true"]` as the active mobile state.

- [ ] **Step 4: Switch detail modes responsively**

Hide `.ship-task-mobile-panel` on desktop. At 820px and below, hide the shared `.ship-task-detail`, reveal non-hidden inline panels directly below their task header, and keep command actions and text comfortably padded without repeating the header.

- [ ] **Step 5: Run the focused DOM tests again**

Run:

```powershell
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-cohesion-ship-interaction.mjs
```

Expected: both pass.

### Task 4: Certify real desktop and mobile geometry

**Files:**
- Modify: `tools/fixtures/expanded-interface-runtime-fixture.mjs`
- Modify: `tools/scripts/test-cohesion-ship-visual.mjs`

**Interfaces:**
- Consumes: preview URL query `taskCount`, Ship DOM/CSS from Tasks 2-3, Playwright Chromium.
- Produces: screenshots and geometry assertions for desktop, tablet, 390x844 mobile, and 360x500 compact mobile with two and five task cases.

- [ ] **Step 1: Add task-count control to the visual fixture**

Read `taskCount` from the preview URL, clamp it to `1..5`, and slice only `visibleTasks`. Leave the normal route unchanged when the parameter is absent.

- [ ] **Step 2: Replace capsule geometry checks with SVG and stacking checks**

Assert twenty paths, round line caps, ten paths per layer, centered layer/ship geometry within two pixels on mobile, ring top below both the orbit and header divider, and computed z-index order `back < ship < front < leaders < task controls` on desktop.

- [ ] **Step 3: Add mobile accordion checks**

For `taskCount=2` and `taskCount=5`, assert every collapsed header remains between 44 and 72px, no header stretches with available height, no inline panel is initially visible, one click reveals exactly one panel without a repeated `h3`, a peer click replaces it, and a second click collapses it.

- [ ] **Step 4: Run Playwright and inspect all screenshots**

Run:

```powershell
node tools/scripts/test-cohesion-ship-visual.mjs
```

Expected: `Cohesion Ship Playwright visual certification passed.` Inspect every PNG in `artifacts/cohesion-ship-visual/` for ring continuity, ship/ring centering, header clearance, accordion rhythm, and bottom-navigation clearance.

### Task 5: Verify and publish

**Files:**
- Verify all modified source, tests, CSS, design, and plan files.

**Interfaces:**
- Consumes: the completed implementation and repository test gate.
- Produces: a reviewed commit on the feature branch, a fast-forwarded `main`, and matching `origin/main`.

- [ ] **Step 1: Run the complete gate**

Run:

```powershell
npm.cmd test
```

Expected: all Directive alpha-gate checks pass.

- [ ] **Step 2: Review the scoped diff and remove generated diagnostics**

Confirm only the design, plan, Ship renderer, Ship CSS, fixtures, and Ship tests changed. Restore only Chromium-generated additions in tracked `debug.log`; do not touch unrelated files in the primary checkout.

- [ ] **Step 3: Commit the implementation**

```powershell
git add docs/superpowers/specs/2026-08-13-cohesion-command-work-design.md docs/superpowers/plans/2026-08-13-cohesion-ring-mobile-accordion.md src/ui/ship-journal.js styles/directive.css tools/fixtures/expanded-interface-runtime-fixture.mjs tools/scripts/test-certified-ship-panel.mjs tools/scripts/test-cohesion-ship-interaction.mjs tools/scripts/test-cohesion-ship-visual.mjs
git commit -m "feat(ship): curve cohesion ring and compact mobile tasks"
```

- [ ] **Step 4: Merge and push**

Fast-forward `main` only after confirming the primary checkout still contains only its pre-existing unrelated changes. Push `main`, then compare local `HEAD` with the GitHub API result for `origin/main`.
