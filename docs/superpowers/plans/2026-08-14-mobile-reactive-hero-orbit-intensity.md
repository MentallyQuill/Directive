# Mobile Reactive Hero Orbit Intensity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give engaged mobile touch drags a clearly stronger layered-camera orbit while preserving the exact desktop hover and idle-cruise behavior.

**Architecture:** Extend the existing pure frame function with an optional `response` profile and select `touch` only from the engaged touch path. Keep all input custody, CSS composition, rendering, and Campaign binding boundaries unchanged. Certify the new behavior with literal controller expectations and trusted browser input.

**Tech Stack:** JavaScript ES modules, Touch Events, CSS individual transforms, Node `assert`, Playwright Chromium.

## Global Constraints

- Default `computeHeroOrbitFrame` output and desktop mouse/pen behavior remain unchanged.
- Only an engaged single-touch sequence uses `response: 'touch'`.
- Touch saturation changes from 30%/40% to 22%/28% of hero width/height.
- The authored background group retains the existing crop-safe precise amplitudes.
- Touch distant stars use X `clamp(width * 0.030, 12px, 24px)` and Y `clamp(height * 0.050, 10px, 20px)`.
- Touch near stars use X `clamp(width * 0.065, 22px, 42px)` and Y `clamp(height * 0.090, 18px, 34px)`.
- Touch ship uses X `clamp(width * 0.025, 8px, 16px)`, Y `clamp(height * 0.035, 7px, 14px)`, and maximum roll `0.65deg`.
- Preserve the 240ms hold, 10px tolerance, native pre-hold scroll, post-hold custody, click suppression, neutral release, reduced-motion inertness, static Campaign covers, and continuous idle animations.
- Add no dependency, global listener, persistence, scale effect, artwork, or device-orientation input.

---

### Task 1: Add and select the stronger touch frame

**Files:**
- Modify: `tools/scripts/test-reactive-hero-orbit.mjs`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `src/ui/reactive-hero-orbit.js`
- Regenerate: `artifacts/expanded-interface-conformance/campaign-orbit-phone-390x844.png` (ignored verification artifact)

**Interfaces:**
- Consumes: `computeHeroOrbitFrame({ x, y, width, height, response? })` and the existing engaged touch sequence.
- Produces: `response: 'touch'` exact frame values; omitted or unknown response uses the existing precise frame.

- [ ] **Step 1: Write the failing pure-frame test**

Add this literal expectation after the existing precise-frame assertions:

```js
assert.deepEqual(computeHeroOrbitFrame({
  x: 1, y: 1, width: 390, height: 220, response: 'touch'
}), {
  background: { x: -3, y: -1.98 },
  far: { x: -12, y: -11 },
  near: { x: -25.35, y: -19.8 },
  ship: { x: 9.75, y: 7.7, roll: 0.65 }
});
```

The production mutation caught by this test is routing `touch` through the existing precise amplitudes.

- [ ] **Step 2: Write the failing engaged-touch saturation test**

Create a 390x220 fake hero, engage a touch at `(195, 110)`, and move it by exactly 22% width and 28% height:

```js
const { hero, scene } = createCruiseHero({
  rect: { left: 0, top: 0, width: 390, height: 220 }
});
const start = touch(61, 195, 110);
hero.dispatch('touchstart', { touches: [start], changedTouches: [start] });
environment.advanceTimers(240);
const edgeward = touch(61, 280.8, 171.6);
hero.dispatch('touchmove', { touches: [edgeward], changedTouches: [edgeward] });
environment.flushAnimationFrame();
assert.equal(scene.styleProperties.get('--directive-hero-orbit-near-x'), '-25.35px');
assert.equal(scene.styleProperties.get('--directive-hero-orbit-near-y'), '-19.8px');
assert.equal(scene.styleProperties.get('--directive-hero-orbit-ship-x'), '9.75px');
assert.equal(scene.styleProperties.get('--directive-hero-orbit-ship-roll'), '0.65deg');
```

The production mutations caught are retaining 30%/40% saturation or failing to select the touch profile from the real gesture path.

- [ ] **Step 3: Add failing trusted-phone strength assertions**

After the existing `assertOrbitDepth(mobileOrbit, 'phone orbit')` in `test-expanded-interface-visual-conformance.mjs`, add hand-derived minimum magnitudes that the current precise profile cannot satisfy:

```js
assert.ok(orbitNumber(mobileOrbit, '--directive-hero-orbit-far-x') <= -12);
assert.ok(orbitNumber(mobileOrbit, '--directive-hero-orbit-near-x') <= -22);
assert.ok(orbitNumber(mobileOrbit, '--directive-hero-orbit-ship-x') >= 8);
assert.ok(orbitNumber(mobileOrbit, '--directive-hero-orbit-ship-roll') >= .6);
```

Keep the existing trusted-event, native scrolling, held custody, compatibility-click, edge coverage, idle animation, neutral release, reduced-motion, and overflow assertions.

The production mutation caught is an engaged trusted touch selecting the default precise frame instead of the stronger touch frame.

- [ ] **Step 4: Run both proofs and verify RED**

Run:

```powershell
node tools/scripts/test-reactive-hero-orbit.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: the controller test fails because `response: 'touch'` still returns precise values, beginning with far X `-6` instead of `-12`; the browser proof fails at the first phone-strength assertion for the same missing behavior.

- [ ] **Step 5: Implement the minimal response profile**

In `computeHeroOrbitFrame`, derive `touchResponse = response === 'touch'`. Preserve the existing background calculation. Select exact touch ratios/floors/ceilings only for far, near, ship, and roll; keep the current expressions as the default branch.

Update `frameFromDrag` to accept a response argument, use `.22`/`.28` normalization only for `touch`, and pass the response through to `computeHeroOrbitFrame`. Call it with `'touch'` only from `handleTouchMove`; pen continues to omit the argument.

- [ ] **Step 6: Run the controller and trusted-browser proofs and verify GREEN**

Run:

```powershell
node tools/scripts/test-reactive-hero-orbit.mjs
node tools/scripts/test-browser-runtime-safety.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: `PASS reactive hero orbit controller`, browser runtime safety passes for every production module, and expanded-interface conformance passes all 25 route/viewports.

- [ ] **Step 7: Inspect the regenerated phone screenshot**

Open `artifacts/expanded-interface-conformance/campaign-orbit-phone-390x844.png` and verify the ship has a clear edgeward reaction, star depth is visible, the roll remains restrained, the authored image covers every edge, and Campaign copy/actions remain fixed and readable.

- [ ] **Step 8: Commit the touch profile and its proofs**

```powershell
git add -- src/ui/reactive-hero-orbit.js tools/scripts/test-reactive-hero-orbit.mjs tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "feat(ui): strengthen mobile hero orbit"
```

---

### Task 2: Final integration and publication

**Files:**
- Verify all committed files from Task 1.

**Interfaces:**
- Consumes: the complete touch-profile implementation and browser proof.
- Produces: reviewed, full-gate-green `main` with an exact verified remote SHA.

- [ ] **Step 1: Run the full repository gate**

Run: `npm.cmd test`

Expected: `[v1-gate] passed 125 focused checks.`

- [ ] **Step 2: Review the complete diff**

Run:

```powershell
git diff --check origin/main...HEAD
git status --short
git diff --stat origin/main...HEAD
```

Confirm only the mobile orbit spec/plan, controller, controller tests, and browser conformance test changed. Confirm `debug.log` and ignored screenshots are not staged.

- [ ] **Step 3: Integrate current remote main without history loss**

Fetch the current remote with network permission. If it advanced, merge or rebase it in the isolated worktree, resolve only genuine overlaps, and rerun the affected browser proof plus the full gate. Never force-push or overwrite concurrent work.

- [ ] **Step 4: Push and verify**

Push the verified worktree head to `main`. Use GitHub CLI with network permission to confirm remote `main` exactly equals local `HEAD`.
