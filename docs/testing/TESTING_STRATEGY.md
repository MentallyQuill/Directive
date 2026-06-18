# Testing Strategy

## Test Culture

Directive should inherit Saga's preference for product-contract tests, visual smoke coverage, storage safety, and live SillyTavern verification where behavior depends on the host application.

Tests should prove behavior, not stale source shape. Source-layout tests are acceptable only for boundaries that are explicit architecture contracts, such as no `saga` runtime identifiers and no monolithic runtime owner.

## First Invariants

Highest priority:

- `directive` identity is used in manifest, hooks, globals, storage prefixes, CSS prefixes, and DOM IDs.
- No production runtime identifiers use `saga`.
- Schema starts at version 1.
- Settings remain control-plane only.
- Starship package templates do not mutate when campaign state changes.
- Starship packages validate the approved top-level spine: `manifest`, `ship`, `crew`, `characterCreation`, `mainCampaign`, `sideMissionRules`, `missionTemplates`, `guardrails`, `assets`.
- Character Creator options are package-provided and never hardcoded to Ashes of Peace in runtime logic.
- Bundled Breckinridge data validates through the same package JSON schema as imported packages.
- Ashes of Peace package data contains a main campaign shell, campaign tracks, Open Orders intervals, side assignment templates, and the prelude mission.
- Side missions inherit current ship, crew, relationship, and campaign state, then commit outcomes back to the same campaign continuity.
- Simulation mode is exactly `Exploration` or `Command`; retired rank-based difficulty labels do not appear in runtime UI.
- Exploration mode applies softer prompt and Director guardrails without erasing committed causality.
- Command mode preserves full deterministic simulation consequences without cheating against the player.
- Inspiration and Resolve are independent command-style tracks, not a single morality axis.
- Command Bearing reserve capacity never exceeds two total points.
- Command Bearing spends improve eligible Provisional Outcomes by exactly two tiers and cannot apply to Success or Great Success.
- Command Bearing spends cannot erase Anchored Consequences or make impossible actions possible.
- Recovery intervals use unique in-world ids and cannot be farmed by repeated time skipping.
- Crew development is distinct from relationship approval and cannot be farmed through low-stakes conversations.
- Mission Director tests preserve the mission's dramatic question without requiring fixed scene order.
- Mission-abandoning actions are classified and resolved through authority, evidence, Captain intent, directives, risk, and cost.
- Director retrieval tests keep Mission Director, Crew Director, Ship Director, Command Director, narrator, and Command Log packets separated by audience and visibility.
- Hidden crew revelations and mission truths never enter narrator packets until reveal state permits them.
- Campaign state is authoritative over narration.
- A swipe cannot reroll an adjudicated outcome.
- A user edit restores and re-resolves state.
- A deletion removes dependent consequences.
- A provider failure cannot partially commit state.
- Dynamic events identify a causal source.
- Clocks advance only from valid triggers.
- Command Decisions cannot be awarded twice for one decision.
- Hidden relationship values are not exposed in normal UI.
- Package import rejects active content and unsafe paths.
- `.directive-starship.zip` imports normalize into validated JSON package records.

## Visual Smoke Targets

Initial visual targets:

- Desktop runtime shell.
- Phone-width bottom navigation.
- Starships tab package list.
- Mission overview.
- Crew roster and crew detail.
- Ship state overview.
- Command Log summary and detail expansion.
- Settings provider configuration.
- State safety and diagnostics surfaces.

## Storage Tests

Storage tests should cover:

- Master index creation.
- Domain index creation.
- Payload write and verify.
- Passive asset write and verify.
- Stale write detection.
- Delete cleanup and retry marking.
- Corrupt JSON handling.
- Missing payload diagnostics.
- Import success only after durable storage.
- Character Creator drafts written as payloads and listed through a lightweight draft index.
- Campaign saves written as payloads and listed through a lightweight save index.
- Load Game marking the selected save active without requiring every save payload to be read.
- Storage filenames stay flat, `directive-` prefixed, and limited to passive JSON for draft/save/index payloads.
- The SillyTavern `/api/files/upload`, `/api/files/verify`, and `/api/files/delete` boundary is wrapped behind a Directive adapter.

## Package Schema Tests

Current package-schema smoke command:

```powershell
node tools\scripts\test-extension-shell.mjs
node tools\scripts\test-runtime-shell-creator-flow.mjs
node tools\scripts\validate-starship-package.mjs
node tools\scripts\test-starship-package-context.mjs
node tools\scripts\test-campaign-start-and-save.mjs
node tools\scripts\test-directive-file-api.mjs
node tools\scripts\test-directive-storage-repository.mjs
node tools\scripts\test-campaign-start-service.mjs
node tools\scripts\test-runtime-campaign-start-controller.mjs
node tools\scripts\validate-campaign-projection.mjs
node tools\scripts\validate-crew-dataset.mjs
node tools\scripts\test-crew-retrieval-fixture.mjs
node tools\scripts\validate-mission-graph.mjs
node tools\scripts\test-mission-graph-fixture.mjs
node tools\scripts\validate-mission-director-contract.mjs
node tools\scripts\test-mission-director-loop.mjs
node tools\scripts\test-transaction-state.mjs
node tools\scripts\verify-repo-structure.mjs
```

These dependency-free verifiers check the Directive extension shell contract, prove the rendered Starships-to-Character-Creator draft save/resume flow, check the bundled Ashes of Peace package against the schema contract and campaign invariants, test package summary and Character Creator context extraction, prove Character Creator draft saves and first campaign save records, prove the SillyTavern file API adapter boundary, prove indexed storage behavior for creator drafts and campaign saves, prove the runtime-facing campaign-start/save service workflow, prove the runtime campaign-start controller view models, check the campaign-state projection against the package/campaign boundary, validate crew retrieval separation, validate the prelude mission graph, generate Mission Director loop packets, prove in-memory transaction-state commit/swipe/edit/delete/restore behavior, and ensure the anticipated repo scaffold remains intact. They should remain fast enough to run before full runtime tests exist.

Crew dataset tests should add:

- Director-card schema reference validation.
- Crew dataset manifest and package-id validation.
- Officer ids matching the package crew roster.
- Reveal-gated cards staying out of narrator packets.
- Indexes referencing existing card ids only.
- Development dimensions remaining separate from relationship dimensions.

Mission graph tests should add:

- Package and mission identity validation.
- Required prelude phases and decision points.
- Required outcome flags.
- Failure policy invariants.
- Command Decision reachability and non-repeatability.
- Transition from the prelude into Chapter 1.

Mission Director contract tests should add:

- Scene snapshot identity against active graph and projection.
- Action classification categories.
- Decision point, fact, clock, and Command Decision references.
- State delta outcome flags constrained to graph allowed values.
- Clock deltas constrained to graph clock bounds.
- Narrator packets limited to narrator-safe cards and player-safe facts.
- Command Log packets bound to committed outcome ids.

Mission Director loop tests should add:

- Generated packet comparison against a known turn fixture.
- Pressure focus selection from actor intentions, readiness gates, and scene budget.
- Input immutability for graph, projection, crew dataset, and fixture state.
- Hesperus Command Decision award prevention after the same decision has already been awarded.
- Captain approve/refuse/counteroffer variants for mission-abandoning moves.
- Impossible or unsupported command handling.
- Phase advancement from Hesperus resolution into aftermath.

Command Bearing tests should add:

- Mark award threshold progression at Ranks I-V.
- One award per unique story, Command Decision, or Command Crucible id.
- Shared reserve capacity at Rank I-II and Rank III+.
- Track point caps by Bearing Rank.
- Recovery uniqueness and cap behavior.
- Intervention eligibility for Inspiration and Resolve.
- Two-tier Provisional Outcome improvement.
- No spend on Success or Great Success.
- Anchored Consequences surviving the spend.
- Spend refund on provider or transaction failure before commit.
- Swipe, edit, delete, and branch behavior for spends and awards.

Character Creator tests should add:

- Campaign context package validation.
- Locked-role display for Ashes of Peace.
- Runtime context extraction from package JSON without mutating package templates.
- Partial draft save, restore, autosave history, and return-to-creator behavior.
- Accepted review conversion into initialized campaign state.
- Runtime-facing service workflow for draft resume and first save creation.
- Runtime controller Starships and Character Creator view models backed by package data.
- Rendered Starships and Character Creator shell flow for partial draft save, resume, campaign begin, first save, Save Game, Save As, and Load Save.
- Identity, Service, Personality, and Review screen state.
- Local fallback dossier when provider generation fails.
- Generated dossier field boundaries and editable draft behavior.
- Trait profile passed to adjudication without becoming a numeric skill sheet.
- Provider output does not invent forbidden major personal facts.

Campaign save tests should add:

- First save creation immediately after Character Creator review acceptance.
- Save Game overwrite preserving the save id and incrementing revision.
- Save Game As creating a distinct save slot.
- Load Game returning a cloned campaign state.
- Save-list metadata available without reading every full campaign payload.
- Campaign save records preserving hidden state without exposing raw values in normal UI.
- Service-level Save Game, Save Game As, and Load Game workflows over the storage repository.

## Transaction Tests

Transaction tests should use deterministic fixtures before real providers:

- Consequential turn commit.
- Non-consequential turn ignored or logged without state mutation.
- Swipe regeneration preserves outcome ID.
- User edit rolls back original result.
- Delete rolls back dependent changes.
- Branch uses the correct snapshot.
- Interrupted parse resumes or rolls back.
- Narration failure does not lose committed mechanical outcome.

## Provider Tests

Provider tests should cover:

- Current SillyTavern model routing is narration-only.
- Utility/structure provider roles can be configured separately.
- JSON response repair.
- Empty content from reasoning models.
- Token-limit detection.
- Sanitized diagnostics.
