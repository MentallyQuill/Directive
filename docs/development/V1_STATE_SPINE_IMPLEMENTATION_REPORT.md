# V1 State Spine Implementation Report

## Status

Implemented and certified as an additive shadow architecture on branch `rearchitected`.

This is a readiness result for the generic Story Settlement and mission-state spine. It is not a claim that Ashes of Peace, the player-facing Mission UI, or the live SillyTavern turn path has cut over to V1.

## Delivered Runtime Boundary

The implementation adds a versioned path from accepted source custody to durable semantic state:

```text
accepted SillyTavern source identity
    -> bounded evidence proposal
    -> source, branch, swipe, hash, role, and revision validation
    -> deterministic mission reduction
    -> zero or one Story Settlement episode
    -> one compare-and-swap state-gateway transaction
```

The spine writes only `storySettlement` and `mission.v1`. Existing mission fields, ship state, relationships, Command Bearing, and other legacy projections remain untouched. This isolation is intentional until Ashes data and UI consumers are migrated and parity-tested.

## Implemented Contracts and Mechanics

### Versioned state

- Strict V1 Story Settlement, episode, receipt, Focus, mission-definition, mission-state, predicate, and evidence records.
- Stable IDs and explicit schema versions at durable boundaries.
- Unknown kinds, states, operators, references, duplicate IDs, dependency cycles, and ambiguous terminal transitions fail validation.
- `storySettlement` and `mission.v1` are optional in the campaign projection schema, so legacy saves remain valid.

### Freeform interpretation without phrase brittleness

The deterministic layer does not search player prose for fixed phrases. A future bounded interpreter may understand varied prose and propose typed claims using authored IDs. Code then validates the claims and commits only authorized effects.

This separates two different failure modes:

- interpretation may miss an unusual expression, which can be retried or improved without corrupting state;
- state authority remains deterministic, source-backed, versioned, and replayable.

No model call or prompt integration was added in this slice. The evidence contract is the seam that a later interpreter must use.

### Mission state and objectives

- Required, optional, and conditional objectives have independent availability, visibility, progress, and terminal disposition.
- Predicates use authored facts, events, outcomes, objective state, clock state, and mission state rather than array order.
- Claim order and objective-definition order do not affect the reduced result.
- Closure uses an authored predicate and produces one idempotent transition receipt and authorized narration packet.
- Hidden or undiscovered optional content cannot block or downgrade primary success.
- Material costs can produce `primarySuccessWithCost` without converting rescue success into failure.

The Hesperus reference fixture proves that rescuing the crew closes the primary mission successfully even if fraud is never discovered. If fraud is sufficiently disclosed and evidence is preserved within the accepted settlement batch, accountability becomes a resolved optional result and is summarized separately.

### Knowledge and deadline fairness

- A player message may prove intent or a recorded decision; it cannot self-certify success, a world fact, or an observed outcome.
- Evidence is checked against the accepted current branch, message, selected swipe, content hash, source role, target ID, and allowed effect mapping.
- Hidden clocks can cause authored world effects but do not render deadlines or silently grade the player.
- Visible clocks have explicit authored state and resolve or expire deterministically.

The generic spine enforces custody and projection safety. Full Duty Report delivery, captain fallback, and informed-action grading still require Ashes mission data and live orchestration in the migration phase.

### Story Settlement and tracking restraint

- One scene can have zero or one open semantic episode.
- A meaningful scene seals as one concise episode containing typed effects and source contribution references.
- An insignificant scene creates a compact processing receipt instead of a story entry.
- Duplicate contributions, effects, and replays are idempotent.
- Full transcript text is not copied into Story Settlement.
- Focus may point to one unresolved consequence; it does not create another quest or truth source.

Ship, crew, relationship, and other player-facing aggregate projections are not implemented by this slice. The episode/effect structure gives those later projections one shared semantic source instead of independent event spam.

### Swipes, edits, deletion, and branches

- Accepted evidence is bound to branch, message, selected swipe, content hash, and source contribution.
- Stale mission or gateway revisions fail closed before persistence.
- Invalidation targets exact source contribution IDs, invalidates dependent Story episodes, and rebuilds mission state from surviving bounded evidence.
- Repeated or unrelated invalidations are no-ops and do not persist a new revision.
- Legacy state is preserved during both settlement and reconstruction.

## Robustness Challenge

| Concern | Implemented mitigation | Remaining break point |
|---|---|---|
| Varied player prose | Typed proposal seam; no phrase matching in reducers | Interpreter recall and prompt quality need live evaluation |
| Model invents state | Known targets, effect allowlists, source custody, and deterministic predicates | An over-permissive campaign definition could authorize weak evidence |
| Swipe or edit changes meaning | Selected-swipe/hash validation and exact contribution invalidation | Live host event wiring and long-history reconstruction need certification |
| Duplicate tracking spam | Zero/one episode, no-significance receipts, typed effects in one chronology | Aggregate Ship/Crew/relationship projectors are not cut over yet |
| Linear or railroaded missions | Predicate dependencies and order-independent reduction | Poorly authored predicates can still create authored rails or dead ends |
| Hidden objective unfairness | Hidden optional content cannot block or downgrade closure | Fair reveal routes and Duty Reports must be authored per mission |
| Hidden timers punish players | Hidden clocks are causal but not evaluative or player-visible | Campaign authors can still create unfair visible clocks without content review |
| Partial mission success | Outcome dimensions and explicit success-with-cost dispositions | Each mission needs a reviewed outcome matrix; the reducer cannot invent one |
| Replays and retries duplicate effects | Stable evidence keys, claim IDs, transition receipts, and no-op replay | Cross-version migration of IDs needs fixture coverage |
| Concurrent/stale analysis | Mission revision validation plus gateway compare-and-swap | Model work may be wasted and require retry after fast source changes |
| Source removal corrupts state | Evidence provenance and deterministic rebuild from survivors | Missing or legacy provenance can require recovery rather than exact replay |
| Legacy cutover breaks saves | Optional schema fields and shadow-only writes | Dual-write drift will persist until parity proves legacy retirement safe |

## Deliberate V1 Complexity Limits

The implementation does not add a general rules language, arbitrary executable predicates, automatic quest generation, relationship-event mining, model-owned state mutation, or a second semantic ledger. These exclusions keep the V1 authority boundary inspectable.

One subtle limit is important: optional Hesperus accountability can settle alongside primary rescue when its supported claims are part of the same accepted reduction batch. Post-transition enrichment of a terminal mission is not implemented. Migration must either gather all accepted scene evidence before emitting the transition or explicitly author a later follow-up mission/effect.

Transition target records are structurally validated, but reachability against an entire campaign package cannot be certified until Ashes is migrated. Reconstruction currently replays the bounded accepted evidence log; it does not reinterpret the raw transcript.

## Verification Evidence

The seven direct V1 suites pass:

- Story Settlement structural contracts;
- mission-definition contracts;
- declarative predicates;
- accepted-source evidence validation;
- Hesperus mission reduction, clocks, mixed outcomes, and ordering;
- Story Settlement lifecycle and invalidation;
- state-gateway shadow integration and legacy isolation.

Six focused legacy regression suites also pass:

- story-ledger projection;
- state-delta gateway;
- source reconciliation engine;
- scene-handshake settlement;
- Mission Director story-graph spine;
- legacy mission state-delta contract.

The full alpha gate passed all 242 checks from the `rearchitected` worktree.

The first full-gate run exposed one implementation-adjacent fixture collision: the new V1 mission definition used the legacy flat mission-graph fixture directory and suffix, so the older graph-fixture test attempted to read it as a graph scenario. Moving versioned mission-definition fixtures into `tests/fixtures/mission/v1/` preserved strict legacy validation and eliminated the type ambiguity. The affected legacy fixture test and both V1 fixture consumers passed before the complete gate was rerun.

## Readiness Decision

The generic spine is suitable as the architectural foundation for V1. Its highest-risk boundaries are isolated behind explicit contracts, and the current tests demonstrate deterministic custody, fairness, ordering, replay, and source invalidation without mutating legacy player state.

It is not player-ready. The next implementation plan is the Prelude/Hesperus V1 vertical slice:

1. migrate Prelude and Hesperus into V1 mission definitions, evidence mappings, reveal routes, clocks, outcome dimensions, and transitions;
2. add the bounded interpretation and Duty Report path that produces evidence proposals from accepted chat;
3. wire the shadow spine into the real accepted-pair lifecycle and certify swipes, edits, deletion, saves, reload, and branches;
4. build high-value Mission and aggregate Ship/Crew projections from V1 state;
5. compare V1 and legacy results, then retire legacy writers only after parity and migration gates pass;
6. certify the complete slice in live `default-user` before converting the remainder of Ashes.

Non-Ashes campaigns remain greyed, unselectable previews for V1 and do not constrain this cutover.
