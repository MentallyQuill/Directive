# Certified V1 UI Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Directive's certified expanded interface exactly while retaining the current V1 runtime, player-safe projections, actions, Character Builder wand modal, and bounded internal scrolling.

**Architecture:** Keep the current runtime shell lifecycle and V1 application boundary. Add pure per-route certified view adapters, render those models through restored certified route compositions, and connect only the current V1 actions. Restore the frozen reference and conformance harness so every visual difference must be either eliminated or named in the four-entry approved variance manifest.

**Tech Stack:** Browser-native JavaScript modules, DOM APIs, CSS, Node.js test scripts, Playwright 1.61, SillyTavern extension host, PowerShell/npm.cmd on Windows.

## Global Constraints

- This is a conformance restoration, not a redesign.
- Frozen mockup blob must remain `954d50e508772557fd827d93c58c0b442888cacb`.
- V1 remains the sole runtime, storage, projection, and semantic authority.
- Do not add legacy support, migrations, compatibility layers, fallback state, or retired controls.
- Non-Ashes campaigns remain visible, greyed, labeled `Coming later`, semantically disabled, and noninteractive.
- Retain current campaign names, imagery, and descriptions inside certified Campaign geometry.
- Retain the current wand-helper modal behavior; conform only its visual presentation.
- The shell, workspace, and route body never scroll. Only explicitly allowlisted bounded panels may scroll.
- Preserve unrelated work, user data, `.codex-remote-attachments/`, and `.worktrees/`.
- Use `npm.cmd` for repository gates on Windows.

---

## File Structure

### Restored authority

- `docs/design/mockups/directive-expanded-interface.html` — immutable executable visual reference restored from `0ec4a120`.
- `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md` — certified route and responsive contract restored from `0ec4a120`.
- `docs/design/DIRECTIVE_INTERFACE_DESIGN_BIBLE.md` — certified full visual-language document restored from `0ec4a120`.
- `tools/fixtures/certified-v1-ui-variances.json` — exact four-entry exception allowlist.
- `tools/scripts/test-certified-ui-authority.mjs` — validates hashes, authority precedence, variance schema, and prohibited drift.

### Pure view adapters

- `src/ui/view-models/certified-campaign-view.mjs`
- `src/ui/view-models/certified-mission-view.mjs`
- `src/ui/view-models/certified-people-view.mjs`
- `src/ui/view-models/certified-ship-view.mjs`
- `src/ui/view-models/certified-settings-view.mjs`

Each adapter consumes only the current runtime view or exact V1 player projection and returns a cloned, player-safe route model.

### Restored shared presentation primitives

- `src/ui/responsive-record-list.js` — desktop/phone record selection and disclosure behavior.
- `src/ui/reorderable-collection.js` — presentation-only pointer/keyboard ordering when retained.
- `src/ui/expanded-interface-reorder.js` — shared drag handle binding.
- `src/ui/people-journal.js` — certified People master/detail and phone composition, ported to the V1 adapter model.
- `src/ui/ship-journal.js` — certified Ship hero/board and phone composition, ported to the V1 adapter model.

Do not restore `player-facing-information.mjs`, legacy mission journals, reconciliation UI, old advisory layers, old storage controls, or legacy runtime modules.

### Route renderers

- `src/ui/campaign-panel.js`
- `src/ui/mission-panel.js`
- `src/ui/crew-panel.js`
- `src/ui/ship-panel.js`
- `src/ui/settings-panel.js`
- `src/ui/character-creator-panel.js`
- `src/ui/character-creator-assist-dialog.js`
- `src/runtime/runtime-shell.js`
- `styles/directive.css`

### Tests and preview

- Restore and adapt `tools/scripts/serve-expanded-interface-preview.mjs`.
- Restore and adapt `tools/scripts/test-expanded-interface-mockup.mjs`.
- Restore and adapt `tools/scripts/test-expanded-interface-visual-conformance.mjs`.
- Add one focused adapter test per route.
- Add `tools/scripts/test-certified-scroll-ownership.mjs`.
- Add `tools/scripts/test-certified-negative-legacy-ui.mjs`.
- Register all new/restored checks in `tools/scripts/run-alpha-gate.mjs`.

---

### Task 1: Restore And Lock The Certified Authority

**Files:**
- Restore: `docs/design/mockups/directive-expanded-interface.html`
- Restore: `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md`
- Restore: `docs/design/DIRECTIVE_INTERFACE_DESIGN_BIBLE.md`
- Create: `tools/fixtures/certified-v1-ui-variances.json`
- Create: `tools/scripts/test-certified-ui-authority.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: Git blob identity from `0ec4a120` and the approved design specification.
- Produces: `readCertifiedVariances()` returning a frozen array of exactly four variance records.

- [ ] **Step 1: Write the failing authority test**

```js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const blob = execFileSync('git', [
  'rev-parse',
  'HEAD:docs/design/mockups/directive-expanded-interface.html'
], { encoding: 'utf8' }).trim();

assert.equal(blob, '954d50e508772557fd827d93c58c0b442888cacb');

const variances = JSON.parse(readFileSync(
  'tools/fixtures/certified-v1-ui-variances.json',
  'utf8'
));
assert.deepEqual(variances.map(({ id }) => id), [
  'campaign-coming-later',
  'campaign-current-descriptions',
  'creator-wand-modal',
  'bounded-scroll-ownership'
]);
assert.equal(new Set(variances.map(({ selector }) => selector)).size, 4);
```

- [ ] **Step 2: Run the test and confirm the missing authorities fail**

Run: `node tools/scripts/test-certified-ui-authority.mjs`

Expected: FAIL because the mockup and variance manifest do not exist.

- [ ] **Step 3: Restore the three authority documents byte-for-byte**

Use `0ec4a120` as the source. Verify the mockup's resulting Git blob before making any other production change.

- [ ] **Step 4: Add the exact variance manifest**

```json
[
  {
    "id": "campaign-coming-later",
    "selector": "[data-campaign-availability=coming-later]",
    "behavior": "greyed-disabled-noninteractive",
    "reason": "Only Ashes of Peace is playable in V1"
  },
  {
    "id": "campaign-current-descriptions",
    "selector": "[data-campaign-description]",
    "behavior": "current-package-copy-in-certified-geometry",
    "reason": "Current campaign descriptions are approved product copy"
  },
  {
    "id": "creator-wand-modal",
    "selector": ".directive-creator-assist-dialog-overlay",
    "behavior": "modal-dim-inert-focus-trap",
    "reason": "The current wand-helper modal interaction is approved"
  },
  {
    "id": "bounded-scroll-ownership",
    "selector": "[data-directive-scroll-owner=true]",
    "behavior": "only-bounded-panels-scroll",
    "reason": "Route pages and the shell must remain fixed"
  }
]
```

- [ ] **Step 5: Register and rerun the authority test**

Run: `node tools/scripts/test-certified-ui-authority.mjs`

Expected: PASS with the exact mockup blob and exactly four variances.

- [ ] **Step 6: Commit the authority checkpoint**

```powershell
git add docs/design/mockups/directive-expanded-interface.html docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md docs/design/DIRECTIVE_INTERFACE_DESIGN_BIBLE.md tools/fixtures/certified-v1-ui-variances.json tools/scripts/test-certified-ui-authority.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "test(ui): restore certified authority"
```

---

### Task 2: Add Pure V1 Certified Route Adapters

**Files:**
- Create: `src/ui/view-models/certified-campaign-view.mjs`
- Create: `src/ui/view-models/certified-mission-view.mjs`
- Create: `src/ui/view-models/certified-people-view.mjs`
- Create: `src/ui/view-models/certified-ship-view.mjs`
- Create: `src/ui/view-models/certified-settings-view.mjs`
- Create: `tools/scripts/test-certified-campaign-view.mjs`
- Create: `tools/scripts/test-certified-mission-view.mjs`
- Create: `tools/scripts/test-certified-people-view.mjs`
- Create: `tools/scripts/test-certified-ship-view.mjs`
- Create: `tools/scripts/test-certified-settings-view.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `view.campaign`, `view.campaignIndex`, `view.v1PlayerProjection`, and current settings/provider fields.
- Produces:
  - `buildCertifiedCampaignView(view)`
  - `buildCertifiedMissionView(projection)`
  - `buildCertifiedPeopleView(projection)`
  - `buildCertifiedShipView(projection)`
  - `buildCertifiedSettingsView(view)`

- [ ] **Step 1: Write the five failing adapter tests**

Use current V1 fixtures. Pin the route models to these shapes:

```js
assert.deepEqual(buildCertifiedMissionView(projection), {
  selectedMissionId: 'mission.prelude',
  missions: [{
    id: 'mission.prelude',
    title: 'Prelude: A Ship Underway',
    summary: 'Assume command and establish readiness.',
    status: 'active',
    requiredObjectives: [{
      id: 'objective.handover',
      title: 'Complete the command handover',
      summary: 'Establish working boundaries with Captain Whitaker.',
      status: 'active',
      disposition: null,
      terminalText: null
    }],
    optionalObjectives: [{
      id: 'objective.hesperus-rescue',
      title: 'Aid the Hesperus',
      summary: 'Protect the transport and its passengers.',
      status: 'terminal',
      disposition: 'completed',
      terminalText: 'The passengers are safe.'
    }],
    knownFacts: [],
    clocks: [],
    capabilities: [],
    terminal: null
  }]
});
```

```js
const people = buildCertifiedPeopleView(projection);
assert.equal(people.player.id, projection.player.playerId);
assert.deepEqual(people.people.map(({ id }) => id), ['person.whitaker']);
assert.equal(people.commandBearing.balance, 1);
assert.equal(JSON.stringify(people).includes('private'), false);
```

```js
const campaign = buildCertifiedCampaignView(view);
assert.deepEqual(campaign.packages.map(({ availability }) => availability), [
  'available',
  'coming-later'
]);
assert.equal(campaign.packages[1].disabled, true);
assert.equal(campaign.packages[1].description, view.campaign.packages[1].description);
```

- [ ] **Step 2: Run all five tests and confirm missing-module failures**

Run:

```powershell
node tools/scripts/test-certified-campaign-view.mjs
node tools/scripts/test-certified-mission-view.mjs
node tools/scripts/test-certified-people-view.mjs
node tools/scripts/test-certified-ship-view.mjs
node tools/scripts/test-certified-settings-view.mjs
```

Expected: each FAILS with module-not-found.

- [ ] **Step 3: Implement the shared copy and exact-projection guards**

Each adapter imports the current guard from `src/ui/v1-player-facing-panel-model.mjs` where a V1 projection is required and deep-copies returned arrays/objects.

```js
const clone = (value) => value === undefined
  ? undefined
  : JSON.parse(JSON.stringify(value));
```

- [ ] **Step 4: Implement each minimal route adapter**

Do not import raw campaign state reducers or retired UI builders. Campaign availability is determined only by `ASHES_V1_PACKAGE_ID`. Mission filters only already-player-safe projected objectives. People passes only player-safe projected records. Ship passes only aggregate status, material limitations, and capabilities. Settings exposes only controls supported by current runtime actions.

- [ ] **Step 5: Run all adapter tests**

Expected: PASS for all five scripts.

- [ ] **Step 6: Run existing V1 projection tests**

Run:

```powershell
node tools/scripts/test-v1-player-facing-panel-model.mjs
node tools/scripts/test-v1-composite-player-projection.mjs
node tools/scripts/test-v1-mission-player-projection.mjs
node tools/scripts/test-v1-people-projection.mjs
node tools/scripts/test-v1-ship-projection.mjs
```

Expected: PASS with no changed runtime contracts.

- [ ] **Step 7: Commit the adapter checkpoint**

```powershell
git add src/ui/view-models tools/scripts/test-certified-*-view.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(ui): adapt V1 to certified views"
```

---

### Task 3: Restore The Certified Shell And Scroll Contract

**Files:**
- Modify: `src/runtime/runtime-shell.js`
- Modify: `src/ui/directive-expanded-shell.js`
- Modify: `styles/directive.css`
- Create: `tools/scripts/test-certified-scroll-ownership.mjs`
- Modify: `tools/scripts/test-expanded-interface-shell.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: current `createRuntimeActions()`, shell lifecycle, and route selection.
- Produces: `[data-directive-scroll-owner="true"]` on every and only bounded scroll owner.

- [ ] **Step 1: Write the failing scroll-owner test**

At all four required viewports assert:

```js
const shell = page.locator('.directive-expanded-shell');
const workspace = shell.locator('.directive-workspace');
const routeBody = shell.locator('.directive-route-body');

for (const locator of [shell, workspace, routeBody]) {
  await expect(locator).toHaveCSS('overflow', 'hidden');
}

const illegal = await shell.locator('*').evaluateAll((nodes) => nodes
  .filter((node) => {
    const style = getComputedStyle(node);
    const scrollable = /(auto|scroll)/.test(`${style.overflowY} ${style.overflowX}`);
    return scrollable && node.dataset.directiveScrollOwner !== 'true';
  })
  .map((node) => node.className));
assert.deepEqual(illegal, []);
```

- [ ] **Step 2: Run the test and prove the current route-body scroll fails**

Run: `node tools/scripts/test-certified-scroll-ownership.mjs`

Expected: FAIL because `.directive-route-body` currently resolves to `overflow: auto`.

- [ ] **Step 3: Restore certified shell tokens and typography**

Remove the competing V1 shell override layer. Keep current mount/backdrop/history logic. Ensure the final computed shell styles come from one certified layer, including display and body font variables, route colors, rail geometry, top bar, route heading, Close control, and bottom navigation.

- [ ] **Step 4: Make the route body non-scrolling**

```css
.directive-expanded-shell .directive-route-body {
  min-width: 0;
  min-height: 0;
  overflow: hidden !important;
}

.directive-expanded-shell [data-directive-scroll-owner="true"] {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
```

- [ ] **Step 5: Retain current lifecycle actions**

Keep `showDirectiveRuntimePanel`, `hideDirectiveRuntimePanel`, `refreshDirectiveRuntimePanel`, tab persistence, overlay backdrop, focus restoration, creator-session cancellation, and preset dialog behavior unchanged.

- [ ] **Step 6: Run shell and scroll tests**

Run:

```powershell
node tools/scripts/test-expanded-interface-shell.mjs
node tools/scripts/test-certified-scroll-ownership.mjs
node tools/scripts/test-directive-runtime-overlay-host.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit the shell checkpoint**

```powershell
git add src/runtime/runtime-shell.js src/ui/directive-expanded-shell.js styles/directive.css tools/scripts/test-expanded-interface-shell.mjs tools/scripts/test-certified-scroll-ownership.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "fix(ui): restore certified shell"
```

---

### Task 4: Restore The Certified Campaign Library And Saves

**Files:**
- Modify: `src/ui/campaign-panel.js`
- Modify: `styles/directive.css`
- Create: `tools/scripts/test-certified-campaign-panel.mjs`
- Modify: `tools/scripts/test-campaign-library-presentation.mjs`
- Modify: `tools/fixtures/expanded-interface-runtime-fixture.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `buildCertifiedCampaignView(view)` and current actions `startCreatorDraft`, `resumeCreatorDraft`, `openCampaignChat`, `saveGame`, `loadCheckpoint`, `deleteSave`, `refresh`.
- Produces: certified Campaign master/detail DOM with disabled preview semantics.

- [ ] **Step 1: Write the failing Campaign DOM test**

```js
renderCampaignPanel(body, view, actions);

assert.equal(elementsByClass(body, 'campaign-layout').length, 1);
assert.equal(elementsByClass(body, 'campaign-master').length, 1);
assert.equal(elementsByClass(body, 'campaign-detail').length, 1);

const previews = elementsByAttribute(body, 'data-campaign-availability', 'coming-later');
assert.equal(previews.length, 1);
assert.equal(previews[0].getAttribute('aria-disabled'), 'true');
assert.equal(previews[0].tabIndex, -1);
assert.match(textOf(previews[0]), /Coming later/);
assert.match(textOf(previews[0]), /current approved campaign description/);
```

- [ ] **Step 2: Run the focused test and confirm current simplified DOM fails**

Run: `node tools/scripts/test-certified-campaign-panel.mjs`

- [ ] **Step 3: Implement the certified master/detail composition**

Use the certified class names, selection behavior, image frames, command hierarchy, saves list, checkpoint inspector, and phone accordion geometry. Mark Campaign list and selected detail as bounded scroll owners. Selection remains local presentation state.

- [ ] **Step 4: Implement approved campaign exceptions**

For `coming-later` packages:

```js
card.dataset.campaignAvailability = 'coming-later';
card.setAttribute('aria-disabled', 'true');
card.tabIndex = -1;
card.classList.add('is-coming-later');
```

Do not attach click or keyboard activation. Preserve current description text verbatim from the adapter.

- [ ] **Step 5: Connect current V1 actions only**

Do not add package import, legacy Load Campaign, Save As, or compatibility actions. Refresh after successful mutating actions and preserve current route selection.

- [ ] **Step 6: Run Campaign checks**

Run:

```powershell
node tools/scripts/test-certified-campaign-view.mjs
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-campaign-library-presentation.mjs
node tools/scripts/test-runtime-campaign-start-controller.mjs
node tools/scripts/test-sillytavern-checkpoint-chat.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit the Campaign checkpoint**

```powershell
git add src/ui/campaign-panel.js styles/directive.css tools/scripts/test-certified-campaign-panel.mjs tools/scripts/test-campaign-library-presentation.mjs tools/fixtures/expanded-interface-runtime-fixture.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "fix(ui): restore campaign library"
```

---

### Task 5: Restore Mission Around The V1 Projection

**Files:**
- Modify: `src/ui/mission-panel.js`
- Modify: `styles/directive.css`
- Create: `tools/scripts/test-certified-mission-panel.mjs`
- Modify: `tools/fixtures/expanded-interface-runtime-fixture.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `buildCertifiedMissionView(view.v1PlayerProjection)`.
- Produces: certified Mission collection/detail and phone disclosure DOM.

- [ ] **Step 1: Write the failing Mission DOM and safety test**

```js
renderMissionPanel(body, { v1PlayerProjection: projection });

assert.equal(elementsByClass(body, 'mission-layout').length, 1);
assert.match(textOf(body), /Prelude: A Ship Underway/);
assert.match(textOf(body), /Primary objectives/);
assert.match(textOf(body), /Optional objectives/);
assert.doesNotMatch(textOf(body), /fraud/i);
assert.doesNotMatch(textOf(body), /percent|reconciliation|open world|recovery/i);
```

- [ ] **Step 2: Run the test and confirm current card-grid output fails**

Run: `node tools/scripts/test-certified-mission-panel.mjs`

- [ ] **Step 3: Implement the certified collection/detail renderer**

Render the single current mission as the selected record without inventing peer missions. Map required and optional objectives to certified task rows. Cross out and mute resolved objectives. Render clocks only when provided. Render facts, capabilities, and terminal result only when nonempty.

- [ ] **Step 4: Add bounded desktop and phone scroll owners**

Desktop collection and detail scroll independently. Phone list and current expanded detail are bounded; the route body remains fixed.

- [ ] **Step 5: Run Mission and projection checks**

Run:

```powershell
node tools/scripts/test-certified-mission-view.mjs
node tools/scripts/test-certified-mission-panel.mjs
node tools/scripts/test-v1-mission-player-projection.mjs
node tools/scripts/test-v1-mission-runtime.mjs
node tools/scripts/test-v1-mission-transition-runtime.mjs
```

Expected: PASS with spoiler-safe output.

- [ ] **Step 6: Commit the Mission checkpoint**

```powershell
git add src/ui/mission-panel.js styles/directive.css tools/scripts/test-certified-mission-panel.mjs tools/fixtures/expanded-interface-runtime-fixture.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "fix(ui): restore mission journal"
```

---

### Task 6: Restore People And Conform Command Bearing

**Files:**
- Restore/adapt: `src/ui/responsive-record-list.js`
- Restore/adapt: `src/ui/reorderable-collection.js`
- Restore/adapt: `src/ui/expanded-interface-reorder.js`
- Restore/adapt: `src/ui/people-journal.js`
- Modify: `src/ui/crew-panel.js`
- Modify: `styles/directive.css`
- Create: `tools/scripts/test-certified-people-panel.mjs`
- Restore/adapt: `tools/scripts/test-responsive-record-list.mjs`
- Restore/adapt: `tools/scripts/test-reorderable-collection.mjs`
- Modify: `tools/scripts/test-v1-crew-panel.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `buildCertifiedPeopleView(projection)` and current actions `reserveCommandBearingEdge`, `cancelCommandBearingEdge`, `refresh`.
- Produces: certified People master/detail and `.directive-command-bearing-strip`.

- [ ] **Step 1: Write the failing People and Command Bearing test**

```js
renderCrewPanel(body, view, actions);

assert.equal(elementsByClass(body, 'people-layout').length, 1);
assert.equal(elementsByClass(body, 'people-roster').length, 1);
assert.equal(elementsByClass(body, 'people-detail').length, 1);
assert.equal(elementsByClass(body, 'directive-command-bearing-strip').length, 1);
assert.ok(indexOfClass(body, 'directive-command-bearing-strip') < indexOfClass(body, 'people-layout'));
assert.match(textOf(body), /1 of 3 available/);
assert.doesNotMatch(textOf(body), /Marks|Ranks|Resolve|Inspiration/);
```

- [ ] **Step 2: Run the test and confirm current card-grid output fails**

Run: `node tools/scripts/test-certified-people-panel.mjs`

- [ ] **Step 3: Restore the shared record primitives**

Port only presentation selection, disclosure, focus, and retained reorder behavior. Remove imports or callbacks that mutate legacy runtime state. Any retained ordering writes only local UI preference state.

- [ ] **Step 4: Port People journal to the V1 adapter model**

Render player identity and people through one record system. Preserve package-resolved portraits, service pips, categories supported by available data, and master/detail behavior. Omit absent relationship/history sections rather than rendering empty cards.

- [ ] **Step 5: Implement the fixed Command Bearing strip**

The strip is outside both scroll panes. Use current action eligibility:

```js
const canReserve = model.commandBearing.balance > 0
  && !model.commandBearing.pendingEdge
  && typeof actions.reserveCommandBearingEdge === 'function';
```

When an edge is pending, expose Cancel through `cancelCommandBearingEdge`; otherwise expose Use only when eligible.

- [ ] **Step 6: Run People, record, and Command Bearing checks**

Run:

```powershell
node tools/scripts/test-certified-people-view.mjs
node tools/scripts/test-certified-people-panel.mjs
node tools/scripts/test-responsive-record-list.mjs
node tools/scripts/test-reorderable-collection.mjs
node tools/scripts/test-v1-crew-panel.mjs
node tools/scripts/test-v1-command-bearing.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit the People checkpoint**

```powershell
git add src/ui/responsive-record-list.js src/ui/reorderable-collection.js src/ui/expanded-interface-reorder.js src/ui/people-journal.js src/ui/crew-panel.js styles/directive.css tools/scripts/test-certified-people-panel.mjs tools/scripts/test-responsive-record-list.mjs tools/scripts/test-reorderable-collection.mjs tools/scripts/test-v1-crew-panel.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "fix(ui): restore people journal"
```

---

### Task 7: Restore Ship Around The Aggregate Model

**Files:**
- Restore/adapt: `src/ui/ship-journal.js`
- Modify: `src/ui/ship-panel.js`
- Modify: `styles/directive.css`
- Create: `tools/scripts/test-certified-ship-panel.mjs`
- Modify: `tools/scripts/test-ship-panel-state-records.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `buildCertifiedShipView(projection)`.
- Produces: certified Ship hero, operational aggregate, limitation records, and capabilities.

- [ ] **Step 1: Write the failing Ship DOM and negative tracker test**

```js
renderShipPanel(body, { v1PlayerProjection: projection, activePackage });

assert.equal(elementsByClass(body, 'ship-hero').length, 1);
assert.equal(elementsByClass(body, 'ship-board').length, 1);
assert.match(textOf(body), /U\.S\.S\. Breckenridge/);
assert.match(textOf(body), /Operational status/);
assert.doesNotMatch(textOf(body), /technical debt|issue count|readiness percentage/i);
```

- [ ] **Step 2: Run the test and confirm current simplified hero/card output fails**

Run: `node tools/scripts/test-certified-ship-panel.mjs`

- [ ] **Step 3: Port the certified Ship journal**

Keep hero geometry, identity overlay, desktop board, phone disclosures, and bounded panels. Replace issues with V1 material limitations. Keep capabilities non-expandable unless the current projection provides structured dynamic detail.

- [ ] **Step 4: Omit unsupported fields**

Do not render position, course, readiness, damage, issue status, owners, or technical history when absent from the V1 adapter.

- [ ] **Step 5: Run Ship checks**

Run:

```powershell
node tools/scripts/test-certified-ship-view.mjs
node tools/scripts/test-certified-ship-panel.mjs
node tools/scripts/test-v1-ship-projection.mjs
node tools/scripts/test-ship-panel-state-records.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the Ship checkpoint**

```powershell
git add src/ui/ship-journal.js src/ui/ship-panel.js styles/directive.css tools/scripts/test-certified-ship-panel.mjs tools/scripts/test-ship-panel-state-records.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "fix(ui): restore ship journal"
```

---

### Task 8: Restore Settings Without Legacy Controls

**Files:**
- Modify: `src/ui/settings-panel.js`
- Modify: `styles/directive.css`
- Create: `tools/scripts/test-certified-settings-panel.mjs`
- Create: `tools/scripts/test-certified-negative-legacy-ui.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `buildCertifiedSettingsView(view)` and current provider/preset/support actions.
- Produces: certified General/Advanced Settings panels.

- [ ] **Step 1: Write the failing Settings test**

```js
renderSettingsPanel(body, view, actions);

assert.equal(elementsByClass(body, 'settings-layout').length, 1);
assert.match(textOf(body), /General/);
assert.match(textOf(body), /Advanced/);
assert.match(textOf(body), /Directive preset/);
assert.match(textOf(body), /Verify active save/);
assert.doesNotMatch(textOf(body), /reconciliation|continuity|sidecar|tutorial|prompt hash/i);
```

- [ ] **Step 2: Run the test and confirm current card composition fails**

Run: `node tools/scripts/test-certified-settings-panel.mjs`

- [ ] **Step 3: Implement certified General/Advanced compositions**

General contains only ordinary player-facing runtime settings. Advanced contains current provider routing and Directive preset controls. Support contains active-save verification and privacy-bounded diagnostics export.

- [ ] **Step 4: Add a source and DOM negative legacy audit**

Pin prohibited UI vocabulary/imports:

```js
const prohibited = [
  'Scene Reconciliation',
  'Outcome Integrity',
  'Open Threads',
  'Open World',
  'Directive Assist',
  'Load Campaign',
  'Save Game As'
];
for (const label of prohibited) assert.equal(renderedText.includes(label), false);
```

- [ ] **Step 5: Run Settings and negative audits**

Run:

```powershell
node tools/scripts/test-certified-settings-view.mjs
node tools/scripts/test-certified-settings-panel.mjs
node tools/scripts/test-certified-negative-legacy-ui.mjs
node tools/scripts/test-directive-provider-routing.mjs
node tools/scripts/test-sillytavern-preset-manager.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the Settings checkpoint**

```powershell
git add src/ui/settings-panel.js styles/directive.css tools/scripts/test-certified-settings-panel.mjs tools/scripts/test-certified-negative-legacy-ui.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "fix(ui): restore certified settings"
```

---

### Task 9: Conform Character Builder And Preserve The Wand Modal

**Files:**
- Modify: `src/ui/character-creator-panel.js`
- Modify: `src/ui/character-creator-assist-dialog.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-character-creator-assist-dialog.mjs`
- Modify: `tools/scripts/test-character-creator-assist-layout.mjs`
- Create: `tools/scripts/test-certified-character-creator.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: current creator view/actions and the existing `openCharacterCreatorAssistDialog()` behavior.
- Produces: certified builder composition and certified-styled modal without changing request/session semantics.

- [ ] **Step 1: Add failing certified builder and modal style assertions**

```js
assert.equal(await page.locator('.directive-creator-assist-dialog').getAttribute('aria-modal'), 'true');
assert.equal(await page.locator('.directive-runtime-panel').evaluate((node) => node.inert), true);
await expect(page.locator('.directive-creator-assist-dialog-title')).toHaveCSS(
  'font-family',
  /Roboto Condensed|Arial Narrow/
);
await expect(page.locator('.directive-creator-assist-dialog-body')).toHaveAttribute(
  'data-directive-scroll-owner',
  'true'
);
```

- [ ] **Step 2: Run the modal and layout tests to record the style/scroll failures**

Run:

```powershell
node tools/scripts/test-certified-character-creator.mjs
node tools/scripts/test-character-creator-assist-dialog.mjs
node tools/scripts/test-character-creator-assist-layout.mjs
```

Expected: existing behavior tests pass; new certified typography/scroll assertions fail.

- [ ] **Step 3: Restore certified builder geometry and typography**

Keep all current V1 fields, validation, creator assist invocation, portrait actions, difficulty controls, review workflow, and command actions. Change only composition and presentation needed for certified conformance.

- [ ] **Step 4: Restyle the modal without changing behavior**

Preserve modal-root mounting, dim/blur overlay, inert shell, focus trap, loading/result/error transitions, cancellation, Apply, Regenerate, Dismiss, and opener focus restoration. Make the modal body the sole scroll owner; keep header and actions stable.

- [ ] **Step 5: Run Character Builder and modal checks**

Run:

```powershell
node tools/scripts/test-certified-character-creator.mjs
node tools/scripts/test-character-creator-assist-dialog.mjs
node tools/scripts/test-character-creator-assist-panel.mjs
node tools/scripts/test-character-creator-assist-layout.mjs
node tools/scripts/test-character-creator-assist.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit the creator checkpoint**

```powershell
git add src/ui/character-creator-panel.js src/ui/character-creator-assist-dialog.js styles/directive.css tools/scripts/test-certified-character-creator.mjs tools/scripts/test-character-creator-assist-dialog.mjs tools/scripts/test-character-creator-assist-layout.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "fix(ui): conform creator modal"
```

---

### Task 10: Restore Visual Conformance Harness And Certify All Routes

**Files:**
- Restore/adapt: `tools/scripts/serve-expanded-interface-preview.mjs`
- Restore/adapt: `tools/scripts/test-expanded-interface-mockup.mjs`
- Restore/adapt: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `tools/fixtures/expanded-interface-runtime-fixture.mjs`
- Modify: `tools/fixtures/expanded-interface-runtime-shell-fixture.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`
- Modify: `docs/superpowers/specs/2026-08-10-certified-v1-ui-restoration-design.md` only if implementation revealed a factual contradiction; do not add visual variances.

**Interfaces:**
- Consumes: frozen mockup, runtime fixtures, and `certified-v1-ui-variances.json`.
- Produces: route-by-route screenshot/DOM certification reports at four viewports.

- [ ] **Step 1: Restore the preview server and baseline harness**

Keep the frozen mockup untouched. Update only production fixture wiring so equivalent V1 data reaches both reference and production compositions.

- [ ] **Step 2: Make the conformance runner fail on unlisted variance**

```js
assert.deepEqual(
  observedVarianceIds.sort(),
  approvedVariances.map(({ id }) => id).sort(),
  'every visual variance must be explicitly approved'
);
```

- [ ] **Step 3: Capture all five routes at all four viewports**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: PASS for Campaign, Mission, People, Ship, Settings at `1440x900`, `1024x768`, `390x844`, and `360x800`.

- [ ] **Step 4: Exercise important interaction states**

Capture and assert Campaign selection/disabled previews, checkpoint commands, Mission objective states, People selection and Command Bearing, Ship disclosures, Settings General/Advanced, Character Builder review, and wand modal loading/result/error states.

- [ ] **Step 5: Run the complete V1 gate**

Run: `npm.cmd test`

Expected: the V1 gate emits its numeric focused-check count and exits with code 0.

- [ ] **Step 6: Run independent negative and repository audits**

Run:

```powershell
node tools/scripts/test-certified-ui-authority.mjs
node tools/scripts/test-certified-scroll-ownership.mjs
node tools/scripts/test-certified-negative-legacy-ui.mjs
git diff --check
git status --short
```

Expected: all scripts pass, no whitespace errors, and only intentional tracked changes before the final certification commit.

- [ ] **Step 7: Commit the certification checkpoint**

```powershell
git add tools/scripts/serve-expanded-interface-preview.mjs tools/scripts/test-expanded-interface-mockup.mjs tools/scripts/test-expanded-interface-visual-conformance.mjs tools/fixtures/expanded-interface-runtime-fixture.mjs tools/fixtures/expanded-interface-runtime-shell-fixture.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "test(ui): certify restored interface"
```

---

### Task 11: Verify Installed And Live SillyTavern Behavior

**Files:**
- Source: all production files selected by the existing Directive sync boundary.
- Destination: `F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive`
- Preserve: all user files, chats, campaign state, unrelated extensions, and non-production repository content.

**Interfaces:**
- Consumes: verified branch production files.
- Produces: exact installed-file parity report and live-host route evidence.

- [ ] **Step 1: Inventory the exact destination and resolve production-file scope**

Confirm the destination is the intended `default-user` extension and list source/destination differences before copying. Do not copy `.git`, `node_modules`, docs, tests, fixtures, artifacts, or worktrees.

- [ ] **Step 2: Synchronize only production files**

Use the repository's established production sync boundary. Preserve destination-only user data and unrelated files.

- [ ] **Step 3: Hash-verify every synchronized production file**

Expected: zero missing source files and zero content mismatches, treating line-ending-only differences explicitly if the sync mechanism normalizes text.

- [ ] **Step 4: Run a cache-busted served-copy check**

Verify the browser receives the synchronized stylesheet, runtime shell, route panels, adapters, and creator modal—not a cached prior copy.

- [ ] **Step 5: Exercise the live host**

Verify:

- all five routes activate;
- shell/page do not scroll;
- bounded panels scroll where required;
- Ashes is playable and later campaigns are greyed/noninteractive with current descriptions;
- current campaign opens chat and saves/loads checkpoints;
- Mission shows only V1-safe objectives/facts/clocks;
- People shows player/crew and Command Bearing actions;
- Ship shows aggregate state without legacy issues;
- Settings provider/preset/support actions work;
- Character Builder wand opens the dimming modal, traps focus, and returns focus;
- no document-level overflow exists at the required viewports.

- [ ] **Step 6: Record installed/live evidence without changing user campaign data**

Store only non-user diagnostic artifacts under the repository's ignored artifact path. Do not create or delete a real user campaign merely to fill a fixture state.

---

### Task 12: Final Review, Merge To Main, And Push

**Files:**
- Review: complete branch diff against `main`.

**Interfaces:**
- Consumes: a clean implementation branch with all offline, visual, installed, and live checks passing.
- Produces: updated local and GitHub `main` at the same verified commit.

- [ ] **Step 1: Run final verification from the committed branch**

Run:

```powershell
npm.cmd test
node tools/scripts/test-expanded-interface-visual-conformance.mjs
node tools/scripts/test-certified-scroll-ownership.mjs
node tools/scripts/test-certified-negative-legacy-ui.mjs
git diff --check main...HEAD
git status --short
```

Expected: every command passes and the worktree is clean.

- [ ] **Step 2: Review the complete branch diff**

Confirm:

- no runtime semantic/state/storage changes outside the required UI adapters/actions;
- no legacy modules, migrations, or disabled ghost controls;
- exactly four approved variances;
- restored authority files match their expected versions;
- no unrelated user files or workspace-support directories are staged.

- [ ] **Step 3: Merge the branch into local `main`**

From the primary checkout:

```powershell
git status --short
git merge --no-ff codex/certified-v1-ui-restore
```

Expected: clean merge with no unrelated paths.

- [ ] **Step 4: Rerun the final gate on merged `main`**

Run:

```powershell
npm.cmd test
node tools/scripts/test-expanded-interface-visual-conformance.mjs
git status --short
```

Expected: all gates pass and `main` is clean.

- [ ] **Step 5: Verify remote state and push `main`**

Run with GitHub/network permission:

```powershell
gh api repos/MentallyQuill/Directive/commits/main --jq .sha
git push origin main
gh api repos/MentallyQuill/Directive/commits/main --jq .sha
```

Expected: the final remote SHA equals local `git rev-parse HEAD`.

- [ ] **Step 6: Report exact delivery evidence**

Report final commit SHA, test count, visual matrix result, installed-file parity result, live-host routes/actions exercised, and remote `main` SHA. Distinguish fixture, repository, installed, served, and live evidence.
