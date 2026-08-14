# Desktop Hero Orbit Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve desktop hero reactivity while making the ship visually anchored and removing reactive desktop roll.

**Architecture:** Change only the default `precise` ship amplitudes in the pure orbit-frame function. Keep the environment, touch profile, input controller, CSS composition, and rendering boundaries unchanged. Lock the result with literal controller expectations and trusted desktop browser assertions.

**Tech Stack:** JavaScript ES modules, Pointer Events, CSS individual transforms, Node `assert`, Playwright Chromium.

## Global Constraints

- Desktop environment amplitudes and inverse depth ordering remain unchanged.
- Precise-pointer ship X is `clamp(width * 0.0015, 1px, 2px)`.
- Precise-pointer ship Y is `clamp(height * 0.002, 0.5px, 1px)`.
- Precise-pointer reactive ship roll is exactly `0deg`.
- The complete `touch` response remains unchanged.
- Preserve idle animations, transition timing, crop coverage, geometry, neutral release, reduced-motion inertness, and all gesture custody behavior.
- Add no dependency, listener, persistent state, artwork, or new response profile.

---

### Task 1: Rebalance the precise ship frame

**Files:**
- Modify: `tools/scripts/test-reactive-hero-orbit.mjs`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `src/ui/reactive-hero-orbit.js`
- Regenerate: `artifacts/expanded-interface-conformance/campaign-orbit-desktop-1440x900.png` (ignored verification artifact)

**Interfaces:**
- Consumes: `computeHeroOrbitFrame({ x, y, width, height, response? })` and the existing mouse/pen input paths.
- Produces: the rebalanced default `precise` frame; `response: 'touch'` remains unchanged.

- [ ] **Step 1: Write the failing pure-frame expectations**

Change the two precise frame literals in `test-reactive-hero-orbit.mjs`:

```js
ship: { x: 2, y: 1, roll: 0 }
```

for 1440x500 full input, and:

```js
ship: { x: -1, y: -0.5, roll: 0 }
```

for the clamped 390x112 input. Update the bound mouse-path assertions to require `2px` and `0deg`. Do not change the literal touch-frame tests.

The production mutations caught are retaining excessive desktop ship travel or any reactive desktop roll.

- [ ] **Step 2: Add failing trusted-desktop bounds**

After `assertOrbitDepth(desktopOrbit, 'desktop orbit')`, assert literal behavior:

```js
assert.ok(orbitNumber(desktopOrbit, '--directive-hero-orbit-ship-x') > 0);
assert.ok(orbitNumber(desktopOrbit, '--directive-hero-orbit-ship-x') <= 2);
assert.ok(orbitNumber(desktopOrbit, '--directive-hero-orbit-ship-y') > 0);
assert.ok(orbitNumber(desktopOrbit, '--directive-hero-orbit-ship-y') <= 1);
assert.equal(orbitNumber(desktopOrbit, '--directive-hero-orbit-ship-roll'), 0);
```

Keep the existing inverse-depth, idle-animation, geometry, overflow, and neutral-release assertions.

- [ ] **Step 3: Run both focused proofs and verify RED**

Run:

```powershell
node tools/scripts/test-reactive-hero-orbit.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: the controller fails because ship X is `8` rather than `2`; the browser proof fails at the new ship bound or zero-roll assertion.

- [ ] **Step 4: Implement the minimal precise-profile change**

In the non-touch ship branches of `computeHeroOrbitFrame`, use:

```js
x: amplitude(width, .0015, 1, 2)
y: amplitude(height, .002, .5, 1)
roll: 0
```

Keep the current touch branches exactly as written.

- [ ] **Step 5: Run focused proofs and verify GREEN**

Run:

```powershell
node tools/scripts/test-reactive-hero-orbit.mjs
node tools/scripts/test-browser-runtime-safety.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: the controller and runtime-safety tests pass, and expanded-interface conformance passes all route/viewports.

- [ ] **Step 6: Inspect the regenerated desktop screenshot**

Open `artifacts/expanded-interface-conformance/campaign-orbit-desktop-1440x900.png`. Verify the ship remains visually anchored without roll, the environment still produces depth, authored edges remain covered, and Campaign copy/actions remain fixed.

- [ ] **Step 7: Commit the implementation and proofs**

```powershell
git add -- src/ui/reactive-hero-orbit.js tools/scripts/test-reactive-hero-orbit.mjs tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "fix(ui): anchor desktop hero orbit"
```

---

### Task 2: Verify and publish

**Files:**
- Verify all committed design, plan, implementation, and test files.

**Interfaces:**
- Consumes: the complete desktop orbit correction.
- Produces: full-gate-green `main` with an exact verified remote SHA.

- [ ] **Step 1: Run the full repository gate**

Run: `npm.cmd test`

Expected: `[v1-gate] passed 125 focused checks.` or the current exact expanded gate count.

- [ ] **Step 2: Review the complete diff**

Run:

```powershell
git diff --check origin/main...HEAD
git status --short
git diff --stat origin/main...HEAD
```

Confirm only the two documentation files, controller, controller test, and browser conformance test changed. Confirm `debug.log` and ignored screenshots are not staged.

- [ ] **Step 3: Reconcile current remote main**

Verify GitHub `main` with network-enabled GitHub CLI. If it advanced, merge it without rewriting concurrent history and rerun the focused browser proof plus full gate.

- [ ] **Step 4: Push and verify**

Push the verified worktree head to `main`, then use network-enabled GitHub CLI to confirm remote `main` exactly equals local `HEAD`.
