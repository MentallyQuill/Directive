# Persistence And Continuity

## Core Rule

Structured state is authoritative. Chat prose is presentation.

The active SillyTavern model narrates the scene, but it does not decide hidden truth, rewrite state, grant progression, kill crew, repair systems, or establish mission outcomes without an approved outcome packet and state delta.

## State Domains

Initial top-level domains:

```text
campaign
activeCampaignPackage
player
crew
ship
mission
worldState
storyArcLedger
questLedger
dynamicQuestCatalog
knowledgeLedger
threadLedger
eventLedger
attentionState
runtimeTracking
relationships
commandCulture
commandStyle
commandCompetence
pressureLedger
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
- Untriggered Command Decisions.
- PressureLedger director summaries, routing links, and raw scoring.
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
- Command Competence summaries such as assumed routine actions, meaningful counsel requests, authority notes, procedural warnings, and accepted risks.
- Player values.
- Known favors, obligations, and unresolved consequences.
- Player-safe pressure summaries when they reflect known consequences.
- Command Log summaries.
- Crew dossiers limited to known history and established relationship.

## Storage Direction

Settings should be control plane only. User-owned or campaign-owned content should live in indexed flat files under SillyTavern's `/user/files` area, following the storage principles learned from Saga.

Finalized campaign packages and mission packages should be loadable JSON payloads. The Breckenridge package should use the same package JSON schema as imported and future Creator-made packages. Zip transport may wrap package JSON and passive assets for sharing, but the runtime should validate and store normalized JSON records.

Directive should support multiple campaign saves from the beginning. The first playable runtime should include `Save Game`, `Save Game As`, and `Load Game` behavior rather than assuming a single active campaign. A new campaign begins by selecting a campaign package, then creating the campaign-required player character, then writing the first save.

Candidate files:

```text
settings.json -> directive storage pointer
/user/files/directive-storage-index.v1.json
/user/files/directive-indexes-campaign-package-imports.v1.json
/user/files/directive-campaign-index.v1.json
/user/files/directive-character-creator-draft-index.v1.json
/user/files/directive-save-index.v1.json
/user/files/directive-character-creator-draft-<draftId>.v1.json
/user/files/directive-campaign-<campaignId>.v1.json
/user/files/directive-save-<saveId>.v1.json
/user/files/directive-turn-ledger-<campaignId>.v1.json
/user/files/directive-command-log-<campaignId>.v1.json
/user/files/directive-mission-pack-<packId>.v1.json
/user/files/directive-packages-imports-<importId>.v1.json
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

## Save Model

A campaign is the long-running playthrough identity. A save is a named restorable snapshot or branch of that campaign.

Character Creator drafts are separate records from campaign saves. A player can enter partial character information, save or autosave the draft, leave, and return before accepting the review. Accepting the review creates a completed player-character record, projects the package into campaign state, and then writes the first campaign save.

Required pre-alpha behavior:

- `Save Game` overwrites the current save slot with the current campaign state.
- `Save Game As` creates a new save slot from the current campaign state and records parent/divergence branch metadata.
- `Load Game` restores a selected save slot and makes it the active campaign state.
- Saves preserve the active campaign package id and version, campaign id, player character, mission state, turn ledger, Command Log, and hidden simulation state.
- Mission state preserves active mission id, active mission graph id/path, active phase, and available decision points so a Prelude save can resume directly inside the Chapter 1 opening graph after handoff.
- Pressure state preserves committed unresolved obligations and routing links so Chapter 1 pressure handoff, later mission frames, and Open Orders candidates survive save/load.
- Save metadata should include campaign title, package title, stardate, active mission, last updated time, simulation mode, and a short player-facing summary.
- The storage layer should be able to list saves without loading every full campaign payload.

This does not require stable long-term migration support during pre-alpha, but the file shape should not prevent later campaign update tooling.

Current code-facing helpers:

- `src/creators/character-creator-draft.mjs` creates, updates, restores, progresses, and accepts Character Creator draft records.
- `src/campaign/campaign-start.mjs` converts an accepted package-driven creator review into initialized campaign state.
- `src/campaign/campaign-start-service.mjs` composes creator drafts, campaign start, save records, and storage repository calls into runtime-facing workflows.
- `src/runtime/campaign-start-controller.mjs` builds Campaign and Character Creator view models over the service layer and tracks the active campaign/save for later panel wiring.
- `src/storage/save-records.mjs` creates first-save records, overwrites a current save slot, creates Save Game As copies, loads campaign state, and produces lightweight save-list entries.
- `src/storage/directive-storage-filenames.mjs` validates flat `directive-` storage filenames and `/user/files/` JSON paths.
- `src/hosts/sillytavern/file-api.mjs` wraps SillyTavern's `/api/files/upload`, `/api/files/verify`, `/api/files/delete`, and direct `/user/files/...` reads behind the repository adapter interface.
- `src/storage/directive-storage-repository.mjs` persists creator draft and campaign save payloads through an async JSON adapter and maintains lightweight draft/save indexes for list views.
- `src/storage/directive-storage-repository.mjs` also diagnoses missing/unreadable indexed payloads, verifies payload paths when the adapter supports it, and recovers the active campaign save from the indexed active save, current save rows, or newest readable save row.
- `src/runtime/campaign-start-controller.mjs` now performs active-save recovery during initialization and exposes storage diagnostics to runtime panels.
- `src/packages/campaign-package-importer.mjs` normalizes `.directive-campaign.zip` imports or decoded archive entries into package records while rejecting unsafe paths and active content.
- `src/packages/package-diagnostics.mjs` reports package health, projection/dataset/mission-graph id mismatches, campaign package-version drift, and missing active mission graph ids.

The storage repository is intentionally adapter-backed. Tests use an in-memory adapter and a mocked SillyTavern file API adapter; runtime wiring should provide the real SillyTavern file API adapter with `readJson(path)` and `writeJson(path, value)` methods. Repository list methods read only the relevant index, not every draft or save payload.

Current first autosave behavior:

- Create the first save immediately after Character Creator review is accepted.
- Autosave after a Director outcome is accepted and narration reaches a stable state.
- Keep a small rolling autosave history per campaign, initially three autosaves.
- If narration fails after mechanics commit, store the state as pending narration recovery rather than overwriting the last stable autosave.

Current replacement and branch behavior:

- Director turns store a pre-outcome snapshot in the turn ledger.
- `Rerun Outcome` previews a replacement from that pre-outcome snapshot while preserving the current committed state until acceptance.
- Accepted replacements commit from the snapshot, which rolls back dependent state, Command Bearing spends, Command Decision awards, Command Competence ledgers, and pressure records from the replaced outcome.
- `Delete Outcome` restores the pre-outcome snapshot.
- `Save Game As` writes the active campaign payload and stores branch metadata with parent save id, parent save name, divergence outcome id, and branch timestamp.

Remaining persistence work:

- Add richer save-list filtering and branch-management UI for comparing, renaming, and pruning branches.
- Hook automatic SillyTavern user-message edit/delete/branch events into the same explicit recovery operations once those event surfaces are reliable.

Recommended save naming:

- New save default: `<Player surname or name> - <Campaign title> - <Stardate>`.
- `Save Game As` starts with the current save name plus `Copy` or a timestamp, then lets the player edit.
- Autosaves are labeled `Autosave - <Campaign title> - <Stardate>`.
- Save list rows should show player name, ship, active mission, stardate, simulation mode, last updated time, and the latest Command Log summary.

## Character Creation

Starting a campaign should create the player character before the first save is written.

The active Character Creator design is [Character Creator Model](../design/CHARACTER_CREATOR_MODEL.md).

The character creator should collect enough structured and prose detail for Directors and narrators to use:

- Character name.
- Rank and campaign role, constrained by the selected package.
- Pronouns or preferred form of address.
- Service background.
- Prior command experience.
- Personal Values.
- Command style tendencies.
- Relevant relationships or career history that the package allows.
- Optional notes the player wants the narrator to remember.

For Ashes of Peace, the package calls for the player to be the incoming permanent XO of the U.S.S. Breckenridge. Future packages may define different player-character requirements, but the runtime should let the package describe those requirements rather than hardcoding the Breckenridge role into the creator.

The creator draft record stores:

- Package, campaign, ship, role, and character-creation context snapshot.
- Current creator step.
- Partial Identity, Service, Personality, and dossier input.
- Completed-step progress and readiness for campaign start.
- Revision, timestamps, and short autosave history.

The draft may be incomplete. Campaign start must reject incomplete creator reviews, while the draft save path must preserve them.

## Campaign-State Projection

Reusable campaign packages do not become campaign saves directly. They are projected into campaign-owned state through a versioned projection contract:

```text
schemas/campaign/campaign-state-projection.schema.json
packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json
```

Projection defines which package fields are copied, referenced, generated, or derived at campaign creation. A campaign save must pin the package id and package version used at creation, then treat the campaign state as authoritative from that point forward.

For Ashes of Peace, projection initializes the player-created XO slot, Breckenridge ship condition, senior crew ids, hidden relationship placeholders, active prelude mission, campaign tracks, campaign assets, directives, Command Competence ledgers, turn ledger, Command Log, and simulation-mode settings.

`pressureLedger` is initialized as a hidden campaign-owned state domain. It may reference package-authored pressure ids, side templates, phases, decision points, and chapter ids, but the package template is never mutated during play.

Chapter 1 first-response outcomes currently seed player-safe regional and obligation pressures while preserving hidden follow-up state, such as the missing-module lead, outside ordinary UI and narration. These records travel with saves and branches like any other committed campaign state.

## Turn Transaction Lifecycle

Director state commits and narration generation are separate steps.

The recommended lifecycle is:

1. Build the scene snapshot from committed campaign state.
2. Run Director/adjudication logic.
3. Build and validate any Command Competence packet supplied by the active mission graph.
4. Validate the outcome packet and state delta.
5. Commit the structured mechanics and competence records into an in-memory transaction.
6. Generate narration and Command Log prose from the committed packet.
7. Save the resulting campaign state when the user or autosave flow requests it.

If narration fails after mechanics commit, the runtime should keep the committed mechanics in a recoverable pending-narration state and offer retry/regenerate behavior. It should not silently reroll mechanics, and it should not let failed prose generation corrupt the authoritative campaign state.

Swipes normally regenerate narration from the already-committed mechanics. The player should also have an explicit option to rerun mechanics for a swipe. That rerun is a player-trust feature, not the default path. When mechanics are rerun, the previous outcome should remain restorable until the player accepts the new result.

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
- Pressure ledger records that explain unresolved crew, ship, regional, and obligation state.
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

## Package Updates

Package updates should be allowed to affect in-progress campaigns during alpha development. Directive does not need legacy compatibility for old pre-alpha data as long as files and docs are updated in place to the best current version.

Later, Directive will likely need a campaign updater for package or save-breaking changes. Until then, package update handling should stay simple:

- Active campaigns may read newer package data when the package is updated.
- Campaign-owned state remains authoritative for what already happened.
- Update diagnostics should identify missing ids or incompatible fields clearly.
- Migration scaffolding should be added only when a concrete package or save break needs it.

Current alpha behavior:

- The Campaign tab shows package health status and issue count for loaded packages.
- Version drift is a warning when the campaign package id still matches.
- Package id mismatch is an error.
- Missing active mission graph ids are errors when package mission graph records are available.
