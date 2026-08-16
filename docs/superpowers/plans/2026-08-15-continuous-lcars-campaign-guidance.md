# Continuous LCARS Campaign Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the disconnected campaign-required frame with one continuous hollow LCARS elbow around open black content.

**Architecture:** Keep the renderer's public state and copy interface unchanged. Replace only its decorative DOM with a frame layer and content layer, then use scoped CSS geometry to form the hollow elbow and connected rails. Extend the existing fake-DOM and Playwright suites so structural authenticity and responsive geometry are executable contracts.

**Tech Stack:** Browser DOM APIs, CSS Grid and pseudo-elements, Node.js assertions, Playwright.

## Global Constraints

- Keep Campaign as the only action; add no connector, duplicate button, or save-loading pathway.
- Preserve the exact player-facing copy and existing state/accessibility synchronization.
- Use one hollow amber left elbow connected to upper and lower segmented rails.
- Render copy directly on the shell's black field with no card background, gradient, border, radius, or shadow.
- Keep the approved `2.4s linear` Campaign backlight and reduced-motion behavior unchanged.
- Preserve unrelated `debug.log` and `.codex-remote-attachments/` changes.

---

### Task 1: Lock the continuous-frame contract

**Files:**
- Modify: `tools/scripts/test-campaign-required-empty-state.mjs`
- Modify: `tools/scripts/test-campaign-required-empty-state-visual.mjs`

**Interfaces:**
- Consumes: `appendCurrentChatEmptyState(container, view)` and existing campaign-required selectors.
- Produces: regression coverage for `.directive-campaign-required-frame`, `.directive-campaign-required-elbow`, `.directive-campaign-required-content`, `.directive-campaign-required-icon-field`, and the absence of `.directive-campaign-required-icon-pod`.

- [ ] **Step 1: Replace the old structural assertions**

Require one decorative frame and elbow, two decorative rails, six ordered tone segments, icon-field-before-copy content ordering, and zero icon pods:

```js
const frame = body.querySelector('.directive-campaign-required-frame');
assert.equal(frame.getAttribute('aria-hidden'), 'true');
assert.equal(body.querySelectorAll('.directive-campaign-required-elbow').length, 1);
assert.equal(body.querySelectorAll('.directive-campaign-required-rail').length, 2);
assert.equal(body.querySelectorAll('.directive-campaign-required-icon-pod').length, 0);
const content = body.querySelector('.directive-campaign-required-content');
assert.equal(content.children[0].classList.contains('directive-campaign-required-icon-field'), true);
assert.equal(content.children[1].classList.contains('directive-campaign-required-copy'), true);
```

- [ ] **Step 2: Add CSS source-contract assertions**

Extract the campaign-required CSS region and require a transparent three-sided elbow plus transparent, shadowless copy treatment:

```js
assert.match(css, /\.directive-campaign-required-elbow[\s\S]*?border:\s*14px\s+solid/);
assert.match(css, /\.directive-campaign-required-elbow[\s\S]*?border-right:\s*0/);
assert.doesNotMatch(css, /\.directive-campaign-required-elbow::after/);
assert.doesNotMatch(css, /border-radius:\s*62px\s+0\s+0\s+62px/);
assert.match(css, /\.directive-campaign-required-copy[\s\S]*?background:\s*transparent/);
assert.match(css, /\.directive-campaign-required-copy[\s\S]*?box-shadow:\s*none/);
```

- [ ] **Step 3: Replace icon-pod browser geometry with elbow continuity checks**

At each route and viewport, measure the elbow, both rails, icon, and copy. Require the elbow's right edge to touch both rails within 1 px, the icon to remain horizontally inside the elbow, the copy to begin at or right of the elbow edge, and the computed copy style to be transparent, shadowless, and square-cornered.

- [ ] **Step 4: Run both focused tests and verify RED**

Run:

```powershell
node tools/scripts/test-campaign-required-empty-state.mjs
node tools/scripts/test-campaign-required-empty-state-visual.mjs
```

Expected: both fail because the renderer still emits an icon pod and the CSS still paints a rounded copy card.

### Task 2: Build the connected elbow and open information field

**Files:**
- Modify: `src/ui/current-chat-empty-state.js`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: the existing bundled `route.ship` glyph, stable copy constants, current-chat supporting copy, and six segment tones.
- Produces: one decorative frame containing an elbow and rails plus one content layer containing the icon field and copy.

- [ ] **Step 1: Replace the renderer's decorative structure**

Create the frame before readable content:

```js
const frame = createElement('div', 'directive-campaign-required-frame');
frame.setAttribute('aria-hidden', 'true');
const elbow = createElement('span', 'directive-campaign-required-elbow');
const topRail = createLcarsRail('top', ['amber', 'lilac', 'blue']);
const bottomRail = createLcarsRail('bottom', ['violet', 'salmon', 'amber']);
frame.append(elbow, topRail, bottomRail);

const content = createElement('div', 'directive-campaign-required-content');
const iconField = createElement('div', 'directive-campaign-required-icon-field');
iconField.setAttribute('aria-hidden', 'true');
iconField.appendChild(icon);
content.append(iconField, copy);
surface.append(frame, content);
```

- [ ] **Step 2: Implement the continuous frame CSS**

Make the surface a positioned grid. Place the frame absolutely with an elbow column and two rail rows. Build the amber elbow from 14 px top, left, and bottom borders with no right border, a transparent background, and a large left radius. Give the first top amber segment no left gap so it touches the elbow; retain 4 px separators between secondary segments.

- [ ] **Step 3: Remove card and pod styling**

Delete `.directive-campaign-required-core` and `.directive-campaign-required-icon-pod`. Style the content as a two-column overlay, keep the glyph in the elbow's black interior, and set the copy to `background: transparent`, `box-shadow: none`, and `border-radius: 0`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run both focused scripts. Expected: structure, geometry, existing pulse, route activation, and reduced-motion assertions pass at all three viewports and all three affected routes.

### Task 3: Rendered review, regression, and publication

**Files:**
- Modify only if rendered evidence identifies a scoped defect: `styles/directive.css`, `tools/scripts/test-campaign-required-empty-state-visual.mjs`

**Interfaces:**
- Consumes: the completed continuous-frame implementation.
- Produces: desktop/mobile visual evidence, a clean full gate, and exact remote-main publication.

- [ ] **Step 1: Run expanded-interface regressions**

```powershell
node tools/scripts/test-expanded-interface-shell.mjs
node tools/scripts/test-expanded-interface-focus.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

- [ ] **Step 2: Inspect real rendered screenshots**

Render Mission at `390 x 844` and `1280 x 800`. Confirm the elbow is hollow and connected, the black field is open, the text is not boxed, and the ship is integrated into the elbow's negative space.

- [ ] **Step 3: Run the complete verification gate**

```powershell
npm.cmd test
git diff --check
git status --short
```

- [ ] **Step 4: Review, commit, and publish**

Stage only the two documents, renderer, stylesheet, and two focused tests. Commit with `fix(ui): use continuous LCARS guidance frame`. Fetch and integrate concurrent `main` changes without force, rerun affected and full verification after integration, push `main`, and verify GitHub remote SHA equals local HEAD.
