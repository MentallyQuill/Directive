# Focused Campaign Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the persistent Campaign lists with an active-campaign dashboard, keep save selection inside Load Game, and expose the existing responsive Campaign browser on demand.

**Architecture:** `campaign-panel.js` owns one ephemeral dashboard/browser mode and derives the active campaign from `buildCertifiedCampaignView()` on every render. Existing Campaign browser renderers remain intact behind a `Campaigns` subview control, while `timeline-dialogs.js` continues to own saved-game selection and adds exact saved-game deletion so no save-management capability is lost.

**Tech Stack:** Browser-native JavaScript modules, Directive runtime UI kit, CSS Grid, SVG mask assets, Node.js assertion scripts, Playwright Chromium.

## Global Constraints

- The active Campaign Dashboard is the default whenever an active campaign exists.
- The Campaign Browser is opened explicitly through `Campaigns`, or shown automatically when no active campaign exists.
- Desktop retains the approved master/detail Campaign browser; mobile retains the single-open disclosure browser.
- Dashboard mode never persists as campaign or timeline state and never becomes a second active-campaign authority.
- Loading creates a new timeline while preserving the current timeline automatically.
- Campaign deletion remains exact-binding, typed-confirmation, and failure-closed.
- Future campaigns remain selectable previews whose activation is disabled.
- All phone interaction targets are at least 44 CSS pixels in both dimensions.
- Icon-only controls have programmatic labels and never rely on color or hover text alone.
- The full `npm.cmd test` gate must pass.

---

### Task 1: Keep saved-game management inside Load Game

**Files:**
- Modify: `src/ui/timeline-dialogs.js:106-151`
- Modify: `styles/directive.css:4297-4305`
- Test: `tools/scripts/test-timeline-dialogs.mjs`

**Interfaces:**
- Consumes: `createLoadGameDialog({ campaign, opener, onLoad })` and saved-game objects with `id`, `name`, `chapter`, `stardate`, and `createdAt`.
- Produces: `createLoadGameDialog({ campaign, opener, onLoad, onDelete })`; `onDelete({ savedGameId })`; sibling `.timeline-saved-game-row` and `.timeline-saved-game-delete` controls inside `.timeline-saved-game-entry`.

- [ ] **Step 1: Extend the dialog test with failing saved-game deletion assertions**

Add a second saved game and pass an `onDelete` spy:

```js
let deleted = null;
const loadDialog = createLoadGameDialog({
  campaign,
  onLoad: (payload) => { loaded = payload; },
  onDelete: (payload) => { deleted = payload; }
});
assert.equal(loadDialog.entries.length, 2);
assert.equal(loadDialog.deleteButtons[0].getAttribute('aria-label'), 'Delete saved game Before Whitaker');
globalThis.confirm = () => true;
await loadDialog.deleteButtons[0].listeners.get('click')({ preventDefault() {}, stopPropagation() {} });
assert.deepEqual(deleted, { savedGameId: 'saved.1' });
assert.equal(loadDialog.rows.length, 1);
assert.equal(loadDialog.primary.disabled, true);
```

Also assert selecting a remaining row still sends its exact ID and that declining confirmation leaves both entries intact.

- [ ] **Step 2: Run the focused test and confirm the new contract fails**

Run: `node tools/scripts/test-timeline-dialogs.mjs`

Expected: FAIL because `deleteButtons`/`entries` and `onDelete` handling do not exist.

- [ ] **Step 3: Implement sibling load/delete controls and local dialog state**

In `createLoadGameDialog`, render each save as:

```js
const entry = createElement('div', 'timeline-saved-game-entry');
const row = createElement('button', 'timeline-saved-game-row');
const remove = createElement('button', 'timeline-saved-game-delete');
remove.type = 'button';
remove.setAttribute('aria-label', `Delete saved game ${savedGame.name || 'Saved Game'}`);
remove.textContent = 'Delete';
entry.append(row, remove);
```

Keep selection on the row with `aria-pressed`. Delete calls `globalThis.confirm`, awaits `onDelete({ savedGameId: savedGame.id })`, removes only the successful entry, clears selection if necessary, disables Load Game, and shows the existing empty message when the last entry is removed. Return live `entries`, `rows`, and `deleteButtons` arrays for focused tests. Keep failures visible in a `role="alert"` `.timeline-dialog-error` without removing the row.

- [ ] **Step 4: Style the entry grid and bounded list**

Use a two-column sibling grid:

```css
.timeline-saved-game-entry { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:7px; }
.timeline-saved-game-delete { min-width:44px; min-height:44px; color:var(--directive-expanded-salmon); }
.timeline-dialog-error[hidden] { display:none; }
```

Keep `.timeline-saved-game-list` independently scrollable and preserve the existing `max-height: min(46dvh, 420px)` bound.

- [ ] **Step 5: Run the focused test and commit**

Run: `node tools/scripts/test-timeline-dialogs.mjs`

Expected: `timeline dialog tests passed`

Commit:

```text
feat(campaign): manage saves in load dialog
```

---

### Task 2: Render an active dashboard and on-demand browser

**Files:**
- Create: `assets/icons/delete-campaign.svg`
- Modify: `assets/icons/README.md`
- Modify: `src/ui/campaign-panel.js:1-395`
- Modify: `tools/scripts/test-certified-campaign-panel.mjs`

**Interfaces:**
- Consumes: `buildCertifiedCampaignView(view)`, `createDirectiveMaskIcon(path)`, `addTooltip(element, text)`, existing runtime actions, and `createLoadGameDialog(..., onDelete)` from Task 1.
- Produces: `.campaign-dashboard`, `.campaign-dashboard-heading`, `[data-campaign-view="dashboard|browser"]`, `[data-campaign-action="campaigns|back-to-current|delete"]`, and ephemeral module state `campaignPanelMode`.

- [ ] **Step 1: Rewrite the focused panel assertions to describe dashboard mode**

For an active campaign, require:

```js
assert.equal(byClass(body, 'campaign-dashboard').length, 1);
assert.equal(byClass(body, 'campaign-master').length, 0);
assert.equal(byClass(body, 'campaign-mobile-accordion').length, 0);
assert.equal(byClass(body, 'campaign-save-list').length, 0);
assert.deepEqual(byClass(body, 'campaign-command').map((node) => textOf(node).trim()), [
  'Campaigns', 'Continue', 'Save Game', 'Load Game', ''
]);
const deleteCampaign = byData(body, 'campaignAction', 'delete')[0];
assert.equal(deleteCampaign.getAttribute('aria-label'), 'Delete campaign');
assert.equal(deleteCampaign.dataset.directiveTooltip, 'Delete campaign');
```

Click `data-campaign-action="campaigns"` and then require the existing desktop master/detail plus mobile disclosure browser. Click `back-to-current` and require the original active dashboard again without invoking any runtime action. Render a no-campaign view and assert it starts in browser mode with no back control.

- [ ] **Step 2: Run the focused panel test and confirm it fails**

Run: `node tools/scripts/test-certified-campaign-panel.mjs`

Expected: FAIL because active campaigns still render the persistent browser and saved-game list.

- [ ] **Step 3: Add the normalized delete asset**

Create `assets/icons/delete-campaign.svg` from the approved `24 24` path:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm2.46-7.12 1.41-1.41L12 12.59l2.12-2.12 1.41 1.41L13.41 14l2.12 2.12-1.41 1.41L12 15.41l-2.12 2.12-1.41-1.41L10.59 14l-2.13-2.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z"/>
</svg>
```

Document it in `assets/icons/README.md` as a Directive-owned destructive-action mask.

- [ ] **Step 4: Split dashboard rendering from browser rendering**

Add module presentation state:

```js
let selectedRecordKey = null;
let campaignPanelMode = null;

export function resetCampaignPanelState() {
  selectedRecordKey = null;
  campaignPanelMode = null;
}
```

Create focused internal functions `appendCampaignHero`, `appendCampaignActions`, `renderCampaignDashboard`, and `renderCampaignBrowser`. `renderCampaignPanel` derives `activeCampaign = model.campaigns.find(candidate => candidate.active) || null`; it forces browser mode when absent, otherwise defaults to dashboard. Dashboard/browser buttons update only `campaignPanelMode`, rerender the same route body, and restore focus to the corresponding navigation control.

The dashboard heading contains `Current Campaign` and `Campaigns`. Browser mode wraps the current master/detail and mobile disclosure compositions without changing their selection logic, and adds `Back to Current Campaign` only when `activeCampaign` exists.

- [ ] **Step 5: Recompose campaign actions without the persistent save list**

`appendCampaignActions` emits Continue, Save Game, Load Game, and a manual icon button. Build the icon button with:

```js
const remove = createElement('button', 'campaign-command campaign-delete-command campaign-delete-icon-command');
remove.type = 'button';
remove.dataset.campaignAction = 'delete';
remove.setAttribute('aria-label', 'Delete campaign');
addTooltip(remove, 'Delete campaign');
remove.appendChild(createDirectiveMaskIcon('assets/icons/delete-campaign.svg', 'campaign-delete-icon'));
```

Pass `onDelete` to Load Game as `actions.deleteSave({ campaignId: campaign.id, checkpointId: savedGameId })`. Remove `createSavedGameRow` and `.campaign-saves` rendering entirely. Preserve exact `openCampaignChat`, `saveGame`, `loadGame || loadCheckpoint`, and `deleteCampaign` payloads.

- [ ] **Step 6: Run the panel and dialog tests and commit**

Run:

```text
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-timeline-dialogs.mjs
node tools/scripts/test-campaign-delete-dialog.mjs
```

Expected: all three pass.

Commit:

```text
feat(campaign): focus active campaign dashboard
```

---

### Task 3: Certify responsive dashboard, browser, and dialog geometry

**Files:**
- Modify: `styles/directive.css:3249-3520,4262-4305,4446-4447`
- Modify: `tools/fixtures/expanded-interface-runtime-fixture.mjs`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `tools/scripts/test-mobile-campaign-mission-accordions.mjs`
- Modify: `tools/scripts/test-campaign-delete-layout.mjs`
- Modify: `tools/scripts/test-campaign-library-presentation.mjs`

**Interfaces:**
- Consumes: dashboard/browser DOM hooks from Task 2 and existing production preview server.
- Produces: responsive `.campaign-dashboard-actions` grid, dashboard-local scroll ownership, certified browser transition geometry, and load-dialog viewport assertions.

- [ ] **Step 1: Add failing production-browser assertions for the active dashboard**

At 1440, 1024, 390, 360x800, and 360x500, assert the initial Campaign route has one visible dashboard scroll owner, no visible Campaign master/accordion, no document overflow, and no saved-game list. Measure action rectangles:

```js
const actions = [...document.querySelectorAll('.campaign-dashboard-actions .campaign-command')];
const boxes = actions.map((node) => node.getBoundingClientRect());
return {
  actionCount: boxes.length,
  desktopSingleRow: boxes.every((box) => Math.abs(box.top - boxes[0].top) < .5),
  phoneRows: [...new Set(boxes.map((box) => Math.round(box.top)))].length,
  minTarget: Math.min(...boxes.map((box) => Math.min(box.width, box.height)))
};
```

Require one row above 640px, exactly two intentional rows at or below 640px, and all phone targets at least 44px high. Click Campaigns, then run the existing library teaser, master/detail, and mobile disclosure assertions inside browser mode. Click Back to Current Campaign and assert the dashboard returns without a recorded fixture action.

- [ ] **Step 2: Run the browser tests and confirm the new assertions fail**

Run:

```text
node tools/scripts/test-expanded-interface-visual-conformance.mjs
node tools/scripts/test-mobile-campaign-mission-accordions.mjs
node tools/scripts/test-campaign-library-presentation.mjs
```

Expected: FAIL because the fixture still opens the persistent browser and old selector expectations assume it is always visible.

- [ ] **Step 3: Add explicit dashboard and browser CSS boundaries**

Use:

```css
.directive-expanded-shell .campaign-dashboard { display:grid; min-height:0; overflow-y:auto; }
.directive-expanded-shell .campaign-dashboard-actions { display:grid; grid-template-columns:auto auto auto 44px; gap:7px; }
.directive-expanded-shell .campaign-delete-icon-command { width:44px; min-width:44px; padding:0; }
.directive-expanded-shell .campaign-delete-icon { width:20px; height:20px; background:currentColor; }
```

At `max-width: 640px`, set the grid to two equal columns plus the delete column: Continue spans columns 1/3, delete occupies column 3 on row 1, Save and Load each span their own half on row 2, and every button has `min-height:44px`. Keep browser desktop/mobile visibility rules scoped below `[data-campaign-view="browser"]`. Give the dashboard and browser the correct single local scroll owner on phones and enough `env(safe-area-inset-bottom)` padding.

- [ ] **Step 4: Exercise the real Load Game and Delete Campaign dialogs in Playwright**

Click Load Game, assert all fixture saves appear only inside `.timeline-saved-game-list`, select one, and verify Load Game enables. Measure dialog bounds inside every viewport and require the list to scroll without document overflow. Close with Escape and assert focus returns to the Load Game opener.

Click the campaign delete icon, retain existing typed-confirmation and dialog geometry assertions, and add 44px phone target plus tooltip-on-focus assertions. Update the static deletion layout probe to reflect the new action grid rather than the obsolete Continue/Delete/Save flex row.

- [ ] **Step 5: Run all focused UI checks and commit**

Run:

```text
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-timeline-dialogs.mjs
node tools/scripts/test-campaign-delete-dialog.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
node tools/scripts/test-mobile-campaign-mission-accordions.mjs
node tools/scripts/test-campaign-delete-layout.mjs
node tools/scripts/test-campaign-library-presentation.mjs
```

Expected: all checks pass with no horizontal overflow or page errors.

Commit:

```text
test(campaign): certify focused dashboard
```

---

### Task 4: Full gate, diff audit, and main integration

**Files:**
- Verify all files changed in Tasks 1-3.

**Interfaces:**
- Consumes: complete focused dashboard implementation and test coverage.
- Produces: verified commits integrated into local and remote `main` without touching unrelated user files.

- [ ] **Step 1: Run the complete repository gate**

Run: `npm.cmd test`

Expected: exit 0 and all focused checks pass.

- [ ] **Step 2: Audit the final diff and worktree status**

Run:

```text
git diff --check main...HEAD
git diff --stat main...HEAD
git status --short
```

Confirm only the approved Campaign renderer, dialog, asset, CSS, fixture, tests, spec, and plan changed. Do not include `debug.log`, `.codex-remote-attachments`, generated screenshots, or artifact output.

- [ ] **Step 3: Merge the feature branch into main**

From `F:\git\Directive`, confirm the user's dirty files are still unchanged, then merge the isolated feature branch with a non-fast-forward merge if main has moved. Resolve only feature-owned files and rerun focused checks after any resolution.

- [ ] **Step 4: Verify main and push**

Run on main:

```text
npm.cmd test
git status -sb
git push origin main
```

Then verify local and remote main SHAs match using `git rev-parse HEAD` and `gh api repos/{owner}/{repo}/commits/main --jq .sha` with network permission enabled.
