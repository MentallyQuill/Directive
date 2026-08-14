# Reactive Layered Hero Orbit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the seamless layered Campaign cruise as idle motion and add a restrained inverse-parallax camera orbit on mouse hover or deliberate mobile press-and-hold drag everywhere the complete cruise hero appears.

**Architecture:** Add one focused controller that binds to a rendered Campaign hero only when it contains `.directive-hero-scene-has-cruise`. The controller normalizes input and writes transient CSS variables; CSS individual `translate` and `rotate` properties compose those values with the existing `transform` keyframes so cruise animation never pauses or restarts. Campaign rendering owns attachment, while package resolution and scene construction remain unchanged.

**Tech Stack:** JavaScript ES modules, Pointer Events for mouse/pen, Touch Events for scroll-safe finger custody, CSS individual transforms, Node `assert`, Playwright Chromium.

## Global Constraints

- Apply the effect to Campaign Library previews, saved/current Campaign details, mobile Campaign records, and the active Campaign dashboard whenever the rendered hero has a complete cruise scene.
- Keep the existing far-star cruise, near-star cruise, ship drift, and sunlight pulse running continuously beneath the response.
- Move authored background, authored stars, and sunlight together opposite input; move far stars farther and near stars farthest; move the ship slightly with input and roll it by at most `0.22deg`.
- Use the exact amplitude formulas from `docs/superpowers/specs/2026-08-13-reactive-hero-orbit-design.md`.
- Mouse hover uses absolute position around the hero center. Touch reaches full response at 30% of hero width horizontally and 40% of hero height vertically.
- Finger input requires a single touch inside `10px` for `240ms`; before engagement, scrolling and tapping remain unclaimed.
- Active retargeting uses `90ms ease-out`; idle return uses `420ms cubic-bezier(.2, .8, .2, 1)`.
- A completed hold suppresses its synthetic click. A short tap and keyboard activation retain the current expand/collapse behavior.
- `prefers-reduced-motion: reduce` keeps reactive values neutral and prevents gesture engagement.
- Add no global listeners, persistent state, dependencies, canvas, video, runtime randomness, device orientation, or package/save changes.
- Preserve unrelated `debug.log`, `.codex-remote-attachments/`, and `docs/technical/STORY_DIRECTOR_TURN_FLOW.md` work.

---

### Task 1: Build and certify the orbit controller

**Files:**
- Create: `src/ui/reactive-hero-orbit.js`
- Create: `tools/scripts/test-reactive-hero-orbit.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: a Campaign hero element containing `.directive-hero-scene-has-cruise` and an optional environment object exposing browser timing/media APIs.
- Produces: `computeHeroOrbitFrame({ x, y, width, height })` and `bindReactiveHeroOrbit(hero, environment = globalThis) -> boolean`.
- Writes: `--directive-hero-orbit-background-x`, `--directive-hero-orbit-background-y`, `--directive-hero-orbit-far-x`, `--directive-hero-orbit-far-y`, `--directive-hero-orbit-near-x`, `--directive-hero-orbit-near-y`, `--directive-hero-orbit-ship-x`, `--directive-hero-orbit-ship-y`, and `--directive-hero-orbit-ship-roll` on the scene.

- [ ] **Step 1: Write failing frame-math tests**

Create a fake scene/hero DOM and assert exact neutral, clamped positive, and clamped negative frames:

```js
const rightDown = computeHeroOrbitFrame({ x: 1, y: 1, width: 1440, height: 500 });
assert.deepEqual(rightDown, {
  background: { x: -7, y: -5 },
  far: { x: -12, y: -8 },
  near: { x: -20, y: -12 },
  ship: { x: 8, y: 5, roll: 0.22 }
});
assert.deepEqual(
  computeHeroOrbitFrame({ x: 0, y: 0, width: 390, height: 112 }).ship,
  { x: 0, y: 0, roll: 0 }
);
```

Also assert that `x` and `y` clamp to `[-1, 1]`, compact heroes honor amplitude floors, and every environment magnitude maintains `near > far > background`.

- [ ] **Step 2: Write failing precise-pointer behavior tests**

Use a fake environment with queued animation frames and `matchMedia().matches === false`. Assert:

```js
assert.equal(bindReactiveHeroOrbit(cruiseHero, environment), true);
assert.equal(cruiseHero.dataset.heroOrbitBound, 'true');
cruiseHero.dispatch('pointermove', { pointerType: 'mouse', clientX: 400, clientY: 150 });
environment.flushAnimationFrame();
assert.equal(scene.styleProperties.get('--directive-hero-orbit-near-x'), '-20px');
assert.equal(scene.styleProperties.get('--directive-hero-orbit-ship-x'), '8px');
assert.equal(cruiseHero.classList.contains('is-hero-orbit-engaged'), true);
cruiseHero.dispatch('pointerleave', { pointerType: 'mouse' });
environment.flushAnimationFrame();
assert.equal(scene.styleProperties.get('--directive-hero-orbit-near-x'), '0px');
```

Assert duplicate binding returns `false`, a legacy scene returns `false`, `pointercancel` resets, and reduced motion never engages or writes a non-neutral frame.

- [ ] **Step 3: Write failing touch-custody tests**

Use controllable `setTimeout` and synthetic single-touch records. Prove:

- movement beyond `10px` before `240ms` cancels the pending hold without `preventDefault`;
- a short touch followed by click is not suppressed;
- a stationary `240ms` hold adds `is-hero-orbit-engaged`;
- engaged movement calls `preventDefault`, normalizes displacement against 30%/40% of the hero dimensions, and writes inverse environment/positive ship values;
- touch end resets values and suppresses exactly the following pointer-generated click, but not a keyboard click with `detail === 0`;
- a second simultaneous touch cancels pending or engaged custody;
- engaged `contextmenu` is prevented and neutral `contextmenu` is not.

- [ ] **Step 4: Run the focused test and verify RED**

Run: `node tools/scripts/test-reactive-hero-orbit.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/ui/reactive-hero-orbit.js`.

- [ ] **Step 5: Implement exact orbit math and scene writes**

Implement clamping and amplitude helpers, then return the public frame shape:

```js
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const amplitude = (size, ratio, floor, ceiling) => clamp(size * ratio, floor, ceiling);

export function computeHeroOrbitFrame({ x = 0, y = 0, width = 0, height = 0 } = {}) {
  const nx = clamp(x, -1, 1);
  const ny = clamp(y, -1, 1);
  return {
    background: { x: -nx * amplitude(width, .006, 3, 7), y: -ny * amplitude(height, .012, 2, 5) },
    far: { x: -nx * amplitude(width, .010, 6, 12), y: -ny * amplitude(height, .020, 4, 8) },
    near: { x: -nx * amplitude(width, .018, 10, 20), y: -ny * amplitude(height, .030, 6, 12) },
    ship: { x: nx * amplitude(width, .0065, 3, 8), y: ny * amplitude(height, .012, 2, 5), roll: nx * .22 }
  };
}
```

Round CSS output to three decimal places, normalize negative zero, and initialize every bound scene with an exact neutral frame.

- [ ] **Step 6: Implement precise-pointer input**

In `bindReactiveHeroOrbit`, locate the cruise scene, reject duplicates/fallbacks, and bind hero-local `pointermove`, `pointerleave`, and `pointercancel` listeners. Mouse movement uses the pointer position relative to the hero center. Pen input uses the same hold threshold as touch and calls `setPointerCapture` only after engagement. Coalesce writes with one scheduled animation frame; use a synchronous fallback only when `requestAnimationFrame` is unavailable.

- [ ] **Step 7: Implement scroll-safe single-touch custody**

Bind `touchstart`, `touchmove`, `touchend`, and `touchcancel` on the hero. Register `touchmove` with `{ passive: false }`, but call `preventDefault()` only after the `240ms` hold engages. Track the originating touch identifier, cancel on early movement or multi-touch, drive engaged response from displacement relative to the activation point, and schedule click-suppression expiry after `400ms` so it cannot block a later tap.

Bind `click` in capture phase. Suppress only an armed pointer-generated click (`detail !== 0`), then disarm immediately. Bind `contextmenu` only on the hero and prevent it only while engaged.

- [ ] **Step 8: Add the focused test to the repository gate and verify GREEN**

Insert `test-reactive-hero-orbit.mjs` directly after `test-package-hero-scene.mjs` in `tools/scripts/run-alpha-gate.mjs`.

Run: `node tools/scripts/test-reactive-hero-orbit.mjs`

Expected: `PASS reactive hero orbit controller`.

- [ ] **Step 9: Commit the controller boundary**

```powershell
git add -- src/ui/reactive-hero-orbit.js tools/scripts/test-reactive-hero-orbit.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(ui): add reactive hero orbit controller"
```

---

### Task 2: Attach orbit everywhere and compose it with cruise CSS

**Files:**
- Modify: `src/ui/campaign-panel.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-certified-campaign-panel.mjs`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`

**Interfaces:**
- Consumes: `bindReactiveHeroOrbit(hero)` and the nine scene variables from Task 1.
- Produces: every complete Campaign cruise hero has `data-hero-orbit-bound="true"`; CSS individual transforms apply the frame without replacing existing animation names.

- [ ] **Step 1: Write failing Campaign-context assertions**

Give the Ashes fixture in `test-certified-campaign-panel.mjs` a complete layered cruise image and extend its fake element with `style.setProperty`. Assert both the active dashboard hero and every rendered Ashes Campaign/Library hero are bound, while coming-later static heroes are not:

```js
assert.equal(dashboardHero.dataset.heroOrbitBound, 'true');
assert.equal(ashesHero.dataset.heroOrbitBound, 'true');
assert.equal(futureDetail.dataset.heroOrbitBound, undefined);
```

Retain all existing dashboard, responsive toggle, player-safe fact, and mobile accordion assertions.

- [ ] **Step 2: Write failing CSS composition assertions**

Extend the stylesheet preflight in `test-expanded-interface-visual-conformance.mjs` to require:

```js
/data-hero-scene-layer="background"[^}]+translate:\s*var\(--directive-hero-orbit-background-x\)\s+var\(--directive-hero-orbit-background-y\)/s
/data-hero-scene-layer="foreground"[^}]+translate:\s*calc\(-50%\s*\+\s*var\(--directive-hero-orbit-ship-x\)\)[^;]+calc\(-50%\s*\+\s*var\(--directive-hero-orbit-ship-y\)\)/s
/\.is-hero-orbit-engaged[^}]+90ms\s+ease-out/s
/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]+--directive-hero-orbit-ship-roll:\s*0deg/
```

Also require the existing cruise animation names to remain present.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: Campaign binding and orbit CSS assertions fail.

- [ ] **Step 4: Bind both Campaign construction paths**

Import `bindReactiveHeroOrbit` in `campaign-panel.js`. Call it once at the end of `appendCampaignDetail` after optional responsive-hero setup, and once at the end of `appendPackageDetail` after `bindResponsiveHero`. The binding function's scene check keeps static and legacy fallbacks inert.

- [ ] **Step 5: Add neutral variables and layer mappings**

Initialize the nine variables on `.directive-hero-scene`. Map them with individual transforms:

```css
[data-hero-scene-layer="background"],
[data-hero-scene-layer="stars"],
[data-hero-scene-layer="sunlight"] {
  translate: var(--directive-hero-orbit-background-x) var(--directive-hero-orbit-background-y);
}
[data-hero-scene-layer="stars-far"] {
  translate: var(--directive-hero-orbit-far-x) var(--directive-hero-orbit-far-y);
}
[data-hero-scene-layer="stars-near"] {
  translate: var(--directive-hero-orbit-near-x) var(--directive-hero-orbit-near-y);
}
[data-hero-scene-layer="foreground"] {
  translate: calc(-50% + var(--directive-hero-orbit-ship-x)) calc(-50% + var(--directive-hero-orbit-ship-y));
  rotate: var(--directive-hero-orbit-ship-roll);
}
```

Remove the old standalone foreground `translate: -50% -50%` declaration. Do not alter any `animation` declaration or keyframe.

- [ ] **Step 6: Add active and return easing**

Give only cruise-scene layers `translate 420ms cubic-bezier(.2, .8, .2, 1)` and the foreground an additional matching `rotate` transition. Under `.campaign-hero.is-hero-orbit-engaged`, retarget both properties with `90ms ease-out`. Under reduced motion, force all nine variables to their neutral units, remove these transitions, and preserve the existing static transforms.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```powershell
node tools/scripts/test-reactive-hero-orbit.mjs
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-package-hero-scene.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: all four scripts print `PASS`.

- [ ] **Step 8: Commit integration and composition**

```powershell
git add -- src/ui/campaign-panel.js styles/directive.css tools/scripts/test-certified-campaign-panel.mjs tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "feat(ui): react layered heroes to orbit input"
```

---

### Task 3: Prove real desktop and mobile interaction, then ship

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Create: `artifacts/expanded-interface/campaign-orbit-desktop-1440x900.png` (verification artifact, do not commit unless repository policy already tracks this directory)
- Create: `artifacts/expanded-interface/campaign-orbit-phone-390x844.png` (verification artifact, do not commit unless repository policy already tracks this directory)

**Interfaces:**
- Consumes: the bound controller and composed CSS from Tasks 1-2.
- Produces: browser-level evidence of direction, depth ordering, uninterrupted idle animations, reset behavior, mobile hold custody, click arbitration, reduced motion, and crop safety.

- [ ] **Step 1: Add browser measurement helpers**

Extend `measureCampaignDashboard` to return `hero.dataset.heroOrbitBound`, engaged class state, and all nine inline scene variables. Add a helper that parses the pixel variables as numbers while preserving the roll value.

- [ ] **Step 2: Add desktop hover-orbit assertions**

Before enabling reduced motion, move the mouse to the hero's lower-right quadrant, wait `120ms`, and assert:

- background/far/near X and Y values are negative;
- `abs(near) > abs(far) > abs(background)` on both axes;
- ship X and Y values are positive and roll is positive but no greater than `0.22deg`;
- layer animation names and durations exactly match the pre-hover cruise values;
- hero copy and action rectangles do not move;
- dashboard horizontal overflow stays at most `1px`.

Capture `campaign-orbit-desktop-1440x900.png`. Move outside the hero, wait `450ms`, and assert every variable is neutral.

- [ ] **Step 3: Add reduced-motion inertness assertions**

After `page.emulateMedia({ reducedMotion: 'reduce' })`, move across the hero and assert the engaged class remains absent, all variables remain neutral, and the existing reduced-motion animation assertions still pass.

- [ ] **Step 4: Add real mobile hold-drag assertions**

In the 390x844 touch context, dispatch a real single-touch start at the hero center, wait `260ms`, dispatch a cancelable touch move down-right by at least 30% width and 40% height, and assert `dispatchEvent` reports cancellation from `preventDefault`. Verify the same sign/depth ordering as desktop and capture `campaign-orbit-phone-390x844.png`.

Dispatch touch end, wait `450ms`, and assert neutral variables and no overflow. Enter Campaign browser mode, repeat a shorter hold-drag on the visible responsive Ashes hero, dispatch the synthetic click, and assert its `aria-expanded` state does not change. Then perform a fresh short tap and assert expansion still toggles.

- [ ] **Step 5: Run the browser conformance proof**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: `PASS expanded interface visual conformance` and both orbit screenshots exist without layer gaps, clipping, copy drift, text washout, or obvious card-like sliding.

- [ ] **Step 6: Run the full repository gate**

Run: `npm.cmd test`

Expected: `[v1-gate] passed` with every focused check green.

- [ ] **Step 7: Review the final diff and commit browser proof changes**

Run:

```powershell
git diff --check
git status --short
git diff --stat origin/main...HEAD
```

Confirm only intended source, tests, specs, and plans are staged; leave the user's unrelated dirty files untouched.

```powershell
git add -- tools/scripts/test-expanded-interface-visual-conformance.mjs docs/superpowers/plans/2026-08-13-reactive-hero-orbit.md
git commit -m "test(ui): prove reactive hero orbit"
```

- [ ] **Step 8: Verify GitHub custody and push exact main**

Run GitHub CLI with network permission:

```powershell
gh auth status
gh repo view --json nameWithOwner,url,defaultBranchRef
git rev-parse HEAD
git push origin main
gh api repos/{owner}/{repo}/commits/main --jq .sha
```

Expected: authenticated GitHub CLI, successful push, and remote `main` SHA exactly equals local `HEAD`.
