# Post-Visible Settlement Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement one automatic post-visible settlement boundary for Directive and host-native responses, with authoritative time and mission tracking, source-safe replay, and one consolidated Utility observation call.

**Architecture:** `response-dispatcher` records visibility and schedules an immutable response frame. A per-chat queue calls `postVisibleSettlementObserver`, validates typed domain events, applies accepted operations through `stateDeltaGateway`, records one CORE/FORGE background batch, and flushes LENS once. The next player ingress waits for the prior selected response's bounded settlement. Old overlapping time and mission writers are removed after shadow parity.

**Tech Stack:** Node.js ES modules, Directive generation role registry, CORE Store V2, FORGE coordinator, state delta gateway, LENS prompt scheduler, built-in `node:assert/strict` script tests, SillyTavern live soak tooling.

## Global Constraints

- Pre-alpha rule: replace current contracts in place; do not preserve obsolete duplicate authority paths.
- No player acceptance UI or player-visible settlement pause.
- The observer proposes typed events only. It cannot emit arbitrary state operations.
- Foreground mechanics and formal outcomes remain authoritative.
- Never send raw prompts, hidden truth, private NPC thoughts, raw relationship/pressure values, credentials, cookies, or provider reasoning to the observer.
- Never persist raw observer prompts or raw provider output in CORE diagnostics.
- One retry maximum; queue waiting must be bounded.
- Add each focused test to `tools/scripts/run-alpha-gate.mjs` in the task that creates it.

---

## File Structure

### New production modules

- `src/runtime/post-visible-settlement-contracts.mjs`
- `src/runtime/post-visible-response-frame.mjs`
- `src/runtime/post-visible-settlement-observer.mjs`
- `src/runtime/post-visible-settlement-validators.mjs`
- `src/runtime/post-visible-settlement-reducers.mjs`
- `src/runtime/post-visible-settlement-coordinator.mjs`
- `src/runtime/post-visible-settlement-queue.mjs`

### Modified production modules

- `src/generation/generation-roles.mjs`
- `src/generation/model-call-authority-matrix.mjs`
- `src/runtime/response-dispatcher.mjs`
- `src/runtime/runtime-app.mjs`
- `src/runtime/chat-turn-orchestrator.mjs`
- `src/runtime/source-settlement-latest-pair-scene-adapter.mjs`
- `src/runtime/scene-handshake-settler.mjs`
- `src/directors/narrative-thread-director.mjs`
- `tools/scripts/run-alpha-gate.mjs`

### New tests and fixtures

- `tools/scripts/test-post-visible-response-frame.mjs`
- `tools/scripts/test-post-visible-settlement-observer.mjs`
- `tools/scripts/test-post-visible-settlement-validators.mjs`
- `tools/scripts/test-post-visible-settlement-coordinator.mjs`
- `tools/scripts/test-post-visible-settlement-queue.mjs`
- `tools/scripts/test-post-visible-settlement-runtime.mjs`
- `tests/fixtures/post-visible-settlement/ashes-time-mission.fixture.json`

---

### Task 1: Define Immutable Contracts and Build `ResponseFrame`

**Files:**
- Create: `src/runtime/post-visible-settlement-contracts.mjs`
- Create: `src/runtime/post-visible-response-frame.mjs`
- Create: `tools/scripts/test-post-visible-response-frame.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] **Step 1: Write the failing frame test**

```js
import assert from 'node:assert/strict';
import { buildPostVisibleResponseFrame } from '../../src/runtime/post-visible-response-frame.mjs';

const frame = buildPostVisibleResponseFrame({
  campaignState: fixtureState({ sceneTime: '2187-04-03T09:00:00.000Z', revision: 81 }),
  binding: { saveId: 'save-1', chatId: 'chat-1' },
  ingress: fixtureIngress({ transactionId: 'txn-1', playerText: 'Begin rescue operations.' }),
  response: fixtureResponse({ id: 'response-1', hostMessageId: '43' }),
  selectedText: 'Twelve minutes later, Hesperus is secured alongside.',
  transcript: fixtureTranscript()
});

assert.equal(frame.kind, 'directive.postVisibleResponseFrame.v1');
assert.equal(frame.response.kind, 'hostContinue');
assert.equal(frame.committed.stateRevision, 81);
assert.equal(frame.scene.dateTime, '2187-04-03T09:00:00.000Z');
assert.equal(Object.isFrozen(frame), true);
assert.equal(JSON.stringify(frame).includes('rawPrompt'), false);
assert.match(frame.frameId, /^post-visible:txn-1:response-1:/);
```

Run: `node tools/scripts/test-post-visible-response-frame.mjs`

Expected: `ERR_MODULE_NOT_FOUND` for `post-visible-response-frame.mjs`.

- [ ] **Step 2: Implement strict contracts and a deep-frozen frame**

```js
export const POST_VISIBLE_RESPONSE_FRAME_KIND = 'directive.postVisibleResponseFrame.v1';
export const POST_VISIBLE_OBSERVATION_KIND = 'directive.postVisibleObservation.v1';
export const POST_VISIBLE_SETTLEMENT_ROLE_ID = 'postVisibleSettlementObserver';

export function settlementKey(frame) {
  return [frame.transactionId, frame.response.responseId, frame.response.selectedTextHash].join(':');
}
```

`buildPostVisibleResponseFrame()` must:

- require campaign/save/chat/transaction/response ids;
- use `hashStableJson`/existing text hash helpers;
- include selected response text and a bounded player-safe transcript;
- copy only whitelisted state projections;
- deep-freeze the result;
- reject missing CORE `visibleResponseRef` evidence.

- [ ] **Step 3: Add contract test to alpha gate and verify**

Run: `node tools/scripts/test-post-visible-response-frame.mjs`

Expected: `post-visible response frame tests passed`.

- [ ] **Step 4: Commit**

```powershell
git add src/runtime/post-visible-settlement-contracts.mjs src/runtime/post-visible-response-frame.mjs tools/scripts/test-post-visible-response-frame.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat: add post-visible response frame"
```

---

### Task 2: Add the Utility Observer Role and Parser

**Files:**
- Create: `src/runtime/post-visible-settlement-observer.mjs`
- Create: `tools/scripts/test-post-visible-settlement-observer.mjs`
- Modify: `src/generation/generation-roles.mjs`
- Modify: `src/generation/model-call-authority-matrix.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] **Step 1: Write failing parser and role tests**

Cover valid empty observations, valid time/mission events, invalid hashes, invalid spans, unknown keys, arbitrary `operations`, malformed JSON, and retry exhaustion.

```js
const generated = await observePostVisibleResponse({ frame, generationRouter });
assert.deepEqual(calls, [{ roleId: 'postVisibleSettlementObserver' }]);
assert.equal(generated.observation.frameId, frame.frameId);
assert.equal(generated.observation.time.elapsedMinutes, 12);
assert.equal('operations' in generated.observation, false);
```

Run: `node tools/scripts/test-post-visible-settlement-observer.mjs`

Expected: role is absent from the registry.

- [ ] **Step 2: Register the role**

Add to `GENERATION_ROLE_IDS` and `DEFAULT_ROLE_DEFINITIONS`:

```js
postVisibleSettlementObserver: {
  id: 'postVisibleSettlementObserver',
  label: 'Post-Visible Settlement Observer',
  providerKind: 'utility',
  blocking: false,
  output: 'structured-json',
  timeoutMs: 30000,
  structuredOutput: true,
  modelPreferences: { cost: 'low', latency: 'fast', capability: 'utility-reasoning' },
  mayProposeState: true,
  mayInjectPrompt: false,
  mayRunDuringMainGeneration: false,
  fallback: 'skip'
}
```

Add an authority-matrix entry with `allowedRoots: EMPTY`. This is intentional: the role proposes typed events and has no direct mutation path.

- [ ] **Step 3: Implement prompt and strict parser**

```js
export async function observePostVisibleResponse({ frame, generationRouter, retry = true }) {
  const request = buildObserverRequest(frame);
  const first = await generationRouter.generate(POST_VISIBLE_SETTLEMENT_ROLE_ID, request);
  try {
    return { observation: parsePostVisibleObservation(first.text, frame), attempts: 1 };
  } catch (error) {
    if (!retry) throw error;
    const second = await generationRouter.generate(POST_VISIBLE_SETTLEMENT_ROLE_ID, {
      ...request,
      prompt: `${request.prompt}\nReturn corrected JSON only. Validation code: ${error.code}`
    });
    return { observation: parsePostVisibleObservation(second.text, frame), attempts: 2 };
  }
}
```

The parser must use an explicit key schema, cap arrays and evidence spans, verify exact frame/hash binding, and reject any `operations`, `patch`, `hidden`, or free-form state payload.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node tools/scripts/test-post-visible-settlement-observer.mjs
node tools/scripts/test-model-call-authority-matrix.mjs
node tools/scripts/test-generation-router.mjs
```

Expected: all pass with one role entry and no allowed mutation roots.

Commit: `feat: add post-visible observer role`

---

### Task 3: Implement Time and Mission Validators/Reducers

**Files:**
- Create: `src/runtime/post-visible-settlement-validators.mjs`
- Create: `src/runtime/post-visible-settlement-reducers.mjs`
- Create: `tools/scripts/test-post-visible-settlement-validators.mjs`
- Create: `tests/fixtures/post-visible-settlement/ashes-time-mission.fixture.json`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] **Step 1: Create the Ashes fixture and failing tests**

Fixture cases must include:

- 53 minutes remaining becomes 41: accept 12 minutes;
- 41 becomes 37: accept 4 minutes;
- "Seventy-five minutes later" containing a nested 20-minute action: accept 75, not 20 or 95;
- spoken "we spend the week" plan: no elapsed time;
- thought, quotation, hypothetical, deadline, and estimate durations: no elapsed time;
- player compression plus continuation restatement: accept once;
- continuation establishes an additional later interval: accept the additional interval;
- mission discovery, progress, blocker, completion, and phase suggestion;
- unknown objective and unsupported completion: reject event only.

Run: `node tools/scripts/test-post-visible-settlement-validators.mjs`

Expected: missing validator module.

- [ ] **Step 2: Implement evidence and source validation**

```js
export function validateEvidenceSpan(span, responseText) {
  const text = responseText.slice(span.start, span.end);
  if (!text || hashContinuityText(text) !== span.textHash) {
    return rejection('evidence-span-mismatch');
  }
  return acceptance({ start: span.start, end: span.end, textHash: span.textHash });
}
```

No regex phrase list may decide whether time advances. Deterministic code validates model-proposed meaning, numeric consistency, source identity, authority, and bounds.

- [ ] **Step 3: Implement typed reducers**

```js
export function reduceAcceptedSettlement({ campaignState, packageData, frame, accepted, now }) {
  const timeBoundary = accepted.time
    ? timeAdvanceBoundary({
        state: campaignState,
        packageData,
        minutes: accepted.time.elapsedMinutes,
        reason: 'post-visible-settlement',
        sourceAnchorRange: responseAnchorRange(frame),
        adjudication: timeSettlementRef(frame, accepted.time),
        now
      })
    : { state: campaignState, event: null };
  const mission = reduceMissionEvents({
    campaignState: timeBoundary.state,
    packageData,
    frame,
    events: accepted.missionEvents,
    now
  });
  return {
    nextCampaignState: mission.campaignState,
    baseRevision: frame.committed.stateRevision,
    domains: [...new Set([
      ...(accepted.time ? TIME_BOUNDARY_DOMAINS : []),
      ...mission.domains
    ])],
    effectRefs: [
      ...(timeBoundary.event ? [timeSettlementEffectRef(frame, accepted.time, timeBoundary.event)] : []),
      ...mission.effectRefs
    ]
  };
}
```

Import and reuse `timeAdvanceBoundary()` from `src/directors/director-coordinator.mjs`; it already advances world time, appends the campaign time ledger entry, applies world reactions, and synchronizes derived campaign time. `reduceMissionEvents()` must likewise call existing mission/quest reducers. Do not add a parallel scene clock or mutate invented `time.current` paths.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node tools/scripts/test-post-visible-settlement-validators.mjs
node tools/scripts/test-state-delta-gateway.mjs
```

Expected: all fixture cases pass; forbidden roots remain rejected.

Commit: `feat: validate post-visible time and mission events`

---

### Task 4: Build the Settlement Coordinator and CORE/FORGE Commit

**Files:**
- Create: `src/runtime/post-visible-settlement-coordinator.mjs`
- Create: `tools/scripts/test-post-visible-settlement-coordinator.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] **Step 1: Write failing coordinator tests**

Prove:

- observer called once;
- time and valid mission events apply in one state revision;
- an invalid mission event does not discard valid time;
- mechanics revision drift rejects/reschedules;
- duplicate settlement returns `replayed`;
- CORE batch contains hashes/effect refs but no raw text;
- LENS flushes once with unioned dirty domains;
- state commit failure does not record an applied CORE effect.

- [ ] **Step 2: Implement coordinator**

```js
export function createPostVisibleSettlementCoordinator({
  observe,
  validate,
  reduce,
  stateDeltaGateway,
  settleInternalForgeBackgroundBatch,
  flushLens,
  isFrameCurrent,
  getCampaignState,
  getPackageData,
  now
}) {
  return {
    async settle(frame) {
      if (!isFrameCurrent(frame)) return staleResult(frame, 'stale-before-provider');
      const observed = await observe({ frame });
      if (!isFrameCurrent(frame)) return staleResult(frame, 'stale-after-provider');
      const validation = validate({ frame, observation: observed.observation });
      const reduction = reduce({
        campaignState: getCampaignState(),
        packageData: getPackageData(),
        frame,
        accepted: validation.accepted,
        now
      });
      assertCurrentFrameAndRevisions(frame, stateDeltaGateway);
      const applied = reduction.domains.length
        ? await stateDeltaGateway.commit(reduction.nextCampaignState, {
            id: `post-visible:${frame.frameId}`,
            source: 'postVisibleSettlement',
            reason: 'Validated post-visible time and mission settlement.',
            summary: settlementSummary(validation.accepted),
            domains: reduction.domains,
            sourceAnchorRange: responseAnchorRange(frame),
            metadata: settlementMetadata(frame, validation, reduction)
          })
        : getCampaignState();
      const background = await settleInternalForgeBackgroundBatch(
        buildSettlementBackgroundBatch(frame, validation, reduction, applied),
        { sourceFrameId: frame.source.sourceFrameId, internalOwner: 'postVisibleSettlement' }
      );
      const lens = await flushLens({
        transactionId: frame.transactionId,
        promptDirtyDomains: dirtyDomains(validation.accepted),
        idempotencyKey: `lens:${settlementKey(frame)}`
      });
      return settlementResult(frame, { observed, validation, applied, background, lens });
    }
  };
}
```

`assertCurrentFrameAndRevisions()` performs the final selected-hash, state revision, and mechanics revision check immediately before `stateDeltaGateway.commit()`. The reducer starts from the current cloned campaign state and the gateway performs the single tracked commit/persist. Use REPAIR if persistence fails after in-memory mutation.

- [ ] **Step 3: Reuse the internal FORGE path**

The background bundle must follow existing `runtime-app.mjs` patterns:

```js
{
  transactionId: frame.transactionId,
  bundle: {
    idempotencyKey: `post-visible:${settlementKey(frame)}`,
    batchId: `post-visible:${frame.transactionId}:${frame.response.responseId}`,
    phaseAfter: 'backgroundSettling',
    outcomeId: frame.committed.outcomeId,
    promptDirtyDomains: ['sceneTime', 'missionQuestThread'],
    backgroundEffectRefs: acceptedEffectRefs,
    workers: [workerSummary]
  }
}
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node tools/scripts/test-post-visible-settlement-coordinator.mjs
node tools/scripts/test-forge-internal-background-settlement.mjs
node tools/scripts/test-state-delta-gateway.mjs
```

Commit: `feat: coordinate post-visible settlement`

---

### Task 5: Add the Per-Chat Queue and Ingress Barrier

**Files:**
- Create: `src/runtime/post-visible-settlement-queue.mjs`
- Create: `tools/scripts/test-post-visible-settlement-queue.mjs`
- Modify: `src/runtime/chat-turn-orchestrator.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] **Step 1: Write failing queue tests**

Test FIFO ordering by campaign/save/chat, duplicate-key replay, independent chats, one retry, 35-second attempt timeout, terminal failure release, source invalidation, and a player ingress waiting behind only its selected prior response.

- [ ] **Step 2: Implement queue**

```js
export function createPostVisibleSettlementQueue({ settle, maxAttempts = 2 }) {
  const lanes = new Map();
  const records = new Map();

  function schedule(frame) {
    const key = settlementKey(frame);
    if (records.has(key)) return records.get(key).promise;
    const laneKey = [frame.campaignId, frame.saveId, frame.chatId].join(':');
    const prior = lanes.get(laneKey) || Promise.resolve();
    const record = { status: 'queued' };
    record.promise = prior.catch(() => null).then(() => runBounded(frame, settle, maxAttempts));
    records.set(key, record);
    lanes.set(laneKey, record.promise);
    return record.promise;
  }

  return { schedule, awaitSelectedResponse, invalidate, status };
}
```

- [ ] **Step 3: Install the ingress barrier**

At the start of active-campaign player-turn orchestration, before classification or time adjudication:

```js
await postVisibleSettlementQueue.awaitSelectedResponse({
  campaignId: campaignState.campaign.id,
  saveId: binding.saveId,
  chatId: binding.chatId,
  selectedAssistantMessage: latestSelectedAssistantMessage
});
```

Do not block UI-only events, inactive campaigns, or a different chat lane.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node tools/scripts/test-post-visible-settlement-queue.mjs
node tools/scripts/test-chat-turn-orchestrator.mjs
```

Commit: `feat: serialize post-visible settlement before ingress`

---

### Task 6: Schedule Both Visible Response Paths

**Files:**
- Modify: `src/runtime/response-dispatcher.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Create: `tools/scripts/test-post-visible-settlement-runtime.mjs`
- Modify: `tools/scripts/test-response-dispatcher-core-bridge.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] **Step 1: Write failing response-route tests**

Assert that `recordCoreVisibleResponse()` and `recordCoreHostNativeCompletion()` each schedule exactly once after successful CORE visibility recording. Assert no schedule on failed/unavailable/recovery-only responses or when host message/text hash is absent.

- [ ] **Step 2: Add one dispatcher callback**

Inject `schedulePostVisibleSettlement` into `createResponseDispatcher()` and call it from a shared helper:

```js
async function recordAndScheduleVisibleResponse({ ingress, visibleRef, selectedText, route }) {
  const recorded = route === 'hostContinue'
    ? await recordCoreHostNativeCompletion(visibleRef)
    : await recordCoreVisibleResponse(visibleRef);
  if (!recorded) return null;
  schedulePostVisibleSettlement({
    ingress,
    responseId: visibleRef.responseId,
    hostMessageId: visibleRef.hostMessageId,
    selectedText,
    selectedTextHash: visibleRef.textHash,
    route
  });
  return recorded;
}
```

Scheduling is fire-and-track, not awaited by visible response posting. Queue errors must be captured in CORE diagnostics.

- [ ] **Step 3: Wire runtime dependencies**

Create the observer, coordinator, and queue once in `runtime-app.mjs`. Supply current-state lookup, source-current checks, the existing internal FORGE settlement bridge, and LENS scheduler.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node tools/scripts/test-response-dispatcher-core-bridge.mjs
node tools/scripts/test-post-visible-settlement-runtime.mjs
```

Commit: `feat: schedule settlement after visible responses`

---

### Task 7: Handle Swipe, Edit, Delete, and Late Results

**Files:**
- Modify: `src/runtime/post-visible-settlement-queue.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/scene-reconciliation.mjs`
- Modify: `tools/scripts/test-post-visible-settlement-queue.mjs`
- Modify: `tools/scripts/test-post-visible-settlement-runtime.mjs`

- [ ] **Step 1: Add failing mutation tests**

Prove old selected-hash settlement is invalidated, accepted operations are reversed through the stored pre-settlement revision, the new swipe settles once, and a late old provider result cannot commit.

- [ ] **Step 2: Persist compact settlement refs**

```js
{
  kind: 'directive.postVisibleSettlementRef.v1',
  settlementKey,
  responseId,
  selectedTextHash,
  baseRevision,
  committedRevision,
  mechanicsRevision,
  acceptedEventHashes,
  backgroundBatchId,
  status: 'applied'
}
```

- [ ] **Step 3: Connect source mutation events**

On swipe/edit/delete, call `queue.invalidate({ responseId, selectedTextHash })`, then use existing REPAIR/state revision restoration to remove the old settlement before scheduling the replacement. Never hand-edit time or mission fields during rollback.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node tools/scripts/test-post-visible-settlement-queue.mjs
node tools/scripts/test-post-visible-settlement-runtime.mjs
node tools/scripts/test-scene-reconciliation.mjs
node tools/scripts/test-repair-runtime.mjs
```

Commit: `fix: replay settlement after source mutation`

---

### Task 8: Migrate Time and Mission Authority, Then Consolidate Calls

**Files:**
- Modify: `src/runtime/source-settlement-latest-pair-scene-adapter.mjs`
- Modify: `src/runtime/scene-handshake-settler.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/directors/narrative-thread-director.mjs`
- Modify: `tools/scripts/test-scene-handshake-settler.mjs`
- Modify: `tools/scripts/test-post-visible-settlement-runtime.mjs`

- [ ] **Step 1: Add shadow-mode parity diagnostics**

Run the new observer without applying operations. Compare normalized time/mission proposals to legacy outcomes using hashes and reason codes. Do not run dual authoritative writers.

- [ ] **Step 2: Add a feature-state rollout switch**

Use one internal pre-alpha enum, not a user-facing compatibility setting:

```js
export const POST_VISIBLE_SETTLEMENT_MODE = Object.freeze({
  shadow: 'shadow',
  authoritativeTimeMission: 'authoritative-time-mission',
  consolidated: 'consolidated'
});
```

- [ ] **Step 3: Remove duplicate authority**

When `authoritativeTimeMission` is enabled:

- stop `commitAcceptedSceneTimeAdvance()` from mutating host-native elapsed time;
- stop Scene Handshake from applying overlapping time/mission roots;
- retain foreground Arbiter time-plan commits for explicit operator commands, tagged so the post-visible dedupe validator can recognize the already-committed interval;
- make headers/countdowns read canonical committed time only.

- [ ] **Step 4: Consolidate thread and Command Log observation**

Feed `threadCandidates` and `commandLogCandidates` from the shared observation to existing deterministic domain handlers. Once parity tests pass, remove the separate narrative-thread extraction model call for the same response. Preserve specialized enrichment only where it uses distinct inputs or produces distinct value.

- [ ] **Step 5: Verify model-call count and commit**

Run:

```powershell
node tools/scripts/test-scene-handshake-settler.mjs
node tools/scripts/test-post-visible-settlement-runtime.mjs
node tools/scripts/test-runtime-model-call-journal.mjs
```

Expected: one settlement observer call per visible response, no legacy host-native time mutation, and no duplicate narrative interpretation call in consolidated mode.

Commit: `refactor: consolidate narrative settlement authority`

---

### Task 9: Run Full Verification and Update Architecture Docs

**Files:**
- Modify: `docs/architecture/TIMEKEEPING_SYSTEM.md`
- Modify: `docs/architecture/CHAT_NATIVE_RUNTIME.md`
- Modify: `docs/technical/DIRECTIVE_TECHNICAL_MANUAL.md`
- Modify: `docs/testing/POST_VISIBLE_SETTLEMENT_PIPELINE_TEST_PLAN.md` only if implementation changes the proof contract

- [ ] **Step 1: Run focused suite**

```powershell
node tools/scripts/test-post-visible-response-frame.mjs
node tools/scripts/test-post-visible-settlement-observer.mjs
node tools/scripts/test-post-visible-settlement-validators.mjs
node tools/scripts/test-post-visible-settlement-coordinator.mjs
node tools/scripts/test-post-visible-settlement-queue.mjs
node tools/scripts/test-post-visible-settlement-runtime.mjs
node tools/scripts/test-response-dispatcher-core-bridge.mjs
node tools/scripts/test-chat-turn-orchestrator.mjs
node tools/scripts/test-state-delta-gateway.mjs
node tools/scripts/test-forge-internal-background-settlement.mjs
```

Expected: every command exits 0.

- [ ] **Step 2: Run alpha gate**

Run: `npm test`

Expected: exit 0 with the maintained alpha-gate summary reporting no failures.

- [ ] **Step 3: Execute the live test plan**

Follow `docs/testing/POST_VISIBLE_SETTLEMENT_PIPELINE_TEST_PLAN.md`. Use non-human soak users for mutation tests. Use the latest `default-user` Ashes chat as read-only replay evidence unless the user explicitly authorizes mutation.

- [ ] **Step 4: Update current architecture truth**

Document the post-visible callback, ingress barrier, canonical time ownership, migrated mission ownership, failure policy, and retired paths. Remove language that says host-native time settles only on the next player message.

- [ ] **Step 5: Commit final docs and verification updates**

Commit: `docs: document post-visible settlement runtime`
