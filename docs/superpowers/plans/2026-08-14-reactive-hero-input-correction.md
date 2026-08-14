# Reactive Hero Input Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make natural mobile dragging engage the hero orbit, halve desktop reactive motion, and slow mouse response to one quarter of its current rate.

**Architecture:** Replace the touch hold timer with a 6px drag-intent state transition in the existing controller. Scale only the pure function's `precise` output by 0.5, retain the `touch` profile, and add a mouse-only class that selects a 360ms CSS transition without affecting touch or pen.

**Tech Stack:** JavaScript ES modules, Touch Events, Pointer Events, CSS transitions, Node `assert`, Playwright Chromium/CDP trusted input.

## Global Constraints

- A single-finger drag engages at 6px without a hold delay.
- The first qualifying touchmove is prevented and rendered.
- Sub-6px movement and taps remain unclaimed.
- A drag beginning on the hero owns vertical or horizontal movement; scrolling remains available when begun outside the hero.
- The strong touch frame and 22%/28% saturation distances remain unchanged.
- Every precise frame displacement is exactly half the current value; precise roll remains zero.
- Mouse engaged transitions use 360ms ease-out; touch and pen remain 90ms.
- Neutral return remains 420ms cubic-bezier(.2, .8, .2, 1).
- Preserve reduced-motion, idle animations, crop coverage, geometry, click suppression, and multi-touch cancellation.

---

### Task 1: Correct touch drag ownership

**Files:**
- Modify: `tools/scripts/test-reactive-hero-orbit.mjs`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `src/ui/reactive-hero-orbit.js`

**Interfaces:**
- Consumes: `bindReactiveHeroOrbit(hero, environment)` and the existing `touchState` lifecycle.
- Produces: pending touch state that engages after 6px without any timer.

- [ ] **Step 1: Write failing controller tests**

Change the early 11px move test to require `defaultPrevented === true`, engaged state, a retained move listener, and non-zero touch variables immediately without advancing timers. Add a separate 5px move case that remains unclaimed and becomes an ordinary tap on release.

- [ ] **Step 2: Write the failing trusted-touch proof**

Remove the 260ms wait between `touchStart` and the first qualifying `touchMove`. Assert that this immediate trusted move engages, reaches the existing strong values, prevents scroll, and returns to neutral on release.

- [ ] **Step 3: Verify RED**

Run:

```powershell
node tools/scripts/test-reactive-hero-orbit.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: the controller reports the immediate move was not prevented and not engaged; the browser proof reports the immediate phone orbit did not engage.

- [ ] **Step 4: Implement drag intent**

Replace `HOLD_DELAY_MS` for touch with `TOUCH_DRAG_THRESHOLD_PX = 6`. Do not create a touch hold timer. In `handleTouchMove`, return while displacement is below 6px; otherwise set engaged, preserve the original origin, call `preventDefault`, and queue the same move's touch frame. Keep pen hold behavior unchanged.

- [ ] **Step 5: Verify GREEN**

Run both focused scripts and confirm the immediate trusted drag passes while sub-threshold taps, multi-touch, click suppression, release, and reduced-motion tests remain green.

---

### Task 2: Halve and soften desktop response

**Files:**
- Modify: `tools/scripts/test-reactive-hero-orbit.mjs`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `src/ui/reactive-hero-orbit.js`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: `computeHeroOrbitFrame()` default precise profile and mouse pointermove lifecycle.
- Produces: exact half precise frame and `is-hero-orbit-mouse` transition state.

- [ ] **Step 1: Write failing precise-frame literals**

For 1440x500 full input expect background `-3.5/-2.25`, far `-6/-4`, near `-10/-6`, and ship `1/.5/0`. Update the compact precise literal to exact half values. Leave every touch literal unchanged.

- [ ] **Step 2: Write failing mouse-state and browser assertions**

Require mouse pointermove to add `is-hero-orbit-mouse`, pointerleave to remove it, desktop computed transition durations to equal `0.36s`, and touch engaged durations to remain `0.09s`.

- [ ] **Step 3: Verify RED**

Run the controller and visual scripts. Expected: precise literals retain current full values, the mouse class is absent, and desktop duration remains `0.09s`.

- [ ] **Step 4: Implement half precise output and mouse easing**

Apply a `0.5` multiplier only to precise background, far, near, and ship amplitudes. Toggle `is-hero-orbit-mouse` for mouse engagement and clear it from all reset paths. Add a CSS override for engaged mouse layers with `transition-duration: 360ms`; retain the existing 90ms rule for other engaged input.

- [ ] **Step 5: Verify GREEN and inspect screenshots**

Run controller, runtime-safety, and 25-route visual conformance scripts. Inspect regenerated desktop and phone orbit screenshots for half desktop depth, slower entry, strong immediate mobile response, fixed copy/actions, and intact layer coverage.

---

### Task 3: Verify and publish

**Files:**
- Verify all changed documentation, controller, CSS, and test files.

**Interfaces:**
- Consumes: both completed TDD cycles.
- Produces: full-gate-green remote `main` and matching installed runtime artifacts.

- [ ] **Step 1: Run `npm.cmd test`**

Expected: the current complete focused-check count passes.

- [ ] **Step 2: Review scope**

Run `git diff --check`, `git status --short`, and `git diff --stat origin/main...HEAD`. Exclude generated `debug.log` and ignored screenshots.

- [ ] **Step 3: Reconcile and publish**

Verify GitHub `main` with network-enabled GitHub CLI. Merge concurrent changes without rewriting history if needed, rerun focused and full gates, push `HEAD:main`, and confirm exact remote SHA.

- [ ] **Step 4: Install and verify live**

Copy the exact committed runtime/CSS files into both local SillyTavern Directive profiles, verify blob hashes, hard-reload the live host, and use trusted mobile plus desktop input to confirm the requested behavior.
