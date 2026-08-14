# Ship Cohesion Backlight Perceptibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Ship cohesion animations plainly visible through high-contrast segment-face illumination without changing their approved timing, wave width, scale, or debt behavior.

**Architecture:** Keep the existing SVG groups, logical animation delays, and CSS keyframes. Extend the real Chromium visual contract to measure keyframe face colors and shadow blur, then revise only the blue-wave and amber-preview color/filter values so their crests read as contained backlights rather than exterior lamps.

**Tech Stack:** CSS SVG presentation, Web Animations API, Playwright, Node.js strict assertions, repository `npm.cmd test` gate.

## Global Constraints

- Keep the blue timeline at 10 seconds, stagger at 0.5 seconds, and visible crest at two neighboring segments.
- Keep the amber preview at 0.5 Hz with every preview segment in phase.
- Keep both animation scale ceilings at `1.02`.
- Keep debt and queued-debt segments static.
- Blue crest RGB channels must each be at least 238; the trough must preserve the original `#8bb5f4` channel floors and remain no more than 55% of crest luminance.
- Amber trough must preserve the original `#ffa24f` channel floors.
- Animated blue and amber drop-shadow blur radii must never exceed 2 CSS pixels.
- Keep reduced-motion behavior static and distinguishable.
- Do not alter Ship geometry, task data, selection behavior, leader lines, or gameplay state.

---

### Task 1: Rendered Backlight Contract

**Files:**
- Modify: `tools/scripts/test-cohesion-ship-visual.mjs`

**Interfaces:**
- Consumes: `Animation.effect.getKeyframes()` values emitted by `ship-cohesion-blue-wave` and `ship-cohesion-preview-pulse`.
- Produces: rendered assertions for face luminance, crest channel floors, and maximum drop-shadow blur.

- [ ] **Step 1: Add independent CSS-value measurement helpers**

Inside the browser evaluation, parse keyframe `color` through a temporary element and calculate WCAG linear relative luminance. Extract the final pixel value from each `drop-shadow(...)` as its blur radius. Return literal numeric measurements rather than source text.

- [ ] **Step 2: Add the failing blue and amber behavior assertions**

Assert that the blue trough-to-crest luminance ratio is at most `0.55`, every crest channel is at least `238`, and every animated shadow blur is at most `2`. Assert that the amber crest is warm near-white with red at least `248`, green at least `225`, blue at least `200`, and shadow blur at most `2`.

- [ ] **Step 3: Run the focused visual gate and verify RED**

Run: `node tools/scripts/test-cohesion-ship-visual.mjs`

Expected: FAIL because the current blue crest does not reach near-white and current 4–9px drop shadows exceed the 2px backlight boundary.

### Task 2: Contained Segment-Face Illumination

**Files:**
- Modify: `styles/directive.css`
- Test: `tools/scripts/test-cohesion-ship-visual.mjs`

**Interfaces:**
- Consumes: existing `.ship-cohesion-segment` state classes and animation names.
- Produces: interpolated blue and amber face colors with compact edge shadows under the rendered contract.

- [ ] **Step 1: Implement the minimal blue treatment**

Preserve the original `#8bb5f4` filled resting face. In `ship-cohesion-blue-wave`, use that same full-color trough at offsets 0%, 10%, and 100%, an icy near-white at 5%, a 1px trough shadow, and a 2px crest shadow. Preserve every keyframe offset, delay, duration, easing, and transform.

- [ ] **Step 2: Implement the matching amber treatment**

Preserve the original `#ffa24f` amber trough and use a warm near-white 50% crest in `ship-cohesion-preview-pulse`, with 1px and 2px shadows respectively. Preserve its two-second duration, shared zero delay, easing, and transform.

- [ ] **Step 3: Run the focused visual gate and verify GREEN**

Run: `node tools/scripts/test-cohesion-ship-visual.mjs`

Expected: PASS at 1440x900, 1024x768, 390x844, and 360x500 with all motion, geometry, interaction, contrast, and blur assertions satisfied.

- [ ] **Step 4: Inspect controlled-animation screenshots**

Inspect the fresh files under `artifacts/cohesion-ship-visual/`. Confirm the blue crest reads on the segment face at desktop and phone sizes, the trough remains readable, and neither blue nor amber creates a broad outer halo.

- [ ] **Step 5: Commit the focused implementation**

```powershell
git add -- styles/directive.css tools/scripts/test-cohesion-ship-visual.mjs
git commit -m "fix(ship): sharpen cohesion backlight"
```

### Task 3: Repository Verification and Integration

**Files:**
- Verify only unless an in-scope regression is exposed.

**Interfaces:**
- Consumes: the committed backlight contract and stylesheet change.
- Produces: complete local and GitHub `main` verification.

- [ ] **Step 1: Run focused adjacent gates**

Run:

```powershell
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-cohesion-ship-interaction.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: all Ship interaction and expanded-interface viewport checks pass without changed geometry or selection behavior.

- [ ] **Step 2: Run the full repository gate**

Run: `npm.cmd test`

Expected: every focused Node and Playwright check passes.

- [ ] **Step 3: Review scope and whitespace**

Run:

```powershell
git diff --check
git status --short
git log -4 --oneline
```

Expected: implementation is committed; only pre-existing test output and remote attachment files remain outside commits.

- [ ] **Step 4: Rebase and rerun the full gate if remote main advanced**

Use GitHub CLI to compare local and remote `main`. If different, run `git pull --rebase --autostash origin main`, then rerun `npm.cmd test` before pushing.

- [ ] **Step 5: Push and verify the exact remote SHA**

Run `git push origin main`, then compare `git rev-parse HEAD` with `gh api repos/MentallyQuill/Directive/commits/main --jq .sha`. The values must match.
