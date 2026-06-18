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
- Starship packages validate the approved top-level spine: `manifest`, `ship`, `crew`, `mainCampaign`, `sideMissionRules`, `missionTemplates`, `guardrails`, `assets`.
- Bundled Breckinridge data validates through the same package JSON schema as imported packages.
- Ashes of Peace package data contains a main campaign shell, campaign tracks, Open Orders intervals, side assignment templates, and the prelude mission.
- Side missions inherit current ship, crew, relationship, and campaign state, then commit outcomes back to the same campaign continuity.
- Simulation mode is exactly `Exploration` or `Command`; retired rank-based difficulty labels do not appear in runtime UI.
- Exploration mode applies softer prompt and Director guardrails without erasing committed causality.
- Command mode preserves full deterministic simulation consequences without cheating against the player.
- Inspiration and Resolve are independent command-style tracks, not a single morality axis.
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
- Command Moments cannot be awarded twice for one moment.
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

## Package Schema Tests

Current package-schema smoke command:

```powershell
node tools\scripts\validate-starship-package.mjs
node tools\scripts\validate-campaign-projection.mjs
node tools\scripts\validate-crew-dataset.mjs
node tools\scripts\test-crew-retrieval-fixture.mjs
node tools\scripts\validate-mission-graph.mjs
node tools\scripts\test-mission-graph-fixture.mjs
node tools\scripts\validate-mission-director-contract.mjs
node tools\scripts\test-mission-director-loop.mjs
node tools\scripts\verify-repo-structure.mjs
```

These dependency-free verifiers check the bundled Ashes of Peace package against the schema contract and campaign invariants, check the campaign-state projection against the package/campaign boundary, validate crew retrieval separation, validate the prelude mission graph, generate the first Mission Director loop packet, and ensure the anticipated repo scaffold remains intact. They should remain fast enough to run before full runtime tests exist.

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
- Command Moment reachability and non-repeatability.
- Transition from the prelude into Chapter 1.

Mission Director contract tests should add:

- Scene snapshot identity against active graph and projection.
- Action classification categories.
- Decision point, fact, clock, and Command Moment references.
- State delta outcome flags constrained to graph allowed values.
- Clock deltas constrained to graph clock bounds.
- Narrator packets limited to narrator-safe cards and player-safe facts.
- Command Log packets bound to committed outcome ids.

Mission Director loop tests should add:

- Generated packet comparison against a known turn fixture.
- Pressure focus selection from actor intentions, readiness gates, and scene budget.
- Input immutability for graph, projection, crew dataset, and fixture state.
- Hesperus Command Moment award prevention after the same moment has already been awarded.
- Captain approve/refuse/counteroffer variants for mission-abandoning moves.

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
