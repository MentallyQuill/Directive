# Campaign Ship Window Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an intentionally over-visible Breckenridge window-light calibration for live evaluation.

**Architecture:** Keep the existing ship-card DOM and package contract unchanged. Strengthen only the window overlay opacity and the alpha floor of its existing deterministic mask asset; retain the single Screen-blended layer and 18-second mask travel.

**Tech Stack:** CSS masking and blending, lossless WebP, Playwright Chromium, Node.js assertion scripts.

## Global Constraints

- Set the normal and reduced-motion window opacity to exactly `0.96`.
- Remap the existing noise alpha range from 88–210 to 199–255, preserving its pixels, 256 by 256 dimensions, and lossless WebP format.
- Keep one window layer, Screen blending, and the 18-second deterministic animation.
- Do not change the nacelle effect, ship drift, card yaw or pitch, scene geometry, layer order, scale, or package paths.
- Preserve unrelated `debug.log` changes.

---

### Task 1: Raise the window-layer opacity

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: rendered `[data-hero-ship-layer="windows"]` computed style
- Produces: normal and reduced-motion opacity `0.96` without changing Screen blending, registration, or animation

- [x] **Step 1: Add the failing opacity assertion**

Assert the existing `desktopCampaign.shipLayerOpacities[1]` measurement is exactly `0.96`, and make the same assertion after reduced motion is enabled.

```js
assert.equal(desktopCampaign.shipLayerOpacities[1], '0.96');
assert.equal(reducedCampaign.shipLayerOpacities[1], '0.96');
```

- [x] **Step 2: Run the visual test and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because the current opacity is `0.66`.

- [x] **Step 3: Raise both CSS opacity values**

Change only the normal and reduced-motion window rules.

```css
.directive-expanded-shell .directive-hero-ship-card-layer[data-hero-ship-layer="windows"] {
  opacity: .96;
}

@media (prefers-reduced-motion: reduce) {
  .directive-expanded-shell .directive-hero-ship-card-layer[data-hero-ship-layer="windows"] {
    opacity: .96;
  }
}
```

- [x] **Step 4: Run the visual test and verify GREEN**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: PASS with both opacity assertions at `0.96`.

---

### Task 2: Raise the deterministic mask floor

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `assets/packages/breckenridge/images/ship/uss-breckenridge.hero-window-noise.webp`

**Interfaces:**
- Consumes: the existing window-layer selector and deterministic 256 by 256 RGBA mask
- Produces: a `0.96` Screen-blended overlay whose moving mask remains between 78% and 100% alpha

- [x] **Step 1: Add a failing mask-alpha assertion**

Load the same-origin mask URL in the Playwright page, draw its 256 by 256 pixels to a test-only canvas, and return the minimum and maximum values from every fourth RGBA byte. Assert the exact authored range.

```js
assert.deepEqual(desktopCampaign.windowNoiseAlphaRange, { min: 199, max: 255 });
```

- [x] **Step 2: Run the visual test and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because the current alpha range is 88–210.

- [x] **Step 3: Remap the mask alpha deterministically**

Use the bundled Pillow runtime to preserve RGB values while mapping each alpha byte with this exact clamped formula, then save lossless WebP over the existing asset:

```python
new_alpha = round(199 + (old_alpha - 88) * (56 / 122))
new_alpha = max(199, min(255, new_alpha))
```

- [x] **Step 4: Run the visual test and verify GREEN**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: PASS with exact alpha range 199–255.

- [x] **Step 5: Run adjacent focused tests**

Run:

```powershell
node tools/scripts/test-package-hero-scene.mjs
node tools/scripts/test-reactive-hero-orbit.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: all pass with unchanged geometry, orbit, nacelle animation, and one stronger window layer.

---

### Task 3: Browser polish, repository gate, and publication

**Files:**
- Modify only Task 1–2 files if browser evidence reveals a contract defect.

**Interfaces:**
- Consumes: the production Campaign fixture at desktop and 390 by 844 mobile viewports
- Produces: live visual evidence, complete test evidence, and an exact-SHA push to `main`

- [x] **Step 1: Inspect the overshoot in Playwright**

At desktop and mobile sizes, sample two mask phases and confirm the windows are plainly visible, remain registered to the ship, move internally without flashing, and do not affect nacelles or overflow.

- [x] **Step 2: Run the complete verification gate**

Run:

```powershell
git diff --check
npm.cmd test
```

Expected: the complete alpha gate passes with no scoped whitespace errors.

- [ ] **Step 3: Commit the implementation**

Stage only the CSS, mask asset, visual test, and this plan. Do not stage `debug.log`.

```powershell
git commit -m "style(campaign): boost ship windows"
```

- [ ] **Step 4: Push and verify exact SHA**

Verify the remote base has not advanced, push `main`, then confirm GitHub's `main` SHA equals local `HEAD`.
