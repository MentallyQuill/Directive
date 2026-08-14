# Ship Callout Layout and Cohesion Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build deterministic ship-anchored desktop callouts, compact interactive mobile callouts, and state-aware Cohesion ring motion with exact Playwright geometry proof.

**Architecture:** Store normalized semantic anchors beside each `ship.cohesion` package image, resolve them as immutable presentation metadata, and feed them to a pure geometry allocator that selects from eight responsive slots and routes one-elbow polylines to measured control corners. Keep selection and DOM lifecycle in the Ship journal, add mobile icon/level controls tied to the existing accordion, and animate logical SVG segment groups from their stable indices.

**Tech Stack:** Browser-native ES modules, SVG, CSS animations, Node.js `assert`, fake DOM fixtures, Playwright Chromium.

## Global Constraints

- Keep presentation placement out of campaign and save state.
- Use authored ship-image anchors; never infer locations from task prose or titles.
- Support at most five visible tasks across eight certified desktop slots and eight certified mobile slots.
- Cards are interchangeable and may use any slot or any of four corners.
- Reject control overlap and leader crossings before minimizing length and applying stable tie-breakers.
- Use one elbow and no ship-origin marker.
- Blue filled segments advance counterclockwise at two segments per second, span two neighboring segments, complete a revolution in 10 seconds, and never scale beyond `1.02`.
- Amber preview segments pulse together at `0.5 Hz`, continue while selected, and never scale beyond `1.02`.
- Debt segments never animate.
- Respect `prefers-reduced-motion: reduce` on desktop and mobile.
- Preserve Cohesion rules, task queueing, task details, accordion behavior, ring geometry, and front/back ship layering.

---

## File Structure

- Create `src/ui/ship-callout-layout.js`: pure normalized-image, slot, corner, intersection, routing, hashing, and global-assignment logic.
- Create `tools/scripts/test-ship-callout-layout.mjs`: focused pure-geometry contract.
- Create `tools/scripts/test-package-image-resolver.mjs`: focused immutable visual-anchor resolution contract.
- Modify `src/packages/package-image-resolver.mjs`: validate and expose image-bound `visualAnchors`.
- Modify `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json`: author the Breckenridge cohesion-art anchor atlas.
- Modify `packages/bundled/breckenridge/breckenridge.cohesion-catalog.json`: replace broad Breckenridge task anchors with precise atlas identifiers.
- Modify `src/ui/ship-journal.js`: render polylines and mobile badges, share task selection, measure DOM geometry, and schedule responsive layout.
- Modify `styles/directive.css`: style positioned controls, mobile badges/leaders, active states, and segment animations.
- Modify `tools/scripts/test-certified-ship-panel.mjs`: certify DOM semantics and mobile badge interaction.
- Modify `tools/scripts/test-cohesion-ship-interaction.mjs`: retain selection/preview behavior with the new controls.
- Modify `tools/fixtures/expanded-interface-runtime-fixture.mjs`: use precise anchor fixtures and expose deterministic anchor permutations for Playwright.
- Modify `tools/scripts/test-cohesion-ship-visual.mjs`: certify geometry, stability, interaction, animation, reduced motion, and screenshots.
- Modify `tools/scripts/test-v1-cohesion-contracts.mjs`: require the precise Breckenridge anchor vocabulary.
- Modify `tools/scripts/run-alpha-gate.mjs`: include the two new focused tests.

---

### Task 1: Package-Bound Visual Anchor Atlas

**Files:**
- Create: `tools/scripts/test-package-image-resolver.mjs`
- Modify: `src/packages/package-image-resolver.mjs`
- Modify: `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json`
- Modify: `packages/bundled/breckenridge/breckenridge.cohesion-catalog.json`
- Modify: `tools/scripts/test-v1-cohesion-contracts.mjs`
- Modify: `tools/fixtures/expanded-interface-runtime-fixture.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: package image records with optional `visualAnchors: Record<string, { x: number, y: number }>`.
- Produces: `resolvePackageImage(...).visualAnchors`, an immutable normalized record; precise task `anchor` strings used by the layout module.

- [ ] **Step 1: Write the failing resolver and catalog tests**

Create a resolver fixture containing valid anchors, out-of-range coordinates, non-finite values, and empty names. Assert the result keeps only finite coordinates in `[0, 1]`, freezes the outer record and points, and returns an empty frozen record for a placeholder:

```js
const resolved = resolvePackageImage({ assets: { images: [{
  id: 'ship.cohesion', kind: 'ship.cohesion', subjectId: 'ship.1',
  variants: { hero: 'ship.png' },
  visualAnchors: {
    bridge: { x: .62, y: .34 },
    invalid: { x: 2, y: .5 },
    nan: { x: Number.NaN, y: .2 },
  },
}] } }, { kind: 'ship.cohesion', subjectId: 'ship.1', variant: 'hero' });
assert.deepEqual(resolved.visualAnchors, { bridge: { x: .62, y: .34 } });
assert.equal(Object.isFrozen(resolved.visualAnchors), true);
assert.equal(Object.isFrozen(resolved.visualAnchors.bridge), true);
```

Extend the Cohesion contract test with:

```js
const preciseAnchors = new Set([
  'bridge', 'forward-sensors', 'central-saucer', 'crew-habitat',
  'engineering', 'port-nacelle', 'starboard-nacelle',
  'aft-hull', 'shuttlebay',
]);
for (const issue of [...catalog.authoredIssues, ...catalog.templates]) {
  assert.equal(preciseAnchors.has(issue.anchor), true, `${issue.id} precise anchor`);
}
```

- [ ] **Step 2: Run the tests to verify RED**

Run:

```powershell
node tools/scripts/test-package-image-resolver.mjs
node tools/scripts/test-v1-cohesion-contracts.mjs
```

Expected: the resolver test fails because `visualAnchors` is absent, and the catalog test fails on broad anchor names.

- [ ] **Step 3: Implement validated anchor resolution and Breckenridge data**

Add a resolver helper with this behavior:

```js
function visualAnchors(image) {
  const entries = Object.entries(image?.visualAnchors || {})
    .filter(([name, point]) => normalizeId(name)
      && Number.isFinite(Number(point?.x))
      && Number.isFinite(Number(point?.y))
      && Number(point.x) >= 0 && Number(point.x) <= 1
      && Number(point.y) >= 0 && Number(point.y) <= 1)
    .map(([name, point]) => [normalizeId(name), Object.freeze({ x: Number(point.x), y: Number(point.y) })]);
  return Object.freeze(Object.fromEntries(entries));
}
```

Return `visualAnchors: visualAnchors(image)` for image results and `visualAnchors: Object.freeze({})` for placeholders. Author this normalized Breckenridge atlas against the 1672-by-941 cohesion artwork:

```json
{
  "bridge": { "x": 0.58, "y": 0.24 },
  "forward-sensors": { "x": 0.82, "y": 0.50 },
  "central-saucer": { "x": 0.62, "y": 0.48 },
  "crew-habitat": { "x": 0.49, "y": 0.56 },
  "engineering": { "x": 0.30, "y": 0.24 },
  "port-nacelle": { "x": 0.09, "y": 0.15 },
  "starboard-nacelle": { "x": 0.48, "y": 0.10 },
  "aft-hull": { "x": 0.24, "y": 0.22 },
  "shuttlebay": { "x": 0.20, "y": 0.16 }
}
```

Replace every catalog/fixture broad anchor through an explicit authoring map: `forward -> forward-sensors`, `engineering -> engineering`, `department -> central-saucer`, `crew -> crew-habitat`, `central -> central-saucer`, `system -> engineering`, `region -> central-saucer`, and `aft -> aft-hull`. Keep the nacelle, bridge, and shuttlebay entries available for future authored tasks without assigning unsupported meaning to current tasks.

- [ ] **Step 4: Register and run the focused tests to verify GREEN**

Insert `test-package-image-resolver.mjs` near other package tests in `run-alpha-gate.mjs`. Run:

```powershell
node tools/scripts/test-package-image-resolver.mjs
node tools/scripts/test-v1-cohesion-contracts.mjs
```

Expected: both pass.

- [ ] **Step 5: Commit the atlas contract**

```powershell
git add -- src/packages/package-image-resolver.mjs packages/bundled/breckenridge/ashes-of-peace.campaign-package.json packages/bundled/breckenridge/breckenridge.cohesion-catalog.json tools/fixtures/expanded-interface-runtime-fixture.mjs tools/scripts/test-package-image-resolver.mjs tools/scripts/test-v1-cohesion-contracts.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(ship): author cohesion anchors"
```

---

### Task 2: Deterministic Callout Geometry

**Files:**
- Create: `src/ui/ship-callout-layout.js`
- Create: `tools/scripts/test-ship-callout-layout.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `{ mode, orbitRect, imageRect, imageNaturalSize, anchors, shipId, tasks, controlSizes }`.
- Produces: `createShipCalloutLayout(input) -> { placements, crossingCount, valid }`, where each placement contains `{ taskId, slotId, corner, controlRect, points }`.
- Produces helpers `renderedContainRect`, `resolveAnchorPoint`, `controlCorners`, and `segmentsIntersect` for focused verification.

- [ ] **Step 1: Write the failing geometry tests**

Cover contain-letterboxing, all corners, line intersections, stable reruns, different task-ID preference orders, zero-overlap/eight-slot assignment, and fallback anchors. A representative assertion:

```js
const input = {
  mode: 'desktop',
  orbitRect: { x: 0, y: 0, width: 900, height: 500 },
  imageRect: { x: 45, y: 65, width: 810, height: 360 },
  imageNaturalSize: { width: 1672, height: 941 },
  anchors,
  shipId: 'uss-breckenridge',
  tasks: fiveTasks,
  controlSizes: Object.fromEntries(fiveTasks.map(({ id }) => [id, { width: 190, height: 50 }])),
};
const result = createShipCalloutLayout(input);
assert.equal(result.valid, true);
assert.equal(result.placements.length, 5);
assert.equal(new Set(result.placements.map(({ slotId }) => slotId)).size, 5);
assert.equal(result.crossingCount, 0);
assert.deepEqual(createShipCalloutLayout(input), createShipCalloutLayout(input));
```

- [ ] **Step 2: Run the geometry test to verify RED**

Run: `node tools/scripts/test-ship-callout-layout.mjs`

Expected: FAIL because `src/ui/ship-callout-layout.js` does not exist.

- [ ] **Step 3: Implement the pure layout module**

Define frozen eight-slot tables with these initial normalized control centers:

```js
const DESKTOP_SLOTS = [
  ['upper-left-outer', .13, .16], ['upper-left-inner', .16, .32],
  ['upper-right-outer', .87, .16], ['upper-right-inner', .84, .32],
  ['lower-left-outer', .14, .66], ['lower-left-inner', .18, .82],
  ['lower-right-outer', .86, .66], ['lower-right-inner', .82, .82],
];
const MOBILE_SLOTS = [
  ['top-left', .34, .06], ['top-right', .66, .06],
  ['right-top', .93, .31], ['right-bottom', .93, .64],
  ['bottom-right', .66, .90], ['bottom-left', .34, .90],
  ['left-bottom', .07, .64], ['left-top', .07, .31],
];
```

Slots include stable IDs and quadrant metadata. Implement FNV-1a stable hashing for preference rotation. Convert normalized anchors through the intrinsic contain rectangle. For each task/slot pair, construct a control rectangle, enumerate four corners, create a radial 14-pixel exit elbow, and retain the shortest candidate that stays in bounds and avoids unrelated controls.

Enumerate unique slot assignments for no more than five tasks. Compare complete candidates lexicographically by:

```js
[
  outOfBoundsCount,
  overlapCount,
  crossingCount,
  controlTraversalCount,
  totalLength,
  stablePreferencePenalty,
  stableLexicalKey,
]
```

Return the lowest score and expose the crossing count. Use `central-saucer`, then `{ x: .5, y: .5 }`, as deterministic fallbacks.

- [ ] **Step 4: Register and run the geometry test to verify GREEN**

Add `test-ship-callout-layout.mjs` before the Ship interaction tests in `run-alpha-gate.mjs`.

Run: `node tools/scripts/test-ship-callout-layout.mjs`

Expected: `Ship callout layout geometry passed.`

- [ ] **Step 5: Commit the geometry engine**

```powershell
git add -- src/ui/ship-callout-layout.js tools/scripts/test-ship-callout-layout.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(ship): route deterministic callouts"
```

---

### Task 3: Desktop Measured Callouts

**Files:**
- Modify: `src/ui/ship-journal.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-certified-ship-panel.mjs`
- Modify: `tools/scripts/test-cohesion-ship-interaction.mjs`

**Interfaces:**
- Consumes: `resolvePackageImage(...).visualAnchors` and `createShipCalloutLayout({ mode: 'desktop', ... })`.
- Produces: `.ship-task-leader` SVG polylines with `data-slot`, `data-corner`, and finite `points`; absolutely positioned `.ship-task-button` controls without index-specific CSS positions.

- [ ] **Step 1: Write failing DOM assertions**

Change fake-DOM fixtures to expose exact anchors. Assert leader elements are `POLYLINE`, task buttons no longer receive `ship-task-position-N`, task groups retain stable IDs, and each segment receives `--ship-cohesion-index`. Preserve all existing interaction assertions.

```js
assert.equal(byClass('ship-task-leader').every(({ tagName }) => tagName === 'POLYLINE'), true);
assert.equal(byClass('ship-task-button').every((button) => !/ship-task-position-/.test(button.className)), true);
assert.deepEqual(logicalSegments.map((node) => node.style.values.get('--ship-cohesion-index')), Array.from({ length: 20 }, (_, i) => String(i)));
```

- [ ] **Step 2: Run DOM tests to verify RED**

Run:

```powershell
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-cohesion-ship-interaction.mjs
```

Expected: FAIL on line element type, old position classes, and missing segment index variables.

- [ ] **Step 3: Implement desktop rendering and lifecycle**

Replace hard-coded `LEADER_ENDPOINTS` and SVG `<line>` creation with one `<polyline>` per task. Resolve the package cohesion image metadata alongside `createPackageImage`. Render all desktop cards initially measurable at the orbit origin, collect their dimensions, call `createShipCalloutLayout`, then apply `left`, `top`, `data-slot`, `data-corner`, and polyline points.

Coalesce image load, orbit resize, and window fallback through one `requestAnimationFrame`. If geometry is invalid, add `.is-layout-unavailable` to the leader SVG and leave cards in a readable fallback stack. Stop scheduling when `workspace.isConnected === false`.

Replace the five position rules with geometry-applied inline coordinates and a CSS fallback grid used only under `.is-layout-unavailable`. Preserve the z-order `back ring < ship < front ring < leaders < controls`.

- [ ] **Step 4: Run DOM tests to verify GREEN**

Run:

```powershell
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-cohesion-ship-interaction.mjs
```

Expected: both pass with existing selection and preview behavior intact.

- [ ] **Step 5: Commit desktop callouts**

```powershell
git add -- src/ui/ship-journal.js styles/directive.css tools/scripts/test-certified-ship-panel.mjs tools/scripts/test-cohesion-ship-interaction.mjs
git commit -m "fix(ship): attach desktop leader lines"
```

---

### Task 4: Mobile Icon-and-Level Callouts

**Files:**
- Modify: `src/ui/ship-journal.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-certified-ship-panel.mjs`
- Modify: `tools/scripts/test-cohesion-ship-interaction.mjs`

**Interfaces:**
- Consumes: shared task selection, mobile `createShipCalloutLayout`, and existing category-icon rendering.
- Produces: `.ship-task-mobile-callout` buttons with icon, `.ship-task-mobile-level`, accessible task context, and matching `data-task-id`.

- [ ] **Step 1: Write failing mobile-control tests**

Assert one badge per task, exact accessible labels, icon/level content, and synchronized selected state. Extend the fake element with `scrollIntoView` recording and `matchMedia` stubs. Click the second badge and assert its task button becomes selected, its panel opens, and its panel receives `{ behavior: 'smooth', block: 'nearest' }` when motion is allowed.

```js
assert.equal(byClass('ship-task-mobile-callout').length, visibleTasks.length);
assert.match(mobileBadges[1].getAttribute('aria-label'), /Systems Integration, level 3, restores 15 Cohesion/i);
mobileBadges[1].click();
assert.equal(taskButtons[1].getAttribute('aria-expanded'), 'true');
assert.deepEqual(mobilePanels[1].scrollRequest, { behavior: 'smooth', block: 'nearest' });
```

- [ ] **Step 2: Run interaction tests to verify RED**

Run:

```powershell
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-cohesion-ship-interaction.mjs
```

Expected: FAIL because mobile callout buttons do not exist.

- [ ] **Step 3: Implement badges and shared selection**

Render an absolute `.ship-task-mobile-callouts` layer containing buttons with the existing decorative icon and a visible `L${task.level}` label. Badge click calls `select(task.id)`, force-opens exactly one accordion panel, and schedules `scrollIntoView`. Use `matchMedia('(prefers-reduced-motion: reduce)')` to choose `auto` instead of `smooth`.

On mobile, reuse the leader SVG and route it to badge corners. Keep all leaders subdued, with `.is-active` following pointer/focus/selection preview. Hide desktop cards only through the existing responsive task-nav layout; do not remove the accordion.

- [ ] **Step 4: Run interaction tests to verify GREEN**

Run:

```powershell
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-cohesion-ship-interaction.mjs
```

Expected: both pass, including badge-to-accordion scrolling and existing task-button toggling.

- [ ] **Step 5: Commit mobile callouts**

```powershell
git add -- src/ui/ship-journal.js styles/directive.css tools/scripts/test-certified-ship-panel.mjs tools/scripts/test-cohesion-ship-interaction.mjs
git commit -m "feat(ship): connect mobile task badges"
```

---

### Task 5: Blue Wave and Amber Preview Motion

**Files:**
- Modify: `src/ui/ship-journal.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-certified-ship-panel.mjs`
- Modify: `tools/scripts/test-cohesion-ship-visual.mjs`

**Interfaces:**
- Consumes: logical segment index custom property and existing `.is-filled`, `.is-debt`, and `.is-preview` classes.
- Produces: `ship-cohesion-blue-wave` and `ship-cohesion-preview-pulse` animations.

- [ ] **Step 1: Add failing motion assertions**

In Playwright, collect `getAnimations()` names, durations, delays, and keyframes for filled, debt, and preview segments. Assert filled segments use a 10-second wave with 0.5-second counterclockwise index offsets, debt segments have no animation, preview segments use one synchronized two-second animation, and every transform keyframe stays at or below `scale(1.02)`.

```js
assert.equal(new Set(filledAnimations.map(({ name }) => name)).has('ship-cohesion-blue-wave'), true);
assert.equal(debtAnimations.length, 0);
assert.equal(new Set(previewAnimations.map(({ duration }) => duration)).size, 1);
assert.equal(previewAnimations[0].duration, 2000);
assert.equal(new Set(previewAnimations.map(({ currentTime }) => Math.round(currentTime))).size, 1);
```

- [ ] **Step 2: Run the visual test to verify RED**

Run: `node tools/scripts/test-cohesion-ship-visual.mjs`

Expected: FAIL because the ring has no animations.

- [ ] **Step 3: Implement the CSS timelines**

Set `--ship-cohesion-index` on every logical segment. Apply a 10-second infinite animation only to `.is-filled:not(.is-preview)`. Derive counterclockwise delay from `(20 - index) % 20`, and shape the emphasized portion to one second so adjacent 0.5-second starts overlap. Animate from the base blue state through a restrained brighter glow at `scale(1.02)` and back.

Apply a separate two-second infinite animation to `.is-preview`, with no index-dependent delay. Ensure the preview selector outranks the filled selector. Set `transform-box: fill-box` and `transform-origin: center`. Under reduced motion, set `animation: none !important` and `transition-duration: 0.001ms` for the segment group.

- [ ] **Step 4: Run the visual test to verify GREEN**

Run: `node tools/scripts/test-cohesion-ship-visual.mjs`

Expected: `Cohesion Ship Playwright visual certification passed.`

- [ ] **Step 5: Commit Cohesion motion**

```powershell
git add -- src/ui/ship-journal.js styles/directive.css tools/scripts/test-certified-ship-panel.mjs tools/scripts/test-cohesion-ship-visual.mjs
git commit -m "feat(ship): animate cohesion flow"
```

---

### Task 6: Geometry and Responsive Visual Certification

**Files:**
- Modify: `tools/fixtures/expanded-interface-runtime-fixture.mjs`
- Modify: `tools/scripts/test-cohesion-ship-visual.mjs`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs` only if the new mobile controls change its certified selectors.

**Interfaces:**
- Consumes: rendered `data-slot`, `data-corner`, anchor name, polyline points, ring rectangle, badge rectangles, and exposed crossing count.
- Produces: exact desktop/mobile geometry evidence and fresh screenshots in `artifacts/cohesion-ship-visual/`.

- [ ] **Step 1: Add failing exact geometry assertions**

For each certified viewport, read the polyline's first/last SVG points through `getScreenCTM()`, reconstruct the selected control corner from `data-corner`, and assert both endpoint distances are at most `1.5` CSS pixels. Add rectangle-overlap and segment-crossing helpers in the browser evaluation.

Assert desktop cards are in bounds, unique, non-overlapping, and zero-crossing. Assert mobile badges are outside the ring boundary, clear of the defined ship-safe ellipse, unique, non-overlapping, and zero-crossing. Reload to prove stable assignments, resize away and back to prove restoration, and exercise a query-driven reverse-anchor fixture.

- [ ] **Step 2: Run the visual test to expose remaining geometry defects**

Run: `node tools/scripts/test-cohesion-ship-visual.mjs`

Expected: FAIL with a precise endpoint, overlap, crossing, or bounds assertion if the first-pass calibration is incomplete.

- [ ] **Step 3: Calibrate certified slot and anchor coordinates**

Adjust only the named slot tables, Breckenridge atlas coordinates, mobile ring size, badge dimensions, and elbow exit distance required to satisfy the exact assertions at 1440x900, 1024x768, 390x844, and 360x500. Preserve the approved eight-slot pools, 102% animation cap, task copy, and gameplay state.

- [ ] **Step 4: Inspect fresh screenshots and rerun focused gates**

Run:

```powershell
node tools/scripts/test-package-image-resolver.mjs
node tools/scripts/test-ship-callout-layout.mjs
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-cohesion-ship-interaction.mjs
node tools/scripts/test-cohesion-ship-visual.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Inspect:

- `artifacts/cohesion-ship-visual/desktop-1440x900-initial.png`
- `artifacts/cohesion-ship-visual/tablet-1024x768-initial.png`
- `artifacts/cohesion-ship-visual/mobile-390x844-initial.png`
- `artifacts/cohesion-ship-visual/compact-mobile-360x500-initial.png`

Expected: all focused tests pass; every line touches its control; ship origins are logical; badges remain outside the ring; selected states agree; blue and amber motion remain restrained.

- [ ] **Step 5: Commit visual certification**

```powershell
git add -- tools/fixtures/expanded-interface-runtime-fixture.mjs tools/scripts/test-cohesion-ship-visual.mjs tools/scripts/test-expanded-interface-visual-conformance.mjs src/ui/ship-callout-layout.js styles/directive.css packages/bundled/breckenridge/ashes-of-peace.campaign-package.json
git commit -m "test(ship): certify callout geometry"
```

---

### Task 7: Full Gate and Main Integration

**Files:**
- Verify only unless a gate exposes an in-scope regression.

**Interfaces:**
- Consumes: all implementation commits.
- Produces: clean full-gate evidence and synchronized local/remote `main`.

- [ ] **Step 1: Run the full repository gate**

Run: `npm.cmd test`

Expected: every focused Node and Playwright check passes.

- [ ] **Step 2: Inspect final scope and commit any test-only correction**

Run:

```powershell
git status --short
git diff --check
git log -8 --oneline
```

Expected: no uncommitted implementation changes, no whitespace errors, and only the approved Ship design/plan/implementation commits ahead of the starting `main`.

- [ ] **Step 3: Reconcile remote main without discarding work**

Run:

```powershell
git pull --rebase origin main
npm.cmd test
```

Expected: rebase succeeds without losing local commits, and the post-rebase full gate passes.

- [ ] **Step 4: Push verified main**

Run: `git push origin main`

Expected: remote `main` accepts the verified commits.

- [ ] **Step 5: Verify exact local and remote SHA**

Run:

```powershell
$localSha = git rev-parse HEAD
$remoteSha = git ls-remote origin refs/heads/main
"LOCAL_SHA=$localSha"
"REMOTE_MAIN=$remoteSha"
git status --short
```

Expected: local and remote SHA match and the working tree is clean.
