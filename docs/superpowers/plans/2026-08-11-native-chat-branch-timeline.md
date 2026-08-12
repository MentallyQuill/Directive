# Native Chat Branch Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a native SillyTavern branch from the exact active Directive campaign chat become a safe playable timeline, with the previous timeline automatically preserved as a named saved game and reusable through Save Game and Load Game.

**Architecture:** A host adapter proves the native branch and returns an exact transcript lineage. A pure reconstruction service invalidates discarded accepted sources in an isolated state gateway, rebinds custody to a new save/chat identity, and validates the full V1 projection. A journaled timeline transaction persists the parent checkpoint and child save, writes child metadata, compare-and-swaps the active pointer, and resumes safely after interruption.

**Tech Stack:** JavaScript ES modules, Node.js assertion scripts, SillyTavern extension APIs, Directive V1 storage/state contracts, fake-host integration fixtures.

## Global Constraints

- Only a branch from the exact active Directive campaign chat is converted.
- `chat_metadata.main_chat` is only a candidate signal; exact entity, parent `extra.branches`, transcript, swipe, message ID, and text-hash proof are required.
- No full state snapshot is written per message and no model call is repeated during branch reconstruction.
- The parent saved game is immutable and persisted before the child becomes active.
- `index.activeSaveId` compare-and-swap is the semantic commit point.
- Generation remains unbound while custody is incomplete or unprovable.
- Existing V1 saves and checkpoints remain readable; no legacy import, migration, or compatibility hydration is added.
- Use `npm.cmd test` on Windows for the final gate.

---

### Task 1: Prove native SillyTavern branch lineage

**Files:**
- Create: `src/runtime/native-branch-lineage.mjs`
- Modify: `src/hosts/host-contract.mjs`
- Modify: `src/hosts/sillytavern/chat-adapter.mjs`
- Modify: `src/hosts/fake/fake-host.mjs`
- Create: `tools/scripts/test-native-branch-lineage.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `inspectNativeBranchCandidate({ parentBinding }) -> Promise<{ ok, reasonCode, parentBinding, childBinding, parentMessages, childMessages, endpointHostMessageId, lineageHash }>`.
- Produces: `createNativeBranchLineage({ parentBinding, childBinding, parentMessages, childMessages, parentBranchNames })` as a pure validator.

- [ ] **Step 1: Write the failing lineage tests**

Cover an exact assistant endpoint, exact player endpoint, selected swipe, bookmark metadata without `extra.branches`, renamed `Branch #1`, different entity, copied chat, mutated text, missing parent, and unrelated chat.

```js
const exact = createNativeBranchLineage({
  parentBinding,
  childBinding: { chatId: 'renamed-child', mainChat: parentBinding.chatId },
  parentMessages,
  childMessages: parentMessages.slice(0, 3),
  parentBranchNames: ['renamed-child']
});
assert.equal(exact.ok, true);
assert.equal(exact.endpointHostMessageId, 'assistant.2');
assert.match(exact.lineageHash, /^[0-9a-f]{8}$/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-native-branch-lineage.mjs`
Expected: FAIL because `native-branch-lineage.mjs` does not exist.

- [ ] **Step 3: Implement normalized lineage hashing and host inspection**

Normalize each retained message to role, stable host ID, selected swipe ID, and selected text hash. Ignore filenames as semantics. In the SillyTavern adapter, load the exact parent snapshot, read the current child metadata/transcript, verify the same character entity, and require the child name in the endpoint parent's `extra.branches`.

```js
export function createNativeBranchLineage(input = {}) {
  // return a closed result object; throw only for programmer misuse
  return proofFailed ? { ok: false, reasonCode } : {
    ok: true,
    endpointHostMessageId,
    lineageHash: stableHash(normalizedChild)
  };
}
```

- [ ] **Step 4: Extend the fake host with native branch fixtures**

Add `createNativeBranch({ parentChatId, endpointIndex, childChatId, swipeId })`, raw chat metadata access, exact chat snapshots, and `inspectNativeBranchCandidate` calls so runtime tests do not depend on SillyTavern internals.

- [ ] **Step 5: Run focused tests and commit**

Run: `node tools/scripts/test-native-branch-lineage.mjs`
Expected: PASS.

Commit: `feat(chat): prove native branch lineage`

### Task 2: Reconstruct child authority without model work

**Files:**
- Create: `src/runtime/v1-branch-reconstruction.mjs`
- Modify: `src/command/v1-command-bearing.mjs`
- Create: `tools/scripts/test-v1-branch-reconstruction.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: exact normalized child messages and `lineageHash` from Task 1.
- Produces: `reconstructV1BranchState({ parentState, childMessages, parentMessages, targetSaveId, targetChatBinding, runtimeAssets, now }) -> Promise<{ campaignState, discardedHostMessageIds, retainedSourceCount, lineageHash }>`.
- Produces: `rebuildV1CommandBearingForLineage(commandBearing, { retainedMessageIds, completedObjectiveIds, now })`.

- [ ] **Step 1: Write clean-lineage equivalence tests**

Build parent fixtures containing mission evidence, Story Settlement receipts/episodes, time entries, Command Bearing awards/spends, and a later mission transition. Branch before and after each boundary. Normalize custody fields and assert reconstructed state equals a fixture settled only through the retained lineage.

```js
const child = await reconstructV1BranchState({
  parentState,
  parentMessages,
  childMessages: parentMessages.slice(0, endpoint + 1),
  targetSaveId: 'save.child',
  targetChatBinding: { ...parentBinding, saveId: 'save.child', chatId: 'chat.child' },
  runtimeAssets,
  now
});
assert.deepEqual(normalizeCustody(child.campaignState), cleanRetainedState);
assert.equal(modelCalls, 0);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-v1-branch-reconstruction.mjs`
Expected: FAIL because the reconstruction service does not exist.

- [ ] **Step 3: Implement isolated deterministic invalidation**

Create a cloned state plus `createStateDeltaGateway({ getState, setState })` with no persistence callback. For each parent message absent from the exact child transcript, invoke mission/Story Settlement invalidation and time invalidation against the transient gateway. Never call the generation interpreter or episode evaluator.

- [ ] **Step 4: Rebuild Command Bearing and rebind custody**

Recompute credited awards from objectives completed in surviving current/history mission states. Retain committed/armed spends only when all their message anchors survive and hashes match; refund unsafe or unanchored pending spends. Recursively rebind only exact `branchId`, `saveId`, and `chatId` custody fields from parent to child, then install the exact child `campaignChatBinding`.

- [ ] **Step 5: Validate the child completely**

Require `assertV1CampaignState`, active package/mission resolution, Story Settlement validation, Command Bearing validation, retained source resolution, and `buildV1RuntimePlayerProjection({ campaignState, runtimeAssets })` success.

- [ ] **Step 6: Run focused tests and commit**

Run: `node tools/scripts/test-v1-branch-reconstruction.mjs`
Expected: PASS with zero model calls.

Commit: `feat(state): reconstruct branched timelines`

### Task 3: Add journaled timeline storage and active-pointer CAS

**Files:**
- Modify: `src/storage/v1-storage-repository.mjs`
- Create: `src/runtime/timeline-operation-journal.mjs`
- Modify: `src/runtime/campaign-start-controller.mjs`
- Modify: `src/campaign/campaign-start-service.mjs`
- Create: `tools/scripts/test-v1-timeline-storage.mjs`
- Modify: `tools/scripts/test-v1-storage-repository.mjs`
- Modify: `tools/scripts/test-runtime-campaign-start-controller.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `V1_STORAGE_PATHS.timelineOperation(campaignId)`.
- Produces: `compareAndSwapActiveV1CampaignSave(adapter, { expectedSaveId, nextSaveId, now })`.
- Produces controller methods `prepareTimelineCheckpoint`, `persistInactiveTimeline`, `activatePersistedTimeline`, `renameSavedGame`, `retireSupersededTimeline`, and `recoverTimelineOperation`.

- [ ] **Step 1: Write failing repository and controller tests**

Assert expected-active mismatch refuses the swap, inactive child persistence does not change the pointer, parent checkpoint is immutable, rename affects only its record label, campaign deletion includes all same-campaign saved games, and journal reads/writes/deletes are exact and idempotent.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node tools/scripts/test-v1-timeline-storage.mjs`
Expected: FAIL on missing CAS/journal exports.

- [ ] **Step 3: Implement fixed-path operation journals**

Use `v1/operations/{campaignId}.timeline.v1.json` with kind, version, operationId, stage, parent/child/checkpoint IDs and bindings, lineage hash, created/updated timestamps, and error diagnostics. Reject unknown kinds/versions/stages.

- [ ] **Step 4: Implement inactive persistence and pointer CAS**

Persist an active-slot child with `{ makeActive: false }`; then read the index, require `activeSaveId === expectedSaveId`, require both save records validate, set `activeSaveId = nextSaveId`, and write the index once.

- [ ] **Step 5: Update campaign grouping and deletion**

Group records by `campaignId`. Expose only the pointer-selected active timeline as current. Show checkpoints from all source branches of that campaign. Delete every same-campaign checkpoint and superseded active record after exact character deletion succeeds.

- [ ] **Step 6: Run focused tests and commit**

Run: `node tools/scripts/test-v1-timeline-storage.mjs && node tools/scripts/test-runtime-campaign-start-controller.mjs`
Expected: PASS.

Commit: `feat(storage): add timeline transaction custody`

### Task 4: Execute and recover native branch transactions

**Files:**
- Create: `src/runtime/timeline-transaction-service.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/hosts/sillytavern/shell-events.js`
- Modify: `tools/scripts/test-sillytavern-event-wiring.mjs`
- Create: `tools/scripts/test-v1-native-branch-runtime.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: Tasks 1-3 interfaces.
- Produces: `handleHostChatChanged()` result `{ active, chatId, acceptedPairReplay, timelineFork }` where `timelineFork` contains `status`, `savedGameId`, `suggestedName`, and recovery diagnostics.
- Produces: `renameSavedGame({ savedGameId, name })` runtime action.

- [ ] **Step 1: Write the failure-injection runtime matrix**

Inject failure after detected, parent-preserved, child-derived, child-persisted, child-binding-written, active-pointer-switched, prompt-ready, and parent-record-retired. Before commit assert parent pointer and prompt custody; after commit assert child pointer and forward recovery. Emit duplicate `CHAT_CHANGED` and reload at every stage.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-v1-native-branch-runtime.mjs`
Expected: FAIL because timeline transactions are missing.

- [ ] **Step 3: Implement the serialized stage machine**

Clear the prompt first, persist the journal, preserve the parent checkpoint with the automatic name, derive/validate the child, persist it inactive, write child metadata, re-read and re-hash the child transcript, CAS the pointer, configure child runtime, rebuild prompt, retire the superseded parent record, and complete the journal.

- [ ] **Step 4: Implement fail-closed recovery**

Before commit, resume or remove only journal-owned incomplete child artifacts. At/after commit, recover forward. On uncertain external writes or changed child transcript, retain the journal, keep generation unbound, and return `timeline-preparation-incomplete`.

- [ ] **Step 5: Wire the rename opportunity**

After a successful fork, `shell-events.js` prompts `Name Previous Timeline` with the already-persisted automatic name. Cancel, close, and empty input do nothing. A non-empty changed name calls `renameSavedGame` and refreshes the runtime.

- [ ] **Step 6: Run focused tests and commit**

Run: `node tools/scripts/test-v1-native-branch-runtime.mjs && node tools/scripts/test-sillytavern-event-wiring.mjs`
Expected: PASS.

Commit: `feat(runtime): activate native chat branches`

### Task 5: Make Load Game create an independent timeline

**Files:**
- Modify: `src/runtime/timeline-transaction-service.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/runtime-shell.js`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Modify: `tools/scripts/test-v1-native-branch-runtime.mjs`

**Interfaces:**
- Produces: `loadGame({ checkpointId })`, which preserves the current timeline, clones the selected immutable chat, persists a new child save ID, CAS-activates it, opens it, and rebuilds the prompt.

- [ ] **Step 1: Replace overwrite expectations with fork expectations**

Assert the selected checkpoint remains byte-for-byte unchanged, the current timeline receives an automatic saved game, the child has new save/chat IDs, repeated loads produce distinct children, and clone/open/metadata/prompt failures obey the same journal recovery boundary.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-v1-runtime-app.mjs`
Expected: FAIL because current `loadCheckpoint` overwrites the active save.

- [ ] **Step 3: Route Load Game through timeline transactions**

Keep `loadCheckpoint` as a compatibility alias if internal callers require it, but make both paths call the new immutable load transaction. Never mutate the selected checkpoint or reuse the current active save ID.

- [ ] **Step 4: Run focused tests and commit**

Run: `node tools/scripts/test-v1-runtime-app.mjs && node tools/scripts/test-v1-native-branch-runtime.mjs`
Expected: PASS.

Commit: `feat(runtime): load saves as new timelines`

### Task 6: Ship the Campaign Save Game and Load Game UI

**Files:**
- Modify: `src/ui/campaign-panel.js`
- Create: `src/ui/timeline-dialogs.js`
- Modify: `src/runtime/runtime-shell.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-certified-campaign-panel.mjs`
- Create: `tools/scripts/test-timeline-dialogs.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: runtime `saveGame`, `loadGame`, `renameSavedGame`, and `deleteSave` actions.
- Produces: Save Game command, Load Game selector/confirmation, saved-game metadata rows, and Return to Campaign failure action.

- [ ] **Step 1: Write failing UI contract tests**

Require exact action order `Continue`, `Save Game`, `Load Game`, `Delete Campaign`; saved rows show name/mission/stardate/date; Load Game confirms new timeline preservation; Save Game keeps manual naming; and no `Save checkpoint` or mutable-load copy remains.

- [ ] **Step 2: Run the UI tests and verify RED**

Run: `node tools/scripts/test-certified-campaign-panel.mjs && node tools/scripts/test-timeline-dialogs.mjs`
Expected: FAIL on old copy and missing dialog.

- [ ] **Step 3: Implement accessible dialogs and actions**

Use the existing UI kit and overlay conventions. Keep naming display-only. Disable Load Game when no saved game is selected. Keep Delete Campaign visually and structurally separate from saved-game deletion.

- [ ] **Step 4: Run focused tests and commit**

Run: `node tools/scripts/test-certified-campaign-panel.mjs && node tools/scripts/test-timeline-dialogs.mjs`
Expected: PASS.

Commit: `feat(ui): add saved game timeline controls`

### Task 7: Document, certify, install, and prove the real branch flow

**Files:**
- Modify: `docs/user/STORAGE_AND_STATE_SAFETY.md`
- Modify: `docs/architecture/V1_GAMEPLAY_ARCHITECTURE.md`
- Modify: `docs/testing/V1_GAMEPLAY_ARCHITECTURE_TEST_PLAN.md`
- Modify: `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: current user/operator contract and complete release evidence.

- [ ] **Step 1: Update current documentation**

Document native branch detection, immutable saves, new Load Game behavior, journal recovery, direct opening of saved chats as read-only, and the absence of per-message full snapshots.

- [ ] **Step 2: Run focused and full verification**

Run:

```powershell
node tools/scripts/test-native-branch-lineage.mjs
node tools/scripts/test-v1-branch-reconstruction.mjs
node tools/scripts/test-v1-timeline-storage.mjs
node tools/scripts/test-v1-native-branch-runtime.mjs
node tools/scripts/test-certified-campaign-panel.mjs
npm.cmd test
git diff --check
```

Expected: all focused tests pass; alpha gate reports every check passed; diff check is clean.

- [ ] **Step 3: Install only production extension files into `default-user`**

Copy the verified source production paths while excluding `.git`, `node_modules`, tests, docs, artifacts, temporary files, and user data. Hash-compare every copied file against source.

- [ ] **Step 4: Perform live SillyTavern proof**

Use a disposable branch of the Sam Vickers campaign or an isolated test campaign. Prove assistant-endpoint and player-endpoint branches, selected swipe, automatic parent naming, exact child state, independent subsequent settlement, Load Game preservation, reload recovery, unaffected ordinary chats, and zero console errors. Preserve the user's existing original and `Branch #1` artifacts.

- [ ] **Step 5: Commit, merge if an isolated branch was used, and push main**

Commit: `docs: document branch timeline saves`

Run:

```powershell
git status -sb
git log --oneline --decorate -8
git push origin main
```

Expected: local `main`, `origin/main`, installed production hashes, and the live verified implementation commit agree.
