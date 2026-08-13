# Mobile Crew Touch Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the mobile Crew drag notch by making the dedicated handle the only touch/pen pickup surface and certifying rapid reversals through Chromium's real touch pipeline.

**Architecture:** Keep the shared reorder lifecycle and all People drag presentation unchanged. Narrow only the mobile People binding in `people-journal.js`, then replace the synthetic whole-card activation assertion with a browser-level touch regression that distinguishes card scrolling from handle dragging.

**Tech Stack:** Browser-native JavaScript modules, Pointer Events, Chromium DevTools Protocol touch input, Playwright, Node.js assertions, CSS media queries.

## Global Constraints

- Mobile card bodies remain native vertical scroll and accordion-selection surfaces.
- Mobile touch and pen reorder starts only from the visible `Reorder <name>` handle after `175ms`.
- The handle retains `touch-action: none`, vertical locking, the exact-height slot, `170ms` reflow, `160ms` docking, and guarded haptics.
- Desktop pointer pickup, keyboard ordering, category ordering, focus restoration, persistence scope, Command Bearing, and story state remain unchanged.
- The regression must use Chromium's real touch arbitration; synthetic `PointerEvent` plus synthetic `TouchEvent` is insufficient.

---

### Task 1: Real-Touch Handle-Only Regression And Minimal Binding Fix

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs:728-807`
- Modify: `src/ui/people-journal.js:451-470`
- Modify: `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md:509-513`
- Modify: `docs/superpowers/specs/2026-08-10-crew-card-drag-animation-design.md:10-20,61-69`

**Interfaces:**
- Consumes: `bindPresentationReorderHandle(handle, options)`, `.collection-person-drag-handle`, and the production preview fixture.
- Produces: handle-only mobile People pickup plus an automated real-touch reversal contract.

- [ ] **Step 1: Replace the synthetic whole-card lift assertion with a real-touch regression**

Create a `browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })`, load the People preview, collapse the default expanded player, and use a CDP session to send `touchStart`, rapid `touchMove` reversals, and `touchEnd`.

Before touching the handle, hold `.mobile-accordion-toggle` for more than `175ms` and assert the card body creates no `.people-drag-ghost`. Then start on `.collection-person-drag-handle`, assert a ghost appears after the hold, send at least four vertical reversals, and assert the page observes no `pointercancel`, the ghost remains present, and one `.people-card-drop-slot` remains connected.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because the current mobile card body still lifts after the hold.

- [ ] **Step 3: Implement the minimal handle-only binding**

Change the mobile record binding from:

```js
personReorderHandle(person, category, controller, rerender, {
  previewClass: 'people-drag-ghost',
  touchTarget: item
})
```

to:

```js
personReorderHandle(person, category, controller, rerender, {
  previewClass: 'people-drag-ghost'
})
```

Do not change the shared reorder controller or add `touch-action: none` to the card body.

- [ ] **Step 4: Update the living interaction authority**

State in the interface contract and earlier drag design that mobile touch/pen pickup is handle-only. Preserve the remaining lift, slot, reflow, docking, cancellation, accessibility, and persistence requirements verbatim where they still apply.

- [ ] **Step 5: Run focused GREEN verification**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
node tools/scripts/test-certified-people-panel.mjs
node tools/scripts/test-reorderable-collection.mjs
```

Expected: all commands PASS.

- [ ] **Step 6: Visually inspect mobile lift and rapid reversal**

Run the production preview at `390x844`, drag Mara Whitaker from the handle through rapid up/down reversals, and capture the active ghost plus exact slot. Confirm ordinary card-body movement scrolls without lifting.

- [ ] **Step 7: Run the complete gate and commit**

Run: `npm.cmd test`

Expected: all focused checks PASS.

Commit the source, regression, contract, design, and plan together with a focused conventional commit.
