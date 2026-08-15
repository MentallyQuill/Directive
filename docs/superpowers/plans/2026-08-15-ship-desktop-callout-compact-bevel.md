# Ship Desktop Callout Compact Bevel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make only the floating desktop Ship assignment callouts intrinsically sized, 4px beveled, and labeled `L${task.level}` before the existing category symbol.

**Architecture:** Keep task authority and layout ownership unchanged. `ship-journal.js` renders one presentation-only desktop level span from the existing task record, CSS gives the absolute desktop button bounded intrinsic sizing and a four-corner bevel, and the existing measured callout layout automatically consumes each rendered width. The existing `max-width: 820px` rules hide the desktop level span and restore the current full-width rounded accordion controls.

**Tech Stack:** JavaScript ES modules, CSS, Node.js assertion scripts, Playwright/Chromium browser checks.

## Global Constraints

- Apply the treatment only to floating `.ship-task-button` controls above the existing 820px responsive breakpoint.
- Render the first row as `L2  [category symbol]  Assignment Title`, using `L${task.level}` with Arabic numerals.
- Use a 120px minimum, the existing 205px maximum, the existing 50px minimum height, and the existing title ellipsis.
- Use a 4px bevel on all four desktop callout corners.
- Preserve the dark surface, violet border and left accent, amber hover/selected state, shadow, pointer behavior, keyboard focus visibility, Cohesion reward, leader behavior, and measured layout.
- Leave mobile badges, responsive accordion rows, inline detail panels, task details, projection fields, persistence, and gameplay mechanics visually and behaviorally unchanged.
- Preserve the unrelated `debug.log` worktree change.

---

### Task 1: Certify and implement compact desktop callouts

**Files:**
- Modify: `tools/scripts/test-certified-ship-panel.mjs:119-143`
- Modify: `src/ui/ship-journal.js:450-463`
- Modify: `styles/directive.css:4683-4729`
- Modify: `styles/directive.css:4817-4851`

**Interfaces:**
- Consumes: existing visible task records with numeric `task.level`, `task.title`, `task.reward`, and task-category data.
- Produces: one `.ship-task-desktop-level` span per `.ship-task-button`; no changed function signature, projection, persistence record, or layout API.

- [ ] **Step 1: Write failing structural assertions**

After the existing `.ship-task-button` count assertion in `test-certified-ship-panel.mjs`, add:

```js
assert.deepEqual(
  byClass('ship-task-desktop-level').map(({ textContent }) => textContent),
  ['L1', 'L1', 'L2'],
);
const firstTitleRow = byClass('ship-task-button-title')[0];
assert.equal(firstTitleRow.children[0].classList.contains('ship-task-desktop-level'), true);
assert.equal(firstTitleRow.children[1].classList.contains('ship-task-category-icon'), true);
assert.equal(firstTitleRow.children[2].tagName, 'STRONG');
```

- [ ] **Step 2: Run the focused structural test and verify RED**

Run:

```powershell
node tools/scripts/test-certified-ship-panel.mjs
```

Expected: FAIL because no `.ship-task-desktop-level` elements exist.

- [ ] **Step 3: Render the level before the category symbol**

In the `.ship-task-button` title-row construction in `ship-journal.js`, add the presentation span before `createTaskCategoryIcon(task)`:

```js
const titleRow = createElement('span', 'ship-task-button-title');
const level = createElement('span', 'ship-task-desktop-level');
level.textContent = `L${task.level}`;
level.setAttribute('aria-hidden', 'true');
const label = createElement('strong');
label.textContent = task.title;
const titleIcon = createTaskCategoryIcon(task);
titleRow.appendChild(level);
if (titleIcon) titleRow.appendChild(titleIcon);
titleRow.appendChild(label);
```

Keep the existing button accessible name and mobile badge rendering unchanged. The visible desktop level is decorative to assist scanning because the selected detail already exposes `Level {n} Command Assignment` and mobile badges keep their own accessible level phrase.

- [ ] **Step 4: Add bounded intrinsic sizing and the desktop bevel**

Replace the desktop button's fixed width and radius in `directive.css`:

```css
.directive-expanded-shell .ship-task-button {
  --ship-task-bevel: 4px;
  width: fit-content;
  min-width: 120px;
  max-width: 205px;
  border-radius: 0;
  clip-path: polygon(
    var(--ship-task-bevel) 0,
    calc(100% - var(--ship-task-bevel)) 0,
    100% var(--ship-task-bevel),
    100% calc(100% - var(--ship-task-bevel)),
    calc(100% - var(--ship-task-bevel)) 100%,
    var(--ship-task-bevel) 100%,
    0 calc(100% - var(--ship-task-bevel)),
    0 var(--ship-task-bevel)
  );
}

.directive-expanded-shell .ship-task-desktop-level {
  flex: 0 0 auto;
  color: var(--directive-expanded-violet);
  font: 800 9px/1 "Roboto Condensed", "Arial Narrow", sans-serif;
  letter-spacing: .035em;
}

.directive-expanded-shell .ship-task-button:hover .ship-task-desktop-level,
.directive-expanded-shell .ship-task-button.is-selected .ship-task-desktop-level {
  color: #ffa24f;
}
```

In the existing `@media (max-width: 820px)` `.ship-task-button` override, explicitly restore the current accordion contract:

```css
.directive-expanded-shell .ship-task-button {
  width: auto;
  min-width: 0;
  max-width: none;
  clip-path: none;
  border-radius: 4px;
}

.directive-expanded-shell .ship-task-desktop-level { display: none; }
```

Retain the existing open-row `border-radius: 4px 4px 0 0` rule. If the clipped desktop outline is not legible in Chromium, add a task-button-specific `:focus-visible` filter ring after visual inspection without changing `.ship-command-relief-button` focus styling.

- [ ] **Step 5: Run the focused structural and interaction checks and verify GREEN**

Run:

```powershell
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-cohesion-ship-interaction.mjs
```

Expected: both scripts exit 0 with their PASS summaries; existing button selection and accordion behavior remain intact.

- [ ] **Step 6: Commit the structural implementation**

Run:

```powershell
git diff --check -- src/ui/ship-journal.js styles/directive.css tools/scripts/test-certified-ship-panel.mjs
git add -- src/ui/ship-journal.js styles/directive.css tools/scripts/test-certified-ship-panel.mjs
git commit -m "feat(ship): compact desktop callouts"
```

---

### Task 2: Certify desktop geometry and responsive isolation

**Files:**
- Modify: `tools/scripts/test-cohesion-ship-visual.mjs:187-202`
- Modify: `tools/scripts/test-cohesion-ship-visual.mjs:300-340`
- Modify: `tools/scripts/test-cohesion-ship-visual.mjs:397-424`

**Interfaces:**
- Consumes: rendered `.ship-task-button`, `.ship-task-desktop-level`, `.ship-task-mobile-callout`, leader polylines, and the unchanged `data-slot`/`data-corner` layout result.
- Produces: browser certification that bounded intrinsic widths, bevels, and levels affect only desktop callouts.

- [ ] **Step 1: Add browser assertions for the approved desktop contract**

Within the existing viewport loop in `test-cohesion-ship-visual.mjs`, add a desktop/mobile branch:

```js
const desktopCalloutContract = await page.locator('.ship-task-button').evaluateAll((buttons) => buttons.map((button) => {
  const style = getComputedStyle(button);
  const level = button.querySelector('.ship-task-desktop-level');
  return {
    width: button.getBoundingClientRect().width,
    maxWidth: style.maxWidth,
    clipPath: style.clipPath,
    levelText: level?.textContent || '',
    levelDisplay: level ? getComputedStyle(level).display : 'missing',
  };
}));

if (viewport.width > 820) {
  assert.equal(desktopCalloutContract.every(({ levelText }) => /^L\d+$/.test(levelText)), true);
  assert.equal(desktopCalloutContract.every(({ levelDisplay }) => levelDisplay !== 'none'), true);
  assert.equal(desktopCalloutContract.every(({ width }) => width >= 120 && width <= 205.5), true);
  assert.equal(desktopCalloutContract.every(({ maxWidth }) => maxWidth === '205px'), true);
  assert.equal(desktopCalloutContract.every(({ clipPath }) => clipPath !== 'none'), true);
  assert.ok(new Set(desktopCalloutContract.map(({ width }) => Math.round(width))).size > 1, `${viewport.label} title widths produce varied callouts`);
} else {
  assert.equal(desktopCalloutContract.every(({ levelDisplay }) => levelDisplay === 'none'), true);
  assert.equal(desktopCalloutContract.every(({ clipPath }) => clipPath === 'none'), true);
}
```

Keep the existing `layoutSafety` assertion requiring `{ overlapCount: 0, crossingCount: 0 }` and the resize/restoration check. Do not change the mobile badge assertions or geometry thresholds.

- [ ] **Step 2: Run the browser test and verify the new contract**

Run:

```powershell
node tools/scripts/test-cohesion-ship-visual.mjs
```

Expected: the script exits 0, produces certified screenshots, and proves varied desktop widths with no callout overlap or leader crossing.

- [ ] **Step 3: Inspect the certified screenshots and interaction states**

Inspect the generated desktop screenshots at 1440x900 and 1024x768. Confirm visually that:

- the 4px corner cuts read as restrained bevels rather than damaged borders;
- `L2`, category symbol, and title form one balanced row;
- short controls no longer carry empty right-side space;
- no callout obscures the ship or Cohesion ring;
- selected amber and keyboard focus states remain visible.

If inspection finds a concrete defect, adjust only the 120px minimum, title-row gaps, level typography, or task-button-specific focus treatment. Keep the approved 4px bevel and 205px maximum.

- [ ] **Step 4: Re-run the focused browser test after any polish**

Run:

```powershell
node tools/scripts/test-cohesion-ship-visual.mjs
```

Expected: PASS with the final CSS values and regenerated screenshots.

- [ ] **Step 5: Commit the browser certification**

Run:

```powershell
git diff --check -- tools/scripts/test-cohesion-ship-visual.mjs styles/directive.css
git add -- tools/scripts/test-cohesion-ship-visual.mjs styles/directive.css
git commit -m "test(ship): certify compact callouts"
```

---

### Task 3: Full verification, reconciliation, and publication

**Files:**
- Verify: all task-owned files and generated test output
- Preserve: `debug.log`

**Interfaces:**
- Consumes: committed Task 1 and Task 2 changes plus the repository's current `main` and remote `origin/main` histories.
- Produces: a fully verified local `main` whose task-owned commits are reconciled with current remote `main` and pushed without force.

- [ ] **Step 1: Run the complete verification gate**

Run:

```powershell
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-cohesion-ship-interaction.mjs
node tools/scripts/test-cohesion-ship-visual.mjs
npm.cmd test
git diff --check
```

Expected: every command exits 0; the full alpha gate reports no failing scripts.

- [ ] **Step 2: Audit task scope and unrelated work**

Run:

```powershell
git status --short
git show --stat --oneline HEAD~2..HEAD
git diff -- debug.log
```

Expected: implementation commits contain only the Ship source, CSS, focused tests, visual test, design spec, and plan. `debug.log` remains unstaged and unchanged from its pre-task state.

- [ ] **Step 3: Reconcile with current remote main without discarding either history**

Use GitHub CLI with network permission to verify repository identity and the remote `main` SHA. Fetch remote refs, inspect `git log --left-right --cherry-pick main...origin/main`, and merge `origin/main` into local `main` if it is still divergent. Never reset or force-push. Resolve only genuine task-file conflicts and rerun Step 1 after any merge.

- [ ] **Step 4: Push and verify exact remote publication**

Run:

```powershell
git push origin main
git rev-parse HEAD
```

Use `gh api repos/{owner}/{repo}/commits/main --jq .sha` with network permission and confirm it exactly matches local `HEAD`. Report source, focused tests, full gate, remote SHA, and preservation of the unrelated `debug.log` change separately.

