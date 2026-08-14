# LCARS Relay Perceptibility Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing LCARS relay illumination perceptible in the installed UI while preserving its contained, backlit-prop character.

**Architecture:** Keep the existing pseudo-element and 32-second deterministic relay. Strengthen only its internal warm light field and inset response, lengthen the readable hold, and move the paired delay so no more than two panels overlap. Extend the rendered browser conformance test with composited-luminance and keyframe-timing assertions.

**Tech Stack:** CSS custom properties, CSS color mixing, CSS keyframes, Node.js, Playwright.

## Global Constraints

- Preserve the five rail segments, route colors, labels, geometry, gaps, and shell behavior.
- Keep all illumination clipped inside each segment; use no outer shadow, bloom, filter, hotspot, or geometry animation.
- Composite a 20-28% warm overlay at `.90` desktop peak opacity.
- On phone, composite a 23-32% warm overlay at `.96` peak opacity for approximately one-third more effective light contribution.
- Require 14-30 relative sRGB luminance levels of center lift on desktop and 18-36 on phone.
- Keep the 32-second deterministic cycle, with about 160ms attack, 1.6s hold, and 480ms release.
- Preserve mostly solo activations, one short nonadjacent pair, and a maximum of two illuminated segments.
- Preserve the static transparent overlay under `prefers-reduced-motion: reduce`.
- Preserve unrelated dirty work.

---

### Task 1: Enforce a perceptible contained relay

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: rendered `.directive-lcars-rail-segment` faces, their `::after` overlays, and `directive-lcars-relay-press` animations.
- Produces: a rendered conformance contract for composited luminance, timing, containment, choreography, mobile strength, and reduced motion.

- [ ] **Step 1: Write the failing rendered-behavior test**

In the existing `relayBehavior` evaluation, parse the center `color(srgb ...)` stop from each computed overlay gradient, composite it over the segment background using the rendered peak opacity, and return the relative sRGB luminance lift. Also return the animation keyframe offsets:

```js
const rgbLuminance = ([red, green, blue]) => (red * .2126) + (green * .7152) + (blue * .0722);
const parseRgb = (value) => {
  const channels = value.match(/[\d.]+/g)?.slice(-3).map(Number) ?? [];
  return channels.length === 3 ? channels : null;
};
const parseCenterOverlay = (value) => {
  const colors = [...value.matchAll(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)]
    .map((match) => match.slice(1).map((channel) => Number(channel) * 255));
  return colors[1] ?? null;
};
const compositeLuminanceLift = segments.map((segment) => {
  const face = parseRgb(getComputedStyle(segment).backgroundColor);
  const overlayStyle = getComputedStyle(segment, '::after');
  const overlay = parseCenterOverlay(overlayStyle.backgroundImage);
  const opacity = Number.parseFloat(overlayStyle.opacity);
  const composite = face.map((channel, index) => channel + ((overlay[index] - channel) * opacity));
  return rgbLuminance(composite) - rgbLuminance(face);
});
const keyframeOffsets = animations[0].effect.getKeyframes().map((frame) => frame.offset);
```

Assert the visible range and intended timing:

```js
assert.ok(relayBehavior.compositeLuminanceLift.every((lift) => lift >= 14 && lift <= 30));
assert.deepEqual(relayBehavior.keyframeOffsets, [0, .005, .055, .07, 1]);
assert.ok(mobileRelay.every(({ compositeLuminanceLift }) => compositeLuminanceLift >= 18 && compositeLuminanceLift <= 36));
assert.ok(mobileRelay.every(({ opacity }) => opacity >= .94 && opacity <= .98));
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: FAIL because the current phone lift is below 18 and its peak opacity is `.82`.

- [ ] **Step 3: Implement the minimal CSS correction**

Change the light field and choreography in `styles/directive.css`:

```css
--directive-relay-light-opacity: .90;

background: linear-gradient(
  90deg,
  color-mix(in srgb, var(--directive-rail-color) 80%, #fff4dc 20%) 0%,
  color-mix(in srgb, var(--directive-rail-color) 72%, #fff4dc 28%) 18%,
  color-mix(in srgb, var(--directive-rail-color) 72%, #fff4dc 28%) 82%,
  color-mix(in srgb, var(--directive-rail-color) 80%, #fff4dc 20%) 100%
);
box-shadow:
  inset 0 0 0 1px rgba(255, 248, 232, .22),
  inset 0 0 10px rgba(255, 248, 232, .14);

.directive-expanded-shell .directive-lcars-rail-segment:nth-child(5)::after { animation-delay: 17.55s; }

@keyframes directive-lcars-relay-press {
  0%, 100% { opacity: 0; }
  .5% { opacity: var(--directive-relay-light-opacity); }
  5.5% { opacity: var(--directive-relay-light-opacity); }
  7% { opacity: 0; }
}
```

Keep the desktop light field unchanged. In the existing phone breakpoint, set `--directive-relay-light-opacity: .96` and override the overlay gradient with 23% pale warmth at the edges and 32% through the center. Do not change any animation duration, delay, or keyframe offset.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: PASS with the rendered luminance, timing, containment, choreography, phone, and reduced-motion assertions green.

- [ ] **Step 5: Verify the installed natural-time experience**

Run `npm.cmd test`, install the changed extension artifact into the active `default-user` profile, and use Playwright at 1280x900 and 390x844. Capture a true idle frame and a naturally reached peak frame. Confirm the active segment is plainly distinguishable in peripheral vision, labels stay readable, no glow escapes its bounds, no more than two segments overlap, and the browser reports no page errors.

- [ ] **Step 6: Commit and push main**

Stage only the spec, plan, conformance test, and stylesheet. Commit with a focused conventional message, confirm the resulting commit is on `main`, push `main` to `origin`, and verify the remote main SHA matches local HEAD.
