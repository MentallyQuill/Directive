# Campaign Ship Emissive Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add synchronized package-authored window and nacelle illumination to the Breckenridge Campaign hero.

**Architecture:** Extend the optional layered-scene contract with one all-or-nothing `emissive` record. Render the base ship, one window overlay, and one nacelle overlay inside a shared transformed foreground group; animate only compositing properties inside that group.

**Tech Stack:** Vanilla JavaScript modules, CSS animations and masking, deterministic WebP assets, Node assertion scripts, Playwright.

## Global Constraints

- Preserve the approved ship position, scale, composition, 30-second drift, and hover yaw/pitch limits.
- Use one Screen-blended copy of each supplied overlay.
- Use deterministic authored noise; no runtime randomness, particles, canvas, video, or WebGL.
- Stop emissive motion under `prefers-reduced-motion: reduce`.
- Preserve unrelated worktree changes.

---

### Task 1: Optional emissive package contract

**Files:**
- Modify: `src/packages/package-hero-scene-resolver.mjs`
- Modify: `src/packages/bundled-package-registry.mjs`
- Test: `tools/scripts/test-package-hero-scene-resolver.mjs`

**Interfaces:**
- Consumes: `image.layers.emissive.{windows,nacelles,windowNoise}`
- Produces: `scene.emissive` only when all three normalized paths are present

- [x] Add one failing resolver assertion for the complete emissive record.
- [x] Run `node tools/scripts/test-package-hero-scene-resolver.mjs` and confirm the missing `emissive` failure.
- [x] Normalize and freeze the complete record; omit partial records.
- [x] Add the Breckenridge asset paths to the bundled registry.
- [x] Rerun the focused resolver test.

### Task 2: Shared ship-card renderer

**Files:**
- Modify: `src/ui/package-hero-scene.js`
- Test: `tools/scripts/test-package-hero-scene.mjs`

**Interfaces:**
- Consumes: `scene.layers.foreground` and optional `scene.emissive`
- Produces: one logical `foreground` scene layer containing `base`, `windows`, and `nacelles` ship-card images

- [x] Add one failing renderer assertion for the grouped foreground children and noise URL custom property.
- [x] Run the renderer test and confirm it fails on the current foreground image.
- [x] Add the minimal ship-card group and preserve the logical foreground layer identity.
- [x] Rerun the focused renderer test.

### Task 3: Authored assets and compositing motion

**Files:**
- Create: `assets/packages/breckenridge/images/ship/uss-breckenridge.hero-nacelles.png`
- Create: `assets/packages/breckenridge/images/ship/uss-breckenridge.hero-windows.png`
- Create: `assets/packages/breckenridge/images/ship/uss-breckenridge.hero-window-noise.webp`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`

**Interfaces:**
- Consumes: exact-canvas PNG overlays and a seamless alpha-noise texture
- Produces: Screen-blended `windows` and `nacelles` presentation synchronized to the foreground group

- [x] Add one failing Playwright/CSS contract for layer order, Screen blending, two-second nacelle pulse, 18-second window mask travel, and reduced-motion cancellation.
- [x] Run the visual conformance script and confirm the missing-layer failure.
- [x] Copy the approved PNGs and generate the deterministic seamless alpha-noise WebP.
- [x] Move the existing foreground geometry/animation rules to the ship-card container and add overlay compositing rules.
- [x] Rerun focused renderer, resolver, orbit, and visual conformance tests.

### Task 4: Browser polish and full verification

**Files:**
- Modify only files above if visual evidence exposes a defect.

**Interfaces:**
- Consumes: production Campaign fixture at desktop and mobile viewports
- Produces: evidence that registration and motion remain within approved geometry

- [x] Inspect desktop idle, pulse phases, window-mask phases, and pointer hover in Playwright.
- [x] Inspect 390 by 844 mobile geometry and reduced-motion state.
- [x] Run `npm.cmd test` and confirm all focused checks pass.
- [x] Run `git diff --check` and confirm only scoped files plus pre-existing unrelated changes remain.
