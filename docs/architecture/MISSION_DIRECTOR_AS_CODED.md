# Mission Director As-Coded

## Scope

This document describes the current executable Mission Director loop. It is intentionally narrower than the full design model in [Mission Director Model](../design/MISSION_DIRECTOR_MODEL.md).

The current implementation proves these deterministic end-to-end turn paths:

- Arrival tone: board the working Breckinridge, respect or disrupt provisional routines, commit the initial crew-integration signal, and advance into ready-room handover.
- Ready-room handover: complete the Captain/acting-XO handoff, state or defer an initial command value, commit Whitaker/Bronn continuity, and advance into senior readiness work.
- Senior readiness conference: set department priorities, named ownership, accepted risk, and senior staff relationship continuity, then advance into fallback-command drill.
- Fallback-command drill: create a shipwide or temporary fallback-command procedure, expose command-network certificate risk, record technical-debt posture, and advance into command-rhythm scenes.
- Command rhythm: use a freeform transit interval to contact senior officers, record a command-culture tendency, and advance into the Hesperus diversion.
- Hesperus accountability: transfer vulnerable passengers, preserve inspection-fraud evidence, impose formal inquiry obligations, limit repairs, and accept a minor delay.
- Hesperus accountability repeat: repeat the same Command Decision after it was already awarded, without granting additional progression.
- Hesperus aftermath: assign follow-up obligations across departments, preserve optional escape-pod data only when named, and advance into the combined-load test.
- Combined-load test: resolve the ship's integrated technical-debt endgame through staged testing, pause/report, workaround, or concealed risk handling, then advance into final command review.
- Final command review: summarize committed Prelude state, set arrival posture/end state, reveal the Chapter 1 distress-packet transition fact, and activate `chapter-1-the-empty-convoy`.
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
- `src/competence/*`: builds optional Command Competence packets from mission-graph competence policy.
- `src/mission/graph-lookup.mjs`: creates lookup maps for mission graph objects and clamps clock values.
- `src/mission/pacing.mjs`: selects ready active-phase pressures using cadence, active decision points, player intent, and focus budget.
- `src/mission/phase-advancement.mjs`: evaluates whether a committed outcome advances the active phase.
- `src/mission/state-delta.mjs`: builds the committed state delta for the generated outcome.
- `src/simulation/simulation-mode-policy.mjs`: applies Command versus Exploration consequence ceilings and narrator/settings policy text.
- `src/retrieval/*`: indexes package datasets, evaluates hard gates, performs recall lanes, assembles audience packets, and creates retrieval journals.
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
build optional Command Competence packet
classify action
check authority and capability
select pressure focus
build Director response
resolve outcome
apply simulation-mode policy
run Director retrieval
evaluate phase advancement
build state delta
build narrator packet
build Command Log packet
validate generated turn
return turn packet
```

Narration is still downstream. The loop returns a narrator packet; it does not call a provider or produce prose.

When the campaign or scene snapshot provides a simulation mode, the loop applies the mode policy before phase advancement and state-delta construction. Command mode keeps full causal severity. Exploration mode can cap severe results and rewrites fatal player/senior-staff consequences into injury, delay, temporary incapacitation, damaged trust, or lost position without turning failure into success.

The runtime layer wraps this lower-level packet with live-play fields:

- `provisionalOutcome`: base Director result before a Command Bearing spend.
- `competencePacket`: routine actions, Command Brief inputs, Domain Reports, Authority Notes, warnings, and no-gotcha checks when the mission graph supplies competence policy.
- `bearingEligibility`: eligible Inspiration/Resolve intervention actions.
- `anchoredConsequences`: costs the intervention cannot erase.
- `bearingSpend`: selected point, if any.
- `finalOutcome`: committed result after the player accepts or invokes a valid point.

The retrieval run is deterministic-first. It produces separate Mission Director, Crew Director, Ship Director, Command Director, narrator, and Command Log packet ids from the same candidate pass. The current Mission Director consumes the narrator packet ids directly, while the other audience packets and retrieval journals are exposed through retrieval tests and are ready for future Director modules.

## As-Coded Command Competence Behavior

Mission graphs may provide optional `competencePolicy` data. When present, `runMissionDirectorTurn` builds a `competencePacket` before adjudication. The packet is player-safe by contract:

- Routine professional actions are selected by eligibility gates.
- Command judgment remains with the player.
- Command Brief sections are built from routine response, known facts, uncertainty, operational pressure, and command question.
- Domain Reports are limited by report-economy rules.
- Authority Notes and Procedural Warnings are packetized for UI/runtime handling.
- Director-only truths must not appear in the packet.

The current runtime renders the Command Brief during a pending preview. Accepting the preview commits Command Competence records into campaign-owned `commandCompetence` ledgers and preserves the packet on the turn-ledger entry.

Stage 23-24 runtime behavior is now wired into that packet:

- Domain Reports are selected from active decision metadata, present or implicated officers, request scope, player input, and retrieval-card hints when present.
- Active pressure records can influence Domain Report selection when reports declare matching `pressureIds`, `pressureTags`, `pressureCrewIds`, or `pressureSystemIds`.
- Natural-language counsel requests such as "Recommendations?" and "Doctor, risk?" expand the report budget without labeling a correct answer.
- Serious and critical Procedural Warnings pause commit until the player confirms informed intent, revises the order, or requests counsel.
- Confirmed warnings write accepted-risk ledger records; repeated accepted warnings in the same mission phase are suppressed until circumstances change.
- Authority Notes remain informational and do not become hard permission gates.

Chapter 1 is now a real bundled mission graph:

- `packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json`
- The Prelude final review switches active mission state to `chapter-1-the-empty-convoy`, graph id `breckinridge.ashes-of-peace.chapter-1-the-empty-convoy`, phase `initial-reception`, and `decision.initial-convoy-posture`.
- The first opening frame supports counsel-only turns and initial convoy posture turns without exposing director-only truth.
- The first-response resolver distinguishes balanced rescue/evidence, rescue-first, security-first remote reconnaissance, evidence-first caution, diplomacy/coordination-first, reckless quarantine bypass, detention escalation, evidence destruction, and weapons escalation.
- Exploration mode softens severe hazardous response bands while Command mode preserves full deterministic severity.
- Committed first-response turns seed campaign-owned pressure records for regional first impression, rescue delay, quarantine exception review, and evidence custody.
- Chapter 1 first-response state also records player-facing flags for convoy evidence, rescue urgency, quarantine confidence, and Compact posture, plus hidden follow-up state for the missing module lead.
- Later Chapter 1 frames can read those committed flags and pressure links without relying on a hardcoded opening-scene branch.

## As-Coded Pressure Ledger Behavior

Campaign-owned pressure state lives in `pressureLedger`, not in package templates or UI state.

- Prelude final review can seed ship, crew, and obligation pressures from committed Prelude flags.
- Chapter 1 first response can seed regional and obligation pressures from committed convoy posture.
- Pressure records include player-facing summaries, director summaries, type, status, urgency band, escalation band, cooldown metadata, linked crew, linked systems, linked facts, linked phases, linked decision points, linked chapters, linked side templates, and hidden raw-value policy.
- Player-facing pressure summaries may be injected into Command Brief operational pressure when relevant, using only player-safe summaries and routing metadata.
- Pressure links can point forward into later Chapter 1 phases and Open Orders intervals. The links are routing hints for deterministic selection, not promises that a prewritten scene must happen.
- `commitDirectorTurn` applies `stateDelta.pressureLedger` inside the same snapshot-backed transaction path as mission, clock, relationship, and Command Log changes.
- Mission panel pressure summaries use player-facing text only.
- Open Orders candidate selection is deterministic and currently selects from package-authored side templates; no provider generation is required for Stage 28-30.
- Hidden Lantern, forged-signal, Compact recovery, missing-module, and no-pathogen truth must remain out of player-facing pressure summaries, Command Briefs, Domain Reports, narrator packets, and Command Log text until revealed by campaign state.

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

For the Hesperus fixture, the primary pressure is passenger medical risk and the secondary pressure is inspection-fraud accountability. The other Prelude phases currently resolve through active decision points, freeform phase rules, and phase advancement rather than pressure-front selection.

## As-Coded Opening Prelude Behavior

When the player boards during `shuttle-rendezvous`, the loop can produce `establish-arrival-tone`.

The strongest supported arrival path:

- Respects the working transfer instead of turning the arrival into ceremony.
- Asks Priya and Bronn for live status and acting-XO handoff.
- Reports to Whitaker after docking/transfer work is not disrupted.
- Commits `prelude.crew-integration = deliberately-blended`.
- Reduces `crew-integration-strain`.
- Advances to `ready-room-handover`.

An immediate inspection posture still works, but commits a more guarded `prelude.crew-integration` result.

When the player acts during `ready-room-handover`, the loop can produce `complete-ready-room-handover`.

The strongest supported handover path:

- States a usable personal command value or defines how executive authority will be exercised.
- Treats Whitaker as final authority while owning XO recommendations and routine execution.
- Acknowledges Bronn's acting-XO work as continuity rather than something erased by the transfer.
- Commits `prelude.whitaker = delegation-confidence-improved`.
- Commits `prelude.bronn = acting-service-respected`.
- May further reduce `crew-integration-strain`.
- Advances to `senior-readiness-conference`.

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

## As-Coded Middle And Closing Prelude Behavior

The senior readiness conference now produces `set-readiness-priorities`.

The strongest supported readiness path:

- Names department ownership.
- Accepts at least one risk or deferral explicitly.
- Protects engineering/medical limits as operational facts.
- Commits senior staff flags and relationship memories for affected officers.
- Reveals `ship.combined-load-risk`.
- Advances to `fallback-command-drill`.

The fallback-command drill now produces `set-fallback-command-procedure`.

Supported successful paths include:

- Standardize one shipwide procedure and assign remediation.
- Create a temporary/interim protocol while logging deferred remediation as accepted technical debt.

The state delta can update `prelude.bronn`, `prelude.priya`, `prelude.imani`, `prelude.ship-state`, `prelude.crew-integration`, `technical-debt-pressure`, and relationship memories. Successful drill resolution advances to `command-rhythm-scenes`.

The command-rhythm interval now produces `establish-command-rhythm` without requiring an active decision point.

It records:

- Meaningful senior officer contacts from player prose.
- A hidden command-culture tendency such as `bounded-dissent`.
- Relationship memory for the contacted officers.
- Phase advancement to `hesperus-diversion` when enough contact and command-culture signal exists.

Hesperus aftermath now produces `assign-hesperus-aftermath`.

It can add follow-up records for engineering, medical, legal/admin, flight planning, and science. The optional `hesperus.escape-pod-subspace-data` fact is revealed only when the player assigns or preserves science follow-up. Successful aftermath handling advances to `combined-load-test`.

The combined-load test now produces `resolve-combined-load-test`.

Supported paths include:

- Controlled staged test with abort criteria.
- Pause/report limitation honestly.
- Continue under reduced redundancy or accept a workaround with explicit cost.
- Conceal or minimize readiness risk, which produces compromised state.

The state delta commits `prelude.kieran`, `prelude.imani`, `prelude.ship-state`, `prelude.arrival-delay`, schedule margin, technical-debt pressure, and relationship memory for flight, operations, and engineering. Successful resolution advances to `final-command-review`.

Final command review now produces `complete-final-command-review`.

The strongest supported path:

- Reports readiness honestly, including any carried limitation or delay.
- Names captain-support and disagreement boundaries.
- Closes Bronn's acting-XO service when mentioned.
- Uses crew-facing arrival communication if the player addresses the crew or sends department orders.
- Reveals `chapter-1.relief-convoy-distress-packet`.
- Sets `mission.endState`, `mission.arrivalPosture`, `mission.completedMissionId`, `mission.nextMissionId`, and `mission.transitionStatus`.
- Adds `prelude-a-ship-underway` to completed chapters, makes `chapter-1-the-empty-convoy` available, removes it from locked chapters, and sets the chapter cursor to Chapter 1.
- Advances to `arrival-at-reach`.

## As-Coded Simulation Mode Policy

Simulation mode is exactly `Command` or `Exploration`.

`Command` mode:

- Preserves full deterministic consequence severity when risk is established.
- Does not invent unsupported harm or cheat against the player.
- Allows severe outcomes only from visible causal setup.

`Exploration` mode:

- Blocks player-character and senior-staff death.
- Can cap severe result bands to `Partial Failure`.
- Preserves hidden-state truth and causal flags; it does not force success.
- Adds narrator constraints instructing provider prose to use injury, delay, temporary incapacitation, damaged trust, or lost position instead of death.

The paired combined-load hazard fixture proves the same concealed high-risk action remains a compromised hidden ship-state in both modes. Command keeps the full `Failure`; Exploration caps it to `Partial Failure` while still recording `prelude.ship-state = technically-passed-through-concealed-risk`.

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

- `commitDirectorTurn`: applies known facts, outcome flags, phase advancement, Prelude completion fields, main-campaign chapter deltas, clocks, command-style records, relationship descriptions, command-competence records, Command Log entries, and turn-ledger entries from a Director turn packet.
- `recordNarrationSwipe`: records narrator packet revisions for an existing outcome without changing committed mechanics.
- `editCommittedOutcome`: restores the pre-outcome snapshot and commits a replacement turn.
- `deleteCommittedOutcome`: restores the pre-outcome snapshot.
- `restoreCampaignSnapshot`: deep-clones an authoritative snapshot.

The runtime app now exposes this through:

- `Rewrite Narration`: retries narration from the same committed mechanics.
- `Rerun Outcome`: previews a replacement from the original pre-outcome snapshot while preserving the current state until the player accepts the replacement.
- `Delete Outcome`: restores the pre-outcome snapshot for the selected outcome.
- `Save Game As`: creates a branch from the active campaign state and records parent/divergence metadata.

Automatic SillyTavern message-edit/delete event interception is still future work; the current implementation provides explicit runtime operations.

## Narrator Packet Rules

The as-coded narrator packet:

- Includes only player-safe fact ids.
- Selects narrator-safe crew/context cards through `src/retrieval/packet-builder.mjs`.
- Exposes no raw hidden values.
- Includes no Director-only data.
- Constrains narration to the active phase, committed consequences, ordinary fraud/maintenance/technical causality, and Chapter 1 transition pressure without revealing hidden campaign answers.

Narrator card selection now comes from retrieval rather than a local phase switch in `director.mjs`. Retrieval preserves authored phase/intent order for narrator cards, applies narrator safety gates, and can explicitly mark a card as phase-implicated when an offscreen officer's voice guidance is relevant to the outcome.

The current Hesperus narrator-safe cards are:

- `crew.priya.voice.dependencies-access`
- `crew.bronn.voice.failure-conditions`
- `crew.miriam.voice.human-cost`
- `crew.imani.voice.technical-debt`

The current final-review narrator-safe cards are:

- `crew.whitaker.voice.command-pressure`
- `crew.priya.voice.dependencies-access`

## Command Log Packet Rules

The as-coded Command Log packet is player-facing and character-facing. It contains visible continuity only:

- Working transfer / opening arrival tone.
- Ready-room handoff and command-value signal.
- Passenger transfer.
- Inspection record preservation.
- Formal inquiry obligation.
- Minor delay and impulse-safe stabilization.
- Resolve progression.
- Hesperus passenger protection.
- Hesperus follow-up obligations.
- Combined-load readiness limitation or test status.
- Final review summary and Relief Convoy Twelve transition.

It does not include hidden state refs, raw clock values, raw relationship values, or Director-only facts.

## Current Limits

This first slice is intentionally limited:

- Intent parsing is deterministic keyword extraction, not provider-assisted parsing.
- The full Prelude has mission-specific deterministic resolution, but Chapter 1 beyond the first transition fact is not implemented yet.
- Pressure cooldowns are not persisted.
- Actor posture and fronts are not updated yet.
- Procedural Warning confirmation exists as packet data, but the explicit confirm/revise runtime flow is still future work.
- The Command Log packet is assembled deterministically; it is not yet summarized by a provider call.
- Retrieval journals are built by the retrieval layer, but the turn ledger does not yet persist full journal records for every committed outcome.
- Rolling autosaves and explicit Save As branch metadata exist for stable narrated turns. Broader branch comparison/management UI, actor posture, fronts, side-mission inheritance, and Chapter 1 play need implementation.

## Verification

Focused commands:

```powershell
node tools\scripts\validate-mission-graph.mjs
node tools\scripts\validate-mission-director-contract.mjs
node tools\scripts\test-director-retrieval-orchestration.mjs
node tools\scripts\test-command-competence-planner.mjs
node tools\scripts\test-command-competence-no-gotcha.mjs
node tools\scripts\test-runtime-stage22-command-brief.mjs
node tools\scripts\test-mission-director-loop.mjs
node tools\scripts\test-transaction-state.mjs
node tools\scripts\test-runtime-director-turn.mjs
node tools\scripts\test-runtime-stage9-turn-loop.mjs
node tools\scripts\test-runtime-stage10-prelude-autosave.mjs
node tools\scripts\test-runtime-stage11-readiness.mjs
node tools\scripts\test-runtime-stage12-fallback-command.mjs
node tools\scripts\test-runtime-stage13-command-rhythm.mjs
node tools\scripts\test-runtime-stage14-hesperus-aftermath.mjs
node tools\scripts\test-runtime-stage15-combined-load.mjs
node tools\scripts\test-runtime-stage16-prelude-completion.mjs
node tools\scripts\test-simulation-mode-policy.mjs
node tools\scripts\test-runtime-stage18-rerun-branch-recovery.mjs
```

The loop fixtures include:

```text
tests/fixtures/mission/prelude-senior-readiness-director-loop.fixture.json
tests/fixtures/mission/prelude-fallback-command-director-loop.fixture.json
tests/fixtures/mission/prelude-command-rhythm-director-loop.fixture.json
tests/fixtures/mission/prelude-hesperus-fraud-director-loop.fixture.json
tests/fixtures/mission/prelude-hesperus-fraud-repeat-director-loop.fixture.json
tests/fixtures/mission/prelude-hesperus-aftermath-director-loop.fixture.json
tests/fixtures/mission/prelude-combined-load-director-loop.fixture.json
tests/fixtures/mission/prelude-final-review-director-loop.fixture.json
tests/fixtures/mission/prelude-leave-mission-area-approved-director-loop.fixture.json
tests/fixtures/mission/prelude-leave-mission-area-counteroffer-director-loop.fixture.json
tests/fixtures/mission/prelude-leave-mission-area-director-loop.fixture.json
tests/fixtures/mission/prelude-unsupported-command-director-loop.fixture.json
```

The expected generated turns are compared against:

```text
tests/fixtures/mission/prelude-senior-readiness-turn.turn.fixture.json
tests/fixtures/mission/prelude-fallback-command-turn.turn.fixture.json
tests/fixtures/mission/prelude-command-rhythm-turn.turn.fixture.json
tests/fixtures/mission/prelude-hesperus-fraud-turn.turn.fixture.json
tests/fixtures/mission/prelude-hesperus-fraud-repeat-turn.turn.fixture.json
tests/fixtures/mission/prelude-hesperus-aftermath-turn.turn.fixture.json
tests/fixtures/mission/prelude-combined-load-turn.turn.fixture.json
tests/fixtures/mission/prelude-final-review-turn.turn.fixture.json
tests/fixtures/mission/prelude-leave-mission-area-approved-turn.turn.fixture.json
tests/fixtures/mission/prelude-leave-mission-area-counteroffer-turn.turn.fixture.json
tests/fixtures/mission/prelude-leave-mission-area-turn.turn.fixture.json
tests/fixtures/mission/prelude-unsupported-command-turn.turn.fixture.json
```
