# Crew Rapid Reflow Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the rapid mobile Crew animation notch by preserving each unchanged sibling's in-flight FLIP animation and retargeting only rows whose layout endpoints change.

**Architecture:** Replace the controller's global animation set with per-row ownership. Compare transform-independent offset-chain layout positions across each synchronous slot relocation, retain animations for unchanged rows, and continuity-retarget only changed rows from their current presentation rectangles.

**Tech Stack:** Browser-native JavaScript modules, DOM geometry APIs, Web Animations API, Playwright Chromium, CDP real-touch input, Node.js assertions.

## Global Constraints

- Preserve handle-only touch/pen pickup, the `175ms` hold, the `8px` pre-lift cancellation threshold, and native scrolling on card bodies.
- Preserve immediate stationary slot placement, midpoint hit-testing, vertical locking, `170ms cubic-bezier(.2,.8,.2,1)` sibling reflow, `160ms` docking, and guarded haptics.
- Preserve keyboard ordering, category ordering, reduced motion, edge scrolling, concurrent-controller cleanup, and presentation-only persistence.
- Do not delay target hit-testing or release-time placement behind a pending animation frame.
- Add a failing real-Chromium behavior regression before changing production code.

---

### Task 1: Per-row interrupted FLIP ownership

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `src/ui/expanded-interface-reorder.js`
- Modify: `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md`

**Interfaces:**
- Consumes: `relocatePlaceholder(parent, before)`, `state.reflowAnimations`, `Element.animate()`, and the production People preview fixture.
- Produces: one current FLIP animation per row, stable animation identity while a row's layout endpoint is unchanged, and continuity-preserving retargeting when its endpoint reverses.

- [ ] **Step 1: Add the failing real-browser regression**

Create a fresh `1024x768` People page after the existing single-threshold test. Lift `player.sam-vickers`, cross Mara, Kieran, and Priya before `170ms` elapses, then reverse across Priya and Kieran. Assign stable IDs to real row animations with a page-local `WeakMap` and assert:

```js
assert.equal(afterKieran.mara.animationId, afterMara.mara.animationId);
assert.equal(afterPriya.mara.animationId, afterMara.mara.animationId);
assert.equal(afterPriya.kieran.animationId, afterKieran.kieran.animationId);
assert.notEqual(afterReversePriya.priya.animationId, afterPriya.priya.animationId);
assert.equal(afterReversePriya.mara.animationId, afterMara.mara.animationId);
assert.equal(afterReversePriya.kieran.animationId, afterKieran.kieran.animationId);
assert.ok(Math.abs(afterReversePriya.priya.visualTop - afterReversePriya.priya.reconstructedTop) < 1);
```

Scope animation counts to visible desktop person rows and the single active pointer.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because crossing Kieran replaces Mara's still-running animation.

- [ ] **Step 3: Implement minimal per-row ownership**

Use a `Map<Element, Animation>` for `state.reflowAnimations`. Before slot insertion, record each visible row's presentation rectangle and its layout top from the `offsetParent` chain. After insertion, retain the map entry when that layout top is unchanged. When it changes, cancel only that row's entry, measure its settled rectangle, and animate from `previousPresentationTop - settledTop` to zero. Guard promise cleanup by animation identity.

- [ ] **Step 4: Run focused GREEN verification**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
node tools/scripts/test-certified-people-panel.mjs
node tools/scripts/test-reorderable-collection.mjs
```

Expected: all commands PASS.

- [ ] **Step 5: Update the living interaction authority**

State that rapid crossings keep unchanged siblings on their existing easing clocks and only continuity-retarget siblings whose actual layout destinations change.

- [ ] **Step 6: Run and inspect the real-touch visual probe**

At `390x844`, hold Mara's dedicated handle and rapidly move below Rowan and back above Kieran. Capture frame telemetry and a contact sheet. Confirm monotonic start counts are one per crossed row, reversal counts are bounded to actual endpoint reversals, and the list settles without the stacked notch.

- [ ] **Step 7: Run complete verification and integrate**

Run: `npm.cmd test`

Expected: the complete alpha gate passes. Obtain independent diff review, commit with a focused conventional message, merge the verified branch to `main`, rerun the gate on the merged tree, and push `main`.
