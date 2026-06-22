# Director Retrieval And Context Orchestration

## Purpose

Directive needs a way to select the right package data at the right time without flooding prompts, leaking hidden truth, or letting narration mutate state.

Saga's Loredeck and Lore Automation pattern is the right conceptual reference: data-only packages, context gates, relevance scoring, broad candidate recall, optional model classification, bounded application, audit, and undo.

Directive should adapt that pattern into a Director retrieval system. It should not treat Director knowledge as ordinary prompt lore.

## Core Decision

Directive will use typed package datasets and Director cards.

These cards may look like lorecards internally, but they are not just prompt memory. They feed different consumers:

- Mission Director.
- Crew Director.
- Ship Director.
- Command Director.
- Narrator context.
- Command Log summarizer.

The same retrieved source fact may be safe for one consumer and unsafe for another. Hidden mission truth can enter a Mission Director packet without entering the narrator packet. A high-trust crew disclosure can be visible to relationship logic without becoming public player knowledge.

## Package Dataset Families

Each campaign package may contain multiple dataset families.

For the Breckenridge package, the first expected families are:

- `crew`: senior staff profiles, history, voice guidance, relationship dynamics, reveal ladders, B-plot hooks, and advice rules.
- `ship`: ship systems, technical debt, locations, emergency procedures, constraints, and refit state.
- `mission`: mission phases, objectives, facts, clues, hidden truths, hazards, end states, and aftermath rules.
- `campaign`: factions, recurring actors, regional history, campaign tracks, campaign assets, and long-range consequences.
- `command`: Command Decisions, Inspiration and Resolve opportunities, Values tension, Directives tension, and command-culture reactions.
- `canon`: era guardrails, forbidden contradictions, package-local continuity limits, and canon divergence records.

These are data domains, not UI tabs. The runtime can display some of their contents, but their primary purpose is retrieval, Director reasoning, and validated state change.

## Director Card Types

Initial card types should include:

```text
crew.profile
crew.voice
crew.relationship
crew.reveal
crew.bplot
crew.coalitionRule
ship.system
ship.location
ship.technicalDebt
ship.procedure
mission.fact
mission.hiddenTruth
mission.revelation
mission.constraint
mission.front
mission.clock
mission.endState
campaign.faction
campaign.actor
campaign.asset
campaign.track
command.decision
command.valueDirectiveTension
command.styleReaction
canon.guardrail
```

Cards should be small, typed, and retrievable. A single card should carry one usable fact, rule, pressure, reveal, relationship state, or constraint.

Avoid encyclopedia entries. The source documents can remain prose. Runtime cards should be precise enough to answer:

- When is this relevant?
- Who may know it?
- Which Director may use it?
- Is it safe for narration?
- What state does it reference?
- What should happen if it is ignored, revealed, challenged, or resolved?

## Conceptual Card Shape

Field names are not final schema, but the first card contract should support this shape:

```json
{
  "id": "crew.whitaker.voice.command-pressure",
  "type": "crew.voice",
  "title": "Whitaker under command pressure",
  "datasetId": "breckenridge.crew",
  "sourceDocument": "Directive_Breckenridge_Senior_Staff_Character_Bible.md",
  "sourceRefs": ["2.8", "11"],
  "visibility": "directorOnly",
  "audiences": ["crewDirector", "narrator"],
  "scope": {
    "characters": ["mara-whitaker"],
    "missions": ["prelude-a-ship-underway"],
    "stardateFrom": 53049.2
  },
  "gates": {
    "playerKnowledge": "professional",
    "relationshipMin": null,
    "requiresRevealedFactIds": [],
    "blocksUntilFactIds": []
  },
  "retrieval": {
    "lanes": ["present_character", "command_pressure", "captain_authority"],
    "keywords": ["captain", "Whitaker", "orders", "responsibility", "process"],
    "priority": "normal"
  },
  "payload": {
    "summary": "Under stress, Whitaker becomes quieter and more precise. She asks shorter questions and uses formal language when she needs control.",
    "constraints": [
      "Do not portray her as a generic plot wall.",
      "She may change course when evidence changes the risk picture."
    ]
  }
}
```

The card may inform a packet. It must not directly mutate campaign state.

## Visibility Model

Visibility must be explicit.

Recommended visibility values:

- `publicPackage`: safe for package detail UI and player-visible reference.
- `playerKnown`: known by the player character in the current campaign.
- `playerDiscoverable`: not known yet, but may be revealed when gates are met.
- `directorOnly`: usable for hidden Director reasoning, not safe for narration by default.
- `lockedHidden`: hidden truth that can only be released by mission, relationship, or campaign state.

Visibility is independent from audience. A `directorOnly` card may be retrieved for Mission Director logic. It should not enter the narrator packet unless a reveal rule converts it into known state.

## Audience Packets

One retrieval run may produce several packets.

### Mission Director Packet

Contains mission frame data:

- Active objective.
- Hidden truth relevant to the action.
- Current fronts and clocks.
- Actor goals and leverage.
- Constraints and possible end states.
- Mission-abandoning move rules.

### Crew Director Packet

Contains crew-specific data:

- Present or implicated officers.
- Their expertise, blind spots, and current relationship state.
- Known and hidden pressures.
- Reveal eligibility.
- Who is likely to speak, object, support, or remain silent.
- B-plot hooks and private follow-up triggers.

### Ship Director Packet

Contains technical and operational data:

- Relevant systems.
- Ship condition.
- Technical debt.
- Repair limits.
- Procedural constraints.
- Failure modes and reversible options.

### Command Director Packet

Contains command-mechanics data:

- Values and Directives in tension.
- Possible Command Decisions.
- Inspiration and Resolve eligibility.
- Command-culture reactions.
- Whether an award has already been granted.

### Narrator Packet

Contains only player-safe context:

- Current scene frame.
- Known facts.
- Public objectives.
- Present characters and approved voice guidance.
- Consequences already committed.
- Description constraints.

The narrator packet should not contain unrevealed secrets, raw relationship values, hidden clocks, or Director-only end-state logic.

### Command Log Packet

Contains committed results only:

- Attempted action.
- Validated outcome band.
- Costs and consequences.
- Relationship and command-style changes in descriptive form.
- Newly known facts.
- Remaining obligations and unresolved hooks.

The Command Log packet is built after state deltas commit.

## Retrieval Pipeline

The pipeline should be deterministic-first.

```text
campaign state + player input + recent transcript
-> scene snapshot
-> hard gates
-> multi-lane recall
-> optional semantic classifier
-> deterministic packet assembly
-> Director reasoning
-> validated outcome packet
-> state delta commit
-> narrator packet
-> Command Log packet
-> retrieval run journal
```

### 1. Scene Snapshot

The scene snapshot is built from committed state, not from model memory.

It should include:

- Active package and campaign.
- Current stardate and location.
- Active mission and phase.
- Player intent and action classification.
- Present characters.
- Relevant ship systems.
- Current objective and directives.
- Known facts and hidden fact ids.
- Relationship summaries and hidden raw values.
- Current fronts, clocks, and campaign tracks.
- Recent player commitments and promises.

Recent transcript can help retrieval, but committed state remains authoritative.

### 2. Hard Gates

Hard gates remove cards that cannot safely participate.

Examples:

- Wrong campaign package.
- Wrong mission or campaign.
- Stardate or phase not active.
- Character not present or implicated.
- Ship system not relevant.
- Hidden fact not revealed and not needed by a Director audience.
- Trust ladder not satisfied.
- Simulation mode excludes severe outcome.
- Card was retired, superseded, or contradicted by campaign state.

Hard gates should be local and deterministic.

### 3. Multi-Lane Recall

Recall should be broad enough to avoid missing subtle context.

Initial lanes:

- `direct_recent_text`: direct names, systems, places, factions, or terms in recent play.
- `active_objective`: current mission objective and action classification.
- `present_characters`: officers and mission characters in the scene.
- `relationship_pressure`: relationship dimensions, recent conflicts, promises, and private follow-ups.
- `ship_systems`: involved systems, technical debt, damage, and procedure.
- `mission_frame`: active phase, hidden truth, fronts, clocks, and revelations.
- `command_tension`: active Values, Directives, Command Decisions, and command-style opportunities.
- `campaign_consequence`: campaign tracks, assets, recurring actors, and offscreen reactions.
- `unresolved_hooks`: B-plots, obligations, unresolved costs, and follow-up scenes.
- `exploration_sample`: deterministic rotation through eligible low-recall cards to expose blind spots.

Style or difficulty should not reduce scan breadth. Exploration and Command modes change consequence permission, not whether the system remembers relevant data.

### 4. Optional Semantic Classifier

A provider may classify or rerank a bounded candidate packet.

The classifier may answer:

- Which candidates matter now?
- Which audience should receive each candidate?
- Which hidden cards must stay out of narration?
- Which crew member is most likely to intervene?
- Which Command Decision is plausibly active?

The classifier must not:

- Mutate state.
- Reveal hidden facts.
- Award command progression.
- Advance clocks.
- Decide death, injury, or mission end states.

Provider output is evidence. Validation owns authority.

### 5. Packet Assembly

Packet assembly takes the gated and ranked candidates and creates audience-specific packets.

Rules:

- Keep packets bounded.
- Prefer exact constraints over broad summaries.
- Preserve source ids for audit.
- Keep hidden and player-safe material separate.
- Include skipped counts and reasons in diagnostics.
- Attach every packet to a retrieval run id.

### 6. Director Reasoning And State Delta

Directors consume their packets and propose outcome data.

State mutation still goes through:

- Intent parsing.
- Capability validation.
- Outcome packet construction.
- State delta validation.
- Transaction commit.

Retrieval makes the right data available. It does not replace adjudication.

## Crew Bible Integration

The Breckenridge senior staff bible should become structured crew dataset cards.

The concrete package contract for this data is [Crew Dataset Contract](../packages/CREW_DATASET_CONTRACT.md).

Important source structures:

- Shared starting context.
- Personnel streams.
- Twenty-five-day starting frame.
- Officer histories.
- Relationship with the player.
- Relationships with senior staff.
- Long-term character pressures.
- Voice guides.
- Existing relationship map.
- Likely coalitions by situation.
- Reveal and trust ladder.
- Character portrayal principles.

The reveal ladder is especially important. It maps naturally to `playerKnowledge` gates:

- `serviceRecord`: safe before meeting or after ordinary personnel review.
- `professionalConversation`: available through normal professional scenes.
- `highTrust`: requires relationship state, crisis context, or specific reveal event.

Crew Directors should use hidden high-trust cards to model behavior, but narrator packets should not state those disclosures until the campaign has earned them.

## Senior Staff Debate Discipline

The character bible establishes that not every officer should speak in every briefing.

Crew retrieval should therefore select:

- One or two active objectors or supporters.
- Other officers as fact, constraint, or implementation contributors.
- Private follow-up candidates when silence is meaningful.

The retrieval run should prefer situational relevance over equal speaking time.

Valid reasons to retrieve a crew card:

- The officer is present.
- Their department owns a constraint.
- Their history creates pressure.
- Their relationship with the player is affected.
- Their B-plot is active.
- Their expertise changes the available options.
- Their silence is a meaningful beat.

Invalid reasons:

- The officer has not spoken recently.
- The system wants one moral opinion per character.
- The scene needs a debate for drama without a causal reason.

## Package And Campaign Boundary

Package datasets are templates. Campaign state owns what has happened in this playthrough.

Package-owned:

- Source cards.
- Dataset indexes.
- Default gates.
- Package-local voice and portrayal rules.
- Mission and campaign card definitions.

Campaign-owned:

- Revealed card ids.
- Player-known facts.
- Relationship values.
- Trust-ladder progress.
- Active mission state.
- Clock and front progress.
- Accepted obligations.
- Muted, retired, contradicted, or superseded card ids.
- Retrieval run journals.

Package cards should never be edited by play. Campaign state records how a particular playthrough has used, revealed, suppressed, or contradicted them.

## Run Journal

Every retrieval run should produce a compact journal record.

It should include:

- Run id.
- Turn or outcome id.
- Active package, campaign, mission, and phase.
- Scene snapshot hash.
- Candidate counts by lane.
- Gated-out counts by reason.
- Selected card ids by audience.
- Provider status if used.
- Packet hashes.
- State delta id if the run contributed to a committed outcome.

The journal supports debugging, replay, and explaining why the Director had or lacked certain information.

## Creator Implications

Future Starship Creator and Mission Creator tools should not write freeform lore dumps.

They should help authors create:

- Dataset families.
- Typed Director cards.
- Context gates.
- Reveal gates.
- Retrieval cues.
- Audience safety flags.
- Source references.
- Health checks.

Package Health should eventually validate:

- Every card has a type, source, visibility, and audience.
- Hidden cards cannot enter narrator packets by default.
- High-trust crew revelations have gates.
- Mission critical clues have more than one retrieval path.
- Ship technical constraints reference known systems.
- Command Decisions cannot be awarded twice.
- Dataset ids and card ids are stable.

## Source Architecture Direction

Director retrieval should be its own source boundary.

Expected modules:

```text
src/retrieval/
  scene-snapshot.js
  dataset-index.js
  director-card-schema.js
  gate-evaluator.js
  recall-lanes.js
  semantic-classifier.js
  packet-builder.js
  run-journal.js
  diagnostics.js

src/directors/
  director-coordinator.js
  mission-director.js
  crew-director.js
  ship-director.js
  command-director.js
```

The Mission Director should not own all retrieval. The Director coordinator asks retrieval for packets, then routes them to the appropriate Director modules.

## Anti-Patterns

Avoid:

- One giant lorebook injected into every prompt.
- Hidden truth entering narrator context because it scored as relevant.
- Director cards that mutate state directly.
- Provider reranking that bypasses deterministic gates.
- Equal-time crew debates.
- Character bibles pasted wholesale into prompts.
- Campaign package data edited by campaign play.
- Separate retrieval engines for each Director with duplicated logic.
- Treating Command Log summaries as source data.

## First Implementation Slice

The first practical slice is crew retrieval for the prelude senior staff.

Scope:

- Convert the senior staff bible into foundational typed crew cards.
- Build a scene snapshot for `prelude-a-ship-underway`.
- Gate cards by present character, player knowledge, and reveal level.
- Produce separate Crew Director and narrator packets.
- Prove high-trust disclosures stay hidden.
- Log selected card ids and skipped hidden cards.

Success criteria:

- The player can meet the senior staff without receiving biography dumps.
- Whitaker, Bronn, Kieran, Priya, Rowan, Miriam, and Imani speak only when situationally justified.
- Voice guidance reaches narration without leaking high-trust secrets.
- Relationship-impact candidates reach Crew Director logic.
- The run journal can explain why a card was included or excluded.

Current artifacts:

- [dataset-index.mjs](../../src/retrieval/dataset-index.mjs)
- [gate-evaluator.mjs](../../src/retrieval/gate-evaluator.mjs)
- [recall-lanes.mjs](../../src/retrieval/recall-lanes.mjs)
- [packet-builder.mjs](../../src/retrieval/packet-builder.mjs)
- [run-journal.mjs](../../src/retrieval/run-journal.mjs)
- [diagnostics.mjs](../../src/retrieval/diagnostics.mjs)
- [breckenridge-senior-staff.crew-dataset.json](../../packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json)
- [prelude-senior-staff-briefing.fixture.json](../../tests/fixtures/retrieval/prelude-senior-staff-briefing.fixture.json)
- [prelude-whitaker-ready-room.fixture.json](../../tests/fixtures/retrieval/prelude-whitaker-ready-room.fixture.json)
- [validate-crew-dataset.mjs](../../tools/scripts/validate-crew-dataset.mjs)
- [test-crew-retrieval-fixture.mjs](../../tools/scripts/test-crew-retrieval-fixture.mjs)
- [test-director-retrieval-orchestration.mjs](../../tools/scripts/test-director-retrieval-orchestration.mjs)

The Stage 19 MVP is implemented. The Mission Director now uses `runDirectorRetrieval` to produce narrator-safe card ids instead of hardcoded card selection in `director.mjs`. The retrieval run also produces Mission Director, Crew Director, Ship Director, Command Director, narrator, and Command Log packet ids plus a compact journal for tests and future turn-ledger persistence.

## Open Questions

- Should `Director cards` be the public term, or should public docs say `package reference cards`?
- Should dataset indexes live inside the campaign package JSON or as package-adjacent JSON files?
- How much of the retrieval lane design should be shared with future Starship Creator health checks?
- Should the semantic classifier be available in the first runtime slice, or should the first slice stay local-only?
- What is the exact schema for crew reveal gates and relationship thresholds?
- Should retrieval run journals live in the turn ledger or in a separate diagnostics file?
