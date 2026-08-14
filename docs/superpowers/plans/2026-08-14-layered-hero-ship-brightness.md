# Layered Hero Ship Brightness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every authored foreground-ship pixel while retaining readable Campaign copy over layered space scenes.

**Architecture:** Keep the foreground asset and all animation code unchanged. Replace the layered Campaign hero's parent-level top overlay with a decorative pseudo-element inside the isolated scene at `z-index: 3`, below the `z-index: 4` ship, and add a restrained shadow to the existing copy.

**Tech Stack:** CSS stacking contexts and gradients, Node.js assertions, Playwright Chromium visual conformance.

## Global Constraints

- Apply everywhere a complete layered Campaign hero appears on desktop and mobile.
- The foreground remains opacity `1`, filter `none`, normal blending, and `z-index: 4`.
- The sunlight remains `screen` blended at `z-index: 5`.
- Static and incomplete fallback Campaign heroes retain the existing parent-level readability gradient.
- Do not change artwork, cruise animation, orbit response, semantics, pointer behavior, dependencies, or saved state.

---

### Task 1: Move layered Campaign readability below the ship

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs:770-950`
- Modify: `styles/directive.css:3586-3590, 4375-4378`

**Interfaces:**
- Consumes: `.campaign-hero > .directive-hero-scene`, its existing `isolation: isolate` stacking context, and the existing `foreground` and `sunlight` layer names.
- Produces: a scene-local `::after` scrim at `z-index: 3`, a disabled parent overlay for layered heroes, and computed-style evidence exposed by `measureCampaignDashboard()`.

- [ ] **Step 1: Write the failing browser assertions**

Extend `measureCampaignDashboard()` with these exact computed-style records:

```js
const heroAfter = getComputedStyle(hero, '::after');
const sceneAfter = getComputedStyle(scene, '::after');

// Returned with the existing measurement object:
heroOverlay: {
  content: heroAfter.content,
  backgroundImage: heroAfter.backgroundImage,
  zIndex: heroAfter.zIndex
},
sceneScrim: {
  content: sceneAfter.content,
  backgroundImage: sceneAfter.backgroundImage,
  zIndex: sceneAfter.zIndex
},
foregroundPresentation: {
  opacity: getComputedStyle(foreground).opacity,
  filter: getComputedStyle(foreground).filter,
  blend: getComputedStyle(foreground).mixBlendMode,
  zIndex: getComputedStyle(foreground).zIndex
},
sunlightPresentation: {
  blend: getComputedStyle(layers.find((layer) => layer.dataset.heroSceneLayer === 'sunlight')).mixBlendMode,
  zIndex: getComputedStyle(layers.find((layer) => layer.dataset.heroSceneLayer === 'sunlight')).zIndex
},
copyTextShadow: getComputedStyle(copy).textShadow
```

Assert for both `desktopCampaign` and `mobileCampaign`:

```js
assert.equal(campaign.heroOverlay.content, 'none');
assert.equal(campaign.heroOverlay.backgroundImage, 'none');
assert.equal(campaign.sceneScrim.content, '""');
assert.ok(campaign.sceneScrim.backgroundImage.includes('radial-gradient'));
assert.equal(campaign.sceneScrim.zIndex, '3');
assert.deepEqual(campaign.foregroundPresentation, {
  opacity: '1', filter: 'none', blend: 'normal', zIndex: '4'
});
assert.deepEqual(campaign.sunlightPresentation, { blend: 'screen', zIndex: '5' });
assert.notEqual(campaign.copyTextShadow, 'none');
```

- [ ] **Step 2: Run the visual test to verify RED**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: FAIL because the layered hero still reports the parent overlay content and no scene-local scrim.

- [ ] **Step 3: Implement the minimal CSS stacking correction**

Keep the existing fallback `.campaign-hero::after` rule unchanged. Add this layered-scene override beside the package-authored hero rules:

```css
.directive-expanded-shell .campaign-hero:has(> .directive-hero-scene)::after {
  content: none;
  background: none;
}
.directive-expanded-shell .campaign-hero > .directive-hero-scene::after {
  content: "";
  position: absolute;
  z-index: 3;
  inset: auto 0 0;
  height: 44%;
  background: radial-gradient(ellipse 78% 120% at 0% 100%, rgba(5, 7, 11, .88) 0%, rgba(5, 7, 11, .58) 42%, rgba(5, 7, 11, 0) 76%);
  pointer-events: none;
}
.directive-expanded-shell .campaign-hero:has(> .directive-hero-scene) .campaign-hero-copy {
  text-shadow: 0 2px 12px rgba(5, 7, 11, .92), 0 1px 2px rgba(5, 7, 11, 1);
}
```

The scene pseudo-element shares the isolated scene stacking context. Its `z-index: 3` paints above star fields and below the `z-index: 4` foreground, so it cannot alter ship pixels.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-package-hero-scene.mjs
```

Expected: all pass, including desktop and mobile screenshots.

- [ ] **Step 5: Inspect the generated desktop and mobile screenshots**

Inspect:

```text
artifacts/expanded-interface-visual/campaign-orbit-desktop-1440x900.png
artifacts/expanded-interface-visual/campaign-orbit-phone-390x844.png
```

Confirm the ship retains its authored highlights and hull values, the copy remains readable, and there is no layer gap, clipping, overflow, or changed geometry.

- [ ] **Step 6: Run the complete gate**

Run:

```powershell
npm.cmd test
```

Expected: all 128 focused checks pass.

- [ ] **Step 7: Commit the implementation**

```powershell
git add styles/directive.css tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "fix(ui): preserve layered ship brightness"
```

- [ ] **Step 8: Reconcile, push, install, and exact-verify**

Confirm GitHub `main` has not diverged, integrate the two commits, push to `main`, copy the verified tree to both Directive Soak B extension locations while excluding `.git`, `node_modules`, `artifacts`, `.tmp`, and `debug.log`, and compare SHA-256 hashes for `styles/directive.css` and the modified visual test between source and both installs.
