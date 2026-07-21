# Player-Facing Information Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Directive's cluttered player shell with five focused routes, a unified Mission quest journal, and contextual Mission/Crew/Ship information projections while keeping quest selection strictly UI-only.

**Architecture:** Add one pure player-facing projection module between canonical runtime state and panels. Persist only campaign/chat-scoped `selectedQuestId`; render Mission as list/detail, simplify Crew/Ship/Campaign/Settings, remove Log from navigation, and retain canonical audit records behind contextual projections and advanced troubleshooting.

**Tech Stack:** JavaScript ES modules, SillyTavern extension runtime, DOM rendering helpers, repository Node assertion scripts, CSS, Playwright through `tools/scripts/lib/sillytavern-live-harness.mjs`.

## Global Constraints

- Pre-alpha: no compatibility layer is required for removed player routes or old panel composition; update current code and tests in place.
- Chat remains the primary gameplay surface.
- Player navigation is exactly Campaign, Mission, Crew, Ship, Settings.
- There is no Intel, Log, Inventory, Map, Open Threads, Open World, Context, Components, or Recovery top-level destination.
- Quest selection is named `selectedQuestId` and may mutate only UI preference storage.
- Quest selection must not change campaign state, revision, prompt context, tracking priority, time, objectives, narration, mechanics, or provider calls.
- Canonical records remain authoritative; player projections are pure and player-safe.
- Hidden, latent, watchlisted, operator-only, and diagnostic records never appear in player projections.
- Do not add dependencies.
- `default-user` is read-only during automated testing; mutations use a dedicated soak user.

---

## File Map

| File | Responsibility |
| --- | --- |
| `src/ui/player-facing-information.mjs` | Pure Mission/Crew/Ship projection and quest selection fallback |
| `src/ui/mission-quest-journal.js` | Unified quest list/detail DOM rendering |
| `src/runtime/ui-preferences.mjs` | Campaign/chat-scoped selected quest preference |
| `src/storage/directive-storage-repository.mjs` | Normalize and persist the added preference map |
| `src/runtime/runtime-app.mjs` | Supply projections and expose UI-only quest selection action |
| `src/ui/directive-routes.mjs` | Five-route registry and removed-route fallback |
| `src/runtime/runtime-shell.js` | Route dispatch, default resolution, and removal of Log rendering |
| `src/ui/mission-panel.js` | Contextual alerts plus quest journal orchestration |
| `src/ui/crew-panel.js` | Concise crew list/detail projection |
| `src/ui/ship-panel.js` | Concise capability/condition projection |
| `src/ui/campaign-panel.js` | Launcher/library simplification |
| `src/ui/settings-panel.js` | Player preferences first; advanced troubleshooting disclosure |
| `styles/directive.css` | Stable responsive list/detail layouts and disclosures |
| `tools/scripts/test-player-facing-information.mjs` | Projection and privacy contracts |
| `tools/scripts/test-runtime-ui-preferences.mjs` | Selection persistence and normalization |
| `tools/scripts/test-player-facing-route-contracts.mjs` | Five-route/default/migration contracts |
| `tools/scripts/test-player-facing-panel-contracts.mjs` | DOM and forbidden-surface assertions |
| `tools/scripts/lib/sillytavern-live-harness.mjs` | Shared Playwright launch, authentication, and cookie conversion |
| `tools/scripts/test-player-facing-ui-playwright.mjs` | Live desktop/phone behavior and UI-only selection proof |

### Task 1: Pure Player-Facing Projection

**Files:**
- Create: `src/ui/player-facing-information.mjs`
- Create: `tools/scripts/test-player-facing-information.mjs`

**Interfaces:**
- Produces: `buildPlayerFacingInformation({ campaignState, coreProjections, runtimeView })`
- Produces: `resolveSelectedQuestId({ quests, selectedQuestId, activeMissionId })`
- Produces quest records with `{ id, category, status, title, objective, urgency, knownFacts, people, location, history }`

- [ ] **Step 1: Write the failing projection test**

```js
import assert from 'node:assert/strict';
import {
  buildPlayerFacingInformation,
  resolveSelectedQuestId
} from '../../src/ui/player-facing-information.mjs';

const view = buildPlayerFacingInformation({
  campaignState: {
    mission: { id: 'main:ashes', title: 'Ashes of Peace', status: 'active', currentObjective: 'Secure Hesperus.' },
    openWorld: { quests: [{ id: 'side:relay', title: 'Silent Relay', status: 'available' }] },
    narrativeThreads: { records: [
      { id: 'fact:reactor', visibility: 'player', missionId: 'main:ashes', summary: 'The reactor has 41 minutes remaining.' },
      { id: 'hidden:mutiny', visibility: 'hidden', missionId: 'main:ashes', summary: 'Private mutiny plan.' }
    ] }
  },
  coreProjections: {},
  runtimeView: {}
});

assert.deepEqual(view.quests.map(({ id }) => id), ['main:ashes', 'side:relay']);
assert.match(JSON.stringify(view), /41 minutes remaining/);
assert.doesNotMatch(JSON.stringify(view), /Private mutiny plan/);
assert.equal(resolveSelectedQuestId({ quests: view.quests, selectedQuestId: 'missing', activeMissionId: 'main:ashes' }), 'main:ashes');
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run: `node tools/scripts/test-player-facing-information.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement deterministic projection and fallback**

```js
const PLAYER_VISIBLE = new Set(['player', 'public', 'known']);

export function resolveSelectedQuestId({ quests = [], selectedQuestId = '', activeMissionId = '' } = {}) {
  const ids = new Set(quests.map((quest) => String(quest?.id || '')).filter(Boolean));
  if (ids.has(selectedQuestId)) return selectedQuestId;
  if (ids.has(activeMissionId)) return activeMissionId;
  return quests[0]?.id || null;
}

export function buildPlayerFacingInformation({ campaignState = {}, coreProjections = {}, runtimeView = {} } = {}) {
  const mission = projectMainMission(campaignState, coreProjections);
  const sideQuests = projectSideQuests(campaignState, coreProjections);
  const visibleRecords = collectLinkedRecords({ campaignState, coreProjections, runtimeView })
    .filter((record) => PLAYER_VISIBLE.has(String(record.visibility || 'player')));
  const quests = attachQuestRecords([mission, ...sideQuests].filter(Boolean), visibleRecords);
  return Object.freeze({
    quests: orderQuests(quests),
    crew: projectCrew(campaignState, visibleRecords),
    ship: projectShip(campaignState, visibleRecords),
    contextualAlerts: projectContextualAlerts(runtimeView)
  });
}
```

Implement the named private helpers in the same file. Normalize missing arrays to `[]`, cap `knownFacts` at three, deduplicate records by stable id, and sort by active status, urgency, then source order. Do not synthesize facts from prose.

- [ ] **Step 4: Add fixture cases for hidden records, duplicate links, urgency ordering, empty state, crew linkage, and ship linkage**

Use direct assertions against exact ids and summaries. Assert serialized output excludes `confidence`, `prompt`, `provider`, `reasoning`, and hidden record text.

- [ ] **Step 5: Run and commit**

Run: `node tools/scripts/test-player-facing-information.mjs`

Expected: PASS with `Player-facing information projection tests passed`.

```powershell
git add src/ui/player-facing-information.mjs tools/scripts/test-player-facing-information.mjs
git commit -m "feat: add player information projections"
```

### Task 2: UI-Only Quest Selection Preference

**Files:**
- Modify: `src/runtime/ui-preferences.mjs`
- Modify: `src/storage/directive-storage-repository.mjs:333`
- Modify: `tools/scripts/test-runtime-ui-preferences.mjs`

**Interfaces:**
- Produces: `selectedQuestId(scopeKey)`
- Produces: `selectQuest(scopeKey, questId)`
- Produces: `clearSelectedQuest(scopeKey)`
- Persists: `selectedQuestIdsByScope: Record<string, string>`

- [ ] **Step 1: Extend the test with selection normalization and persistence**

```js
assert.equal(preferences.selectedQuestId('campaign:ashes::chat:1'), 'quest:hesperus');
assert.equal(preferences.selectQuest(' campaign:ashes::chat:1 ', ' quest:relay '), true);
assert.equal(preferences.clearSelectedQuest('missing'), false);
await preferences.persist();
assert.deepEqual(writes.at(-1).payload.selectedQuestIdsByScope, {
  'campaign:ashes::chat:1': 'quest:relay'
});
```

Seed `loadPreferences` with valid, blank, and malformed key/value pairs. Assert malformed entries are discarded.

- [ ] **Step 2: Verify the new assertions fail**

Run: `node tools/scripts/test-runtime-ui-preferences.mjs`

Expected: FAIL because `selectedQuestId` is not defined.

- [ ] **Step 3: Implement the preference map**

```js
let selectedQuestIdsByScope = new Map();

function selectedQuestId(scopeKey) {
  return selectedQuestIdsByScope.get(compactString(scopeKey)) || null;
}

function selectQuest(scopeKey, questId) {
  const scope = compactString(scopeKey);
  const quest = compactString(questId);
  if (!scope || !quest) return false;
  selectedQuestIdsByScope.set(scope, quest);
  return true;
}

function clearSelectedQuest(scopeKey) {
  return selectedQuestIdsByScope.delete(compactString(scopeKey));
}
```

Load from `Object.entries(preferences.selectedQuestIdsByScope || {})`, include `Object.fromEntries(selectedQuestIdsByScope)` in `persist()`, and expose the three methods from the frozen API.

- [ ] **Step 4: Normalize storage in place**

Add `selectedQuestIdsByScope: {}` to `createUiPreferences()`. In `normalizeUiPreferences()`, trim keys and values and return only non-empty string pairs. Keep `schemaVersion: 1`; this is an additive pre-alpha preference field, not a campaign schema migration.

- [ ] **Step 5: Run focused storage tests and commit**

Run:

```powershell
node tools/scripts/test-runtime-ui-preferences.mjs
node tools/scripts/test-current-chat-campaign-scope.mjs
```

Expected: both PASS.

```powershell
git add src/runtime/ui-preferences.mjs src/storage/directive-storage-repository.mjs tools/scripts/test-runtime-ui-preferences.mjs
git commit -m "feat: persist selected quest view"
```

### Task 3: Runtime Projection and Selection Action

**Files:**
- Modify: `src/runtime/runtime-app.mjs:2390`
- Modify: `src/runtime/runtime-shell.js:950`
- Create: `tools/scripts/test-quest-selection-ui-only.mjs`

**Interfaces:**
- Consumes: `buildPlayerFacingInformation`, `resolveSelectedQuestId`, UI preference methods
- Produces: `view.playerFacingInformation`
- Produces runtime action: `selectMissionQuest({ questId })`

- [ ] **Step 1: Write a mutation-boundary test**

Build a runtime app with in-memory storage, load a campaign, and capture canonical state plus provider-call count before selection:

```js
const before = await app.getCurrentView({ tabId: 'mission' });
const canonicalBefore = JSON.stringify(before.campaignState);
const revisionBefore = before.campaignState.revision;
const promptRevisionBefore = before.runtimeTracking?.promptContextRevision || null;
const callsBefore = providerCalls.length;

const after = await app.selectMissionQuest({ questId: 'side:relay' });

assert.equal(after.playerFacingInformation.selectedQuestId, 'side:relay');
assert.equal(JSON.stringify(after.campaignState), canonicalBefore);
assert.equal(after.campaignState.revision, revisionBefore);
assert.equal(after.runtimeTracking?.promptContextRevision || null, promptRevisionBefore);
assert.equal(providerCalls.length, callsBefore);
```

Also assert reload restores selection and removal of that quest falls back to the active mission.

- [ ] **Step 2: Run and confirm failure**

Run: `node tools/scripts/test-quest-selection-ui-only.mjs`

Expected: FAIL because `selectMissionQuest` is missing.

- [ ] **Step 3: Add the scope and projection to `viewEnvelope`**

```js
function missionSelectionScope(renderedState = liveCampaignStateForView()) {
  const campaignId = compactString(renderedState?.campaign?.id);
  const chatId = compactString(currentChatScope?.currentChat?.chatId);
  return campaignId && chatId ? `campaign:${campaignId}::chat:${chatId}` : null;
}

function playerFacingInformationView(options = {}) {
  const renderedCampaignState = options.renderedCampaignState || liveCampaignStateForView();
  const renderedAssets = optionalRuntimeAssetsForState(renderedCampaignState);
  const openWorld = options.openWorld || (renderedCampaignState && renderedAssets?.packageData
    ? openWorldQuestView(renderedCampaignState, renderedAssets.packageData)
    : null);
  const commandBearingPlayerView = options.commandBearingPlayerView || (renderedCampaignState
    ? projectCommandBearingForPlayer(migrateCommandBearingState(renderedCampaignState))
    : null);
  const playerSafeCampaign = options.playerSafeCampaign || createPlayerSafeCampaignProjection({
    campaignState: renderedCampaignState,
    packageData: renderedAssets?.packageData || null,
    crewDataset: renderedAssets?.crewDataset || null
  });
  const chatNative = options.chatNative || chatNativeViewForState(renderedCampaignState, currentChatScope?.guard || null);
  const projection = buildPlayerFacingInformation({
    campaignState: renderedCampaignState,
    coreProjections: { playerSafeCampaign, commandBearingPlayerView },
    runtimeView: {
      openWorld,
      chatNative,
      pendingDirectorTurn: publicPendingDirectorTurnProjection(pendingDirectorTurn, pendingOutcomeReplacement),
      pendingOutcomeReplacement
    }
  });
  const scopeKey = missionSelectionScope();
  const selectedQuestId = resolveSelectedQuestId({
    quests: projection.quests,
    selectedQuestId: scopeKey ? uiPreferences.selectedQuestId(scopeKey) : null,
    activeMissionId: campaignState?.mission?.id || campaignState?.activeMissionId || ''
  });
  return { ...projection, selectionScopeKey: scopeKey, selectedQuestId };
}
```

Inside `viewEnvelope`, compute `playerSafeCampaign` and `chatNative` once, pass them to `playerFacingInformationView`, and return all three values. Use `renderedCampaignState.campaign.id` and `currentChatScope.currentChat.chatId`; do not create a second identity source.

- [ ] **Step 4: Add the UI-only action**

```js
async selectMissionQuest({ questId = '' } = {}) {
  return run(async () => {
    await ensureInitialized();
    const scopeKey = missionSelectionScope();
    const projection = playerFacingInformationView();
    if (!scopeKey || !projection.quests.some((quest) => quest.id === compactString(questId))) {
      throw new Error('Selected quest is not available in the current campaign chat.');
    }
    uiPreferences.selectQuest(scopeKey, questId);
    await persistUiPreferences();
    return viewEnvelope('mission');
  });
}
```

Expose it through `createRuntimeActions()` as `selectMissionQuest(options)`, followed only by panel refresh. Do not call state settlement, prompt flush, tracking, or generation APIs.

- [ ] **Step 5: Run focused tests and commit**

Run:

```powershell
node tools/scripts/test-quest-selection-ui-only.mjs
node tools/scripts/test-runtime-ui-preferences.mjs
```

Expected: both PASS.

```powershell
git add src/runtime/runtime-app.mjs src/runtime/runtime-shell.js tools/scripts/test-quest-selection-ui-only.mjs
git commit -m "feat: wire ui-only quest selection"
```

### Task 4: Five-Route Shell and Route Migration

**Files:**
- Modify: `src/ui/directive-routes.mjs`
- Modify: `src/ui/directive-shell-layout.mjs`
- Modify: `src/runtime/runtime-shell.js:1`
- Modify: `tools/scripts/test-command-spine-layout.mjs`
- Create: `tools/scripts/test-player-facing-route-contracts.mjs`

**Interfaces:**
- Produces: `resolveDirectiveRouteId(routeId, { hasActiveCampaign, fallback })`
- Removes player route: `log`

- [ ] **Step 1: Write route assertions**

```js
assert.deepEqual(DIRECTIVE_PRIMARY_ROUTES.map(({ id }) => id), [
  'campaign', 'mission', 'crew', 'ship', 'settings'
]);
assert.equal(resolveDirectiveRouteId('log', { hasActiveCampaign: true }), 'mission');
assert.equal(resolveDirectiveRouteId('log', { hasActiveCampaign: false }), 'campaign');
assert.equal(resolveDirectiveRouteId('', { hasActiveCampaign: true }), 'mission');
```

Assert `runtime-shell.js` no longer imports or dispatches `renderCommandLogPanel`.

- [ ] **Step 2: Run and confirm failure**

Run: `node tools/scripts/test-player-facing-route-contracts.mjs`

Expected: FAIL because Log is still registered.

- [ ] **Step 3: Replace the route registry and add context-aware fallback**

```js
const REMOVED_ROUTE_IDS = new Set(['log', 'intel', 'inventory', 'map']);

export function resolveDirectiveRouteId(routeId, { hasActiveCampaign = false, fallback = '' } = {}) {
  const value = String(routeId || '').trim();
  if (DIRECTIVE_PRIMARY_ROUTES.some((route) => route.id === value)) return value;
  if (REMOVED_ROUTE_IDS.has(value) || !value) return hasActiveCampaign ? 'mission' : 'campaign';
  return fallback || (hasActiveCampaign ? 'mission' : 'campaign');
}
```

Update labels to player language. Campaign is `Library`, Mission is `Quests`, Crew is `People`, Ship is `Status`, and Settings is `Preferences` in shelf descriptions while route labels remain the approved nouns.

- [ ] **Step 4: Remove Log dispatch and normalize after view load**

Delete the `renderCommandLogPanel` import and branch. Resolve an invalid persisted route after `getCurrentView()` reveals whether a campaign is active, update `shellLayout.activeRoute`, and persist once. Keep valid remembered routes.

- [ ] **Step 5: Run shell tests and commit**

Run:

```powershell
node tools/scripts/test-player-facing-route-contracts.mjs
node tools/scripts/test-command-spine-layout.mjs
node tools/scripts/test-runtime-shell-creator-flow.mjs
```

Expected: all PASS after updating assertions from six routes to five and removed-route fallback.

```powershell
git add src/ui/directive-routes.mjs src/ui/directive-shell-layout.mjs src/runtime/runtime-shell.js tools/scripts/test-command-spine-layout.mjs tools/scripts/test-player-facing-route-contracts.mjs tools/scripts/test-runtime-shell-creator-flow.mjs
git commit -m "refactor: reduce player navigation"
```

### Task 5: Unified Mission Quest Journal

**Files:**
- Create: `src/ui/mission-quest-journal.js`
- Modify: `src/ui/mission-panel.js:32`
- Create: `tools/scripts/test-player-facing-panel-contracts.mjs`

**Interfaces:**
- Consumes: `view.playerFacingInformation`, `actions.selectMissionQuest`
- Produces: `renderMissionQuestJournal(container, information, actions)`

- [ ] **Step 1: Write DOM contract tests**

Render with active, available, inactive, and completed quest fixtures. Assert one `nav[aria-label="Quests"]`, one detail region, selected row `aria-selected="true"`, completed disclosure collapsed, urgency rendered only when present, and the selected action receives only `{ questId }`.

Add negative assertions for these labels:

```js
for (const removed of [
  'Bound Chat', 'Prompt Context', 'Tracked Turns', 'Committed Revision',
  'Turn Route', 'Latest Committed Outcome', 'Recovery Console',
  'Open Threads', 'Open World', 'Components'
]) assert.doesNotMatch(textOf(body), new RegExp(removed, 'i'));
```

- [ ] **Step 2: Run and confirm failure**

Run: `node tools/scripts/test-player-facing-panel-contracts.mjs`

Expected: FAIL because the journal module does not exist and old surfaces remain.

- [ ] **Step 3: Implement accessible list/detail rendering**

```js
export function renderMissionQuestJournal(container, information, actions = {}) {
  const quests = information?.quests || [];
  const selectedId = information?.selectedQuestId || null;
  const selected = quests.find((quest) => quest.id === selectedId) || null;
  const layout = createElement('section', 'directive-quest-journal');
  layout.append(createQuestList(quests, selectedId, async (questId) => {
    await actions.selectMissionQuest?.({ questId });
  }));
  layout.append(createQuestDetail(selected));
  container.append(layout);
}
```

Use `<button aria-selected>` quest rows and native `<details>` for inactive/completed groups and related history. Show at most three Known So Far facts before a disclosure. Omit empty metadata rows.

- [ ] **Step 4: Replace Mission subtab composition**

Delete `activeMissionSubtabId`, subtab listeners, and `createMissionSubtabs`. Keep pending player decisions and recovery only through `information.contextualAlerts`, rendered above the journal. Remove standing telemetry, command-log summary, play-surface metadata, and permanent recovery composition. Leave canonical actions intact in runtime code even when no longer permanently rendered.

- [ ] **Step 5: Update tests that asserted old subtabs**

Replace old `test-extension-shell.mjs`, `test-open-world-ui-runtime-contracts.mjs`, and `test-visual-system-foundation.mjs` expectations with unified-journal assertions. Preserve tests for underlying open-world actions and canonical records.

- [ ] **Step 6: Run and commit**

Run:

```powershell
node tools/scripts/test-player-facing-panel-contracts.mjs
node tools/scripts/test-extension-shell.mjs
node tools/scripts/test-open-world-ui-runtime-contracts.mjs
node tools/scripts/test-end-condition-ui-contracts.mjs
node tools/scripts/test-visual-system-foundation.mjs
```

Expected: all PASS.

```powershell
git add src/ui/mission-quest-journal.js src/ui/mission-panel.js tools/scripts/test-player-facing-panel-contracts.mjs tools/scripts/test-extension-shell.mjs tools/scripts/test-open-world-ui-runtime-contracts.mjs tools/scripts/test-end-condition-ui-contracts.mjs tools/scripts/test-visual-system-foundation.mjs
git commit -m "refactor: unify mission quest journal"
```

### Task 6: Simplify Crew and Ship

**Files:**
- Modify: `src/ui/crew-panel.js:1133`
- Modify: `src/ui/ship-panel.js:225`
- Modify: `tools/scripts/test-player-facing-panel-contracts.mjs`
- Modify: `tools/scripts/test-ship-panel-state-records.mjs`

**Interfaces:**
- Consumes: `view.playerFacingInformation.crew`
- Consumes: `view.playerFacingInformation.ship`

- [ ] **Step 1: Add failing Crew/Ship contracts**

Assert Crew renders identity, role, availability, standing, active involvement, and collapsed history. Assert Ship renders identity, capabilities, overall condition once, active restrictions/damage, and linked technical history. Assert zero/no-change sections are absent.

Assert normal rendering excludes `Command Bearing Evidence`, `Review Queue`, `Current Pressure`, `Command Context`, `Recent Command Memory`, `Technical Debt 0`, and duplicate `Current Operational Condition` headings.

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node tools/scripts/test-player-facing-panel-contracts.mjs
node tools/scripts/test-ship-panel-state-records.mjs
```

Expected: at least one old-panel assertion fails.

- [ ] **Step 3: Recompose Crew from its projection**

Use one list/detail pattern. Render a concise person row and selected detail with linked statements, known facts, quest involvement, and native collapsed history. Keep Command Bearing outcomes only when they are translated into a player-facing relationship or capability change.

- [ ] **Step 4: Recompose Ship from its projection**

Render a stable condition header, capability/resource list, and only non-empty damage/restriction/history groups. Do not repeat condition in folders and counters.

- [ ] **Step 5: Run and commit**

Run the two focused scripts from Step 2, then `node tools/scripts/test-extension-shell.mjs`.

Expected: all PASS.

```powershell
git add src/ui/crew-panel.js src/ui/ship-panel.js tools/scripts/test-player-facing-panel-contracts.mjs tools/scripts/test-ship-panel-state-records.mjs tools/scripts/test-extension-shell.mjs
git commit -m "refactor: focus crew and ship views"
```

### Task 7: Simplify Campaign and Settings

**Files:**
- Modify: `src/ui/campaign-panel.js:2377`
- Modify: `src/ui/settings-panel.js:1306`
- Modify: `tools/scripts/test-player-facing-panel-contracts.mjs`
- Modify: `tools/scripts/test-visual-system-foundation.mjs`

**Interfaces:**
- Campaign remains launcher/library/records management.
- Settings exposes Player Preferences plus native Advanced and Developer & Troubleshooting disclosures.

- [ ] **Step 1: Add failing hierarchy tests**

Assert campaign cards expose campaign identity and primary action without duplicated mission/chat/ship/outcome fields. Assert Settings first renders editable player preferences; provider configuration is inside `details[data-settings-group="advanced"]`; diagnostics and repair are inside `details[data-settings-group="troubleshooting"]` and both are closed by default.

- [ ] **Step 2: Run and confirm failure**

Run: `node tools/scripts/test-player-facing-panel-contracts.mjs`

Expected: FAIL on current campaign metadata and settings hierarchy.

- [ ] **Step 3: Trim Campaign cards**

Keep Continue, New/Import, Library, Save, Branch, and Records actions. Keep save metadata only when it distinguishes records: save name, branch marker, updated time, and current marker. Remove duplicated active mission, phase, bound-chat status, ship state, and latest outcome.

- [ ] **Step 4: Recompose Settings with native disclosures**

```js
function appendSettingsDisclosure(body, { key, title, content }) {
  const disclosure = createElement('details', 'directive-settings-disclosure');
  disclosure.dataset.settingsGroup = key;
  disclosure.append(createElement('summary', '', title));
  content(disclosure);
  body.append(disclosure);
}
```

Do not persist disclosure state. Put provider preset/config/routing under `advanced`; model-call diagnostics, continuity projection diagnostics, storage safety, repair, and destructive maintenance under `troubleshooting`.

- [ ] **Step 5: Run and commit**

Run:

```powershell
node tools/scripts/test-player-facing-panel-contracts.mjs
node tools/scripts/test-visual-system-foundation.mjs
node tools/scripts/test-runtime-shell-creator-flow.mjs
```

Expected: all PASS.

```powershell
git add src/ui/campaign-panel.js src/ui/settings-panel.js tools/scripts/test-player-facing-panel-contracts.mjs tools/scripts/test-visual-system-foundation.mjs tools/scripts/test-runtime-shell-creator-flow.mjs
git commit -m "refactor: simplify campaign and settings"
```

### Task 8: Responsive Visual System

**Files:**
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-visual-system-foundation.mjs`

**Interfaces:**
- Desktop journal uses bounded list/detail tracks.
- Phone journal uses one column and one scroll owner.

- [ ] **Step 1: Add failing CSS contract assertions**

Assert the stylesheet contains stable journal tracks, minimum widths, overflow wrapping, visible focus, selected state independent of color, and a phone breakpoint.

- [ ] **Step 2: Add the layout CSS**

```css
.directive-quest-journal {
  display: grid;
  grid-template-columns: minmax(15rem, 20rem) minmax(0, 1fr);
  min-height: 0;
  gap: 1rem;
}

.directive-quest-row,
.directive-quest-detail {
  min-width: 0;
  overflow-wrap: anywhere;
}

.directive-quest-row[aria-selected="true"] {
  border-inline-start: 3px solid var(--directive-accent);
  font-weight: 600;
}

.directive-quest-row:focus-visible {
  outline: 2px solid var(--directive-focus);
  outline-offset: 2px;
}

@media (max-width: 720px) {
  .directive-quest-journal { grid-template-columns: minmax(0, 1fr); }
  .directive-quest-list { max-height: none; overflow: visible; }
}
```

Adapt tokens to existing CSS custom properties; do not introduce a parallel palette.

- [ ] **Step 3: Run and commit**

Run: `node tools/scripts/test-visual-system-foundation.mjs`

Expected: PASS.

```powershell
git add styles/directive.css tools/scripts/test-visual-system-foundation.mjs
git commit -m "style: add responsive quest journal"
```

### Task 9: Live Playwright Acceptance Script

**Files:**
- Create: `tools/scripts/test-player-facing-ui-playwright.mjs`
- Reuse: `tools/scripts/lib/sillytavern-live-harness.mjs`

**Interfaces:**
- Consumes: `launchPlaywrightBrowser`, `authenticateSillyTavernUser`, and semantic route/data selectors
- Writes: optional screenshots under `DIRECTIVE_PLAYER_FACING_UI_ARTIFACT_DIR`

- [ ] **Step 1: Add preflight/source assertions**

Assert the script refuses `DIRECTIVE_SILLYTAVERN_USER=default-user`, requires an explicit dedicated user, and uses route/data selectors rather than coordinate clicks.

- [ ] **Step 2: Implement the live test skeleton**

```js
const user = String(process.env.DIRECTIVE_SILLYTAVERN_USER || '').trim();
if (!user || user.toLowerCase() === 'default-user') throw new Error('Use a dedicated SillyTavern user.');
const launched = await launchPlaywrightBrowser({ headless: process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0' });
if (!launched.ok) throw new Error(launched.error?.message || 'Playwright browser launch failed.');
const auth = await authenticateSillyTavernUser({
  baseUrl: DEFAULT_SILLYTAVERN_BASE_URL,
  handle: user,
  password: process.env.DIRECTIVE_SILLYTAVERN_PASSWORD || ''
});
assert.equal(auth.ok, true, auth.error || 'SillyTavern authentication failed.');

const browser = launched.browser;
for (const [name, viewport] of Object.entries(PLAYWRIGHT_VIEWPORTS)) {
  const context = await browser.newContext({ baseURL: DEFAULT_SILLYTAVERN_BASE_URL, viewport });
  await context.addCookies(cookieHeaderToBrowserCookies(auth.headers.Cookie, DEFAULT_SILLYTAVERN_BASE_URL));
  const page = await context.newPage();
  await runPlayerFacingAssertions(page, { name, artifactRoot });
  await context.close();
}
await browser.close();
```

The script uses a narrow local cookie adapter and keeps login in the existing `authenticateSillyTavernUser` helper:

```js
function cookieHeaderToBrowserCookies(cookieHeader = '', baseUrl = DEFAULT_SILLYTAVERN_BASE_URL) {
  const url = new URL(normalizeBaseUrl(baseUrl));
  return String(cookieHeader || '').split(';').map((part) => part.trim()).filter(Boolean).flatMap((part) => {
    const separator = part.indexOf('=');
    if (separator <= 0) return [];
    return [{
      name: part.slice(0, separator),
      value: part.slice(separator + 1),
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      secure: url.protocol === 'https:'
    }];
  }).filter((cookie) => cookie.name && cookie.value);
}
```

- [ ] **Step 3: Implement semantic and mutation assertions**

For each viewport:

1. Open Directive and assert exactly five route controls and no Log/Intel.
2. With an active campaign and cleared layout preference, assert Mission opens.
3. Click the first available quest row when an active campaign supplies one.
4. Assert detail changes and `aria-selected` follows it after Crew -> Mission navigation.
5. Navigate Crew, Ship, and Settings; assert focused first-level surfaces and two closed advanced disclosures.

- [ ] **Step 4: Add layout and screenshot proof**

Capture an optional drawer screenshot and assert the focused surface does not introduce horizontal overflow at either viewport:

```js
const overflow = await page.locator('#directive-runtime-panel').evaluate((node) => ({
  horizontal: node.scrollWidth > node.clientWidth + 2,
  panelWidth: node.getBoundingClientRect().width
}));
assert.equal(overflow.horizontal, false);
```

- [ ] **Step 5: Run preflight and the live script**

Run:

```powershell
node tools/scripts/test-player-facing-ui-playwright.mjs --help
$env:DIRECTIVE_SILLYTAVERN_USER='directive-soak-a'
$env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
node tools/scripts/test-player-facing-ui-playwright.mjs --live
```

Expected: PASS with desktop/phone route, overflow, and selection results. Add `DIRECTIVE_PLAYER_FACING_UI_ARTIFACT_DIR` for screenshots.

- [ ] **Step 6: Commit**

```powershell
git add tools/scripts/test-player-facing-ui-playwright.mjs
git commit -m "test: add player ui browser proof"
```

Omit `package.json` from `git add` when no script registration was needed.

### Task 10: Full Regression and Documentation Gate

**Files:**
- Modify: `tools/scripts/run-alpha-gate.mjs`
- Verify: `docs/testing/PLAYER_FACING_INFORMATION_ARCHITECTURE_TEST_PLAN.md`

**Interfaces:**
- Adds focused deterministic scripts to the alpha gate.

- [ ] **Step 1: Register deterministic tests**

Add these scripts near the existing UI preference and shell tests:

```js
'test-player-facing-information.mjs',
'test-quest-selection-ui-only.mjs',
'test-player-facing-route-contracts.mjs',
'test-player-facing-panel-contracts.mjs',
```

Do not add the live Playwright script to the deterministic alpha gate.

- [ ] **Step 2: Run focused suite**

```powershell
node tools/scripts/test-player-facing-information.mjs
node tools/scripts/test-runtime-ui-preferences.mjs
node tools/scripts/test-quest-selection-ui-only.mjs
node tools/scripts/test-player-facing-route-contracts.mjs
node tools/scripts/test-player-facing-panel-contracts.mjs
node tools/scripts/test-extension-shell.mjs
node tools/scripts/test-visual-system-foundation.mjs
```

Expected: all PASS.

- [ ] **Step 3: Run full alpha gate**

Run: `node tools/scripts/run-alpha-gate.mjs`

Expected: exit code 0 with every registered script passing.

- [ ] **Step 4: Run live Playwright gate**

Run:

```powershell
$env:DIRECTIVE_SILLYTAVERN_USER='directive-soak-a'
DIRECTIVE_SILLYTAVERN_USER=<dedicated-user> SILLYTAVERN_BASE_URL=<url> node tools/scripts/test-player-facing-ui-playwright.mjs --live
```

Expected: desktop and phone PASS with no canonical state mutation from quest selection.

- [ ] **Step 5: Inspect git diff and commit gate registration**

Run: `git diff --check`

Expected: no output.

```powershell
git add tools/scripts/run-alpha-gate.mjs
git commit -m "test: gate player information architecture"
```

## Completion Evidence

Implementation is complete only when:

- focused and alpha gates pass;
- Playwright passes against the installed extension copy on desktop and phone;
- quest selection changes only `system/ui-preferences.v1.json`;
- canonical state hash, campaign revision, mechanics revision, prompt revision, chat time, and provider-call count are unchanged after selection;
- screenshots show five routes, one Mission journal, contextual information in Crew/Ship, and closed advanced settings;
- no player-facing Intel, Log, permanent Recovery Console, or Mission subtabs remain.
