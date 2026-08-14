# LCARS Relay Backlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a restrained, CSS-only relay sequence that makes the five left LCARS rail segments read as flat backlit bridge panels.

**Architecture:** Keep the existing rail DOM and route colors unchanged. Add one contained `::after` light field to each segment, animate only its opacity through a shared 32-second keyframe, and use explicit per-segment delays for sparse individual events plus one controlled pair.

**Tech Stack:** CSS custom properties, pseudo-elements, CSS keyframes, Node.js source-contract tests.

## Global Constraints

- Preserve the existing five-route rail DOM, route codes, colors, geometry, gaps, corner radii, and shell behavior.
- Keep every light cue inside its segment; no outer shadow, drop shadow, bloom, white hotspot, glossy streak, filter, or geometry animation.
- Animate only pseudo-element opacity; add no JavaScript timers, runtime randomness, listeners, canvas, image assets, or DOM nodes.
- Use a deterministic 32-second choreography with mostly individual activations, one two-segment overlap, and never more than two lit segments at once.
- Target approximately 130ms attack, 650-800ms hold, and 350ms release.
- Lower peak illumination on the 24px mobile rail.
- Under `prefers-reduced-motion: reduce`, disable the animation and keep the overlays transparent.
- Preserve unrelated dirty work and generated files in the checkout.

---

### Task 1: Contained LCARS relay illumination

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: existing `.directive-lcars-rail-segment` elements and their `--directive-rail-color` values.
- Produces: decorative `.directive-lcars-rail-segment::after` light fields animated by `directive-lcars-relay-press`.

- [ ] **Step 1: Write the failing rendered-behavior test**

Add a focused relay page after the reference-page check in `tools/scripts/test-expanded-interface-visual-conformance.mjs`. Exercise the real production shell and its computed pseudo-element styles rather than grepping CSS source:

```js
const relayPage = await browser.newPage({ viewport: viewports[0] });
await relayPage.goto(`${baseUrl}/production?route=campaign`);
await relayPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);

const relayBehavior = await relayPage.evaluate(() => {
  const segments = [...document.querySelectorAll('.directive-lcars-rail-segment')];
  const animations = segments.map((segment) => segment.getAnimations({ subtree: true })
    .find((animation) => animation.animationName === 'directive-lcars-relay-press'));
  const animationCount = animations.filter(Boolean).length;
  if (animationCount !== segments.length) {
    return { segmentCount: segments.length, animationCount };
  }
  const firstStyle = getComputedStyle(segments[0], '::after');
  animations.forEach((animation) => animation.pause());
  let maxLit = 0;
  let sawSolo = false;
  let sawPair = false;
  for (let time = 0; time <= 32000; time += 100) {
    animations.forEach((animation) => { animation.currentTime = time; });
    const lit = segments.filter((segment) => Number.parseFloat(getComputedStyle(segment, '::after').opacity) > .05).length;
    maxLit = Math.max(maxLit, lit);
    sawSolo ||= lit === 1;
    sawPair ||= lit === 2;
  }
  animations.forEach((animation) => { animation.currentTime = 3500; });
  return {
    segmentCount: segments.length,
    animationCount,
    duration: animations[0]?.effect.getTiming().duration,
    illuminatedOpacity: Number.parseFloat(getComputedStyle(segments[0], '::after').opacity),
    overlay: {
      pointerEvents: firstStyle.pointerEvents,
      filter: firstStyle.filter,
      boxShadow: firstStyle.boxShadow,
      inset: [firstStyle.top, firstStyle.right, firstStyle.bottom, firstStyle.left],
      overflow: getComputedStyle(segments[0]).overflow
    },
    maxLit,
    sawSolo,
    sawPair
  };
});

assert.equal(relayBehavior.segmentCount, 5);
assert.equal(relayBehavior.animationCount, 5);
assert.equal(relayBehavior.duration, 32000);
assert.ok(relayBehavior.illuminatedOpacity >= .75 && relayBehavior.illuminatedOpacity <= .8);
assert.equal(relayBehavior.overlay.pointerEvents, 'none');
assert.equal(relayBehavior.overlay.filter, 'none');
assert.match(relayBehavior.overlay.boxShadow, /inset/);
assert.deepEqual(relayBehavior.overlay.inset, ['0px', '0px', '0px', '0px']);
assert.equal(relayBehavior.overlay.overflow, 'hidden');
assert.equal(relayBehavior.maxLit, 2);
assert.equal(relayBehavior.sawSolo, true);
assert.equal(relayBehavior.sawPair, true);
await relayPage.close();

const mobileRelayPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
await mobileRelayPage.goto(`${baseUrl}/production?route=campaign`);
await mobileRelayPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
const mobileRelayOpacity = await mobileRelayPage.locator('.directive-lcars-rail-segment').first().evaluate((segment) => {
  const animation = segment.getAnimations({ subtree: true })
    .find((candidate) => candidate.animationName === 'directive-lcars-relay-press');
  animation.pause();
  animation.currentTime = 3500;
  return Number.parseFloat(getComputedStyle(segment, '::after').opacity);
});
assert.ok(mobileRelayOpacity >= .59 && mobileRelayOpacity <= .65);
await mobileRelayPage.close();

const reducedRelayPage = await browser.newPage({ viewport: viewports[0] });
await reducedRelayPage.emulateMedia({ reducedMotion: 'reduce' });
await reducedRelayPage.goto(`${baseUrl}/production?route=campaign`);
await reducedRelayPage.waitForFunction(() => globalThis.__directiveFixtureReady === true);
const reducedRelay = await reducedRelayPage.locator('.directive-lcars-rail-segment').first().evaluate((segment) => ({
  animationName: getComputedStyle(segment, '::after').animationName,
  opacity: getComputedStyle(segment, '::after').opacity
}));
assert.equal(reducedRelay.animationName, 'none');
assert.equal(reducedRelay.opacity, '0');
await reducedRelayPage.close();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: FAIL because the rendered rail segments do not yet expose the relay pseudo-element animations.

- [ ] **Step 3: Implement the minimal contained backlight treatment**

Extend the existing rail segment CSS in `styles/directive.css`:

```css
.directive-expanded-shell .directive-lcars-rail-segment {
  --directive-rail-color: var(--directive-expanded-amber);
  --directive-relay-light-opacity: .78;
  position: relative;
  isolation: isolate;
  /* Retain every existing declaration in this rule. */
}

.directive-expanded-shell .directive-lcars-rail-segment::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--directive-rail-color) 94%, #fff4dc 6%) 0%,
    color-mix(in srgb, var(--directive-rail-color) 86%, #fff4dc 14%) 18%,
    color-mix(in srgb, var(--directive-rail-color) 86%, #fff4dc 14%) 82%,
    color-mix(in srgb, var(--directive-rail-color) 94%, #fff4dc 6%) 100%
  );
  box-shadow:
    inset 0 0 0 1px rgba(255, 248, 232, .12),
    inset 0 0 8px rgba(255, 248, 232, .08);
  opacity: 0;
  pointer-events: none;
  animation: directive-lcars-relay-press 32s linear infinite both;
}

.directive-expanded-shell .directive-lcars-rail-segment b,
.directive-expanded-shell .directive-lcars-rail-segment small {
  position: relative;
  z-index: 1;
  /* Retain the existing typography declarations. */
}

.directive-expanded-shell .directive-lcars-rail-segment:nth-child(1)::after { animation-delay: 3s; }
.directive-expanded-shell .directive-lcars-rail-segment:nth-child(2)::after { animation-delay: 9s; }
.directive-expanded-shell .directive-lcars-rail-segment:nth-child(3)::after { animation-delay: 16s; }
.directive-expanded-shell .directive-lcars-rail-segment:nth-child(4)::after { animation-delay: 24s; }
.directive-expanded-shell .directive-lcars-rail-segment:nth-child(5)::after { animation-delay: 16.35s; }

@keyframes directive-lcars-relay-press {
  0%, 100% { opacity: 0; }
  0.4% { opacity: var(--directive-relay-light-opacity); }
  2.8% { opacity: var(--directive-relay-light-opacity); }
  4% { opacity: 0; }
}
```

Inside the existing `@media (max-width: 640px)` block, add:

```css
.directive-expanded-shell .directive-lcars-rail-segment {
  --directive-relay-light-opacity: .62;
}
```

Inside the existing `@media (prefers-reduced-motion: reduce)` block near the expanded-shell rules, add:

```css
.directive-expanded-shell .directive-lcars-rail-segment::after {
  animation: none !important;
  opacity: 0 !important;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: PASS with `Expanded interface visual conformance passed 25 route/viewports and the approved modal state.`

- [ ] **Step 5: Run proportional browser and repository verification**

Run:

```powershell
npm.cmd test
```

Expected: the focused browser conformance check passes and the alpha gate exits successfully. Visually inspect desktop and 390x844 phone output during the relay cycle to confirm that all illumination remains clipped, the paired event is restrained, the route-code text stays legible, mobile strength is lower, and reduced-motion mode is static.

- [ ] **Step 6: Commit the implementation**

```powershell
git add styles/directive.css tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "feat(ui): animate LCARS relay backlights"
```
