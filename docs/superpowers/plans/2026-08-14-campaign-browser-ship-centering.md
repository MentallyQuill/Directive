# Campaign Browser Ship Centering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center Campaigns-browser foreground ships vertically on desktop and mobile without changing the active Campaign dashboard.

**Architecture:** Extend the existing browser-hero Playwright measurements to certify the foreground anchor relative to the scene center, then add one CSS selector scoped through `.campaign-browser-hero`. Reuse the existing active-dashboard assertions as a negative boundary proving its `+20px` desktop and `-20px` phone offsets remain unchanged.

**Tech Stack:** CSS absolute positioning, browser DOM geometry, Node.js assertions, Playwright Chromium.

## Global Constraints

- Apply only to selected details under `Your Stories` and `Campaign Library` in the Campaigns browser.
- Use a neutral `50%` foreground anchor on desktop and mobile.
- Preserve hero height, foreground scale, horizontal position, layered artwork, and animation.
- Preserve the active Campaign dashboard desktop `+20px` and phone `-20px` offsets.
- Preserve the Ship route and all runtime authority state.
- Inspect complete Ashes of Peace compositions at `1440x900` and `390x844`.
- Preserve unrelated dirty files in the checkout.

---

### Task 1: Center and certify Campaigns-browser foreground ships

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs:450-570`
- Modify: `styles/directive.css:4610-4620`

**Interfaces:**
- Consumes: `.campaign-browser-hero`, `.directive-hero-scene`, and `[data-hero-scene-layer="foreground"]`.
- Produces: a browser-only foreground vertical offset of `0` relative to the hero-scene center.

- [ ] **Step 1: Add failing foreground composition measurements**

Expand `measureBrowserHero` to measure the layered scene:

```js
const measureBrowserHero = async (hero) => hero.evaluate((node) => {
  const scene = node.querySelector('.directive-hero-scene');
  const layers = [...node.querySelectorAll('.directive-hero-scene-layer')];
  const foreground = layers.find((layer) => layer.dataset.heroSceneLayer === 'foreground');
  const sceneStyle = getComputedStyle(scene);
  return {
    height: node.getBoundingClientRect().height,
    responsive: node.classList.contains('directive-responsive-hero'),
    toggleCount: node.querySelectorAll('.directive-responsive-hero-toggle').length,
    ariaExpanded: node.getAttribute('aria-expanded'),
    transitionDuration: getComputedStyle(node).transitionDuration,
    horizontalOverflow: node.scrollWidth - node.clientWidth,
    foregroundVerticalOffset: foreground.offsetTop - (scene.clientHeight / 2),
    layerOrder: layers.map((layer) => layer.dataset.heroSceneLayer),
    scaleStart: sceneStyle.getPropertyValue('--directive-hero-ship-scale-start').trim(),
    scaleEnd: sceneStyle.getPropertyValue('--directive-hero-ship-scale-end').trim()
  };
});
```

For the initial visible saved-story hero, assert:

```js
assert.ok(Math.abs(storyHeroBefore.foregroundVerticalOffset) < 1);
assert.deepEqual(storyHeroBefore.layerOrder, ['background', 'stars', 'stars-far', 'stars-near', 'foreground', 'sunlight']);
assert.equal(storyHeroBefore.scaleStart, viewport.width <= 640 ? '1.03' : '.79');
assert.equal(storyHeroBefore.scaleEnd, viewport.width <= 640 ? '1.05' : '.81');
```

Select the playable Ashes of Peace package and assert the same zero offset, layer order, and scale bounds for its visible `.campaign-library-hero`:

```js
const availableRow = viewport.width <= 640
  ? page.locator('.campaign-mobile-trigger[data-campaign-availability="available"]').first()
  : page.locator('.campaign-desktop-master button[data-campaign-availability="available"]').first();
await availableRow.click();
const ashesLibraryHero = page.locator('.campaign-library-hero:visible').first();
const ashesLibraryComposition = await measureBrowserHero(ashesLibraryHero);
assert.ok(Math.abs(ashesLibraryComposition.foregroundVerticalOffset) < 1);
assert.deepEqual(ashesLibraryComposition.layerOrder, storyHeroBefore.layerOrder);
assert.equal(ashesLibraryComposition.scaleStart, storyHeroBefore.scaleStart);
assert.equal(ashesLibraryComposition.scaleEnd, storyHeroBefore.scaleEnd);
```

Capture the exact selected Ashes composition at the representative widths:

```js
if (viewport.width === 1440 || viewport.width === 390) {
  await page.screenshot({
    path: path.join(artifactRoot, `campaign-browser-ashes-centered-${viewport.width}x${viewport.height}.png`)
  });
}
```

Keep the existing future-package checks after this selection and add the same zero-offset assertion to `libraryHeroBefore`. Keep the active-dashboard assertions at the end of the file unchanged:

```js
assert.ok(Math.abs(desktopCampaign.sourceCanvas.verticalOffset - 20) < 1);
assert.ok(Math.abs(mobileCampaign.sourceCanvas.verticalOffset + 20) < 1);
```

- [ ] **Step 2: Run visual conformance and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL at the 1440px saved-story composition because the current browser foreground offset is `+20px` instead of `0`.

- [ ] **Step 3: Add the minimal browser-only centerline rule**

After the phone-specific shared foreground rule, add:

```css
.directive-expanded-shell .campaign-browser-hero .directive-hero-scene-layer[data-hero-scene-layer="foreground"] {
  top: 50%;
}
```

Do not change the shared desktop or phone rules.

- [ ] **Step 4: Run focused verification**

Run:

```powershell
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-responsive-hero.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: all commands exit `0`; visual conformance reports 25 route/viewports passing.

- [ ] **Step 5: Inspect both Ashes of Peace compositions**

Open and inspect:

```text
artifacts/expanded-interface-conformance/campaign-browser-ashes-centered-1440x900.png
artifacts/expanded-interface-conformance/campaign-browser-ashes-centered-390x844.png
```

Confirm that the bow, stern, and nacelles have balanced vertical breathing room, the full ship remains recognizable, no copy or art is clipped horizontally, and no expansion glyph has returned.

- [ ] **Step 6: Run the full gate and commit**

```powershell
npm.cmd test
git diff --check -- styles/directive.css tools/scripts/test-expanded-interface-visual-conformance.mjs
git add -- styles/directive.css tools/scripts/test-expanded-interface-visual-conformance.mjs
git diff --cached --check
git commit -m "style(ui): center campaign browser ships"
```

Expected: all 124 focused checks pass before the commit is created.

---

### Task 2: Verify and publish main

**Files:**
- Verify only: committed repository state

**Interfaces:**
- Consumes: the committed Campaigns-browser centerline and visual regression evidence.
- Produces: an exact verified `origin/main` publication.

- [ ] **Step 1: Re-run the committed completion gate**

```powershell
npm.cmd test
git status -sb
```

Expected: all 124 focused checks pass and only the pre-existing unrelated workspace items remain dirty.

- [ ] **Step 2: Confirm authenticated remote alignment**

```powershell
gh auth status
gh api repos/MentallyQuill/Directive/commits/main --jq '.sha'
git rev-parse HEAD~2
```

Expected: GitHub authentication succeeds and the remote SHA equals the parent of the two new commits.

- [ ] **Step 3: Push and verify main**

```powershell
git push origin main
gh api repos/MentallyQuill/Directive/commits/main --jq '.sha'
git rev-parse HEAD
```

Expected: the published and local SHAs match exactly.
