# Post-Stage 20 Implementation Plan

## Purpose

This plan defines the next major implementation track after Stage 20.

Focus:

- Build the Command Competence Layer.
- Use it to make Chapter 1's first playable mission frame fair and teachable without handholding.
- Add the first side-mission pressure framework so main campaign, crew, ship, and regional obligations can generate future Open Orders work without becoming disconnected errands.

The goal is robustness. The implementation must not become a brittle Chapter 1 helper or a list of hardcoded "correct options." It should establish reusable source boundaries, authored data contracts, deterministic tests, and transaction records before adding provider-assisted behavior.

## Current Baseline

Completed baseline:

- The Prelude can be played from arrival through final command review.
- Chapter 1 activates through `chapter-1-the-empty-convoy` after final command review.
- The Relief Convoy Twelve distress packet can be revealed as transition pressure.
- Command Bearing, Exploration/Command consequence policy, save/branch recovery, Director retrieval, package import diagnostics, and alpha gate are working.
- Stage 21 now provides the Command Competence contract, deterministic planner, Chapter 1 opening fixture, and no-gotcha verifier.
- Stages 22-30 now provide Command Brief runtime integration, Domain Reports, Request Counsel, warnings, the Chapter 1 opening graph, first-response resolution, pressure ledger state, pressure-to-Open-Orders candidate selection, pressure-aware Chapter 1 handoff, and alpha-gate hardening.

Important current gaps:

- Chapter 1 beyond the first response and pressure handoff is not implemented yet.
- Actor posture, full front behavior, direct side-mission play, and the next Chapter 1 boarding threshold remain future work.
- The Command Log is still deterministic packet assembly, not yet an LLM-assisted summary from committed state.
- Automatic SillyTavern user-message edit/delete/branch event interception is still future work; explicit runtime recovery controls exist.
- Package import has a normalization and diagnostics path, but not a full player-facing import UI.

## Design Inputs

Primary design:

- [Command Competence Layer](../design/COMMAND_COMPETENCE_LAYER.md)
- [Ashes Of Peace Campaign](../campaigns/ASHES_OF_PEACE_CAMPAIGN.md)
- [Mission Director Model](../design/MISSION_DIRECTOR_MODEL.md)
- [Director Retrieval And Context Orchestration](../architecture/DIRECTOR_RETRIEVAL_AND_CONTEXT_ORCHESTRATION.md)
- [Turn Transactions](../architecture/TURN_TRANSACTIONS.md)
- [Persistence And Continuity](../architecture/PERSISTENCE_AND_CONTINUITY.md)

Chapter 1 source baseline:

- Relief Convoy Twelve: three civilian transports and two escort shuttles, powered and maintaining formation, no response to hails.
- Known opening facts: life support functions, escape craft missing, one ship has minor plasma leakage, computers reject command access, no visible bodies, quarantine beacon carries a technically valid but administratively impossible Starfleet emergency authority code.
- Director-only truth: false quarantine order, authentic obsolete Starfleet fragments, Compact recovery team, missing transponder module, no pathogen.
- Active fronts: rescue, medical, security, diplomatic, evidence.
- First campaign question: how does Starfleet act when its own authority may be counterfeit?

## Product Decision

The first Chapter 1 frame should not ask the player to know Starfleet procedure.

The system should:

- Automatically perform routine distress-response procedure.
- Present a concise Command Brief.
- Surface one or two relevant Domain Reports.
- Let the player ask for counsel when desired.
- Warn only for serious or critical procedural departures.
- Reserve the actual command question for the player.

The opening should not present a dialogue wheel or "approved option." It should make the player's trained role legible while preserving freeform command.

## Robustness Strategy

To avoid brittleness:

- Put competence policy in package/mission data, not in scattered `if playerInput includes X` branches.
- Treat competence as a packet-producing layer between intent parsing and adjudication.
- Use deterministic eligibility rules for routine action, warnings, authority notes, and counsel scope.
- Keep provider-assisted summarization optional and validated.
- Store assumed actions, warnings, confirmations, standing orders, and anchored risks transactionally.
- Add fixtures for omission, warning, counsel, retroactive competence, and hidden-threat fairness.
- Keep Chapter 1 authored as a mission graph with competence metadata, not as a special runtime path.
- Make side-pressure state campaign-owned and package-referenced.
- Use pressure scoring/cooldowns from state, not random mission selection.

## Proposed Source Boundaries

Add:

```text
src/competence/
  knowledge-classes.mjs
  competence-policy-index.mjs
  procedural-autocomplete.mjs
  command-brief-builder.mjs
  domain-report-selector.mjs
  request-counsel-parser.mjs
  procedure-warning-evaluator.mjs
  authority-note-evaluator.mjs
  standing-orders.mjs
  retroactive-competence.mjs
  competence-journal.mjs
  README.md

src/pressures/
  pressure-ledger.mjs
  pressure-seeding.mjs
  pressure-scoring.mjs
  pressure-cooldowns.mjs
  side-mission-candidates.mjs
  README.md
```

Extend:

```text
src/mission/director.mjs
src/runtime/director-turn-runtime.mjs
src/campaign/transaction-state.mjs
src/ui/mission-panel.js
schemas/mission/mission-graph.schema.json
schemas/packages/side-mission-rules.schema.json
```

Do not put competence logic in UI modules. UI renders packets and sends player confirmation/revision actions only.

## Data Contracts

### Mission Graph Competence Metadata

Each consequential decision node should support:

```json
{
  "competence": {
    "routineProcedures": [
      {
        "id": "routine.distress.log-and-authenticate",
        "summary": "Log the packet, preserve raw signal, begin authentication, and task long-range sensors.",
        "eligibleWhen": ["distress-signal-received"],
        "visibility": "playerVisibleSummary"
      }
    ],
    "professionalKnowledge": [
      {
        "id": "knowledge.quarantine-order-requires-verification",
        "summary": "A valid-looking quarantine order still requires reconciliation with current mission authority and local routing.",
        "knowledgeClass": "routineProfessional"
      }
    ],
    "domainReports": [
      {
        "id": "report.priya.quarantine-code-impossible",
        "officerId": "priya-nayar",
        "domain": "operations",
        "summary": "The certificate chain is technically valid but administratively impossible.",
        "confidence": "strongAssessment",
        "triggerLanes": ["distress", "quarantine", "false-order"]
      }
    ],
    "commandQuestions": [
      {
        "id": "question.initial-convoy-posture",
        "summary": "How quickly to close, under what quarantine/security posture, and how to balance rescue against evidence preservation."
      }
    ],
    "warningRules": [
      {
        "id": "warning.waive-quarantine-isolation",
        "severity": "serious",
        "matches": ["waive-isolation", "beam-to-public-area"],
        "standardConcern": "Unknown medical risk should be isolated until assessed.",
        "knownConsequence": "Bypassing isolation could expose the ship if the quarantine warning is real.",
        "exceptionBasis": "Immediate life-saving emergency may justify faster transport with recorded risk."
      }
    ],
    "authorityNotes": [
      {
        "id": "authority.compact-jurisdiction-dispute",
        "summary": "The XO can organize response and recommend posture; open detention, seizure, or jurisdictional confrontation may require Whitaker unless an emergency basis is stated."
      }
    ],
    "anchoredRiskRules": [
      {
        "id": "risk.close-before-authentication",
        "summary": "The Breckinridge closes before the false order and convoy status are authenticated.",
        "severity": "serious"
      }
    ]
  }
}
```

The exact schema can evolve, but the implementation should keep these concerns separate. This prevents one all-purpose "brief text" blob from becoming the only source of truth.

### Competence Packet

The Director turn should be able to carry:

```text
competencePacket
  sourceTurnId
  activeMissionId
  activePhaseId
  routineActions[]
  professionalKnowledge[]
  domainReports[]
  commandQuestion
  requestCounsel
  authorityNotes[]
  proceduralWarnings[]
  acceptedRisks[]
  standingOrderMatches[]
  retroactiveCompetence[]
  noGotchaChecks[]
```

The first implementation may keep this packet in runtime preview results and state deltas before adding it to every fixture contract, but the long-term direction should be schema-backed.

### Campaign State

Add campaign-owned state:

```text
commandCompetence
  standingOrders[]
  assumedActionsLedger[]
  warningLedger[]
  acceptedRiskLedger[]
  authorityNotesLedger[]
  counselRequestLedger[]
  retroactiveCompetenceLedger[]
```

Records must be tied to turn/outcome ids and restorable through rerun/delete/branch recovery.

### Side Pressure State

Add campaign-owned state:

```text
pressureLedger
  activePressures[]
  resolvedPressures[]
  suppressedPressures[]
  cooldowns[]
  sideMissionCandidates[]
```

Pressure record:

```text
id
type: crew | ship | regional | campaign | relationship | technical | obligation
source: missionOutcome | relationshipMemory | commandLog | packageSeed | front | clock
summary
visibility
urgencyBand
escalationBand
cooldownUntil
linkedCrewIds[]
linkedShipSystems[]
linkedFactIds[]
linkedPackageTemplateIds[]
eligibleSideMissionTemplateIds[]
lastTouchedOutcomeId
```

Use named bands rather than raw visible numbers. Hidden scoring may exist internally, but player-facing summaries should stay descriptive.

## Implementation Stages

## Stage 21: Command Competence Contract And Fixture Harness

Goal: establish the reusable data and test boundary before Chapter 1 logic depends on it.

Work:

- Add `src/competence` scaffold and pure helper modules.
- Define knowledge classes and confidence labels.
- Define the first `competencePacket` shape in code and docs.
- Add a small fixture file for Chapter 1 opening competence metadata.
- Add tests for routine action eligibility and non-eligibility.
- Add tests proving routine action does not select command judgment.
- Add tests proving hidden facts stay hidden.

Exit condition:

The repo has a deterministic competence-planning harness that can read a scene snapshot plus authored policy and produce routine actions, brief inputs, warnings, and reports without touching campaign state.

Verification:

- `test-command-competence-planner.mjs`
- `test-command-competence-no-gotcha.mjs`
- Existing alpha gate still passes.

Status:

- Implemented in `src/competence`.
- Covered by `tests/fixtures/competence/chapter-1-opening.competence.fixture.json`.
- Included in `run-alpha-gate.mjs`.

## Stage 22: Procedural Autocomplete And Command Brief MVP

Goal: make the player character professionally competent without adding an answer menu.

Work:

- Implement Procedural Autocomplete eligibility.
- Build Command Brief packets from routine actions, known facts, uncertainty, operational pressure, and the command question.
- Add player-facing Mission panel rendering for the brief.
- Keep the brief compact in the default mode.
- Add no-gotcha checks to outcome resolution.
- Record assumed routine actions in state delta and turn ledger.

Chapter 1 first use:

- Distress packet logged.
- Raw signal preserved.
- Authentication begins.
- Long-range scan begins.
- Medical and engineering readiness are alerted.
- Flight plots approach options.
- No boarding, pursuit, weapons, quarantine waiver, or jurisdictional escalation is assumed.

Exit condition:

A terse player command such as "Take us in and prepare to help" produces competent routine distress-response actions and a clear command question without resolving the player's posture for them.

Verification:

- Fixture: routine omission.
- Fixture: terse order.
- Fixture: exhaustive order does not duplicate routine actions.
- Runtime smoke: Mission panel shows Command Brief and no hidden raw values.

Status:

- Stage 22c runtime integration implemented.
- `competencePacket` is optional on Director turns and sourced from mission-graph competence policy.
- Commits write assumed routine actions, warnings, authority notes, and counsel requests into `commandCompetence` ledgers.
- Covered by `test-runtime-stage22-command-brief.mjs`.

## Stage 23: Domain Reports And Request Counsel

Goal: let officers provide expertise without overwhelming the player or dictating the answer.

Work:

- Add Domain Report selection from retrieval, active decision metadata, player input, and present/implicated officers.
- Add report economy rules: one or two reports by default, more when requested.
- Implement Request Counsel natural-language recognition.
- Add optional runtime action for Request Counsel if UI support is useful.
- Ensure asking for counsel is not treated as weakness.
- Record counsel requests only when they matter.

Chapter 1 first reports:

- Priya can report certificate-chain inconsistency.
- Bronn can report trap/security posture concern.
- Rowan can report biological-signature uncertainty.
- Miriam can report quarantine/rescue medical posture.
- Imani can report computer-evidence risk on shutdown.

Default opening should show at most two reports unless the player asks for broader counsel.

Exit condition:

The player can ask "Recommendations?", "What am I overlooking?", or "Doctor, risk?" and receive compact, character-specific counsel without receiving a labeled correct answer.

Verification:

- Fixture: counsel request broad.
- Fixture: domain-specific counsel request.
- Fixture: no officer spam when no counsel is requested.
- Fixture: requested advice ignored later creates memory only when relevant.

Status:

- Implemented for the Chapter 1 opening competence policy.
- Domain Report selection now weights request scope, active decision metadata, present/implicated officers, retrieval-card hints, and player input.
- Default opening shows no more than two reports; broad counsel can show a compact larger set; domain-specific requests select the matching officer lane.
- Counsel requests are recorded only when meaningful reports were produced.
- Covered by `test-runtime-stage23-25-chapter1-opening.mjs`.

## Stage 24: Procedural Warnings, Authority Notes, And Confirmation

Goal: make serious procedural departures fair before they become consequences.

Work:

- Implement warning severity and threshold logic.
- Implement authority-note evaluation.
- Add runtime flow for warning preview and player confirmation/revision.
- Ensure warnings do not commit state until confirmed or bypassed through revised input.
- Store accepted warnings and anchored risks in transaction state.
- Suppress repeated warnings when circumstances have not materially changed.
- Roll back warnings/risks on outcome rerun, delete, and branch.

Chapter 1 warning examples:

- Waive quarantine isolation.
- Beam unknown survivors directly to unrestricted areas.
- Open fire on civilian or Compact vessel without hostile act.
- Board multiple silent ships without reconnaissance or quarantine basis.
- Destroy or overwrite convoy computer evidence to speed rescue.
- Detain Compact personnel without Whitaker authorization or emergency basis.

Exit condition:

The player may knowingly depart from procedure, but severe consequences cannot be grounded in an uncommunicated routine rule.

Verification:

- Fixture: serious quarantine warning.
- Fixture: critical weapons warning.
- Fixture: authority note for Compact detention.
- Fixture: revised order cancels pending warning.
- Transaction test: accepted risk survives narration swipe and rolls back on outcome replacement.

Status:

- Implemented for the Chapter 1 opening warning policy and runtime preview/commit flow.
- Serious and critical warnings require explicit confirmation before commit.
- Pending warning previews can be confirmed, discarded for revision, or turned into a counsel request from the Mission panel.
- Confirmed warnings commit accepted-risk records; revised input bypasses the pending warning; previously accepted warnings are suppressed for the same mission phase.
- Covered by `test-runtime-stage23-25-chapter1-opening.mjs`.

## Stage 25: Chapter 1 Mission Graph Opening Frame

Goal: implement the first playable Chapter 1 frame as a real mission graph, not a one-off Director branch.

Work:

- Add `chapter-1-the-empty-convoy.mission-graph.json`.
- Add phases for initial reception, convoy approach, first posture decision, and first committed response.
- Add facts, hidden truths, fronts, clocks, pressure ids, decision points, and competence metadata.
- Add retrieval hooks for relevant crew cards.
- Add transition from Prelude completion to Chapter 1 graph where active mission changes after final review handoff.
- Keep director-only truth out of narrator and Command Brief.

Opening phase:

- Whitaker turns to the player after Priya receives the packet.
- The player is asked for a command posture, not a protocol quiz.
- Command Brief explains routine response and real decision.

Exit condition:

A completed Prelude can transition into a playable Chapter 1 opening frame with active mission graph id, phase, decision points, known facts, and competence packet support.

Verification:

- `validate-mission-graph.mjs` supports Chapter 1 graph.
- Mission graph fixture for Chapter 1 opening.
- Runtime smoke from Stage 16 completion into Chapter 1 opening.

Status:

- Implemented as `packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json`.
- The bundled package now registers both Prelude and Chapter 1 mission graphs, and the runtime loader supports multiple graph assets per package.
- Completing the Prelude final review activates Chapter 1 directly with graph id, graph path, `initial-reception`, known distress fact, and `decision.initial-convoy-posture`.
- The first opening posture can preview and commit a balanced rescue/verification response with Command Brief support.
- Covered by the Chapter 1 graph validation path and `test-runtime-stage23-25-chapter1-opening.mjs`.

## Stage 26: Chapter 1 First Response Resolution

Goal: resolve the first meaningful Chapter 1 player decision with competence, uncertainty, and fair consequence.

Work:

- Add intent signals for rescue-first, remote-verification-first, quarantine posture, security posture, evidence preservation, approach speed, counsel request, and authority escalation.
- Resolve initial posture decision using fronts and competence state.
- Commit first Chapter 1 outcome flags.
- Add visible Command Log summary.
- Add hidden pressure updates for rescue, medical, security, diplomatic, and evidence fronts.
- Apply Prelude consequence inputs: arrival delay, technical debt, ship limitations, relationship memories, and final readiness posture.

Supported first-response paths:

- Balanced rescue-and-evidence posture.
- Rescue-first close approach with accepted risk.
- Security-first remote reconnaissance with possible rescue delay.
- Evidence-first cautious approach with humanitarian cost.
- Diplomacy/coordination first, involving Asterion or Compact channels.
- Reckless quarantine bypass after warning.

Exit condition:

The first Chapter 1 turn can succeed, partially succeed, or fail in a way grounded in informed player judgment rather than missing procedure words.

Verification:

- Director fixtures for at least three approaches.
- Warning fixture for quarantine bypass.
- No-gotcha fixture for omitted signal logging.
- Exploration/Command mode pair for a hazardous response.

Implemented:

- Stage 26 first-response resolution now supports balanced, rescue-first, security-first remote reconnaissance, evidence-first cautious, diplomacy/coordination-first, reckless quarantine bypass, detention, evidence destruction, and weapons-escalation paths.
- Chapter 1 posture flags now include security-first, evidence-first, and diplomacy-first values.
- `test-runtime-stage26-28-first-response-pressure.mjs` covers balanced, evidence-first, diplomacy-first, quarantine warning, omitted logging no-gotcha, and Exploration/Command hazardous response behavior.

## Stage 27: Side Pressure Ledger MVP

Goal: create campaign-owned pressure state that can later feed Open Orders and side missions.

Work:

- Add `src/pressures` modules.
- Define pressure record shape.
- Seed pressures from committed mission outcomes, relationship memory, ship state, and package rules.
- Add pressure cooldowns and escalation bands.
- Add state-delta application and transaction rollback support.
- Add Command Log and Mission panel summaries that stay player-facing.

Initial pressure types:

- `crew`: unresolved officer development or relationship pressure.
- `ship`: technical debt, system limitation, repair debt.
- `regional`: local trust, Compact suspicion, humanitarian obligations.
- `obligation`: promises, follow-up, evidence custody, medical care.

Prelude-to-Chapter-1 examples:

- Imani technical-debt pressure from combined-load limitation.
- Bronn fallback-command concern.
- Priya coordination strain.
- Hesperus follow-up obligation.
- Regional trust pressure from first convoy posture.

Exit condition:

At least three pressure records can be seeded from actual committed state and survive save/load, branch, rerun, and delete.

Verification:

- `test-pressure-ledger.mjs`
- Runtime test: pressure seeded from Prelude and Chapter 1 first response.
- Transaction test: pressure rollback on outcome replacement.

Implemented:

- `src/pressures` defines pressure record normalization, seeding, cooldown/suppression helpers, scoring, escalation, and side-mission candidate selection.
- `pressureLedger` is a campaign-owned hidden state domain initialized by the Ashes of Peace projection.
- Prelude final review seeds Imani technical debt, Bronn fallback-command concern, Priya coordination strain, and Hesperus follow-up pressure from committed flags.
- Chapter 1 first response seeds regional first impression, rescue delay, quarantine exception review, and evidence custody pressure.
- Pressure deltas commit through `commitDirectorTurn`, appear in Command Log player-facing summaries, render in the Mission panel, and roll back through replacement/delete snapshots.

## Stage 28: Pressure-To-Side-Mission Candidate Selection

Goal: turn active pressure into side-mission candidates without generating disconnected errands.

Work:

- Add deterministic pressure scoring.
- Add package-authored side-assignment template matching.
- Add cooldown and urgency rules.
- Add "not now" suppression without deleting the pressure.
- Add eligibility rules for Open Orders intervals.
- Keep generation provider optional; the first version selects from authored package templates.

Rules:

- Main campaign beats can seed or escalate pressures.
- Side missions usually unlock at authored intervals.
- Urgent pressures may intrude only when causally justified.
- Only one or two side-mission candidates should be presented at once.
- Ignored pressure should escalate into realistic consequences, not arbitrary punishment.

First side-mission prototype:

- Use an authored Open Orders candidate that can be fed by ship or crew pressure, such as Imani's repair debt or Priya's coordination network.
- Do not build the full generator yet.

Exit condition:

The system can explain why a side mission candidate is available from current state and why other pressures are waiting, cooling down, or suppressed.

Verification:

- Fixture: pressure qualifies for side assignment.
- Fixture: pressure remains active but ineligible before interval.
- Fixture: suppressed pressure does not disappear.
- Fixture: ignored pressure escalates by band after a campaign beat.

Implemented:

- Open Orders I side templates now include pressure-match metadata for The Long Repair, Borrowed Wings, and Quiet Channels.
- `selectSideMissionCandidates` returns up to two authored candidates and explains candidates, waiting pressure, and suppressed pressure.
- `test-pressure-ledger.mjs` covers eligible/ineligible interval behavior, suppression without deletion, and ignored-pressure escalation.

## Stage 29: Chapter 1 Consequence And Pressure Handoff

Goal: make Chapter 1's opening response feed the pressure framework and later Open Orders.

Work:

- Add Chapter 1 outcome flags for initial posture, convoy evidence, rescue urgency, quarantine confidence, Compact posture, and missing module lead.
- Add pressure seeding from first-response outcome.
- Connect pressure records to future Chapter 1 phases and Open Orders I.
- Make Command Briefs and Domain Reports reflect pressure state.
- Ensure hidden Lantern truth is not exposed through pressure summaries.

Examples:

- Rescue-first approach may reduce rescue pressure but increase evidence or security pressure.
- Security-first approach may preserve ship safety but increase humanitarian or regional trust pressure.
- Diplomacy-first approach may reduce Compact hostility but risk Dena Ko or evidence timing.
- Concealed readiness limitations from Prelude may create ship pressure during the response.

Exit condition:

The first Chapter 1 response creates durable campaign pressure that can affect the next mission frame and future side-mission candidates.

Verification:

- Runtime test: first response creates expected pressure records.
- Retrieval test: pressure state influences later Domain Report selection.
- Contract test: player-facing summaries do not leak director-only truth.

Implemented:

- Chapter 1 first-response commits player-facing flags for initial posture, convoy evidence, rescue urgency, quarantine confidence, and Compact posture, plus hidden missing-module lead state.
- First-response outcomes seed regional, rescue-delay, quarantine-exception, and evidence-custody pressure records.
- Pressure records now carry safe links to later Chapter 1 phases, decision points, Open Orders I, and side templates.
- Command Brief operational pressure and Domain Report selection can read player-safe active pressure state.
- Covered by `test-runtime-stage29-30-pressure-handoff.mjs` and the Stage 26-28 first-response pressure regression test.

## Stage 30: Robustness Gate, Docs, And Alpha Readiness

Goal: lock the new layer into the repo's validation culture before expanding Chapter 1.

Work:

- Add competence and pressure tests to `run-alpha-gate.mjs`.
- Update Mission Director as-coded docs.
- Update Persistence and Continuity docs.
- Update Testing Strategy.
- Add package authoring notes for competence metadata and pressure seeds.
- Audit for hidden leaks, hardcoded Chapter 1 shortcuts, and UI-owned logic.
- Add fixture coverage for all Command Competence MVP test cases.

Exit condition:

The alpha gate proves Command Competence, first Chapter 1 frame, and side-pressure MVP behavior through deterministic fixtures and runtime smoke tests.

Verification:

- `run-alpha-gate.mjs` includes the new tests and passes.
- `rg -n "saga" src tools packages schemas` still finds no runtime identifiers.
- Chapter 1 opening can be reached from a completed Prelude save.
- Side pressure state is saved, loaded, rerun, and rolled back correctly.

Implemented:

- `run-alpha-gate.mjs` includes Command Competence, no-gotcha, pressure ledger, Stage 26-28 first-response pressure, Stage 29-30 pressure handoff, and runtime hygiene checks.
- Mission Director, Persistence and Continuity, Testing Strategy, and package schema docs now describe pressure-aware competence behavior and pressure handoff persistence.
- Package authoring notes cover competence metadata, pressure seeds, pressure routing links, and hidden-truth safety.
- `test-stage30-runtime-hygiene.mjs` scans `src`, `tools`, `packages`, and `schemas` for legacy runtime identifiers.

## First Chapter 1 Command Brief Draft

This is not final prose. It is the target shape for the first implemented Command Brief:

```text
Routine response:
The packet is logged, preserved, and under authentication. Long-range scans and approach plots are underway. Sickbay and Engineering are preparing for possible rescue.

Known facts:
Relief Convoy Twelve is powered and in formation, but no one answers hails. Several escape craft are missing. One transport has a minor plasma leak.

Uncertainty:
The quarantine beacon carries a technically valid Starfleet emergency authority code that does not match current routing. No biological signature is confirmed at range.

Operational pressure:
Delay may cost anyone still aboard the leaking transport. Closing quickly may expose the ship before the order and convoy status are verified.

Command question:
What posture should Whitaker authorize for the initial response?
```

Default reports should be selected by scene state. For example:

- Priya if the certificate-chain problem is central.
- Bronn if approach/boarding/security posture is central.
- Miriam if quarantine/rescue risk is central.
- Imani if preserving computer evidence conflicts with technical stabilization.
- Rowan if biological, signal, or timing evidence is central.

## First Side-Pressure Examples

Pressure records should start as plain-language state:

```text
Ship pressure:
Imani is carrying repair debt from the combined-load limitation. If ignored, later high-load operations may force a slower or riskier response.

Crew pressure:
Bronn is watching whether the fallback-command procedure becomes real practice or a paper exercise.

Regional pressure:
The first response to Relief Convoy Twelve will shape whether local authorities see the Breckinridge as a rescuer, investigator, occupier, or liability.
```

The player should see only summaries appropriate to current knowledge. Hidden scoring, Lantern links, and future consequence thresholds stay director-facing.

## Implementation Order Recommendation

Build in this order:

1. Stage 21 competence contract and fixtures.
2. Stage 22 Command Brief and routine distress autocomplete.
3. Stage 25 Chapter 1 opening graph shell.
4. Stage 23 Domain Reports and Request Counsel.
5. Stage 24 warnings and confirmation.
6. Stage 26 first response resolution.
7. Stage 27 pressure ledger.
8. Stage 28 pressure-to-side-candidate selection.
9. Stage 29 Chapter 1 pressure handoff.
10. Stage 30 gate/docs hardening.

This order gives the player-facing Chapter 1 frame early while preventing the implementation from collapsing into a brittle one-off.
