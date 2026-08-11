# Crew Card Drag Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace People-card no-reflow dragging with a vertically locked, exact-slot reorder interaction whose neighboring cards glide aside and whose lifted card docks into place.

**Architecture:** Extend the shared reorder binder with opt-in live-slot, vertical-axis, touch-surface, FLIP displacement, and docking behavior while preserving existing defaults for category, Mission, and Ship consumers. Opt only People records into those capabilities, keep ordering persistence in the existing People controller, and certify the result through the real preview fixture.

**Tech Stack:** Browser-native JavaScript modules, Pointer Events, Web Animations API with a no-animation fallback, CSS, Node.js assertions, Playwright.

## Global Constraints

- Desktop person dragging starts only from the dedicated handle; touch and pen may start anywhere on the mobile card after `175ms`.
- Pre-lift movement beyond `8px` cancels arming and preserves mobile scrolling.
- The lifted card stays horizontally aligned with the roster and responds only to vertical movement.
- The exact-height outlined slot occupies layout space and moves at peer midpoints within or across expanded categories.
- Displaced rows animate for `170ms`; valid drop or cancellation docks for `160ms`; reduced motion makes both effectively immediate.
- Ordering commits once on a valid pointer-up and never on Escape, pointer cancellation, blur, or an invalid release.
- Category dragging, keyboard ordering, focus restoration, persistence scope, Command Bearing, and story state remain unchanged.

---

### Task 1: Live People Drop Slot And Vertical Handling

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs:312-360`
- Modify: `src/ui/expanded-interface-reorder.js:34-287`
- Modify: `src/ui/people-journal.js:101-139`
- Modify: `styles/directive.css:3644-3676`

**Interfaces:**
- Consumes: `bindPresentationReorderHandle(handle, options)` and `onDrop({ id, input, fromList, toList, toIndex })`.
- Produces: opt-in `livePlaceholder`, `lockAxis`, `placeholderClass`, `reflowRootSelector`, `reflowDurationMs`, `dropDurationMs`, and `touchTarget` options. Existing option defaults preserve every non-People caller.

- [ ] **Step 1: Write the failing desktop live-slot assertion**

Replace the obsolete no-placeholder and frozen-geometry assertions with observable requirements:

```js
const slot = peoplePage.locator('.people-card-drop-slot');
assert.equal(await slot.count(), 1, 'People dragging must expose one exact landing slot');
assert.equal(Math.round((await slot.boundingBox()).height), Math.round(sourceCardBox.height));
assert.equal(await peoplePage.locator('.collection-person-row[data-person-id="mara-whitaker"]').count(), 0);
assert.equal(
  await peoplePage.locator('.collection-person-row').evaluateAll((rows) => rows.some((row) => row.getAnimations().length > 0)),
  true,
  'cards displaced by the slot must animate'
);
```

- [ ] **Step 2: Run the browser test and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because People still opts into deferred markers and creates no exact slot.

- [ ] **Step 3: Implement the minimal live-slot path**

Add opt-in binder configuration and use it only in `personReorderHandle`:

```js
livePlaceholder: true,
lockAxis: 'y',
placeholderClass: 'people-card-drop-slot',
reflowRootSelector: '.people-journal-host',
reflowDurationMs: 170,
dropDurationMs: 160
```

The live path replaces the item with its exact-size placeholder, locks the ghost's initial `left`, hit-tests at the original roster `x`, moves the placeholder at vertical midpoints, and uses before/after geometry plus `Element.animate()` to glide retained rows. If animations are unavailable or reduced motion is requested, perform the same DOM move without duration.

- [ ] **Step 4: Style the slot and lifted card**

Add People-only rules:

```css
.directive-expanded-shell .people-card-drop-slot {
  box-sizing: border-box;
  border: 1px solid rgba(119, 167, 239, .92);
  border-radius: 5px;
  background: rgba(119, 167, 239, .10);
  box-shadow: inset 0 0 0 1px rgba(119, 167, 239, .16);
}
.directive-expanded-shell .people-drag-ghost {
  transform: scale(1.015);
  transform-origin: center;
  opacity: .96;
}
```

- [ ] **Step 5: Run the browser test and verify GREEN**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: PASS through the live-slot assertions and existing cross-category order check.

### Task 2: Magnetic Dock, Cancellation, And Whole-Card Mobile Hold

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs:312-430`
- Modify: `src/ui/expanded-interface-reorder.js:34-287`
- Modify: `src/ui/people-journal.js:330-370`
- Modify: `styles/directive.css:3644-3700`

**Interfaces:**
- Consumes: the Task 1 live placeholder state.
- Produces: one asynchronous terminal path that docks to the current slot or returns to the saved origin, plus `touchTarget` activation restricted to touch/pen.

- [ ] **Step 1: Write the failing dock assertion**

After pointer-up, require an observable docking phase before the persisted rerender:

```js
await peoplePage.mouse.up();
assert.equal(await peoplePage.locator('.people-drag-ghost.is-snapping').count(), 1);
assert.equal(await peoplePage.locator('.people-card-drop-slot.is-drop-committing').count(), 1);
await peoplePage.waitForFunction(() => !document.querySelector('.people-drag-ghost'));
assert.equal(await bridgeCategory.locator('.collection-person-row[data-person-id="mara-whitaker"]').count(), 1);
```

- [ ] **Step 2: Run the browser test and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because the existing binder removes the ghost synchronously.

- [ ] **Step 3: Implement docking and return-to-origin cancellation**

Save the origin list and next sibling at lift. On valid release, animate the ghost from its current rectangle to the slot rectangle for `160ms`, then replace the slot, call `onDrop` once, vibrate for `8ms`, and clean up. On Escape, pointer cancellation, blur, or invalid release, move the slot back to the saved origin with FLIP, animate the ghost home, replace the slot without calling `onDrop`, and clean up. Attach and remove an Escape listener with the other active-drag listeners.

- [ ] **Step 4: Run the dock test and verify GREEN**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: PASS, including the existing post-drop category and persistence checks.

- [ ] **Step 5: Write the failing whole-card mobile hold assertion**

Use the real phone fixture and dispatch touch events on `.mobile-accordion-toggle`, not its reorder handle:

```js
const touchCard = mobilePeoplePage.locator('.mobile-crew-item[data-person-id="hadrik-bronn"]');
const touchSurface = touchCard.locator('.mobile-accordion-toggle');
await touchSurface.dispatchEvent('pointerdown', touchDown);
await mobilePeoplePage.waitForTimeout(100);
assert.equal(await mobilePeoplePage.locator('.people-drag-ghost').count(), 0);
await mobilePeoplePage.waitForTimeout(100);
assert.equal(await mobilePeoplePage.locator('.people-drag-ghost').count(), 1);
```

- [ ] **Step 6: Run the browser test and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because only the handle currently owns pointerdown.

- [ ] **Step 7: Bind the mobile record as a touch-only activation target**

Pass `touchTarget: item` from `createMobileRecord`. The shared binder must ignore mouse events on that target, avoid duplicate activation when the event originated on the handle, defer `preventDefault()` and pointer capture until lift for touch/pen, and cancel arming at the existing `8px` threshold.

- [ ] **Step 8: Add cancellation and reduced-motion assertions**

Assert that Escape restores the original order with no ghost/slot, quick mobile movement before `175ms` creates no ghost, and `page.emulateMedia({ reducedMotion: 'reduce' })` yields a visible slot whose running displacement animations have duration `0` or no animation.

- [ ] **Step 9: Run focused GREEN verification**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
node tools/scripts/test-reorderable-collection.mjs
node tools/scripts/test-certified-people-panel.mjs
```

Expected: all three commands PASS.

### Task 3: Update Certified Authority And Complete Verification

**Files:**
- Modify: `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md:505-515`
- Modify: `docs/design/mockups/directive-expanded-interface.html:47-63,972-1065`
- Modify: `docs/superpowers/specs/2026-08-10-person-card-handle-design.md:1-44`
- Modify: `tools/scripts/test-certified-ui-authority.mjs:5-11`

**Interfaces:**
- Consumes: the production behavior proven in Tasks 1 and 2.
- Produces: a certified mockup and living contract that describe the same approved live-slot interaction.

- [ ] **Step 1: Mark the earlier no-reflow spec as superseded**

Add a status note linking to `2026-08-10-crew-card-drag-animation-design.md`; preserve its historical content below the note.

- [ ] **Step 2: Update the living contract and mockup**

Document and demonstrate handle-only desktop pickup, whole-card `175ms` mobile hold, vertical locking, exact-height slot, smooth displacement, docking, cancellation, reduced motion, and presentation-only persistence. Keep resting layouts unchanged.

- [ ] **Step 3: Refresh the certified mockup hash**

Run: `git hash-object docs/design/mockups/directive-expanded-interface.html`

Replace the old literal in `tools/scripts/test-certified-ui-authority.mjs` with the returned hash.

- [ ] **Step 4: Run authority and focused verification**

Run:

```powershell
node tools/scripts/test-certified-ui-authority.mjs
node tools/scripts/test-expanded-interface-mockup.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: all commands PASS.

- [ ] **Step 5: Run the complete alpha gate**

Run: `npm.cmd test`

Expected: all 95 focused checks PASS.

- [ ] **Step 6: Review and commit**

Run `git diff --check`, inspect `git diff`, and commit the implementation and authority changes with a focused People drag message.
