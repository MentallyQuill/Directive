# V1 Semantic Authority Cutover Implementation Plan

> This plan executes the approved V1 semantic authority cutover without player-facing UI changes.

## Goal

Make fresh Ashes saves explicitly V1-native, route accepted pairs through Story Settlement as the only semantic authority, preserve unstamped saves on the legacy path, and disconnect competing semantic writers in V1 scope.

## Phase 1: Authority contract and fresh-save stamp

1. Add a pure runtime-authority contract module with manifest opt-in, stamp creation, stamp validation, and `legacy` / `authoritative` / `blocked` resolution.
2. Add failing contract tests for exact package binding, malformed stamps, missing definitions, and unstamped legacy saves.
3. Stamp only newly created campaign state from opted-in package manifests.
4. Update the Ashes package architecture identifier and validate the bundled package/projection.

## Phase 2: Accepted-pair route cutover

1. Replace the legacy-first sequence characterization with failing tests for mutually exclusive authority paths.
2. Extract exact snapshot preparation from legacy settlement so V1 can use custody without semantic legacy writes.
3. Route authoritative saves to V1 only; route unstamped saves to legacy only; never fall back from blocked V1 to legacy.
4. Rename shadow-facing internal result semantics where they become authoritative while retaining temporary API aliases only where compatibility tests require them.

## Phase 3: Narrow V1 time custody

1. Add failing tests that accepted-pair time is exact-once and changes only `campaign`, `worldState`, and `timeLedger` roots.
2. Implement the time custodian with the current bounded adjudicator, canonical world-time advance, and `directive.timeBoundary.v1` ledger record.
3. Run time custody before V1 reduction so authored mission clocks consume committed evidence.
4. Prove no legacy open-world reaction, quest, thread, event, attention, or dynamic-quest roots change.

## Phase 4: Semantic writer gates

1. Add a shared `allowsLegacySemanticWriters` decision derived from the authority contract.
2. Gate Narrative Thread post-commit processing and automatic conversation-to-quest promotion.
3. Gate legacy sidecars and committed-turn domain mutations that create relationship, ship, story, mission, quest, reaction, or Command Bearing semantics.
4. Retain only explicitly enumerated infrastructure/presentation writers and prove their root allowlists.
5. Add source scans and behavior tests that V1 turns cannot grow the retired ledgers.

## Phase 5: Projection and narrator cutover

1. Build the composite V1 player projection for authoritative saves at activation and prompt refresh.
2. Render a bounded V1 narrator packet from mission, story, ship, people, known facts, Duty Reports, deadlines, and transition authority.
3. Remove or suppress redundant legacy prompt blocks in V1 scope while retaining static campaign, character, ship-layout, and safety context.
4. Add hidden-canary, spoiler, budget, stale-source, activation, reload, and transition narration tests.

## Phase 6: Open-world sibling scheduling

1. Define deterministic authored sibling availability for the Dead Letters / Colony and Open Orders packages.
2. Separate available mission work from the single current narrated focus without automatic dynamic quests.
3. Prove either valid sibling order, stable mission identity, deterministic convergence, and one campaign conclusion.

## Phase 7: Certification and UI boundary

1. Run focused tests after every phase and the complete alpha gate after each committed slice.
2. Run isolated installed-copy and live accepted-pair/source-mutation soaks on fresh V1 Ashes saves plus one unstamped legacy control.
3. Record architecture, prompt, mission, story, time, writer-retirement, reload, and conclusion evidence.
4. Stop before player-facing UI edits and present only the minimal projection/display gaps requiring approval.

## Completion Criteria

The non-UI cutover is complete when new Ashes saves are V1-authoritative end to end, unstamped saves remain isolated, narrator context consumes V1 projections, sibling scheduling is open-world safe, retired semantic ledgers do not grow during V1 play, full deterministic tests pass, and live source-mutation/reload/conclusion evidence is recorded. UI work remains approval-gated.
