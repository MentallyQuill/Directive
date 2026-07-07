# Player Character Prompt Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every Directive-owned SillyTavern campaign generation receives the authored player character identity and never releases host-native continuation from a blank or identity-weak prompt.

**Architecture:** Add a mandatory player-character prompt invariant to the existing player-safe prompt context, then gate `hostContinue` release on an installed prompt packet that contains required identity keys. Keep `hostContinue` available for routine prose, but only after Directive can prove the active host chat has current player identity context installed.

**Tech Stack:** JavaScript ES modules, Node.js `assert`, existing Directive LENS prompt scheduler, SillyTavern `setExtensionPrompt`, existing `tools/scripts/*.mjs` test harnesses.

## Global Constraints

- Pre-alpha extension: no legacy compatibility shims for old prompt-cache shapes when a direct migration/update is clearer.
- Do not expose director-only facts, hidden motives, private scores, or raw hidden creator fields in host prompt blocks.
- The player character prompt block is not contextual flavor; it is an invariant required for every Directive campaign generation.
- `hostContinue` may remain the route for routine prose only when prompt readiness proves the host prompt includes current Directive identity context.
- Prompt diagnostics must not persist raw prompt bodies or raw provider responses.
- Live SillyTavern verification must use the installed `default-user` extension copy if the running host serves that copy.

---

## File Structure

- Modify `src/context/context-orchestrator.mjs`
  - Add a mandatory `player-character` context candidate.
  - Keep it separate from `relevant-crew`, because the player is authored runtime state, not an NPC crew card.
- Modify `src/generation/player-safe-prompt-context-builder.mjs`
  - Export helper(s) if needed for tests to verify identity block presence consistently.
  - Keep projection and prompt block output free of private dossier fields.
- Modify `src/runtime/lens-prompt-scheduler.mjs`
  - Add prompt-readiness inspection data to installed records: required prompt keys, block count, revision, identity-block presence.
- Modify `src/runtime/runtime-app.mjs`
  - Add a pre-host-continue readiness check in the prompt sync path used before host generation release.
  - Force rebuild or fail closed when required prompt keys are missing.
- Modify `src/runtime/response-dispatcher.mjs` or `src/runtime/chat-turn-orchestrator.mjs`
  - Whichever currently performs the final `hostContinue` release decision must consume the readiness result and avoid releasing host generation if the prompt is not ready.
- Modify `tools/scripts/test-player-safe-prompt-context.mjs`
  - Assert player identity block exists, includes authored public player fields, and excludes hidden/private fields.
- Modify `tools/scripts/test-prompt-dirty-domains.mjs`
  - Assert required prompt keys are represented in LENS install diagnostics/readiness.
- Modify `tools/scripts/test-response-dispatcher-core-bridge.mjs` or add a focused adjacent test in `tools/scripts/test-chat-native-runtime-flow.mjs`
  - Assert host continuation is blocked or converted to Directive-owned response when prompt readiness fails.
- Modify `tools/scripts/run-alpha-gate.mjs`
  - Only if a new test file is added; otherwise no change.

---

### Task 1: Add Mandatory Player Character Prompt Block

**Files:**
- Modify: `src/context/context-orchestrator.mjs`
- Test: `tools/scripts/test-player-safe-prompt-context.mjs`

**Interfaces:**
- Consumes: `campaignState.player`, `campaignState.player.dossier`, `campaignState.campaign`, existing `normalizeCandidate(state, candidate)`.
- Produces: prompt block with `id: 'player-character'`, title `Player Character`, `mustInclude: true`, `placement: 'inPrompt'`, `depth: 0`, `lensPromptBudgetLane: 'stableRules'`.

- [ ] **Step 1: Write the failing test**

Append this near the existing prompt packet assertions in `tools/scripts/test-player-safe-prompt-context.mjs` after `assert.equal(packet.blocks.some((block) => block.id === 'immediate-scene'), true);`:

```js
const playerBlock = packet.blocks.find((block) => block.id === 'player-character');
assert.ok(playerBlock, 'Prompt packet must include a mandatory player-character block.');
assert.equal(playerBlock.mustInclude, true);
assert.equal(playerBlock.placement, 'inPrompt');
assert.equal(playerBlock.depth, 0);
assert.equal(playerBlock.lensPromptBudgetLane, 'stableRules');
assert.match(playerBlock.content, /Player character:/);
assert.match(playerBlock.content, new RegExp(escapeRegex(state.player.name)));
assert.match(playerBlock.content, /Commander/);
assert.match(playerBlock.content, /Executive Officer/);
assert.match(playerBlock.content, /Do not rename, replace, or infer a different surname/i);
assert.equal(playerBlock.content.includes(canary), false, 'Player prompt block must not expose private dossier fields.');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools\scripts\test-player-safe-prompt-context.mjs
```

Expected: FAIL with `Prompt packet must include a mandatory player-character block.`

- [ ] **Step 3: Implement the player block**

In `src/context/context-orchestrator.mjs`, add helper functions near `crewIdentityLine`:

```js
function playerIdentityLine(player = {}) {
  const name = compact(player.name || 'Player Commander');
  const rank = compact(player.rank || 'Commander');
  const billet = compact(player.billet || player.role || 'Commanding officer');
  const species = compact(player.species?.label || player.species || '');
  const pronouns = compact(player.pronounsOrAddress || '');
  const reputation = compact(player.dossier?.publicReputation || '');
  const identity = [
    `${rank} ${name}`,
    species ? `Species: ${species}` : null,
    billet ? `Billet: ${billet}` : null,
    pronouns ? `Pronouns/address: ${pronouns}` : null,
    reputation ? `Public reputation: ${reputation}` : null
  ].filter(Boolean);
  return [
    `Player character: ${identity.join('; ')}.`,
    `Use this exact player identity for the user's in-fiction command character.`,
    `Do not rename, replace, or infer a different surname for ${rank} ${name}.`,
    `NPCs should address the player by rank and the authored surname when formal address is appropriate.`
  ].join('\n');
}
```

Then insert this candidate immediately after `directive-contract` in `buildCandidates(...)`:

```js
normalizeCandidate(state, {
  id: 'player-character',
  title: 'Player Character',
  mustInclude: true,
  salienceScore: 100,
  placement: 'inPrompt',
  depth: 0,
  ttl: 'campaign',
  priority: 999,
  lensPromptBudgetLane: 'stableRules',
  reason: 'Authored player identity must be present for every campaign generation.',
  sourceIds: [state?.player?.id || 'player-commander'],
  content: playerIdentityLine(state?.player || {})
}),
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node tools\scripts\test-player-safe-prompt-context.mjs
```

Expected: PASS and no hidden `canary` leakage.

- [ ] **Step 5: Commit**

```powershell
git add src/context/context-orchestrator.mjs tools/scripts/test-player-safe-prompt-context.mjs
git commit -m "fix: inject player identity prompt"
```

---

### Task 2: Make Prompt Readiness Explicit

**Files:**
- Modify: `src/runtime/lens-prompt-scheduler.mjs`
- Test: `tools/scripts/test-prompt-dirty-domains.mjs`

**Interfaces:**
- Consumes: installed packet blocks from LENS flush.
- Produces: installed record fields:
  - `requiredPromptKeys: string[]`
  - `requiredPromptKeysPresent: boolean`
  - `identityPromptReady: boolean`

- [ ] **Step 1: Write the failing test**

In `tools/scripts/test-prompt-dirty-domains.mjs`, add to the first successful flush assertion block that inspects `firstFlush` or equivalent installed record:

```js
assert.ok(
  Array.isArray(firstFlush.installed.requiredPromptKeys),
  'Installed prompt record must expose requiredPromptKeys.'
);
assert.equal(
  firstFlush.installed.requiredPromptKeys.includes('directive.campaign.player-character'),
  true,
  'Player character prompt key must be required.'
);
assert.equal(firstFlush.installed.requiredPromptKeysPresent, true);
assert.equal(firstFlush.installed.identityPromptReady, true);
```

If the local variable is named differently in the file, use the first flush result whose `status` is `installed` and whose `installed.promptKeys` is asserted.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools\scripts\test-prompt-dirty-domains.mjs
```

Expected: FAIL because `requiredPromptKeys` is missing.

- [ ] **Step 3: Add readiness metadata**

In `src/runtime/lens-prompt-scheduler.mjs`, add constants near other prompt-key helpers:

```js
const REQUIRED_DIRECTIVE_PROMPT_KEYS = Object.freeze([
  'directive.contract',
  'directive.campaign.player-character'
]);

function requiredPromptKeysPresent(promptKeys = []) {
  const keys = new Set(Array.isArray(promptKeys) ? promptKeys : []);
  return REQUIRED_DIRECTIVE_PROMPT_KEYS.every((key) => keys.has(key));
}
```

When constructing `installed`, after `promptKeys` is calculated, include:

```js
const promptKeys = packet.blocks.map((block) => block.promptKey);
const hasRequiredPromptKeys = requiredPromptKeysPresent(promptKeys);
```

Then use `promptKeys` in the installed record:

```js
promptKeys,
requiredPromptKeys: [...REQUIRED_DIRECTIVE_PROMPT_KEYS],
requiredPromptKeysPresent: hasRequiredPromptKeys,
identityPromptReady: promptKeys.includes('directive.campaign.player-character'),
```

Do not persist `packet.text`, `rawPromptBody`, or block raw content in the readiness fields.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node tools\scripts\test-prompt-dirty-domains.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/runtime/lens-prompt-scheduler.mjs tools/scripts/test-prompt-dirty-domains.mjs
git commit -m "fix: track prompt readiness"
```

---

### Task 3: Gate Host Continuation on Prompt Readiness

**Files:**
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/chat-turn-orchestrator.mjs` or `src/runtime/response-dispatcher.mjs`
- Test: `tools/scripts/test-response-dispatcher-core-bridge.mjs`

**Interfaces:**
- Consumes: LENS sync result from `synchronizeActivePrompt(...)` or `installActivationPromptThroughLens(...)`.
- Produces:
  - `promptReadyForHostContinue(syncResult): boolean`
  - host continuation release blocked when required prompt keys are absent.

- [ ] **Step 1: Write the failing test**

Add a focused case near the host continuation tests in `tools/scripts/test-response-dispatcher-core-bridge.mjs`:

```js
let blockedHostReleaseCalls = 0;
let blockedState = initializeCampaignRuntimeTracking(createCampaignState({
  campaignId: 'campaign-host-prompt-block',
  saveId: 'save-host-prompt-block',
  chatId: 'chat-host-prompt-block',
  promptContextRevision: 0
}));
const blockedDispatcher = createResponseDispatcher({
  host: {
    chat: {
      async continueHostGeneration() {
        blockedHostReleaseCalls += 1;
        return { ok: true, released: true };
      }
    }
  },
  coreTurnStore: createCoreTurnStore(),
  getCampaignState: () => blockedState,
  setCampaignState: (next) => { blockedState = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { blockedState = initializeCampaignRuntimeTracking(next); },
  now: () => '2026-06-28T17:05:00.000Z',
  promptReadiness: () => ({
    ok: false,
    requiredPromptKeysPresent: false,
    identityPromptReady: false,
    reason: 'missing-player-character-prompt'
  })
});

await assert.rejects(
  () => blockedDispatcher.dispatch({
    campaignState: blockedState,
    ingressId: 'ingress-host-prompt-block',
    strategy: 'injectAndContinue',
    responseKind: 'hostGeneration',
    idempotencyKey: 'response-host-prompt-block'
  }),
  /missing-player-character-prompt/
);
assert.equal(blockedHostReleaseCalls, 0, 'Host generation must not be released without player identity prompt readiness.');
```

If `createResponseDispatcher` does not currently accept `promptReadiness`, add that dependency in this task.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools\scripts\test-response-dispatcher-core-bridge.mjs
```

Expected: FAIL because dispatcher either ignores `promptReadiness` or releases host generation.

- [ ] **Step 3: Implement readiness gate**

Add a small helper in `src/runtime/response-dispatcher.mjs` near the dispatch code that releases host generation:

```js
function assertPromptReadyForHostContinue(readiness = null) {
  if (!readiness) return;
  const ok = readiness.ok !== false
    && readiness.requiredPromptKeysPresent !== false
    && readiness.identityPromptReady !== false;
  if (ok) return;
  const error = new Error(readiness.reason || 'Directive prompt context is not ready for host continuation.');
  error.code = 'DIRECTIVE_HOST_CONTINUE_PROMPT_NOT_READY';
  error.details = {
    requiredPromptKeysPresent: readiness.requiredPromptKeysPresent === true,
    identityPromptReady: readiness.identityPromptReady === true
  };
  throw error;
}
```

Add an optional constructor dependency:

```js
promptReadiness = null
```

Immediately before `host.chat.continueHostGeneration(...)`:

```js
const readiness = typeof promptReadiness === 'function'
  ? await promptReadiness({ campaignState, responseKind, strategy, ingressId })
  : null;
assertPromptReadyForHostContinue(readiness);
```

In `src/runtime/runtime-app.mjs`, wire the dependency from the app’s prompt sync state. The readiness function should return:

```js
{
  ok: true,
  requiredPromptKeysPresent: true,
  identityPromptReady: true,
  promptContextRevision: campaignState.campaignChatBinding?.promptContextRevision || 0
}
```

Only return `ok: true` after the current installed LENS record or recent sync result proves `requiredPromptKeysPresent === true` and `identityPromptReady === true`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
node tools\scripts\test-response-dispatcher-core-bridge.mjs
```

Expected: PASS, with host generation not released in the blocked case.

- [ ] **Step 5: Commit**

```powershell
git add src/runtime/runtime-app.mjs src/runtime/response-dispatcher.mjs tools/scripts/test-response-dispatcher-core-bridge.mjs
git commit -m "fix: gate host continue on prompt readiness"
```

---

### Task 4: Force Prompt Rebuild Before Host Continue When Dirty or Missing

**Files:**
- Modify: `src/runtime/chat-turn-orchestrator.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Test: `tools/scripts/test-prompt-dirty-domains.mjs` or a new focused `tools/scripts/test-host-continue-prompt-readiness.mjs`

**Interfaces:**
- Consumes: `synchronizeActivePrompt(state, { rebuild, reason, activityContext })`.
- Produces: a pre-release sync path with reason `host-continue-preflight`.

- [ ] **Step 1: Write the failing test**

Create `tools/scripts/test-host-continue-prompt-readiness.mjs` if no existing harness can express this cleanly:

```js
import assert from 'node:assert/strict';

import { __directiveRuntimeAppTestHooks } from '../../src/runtime/runtime-app.mjs';

const { promptReadyForHostContinue } = __directiveRuntimeAppTestHooks;

assert.equal(typeof promptReadyForHostContinue, 'function');
assert.equal(promptReadyForHostContinue({
  installed: {
    requiredPromptKeysPresent: true,
    identityPromptReady: true,
    directiveOwnedRevision: 3
  },
  binding: { promptContextRevision: 3 }
}).ok, true);

assert.equal(promptReadyForHostContinue({
  installed: {
    requiredPromptKeysPresent: false,
    identityPromptReady: false,
    directiveOwnedRevision: 3
  },
  binding: { promptContextRevision: 3 }
}).ok, false);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools\scripts\test-host-continue-prompt-readiness.mjs
```

Expected: FAIL because the hook/helper does not exist.

- [ ] **Step 3: Implement preflight helper and sync**

In `src/runtime/runtime-app.mjs`, add a pure helper:

```js
function promptReadyForHostContinue({ installed = null, binding = null } = {}) {
  const revision = Number(installed?.directiveOwnedRevision || installed?.revision || 0);
  const bindingRevision = Number(binding?.promptContextRevision || 0);
  const ok = revision > 0
    && bindingRevision > 0
    && installed?.requiredPromptKeysPresent === true
    && installed?.identityPromptReady === true;
  return {
    ok,
    requiredPromptKeysPresent: installed?.requiredPromptKeysPresent === true,
    identityPromptReady: installed?.identityPromptReady === true,
    promptContextRevision: bindingRevision || revision || 0,
    reason: ok ? null : 'missing-player-character-prompt'
  };
}
```

Export it through `__directiveRuntimeAppTestHooks`.

Before any `hostContinue` release path, call the existing prompt sync with forced identity dirty domains:

```js
await synchronizeActivePrompt(state, {
  persist: true,
  rebuild: true,
  reason: 'host-continue-preflight',
  activityContext: {
    promptDirtyDomains: ['identity', 'sourceBinding']
  }
});
```

Then evaluate `promptReadyForHostContinue(...)`. If it fails, return or throw `DIRECTIVE_HOST_CONTINUE_PROMPT_NOT_READY` and route to Directive-owned narration if that fallback exists in the call site.

- [ ] **Step 4: Register new test if created**

If `tools/scripts/test-host-continue-prompt-readiness.mjs` was created, add it to the `checks` array in `tools/scripts/run-alpha-gate.mjs` near other prompt tests:

```js
'test-host-continue-prompt-readiness.mjs',
```

- [ ] **Step 5: Run tests**

Run:

```powershell
node tools\scripts\test-host-continue-prompt-readiness.mjs
node tools\scripts\test-prompt-dirty-domains.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/runtime/runtime-app.mjs src/runtime/chat-turn-orchestrator.mjs tools/scripts/test-host-continue-prompt-readiness.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "fix: preflight host continue prompt"
```

---

### Task 5: Add Regression for the Sam Vickers Failure Shape

**Files:**
- Modify: `tools/scripts/test-player-safe-prompt-context.mjs`
- Modify: `tools/scripts/test-turn-intent-classifier-fixtures.mjs` or fixture JSON under `tests/fixtures/classifier/`

**Interfaces:**
- Consumes: a player message similar to `Sam stepped out... "Commander," he greeted Bronn.`
- Produces: evidence that the prompt packet includes `Sam Vickers` before any host continuation route can be released.

- [ ] **Step 1: Add prompt-context regression**

In `tools/scripts/test-player-safe-prompt-context.mjs`, create a cloned state:

```js
const samState = cloneJson(state);
samState.player = {
  ...samState.player,
  id: 'player-commander',
  name: 'Sam Vickers',
  rank: 'Commander',
  billet: 'Executive Officer',
  pronounsOrAddress: 'he/him',
  dossier: {
    publicReputation: 'A capable commander whose engineering background makes the Breckenridge assignment plausible.',
    privateAssessment: canary
  }
};
const samPacket = buildPlayerSafePromptContext({
  campaignState: samState,
  packageData,
  crewDataset,
  shipDataset,
  scene: {
    ...scene,
    location: 'Shuttlebay Two',
    presentCharacterIds: ['hadrik-bronn', 'player-commander']
  },
  playerText: 'Sam stepped out with a small personal backpack. "Commander," he greeted Bronn. "It is good to be aboard."',
  createdAt: '2026-07-07T20:24:18.749Z'
});
const samPlayerBlock = samPacket.blocks.find((block) => block.id === 'player-character');
assert.ok(samPlayerBlock, 'Sam Vickers regression must include player-character block.');
assert.match(samPlayerBlock.content, /Sam Vickers/);
assert.match(samPlayerBlock.content, /Executive Officer/);
assert.equal(JSON.stringify(samPacket).includes('Vasquez'), false);
assert.equal(JSON.stringify(samPacket).includes(canary), false);
```

- [ ] **Step 2: Run regression test**

Run:

```powershell
node tools\scripts\test-player-safe-prompt-context.mjs
```

Expected: PASS after Task 1.

- [ ] **Step 3: Add classifier fixture note only if needed**

If host continuation remains expected for this kind of prose, add a fixture under `tests/fixtures/classifier/` asserting the route remains `injectAndContinue`; the readiness gate, not classifier, is responsible for safety.

Fixture case:

```json
{
  "id": "sam-vickers-host-continue-with-prompt-readiness",
  "text": "Sam stepped out with a small personal backpack of items and nothing else--traveling light. \"Commander,\" he greeted Bronn. \"It's good to be aboard.\"",
  "providerResponse": {
    "classification": "sceneColor",
    "responseStrategy": "injectAndContinue",
    "confidence": 0.86,
    "reasons": ["Player is continuing ordinary arrival scene prose."],
    "workerPlan": {}
  },
  "expect": {
    "classification": "sceneColor",
    "responseStrategy": "injectAndContinue"
  }
}
```

- [ ] **Step 4: Run classifier fixtures if modified**

Run:

```powershell
node tools\scripts\test-turn-intent-classifier-fixtures.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add tools/scripts/test-player-safe-prompt-context.mjs tests/fixtures/classifier
git commit -m "test: cover player identity prompt regression"
```

---

### Task 6: Verify Focused Gates and Live Installed Copy

**Files:**
- No source changes unless live verification exposes installed-copy drift.

**Interfaces:**
- Consumes: completed Tasks 1-5.
- Produces: deterministic and live evidence that player identity reaches host prompt before host continuation.

- [ ] **Step 1: Run focused deterministic tests**

Run:

```powershell
node tools\scripts\test-player-safe-prompt-context.mjs
node tools\scripts\test-prompt-dirty-domains.mjs
node tools\scripts\test-sillytavern-chat-prompt-adapters.mjs
node tools\scripts\test-response-dispatcher-core-bridge.mjs
node tools\scripts\test-turn-intent-classifier-fixtures.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run alpha gate**

Run:

```powershell
node tools\scripts\run-alpha-gate.mjs
```

Expected: all checks PASS. If unrelated dirty-worktree failures appear, isolate the failing script and do not weaken this fix.

- [ ] **Step 3: Sync installed extension for live default-user proof**

Use the repo’s established sync procedure for `F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive`. Verify that changed files in the installed copy match the repo before live testing.

Suggested hash check:

```powershell
Get-FileHash src\context\context-orchestrator.mjs,src\runtime\runtime-app.mjs,src\runtime\lens-prompt-scheduler.mjs
Get-FileHash F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive\src\context\context-orchestrator.mjs,F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive\src\runtime\runtime-app.mjs,F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive\src\runtime\lens-prompt-scheduler.mjs
```

Expected: matching hashes for changed files.

- [ ] **Step 4: Live replay the failure shape**

In default-user SillyTavern:

1. Start a fresh Ashes of Peace campaign with player name `Sam Vickers`.
2. Confirm Campaign panel shows Prompt Context revision greater than `0`.
3. Send: `Sam stepped out with a small personal backpack of items and nothing else--traveling light. "Commander," he greeted Bronn. "It's good to be aboard."`
4. Inspect the response and runtime diagnostics.

Expected:

- Bronn addresses the player as `Commander Vickers` or rank-only `Commander`, not `Commander Vasquez`.
- Runtime event log records prompt context revision greater than `0`.
- Host continuation is released only after readiness reports `identityPromptReady: true`.

- [ ] **Step 5: Commit verification artifact only if repo policy expects it**

If a live proof artifact is generated under a tracked `tests/` evidence directory, commit it:

```powershell
git add tests/artifacts
git commit -m "test: add live player identity prompt proof"
```

Do not commit local SillyTavern data files.

---

## Self-Review

- Spec coverage: The plan adds mandatory player identity injection, makes prompt readiness observable, gates host continuation, covers the Sam Vickers failure shape, and includes deterministic plus live verification.
- Placeholder scan: No `TBD`, `TODO`, or unspecified "add tests" steps remain.
- Type consistency: The required readiness fields are consistently named `requiredPromptKeys`, `requiredPromptKeysPresent`, and `identityPromptReady`.
- Scope check: This is one subsystem: prompt readiness for host-native campaign continuations. It does not attempt broader classifier redesign or full prompt architecture replacement.
