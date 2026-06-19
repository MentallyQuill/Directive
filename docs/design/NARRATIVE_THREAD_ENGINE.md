# Narrative Thread Engine

## Purpose

The Narrative Thread Engine is Directive's hidden continuity layer for B-stories, vignettes, recurring details, personal arcs, shipboard matters, and optional side work.

It should not be a side-quest generator.

The engine observes committed play, identifies unresolved human or situational material, incubates grounded story possibilities, and advises the Mission Director when a thread is worth surfacing. A good B-story should feel discovered through play, not assigned by a content scheduler.

Directive needs this layer because many meaningful Star Trek stories are not operational missions. A small off-duty habit, a private hobby, a disagreement over standards, a junior officer's mistake, or a quiet follow-up after a crisis can carry more character meaning than a formal assignment. The engine must preserve that range without inflating every detail into objectives, complications, and rewards.

## Core Decision

Use a **Narrative Thread Engine**, not a side-mission generator.

The engine tracks story material as threads. Some threads may eventually become Open Orders assignments or side missions. Many should remain vignettes, recurring details, private conversations, echoes, or dormant texture.

The Mission Director remains responsible for presenting and developing the active story. The Thread Engine advises it about what might be worth developing.

## Product Goals

The Narrative Thread Engine should:

- Make side stories emerge from committed play.
- Support small, meaningful character moments without quest inflation.
- Remember player interest in incidental details.
- Reinforce patterns across scenes instead of creating new plots from one line.
- Keep quiet material dormant until the fiction and pacing support it.
- Feed Crew Development, relationships, Command Log continuity, and Open Orders.
- Keep Command Bearing progression post-hoc and hidden until resolution.
- Avoid disconnected errands, hidden reward farming, and model-invented backstory.

The engine should not:

- Invent quests because pacing says it is time for content.
- Treat every crew detail as trauma, crisis, or progression fuel.
- Surface hidden character history without earned trust, context, or observable behavior.
- Tie every B-story to the main campaign conspiracy.
- Display latent story opportunities to the player.
- Promise Inspiration, Resolve, rewards, endings, or correct solutions.
- Punish the player for declining or ignoring optional personal material.

## Relationship To Existing Systems

Directive already has pieces of this model:

- The Mission Director manages situations, not fixed plots.
- `pressureLedger` records campaign-owned operational pressure.
- Open Orders can review, select, activate, progress, and resolve authored side assignments.
- Crew relationship and development data can express hidden growth, strain, and reveal gates.
- Command Bearing evaluates meaningful command resolution after the fact.
- Retrieval lanes already include relationship pressure and unresolved hooks.

The Narrative Thread Engine should connect these pieces into a coherent story-continuity layer.

| System | Responsibility |
|---|---|
| Mission Director | Presents and resolves the active mission or scene beat. |
| Narrative Thread Engine | Observes scenes, remembers grounded unresolved material, curates story opportunities, and proposes natural thread beats. |
| Pressure Ledger | Tracks operational, ship, crew, regional, and obligation pressure that may demand future work. |
| Open Orders | Handles larger optional assignments when a thread or pressure becomes substantial side work. |
| Crew Development | Applies hidden growth, strain, reveal, and behavior changes after meaningful scenes. |
| Relationships | Tracks how officers relate to the player through hidden state and descriptive memories. |
| Command Bearing | Evaluates Command Marks and style only after a thread reaches meaningful closure. |
| Command Log | Records player-facing committed outcomes, unresolved matters, and later echoes. |
| Retrieval | Supplies thread-relevant cards to the correct Director audience without leaking hidden truth. |

## Pressure Versus Thread

`pressureLedger` and `threadLedger` should remain separate.

Pressure answers:

```text
What unresolved operational force exists, and what happens if nobody addresses it?
```

Thread answers:

```text
What unresolved human, relational, shipboard, local, or thematic material is worth remembering?
```

Examples:

| Material | Pressure? | Thread? | Notes |
|---|---:|---:|---|
| Imani's unresolved command-network repair debt | yes | yes | Operational pressure with character meaning. |
| Kieran requesting unsafe simulator conditions | maybe | yes | Could become a command-development thread and later a pressure if risk rises. |
| Bronn's recurring tactical table game | no | yes | Character texture, mentorship, or relief material. |
| A local official's quiet request for help after a chapter | maybe | yes | May become an Open Orders assignment. |
| A convoy evidence chain that must be preserved | yes | maybe | Mostly obligation pressure unless it gains human or command-story meaning. |
| Rowan repairing an inaccurate old orrery | no | yes | Vignette or recurring detail, probably no Bearing potential. |

Pressure can feed threads. Threads can create pressure. They are not the same ledger because not every meaningful B-story should escalate into operational consequence.

## Thread Shapes

The engine should support several scales of story.

| Shape | Typical scope | Example |
|---|---:|---|
| `vignette` | One scene | Rowan allows the player to see a private hobby. |
| `recurring_detail` | Several brief callbacks | Bronn repeatedly works on an antique tactical game. |
| `character_thread` | Two to four scenes | Kieran responds poorly to a recent flight error. |
| `shipboard_b_story` | Three to five scenes | A junior engineer disputes Imani's safety standards. |
| `side_assignment` | Several substantial scenes | The crew assists a nearby settlement during downtime. |
| `long_character_arc` | Multiple chapters | Bronn changes how he mentors younger officers. |

The initial MVP should implement only:

- `vignette`
- `recurring_detail`
- `character_thread`
- `side_assignment`

`shipboard_b_story` and `long_character_arc` can wait until the ledger, activation, and closure model are stable.

## Episode Function

Each thread may have an episode function. This is for Director curation, not player display.

| Function | Meaning | Example |
|---|---|---|
| `mirror` | Examines the A-story theme at a personal scale. | A political trust crisis mirrors Imani deciding whether to trust a junior engineer. |
| `counterpoint` | Approaches a theme from the opposite direction. | A decisive operational crisis counterpoints Kieran learning that effort cannot fix every personal failure. |
| `relief` | Provides ordinary life, warmth, humor, curiosity, or texture. | Bronn is pulled into a recurring table-game rivalry. |
| `aftermath` | Lets mission consequences settle into ordinary lives. | Miriam checks how a rescue decision affected medical staff. |
| `setup` | Plants human context that may matter later without forcing it now. | Priya's informal favor ledger is noticed before it becomes operationally relevant. |

Relief stories are important. The engine must not force every hobby, joke, meal, disagreement, or personal ritual to symbolize the main plot.

## Thread Types

Thread type helps diversify spotlight and avoid repetition.

Initial type set:

- `crew_growth`
- `interpersonal_relationship`
- `mentorship`
- `professional_dilemma`
- `humanitarian_assistance`
- `cultural_exchange`
- `scientific_curiosity`
- `shipboard_maintenance`
- `recovery_and_aftermath`
- `hobby_ritual_or_domestic_life`
- `light_comedy`
- `local_civilian_problem`
- `promise_debt_or_favor`
- `identity_and_belonging`

Thread type should break ties between already-good candidates. It should not rescue weak, unsupported, or repetitive material.

## Lifecycle

Threads should use an explicit lifecycle:

```text
observed
-> latent
-> watchlisted
-> available
-> engaged
-> active
-> resolved / transformed / dormant / expired
-> echo
```

### `observed`

The scene scanner or opportunity scout detected potential, but the material has not passed enough checks to become stored story state.

### `latent`

The thread is stored but receives no screen time. Many recurring details and early character signals should remain here.

### `watchlisted`

The thread has enough support to be worth developing if a suitable opportunity appears.

### `available`

A natural opportunity exists and B-story bandwidth allows the Mission Director to surface one beat.

### `engaged`

The player responds with meaningful interest, action, concern, delegation, permission, refusal, or boundary-setting.

### `active`

The Mission Director is now tracking the thread as a B-story, side conversation, or side assignment.

### `resolved`

The central question meaningfully changes or closes.

### `transformed`

The original thread becomes a different ongoing thread.

### `dormant`

The opportunity passes or the player declines involvement. Dormancy is valid and should not apply automatic relationship punishment.

### `expired`

The context no longer exists. Examples include a location left behind, a local problem solved by another actor, or a mission state that invalidates the setup.

### `echo`

A later callback reflects the outcome without reopening the full story.

## Candidate Hard Gates

Before scoring, a candidate must pass all hard gates.

A candidate must:

1. Be supported by an actual scene event, committed state, or package-authored seed.
2. Contain an unresolved question, desire, tension, change, pattern, or discoverable texture.
3. Give the player plausible agency, even if that agency is only interest, respect, delegation, or refusal.
4. Be small enough not to displace the active A-story.
5. Avoid contradicting established facts.
6. Avoid requiring a contrived revelation.
7. Be distinct from active and recently resolved threads.
8. Have at least one plausible future trigger or callback.
9. Be capable of ending, transforming, becoming dormant, or expiring.
10. Respect current trust, reveal, privacy, sensitivity, and hidden-truth boundaries.

A candidate such as `Priya secretly has an estranged sister who appears next week` fails because nothing in play supports it.

A candidate such as `Priya repeatedly takes on unassigned administrative work and dismisses questions about exhaustion` can pass because it is observable, grounded, and potentially actionable.

## Scene Boundary Scanning

The engine should scan scenes, not every turn.

Scanning every message would be expensive and would overinterpret ordinary dialogue. The default trigger should be a scene boundary or committed state transition.

Valid scan triggers:

- Leaving a location.
- Ending a briefing.
- Concluding a private conversation.
- Completing a mission phase.
- Beginning transit, shore leave, repair time, or downtime.
- Finishing a debrief.
- Recording a relationship memory.
- Recording a new pressure.
- Opening or resolving Open Orders work.
- Completing a Command Log entry with unresolved follow-up.
- Recording a significant relationship, development, injury, fatigue, or strain change.

The first pass should be deterministic. A model call is warranted only if the prefilter finds at least one meaningful signal.

Useful prefilter signals:

- New promise, debt, request, invitation, or obligation.
- New named NPC with future access.
- Relationship or strain change.
- Unresolved disagreement.
- New personal fact.
- Player follow-up on an incidental subject.
- Crew failure, injury, commendation, conflict, or embarrassment.
- New noncritical ship problem.
- Unresolved local consequence.
- Repeated detail forming a pattern.
- Off-duty activity revealing a habit, ritual, interest, or attachment.
- The player assigns resources to something that was not the main objective.
- The player changes an order because of a personal or local concern.

A high rate of no candidate is desirable.

## Scene Delta

The Scene Delta Extractor should produce a compact, source-grounded record:

```yaml
scene_id: prelude.combined-load-test.03
source_turn_ids:
  - turn.prelude.combined-load.03
active_mission_id: prelude-a-ship-underway
active_phase_id: combined-load-test
ended_because: phase_complete

committed_changes:
  - "Kieran's flight profile was accepted with restrictions."
  - "Imani recorded remaining technical debt."

affected_entities:
  crew_ids: [kieran-vale, imani-cross]
  pressure_ids: [pressure.ship.imani-technical-debt]
  fact_ids: [ship.combined-load-risk]

unresolved_material:
  - "Kieran may treat criticism as personal failure."
  - "Technical debt still needs ownership."

player_interest_signals:
  - "The player asked Kieran why the drill affected him."

privacy_and_visibility:
  narrator_safe: true
  hidden_truth_refs: []
```

The scene delta is not player-facing. It is a safe input to deterministic filters and optional model calls.

## Threadworthiness Scoring

The engine should classify scoring dimensions categorically, then calculate the numeric score locally.

Positive dimensions are `0-3`:

| Dimension | Question |
|---|---|
| `causal_grounding` | How directly does the candidate arise from established events? |
| `unresolved_charge` | Is there a clear open question, tension, change, or texture? |
| `character_meaning` | Could it reveal or change something meaningful about a person or community? |
| `player_agency` | Can the player affect it through freeform action, interest, delegation, refusal, or boundaries? |
| `trek_function` | Does it support humanism, curiosity, service, ethics, relationships, or ordinary shipboard life? |
| `bounded_payoff` | Can it reach satisfying change without escalating into another A-plot? |
| `future_echo` | Could its outcome matter later through memory, trust, callback, initiative, or changed behavior? |

Penalties:

| Penalty | Range |
|---|---:|
| `contrivance_required` | 0-3 |
| `main_plot_collision` | 0-3 |
| `recent_repetition` | 0-2 |
| `exposition_or_sensitivity_burden` | 0-2 |
| `privacy_overreach` | 0-3 |

Suggested interpretation:

| Net score | Treatment |
|---:|---|
| 0-6 | Discard or retain only as incidental texture. |
| 7-10 | Latent seed. |
| 11-14 | Strong watchlist candidate. |
| 15+ | Eligible for activation when pacing permits. |

Score does not guarantee activation. It decides whether the thread is worth remembering.

## Player Interest

Player interest should modify priority, not create obligation.

Increase priority when the player:

- Asks a follow-up question.
- Remembers a previous personal detail.
- Offers assistance without being asked.
- Revisits an earlier subject.
- Requests private time with a character.
- Participates in an off-duty activity.
- Assigns resources to an issue.
- Changes an order because of a concern.
- Delegates follow-up with named accountability.

Reduce priority when the player:

- Explicitly declines involvement.
- Repeatedly redirects the conversation.
- Delegates and shows no further interest.
- Allows an opportunity to pass without engagement.

Ignoring a thread should not create automatic disapproval. It should allow the thread to become dormant, expire, or continue offscreen if causal state supports that.

## Incubation And Reinforcement

A single offhand detail should rarely become a full B-story immediately.

The engine should store the first meaningful signal as latent, then reinforce it with later evidence.

Example:

```yaml
id: thread.kieran.command-preparation
origin_scene_id: prelude.combined-load-test.03
participants:
  - kieran-vale

observable_seed: "Kieran requested additional simulator time immediately after a difficult flight evaluation."
story_question: "Is he improving his performance, or responding poorly to perceived failure?"
status: latent
shape: character_thread
shelf_life: campaign
supporting_evidence:
  - source_scene_id: prelude.combined-load-test.03
    summary: "Requested additional simulator time after criticism."
```

Later evidence reinforces the same thread:

- Kieran misses an off-duty meal to train.
- Miriam notes that he has been sleeping poorly.
- The player asks why the drill affected him so strongly.
- Bronn submits a concern about Kieran's risk tolerance.

This gives the story accumulation. The engine recognizes a pattern instead of manufacturing a plot from one line.

## B-Story Bandwidth

The Mission Director should expose or derive current B-story bandwidth.

| Bandwidth | Current conditions | Permitted content |
|---:|---|---|
| 0 | Battle, evacuation, climax, immediate danger | No new threads; only directly relevant callbacks. |
| 1 | High mission pressure | Brief reactions or micro-vignettes. |
| 2 | Active investigation or diplomacy | Plant hooks and limited B-story beats. |
| 3 | Transit, waiting, repair, routine orbit | Character threads, recurring details, and short assignments. |
| 4 | Shore leave or substantial downtime | Full side assignments and extended B-stories. |

A high-scoring thread should wait if the ship is at red alert.

The engine may also maintain a soft `story_pressure` value that rises when play has gone a long time without quieter material. Story pressure should influence which existing thread is selected when a natural opening appears. It must not force a weak story into existence.

## Command Bearing Separation

Threadworthiness and Command Bearing potential are separate.

Threadworthiness asks:

```text
Is this material likely to produce a meaningful, entertaining, or revealing B-story?
```

Bearing potential asks:

```text
Could this thread plausibly create a consequential command decision where the player's method matters?
```

Examples:

- Rowan showing the player an old mechanical orrery may be a strong vignette with no Bearing potential.
- Kieran concealing fatigue after a dangerous flight may support a strong B-story and possible Inspiration or Resolve recognition.
- Helping a colony repair a communal memorial may provide both character material and a Bearing opportunity, depending on the conflict.

The engine records possible affordances, not predetermined solutions:

```yaml
bearing_potential:
  eligible: true
  inspiration_affordance:
    strength: strong
    basis:
      - mentorship
      - honest disclosure
      - voluntary cooperation
  resolve_affordance:
    strength: moderate
    basis:
      - fitness-for-duty boundary
      - clear performance standards
      - accepted command responsibility
```

The player should never see a prompt such as:

```text
Resolve this through mentorship to earn Inspiration.
```

At closure, a separate evaluator examines the player's decisive actions, accepted cost, and causal impact. A thread can resolve successfully without a Command Mark. A thread can resolve imperfectly and still award a Mark if the player demonstrated meaningful command.

## Natural Activation

When a thread becomes available, the Mission Director should surface one plausible next beat rather than a complete quest outline.

Examples:

- Kieran asks for approval to continue simulator work after duty hours.
- Bronn submits a junior officer's unusually severe evaluation.
- Priya requests ten minutes in private about an unofficial supply arrangement.
- Miriam invites the player to attend a rehabilitation session as an observer.
- Rowan leaves an unfinished personal project in the science lab and reluctantly explains it when asked.
- A local official sends a personal rather than diplomatic request.
- A crew member fails to appear at an expected social event.
- The player encounters two characters already discussing the issue.

The thread becomes engaged only when the player responds with meaningful interest.

The player remains free to:

- Investigate.
- Help.
- Delegate.
- Decline.
- Delay.
- Set boundaries.
- Take an unexpected approach.
- Decide the issue is not theirs to solve.

## Visible UI Policy

Latent and watchlisted threads should remain hidden.

Once the player engages, the UI may show a neutral player-facing summary:

```text
OPEN THREAD

Vale has requested additional simulator time following the Hesperus approach.

Current status:
He has not explained why the evaluation affected him so strongly.
```

The UI must not display:

- Objective checklists.
- Intended endings.
- Available solutions.
- Inspiration or Resolve rewards.
- Success meters.
- Hidden scores.
- "Correct" approaches.
- Latent or watchlisted opportunities.

Possible labels:

- `Open Threads`
- `Ongoing Concerns`
- `Personal Matters`
- `Shipboard Matters`
- `Command Log: Unresolved`

`Open Threads` is the best initial label because it is neutral, clear, and broad enough for vignettes, shipboard concerns, and side assignments.

## Recommended State Model

Live thread state belongs in campaign saves, not package templates.

```yaml
threadLedger:
  records: []
  activationReviews: []
  closureReviews: []
  rawValuesHidden: true
```

Thread record:

```yaml
id: thread.kieran.command-preparation
origin_scene_id: prelude.combined-load-test.03
source_turn_ids:
  - turn.prelude.combined-load.03

participants:
  - kieran-vale
related_pressure_ids:
  - pressure.crew.kieran-risk-culture
related_card_ids:
  - crew.kieran.development.risk-culture
related_fact_ids: []
related_phase_ids:
  - combined-load-test

type: crew_growth
shape: character_thread
episode_function: counterpoint

observable_seed: "Kieran requested additional simulator time immediately after a difficult flight evaluation."
hidden_driver: null
story_question: "Is he improving his performance, or responding poorly to perceived failure?"

status: latent
scope_limit: 4
shelf_life: campaign
expiry_condition: "Kieran's risk-culture concern is resolved or superseded by later command development state."

scores:
  causal_grounding: 3
  unresolved_charge: 2
  character_meaning: 3
  player_agency: 3
  trek_function: 3
  bounded_payoff: 3
  future_echo: 2

penalties:
  contrivance_required: 0
  main_plot_collision: 1
  recent_repetition: 0
  exposition_or_sensitivity_burden: 0
  privacy_overreach: 0

net_threadworthiness: 18
player_interest: 1

bearing_potential:
  eligible: true
  inspiration_affordance: 2
  resolve_affordance: 3
  basis:
    - mentorship
    - performance standards
    - fitness-for-duty boundary

supporting_evidence:
  - scene_id: prelude.combined-load-test.03
    summary: "Kieran requested additional simulator time after criticism."
    visibility: directorOnly

next_natural_trigger:
  "Kieran requests unsafe simulator parameters during the next transit period."

closure_conditions:
  - "Kieran changes or consciously reaffirms his response to failure."
  - "The player establishes a clear command position regarding his conduct."

resolution:
  status: null
  consequences: []
  command_mark: null

rawValuesHidden: true
```

Quiet recurring detail:

```yaml
id: thread.bronn.table
origin_scene_id: open-orders.transit.01
participants:
  - hadrik-bronn

type: hobby_ritual_or_domestic_life
shape: recurring_detail
episode_function: relief

observable_seed: "Bronn keeps an old tactical table set in the security office."
story_question: "What does ordinary strategic play reveal about how Bronn mentors younger officers?"

status: latent
net_threadworthiness: 11

bearing_potential:
  eligible: false

next_natural_trigger:
  "A junior officer asks whether the player wants to join a short off-duty match."

rawValuesHidden: true
```

## Package Authorship Model

Packages may provide thread templates, seed families, and guardrails. They must not own live thread state.

Package-authored thread material may include:

- Stable template id.
- Intended participants or eligible participant roles.
- Shape and type hints.
- Episode function hints.
- Relevant retrieval card ids.
- Reveal gates.
- Prohibited contradictions.
- Natural trigger examples.
- Closure condition examples.
- Open Orders promotion rules.
- Sensitivity and privacy constraints.

Example package seed:

```yaml
id: bplot-kieran-command-preparation
title: "Kieran's Command Preparation"
shape: character_thread
type: crew_growth
eligible_participants:
  - kieran-vale
source_cards:
  - crew.kieran.development.risk-culture
  - crew.kieran.relationship.command-development
natural_triggers:
  - "Requests additional simulator time after a flight critique."
  - "Pushes for unsafe practice conditions during transit."
prohibited_moves:
  - "Do not imply Kieran is incompetent."
  - "Do not reveal private fear without earned trust or observable setup."
promotion:
  open_orders_eligible: false
  bearing_potential: possible
```

Because Directive is pre-alpha, existing `missionTemplates.bPlots` entries can be revised in place into this richer structure when implementation begins. There is no need to preserve legacy compatibility for early skeletons if package data, docs, schemas, and tests are updated together.

## Model-Call Architecture

The first implementation should be deterministic. Provider assistance should be added only where interpretation is useful and validation can reject unsupported output.

### A. Scene Delta Extractor

Mostly deterministic. It reads committed outcome packets, state deltas, pressure records, relationship memories, Command Log data, active phase, and scene metadata.

Output:

- What changed.
- Who was affected.
- What remains unresolved.
- What the player showed interest in.
- New promises, requests, tensions, rituals, or off-duty details.
- Visibility and hidden-truth constraints.

### B. Opportunity Scout

High-precision structured call. It should examine a scene delta and return zero, one, or two candidates.

Prompt rule:

```text
Identify only story potential already supported by the supplied scene and state. Do not create a quest, invent hidden history, assume private feelings, expose hidden truth, or turn ordinary texture into crisis. Returning no candidates is preferable to returning a weak candidate.
```

Required candidate fields:

- Candidate summary.
- Supporting evidence.
- Unresolved question.
- Proposed shape.
- Proposed type.
- Player agency.
- Privacy/reveal risk.
- Possible natural trigger.
- Why no Command Bearing is required, or why Bearing potential may exist.

The scout does not write state directly. Its output must pass deterministic gates and normalization.

### C. Thread Curator

Runs only when:

- A candidate enters the watchlist.
- A downtime window opens.
- An active thread resolves.
- The player seeks off-duty activity.
- The Director needs to choose between several viable threads.
- Open Orders review needs a thread-aware candidate list.

Inputs:

- Candidate scores.
- Current B-story bandwidth.
- Active mission phase.
- Recent thread types.
- Crew spotlight distribution.
- Main campaign themes.
- Player interest.
- Active, dormant, and recently resolved threads.
- Pressure records.
- Open Orders eligibility.

The curator may choose no thread.

### D. Mini-Story Planner

Runs only after engagement. It creates a bounded frame:

```yaml
story_question:
participants:
npc_goals:
known_facts:
hidden_facts_allowed_to_director:
current_pressure:
possible_escalations:
closure_conditions:
maximum_scope:
prohibited_contradictions:
privacy_constraints:
```

It must not write a required scene sequence or required solution.

### E. Closure And Bearing Evaluator

Runs at closure. It determines:

- Resolved, transformed, dormant, expired, or echo.
- Relationship and memory effects.
- Crew development effects.
- Material rewards, favors, or later support.
- Whether a Command Mark was earned.
- Inspiration, Resolve, both in exceptional cases, or neither.
- Concise rationale.

The evaluator must use committed player actions, not model narration alone.

## Module Plan

Add a new source domain:

```text
src/threads/
  thread-ledger.mjs
  scene-thread-extractor.mjs
  thread-prefilter.mjs
  thread-scout-contracts.mjs
  thread-curator.mjs
  thread-activation.mjs
  thread-closure.mjs
  thread-package-seeds.mjs
  README.md
```

### `thread-ledger.mjs`

Owns:

- `THREAD_STATUSES`
- `THREAD_SHAPES`
- `THREAD_TYPES`
- `THREAD_EPISODE_FUNCTIONS`
- `normalizeThreadRecord`
- `createThreadLedger`
- `applyThreadLedgerDelta`
- `mergeThreadEvidence`
- `threadPlayerSummaries`

### `scene-thread-extractor.mjs`

Builds scene deltas from committed state.

It should not call providers. It should not inspect raw uncommitted narration as source of truth.

### `thread-prefilter.mjs`

Runs cheap deterministic signal checks and decides whether a scout pass is warranted.

### `thread-scout-contracts.mjs`

Defines structured input/output contracts for future provider-assisted scouting. This keeps prompt output shape isolated from ledger state.

### `thread-curator.mjs`

Scores, ranks, and selects threads for activation or Open Orders review.

### `thread-activation.mjs`

Builds one natural trigger/beat and state delta for `available -> engaged` or `available -> dormant`.

### `thread-closure.mjs`

Builds closure review, relationship memory hints, development hints, Command Log hints, pressure deltas, and Command Bearing evaluation input.

### `thread-package-seeds.mjs`

Reads package thread templates and existing crew cards to create initial seeds. This should replace the current narrow B-plot helper once the new ledger is proven.

## Integration Points

### Campaign Projection

Add `threadLedger` to initialized campaign state:

```yaml
threadLedger:
  records: []
  activationReviews: []
  closureReviews: []
  rawValuesHidden: true
```

Campaign saves pin package id/version. Live thread records must remain campaign-owned.

### Transaction State

`commitDirectorTurn` should eventually apply `stateDelta.threadLedger` in the same transaction path as mission, pressure, relationship, Command Log, and Command Bearing changes.

Swipe regeneration must not reroll thread detection once an outcome is committed. Prose regeneration can change narration, not authoritative thread state.

### Mission Director Runtime

After a committed scene or phase boundary:

```text
commit outcome
-> build scene delta
-> run deterministic prefilter
-> upsert or reinforce eligible threads
-> update thread availability if pacing allows
-> provide Mission Director with at most one surfaced thread beat
```

During a normal active mission turn, the Director should still prioritize the A-story. A thread beat can surface only within the focus budget.

### Pressure Ledger

Thread records may link to pressure ids. Pressure records may link to thread ids once the pressure becomes human or story-relevant.

Large side work should be selected from both:

- active pressures that match authored side templates,
- available threads whose shape is `side_assignment` or whose thread-to-pressure links support Open Orders.

The existing Open Orders candidate selection can be extended rather than discarded immediately.

### Open Orders

Open Orders should become the formal path for substantive optional assignments. The Thread Engine should feed it when a thread has enough scope and operational consequence.

Example:

```text
thread.priya.favors-ledger
-> reinforced by multiple informal coordination obligations
-> linked to pressure.crew.priya-coordination-network
-> promoted to Open Orders candidate Quiet Channels
```

Vignettes and recurring details should not be promoted unless they gain real scope.

### Crew Development

Thread closure can produce development moment candidates. It should not award development merely because a conversation occurred.

Closure data should answer:

- What changed?
- Which officer was affected?
- Did the player engage the officer's actual concern?
- Was there cost, risk, vulnerability, accountability, or obligation?
- Was the same kind of development already awarded?

### Relationships

Thread beats can append relationship memory, but not raw relationship values. Memory should remain descriptive and hidden unless surfaced through safe UI text.

### Command Bearing

Thread closure can call or feed the Command Bearing evaluator only after meaningful closure. Bearing potential in thread records is advisory and hidden.

### Retrieval

Thread records should become a retrieval source for Director audiences:

- Mission Director can see active and available thread logic when relevant.
- Crew Director can see thread state, reveal gates, and private follow-up triggers.
- Narrator receives only player-safe summaries for engaged or active threads.
- Command Log receives committed outcomes and unresolved player-facing hooks.

Thread state should map naturally to the existing `relationship_pressure` and `unresolved_hooks` lanes.

### UI

Add UI only after the ledger and activation model are stable.

Initial UI:

- No latent/watchlisted display.
- Engaged/active summaries in Mission, Crew, or Log.
- Optional `Open Threads` section.
- No reward previews.
- No meters.
- No checklist objectives.

### Storage

Thread state is part of campaign save payloads. It must be persisted, restored, branched, rerun, and deleted with the rest of campaign state.

Save/load tests should prove:

- Latent records persist but remain hidden.
- Engaged records restore player-facing summaries.
- Closure reviews survive branch recovery.
- Thread state does not mutate package templates.

## Development Plan

### Stage 1: Design And Docs

Deliverables:

- This document.
- Documentation index entry.
- Future schema notes in package or campaign docs when implementation begins.

Acceptance:

- The model clearly separates threads, pressure, Open Orders, Crew Development, and Command Bearing.
- The doc states the hidden UI and post-hoc Bearing rules.
- The doc defines the first vertical slice.

### Stage 2: Ledger And Tests

Deliverables:

- `src/threads/thread-ledger.mjs`
- `src/threads/README.md`
- `tools/scripts/test-thread-ledger.mjs`

Acceptance:

- Normalizes valid records.
- Rejects records without id, status, shape, type, source, or story question.
- Merges supporting evidence by id/source without duplication.
- Applies transitions and closure reviews.
- Preserves `rawValuesHidden: true`.
- Does not mutate inputs.

### Stage 3: Campaign State Integration

Deliverables:

- Add `threadLedger` to campaign projection initial state.
- Add `threadLedger` delta support to transaction state.
- Add save/load branch coverage.

Acceptance:

- Campaign start initializes an empty thread ledger.
- Committed thread deltas survive save/load.
- Swipe narration retry does not change committed thread state.
- Package templates remain immutable.

### Stage 4: Package Seeds And B-Plot Migration

Deliverables:

- Add package thread seed structure.
- Convert existing `missionTemplates.bPlots` skeletons into thread seed records or richer templates.
- Replace `createCrewBPlotHooks` with thread seed helpers.

Acceptance:

- Kieran, Priya, Bronn, Rowan, Miriam, Imani, Whitaker, and junior-officer seeds can be derived from package data.
- Existing crew relationship/development cards remain the source of character constraints.
- Old B-plot helper tests are replaced by thread seed tests.

### Stage 5: Scene Delta And Prefilter

Deliverables:

- `scene-thread-extractor.mjs`
- `thread-prefilter.mjs`
- `tools/scripts/test-thread-scene-prefilter.mjs`

Acceptance:

- Scene deltas cite committed turn/state ids.
- Prefilter returns no scan for ordinary uneventful turns.
- Prefilter catches promises, relationship changes, crew strain, noncritical ship problems, repeated details, and player interest.
- Hidden facts remain hidden from scout/narrator-safe outputs.

### Stage 6: Deterministic Scout And Curator

Deliverables:

- `thread-curator.mjs`
- Deterministic candidate builder for the first vertical slice.
- `tools/scripts/test-thread-curator.mjs`

Acceptance:

- Supports threadworthiness scoring and penalties.
- Separates Bearing potential from threadworthiness.
- Caps latent/watchlisted records.
- Applies B-story bandwidth.
- Tracks recent spotlight distribution.
- May choose no thread.

### Stage 7: Activation

Deliverables:

- `thread-activation.mjs`
- Runtime hook for one natural available beat.
- `tools/scripts/test-thread-activation.mjs`

Acceptance:

- Surfaces one beat, not a quest outline.
- Engagement requires meaningful player response.
- Decline/delay/delegation are valid.
- Dormancy does not apply automatic relationship penalties.
- No latent/watchlisted UI leakage.

### Stage 8: Closure, Crew Development, And Bearing Handoff

Deliverables:

- `thread-closure.mjs`
- Closure reviews.
- Command Bearing evaluation input.
- Relationship/development hint output.
- `tools/scripts/test-thread-closure-bearing.mjs`

Acceptance:

- Closure can resolve, transform, dorm, expire, or create echo.
- Command Bearing is evaluated only after closure.
- Quiet threads can close with no Bearing and still leave memory.
- Development moments require meaningful stakes and change.
- Command Log receives only player-safe summaries.

### Stage 9: Open Threads UI

Deliverables:

- Minimal player-facing summaries for engaged/active threads.
- Optional `Open Threads` section in Mission, Crew, or Log.
- Visual/browser smoke only after runtime UI changes.

Acceptance:

- No objectives, rewards, solutions, meters, or hidden values.
- Text fits existing UI patterns.
- The player can understand an engaged thread without seeing internal scoring.

### Stage 10: Provider-Assisted Opportunity Scout

Deliverables:

- Structured scout prompt.
- Deterministic validator.
- Failure and no-candidate behavior.

Acceptance:

- Provider output cannot create thread state without cited evidence.
- Unsupported candidates are rejected.
- Returning no candidates is normal.
- Hidden truth and private facts do not leak into player-facing packets.

## First Vertical Slice

The first implementation should prove two contrasting thread types.

### Kieran Command Preparation

Purpose:

- Proves character thread incubation, reinforcement, activation, closure, and possible Command Bearing handoff.

Seed:

```yaml
id: thread.kieran.command-preparation
shape: character_thread
type: crew_growth
episode_function: counterpoint
participants: [kieran-vale]
story_question: "Is Kieran responding to criticism as training, or as personal failure?"
```

Possible evidence:

- Kieran requests extra simulator time after a difficult flight review.
- Kieran asks for unsafe simulator conditions.
- Miriam flags fatigue.
- Bronn questions risk tolerance.
- The player asks why the evaluation affected him.

Possible activation:

```text
During quiet transit, Kieran requests approval to repeat an unsafe flight scenario with reduced safety margins.
```

Possible player approaches:

- Ask why he believes the prior performance was unacceptable.
- Join him in the simulator.
- Require supervised retraining.
- Ground him temporarily.
- Ask Bronn or Miriam for assessment.
- Approve the work with restrictions.
- Reject the request.
- Find another approach.

Closure:

- Kieran changes or consciously reaffirms his response to failure.
- The player establishes a command position about risk, training, and fitness for duty.
- Bearing potential may exist, but award is post-hoc.

### Bronn's Table

Purpose:

- Proves quiet recurring detail support with no Bearing pressure.
- Protects Data-and-his-cat style material from quest inflation.

Seed:

```yaml
id: thread.bronn.table
shape: recurring_detail
type: hobby_ritual_or_domestic_life
episode_function: relief
participants: [hadrik-bronn]
story_question: "What does ordinary strategic play reveal about how Bronn mentors younger officers?"
bearing_potential:
  eligible: false
```

Possible activation:

```text
A junior officer asks whether the player wants to join a short off-duty match at Bronn's table.
```

Closure:

- The player participates, declines, delegates, or simply observes.
- Bronn may become more human and shipboard life may feel richer.
- No Command Mark is expected.

## Validation And Test Plan

Add scripts:

- `tools/scripts/test-thread-ledger.mjs`
- `tools/scripts/test-thread-seeds.mjs`
- `tools/scripts/test-thread-scene-prefilter.mjs`
- `tools/scripts/test-thread-curator.mjs`
- `tools/scripts/test-thread-activation.mjs`
- `tools/scripts/test-thread-closure-bearing.mjs`
- `tools/scripts/test-thread-hidden-state-safety.mjs`
- `tools/scripts/test-thread-save-load.mjs`

Alpha gate integration should wait until the deterministic ledger and first vertical slice are stable.

Core invariants:

- No thread from unsupported events.
- No hidden truth leakage.
- No visible latent/watchlisted state.
- No Command Bearing preview.
- No duplicate thread spam.
- No automatic relationship punishment for declined optional threads.
- Save/load preserves thread state.
- Open Orders can consume large eligible threads without replacing quiet vignettes.
- Provider suggestions cannot mutate campaign state without deterministic validation.
- Package templates are not mutated during play.

## Migration Plan

Directive is pre-alpha. The implementation should update the system in place to the best current model rather than preserving obsolete APIs.

Migration order:

1. Add `threadLedger` without changing current Open Orders behavior.
2. Add thread seed helpers beside `crew-bplots.mjs`.
3. Prove Kieran and Bronn vertical slices.
4. Replace `crew-bplots.mjs` tests with thread seed tests.
5. Convert package `bPlots` skeletons to thread seed templates.
6. Extend Open Orders candidate selection to consult eligible side-assignment threads.
7. Remove or retire old B-plot terminology from code and docs.

Use user-facing language carefully:

- Internally: `thread`, `threadLedger`, `thread seed`, `thread activation`.
- Player-facing: `Open Threads` or `Ongoing Concerns`.
- Avoid: `quest`, `quest log`, `XP`, `relationship points`, `reward opportunity`.

## Risks

### Overgeneration

Risk: The system produces too many threads and makes play feel noisy.

Controls:

- Scan only at boundaries.
- Prefer no candidate.
- Cap latent/watchlisted records.
- Require hard gates.
- Use B-story bandwidth.

### Quest Inflation

Risk: Quiet details become formal assignments.

Controls:

- Keep shape explicit.
- Do not promote vignettes without real scope.
- Use Bearing potential separately from threadworthiness.

### Hidden-Truth Leakage

Risk: Model scouting exposes Director-only facts.

Controls:

- Use scene deltas with visibility metadata.
- Validate output against allowed source ids.
- Keep narrator-safe summaries separate.

### Reward Farming

Risk: Players learn to chase personal threads for Command Marks.

Controls:

- Hide Bearing potential.
- Evaluate marks only after closure.
- Reject trivial errands and repeated arguments.
- Let many strong threads award no marks.

### Relationship Punishment

Risk: Ignoring a thread damages relationships automatically.

Controls:

- Treat decline, delegation, delay, and boundaries as valid player actions.
- Dormancy is neutral by default.
- Relationship impact requires committed causal behavior.

### Scope Creep

Risk: The engine becomes a general plot planner before the ledger works.

Controls:

- Build ledger first.
- Prove two vertical slices.
- Delay provider scouting.
- Keep Open Orders promotion narrow.

## Open Questions

- Should `threadLedger` live beside `pressureLedger`, or should future continuity state group both under a wider `campaignContinuity` domain?
- Should Open Threads display live in the Mission panel, Crew panel, Command Log panel, or a small shared summary?
- How many latent records should the MVP retain: eight total, or eight plus package-authored recurring details?
- Should package thread templates live under `missionTemplates.bPlots`, `sideMissionRules.threadTemplates`, or a new top-level `narrativeThreads` field?
- Should thread closure write directly to relationship memory, or produce relationship/development hints consumed by a later Crew Director?
- How should model-assisted scouting be disabled in no-provider environments while preserving deterministic thread support?
- Should `story_pressure` be a ledger field, a Director pacing input, or derived from recent scene history?

## Summary

The Narrative Thread Engine should make Directive better at the stories that feel most like Star Trek: not only the crisis at the center of the episode, but the ordinary, human, funny, difficult, and revealing moments woven through it.

The MVP should be restrained. Start with a hidden `threadLedger`, deterministic scene-boundary detection, two vertical slices, no visible latent state, and post-hoc Command Bearing. Once that works, provider scouting and Open Orders promotion can expand the system without turning it into a quest factory.
