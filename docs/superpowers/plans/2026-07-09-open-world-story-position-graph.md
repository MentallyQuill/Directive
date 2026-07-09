# Open World Story Position Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Saga-grade bounded story-position management for Directive's nonlinear open-world campaigns.

**Architecture:** Runtime builds a `StoryContextIndex`, derives bounded `StoryPositionCandidate` rows, asks model roles to select and review candidates, asks model roles to plan and review append-only story events, then code appends structurally valid events and materializes `ActiveStoryProjection`. Story judgment stays in model calls; code handles custody, hashes, id equality, append-only persistence, and projection mechanics.

**Tech Stack:** JavaScript ES modules, Directive generation router, structured JSON model calls, existing runtime campaign state, Node test scripts, `npm.cmd test`.

## Global Constraints

- Pre-alpha: no legacy compatibility required.
- Models own story judgment; code owns source custody and durable storage mechanics.
- Do not use keyword triggers to select candidates.
- Do not model story position as one linear timeline.
- Do not let model output directly mutate campaign state.
- Do not persist raw prompts, raw provider output, raw player text, hidden state, provider reasoning, cookies, CSRF tokens, API keys, private NPC thoughts, raw relationship values, or raw hidden pressure values.
- Runtime graph bridge nodes must be source-bound, branch-scoped, and reversible through transaction repair.

---

## File Structure

- Create: `src/story/story-position-contracts.mjs`
  - Constants and normalizers for story graph, candidates, selections, reviews, delta plans, and active projection.
- Create: `src/story/story-ledger.mjs`
  - Append-only event helpers and active projection materializer.
- Create: `src/story/story-context-index.mjs`
  - Builds `StoryContextIndex` and `StoryPositionCandidate` rows from package data, mission graph, campaign state, ledger, and source frame.
- Create: `src/directors/mission-director-story-graph-spine.mjs`
  - Runs story-position selection/review and story-delta planning/review.
- Modify: `src/directors/mission-director-frame.mjs`
  - Add `storyContextIndex`, `storyCandidates`, `activeStoryProjection`, and compact committed history.
- Modify: `src/directors/mission-director-model-contracts.mjs`
  - Replace freeform story-position normalizer with bounded selection/review contracts or bridge to new contract file.
- Modify: `src/directors/mission-director-model-spine.mjs`
  - Use bounded story graph spine before outcome plan; attach story delta diagnostics to turn packet.
- Modify: `src/generation/generation-roles.mjs`
  - Add `missionDirectorStoryPositionReviewer`, `missionDirectorStoryDeltaPlanner`, `missionDirectorStoryDeltaReviewer`.
- Modify: `src/generation/model-call-authority-matrix.mjs`
  - Add authority matrix rows for new story graph roles.
- Modify: `src/runtime/director-turn-runtime.mjs`
  - Commit reviewed story events during provisional/commit flow using existing transaction boundaries.
- Modify: `src/runtime/runtime-app.mjs`
  - Ensure rerun/branch preview passes branch-scoped projection into graph spine.
- Test: `tools/scripts/test-story-position-contracts.mjs`
- Test: `tools/scripts/test-story-ledger-projection.mjs`
- Test: `tools/scripts/test-story-context-index.mjs`
- Test: `tools/scripts/test-mission-director-story-graph-spine.mjs`
- Test: update `tools/scripts/test-mission-director-model-spine.mjs`
- Test: update `tools/scripts/test-runtime-stage18-rerun-branch-recovery.mjs`
- Test: update `tools/scripts/run-alpha-gate.mjs`

---

### Task 1: Add Story Position Contracts

**Files:**
- Create: `src/story/story-position-contracts.mjs`
- Create: `tools/scripts/test-story-position-contracts.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `STORY_CONTEXT_INDEX_KIND`, `STORY_POSITION_CANDIDATE_KIND`, `STORY_POSITION_SELECTION_KIND`, `STORY_POSITION_REVIEW_KIND`, `STORY_DELTA_PLAN_KIND`, `STORY_DELTA_REVIEW_KIND`, `ACTIVE_STORY_PROJECTION_KIND`
- Produces: `normalizeStoryPositionSelection(value, { sourceHash, candidateIds })`
- Produces: `normalizeStoryPositionReview(value, { sourceHash, selectionHash })`
- Produces: `normalizeStoryDeltaPlan(value, { sourceHash, selectionHash, outcomePlanHash, knownNodeIds, knownFactIds, knownThreadIds })`
- Produces: `normalizeStoryDeltaReview(value, { sourceHash, deltaPlanHash })`

- [ ] **Step 1: Write failing contract test**

Create `tools/scripts/test-story-position-contracts.mjs`:

```js
import assert from 'node:assert/strict';
import {
  STORY_DELTA_PLAN_KIND,
  STORY_DELTA_REVIEW_KIND,
  STORY_POSITION_REVIEW_KIND,
  STORY_POSITION_SELECTION_KIND,
  normalizeStoryDeltaPlan,
  normalizeStoryDeltaReview,
  normalizeStoryPositionReview,
  normalizeStoryPositionSelection
} from '../../src/story/story-position-contracts.mjs';

const sourceHash = 'frame.hash.1';
const selectionHash = 'selection.hash.1';
const outcomePlanHash = 'outcome.hash.1';
const deltaPlanHash = 'delta.hash.1';
const candidateIds = [
  'candidate.hesperus.evidenceCustody.active',
  'candidate.hesperus.ownerInquiry.available'
];

const selection = normalizeStoryPositionSelection({
  kind: STORY_POSITION_SELECTION_KIND,
  schemaVersion: 1,
  sourceHash,
  primaryCandidateId: 'candidate.hesperus.evidenceCustody.active',
  secondaryCandidateIds: ['candidate.hesperus.ownerInquiry.available'],
  route: 'outcome',
  confidence: 0.86,
  evidenceRefs: ['message:18', 'storyEvent.outcome.stage18.hesperus.001'],
  ignoredStaleSetup: ['Original command decision is completed.'],
  continuityGuards: {
    mustPreserve: ['Evidence was preserved.'],
    mustNotReestablish: ['Original Hesperus command decision as pending.']
  },
  unresolved: []
}, { sourceHash, candidateIds });

assert.equal(selection.ok, true);
assert.equal(selection.value.primaryCandidateId, 'candidate.hesperus.evidenceCustody.active');

const unknownCandidate = normalizeStoryPositionSelection({
  kind: STORY_POSITION_SELECTION_KIND,
  schemaVersion: 1,
  sourceHash,
  primaryCandidateId: 'candidate.unknown',
  route: 'outcome',
  confidence: 0.8,
  evidenceRefs: ['message:18']
}, { sourceHash, candidateIds });
assert.equal(unknownCandidate.ok, false);
assert.equal(unknownCandidate.error.code, 'unknown_candidate_id');

const review = normalizeStoryPositionReview({
  kind: STORY_POSITION_REVIEW_KIND,
  schemaVersion: 1,
  sourceHash,
  selectionHash,
  approved: true,
  requiredAction: 'approve',
  risk: 'low',
  reasons: [],
  rejectedCandidateIds: [],
  staleHistoryRisk: false,
  forbiddenAssertionRisk: false
}, { sourceHash, selectionHash });
assert.equal(review.ok, true);

const delta = normalizeStoryDeltaPlan({
  kind: STORY_DELTA_PLAN_KIND,
  schemaVersion: 1,
  sourceHash,
  selectionHash,
  outcomePlanHash,
  eventDrafts: [{
    eventType: 'missionOutcomeCommitted',
    nodeTransitions: [
      { nodeId: 'hesperus.ownerInquiry', to: 'active', reason: 'Player ordered formal inquiry.' }
    ],
    factTransitions: [
      { factId: 'fact.hesperus.inspectionFalsified', to: 'known' }
    ],
    threadTransitions: [
      { threadId: 'thread.hesperus.ownerInquiry', to: 'active' }
    ],
    commandLogRefs: []
  }],
  rejectedAssertions: ['Owner convicted is not yet true.'],
  diagnostics: { reasonerUsed: true, uncertainties: [] }
}, {
  sourceHash,
  selectionHash,
  outcomePlanHash,
  knownNodeIds: ['hesperus.ownerInquiry'],
  knownFactIds: ['fact.hesperus.inspectionFalsified'],
  knownThreadIds: ['thread.hesperus.ownerInquiry']
});
assert.equal(delta.ok, true);

const badFact = normalizeStoryDeltaPlan({
  kind: STORY_DELTA_PLAN_KIND,
  schemaVersion: 1,
  sourceHash,
  selectionHash,
  outcomePlanHash,
  eventDrafts: [{
    eventType: 'missionOutcomeCommitted',
    nodeTransitions: [],
    factTransitions: [{ factId: 'fact.future.conviction', to: 'known' }],
    threadTransitions: [],
    commandLogRefs: []
  }]
}, {
  sourceHash,
  selectionHash,
  outcomePlanHash,
  knownNodeIds: [],
  knownFactIds: ['fact.hesperus.inspectionFalsified'],
  knownThreadIds: []
});
assert.equal(badFact.ok, false);
assert.equal(badFact.error.code, 'unknown_fact_id');

const deltaReview = normalizeStoryDeltaReview({
  kind: STORY_DELTA_REVIEW_KIND,
  schemaVersion: 1,
  sourceHash,
  deltaPlanHash,
  approved: true,
  requiredAction: 'approve',
  risk: 'low',
  reasons: [],
  forbiddenPastAssignment: false,
  futureFactLeak: false,
  missingBranchAuthority: false
}, { sourceHash, deltaPlanHash });
assert.equal(deltaReview.ok, true);

console.log('story position contracts passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools/scripts/test-story-position-contracts.mjs
```

Expected: FAIL with module not found for `src/story/story-position-contracts.mjs`.

- [ ] **Step 3: Implement contracts**

Create `src/story/story-position-contracts.mjs`:

```js
export const STORY_CONTEXT_INDEX_KIND = 'directive.storyContextIndex.v1';
export const STORY_POSITION_CANDIDATE_KIND = 'directive.storyPositionCandidate.v1';
export const STORY_POSITION_SELECTION_KIND = 'directive.storyPositionSelection.v1';
export const STORY_POSITION_REVIEW_KIND = 'directive.storyPositionReview.v1';
export const STORY_DELTA_PLAN_KIND = 'directive.storyDeltaPlan.v1';
export const STORY_DELTA_REVIEW_KIND = 'directive.storyDeltaReview.v1';
export const ACTIVE_STORY_PROJECTION_KIND = 'directive.activeStoryProjection.v1';

const ROUTES = new Set(['outcome', 'hostContinue', 'pause', 'clarify', 'openWorld', 'sideScene', 'aftermath']);
const REVIEW_ACTIONS = new Set(['approve', 'pause', 'retryStoryPosition', 'retryOutcomePlan', 'retryDeltaPlan', 'hostContinue']);
const RISKS = new Set(['low', 'medium', 'high']);
const NODE_STATUSES = new Set(['unseen', 'available', 'active', 'completed', 'closed', 'blocked', 'stale', 'rerunOnly']);
const FACT_STATUSES = new Set(['unknown', 'known', 'notYetTrue', 'invalidated']);
const THREAD_STATUSES = new Set(['unseen', 'available', 'active', 'completed', 'closed', 'blocked']);

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function cleanList(value, limit = 64) {
  const output = [];
  const seen = new Set();
  for (const item of asArray(value)) {
    const text = compact(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function fail(code, details = {}) {
  return { ok: false, value: null, error: { code, ...details } };
}

function requireKind(value, kind) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'not_object';
  if (value.kind !== kind) return 'wrong_kind';
  return '';
}

function sourceOk(value, sourceHash) {
  return !sourceHash || compact(value.sourceHash) === compact(sourceHash);
}

function unknownIds(ids, knownIds) {
  const known = new Set(cleanList(knownIds, 10000));
  if (!known.size) return [];
  return cleanList(ids, 10000).filter((id) => !known.has(id));
}

export function normalizeStoryPositionSelection(value = {}, { sourceHash = '', candidateIds = [] } = {}) {
  const kindError = requireKind(value, STORY_POSITION_SELECTION_KIND);
  if (kindError) return fail(kindError);
  if (!sourceOk(value, sourceHash)) return fail('source_hash_mismatch');
  const primaryCandidateId = compact(value.primaryCandidateId);
  if (!primaryCandidateId) return fail('missing_primary_candidate_id');
  const allCandidateIds = [primaryCandidateId, ...cleanList(value.secondaryCandidateIds, 32)];
  const unknown = unknownIds(allCandidateIds, candidateIds);
  if (unknown.length) return fail('unknown_candidate_id', { id: unknown[0] });
  const route = compact(value.route);
  if (!ROUTES.has(route)) return fail('unsupported_route', { route });
  const evidenceRefs = cleanList(value.evidenceRefs, 48);
  if (!evidenceRefs.length) return fail('missing_evidence_refs');
  return {
    ok: true,
    value: {
      kind: STORY_POSITION_SELECTION_KIND,
      schemaVersion: 1,
      sourceHash: compact(value.sourceHash),
      primaryCandidateId,
      secondaryCandidateIds: cleanList(value.secondaryCandidateIds, 32),
      route,
      confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
      evidenceRefs,
      ignoredStaleSetup: cleanList(value.ignoredStaleSetup, 32),
      continuityGuards: {
        mustPreserve: cleanList(value.continuityGuards?.mustPreserve, 32),
        mustNotReestablish: cleanList(value.continuityGuards?.mustNotReestablish, 32)
      },
      unresolved: cleanList(value.unresolved, 32)
    },
    error: null
  };
}

export function normalizeStoryPositionReview(value = {}, { sourceHash = '', selectionHash = '' } = {}) {
  const kindError = requireKind(value, STORY_POSITION_REVIEW_KIND);
  if (kindError) return fail(kindError);
  if (!sourceOk(value, sourceHash)) return fail('source_hash_mismatch');
  if (selectionHash && compact(value.selectionHash) !== compact(selectionHash)) return fail('selection_hash_mismatch');
  const requiredAction = compact(value.requiredAction);
  const risk = compact(value.risk);
  if (!REVIEW_ACTIONS.has(requiredAction)) return fail('unsupported_required_action');
  if (!RISKS.has(risk)) return fail('unsupported_risk');
  return {
    ok: true,
    value: {
      kind: STORY_POSITION_REVIEW_KIND,
      schemaVersion: 1,
      sourceHash: compact(value.sourceHash),
      selectionHash: compact(value.selectionHash),
      approved: value.approved === true,
      requiredAction,
      risk,
      reasons: cleanList(value.reasons, 32),
      rejectedCandidateIds: cleanList(value.rejectedCandidateIds, 32),
      staleHistoryRisk: value.staleHistoryRisk === true,
      forbiddenAssertionRisk: value.forbiddenAssertionRisk === true
    },
    error: null
  };
}

export function normalizeStoryDeltaPlan(value = {}, {
  sourceHash = '',
  selectionHash = '',
  outcomePlanHash = '',
  knownNodeIds = [],
  knownFactIds = [],
  knownThreadIds = []
} = {}) {
  const kindError = requireKind(value, STORY_DELTA_PLAN_KIND);
  if (kindError) return fail(kindError);
  if (!sourceOk(value, sourceHash)) return fail('source_hash_mismatch');
  if (selectionHash && compact(value.selectionHash) !== compact(selectionHash)) return fail('selection_hash_mismatch');
  if (outcomePlanHash && compact(value.outcomePlanHash) !== compact(outcomePlanHash)) return fail('outcome_plan_hash_mismatch');
  const eventDrafts = asArray(value.eventDrafts).filter((entry) => entry && typeof entry === 'object').slice(0, 8);
  for (const event of eventDrafts) {
    const nodeIds = asArray(event.nodeTransitions).map((entry) => entry?.nodeId).filter(Boolean);
    const factIds = asArray(event.factTransitions).map((entry) => entry?.factId).filter(Boolean);
    const threadIds = asArray(event.threadTransitions).map((entry) => entry?.threadId).filter(Boolean);
    const unknownNode = unknownIds(nodeIds, knownNodeIds)[0];
    if (unknownNode) return fail('unknown_node_id', { id: unknownNode });
    const unknownFact = unknownIds(factIds, knownFactIds)[0];
    if (unknownFact) return fail('unknown_fact_id', { id: unknownFact });
    const unknownThread = unknownIds(threadIds, knownThreadIds)[0];
    if (unknownThread) return fail('unknown_thread_id', { id: unknownThread });
    for (const transition of asArray(event.nodeTransitions)) {
      if (!NODE_STATUSES.has(compact(transition?.to))) return fail('unsupported_node_status', { status: compact(transition?.to) });
    }
    for (const transition of asArray(event.factTransitions)) {
      if (!FACT_STATUSES.has(compact(transition?.to))) return fail('unsupported_fact_status', { status: compact(transition?.to) });
    }
    for (const transition of asArray(event.threadTransitions)) {
      if (!THREAD_STATUSES.has(compact(transition?.to))) return fail('unsupported_thread_status', { status: compact(transition?.to) });
    }
  }
  return {
    ok: true,
    value: {
      kind: STORY_DELTA_PLAN_KIND,
      schemaVersion: 1,
      sourceHash: compact(value.sourceHash),
      selectionHash: compact(value.selectionHash),
      outcomePlanHash: compact(value.outcomePlanHash),
      eventDrafts: cloneJson(eventDrafts),
      rejectedAssertions: cleanList(value.rejectedAssertions, 64),
      diagnostics: {
        reasonerUsed: value.diagnostics?.reasonerUsed === true,
        uncertainties: cleanList(value.diagnostics?.uncertainties, 32)
      }
    },
    error: null
  };
}

export function normalizeStoryDeltaReview(value = {}, { sourceHash = '', deltaPlanHash = '' } = {}) {
  const kindError = requireKind(value, STORY_DELTA_REVIEW_KIND);
  if (kindError) return fail(kindError);
  if (!sourceOk(value, sourceHash)) return fail('source_hash_mismatch');
  if (deltaPlanHash && compact(value.deltaPlanHash) !== compact(deltaPlanHash)) return fail('delta_plan_hash_mismatch');
  const requiredAction = compact(value.requiredAction);
  const risk = compact(value.risk);
  if (!REVIEW_ACTIONS.has(requiredAction)) return fail('unsupported_required_action');
  if (!RISKS.has(risk)) return fail('unsupported_risk');
  return {
    ok: true,
    value: {
      kind: STORY_DELTA_REVIEW_KIND,
      schemaVersion: 1,
      sourceHash: compact(value.sourceHash),
      deltaPlanHash: compact(value.deltaPlanHash),
      approved: value.approved === true,
      requiredAction,
      risk,
      reasons: cleanList(value.reasons, 32),
      forbiddenPastAssignment: value.forbiddenPastAssignment === true,
      futureFactLeak: value.futureFactLeak === true,
      missingBranchAuthority: value.missingBranchAuthority === true
    },
    error: null
  };
}
```

- [ ] **Step 4: Add npm script**

Add to `package.json` scripts:

```json
"test:story-position-contracts": "node tools/scripts/test-story-position-contracts.mjs"
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
npm.cmd run test:story-position-contracts
```

Expected: PASS with `story position contracts passed`.

- [ ] **Step 6: Commit**

Run:

```powershell
git add package.json src/story/story-position-contracts.mjs tools/scripts/test-story-position-contracts.mjs
git commit -m "feat: add story position contracts"
```

---

### Task 2: Add Story Ledger Projection

**Files:**
- Create: `src/story/story-ledger.mjs`
- Create: `tools/scripts/test-story-ledger-projection.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ACTIVE_STORY_PROJECTION_KIND` from `src/story/story-position-contracts.mjs`
- Produces: `createEmptyActiveStoryProjection({ branchId })`
- Produces: `materializeActiveStoryProjection({ events, branchId, priorProjection })`
- Produces: `appendReviewedStoryEvents(campaignState, eventDrafts, { outcomeId, turnId, sourceFrameRef, branchId, now })`

- [ ] **Step 1: Write failing projection test**

Create `tools/scripts/test-story-ledger-projection.mjs`:

```js
import assert from 'node:assert/strict';
import {
  appendReviewedStoryEvents,
  createEmptyActiveStoryProjection,
  materializeActiveStoryProjection
} from '../../src/story/story-ledger.mjs';

const empty = createEmptyActiveStoryProjection({ branchId: 'main' });
assert.equal(empty.branchId, 'main');
assert.deepEqual(empty.activeNodeIds, []);

const events = [{
  id: 'storyEvent.1',
  branchId: 'main',
  outcomeId: 'outcome.1',
  nodeTransitions: [
    { nodeId: 'hesperus.command', to: 'completed' },
    { nodeId: 'hesperus.evidenceCustody', to: 'active' },
    { nodeId: 'hesperus.ownerInquiry', to: 'available' }
  ],
  factTransitions: [
    { factId: 'fact.hesperus.inspectionFalsified', to: 'known' },
    { factId: 'fact.hesperus.ownerConvicted', to: 'notYetTrue' }
  ],
  threadTransitions: [
    { threadId: 'thread.hesperus.evidenceCustody', to: 'active' }
  ]
}];

const projection = materializeActiveStoryProjection({ events, branchId: 'main' });
assert.deepEqual(projection.activeNodeIds, ['hesperus.evidenceCustody']);
assert.deepEqual(projection.availableNodeIds, ['hesperus.ownerInquiry']);
assert.deepEqual(projection.completedNodeIds, ['hesperus.command']);
assert.deepEqual(projection.knownFactIds, ['fact.hesperus.inspectionFalsified']);
assert.deepEqual(projection.notYetTrueFactIds, ['fact.hesperus.ownerConvicted']);
assert.deepEqual(projection.rerunOnlyNodeIds, ['hesperus.command']);

const campaignState = { storyEventLedger: { events: [] }, campaign: { id: 'campaign.1' } };
const next = appendReviewedStoryEvents(campaignState, [{
  eventType: 'missionOutcomeCommitted',
  nodeTransitions: [{ nodeId: 'hesperus.command', to: 'completed' }],
  factTransitions: [],
  threadTransitions: [],
  commandLogRefs: []
}], {
  outcomeId: 'outcome.2',
  turnId: 'turn.2',
  sourceFrameRef: { id: 'sourceFrame.2', textHash: 'hash.2' },
  branchId: 'main',
  now: () => '2026-07-09T12:00:00.000Z'
});

assert.equal(next.storyEventLedger.events.length, 1);
assert.equal(next.activeStoryProjection.completedNodeIds[0], 'hesperus.command');
assert.equal(next.storyEventLedger.events[0].sourceFrameRef.textHash, 'hash.2');

console.log('story ledger projection passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools/scripts/test-story-ledger-projection.mjs
```

Expected: FAIL with module not found for `src/story/story-ledger.mjs`.

- [ ] **Step 3: Implement projection materializer**

Create `src/story/story-ledger.mjs`:

```js
import { ACTIVE_STORY_PROJECTION_KIND } from './story-position-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function uniqueSorted(values = []) {
  return [...new Set(values.map(compact).filter(Boolean))].sort();
}

function applyStatus(map, id, status) {
  const key = compact(id);
  const value = compact(status);
  if (key && value) map.set(key, value);
}

function idsWithStatus(map, status) {
  return uniqueSorted([...map.entries()].filter(([, value]) => value === status).map(([id]) => id));
}

export function createEmptyActiveStoryProjection({ branchId = 'main' } = {}) {
  return {
    kind: ACTIVE_STORY_PROJECTION_KIND,
    schemaVersion: 1,
    revision: 0,
    branchId: compact(branchId) || 'main',
    activeNodeIds: [],
    availableNodeIds: [],
    completedNodeIds: [],
    closedNodeIds: [],
    blockedNodeIds: [],
    knownFactIds: [],
    notYetTrueFactIds: [],
    staleNodeIds: [],
    rerunOnlyNodeIds: [],
    activeThreadIds: [],
    closedThreadIds: [],
    lastOutcomeId: '',
    lastStoryEventId: ''
  };
}

export function materializeActiveStoryProjection({ events = [], branchId = 'main' } = {}) {
  const nodeStatus = new Map();
  const factStatus = new Map();
  const threadStatus = new Map();
  let revision = 0;
  let lastOutcomeId = '';
  let lastStoryEventId = '';
  for (const event of Array.isArray(events) ? events : []) {
    if (compact(event.branchId || 'main') !== (compact(branchId) || 'main')) continue;
    revision += 1;
    lastOutcomeId = compact(event.outcomeId) || lastOutcomeId;
    lastStoryEventId = compact(event.id) || lastStoryEventId;
    for (const transition of Array.isArray(event.nodeTransitions) ? event.nodeTransitions : []) {
      applyStatus(nodeStatus, transition.nodeId, transition.to);
    }
    for (const transition of Array.isArray(event.factTransitions) ? event.factTransitions : []) {
      applyStatus(factStatus, transition.factId, transition.to);
    }
    for (const transition of Array.isArray(event.threadTransitions) ? event.threadTransitions : []) {
      applyStatus(threadStatus, transition.threadId, transition.to);
    }
  }
  const completedNodeIds = idsWithStatus(nodeStatus, 'completed');
  return {
    ...createEmptyActiveStoryProjection({ branchId }),
    revision,
    activeNodeIds: idsWithStatus(nodeStatus, 'active'),
    availableNodeIds: idsWithStatus(nodeStatus, 'available'),
    completedNodeIds,
    closedNodeIds: idsWithStatus(nodeStatus, 'closed'),
    blockedNodeIds: idsWithStatus(nodeStatus, 'blocked'),
    knownFactIds: idsWithStatus(factStatus, 'known'),
    notYetTrueFactIds: idsWithStatus(factStatus, 'notYetTrue'),
    staleNodeIds: uniqueSorted([...completedNodeIds, ...idsWithStatus(nodeStatus, 'closed')]),
    rerunOnlyNodeIds: completedNodeIds,
    activeThreadIds: idsWithStatus(threadStatus, 'active'),
    closedThreadIds: idsWithStatus(threadStatus, 'closed'),
    lastOutcomeId,
    lastStoryEventId
  };
}

export function appendReviewedStoryEvents(campaignState = {}, eventDrafts = [], {
  outcomeId = '',
  turnId = '',
  sourceFrameRef = null,
  branchId = 'main',
  now = () => new Date().toISOString()
} = {}) {
  const next = cloneJson(campaignState || {});
  const existing = Array.isArray(next.storyEventLedger?.events) ? next.storyEventLedger.events : [];
  const appended = (Array.isArray(eventDrafts) ? eventDrafts : []).map((draft, index) => ({
    id: `storyEvent.${compact(outcomeId) || 'outcome'}.${existing.length + index + 1}`,
    outcomeId: compact(outcomeId),
    turnId: compact(turnId),
    sourceFrameRef: cloneJson(sourceFrameRef || null),
    eventType: compact(draft.eventType) || 'missionOutcomeCommitted',
    occurredAt: now(),
    branchId: compact(branchId) || 'main',
    nodeTransitions: cloneJson(draft.nodeTransitions || []),
    factTransitions: cloneJson(draft.factTransitions || []),
    threadTransitions: cloneJson(draft.threadTransitions || []),
    commandLogRefs: cloneJson(draft.commandLogRefs || []),
    supersedesEventIds: cloneJson(draft.supersedesEventIds || [])
  }));
  next.storyEventLedger = {
    kind: 'directive.storyEventLedger.v1',
    schemaVersion: 1,
    events: [...existing, ...appended]
  };
  next.activeStoryProjection = materializeActiveStoryProjection({
    events: next.storyEventLedger.events,
    branchId
  });
  return next;
}
```

- [ ] **Step 4: Add npm script**

Add:

```json
"test:story-ledger-projection": "node tools/scripts/test-story-ledger-projection.mjs"
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
npm.cmd run test:story-ledger-projection
```

Expected: PASS with `story ledger projection passed`.

- [ ] **Step 6: Commit**

Run:

```powershell
git add package.json src/story/story-ledger.mjs tools/scripts/test-story-ledger-projection.mjs
git commit -m "feat: add story ledger projection"
```

---

### Task 3: Build Story Context Index And Candidates

**Files:**
- Create: `src/story/story-context-index.mjs`
- Create: `tools/scripts/test-story-context-index.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `materializeActiveStoryProjection({ events, branchId })`
- Produces: `buildStoryContextIndex({ campaignState, packageData, missionGraph, sourceFrameRef })`
- Produces: `deriveStoryPositionCandidates({ storyContextIndex, activeStoryProjection })`

- [ ] **Step 1: Write failing index test**

Create `tools/scripts/test-story-context-index.mjs`:

```js
import assert from 'node:assert/strict';
import {
  buildStoryContextIndex,
  deriveStoryPositionCandidates
} from '../../src/story/story-context-index.mjs';

const missionGraph = {
  id: 'prelude-a-ship-underway',
  phases: [
    { id: 'shuttle-rendezvous', label: 'Shuttle Rendezvous', summary: 'Hesperus decision pressure.' },
    { id: 'hesperus-aftermath', label: 'Hesperus Aftermath', summary: 'Aftermath and inquiry.' }
  ],
  decisionPoints: [
    { id: 'decision.hesperus.command', phaseId: 'shuttle-rendezvous', label: 'Hesperus command' }
  ],
  outcomes: [
    { id: 'outcome.hesperus.evidence', phaseId: 'shuttle-rendezvous', label: 'Evidence preserved' }
  ]
};

const campaignState = {
  campaign: { id: 'campaign.1' },
  mission: {
    activeMissionId: 'prelude-a-ship-underway',
    activeMissionGraphId: 'prelude-a-ship-underway',
    activePhaseId: 'shuttle-rendezvous'
  },
  storyEventLedger: {
    events: [{
      id: 'storyEvent.outcome.1',
      branchId: 'main',
      outcomeId: 'outcome.1',
      nodeTransitions: [
        { nodeId: 'phase.shuttle-rendezvous', to: 'completed' },
        { nodeId: 'thread.hesperus.evidenceCustody', to: 'active' }
      ],
      factTransitions: [{ factId: 'fact.hesperus.inspectionFalsified', to: 'known' }],
      threadTransitions: [{ threadId: 'thread.hesperus.evidenceCustody', to: 'active' }]
    }]
  },
  knowledgeLedger: {
    facts: [{ id: 'fact.hesperus.inspectionFalsified', known: true }]
  }
};

const index = buildStoryContextIndex({
  campaignState,
  packageData: { manifest: { id: 'ashes-of-peace' } },
  missionGraph,
  sourceFrameRef: { id: 'source.1', textHash: 'hash.1' }
});

assert.equal(index.current.activePhaseId, 'shuttle-rendezvous');
assert.equal(index.graph.nodes.some((node) => node.id === 'phase.shuttle-rendezvous'), true);
assert.equal(index.projection.activeThreadIds[0], 'thread.hesperus.evidenceCustody');

const candidates = deriveStoryPositionCandidates({ storyContextIndex: index });
assert.equal(candidates.some((candidate) => candidate.nodeId === 'thread.hesperus.evidenceCustody'), true);
assert.equal(candidates.some((candidate) => candidate.nodeId === 'phase.shuttle-rendezvous' && candidate.status === 'completed'), true);
assert.equal(candidates.find((candidate) => candidate.nodeId === 'phase.shuttle-rendezvous').staleSetupGuards.length > 0, true);

console.log('story context index passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools/scripts/test-story-context-index.mjs
```

Expected: FAIL with module not found for `src/story/story-context-index.mjs`.

- [ ] **Step 3: Implement index builder**

Create `src/story/story-context-index.mjs`:

```js
import {
  STORY_CONTEXT_INDEX_KIND,
  STORY_POSITION_CANDIDATE_KIND
} from './story-position-contracts.mjs';
import { materializeActiveStoryProjection } from './story-ledger.mjs';
import { hashStableJson } from '../runtime/architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function knownFactIds(campaignState = {}) {
  return asArray(campaignState.knowledgeLedger?.facts)
    .map((fact) => typeof fact === 'string' ? fact : (fact?.known === false || fact?.stale === true ? '' : fact?.id))
    .filter(Boolean);
}

function graphNodesFromMissionGraph(missionGraph = {}) {
  const phaseNodes = asArray(missionGraph.phases).map((phase) => ({
    id: `phase.${compact(phase.id)}`,
    sourceId: compact(phase.id),
    type: 'missionPhase',
    label: compact(phase.label || phase.title || phase.id),
    phaseId: compact(phase.id),
    summary: compact(phase.summary || phase.description).slice(0, 600)
  })).filter((node) => node.sourceId);
  const decisionNodes = asArray(missionGraph.decisionPoints).map((decision) => ({
    id: compact(decision.id),
    sourceId: compact(decision.id),
    type: 'decisionPoint',
    label: compact(decision.label || decision.title || decision.id),
    phaseId: compact(decision.phaseId || decision.activePhaseId),
    summary: compact(decision.summary || decision.description).slice(0, 600)
  })).filter((node) => node.id);
  const outcomeNodes = asArray(missionGraph.outcomes || missionGraph.outcomeOptions).map((outcome) => ({
    id: compact(outcome.id),
    sourceId: compact(outcome.id),
    type: 'outcomeOption',
    label: compact(outcome.label || outcome.title || outcome.id),
    phaseId: compact(outcome.phaseId),
    summary: compact(outcome.summary || outcome.description).slice(0, 600)
  })).filter((node) => node.id);
  return [...phaseNodes, ...decisionNodes, ...outcomeNodes];
}

function runtimeNodesFromProjection(projection = {}) {
  return [
    ...asArray(projection.activeThreadIds).map((id) => ({ id, sourceId: id, type: 'activeThread', label: id })),
    ...asArray(projection.availableNodeIds).map((id) => ({ id, sourceId: id, type: 'availableStoryNode', label: id }))
  ];
}

export function buildStoryContextIndex({
  campaignState = {},
  packageData = {},
  missionGraph = {},
  sourceFrameRef = null,
  branchId = 'main'
} = {}) {
  const projection = campaignState.activeStoryProjection || materializeActiveStoryProjection({
    events: campaignState.storyEventLedger?.events || [],
    branchId
  });
  const nodes = [...graphNodesFromMissionGraph(missionGraph), ...runtimeNodesFromProjection(projection)];
  const index = {
    kind: STORY_CONTEXT_INDEX_KIND,
    schemaVersion: 1,
    campaignId: compact(campaignState.campaign?.id || campaignState.campaign?.templateCampaignId),
    packageId: compact(packageData.manifest?.id || packageData.id),
    branchId: compact(branchId) || 'main',
    current: {
      activeMissionId: compact(campaignState.mission?.activeMissionId),
      activeMissionGraphId: compact(campaignState.mission?.activeMissionGraphId || missionGraph.id),
      activePhaseId: compact(campaignState.mission?.activePhaseId),
      locationId: compact(campaignState.worldState?.currentLocationId || campaignState.attentionState?.scene?.locationId)
    },
    projection: cloneJson(projection),
    graph: {
      nodes,
      edges: asArray(missionGraph.edges || missionGraph.transitions).map(cloneJson)
    },
    knownFactIds: knownFactIds(campaignState),
    sourceFrameRef: cloneJson(sourceFrameRef || null)
  };
  return {
    ...index,
    indexHash: hashStableJson(index)
  };
}

export function deriveStoryPositionCandidates({ storyContextIndex = {} } = {}) {
  const projection = storyContextIndex.projection || {};
  const completed = new Set(asArray(projection.completedNodeIds));
  const active = new Set(asArray(projection.activeNodeIds));
  const available = new Set(asArray(projection.availableNodeIds));
  const activeThreads = new Set(asArray(projection.activeThreadIds));
  return asArray(storyContextIndex.graph?.nodes).map((node) => {
    const status = active.has(node.id) || activeThreads.has(node.id)
      ? 'active'
      : completed.has(node.id)
        ? 'completed'
        : available.has(node.id)
          ? 'available'
          : (node.phaseId === storyContextIndex.current?.activePhaseId ? 'active' : 'available');
    return {
      kind: STORY_POSITION_CANDIDATE_KIND,
      schemaVersion: 1,
      id: `candidate.${node.id}.${status}`,
      nodeId: node.id,
      candidateType: node.type,
      status,
      mode: node.type === 'activeThread' ? 'openWorld' : 'mission',
      priorityBand: status === 'active' ? 'primary' : 'secondary',
      coordinates: {
        missionId: storyContextIndex.current?.activeMissionId || '',
        phaseId: node.phaseId || storyContextIndex.current?.activePhaseId || '',
        locationId: storyContextIndex.current?.locationId || '',
        threadId: node.type === 'activeThread' ? node.id : ''
      },
      evidenceRefs: [storyContextIndex.sourceFrameRef?.id, projection.lastStoryEventId].filter(Boolean),
      allowedFactIds: cloneJson(storyContextIndex.knownFactIds || []),
      notYetTrueFactIds: cloneJson(projection.notYetTrueFactIds || []),
      forbiddenAssertions: status === 'completed'
        ? [`Do not treat ${node.label || node.id} as pending.`]
        : cloneJson(projection.notYetTrueFactIds || []).map((id) => `Do not assert ${id}.`),
      staleSetupGuards: status === 'completed'
        ? [`${node.label || node.id} is completed; reopening requires rerun branch authority.`]
        : []
    };
  });
}
```

- [ ] **Step 4: Add npm script**

Add:

```json
"test:story-context-index": "node tools/scripts/test-story-context-index.mjs"
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```powershell
npm.cmd run test:story-context-index
```

Expected: PASS with `story context index passed`.

- [ ] **Step 6: Commit**

Run:

```powershell
git add package.json src/story/story-context-index.mjs tools/scripts/test-story-context-index.mjs
git commit -m "feat: build story context index"
```

---

### Task 4: Add Story Graph Model Spine

**Files:**
- Create: `src/directors/mission-director-story-graph-spine.mjs`
- Create: `tools/scripts/test-mission-director-story-graph-spine.mjs`
- Modify: `src/generation/generation-roles.mjs`
- Modify: `src/generation/model-call-authority-matrix.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildStoryContextIndex`, `deriveStoryPositionCandidates`
- Consumes: story position contract normalizers
- Produces: `runMissionDirectorStoryGraphSpine(options) -> { ok, selection, selectionReview, deltaPlan, deltaReview, storyContextIndex, storyCandidates, hashes, diagnostics }`

- [ ] **Step 1: Write failing spine test**

Create `tools/scripts/test-mission-director-story-graph-spine.mjs`:

```js
import assert from 'node:assert/strict';
import { runMissionDirectorStoryGraphSpine } from '../../src/directors/mission-director-story-graph-spine.mjs';
import {
  STORY_DELTA_PLAN_KIND,
  STORY_DELTA_REVIEW_KIND,
  STORY_POSITION_REVIEW_KIND,
  STORY_POSITION_SELECTION_KIND
} from '../../src/story/story-position-contracts.mjs';

const calls = [];
const router = {
  async generate(roleId, request = {}) {
    calls.push({ roleId, request });
    const sourceHash = request.context?.sourceHash;
    if (roleId === 'missionDirectorStoryPositioner') {
      const candidateId = request.context.storyCandidates.find((candidate) => candidate.status === 'active')?.id;
      return { ok: true, response: { content: {
        kind: STORY_POSITION_SELECTION_KIND,
        schemaVersion: 1,
        sourceHash,
        primaryCandidateId: candidateId,
        secondaryCandidateIds: [],
        route: 'outcome',
        confidence: 0.9,
        evidenceRefs: ['message:18'],
        ignoredStaleSetup: [],
        continuityGuards: { mustPreserve: ['Known evidence remains true.'], mustNotReestablish: ['Completed decision as pending.'] },
        unresolved: []
      } } };
    }
    if (roleId === 'missionDirectorStoryPositionReviewer') {
      return { ok: true, response: { content: {
        kind: STORY_POSITION_REVIEW_KIND,
        schemaVersion: 1,
        sourceHash,
        selectionHash: request.context.selectionHash,
        approved: true,
        requiredAction: 'approve',
        risk: 'low',
        reasons: [],
        rejectedCandidateIds: [],
        staleHistoryRisk: false,
        forbiddenAssertionRisk: false
      } } };
    }
    if (roleId === 'missionDirectorStoryDeltaPlanner') {
      return { ok: true, response: { content: {
        kind: STORY_DELTA_PLAN_KIND,
        schemaVersion: 1,
        sourceHash,
        selectionHash: request.context.selectionHash,
        outcomePlanHash: request.context.outcomePlanHash,
        eventDrafts: [{
          eventType: 'missionOutcomeCommitted',
          nodeTransitions: [{ nodeId: 'thread.hesperus.evidenceCustody', to: 'active', reason: 'Source keeps evidence custody active.' }],
          factTransitions: [{ factId: 'fact.hesperus.inspectionFalsified', to: 'known' }],
          threadTransitions: [{ threadId: 'thread.hesperus.evidenceCustody', to: 'active' }],
          commandLogRefs: []
        }],
        rejectedAssertions: [],
        diagnostics: { reasonerUsed: true, uncertainties: [] }
      } } };
    }
    if (roleId === 'missionDirectorStoryDeltaReviewer') {
      return { ok: true, response: { content: {
        kind: STORY_DELTA_REVIEW_KIND,
        schemaVersion: 1,
        sourceHash,
        deltaPlanHash: request.context.deltaPlanHash,
        approved: true,
        requiredAction: 'approve',
        risk: 'low',
        reasons: [],
        forbiddenPastAssignment: false,
        futureFactLeak: false,
        missingBranchAuthority: false
      } } };
    }
    return { ok: false, error: { code: 'unexpected_role' } };
  }
};

const result = await runMissionDirectorStoryGraphSpine({
  generationRouter: router,
  sourceHash: 'frame.hash.1',
  campaignState: {
    campaign: { id: 'campaign.1' },
    mission: { activeMissionId: 'prelude-a-ship-underway', activeMissionGraphId: 'prelude-a-ship-underway', activePhaseId: 'shuttle-rendezvous' },
    storyEventLedger: { events: [] },
    knowledgeLedger: { facts: [{ id: 'fact.hesperus.inspectionFalsified', known: true }] }
  },
  packageData: { manifest: { id: 'ashes-of-peace' } },
  missionGraph: {
    id: 'prelude-a-ship-underway',
    phases: [{ id: 'shuttle-rendezvous', label: 'Shuttle Rendezvous' }],
    decisionPoints: [],
    outcomes: []
  },
  sourceFrameRef: { id: 'source.1', textHash: 'hash.1' },
  outcomePlanHash: 'outcome.hash.1'
});

assert.equal(result.ok, true);
assert.equal(result.selection.primaryCandidateId.includes('candidate.'), true);
assert.equal(result.deltaPlan.eventDrafts.length, 1);
assert.deepEqual(calls.map((call) => call.roleId), [
  'missionDirectorStoryPositioner',
  'missionDirectorStoryPositionReviewer',
  'missionDirectorStoryDeltaPlanner',
  'missionDirectorStoryDeltaReviewer'
]);

console.log('mission director story graph spine passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools/scripts/test-mission-director-story-graph-spine.mjs
```

Expected: FAIL with module not found for `mission-director-story-graph-spine.mjs`.

- [ ] **Step 3: Implement graph spine**

Create `src/directors/mission-director-story-graph-spine.mjs`:

```js
import { hashStableJson } from '../runtime/architecture-redesign-contracts.mjs';
import { buildStoryContextIndex, deriveStoryPositionCandidates } from '../story/story-context-index.mjs';
import {
  normalizeStoryDeltaPlan,
  normalizeStoryDeltaReview,
  normalizeStoryPositionReview,
  normalizeStoryPositionSelection
} from '../story/story-position-contracts.mjs';

function extractData(result = {}) {
  const response = result.response || result;
  if (response.content && typeof response.content === 'object') return response.content;
  if (response.data && typeof response.data === 'object') return response.data;
  const text = response.text || response.content || response.raw?.text || '';
  if (typeof text === 'string' && text.trim()) return JSON.parse(text);
  return null;
}

async function generateJson(generationRouter, roleId, request) {
  if (typeof generationRouter?.generate !== 'function') return { ok: false, error: { code: 'generation_router_missing' } };
  try {
    const result = await generationRouter.generate(roleId, request);
    if (!result?.ok) return { ok: false, error: result?.error || { code: 'provider_failed' } };
    return { ok: true, value: extractData(result) };
  } catch (error) {
    return { ok: false, error: { code: error?.code || 'provider_exception', message: error?.message || String(error) } };
  }
}

export async function runMissionDirectorStoryGraphSpine({
  generationRouter,
  sourceHash,
  campaignState,
  packageData,
  missionGraph,
  sourceFrameRef = null,
  outcomePlanHash = ''
} = {}) {
  const storyContextIndex = buildStoryContextIndex({ campaignState, packageData, missionGraph, sourceFrameRef });
  const storyCandidates = deriveStoryPositionCandidates({ storyContextIndex });
  const candidateIds = storyCandidates.map((candidate) => candidate.id);
  const baseContext = { sourceHash, storyContextIndex, storyCandidates };

  const selectionRaw = await generateJson(generationRouter, 'missionDirectorStoryPositioner', {
    lane: 'utility',
    sourceHash,
    context: baseContext,
    responseFormat: 'json'
  });
  if (!selectionRaw.ok) return { ok: false, diagnostics: { stage: 'storyPositioner', error: selectionRaw.error } };
  const selection = normalizeStoryPositionSelection(selectionRaw.value, { sourceHash, candidateIds });
  if (!selection.ok) return { ok: false, diagnostics: { stage: 'storyPositionSelectionValidation', error: selection.error } };
  const selectionHash = hashStableJson(selection.value);

  const reviewRaw = await generateJson(generationRouter, 'missionDirectorStoryPositionReviewer', {
    lane: 'utility',
    sourceHash,
    context: { ...baseContext, selection: selection.value, selectionHash },
    responseFormat: 'json'
  });
  if (!reviewRaw.ok) return { ok: false, diagnostics: { stage: 'storyPositionReviewer', error: reviewRaw.error } };
  const selectionReview = normalizeStoryPositionReview(reviewRaw.value, { sourceHash, selectionHash });
  if (!selectionReview.ok || !selectionReview.value.approved) {
    return { ok: false, selection: selection.value, diagnostics: { stage: 'storyPositionReviewValidation', error: selectionReview.error } };
  }

  const knownNodeIds = storyContextIndex.graph.nodes.map((node) => node.id);
  const knownFactIds = storyContextIndex.knownFactIds;
  const knownThreadIds = storyCandidates.map((candidate) => candidate.coordinates?.threadId).filter(Boolean);
  const deltaRaw = await generateJson(generationRouter, 'missionDirectorStoryDeltaPlanner', {
    lane: 'reasoning',
    sourceHash,
    context: { ...baseContext, selection: selection.value, selectionHash, outcomePlanHash },
    responseFormat: 'json'
  });
  if (!deltaRaw.ok) return { ok: false, selection: selection.value, selectionReview: selectionReview.value, diagnostics: { stage: 'storyDeltaPlanner', error: deltaRaw.error } };
  const deltaPlan = normalizeStoryDeltaPlan(deltaRaw.value, { sourceHash, selectionHash, outcomePlanHash, knownNodeIds, knownFactIds, knownThreadIds });
  if (!deltaPlan.ok) return { ok: false, selection: selection.value, selectionReview: selectionReview.value, diagnostics: { stage: 'storyDeltaPlanValidation', error: deltaPlan.error } };
  const deltaPlanHash = hashStableJson(deltaPlan.value);

  const deltaReviewRaw = await generateJson(generationRouter, 'missionDirectorStoryDeltaReviewer', {
    lane: 'utility',
    sourceHash,
    context: { ...baseContext, selection: selection.value, selectionHash, deltaPlan: deltaPlan.value, deltaPlanHash },
    responseFormat: 'json'
  });
  if (!deltaReviewRaw.ok) return { ok: false, selection: selection.value, deltaPlan: deltaPlan.value, diagnostics: { stage: 'storyDeltaReviewer', error: deltaReviewRaw.error } };
  const deltaReview = normalizeStoryDeltaReview(deltaReviewRaw.value, { sourceHash, deltaPlanHash });
  if (!deltaReview.ok || !deltaReview.value.approved) {
    return { ok: false, selection: selection.value, deltaPlan: deltaPlan.value, diagnostics: { stage: 'storyDeltaReviewValidation', error: deltaReview.error } };
  }

  return {
    ok: true,
    selection: selection.value,
    selectionReview: selectionReview.value,
    deltaPlan: deltaPlan.value,
    deltaReview: deltaReview.value,
    storyContextIndex,
    storyCandidates,
    hashes: { selectionHash, deltaPlanHash, indexHash: storyContextIndex.indexHash },
    diagnostics: { selectedCandidateIds: [selection.value.primaryCandidateId, ...selection.value.secondaryCandidateIds] }
  };
}
```

- [ ] **Step 4: Register generation roles**

Add to `src/generation/generation-roles.mjs` role table:

```js
missionDirectorStoryPositionReviewer: {
  id: 'missionDirectorStoryPositionReviewer',
  providerKind: 'utility',
  blocking: true,
  output: 'structured-json',
  timeoutMs: 45000,
  mayProposeState: false,
  mayInjectPrompt: false,
  mayRunDuringMainGeneration: true,
  fallback: 'fail-closed'
},
missionDirectorStoryDeltaPlanner: {
  id: 'missionDirectorStoryDeltaPlanner',
  providerKind: 'reasoning',
  blocking: true,
  output: 'structured-json',
  timeoutMs: 90000,
  mayProposeState: true,
  mayInjectPrompt: false,
  mayRunDuringMainGeneration: true,
  fallback: 'fail-closed'
},
missionDirectorStoryDeltaReviewer: {
  id: 'missionDirectorStoryDeltaReviewer',
  providerKind: 'utility',
  blocking: true,
  output: 'structured-json',
  timeoutMs: 45000,
  mayProposeState: false,
  mayInjectPrompt: false,
  mayRunDuringMainGeneration: true,
  fallback: 'fail-closed'
}
```

Add matching authority matrix rows with parser schemas:

```js
{
  roleId: 'missionDirectorStoryDeltaPlanner',
  parserSchema: 'directive.storyDeltaPlan.v1',
  allowedStateRoots: ['storyEventLedger', 'activeStoryProjection'],
  hiddenStatePolicy: 'May receive compact active projection and candidate guards; must not receive raw hidden pressure, raw relationship scores, raw prompts, or provider reasoning.'
}
```

- [ ] **Step 5: Add npm script and run test**

Add:

```json
"test:mission-director-story-graph-spine": "node tools/scripts/test-mission-director-story-graph-spine.mjs"
```

Run:

```powershell
npm.cmd run test:mission-director-story-graph-spine
```

Expected: PASS with `mission director story graph spine passed`.

- [ ] **Step 6: Run existing role gates**

Run:

```powershell
node tools/scripts/test-generation-router.mjs
node tools/scripts/test-model-call-authority-matrix.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add package.json src/directors/mission-director-story-graph-spine.mjs src/generation/generation-roles.mjs src/generation/model-call-authority-matrix.mjs tools/scripts/test-mission-director-story-graph-spine.mjs
git commit -m "feat: add mission story graph spine"
```

---

### Task 5: Integrate Story Graph Into Mission Director Spine

**Files:**
- Modify: `src/directors/mission-director-frame.mjs`
- Modify: `src/directors/mission-director-model-spine.mjs`
- Modify: `src/runtime/director-turn-runtime.mjs`
- Modify: `tools/scripts/test-mission-director-model-spine.mjs`

**Interfaces:**
- Consumes: `runMissionDirectorStoryGraphSpine(options)`
- Consumes: `appendReviewedStoryEvents(campaignState, eventDrafts, context)`
- Produces: turn packet provenance `storyGraph`
- Produces: `stateDelta.openWorld.modelStoryDeltaPlan`

- [ ] **Step 1: Extend model spine test**

In `tools/scripts/test-mission-director-model-spine.mjs`, add assertions to existing outcome route test:

```js
assert.equal(result.turnPacket.provenance.storyGraph.selectedCandidateIds.length > 0, true);
assert.equal(result.turnPacket.stateDelta.openWorld.modelStoryDeltaPlan.eventDrafts.length, 1);
assert.equal(
  result.turnPacket.narratorPacket.constraints.some((item) => item.includes('Do not reestablish completed story nodes')),
  true
);
```

Add fake router responses for the three new roles using the same shape from Task 4.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
npm.cmd run test:mission-director-model-spine
```

Expected: FAIL because `provenance.storyGraph` is missing.

- [ ] **Step 3: Call story graph spine from mission model spine**

In `src/directors/mission-director-model-spine.mjs`, after `outcomePlanHash` and before reviewer call:

```js
const storyGraph = await runMissionDirectorStoryGraphSpine({
  generationRouter,
  sourceHash,
  campaignState: options.campaignState,
  packageData: options.packageData,
  missionGraph: options.graph,
  sourceFrameRef: options.sourceFrameRef || null,
  outcomePlanHash
});
if (!storyGraph.ok) {
  return {
    ok: false,
    route: 'pause',
    storyPosition: story.value,
    outcomePlan: outcome.value,
    turnPacket: null,
    diagnostics: { stage: 'storyGraphSpine', error: storyGraph.diagnostics }
  };
}
```

Pass `storyGraph` into `buildTurnPacketFromOutcomePlan` and add:

```js
stateDelta: {
  outcomeId,
  mission: {},
  openWorld: {
    sourceAnchorRange: cloneJson(sceneSnapshot.sourceAnchorRange || null),
    modelStateProposal: cloneJson(outcomePlan.stateProposal || null),
    modelStoryDeltaPlan: cloneJson(storyGraph.deltaPlan)
  }
},
provenance: {
  modelSpine: true,
  storyPositionHash: hashStableJson(storyPosition),
  outcomePlanHash: hashStableJson(outcomePlan),
  reviewHash: hashStableJson(review),
  storyGraph: {
    indexHash: storyGraph.hashes.indexHash,
    selectedCandidateIds: [
      storyGraph.selection.primaryCandidateId,
      ...storyGraph.selection.secondaryCandidateIds
    ],
    selectionHash: storyGraph.hashes.selectionHash,
    deltaPlanHash: storyGraph.hashes.deltaPlanHash
  }
}
```

Add narrator guard:

```js
'Do not reestablish completed story nodes as pending unless the turn is an authorized rerun branch.'
```

- [ ] **Step 4: Append reviewed events in runtime commit path**

In `src/runtime/director-turn-runtime.mjs`, where committed campaign state is finalized after `commitDirectorTurn`, append reviewed story events:

```js
const storyDeltaPlan = turnPacket.stateDelta?.openWorld?.modelStoryDeltaPlan;
if (Array.isArray(storyDeltaPlan?.eventDrafts) && storyDeltaPlan.eventDrafts.length) {
  projectedState = appendReviewedStoryEvents(projectedState, storyDeltaPlan.eventDrafts, {
    outcomeId: turnPacket.outcomePacket.id,
    turnId: turnPacket.turnId,
    sourceFrameRef: turnPacket.sceneSnapshot?.sourceFrameRef || turnPacket.provenance?.sourceFrameRef || null,
    branchId: projectedState.campaignChatBinding?.saveId || 'main',
    now
  });
}
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm.cmd run test:mission-director-model-spine
node tools/scripts/test-runtime-stage18-rerun-branch-recovery.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/directors/mission-director-frame.mjs src/directors/mission-director-model-spine.mjs src/runtime/director-turn-runtime.mjs tools/scripts/test-mission-director-model-spine.mjs
git commit -m "feat: integrate story graph with mission spine"
```

---

### Task 6: Add Past/Future Accident Regression Fixtures

**Files:**
- Modify: `tools/scripts/test-mission-director-story-graph-spine.mjs`
- Modify: `tools/scripts/test-runtime-stage18-rerun-branch-recovery.mjs`

**Interfaces:**
- Consumes: story graph spine validation from Tasks 1-5.
- Produces: regression proof for completed node, future fact, and rerun branch handling.

- [ ] **Step 1: Add completed-node rejection test**

Append to `tools/scripts/test-mission-director-story-graph-spine.mjs`:

```js
const completedNodeRouter = {
  async generate(roleId, request = {}) {
    const sourceHash = request.context?.sourceHash;
    if (roleId === 'missionDirectorStoryPositioner') {
      const completedCandidate = request.context.storyCandidates.find((candidate) => candidate.status === 'completed');
      return { ok: true, response: { content: {
        kind: STORY_POSITION_SELECTION_KIND,
        schemaVersion: 1,
        sourceHash,
        primaryCandidateId: completedCandidate.id,
        secondaryCandidateIds: [],
        route: 'outcome',
        confidence: 0.91,
        evidenceRefs: ['storyEvent.outcome.1'],
        ignoredStaleSetup: [],
        continuityGuards: { mustPreserve: [], mustNotReestablish: ['Completed node as pending.'] },
        unresolved: []
      } } };
    }
    if (roleId === 'missionDirectorStoryPositionReviewer') {
      return { ok: true, response: { content: {
        kind: STORY_POSITION_REVIEW_KIND,
        schemaVersion: 1,
        sourceHash,
        selectionHash: request.context.selectionHash,
        approved: false,
        requiredAction: 'pause',
        risk: 'high',
        reasons: ['Completed node selected as current pending surface.'],
        rejectedCandidateIds: [request.context.selection.primaryCandidateId],
        staleHistoryRisk: true,
        forbiddenAssertionRisk: false
      } } };
    }
    return { ok: false, error: { code: 'should_not_continue' } };
  }
};

const rejectedCompleted = await runMissionDirectorStoryGraphSpine({
  generationRouter: completedNodeRouter,
  sourceHash: 'frame.hash.completed',
  campaignState: {
    campaign: { id: 'campaign.1' },
    mission: { activeMissionId: 'prelude-a-ship-underway', activeMissionGraphId: 'prelude-a-ship-underway', activePhaseId: 'shuttle-rendezvous' },
    storyEventLedger: {
      events: [{
        id: 'storyEvent.outcome.1',
        branchId: 'main',
        outcomeId: 'outcome.1',
        nodeTransitions: [{ nodeId: 'phase.shuttle-rendezvous', to: 'completed' }],
        factTransitions: [],
        threadTransitions: []
      }]
    }
  },
  packageData: { manifest: { id: 'ashes-of-peace' } },
  missionGraph: { id: 'prelude-a-ship-underway', phases: [{ id: 'shuttle-rendezvous', label: 'Shuttle Rendezvous' }] },
  sourceFrameRef: { id: 'source.completed', textHash: 'hash.completed' },
  outcomePlanHash: 'outcome.hash.completed'
});
assert.equal(rejectedCompleted.ok, false);
assert.equal(rejectedCompleted.diagnostics.stage, 'storyPositionReviewValidation');
```

- [ ] **Step 2: Add future-fact rejection test**

Append:

```js
const futureFactRouter = {
  async generate(roleId, request = {}) {
    const sourceHash = request.context?.sourceHash;
    if (roleId === 'missionDirectorStoryPositioner') {
      return router.generate(roleId, request);
    }
    if (roleId === 'missionDirectorStoryPositionReviewer') {
      return router.generate(roleId, request);
    }
    if (roleId === 'missionDirectorStoryDeltaPlanner') {
      return { ok: true, response: { content: {
        kind: STORY_DELTA_PLAN_KIND,
        schemaVersion: 1,
        sourceHash,
        selectionHash: request.context.selectionHash,
        outcomePlanHash: request.context.outcomePlanHash,
        eventDrafts: [{
          eventType: 'missionOutcomeCommitted',
          nodeTransitions: [],
          factTransitions: [{ factId: 'fact.hesperus.ownerConvicted', to: 'known' }],
          threadTransitions: [],
          commandLogRefs: []
        }],
        rejectedAssertions: [],
        diagnostics: { reasonerUsed: true, uncertainties: [] }
      } } };
    }
    return { ok: false, error: { code: 'should_not_review_bad_delta' } };
  }
};

const rejectedFutureFact = await runMissionDirectorStoryGraphSpine({
  generationRouter: futureFactRouter,
  sourceHash: 'frame.hash.future',
  campaignState: {
    campaign: { id: 'campaign.1' },
    mission: { activeMissionId: 'prelude-a-ship-underway', activeMissionGraphId: 'prelude-a-ship-underway', activePhaseId: 'shuttle-rendezvous' },
    storyEventLedger: { events: [] },
    knowledgeLedger: { facts: [{ id: 'fact.hesperus.inspectionFalsified', known: true }] }
  },
  packageData: { manifest: { id: 'ashes-of-peace' } },
  missionGraph: { id: 'prelude-a-ship-underway', phases: [{ id: 'shuttle-rendezvous', label: 'Shuttle Rendezvous' }] },
  sourceFrameRef: { id: 'source.future', textHash: 'hash.future' },
  outcomePlanHash: 'outcome.hash.future'
});
assert.equal(rejectedFutureFact.ok, false);
assert.equal(rejectedFutureFact.diagnostics.stage, 'storyDeltaPlanValidation');
assert.equal(rejectedFutureFact.diagnostics.error.code, 'unknown_fact_id');
```

- [ ] **Step 3: Run tests**

Run:

```powershell
npm.cmd run test:mission-director-story-graph-spine
node tools/scripts/test-runtime-stage18-rerun-branch-recovery.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```powershell
git add tools/scripts/test-mission-director-story-graph-spine.mjs tools/scripts/test-runtime-stage18-rerun-branch-recovery.mjs
git commit -m "test: guard story position regressions"
```

---

### Task 7: Wire Alpha Gate And Full Verification

**Files:**
- Modify: `tools/scripts/run-alpha-gate.mjs`
- Modify: `package.json` if scripts from earlier tasks need ordering cleanup.

**Interfaces:**
- Consumes all test scripts from Tasks 1-6.
- Produces alpha gate coverage.

- [ ] **Step 1: Add tests to alpha gate**

In `tools/scripts/run-alpha-gate.mjs`, add:

```js
['node', ['tools/scripts/test-story-position-contracts.mjs']],
['node', ['tools/scripts/test-story-ledger-projection.mjs']],
['node', ['tools/scripts/test-story-context-index.mjs']],
['node', ['tools/scripts/test-mission-director-story-graph-spine.mjs']],
```

Place them near existing Mission Director model spine tests.

- [ ] **Step 2: Run focused gates**

Run:

```powershell
npm.cmd run test:story-position-contracts
npm.cmd run test:story-ledger-projection
npm.cmd run test:story-context-index
npm.cmd run test:mission-director-story-graph-spine
npm.cmd run test:mission-director-model-spine
```

Expected: all PASS.

- [ ] **Step 3: Run full gate**

Run:

```powershell
npm.cmd test
```

Expected: PASS with alpha gate count increased by four checks.

- [ ] **Step 4: Commit**

Run:

```powershell
git add package.json tools/scripts/run-alpha-gate.mjs
git commit -m "test: gate story position graph"
```

## Self-Review

- Spec coverage: Tasks 1-7 cover contracts, ledger, active projection, bounded candidates, model selection/review, model delta planning/review, past/future regression tests, rerun path, and alpha gate.
- Placeholder scan: no placeholder or deferred-work language remains.
- Type consistency: role ids, kind constants, function names, candidate ids, hash fields, and event draft shapes match across tasks.
