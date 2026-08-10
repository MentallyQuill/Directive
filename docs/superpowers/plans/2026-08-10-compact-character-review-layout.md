# Compact Character Review Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fit the desktop Character Creator Review step above the fixed route navigation by compacting Campaign Difficulty and containing long dossier text inside fixed-height text areas.

**Architecture:** Preserve the existing Character Creator data and event flow. Reshape only the difficulty selector's presentation into a compact top row plus full-width summary, then cover the real expanded-shell flex geometry with Playwright so track compression and clipping cannot regress.

**Tech Stack:** Browser JavaScript, CSS Grid/Flexbox, Node.js assertions, Playwright Chromium

## Global Constraints

- Do not make the desktop or tablet Review route body vertically scroll at the representative `1200 x 1050` CSS-pixel viewport, where the expanded shell reaches its maximum `900px` height.
- Keep the fixed bottom route navigation outside the Review content.
- Keep `Story-forward` and `Full Simulation` inside their selection buttons; remove only the redundant fatality-policy lines.
- Keep the complete fatality policy and explanatory copy in Selected Mode Summary.
- Keep Brief Biography and Public Reputation fixed-height and internally vertically scrollable.
- Preserve mobile's existing stacked composition and route-body scrolling.
- Do not change simulation-mode values, selection behavior, accessibility roles, or other Character Creator steps.

---

### Task 1: Add the authentic Review geometry regression

**Files:**
- Modify: `tools/scripts/test-character-creator-assist-layout.mjs`
- Modify: `tools/scripts/test-character-creator-assist-panel.mjs`

**Interfaces:**
- Consumes: `styles/directive.css` as the production stylesheet and the production class contract used by `createDirectiveExpandedShell()` and `renderCharacterCreatorPanel()`.
- Produces: Playwright assertions for route-body overflow, form containment, commissioning/control separation, difficulty hierarchy, and textarea overflow behavior.

- [ ] **Step 1: Replace the simplified creator fixture with real expanded-shell nesting**

Build the fixture with `.directive-runtime-panel.directive-expanded-shell`, `.directive-workspace`, `.directive-topbar`, `.directive-route-heading`, `.directive-runtime-body.directive-route-body`, the creator form, and `.directive-route-bar`. Represent the Review section with the actual difficulty, summary, and dossier classes.

```js
<section class="directive-runtime-panel directive-expanded-shell">
  <main class="directive-workspace">
    <header class="directive-topbar"></header>
    <div class="directive-route-heading"></div>
    <section class="directive-runtime-body directive-route-body">
      <form class="directive-creator-form directive-creator-console directive-lcars-console directive-lcars-panel">
        <section class="directive-creator-overview"></section>
        <header class="directive-creator-progress-header"></header>
        <nav class="directive-step-row directive-creator-step-row">
          <button class="directive-step-button directive-creator-step-button">Identity</button>
          <button class="directive-step-button directive-creator-step-button">Service</button>
          <button class="directive-step-button directive-creator-step-button">Personality</button>
          <button class="directive-step-button directive-creator-step-button">Review</button>
        </nav>
        <div class="directive-action-row directive-creator-command-bar directive-lcars-panel">
          <button class="directive-button">Save Draft</button>
        </div>
        <section class="directive-creator-section directive-creator-section-active" data-creator-step="review">
          <section class="directive-creator-difficulty-field directive-lcars-panel"></section>
          <label class="directive-form-field"><textarea class="directive-field-control"></textarea></label>
          <label class="directive-form-field"><textarea class="directive-field-control"></textarea></label>
        </section>
      </form>
    </section>
    <nav class="directive-route-bar"></nav>
  </main>
</section>
```

- [ ] **Step 2: Assert the user-visible geometry and scrolling contract**

Use `test-character-creator-assist-panel.mjs` to assert that the real renderer creates `.directive-creator-difficulty-top`, keeps two option buttons, omits `.directive-creator-difficulty-option-policy`, and retains `.directive-creator-difficulty-fatality` in the summary. Collect literal geometry from the `1200 x 1050` desktop fixture and assert:

```js
assert.equal(metrics.routeBody.scrollHeight, metrics.routeBody.clientHeight);
assert.ok(metrics.form.bottom <= metrics.routeBody.bottom + 0.5);
assert.ok(metrics.commandBar.top >= metrics.stepsBottom - 0.5);
assert.ok(metrics.stepHeights.every((height) => height >= 40));
assert.equal(metrics.difficultyTopColumns, 2);
assert.ok(metrics.summary.width >= metrics.difficulty.width - 26);
assert.ok(metrics.textareas.every(({ overflowY, resize }) => overflowY === 'auto' && resize === 'none'));
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `node tools/scripts/test-character-creator-assist-layout.mjs`

Expected: FAIL because the current form has route-body overflow/clipping, the difficulty selector lacks the compact top-row hierarchy, mode buttons still contain policy lines, and textareas remain vertically resizable.

### Task 2: Implement the compact difficulty hierarchy and contained dossier fields

**Files:**
- Modify: `src/ui/character-creator-panel.js`
- Modify: `styles/directive.css`
- Test: `tools/scripts/test-character-creator-assist-layout.mjs`

**Interfaces:**
- Consumes: `simulationModeDifficultyOptions()`, the hidden `settings.simulationMode` select, and existing `sync(mode)` selection state.
- Produces: `.directive-creator-difficulty-top` containing the heading and radiogroup, followed by the unchanged live summary; fixed-height internally scrollable Review textareas.

- [ ] **Step 1: Group the difficulty heading and option rail**

Create a top-row wrapper, append the existing `header` and `optionRail` to it, keep the summary as the next full-width child, and remove construction of `optionPolicy` nodes:

```js
const top = createElement('div', 'directive-creator-difficulty-top');
top.append(header, optionRail);
body.append(top, summary);

button.append(optionLabel, optionBadge);
```

Do not change the option's accessible label or the summary's `fatalityPolicy` content.

- [ ] **Step 2: Apply the compact two-tier layout**

Use a two-column top row at desktop/tablet widths, compact mode buttons, and a full-width summary:

```css
.directive-creator-difficulty-body {
  grid-template-columns: minmax(0, 1fr) !important;
}

.directive-creator-difficulty-top {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(340px, 1.2fr);
  gap: 12px;
  align-items: end;
}

.directive-creator-difficulty-option {
  min-height: 54px;
}
```

Stack `.directive-creator-difficulty-top` to one column inside the existing `max-width: 680px` media query without changing the mobile route body.

- [ ] **Step 3: Contain dossier text without changing the page scroll model**

Scope the field rule to the active Review section so other multiline creator fields retain their current behavior:

```css
.directive-creator-section[data-creator-step="review"] textarea.directive-field-control {
  height: 96px;
  min-height: 96px !important;
  max-height: 96px;
  overflow-y: auto;
  resize: none;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node tools/scripts/test-character-creator-assist-layout.mjs`

Expected: PASS with no route-body scroll at `1200 x 1050`, no control overlap, compact difficulty hierarchy, full summary, and internally scrolling fixed-height dossier fields.

- [ ] **Step 5: Run the full alpha gate**

Run: `npm.cmd test`

Expected: all focused checks pass with zero failures.

- [ ] **Step 6: Commit the implementation**

```powershell
git add src/ui/character-creator-panel.js styles/directive.css tools/scripts/test-character-creator-assist-layout.mjs tools/scripts/test-character-creator-assist-panel.mjs
git commit -m "fix(ui): compact creator review layout"
```

### Task 3: Render and inspect the representative viewport

**Files:**
- Verify: `styles/directive.css`
- Verify: `src/ui/character-creator-panel.js`

**Interfaces:**
- Consumes: the Playwright fixture and final production CSS.
- Produces: visual evidence that the Review layout matches the approved hierarchy and remains above the fixed route navigation.

- [ ] **Step 1: Capture the `1200 x 1050` Review fixture**

Use Playwright to render the same authentic fixture used by the regression test and save a temporary PNG outside tracked source files.

- [ ] **Step 2: Inspect the screenshot and computed bounds**

Confirm the two mode buttons sit to the right of Campaign Difficulty, Selected Mode Summary spans the next row, biography and reputation remain fully visible, the commissioning and command controls do not overlap, and route navigation remains fixed below the content.

- [ ] **Step 3: Run final verification from a clean diff**

Run: `git diff --check` and `npm.cmd test`.

Expected: no whitespace errors and all focused checks pass.
