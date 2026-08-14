# Authoritative Gameplay Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show compact Directive-styled notifications for authoritative Mission, People, and Ship changes, with body dismissal and an explicit search-icon View action.

**Architecture:** A pure projection-delta module compares the certified player projection before and after successful accepted-pair settlement and emits grouped, deterministic notification records. Runtime publishes those records through the existing host UI message boundary; a separate browser notification center owns ephemeral queueing, timers, DOM, accessibility, routing, and cleanup without becoming campaign authority.

**Tech Stack:** JavaScript ES modules, Node `assert`, browser DOM, Playwright, CSS, existing Directive V1 projections and runtime actions.

## Global Constraints

- Notifications use only committed V1 player projections; assistant-generation output is never a notification source.
- No new model call, storage root, persisted notification history, unread badge, sound, or settings surface.
- Six seconds of active display time; hover or focus pauses and resumes the remaining time.
- The notification body dismisses; the separate View control dismisses and opens Mission, People, or Ship.
- Group Mission by mission ID, People by person ID, and Ship by task ID.
- Show at most three cards simultaneously and queue overflow in memory.
- Clear visible and queued notifications on chat change, save load, branch activation, extension disable, and test teardown.
- Initial load and authority reconstruction seed state without replaying historical notifications.
- Preserve unrelated workspace edits and never stage `debug.log`, `.codex-remote-attachments/`, or `docs/technical/STORY_DIRECTOR_TURN_FLOW.md`.

---

## File Structure

- Create `src/projection/v1/gameplay-notifications.mjs`: pure certified-projection comparison, grouping, priority, copy, and deterministic IDs.
- Create `src/ui/gameplay-notification-center.js`: queue, cards, timers, hover/focus pause, dismissal, View routing, host-message bridge, and cleanup.
- Create `assets/icons/directive-vector-glyphs-v1/icons/action-view.svg`: local mask glyph copied from the user-supplied search icon path.
- Modify `styles/directive.css`: vector-glyph mapping plus compact upper-center notification layout and animation.
- Modify `src/runtime/runtime-app.mjs`: capture before/after projections at accepted settlement, suppress replay emission, and publish host UI messages after persistence.
- Modify `src/hosts/sillytavern/bootstrap.js`: route host UI messages to the notification center.
- Modify `src/hosts/sillytavern/shell-events.js`: reset timers/queue during extension disable.
- Modify `tools/fixtures/expanded-interface-runtime-fixture.mjs`: expose deterministic notification examples for browser checks.
- Create `tools/scripts/test-v1-gameplay-notifications.mjs`: pure transition and suppression tests.
- Create `tools/scripts/test-gameplay-notification-center.mjs`: DOM, queue, timer, dismissal, navigation, and lifecycle tests.
- Create `tools/scripts/test-gameplay-notification-visual.mjs`: Playwright phone/desktop geometry, style, icon, interaction, and reduced-motion checks.
- Modify `tools/scripts/test-v1-runtime-app.mjs`: authoritative publication and replay-suppression integration coverage.
- Modify `tools/scripts/test-sillytavern-host-context.mjs`: UI message callback plumbing coverage.
- Modify `tools/scripts/run-alpha-gate.mjs`: include all new focused checks.

---

### Task 1: Pure Authoritative Projection Deltas

**Files:**
- Create: `src/projection/v1/gameplay-notifications.mjs`
- Create: `tools/scripts/test-v1-gameplay-notifications.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `deriveGameplayNotifications({ previousProjection, nextProjection })`, where both values are `directive.playerProjection.v1` or null.
- Produces: a frozen array of `{ id, route, subjectId, kind, title, summary, priority, sourceRevision }` records.

- [ ] **Step 1: Write failing projection-delta tests**

Create fixtures with exact Mission, People, and Ship projection kinds. Assert:

```js
assert.deepEqual(
  deriveGameplayNotifications({ previousProjection: before, nextProjection: objectiveAfter })
    .map(({ route, kind, subjectId }) => ({ route, kind, subjectId })),
  [{ route: 'mission', kind: 'objectiveComplete', subjectId: 'mission.alpha' }]
);
```

Cover these exact cases:

- non-terminal objective to terminal;
- final objective plus mission terminal collapses to `missionComplete`;
- two objectives group into one Mission notification;
- new person plus initial posture groups into `newContact`;
- posture, open-matter creation/change/resolution, and new moment group by person;
- public facts and unchanged/reworded evidence without a new projected relationship field do not notify;
- Ship phase completion produces `shipTaskProgress`;
- phase plus completed-history transition produces only `shipTaskComplete`;
- different Ship tasks remain separate;
- null previous projection, invalid projection kinds, removals, and identical projections return `[]`;
- IDs are stable for the same input and source revision.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node tools/scripts/test-v1-gameplay-notifications.mjs`

Expected: failure with `ERR_MODULE_NOT_FOUND` for `gameplay-notifications.mjs`.

- [ ] **Step 3: Implement strict projection validation and helpers**

Implement exact public exports:

```js
export const GAMEPLAY_NOTIFICATION_KINDS = Object.freeze({
  missionComplete: 'missionComplete',
  objectiveComplete: 'objectiveComplete',
  newContact: 'newContact',
  relationshipUpdated: 'relationshipUpdated',
  shipTaskComplete: 'shipTaskComplete',
  shipTaskProgress: 'shipTaskProgress'
});

export function deriveGameplayNotifications({
  previousProjection = null,
  nextProjection = null
} = {}) { /* pure comparison */ }
```

Require the composite, Mission, People, and Ship `kind` values before comparing. Return `[]` rather than throwing for missing or mismatched input so notification failure cannot affect settlement.

- [ ] **Step 4: Implement Mission grouping and suppression**

Index objectives by ID. Detect only `status !== 'terminal'` to `status === 'terminal'`. When `previous.mission.status !== 'terminal'` and `next.mission.status === 'terminal'`, return one `missionComplete` record and suppress objective records for that mission. Otherwise group all completed objective titles into one `objectiveComplete` record.

Use priority `100` for mission complete and `70` for objective complete.

- [ ] **Step 5: Implement People grouping**

Index `people.people` by stable person ID. A newly appearing ID produces `newContact` at priority `60`. For existing IDs, compare `relationshipPosture`, `relationshipOpenMatter`, and moment IDs. Group all changes for one person into one `relationshipUpdated` record at priority `50`. Do not inspect `publicRecord` or raw `peopleEvents`.

- [ ] **Step 6: Implement Ship task transitions**

Index `ship.cohesion.visibleTasks` and `completedHistory`. A task newly present in completed history and previously visible produces `shipTaskComplete` at priority `90`. Otherwise, newly completed phase IDs within a still-visible task produce `shipTaskProgress` at priority `40`. Suppress progress when completion occurs.

- [ ] **Step 7: Sort, freeze, and verify GREEN**

Sort descending by priority, then route, subject ID, and deterministic ID. Build IDs from route, kind, subject ID, next projection revision or completed record sequence, and changed stable IDs—not rendered prose.

Run: `node tools/scripts/test-v1-gameplay-notifications.mjs`

Expected: `Directive gameplay notification projection tests passed.`

- [ ] **Step 8: Register the test and commit**

Add `test-v1-gameplay-notifications.mjs` next to the projection tests in `run-alpha-gate.mjs`.

```powershell
git add src/projection/v1/gameplay-notifications.mjs tools/scripts/test-v1-gameplay-notifications.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(ui): derive gameplay notifications"
```

---

### Task 2: Compact Notification Center and Supplied Icon

**Files:**
- Create: `src/ui/gameplay-notification-center.js`
- Create: `assets/icons/directive-vector-glyphs-v1/icons/action-view.svg`
- Create: `tools/scripts/test-gameplay-notification-center.mjs`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: notification records from Task 1 and an optional route callback.
- Produces: `publishGameplayNotifications(records)`, `resetGameplayNotifications(reason)`, `handleGameplayNotificationUiMessage(message)`, and test hooks.

- [ ] **Step 1: Write failing notification-center tests**

Use the repository's lightweight fake DOM pattern and injected clock functions. Assert:

```js
publishGameplayNotifications([missionRecord]);
assert.equal(document.querySelectorAll('.directive-gameplay-notification').length, 1);
assert.equal(document.querySelector('.directive-gameplay-notification-view').getAttribute('aria-label'), 'View Mission');
```

Cover body dismissal, View routing, no nested buttons, three-visible overflow queue, duplicate-ID suppression, six-second timeout, remaining-time pause/resume on pointer enter/leave and focus/blur, reset cleanup, and notification host removal.

- [ ] **Step 2: Run focused center test and confirm RED**

Run: `node tools/scripts/test-gameplay-notification-center.mjs`

Expected: failure with `ERR_MODULE_NOT_FOUND` for `gameplay-notification-center.js`.

- [ ] **Step 3: Add the supplied search icon as an owned mask glyph**

Create `action-view.svg` with the supplied `viewBox="0 0 32 32"` and exact path:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <path d="M27 24.57l-5.647-5.648a8.895 8.895 0 0 0 1.522-4.984C22.875 9.01 18.867 5 13.938 5 9.01 5 5 9.01 5 13.938c0 4.929 4.01 8.938 8.938 8.938a8.887 8.887 0 0 0 4.984-1.522L24.568 27 27 24.57zm-13.062-4.445a6.194 6.194 0 0 1-6.188-6.188 6.195 6.195 0 0 1 6.188-6.188 6.195 6.195 0 0 1 6.188 6.188 6.195 6.195 0 0 1-6.188 6.188z"/>
</svg>
```

Add `.directive-vector-glyph[data-glyph="action-view"]` to the existing mask mapping in `directive.css`.

- [ ] **Step 4: Implement the ephemeral center**

Use module-local `visible`, `queued`, and `knownIds` state. Append one `#directive-gameplay-notifications` host through `appendDirectiveOverlay`. Give the host `role="region"`, `aria-label="Directive notifications"`, and a nested `aria-live="polite"` status list.

Expose:

```js
export function publishGameplayNotifications(records = [], { onView = defaultViewRoute } = {})
export function resetGameplayNotifications(reason = 'reset')
export function handleGameplayNotificationUiMessage(message = {})
```

The default View route awaits `runRuntimeAction('runtime.show')` followed by `runRuntimeAction('runtime.setTab', { tabId: record.route })`.

- [ ] **Step 5: Implement timers and interactions**

Track `remainingMs`, `startedAt`, and `timerId` per visible card. Start at `6000`. Pause on card `pointerenter` and View-button `focus`; resume on `pointerleave` and `blur`. The broad `.directive-gameplay-notification-dismiss` button dismisses without navigation. The sibling `.directive-gameplay-notification-view` button dismisses first, then invokes View.

Never move focus when a card appears. On removal, clear its timer, add the exit class, remove after the animation duration, delete its ID, and admit queued records.

- [ ] **Step 6: Add compact Directive styling**

Add fixed upper-center styles with:

```css
.directive-gameplay-notifications {
  position: fixed;
  top: max(12px, env(safe-area-inset-top, 0px));
  left: 50%;
  z-index: 100160;
  width: min(340px, calc(100vw - 24px));
  transform: translateX(-50%);
  pointer-events: none;
}
```

Use a dark `#0d1018` surface, 1px route-colored border, 4px LCARS route rail, `Roboto Condensed` headings, Mission amber, People lilac, Ship blue, and a 44px View target. At `max-width: 360px`, hide only the visible View text. Add focus-visible outlines and reduced-motion rules.

- [ ] **Step 7: Run focused tests and commit**

Run: `node tools/scripts/test-gameplay-notification-center.mjs`

Expected: `Directive gameplay notification center tests passed.`

Register the test in `run-alpha-gate.mjs`, then:

```powershell
git add src/ui/gameplay-notification-center.js assets/icons/directive-vector-glyphs-v1/icons/action-view.svg styles/directive.css tools/scripts/test-gameplay-notification-center.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(ui): add gameplay notification center"
```

---

### Task 3: Authoritative Runtime Publication and Lifecycle

**Files:**
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/hosts/sillytavern/bootstrap.js`
- Modify: `src/hosts/sillytavern/shell-events.js`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Modify: `tools/scripts/test-sillytavern-host-context.mjs`

**Interfaces:**
- Consumes: `deriveGameplayNotifications` and `handleGameplayNotificationUiMessage` from Tasks 1–2.
- Produces: host UI messages of kind `directive.gameplayNotifications.publish.v1` and `directive.gameplayNotifications.reset.v1`.

- [ ] **Step 1: Write failing runtime publication tests**

Extend the fake host UI recorder in `test-v1-runtime-app.mjs`. Capture the projection before accepted settlement, settle one pair whose objective becomes terminal, and assert exactly one message:

```js
assert.equal(uiMessages.at(-1).type, 'directive.gameplayNotifications.publish.v1');
assert.equal(uiMessages.at(-1).payload.records[0].kind, 'objectiveComplete');
```

Assert no publish message for persistence failure, already-settled retry, accepted-state rebuild, edit/swipe/delete invalidation, initial load, or chat switch. Assert chat switch emits one reset message.

- [ ] **Step 2: Run focused runtime tests and confirm RED**

Run: `node tools/scripts/test-v1-runtime-app.mjs`

Expected: assertion failure because no gameplay-notification host UI messages exist.

- [ ] **Step 3: Add projection capture and publication to settlement**

Import `deriveGameplayNotifications`. At the start of `settleSnapshot`, clone the valid prior projection. Extend options to:

```js
async function settleSnapshot(snapshot, ingressId = null, {
  syncPromptAfter = true,
  publishNotifications = true
} = {})
```

After `mission.ok === true`, pending episode review, persistence, and final projection derivation, compare prior and next projections. Call:

```js
host.ui?.send?.({
  type: 'directive.gameplayNotifications.publish.v1',
  payload: { records: clone(records) }
});
```

Only send when `records.length > 0`. Include the records in the returned settlement envelope for diagnostics.

- [ ] **Step 4: Suppress rebuilds and reset lifecycle**

Pass `{ syncPromptAfter: false, publishNotifications: false }` from `rebuildAcceptedStateFromChat`. At the start of a real `handleHostChatChanged`, send `directive.gameplayNotifications.reset.v1`; do not publish from invalidation or replay.

In `shell-events.js`, call `resetGameplayNotifications('extension-disabled')` before closing Directive overlays.

- [ ] **Step 5: Connect SillyTavern UI messages**

In `bootstrap.js`, construct the host with:

```js
const host = createSillyTavernDirectiveHost({
  context: ctx,
  ui: { send: handleGameplayNotificationUiMessage }
});
```

`handleGameplayNotificationUiMessage` publishes or resets the center and requests `refreshRuntimeSafely()` after a publish so an already-open Directive page reflects the same committed state. It must catch refresh/navigation errors and log without affecting settlement.

- [ ] **Step 6: Verify host callback plumbing**

Extend `test-sillytavern-host-context.mjs` with a supplied `ui.send` spy. Assert a cloned message reaches the callback exactly once and `host.ui.messages()` retains the same message for diagnostics.

Run:

```powershell
node tools/scripts/test-v1-runtime-app.mjs
node tools/scripts/test-sillytavern-host-context.mjs
node tools/scripts/test-sillytavern-event-wiring.mjs
```

Expected: all three scripts pass.

- [ ] **Step 7: Commit runtime integration**

```powershell
git add src/runtime/runtime-app.mjs src/hosts/sillytavern/bootstrap.js src/hosts/sillytavern/shell-events.js tools/scripts/test-v1-runtime-app.mjs tools/scripts/test-sillytavern-host-context.mjs
git commit -m "feat(runtime): publish committed notifications"
```

---

### Task 4: Browser Geometry and Interaction Proof

**Files:**
- Modify: `tools/fixtures/expanded-interface-runtime-fixture.mjs`
- Create: `tools/scripts/test-gameplay-notification-visual.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: notification center public API and the production fixture's route actions.
- Produces: deterministic fixture hooks `__directiveShowGameplayNotifications(records)` and `__directiveResetGameplayNotifications()`.

- [ ] **Step 1: Write failing Playwright checks**

Serve the existing expanded-interface fixture. On 1280×800 and 390×844 viewports, publish Mission, People, and Ship records and assert:

```js
const box = await page.locator('.directive-gameplay-notification').first().boundingBox();
assert.ok(box.width <= 340);
assert.ok(Math.abs((box.x + box.width / 2) - (viewport.width / 2)) <= 2);
assert.ok(box.y >= 12 && box.y <= 40);
```

Also assert three visible cards, route accent classes, a rendered `action-view` glyph, 44px View target, View text hidden only at 360px and below, body dismissal, View opening the correct route, and reduced-motion transform removal.

- [ ] **Step 2: Run visual test and confirm RED**

Run: `node tools/scripts/test-gameplay-notification-visual.mjs`

Expected: failure because fixture notification hooks are absent.

- [ ] **Step 3: Add fixture hooks using production code**

Import `publishGameplayNotifications` and `resetGameplayNotifications`. Expose:

```js
globalThis.__directiveShowGameplayNotifications = (records) => (
  publishGameplayNotifications(records, {
    onView: async ({ route }) => globalThis.__directiveFixtureSetRoute(route)
  })
);
globalThis.__directiveResetGameplayNotifications = () => resetGameplayNotifications('fixture-reset');
```

Do not add fixture-only notification markup or CSS.

- [ ] **Step 4: Verify GREEN and register the check**

Run: `node tools/scripts/test-gameplay-notification-visual.mjs`

Expected: `Directive gameplay notification visual tests passed.`

Register it adjacent to other expanded-interface visual checks in `run-alpha-gate.mjs`.

- [ ] **Step 5: Commit browser proof**

```powershell
git add tools/fixtures/expanded-interface-runtime-fixture.mjs tools/scripts/test-gameplay-notification-visual.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "test(ui): prove gameplay notifications"
```

---

### Task 5: Full Verification, Installed Proof, and Main Publication

**Files:**
- Verify all files changed by Tasks 1–4.
- Do not modify unrelated dirty files in the original checkout.

**Interfaces:**
- Consumes: completed implementation and tests.
- Produces: verified commits on remote `main` and source/install evidence.

- [ ] **Step 1: Run focused notification checks**

```powershell
node tools/scripts/test-v1-gameplay-notifications.mjs
node tools/scripts/test-gameplay-notification-center.mjs
node tools/scripts/test-v1-runtime-app.mjs
node tools/scripts/test-sillytavern-host-context.mjs
node tools/scripts/test-sillytavern-event-wiring.mjs
node tools/scripts/test-gameplay-notification-visual.mjs
```

Expected: all focused scripts pass.

- [ ] **Step 2: Run repository verification**

Run: `npm.cmd test`

Expected: alpha gate exits `0` with all registered checks passing.

- [ ] **Step 3: Audit the diff and asset**

```powershell
git diff --check origin/main...HEAD
git status --short
Get-FileHash assets/icons/directive-vector-glyphs-v1/icons/action-view.svg -Algorithm SHA256
```

Expected: no whitespace errors; only intentional feature files differ; icon hash is recorded.

- [ ] **Step 4: Reconcile the latest remote main**

Fetch through the GitHub-authorized network path, inspect `origin/main`, and merge it into the feature branch. Resolve only notification-feature conflicts and rerun the six focused checks plus `npm.cmd test` if the remote SHA changed.

- [ ] **Step 5: Install into the configured Directive SillyTavern soak instance**

Copy the verified source tree into the existing Directive soak extension path while excluding `.git`, `node_modules`, artifacts, temporary files, and `debug.log`. Confirm source/install hashes for every notification runtime, style, and icon file.

- [ ] **Step 6: Perform real SillyTavern interaction proof**

In the installed browser session, trigger or fixture-drive one event per domain and record screenshots showing:

- Objective complete;
- New contact or significant relationship update;
- Ship task progress;
- Ship task complete;
- body dismissal;
- View opening Mission, People, and Ship;
- six-second timeout; and
- mobile upper-center geometry.

No campaign state or live player data may be mutated merely to fabricate proof; use the repository fixture when a safe authoritative live event is unavailable.

- [ ] **Step 7: Review, commit any verification-only correction, and push main**

If verification required a correction, rerun its focused RED/GREEN test and commit with a terse conventional message. Push the reconciled feature HEAD to remote `main` without force:

```powershell
git push origin HEAD:main
```

- [ ] **Step 8: Verify remote exact SHA**

Use GitHub CLI with network permission enabled:

```powershell
$localSha = git rev-parse HEAD
$remoteSha = gh api repos/{owner}/{repo}/commits/main --jq '.sha'
if ($localSha -ne $remoteSha) { throw "Remote main does not match verified local HEAD" }
```

Report source tests, installed proof, remote SHA, and any preserved unrelated original-checkout changes separately.
