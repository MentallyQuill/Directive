# Mobile Panel Continuity Implementation Plan

**Goal:** Remove mobile dead space and preserve usable master/detail panels at normal and keyboard-reduced heights without restoring full-page scrolling.

**Architecture:** Make the existing stacked route grids own their row geometry, retain panel-local scroll ownership, and complete the runtime overlay's modal focus lifecycle.

## Task 1: Encode the broken mobile geometry

**Files:**

- Modify `tools/scripts/test-expanded-interface-visual-conformance.mjs`

- [ ] Add a 360 by 500 short-viewport case.
- [ ] For Campaign, Mission, and People, measure master-bottom to detail-top adjacency and require it to equal the route gap.
- [ ] Require usable master/detail heights and a visible first detail heading.
- [ ] Run the visual conformance test and confirm it fails against the current CSS for the captured dead gaps.

## Task 2: Encode modal focus entry

**Files:**

- Modify `tools/scripts/test-directive-runtime-overlay-host.mjs`

- [ ] Assert that opening the overlay focuses its close control.
- [ ] Keep the existing assertion that closing restores focus to the opener.
- [ ] Run the overlay host test and confirm the new assertion fails against the current runtime.

## Task 3: Repair the stacked mobile layouts

**Files:**

- Modify `styles/directive.css`

- [ ] Give Campaign, Mission, and People explicit bounded first rows and flexible detail rows at mobile widths.
- [ ] Remove the item-level mobile `max-height` constraints that create unused implicit-track space.
- [ ] Tune the row bounds at 360 by 800 and 360 by 500 so both panels remain useful.
- [ ] Run the focused visual conformance test until all routes and viewports pass.

## Task 4: Complete overlay focus behavior

**Files:**

- Modify `src/runtime/runtime-shell.js`
- Modify `tools/scripts/test-directive-runtime-overlay-host.mjs` only if its fake DOM needs selector support

- [ ] Focus the rendered close control after opening the overlay without scrolling it.
- [ ] Run the focused overlay host test until it passes.

## Task 5: Verify and publish

- [ ] Run the complete `npm.cmd test` alpha gate.
- [ ] Inspect Campaign, Mission, People, Ship, and Settings at 360 by 800 and 360 by 500.
- [ ] Sync only production files to the installed SillyTavern Directive directory and verify source/install hashes.
- [ ] Exercise the installed overlay in the live host and capture mobile evidence.
- [ ] Request a final code review and address all actionable findings.
- [ ] Commit, merge the correction to `main`, push `origin/main`, and verify the remote SHA.
