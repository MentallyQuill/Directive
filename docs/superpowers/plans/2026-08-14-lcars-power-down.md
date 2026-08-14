# LCARS Relay Power-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dark, slightly desaturated 2.5-second powered-down prelude before every existing LCARS relay illumination without changing the illuminated timing.

**Architecture:** Keep the segment as the idle face and the existing `::after` as the unchanged illuminated layer. Add a flat `::before` dark layer, map the four approved off colors across the five panels, and align it with each existing light event through a shared per-panel delay custom property.

**Tech Stack:** CSS custom properties, CSS pseudo-elements, CSS keyframes, Node.js, Playwright.

## Global Constraints

- Use exact powered-down colors: yellow `#5d442e`, purple `#504359`, blue `#3d4c63`, and peach `#633c38`.
- Map both lilac and violet rail panels to purple `#504359`.
- Begin the powered-down prelude exactly 2.5 seconds before the existing light event.
- Dim in approximately 256ms, hold dark approximately 2.24 seconds, and crossfade out over the existing 160ms light attack.
- Preserve the existing light colors, opacity, keyframes, 32-second duration, effective delays, hold, release, paired overlap, and maximum of two lit panels.
- Animate opacity only; add no JavaScript, DOM, asset, filter, outer shadow, geometry change, or persistent state.
- Keep both pseudo-elements clipped, pointer-inert, below the labels, and transparent with animation disabled under reduced motion.
- Preserve desktop and mobile rail geometry and the existing mobile illumination strength.
- Preserve unrelated work.

---

### Task 1: Add the contained powered-down prelude

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: the five rendered `.directive-lcars-rail-segment` elements and their existing `directive-lcars-relay-press` animations.
- Produces: a rendered `directive-lcars-relay-power-down` animation on each segment's `::before` layer, synchronized 2.5 seconds ahead of the unchanged light event.

- [ ] **Step 1: Write the failing rendered behavior test**

In the existing relay evaluation, collect the real dark animations and sample both layers one second before each light event:

```js
const darkAnimations = segments.map((segment) => segment.getAnimations({ subtree: true })
  .find((animation) => animation.animationName === 'directive-lcars-relay-power-down'));
const darkAnimationCount = darkAnimations.filter(Boolean).length;

const powerDownStates = segments.map((segment, index) => {
  const lightAnimation = animations[index];
  const darkAnimation = darkAnimations[index];
  lightAnimation.pause();
  darkAnimation.pause();
  const lightDelay = Number(lightAnimation.effect.getTiming().delay);
  const darkDelay = Number(darkAnimation.effect.getTiming().delay);
  const sampleTime = lightDelay - 1000;
  lightAnimation.currentTime = sampleTime;
  darkAnimation.currentTime = sampleTime;
  const darkStyle = getComputedStyle(segment, '::before');
  const lightStyle = getComputedStyle(segment, '::after');
  return {
    color: darkStyle.backgroundColor,
    darkOpacity: Number.parseFloat(darkStyle.opacity),
    lightOpacity: Number.parseFloat(lightStyle.opacity),
    delayLead: lightDelay - darkDelay,
    duration: darkAnimation.effect.getTiming().duration,
    keyframeOffsets: darkAnimation.effect.getKeyframes().map((frame) => frame.offset)
  };
});
```

Return the dark layer's computed containment properties and the light delays. Assert literal rendered outcomes:

```js
assert.equal(relayBehavior.darkAnimationCount, 5);
assert.deepEqual(relayBehavior.lightDelays, [3000, 9000, 16000, 24000, 17550]);
assert.deepEqual(relayBehavior.powerDownStates.map(({ color }) => color), [
  'rgb(93, 68, 46)',
  'rgb(80, 67, 89)',
  'rgb(61, 76, 99)',
  'rgb(80, 67, 89)',
  'rgb(99, 60, 56)'
]);
assert.ok(relayBehavior.powerDownStates.every(({ darkOpacity }) => darkOpacity >= .98));
assert.ok(relayBehavior.powerDownStates.every(({ lightOpacity }) => lightOpacity === 0));
assert.ok(relayBehavior.powerDownStates.every(({ delayLead }) => delayLead === 2500));
assert.ok(relayBehavior.powerDownStates.every(({ duration }) => duration === 32000));
assert.ok(relayBehavior.powerDownStates.every(({ keyframeOffsets }) =>
  JSON.stringify(keyframeOffsets) === JSON.stringify([0, .008, .078125, .083125, 1])));
assert.equal(relayBehavior.darkOverlay.pointerEvents, 'none');
assert.equal(relayBehavior.darkOverlay.filter, 'none');
assert.equal(relayBehavior.darkOverlay.boxShadow, 'none');
assert.equal(relayBehavior.darkOverlay.zIndex, '0');
assert.deepEqual(relayBehavior.darkOverlay.inset, ['0px', '0px', '0px', '0px']);
```

Extend the reduced-motion sample to return both pseudo-elements and assert that each has `animationName: 'none'` and `opacity: '0'`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: FAIL because no `directive-lcars-relay-power-down` animation or dark layer exists.

- [ ] **Step 3: Implement the minimal CSS**

Give the base segment its default off color and add the flat contained layer:

```css
--directive-relay-off-color: #5d442e;
--directive-relay-delay: 3s;

.directive-expanded-shell .directive-lcars-rail-segment::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background: var(--directive-relay-off-color);
  opacity: 0;
  pointer-events: none;
  animation: directive-lcars-relay-power-down 32s linear infinite both;
  animation-delay: calc(var(--directive-relay-delay) - 2.5s);
}
```

Move each existing light delay into `--directive-relay-delay`, assign the approved off color in the existing `nth-child` rules, and set the existing light layer to `animation-delay: var(--directive-relay-delay)`.

Add the dark keyframe without changing `directive-lcars-relay-press`:

```css
@keyframes directive-lcars-relay-power-down {
  0%, 100% { opacity: 0; }
  .8% { opacity: 1; }
  7.8125% { opacity: 1; }
  8.3125% { opacity: 0; }
}
```

In reduced motion, apply the existing transparent disabled rule to both `::before` and `::after`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: PASS with exact palette, prelude timing, light timing, containment, mobile strength, paired overlap, and reduced-motion assertions green.

- [ ] **Step 5: Run full and installed visual verification**

Run `npm.cmd test`. Install the final stylesheet into `F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive\styles\directive.css` and verify SHA-256 equality with the worktree source.

At 390x844, use a fresh installed UI and natural animation time. Capture idle, fully powered-down, and illuminated frames from the same panel without forcing animation time. Confirm the dark state lasts long enough to register, the illuminated event keeps its existing timing, labels remain recognizable, no halo escapes the panel, no more than two panels illuminate, and the browser reports no page errors.

- [ ] **Step 6: Review, commit, rebase, and push main**

Request an independent review against the specification. Fix every Critical or Important finding and rerun the affected tests. Stage only the plan, rendered conformance test, and stylesheet; commit with `feat(ui): add LCARS power-down prelude`. Fetch current GitHub main with network-enabled GitHub CLI, rebase if it advanced, rerun the focused and full gates on the exact rebased tree, push `HEAD:main`, and verify the remote SHA matches the pushed commit.
