# Ashes V1 Migration Inventory

## Status

Reviewed Prelude/Hesperus migration inventory for the V1-native Ashes of Peace conversion.

The machine-readable authority is [the migration map](../../packages/bundled/breckenridge/v1/prelude-hesperus-migration-map.json). `node tools/scripts/inventory-ashes-v1-migration.mjs --check` verifies that the current canonical Ashes package, projection, Prelude graph, direct semantic writers, and known consumers remain fully mapped.

This inventory is evidence for migration. It does not make the legacy identifiers or record shapes part of V1.

## Canonical Inputs

- `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json`
- `packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json`
- `packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json`
- current source writers and consumers named below

## Legacy Content Surface

| Collection | Count | V1 treatment |
|---|---:|---|
| Prelude phases | 10 | merge into four predicate-driven primary objectives and typed effects |
| Mission-graph facts | 13 | migrate high-value facts, split the fraud fact into a discovery ladder, aggregate ship facts, retain or defer source-only color |
| Decision points | 8 | migrate durable outcomes; do not retain exact-intent routing |
| Command decisions | 1 | migrate the informed accountability outcome without a separate Command Decision tracker |
| Outcome flags | 12 | migrate material mission outcomes; derive crew and ship projections from shared effects |
| Hesperus pressures | 2 | migrate passenger risk into a real clock and accountability pressure into conditional effects |
| End states | 3 | migrate to primary success, success with cost, and limited/failure-forward terminal dispositions |
| Legacy quest objectives | 5 | merge into four primary objectives plus one hidden-until-known optional accountability objective |

The map contains 54 reviewed identity entries. Legacy incremental progress percentages are retired; the V1 reducer uses evidence-backed predicates and terminal dispositions.

## Confirmed Player-Facing Spoiler Leak

The current package and initial quest projection expose the same hidden information in four player-facing fields:

- Prelude objective 3 `summary`;
- Prelude objective 3 `label`;
- Prelude objective 3 `playerText`;
- projected Prelude objective 3 `summary`.

All say, in substance, that Hesperus involves maintenance fraud. V1 replaces this with a rescue responsibility. Record inconsistency, discrepancy, confirmed falsification, and supported attribution are separate facts disclosed only through evidence policies and report routes.

## Direct Semantic Writers

| Writer | Current authority | V1 disposition |
|---|---|---|
| `src/runtime/scene-handshake-settler.mjs` | writes `ship.technicalDebt` and `threadLedger.records` from accepted conversation | ship meaning merges into one aggregate; independent thread rows retire |
| `src/runtime/source-settlement-latest-pair-validation.mjs` | validates operations that write `ship.technicalDebt` and `threadLedger.records` | same aggregate/retirement boundary; validation remains only until cutover |
| `src/runtime/turn-commit-coordinator.mjs` | commits per-turn relationship-memory derivation | relationship posture and rare lasting moments derive from Story Settlement effects |
| `src/mission/phase-advancement.mjs` | advances hard-coded phases from exact intent labels and result bands | retire for migrated missions; V1 objective and closure predicates own progression |
| `src/quests/quest-ledger.mjs` | owns legacy quest instances and percentage objective state | retire as a semantic authority for V1-native missions |

The inventory script uses file-scoped mutation signatures. Merely reading `questLedger`, `technicalDebt`, threads, or relationships does not classify a module as a writer.

## Known Consumers

| Consumer family | Current inputs | Cutover requirement |
|---|---|---|
| Player-safe prompt builder | formal objectives, quest instances, relationships, technical debt | consume one V1 player projection and aggregate domain projections |
| Latest-pair scene adapter | formal objectives, ship rows, threads, quest roots | consume V1 definition/state and Story Settlement summaries without becoming authority |
| Mission page | quest/thread-derived mission information | render the approved high-value V1 mission projection after UI approval |
| Crew page | quest work, relationship memory, threads | render stable posture and rare moments derived from Story Settlement |
| Ship page/runtime view model | technical-debt-derived operational rows | render one current operational aggregate |

## Hesperus Fact Conversion

The monolithic legacy `hesperus.inspection-fraud` fact becomes:

1. an observable record inconsistency;
2. a material record discrepancy;
3. confirmed falsification;
4. supported owner attribution.

World truth and player knowledge are separate. A fact can be causally true without appearing in the player projection. A disclosure cannot make a fact true, and the optional accountability objective does not exist in player-visible state until confirmation is known.

## Objective Conversion

The target mission uses:

1. command handover with Whitaker;
2. senior-staff delegation and readiness;
3. conditional-required Hesperus rescue after its authored distress activation;
4. final readiness review and arrival;
5. conditional optional Hesperus accountability after confirmed falsification is known.

The first two are parallel. Hesperus activates causally rather than by array order. Final review keeps only genuine readiness prerequisites. Optional accountability never contributes to the primary completion denominator and undiscovered fraud is absent rather than failed.

## Explicit Retirement Boundary

The V1 migration does not preserve:

- exact-intent phase advancement;
- 0-to-100 objective progress;
- separate story, quest, thread, ship, and relationship records for one scene;
- automatic technical-debt rows for mentioned observations;
- a required fraud objective;
- hidden objective counts;
- generic conversation-to-quest promotion;
- Scene Reconciliation as a player-facing truth editor.

Legacy files remain available as source and regression evidence until the runtime cutover proves parity. Their writers are disabled for V1-native mission scope only after accepted-pair, source-mutation, projection, and live-host gates pass.
