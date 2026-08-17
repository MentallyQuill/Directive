# Quiet Contextual Ship Chronometers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the accepted ship chronometer quietly into the Campaign identity caption and Mission header without changing clock authority or values.

**Architecture:** Keep `createShipChronometer` and the certified time projection unchanged. Move only the Campaign variant into the existing hero-copy composition, convert the Mission hero from reserved-padding/absolute positioning to an explicit grid, and replace the shared card styling with quiet page-accented typography. Extend the focused Playwright contract before changing source so the old overlay/card design fails.

**Tech Stack:** JavaScript ES modules, CSS, Node.js assertion scripts, Playwright browser fixtures.

## Global Constraints

- Campaign and Mission titles remain the first visual read.
- Campaign time participates in the lower hero caption; Mission time participates in the eyebrow row.
- Remove the chronometer background, enclosing border, corner radius, shadow, heavy colored edge, and card padding.
- Campaign clock is at most 20px beside a 29px desktop title; Mission clock is at most 18px beside a 27px desktop title.
- Mobile clocks remain in normal flow after the local identity or summary and create no horizontal overflow.
- Keep `SHIP TIME`, `HH:MM:SS`, and `Stardate NNNNN.N` visible with tabular clock numerals.
- Do not change accepted-pair custody, time projection, formatting, persistence, prompts, or chat normalization.
- Preserve the unrelated `debug.log` modification.

---

### Task 1: Lock the quiet contextual layout contract

**Files:**
- Modify: `tools/scripts/test-authoritative-ship-chronometer-visual.mjs`

**Interfaces:**
- Consumes: existing Campaign and Mission fixture routes from `serve-expanded-interface-preview.mjs`
- Verifies: `.directive-ship-chronometer-{campaign|mission}`, `.campaign-hero-copy`, and `.mission-hero`
- Produces: a failing visual contract for the old absolute card composition

- [ ] **Step 1: Replace overlay-era geometry assertions with contextual-layout assertions**

Collect the chronometer, title, summary, parent, and computed styles:

```js
const title = page.locator(route === 'campaign' ? '.campaign-hero-copy > h2:visible' : '.mission-hero > h2:visible').first();
const summary = page.locator(route === 'campaign' ? '.campaign-summary:visible' : '.mission-hero > p:visible').first();
const layout = await chronometer.evaluate((node) => {
  const style = getComputedStyle(node);
  const clockStyle = getComputedStyle(node.querySelector('.directive-ship-chronometer-clock'));
  const parentStyle = getComputedStyle(node.parentElement);
  return {
    parentClass: node.parentElement?.className || '',
    previousTag: node.previousElementSibling?.tagName || '',
    position: style.position,
    backgroundImage: style.backgroundImage,
    backgroundColor: style.backgroundColor,
    borderRightWidth: style.borderRightWidth,
    boxShadow: style.boxShadow,
    clockFontSize: parseFloat(clockStyle.fontSize),
    parentDisplay: parentStyle.display,
    parentPaddingRight: parseFloat(parentStyle.paddingRight),
  };
});
```

Assert the shared quiet surface and title hierarchy:

```js
assert.equal(layout.backgroundImage, 'none');
assert.equal(layout.backgroundColor, 'rgba(0, 0, 0, 0)');
assert.equal(layout.borderRightWidth, '0px');
assert.equal(layout.boxShadow, 'none');
assert.ok(parseFloat(await title.evaluate((node) => getComputedStyle(node).fontSize)) > layout.clockFontSize);
assert.ok(layout.clockFontSize <= (route === 'campaign' ? 20 : 18));
```

On desktop, assert Campaign is a child of `.campaign-hero-copy`; Mission is statically placed in a grid hero whose right padding is below 50px. On mobile, assert Campaign still belongs to `.campaign-hero-copy`, Mission follows its summary, and each clock stays within its parent width without horizontal overflow.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-authoritative-ship-chronometer-visual.mjs`

Expected: FAIL because the current chronometers have a gradient background, border, shadow, heavy right edge, absolute desktop positioning, and Campaign is a sibling of `.campaign-hero-copy`.

- [ ] **Step 3: Commit the failing contract with the implementation in Task 2**

Do not commit a red `main`. Keep this test modification unstaged until Task 2 is green.

### Task 2: Integrate both chronometers into their page compositions

**Files:**
- Modify: `src/ui/campaign-panel.js:78-96`
- Modify: `styles/directive.css:3801-3848`
- Modify: `styles/directive.css:4030-4056`
- Modify: `styles/directive.css:4186-4208`
- Modify: `styles/directive.css:4234-4245`
- Test: `tools/scripts/test-authoritative-ship-chronometer-visual.mjs`

**Interfaces:**
- Consumes unchanged: `createShipChronometer(time, { variant }) -> HTMLElement | null`
- Preserves unchanged: `directive.timePlayerProjection.v1`, accessible label, displayed clock, and Stardate
- Produces: Campaign caption child and Mission grid participant with responsive in-flow fallbacks

- [ ] **Step 1: Move the Campaign chronometer into the identity caption**

Change the dashboard branch in `appendCampaignDetail` so the chronometer is appended to `copy`, not `hero`:

```js
if (dashboard) {
  hero.classList.add('campaign-dashboard-hero');
  const chronometer = createShipChronometer(time, { variant: 'campaign' });
  if (chronometer) copy.appendChild(chronometer);
} else {
  hero.classList.add('campaign-browser-hero');
}
```

- [ ] **Step 2: Replace shared card styling with quiet typography**

Keep the shared renderer and use a transparent, unboxed base:

```css
.directive-expanded-shell .directive-ship-chronometer {
  z-index: 2;
  display: grid;
  gap: 2px;
  min-width: 0;
  padding: 0;
  color: var(--directive-expanded-text);
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  font-family: "Roboto Condensed", "Arial Narrow", sans-serif;
  text-transform: uppercase;
  pointer-events: none;
}
```

Set the shared label to 8px and Stardate to 9px. Retain `font-variant-numeric: tabular-nums`, reduce default clock size, and override each page to its exact 20px/18px maximum.

- [ ] **Step 3: Compose the Campaign caption**

On desktop/tablet, make `.campaign-dashboard-hero .campaign-hero-copy` a two-column grid. Place status, title, metadata, and summary in column one. Place the Campaign chronometer in column two spanning the text rows, aligned to the bottom, with a low-contrast amber top rule and no other framing.

```css
.directive-expanded-shell .campaign-dashboard-hero .campaign-hero-copy {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 24px;
  align-items: end;
}

.directive-expanded-shell .campaign-dashboard-hero .campaign-hero-copy > :not(.directive-ship-chronometer) {
  grid-column: 1;
}

.directive-expanded-shell .directive-ship-chronometer-campaign {
  grid-column: 2;
  grid-row: 1 / span 4;
  align-self: end;
  min-width: 126px;
  padding-top: 6px;
  border-top: 1px solid rgba(242, 161, 38, .38);
  text-align: right;
}
```

- [ ] **Step 4: Compose the Mission eyebrow row**

Replace the 205px right-padding reservation and absolute clock with a grid:

```css
.directive-expanded-shell .mission-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 18px;
  min-height: 102px;
  padding: 19px 18px 17px 27px;
}

.directive-expanded-shell .mission-hero h2,
.directive-expanded-shell .mission-hero > p {
  grid-column: 1 / -1;
}

.directive-expanded-shell .directive-ship-chronometer-mission {
  position: static;
  grid-column: 2;
  grid-row: 1;
  grid-template-columns: auto auto;
  align-items: baseline;
  column-gap: 8px;
  text-align: right;
}
```

Retain the Mission Stardate on the second chronometer line and color it lilac. Do not add a divider or edge to the Mission readout.

- [ ] **Step 5: Implement the one-column mobile fallbacks**

At `max-width: 640px`, return the Campaign caption to one column and place its clock after the summary. Return the Mission hero to one column; keep the compact-identity summary first and clock second. Both clocks stretch within their content box, align left, and use a small top margin with no card surface.

- [ ] **Step 6: Run focused UI tests and verify GREEN**

Run:

```powershell
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-certified-mission-panel.mjs
node tools/scripts/test-authoritative-ship-chronometer-visual.mjs
```

Expected: all pass; the browser test writes four ignored screenshots under `artifacts/authoritative-ship-chronometer`.

- [ ] **Step 7: Run broader responsive conformance**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: all certified route/viewport geometry, overflow, motion, and responsive contracts pass.

- [ ] **Step 8: Inspect generated screenshots**

Open all four focused screenshots and verify the Campaign title remains dominant, Mission title/summary use the full header width, neither clock resembles a card, and mobile text remains unclipped.

- [ ] **Step 9: Commit the green implementation**

```powershell
git add src/ui/campaign-panel.js styles/directive.css tools/scripts/test-authoritative-ship-chronometer-visual.mjs
git commit -m "style(ui): quiet ship chronometers"
```

### Task 3: Full gate and publication

**Files:**
- Verify only: all files changed by Tasks 1-2

**Interfaces:**
- Verifies: the full Directive alpha gate and exact remote `main` publication
- Preserves: unrelated `debug.log`

- [ ] **Step 1: Run the full gate**

Run: `npm.cmd test`

Expected: every focused script, browser contract, mission scenario audit, and runtime safety check passes.

- [ ] **Step 2: Audit scope and whitespace**

Run:

```powershell
git diff --check HEAD~1
git status --short
git diff --stat HEAD~1
```

Expected: no whitespace errors; only the scoped UI/test changes are committed; `debug.log` remains modified and unstaged.

- [ ] **Step 3: Verify remote ancestry and push `main`**

Fetch/inspect `origin/main`, confirm it is an ancestor of local `main`, then run:

```powershell
git push origin main
```

Expected: the remote accepts a fast-forward push containing the design, plan, and green implementation commits.

- [ ] **Step 4: Prove exact remote publication**

Compare `git rev-parse HEAD` with `git ls-remote origin refs/heads/main`. They must match exactly. Recheck `git status --short` to prove `debug.log` remains the only unrelated local modification.
