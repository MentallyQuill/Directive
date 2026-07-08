# Mission Director Model Spine Design

## Status

Design spec for a pre-alpha runtime change. No legacy compatibility is required. Existing deterministic semantic routing, intent parsing, and package-specific outcome selection may be replaced in place.

## Core Rule

Models own judgment. Code owns custody.

Directive must stop using deterministic keyword, phrase, or hand-authored signal tables to decide story meaning, mission intent, story position, consequence semantics, or narrative relevance. Utility and Reasoner calls should make those judgments from source-bound context.

Directive must keep nonsemantic custody code as the final write gate. Schemas, source hashes, idempotency keys, allowed state roots, reducer application, stale-result rejection, persistence, and hard safety red lines remain mechanical checks. Model calls may propose, review, and criticize those boundaries, but they do not become the only protection against corrupt state.

## Problem

The current foreground Mission Director path still depends on brittle deterministic methods after turn routing:

- `src/adjudication/intent-parser.mjs` maps player text and active phase ids into hard-coded `primaryIntent` values and boolean signals.
- `src/adjudication/action-classifier.mjs` and `src/adjudication/capability-validator.mjs` classify authority and feasibility through deterministic rules.
- `src/adjudication/ashes-of-peace/action-resolver.mjs` maps intent ids and booleans into canned outcome packets.
- `src/directors/open-world-turn-coordinator.mjs` falls back to deterministic quest interpretation and systemic resolution in several branches.

This creates the same failure mode as the ready-room turn routing bug: package phase and keyword matches can overpower the actual current scene. The Utility Turn Arbiter prevents some false Mission Director ownership, but once a turn reaches Mission Director, deterministic code can still pick stale story position and stale outcome framing.

## Goal

Add a model-mediated Mission Director spine for foreground Director-owned turns:

1. Build one source-bound, player-safe `MissionDirectorFrame`.
2. Ask a Utility model to resolve story position and outcome relevance.
3. Ask Utility or Reasoner, based on settings and complexity, to produce a bounded `MissionOutcomePlan`.
4. Ask a model reviewer to inspect source use, story-position fit, and narration safety.
5. Let existing custody code validate and commit only mechanically valid state.

The first slice should remove deterministic semantic authority from Mission Director turn routing and Ashes outcome selection without touching background sidecars.

## Non-Goals

- Do not migrate Crew, Ship, Continuity, Relationship, or Command Bearing sidecars in this slice.
- Do not let model output directly mutate campaign state.
- Do not remove mechanical validation, source custody, idempotency, state-delta gateway checks, persistence, or stale-source rejection.
- Do not port Saga or Recursion code verbatim.
- Do not create new player-facing UI beyond existing provider diagnostics unless implementation discovers an existing settings surface that must expose role routing.
- Do not require Reasoner for normal play.

## References

### Recursion Pattern

Recursion is useful because it uses one explicit runtime plan per turn:

- frozen snapshot;
- Utility Arbiter;
- bounded provider jobs;
- optional Reasoner synthesis;
- shared validation, prompt composition, diagnostics, and stale-result rejection.

Directive should adapt the lifecycle, not the card system.

### Saga Pattern

Saga is useful because its Context Resolution work treats story position as a first-class object:

- Context rows carry `contextType`, `sceneDate`, `arc`, `phase`, `anchorId`, `anchorFrom`, and `anchorTo`;
- exact anchors and bounded windows are separate;
- local resolver, Reasoner proposal, proposal review, lock state, and audit logs are separate surfaces;
- lore eligibility is tied to explicit story position rather than broad keyword matching.

Directive should adapt that idea into a campaign-native `MissionStoryPosition` object. A Directive story position is not a loredeck context row, but it should be equally explicit about mission, quest, phase, location, scene window, active decision ids, open objectives, source anchors, and confidence.

## Architecture

Current simplified foreground outcome path:

```text
Utility Turn Arbiter
  -> directiveOutcome route
  -> open-world turn coordinator
  -> deterministic parseIntent()
  -> deterministic action/classification/capability checks
  -> deterministic Ashes resolver or systemic quest resolver
  -> preview/commit/narration
```

Target path:

```text
Utility Turn Arbiter
  -> directiveOutcome route
  -> MissionDirectorFrame builder
  -> missionDirectorStoryPositioner
  -> MissionStoryPosition validation
  -> missionDirectorOutcomePlanner
  -> MissionOutcomePlan validation
  -> missionDirectorPlanReviewer
  -> custody validation and packet assembly
  -> preview/commit/narration
```

The model spine owns story judgment. The coordinator owns sequencing. Custody validators own whether data is structurally safe to commit.

## New Roles

### `missionDirectorStoryPositioner`

- providerKind: `utility`
- blocking: `true`
- output: `structured-json`
- timeoutMs: 45000
- modelPreferences: low cost, fast latency, utility-reasoning
- mayProposeState: `false`
- mayInjectPrompt: `false`
- mayRunDuringMainGeneration: `true`
- fallback: `fail-closed`

Purpose: identify the current story position, relevant mission frame, active decision surface, source continuity constraints, and whether the player text is actually outcome-bearing.

### `missionDirectorOutcomePlanner`

- providerKind: `reasoning` when Reasoner is enabled and the story position is complex; otherwise `utility`
- blocking: `true`
- output: `structured-json`
- timeoutMs: 90000
- modelPreferences: balanced, medium latency, reasoning-writing
- mayProposeState: `true`
- mayInjectPrompt: `false`
- mayRunDuringMainGeneration: `true`
- fallback: `fail-closed`

Purpose: produce a bounded mission outcome plan from the validated story position and package vocabulary.

### `missionDirectorPlanReviewer`

- providerKind: `utility`
- blocking: `true`
- output: `structured-json`
- timeoutMs: 45000
- modelPreferences: low cost, fast latency, utility-reasoning
- mayProposeState: `false`
- mayInjectPrompt: `false`
- mayRunDuringMainGeneration: `true`
- fallback: `fail-closed`

Purpose: review story-position fit, source use, hidden-state exposure, stale setup, and narration constraints before custody code assembles the packet.

## Mission Director Frame

`MissionDirectorFrame` is the only input the story-positioner receives. It is player-safe, source-bound, and compact.

Required fields:

```json
{
  "kind": "directive.missionDirectorFrame.v1",
  "schemaVersion": 1,
  "campaignId": "campaign id",
  "saveId": "save id",
  "chatId": "chat id",
  "ingress": {
    "ingressId": "ingress id",
    "hostMessageId": "host message id",
    "textHash": "source text hash",
    "sourceFrameRef": {}
  },
  "turnArbiterPlan": {},
  "recentTranscript": [],
  "sourceSettlement": {},
  "currentStoryState": {
    "activeMissionId": "prelude-a-ship-underway",
    "activeMissionGraphId": "mission graph id",
    "activePhaseId": "ready-room-handover",
    "foregroundQuestId": "prelude-a-ship-underway",
    "locationId": "captain-ready-room",
    "stardate": 58912.4,
    "presentCharacterIds": ["mara-whitaker", "hadrik-bronn"]
  },
  "packageStoryMap": {
    "missions": [],
    "phases": [],
    "decisionPoints": [],
    "outcomeOptions": [],
    "knownFacts": [],
    "revealBoundaries": []
  },
  "continuityProjection": {},
  "promptStatus": {},
  "recoverySummary": {}
}
```

The frame must not include raw prompts, provider reasoning, cookies, CSRF tokens, API keys, private NPC thoughts, raw relationship values, raw hidden pressure values, or unbounded campaign state.

## Mission Story Position

Canonical output kind:

```text
directive.missionStoryPosition.v1
```

Required shape:

```json
{
  "kind": "directive.missionStoryPosition.v1",
  "schemaVersion": 1,
  "sourceHash": "hash of MissionDirectorFrame",
  "confidence": 0.84,
  "storyPosition": {
    "contextType": "phase_window",
    "missionId": "prelude-a-ship-underway",
    "questId": "prelude-a-ship-underway",
    "phaseId": "ready-room-handover",
    "locationId": "captain-ready-room",
    "anchorId": "ready-room-whitaker-question",
    "anchorFrom": "ready-room-entry-complete",
    "anchorTo": "ready-room-handoff-close",
    "arc": "Prelude",
    "phase": "A Ship Underway",
    "currentConversation": "Whitaker asks for the XO's first read before the inspection."
  },
  "sceneContinuity": {
    "mustPreserve": [],
    "mustNotReestablish": []
  },
  "outcomeRelevance": {
    "route": "outcome | hostContinue | pause",
    "reason": "why this is or is not Mission Director owned",
    "activeDecisionIds": [],
    "candidateOutcomeIds": [],
    "requiresClarification": false
  },
  "sourceUse": {
    "evidenceRefs": ["message:18"],
    "ignoredStaleSetup": [],
    "uncertainties": []
  }
}
```

`hostContinue` from this role means the Utility Turn Arbiter sent a turn to Mission Director but the more specific Mission Director story-positioner found it is ordinary in-scene continuation. Runtime should release host generation with the continuity constraints and must not commit mechanics.

## Mission Outcome Plan

Canonical output kind:

```text
directive.missionOutcomePlan.v1
```

Required shape:

```json
{
  "kind": "directive.missionOutcomePlan.v1",
  "schemaVersion": 1,
  "sourceHash": "hash of MissionDirectorFrame",
  "storyPositionHash": "hash of MissionStoryPosition",
  "resultBand": "Success | Partial Success | Partial Failure | Failure | Great Failure",
  "outcomeSummary": "player-safe summary",
  "consequencePlan": {
    "costs": [],
    "revealedFactIds": [],
    "commandDecisionAwards": [],
    "openAssignments": [],
    "questOutcomeKey": "",
    "completionRecommendation": "continue | completeQuest | pauseForReview"
  },
  "narrationPlan": {
    "allowedFacts": [],
    "forbiddenFacts": [],
    "constraints": [],
    "mustPreserve": [],
    "mustNotReestablish": []
  },
  "stateProposal": {
    "allowedRoots": [],
    "operations": []
  },
  "diagnostics": {
    "reasonerUsed": false,
    "uncertainties": [],
    "reviewRequired": false
  }
}
```

The planner can propose operations, but it cannot apply them. The commit path must reject unknown roots, unknown ids, source hash mismatches, stale source, hidden-state leaks, and operations that do not pass existing mechanical state-delta validation.

## Reviewer Result

Canonical output kind:

```text
directive.missionDirectorPlanReview.v1
```

Required shape:

```json
{
  "kind": "directive.missionDirectorPlanReview.v1",
  "schemaVersion": 1,
  "sourceHash": "hash of MissionDirectorFrame",
  "storyPositionHash": "hash of MissionStoryPosition",
  "outcomePlanHash": "hash of MissionOutcomePlan",
  "approved": true,
  "risk": "low | medium | high",
  "requiredAction": "approve | pause | retryStoryPosition | retryOutcomePlan | hostContinue",
  "reasons": [],
  "narrationSafety": {
    "hiddenStateLeak": false,
    "staleSetupRisk": false,
    "forbiddenClaims": []
  }
}
```

Reviewer approval is necessary but not sufficient. Custody validation still decides whether the plan can become a committed turn packet.

## Settings Policy

V1 should keep settings simple:

- Utility is always the default for `missionDirectorStoryPositioner`.
- `missionDirectorOutcomePlanner` uses Utility at low reasoning settings.
- `missionDirectorOutcomePlanner` may use Reasoner at medium or higher settings when the positioner reports complex, ambiguous, high-risk, or multi-decision output.
- `missionDirectorPlanReviewer` uses Utility.
- If the requested lane is unavailable, the role fails closed instead of falling back to deterministic semantics.

The existing provider settings should be reused. New per-role routing UI is not required for V1.

## Failure Policy

- Story positioner failure: pause or hostContinue only when source is clean and Arbiter continuity makes host continuation safe. Never commit deterministic mechanics.
- Story positioner returns `hostContinue`: release host generation with source-bound continuity guidance. Do not commit a Director outcome.
- Outcome planner failure: pause for retry/review. Do not use Ashes canned resolver fallback.
- Reviewer failure: pause for retry/review.
- Custody validation failure: pause or recovery. Do not retry by mutating the plan locally.
- Stale source after any model call: discard the result and record sanitized diagnostics.

## Deterministic Demotion

The following code may remain temporarily as fixtures, comparison tools, or custody helpers, but it must stop owning foreground Mission Director semantics:

- `src/adjudication/intent-parser.mjs`
- `src/adjudication/action-classifier.mjs`
- `src/adjudication/capability-validator.mjs`
- `src/adjudication/ashes-of-peace/action-resolver.mjs`
- deterministic fallback in `src/directors/open-world-turn-coordinator.mjs`

Package-authored mission graphs remain important, but their job changes. They provide candidate ids, constraints, fact vocabulary, phase labels, risk language, and valid consequence surfaces. They do not decide that a player message matched a specific outcome by keyword.

## Observability

Model-call journal records:

- role id;
- provider lane and provider label;
- source hash, story-position hash, and outcome-plan hash;
- selected story position;
- route and result band;
- review required action;
- latency, retry count, parse status, validation status, and stale-source status.

Diagnostics must not persist raw prompt text, raw player text, raw provider output, hidden state, or provider reasoning.

## Test Strategy

Focused tests:

- role registry and authority matrix include all three new roles;
- contract parsers accept valid objects and reject wrong hashes, hidden-state leaks, unknown roots, missing evidence, and unsupported actions;
- Mission Director frame builder excludes raw hidden state and includes story-position ingredients;
- ready-room continuation routed to Mission Director by mistake is demoted to hostContinue by story-positioner output;
- Ashes consequential order becomes a model-authored outcome plan and commits through existing custody validation;
- planner failure cannot call `parseIntent()` or the Ashes resolver as semantic fallback;
- reviewer rejection pauses without committing mechanics.

Broad gates:

- `node tools/scripts/test-generation-router.mjs`
- `node tools/scripts/test-model-call-authority-matrix.mjs`
- `node tools/scripts/test-chat-turn-orchestrator.mjs`
- `node tools/scripts/test-chat-native-runtime-flow.mjs`
- `node tools/scripts/run-alpha-gate.mjs`
- `npm.cmd test`

Live proof:

- Use the live Ashes ready-room sequence that previously reintroduced setup.
- Verify `utilityTurnArbiter`, `missionDirectorStoryPositioner`, and no deterministic Mission Director outcome commit for ordinary in-scene dialogue.
- Send a truly consequential mission order and verify the model spine produces story position, outcome plan, review, and a single committed outcome.
- Verify model-call journal and Settings diagnostics expose sanitized role status.

## Acceptance Criteria

- Foreground Mission Director outcome semantics no longer depend on keyword-triggered `primaryIntent` or Ashes resolver branches.
- Mission Director story position is explicit, source-bound, Saga-inspired, and visible in sanitized diagnostics.
- Outcome plans are model-authored and custody-validated before commit.
- Sidecar Directors are untouched except for consuming the committed turn packet as they already do.
- No model failure path commits deterministic mission mechanics.
- Full alpha gate passes.
