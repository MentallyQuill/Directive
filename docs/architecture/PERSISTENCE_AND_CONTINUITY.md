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
actors
fronts
clocks
relationships
commandCulture
commandStyle
values
directives
canon
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

Finalized starship packages and mission packages should be loadable JSON payloads. The Breckenridge package should use the same package JSON schema as imported and future Creator-made packages. Zip transport may wrap package JSON and passive assets for sharing, but the runtime should validate and store normalized JSON records.

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

## Continuity Meaning

Directive continuity is broader than Saga's continuity scanner. It includes:

- Mission truth and discovered facts.
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
