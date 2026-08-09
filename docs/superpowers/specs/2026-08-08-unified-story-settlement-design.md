# Unified Story Settlement and Episode Tracking Design

## Status

Approved architecture design for replacing Directive's independent semantic tracking writers with one campaign-native Story Settlement authority. The design includes the approved V1 aggregate-first projection policy, player-selected emergent Focus, and Command Bearing separation. This document defines the target architecture and staged migration. It does not authorize an immediate all-at-once cutover.

## Decision Summary

Directive will maintain one semantic account of what happened: a branch-bound story episode managed by Story Settlement.

Accepted turns contribute source evidence and typed effects to an active episode. Effects that must change current mechanics apply immediately. The episode's narrative understanding remains mutable while the semantic scene continues. When the scene ends, Story Settlement seals at most one durable episode or records that the scene produced no durable story memory.

Mission, quest, plot, relationship, character-memory, journal, and prompt-context systems become projections or consumers of the accepted episode and its effects. They may not independently create competing semantic history.

Directive prefers attaching accepted meaning to an existing campaign root or revising one current domain aggregate over creating a new record. Parentless emergent consequences remain inside their source episode unless the player manually selects one as the branch's single emergent Focus. Models cannot create player-facing trackers, and V1 does not automatically promote conversational material into dynamic quests.

Command Bearing remains a separate neutral gameplay reserve. Accepting, focusing, or completing inferred content does not award it. V1 recovery comes only from an authoritative campaign boundary with a stable identity, never from a model-generated tracker lifecycle.

The CORE transaction journal remains the durable operation and recovery substrate. It is infrastructure, not a second story tracker.

## Problem

Directive currently has several interdependent paths that can describe the same turn as separate history:

- the Mission Director story-delta planner can propose up to eight event drafts for one turn;
- reviewed story drafts append individually to `storyEventLedger`;
- turn commitment derives relationship memory for every affected or present crew member;
- mission, quest, thread, event, Command Log, and post-visible settlement paths can record overlapping consequences;
- low-value ship observations such as atmosphere, minor flickers, and repeated descriptions of the same refit concern can become separate `ship.technicalDebt` records;
- player-facing and prompt projections then consume several of those stores.

The result is structurally biased toward over-recording. Better classification prompts inside each domain would not solve the underlying problem because each domain would still decide independently what happened.

The desired behavior is different:

- ordinary conversation usually creates no durable entry;
- one continuous encounter usually creates zero or one story episode;
- one episode may carry several typed effects without becoming several semantic histories;
- domain state is revised as one current aggregate rather than used as a diary of every domain-related mention;
- relationship or character memory is recorded only when the episode has lasting meaning for that character;
- emergent gameplay remains available through episode consequences without automatically creating quests or modal offers;
- current mechanics remain timely even when the narrative episode has not yet closed.

## Goals

1. Establish Story Settlement as the sole semantic commit authority.
2. Accumulate conversation across turns before deciding what is worth remembering.
3. Apply validated mechanical effects without waiting for scene closure.
4. Produce zero or one durable story episode for an ordinary semantic scene.
5. Derive domain views from the same episode and effect set.
6. Preserve exact source custody, idempotency, branch isolation, rollback, and crash recovery.
7. Fail without corrupting mechanics or fabricating memory.
8. Pin borrowed behavior to inspected extension revisions and enforce it with conformance tests.
9. Migrate incrementally so old and new output can be compared before legacy writers are disabled.
10. Prefer attachment and aggregate revision over new tracker creation.
11. Let the player select at most one parentless emergent consequence as a branch-bound Focus without creating another semantic ledger.
12. Keep Command Bearing progression and recovery independent from inferred tracker acceptance or completion.

## Non-Goals

- Do not make Summaryception, VectFox, CharMemory, or another extension a runtime dependency.
- Do not copy extension code or prompt text.
- Do not add a vector database in the initial implementation.
- Do not ask one model to maintain an unrestricted knowledge graph every turn.
- Do not remove the CORE transaction journal or exact mechanical operation records.
- Do not rewrite legacy semantic history automatically.
- Do not make episode extraction block visible response delivery.
- Do not expose hidden relationship values or private character reasoning through story episodes.
- Do not show an automatic Accept/Deny popup for inferred commitments.
- Do not automatically convert conversational signals or latent threads into V1 dynamic quests.
- Do not award Command Bearing for accepting, focusing, or completing inferred work.
- Do not turn every current-state aggregate into an unrestricted list of observations.

## Borrowed-Behavior Provenance Policy

Borrowed behavior is a pinned contract, not informal inspiration. Each contract records its origin, observable behavior, preserved Directive behavior, intentional differences, and conformance fixtures.

| Reference | Pinned revision | Borrowed behavior | Directive contract |
|---|---|---|---|
| Summaryception 5.5.3, `Lodactio/Extension-Summaryception` | `c67626ab83ee86ec1be4f55b9b3d1d19adb79999` | Compare a new passage with prior memory and record only the new narrative delta | Episode evaluation receives current active understanding and recent sealed context; it must not restate already accepted history |
| VectFox 3.6.8, `KritBlade/VectFox` | `886a0144ff8608aabcef4fe1b408a13260c1a730` | Require lasting significance, delay extraction until source settles, and retain source-window provenance | Assistant prose is not durable evidence until its selected variant is settled; every contribution has source identifiers and hashes; no durable episode is required for insignificant material |
| CharMemory 2.3.1, `bal-spec/sillytavern-character-memory` | `37b21025e120acfbe1dcdeaa8becb05efe7188b4` | One memory per encounter, outcomes rather than play-by-play, long-term character relevance, and an explicit no-memory result | A sealed episode yields zero or one character moment per affected recurring character; same-scene material stays consolidated; `NO_EPISODE` and no character moment are valid outcomes |

Directive will implement these behaviors independently. Summaryception and VectFox have copyleft license considerations, while the inspected CharMemory package declares no license. The design therefore references observable behavior and tests rather than importing private implementation or copying prompts.

Upstream releases do not silently change the contract. A re-baseline requires an intentional review of the newer revision, an explanation of adopted differences, and updated conformance fixtures.

## Alternatives Considered

### Improve Existing Domain Trackers

Adding importance thresholds, deduplication, or stronger prompts to each existing tracker has the lowest initial cost. It does not remove competing semantic authorities, so domains can still disagree or create overlapping history. This approach is rejected as the target architecture, though temporary gates may reduce noise during migration.

### Fixed-Window Summarization

Summarizing every fixed number of messages is predictable and proven operationally by Summaryception. It does not identify semantic scenes, can divide long encounters, can combine unrelated material, and delays or distorts state changes. This approach is rejected as the episode boundary model. Bounded rolling checkpoints remain useful inside a long active episode but are not story entries.

### Mechanical Outcomes Only

Recording only accepted mechanical outcomes is robust and quiet. It loses promises, revelations, relationship turning points, and other story-important conversation that does not immediately mutate mechanics. This approach remains the fallback when semantic extraction is unavailable, but it is insufficient as Directive's complete memory model.

### Per-Turn Knowledge Graph Extraction

Extracting facts, relationships, quests, and events into a graph every turn offers maximum structure but recreates the present granularity problem at greater cost. It is difficult to validate, highly sensitive to model behavior, and unnecessary for the current goal. This approach is rejected.

### Unified Active Episode With Typed Effects

This is the selected approach. It provides one semantic authority while allowing exact mechanical effects to apply promptly. Its principal risk is scene-boundary and significance quality, which the design contains through bounded decisions, deterministic custody, repairable history, and staged validation.

## Core Architecture

```text
accepted source and outcome
          |
          v
Story Settlement Coordinator
          |
          +--> append source contribution to active episode
          |
          +--> validate and apply immediate typed effects
          |
          +--> evaluate boundary and significance
                    |
                    +--> continue active episode
                    +--> discard insignificant scene
                    +--> seal one durable episode
                                  |
                                  v
                  deterministic domain projections
   authored quest | plot | relationship | character | ship | journal | prompt
                                  |
                                  +--> optional player-selected Focus reference
```

There is exactly one foreground active episode per save branch. Background or off-screen results use the same Story Settlement authority and contract. They may create a branch-bound background episode only at a validated world, quest, or time boundary; otherwise they contribute typed effects without manufacturing a narrative entry.

No domain projector may append semantic history directly. Multiple model roles may propose evidence or interpretations, but Story Settlement is the only component allowed to accept them into episode custody.

## Authority Boundaries

### Models Own Bounded Story Judgment

Models may propose:

- whether the current semantic scene continues or ends;
- whether the accumulated scene has lasting narrative significance;
- a concise episode capsule grounded in accepted evidence;
- character-specific interpretations and long-term moments;
- typed effects within the role's existing allowed scope.

### Code Owns Custody

Deterministic code owns:

- campaign, save, branch, message, swipe, outcome, and source-range identity;
- schema and contract versions;
- known identifiers and allowed transitions;
- evidence membership and hash equality;
- idempotency keys and episode revisions;
- allowed state roots;
- stale-source rejection;
- append, seal, invalidate, supersede, and recovery ordering;
- projection materialization;
- player-owned Focus creation, replacement, clearing, and validation;
- authoritative Command Bearing boundary identity and idempotent recovery.

Code rejects structurally or evidentially invalid output. It does not invent semantic meaning to repair a failed model proposal.

### Domain Systems Own Projections

Mission, authored quest, plot, relationship, character, ship, Command Log, journal, attention, and prompt systems consume accepted episode effects or annotations. Their stored output is a rebuildable projection. They cannot originate a separate event describing the same source.

## Data Model

Story Settlement introduces a versioned campaign-owned ledger with three kinds of durable data.

### Active Episode

An active episode is mutable but revisioned and persisted. Required fields include:

```js
{
  kind: 'directive.storyEpisode.v1',
  id: 'episode.<branch>.<sequence>',
  branchId: 'save-id',
  scopeKind: 'foregroundScene',
  status: 'open',
  revision: 4,
  openedAt: 'timestamp',
  sourceContributions: [],
  effectRefs: [],
  workingCapsule: {},
  boundaryState: {},
  extractionContractVersion: 'directive.storySettlementExtraction.v1'
}
```

`scopeKind` is either `foregroundScene` or `backgroundBoundary`. An active record's status is `open`, `sealPending`, or `recoveryRequired`; sealed and invalidated records live in the immutable episode collection rather than the active-episode slot.

Each source contribution records the host message ID, role, selected-swipe index and text hash where applicable, source-range hash, outcome or response identity, source integrity, and accepted-at revision. Full chat text is not duplicated indefinitely; bounded sanitized evidence excerpts may be retained where recovery cannot rely on the host transcript alone.

### Sealed Episode

A sealed episode is immutable. It adds:

- sealed source range and source hash;
- concise narrative summary;
- lasting changes;
- unresolved consequences with stable episode-local identifiers;
- participant, location, mission, quest, and time references;
- accepted typed effect references;
- zero or more character-moment annotations, capped at one per affected recurring character;
- significance criteria satisfied;
- model/provider diagnostics and contract version;
- superseded episode IDs when it replaces stale history.

Sealed episodes contain meaning, not play-by-play. They do not expose hidden numeric relationship state or unsupported private thoughts.

### Emergent Focus Reference

V1 stores at most one player-selected emergent Focus per save branch. It is attention state, not semantic history:

```js
{
  kind: 'directive.emergentFocus.v1',
  branchId: 'save-id',
  episodeId: 'episode.save-id.17',
  consequenceId: 'consequence.episode.save-id.17.1',
  selectedAtRevision: 42
}
```

The reference contains no duplicated summary, objectives, reward, progress, or quest lifecycle. It is valid only while the referenced episode is current and the consequence remains unresolved. Only an explicit player UI action may create or replace it. Models and background workers may not set Focus.

### Settlement Receipt

When a scene closes without durable significance, Story Settlement removes the active episode and records a compact processing receipt outside the semantic ledger. The receipt prevents duplicate work and supports diagnostics without creating a story entry.

## Typed Effects

Typed effects are exact state transitions attached to an episode. Examples include mission or authored-quest status changes, fact reveals, accepted obligations, unresolved-consequence transitions, ship consequences, and material relationship evidence.

An episode may contain several effects while remaining one semantic story entry. Internal operation count is not player-facing event count.

Effects that current play depends on apply immediately after validation. This includes accepted mission outcomes, quest transitions, ship consequences, and exceptional relationship changes that meet their existing authority rules. Their application does not seal the episode.

Character memory and narrative relationship interpretation normally wait for episode sealing so the whole encounter can be evaluated together. A relationship mechanic may change immediately when an accepted outcome explicitly requires it, but the system does not create a per-turn prose memory.

## Aggregate-First Projection Policy

Every accepted meaning follows this order:

1. Attach it to an authoritative campaign plot, mission, quest, milestone, character, ship, location, or world root when one already owns the development.
2. Revise that root's current aggregate when play needs a current-state change.
3. Retain a significant parentless future concern as one unresolved consequence inside the sealed episode.
4. Create a new independent gameplay object only under a later, separately approved contract. V1 conversation settlement has no such authority.

The same evidence may support several typed effects, but it does not become several player-facing trackers. Domain projectors cannot transform wording differences into new semantic identities. Stable campaign and episode identifiers own identity; model-written labels do not.

### Ship Operational Status

The ship is one current operational-status aggregate, not a list of every ship-related observation. Its player-facing projection may contain structured readiness, a concise condition summary, actual capability impairments, explicit operating restrictions, confirmed damage, and a current readiness objective. Atmosphere, speculative concerns, and isolated observations remain story evidence unless they cause a material current-state effect.

For example, new-plating smell is atmosphere; a corridor light cycling within tolerance is evidence at most; and repeated descriptions that upgraded systems have not been stressed together revise one post-refit validation condition. A confirmed command-network limitation may become a structured restriction inside the same ship aggregate. It does not require a peer `technicalDebt` card.

The V1 projection therefore retires `ship.technicalDebt` as a semantic dumping ground. Legacy values remain recoverable through save history and migration compatibility, but new Story Settlement output cannot append to that list.

### Other Domain Aggregates

The same rule applies elsewhere:

- a relationship is one current posture plus episode-derived meaningful moments, not a memory row for every exchange;
- an authored quest or mission is one current gameplay aggregate, not separate events for each conversational mention;
- a campaign plot point absorbs grounded developments that belong to it instead of spawning parallel threads;
- character state records lasting current truth while character-specific episode annotations retain why it changed;
- journal and Command Log surfaces render episodes and accepted effects rather than authoring new history.

## Source Acceptance and Settle Lag

Directive-owned mechanical outcomes are authoritative when their normal transaction commits. They attach to the active episode immediately.

Assistant prose is different. Its selected variant remains swipeable and may introduce host-native visible claims. Following the pinned VectFox settle-lag behavior, assistant prose becomes durable episode evidence only when a later player reply accepts or proceeds from that selected response through Story Settlement's accepted-pair source settlement. The legacy Scene Handshake behavior is subsumed by this custody step and retains no separate semantic writer or player-facing reconciliation authority. A rejection, correction, or swipe change prevents the superseded prose from entering episode custody.

Player statements are evidence of intent and speech, not automatically evidence that an attempted action succeeded. Outcome effects come from the adjudication and settlement authorities, not from parsing player prose as accomplished fact.

## Episode Boundary Policy

Story Settlement combines deterministic hard boundaries with bounded model judgment.

Hard boundary evidence includes:

- save or branch change;
- explicit narrative time jump;
- validated location transition that constitutes a scene cut;
- mission, quest, phase, or world-boundary settlement that clearly ends the current foreground situation;
- explicit scene or chapter closure from campaign authority;
- source invalidation that makes the active episode unrecoverable in place.

Soft boundary evidence includes:

- resolution or abandonment of the foreground question;
- departure from the current encounter;
- a material objective change accompanied by a change in narrative situation;
- a sustained cast and context replacement rather than a single character entering or leaving.

A topic change, speaker change, individual action, emotional beat, or room movement is not sufficient by itself.

Long scenes do not force semantic sealing merely because they exceed a message count. They create bounded rolling checkpoints grounded in typed effects and recent source. The system performs a boundary review at configured safety limits, but it seals only when boundary evidence exists. This intentionally differs from fixed-window extraction.

## Significance Policy

Zero durable episodes is the default-valid result. A scene qualifies only when accepted evidence shows at least one lasting change:

- world, ship, mission, quest, or material character state changed;
- a consequential fact was learned, invalidated, or revealed;
- a commitment, obligation, promise, or unresolved consequence was created or resolved;
- a relationship meaningfully changed through trust, betrayal, confession, boundary, sacrifice, or comparable consequence;
- a decision constrains future action;
- a lasting cost, consequence, gain, or loss occurred.

Routine acknowledgement, movement, repeated discussion, tactical play-by-play, atmosphere, filler, temporary emotion, and tentative ideas do not qualify alone.

The evaluator must cite which significance criteria are satisfied and the supporting source contributions. An ungrounded importance score cannot authorize persistence.

## Emergent Gameplay and Player Focus

High-value emergent gameplay is captured without automatically becoming a tracker.

- Irreversible or current-state changes apply to the owning aggregate whether or not the player focuses them.
- A development tied to campaign data attaches to that authored root.
- A significant parentless promise, opportunity, mystery, or obligation remains an unresolved consequence in its sealed episode.
- The player may manually select one unresolved consequence as the branch's emergent Focus.
- Focusing changes attention and prompt priority only. It does not create a quest, objectives, rewards, or a second history.
- Leaving a consequence unfocused does not deny, erase, or retcon it. The episode remains canon, and ordinary relevance selection may still retrieve it.

The Campaign view exposes a `Focus` action inside eligible consolidated story entries. The Mission view may display the one active Focus as a secondary concern, but it cannot create another record from it. V1 adds no separate Story route, blocking popup, automatic offer queue, or Accept/Deny lifecycle. The active Focus may be cleared or replaced by the player. Resolution, invalidation, or supersession of the referenced consequence clears or redirects the pointer deterministically.

## Command Bearing V1 Boundary

Command Bearing stays as a neutral gameplay reserve and is not an emergent-content incentive system.

- V1 collapses Inspiration and Resolve into one neutral Command Bearing reserve.
- Accepting a campaign quest, selecting Focus, or completing an inferred obligation never awards Command Bearing by itself.
- Story Settlement does not maintain Command Bearing Marks, ranks, style tracks, or per-turn evidence rows.
- Character and command style remain visible through episode meaning, relationship consequences, and the player's choices, not a separate prose-derived style ledger.
- Recovery is authorized only by a stable campaign boundary emitted by campaign data or a deterministic campaign reducer, such as an authored mission, chapter, or major milestone closure.
- Recovery is idempotent by boundary ID and restores a spent point only up to the configured V1 reserve capacity.
- This specification does not redefine the separate outcome-improvement effect of spending Command Bearing; it constrains semantic tracking and recovery authority.

This boundary prevents generated assignments from becoming a farmable progression loop while preserving Command Bearing as a meaningful, scarce intervention.

## Character Moments and Relationships

After sealing, Story Settlement may propose one character moment for each affected recurring character. Presence alone does not make a character affected.

A character moment must answer the pinned CharMemory question: would this character plausibly remember or bring up the encounter weeks or months later? It summarizes the outcome and the character's supported interpretation, not each exchange.

Relationship posture and memory projections consume these accepted annotations and typed effects. The old behavior of appending a generic memory for every present crew member on every turn is removed at cutover.

Private interpretations remain behind audience gates. Player-facing summaries expose only earned, observable posture and visible memory.

## Projection Model

The sealed episode ledger is the sole semantic history. Materialized domain state remains necessary for efficient gameplay, but it is a view:

- authored-quest and mission projections apply typed status effects;
- plot projections absorb accepted transitions that belong to existing campaign roots;
- parentless unresolved consequences remain episode-owned rather than becoming thread records;
- relationship projections apply material effects and accepted character interpretations;
- ship, character, location, and world projections revise one current aggregate per domain entity;
- character-memory views select that character's episode annotations;
- Command Log and journal views render the same episode at their required level of detail;
- prompt context selects sealed episodes, current projections, and the optional valid Focus relevant to the active scene.

Projection records retain their source episode and effect IDs. A projection without a valid source episode or accepted mechanical authority is stale and excluded.

The first implementation uses deterministic relevance from the active authored quest, optional Focus, participants, location, recency, campaign-root references, and unresolved consequences. Vector retrieval is deferred until real episode volume demonstrates that deterministic selection is insufficient.

## Idempotency and Concurrency

Each contribution and effect receives an idempotency key derived from campaign, save branch, source identity, selected variant hash, outcome identity, and extraction contract version.

An async proposal records the episode revision and complete source-range hash it evaluated. Before apply, Story Settlement compares both with current state. A mismatch rejects the proposal as stale; it is never merged heuristically into newer state.

Only the coordinator may advance an episode revision or seal it. Domain projectors operate from an accepted immutable input and cannot race to create semantic entries.

## Invalidation, Rollback, and Supersession

An edit, deletion, selected-swipe change, source replacement, or branch correction invalidates every contribution that depends on the changed source.

For an active episode, Story Settlement removes invalid contributions, restores the last valid revision, and reevaluates the remaining range.

For a sealed episode:

1. mark the episode stale and exclude it from prompts and projections;
2. clear any Focus that references the stale episode before prompt composition;
3. invoke existing CORE recovery for any invalid mechanical effects;
4. rebuild from the remaining valid evidence when possible;
5. seal a replacement that explicitly supersedes the stale episode;
6. redirect Focus only when the replacement proves the same unresolved consequence identity; otherwise leave it clear;
7. leave the stale record available for audit but never current authority.

If rollback or reconstruction cannot be proved safe, the episode becomes `recoveryRequired`. Directive continues from known-valid mechanics, excludes questionable semantic memory, and surfaces diagnostics rather than silently guessing.

## Branching and Save As

A branch inherits sealed episode authority only through its common ancestor. It receives a new branch-owned active episode after the fork. Post-fork contributions, effects, summaries, character moments, and Focus selections cannot appear in another branch.

Save As records an explicit episode cutover/fork reference rather than relying on a shared SillyTavern character or shared extension storage. This avoids the cross-branch contamination observed in character-card-oriented memory extensions.

## Failure Handling

### Provider Timeout or Invalid JSON

No semantic change applies. Immediate effects that were independently committed by existing mechanical authority remain valid. The active episode stays open or becomes `sealPending`, and the bounded job may retry later. No tracker, Focus, or Command Bearing recovery is inferred from the failed call.

### Hallucinated Identifier or Unsupported Transition

Deterministic validation rejects the proposal. The model does not receive authority to invent a replacement identifier. Diagnostics record the rejected field and evidence range.

### Stale Async Result

The result is discarded through revision and source-hash comparison. A newer evaluation may be scheduled.

### Oversized Active Scene

Story Settlement creates or refreshes a rolling checkpoint, retains exact effect anchors and recent source, and performs a boundary review. It does not manufacture a story entry solely to reduce tokens.

### Missing Source After Host Mutation

The episode becomes stale or `recoveryRequired`. It is excluded from current context. Hashes or prior summaries alone cannot re-authorize unsupported facts.

### Projection Failure

The episode remains valid. The failed projection records its source and retries idempotently. Other projections may proceed because one view failure must not corrupt semantic custody.

## Observability

Diagnostics must make over-recording and under-recording inspectable. For each evaluated range, record:

- source range and episode revision;
- boundary decision and supporting evidence;
- significance decision and criteria;
- continue, seal, or no-episode disposition;
- accepted and rejected effects;
- character-moment decisions;
- provider, latency, retry, stale-result, and validation information;
- referenced pinned behavior-contract version.

Diagnostics are operator-facing and do not become story prompt content. The product UI should show consolidated episodes and derived current state, not internal effect or operation volume.

## Migration Strategy

### Phase 0: Characterization

Create transcript fixtures for current failure modes: long ordinary conversation, one meaningful decision surrounded by chatter, relationship conversation without a relationship change, a quiet consequential character moment, multiple state effects in one scene, several ship observations describing one operational condition, a parentless emergent promise, swipe replacement, deletion, branching, provider failure, and restart.

Record current story-event, relationship-memory, quest, journal, and prompt output so improvement is measurable.

### Phase 1: Shadow Evaluation

Add Story Settlement contracts and run boundary/significance evaluation without semantic write authority. Compare proposed episodes with existing trackers. No existing mechanics or UI changes in this phase.

### Phase 2: Episode Custody

Persist active and sealed episodes, settlement receipts, provenance, and diagnostics. Existing domain writers remain authoritative while parity and recovery behavior are proven. Episode output is visible only in diagnostics.

### Phase 3: Projection Cutover

Move prompt story context, story history, relationship memory, ship status, and attention selection to episode-derived projections. Existing authored mission and quest mechanical application continues but attaches its effects to the active episode. Add the branch-bound Focus reference and compatibility adapters for consumers that still expect legacy shapes.

### Phase 4: Writer Removal

Disable direct per-turn story-event drafting, generic per-present-crew relationship-memory appends, per-observation ship technical-debt writes, conversation-to-thread-to-dynamic-quest promotion, and legacy Scene Handshake or Scene Reconciliation semantic writes. Route remaining semantic writers through Story Settlement. Disable Command Bearing evidence mining and closure-award authority in favor of deterministic boundary recovery. Retain passive host-mutation detection and exact CORE recovery without protected-editing or reconciliation UI. Remove compatibility adapters after every consumer uses episode-derived projections.

### Phase 5: Background Convergence

Route background authored-quest, world, pressure, and unresolved-consequence boundary summaries through the same coordinator. They retain their mechanical reducers but cannot create a second semantic ledger or automatic dynamic quest.

## Legacy Save Policy

Existing `storyEventLedger`, relationship memory, `ship.technicalDebt`, thread records, dynamic quests, Command Bearing evidence/review records, and related history remain preserved and read-only before a recorded cutover revision. Directive does not attempt to infer semantic scenes retroactively from noisy legacy rows.

At cutover, Directive creates a deterministic baseline from materialized current state and records the legacy source revision. New semantic history begins with episodes. Prompt and UI selectors avoid rendering the legacy baseline and new episodes as duplicate events.

Already accepted or active legacy dynamic quests remain playable until terminal resolution. Latent, observed, watchlisted, or merely available inferred threads and quests are hidden and read-only; they do not receive new reinforcement or promotion. Authored campaign quests remain fully supported.

The current ship baseline is built deterministically from the legacy top-level condition, confirmed damage, explicit restrictions, and campaign-owned readiness fields. Legacy `technicalDebt` rows remain archived and diagnostic-only; migration does not ask a model to reinterpret them or copy them into the new projection. A material issue already represented by structured damage, restriction, or campaign readiness data remains current truth. Atmosphere, speculation, and semantic duplicates from the legacy list are excluded from player-facing and prompt projections.

Legacy Command Bearing migration sums currently spendable Inspiration and Resolve points, clamps the result to the configured neutral V1 reserve capacity, and preserves any still-valid readied outcome attachment. Existing spend identities remain available for idempotency. Marks, ranks, earned-record prose, evidence, and review ledgers remain archived and cannot authorize a new V1 award. Migration itself never recovers a point.

Rollback across the cutover boundary restores the appropriate legacy or episode projection mode using the saved revision marker.

## Testing Strategy

### Contract Tests

- valid and invalid episode schemas;
- source, selected-swipe, branch, and revision mismatch rejection;
- known identifier and allowed transition enforcement;
- idempotent contribution, effect, seal, and projection replay;
- immutable sealed episodes and explicit supersession.

### Behavioral Conformance Tests

- Summaryception delta behavior: already-recorded facts are not restated;
- VectFox significance behavior: insignificant conversation returns no episode;
- VectFox settle-lag behavior: current swipeable assistant prose is not durable evidence;
- CharMemory encounter behavior: one continuous encounter yields one capsule;
- CharMemory long-term behavior: routine interaction yields no character moment.

### Scenario Tests

- twenty ordinary messages yield zero episodes;
- a continuous negotiation yields one episode;
- one episode carries multiple quest, fact, and relationship effects without duplicate histories;
- one ship conversation containing atmosphere, a flicker, a timing anomaly, and a shared refit cause revises one ship aggregate and creates no technical-debt cards;
- a material ship impairment or explicit restriction remains structured inside that aggregate;
- a significant parentless emergent development remains episode-owned and creates no automatic thread or quest;
- a player can Focus one unresolved consequence without creating a quest or reward;
- focusing a second consequence replaces the prior branch-owned Focus deterministically;
- accepting, focusing, and completing inferred content never recover Command Bearing;
- one authorized campaign boundary recovers Command Bearing at most once;
- a material mechanical effect applies before episode sealing;
- a quiet consequential conversation yields one character moment;
- an edit or swipe invalidates and supersedes affected history;
- branch saves share only pre-fork episodes;
- provider failure preserves mechanics and creates no fabricated memory;
- restart restores the active episode without duplication;
- a long scene checkpoints without forced sealing.

### Projection Tests

- every domain projection cites episode and effect sources;
- projections rebuild deterministically from valid episodes;
- invalidated episodes disappear from current projections and prompt context;
- invalid or resolved Focus references disappear from prompt context;
- model output cannot create or replace Focus;
- one projection failure does not invalidate the episode or other projections;
- player-safe and hidden relationship views remain separated.

### Migration Tests

- shadow output does not mutate campaign state;
- legacy and episode paths can be compared without double-rendering;
- cutover disables designated legacy writers exactly once;
- legacy saves preserve current materialized state;
- active legacy dynamic quests remain playable while latent inferred records stay hidden and read-only;
- the ship baseline uses structured legacy current state while technical-debt rows remain archived without destroying historical save data;
- spendable Inspiration/Resolve points clamp into the neutral reserve while Marks, rank, evidence, and review state remain archival and create no new awards;
- rollback across the cutover marker selects the correct projection regime.

### Live SillyTavern Tests

- selected-swipe hashes match the visible variant;
- edit, delete, branch, Save As, restart, and resumed-save flows preserve custody;
- manual Focus selection, replacement, clearing, invalidation, and branch isolation match the visible campaign state;
- no modal commitment offer or automatic emergent quest appears after ordinary or significant conversation;
- Summaryception, VectFox, and CharMemory may remain installed without becoming Directive authorities;
- external prompt injection does not alter Directive episode custody;
- final prompt context includes the expected consolidated episode and excludes stale or duplicate entries.

## Expected Breakpoints and Protections

| Breakpoint | Protection |
|---|---|
| False boundary splits one encounter | hard-boundary evidence, bounded soft judgment, and superseding replacement that can consolidate stale episodes |
| Missed boundary combines unrelated material | deterministic time/location/mission boundaries and safety-limit boundary review |
| Model records every conversational beat | zero-episode default, explicit lasting-change criteria, evidence requirement, and one-episode scene cap |
| Model misses quiet significance | character-specific seal review and pinned long-term-memory fixtures |
| Old async result arrives late | episode revision and complete source-range hash comparison |
| Edit, swipe, or delete leaves stale memory | host-mutation detection, contribution-level invalidation, CORE recovery, and supersession |
| Branch contamination | branch identity on every contribution, episode, effect, projection, and idempotency key |
| Summary drift | checkpoints re-ground from typed effects and recent source rather than summaries alone |
| Provider behavior drifts | pinned extension-derived contracts and provider-matrix fixtures |
| Duplicate domain presentation | episode owns semantic presentation; domain stores expose projections, not separate history |
| Partial migration leaves two writers | explicit cutover registry, parity diagnostics, and tests asserting disabled legacy authority |
| UI consumers depend on legacy array shapes | temporary compatibility projections with source episode IDs |
| Authored quests are disabled with inferred quests | cut over by campaign provenance and quest kind; retain authored quest reducers and UI actions |
| Legacy automatic promotion recreates spam | disable Narrative Thread Director scheduling, Quest Architect promotion authority, and direct thread writers at the cutover registry |
| Ship details recreate `technicalDebt` rows | one ship aggregate identity, no model-generated record IDs, and no append authority for Story Settlement |
| Focus points to stale or resolved material | validate branch, episode, consequence, status, and revision before every prompt projection |
| Focus becomes a second quest system | one reference only; no objectives, progress, rewards, automatic offers, or model write authority |
| Command Bearing becomes farmable | no acceptance/completion coupling; deterministic, idempotent recovery by authoritative boundary ID |
| Existing accepted dynamic quests disappear | grandfather accepted and active legacy quests until terminal resolution |

## Performance and Cost Boundaries

Episode evaluation is non-blocking relative to visible response delivery. Existing accepted-pair and transaction evidence should be reused as migration input, but the legacy Scene Handshake writer is not retained as a separate authority. The Story Settlement evaluator remains a bounded responsibility rather than expanding one prompt into an unreviewable multi-purpose call.

The evaluator runs after accepted source changes, hard-boundary signals, or configured safety-limit reviews. It does not run merely because a UI projection is requested. Calls use bounded recent evidence, the active working capsule, exact typed-effect anchors, and selected relevant sealed episodes.

No initial vector service, embedding pipeline, or recursive whole-history re-summarization is required.

## Acceptance Criteria

The migration is complete only when:

1. Story Settlement is the only semantic commit authority.
2. One continuous ordinary scene produces zero or one episode.
3. Mission, quest, plot, relationship, character, journal, and prompt outputs cite the same episode/effect authority.
4. Immediate mechanics do not depend on episode sealing.
5. Generic per-turn and per-present-character memory writers are disabled.
6. Source edit, deletion, selected-swipe change, branch, Save As, restart, and rollback behavior pass deterministic and live tests.
7. Provider failure cannot corrupt mechanics or fabricate semantic history.
8. Pinned borrowed-behavior fixtures pass across every supported extraction provider.
9. Legacy saves preserve materialized state without double-rendering history.
10. Operator diagnostics can explain why a scene was continued, sealed, discarded, invalidated, or held for recovery.
11. Domain projectors attach to an existing campaign root or revise one current aggregate before considering new identity.
12. Ship status is one aggregate and new settlement output cannot append `ship.technicalDebt` records.
13. Parentless emergent consequences remain episode-owned and no conversation automatically creates a dynamic quest or modal offer.
14. The player can select at most one valid branch-bound emergent Focus, and Focus creates no second semantic record.
15. Command Bearing has no Inspiration/Resolve, Mark, rank, per-turn evidence, or inferred-completion award authority in the V1 projection.
16. Command Bearing recovery is deterministic and idempotent by authoritative campaign-boundary ID.

## Final Architectural Rule

Directive decides what happened once.

Exact operations may be granular for recovery. Semantic history is not. One Story Settlement authority accumulates accepted evidence, applies validated effects, seals meaningful episodes, and supplies every domain with projections of the same campaign truth.

Attach before creating. Revise before appending. Preserve emergent meaning in its episode. Let the player choose one Focus without manufacturing a quest. Keep Command Bearing scarce and independent from generated work.
