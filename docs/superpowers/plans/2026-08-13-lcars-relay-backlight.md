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
- Modify: `tools/scripts/test-expanded-interface-shell.mjs`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: existing `.directive-lcars-rail-segment` elements and their `--directive-rail-color` values.
- Produces: decorative `.directive-lcars-rail-segment::after` light fields animated by `directive-lcars-relay-press`.

- [ ] **Step 1: Write the failing source-contract tests**

Append focused assertions after the existing LCARS rail layout assertions in `tools/scripts/test-expanded-interface-shell.mjs`:

```js
const railSegmentRule = css.match(/\.directive-expanded-shell \.directive-lcars-rail-segment\s*\{([\s\S]*?)\n\}/)?.[1] || '';
assert.match(railSegmentRule, /position:\s*relative/);
assert.match(railSegmentRule, /isolation:\s*isolate/);
assert.match(railSegmentRule, /--directive-relay-light-opacity:\s*\.78/);

const relayOverlayRule = css.match(/\.directive-expanded-shell \.directive-lcars-rail-segment::after\s*\{([\s\S]*?)\n\}/)?.[1] || '';
assert.match(relayOverlayRule, /position:\s*absolute/);
assert.match(relayOverlayRule, /inset:\s*0/);
assert.match(relayOverlayRule, /border-radius:\s*inherit/);
assert.match(relayOverlayRule, /color-mix\(in srgb,\s*var\(--directive-rail-color\)/);
assert.match(relayOverlayRule, /box-shadow:\s*inset[\s\S]*?,\s*inset/);
assert.match(relayOverlayRule, /pointer-events:\s*none/);
assert.match(relayOverlayRule, /animation:\s*directive-lcars-relay-press\s+32s\s+linear\s+infinite\s+both/);
assert.doesNotMatch(relayOverlayRule, /filter\s*:|drop-shadow|text-shadow\s*:/);
assert.match(css, /\.directive-expanded-shell \.directive-lcars-rail-segment:nth-child\(1\)::after\s*\{\s*animation-delay:\s*3s/);
assert.match(css, /\.directive-expanded-shell \.directive-lcars-rail-segment:nth-child\(2\)::after\s*\{\s*animation-delay:\s*9s/);
assert.match(css, /\.directive-expanded-shell \.directive-lcars-rail-segment:nth-child\(3\)::after\s*\{\s*animation-delay:\s*16s/);
assert.match(css, /\.directive-expanded-shell \.directive-lcars-rail-segment:nth-child\(4\)::after\s*\{\s*animation-delay:\s*24s/);
assert.match(css, /\.directive-expanded-shell \.directive-lcars-rail-segment:nth-child\(5\)::after\s*\{\s*animation-delay:\s*16\.35s/);
assert.match(css, /@keyframes\s+directive-lcars-relay-press\s*\{[\s\S]*?0%,\s*100%\s*\{\s*opacity:\s*0[\s\S]*?0\.4%\s*\{\s*opacity:\s*var\(--directive-relay-light-opacity\)[\s\S]*?2\.8%\s*\{\s*opacity:\s*var\(--directive-relay-light-opacity\)[\s\S]*?4%\s*\{\s*opacity:\s*0/);
assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.directive-expanded-shell \.directive-lcars-rail-segment\s*\{[\s\S]*?--directive-relay-light-opacity:\s*\.62/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.directive-expanded-shell \.directive-lcars-rail-segment::after\s*\{[\s\S]*?animation:\s*none\s*!important;[\s\S]*?opacity:\s*0\s*!important/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node tools/scripts/test-expanded-interface-shell.mjs
```

Expected: FAIL because the rail segment rule does not yet establish the relay stacking boundary or light overlay.

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
node tools/scripts/test-expanded-interface-shell.mjs
```

Expected: PASS with `Expanded interface shell tests passed.`

- [ ] **Step 5: Run proportional browser and repository verification**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
npm.cmd test
```

Expected: the focused browser conformance check passes and the alpha gate exits successfully. Visually inspect desktop and 390x844 phone output during the relay cycle to confirm that all illumination remains clipped, the paired event is restrained, the route-code text stays legible, mobile strength is lower, and reduced-motion mode is static.

- [ ] **Step 6: Commit the implementation**

```powershell
git add styles/directive.css tools/scripts/test-expanded-interface-shell.mjs
git commit -m "feat(ui): animate LCARS relay backlights"
```
