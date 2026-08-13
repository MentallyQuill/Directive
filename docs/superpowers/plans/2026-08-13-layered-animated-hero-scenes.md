# Layered Animated Campaign and Ship Hero Scenes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Breckenridge's static Campaign and Ship banners with aligned, subtly animated Background/Stars/Ship layers and make expansion click-only on every device.

**Architecture:** Package image records may declare an exact `layers` scene alongside their static variants. A focused resolver validates all three paths, and a focused UI renderer builds either the layered scene or the existing single-image fallback; CSS owns composition, blending, and animation while the existing responsive-hero helper owns only local click state.

**Tech Stack:** ES modules, browser DOM APIs, CSS transforms/blending/keyframes, package JSON assets, Pillow WebP conversion, Node.js assertion tests, Playwright Chromium visual/interaction tests.

## Global Constraints

- Layer order is Background, Stars, Ship, readability gradient, identity copy, toggle control.
- Motion runs continuously in both compact and expanded states and does not restart when height changes.
- Background stays static; Ship drift is approximately 40 seconds and visually sub-pixel/sub-degree; Stars shimmer slowly without rapid flashing.
- Mobile/coarse-pointer motion amplitude is approximately half the desktop amplitude.
- `prefers-reduced-motion: reduce` freezes all scene animations at a neutral frame.
- Expansion is click-only on desktop and mobile; hover never changes geometry and clicking outside does nothing.
- Every route entry starts compact; no preference is persisted and no `Escape` handler is registered.
- Shared heights remain desktop `140px/280px` and mobile `112px/220px`.
- Campaign list thumbnails stay static; packages without all three exact layers use their existing static hero.
- Preserve Campaign Library facts below the hero and Ship's existing internal scroll ownership.
- Preserve unrelated dirty work in `debug.log`, `.codex-remote-attachments/`, and `docs/technical/STORY_DIRECTOR_TURN_FLOW.md`.

---

### Task 1: Exact package hero scene contract and assets

**Files:**
- Create: `src/packages/package-hero-scene-resolver.mjs`
- Create: `tools/scripts/test-package-hero-scene-resolver.mjs`
- Create: `assets/packages/breckenridge/images/ship/uss-breckenridge.hero-background.webp`
- Create: `assets/packages/breckenridge/images/ship/uss-breckenridge.hero-stars.webp`
- Create: `assets/packages/breckenridge/images/ship/uss-breckenridge.hero-ship.webp`
- Modify: `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json`
- Modify: `src/packages/bundled-package-registry.mjs`
- Modify: `tools/scripts/test-bundled-package-registry.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `packageData.assets.images[]` records with exact `kind` and `subjectId`.
- Produces: `resolvePackageHeroScene(packageData, { kind, subjectId }) -> null | { type: 'scene', id, kind, subjectId, alt, layers: { background, stars, foreground } }`.

- [ ] **Step 1: Write the failing resolver and package tests**

Create `test-package-hero-scene-resolver.mjs` with complete, incomplete, and wrong-subject records:

```js
const complete = resolvePackageHeroScene({ assets: { images: [{
  id: 'breckenridge.ship.primary', kind: 'ship.hero', subjectId: 'uss-breckenridge',
  alt: 'U.S.S. Breckenridge in flight above a nebula',
  layers: { background: 'bg.webp', stars: 'stars.webp', foreground: 'ship.webp' }
}] } }, { kind: 'ship.hero', subjectId: 'uss-breckenridge' });

assert.deepEqual(complete.layers, {
  background: 'bg.webp', stars: 'stars.webp', foreground: 'ship.webp'
});
assert.equal(resolvePackageHeroScene({ assets: { images: [{
  kind: 'ship.hero', subjectId: 'uss-breckenridge', layers: { background: 'bg.webp' }
}] } }, { kind: 'ship.hero', subjectId: 'uss-breckenridge' }), null);
assert.equal(resolvePackageHeroScene({ assets: { images: [{
  kind: 'ship.hero', subjectId: 'another-ship',
  layers: { background: 'bg.webp', stars: 'stars.webp', foreground: 'ship.webp' }
}] } }, { kind: 'ship.hero', subjectId: 'uss-breckenridge' }), null);
```

Extend `test-bundled-package-registry.mjs` to assert the full package and Ashes teaser expose the three exact repository paths and that `fs.existsSync` is true for each path.

- [ ] **Step 2: Run resolver/package tests and verify RED**

Run: `node tools/scripts/test-package-hero-scene-resolver.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `package-hero-scene-resolver.mjs`.

Run: `node tools/scripts/test-bundled-package-registry.mjs`

Expected: FAIL because the Breckenridge image record has no `layers` declaration.

- [ ] **Step 3: Implement the exact resolver**

Implement exact record matching with no kind, subject, or variant fallback:

```js
const text = (value) => String(value || '').trim();

export function resolvePackageHeroScene(packageData, { kind = '', subjectId = '' } = {}) {
  const image = (Array.isArray(packageData?.assets?.images) ? packageData.assets.images : [])
    .find((candidate) => text(candidate?.kind) === text(kind)
      && text(candidate?.subjectId) === text(subjectId));
  const background = text(image?.layers?.background);
  const stars = text(image?.layers?.stars);
  const foreground = text(image?.layers?.foreground);
  if (!image || !background || !stars || !foreground) return null;
  return Object.freeze({
    type: 'scene', id: text(image.id), kind: text(image.kind), subjectId: text(image.subjectId),
    alt: text(image.alt),
    layers: Object.freeze({ background, stars, foreground })
  });
}
```

- [ ] **Step 4: Generate optimized WebP derivatives from the supplied sources**

Use the bundled Pillow runtime with explicit paths. Save Background at quality 90 and preserve exact RGBA content for Stars and Ship with lossless WebP:

```powershell
& 'C:\Users\Keptin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -c "from PIL import Image; src=r'C:\Users\Keptin\Downloads'; dst=r'F:\git\Directive\assets\packages\breckenridge\images\ship'; Image.open(src+r'\Breckenridge_bg.png').convert('RGB').save(dst+r'\uss-breckenridge.hero-background.webp','WEBP',quality=90,method=6); Image.open(src+r'\Breckenridge_stars.png').convert('RGBA').save(dst+r'\uss-breckenridge.hero-stars.webp','WEBP',lossless=True,method=6,exact=True); Image.open(src+r'\Breckenridge_ship.png').convert('RGBA').save(dst+r'\uss-breckenridge.hero-ship.webp','WEBP',lossless=True,method=6,exact=True)"
```

Use Pillow to reopen all three outputs and assert each is `1672x941`; assert Stars and Ship are `RGBA` and Background is `RGB`.

- [ ] **Step 5: Declare the package and teaser layers**

Add to the existing Breckenridge `ship.hero` record in the package JSON:

```json
"layers": {
  "background": "assets/packages/breckenridge/images/ship/uss-breckenridge.hero-background.webp",
  "stars": "assets/packages/breckenridge/images/ship/uss-breckenridge.hero-stars.webp",
  "foreground": "assets/packages/breckenridge/images/ship/uss-breckenridge.hero-ship.webp"
}
```

Extend `teaser()` with an optional `layers` argument and pass the same object only for the Ashes/Breckenridge teaser. Other campaign teasers omit `layers` and retain static heroes.

- [ ] **Step 6: Register and run the resolver/package tests**

Add `"test-package-hero-scene-resolver.mjs"` immediately after `"test-bundled-package-registry.mjs"` in `run-alpha-gate.mjs`.

Run: `node tools/scripts/test-package-hero-scene-resolver.mjs`

Run: `node tools/scripts/test-bundled-package-registry.mjs`

Expected: both print `PASS`.

- [ ] **Step 7: Commit the package scene contract**

```bash
git add src/packages/package-hero-scene-resolver.mjs tools/scripts/test-package-hero-scene-resolver.mjs assets/packages/breckenridge/images/ship/uss-breckenridge.hero-background.webp assets/packages/breckenridge/images/ship/uss-breckenridge.hero-stars.webp assets/packages/breckenridge/images/ship/uss-breckenridge.hero-ship.webp packages/bundled/breckenridge/ashes-of-peace.campaign-package.json src/packages/bundled-package-registry.mjs tools/scripts/test-bundled-package-registry.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(assets): add Breckenridge hero layers"
```

---

### Task 2: Layered hero renderer and static fallback

**Files:**
- Create: `src/ui/package-hero-scene.js`
- Create: `tools/scripts/test-package-hero-scene.mjs`
- Modify: `src/ui/campaign-panel.js`
- Modify: `src/ui/ship-journal.js`
- Modify: `tools/scripts/test-certified-campaign-panel.mjs`
- Modify: `tools/scripts/test-certified-ship-panel.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `resolvePackageHeroScene()` from Task 1, `resolveDirectiveAssetUrl()`, and existing `createPackageImage()` fallback behavior.
- Produces: `createPackageHeroVisual(packageData, query, options) -> HTMLElement`, returning a `directive-hero-scene` figure for complete layers or the existing static figure otherwise.

- [ ] **Step 1: Write the failing renderer test**

Create a fake DOM test that asserts exact layer order and fallback:

```js
const scene = createPackageHeroVisual(completePackage, {
  kind: 'ship.hero', subjectId: 'uss-breckenridge', variant: 'hero'
}, { wrapperClass: 'ship-hero', label: 'U.S.S. Breckenridge' });

assert.equal(scene.classList.contains('directive-hero-scene'), true);
assert.deepEqual(scene.children.map((node) => node.dataset.heroSceneLayer), [
  'background', 'stars', 'stars-glow', 'foreground'
]);
assert.equal(scene.getAttribute('role'), 'img');
assert.equal(scene.getAttribute('aria-label'), 'U.S.S. Breckenridge in flight above a nebula');
assert.equal(scene.children.every((node) => node.alt === ''), true);

const fallback = createPackageHeroVisual(incompletePackage, query, options);
assert.equal(fallback.classList.contains('directive-hero-scene'), false);
assert.equal(fallback.querySelectorAll('.directive-media-image').length, 1);
```

- [ ] **Step 2: Run the renderer test and verify RED**

Run: `node tools/scripts/test-package-hero-scene.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `package-hero-scene.js`.

- [ ] **Step 3: Implement the layered renderer**

Create one figure and four decorative image nodes when the resolver succeeds:

```js
export function createPackageHeroVisual(packageData, query = {}, options = {}) {
  const scene = resolvePackageHeroScene(packageData, query);
  if (!scene) return createPackageImage(packageData, query, options);
  const frame = createElement('figure', `directive-media-frame directive-hero-scene${options.wrapperClass ? ` ${options.wrapperClass}` : ''}`);
  frame.setAttribute('role', 'img');
  frame.setAttribute('aria-label', scene.alt || options.label || query.subjectId || '');
  for (const [layer, path] of [
    ['background', scene.layers.background],
    ['stars', scene.layers.stars],
    ['stars-glow', scene.layers.stars],
    ['foreground', scene.layers.foreground]
  ]) {
    const image = createElement('img', `directive-hero-scene-layer directive-hero-scene-${layer}`);
    image.dataset.heroSceneLayer = layer;
    image.src = resolveDirectiveAssetUrl(path);
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.loading = options.loading || 'lazy';
    image.decoding = 'async';
    image.draggable = false;
    frame.appendChild(image);
  }
  return frame;
}
```

- [ ] **Step 4: Integrate Campaign and Ship**

In Campaign, call `createPackageHeroVisual()` only for `variant === 'hero'`; card/thumb calls continue using `createPackageImage()`. In Ship, replace the current `createPackageImage()` call with `createPackageHeroVisual()` using the existing `ship.hero` query and eager loading.

Extend the Campaign and Ship DOM tests to assert a Breckenridge scene has four layer nodes in exact order and that a package without `layers` still has one static `.directive-media-image`.

- [ ] **Step 5: Register and run renderer/route tests**

Add `"test-package-hero-scene.mjs"` before `"test-certified-campaign-panel.mjs"` in `run-alpha-gate.mjs`.

Run: `node tools/scripts/test-package-hero-scene.mjs`

Run: `node tools/scripts/test-certified-campaign-panel.mjs`

Run: `node tools/scripts/test-certified-ship-panel.mjs`

Expected: all print `PASS`.

- [ ] **Step 6: Commit the layered renderer**

```bash
git add src/ui/package-hero-scene.js tools/scripts/test-package-hero-scene.mjs src/ui/campaign-panel.js src/ui/ship-journal.js tools/scripts/test-certified-campaign-panel.mjs tools/scripts/test-certified-ship-panel.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(ui): render layered hero scenes"
```

---

### Task 3: Click-only expansion without outside collapse

**Files:**
- Modify: `src/ui/responsive-hero.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-responsive-hero.mjs`

**Interfaces:**
- Consumes: existing `bindResponsiveHero(hero, { label, secondary })` callers.
- Produces: the same public function with route-local click toggling only and no document-level listeners.

- [ ] **Step 1: Rewrite the interaction test before production changes**

Replace outside-collapse assertions with outside-no-op and no delegated listener:

```js
ship.control.click();
assert.equal(ship.hero.classList.contains('is-expanded'), true);
testDocument.dispatch('pointerdown', { target: testDocument.body });
assert.equal(ship.hero.classList.contains('is-expanded'), true);
assert.equal(testDocument.listenerCount('pointerdown'), 0);
ship.control.click();
assert.equal(ship.hero.classList.contains('is-expanded'), false);
assert.equal(documentListeners.has('keydown'), false);
```

- [ ] **Step 2: Run the interaction test and verify RED**

Run: `node tools/scripts/test-responsive-hero.mjs`

Expected: FAIL because the current delegated `pointerdown` listener collapses the hero and listener count is one.

- [ ] **Step 3: Remove document delegation and desktop hover expansion**

Delete `boundDocuments`, `installOutsideTap()`, and its call. Retain only local click state. In CSS:

- display `.directive-responsive-hero-toggle` on all input types;
- remove the `(hover: hover) and (pointer: fine)` height and secondary-copy rules;
- remove the touch-only display rule;
- retain `.is-expanded` height/copy rules and focus styling;
- add a non-geometric hover/focus affordance to the corner glyph only.

- [ ] **Step 4: Run the interaction test and verify GREEN**

Run: `node tools/scripts/test-responsive-hero.mjs`

Expected: `PASS responsive hero interaction`.

- [ ] **Step 5: Commit click-only interaction**

```bash
git add src/ui/responsive-hero.js styles/directive.css tools/scripts/test-responsive-hero.mjs
git commit -m "fix(ui): make hero expansion click-only"
```

---

### Task 4: CSS scene composition and subtle motion

**Files:**
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-campaign-library-presentation.mjs`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`

**Interfaces:**
- Consumes: `.directive-hero-scene-*` layer classes from Task 2 and `.is-expanded` from Task 3.
- Produces: GPU-composited layer alignment, additive Stars, subtle Ship drift, reduced mobile amplitudes, and reduced-motion freeze.

- [ ] **Step 1: Add failing browser expectations for composition and motion**

In visual conformance, inspect both production routes and assert:

```js
assert.deepEqual(layerOrder, ['background', 'stars', 'stars-glow', 'foreground']);
assert.match(starsBlendMode, /plus-lighter|screen/);
assert.notEqual(shipAnimationName, 'none');
assert.notEqual(starsAnimationName, 'none');
assert.equal(compactAnimationName, expandedAnimationName);
assert.equal(reducedShipAnimationName, 'none');
assert.equal(reducedStarsAnimationName, 'none');
```

Measure the Campaign hero and Continue button before/after `hover()` and assert both top positions and hero height remain unchanged. Click the banner to expand, click the heading outside it, and assert it remains expanded; click the banner again to collapse. Repeat click behavior at `390x844`.

- [ ] **Step 2: Run browser checks and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because scene layer styles/keyframes and new click-only geometry expectations are absent.

- [ ] **Step 3: Implement shared layer composition**

Add bounded absolute layer styling:

```css
.directive-expanded-shell .directive-hero-scene { isolation: isolate; }
.directive-expanded-shell .directive-hero-scene-layer {
  position: absolute; inset: -1%; display: block; width: 102%; height: 102%;
  object-fit: cover; object-position: center 50%; pointer-events: none;
}
.directive-expanded-shell .directive-hero-scene-background { z-index: 0; }
.directive-expanded-shell .directive-hero-scene-stars { z-index: 1; mix-blend-mode: screen; opacity: .58; }
@supports (mix-blend-mode: plus-lighter) {
  .directive-expanded-shell .directive-hero-scene-stars,
  .directive-expanded-shell .directive-hero-scene-stars-glow { mix-blend-mode: plus-lighter; }
}
.directive-expanded-shell .directive-hero-scene-stars-glow { z-index: 2; opacity: .12; }
.directive-expanded-shell .directive-hero-scene-foreground { z-index: 3; }
```

Set Campaign/Ship gradients to z-index 4, identity copy to 5, and toggle control to 6.

- [ ] **Step 4: Implement subtle keyframes and responsive amplitudes**

Define CSS variables for drift amplitudes, use approximately 42-second alternating Ship motion, and use two irregular Stars opacity/brightness cycles longer than 10 seconds. Keep transform values within the design limits. At `max-width: 640px` or `(pointer: coarse)`, halve the variables. Under reduced motion, set `animation: none !important` and neutral transforms/filters.

- [ ] **Step 5: Update Campaign presentation fixtures**

Keep coming-later grayscale applied to the whole `.campaign-hero-media`, ensure the below-hero description/facts checks remain unchanged, and update the fixture only where new scene classes are required. Static coming-later packages must still pass through the one-image fallback.

- [ ] **Step 6: Run browser checks and inspect screenshots**

Run: `node tools/scripts/test-campaign-library-presentation.mjs`

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: both print `PASS` with exact shared heights, stable hover geometry, click-only toggling, additive Stars, active motion, reduced-motion freeze, no horizontal overflow, and no page errors.

Inspect generated desktop/mobile Campaign and Ship screenshots and an expanded screenshot for layer alignment, title readability, restrained motion framing, and absence of dark side bars.

- [ ] **Step 7: Commit motion and browser proof**

```bash
git add styles/directive.css tools/scripts/test-campaign-library-presentation.mjs tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "feat(ui): animate layered hero scenes"
```

---

### Task 5: Full verification and main push

**Files:**
- Verify all files committed by Tasks 1-4.

**Interfaces:**
- Consumes: complete layered scene implementation.
- Produces: verified local and remote `main` at the same final commit.

- [ ] **Step 1: Run the full alpha gate**

Run: `npm.cmd test`

Expected: exit code `0`, including the new resolver, renderer, interaction, and browser checks.

- [ ] **Step 2: Check whitespace and scope**

Run: `git diff --check`

Run: `git status --short`

Expected: no uncommitted feature files; only the user's pre-existing unrelated dirty files remain.

- [ ] **Step 3: Verify remote main before pushing**

Run with network permission: `gh auth status`

Run with network permission: `gh api 'repos/MentallyQuill/Directive/commits/main' --jq '{sha:.sha,message:.commit.message,date:.commit.author.date}'`

Compare remote `main` to the local merge base. If remote advanced, use a normal `git pull`/merge, preserve all concurrent work, and rerun `npm.cmd test`; never force-push.

- [ ] **Step 4: Push and verify exact SHA**

Run with network permission: `git push origin main`

Run with network permission: `gh api 'repos/MentallyQuill/Directive/commits/main' --jq '.sha'`

Run: `git rev-parse HEAD`

Expected: the remote and local SHAs are identical.
