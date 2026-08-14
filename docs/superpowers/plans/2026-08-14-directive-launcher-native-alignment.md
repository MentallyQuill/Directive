# Directive Launcher Native Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the semantic Open Directive composer button visually match SillyTavern's Extensions wand while enlarging only its ship glyph.

**Architecture:** Keep launcher creation and behavior in `directive-launcher-button.js`, removing only the generic `menu_button` class. Own the integration styling in the existing launcher-scoped CSS, with SillyTavern custom properties providing responsive geometry and color. Add a focused Chromium fixture for real computed-style and geometry assertions while retaining the current fake-DOM click and focus-return coverage.

**Tech Stack:** JavaScript ES modules, CSS custom properties and masks, Node `assert`, SillyTavern host CSS, Chromium browser inspection.

## Global Constraints

- Keep a semantic `button[type="button"]` with the existing accessible label, tooltip, placement, click action, focus restoration, and lifecycle.
- Use `var(--bottomFormBlockSize)` for launcher geometry and `var(--bottomFormIconSize)` for proportional glyph sizing.
- Match the wand's resting `opacity: 0.7`, transparent surface, borderless shape, inherited foreground, and hover brightness.
- Enlarge only the launcher glyph to `calc(var(--bottomFormIconSize) * 1.25)`; do not change `route-ship.svg` or other icon uses.
- Do not add context-menu, right-click, long-press, or extension-toggle behavior.
- Do not change SillyTavern source, runtime state, saves, gameplay, dependencies, or unrelated working-tree files.

---

### Task 1: Lock and implement the native composer contract

**Files:**
- Create: `tools/fixtures/directive-launcher-button.html`
- Create: `tools/scripts/test-directive-launcher-button-visual.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs:118-125`
- Modify: `src/hosts/sillytavern/directive-launcher-button.js:58-68`
- Modify: `styles/directive.css:29-49`

**Interfaces:**
- Consumes: `installDirectiveLauncherButton()` and SillyTavern's `--bottomFormBlockSize`, `--bottomFormIconSize`, `--animation-duration-2x`, inherited color, and `.interactable:focus-visible` contract.
- Produces: the same accessible launcher behavior with `interactable directive-launcher-button` classes and browser-proven launcher-scoped native-composer presentation.

- [x] **Step 1: Add the failing rendered launcher regression before production changes**

Create a 390x844 fixture that loads `/styles/directive.css`, defines the measured SillyTavern composer variables and direct-`div` rules, renders `#leftSendForm` with the native wand and `#send_textarea`, and calls `installDirectiveLauncherButton()` from a module script.

Create `test-directive-launcher-button-visual.mjs` using the existing preview server and Playwright. Assert literal, hand-derived browser outcomes:

```js
assert.equal(measurement.launcher.tag, 'BUTTON');
assert.equal(measurement.launcher.type, 'button');
assert.equal(measurement.launcher.className, 'interactable directive-launcher-button');
assert.equal(measurement.launcher.ariaLabel, 'Open Directive');
assert.equal(measurement.launcher.backgroundColor, 'rgba(0, 0, 0, 0)');
assert.equal(measurement.launcher.borderTopWidth, '0px');
assert.equal(measurement.launcher.borderTopStyle, 'none');
assert.equal(measurement.launcher.opacity, '0.7');
assert.equal(measurement.launcher.filter, 'none');
assert.equal(measurement.launcher.color, measurement.wand.color);
assert.ok(Math.abs(measurement.launcher.width - measurement.wand.width) < 0.01);
assert.ok(Math.abs(measurement.launcher.height - measurement.wand.height) < 0.01);
assert.equal(measurement.icon.width, 35.625);
assert.equal(measurement.icon.height, 35.625);
```

Hover the launcher and assert computed `opacity === '1'` and `filter === 'brightness(1.2)'`. Click it and assert the fixture callback count becomes one. Register the new script immediately after `test-turn-activity-indicator-visual.mjs` in `run-alpha-gate.mjs`.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-directive-runtime-overlay-host.mjs`

Expected: FAIL because the rendered launcher class still contains `menu_button` and the existing browser result retains fixed 34px geometry, opaque generic button chrome, full opacity, and a 28.5px mask.

- [x] **Step 3: Remove generic button chrome at creation**

Change the launcher assignment to:

```js
button.className = 'interactable directive-launcher-button';
```

Do not change the element type, attributes, icon, event handler, or placement logic.

- [x] **Step 4: Apply the launcher-scoped native composer CSS**

Replace the current launcher blocks with:

```css
.directive-launcher-button {
  -webkit-appearance: none;
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  order: 5;
  flex: 0 0 var(--bottomFormBlockSize);
  width: var(--bottomFormBlockSize);
  height: var(--bottomFormBlockSize);
  min-width: var(--bottomFormBlockSize);
  min-height: var(--bottomFormBlockSize);
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  color: inherit;
  font: inherit;
  line-height: 1;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  opacity: 0.7;
  filter: none;
  cursor: pointer;
  transition: opacity var(--animation-duration-2x);
}

.directive-launcher-button:hover {
  opacity: 1;
  filter: brightness(1.2);
}

.directive-launcher-button .directive-launcher-button-icon {
  width: calc(var(--bottomFormIconSize) * 1.25);
  height: calc(var(--bottomFormIconSize) * 1.25);
  color: currentColor;
}
```

- [x] **Step 5: Run the focused test and verify GREEN**

Run: `node tools/scripts/test-directive-runtime-overlay-host.mjs`

Expected: `PASS Directive runtime overlay host`.

### Task 2: Verify, publish, and prove the installed UI

**Files:**
- Create: `docs/superpowers/plans/2026-08-14-directive-launcher-native-alignment.md`
- Verify only: installed Directive extension and remote `main`.

**Interfaces:**
- Consumes: Task 1 and the committed design `docs/superpowers/specs/2026-08-14-directive-launcher-native-alignment-design.md`.
- Produces: a verified source commit on remote `main` plus installed 390x844 visual evidence.

- [x] **Step 1: Run the complete repository gate**

Run: `npm.cmd test`

Expected: all alpha-gate checks pass with zero failures.

- [x] **Step 2: Review and commit the exact implementation scope**

Run: `git diff --check`, inspect `git diff`, and run `git status --short`.

Commit only the plan, launcher source, launcher CSS, and focused regression test. Leave `debug.log` and `.codex-remote-attachments/` untouched.

- [x] **Step 3: Reconcile and push `main`**

Use GitHub CLI with network permission to verify authentication and the current remote `main`. Pull or merge safely without force if the remote advanced, rerun the full gate after reconciliation, push `main`, and confirm the remote SHA exactly equals local `HEAD`.

- [x] **Step 4: Update the active installed extension**

Copy only `src/hosts/sillytavern/directive-launcher-button.js` and `styles/directive.css` into the exact active Directive installation. Verify SHA-256 equality between repository and installed copies before reloading SillyTavern.

- [x] **Step 5: Verify the real 390x844 composer**

At a 390x844 Chromium viewport, reload SillyTavern and measure `#extensionsMenuButton`, `#directive-launcher-button`, and `.directive-launcher-button-icon`.

Required computed results:

```text
launcher tag: BUTTON
launcher background: transparent
launcher border width/style: 0px / none
launcher opacity: 0.7
launcher filter: none
launcher color: equal to the wand
launcher width/height: equal to --bottomFormBlockSize and the wand control
ship mask width/height: 1.25 * --bottomFormIconSize
```

Capture the composer and confirm the ship has no box, shares the wand's resting brightness, appears comparable in visual height, remains centered and unclipped, and ordinary click/focus behavior still opens and closes Directive correctly.
