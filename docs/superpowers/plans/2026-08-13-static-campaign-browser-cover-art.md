# Static Campaign Browser Cover Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep saved-story and Campaign Library cover-art heroes at the existing expanded height without an expansion control.

**Architecture:** Give every non-dashboard Campaign detail hero a `campaign-browser-hero` presentation class and stop binding the shared responsive-hero controller inside the Campaign panel. CSS maps that class to the existing expanded-height custom property, preserving the shared helper exclusively for unrelated surfaces such as Ship.

**Tech Stack:** Browser DOM APIs, ES modules, CSS custom properties, Node.js assertions, Playwright Chromium.

## Global Constraints

- Apply the static hero treatment to both `Your Stories` and `Campaign Library` details.
- Use `320px` at desktop widths and `220px` at phone widths.
- Remove the full-surface click target, expansion icon, `aria-expanded` state, and height transition.
- Keep saved-story identity, metadata, and premise visible.
- Preserve Campaign Library description, facts, availability treatment, and actions.
- Do not change the active Campaign dashboard or the Ship route.
- Preserve unrelated dirty files in the checkout.

---

### Task 1: Move Campaign browser heroes outside responsive interaction

**Files:**
- Modify: `tools/scripts/test-certified-campaign-panel.mjs:205-320`
- Modify: `src/ui/campaign-panel.js:1-145`

**Interfaces:**
- Consumes: `appendCampaignDetail(detail, campaign, pack, actions, { dashboard })` and `appendPackageDetail(detail, pack, actions, options)`.
- Produces: `.campaign-browser-hero` on every non-dashboard story or package hero, with no responsive-helper classes or control.

- [ ] **Step 1: Write failing saved-story and library DOM assertions**

After entering the Campaigns browser, assert the visible saved-story hero contract:

```js
const storyHero = byClass(byClass(body, 'campaign-desktop-detail')[0], 'campaign-browser-hero')[0];
assert.ok(storyHero, 'saved-story detail must expose the static Campaigns-browser hero contract');
assert.equal(storyHero.classList.contains('directive-responsive-hero'), false);
assert.equal(byClass(storyHero, 'directive-responsive-hero-toggle').length, 0);
assert.equal(storyHero.getAttribute('aria-expanded'), null);
assert.equal(byClass(storyHero, 'directive-responsive-hero-secondary').length, 0);
assert.match(textOf(storyHero), /Sam Vickers/);
```

Replace the package hero expansion assertions with:

```js
assert.equal(ashesHero.classList.contains('campaign-browser-hero'), true);
assert.equal(ashesHero.classList.contains('directive-responsive-hero'), false);
assert.equal(byClass(ashesHero, 'directive-responsive-hero-toggle').length, 0);
assert.equal(ashesHero.getAttribute('aria-expanded'), null);
```

- [ ] **Step 2: Run the focused DOM test and verify RED**

Run: `node tools/scripts/test-certified-campaign-panel.mjs`

Expected: FAIL at `saved-story detail must expose the static Campaigns-browser hero contract` because the class does not exist.

- [ ] **Step 3: Implement the minimal Campaign-panel ownership change**

Remove the `bindResponsiveHero` import. In `appendCampaignDetail`, keep the dashboard branch and replace the responsive binding branch:

```js
  if (dashboard) {
    hero.classList.add('campaign-dashboard-hero');
  } else {
    hero.classList.add('campaign-browser-hero');
  }
```

Create package heroes with both permanent classes and remove their helper binding:

```js
  const hero = createElement(
    'section',
    `campaign-hero campaign-browser-hero campaign-library-hero${unavailable ? ' is-coming-later' : ''}`
  );
```

Delete:

```js
  bindResponsiveHero(hero, { label: 'Campaign' });
```

- [ ] **Step 4: Run the focused DOM test and verify GREEN**

Run: `node tools/scripts/test-certified-campaign-panel.mjs`

Expected: `PASS certified Campaign panel`.

- [ ] **Step 5: Commit the interaction boundary**

```powershell
git add -- src/ui/campaign-panel.js tools/scripts/test-certified-campaign-panel.mjs
git diff --cached --check
git commit -m "feat(ui): remove campaign cover toggles"
```

---

### Task 2: Hold browser heroes at expanded height and certify rendered behavior

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs:440-540`
- Modify: `styles/directive.css:3413-3425`

**Interfaces:**
- Consumes: `.campaign-browser-hero` and `--directive-responsive-hero-expanded-height`.
- Produces: static `320px` desktop and `220px` phone Campaigns-browser heroes with captured visual evidence.

- [ ] **Step 1: Add failing rendered measurements for saved-story and library heroes**

Inside the Campaign-route browser checks, measure the currently visible story hero before selecting a future package:

```js
const measureBrowserHero = async (hero) => hero.evaluate((node) => ({
  height: node.getBoundingClientRect().height,
  responsive: node.classList.contains('directive-responsive-hero'),
  toggleCount: node.querySelectorAll('.directive-responsive-hero-toggle').length,
  ariaExpanded: node.getAttribute('aria-expanded'),
  transitionDuration: getComputedStyle(node).transitionDuration,
  horizontalOverflow: node.scrollWidth - node.clientWidth
}));
const visibleHero = page.locator('.campaign-browser-hero:visible').first();
const expectedHeroHeight = viewport.width <= 640 ? 220 : 320;
const storyHeroBefore = await measureBrowserHero(visibleHero);
assert.ok(Math.abs(storyHeroBefore.height - expectedHeroHeight) < 1);
assert.equal(storyHeroBefore.responsive, false);
assert.equal(storyHeroBefore.toggleCount, 0);
assert.equal(storyHeroBefore.ariaExpanded, null);
assert.equal(storyHeroBefore.transitionDuration, '0s');
assert.ok(storyHeroBefore.horizontalOverflow <= 1);
await visibleHero.click({ position: { x: 20, y: 20 } });
const storyHeroAfter = await measureBrowserHero(visibleHero);
assert.ok(Math.abs(storyHeroAfter.height - storyHeroBefore.height) < 1);
```

After selecting the future Campaign Library row, add the same height, state, transition, overflow, and click/tap stability assertions for its visible `.campaign-library-hero`.

Before returning to the dashboard, capture representative evidence:

```js
if (viewport.width === 1440 || viewport.width === 390) {
  await page.screenshot({
    path: path.join(artifactRoot, `campaign-browser-static-covers-${viewport.width}x${viewport.height}.png`)
  });
}
```

- [ ] **Step 2: Run visual conformance and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because `.campaign-browser-hero` still resolves to the base `230px` desktop or `170px` phone height instead of `320px` or `220px`.

- [ ] **Step 3: Add the minimal static expanded-height rule**

Immediately after the base `.campaign-hero` rule, add:

```css
.directive-expanded-shell .campaign-browser-hero {
  box-sizing: border-box;
  height: var(--directive-responsive-hero-expanded-height);
}
```

Do not modify the shared `.directive-responsive-hero` rules or custom-property values.

- [ ] **Step 4: Run focused and full verification**

Run:

```powershell
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-responsive-hero.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
npm.cmd test
```

Expected: all commands exit `0`, the focused tests print their PASS lines, visual conformance reports every route/viewport passing, and the full gate reports no failures.

- [ ] **Step 5: Inspect visual evidence**

Open and inspect:

```text
artifacts/expanded-interface-conformance/campaign-browser-static-covers-1440x900.png
artifacts/expanded-interface-conformance/campaign-browser-static-covers-390x844.png
```

Confirm that cover art remains full-height, no expand glyph is visible, saved-story/library copy remains readable, and no content is clipped horizontally.

- [ ] **Step 6: Commit the rendered contract**

```powershell
git add -- styles/directive.css tools/scripts/test-expanded-interface-visual-conformance.mjs
git diff --cached --check
git commit -m "style(ui): hold campaign covers open"
```

---

### Task 3: Verify and publish main

**Files:**
- Verify only: repository test and Git state

**Interfaces:**
- Consumes: the two implementation commits and their generated visual evidence.
- Produces: verified `main` pushed to `origin/main` without unrelated workspace changes.

- [ ] **Step 1: Re-run the completion gate from a clean implementation index**

```powershell
git diff --check
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-responsive-hero.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
npm.cmd test
git status --short
```

Expected: every verification command exits `0`; Git status shows only the pre-existing unrelated `debug.log`, `.codex-remote-attachments/`, and `docs/technical/STORY_DIRECTOR_TURN_FLOW.md` changes.

- [ ] **Step 2: Confirm GitHub authentication and remote alignment**

```powershell
gh auth status
git fetch origin main
git status -sb
```

Expected: GitHub authentication succeeds and local `main` can fast-forward `origin/main` without rewriting unrelated history.

- [ ] **Step 3: Push verified main**

```powershell
git push origin main
```

Expected: `origin/main` advances to the verified local `main` tip.
