# Open World Story Position Graph Design

## Status

Design spec for the next Mission Director architecture slice. Directive is pre-alpha; no legacy compatibility is required. Existing mission-position and outcome fixtures may be updated in place.

## Core Rule

Models own story judgment. Code owns source custody and durable storage mechanics.

No runtime foreground story meaning should be decided by keyword, phrase, hard-coded intent, or package-specific deterministic semantic rules. Model calls decide what the player is doing, where the story is, which candidate story surface is active, whether a turn resolves an outcome, and whether proposed state changes fit the story.

Code still owns nonsemantic custody: schema shape, id equality, source hashes, append-only event writes, idempotency, stale-source rejection, transaction order, and persistence. Code may reject structurally invalid output; it must not infer story meaning to repair model judgment.

## Problem

The first Mission Director model spine moved foreground outcome judgment into model calls, but story position is still thin:

- `MissionDirectorFrame.packageStoryMap` lists phases, decision points, outcomes, facts, and reveal boundaries.
- `missionDirectorStoryPositioner` returns a freeform `MissionStoryPosition`.
- Normalization checks shape, source hash, route, result band, state roots, fact ids, decision ids, and hidden-state leak strings.

This is not Saga-grade story position management. Saga has a Context Index, bounded resolver candidates, confidence handling, context gates, and injection eligibility tied to accepted Context. Directive needs the same strength, but Saga's timeline model is not enough for an open-world command game.

Directive needs a graph plus ledger:

- the graph says what could be true next;
- the ledger says what did happen;
- the active projection says what is currently playable;
- models choose from bounded candidates and propose deltas against that projection.

## Goal

Add a campaign-native Story Position Graph system that supports nonlinear missions, open-world fronts, side scenes, aftermath, reruns, and branch saves.

The runtime must:

1. Build a source-bound `StoryContextIndex` each turn.
2. Derive bounded `StoryPositionCandidate` rows from campaign graph, ledger, active projection, recent source, and open assignments.
3. Ask `missionDirectorStoryPositioner` to choose candidate ids instead of inventing story coordinates.
4. Ask a reviewer to validate candidate fit, source use, and stale-history risk.
5. Ask a model delta planner to propose story ledger events, fact reveals, node status changes, and thread updates.
6. Ask a model delta reviewer to inspect the proposal before custody code appends events.
7. Materialize active story state from append-only story events so future calls cannot accidentally treat past, future, closed, or rerun-only events as current.

## Non-Goals

- Do not port Saga's loredeck Context system directly.
- Do not make story position one linear timeline.
- Do not use keyword triggers to select candidates.
- Do not let model output directly mutate campaign state without reviewed structured delta.
- Do not migrate background sidecars in this slice.
- Do not build new UI beyond diagnostics needed by tests.
- Do not require all package content to be rewritten before this can land; derive initial graph rows from existing mission graphs and projection data.

## Why A Graph Is Not Linear

A linear story has one current point and one next point:

```text
phase A -> phase B -> phase C
```

Directive's story often has multiple live surfaces:

```text
hesperus.command
  -> hesperus.passengerTransfer
  -> hesperus.evidenceCustody
  -> hesperus.ownerInquiry
  -> crew.commandReview
  -> ship.repairLogistics
```

Those nodes can be active together. Some close. Some pause. Some become aftermath. Some become available only if a prior fact is revealed. Some can be revisited only through rerun/branch authority.

The graph is not campaign truth. It is the package-authored and runtime-discovered topology of possible story surfaces. Campaign truth lives in an append-only ledger.

## Data Model

### `StoryGraph`

Static or semi-static topology loaded from package mission graphs, campaign projection, and runtime extensions.

```js
export const STORY_GRAPH_KIND = 'directive.storyGraph.v1';

export const storyGraph = {
  kind: STORY_GRAPH_KIND,
  graphId: 'graph.breckenridge.prelude',
  nodes: {
    'hesperus.command': {
      id: 'hesperus.command',
      type: 'missionDecision',
      label: 'Hesperus command decision',
      missionId: 'prelude-a-ship-underway',
      phaseId: 'shuttle-rendezvous',
      tags: ['hesperus', 'command', 'evidence'],
      candidateWhen: {
        anyStatus: ['active', 'available'],
        requiredFactIds: [],
        blockedByFactIds: []
      }
    },
    'hesperus.evidenceCustody': {
      id: 'hesperus.evidenceCustody',
      type: 'thread',
      label: 'Hesperus evidence custody',
      missionId: 'prelude-a-ship-underway',
      phaseId: 'shuttle-rendezvous',
      tags: ['hesperus', 'evidence', 'legal']
    }
  },
  edges: [
    {
      id: 'edge.hesperus.command.evidenceCustody',
      from: 'hesperus.command',
      to: 'hesperus.evidenceCustody',
      type: 'opensThread',
      conditionFactIds: ['fact.hesperus.inspectionFalsified'],
      blockedByFactIds: []
    }
  ]
};
```

### `StoryEventLedger`

Append-only durable truth. Events record source outcome, source frame, node ids, fact ids, and status transitions.

```js
export const STORY_EVENT_LEDGER_KIND = 'directive.storyEventLedger.v1';

export const storyEventLedger = {
  kind: STORY_EVENT_LEDGER_KIND,
  schemaVersion: 1,
  events: [
    {
      id: 'storyEvent.outcome.stage18.hesperus.001',
      outcomeId: 'outcome.stage18.hesperus.001',
      turnId: 'turn.stage18.hesperus.001',
      sourceFrameRef: {
        id: 'sourceFrame.stage18.hesperus.001',
        textHash: 'sha256:...'
      },
      eventType: 'missionOutcomeCommitted',
      occurredAt: '2026-07-09T12:00:00.000Z',
      nodeTransitions: [
        { nodeId: 'hesperus.command', from: 'active', to: 'completed' },
        { nodeId: 'hesperus.evidenceCustody', from: 'unseen', to: 'active' },
        { nodeId: 'hesperus.ownerInquiry', from: 'unseen', to: 'available' }
      ],
      factTransitions: [
        { factId: 'fact.hesperus.inspectionFalsified', to: 'known' }
      ],
      threadTransitions: [
        { threadId: 'thread.hesperus.evidenceCustody', to: 'active' }
      ],
      commandLogRefs: ['commandLog.outcome.stage18.hesperus.001'],
      supersedesEventIds: [],
      branchId: 'main'
    }
  ]
};
```

### `ActiveStoryProjection`

Materialized from ledger. This is what model calls use to avoid assigning past events by accident.

```js
export const activeStoryProjection = {
  kind: 'directive.activeStoryProjection.v1',
  schemaVersion: 1,
  revision: 42,
  branchId: 'main',
  activeNodeIds: ['hesperus.evidenceCustody', 'hesperus.ownerInquiry'],
  availableNodeIds: ['crew.commandReview'],
  completedNodeIds: ['hesperus.command'],
  closedNodeIds: [],
  blockedNodeIds: [],
  knownFactIds: ['fact.hesperus.inspectionFalsified'],
  notYetTrueFactIds: ['fact.hesperus.ownerConvicted'],
  staleNodeIds: ['hesperus.command'],
  rerunOnlyNodeIds: ['hesperus.command'],
  activeThreadIds: ['thread.hesperus.evidenceCustody'],
  closedThreadIds: [],
  lastOutcomeId: 'outcome.stage18.hesperus.001',
  lastStoryEventId: 'storyEvent.outcome.stage18.hesperus.001'
};
```

### `StoryPositionCandidate`

Bounded rows shown to model. Candidate rows carry id, status, evidence, allowed assertions, and forbidden assumptions.

```js
export const candidate = {
  id: 'candidate.hesperus.evidenceCustody.active',
  nodeId: 'hesperus.evidenceCustody',
  candidateType: 'activeThread',
  status: 'active',
  mode: 'mission',
  priorityBand: 'primary',
  coordinates: {
    missionId: 'prelude-a-ship-underway',
    phaseId: 'shuttle-rendezvous',
    locationId: 'breckenridge-bridge',
    threadId: 'thread.hesperus.evidenceCustody'
  },
  evidenceRefs: [
    'storyEvent.outcome.stage18.hesperus.001',
    'fact.fact.hesperus.inspectionFalsified'
  ],
  allowedFactIds: ['fact.hesperus.inspectionFalsified'],
  notYetTrueFactIds: ['fact.hesperus.ownerConvicted'],
  forbiddenAssertions: [
    'Do not say the owner has been convicted.',
    'Do not replay the original Hesperus command decision as pending.'
  ],
  staleSetupGuards: [
    'Original command decision is completed; only aftermath or rerun branch can reopen it.'
  ]
};
```

## Runtime Flow

```text
Utility Turn Arbiter
  -> directiveOutcome
  -> StoryContextIndex builder
  -> StoryPositionCandidate builder
  -> missionDirectorStoryPositioner
  -> missionDirectorStoryPositionReviewer
  -> missionDirectorOutcomePlanner
  -> missionDirectorStoryDeltaPlanner
  -> missionDirectorStoryDeltaReviewer
  -> custody append story events
  -> materialize ActiveStoryProjection
  -> commit outcome / narration / prompt sync
```

## Model Roles

### `missionDirectorStoryPositioner`

Utility call. Selects one primary candidate and zero or more secondary candidates.

Output:

```js
{
  kind: 'directive.missionStoryPositionSelection.v1',
  sourceHash: 'frame.hash',
  primaryCandidateId: 'candidate.hesperus.evidenceCustody.active',
  secondaryCandidateIds: ['candidate.hesperus.ownerInquiry.available'],
  route: 'outcome',
  confidence: 0.86,
  evidenceRefs: ['message:18', 'storyEvent.outcome.stage18.hesperus.001'],
  ignoredStaleSetup: ['Earlier boarding setup is no longer current.'],
  continuityGuards: {
    mustPreserve: ['Evidence was preserved.'],
    mustNotReestablish: ['Original command decision as still pending.']
  },
  unresolved: []
}
```

### `missionDirectorStoryPositionReviewer`

Utility call. Reviews candidate selection against source refs and active projection.

Output:

```js
{
  kind: 'directive.missionStoryPositionReview.v1',
  sourceHash: 'frame.hash',
  selectionHash: 'selection.hash',
  approved: true,
  requiredAction: 'approve',
  risk: 'low',
  reasons: [],
  rejectedCandidateIds: [],
  staleHistoryRisk: false,
  forbiddenAssertionRisk: false
}
```

### `missionDirectorStoryDeltaPlanner`

Reasoner or Utility call, selectable by settings. Produces story ledger events, not direct state mutation.

Output:

```js
{
  kind: 'directive.storyDeltaPlan.v1',
  sourceHash: 'frame.hash',
  selectionHash: 'selection.hash',
  outcomePlanHash: 'outcome.hash',
  eventDrafts: [
    {
      eventType: 'missionOutcomeCommitted',
      nodeTransitions: [
        { nodeId: 'hesperus.ownerInquiry', to: 'active', reason: 'Player ordered owner held for formal inquiry.' }
      ],
      factTransitions: [],
      threadTransitions: [
        { threadId: 'thread.hesperus.ownerInquiry', to: 'active' }
      ],
      commandLogRefs: []
    }
  ],
  rejectedAssertions: [
    'Owner convicted is not yet true.'
  ],
  diagnostics: {
    reasonerUsed: true,
    uncertainties: []
  }
}
```

### `missionDirectorStoryDeltaReviewer`

Utility call. Reviews whether planned events fit accepted candidates, known facts, stale guards, and branch authority.

Output:

```js
{
  kind: 'directive.storyDeltaReview.v1',
  sourceHash: 'frame.hash',
  deltaPlanHash: 'delta.hash',
  approved: true,
  requiredAction: 'approve',
  risk: 'low',
  reasons: [],
  forbiddenPastAssignment: false,
  futureFactLeak: false,
  missingBranchAuthority: false
}
```

## Preventing Past Event Accidents

Each model request includes explicit ledgers:

```js
{
  alreadyCommitted: [
    {
      eventId: 'storyEvent.outcome.stage18.hesperus.001',
      outcomeId: 'outcome.stage18.hesperus.001',
      summary: 'Player preserved Hesperus evidence and prioritized vulnerable passengers.',
      completedNodeIds: ['hesperus.command'],
      openedNodeIds: ['hesperus.evidenceCustody', 'hesperus.ownerInquiry']
    }
  ],
  notYetTrue: [
    'fact.hesperus.ownerConvicted',
    'fact.hesperus.repairTeamCompletedStabilization'
  ],
  closedOrUnavailable: [
    {
      nodeId: 'hesperus.command',
      reason: 'Completed; reopen requires rerun branch authority.'
    }
  ]
}
```

Review rejects if a model:

- treats completed node as pending;
- asserts `notYetTrueFactIds`;
- advances to a node not connected by graph edge or model-approved open-world bridge;
- closes a thread without source support;
- reopens closed/rerun-only node without repair/rerun authority;
- assigns a past outcome to the current turn;
- uses evidence refs not present in frame, index, or ledger.

## Open World Bridges

Open-world play cannot require every valid move to have a preauthored edge. Use model-reviewed bridge events when player action creates a reasonable new surface.

```js
{
  eventType: 'openWorldBridgeCreated',
  fromCandidateId: 'candidate.hesperus.evidenceCustody.active',
  newNode: {
    id: 'runtime.hesperus.mediaBriefing',
    type: 'openWorldThread',
    label: 'Media briefing after Hesperus rescue',
    parentNodeIds: ['hesperus.evidenceCustody']
  },
  reason: 'Player ordered a public briefing to control misinformation.',
  custody: {
    sourceFrameRef: { id: 'sourceFrame.123', textHash: 'sha256:...' },
    reviewerApproved: true
  }
}
```

Bridge nodes must be marked runtime-created, branch-scoped, source-bound, and reversible through transaction repair.

## Prompt And Lore Injection

The accepted `ActiveStoryProjection` becomes input to continuity projection and narrator packets.

Continuity planner receives:

```js
{
  activeStoryProjection,
  acceptedPositionSelection,
  selectedCandidates,
  storyGuards: {
    mustPreserve: [],
    mustNotReestablish: [],
    forbiddenAssertions: []
  }
}
```

Injection selection should prefer facts tied to active candidates and suppress facts tied only to future, closed, stale, or rerun-only nodes.

## Diagnostics

Each committed outcome should preserve compact diagnostics:

```js
{
  modelSpine: true,
  storyGraph: {
    indexHash: 'hash',
    candidateHash: 'hash',
    selectedCandidateIds: ['candidate.hesperus.evidenceCustody.active'],
    projectionRevisionBefore: 42,
    projectionRevisionAfter: 43
  },
  hashes: {
    selectionHash: 'hash',
    positionReviewHash: 'hash',
    deltaPlanHash: 'hash',
    deltaReviewHash: 'hash'
  }
}
```

Do not persist raw model prompts, raw provider output, or raw player text in diagnostics.

## Acceptance Criteria

- Story positioner request includes bounded candidates and active projection.
- Story positioner output cannot introduce unknown candidate ids.
- Completed nodes are visible as completed/rerun-only, not pending.
- Delta planner emits event drafts, not direct state mutation.
- Delta reviewer can reject past-event reassignment and future fact leaks.
- Active projection materializes from story event ledger.
- Outcome rerun/branch preview uses branch-scoped ledger projection.
- Continuity projection can consume accepted story candidates.
- Alpha gate includes focused tests for nonlinear multi-active-node state.

