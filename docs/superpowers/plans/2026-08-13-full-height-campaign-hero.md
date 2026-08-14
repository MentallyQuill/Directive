# Full-Height Active Campaign Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the active Campaign dashboard's animated ship scene fill the panel between its header and bottom action dock without an expand/collapse interaction.

**Architecture:** Keep the existing dashboard DOM order and turn it into an explicit `auto minmax(0, 1fr) auto` grid. Mark only the active dashboard hero with `campaign-dashboard-hero`, skip the shared responsive-hero binding there, and retain the shared binding for Campaign Library detail heroes and the Ship route. CSS owns full-height layout and the existing layered scene continues to size the foreground from width rather than hero height.

**Tech Stack:** Browser DOM APIs, ES modules, CSS Grid, CSS animations, Node.js assertions, Playwright Chromium.

## Global Constraints

- `Campaigns` remains in the upper-right active-dashboard header.
- Continue, Save Game, Load Game, and Delete campaign form the bottom dock immediately above route navigation.
- Desktop keeps the four actions in one row; phone keeps Continue plus Delete campaign on row one and Save Game plus Load Game on row two.
- Every phone action remains at least `44px` high.
- The active dashboard hero has no expand/collapse button, `aria-expanded`, or height transition.
- Campaign Library detail heroes and the Ship route retain their current responsive-hero behavior.
- Background and star layers cover; the foreground ship remains a contained, width-based image.
- Preserve desktop drift scale `.79` to `.81` and mobile drift scale `1.035` to `1.045`.
- Preserve animation timing and existing `prefers-reduced-motion: reduce` behavior.
- Do not change campaign, save, load, deletion, timeline, Ship, mission, or Story Settlement authority.
- Preserve unrelated work in the main checkout.

---

### Task 1: Scope the non-interactive hero to the active dashboard

**Files:**
- Modify: `tools/scripts/test-certified-campaign-panel.mjs:187-205`
- Modify: `src/ui/campaign-panel.js:67-91`

**Interfaces:**
- Consumes: `appendCampaignDetail(detail, campaign, pack, actions, { dashboard })`.
- Produces: `.campaign-dashboard-hero` without `.directive-responsive-hero` or `.directive-responsive-hero-toggle` when `dashboard === true`; all non-dashboard Campaign heroes still consume `bindResponsiveHero`.

- [ ] **Step 1: Write the failing dashboard DOM assertions**

Immediately after the active-dashboard assertions, add behavior checks that would fail if the dashboard accidentally regained the shared expansion binding:

```js
const dashboardHero = byClass(body, 'campaign-dashboard-hero')[0];
assert.ok(dashboardHero, 'active dashboard must expose its full-height hero contract');
assert.equal(dashboardHero.classList.contains('directive-responsive-hero'), false);
assert.equal(byClass(dashboardHero, 'directive-responsive-hero-toggle').length, 0);
assert.equal(dashboardHero.getAttribute('aria-expanded'), null);
const dashboardActions = byClass(body, 'campaign-dashboard-actions')[0];
assert.equal(dashboardHero.parentNode, byClass(body, 'campaign-dashboard')[0]);
assert.equal(dashboardActions.parentNode, byClass(body, 'campaign-dashboard')[0]);
```

Keep the existing Campaign Library assertions at lines 285-292, which independently prove that `campaign-library-hero` still has `directive-responsive-hero`, a toggle, and collapsed state.

- [ ] **Step 2: Run the focused DOM test and verify RED**

Run: `node tools/scripts/test-certified-campaign-panel.mjs`

Expected: FAIL at `active dashboard must expose its full-height hero contract` because the class does not exist.

- [ ] **Step 3: Add the minimal dashboard-specific binding branch**

In `appendCampaignDetail`, mark and append the active hero without calling `bindResponsiveHero`:

```js
  if (dashboard) {
    hero.classList.add('campaign-dashboard-hero');
  } else {
    bindResponsiveHero(hero, { label: 'Campaign', secondary: [meta, summary] });
  }
  detail.appendChild(hero);
```

Remove the unconditional `bindResponsiveHero(...)` and preserve the existing helper call in `appendPackageDetail` unchanged.

- [ ] **Step 4: Run the focused DOM test and verify GREEN**

Run: `node tools/scripts/test-certified-campaign-panel.mjs`

Expected: `PASS certified Campaign panel`.

- [ ] **Step 5: Commit the dashboard interaction boundary**

```powershell
git add src/ui/campaign-panel.js tools/scripts/test-certified-campaign-panel.mjs
git commit -m "feat(ui): make campaign hero noninteractive"
```

---

### Task 2: Fill the panel and dock the campaign actions

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs:504-678`
- Modify: `styles/directive.css:3425-3484`
- Modify: `styles/directive.css:3542-3576`
- Modify: `styles/directive.css:4300-4405`

**Interfaces:**
- Consumes: direct dashboard children `.campaign-dashboard-heading`, `.campaign-dashboard-hero`, and `.campaign-dashboard-actions`.
- Produces: a three-row dashboard grid whose middle row consumes remaining height and whose final row is the action dock.

- [ ] **Step 1: Replace active-dashboard expansion checks with failing fill-and-dock checks**

Add a Playwright helper that reads real rendered geometry:

```js
async function measureCampaignDashboard(page) {
  return page.locator('.campaign-dashboard').evaluate((dashboard) => {
    const heading = dashboard.querySelector('.campaign-dashboard-heading');
    const hero = dashboard.querySelector('.campaign-dashboard-hero');
    const actions = dashboard.querySelector('.campaign-dashboard-actions');
    const routeBar = dashboard.closest('.directive-workspace').querySelector('.directive-route-bar');
    const foreground = hero.querySelector('[data-hero-scene-layer="foreground"]');
    const rect = (node) => {
      const value = node.getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    const heroRect = rect(hero);
    const foregroundRect = rect(foreground);
    const visibleWidth = Math.max(0, Math.min(heroRect.right, foregroundRect.right) - Math.max(heroRect.left, foregroundRect.left));
    return {
      dashboard: rect(dashboard),
      heading: rect(heading),
      hero: heroRect,
      actions: rect(actions),
      routeBar: rect(routeBar),
      actionBoxes: [...actions.children].map(rect),
      heroToggleCount: hero.querySelectorAll('.directive-responsive-hero-toggle').length,
      heroTransitionDuration: getComputedStyle(hero).transitionDuration,
      layerOrder: [...hero.querySelectorAll('.directive-hero-scene-layer')].map((layer) => layer.dataset.heroSceneLayer),
      objectFits: [...hero.querySelectorAll('.directive-hero-scene-layer')].map((layer) => getComputedStyle(layer).objectFit),
      foregroundVisibleWidthRatio: visibleWidth / foregroundRect.width,
      foregroundAspectRatio: foreground.offsetWidth / foreground.offsetHeight,
      heroExpanded: hero.classList.contains('is-expanded'),
      horizontalOverflow: dashboard.scrollWidth - dashboard.clientWidth
    };
  });
}
```

For `1440x900`, assert literal geometry and composition behavior:

```js
assert.ok(Math.abs(desktop.hero.top - desktop.heading.bottom) < 1);
assert.ok(Math.abs(desktop.actions.top - desktop.hero.bottom) < 1);
assert.ok(Math.abs(desktop.actions.bottom - desktop.dashboard.bottom) < 1);
assert.ok(desktop.routeBar.top - desktop.dashboard.bottom <= 16);
assert.ok(desktop.hero.height > 400, 'desktop hero must consume the available panel height');
assert.equal(desktop.heroToggleCount, 0);
assert.equal(desktop.heroTransitionDuration, '0s');
assert.deepEqual(desktop.layerOrder, ['background', 'stars', 'stars-glow', 'foreground']);
assert.deepEqual(desktop.objectFits, ['cover', 'cover', 'cover', 'contain']);
assert.ok(desktop.foregroundVisibleWidthRatio > .99);
assert.ok(Math.abs(desktop.foregroundAspectRatio - (1672 / 941)) < .002);
assert.ok(desktop.actionBoxes.every((box) => Math.abs(box.top - desktop.actionBoxes[0].top) < 1));
assert.ok(desktop.horizontalOverflow <= 1);
```

For the existing `390x844` touch context, assert the same row adjacency, a hero taller than `350px`, a foreground visible-width ratio above `.9`, 44-pixel actions, Continue/Delete sharing row one, Save/Load sharing row two, and row two below row one. Tap the hero and assert its height does not change and no `is-expanded` class appears:

```js
const mobileBeforeTap = await measureCampaignDashboard(touchPage);
assert.ok(Math.abs(mobileBeforeTap.hero.top - mobileBeforeTap.heading.bottom) < 1);
assert.ok(Math.abs(mobileBeforeTap.actions.top - mobileBeforeTap.hero.bottom) < 1);
assert.ok(Math.abs(mobileBeforeTap.actions.bottom - mobileBeforeTap.dashboard.bottom) < 1);
assert.ok(mobileBeforeTap.hero.height > 350);
assert.ok(mobileBeforeTap.foregroundVisibleWidthRatio > .9);
assert.ok(mobileBeforeTap.actionBoxes.every((box) => box.height >= 44));
assert.ok(Math.abs(mobileBeforeTap.actionBoxes[0].top - mobileBeforeTap.actionBoxes[3].top) < 1);
assert.ok(Math.abs(mobileBeforeTap.actionBoxes[1].top - mobileBeforeTap.actionBoxes[2].top) < 1);
assert.ok(mobileBeforeTap.actionBoxes[1].top > mobileBeforeTap.actionBoxes[0].bottom);
assert.equal(mobileBeforeTap.horizontalOverflow <= 1, true);
await touchPage.locator('.campaign-dashboard-hero').tap();
await touchPage.waitForTimeout(220);
const mobileAfterTap = await measureCampaignDashboard(touchPage);
assert.ok(Math.abs(mobileAfterTap.hero.height - mobileBeforeTap.hero.height) < 1);
assert.equal(mobileAfterTap.heroExpanded, false);
```

- [ ] **Step 2: Run Playwright conformance and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because `.campaign-dashboard-hero` still has the fixed `230px`/`170px` Campaign hero height and the action container is not the dashboard's docked final row.

- [ ] **Step 3: Implement the three-row grid and dock**

Update the dashboard and action rules:

```css
.directive-expanded-shell .campaign-dashboard {
  display: grid;
  align-content: stretch;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  margin: 11px 0;
  padding-bottom: 0;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--directive-expanded-surface);
  border-radius: 6px;
  box-shadow: inset 8px 0 0 var(--directive-expanded-amber);
}

.directive-expanded-shell .campaign-dashboard > .campaign-dashboard-actions {
  margin: 0;
  padding: 12px 20px max(12px, env(safe-area-inset-bottom)) 26px;
  background: var(--directive-expanded-surface);
  border-top: 1px solid rgba(255, 159, 74, .28);
}

.directive-expanded-shell .campaign-dashboard > .campaign-dashboard-hero {
  min-height: 0;
  height: auto;
}
```

The existing desktop and phone action-grid column/row rules remain authoritative. Do not alter scene keyframes or responsive scale variables.

- [ ] **Step 4: Run Playwright conformance and verify GREEN**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: `Expanded interface visual conformance passed 25 route/viewports and the approved modal state.` The script refreshes desktop and mobile Campaign screenshots under `artifacts/expanded-interface-conformance/`.

- [ ] **Step 5: Inspect the Playwright screenshots**

Open and visually inspect:

- `artifacts/expanded-interface-conformance/campaign-1440x900.png`
- `artifacts/expanded-interface-conformance/campaign-390x844.png`
- `artifacts/expanded-interface-conformance/campaign-360x500.png`

Confirm the full desktop ship, modest phone crop, readable overlaid copy, docked controls, and absence of covered or clipped navigation. If visual inspection exposes a defect, first add a failing geometry assertion for it, then adjust CSS and rerun the Playwright script.

- [ ] **Step 6: Commit responsive layout and browser proof**

```powershell
git add styles/directive.css tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "feat(ui): fill campaign panel with ship hero"
```

---

### Task 3: Verify, integrate, and push to main

**Files:**
- Verify: all files changed in Tasks 1-2

**Interfaces:**
- Consumes: the completed active-dashboard DOM and CSS contract.
- Produces: a clean feature branch, a green merged `main`, and matching local/remote main SHAs.

- [ ] **Step 1: Run focused regression tests**

Run:

```powershell
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-responsive-hero.mjs
node tools/scripts/test-campaign-library-presentation.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: all four commands exit `0`; the active dashboard remains non-interactive while Library responsive heroes still work.

- [ ] **Step 2: Run the full alpha gate**

Run: `npm.cmd test`

Expected: exit code `0` with all focused checks passing.

- [ ] **Step 3: Audit the feature branch**

Run:

```powershell
git diff --check main...HEAD
git status --short
git log --oneline main..HEAD
```

Expected: no whitespace errors; only the planned spec, plan, Campaign panel, CSS, and test files are changed; the feature work is fully committed.

- [ ] **Step 4: Merge the feature branch into the latest local main**

From `F:\git\Directive`, preserve its unrelated dirty files, verify no Git operation is in progress, merge `feature/campaign-full-height-hero` into `main`, and rerun `npm.cmd test` on the merged tree.

Expected: merge succeeds without touching `debug.log`, `.codex-remote-attachments/`, or `docs/technical/STORY_DIRECTOR_TURN_FLOW.md`; the merged full gate exits `0`.

- [ ] **Step 5: Verify GitHub authentication and push**

Run GitHub CLI with network permission:

```powershell
gh auth status
git push origin main
```

Expected: GitHub authentication is valid and `origin/main` advances to the verified local main commit.

- [ ] **Step 6: Verify exact remote publication**

Run:

```powershell
$localSha = git rev-parse HEAD
$remoteSha = gh api repos/{owner}/{repo}/commits/main --jq .sha
"LOCAL_SHA=$localSha"
"REMOTE_SHA=$remoteSha"
```

Expected: `LOCAL_SHA` and `REMOTE_SHA` are identical.
