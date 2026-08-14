# Cohesion Task Icons and Segmented Ring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the five supplied primary-family SVG icons to Ship task cards and detail titles, and reshape the Cohesion markers into a shallow segmented circle with approximately six-pixel gaps.

**Architecture:** The player-safe Ship projection exposes each task's existing `primaryFamily`. `ship-journal.js` maps that stable identifier to a decorative CSS-mask element, while local SVG files remain presentation-only assets. Ring geometry remains pure CSS and preserves the existing twenty segment nodes, ownership data, and interaction behavior.

**Tech Stack:** JavaScript ES modules, CSS masks and transforms, Node assertion scripts, Playwright Chromium.

## Global Constraints

- Use exactly one icon derived from `primaryFamily`; ignore `secondaryFamilies` for presentation.
- Map `personnel`, `coordination`, `training`, `systems`, and `shipboardLife` to the supplied SVGs.
- Render icons before titles on every visible task card and the selected detail header.
- Treat icons as decorative and preserve the adjacent title as the accessible name.
- Keep twenty Cohesion segments and all existing fill, debt, queue, preview, focus, and reduced-motion behavior.
- Target a marker depth of roughly one quarter of the former desktop depth and an inferred neighboring gap from four through eight pixels at every certified viewport.
- Do not add a model call, mutable gameplay state, or package-specific prompt behavior.

---

### Task 1: Player-safe family field and local SVG assets

**Files:**
- Create: `assets/icons/cohesion-task-categories/personnel.svg`
- Create: `assets/icons/cohesion-task-categories/coordination.svg`
- Create: `assets/icons/cohesion-task-categories/training.svg`
- Create: `assets/icons/cohesion-task-categories/systems.svg`
- Create: `assets/icons/cohesion-task-categories/life.svg`
- Modify: `src/projection/v1/ship-projection.mjs`
- Test: `tools/scripts/test-v1-cohesion-projection.mjs`

**Interfaces:**
- Consumes: `cohesionState.visibleTasks[].primaryFamily: string` from `deriveCohesionState()`.
- Produces: `projection.cohesion.visibleTasks[].primaryFamily: "personnel" | "coordination" | "training" | "systems" | "shipboardLife"` and five local SVG asset paths.

- [ ] **Step 1: Write the failing projection assertion**

```js
assert.deepEqual(
  projection.cohesion.visibleTasks.map(({ primaryFamily }) => primaryFamily),
  ['systems', 'systems', 'personnel', 'personnel', 'personnel'],
);
```

- [ ] **Step 2: Run the projection test and verify red**

Run: `node tools/scripts/test-v1-cohesion-projection.mjs`

Expected: FAIL because visible task projections do not yet contain `primaryFamily`.

- [ ] **Step 3: Add the minimal projection field**

```js
primaryFamily: task.primaryFamily,
```

- [ ] **Step 4: Add the five supplied SVG files without scripts, external references, or runtime mutation**

Store the user-supplied path data under `assets/icons/cohesion-task-categories/` using the locked filenames. Preserve each `viewBox`; CSS masking will supply color.

- [ ] **Step 5: Verify green and commit**

Run: `node tools/scripts/test-v1-cohesion-projection.mjs`

Expected: `V1 Cohesion projection passed.`

```powershell
git add assets/icons/cohesion-task-categories src/projection/v1/ship-projection.mjs tools/scripts/test-v1-cohesion-projection.mjs
git commit -m "feat(ship): add cohesion task icons"
```

### Task 2: Icon presentation and segmented-circle geometry

**Files:**
- Modify: `src/ui/ship-journal.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-certified-ship-panel.mjs`
- Modify: `tools/scripts/test-cohesion-ship-visual.mjs`

**Interfaces:**
- Consumes: `task.primaryFamily` from Task 1.
- Produces: `.ship-task-category-icon[data-category]` in each task button and selected detail header; responsive shallow ring segments.

- [ ] **Step 1: Write failing DOM assertions**

Give fixture tasks explicit primary families, then require three card icons plus the selected detail icon:

```js
assert.equal(byClass('ship-task-category-icon').length, 4);
assert.deepEqual(
  byClass('ship-task-category-icon').map((icon) => icon.dataset.category),
  ['personnel', 'coordination', 'training', 'personnel'],
);
assert.equal(byClass('ship-task-category-icon').every((icon) => icon.getAttribute('aria-hidden') === 'true'), true);
```

- [ ] **Step 2: Write failing Playwright icon and ring assertions**

```js
assert.equal(await page.locator('.ship-task-button .ship-task-category-icon').count(), 5);
assert.equal(await page.locator('.ship-task-detail .ship-task-category-icon').count(), 1);
const ringGeometry = await page.locator('.ship-cohesion-segment').evaluateAll((segments) => {
  const first = segments[0];
  const second = segments[1];
  const firstBox = first.getBoundingClientRect();
  const secondBox = second.getBoundingClientRect();
  const centerDistance = Math.hypot(
    (secondBox.left + secondBox.width / 2) - (firstBox.left + firstBox.width / 2),
    (secondBox.top + secondBox.height / 2) - (firstBox.top + firstBox.height / 2),
  );
  const style = getComputedStyle(first);
  return {
    width: Number.parseFloat(style.width),
    height: Number.parseFloat(style.height),
    inferredGap: centerDistance - Number.parseFloat(style.width),
  };
});
assert.ok(ringGeometry.width >= ringGeometry.height * 5);
assert.ok(ringGeometry.height <= 8);
assert.ok(ringGeometry.inferredGap >= 4 && ringGeometry.inferredGap <= 8);
```

- [ ] **Step 3: Run both UI tests and verify red**

Run: `node tools/scripts/test-certified-ship-panel.mjs`

Expected: FAIL because no task-category icon nodes exist.

Run: `node tools/scripts/test-cohesion-ship-visual.mjs`

Expected: FAIL on the new icon or ring geometry assertions.

- [ ] **Step 4: Add the family-to-asset presentation mapping**

```js
const TASK_CATEGORY_ICONS = Object.freeze({
  personnel: 'personnel',
  coordination: 'coordination',
  training: 'training',
  systems: 'systems',
  shipboardLife: 'life',
});

function createTaskCategoryIcon(task) {
  const category = TASK_CATEGORY_ICONS[task?.primaryFamily];
  if (!category) return null;
  const icon = createElement('span', 'ship-task-category-icon');
  icon.dataset.category = task.primaryFamily;
  icon.dataset.icon = category;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}
```

Add the returned icon before each button `strong` title and before the selected detail `h3`. Unknown family values omit the icon while keeping the title.

- [ ] **Step 5: Implement CSS masks and responsive ring geometry**

```css
.directive-expanded-shell .ship-task-category-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  color: var(--directive-expanded-violet);
  background: currentColor;
  -webkit-mask: var(--ship-task-icon) center / contain no-repeat;
  mask: var(--ship-task-icon) center / contain no-repeat;
}
.directive-expanded-shell .ship-task-category-icon[data-icon="personnel"] { --ship-task-icon: url("../assets/icons/cohesion-task-categories/personnel.svg"); }
.directive-expanded-shell .ship-task-category-icon[data-icon="coordination"] { --ship-task-icon: url("../assets/icons/cohesion-task-categories/coordination.svg"); }
.directive-expanded-shell .ship-task-category-icon[data-icon="training"] { --ship-task-icon: url("../assets/icons/cohesion-task-categories/training.svg"); }
.directive-expanded-shell .ship-task-category-icon[data-icon="systems"] { --ship-task-icon: url("../assets/icons/cohesion-task-categories/systems.svg"); }
.directive-expanded-shell .ship-task-category-icon[data-icon="life"] { --ship-task-icon: url("../assets/icons/cohesion-task-categories/life.svg"); }

.directive-expanded-shell .ship-cohesion-segment {
  width: calc(var(--cohesion-radius) * .314 - 6px);
  height: clamp(5px, calc(var(--cohesion-radius) * .03), 7px);
  margin: 0;
  border-radius: 999px;
  transform: translate(-50%, -50%) rotate(calc(var(--cohesion-segment-index) * 18deg)) translateY(calc(-1 * var(--cohesion-radius)));
}
```

Remove the mobile height and margin overrides so the same radius-derived geometry applies at every viewport.

- [ ] **Step 6: Verify focused DOM and Playwright green**

Run: `node tools/scripts/test-certified-ship-panel.mjs`

Expected: `PASS certified Cohesion Ship panel`

Run: `node tools/scripts/test-cohesion-ship-interaction.mjs`

Expected: `Cohesion Ship interactions passed.`

Run: `node tools/scripts/test-cohesion-ship-visual.mjs`

Expected: `Cohesion Ship Playwright visual certification passed.`

- [ ] **Step 7: Run the full repository gate and commit**

Run: `npm.cmd test`

Expected: all focused checks pass, including the existing 25-route/viewport visual suite.

```powershell
git add src/ui/ship-journal.js styles/directive.css tools/scripts/test-certified-ship-panel.mjs tools/scripts/test-cohesion-ship-visual.mjs
git commit -m "feat(ship): show task category icons"
```
