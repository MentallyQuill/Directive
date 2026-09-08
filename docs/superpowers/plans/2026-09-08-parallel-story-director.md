# Parallel Story Director Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This document does not dispatch agents or authorize live host changes.

**Goal:** Build source-bound story direction alongside evidence interpretation, replacing the separate episode-evaluator request while preserving native narration and authoritative campaign rules.

**Architecture:** Interpreter and director analyze the same immutable snapshot concurrently. Pure preparation functions combine historical review, accepted-pair settlement and continuity events; one gateway commit precedes narration. Director failure blocks narration, and optional NPC biography enrichment moves off the reply's critical path.

**Tech Stack:** Existing browser-compatible JavaScript ESM, strict JSON contracts, Node `assert` regression scripts, native SillyTavern provider/profile transport, existing segmented save storage.

**Spec:** [Parallel story director design](../specs/2026-09-08-parallel-story-director-design.md). Read it before this plan, especially its source authority, snapshot, retrospective-lag and failure rules.

## Execution record

The approved implementation was built in `codex/parallel-story-director`, isolated from the dirty main checkout. The original checklist below remains the planning baseline; implementation evidence and release status are in [the validation report](../../testing/parallel-story-director-validation.md).

Tasks 1-9 are implemented across the story contracts, director request/compiler, pure state-spine preparation, parallel coordinator, deterministic commit builder, runtime gate, branch reconstruction, idle dossier queue and corpus. Task 10 has local transport and app regressions; live provider and semantic measurements remain pending as explicitly allowed below. Integration uses one scoped implementation commit instead of the illustrative per-task commits.

Implementation adjustments: `captureAcceptedPairAnalysis` receives explicit campaign state; mission runtime composes the pure preparations directly; biography helpers live under `src/runtime`; persisted direction has a separate postcommit reuse binding; and the unused scheduler retains its isolated compatibility test. A correction that cancels unfinished mandatory analysis requires explicit Retry before narration. None of these paths synthesize evidence or add a reconciliation model request.

## Global Constraints

- Production code is browser-compatible JavaScript ESM (`.mjs`/`.js`); add no production dependencies.
- Keep SillyTavern ownership of narration, provider profiles, credentials, presets, and transport.
- No additional model reconciliation call and no model review before displaying freshly generated narration.
- A valid interpreter result and a valid director result are mandatory before ordinary narration starts; timeouts and errors never release fallback narration.
- Story additions require no approval popups. Respect player-led diversions and preserve established decisions and costs.
- Preserve accepted-pair authority for mission, time, ship, Cohesion, People observations, player intent, and participation.
- Director direction cannot retroactively authorize the previous assistant response or independently change campaign mechanics.
- Persist continuity with exact source lineage; edits, swipes, deletion, replay, and branches must invalidate or reproduce it correctly.
- The standalone automatic episode-evaluator request is retired after its memory and relationship behavior is transferred to the director.
- Keep automatic structured-output retries disabled. Retry failed analysis explicitly and reuse successful results only for the exact unchanged input.
- Do not modify the active default-user Sam Vickers save, installed extension, or host while implementing or testing this design without separately scoped live authorization.
- Preserve unrelated checkout changes, including `debug.log`; stage only task-owned files.
- Use `npm.cmd` on Windows. Use GitHub CLI with network permission enabled for any authorized GitHub operation.

## Execution boundaries

This plan is for implementation after document review. Do not push, deploy, install, change a running host, or backfill a save merely because a task includes a commit checkpoint. Make scoped local commits only when executing the plan under authorization. Check applicable `AGENTS.md` and the working tree before editing; isolate implementation if other work is present. Never stage `debug.log` or the whole checkout.

Tasks 1-4 create independently testable foundations. Task 5 integrates the transaction. Tasks 6-9 complete lifecycle, biography, prompt and coverage behavior. Task 10 is verification and release evidence. A foundation commit is not a completed feature and must not be installed alone.

## File and interface map

| File | Ownership |
| --- | --- |
| `src/story/continuity-contracts.mjs` (new) | Change schema, exact source validation, event/receipt validation |
| `src/story/continuity-events.mjs` (new) | IDs, materialization, folding, invalidation and branch remapping |
| `src/story/director-context.mjs` (new) | Safe authored context and bounded thread projection |
| `src/story/story-director.mjs` (new) | Director schema/prompt, transport and parsed result |
| `src/runtime/turn-analysis-key.mjs` (new) | Immutable role-input cache identity |
| `src/runtime/parallel-turn-analysis.mjs` (new) | Concurrent roles, joining duplicate flights, successful-result reuse |
| `src/runtime/turn-state-reconciler.mjs` (new) | Draft preparation and one final commit proposal |
| `src/narration/director-instructions.mjs` (new) | Valid target selection and deterministic narration guidance |
| `src/people/dossier-enrichment-queue.mjs` (new) | Nonblocking biography queue, staged results and conflict checks |
| Existing story contracts, spine, runtime and storage/replay modules | Integrate these units without introducing a second authority system |

All new helpers listed below are produced in a named task. Existing functions referenced by snippets were inspected in this repository. The spec contains complete kernels for quote checking, request hashing, parallel analysis, instruction compilation and commit construction; steps identify where those exact kernels are installed. Snippets here use real Node assertions and concrete fixture data. They are implementation instructions, not a claim that the new modules already exist.

### Task 1: Continuity contracts, events and source-bound projection

**Files:**
- Create `src/story/continuity-contracts.mjs`, `src/story/continuity-events.mjs`.
- Create `tools/scripts/story-director-test-fixtures.mjs`, `tools/scripts/test-continuity-events.mjs`.
- Modify `src/story/story-settlement-contracts.mjs`, `src/story/story-settlement.mjs`.

**Interfaces:**
- `requireSourceQuote(change, sourcePair) -> SourceAnchor`: spec section 4 kernel.
- `validateContinuityChanges(changes, {sourcePair, existingThreads, authoredIds}) -> {ok, errors}`.
- `materializeContinuityChanges({changes, sourcePair, assistantAccepted, contributionIds, branchId, sourceRangeHash, existingEvents, settledAtRevision}) -> Promise<Event[]>`.
- `projectContinuityThreads(events) -> Thread[]` with `{id,title,category,status,facts,sourceContributionIds}`.
- `pruneContinuityEvents(events, invalidSourceIds) -> Event[]`; required-ancestor pruning reaches a fixed point.
- `rebindContinuityEvents(events, {branchId, contributionMap}) -> Promise<{events,eventMap,threadMap}>`; Task 7 consumes this.

- [ ] Create the shared fixture module:

```js
export function makeSourcePair() {
  return {
    previousAssistant: {
      messageId: 'a7', selectedSwipeId: '0', textHash: 'abcd1234',
      text: 'Rendezvous 1400. The tender awaits your response.',
    },
    currentPlayer: {
      messageId: 'u8', selectedSwipeId: null, textHash: 'abcd5678',
      text: 'What flexibility do we have?',
    },
  };
}

export function makeChanges() {
  return [
    { operation: 'open', localRef: 'ravenna', title: 'Ravenna transfer',
      category: 'schedule', sourceSlot: 'previousAssistant',
      evidenceQuote: 'Rendezvous 1400.' },
    { operation: 'addFact', threadRef: 'ravenna',
      text: 'The rendezvous is scheduled for 1400.',
      claimType: 'narrated-fact', authoredRef: null, supersedesFactId: null,
      sourceSlot: 'previousAssistant', evidenceQuote: 'Rendezvous 1400.' },
  ];
}
```

- [ ] Add failing tests that prove storage semantics, not just schema equality:

```js
import assert from 'node:assert/strict';
import { makeSourcePair, makeChanges } from './story-director-test-fixtures.mjs';
import { materializeContinuityChanges, projectContinuityThreads,
  pruneContinuityEvents } from '../../src/story/continuity-events.mjs';

const input = {
  changes: makeChanges(), sourcePair: makeSourcePair(), assistantAccepted: true,
  contributionIds: { previousAssistant: 'contribution.a7', currentPlayer: 'contribution.u8' },
  branchId: 'save.test', sourceRangeHash: 'pair.test', existingEvents: [],
  settledAtRevision: 1,
};
const events = await materializeContinuityChanges(input);
assert.equal(projectContinuityThreads(events)[0].status, 'active');
assert.equal(projectContinuityThreads(events)[0].facts.length, 1);
assert.deepEqual(await materializeContinuityChanges(input), events);
assert.deepEqual(await materializeContinuityChanges({ ...input, assistantAccepted: false }), []);
assert.deepEqual(projectContinuityThreads(pruneContinuityEvents(events,
  new Set(['contribution.a7']))), []);
await assert.rejects(materializeContinuityChanges({ ...input,
  changes: [{ ...makeChanges()[0], evidenceQuote: 'This text does not occur.' }],
}), /quote/);
```

- [ ] Run `node tools/scripts/test-continuity-events.mjs`; expect failure for missing exports/modules first, then source assertions during implementation.
- [ ] Install `requireSourceQuote` from spec section 4. Implement the strict operation union and bounds there. Use existing `sha256Json` to generate content-based IDs. Creation events are materialized first; local references map to them. Validate all changes before accepting any. Filter rejected assistant changes before resolving dependent local references; drop an entire local creation group if all of its grounding was rejected.
- [ ] Implement event folding with `Map`, supersession within the same thread, and dependency pruning. A later status event whose creation or required fact was pruned cannot survive. Reordering independent changes must preserve IDs; sort a batch deterministically by operation dependencies and stable content before append.
- [ ] Extend allowed Story Settlement fields with optional `continuityEvents`, `directorReceipts`, `pendingDossiers`; initialize arrays in `createEmptyStorySettlement`. Define their item validators now, even though later tasks populate the latter two. Missing arrays read as empty; do not mutate older saves on load. For receipts require IDs, branch, request key, source contribution IDs, compiled instruction and dependency IDs. For pending dossiers require person ID, introduction sources, status and attempt count. Unknown fields, unknown sources, invalid revisions and mismatched branches fail validation.
- [ ] Add cases for a character claim, player commitment, rejected assistant creation followed by a player reference, duplicate open local reference, cross-thread fact correction, and resolved status sourced only from a player attempt. Use exact text in each fixture and expect rejection or omission according to spec section 4.
- [ ] Run `node tools/scripts/test-continuity-events.mjs`, `node tools/scripts/test-v1-story-settlement.mjs`, and `node tools/scripts/test-v1-story-settlement-contracts.mjs`.
- [ ] Commit scoped files with message `feat: add source-bound continuity events`.

### Task 2: Safe authored context and strict director request/result

**Files:**
- Create `src/story/director-context.mjs`, `src/story/story-director.mjs`.
- Create `tools/scripts/test-story-director-contract.mjs`, `tools/scripts/test-director-context.mjs`.
- Modify `src/generation/generation-roles.mjs`, `src/providers/directive-provider-settings.mjs`, `src/mission/v1/mission-contracts.mjs`.
- Reuse `src/story/episode-evaluator.mjs` validators and `src/ship/v1/ship-operational-packet.mjs`.

**Interfaces:**
- `createDirectorAuthoredContext({definition, missionState, shipMechanics, pendingTransition, pendingDutyReport}) -> {constraints,opportunities,coverage}`.
- `projectDirectorContinuity({events, missionId, referencedIds, maxCharacters}) -> {index,records}`.
- `createStoryDirectorRequest({envelope, sourcePair, authoredContext, continuity, currentScene, episodeReview}) -> Request`.
- `createStoryDirectorSchema(request) -> JSONSchema`.
- `parseStoryDirectorOutput(text, {request}) -> {ok,value?,errors?}`.
- `createStoryDirector({generationRouter,timeoutMs=60000}) -> async ({request,signal}) -> {ok,proposal?,reasonCode?,diagnostics?}`.

- [ ] Extend fixtures with `makeDirectorRequest()` using the complete DTO in spec section 3, `makeSourcePair()`, no existing threads and no pending review. Add valid output with exact envelope, `coverage:'complete'`, `threadChanges:makeChanges()`, `direction:{move:'respond-to-player',targetRef:null,newComplications:'avoid',requires:[]}`, `episodeReview:null`.
- [ ] Write tests:

```js
import assert from 'node:assert/strict';
import { makeDirectorRequest, makeDirectorOutput } from './story-director-test-fixtures.mjs';
import { parseStoryDirectorOutput } from '../../src/story/story-director.mjs';
const request = makeDirectorRequest();
const output = makeDirectorOutput(request);
assert.equal(parseStoryDirectorOutput(JSON.stringify(output), { request }).ok, true);
assert.equal(parseStoryDirectorOutput(JSON.stringify({ ...output,
  envelope: { ...output.envelope, baseRevision: 999 },
}), { request }).ok, false);
assert.equal(parseStoryDirectorOutput(JSON.stringify({ ...output,
  coverage: 'overflow',
}), { request }).ok, false);
assert.equal(parseStoryDirectorOutput(JSON.stringify({ ...output,
  direction: { ...output.direction, targetRef: 'invented.objective', move: 'surface-opportunity' },
}), { request }).ok, false);
```

- [ ] Run `node tools/scripts/test-story-director-contract.mjs`; expect failures before the modules exist.
- [ ] Build strict schemas with `additionalProperties:false` at every object. Reuse the nested review schema from `createEpisodeEvaluationPrompt({request: request.episodeReview}).jsonSchema` and validate its returned proposal with `parseEpisodeEvaluationProposal`; never accept arbitrary memory text instead. Represent null with `{type:'null'}`. Validate response envelope using existing `canonicalJson`, quotes with Task 1, and target references against input plus same-response local thread creations.
- [ ] Implement the model request with this actual routing block inside the returned director function:

```js
const generation = await generationRouter.generate('storyDirector', {
  kind: 'directive.storyDirectorGeneration.v1',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: JSON.stringify(request) },
  ],
  systemPrompt,
  prompt: `${systemPrompt}\n\n${JSON.stringify(request)}`,
  jsonSchema: createStoryDirectorSchema(request),
  maxTokens: 8192,
  parameters: { temperature: 0.1, top_p: 0.9, max_tokens: 8192 },
}, { signal, timeoutMs, allowVisibleOutputRetry: false });
```

`systemPrompt` is a module constant containing spec sections 4-6's extraction, authority and memory rules. The function parses `generation.response.text`/supported structured response shapes with the existing structured-output parser. Unavailable transport, timeout, overflow or invalid JSON returns `ok:false` with a specific reason; no narration is produced by this role.

- [ ] Add the role to the registry with Reasoning routing, blocking true, 60-second timeout, `mayProposeState:false`, `mayInjectPrompt:false`, and structured output. State proposals are interpreted by runtime, never direct model writes. Remove the standalone `episodeEvaluator` role only in Task 6 after callers are converted.
- [ ] Compile opportunities from `definition.objectives` whose corresponding `missionState.objectives[id]` are visible and nonterminal. Copy only `id`, `playerText`, existing predicate references and runtime permission flags; do not serialize private facts. Use `shipMechanics.constraints` and capability limits from the existing player-safe operational packet. Canonical reports/transitions remain separate typed targets; their text must not be rewritten by the director.
- [ ] Add optional `directorGuidance:{focusText,avoidText,constraintRefs}` validation to mission definitions. Text is explicitly player-safe; constraint refs must resolve to already-defined runtime constraints. Do not add new mechanics through this property. `coverage:'partial'` is mandatory while unrestricted authoring prose remains outside the compiled context.
- [ ] Add context tests for a definition with no `scenePacing`, a hidden objective, a resolved objective, required thread-index overflow and a currently unavailable transition. Assert no secrets or unavailable target text appear. Run the two new tests and existing campaign/mission contract tests.
- [ ] Commit `feat: define the bounded story director`.

### Task 3: Extract pure settlement and episode-review preparation

**Files:**
- Modify `src/runtime/v1-state-spine.mjs`.
- Create `tools/scripts/test-v1-spine-preparation.mjs`.
- Reuse fixtures from `tools/scripts/v1-test-fixtures.mjs` and existing state-spine/episode-evaluator tests.

**Interfaces:**
- Add `prepareAcceptedPair(input)` and `prepareEpisodeReview(input)` to `createV1StateSpine` return value. Both return `{candidateState,proposal,result}` and make no gateway/persist calls.
- Existing `settleAcceptedPair(input)` and `applyEpisodeReview(input)` continue returning their current result shapes.

- [ ] Copy one valid settlement setup and one valid review setup from the existing spine runtime tests into the new test. Capture state before preparation and wrap the gateway to count `applyProposal` calls. Test both paths with the following assertion helper:

```js
import assert from 'node:assert/strict';
async function assertPreparationIsPure({ prepare, input, getState, getCommits }) {
  const before = structuredClone(getState());
  const calls = getCommits();
  const prepared = await prepare(input);
  assert.deepEqual(getState(), before);
  assert.equal(getCommits(), calls);
  assert.equal(prepared.candidateState.stateCustody.revision, before.stateCustody.revision);
  return prepared;
}
```

The two test inputs must exercise a real effect and a relationship update, not an empty no-op. Reuse the exact authored IDs from the existing fixtures; do not invent passing state shapes.

- [ ] Run `node tools/scripts/test-v1-spine-preparation.mjs`; expect missing method failures.
- [ ] Rename the existing calculation portions of `settleAcceptedPair` and `applyEpisodeReview` into preparation methods. Retain source, predicate, revision and contract validation. Replace their final gateway call with `{candidateState,proposal,result}`. At early no-op returns use `proposal:null`, the unchanged state, and the existing result. Do not perform episode-review attempt persistence inside preparation.
- [ ] Implement the wrappers with this control flow (using the corresponding prepare method):

```js
async function settleAcceptedPair(input) {
  const prepared = await prepareAcceptedPair(input);
  if (!prepared.proposal) return prepared.result;
  const committed = await stateDeltaGateway.applyProposal(prepared.proposal);
  return { ...prepared.result, campaignState: committed.campaignState };
}

async function applyEpisodeReview(input) {
  const prepared = await prepareEpisodeReview(input);
  if (!prepared.proposal) return prepared.result;
  const committed = await stateDeltaGateway.applyProposal(prepared.proposal);
  return { ...prepared.result, campaignState: committed.campaignState };
}
```

- [ ] Test wrapper equivalence against the old expected mission/time/relationship/transition results. Verify a hard-boundary candidate includes correct journey state while custody stays unchanged until commit. Run `node tools/scripts/test-v1-state-spine-runtime.mjs`, `node tools/scripts/test-v1-episode-evaluator.mjs`, and `node tools/scripts/test-v1-spine-preparation.mjs`.
- [ ] Commit `refactor: separate state preparation from commit`.

### Task 4: Parallel analysis, exact-key reuse and blocked recovery

**Files:**
- Create `src/runtime/turn-analysis-key.mjs`, `src/runtime/parallel-turn-analysis.mjs`.
- Create `tools/scripts/test-parallel-turn-analysis.mjs`.
- Modify `src/runtime/accepted-pair-recovery-state.mjs` to track a failed role/turn key without weakening its current source fingerprint rules.

**Interfaces:**
- `createTurnAnalysisKey` and `createParallelTurnAnalysis` exactly as in spec sections 3 and 8.
- `analysis.run({key,interpreterRequest,directorRequest,signal}) -> Promise<{ok,interpreter?,director?,reasonCode?}>`.
- `analysis.forget(key)` and `analysis.clear()` operate only after caller cancellation of matching flights.

- [ ] Add a deferred-promise fixture and a test proving both requests start before either finishes:

```js
import assert from 'node:assert/strict';
import { createParallelTurnAnalysis } from '../../src/runtime/parallel-turn-analysis.mjs';
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const i = deferred();
const d = deferred();
const started = [];
let interpreterCalls = 0;
let directorCalls = 0;
const analysis = createParallelTurnAnalysis({
  interpret: async () => { started.push('i'); interpreterCalls++; return i.promise; },
  direct: async () => { started.push('d'); directorCalls++; return d.promise; },
});
const args = { key: 'test', interpreterRequest: {}, directorRequest: {} };
const result = analysis.run(args);
assert.deepEqual(started, ['i', 'd']);
assert.equal(analysis.run(args), result);
i.resolve({ ok: true, interpretation: {} });
d.resolve({ ok: false, reasonCode: 'director-timeout' });
assert.equal((await result).ok, false);
await analysis.run(args);
assert.equal(interpreterCalls, 1);
assert.equal(directorCalls, 2);
```

- [ ] Run `node tools/scripts/test-parallel-turn-analysis.mjs`; expect missing module failure. Install the complete spec kernels.
- [ ] Add independent cases for abort-before-start, abort during both roles, invalid director output, interpreter failure with valid director, changed key, duplicate generation events and preserving the original request objects. Test returned `ok` cannot become true with one missing/failed role. A resolved failed promise in the example remains failed on retry; add a separate counter-based stub that succeeds on its second invocation and assert overall recovery succeeds.
- [ ] Integrate per-role budgets in the caller contract: initial run one automatic attempt; a Retry gesture permits one failed-role request. Do not loop on model invalidity or timeout. Emit `blockedRoles` in recovery UI state from failed result names; keep valid results only in the coordinator's current-key cache.
- [ ] Run the new test plus `node tools/scripts/test-accepted-pair-recovery-state.mjs` and `node tools/scripts/test-sillytavern-generation-client.mjs`.
- [ ] Commit `feat: coordinate parallel turn analysis`.

### Task 5: One reconciled state commit and validated narration direction

**Files:**
- Create `src/runtime/turn-state-reconciler.mjs`, `src/narration/director-instructions.mjs`.
- Modify `src/runtime/v1-mission-runtime.mjs`.
- Create `tools/scripts/test-turn-state-reconciliation.mjs`, `tools/scripts/test-director-instructions.mjs`.

**Interfaces:**
- `createTurnCommit({before,after,turnKey})` and `compileDirectorInstruction({direction,eligibleTargets})`: spec kernels.
- `prepareReconciledTurn({baseState,analysis,prepareReview,preparePair,materializeContinuity,buildTargets,turnKey}) -> Promise<{candidateState,commitProposal,instruction}>`.
- Injected callbacks: `prepareReview(state, directorResult) -> Promise<State>`, `preparePair(state, interpreterResult) -> Promise<{state,sourcePair,assistantAccepted,contributionIds}>`, `materializeContinuity(state,pair,directorResult) -> Promise<State>`, `buildTargets(state,pair,directorResult) -> Map`.
- Export runtime preparation helpers from `v1-mission-runtime.mjs` as `captureAcceptedPairAnalysis({runtimeAssets,snapshot})` and `prepareInterpretedPair({captured,interpreted,campaignState})`. The first produces `interpreterInput:{candidatePacket,sourcePair,timeContext,peopleContext}`, `interpreterRequest:createMissionAcceptedPairInterpretationPrompt(interpreterInput)`, source/contribution identity and the captured state without a model call. The second performs the existing deterministic materialization and Task 3 preparation without dossier transport or live commit. Create one coordinator per captured turn: its interpreter adapter closes over `captured.interpreterInput` and invokes the existing interpreter with those values plus `signal`. Key the coordinator using the compiled `captured.interpreterRequest`; rebuilding that prompt inside the existing interpreter must produce identical bytes. This preserves the existing interpreter API and prevents a request DTO from accidentally being passed as candidate arguments.

- [ ] Write the direction test:

```js
import assert from 'node:assert/strict';
import { compileDirectorInstruction } from '../../src/narration/director-instructions.mjs';
const direction = { move: 'surface-opportunity', targetRef: 'opportunity.1',
  requires: ['handover-complete'], newComplications: 'avoid' };
const eligibleTargets = new Map([['opportunity.1', {
  id: 'opportunity.1', playerSafeText: 'Discuss the outstanding assignment.',
  conditions: new Set(),
}]]);
assert.equal(compileDirectorInstruction({direction,eligibleTargets}).move, 'respond-to-player');
eligibleTargets.get('opportunity.1').conditions.add('handover-complete');
assert.equal(compileDirectorInstruction({direction,eligibleTargets}).move, 'surface-opportunity');
```

- [ ] Add transaction tests using `createAshesInitialState`, a real state gateway and the prepare callbacks. Count persistence calls and assert zero calls until both analyses are valid, exactly one on success, and full rollback on persistence failure. Supply a retrospective relationship update and a new accepted pair together; verify both survive without changing the original analysis envelope.
- [ ] Install the spec's commit and instruction kernels. Implement the orchestrating function:

```js
export async function prepareReconciledTurn({ baseState, analysis, prepareReview,
  preparePair, materializeContinuity, buildTargets, turnKey }) {
  if (!analysis.ok || !analysis.interpreter?.ok || !analysis.director?.ok) {
    throw new TypeError('turn-analysis-incomplete');
  }
  let state = await prepareReview(structuredClone(baseState), analysis.director);
  const pair = await preparePair(state, analysis.interpreter);
  state = await materializeContinuity(pair.state, pair, analysis.director);
  const eligibleTargets = buildTargets(state, pair, analysis.director);
  const instruction = compileDirectorInstruction({
    direction: analysis.director.proposal.direction, eligibleTargets,
  });
  return { candidateState: state, instruction,
    commitProposal: createTurnCommit({before:baseState,after:state,turnKey}) };
}
```

Place imports for the Task 5 helpers at the top of the module. Before returning, the production function must append the validated director receipt to `state.storySettlement.directorReceipts`, then call the existing campaign-state validator. The receipt uses the captured key and accepted pair contribution IDs, contains `instruction`, and depends on the selected thread/opportunity source IDs; its exact shape is Task 1's contract. Perform this append before computing `createTurnCommit`, not after committing.

- [ ] Extract `captureAcceptedPairAnalysis` from the current lines that construct candidates, People/time context and source identity. Keep current mission/run resolution and source integrity checks. Move the existing deterministic code following interpretation into `prepareInterpretedPair`; preserve prior-receipt `gateScenePacingClaims`, accepted-time preparation, report custody, Command Bearing, ship/Cohesion proposals and hard transitions. Replace the old call to `spine.settleAcceptedPair` with `spine.prepareAcceptedPair`. Any preparation helper returning failure blocks the whole turn.
- [ ] Construct `prepareReview` by validating the director's embedded review against captured R, then running Task 3's `prepareEpisodeReview` on that draft. A missing request requires null output; abstain returns unchanged state. Pair preparation sees the reviewed draft but the original evidence/candidate envelope. Do not mutate the live getState closure or re-label revisions to bypass validation.
- [ ] Add assertions that director guidance cannot authorize previous prose completion, that rejected assistant thread groups are absent, that a hard transition drops old-mission direction, and that unknown targets cannot enter player text. Run both new tests plus the existing scene-pacing authorization and state-spine runtime tests.
- [ ] Commit `feat: reconcile evidence and direction atomically`.

### Task 6: Native turn integration, recovery UI and evaluator retirement

**Files:**
- Modify `src/runtime/runtime-app.mjs`, `src/runtime/v1-mission-runtime.mjs`, `src/runtime/turn-progress.mjs`.
- Modify `src/hosts/sillytavern/runtime-bridge.mjs`, `src/hosts/sillytavern/shell-events.js`, `src/hosts/sillytavern/turn-activity-indicator.js`, `src/ui/settlement-retry-dialog.js`.
- Modify `src/generation/generation-roles.mjs` and callers of `episode-review-scheduler.mjs`.
- Create `tools/scripts/test-story-director-runtime.mjs`.

**Interfaces:**
- Normal runtime path: capture -> `analysis.run` -> `prepareReconciledTurn` -> gateway commit -> `syncPrompt`.
- `retryPendingAcceptedPairSettlement()` retains its external host API and uses the cached successful role for the exact captured turn.
- Add progress stage `directing-story`; display parallel active phases without resetting or completing another phase's indicator.

- [ ] Build runtime tests with fake host generation promises. Hold director pending while resolving interpretation; assert native narration count stays zero. Then resolve director, assert one save and one narrator handoff. Repeat with director timeout, schema failure, persistence failure and prompt installation failure.
- [ ] Run `node tools/scripts/test-story-director-runtime.mjs`; expect the held-director assertion to fail on the old runtime.
- [ ] Wire Task 4 and Task 5 at `settleSnapshot`/`settleAcceptedPair`, retaining the existing serialized timeline mutation ownership. Both model requests run concurrently within one captured turn; no background writer commits while it is active. Source/chat changes abort before any commit. Abort and drain old flights before clearing/reusing their keys. Clear caches after committed prompt installation or after cancellation; retain successful analysis on technical retry only while inputs are identical.
- [ ] Change active-bound exception handling in the host interceptor. Use the already-observed binding check, not the mere presence of a runtime object. The error result must have this shape:

```js
const blocked = {
  handled: true,
  abortDefaultGeneration: true,
  responseStrategy: 'blockAndRetry',
  settlementError: {
    code: 'DIRECTIVE_TURN_ANALYSIS_BLOCKED',
    reasonCode: 'director-unavailable',
    persistenceAttempts: 0,
  },
};
```

Use the actual failure reason and count in production. Disabled/unbound chats preserve pass-through. In the catch path, call the supplied host `abort(false)` for confirmed bound failures; returning a flag from a catch without actually invoking abort is insufficient if the normal success branch is bypassed.

- [ ] Move valid compiled direction into `createV1RuntimePromptPacket`. Replace blanket chat canon with spec section 6 authority ordering. Install only the existing Directive prompt key; do not overwrite other extensions. Keep exact report/opening/transition handling.
- [ ] Remove automatic `scheduleEpisodeReviewFlight` calls from generation-end handling and remove the standalone evaluator transport role/call from ordinary runtime. Preserve generation-end metadata attachment and footer normalization. Keep reusable episode request/proposal validation modules; delete the now-unused scheduler only after its callers and tests are replaced by the coordinator's cadence tests.
- [ ] Gate normal/continue/swipe/regenerate paths. For regeneration, reuse settled evidence only when applicable but require direction keyed to the actual generation target; do not treat a cached unrelated receipt as approval. Opening paths retain the opening director and receive shared narration constraints.
- [ ] Run the new runtime test plus `test-turn-progress-runtime.mjs`, `test-turn-progress-app.mjs`, `test-v1-runtime-app.mjs`, `test-opening-runtime.mjs`, and the scene-pacing tests. Commit `feat: require direction before native narration`.

### Task 7: Source invalidation, save/load and branch custody

**Files:**
- Modify `src/story/story-settlement.mjs`, `src/runtime/v1-branch-reconstruction.mjs`, `src/runtime/timeline-transaction-service.mjs`.
- Modify `src/storage/v1-storage-repository.mjs` only if new optional data requires explicit hydration handling; do not add another save store.
- Create `tools/scripts/test-continuity-lineage.mjs`.

**Interfaces:** Task 1's prune/rebind functions and Task 1 receipt/job validators. Existing save hydration and branch APIs remain unchanged externally.

- [ ] Test a thread creation sourced by A, amendment sourced by B and resolution sourced by C. Remove A and assert the entire derived thread disappears; remove C and assert it reopens; remove an unrelated contribution and assert it remains unchanged. Test exact same-pair replay produces no additional event.
- [ ] Add a branch test that takes the cutoff after B and verifies the child has no C resolution, all child event/source references resolve, and the parent remains byte-equivalent. Use `rebindContinuityEvents` rather than string replacement on arbitrary narrative text.
- [ ] Run `node tools/scripts/test-continuity-lineage.mjs`; expect current source/reconstruction paths to omit these fields or retain invalid dependencies.
- [ ] Call continuity pruning from the existing invalidation and descendant-pruning paths. Prune director receipts whose required sources/targets disappear; remove pending dossier jobs whose introductions were removed. Extend branch reconstruction after accepted contribution IDs are rebound, passing the exact contribution map into Task 1's rebind function.
- [ ] Persist/load fixtures through existing segmented repository APIs. Assert an older save with absent arrays remains readable without disk writes until a real new commit. Assert new fields survive save/load and hashes, and malformed fields fail validation. Do not create a historical backfill request.
- [ ] Run the new test and existing `test-v1-branch-reconstruction.mjs`, `test-v1-timeline-storage.mjs`, `test-v1-storage-repository.mjs`, `test-v1-state-delta-codec.mjs`. Commit `feat: preserve director continuity across timelines`.

### Task 8: Defer dossier enrichment without changing accepted public facts

**Files:**
- Create `src/people/dossier-enrichment-queue.mjs`, `tools/scripts/test-dossier-enrichment-queue.mjs`.
- Modify `src/runtime/v1-mission-runtime.mjs`, `src/runtime/runtime-app.mjs`, `src/people/accepted-pair-people.mjs`.
- Retain `src/people/people-dossier-author.mjs` and existing People projection interfaces.

**Interfaces:**
- `createDossierEnrichmentQueue({author,stageResult}) -> {run(job),cancel(jobId),clear()}`; each job has accepted person ID, introduction sources and public context.
- `mergeMissingDossierFields({current,generated}) -> {patch,conflicts}`; permitted fields are the existing dossier field list, with `personId`/`displayName` identity validated separately.
- No queue method commits directly; the runtime merges staged results under its timeline mutation boundary.

- [ ] Write a test that a stalled author does not stall the next narration gate, and a value learned while authoring is not overwritten. The merge assertion is:

```js
import assert from 'node:assert/strict';
import { mergeMissingDossierFields } from '../../src/people/dossier-enrichment-queue.mjs';
const result = mergeMissingDossierFields({
  current: { species: 'Human', birthplace: null },
  generated: { species: 'Vulcan', birthplace: 'Earth' },
});
assert.deepEqual(result.patch, { birthplace: 'Earth' });
assert.deepEqual(result.conflicts, ['species']);
```

- [ ] Run the new test to see the missing-module failure. Implement allowed-field filtering and missing-only merge. A blank generated field cannot clear an accepted value. Validate exact identity and surviving introduction source before any field merge.
- [ ] Replace the awaited `peopleDossierAuthor` call in pair settlement with a persisted pending job and immediate minimal People events. Drain only at safe idle opportunities by default. Never commit an enrichment result between capture and reconciliation of another turn; stage it instead. Abort/discard jobs after source removal or branch switch.
- [ ] Keep one automatic attempt per job and technical retry independent of narration. Test that profile settings are not changed, duplicate jobs join, source cancellation drops output, and conflicting fields do not become `publicFactLearned` events. Run existing `test-people-dossier-author.mjs` and `test-v1-accepted-pair-people.mjs` with adjusted no-critical-path expectations.
- [ ] Commit `perf: defer optional contact biographies`.

### Task 9: Prompt corpus, mission coverage and role regression

**Files:**
- Create `tests/fixtures/story/v1/director-corpus.json`, `tools/scripts/test-director-corpus.mjs`.
- Read all 13 mission definitions under `packages/bundled/breckenridge/v1` for coverage. Initial implementation derives context from their existing data and does not invent per-mission guidance to fill uncovered prose. The optional guidance schema from Task 2 supports later authored entries without requiring them for global direction.
- Modify `src/mission/v1/accepted-pair-interpreter.mjs` for the narrowly scoped prompt ownership edit.
- Modify `tools/scripts/run-alpha-gate.mjs` to include every new regression script and retire the old scheduler-only check once unused.

**Interfaces:** Existing interpreter output schema unchanged. Director corpus cases use Task 2 request/output contracts and explicit expected source/target/acceptance outcomes.

- [ ] Add corpus cases for Ravenna, ordinary scenery, an NPC's disputed claim, a player attempt, a supported delegation, an unavailable authored opportunity, a player-led diversion, a second complication after an avoid instruction, and a scene without pacing metadata. Each case contains literal source text, expected extracted changes or empty output, and an expected allowed move. Include valid negative outcomes; do not score all improvisation as failure.

The current exact mission filenames are `prelude-a-ship-underway.mission-v1.json`, `chapter-1-the-empty-convoy.mission-v1.json`, `chapter-2-false-colors.mission-v1.json`, `chapter-3-dead-letters.mission-v1.json`, `chapter-4-the-colony-that-stayed.mission-v1.json`, `chapter-5-old-lessons.mission-v1.json`, `chapter-6-the-cost-of-knowing.mission-v1.json`, `chapter-7-a-peace-of-their-own.mission-v1.json`, `chapter-8-the-last-directive.mission-v1.json`, `epilogue-the-terms-we-keep.mission-v1.json`, `open-orders-1-work-worth-doing.mission-v1.json`, `open-orders-2-what-survives.mission-v1.json`, and `open-orders-3-before-the-lamps-go-out.mission-v1.json`. Discover future additions from the same runtime registry; do not hard-code the count as an exclusion rule.
- [ ] Add this atmospheric negative-control fixture:

```json
{
  "id": "atmosphere-is-not-an-obligation",
  "previousAssistant": "The corridor smelled faintly of fresh paint. Whitaker waited beside the viewport.",
  "currentPlayer": "I greet the captain.",
  "expectedChanges": [],
  "allowedMove": "respond-to-player"
}
```

- [ ] Run the deterministic corpus validator and authoring traversal. Enumerate every bundled mission definition and assert context building succeeds, hidden objective text is excluded, optional guidance refs resolve, and lack of pacing does not disable direction. Record uncovered prose constraints honestly; do not fill them with generated supposed canon.
- [ ] Rewrite interpreter opening purpose as specified, keeping all existing evidence/time/People/participation constraints. Do not move participation receipts to the director. Run `test-v1-accepted-pair-interpreter.mjs`, `test-v1-accepted-pair-time.mjs`, `test-scene-pacing-interpreter.mjs`, `test-scene-pacing-authorization.mjs` and `test-director-corpus.mjs`.
- [ ] Add the new script names to the gate's `checks` array. Run `npm.cmd test` once after all implementation tasks are complete; resolve actual failures without disabling existing checks or broadly rewriting unrelated fixtures.
- [ ] Commit `test: cover story direction and campaign boundaries`.

### Task 10: Verify integrated behavior and document measured limits

**Files:**
- Update `src/story/README.md`, `src/storage/README.md` and the investigation report with implemented behavior and measured evidence.
- Add `docs/testing/parallel-story-director-validation.md` with exact tested source revision, provider route, request counts, latency and limits.

**Interfaces:** Existing diagnostics plus per-role start/end timestamps, request key, physical-attempt count, model/provider identity and usage. Never log credentials or hidden reasoning.

- [ ] Run `npm.cmd test` if Task 9 required fixes after its successful gate; otherwise retain that exact successful result and avoid a redundant rerun. Run the browser runtime safety test if new production dependencies/imports changed after the gate.
- [ ] Prove cancellation and simultaneous requests using deterministic fake transports first. Assert native narration invocation occurs after both successful role-end timestamps, that no automatic `episodeEvaluator` request follows narration, and that a pending dossier job does not delay the next request.
- [ ] With separately scoped live authorization, run an explicitly disposable campaign using the ordinary extension workflow. Capture starts/ends and usage for ordinary turns, a due retrospective review, a named NPC introduction, a director failure/retry, a swipe and a branch. Do not install into or modify the active default-user save as a shortcut. If live authorization is absent, finish all local work and mark live proof pending; do not claim host concurrency was measured.
- [ ] Compare sequential dependency predictions with actual overlap: analysis wait should track the slower of interpreter and director, not their sum. Report observed overhead rather than declaring it free. Inspect native sampler/profile ownership during simultaneous analysis.
- [ ] Record semantic quality separately from contract checks: extraction misses, false consequential additions, ignored guidance, repeated nudges, relationship/memory losses and unintended campaign effects. A syntactically valid director result is not proof of story quality.
- [ ] Complete a final scoped diff review. Preserve user save data and unrelated files, and list any unresolved correctness or live-proof limitation. Commit `docs: record director architecture validation`.

## Coverage checklist for the implementer

- [ ] Spec 1-2 ownership, constraints and count: Tasks 5, 6, 8, 10.
- [ ] Spec 3 immutable inputs and cache keys: Tasks 2, 4, 6.
- [ ] Spec 4 extraction, storage, revision and source semantics: Tasks 1, 7, 9.
- [ ] Spec 5 safe authored context, bounded direction and overflow: Tasks 2, 5, 9.
- [ ] Spec 6 prompt ownership: Tasks 2, 6, 9.
- [ ] Spec 7 retrospective dependency and one commit: Tasks 3, 5, 6.
- [ ] Spec 8 both-role gate, cancellation and retry: Tasks 4, 6, 10.
- [ ] Spec 9 replay, branches and source recovery: Task 7.
- [ ] Spec 10 nonblocking biographies: Task 8.
- [ ] Spec 11 automated and live acceptance: Tasks 9-10.

## Handoff

Review the spec's chosen bounds, retrospective lag, forward-only initialization and deferred biographies before execution. Implement in task order; do not install the intermediate architecture. Execution may be inline with checkpoints or explicitly delegated under the selected execution skill. No additional product questionnaire is required by this plan.

## Document verification

The design and plan were self-reviewed against the source contracts on 2026-09-08. All 18 JavaScript blocks passed Node module syntax checking; the JSON example parsed. Five complete design kernels were executed against small fixtures covering quote validation, stable/changed request keys, parallel start and successful-role retry reuse, direction prerequisite filtering, and root-scoped commit construction. This checks those snippets, not the unimplemented feature or live provider behavior. Implementation tests above still need to be written and executed during the corresponding tasks.
