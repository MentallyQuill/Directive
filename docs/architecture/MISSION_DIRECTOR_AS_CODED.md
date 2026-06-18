# Mission Director As-Coded

## Scope

This document describes the current executable Mission Director loop. It is intentionally narrower than the full design model in [Mission Director Model](../design/MISSION_DIRECTOR_MODEL.md).

The current implementation proves these deterministic end-to-end turn paths:

- Hesperus accountability: transfer vulnerable passengers, preserve inspection-fraud evidence, impose formal inquiry obligations, limit repairs, and accept a minor delay.
- Hesperus accountability repeat: repeat the same Command Decision after it was already awarded, without granting additional progression.
- Captain-approved mission deviation: leave the active Hesperus frame only with evidence, urgency, and a feasible return/support plan.
- Captain-refused mission deviation: attempt to leave without enough cause.
- Captain-counteroffered mission deviation: request departure with partial grounds and receive a limited alternative.
- Impossible/unsupported command: attempt an action without required authority, access, or capability.

## Runtime Entry Point

Main entry point:

```text
src/mission/director.mjs
runMissionDirectorTurn(input)
```

Required input:

```text
turnId
graphPath
projectionPath
graph
projection
crewDataset
sceneSnapshot
campaignState
```

The function clones incoming graph, projection, crew dataset, scene snapshot, and campaign state before processing. The loop must not mutate package template data or caller-owned state.

## Module Ownership

Current source modules:

- `src/mission/director.mjs`: orchestrates the turn transaction and builds narrator/Command Log packets.
- `src/mission/graph-lookup.mjs`: creates lookup maps for mission graph objects and clamps clock values.
- `src/mission/pacing.mjs`: selects ready active-phase pressures using cadence, active decision points, player intent, and focus budget.
- `src/mission/phase-advancement.mjs`: evaluates whether a committed outcome advances the active phase.
- `src/mission/state-delta.mjs`: builds the committed state delta for the generated outcome.
- `src/adjudication/intent-parser.mjs`: extracts deterministic intent signals from player prose.
- `src/adjudication/action-classifier.mjs`: classifies the player action against the active mission frame.
- `src/adjudication/capability-validator.mjs`: validates authority, capability, constraints, and Captain-required deviations.
- `src/adjudication/action-resolver.mjs`: chooses the outcome band, costs, revealed facts, and Command Decision awards.
- `src/adjudication/state-delta-validator.mjs`: verifies generated packets before the Director returns them.

## Turn Sequence

`runMissionDirectorTurn` currently runs this transaction:

```text
clone inputs
index mission graph
parse intent
classify action
check authority and capability
select pressure focus
build Director response
resolve outcome
evaluate phase advancement
build state delta
build narrator packet
build Command Log packet
validate generated turn
return turn packet
```

Narration is still downstream. The loop returns a narrator packet; it does not call a provider or produce prose.

## Pacing Data

The Prelude graph now supports optional pacing fields:

```text
actorIntentions
pressures
directorFocusRules
```

The Hesperus slice includes two active pressures:

- `pressure.hesperus-passenger-risk`
- `pressure.hesperus-inspection-fraud`

The pacing selector:

- Filters pressures to the active phase.
- Requires readiness gates to be populated.
- Scores cadence state, active decision-point links, player intent, and Command Decision availability.
- Selects one primary pressure and one secondary pressure by default.

For the Hesperus fixture, the primary pressure is passenger medical risk and the secondary pressure is inspection-fraud accountability.

## As-Coded Hesperus Behavior

When the player input includes passenger transfer, fraud/evidence preservation, owner accountability, impulse-only stabilization, and accepted delay, the loop produces:

- `intentParse.primaryIntent`: `resolve-hesperus-with-accountability`
- `actionClassification.category`: `validWithinMissionBounds`
- `authorityCapabilityCheck.result`: `authorizedAndFeasibleWithCost`
- `outcomePacket.resultBand`: `Partial Success`
- `outcomePacket.revealedFactIds`: `hesperus.inspection-fraud`
- `outcomePacket.commandDecisionAwards`: Resolve award for `command.hesperus-fraud-accountability`

The state delta commits:

- Hesperus resolution: `passengers-transferred`
- Arrival delay: `minor`
- Hesperus Command Decision: `resolve-awarded`
- Priya, Bronn, Miriam, and Imani relationship continuity flags
- Arrival schedule margin reduced by one
- Hesperus medical risk reduced to zero
- Technical debt pressure unchanged because the repair is limited and logged
- A language-first Resolve record
- Relationship descriptive changes without raw values
- Phase advancement from `hesperus-diversion` to `hesperus-aftermath`
- Turn ledger append with swipe reroll forbidden

## As-Coded Mission-Abandoning Behavior

When the player attempts to leave the active mission area during the Hesperus diversion, the loop classifies the action as `missionAbandoningMove` and then branches through Captain authority.

Supported variants:

- `authorizedDeviationWithConditions`: Whitaker approves a limited deviation when the player has evidence, imminent harm, and a feasible return/support plan. The state delta spends schedule margin and increases Hesperus medical pressure.
- `deviationDenied`: Whitaker refuses when the player lacks evidence, urgency, or a feasible plan.
- `captainCounterofferRequired`: Whitaker denies full departure but authorizes a limited probe, relay, or remote investigation while the Hesperus response remains active.

The Director keeps the active Hesperus pressures in focus:

- `pressure.hesperus-passenger-risk`
- `pressure.hesperus-inspection-fraud`

The ship never leaves automatically. The Captain's authority is resolved through structured packets and visible consequences.

## As-Coded Transaction State

The first transaction-state helper is implemented in `src/campaign/transaction-state.mjs`.

It currently supports:

- `commitDirectorTurn`: applies known facts, outcome flags, phase advancement, clocks, command-style records, relationship descriptions, Command Log entries, and turn-ledger entries from a Director turn packet.
- `recordNarrationSwipe`: records narrator packet revisions for an existing outcome without changing committed mechanics.
- `editCommittedOutcome`: restores the pre-outcome snapshot and commits a replacement turn.
- `deleteCommittedOutcome`: restores the pre-outcome snapshot.
- `restoreCampaignSnapshot`: deep-clones an authoritative snapshot.

This is not full persistence yet. It is the in-memory state transition core that storage and runtime surfaces should call later.

## Narrator Packet Rules

The as-coded narrator packet:

- Includes only player-safe fact ids.
- Selects narrator-safe crew voice cards for the Hesperus scene.
- Exposes no raw hidden values.
- Includes no Director-only data.
- Constrains narration to success with cost and ordinary fraud/maintenance pressure.

The current Hesperus narrator-safe cards are:

- `crew.priya.voice.dependencies-access`
- `crew.bronn.voice.failure-conditions`
- `crew.miriam.voice.human-cost`
- `crew.imani.voice.technical-debt`

## Command Log Packet Rules

The as-coded Command Log packet is player-facing and character-facing. It contains visible continuity only:

- Passenger transfer.
- Inspection record preservation.
- Formal inquiry obligation.
- Minor delay and impulse-safe stabilization.
- Resolve progression.
- Hesperus passenger protection.

It does not include hidden state refs, raw clock values, raw relationship values, or Director-only facts.

## Current Limits

This first slice is intentionally limited:

- Intent parsing is deterministic keyword extraction, not provider-assisted parsing.
- Only the Hesperus accountability case has mission-specific resolution rules.
- Pressure cooldowns are not persisted.
- Actor posture and fronts are not updated yet.
- Exploration mode softening is not implemented in runtime.
- The Command Log packet is assembled deterministically; it is not yet summarized by a provider call.
- Transaction-state work is in-memory only; durable storage, provider-failure recovery, and branch management still need implementation.

## Verification

Focused commands:

```powershell
node tools\scripts\validate-mission-graph.mjs
node tools\scripts\validate-mission-director-contract.mjs
node tools\scripts\test-mission-director-loop.mjs
node tools\scripts\test-transaction-state.mjs
```

The loop fixture is:

```text
tests/fixtures/mission/prelude-hesperus-fraud-director-loop.fixture.json
tests/fixtures/mission/prelude-hesperus-fraud-repeat-director-loop.fixture.json
tests/fixtures/mission/prelude-leave-mission-area-approved-director-loop.fixture.json
tests/fixtures/mission/prelude-leave-mission-area-counteroffer-director-loop.fixture.json
tests/fixtures/mission/prelude-leave-mission-area-director-loop.fixture.json
tests/fixtures/mission/prelude-unsupported-command-director-loop.fixture.json
```

The expected generated turns are compared against:

```text
tests/fixtures/mission/prelude-hesperus-fraud-turn.turn.fixture.json
tests/fixtures/mission/prelude-hesperus-fraud-repeat-turn.turn.fixture.json
tests/fixtures/mission/prelude-leave-mission-area-approved-turn.turn.fixture.json
tests/fixtures/mission/prelude-leave-mission-area-counteroffer-turn.turn.fixture.json
tests/fixtures/mission/prelude-leave-mission-area-turn.turn.fixture.json
tests/fixtures/mission/prelude-unsupported-command-turn.turn.fixture.json
```
