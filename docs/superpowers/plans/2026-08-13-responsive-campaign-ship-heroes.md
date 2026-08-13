# Responsive Campaign and Ship Heroes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Campaign and Ship identical compact-by-default heroes that expand on desktop hover and toggle on mobile tap, with outside taps restoring the compact state.

**Architecture:** A focused `responsive-hero.js` helper adds the mobile-only control and delegates outside-tap handling once per document. Shared CSS custom properties own both responsive heights and desktop hover, while Campaign and Ship only identify their primary and secondary overlay content.

**Tech Stack:** Browser DOM APIs, ES modules, CSS media queries/custom properties, Node.js assertion tests, Playwright Chromium geometry tests.

## Global Constraints

- Desktop collapsed height is exactly `140px`; desktop expanded height is exactly `280px`.
- Mobile collapsed height is exactly `112px`; mobile expanded height is exactly `220px`.
- Desktop expansion is hover-only on `(hover: hover) and (pointer: fine)`; clicks do not pin or toggle it.
- Mobile/coarse-pointer interaction is tap to expand, tap again to collapse, and tap outside to collapse.
- Every Campaign or Ship route render starts collapsed and stores no expansion preference.
- Do not register an `Escape` handler; Escape remains Directive's global close shortcut.
- Preserve Campaign descriptions/facts below the hero and Ship board scroll ownership.
- Preserve unrelated dirty work in `debug.log`, `.codex-remote-attachments/`, and `docs/technical/STORY_DIRECTOR_TURN_FLOW.md`.

---

### Task 1: Shared mobile hero interaction

**Files:**
- Create: `src/ui/responsive-hero.js`
- Create: `tools/scripts/test-responsive-hero.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `createElement(tagName, className)` from `src/ui/runtime-ui-kit.js`.
- Produces: `bindResponsiveHero(hero, { label, secondary = [] })`, returning the same hero element with class `directive-responsive-hero`, a mobile toggle, and any secondary nodes marked `directive-responsive-hero-secondary`.

- [ ] **Step 1: Write the failing interaction test**

Create a minimal fake document supporting `addEventListener`, `querySelectorAll`, `contains`, class mutation, attributes, and event dispatch. Exercise the wished-for API:

```js
const hero = new Element('section');
const secondary = new Element('p');
hero.appendChild(secondary);
document.body.appendChild(hero);

bindResponsiveHero(hero, { label: 'Ship', secondary: [secondary] });
const control = hero.children.find((node) => node.classList.contains('directive-responsive-hero-toggle'));

assert.equal(hero.classList.contains('directive-responsive-hero'), true);
assert.equal(hero.classList.contains('is-expanded'), false);
assert.equal(control.getAttribute('aria-expanded'), 'false');
assert.equal(secondary.classList.contains('directive-responsive-hero-secondary'), true);

control.click();
assert.equal(hero.classList.contains('is-expanded'), true);
assert.equal(control.getAttribute('aria-expanded'), 'true');
assert.equal(control.getAttribute('aria-label'), 'Collapse Ship image');

control.click();
assert.equal(hero.classList.contains('is-expanded'), false);

control.click();
document.dispatch('pointerdown', { target: document.body });
assert.equal(hero.classList.contains('is-expanded'), false);
assert.equal(document.listenerCount('pointerdown'), 1);
```

- [ ] **Step 2: Run the interaction test and verify RED**

Run: `node tools/scripts/test-responsive-hero.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/ui/responsive-hero.js`.

- [ ] **Step 3: Implement the minimal shared helper**

Use a `WeakSet` to install one delegated outside-pointer listener per document. The helper owns no route persistence and sets state only on the passed hero:

```js
import { createElement } from './runtime-ui-kit.js';

const boundDocuments = new WeakSet();

function setExpanded(hero, expanded) {
  hero.classList.toggle('is-expanded', expanded);
  const control = hero.querySelector('.directive-responsive-hero-toggle');
  control?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  control?.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${hero.dataset.responsiveHeroLabel} image`);
}

function installOutsideTap(documentRoot) {
  if (boundDocuments.has(documentRoot)) return;
  documentRoot.addEventListener('pointerdown', (event) => {
    for (const hero of documentRoot.querySelectorAll('.directive-responsive-hero.is-expanded')) {
      if (!hero.contains(event.target)) setExpanded(hero, false);
    }
  });
  boundDocuments.add(documentRoot);
}

export function bindResponsiveHero(hero, { label, secondary = [] }) {
  hero.classList.add('directive-responsive-hero');
  hero.dataset.responsiveHeroLabel = label;
  secondary.filter(Boolean).forEach((node) => node.classList.add('directive-responsive-hero-secondary'));
  const control = createElement('button', 'directive-responsive-hero-toggle');
  control.type = 'button';
  control.setAttribute('aria-expanded', 'false');
  control.setAttribute('aria-label', `Expand ${label} image`);
  control.addEventListener('click', () => setExpanded(hero, !hero.classList.contains('is-expanded')));
  hero.appendChild(control);
  installOutsideTap(hero.ownerDocument || document);
  return hero;
}
```

- [ ] **Step 4: Run the interaction test and verify GREEN**

Run: `node tools/scripts/test-responsive-hero.mjs`

Expected: `PASS responsive hero interaction`.

- [ ] **Step 5: Register the focused test in the alpha gate**

Add `"test-responsive-hero.mjs"` immediately before `"test-certified-ship-panel.mjs"` in `tools/scripts/run-alpha-gate.mjs`.

- [ ] **Step 6: Commit the interaction helper**

```bash
git add src/ui/responsive-hero.js tools/scripts/test-responsive-hero.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(ui): add responsive hero control"
```

---

### Task 2: Campaign and Ship adopt the shared hero contract

**Files:**
- Modify: `src/ui/campaign-panel.js`
- Modify: `src/ui/ship-journal.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-certified-campaign-panel.mjs`
- Modify: `tools/scripts/test-certified-ship-panel.mjs`

**Interfaces:**
- Consumes: `bindResponsiveHero(hero, { label, secondary })` from Task 1.
- Produces: Campaign and Ship heroes with identical `directive-responsive-hero` markup and CSS height behavior.

- [ ] **Step 1: Extend the Campaign and Ship DOM tests before production changes**

In both fake DOM implementations, add `classList.toggle`, `querySelector`, `contains`, `ownerDocument`, and document-level delegated-listener support needed by the shared helper. Assert the new contract:

```js
const campaignHero = byClass(body, 'campaign-hero')[0];
const campaignToggle = byClass(campaignHero, 'directive-responsive-hero-toggle')[0];
assert.equal(campaignHero.classList.contains('directive-responsive-hero'), true);
assert.equal(campaignHero.classList.contains('is-expanded'), false);
assert.equal(campaignToggle.getAttribute('aria-expanded'), 'false');

const shipHero = byClass(body, 'ship-hero')[0];
const shipToggle = byClass(shipHero, 'directive-responsive-hero-toggle')[0];
assert.equal(shipHero.classList.contains('directive-responsive-hero'), true);
assert.equal(shipHero.classList.contains('is-expanded'), false);
assert.equal(shipToggle.getAttribute('aria-expanded'), 'false');
assert.equal(nodes.filter((node) => node.dataset.directiveScrollOwner === 'true').length, 1);
```

- [ ] **Step 2: Run focused DOM tests and verify RED**

Run: `node tools/scripts/test-certified-campaign-panel.mjs`

Expected: FAIL because the Campaign hero lacks `directive-responsive-hero`.

Run: `node tools/scripts/test-certified-ship-panel.mjs`

Expected: FAIL because the Ship hero lacks `directive-responsive-hero`.

- [ ] **Step 3: Bind both Campaign hero construction paths**

Import `bindResponsiveHero` in `campaign-panel.js`. In both `appendCampaignDetail` and `appendPackageDetail`, collect the overlay paragraphs as secondary content and finish construction with:

```js
bindResponsiveHero(hero, {
  label: 'Campaign',
  secondary: [...copy.children].filter((node) => node.tagName === 'P')
});
```

For Campaign Library package heroes, the title/status remain visible and the below-hero description/facts remain untouched.

- [ ] **Step 4: Bind the Ship hero**

Import `bindResponsiveHero` in `ship-journal.js`, then mark only the ship summary as secondary:

```js
identity.append(kicker, title, summary);
hero.appendChild(identity);
return bindResponsiveHero(hero, { label: 'Ship', secondary: [summary] });
```

- [ ] **Step 5: Define the single shared CSS height contract**

Add the shared properties to `.directive-expanded-shell`, make Ship's first grid row `auto`, and apply the shared height to both heroes:

```css
.directive-expanded-shell {
  --directive-responsive-hero-collapsed-height: 140px;
  --directive-responsive-hero-expanded-height: 280px;
}

.directive-expanded-shell .directive-responsive-hero {
  height: var(--directive-responsive-hero-collapsed-height);
  transition: height 180ms ease;
}

.directive-expanded-shell .directive-expanded-ship {
  grid-template-rows: auto minmax(0, 1fr);
}

@media (hover: hover) and (pointer: fine) {
  .directive-expanded-shell .directive-responsive-hero:hover {
    height: var(--directive-responsive-hero-expanded-height);
  }
  .directive-expanded-shell .directive-responsive-hero-toggle { display: none; }
}

@media (hover: none), (pointer: coarse) {
  .directive-expanded-shell .directive-responsive-hero.is-expanded {
    height: var(--directive-responsive-hero-expanded-height);
  }
}

@media (max-width: 640px) {
  .directive-expanded-shell {
    --directive-responsive-hero-collapsed-height: 112px;
    --directive-responsive-hero-expanded-height: 220px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .directive-expanded-shell .directive-responsive-hero { transition: none; }
}
```

Style `.directive-responsive-hero-toggle` as an absolute transparent inset control with `z-index: 2`, a visible focus outline, and a small corner expansion affordance. Hide `.directive-responsive-hero-secondary` in the collapsed state and reveal it for desktop hover or `.is-expanded`.

- [ ] **Step 6: Run focused DOM tests and verify GREEN**

Run: `node tools/scripts/test-responsive-hero.mjs`

Run: `node tools/scripts/test-certified-campaign-panel.mjs`

Run: `node tools/scripts/test-certified-ship-panel.mjs`

Expected: all three print `PASS`.

- [ ] **Step 7: Commit route integration**

```bash
git add src/ui/campaign-panel.js src/ui/ship-journal.js styles/directive.css tools/scripts/test-certified-campaign-panel.mjs tools/scripts/test-certified-ship-panel.mjs
git commit -m "feat(ui): compact Campaign and Ship heroes"
```

---

### Task 3: Real browser geometry and interaction verification

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `tools/scripts/test-campaign-library-presentation.mjs`

**Interfaces:**
- Consumes: the `.directive-responsive-hero`, `.is-expanded`, and shared CSS property contract from Tasks 1-2.
- Produces: browser proof at desktop and mobile widths for exact geometry and actual pointer behavior.

- [ ] **Step 1: Change the existing Campaign geometry expectation before CSS implementation is accepted**

In `test-campaign-library-presentation.mjs`, replace the old `230/170` expectation with the compact contract and add an expanded-state measurement:

```js
assert.equal(metrics.heroHeight, viewport.width <= 640 ? 112 : 140, `${viewport.width}px collapsed Campaign hero height`);
assert.equal(metrics.expandedHeroHeight, viewport.width <= 640 ? 220 : 280, `${viewport.width}px expanded Campaign hero height`);
```

- [ ] **Step 2: Add production-route Playwright checks for both heroes**

At `1440x900`, navigate to Campaign and Ship separately, measure both at `140px`, hover each and measure `280px`, move the pointer outside and verify return to `140px`. Click each hero on desktop and verify it remains unpinned after pointer exit.

At `390x844`, tap each hero toggle and measure `220px`, tap again and measure `112px`, expand again, tap the route heading or board outside the hero, and verify `112px`. Navigate away and back and verify the hero starts at `112px`.

Compare Campaign and Ship measurements directly:

```js
assert.equal(campaign.collapsedHeight, ship.collapsedHeight);
assert.equal(campaign.expandedHeight, ship.expandedHeight);
assert.deepEqual(campaign, { collapsedHeight: 140, expandedHeight: 280 });
assert.deepEqual(mobileCampaign, { collapsedHeight: 112, expandedHeight: 220 });
```

- [ ] **Step 3: Run browser tests and verify GREEN**

Run: `node tools/scripts/test-campaign-library-presentation.mjs`

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: both print `PASS` and report no page errors or horizontal overflow.

- [ ] **Step 4: Run the full alpha gate**

Run: `npm.cmd test`

Expected: exit code `0` with every check passing.

- [ ] **Step 5: Inspect the final diff and whitespace**

Run: `git diff --check`

Run: `git status --short`

Expected: only the planned files plus the user's pre-existing unrelated changes are present; `git diff --check` is silent.

- [ ] **Step 6: Commit browser verification**

```bash
git add tools/scripts/test-expanded-interface-visual-conformance.mjs tools/scripts/test-campaign-library-presentation.mjs
git commit -m "test(ui): verify responsive hero geometry"
```

- [ ] **Step 7: Push the completed main branch**

Run: `gh auth status`

Run: `git push origin main`

Expected: GitHub authentication is valid and `origin/main` advances to the final local commit.
