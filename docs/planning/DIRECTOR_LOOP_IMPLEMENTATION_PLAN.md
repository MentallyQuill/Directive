# Director Loop Implementation Plan

## Purpose

This plan defines the first executable Mission Director loop for Directive.

The goal is not a full AI Story Director yet. The goal is a deterministic core loop that can:

- Read a mission graph and campaign state.
- Accept a scene snapshot and player input.
- Classify the action.
- Validate authority and capability.
- Select relevant mission structure and active pressures.
- Produce a committed outcome packet.
- Produce a state delta.
- Produce narrator-safe and Command Log packets.
- Prove the behavior with fixtures and contract tests.

The first executable slice uses the Prelude Hesperus fraud/accountability moment because it already exercises mission pressure, crew concerns, command style, hidden facts, clocks, outcome flags, narrator safety, and Command Log output.

## Current Source State

The repo already has:

- Mission graph schema and Prelude graph.
- Campaign projection schema and Ashes of Peace projection.
- Mission Director turn contract schema.
- A hand-authored Hesperus turn fixture.
- Contract validators for mission graph, projection, crew dataset, and Director turn packets.
- Design docs describing simulation-first mission direction and pacing.

The repo does not yet have runtime source modules that produce a Director turn packet from input state.

## First Runtime Slice

The first slice will implement `runMissionDirectorTurn(input)`.

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

Required output:

```text
sceneSnapshot
intentParse
actionClassification
authorityCapabilityCheck
directorResponse
outcomePacket
stateDelta
narratorPacket
commandLogPacket
```

The output should conform to `schemas/mission/mission-director-turn.schema.json`.

## Module Ownership

Initial modules:

- `src/mission/director.mjs`: orchestrates the turn transaction.
- `src/mission/graph-lookup.mjs`: indexes phases, facts, clocks, decision points, command moments, outcome flags, and retrieval hooks.
- `src/mission/pacing.mjs`: selects surfaceable pressures and enforces first-pass scene focus budget.
- `src/mission/state-delta.mjs`: applies bounded state-delta helper logic without mutating source inputs.
- `src/adjudication/intent-parser.mjs`: deterministic first-pass intent extraction from player prose.
- `src/adjudication/action-classifier.mjs`: classifies the action against the active mission frame.
- `src/adjudication/capability-validator.mjs`: checks authority, capability, and constraints.
- `src/adjudication/action-resolver.mjs`: chooses the Directive outcome band and immediate consequences.
- `src/adjudication/state-delta-validator.mjs`: validates that the generated delta references legal graph fields and does not expose hidden raw state.

This keeps the loop from becoming a single large Director file.

## Pacing Data

The Prelude graph should grow optional pacing data:

```text
actorIntentions
pressures
directorFocusRules
```

The runtime must tolerate these fields being absent, but the Hesperus fixture should use them.

The first pressure shape should capture:

- Responsible actor or system.
- Intention.
- Active phase.
- Cadence state.
- Readiness gates.
- Action window.
- Linked facts, clocks, decision points, and command moments.
- Expiry conditions.

This lets the Director select a pressure because it is ready and relevant, not merely because its phase exists.

## Hesperus Fixture Behavior

The first fixture should prove that when the player:

- Transfers medically vulnerable passengers first.
- Preserves inspection-fraud evidence.
- Places the Hesperus owner under formal inquiry obligations.
- Limits repair to impulse-safe stabilization.
- Accepts a logged minor delay.

Then the loop produces:

- Classification: `validWithinMissionBounds`.
- Authority/capability: `authorizedAndFeasibleWithCost`.
- Primary pressure: Hesperus passenger safety and fraud accountability.
- Result band: `Partial Success`.
- Revealed fact: `hesperus.inspection-fraud`.
- Outcome flags for Hesperus resolution, arrival delay, command moment, and relevant senior staff.
- Clock deltas bounded by graph min/max.
- Resolve progression as a language-first record.
- Narrator packet with no hidden raw values.
- Command Log packet with visible continuity only.

## Verification Plan

Add `tools/scripts/test-mission-director-loop.mjs`.

The test should:

- Load the loop fixture.
- Load the graph, projection, and crew dataset.
- Run `runMissionDirectorTurn`.
- Compare the generated packet to the expected turn fixture for the fields that are deterministic in this slice.
- Validate output with the existing Director contract validator.
- Verify no source input objects were mutated.

Run this alongside:

```powershell
node tools\scripts\validate-starship-package.mjs
node tools\scripts\validate-campaign-projection.mjs
node tools\scripts\validate-crew-dataset.mjs
node tools\scripts\test-crew-retrieval-fixture.mjs
node tools\scripts\validate-mission-graph.mjs
node tools\scripts\test-mission-graph-fixture.mjs
node tools\scripts\validate-mission-director-contract.mjs
node tools\scripts\test-mission-director-loop.mjs
node tools\scripts\verify-repo-structure.mjs
```

## Future Iterations

After the first slice passes, later iterations should add:

- Captain approve/refuse/counteroffer fixtures for mission-abandoning moves.
- Exploration mode consequence softening.
- Pressure cooldown persistence.
- Actor posture updates.
- Front advancement.
- LLM-assisted intent parsing with deterministic validation.
- Director retrieval integration.
- Command Log summarization provider call.
- Full campaign simulation package rework for Ashes of Peace.
