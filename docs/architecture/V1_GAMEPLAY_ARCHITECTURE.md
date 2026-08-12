# V1 Gameplay Architecture

## Status

Implemented V1 authority. Directive does not load, translate, mirror, or migrate any earlier runtime state.

## Product thesis

Directive does one thing first: help SillyTavern sustain a coherent, authored command story. It does not turn every mention into a tracker. The model writes provisional prose; bounded model calls may identify authored evidence candidates; deterministic code alone decides what becomes campaign truth.

## Runtime flow

```text
selected assistant response + next player message
    -> exact accepted-pair snapshot
    -> bounded time and mission interpretation
    -> deterministic evidence validation and reduction
    -> one V1 state transaction
    -> Story Settlement accumulation or episode seal
    -> concise mission, story, people, ship, and Command Bearing projections
    -> one chat-bound narration context packet
```

An assistant response is not accepted merely because it was generated. It becomes eligible only when the player sends the next message while that response is selected. Swiping before then replaces the provisional source. Editing, deleting, hiding, or changing the selected swipe invalidates the affected contribution and rebuilds derived state from surviving accepted evidence.

## State authority

Every save is `directive.campaignSave.v1` and contains an exact, architecture-stamped campaign state. The allowed roots are fixed in `src/runtime/v1-campaign-state.mjs`; unknown and missing roots are rejected. Campaign and package identity, the immutable player and ship records, world and accepted-time custody, mission and story authority, Command Bearing, settings, chat binding, and state custody are structurally validated before load or commit. Cross-root player/ship, package, branch, and time bindings must agree. State changes pass through a compare-and-swap gateway with exact domain allowlisting and persistence conflict handling.

## Timeline and saved-game authority

`index.activeSaveId` is the sole selector for the mutable active timeline. Saved games are immutable `checkpoint` records grouped by campaign ID, so saves from earlier forks remain visible after their source active records are retired.

A native SillyTavern branch becomes playable only when the host adapter proves that it came from the exact active campaign chat: the direct `main_chat`, character entity, parent endpoint `extra.branches` backlink, retained message roles and IDs, selected swipe, and selected-text hashes must all match. Filenames are presentation only. The child state is reconstructed by invalidating discarded accepted sources through an isolated state gateway, rebuilding accepted time and Command Bearing, rebinding save/chat/branch custody, rebuilding derived mission-run identities, and validating the complete player projection. No interpreter, narrator, or episode-evaluator call occurs during this reconstruction.

Native branching and Load Game are serialized, journaled transactions. They preserve the timeline being left before persisting a child inactive, write exact chat binding, and compare-and-swap the active pointer as the semantic commit point. Recovery stays with the parent before that point and moves forward to the child afterward. Load Game clones an immutable saved chat into a fresh playable chat and never mutates the selected save.

The semantic authorities are:

- mission definitions: authored rules and hidden truth;
- mission reducer: facts, knowledge, objectives, outcomes, clocks, and terminal state;
- Story Settlement: aggregate story chronology and typed lasting effects;
- Command Bearing: neutral reserve, explicit awards, and explicit spends;
- time ledger: accepted story time;
- projections: rebuildable, player-safe views only.

Chat prose, UI state, prompt text, model analysis, and bundled narrative guides cannot commit truth directly.

Command Bearing spending follows the same acceptance rule as story state. A point is reserved before generation, armed to the exact prompting player message, and committed only when the beneficiary assistant response is selected and accepted by the next player message. Source mutation or pre-acceptance cancellation refunds it.

## Tracking policy

Immediate mission mechanics may change on an accepted pair when validated authored evidence warrants it. Player-facing story memory changes at semantic episode boundaries, not every turn. A routine exchange may produce no story entry. A substantial scene normally becomes one episode even if it contains several decisions, facts, character moments, and ship consequences.

Ship output is one operational aggregate plus material limitations. People output begins with the accepted commander identity and portrait, followed by stable public crew profiles, a current visible posture when established, and at most three defining accepted moments. Mission output contains only visible objectives, known clocks, visible outcomes, and the current terminal or transition state.

## Missions

Mission definitions support required, optional, and conditional objectives; non-linear predicates; discoverable facts; fair failure conditions; outcome dimensions; known deadlines; Duty Report routes; entry capabilities; terminal dispositions; and deterministic transitions. Completion depends on `closeWhen`, not checklist order. Hidden facts never appear merely because they exist in package data.

The model recognizes prose variation by selecting from a closed candidate set built from the active mission. Deterministic validation checks source identity, branch, swipe, hash, policy, predicates, revision, and target before reduction. This division is flexible about prose and strict about authority.

## Fairness

Players are judged for informed action, not for failing to discover unknowable information. Important discoverable facts have authored delivery routes. Captain Whitaker and other qualified officers can disclose, warn, or recommend through ordinary story dialogue. Optional work may change outcomes or Command Bearing eligibility, but undiscovered optional content does not silently count as player failure.

## UI

The ship icon beside SillyTavern's composer opens Directive. The UI has five routes: Campaign, Mission, People, Ship, and Settings. Each fact has one primary home. Campaign acceptance makes the player identity immutable except for its portrait, and People receives the record through the exact `directive.playerIdentityProjection.v1` projection. The player may add, replace, or confirm removal of that portrait through a path-restricted `playerPortrait` state domain; every other player field remains outside runtime mutation authority. No route exposes hidden objectives, internal confidence, proposal queues, raw evidence, or recovery machinery.

## V1 content scope

Ashes of Peace is the only playable campaign. Other campaign identities and images may appear as static, disabled previews. They have no packages, saves, mission state, or activation path in V1.

## Non-negotiable exclusions

V1 contains no save migration, compatibility hydration, shadow writers, alternate trackers, quest ledger, command log, thread ledger, reconciliation workflow, manual semantic editing, sidecar scheduler, inspiration/resolve split, ranks, marks, anti-cheat enforcement, or per-mention ship issue creation.
