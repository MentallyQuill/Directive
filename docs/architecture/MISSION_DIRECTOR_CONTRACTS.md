# Mission Director Contracts

## Purpose

Mission Director contracts define the turn-level packets that let Directive pilot a flexible mission without letting narration invent state.

The Mission Director manages the situation. Adjudication validates authority and capability. State deltas commit consequences. SillyTavern receives only the narrator-safe packet after the outcome is committed.

## Artifacts

- Turn contract schema: [mission-director-turn.schema.json](../../schemas/mission/mission-director-turn.schema.json)
- Hesperus turn fixture: [prelude-hesperus-fraud-turn.turn.fixture.json](../../tests/fixtures/mission/prelude-hesperus-fraud-turn.turn.fixture.json)
- Contract validator: [validate-mission-director-contract.mjs](../../tools/scripts/validate-mission-director-contract.mjs)
- Prelude graph: [Prelude Mission Graph](../packages/PRELUDE_MISSION_GRAPH.md)
- Retrieval architecture: [Director Retrieval And Context Orchestration](DIRECTOR_RETRIEVAL_AND_CONTEXT_ORCHESTRATION.md)

## Turn Packet Spine

The initial contract uses this packet sequence:

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

The sequence matters. Narration is downstream from committed structure.

## Scene Snapshot

The scene snapshot is the committed-state input to the turn. It includes:

- Campaign, mission, graph, and active phase.
- Current stardate and location.
- Present characters.
- Known facts.
- Active decision points.
- Player input.

It is built from campaign state and recent transcript, but committed state wins when they disagree.

## Intent Parse

The intent parse converts prose into structured intent without deciding success.

It should identify:

- Summary.
- Primary intent.
- Targets.
- Declared method.
- Assumptions that need validation.

The parser may be provider-assisted later, but validation owns authority.

## Action Classification

Allowed categories:

- `validWithinMissionBounds`
- `missionRelevantLateralMove`
- `missionAbandoningMove`
- `impossibleOrUnsupportedMove`

Classification determines which checks are needed. It does not decide the result by itself.

## Authority And Capability

The authority/capability check asks:

- Does the player have jurisdiction or delegated authority?
- Is Captain Whitaker's approval required, available, implied, or denied?
- Which crew or ship systems can execute the action?
- What physical, legal, medical, social, or time constraints apply?
- Is the result feasible, partial, impossible, or possible only with cost?

This packet is where mission-abandoning moves become serious command decisions instead of hard refusals.

## Director Response

The Director response identifies what mission structure responds:

- Decision points used.
- Facts used.
- Clocks used.
- Command Moment candidates.
- Response summary.

The Director response does not mutate state directly.

## Outcome Packet

The outcome packet is the adjudicated result:

- Outcome id.
- Result band.
- Summary.
- Costs.
- Revealed facts.
- Command Moment awards.

Result bands should remain deterministic-first. A good, well-supported action should usually succeed or partially succeed, with cost determined by the actual constraints.

Directive uses six named outcome bands:

- `Great Success`: achieves intent cleanly and creates extra advantage.
- `Success`: achieves intent with normal cost.
- `Partial Success`: achieves main intent, but leaves a cost, delay, debt, or complication.
- `Partial Failure`: does not fully achieve intent, but preserves something important or creates a useful opening.
- `Failure`: intent fails and consequence lands.
- `Great Failure`: intent fails and creates a serious new problem, while still remaining fair and causal.

## State Delta

The state delta is the only packet that changes campaign state.

Initial delta domains:

- Mission known facts.
- Mission outcome flags.
- Clocks.
- Command style continuity records.
- Relationship descriptive changes.
- Turn ledger append.

Future delta domains will include phase advancement, actor posture, fronts, ship damage, crew development, values, directives, assets, and side mission state.

## Narrator Packet

The narrator packet is built after the state delta is accepted.

It may include:

- Player-safe facts.
- Narrator-safe crew cards.
- Result constraints.
- Committed visible consequences.

It must not include:

- Raw relationship values.
- Hidden clock values.
- Director-only facts.
- Locked crew revelations.
- Uncommitted possible outcomes.

## Command Log Packet

The Command Log packet is also built after commit.

It receives:

- Source outcome id.
- Summary inputs.
- Visible consequences.

The Command Log is player-facing and character-facing. It should read like meaningful ship and campaign continuity, not diagnostics.

The Command Log may summarize that the player earned Resolve or that the ship accepted a delay. It must not include hidden state refs, raw relationship values, internal clock numbers, or debug-only fields.

## Current Fixture

The first fixture validates a Hesperus turn:

- Player transfers medically vulnerable passengers first.
- Player preserves falsified inspection evidence.
- Player orders the owner to remain available for formal inquiry.
- Player limits the repair to impulse-safe stabilization.
- Outcome is `Partial Success`.
- Resolve is awarded through `command.hesperus-fraud-accountability`.
- Narrator packet receives only narrator-safe cards and player-safe facts.
- Command Log packet summarizes visible consequences without raw state.

## Verification

Run:

```powershell
node tools\scripts\validate-mission-director-contract.mjs
```

The validator checks fixture ids against the graph, projection, and crew dataset. It also verifies Command Moment awards, outcome flag values, clock bounds, narrator-safe card use, and swipe reroll protection.

## Open Design Questions

- Should `authorityCapabilityCheck` split Captain authority from player authority?
- Should relationship changes remain descriptive in the turn contract, with any hidden projection handled by Crew Director?
- Should mission-abandoning moves get their own fixture before runtime work starts?
