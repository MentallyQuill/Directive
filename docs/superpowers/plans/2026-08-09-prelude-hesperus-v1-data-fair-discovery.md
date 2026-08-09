# Prelude and Hesperus V1 Data and Fair Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a package-owned, spoiler-safe Prelude/Hesperus V1 mission definition whose facts, disclosures, objectives, clocks, mixed outcomes, and Duty Reports can only advance through authored evidence policies.

**Architecture:** Extend the existing V1 mission definition with a closed evidence-policy and Duty Report vocabulary. Separate authored world truth from player knowledge, validate model proposals against exact policy IDs and deterministic preconditions, then migrate Prelude and Hesperus as one non-linear mission definition with fixture-proven outcomes. Add a data-only player projection and package linter, but do not change the Directive UI or activate the definition in the live turn path in this plan.

**Tech Stack:** JavaScript ES modules, JSON Schema Draft 2020-12, dependency-free Node assertions, existing V1 mission reducer and alpha-gate runner.

## Global Constraints

- Work only on branch `rearchitected` in `F:\git\Directive\.worktrees\rearchitected`.
- The approved V1 architecture and Ashes migration plan govern; legacy quest percentages and tracker rows are migration evidence, not target behavior.
- Ashes of Peace is the only playable V1 campaign target.
- No player-facing UI rendering or layout changes are authorized by this plan.
- A model may propose a stable policy and claim; it cannot establish authority, truth, disclosure, success, time, or mission closure by prose alone.
- World truth and player knowledge are separate state dimensions.
- `factDisclosed` cannot create world truth and is invalid unless the fact is already true in authoritative state or is validly established in the same proposal.
- Player-authored sources may prove only intent and recorded player decisions.
- Only runtime or adjudicator sources may establish world facts or advance authoritative time.
- Every accepted claim must cite one authored evidence policy whose target, claim type, source role, and predicate match.
- Hidden optional objectives cannot block, downgrade, or leak into primary completion or visible counts.
- Only authored clocks whose basis is player-known may appear in the data-only projection.
- Hesperus fraud remains absent from the initial and undiscovered player projections.
- The migrated definition must use state predicates, not array position or exact player phrasing.
- Do not disable legacy writers or wire live settlement in this plan; the subsequent runtime-cutover plan consumes these proven contracts.

---

### Task 1: Machine-Readable Migration Inventory

**Files:**
- Create: `tools/scripts/inventory-ashes-v1-migration.mjs`
- Create: `tools/scripts/test-ashes-v1-migration-inventory.mjs`
- Create: `packages/bundled/breckenridge/v1/prelude-hesperus-migration-map.json`
- Create: `docs/development/ASHES_V1_MIGRATION_INVENTORY.md`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: the current Ashes package, projection, Prelude graph, and repository source tree.
- Produces: `buildAshesV1MigrationInventory({ packageData, projection, missionGraph, sourceRecords })` and a reviewed migration map whose entries use `migrateDefinition`, `migrateEffect`, `deriveProjection`, `mergeAggregate`, `retainSource`, `retire`, or `deferV1`.

- [x] **Step 1: Write the failing inventory test**

Assert that the inventory identifies all ten Prelude phases, thirteen graph facts, eight decision points, twelve outcome flags, two Hesperus pressures, five legacy quest objectives, the fraud spoiler in player-visible package/projection copy, and direct writers for `ship.technicalDebt`, `threadLedger.records`, relationship memory, legacy mission state, and quest state.

```js
const inventory = buildAshesV1MigrationInventory(inputs);
assert.equal(inventory.legacyIds.phases.length, 10);
assert.equal(inventory.legacyIds.facts.length, 13);
assert.equal(inventory.spoilerFindings.some((item) => item.text.includes('maintenance fraud')), true);
assert.equal(inventory.writerFindings.some((item) => item.path === 'ship.technicalDebt'), true);
assert.equal(inventory.unmappedIds.length, 0);
```

- [x] **Step 2: Run the inventory test and verify RED**

Run: `node tools/scripts/test-ashes-v1-migration-inventory.mjs`

Expected: failure because the inventory module and migration map do not exist.

- [x] **Step 3: Implement deterministic inventory extraction**

Export a pure builder and a CLI. The builder extracts stable IDs by collection, scans only supplied source records for literal mutable paths, records player-copy spoiler findings case-insensitively, joins every legacy ID to the reviewed migration map, and returns sorted arrays. The CLI reads the canonical Ashes files and prints JSON unless `--check` is supplied.

```js
export const ASHES_V1_MIGRATION_INVENTORY_KIND = 'directive.ashesV1MigrationInventory.v1';
export function buildAshesV1MigrationInventory({
  packageData,
  projection,
  missionGraph,
  sourceRecords = [],
  migrationMap,
} = {}) {}
```

Do not infer semantic dispositions from prose. The reviewed map is authoritative and the script fails when a detected legacy ID has no entry.

- [x] **Step 4: Author the reviewed Prelude/Hesperus migration map**

Map the legacy five objectives to four V1 primary objectives plus one conditional optional accountability objective. Map Hesperus facts into separate observable inconsistency, record discrepancy, confirmed falsification, and supported actor-attribution facts. Mark legacy percentage progress as `retire`, current graph/quest prose as `retainSource`, Hesperus pressures as typed causal effects, technical-debt rows as `mergeAggregate`, and duplicate thread/quest/story outputs as `deriveProjection` or `retire`.

- [x] **Step 5: Write the human-reviewed inventory report**

The report names every writer and consumer family, the known player-facing fraud leak, the five-objective percentage model, duplicated Story/Quest/Thread/Ship/relationship paths, exact migration dispositions, and the explicit non-goal of preserving legacy row identity.

- [x] **Step 6: Run, register, and commit Task 1**

Run:

```powershell
node tools/scripts/test-ashes-v1-migration-inventory.mjs
node tools/scripts/inventory-ashes-v1-migration.mjs --check
```

Expected: both pass with no unmapped IDs.

Commit:

```text
docs(migration): inventory Prelude authority
```

### Task 2: Authored Evidence Policies and Truth Separation

**Files:**
- Modify: `src/mission/v1/mission-contracts.mjs`
- Modify: `src/mission/v1/evidence-contracts.mjs`
- Modify: `src/mission/v1/mission-state.mjs`
- Modify: `src/mission/v1/mission-reducer.mjs`
- Modify: `schemas/mission/mission-v1.schema.json`
- Modify: `tools/scripts/test-v1-mission-contracts.mjs`
- Modify: `tools/scripts/test-v1-mission-evidence.mjs`
- Modify: `tools/scripts/test-v1-mission-reducer.mjs`
- Modify: `tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json`

**Interfaces:**
- Consumes: existing declarative predicates and accepted source resolution.
- Produces: indexed `evidencePolicies`, `worldFactEstablished` claims, fact `initiallyTrue`, policy-bound proposal validation, and deterministic causal claim ordering.

- [x] **Step 1: Write failing contract tests for evidence policies**

Require mission definitions to include `evidencePolicies`. Validate unique policy IDs, known target IDs, the exact claim-type/target-collection mapping, non-empty source roles, declarative `when`, and a `worldFact` precondition for every `factDisclosed` policy.

```js
const policy = {
  id: 'policy.hesperus-fraud-disclosed',
  claimType: 'factDisclosed',
  targetId: 'fact.hesperus-fraud-confirmed',
  sourceRoles: ['assistant', 'runtime', 'adjudicator'],
  when: { worldFact: 'fact.hesperus-fraud-confirmed' },
};
```

Facts require `initiallyTrue: true|false`. `indexMissionDefinition()` exposes `evidencePolicies` alongside existing maps.

- [x] **Step 2: Run contract tests and verify RED**

Run: `node tools/scripts/test-v1-mission-contracts.mjs`

Expected: failures for missing policy validation and missing `initiallyTrue` handling.

- [x] **Step 3: Extend the runtime contract and JSON schema**

Add `evidencePolicies` as a required strict array and add `initiallyTrue` to every fact. Export:

```js
export const MISSION_EVIDENCE_POLICY_SOURCE_ROLES = Object.freeze(new Set([
  'user', 'assistant', 'runtime', 'adjudicator'
]));
```

The validator rejects `worldFactEstablished` policies unless all source roles are `runtime` or `adjudicator`, and rejects `timeAdvanced` policies with any other source role.

- [x] **Step 4: Write failing evidence tests for policy custody**

Cover unknown policy, policy target/type mismatch, unauthorized source role, unmet predicate, assistant attempts to establish truth, assistant time advancement, disclosure before truth, same-proposal establishment plus disclosure, and an informed player decision that requires a known fact.

```js
assert.equal(rejected.rejectedClaims[0].reasonCode, 'precondition-not-met');
assert.equal(disclosure.acceptedClaims[0].claimType, 'factDisclosed');
assert.equal(disclosure.acceptedClaims[0].policyId, 'policy.hesperus-fraud-disclosed');
```

- [x] **Step 5: Implement two-pass evidence validation**

Add `worldFactEstablished` to the closed claim vocabulary. First validate envelope, source custody, stable IDs, policy identity, target/type equality, value shape, and source role. Then construct a staged predicate context from valid establishment/event/outcome claims and evaluate each policy. Use stable rejection codes:

```text
unknown-policy
policy-mismatch
source-role-not-authorized
precondition-not-met
world-truth-authority-required
authoritative-time-required
```

`factDisclosed` is rejected unless its target is true in the staged world-fact set. Confidence never changes acceptance.

- [x] **Step 6: Write failing reducer tests for causal ordering**

Reverse a proposal containing `factDisclosed` and `worldFactEstablished`; both orders must yield the same separate arrays: the fact appears once in `worldFacts` and once in `knownFacts`. A disclosure-only claim must never add to `worldFacts`.

- [x] **Step 7: Implement deterministic claim ordering and initial truth**

Initialize `worldFacts` from facts whose `initiallyTrue` is true. Apply accepted claims by fixed causal rank, then stable `claimId`, regardless of model order:

```js
const CLAIM_REDUCTION_ORDER = Object.freeze({
  worldFactEstablished: 10,
  eventOccurred: 20,
  outcomeObserved: 30,
  factDisclosed: 40,
  intentExpressed: 50,
  decisionRecorded: 60,
  timeAdvanced: 70,
});
```

`worldFactEstablished` updates only `worldFacts`; `factDisclosed` updates only `knownFacts`.

- [x] **Step 8: Run focused suites and commit Task 2**

Run:

```powershell
node tools/scripts/test-v1-mission-contracts.mjs
node tools/scripts/test-v1-mission-evidence.mjs
node tools/scripts/test-v1-mission-reducer.mjs
node tools/scripts/test-v1-state-spine-runtime.mjs
```

Expected: all pass.

Commit:

```text
feat(mission): enforce evidence policies
```

### Task 3: Capability-Based Duty Report Planning

**Files:**
- Create: `src/mission/v1/duty-report-planner.mjs`
- Create: `tools/scripts/test-v1-duty-report-planner.mjs`
- Modify: `src/mission/v1/mission-contracts.mjs`
- Modify: `schemas/mission/mission-v1.schema.json`
- Modify: `tools/scripts/test-v1-mission-contracts.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: mission `reportRoutes`, mission state, available actor capability records, and delivered report IDs.
- Produces: `selectPendingDutyReport({ definition, state, availableActors, deliveredReportIds })` returning one authorized player-safe packet or `null`.

- [x] **Step 1: Write failing report-contract tests**

Add strict `reportRoutes` records:

```js
{
  id: 'report.hesperus-record-discrepancy',
  factId: 'fact.hesperus-record-discrepancy',
  evidencePolicyId: 'policy.hesperus-record-discrepancy-disclosed',
  capabilityRoles: ['engineering', 'operations'],
  preferredActorIds: ['hadrik-bronn'],
  fallbackActorIds: ['mara-whitaker'],
  urgency: 'material',
  when: {
    all: [
      { worldFact: 'fact.hesperus-record-discrepancy' },
      { not: { factKnown: 'fact.hesperus-record-discrepancy' } }
    ]
  },
  playerText: {
    summary: 'Engineering has a material discrepancy to report.'
  }
}
```

Validate the fact, evidence policy, source eligibility, actor IDs, capability roles, urgency enum, predicate references, and non-empty player-safe summary.

- [x] **Step 2: Run contract tests and verify RED**

Run: `node tools/scripts/test-v1-mission-contracts.mjs`

Expected: report routes are not yet validated.

- [x] **Step 3: Write failing selection tests**

Cover preferred capable officer, capable non-preferred officer, captain fallback, no available route, hidden truth, already-known fact, already-delivered report, stable route ordering, and absence of hidden fact text in diagnostics.

- [x] **Step 4: Implement deterministic report planning**

Filter routes by predicate and delivery status. Select the first available preferred actor who has a required capability, then any capable actor, then the first explicit fallback. Return:

```js
{
  kind: 'directive.dutyReportPacket.v1',
  reportId,
  reporterId,
  factId,
  playerText,
  authorizedClaim: {
    claimType: 'factDisclosed',
    targetId: factId,
    policyId: evidencePolicyId
  }
}
```

The planner does not mark knowledge, create narration, mutate mission state, or select a player decision.

- [x] **Step 5: Run, register, and commit Task 3**

Run:

```powershell
node tools/scripts/test-v1-mission-contracts.mjs
node tools/scripts/test-v1-duty-report-planner.mjs
```

Expected: both pass.

Commit:

```text
feat(mission): plan fair Duty Reports
```

### Task 4: Package-Owned Prelude/Hesperus V1 Definition

**Files:**
- Create: `packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json`
- Create: `tests/fixtures/mission/v1/prelude-hesperus-scenarios.fixture.json`
- Create: `tools/scripts/test-ashes-v1-prelude-mission.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: V1 mission, evidence-policy, predicate, reducer, and Duty Report contracts.
- Produces: the canonical V1 Prelude definition and scenario matrix used by later interpretation and runtime-cutover work.

- [ ] **Step 1: Write the failing package-definition test**

Load the canonical file, validate it, assert its stable package binding, and assert the initial projection contains no case-insensitive match for `fraud`, `falsif`, `corrupt`, `inspection`, or hidden objective counts.

- [ ] **Step 2: Author four high-value primary objectives**

Use state predicates for:

1. command handover with Whitaker;
2. senior-staff delegation and readiness;
3. conditional-required Hesperus rescue after the distress route activates;
4. final load/readiness review and arrival at the Reach.

The first two may progress in either order. The Hesperus rescue activates from an authored distress fact/report route rather than display sequence. Final review depends only on genuine readiness and rescue prerequisites. Do not store percentages.

- [ ] **Step 3: Author the spoiler-safe Hesperus discovery ladder**

Create distinct initially true or authoritatively established facts for observable distress, passenger risk, injector limits, record inconsistency, material record discrepancy, confirmed falsification, and supported owner attribution. Each disclosure has an exact evidence policy and player-safe report route. The optional accountability objective activates only after confirmed falsification is player-known.

- [ ] **Step 4: Author outcomes, clock, and terminal transitions**

Keep rescue quality, cost, optional accountability, command readiness, and arrival condition as separate outcome dimensions. The Hesperus clock begins causally when distress is established but becomes visible only when its risk basis is player-known. Primary success, primary success with cost, and limited/failure-forward terminal dispositions transition exactly once to `chapter-1-the-empty-convoy`.

- [ ] **Step 5: Author the scenario matrix**

Include machine-readable claim sequences for:

- rescue success with no discrepancy discovery;
- rescue success with material cost and no discovery;
- discrepancy known and handed off prudently;
- fraud confirmed with proportionate action;
- fraud confirmed with knowing inaction;
- informed rescue failure;
- rescue failure after an omitted material report;
- reversed objective completion order;
- unsupported player self-declared success;
- stale, wrong-swipe, and hallucinated-policy proposals.

- [ ] **Step 6: Run and commit Task 4**

Run: `node tools/scripts/test-ashes-v1-prelude-mission.mjs`

Expected: every scenario produces the authored primary and optional dimensions without spoiler leakage or order dependence.

Commit:

```text
feat(ashes): author V1 Prelude mission
```

### Task 5: Data-Only Player Projection and Package Lint

**Files:**
- Create: `src/mission/v1/player-projection.mjs`
- Create: `src/mission/v1/mission-package-linter.mjs`
- Create: `tools/scripts/test-v1-mission-player-projection.mjs`
- Create: `tools/scripts/test-v1-mission-package-linter.mjs`
- Create: `tools/scripts/validate-ashes-v1-prelude.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: a validated definition and mission state.
- Produces: `createMissionPlayerProjection({ definition, state })`, `lintMissionPackage({ definition, knownTransitionTargetIds })`, and a CLI validator for the canonical Ashes file.

- [ ] **Step 1: Write failing projection tests**

The initial projection contains only visible objectives, counts only currently visible primary objectives, omits hidden optional objectives entirely, and renders no clock until its player-known visibility predicate is true. At confirmed fraud knowledge it exposes one optional accountability objective without changing the primary completion denominator.

```js
assert.equal(initial.objectives.some((item) => /fraud|inspection/i.test(item.title)), false);
assert.equal(initial.progress.optionalTotal, 0);
assert.deepEqual(initial.clocks, []);
assert.equal(confirmed.progress.requiredTotal, initial.progress.requiredTotal);
assert.equal(confirmed.progress.optionalTotal, 1);
```

- [ ] **Step 2: Implement the data-only projection**

Return only title, summary, visible objective records, separate required/optional progress counts, visible known facts, visible clocks with unit/value/consequence, outcome dimensions that have values, and terminal transition summary. Do not return predicates, hidden IDs, hidden counts, `mustNotReveal`, world facts, evidence policies, report routes, or diagnostics.

- [ ] **Step 3: Write failing lint tests**

Reject initial player text containing configured spoiler terms, required objectives with no reachable terminal fixture, displayed clocks without an authored basis/consequence, transition targets outside the supplied package target set, optional objectives participating in closure, evidence targets without a usable policy, and disclosure routes whose facts can never become true.

- [ ] **Step 4: Implement linter and CLI**

The linter is deterministic and returns `{ ok, errors, warnings }`. The CLI validates the canonical Prelude file against known Ashes quest/mission target IDs and exits non-zero on any error or spoiler finding.

- [ ] **Step 5: Run, register, and commit Task 5**

Run:

```powershell
node tools/scripts/test-v1-mission-player-projection.mjs
node tools/scripts/test-v1-mission-package-linter.mjs
node tools/scripts/validate-ashes-v1-prelude.mjs
```

Expected: all pass and the initial player projection is spoiler-safe.

Commit:

```text
feat(mission): project spoiler-safe state
```

### Task 6: Certification and Runtime-Cutover Readiness

**Files:**
- Create: `docs/development/PRELUDE_HESPERUS_V1_DATA_READINESS.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`
- Modify: `docs/superpowers/plans/2026-08-09-prelude-hesperus-v1-data-fair-discovery.md`

**Interfaces:**
- Consumes: all Task 1-5 artifacts and current runtime characterization.
- Produces: an evidence-backed handoff for the subsequent interpretation and accepted-pair cutover plan.

- [ ] **Step 1: Run all new and affected tests**

Run the inventory, mission contracts, evidence, reducer, Duty Report, Ashes Prelude, player projection, package linter, and V1 state-spine runtime suites directly.

- [ ] **Step 2: Run the complete alpha gate**

Run: `npm.cmd test`

Expected: all registered checks pass. Any regression blocks completion.

- [ ] **Step 3: Challenge the data slice**

Document exact evidence for truth/knowledge separation, policy custody, varied prose compatibility, fair disclosure, no hidden grading, non-linear ordering, no percentage progress, real clock visibility, mixed Hesperus outcomes, source reconstruction compatibility, and absence of UI mutation.

- [ ] **Step 4: Write and index the readiness report**

State precisely that package data and deterministic mechanics are ready, while provider interpretation, accepted-pair runtime wiring, domain aggregate projection, legacy-writer retirement, UI rendering, and live SillyTavern certification remain unimplemented.

- [ ] **Step 5: Mark this plan complete and commit Task 6**

Commit:

```text
docs(ashes): certify V1 Prelude data
```

## Completion Boundary

This plan is complete when Prelude/Hesperus has one validated package-owned V1 definition, every external claim is policy-bound, world truth is distinct from player knowledge, Duty Reports are deterministically selectable, the outcome matrix and spoiler-safe data projection pass, and the full alpha gate remains green. It does not activate V1 in live chat or change the Directive UI. The next plan wires bounded interpretation and accepted-pair settlement to this definition, then reaches the explicit UI approval gate.
