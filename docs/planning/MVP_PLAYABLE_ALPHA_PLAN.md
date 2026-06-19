# MVP Playable Alpha Plan

## Purpose

This plan defines the development path from the current pre-alpha runtime toward a meaningful MVP playable alpha.

The MVP alpha should not try to ship the full Ashes of Peace campaign. It should prove the product promise with a complete, coherent, replayable first arc:

- a full Prelude,
- a full Chapter 1,
- enough side content to prove that consequences generate useful optional work,
- a complete top-control UI for alpha-visible systems,
- stable saves, recovery, and Command Log continuity,
- SillyTavern-first live-host confidence,
- Lumiverse support kept usable as a preview adapter without making provider credentials an MVP blocker.

The key product test is simple: a new tester should be able to start Ashes of Peace, create the XO, play through A Ship Underway and The Empty Convoy, see consequences persist into optional side work, save/load safely, and understand what the runtime is doing without reading source docs.

## Current Baseline

The repo is already past the first playable slice.

Implemented and covered:

- package-driven Character Creator and first save,
- Starships, Mission, Crew, Ship, Log, and Settings panels,
- top-control shared shell for SillyTavern and Lumiverse,
- complete Prelude path through final command review,
- Chapter 1 path through the Asterion / False Colors handoff,
- Command Competence, Domain Reports, Request Counsel, warnings, authority notes, and no-gotcha checks,
- Command Bearing intervention and recovery,
- pressure ledger seeding and player-safe pressure display,
- Open Orders I review/select/defer,
- Open Orders I assignment open, first scene beat, direct/delegated resolution, rewards, and interval progress,
- Chapter 2 early slices beyond the minimum MVP target,
- logical storage adapters for SillyTavern and Lumiverse,
- alpha gate with deterministic contract coverage,
- Lumiverse fake-Spindle coverage and default live no-generation smoke path.

Important current gaps:

- User-facing docs still lag the implemented Chapter 1 and Open Orders state.
- The UI is functional but not yet alpha-complete as a product surface.
- Live SillyTavern smoke coverage is still missing for the current runtime shell.
- Side content is still mostly deterministic Open Orders scaffolding, not a complete side-mission experience.
- The side-mission generator concept is not implemented.
- Lumiverse live narration and live sidecar model-output proof are blocked on valid local provider credentials, not on the Directive adapter.

## MVP Alpha Definition

MVP playable alpha means:

1. A tester can install/open Directive in SillyTavern and complete a stable start-to-Chapter-1 arc.
2. The bundled Breckinridge package feels like a real campaign package, not a test fixture.
3. The Mission Director can resolve freeform orders with fair competence support and visible consequences.
4. Side content exists because of campaign pressure, not as disconnected errands.
5. Save/load, Save As, rerun, delete, and narration retry do not corrupt state.
6. The UI exposes every alpha-visible feature without relying on developer knowledge.
7. Hidden truth stays hidden from ordinary UI, narrator packets, Command Briefs, Domain Reports, Command Log rows, prompt blocks, and side-mission proposals.
8. The alpha gate and at least one live SillyTavern smoke prove the release surface.

MVP playable alpha does not require:

- all eight chapters,
- all nine designed side assignments,
- Starship Creator,
- Mission Creator,
- marketplace/share UX,
- full Lumiverse generation parity,
- automatic SillyTavern chat edit/delete/branch interception,
- provider-generated side missions as a default path.

## Campaign Scope

### Required Main Arc

The MVP campaign arc should be:

```text
Character Creator
-> Prelude: A Ship Underway
-> Chapter 1: The Empty Convoy
-> Chapter 1 closing state and post-chapter optional-work offer
-> MVP alpha checkpoint / optional preview into Chapter 2
```

Chapter 2 content may remain available because it already exists, but it should not be required to judge MVP alpha completeness.

### Prelude Requirements

Prelude is already implemented enough for MVP, but it needs a release-facing polish pass.

MVP requirements:

- Boarding and ready-room handoff are playable.
- Senior readiness, fallback command, command rhythm, Hesperus, aftermath, combined-load, and final review remain playable.
- Prelude consequences visibly affect Chapter 1 and side work.
- The player understands that technical debt, crew trust, and command culture are persistent.
- First Campaign Workflow and Operator Manual describe the real Prelude flow.

Remaining work:

- Improve user-facing explanations of what Prelude choices change.
- Ensure Mission panel summarizes Prelude carried consequences cleanly at Chapter 1 start.
- Add a short "where we are" post-Prelude transition view or Command Log summary if current UI feels abrupt.

### Chapter 1 Requirements

Chapter 1 must feel complete, not just mechanically complete.

Current phase spine:

- `initial-reception`
- `convoy-approach`
- `first-posture-decision`
- `first-committed-response`
- `convoy-contact-execution`
- `offsite-custody-cargo-leads`
- `pell-contact-terms`
- `joint-inspection-release-cargo`
- `cargo-diagnostic-pulse`
- `hardware-recovery-under-seal`
- `chapter-1-resolution-terms`
- `asterion-arrival-false-colors`

MVP requirements:

- Each Chapter 1 phase has a clear player-facing command question.
- The player can take at least three broad viable styles through the chapter:
  - rescue-first and humanitarian,
  - evidence/security-first,
  - diplomatic/coordination-first.
- Warnings and authority notes fire for major procedural risks.
- The missing hardware, false order, Compact relationship, Ivers/Pell handling, and final cooperative record remain coherent across save/load and rollback.
- Actor/front state is visible only through player-safe summaries.
- The Asterion / False Colors handoff closes Chapter 1 and creates a satisfying alpha checkpoint.

Remaining work:

- Review Chapter 1 as a single player journey, not only stage-by-stage tests.
- Add a "Chapter 1 completion" player-facing summary in Mission or Log that explains:
  - what the Breckinridge established,
  - what remains unresolved,
  - what pressures became side work,
  - why Chapter 2 can open later.
- Add a runtime smoke that plays the canonical happy-path through complete Chapter 1 from a fresh campaign or seeded Prelude completion.

## Probable MVP Side Missions

The MVP should include probable side missions without requiring the full campaign Open Orders cadence.

The full campaign baseline places Open Orders I after Chapter 2. For MVP alpha, we should treat side content in a narrower way:

- Keep the authored Open Orders I package templates as the reference side-content model.
- Allow the MVP to surface "probable side work" after Chapter 1 as an alpha demonstration if the current state supports it.
- Avoid claiming the full campaign Open Orders schedule is final until Chapter 2 and later pacing are production-ready.

### Authored Side Assignments

The package already defines three Open Orders I assignments:

| Assignment | Source pressure | MVP role |
|---|---|---|
| The Long Repair | Imani, engineering, technical debt | Demonstrates ship/system pressure becoming local repair work. |
| Borrowed Wings | Bronn, security, fallback command | Demonstrates personnel/readiness pressure becoming civilian-pilot support. |
| Quiet Channels | Priya, operations, coordination, regional trust | Demonstrates relationship/regional trust pressure becoming communications work. |

MVP side content should make at least two of these feel complete enough to play:

- open into a scene,
- show inherited pressure and local stakes,
- support one to three scene beats,
- allow direct command or accountable delegation,
- commit a reward/asset,
- update Command Log and pressure state,
- affect later summaries.

The third can remain available but lighter, as long as the UI makes its status clear.

### Probable Generated/Reactive Side Work

In addition to authored Open Orders I, the MVP can support probable side-mission candidates generated from Chapter 1 consequences.

Examples:

| Candidate | Trigger | Scope | Why it belongs |
|---|---|---:|---|
| Evidence Chain Cleanup | Evidence-first or joint-inspection outcome leaves custody obligations. | small | Reinforces that evidence preservation creates work. |
| Quarantine Review | Rescue-first or quarantine-risk path creates medical/procedural follow-up. | small | Makes accepted risk visible without punishing the player unfairly. |
| Ivers Witness Support | Ivers is protected or released under supervision. | small/medium | Turns witness trust into a durable continuity obligation. |
| Pell Terms Follow-Up | Pell contact terms create unresolved local trust or legal commitments. | medium | Converts diplomacy into maintenance, not a one-time check. |
| Missing Hardware Audit | Hardware recovered under seal still needs custody, inventory, and command-system review. | medium | Bridges Chapter 1 into later false-colors themes without spoiling hidden truth. |
| Crew Process Check | Bronn, Priya, or Imani disagrees with how Chapter 1 was handled. | small | Lets crew development emerge from actual play. |

These candidates should not all appear. The Director should present one or two, with clear reasons and cooldowns.

## Side-Mission Generator Direction

The side-mission generator should not be "ask a model to invent quests and put them in the campaign."

The safer design is a Mission Director sidecar that detects side-mission opportunities from committed state, then proposes candidates that must pass deterministic validation before they can become playable.

### Core Principle

Provider calls may suggest. Deterministic validators decide.

Generated side missions must:

- inherit current campaign state,
- cite committed source events or pressure records,
- respect package side-mission rules,
- avoid hidden-truth leakage,
- avoid contradiction with authored chapter state,
- classify scope,
- produce reviewable candidates,
- require player or Director acceptance before becoming active.

### Generator Pipeline

Recommended pipeline:

```text
committed turn or scene beat
-> deterministic signal extraction
-> optional model-assisted opportunity detection
-> deterministic threshold gate
-> side-mission candidate proposal
-> validation and deduplication
-> Mission panel review
-> schedule/open/defer/delegate
-> playable side scene
-> validated resolution
```

### Why Not One Drama Score

A single "drama score" will be too blunt. It will over-trigger on loud scenes and miss quiet obligations.

Use several scores instead:

| Score | Meaning | Source |
|---|---|---|
| `obligationScore` | Did the player create a promise, unresolved duty, follow-up, or owed report? | deterministic plus model extraction |
| `pressureScore` | Is there an active pressure with urgency, escalation, or linked template support? | deterministic |
| `relationshipScore` | Did a crew/NPC relationship change in a way that could sustain a scene? | deterministic plus optional model summary |
| `localStakesScore` | Is there a local person/place/system affected enough to justify play? | model-assisted, validated against known facts |
| `noveltyScore` | Is this not a duplicate of recent side work? | deterministic |
| `scopeScore` | Is this a small scene, medium assignment, or major mission? | model-assisted, validator-clamped |
| `safetyScore` | Can this be presented without hidden truth or future-spoiler leakage? | deterministic |

The generated candidate should pass a combined gate such as:

```text
safetyScore must pass
source event must be committed
pressureScore or obligationScore must pass
noveltyScore must pass
scope must be allowed by package interval
at least one playable decision must exist
```

### Model Roles

Use explicit generation roles rather than one generic call.

| Role | Blocking | Purpose | Output |
|---|---:|---|---|
| `sideMissionSignalDetector` | No | Detect possible side-work signals from a committed turn, scene beat, or Command Log row. | Structured JSON signals |
| `sideMissionCandidateBuilder` | No | Turn validated signals into one or more concise candidate pitches. | Structured JSON candidates |
| `sideMissionSceneFramer` | Maybe | Build the first scene brief after a candidate is accepted. | Structured JSON scene brief |
| `sideMissionConsequenceAdvisor` | No | Suggest possible reward/pressure consequences for validation. | Structured JSON proposals |

In Lumiverse, these can run as sidecars beside chat generation. In SillyTavern, they should run after commit, sequentially or deferred, so they do not block play.

### Candidate Record Sketch

```text
sideMissionCandidate
  id
  sourceOutcomeId
  sourceCommandLogEntryId
  sourcePressureIds[]
  sourceSceneBeatIds[]
  packageId
  intervalId?
  title
  scope: small | medium | large
  kind: authored | generated | hybrid
  playerSummary
  directorSummary
  triggeringSignals[]
  involvedCrewIds[]
  involvedActorIds[]
  involvedLocationIds[]
  requiredKnownFactIds[]
  blockedByHiddenFactIds[]
  proposedRewards[]
  proposedRisks[]
  duplicateOfCandidateId?
  expiresAfterChapterId?
  cooldown
  validation
    status: pending | valid | rejected
    reasons[]
  rawValuesHidden: true
```

### Generated Mission Outline Sketch

Accepted generated candidates should expand into a bounded outline:

```text
sideMissionOutline
  id
  candidateId
  title
  scope
  openingSituation
  commandQuestion
  inheritedStateSummary
  involvedPressures[]
  sceneBeats[]
    id
    purpose
    playableDecision
    possibleCosts[]
    possibleRewards[]
  endStates[]
  validationRules[]
  narratorConstraints[]
  commandLogRules[]
```

For MVP, only small and medium scopes should be allowed. Large generated missions can be planned but rejected or parked until after alpha.

### Threshold Policy

Default MVP thresholds:

- Small side scene:
  - one committed source,
  - one player-facing obligation or pressure,
  - one playable decision,
  - no new hidden-truth dependency.
- Medium side assignment:
  - one committed source,
  - one active pressure,
  - at least one crew/NPC/local-stake anchor,
  - a plausible reward or relief of pressure,
  - explicit schedule window.
- Large side mission:
  - disabled for MVP unless package-authored.

The generator should prefer fewer, better candidates:

- maximum two new candidates after a major scene,
- maximum one generated candidate after an ordinary scene beat,
- cooldown after presenting a candidate from the same pressure,
- deduplicate against existing Open Orders templates.

### Validation Rules

A side-mission proposal is rejected if:

- it references hidden truth not known to the player,
- it invents a faction, asset, casualty, promise, or location not supported by state or package data,
- it resolves a main-chapter question early,
- it requires a future chapter to have happened,
- it duplicates an active candidate,
- it converts a calm side scene into Pale Lantern escalation without causal support,
- it has no meaningful player decision,
- it cannot name its committed source event.

### UI Contract

The Mission panel should show generated candidates as reviewable work, not as automatic quests.

Candidate states:

- `Detected`: Director found a possible side-work signal.
- `Proposed`: a valid candidate is ready for player review.
- `Accepted`: candidate becomes an available side assignment.
- `Deferred`: candidate remains recorded but inactive.
- `Delegated`: candidate can resolve through accountable offscreen support.
- `Expired`: candidate no longer makes sense because state changed.

Controls should stay top-control compatible:

- global navigation and close/open controls stay in the top bar,
- candidate controls live inside the Mission card action row,
- no bottom-right floating controls,
- generated side content should use compact labels and player-safe summaries.

### Storage And Transaction Rules

Generated side content must be campaign-owned state.

Do not write generated candidates into package templates. Do not let provider prose become authoritative state.

Store:

- candidate records,
- accepted generated outlines,
- validation results,
- source ids,
- scene beats,
- resolution records,
- reward/pressure deltas.

Rollback behavior:

- deleting the source outcome removes or invalidates generated candidates tied only to that source,
- rerunning the source outcome marks prior candidates stale until revalidated,
- save branches preserve candidate state independently,
- narration retries never change candidate state.

## MVP UI Completion Plan

The MVP UI should feel like a small complete tool, not an internal harness.

Required surfaces:

### Starships

- package health,
- start campaign,
- resume draft,
- load save,
- imported package placeholder or disabled import affordance if import UI is not ready,
- clear current-package/current-save status.

### Character Creator

- draft save/resume,
- review and begin,
- visible package-owned constraints,
- concise validation errors,
- no hardcoded Ashes-only runtime logic.

### Mission

- current mission/chapter/phase,
- Command Brief and Domain Reports,
- Procedure Checks,
- preview/commit/discard flow,
- Command Bearing intervention,
- pressure summaries,
- Open Orders candidates and active assignment scene beats,
- Save Game and Save As,
- Last Outcome controls,
- Chapter completion summaries.

### Crew

- senior crew roster,
- player-safe continuity summaries,
- recent relationship/development notes without raw scores,
- active crew pressures when player-safe.

### Ship

- ship condition,
- technical debt,
- active system constraints,
- earned assets affecting the ship.

### Log

- committed outcomes,
- Command Log summaries,
- assisted summary status,
- filters or grouping if the log becomes long enough during full Prelude + Chapter 1.

### Settings / State Safety

- simulation mode,
- active package/save,
- storage diagnostics,
- Command Bearing state,
- safe repair actions:
  - refresh indexes,
  - verify active save,
  - export diagnostic bundle,
  - clear stale preview,
  - recover from missing active save by selecting readable fallback.

## MVP Development Stages

### Stage MVP-1: Release-Facing Baseline Refresh

Goal: make docs match current runtime reality.

Work:

- Refresh First Campaign Workflow for complete Prelude + Chapter 1.
- Refresh Operator Manual for Open Orders scene beats and dual-host top-control shell.
- Update Pre-Alpha Systems alpha definition around complete Prelude + Chapter 1.
- Add a short MVP status section to release notes.

Exit condition:

Docs no longer say the playable content ends at the first Chapter 1 response.

Verification:

- Markdown link check.
- `rg` sweep for stale "first Chapter 1 response slice" language.
- Alpha gate.

### Stage MVP-2: Chapter 1 Journey Audit

Goal: prove Chapter 1 as one playable arc.

Work:

- Add an end-to-end runtime test from Chapter 1 start to `chapter-1-transition-to-false-colors`.
- Confirm each phase has a player-facing summary and command question.
- Add Chapter 1 completion summary to Mission/Log.
- Review hidden-source safety across the full Chapter 1 journey.

Exit condition:

Chapter 1 can be described and tested as a complete MVP chapter, not only as individual stages.

Verification:

- `test-runtime-mvp-chapter1-complete.mjs`
- existing Chapter 1 stage tests,
- alpha gate.

### Stage MVP-3: MVP Side Content Pack

Goal: provide enough side content to prove pressure-led optional work.

Work:

- Upgrade The Long Repair to a multi-beat small side assignment.
- Upgrade one of Borrowed Wings or Quiet Channels to a multi-beat small/medium side assignment.
- Preserve direct/delegated resolution and rewards.
- Add post-Chapter-1 probable side-work candidates for at least two Chapter 1 consequences.
- Add Mission panel review language for why each candidate is available.

Exit condition:

A tester can complete Chapter 1 and choose one optional side assignment that feels causally tied to their play.

Verification:

- `test-open-orders-scene.mjs`
- new generated/probable candidate tests,
- save/load/rollback tests,
- hidden-source scan.

### Stage MVP-4: Side-Mission Opportunity Detector

Goal: implement deterministic-first candidate detection.

Work:

- Add `src/side-missions` or extend `src/pressures` with opportunity scoring.
- Use committed outcomes, pressure records, scene beats, promises, and Command Log entries as sources.
- Generate candidate records deterministically first.
- Add model-role interfaces but keep provider calls disabled or fixture-backed by default.
- Add deduplication, cooldown, and validation.

Exit condition:

The Director can propose side-mission candidates from committed state without a model call.

Verification:

- fixture: no candidate below threshold,
- fixture: one candidate from evidence custody,
- fixture: one candidate from quarantine risk,
- fixture: duplicate suppressed,
- fixture: hidden truth rejected.

### Stage MVP-5: Provider-Assisted Candidate Builder

Goal: add optional model assistance without giving it authority.

Work:

- Add generation roles:
  - `sideMissionSignalDetector`,
  - `sideMissionCandidateBuilder`,
  - `sideMissionSceneFramer`.
- Validate structured JSON output.
- Store rejected provider proposals as diagnostics, not state.
- Route through host generation clients.
- In Lumiverse, schedule as nonblocking sidecars when possible.
- In SillyTavern, run after commit or deferred.

Exit condition:

Provider assistance can improve candidate phrasing and scene framing but cannot invent accepted state.

Verification:

- fake host structured-output test,
- provider failure fail-soft test,
- invalid JSON rejection test,
- hidden leak rejection test,
- dual-host scaffold.

### Stage MVP-6: UI Completion Pass

Goal: make alpha-visible features usable without developer explanation.

Work:

- Mission panel density and grouping pass.
- Open Orders candidate/scene/resolution controls polish.
- State Safety controls in Settings.
- Log filtering/grouping if needed.
- Starships package/import status pass.
- Desktop and phone-width visual smoke.

Exit condition:

The UI supports the full MVP flow without hidden developer-only controls.

Verification:

- extension shell tests,
- visual smoke harness,
- manual SillyTavern smoke,
- no bottom-control regression scan.

### Stage MVP-7: Live Host Confidence

Goal: prove the alpha host surface.

Work:

- Add repeatable live SillyTavern smoke:
  - open Directive,
  - start or load campaign,
  - preview/commit a turn,
  - save/load,
  - inspect Mission/Log.
- Keep Lumiverse no-generation smoke green.
- Keep Lumiverse live generation as optional until provider credentials are valid.

Exit condition:

SillyTavern-first MVP alpha can be tested by a user without relying only on unit tests.

Verification:

- alpha gate,
- live SillyTavern smoke,
- default Lumiverse smoke when credentials are supplied through environment variables.

## Recommended Side-Mission Generator Architecture

Add a new ownership boundary rather than overloading the Mission Director monolith.

Recommended modules:

```text
src/side-missions/
  opportunity-signals.mjs
  opportunity-scoring.mjs
  candidate-contracts.mjs
  candidate-validator.mjs
  candidate-deduper.mjs
  generated-outline.mjs
  side-mission-generator.mjs
  README.md
```

Integration points:

- `src/pressures`: pressure records and cooldowns.
- `src/mission`: scene/turn packets and active mission state.
- `src/jobs`: optional sidecar model calls.
- `src/generation`: generation roles and structured output validation.
- `src/runtime/runtime-app.mjs`: action methods to review, accept, defer, and open generated candidates.
- `src/ui/mission-panel.js`: candidate review and generated scene controls.
- `src/hosts/lumiverse/runtime-bridge.mjs`: Lumiverse runtime action mapping.

The module boundary should preserve this rule:

```text
side-missions proposes and validates optional work;
mission/adjudication resolves player actions;
transaction-state commits authoritative consequences.
```

## Data Contract Additions

Campaign state should add:

```text
sideMissions.generatedCandidates[]
sideMissions.generatedOutlines[]
sideMissions.candidateReviews[]
sideMissions.staleCandidates[]
sideMissions.generatorDiagnostics[]
```

Package data should add:

```text
sideMissionRules.generatedPolicy
  enabled
  allowedScopes[]
  maxCandidatesPerChapter
  maxCandidatesPerInterval
  allowedSourceTypes[]
  blockedTags[]
  requiredValidationRules[]
  defaultCooldown
```

Generation roles should add:

```text
sideMissionSignalDetector
sideMissionCandidateBuilder
sideMissionSceneFramer
sideMissionConsequenceAdvisor
```

## MVP Verification Matrix

| Area | Required proof |
|---|---|
| Prelude | Existing stage tests plus user-facing workflow refresh. |
| Chapter 1 | New end-to-end Chapter 1 journey test. |
| Side content | Multi-beat side assignment test and candidate review test. |
| Generator | Deterministic opportunity scoring and provider-fail-soft tests. |
| Hidden truth | Candidate, Command Brief, Domain Report, narrator, prompt-block, and Command Log leak scans. |
| Saves | Save/load/branch/rerun/delete around side candidates and active side scenes. |
| UI | Desktop and phone-width visual smoke, top-control scan, no bottom-control regression. |
| SillyTavern | Live shell/start/preview/commit/save/load smoke. |
| Lumiverse | Default no-generation smoke, fake-Spindle generation/sidecar coverage. |
| Gate | `node tools\scripts\run-alpha-gate.mjs` green. |

## Product Risks

### Side-Mission Spam

Risk: every dramatic scene creates too many candidates.

Mitigation:

- strict thresholds,
- max one or two proposals,
- cooldowns,
- deduplication,
- Mission panel review instead of auto-opening.

### Provider Overreach

Risk: model-generated side missions invent facts or hidden truth.

Mitigation:

- model output is proposal-only,
- deterministic validator rejects unsupported facts,
- accepted state always cites committed source ids,
- hidden fact ids are blocked unless revealed.

### Loss Of Campaign Focus

Risk: side content distracts from the complete Prelude + Chapter 1 MVP.

Mitigation:

- large generated missions disabled,
- MVP side content limited to small/medium assignments,
- side content must relieve or transform active pressure,
- chapter completion remains the primary alpha success path.

### Host Performance

Risk: sidecar model calls slow down play.

Mitigation:

- deterministic candidate detection first,
- provider calls deferred by default,
- Lumiverse can run sidecars in parallel,
- SillyTavern can run generator after commit or on demand.

## Open Decisions

- Should MVP alpha surface probable side missions immediately after Chapter 1, or only after the already-implemented Chapter 2 transition?
- Which two Open Orders I assignments should be promoted to complete multi-beat MVP quality first?
- Should generated side candidates be visible to the player by default, or kept as Director suggestions until accepted?
- What structured-output schema should provider-assisted candidate generation use?
- Should side-mission generator diagnostics be visible in Settings, Mission, or a developer-only diagnostics panel?
- How much side content can be delegated without direct play while still producing meaningful continuity?

## Recommended Next Step

Start with Stage MVP-1 and MVP-2 before implementing provider-assisted generation.

The current repo already has enough systems to support an MVP alpha. The fastest path is:

1. refresh stale user-facing docs,
2. prove Chapter 1 as one complete journey,
3. make two side assignments feel complete,
4. then add deterministic side-mission opportunity detection,
5. only then add provider assistance as a sidecar.

That order keeps the MVP grounded in working campaign state instead of chasing generated content before the authored alpha experience is polished.
