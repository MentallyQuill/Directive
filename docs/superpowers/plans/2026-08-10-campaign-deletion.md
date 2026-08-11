# Campaign Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an exact-binding, typed-confirmation campaign deletion flow that removes the owned SillyTavern character and all chats, then removes the campaign's V1 saves and returns to the Ashes library.

**Architecture:** The controller prepares and commits local campaign deletion around an immutable exact target. The SillyTavern adapter owns host-native character deletion. The runtime app orders host deletion before local commit, while a focused modal owns confirmation, busy/error states, and post-success Campaigns-page selection.

**Tech Stack:** JavaScript ES modules, Node.js assertion scripts, SillyTavern host APIs, Directive modal root, LCARS CSS, Playwright layout probes.

## Global Constraints

- Use only exact V1 `campaignChatBinding` ownership; add no legacy support, migration, or inference.
- Delete the character with SillyTavern's exported `deleteCharacter` function and `{ deleteChats: true }`.
- Do not remove Directive saves when host deletion fails.
- Require case-insensitive, trimmed `delete` before enabling the destructive button.
- Keep Directive open and select the Ashes of Peace library entry after complete success.
- Preserve unrelated saves, drafts, user data, and current Campaign Library behavior.

---

### Task 1: Exact Campaign Deletion Target And Local Commit

**Files:**
- Modify: `src/runtime/campaign-start-controller.mjs`
- Test: `tools/scripts/test-runtime-campaign-start-controller.mjs`

**Interfaces:**
- Produces: `controller.prepareCampaignDeletion({ campaignId, saveId? }) -> { campaignId, saveId, checkpointIds, campaignChatBinding }`
- Produces: `controller.deleteCampaign({ campaignId, saveId }) -> { deleted, campaignId, saveId, checkpointIds }`
- Produces: campaign view entries with `characterName` read from each active save's exact stored binding.
- Consumers: Task 3 runtime orchestration.

- [ ] **Step 1: Write the failing controller tests**

Add tests after campaign creation that bind an exact character, create two checkpoints, and assert the prepared target uses literal V1 ownership:

```js
const deletionTarget = await controller.prepareCampaignDeletion({ campaignId: campaign.firstSave.campaignId });
assert.equal(deletionTarget.saveId, campaign.firstSave.id);
assert.deepEqual(deletionTarget.checkpointIds, [checkpointA.id, checkpointB.id]);
assert.deepEqual(deletionTarget.campaignChatBinding, {
  kind: 'directive.campaignChatBinding.v1',
  version: 1,
  hostId: 'sillytavern',
  chatId: 'Ren Okada - Ashes of Peace',
  campaignId: campaign.firstSave.campaignId,
  saveId: campaign.firstSave.id,
  status: 'bound',
  entityType: 'character',
  entityId: '0',
  entityName: 'Ren Okada - Ashes of Peace'
});
```

Add negative tests for a missing/incomplete binding and a wrong campaign ID. Add a commit test that proves both checkpoints and the active save disappear, active controller state becomes null, and an unrelated seeded save summary is untouched.

- [ ] **Step 2: Run the controller test and verify RED**

Run: `node tools/scripts/test-runtime-campaign-start-controller.mjs`

Expected: FAIL because `prepareCampaignDeletion` and `deleteCampaign` do not exist.

- [ ] **Step 3: Implement exact preparation and local deletion**

In `createCampaignStartController`, load the selected active save and validate its binding without fallback:

```js
async function prepareCampaignDeletion({ campaignId, saveId = null } = {}) {
  const saves = await listV1CampaignSaves(adapter);
  const summary = saves.find((candidate) => (
    candidate.slotType === 'active'
    && candidate.campaignId === required(campaignId, 'campaignId')
    && (!saveId || candidate.id === saveId)
  ));
  if (!summary) throw campaignDeletionError('DIRECTIVE_CAMPAIGN_DELETE_TARGET_NOT_FOUND', 'The selected V1 campaign was not found.');
  const save = await loadV1CampaignSave(adapter, summary.id);
  const binding = clone(save.state?.campaignChatBinding);
  if (binding?.entityType !== 'character' || !binding.entityId || !binding.entityName) {
    throw campaignDeletionError('DIRECTIVE_CAMPAIGN_DELETE_CHARACTER_REQUIRED', 'The selected campaign has no exact SillyTavern character binding.');
  }
  return {
    campaignId: save.campaignId,
    saveId: save.id,
    checkpointIds: saves.filter((candidate) => candidate.slotType === 'checkpoint'
      && candidate.campaignId === save.campaignId
      && candidate.parentSaveId === save.id).map((candidate) => candidate.id),
    campaignChatBinding: binding
  };
}
```

`deleteCampaign` must prepare again, reject a changed target, delete checkpoints before the active save using `deleteV1CampaignSave`, then clear `activeSave` and `activeState` only when the deleted save is current.

Update `getCampaignView()` to load each indexed active save with `loadV1CampaignSave` before building campaign summaries. `campaignSummaryFromSave` must read `characterName` from `save.state.campaignChatBinding.entityName`; do not use the globally current runtime state or an index-name fallback. Checkpoints may remain index summaries.

- [ ] **Step 4: Run the controller test and verify GREEN**

Run: `node tools/scripts/test-runtime-campaign-start-controller.mjs`

Expected: `PASS V1 campaign controller`.

- [ ] **Step 5: Commit the controller slice**

```powershell
git add src/runtime/campaign-start-controller.mjs tools/scripts/test-runtime-campaign-start-controller.mjs
git commit -m "feat(campaign): add exact deletion target"
```

### Task 2: SillyTavern Character And Chat Deletion

**Files:**
- Modify: `src/hosts/host-contract.mjs`
- Modify: `src/hosts/fake/fake-host.mjs`
- Modify: `src/hosts/sillytavern/chat-adapter.mjs`
- Test: `tools/scripts/test-host-contract-fake.mjs`
- Test: `tools/scripts/test-sillytavern-checkpoint-chat.mjs`

**Interfaces:**
- Consumes: exact `campaignChatBinding` returned by Task 1.
- Produces: optional host method `host.chat.deleteCampaignCharacter(binding) -> { deleted, entityId, entityName }`.
- Consumers: Task 3 runtime orchestration.

- [ ] **Step 1: Write failing adapter tests**

Inject a complete `scriptModule` into the existing SillyTavern adapter test:

```js
const deletedCharacters = [];
const scriptModule = {
  async deleteCharacter(avatar, options) {
    deletedCharacters.push({ avatar, options });
    return true;
  }
};
```

Assert that `deleteCampaignCharacter(exactBinding)` records:

```js
assert.deepEqual(deletedCharacters, [{
  avatar: 'directive.png',
  options: { deleteChats: true }
}]);
```

Also assert rejection for group bindings, missing IDs, mismatched IDs, missing host deletion API, and a false host result. Update the fake-host test to prove its deletion call is observable and removes every fake chat owned by the character.

- [ ] **Step 2: Run adapter tests and verify RED**

Run: `node tools/scripts/test-sillytavern-checkpoint-chat.mjs`

Run: `node tools/scripts/test-host-contract-fake.mjs`

Expected: FAIL because `deleteCampaignCharacter` is absent.

- [ ] **Step 3: Implement the host-native adapter operation**

Resolve only the requested entity through `characterForEntity`, verify the resolved character matches `entityId`, load `scriptModule`/`importScript`/`/script.js`, and call:

```js
const deleted = await script.deleteCharacter(target.character.avatar, { deleteChats: true });
if (deleted !== true) {
  const error = new Error(`SillyTavern could not delete character "${binding.entityName}".`);
  error.code = 'DIRECTIVE_CAMPAIGN_CHARACTER_DELETE_FAILED';
  throw error;
}
await refreshCharacters(ctx);
return { deleted: true, entityId: String(binding.entityId), entityName: binding.entityName };
```

Expose the method from the adapter and fake. Add it as an optional checked method in `assertDirectiveChatAdapter`.

- [ ] **Step 4: Run adapter tests and verify GREEN**

Run both commands from Step 2.

Expected: both scripts pass.

- [ ] **Step 5: Commit the adapter slice**

```powershell
git add src/hosts/host-contract.mjs src/hosts/fake/fake-host.mjs src/hosts/sillytavern/chat-adapter.mjs tools/scripts/test-host-contract-fake.mjs tools/scripts/test-sillytavern-checkpoint-chat.mjs
git commit -m "feat(host): delete campaign character and chats"
```

### Task 3: Failure-Ordered Runtime Orchestration

**Files:**
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/runtime-shell.js`
- Test: `tools/scripts/test-v1-runtime-app.mjs`

**Interfaces:**
- Consumes: `prepareCampaignDeletion`, `deleteCampaign`, and `host.chat.deleteCampaignCharacter` from Tasks 1-2.
- Produces: `runtimeApp.deleteCampaign({ campaignId, saveId? }) -> { result, hostDeletion, view }`.
- Produces: Campaign UI action `actions.deleteCampaign(options)`.

- [ ] **Step 1: Write failing runtime tests**

Add a successful deletion test after the bound campaign exists:

```js
const deletion = await app.deleteCampaign({ campaignId: missionView.campaignState.campaign.id });
assert.equal(deletion.hostDeletion.deleted, true);
assert.equal(deletion.view.campaignIndex.campaigns.length, 0);
assert.equal(deletion.view.activeSaveId, null);
assert.equal(deletion.view.campaignState, null);
```

Create a separate app fixture whose `deleteCampaignCharacter` throws. Assert the rejection code/message and then prove `getCurrentView({ tabId: 'campaign' })` still contains the campaign and every checkpoint.

- [ ] **Step 2: Run the runtime test and verify RED**

Run: `node tools/scripts/test-v1-runtime-app.mjs`

Expected: FAIL because `app.deleteCampaign` is absent.

- [ ] **Step 3: Implement host-first orchestration**

Add:

```js
async deleteCampaign({ campaignId, saveId = null } = {}) {
  await ensureInitialized();
  const target = await controller.prepareCampaignDeletion({ campaignId, saveId });
  if (typeof host.chat.deleteCampaignCharacter !== 'function') {
    throw codedError('DIRECTIVE_CAMPAIGN_CHARACTER_DELETE_UNAVAILABLE', 'SillyTavern character deletion is unavailable.');
  }
  const hostDeletion = await host.chat.deleteCampaignCharacter(target.campaignChatBinding);
  const result = await controller.deleteCampaign({ campaignId: target.campaignId, saveId: target.saveId });
  setState(null);
  configureStateRuntime();
  activeScreen = 'campaign';
  await restoreNarrationPreset();
  await host.prompt.clear?.({ reason: 'campaign-deleted' });
  return { result: clone(result), hostDeletion: clone(hostDeletion), view: await campaignViewEnvelope('campaign') };
}
```

Wire `deleteCampaign` through `createRuntimeActions` without route navigation.

- [ ] **Step 4: Run the runtime test and verify GREEN**

Run: `node tools/scripts/test-v1-runtime-app.mjs`

Expected: `PASS V1 runtime app`.

- [ ] **Step 5: Commit the runtime slice**

```powershell
git add src/runtime/runtime-app.mjs src/runtime/runtime-shell.js tools/scripts/test-v1-runtime-app.mjs
git commit -m "feat(runtime): orchestrate campaign deletion"
```

### Task 4: Typed Confirmation UI And Responsive Layout

**Files:**
- Create: `src/ui/campaign-delete-dialog.js`
- Modify: `src/ui/campaign-panel.js`
- Modify: `src/ui/view-models/certified-campaign-view.mjs`
- Modify: `styles/directive.css`
- Create: `tools/scripts/test-campaign-delete-dialog.mjs`
- Modify: `tools/scripts/test-certified-campaign-view.mjs`
- Modify: `tools/scripts/test-certified-campaign-panel.mjs`
- Create: `tools/scripts/test-campaign-delete-layout.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `campaign.characterName`, `campaign.id`, `campaign.activeTimeline.saveId`, and `actions.deleteCampaign`.
- Produces: `createCampaignDeleteDialog({ campaign, opener, onDelete })` with `close`, `isOpen`, and test-visible elements.
- Produces: Delete button immediately after Continue and post-success selection of `package:${ASHES_V1_PACKAGE_ID}`.

- [ ] **Step 1: Write failing view/panel/dialog tests**

The view fixture must include `characterName` on the controller-provided campaign entry and assert it is cloned without mutation or fallback.

In the panel test, assert the action labels are `['Continue', 'Delete', 'Save checkpoint']` and clicking Delete mounts `[data-campaign-delete-modal]` under `#directive-modal-root`.

In the dialog test, use `installFakeDom()` and assert:

```js
assert.match(dialog.dialog.textContent, /Ren Okada - Ashes of Peace/);
assert.match(dialog.dialog.textContent, /all of its chats/i);
assert.equal(dialog.deleteButton.disabled, true);
dialog.input.value = '  DeLeTe  ';
await dialog.input.dispatch('input');
assert.equal(dialog.deleteButton.disabled, false);
```

Also prove wrong text remains disabled, Escape/Cancel remove the modal without invoking `onDelete`, busy state blocks dismissal, success closes, and rejection renders a `role="alert"` while re-enabling controls.

- [ ] **Step 2: Run focused UI tests and verify RED**

Run:

```powershell
node tools/scripts/test-certified-campaign-view.mjs
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-campaign-delete-dialog.mjs
```

Expected: view/panel assertions fail and the new dialog test cannot import its module.

- [ ] **Step 3: Implement the modal and panel integration**

Build the dialog through `appendDirectiveModal`. Set the runtime shell inert, create a labeled input with `autocomplete="off"`, and update the button from the normalized input:

```js
const confirmed = () => input.value.trim().toLowerCase() === 'delete';
input.addEventListener('input', () => {
  deleteButton.disabled = busy || !confirmed();
});
```

On success, close the dialog, assign `selectedRecordKey = `package:${ASHES_V1_PACKAGE_ID}``, and call `actions.refresh()`. Do not use `runAndRefresh`, because selection must change before the refreshed render.

Preserve the controller-provided `characterName` through `buildCertifiedCampaignView`; do not derive it from title, player name, current host selection, or another global view field.

- [ ] **Step 4: Add responsive CSS and browser layout test**

Reuse the certified modal visual grammar with campaign-specific classes. The overlay is fixed, opaque enough to dim Directive, and the dialog is bounded by `calc(100vw - 28px)` and `calc(100dvh - 28px)`. The action row stays flex ordered Continue/Delete/Save.

The Playwright test must render representative desktop (1280x800) and phone (390x844) markup, then assert:

```js
assert.ok(metrics.overlay.backgroundColor !== 'rgba(0, 0, 0, 0)');
assert.ok(metrics.dialog.width <= viewport.width - 20);
assert.ok(metrics.dialog.height <= viewport.height - 20);
assert.deepEqual(metrics.actionLabels.slice(0, 2), ['Continue', 'Delete']);
assert.equal(metrics.deleteDisabled, false);
```

Register both new test scripts in `run-alpha-gate.mjs`.

- [ ] **Step 5: Run focused UI tests and verify GREEN**

Run all four focused scripts, including `node tools/scripts/test-campaign-delete-layout.mjs`.

Expected: all pass without warnings.

- [ ] **Step 6: Commit the UI slice**

```powershell
git add src/ui/campaign-delete-dialog.js src/ui/campaign-panel.js src/ui/view-models/certified-campaign-view.mjs styles/directive.css tools/scripts/test-campaign-delete-dialog.mjs tools/scripts/test-certified-campaign-view.mjs tools/scripts/test-certified-campaign-panel.mjs tools/scripts/test-campaign-delete-layout.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(ui): confirm campaign deletion"
```

### Task 5: Full Verification And Integration

**Files:**
- Verify all modified files and approved design requirements.

**Interfaces:**
- Consumes: complete feature from Tasks 1-4.
- Produces: a verified feature branch ready to merge into `main`.

- [ ] **Step 1: Run static and diff checks**

Run:

```powershell
git diff --check main...HEAD
git status --short
```

Expected: no whitespace errors and only intentional changes.

- [ ] **Step 2: Run the complete test gate**

Run: `npm.cmd test`

Expected: exit 0 with every focused check passing.

- [ ] **Step 3: Review requirements against the diff**

Confirm every Verification bullet in `docs/superpowers/specs/2026-08-10-campaign-deletion-design.md` has a passing test or direct diff evidence. Confirm no legacy or unrelated architecture was added.

- [ ] **Step 4: Merge and verify on main**

From `F:\git\Directive`, update `main`, merge `codex/campaign-deletion`, rerun `npm.cmd test`, and confirm the merged SHA.

- [ ] **Step 5: Push and verify the remote**

Push `main` to `origin`, then use GitHub CLI with network permission to confirm `origin/main` matches local `HEAD`.
