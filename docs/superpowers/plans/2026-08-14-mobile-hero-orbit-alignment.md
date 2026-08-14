# Mobile Hero Orbit Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep mobile touch parallax strong while anchoring the ship with the desktop displacement formula and zero reactive roll.

**Architecture:** Retain the existing `precise` and `touch` response profiles in `computeHeroOrbitFrame`. Continue branching the environment amplitudes for touch, but remove the foreground branch so both profiles share one small ship frame. Update the unit and trusted-touch browser contracts before changing production code.

**Tech Stack:** JavaScript ES modules, Node `assert`, Playwright/Chromium CDP, CSS custom properties.

## Global Constraints

- Preserve touch background, far-star, and near-star amplitudes exactly.
- Preserve 22% horizontal and 28% vertical touch saturation distances.
- Use the precise ship formula for both response profiles: X `clamp(width * 0.0015, 1px, 2px) * 0.5`, Y `clamp(height * 0.002, 0.5px, 1px) * 0.5`, roll `0deg`.
- Preserve the 6px touch engagement threshold, 90ms touch tracking, 360ms mouse easing, idle animations, crop, stacking, and gesture custody.
- Do not modify artwork, data, persistence, runtime authority, dependencies, or static heroes.

---

### Task 1: Lock the shared foreground response contract

**Files:**
- Modify: `tools/scripts/test-reactive-hero-orbit.mjs:128-136,238-275`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs:1230-1234`
- Modify: `src/ui/reactive-hero-orbit.js:35-43`

**Interfaces:**
- Consumes: `computeHeroOrbitFrame({ x, y, width, height, response })` and the existing CSS custom-property writer.
- Produces: touch frames with unchanged environmental values and a shared anchored ship frame.

- [ ] **Step 1: Change the direct-frame assertion before production code**

Replace the 390x220 touch expectation with:

```js
assert.deepEqual(computeHeroOrbitFrame({
  x: 1, y: 1, width: 390, height: 220, response: 'touch'
}), {
  background: { x: -3, y: -1.98 },
  far: { x: -12, y: -11 },
  near: { x: -25.35, y: -19.8 },
  ship: { x: 0.5, y: 0.25, roll: 0 }
}, 'full touch input must keep strong environment parallax while sharing the anchored desktop ship response');
```

Update the saturating 390x220 binding assertions to expect `0.5px`, `0.25px`, and `0deg`. Update the large default-rectangle touch assertion to expect the shared precise foreground values `1px` and `0.5px` instead of `16px` and `14px`.

Keep the trusted-browser far and near star assertions, but replace its foreground assertions with:

```js
assert.ok(
  orbitNumber(mobileOrbit, '--directive-hero-orbit-ship-x') > 0
    && orbitNumber(mobileOrbit, '--directive-hero-orbit-ship-x') <= .5,
  'phone orbit must keep the ship within the desktop anchoring formula'
);
assert.ok(
  orbitNumber(mobileOrbit, '--directive-hero-orbit-ship-y') > 0
    && orbitNumber(mobileOrbit, '--directive-hero-orbit-ship-y') <= .5,
  'phone orbit must keep vertical ship travel subordinate to the environment'
);
assert.equal(orbitNumber(mobileOrbit, '--directive-hero-orbit-ship-roll'), 0, 'phone orbit must not reactively rotate the ship');
```

- [ ] **Step 2: Run the focused controller test and verify RED**

Run: `node tools/scripts/test-reactive-hero-orbit.mjs`

Expected: FAIL because the existing touch frame returns `ship: { x: 9.75, y: 7.7, roll: 0.65 }` at 390x220.

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because the trusted mobile gesture still moves and rolls the ship beyond the new desktop-aligned bounds.

- [ ] **Step 3: Remove the touch-specific foreground branch**

In `computeHeroOrbitFrame`, replace the `ship` result with:

```js
ship: {
  x: scaled(normalizedX, amplitude(width, .0015, 1, 2) * .5),
  y: scaled(normalizedY, amplitude(height, .002, .5, 1) * .5),
  roll: 0
}
```

Do not alter the environment branches or `frameFromDrag` saturation math.

- [ ] **Step 4: Run the focused controller test and verify GREEN**

Run: `node tools/scripts/test-reactive-hero-orbit.mjs`

Expected: `PASS reactive hero orbit controller`.

### Task 2: Certify the trusted mobile interaction composition

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs:1230-1234`

**Interfaces:**
- Consumes: the existing CDP-generated trusted touch drag and `measureCampaignDashboard` CSS-variable measurements.
- Produces: a browser regression proving strong environmental depth with an anchored, unrotated ship.

- [ ] **Step 1: Run the visual conformance test after the implementation**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: PASS after Task 1 because the trusted touch gesture writes the new foreground frame while environmental, transition, animation, release, and overflow assertions remain unchanged.

- [ ] **Step 2: Inspect the regenerated phone orbit screenshot**

Inspect: `artifacts/expanded-interface-conformance/campaign-orbit-phone-390x844.png`

Confirm the ship does not visibly tilt or slide, the environment visibly shifts under the finger, copy remains readable, and no image edge or horizontal overflow appears.

### Task 3: Full verification and publication

**Files:**
- Verify only: repository and installed runtime files.

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: published `main` and exact installed/live evidence.

- [ ] **Step 1: Run the full gate**

Run: `npm.cmd test`

Expected: all focused checks pass with zero failures.

- [ ] **Step 2: Review the exact diff and commit**

Run: `git diff --check` and inspect `git diff`.

Commit only the design, plan, controller, and two test files. Do not include `debug.log` or unrelated workspace artifacts.

- [ ] **Step 3: Reconcile and push main**

Use GitHub CLI with network permission to confirm the current remote `main`. Fast-forward/reconcile without force, push the verified commits directly to `main`, and verify the exact remote SHA.

- [ ] **Step 4: Install and verify live mobile behavior**

Copy only changed runtime files to the exact active Directive installation, verify SHA-256 equality with the pushed source, reload SillyTavern, use trusted touch input at a mobile viewport, and confirm the same strong-environment / anchored-ship / zero-roll custom-property values.
