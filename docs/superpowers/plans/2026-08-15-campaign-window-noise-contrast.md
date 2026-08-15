# Campaign Window Noise Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make individual Campaign ship windows visibly change through a faster, higher-contrast continuous procedural mask.

**Architecture:** Preserve the existing single Screen-blended window overlay and its 256×256 repeating mask. Rebuild only the mask alpha distribution from the original source and change only the CSS traversal duration and relative phase; validate both decoded asset properties and real SillyTavern presentation.

**Tech Stack:** CSS animations, lossless WebP, Pillow, Node.js assertions, Chromium/Playwright, SillyTavern localhost host.

## Global Constraints

- Keep one window cutout layer at `.96` opacity with `mix-blend-mode: screen`.
- Keep continuous linear mask travel; do not use steps, a shared pulse, an animated image, or another layer.
- Use a 10-second traversal and preserve the quarter-cycle phase with a `-2.5s` delay.
- Map the darkest 35% of original alpha samples to 0, the brightest 35% to 255, and smoothstep the middle 30%.
- Preserve the original RGB channels, tile size, repeat behavior, direction, reduced-motion freeze, ship composition, drift, 3D orbit, and nacelle animation.
- Use the complete live SillyTavern composition at production size as perceptibility proof.

---

### Task 1: Increase continuous window-mask contrast and speed

**Files:**
- Modify: `assets/packages/breckenridge/images/ship/uss-breckenridge.hero-window-noise.webp`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Reference: `docs/superpowers/specs/2026-08-15-campaign-window-noise-contrast-design.md`

**Interfaces:**
- Consumes: the original mask blob at commit `973e939eceabf3edb2c4aedc6d4e0e47d0c0fb22` and the existing `[data-hero-ship-layer="windows"]` CSS contract.
- Produces: a 256×256 lossless WebP with deterministic decoded pixels and a live CSS animation of `10s linear -2.5s infinite`.

- [ ] **Step 1: Compute the intended production asset contract without modifying the asset**

Read the original mask from Git, normalize its alpha range, find the 35th and 65th percentile cut points, map values below/above those cuts to 0/255, and smoothstep the samples between them:

```python
t = np.clip((alpha - low) / (high - low), 0.0, 1.0)
contrasted = np.rint((t * t * (3.0 - (2.0 * t))) * 255.0).astype(np.uint8)
```

Record the expected Chromium-decoded digest and exact fractions of alpha samples equal to 0 and 255. Do not write the production file in this step.

- [ ] **Step 2: Write the failing visual conformance expectation**

Extend `measureWindowNoiseAlphaRange()` to return `darkFraction` and `brightFraction`, calculated as the fraction of decoded pixels whose alpha is exactly 0 or 255. Extend `measureCampaignDashboard()` with `shipLayerAnimationDelays`, using the same `shipLayers.map(...)` pattern as durations. Update the expected window mask contract with the intended digest/fractions, and update the expected window animation duration/delay:

```js
assert.deepEqual(desktopCampaign.shipLayerAnimationDurations, ['0s', '10s', '2s']);
assert.deepEqual(desktopCampaign.shipLayerAnimationDelays, ['0s', '-2.5s', '-0.5s']);
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: FAIL because the current mask digest/distribution and `18s`/`-4.5s` timing do not meet the new contract.

- [ ] **Step 4: Rebuild the lossless production mask from the original source**

Use Pillow and NumPy to apply the exact percentile/smoothstep transformation from Step 1. Preserve RGB, replace only alpha, and save lossless WebP with `quality=100`, `method=6`, and `exact=True`.

- [ ] **Step 5: Implement the minimal CSS timing change**

Change only the window layer declaration in `styles/directive.css`:

```css
animation: directive-hero-windows-live 10s linear -2.5s infinite;
```

Do not change opacity, blend mode, mask size, keyframes, reduced-motion rules, or other ship layers.

- [ ] **Step 6: Run focused and adjacent tests and verify GREEN**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
node tools/scripts/test-package-hero-scene.mjs
node tools/scripts/test-reactive-hero-orbit.mjs
```

Expected: all pass, with Chromium proving the new asset digest/distribution and 10-second continuous timing.

- [ ] **Step 7: Validate perceptibility in the complete live composition**

Synchronize the changed production asset and stylesheet to the installed Directive extension, reload SillyTavern, and capture multiple clean frames over 6–10 seconds at the real Campaign display size. Confirm individual windows or small window banks visibly change without a shared pulse, while nacelles, geometry, drift, orbit, scale, and alignment remain unchanged.

- [ ] **Step 8: Run final verification**

Run:

```powershell
git diff --check
npm.cmd test
```

Expected: the complete Directive gate passes. If a browser test is denied a temporary localhost bind by the sandbox, rerun that exact test with localhost permission and require a passing result.

- [ ] **Step 9: Review, commit, integrate, and verify remote/install state**

Review only the intended mask, CSS, test, spec, and plan changes; exclude `debug.log`. Commit with concise conventional messages, verify remote `main` has not moved unexpectedly, push the completed branch to `main`, hash-compare source and installed production files, and confirm GitHub `main` resolves to the exact pushed SHA.
