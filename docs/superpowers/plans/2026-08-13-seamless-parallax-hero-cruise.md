# Seamless Parallax Hero Cruise Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the Breckenridge Campaign and Ship heroes as a restrained, continuously cruising scene with two seamless star-parallax planes, an aligned sunlight pulse, and full-strength mobile ship drift.

**Architecture:** Extend the exact package-owned layered hero record with an optional all-or-nothing `cruise` asset set. The resolver certifies that set, the renderer adds bounded decorative layers only when it is complete, and CSS runs compositor-friendly one-tile translations whose terminal pixels equal their initial pixels. Checked-in deterministic SVG assets own the seamless star distributions and aligned light pass; no per-frame JavaScript or runtime randomness is introduced.

**Tech Stack:** JavaScript ES modules, package JSON, deterministic SVG assets, CSS transforms/blending, Node `assert`, Playwright Chromium.

## Global Constraints

- Preserve existing campaign, mission, Ship, save, prompt, and package authority.
- Add no particles, dust, streaks, canvas, video, runtime randomness, or JavaScript animation loop.
- Keep the authored Background and Stars artwork static in cruise mode.
- Render Background, Stars, Far Stars, Near Stars, Ship, Sunlight, readability gradient, then copy.
- Activate cruise effects only when `farStars`, `nearStars`, and `sunlight` all exist on the exact requested image record.
- Translate each repeating field by exactly one displayed tile with linear infinite transform animation; never animate its opacity, scale, filter, background position, or blend mode.
- Keep near-field screen velocity between 1.8 and 2.4 times far-field velocity.
- Keep the existing `30s` ship-drift frequency; double the current mobile translation, rotation, and scale delta.
- Stop all meaningful movement under `prefers-reduced-motion: reduce` while retaining the complete static composition.
- Preserve unrelated `debug.log`, `.codex-remote-attachments/`, and `docs/technical/STORY_DIRECTOR_TURN_FLOW.md` changes.

---

### Task 1: Certify the optional package cruise contract

**Files:**
- Modify: `tools/scripts/test-package-hero-scene-resolver.mjs`
- Modify: `src/packages/package-hero-scene-resolver.mjs`

**Interfaces:**
- Consumes: exact `assets.images[]` records selected by `kind` and `subjectId`.
- Produces: `resolvePackageHeroScene(...).cruise` as a frozen `{ farStars, nearStars, sunlight }` object only for a complete exact-record set.

- [ ] **Step 1: Write the failing resolver assertions**

Add a complete `cruise` object to the Breckenridge fixture and assert:

```js
cruise: {
  farStars: 'breckenridge-stars-far.svg',
  nearStars: 'breckenridge-stars-near.svg',
  sunlight: 'breckenridge-sunlight.svg'
}
```

Add a second base-complete fixture with only `cruise.farStars`; assert its resolved scene has no `cruise` property. Retain the missing-subject and incomplete-base assertions.

- [ ] **Step 2: Run the resolver test and verify RED**

Run: `node tools/scripts/test-package-hero-scene-resolver.mjs`

Expected: FAIL because the resolved scene does not expose `cruise`.

- [ ] **Step 3: Implement all-or-nothing cruise normalization**

After validating the base layers, normalize all three cruise paths. Build the scene as:

```js
const cruiseSource = layers?.cruise;
const farStars = String(cruiseSource?.farStars || '').trim();
const nearStars = String(cruiseSource?.nearStars || '').trim();
const sunlight = String(cruiseSource?.sunlight || '').trim();
const cruise = farStars && nearStars && sunlight
  ? Object.freeze({ farStars, nearStars, sunlight })
  : null;

return Object.freeze({
  type: 'layered-scene',
  source: 'package',
  id: normalizeId(image.id),
  kind: requestedKind,
  subjectId: requestedSubjectId,
  alt: String(image.alt || ''),
  layers: Object.freeze({ background, stars, foreground }),
  ...(cruise ? { cruise } : {})
});
```

- [ ] **Step 4: Run the resolver test and verify GREEN**

Run: `node tools/scripts/test-package-hero-scene-resolver.mjs`

Expected: `PASS package hero scene resolver`.

- [ ] **Step 5: Commit the contract boundary**

```powershell
git add -- src/packages/package-hero-scene-resolver.mjs tools/scripts/test-package-hero-scene-resolver.mjs
git commit -m "feat(ui): certify hero cruise assets"
```

---

### Task 2: Add deterministic seamless package assets

**Files:**
- Create: `tools/scripts/generate-hero-cruise-assets.mjs`
- Create: `assets/packages/breckenridge/images/ship/uss-breckenridge.hero-stars-far.svg`
- Create: `assets/packages/breckenridge/images/ship/uss-breckenridge.hero-stars-near.svg`
- Create: `assets/packages/breckenridge/images/ship/uss-breckenridge.hero-sunlight.svg`
- Modify: `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json`
- Modify: `src/packages/bundled-package-registry.mjs`
- Modify: `tools/scripts/test-bundled-package-registry.mjs`

**Interfaces:**
- Consumes: the Task 1 `layers.cruise` package shape.
- Produces: three exact package-owned effect paths and reproducible transparent SVG assets.

- [ ] **Step 1: Write failing registry and asset assertions**

Extend `expectedHeroLayers` with:

```js
cruise: {
  farStars: 'assets/packages/breckenridge/images/ship/uss-breckenridge.hero-stars-far.svg',
  nearStars: 'assets/packages/breckenridge/images/ship/uss-breckenridge.hero-stars-near.svg',
  sunlight: 'assets/packages/breckenridge/images/ship/uss-breckenridge.hero-sunlight.svg'
}
```

Flatten both base and cruise values for existence checks. Read the SVG text and assert both star assets expose `viewBox="0 0 960 600"`, the sunlight asset exposes `viewBox="0 0 1672 941"`, and none contains an opaque full-canvas background.

- [ ] **Step 2: Run the registry test and verify RED**

Run: `node tools/scripts/test-bundled-package-registry.mjs`

Expected: FAIL because the package contract and effect assets are absent.

- [ ] **Step 3: Add the deterministic SVG generator**

Implement a checked-in generator using only `node:fs`, `node:path`, and a fixed-seed PRNG. Generate circles on a `960x600` torus; for every circle whose radius crosses an edge, emit corresponding copies shifted by `+-960` and/or `+-600`. Use these fixed profiles:

```js
const profiles = {
  far: { seed: 0x7456f001, count: 230, radius: [0.22, 0.72], opacity: [0.28, 0.68] },
  near: { seed: 0x7456a002, count: 92, radius: [0.55, 1.65], opacity: [0.45, 0.88] }
};
```

Choose deterministically among `#fff7e8`, `#e9f2ff`, and `#bfd7ff`. Do not add filters or streak geometry. Generate the sunlight SVG in the aligned `1672x941` coordinate system with a broad radial gradient centered near the painted sun at approximately `(1540, 175)` and a transparent diagonal wash; include no opaque rect or second star disc.

- [ ] **Step 4: Generate and register the assets**

Run: `node tools/scripts/generate-hero-cruise-assets.mjs`

Add the exact `cruise` object to the Breckenridge `layers` record in both the bundled package JSON and the library teaser registry. In `teaser()`, clone nested cruise fields when present:

```js
layers: {
  ...layers,
  ...(layers.cruise ? { cruise: { ...layers.cruise } } : {})
}
```

- [ ] **Step 5: Run the registry and resolver tests and verify GREEN**

Run:

```powershell
node tools/scripts/test-bundled-package-registry.mjs
node tools/scripts/test-package-hero-scene-resolver.mjs
```

Expected: both scripts print `PASS`.

- [ ] **Step 6: Commit the package assets**

```powershell
git add -- tools/scripts/generate-hero-cruise-assets.mjs assets/packages/breckenridge/images/ship/uss-breckenridge.hero-stars-far.svg assets/packages/breckenridge/images/ship/uss-breckenridge.hero-stars-near.svg assets/packages/breckenridge/images/ship/uss-breckenridge.hero-sunlight.svg packages/bundled/breckenridge/ashes-of-peace.campaign-package.json src/packages/bundled-package-registry.mjs tools/scripts/test-bundled-package-registry.mjs
git commit -m "feat(ui): add hero cruise artwork"
```

---

### Task 3: Render cruise layers with exact fallback behavior

**Files:**
- Modify: `tools/scripts/test-package-hero-scene.mjs`
- Modify: `src/ui/package-hero-scene.js`

**Interfaces:**
- Consumes: optional certified `scene.cruise` from Task 1.
- Produces: cruise DOM order `background`, `stars`, `stars-far`, `stars-near`, `foreground`, `sunlight`; legacy layered scenes retain `background`, `stars`, `stars-glow`, `foreground`.

- [ ] **Step 1: Write failing renderer assertions**

Give the layered renderer fixture a complete cruise set. Extend the fake style object so `setProperty(name, value)` records values. Assert the frame has `directive-hero-scene-has-cruise`; assert the six-layer order; assert both star fields are non-image decorative elements with `--directive-hero-star-texture` URLs; assert sunlight is an image; and retain empty alt/`aria-hidden` checks.

Add a second complete base scene without cruise and assert it retains the four legacy layers including `stars-glow`.

- [ ] **Step 2: Run the renderer test and verify RED**

Run: `node tools/scripts/test-package-hero-scene.mjs`

Expected: FAIL on the missing cruise class and layers.

- [ ] **Step 3: Implement bounded cruise layer factories**

Add a helper that creates a decorative `span`, assigns `data-hero-scene-layer`, sets `aria-hidden="true"`, and stores the resolved asset URL in `--directive-hero-star-texture`. In `createPackageHeroVisual`:

```js
frame.appendChild(createSceneLayer('background', scene.layers.background, loading));
frame.appendChild(createSceneLayer('stars', scene.layers.stars, loading));
if (scene.cruise) {
  frame.classList.add('directive-hero-scene-has-cruise');
  frame.appendChild(createStarFieldLayer('stars-far', scene.cruise.farStars));
  frame.appendChild(createStarFieldLayer('stars-near', scene.cruise.nearStars));
} else {
  frame.appendChild(createSceneLayer('stars-glow', scene.layers.stars, loading));
}
frame.appendChild(createSceneLayer('foreground', scene.layers.foreground, loading));
if (scene.cruise) frame.appendChild(createSceneLayer('sunlight', scene.cruise.sunlight, loading));
```

- [ ] **Step 4: Run focused renderer/resolver tests and verify GREEN**

Run:

```powershell
node tools/scripts/test-package-hero-scene.mjs
node tools/scripts/test-package-hero-scene-resolver.mjs
```

Expected: both scripts print `PASS`.

- [ ] **Step 5: Commit the renderer**

```powershell
git add -- src/ui/package-hero-scene.js tools/scripts/test-package-hero-scene.mjs
git commit -m "feat(ui): render hero cruise layers"
```

---

### Task 4: Implement seamless CSS motion and full-strength mobile drift

**Files:**
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`

**Interfaces:**
- Consumes: Task 3 layer names and `--directive-hero-star-texture`.
- Produces: fixed-opacity one-tile transform loops, restrained sunlight pulse, and doubled mobile ship-motion bounds.

- [ ] **Step 1: Replace old browser expectations with failing cruise contracts**

Update `measureCampaignDashboard()` to collect each layer's tag, background repeat/image/size, opacity, blend, animation names/durations/timing, transform, and `will-change`. Assert the six-layer order and authored natural sizes only for image layers. Assert:

```js
far:  { size: '1344px 840px', duration: '240s', timing: 'linear' }
near: { size: '960px 600px', duration: '90s', timing: 'linear' }
```

Assert both repeat, have constant computed opacity, and use transform-only `will-change`. Assert the authored `stars` layer has no animation in cruise mode, sunlight uses `screen`, and ship keeps `30s`. Change mobile motion bounds to scale `1.03`/`1.05` and rotation `-.15deg`/`.15deg`; also collect and assert the mobile translation variables equal desktop `-3%/-1.2%/3%/1.2%`.

- [ ] **Step 2: Run visual conformance and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because cruise layers and new motion contracts have no styles.

- [ ] **Step 3: Add cruise variables, stacking, and animations**

In the hero-scene block declare exact tile sizes, negative travel endpoints, and durations. Style cruise fields as oversized repeated backgrounds with constant opacity and `screen` blend. Use separate keyframes whose `to` transforms equal one complete tile:

```css
@keyframes directive-hero-stars-far-cruise {
  to { transform: translate3d(-1344px, -840px, 0); }
}
@keyframes directive-hero-stars-near-cruise {
  to { transform: translate3d(-960px, -600px, 0); }
}
```

Set the far layer to `240s linear` and near layer to `90s linear`, with unrelated negative delays. Keep the authored stars static only under `.directive-hero-scene-has-cruise`. Give sunlight aligned image geometry, z-order above the ship, `screen` blend, and an asymmetric low-amplitude opacity/brightness keyframe. Raise the existing readability gradient, copy, and any hero control above the new effect layers.

- [ ] **Step 4: Double mobile ship amplitude without changing frequency**

In the coarse/mobile block set translation and rotation variables equal to desktop. In the mobile framing block keep rest scale `1.04` and change the animated bounds to `1.03` and `1.05`. Leave the foreground animation at `30s`.

- [ ] **Step 5: Complete reduced-motion behavior**

Stop both cruise fields, ship, and sunlight animations. Set cruise transforms to `none`, sunlight opacity to the midpoint, and filters to `none`; retain existing mobile/desktop rest-scale behavior.

- [ ] **Step 6: Run browser conformance and focused unit tests and verify GREEN**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
node tools/scripts/test-package-hero-scene.mjs
node tools/scripts/test-package-hero-scene-resolver.mjs
node tools/scripts/test-bundled-package-registry.mjs
```

Expected: every script prints `PASS`; browser artifacts include desktop and `390x844` Campaign screenshots with no overflow or geometry regression.

- [ ] **Step 7: Commit the motion treatment**

```powershell
git add -- styles/directive.css tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "feat(ui): animate seamless hero cruise"
```

---

### Task 5: Verify motion quality, fallback, and the full repository

**Files:**
- Modify only if evidence exposes a defect in files already owned by Tasks 1-4.

**Interfaces:**
- Consumes: complete integrated cruise scene.
- Produces: evidence that source, browser behavior, reduced motion, fallback, and repository gates agree.

- [ ] **Step 1: Run focused source and browser gates from a clean state**

Run:

```powershell
node tools/scripts/test-package-hero-scene-resolver.mjs
node tools/scripts/test-package-hero-scene.mjs
node tools/scripts/test-bundled-package-registry.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: all pass with no generated tracked-file noise except the expected browser artifact directory if ignored.

- [ ] **Step 2: Inspect desktop and mobile screenshots and live motion**

Use the real production fixture at `1440x900` and mobile Chromium at `390x844`. Observe at least one near-field and far-field displacement interval. Confirm point-shaped stars, two readable speeds, no opacity pumping, no exposed tile edge, no obvious synchronized pattern, no text washout, and a barely perceptible registered sun pulse. Confirm mobile ship motion is visibly stronger without clipping.

- [ ] **Step 3: Inspect reduced motion and legacy fallback**

Emulate `prefers-reduced-motion: reduce` and verify all four animations are stopped at deterministic states. Render a package fixture without `cruise` and verify the existing four-layer scene still animates according to its legacy contract.

- [ ] **Step 4: Run the full gate**

Run: `npm.cmd test`

Expected: every repository check passes.

- [ ] **Step 5: Review scope and diff hygiene**

Run:

```powershell
git diff --check main...HEAD
git status --short
git diff --stat main...HEAD
git diff main...HEAD -- src/packages/package-hero-scene-resolver.mjs src/ui/package-hero-scene.js styles/directive.css packages/bundled/breckenridge/ashes-of-peace.campaign-package.json src/packages/bundled-package-registry.mjs tools/scripts assets/packages/breckenridge/images/ship docs/superpowers
```

Expected: only planned feature files differ; unrelated user-owned paths remain untouched.

- [ ] **Step 6: Commit any evidence-driven tuning**

If visual verification required bounded opacity, timing, or asset corrections, stage only those exact files and commit:

```powershell
git commit -m "fix(ui): tune hero cruise motion"
```

If no corrections were needed, do not create an empty commit.
