# Directive Open-World Campaign Architecture

## Status

Implementation contract for campaign package schema version 2.

Directive schema version 2 is a total conversion. It does not load or project the chapter-cursor campaign model. Authored tactical mission graphs remain supported as optional foreground resolvers, but they no longer sequence the campaign.

## Design objective

Directive models a persistent authored region in which multiple opportunities can coexist, time can pass, factions and fronts can react, and one scene receives foreground attention. The runtime separates three scales of agency:

- Tactical: how the player resolves the present situation.
- Operational: which assignment, location, obligation, or personal concern receives attention.
- Strategic: how accumulated outcomes change the authored campaign region.

The system is bounded and authored. It is not an unconstrained procedural generator and does not simulate every actor every turn.

## Package/save boundary

### Immutable package data

A campaign package has exactly these roots:

```text
manifest
ship
crew
characterCreation
world
storyArcs
endConditions
questTemplates
threadTemplates
reactionRules
directorCards
contextPolicy
guardrails
assets
```

Package data defines possibility space: locations, routes, factions, actors, fronts, clocks, state-track definitions, authored arcs, end conditions, quest templates, thread families, reaction rules, retrieval cards, prompt policy, and safety rules.

### Campaign-owned state

A save owns mutable continuity:

```text
campaign
activeCampaignPackage
worldState
storyArcLedger
questLedger
knowledgeLedger
threadLedger
eventLedger
attentionState
mission
pressureLedger
relationships
commandCulture
commandStyle
commandCompetence
values
directives
canon
campaignTracks
campaignAssets
turnLedger
commandLog
ui
settings
captainState
player
crew
ship
flags
```

The package is never mutated during play. Save transactions commit new state roots.

## Runtime directors

### Director Coordinator

`src/directors/director-coordinator.mjs`

The coordinator owns open-world boundary processing. It commits events, applies reaction cascades, advances elapsed-time fronts, reconciles quest availability, evaluates quest completion, applies authored outcome effects, advances story milestones, applies convergence effects, and performs a final quest reconciliation.

### Quest Director

`src/quests/quest-director.mjs`

The Quest Director:

- Lists local and remote opportunities.
- Selects one foreground quest without suppressing concurrent quests.
- Activates an optional tactical mission graph where one exists.
- Creates a systemic mission facade for graphless quests.
- Supports delegation where the template permits it.
- Resolves a quest with an explicitly selected authored outcome.
- Reconciles availability, expiry, and transformation predicates.

Quest lifecycle:

```text
latent -> available -> offered -> accepted -> active
                                      |         |
                                      +-> delegated
active/delegated -> resolved | failed | abandoned | expired | transformed
```

### Tactical Mission Director

The existing Mission Director remains the detailed resolver for authored set pieces. A tactical graph belongs to a quest template and may provide phases, decision points, pressure choices, intent parsing, capability validation, outcome packets, and state deltas.

A tactical graph cannot select the next campaign quest. Completion emits an event into the open-world coordinator.

### World Director

`src/world/world-director.mjs`

The World Director creates mutable region state, validates routes, performs travel, advances stardate and elapsed time, and advances fronts at defined elapsed-hour thresholds. Travel is a state transition and a world boundary, not scene flavor.

### Reaction Engine

`src/world/reaction-engine.mjs`

Reaction rules listen for committed event types and apply validated effects. Supported effects include:

- Adjust state track.
- Adjust clock.
- Advance or set a front stage.
- Reveal a fact.
- Discover a location.
- Set current location.
- Set a flag.
- Grant an asset.
- Make a quest available.

Reaction output is deterministic. Provider output may propose events or thread candidates but cannot directly mutate campaign state.

### Story Arc Director

`src/story/story-arc-director.mjs`

Story arcs contain milestones with eligibility and completion predicates. Milestones are reconciled from current state rather than traversed by a chapter cursor. Convergence rules apply once and can unlock finale or epilogue quests when state requirements are satisfied.

### Narrative Thread Engine

`src/threads/`

The thread engine converts grounded scene evidence into bounded personal and local stories:

1. Scene-delta extraction records observable, committed material.
2. Deterministic prefiltering identifies credible concerns, promises, conflicts, interests, and routine problems.
3. The scout proposes candidates with source evidence.
4. The curator enforces bandwidth and natural timing.
5. Activation moves a supported thread into foreground-capable state.
6. Closure writes a durable resolution or dormancy decision.
7. Promotion may create a formal side assignment only when scope warrants it.

Thread lifecycle:

```text
latent -> watchlisted -> available -> engaged -> active
active -> resolved | dormant | abandoned | invalidated
```

Raw relationship values, hidden facts, and unsupported private history are not valid generation sources.

### Context Orchestrator

`src/context/context-orchestrator.mjs`

The Context Orchestrator assembles candidates, scores salience, enforces total and per-tier token budgets, records omissions, and emits audience-specific plans.

Audience classes:

- `playerSafe`: only explicitly player-facing content.
- `narratorSafe`: player-safe content plus non-secret narration constraints.
- `directorOnly`: internal truth, hidden fronts, and Director-only cards as well as safe context.

A Director-only plan cannot be converted into a SillyTavern prompt packet. The conversion function rejects hidden blocks and plans whose diagnostics report hidden content.

Context tiers:

| Tier | Typical placement | Purpose |
|---|---|---|
| Contract | `inPrompt`, depth 0 | Stable state-authority and narration rules |
| Immediate | `inChat`, depth 1 | Present scene, active quest, actors, stakes |
| Continuity | `inChat`, depth 4 | Relevant facts, crew, threads, recent consequences |
| Regional | `inChat`, depth 8 | Location, selected fronts, arc orientation, earned assets |

Dormant quests, latent threads, uninvolved actors, unearned assets, irrelevant locations, and hidden Director truth receive no narrator prompt budget.

SillyTavern installation is performed through the existing prompt adapter, which maps each selected block to an extension prompt with its placement, depth, and role. Prompt packets are revisioned and hashed so stale blocks can be removed. Final prompts can be inspected through SillyTavern prompt itemization or Prompt Inspector during playtest.

## Predicate contract

Availability, milestone, reaction, completion, failure, and expiry conditions use declarative predicates from `schemas/world/predicates.schema.json`. Packages cannot execute arbitrary JavaScript.

Representative predicates:

- Quest status or resolution.
- Current location.
- Fact known or tagged fact count.
- State-track comparison.
- Front or clock comparison.
- Asset owned.
- Flag value.
- Event occurrence.
- Context value supplied by a trusted runtime boundary.

Condition sets support `all`, `any`, and `none`, including nested condition sets.

## Event transaction

A meaningful boundary follows this order:

```text
player action or tactical outcome
  -> validate and commit source event
  -> process reaction cascade
  -> advance elapsed-time fronts where applicable
  -> reconcile quest availability/expiry
  -> evaluate foreground quest completion
  -> apply quest outcome effects
  -> reconcile story milestones
  -> apply one-shot convergence effects
  -> process emitted follow-up events
  -> reconcile quests again
  -> build narrator and Director context plans
  -> persist one campaign transaction
```

World reactions normally run at scene, quest-selection, delegation, travel, rest, quest-resolution, or explicit event boundaries. Dialogue lines do not each trigger a region-wide simulation pass.

## Foreground attention

One scene may be foregrounded at a time, but multiple quests and threads remain active or available. `attentionState` records:

- Activity mode.
- Foreground quest.
- Foreground thread.
- Scene identifier.
- Primary pressure.
- Optional tactical graph identifier and path.

Clearing or changing foreground attention does not erase other quest instances.

## Failure-forward rules

A failed action should create cost, pressure, delay, damage, loss of leverage, harder evidence routes, or changed faction posture. It should not invalidate the campaign. Quest templates provide multiple outcomes, and story predicates use evidence pools and alternate routes rather than one mandatory clue chain.

Refusal, postponement, delegation, withdrawal, and abandonment are valid command acts. Their consequences must be causally grounded.

## Hidden-information invariants

- Director-only cards never enter narrator packets.
- Raw state tracks remain hidden in normal play.
- Raw relationship dimensions remain hidden.
- Hidden fronts and clocks are omitted unless their effects have become observable.
- Actor knowledge remains bounded by authored knowledge and committed events.
- Provider output is advisory until deterministically validated and committed.
- A committed outcome is never rerolled by narration.

## UI contract

The open-world view model exposes:

- Current region, location, stardate, and reachable destinations.
- Main, side, delegated, completed, and foreground quests.
- Player-visible objectives and summaries.
- Available, engaged, and active threads.
- Earned assets and visible recent consequences.

The UI does not expose exact hidden tracks, secret clocks, latent threads, or undiscovered Director truth.

## Tactical graph coverage

Ashes of Peace currently includes bespoke tactical graphs for:

- A Ship Underway.
- The Empty Convoy.
- False Colors.

Drowned Constellation currently includes baseline tactical graphs for:

- Prelude Soundings.
- Chapter 1 Aster Basin.
- Chapter 2 Caligo Sounding.

All remaining authored quests use the systemic quest path: fully specified objectives, pressures, revelations, approaches, outcomes, effects, and contextual anchors without a bespoke phase graph. Additional tactical graphs can be added later without changing the campaign schema or quest ordering.

## Source files

Primary implementation surfaces:

```text
schemas/campaign-package.schema.json
schemas/campaign/campaign-state-projection.schema.json
schemas/world/
schemas/story/
schemas/quests/
schemas/reactions/
schemas/threads/
schemas/directors/
schemas/generation/
src/directors/
src/world/
src/quests/
src/story/
src/threads/
src/context/
src/ui/open-world-view-models.mjs
```
