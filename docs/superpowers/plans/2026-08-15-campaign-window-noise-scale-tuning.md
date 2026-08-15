# Campaign Window Noise Scale Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tune the existing Campaign ship-window noise to a seamless 15-second traversal with noise features reduced to 75% of their current size.

**Architecture:** Keep the existing one-layer CSS mask system. Change only its tested timing, tile dimensions, and matching one-tile keyframe endpoint; retain the current texture, blend, opacity, and reduced-motion behavior.

**Tech Stack:** CSS animations, Node.js assertion scripts, Playwright visual conformance.

## Global Constraints

- Window animation is `15s linear -3.75s infinite`.
- Window mask size is exactly `192px 192px`.
- Keyframe travel is exactly `-192px -192px` for a seamless one-tile loop.
- Existing mask texture, opacity, blend, ship composition, nacelle animation, orbit, drift, and reduced-motion behavior remain unchanged.

---

### Task 1: Tune and certify the window-noise traversal

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: computed styles collected by the existing expanded-interface visual-conformance route.
- Produces: a regression-protected `15s` continuous window animation using a `192px` repeating mask tile and one-tile keyframe travel.

- [ ] **Step 1: Write the failing conformance expectations**

Change the window duration, delay, and mask-size assertions to:

```js
assert.deepEqual(desktopCampaign.shipLayerAnimationDurations, ['0s', '15s', '2s']);
assert.deepEqual(desktopCampaign.shipLayerAnimationDelays, ['0s', '-3.75s', '-0.5s']);
assert.deepEqual(desktopCampaign.shipLayerMaskSizes, ['auto', '192px 192px', 'auto']);
```

Add an assertion against the stylesheet contract that the `directive-hero-windows-live` endpoint uses `-192px -192px` for both prefixed and standard mask positions.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: FAIL because live CSS still reports `10s`, `-2.5s`, `256px 256px`, and `-256px -256px`.

- [ ] **Step 3: Implement the minimal CSS tuning**

Set the window mask size to `192px 192px`, animation to `15s linear -3.75s infinite`, and both keyframe endpoint declarations to `-192px -192px`.

- [ ] **Step 4: Run focused and full verification**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
npm.cmd test
```

Expected: focused conformance passes all route/viewports and the full gate exits zero.

- [ ] **Step 5: Verify the live installed surface**

Sync the two modified source files to the installed Directive extension, confirm source/install hashes match, and inspect the live Campaign window layer for `15s`, `-3.75s`, `192px 192px`, linear running motion, and production-size alignment.

- [ ] **Step 6: Commit**

```powershell
git add styles/directive.css tools/scripts/test-expanded-interface-visual-conformance.mjs docs/superpowers/specs/2026-08-15-campaign-window-noise-scale-tuning-design.md docs/superpowers/plans/2026-08-15-campaign-window-noise-scale-tuning.md
git commit -m "style(campaign): retune window noise"
```
