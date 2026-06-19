# Initial Development Sequence

## Principle

Lock down identity, package model, state, transactions, and architecture before building complex Director behavior. Directive is pre-alpha, so do not preserve old compatibility paths when a clean version is better.

## Phase 0: Documentation And Decisions

- Create initial docs.
- Record established design baseline.
- Record Saga donor review.
- Record starship package model.
- Record persistence and transaction requirements.
- Collect unresolved mechanics questions before implementing those mechanics.

Exit condition: docs identify what is locked, what is open, and what must not be invented during implementation.

## Phase 1: Clean Extension Identity

- Add manifest with key `directive`.
- Add CSS entry with `directive` prefix.
- Add extension bootstrap, lifecycle, menu button, runtime mount, and action registry.
- Ensure no runtime `saga` identifiers are introduced.
- Create minimal shell with tabs: Starships, Mission, Crew, Ship, Log, Settings.

Exit condition: the extension loads as Directive and displays an empty working shell.

## Phase 2: Schema Version 1 And Storage Foundation

- Create default settings.
- Create default campaign state.
- Create package/campaign/ledger storage records.
- Create creator-draft and save indexes for list/load behavior.
- Add backup and state-safety primitives.
- Add stale-write detection.
- Add import/export skeletons.

Exit condition: state can be initialized, saved, exported, restored, and diagnosed without Saga compatibility baggage.

## Phase 3: Starship Package Loader

- Maintain bundled Breckinridge package skeleton as schema-valid JSON.
- Maintain the Ashes of Peace main campaign shell in the package data.
- Use the approved top-level package spine: `manifest`, `ship`, `crew`, `characterCreation`, `mainCampaign`, `sideMissionRules`, `missionTemplates`, `guardrails`, `assets`.
- Maintain the package-driven `characterCreation` domain before runtime campaign start is implemented.
- Keep `node tools\scripts\validate-starship-package.mjs` passing while the schema evolves.
- Keep `node tools\scripts\verify-repo-structure.mjs` passing as repo ownership boundaries are added.
- Define package manifest and validation.
- Render package list in Starships tab.
- Start a campaign from a package.
- Separate package template state from campaign state.

Exit condition: the Breckinridge package can create a new campaign and supply Character Creator options without hardcoding every field in runtime code.

## Phase 4: Authoritative State And Transaction Foundation

- Implement turn ledger.
- Implement snapshots.
- Implement transaction manager.
- Implement no-provider deterministic fixtures for turn resolution.
- Prove swipe/edit/delete/branch rules in tests.

Exit condition: no complex mission logic is needed to prove transaction safety.

## Phase 5: Basic Panels

- Package-driven Character Creator.
- Character Creator draft save and resume before review acceptance.
- First save creation after Character Creator review.
- Save Game, Save Game As, and Load Game record helpers.
- Mission overview.
- Crew roster and detail.
- Ship state overview.
- Command Log list and detail.
- Settings provider and debug sections.

Exit condition: the player can inspect core state on desktop and phone-width layouts.

## Phase 6: First Adjudication Path

- Turn classifier.
- Intent parser.
- Capability validator.
- Deterministic action resolver.
- Outcome packet.
- State delta validator.
- Prompt composer for narration.

Exit condition: one consequential action can be resolved, committed, narrated, and logged.

## Phase 7: Prelude Mission

- Implement the Ashes of Peace prelude mission, A Ship Underway.
- Store the mission definition as loadable JSON, not as hardcoded runtime state.
- Define mission truth, fronts, clocks, revelations, directives, B-plot, and end states.
- Implement Director event selection from causal sources.
- Add first Command Decision fixture after mechanics questions are answered.

Exit condition: the prelude can introduce the player, hand off XO authority, exercise initial crew trust and technical-debt consequences, and complete through multiple strategies while preserving state.

## Future Phase: Side Mission Generation

- Define side mission interval rules.
- Define side mission templates and package constraints.
- Carry current campaign, crew, relationship, ship, and obligation state into generated side missions.
- Commit side mission outcomes back into the same campaign continuity.

This phase depends on stable package schema, mission graph schema, campaign state, and at least one completed main campaign mission.

## Future Phase: Starship Creator

- Add draft-project storage for starship package creation.
- Build a staged package authoring workflow.
- Support LLM-assisted drafting with review gates.
- Validate drafts through the same package schema used by bundled packages.
- Export finalized packages through the standard package transport.

This phase depends on stable package schema, package loading, package validation, and campaign creation.

## Future Phase: Mission Creator

- Add draft-project storage for mission creation.
- Build a mission graph authoring workflow.
- Support LLM-assisted mission drafting with review gates.
- Validate mission truth, fronts, clocks, revelations, directives, B-plots, and end states.
- Export finalized mission packages through the standard package transport.

This phase depends on stable mission graph schema, Director state, transaction safety, and at least one proven authored mission.

## Current Active Plan

The initial sequence has reached the first playable runtime slice. Continue development through [Next Ten Development Stages](NEXT_TEN_DEVELOPMENT_STAGES.md), beginning with Stage 11: Senior Readiness Conference.
