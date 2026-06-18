# Persistence And Continuity

## Core Rule

Structured state is authoritative. Chat prose is presentation.

The active SillyTavern model narrates the scene, but it does not decide hidden truth, rewrite state, grant progression, kill crew, repair systems, or establish mission outcomes without an approved outcome packet and state delta.

## State Domains

Initial top-level domains:

```text
campaign
activeStarshipPackage
player
crew
ship
mission
mainCampaign
sideMissions
actors
fronts
clocks
relationships
commandCulture
commandStyle
values
directives
canon
campaignTracks
campaignAssets
turnLedger
commandLog
ui
settings
```

## Hidden Simulation State

Directive intentionally simulates some state behind the scenes. The player should not see raw values for:

- Relationship dimensions.
- Secret actor goals.
- Exact faction clocks.
- Hidden mission truths.
- Undiscovered clues.
- Untriggered Command Moments.
- Director-only end-state logic.
- Internal command-culture scores.

The player may see:

- Current objective.
- Stardate and location.
- Known directives and rules of engagement.
- Public deadlines.
- Major ship conditions.
- Relevant personnel restrictions.
- Inspiration and Resolve progression in approved player-facing form.
- Player values.
- Known favors, obligations, and unresolved consequences.
- Command Log summaries.
- Crew dossiers limited to known history and established relationship.

## Storage Direction

Settings should be control plane only. User-owned or campaign-owned content should live in indexed flat files under SillyTavern's `/user/files` area, following the storage principles learned from Saga.

Finalized starship packages and mission packages should be loadable JSON payloads. The Breckinridge package should use the same package JSON schema as imported and future Creator-made packages. Zip transport may wrap package JSON and passive assets for sharing, but the runtime should validate and store normalized JSON records.

Candidate files:

```text
settings.json -> directive storage pointer
/user/files/directive-storage-index.v1.json
/user/files/directive-starship-index.v1.json
/user/files/directive-campaign-index.v1.json
/user/files/directive-campaign-<campaignId>.v1.json
/user/files/directive-turn-ledger-<campaignId>.v1.json
/user/files/directive-command-log-<campaignId>.v1.json
/user/files/directive-mission-pack-<packId>.v1.json
/user/files/directive-starship-pack-<packId>.v1.json
/user/files/directive-creator-starship-project-<projectId>.v1.json
/user/files/directive-creator-mission-project-<projectId>.v1.json
/user/files/directive-asset-...
```

Exact filenames and split points are not final, but storage must preserve these invariants:

- Settings do not become a data warehouse.
- Package templates are separate from campaign state.
- Campaign state is separate from reusable packages.
- Turn results are durable and replay-safe.
- Index files own organization.
- Payload files own content.
- Passive assets are separate files.
- Every Directive-owned file has an owner or is cleanup-eligible.
- Stale writes produce clear recovery messages.

## Campaign-State Projection

Reusable starship packages do not become campaign saves directly. They are projected into campaign-owned state through a versioned projection contract:

```text
schemas/campaign/campaign-state-projection.schema.json
packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json
```

Projection defines which package fields are copied, referenced, generated, or derived at campaign creation. A campaign save must pin the package id and package version used at creation, then treat the campaign state as authoritative from that point forward.

For Ashes of Peace, projection initializes the player-created XO slot, Breckinridge ship condition, senior crew ids, hidden relationship placeholders, active prelude mission, campaign tracks, campaign assets, directives, turn ledger, Command Log, and simulation-mode settings.

## Director Retrieval State

Director retrieval uses package-owned datasets, but campaign state owns how those datasets have been used in a specific playthrough.

Campaign-owned retrieval state should include:

- Revealed Director-card ids.
- Player-known fact ids.
- Trust-gated crew disclosure state.
- Retired, blocked, superseded, or contradicted card ids.
- Retrieval run journals or references from the turn ledger.
- Packet hashes tied to committed outcome ids where retrieval influenced a consequential turn.

Retrieval journals are diagnostic and replay support. They are not a substitute for committed outcome packets or campaign state.

## Continuity Meaning

Directive continuity is broader than Saga's continuity scanner. It includes:

- Mission truth and discovered facts.
- Main campaign progress and side mission outcomes.
- Ashes of Peace campaign tracks such as Regional Trust, Lantern Escalation, Humanitarian Strain, Starfleet Scrutiny, and Compact Unity.
- Campaign assets earned through Open Orders and side assignments.
- Crew relationship evolution.
- Ship damage and technical debt.
- Actor and faction consequences.
- Command culture.
- Values challenged or changed.
- Directives obeyed, challenged, or violated.
- Campaign divergences from canon.
- Debrief records and future hooks.

## Command Log

The Command Log is player-facing support, not the source of truth.

It may summarize:

- What was attempted.
- Which constraints mattered.
- Result band.
- Costs and consequences.
- Relationship and command-culture changes in descriptive form.
- Ship state changes.
- Favors, obligations, and unresolved threads.
- Mission and debrief summaries.

Command Log summaries may be LLM-assisted, but they must be generated from committed state and stored outcome packets.
