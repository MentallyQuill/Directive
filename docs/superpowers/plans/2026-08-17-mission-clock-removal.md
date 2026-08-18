# Mission Clock Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax (`- [ ]`) for tracking.

**Goal:** Remove every mission/objective countdown from Directive V1 and Ashes of Peace while preserving authoritative accepted story time, ship time, date, and Stardate.

**Architecture:** Mission authority becomes entirely evidence- and predicate-driven with no clock collection, clock predicates, or synthetic `timeAdvanced` mission claims. Accepted narration continues to advance the separate campaign `timeLedger`; Campaign and Mission chronometers continue to project that canonical chronology. A narrowly guarded package migration upgrades only Ashes `0.3.0-pre-alpha.1` saves to `0.3.0-pre-alpha.2`, replays surviving mission evidence against clockless definitions, and refuses ambiguous expired-deadline histories.

**Tech Stack:** Node.js ESM, JSON Schema Draft 2020-12, DOM JavaScript, CSS, custom Node assertion scripts, SillyTavern extension storage.

**Spec:** `docs/superpowers/specs/2026-08-17-mission-clock-removal-design.md`

## Global Constraints

- Preserve `campaignState.timeLedger`, accepted-pair elapsed seconds, `directive.timePlayerProjection.v1`, ship clock/date/Stardate rendering, and their current formats.
- Remove only mission clocks: definitions, state, evidence claims, predicates, reducer behavior, runtime materialization, projection, panel markup, and clock-specific CSS.
- Bump Ashes package version from `0.3.0-pre-alpha.1` to `0.3.0-pre-alpha.2`.
- Bump the two changed mission definitions, Prelude and Chapter 7, from `1.0.0` to `1.1.0`; update all thirteen mission package bindings to the package version.
- Migrate exactly the immediately preceding Ashes package version. Reject other version mismatches.
- Never infer a successful Hesperus recovery or rewrite an accepted terminal loss. If an old state depends on clock expiry and cannot be replayed without changing its narrated meaning, fail closed with a specific diagnostic.
- Preserve unrelated worktree changes, especially `debug.log`.

---

### Task 1: Make the mission contract clockless

**Files:**
- Modify: `schemas/mission/mission-v1.schema.json`
- Modify: `src/mission/v1/mission-contracts.mjs`
- Modify: `src/mission/v1/predicate-evaluator.mjs`
- Modify: `tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json`
- Modify: `tools/scripts/test-v1-mission-contracts.mjs`
- Modify: `tools/scripts/test-v1-mission-predicates.mjs`
- Modify: `tools/scripts/test-v1-mission-package-linter.mjs`

- [ ] **Step 1: Add failing contract tests**

Assert that a clockless reference definition validates, while definitions containing any removed clock surface fail:

```js
assert.equal(validateMissionDefinition(clocklessDefinition).ok, true);
for (const mutation of [
  (value) => { value.clocks = []; },
  (value) => { value.objectives[0].completeWhen = { op: 'clockState', clockId: 'clock.test', state: 'expired' }; },
  (value) => { value.evidencePolicies[0].emits = [{ claimType: 'timeAdvanced', targetId: 'clock.test' }]; },
]) {
  const candidate = structuredClone(clocklessDefinition);
  mutation(candidate);
  assert.equal(validateMissionDefinition(candidate).ok, false);
}
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node tools/scripts/test-v1-mission-contracts.mjs`

Run: `node tools/scripts/test-v1-mission-predicates.mjs`

Expected: failures because clock definitions, `clockState`, and `timeAdvanced` are still accepted.

- [ ] **Step 3: Remove clock types from the schema and indexes**

Delete the top-level `clocks` property/requirement and its clock schema; remove `clockState` from predicate variants; remove `timeAdvanced` from evidence claim variants; remove `expiredAfterKnownDeadline` from objective dispositions. Remove `clocks` from the result of `indexMissionDefinition()` and from `collectMissionPredicateRefs()`.

- [ ] **Step 4: Convert the reference fixture and linter expectations**

Keep the existing fixture path but make its contract representative and clockless. Replace clock-oriented linter assertions with assertions that removed fields are rejected as unknown/invalid.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `node tools/scripts/test-v1-mission-contracts.mjs`

Run: `node tools/scripts/test-v1-mission-predicates.mjs`

Run: `node tools/scripts/test-v1-mission-package-linter.mjs`

Expected: all pass.

- [ ] **Step 6: Commit the contract cut**

```text
refactor(mission): remove clock contract
```

### Task 2: Remove clock custody from mission state and runtime evidence

**Files:**
- Modify: `src/mission/v1/mission-state.mjs`
- Modify: `src/mission/v1/mission-reducer.mjs`
- Modify: `src/mission/v1/evidence-contracts.mjs`
- Modify: `src/mission/v1/mission-state-authority.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `src/runtime/v1-branch-reconstruction.mjs`
- Modify: `tools/scripts/test-v1-mission-evidence.mjs`
- Modify: `tools/scripts/test-v1-mission-reducer.mjs`
- Modify: `tools/scripts/test-v1-mission-authoritative-time-runtime.mjs`
- Modify: `tools/scripts/test-v1-interpretation-candidates.mjs`
- Modify: `tools/scripts/test-ashes-objective-progression-gates.mjs`

- [ ] **Step 1: Add failing state and runtime tests**

Require mission state creation and reduction to omit `clocks`, reject `timeAdvanced`, and leave campaign time advancement independent of mission evidence:

```js
const state = createMissionState({ definition: clocklessDefinition, branchId: 'save.test' });
assert.equal(Object.hasOwn(state, 'clocks'), false);
assert.throws(() => reduceMissionEvidence({
  definition: clocklessDefinition,
  state,
  acceptedClaims: [{ claimType: 'timeAdvanced', targetId: 'clock.test', value: 60 }],
}), /claim type|authored/i);

assert.equal(after.timeLedger.elapsedSeconds, before.timeLedger.elapsedSeconds + acceptedSeconds);
assert.equal(after.mission.v1.evidenceLog.some((entry) => entry.claimType === 'timeAdvanced'), false);
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node tools/scripts/test-v1-mission-reducer.mjs`

Run: `node tools/scripts/test-v1-mission-authoritative-time-runtime.mjs`

Expected: failures while mission clocks and synthetic time claims are still materialized.

- [ ] **Step 3: Remove clock state and reducer transitions**

Delete clock initialization, validation, advancement, pause/resume, expiry consequences, and clock-derived objective reevaluation. Mission state must no longer contain a `clocks` key.

- [ ] **Step 4: Remove synthetic mission time evidence**

Delete `materializeAuthoritativeTimeEvidence()` and its diagnostics from `v1-mission-runtime.mjs`. Remove `timeAdvanced` from evidence contracts and mission-state authority replay. Keep `prepareV1AcceptedPairTimeAdvance()` and the `timeLedger` patch path unchanged.

- [ ] **Step 5: Remove clock rebinding and gate counts**

Stop branch reconstruction from traversing `mission.v1.clocks`. Remove clock reference counts from objective-progression gate diagnostics.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run: `node tools/scripts/test-v1-mission-evidence.mjs`

Run: `node tools/scripts/test-v1-mission-reducer.mjs`

Run: `node tools/scripts/test-v1-mission-authoritative-time-runtime.mjs`

Run: `node tools/scripts/test-v1-interpretation-candidates.mjs`

Run: `node tools/scripts/test-ashes-objective-progression-gates.mjs`

Expected: all pass, including accepted story-time advancement without any mission claim.

- [ ] **Step 7: Commit runtime decoupling**

```text
refactor(runtime): decouple story time from missions
```

### Task 3: Remove the two Ashes clocks and version the content

**Files:**
- Modify: `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json`
- Modify: all `packages/bundled/breckenridge/v1/*.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/chapter-7-peace-of-their-own-scenarios.fixture.json`
- Modify: `tools/scripts/test-ashes-v1-campaign.mjs`
- Modify: `tools/scripts/test-v1-semantic-authority-cutover.mjs`
- Modify: `tools/scripts/test-campaign-package-context.mjs`

- [ ] **Step 1: Add failing Ashes assertions**

Assert that no bundled mission serializes any removed field and that the Hesperus objective has only narrated, evidence-backed terminal paths:

```js
assert.equal(missionDefinitions.some((definition) => Object.hasOwn(definition, 'clocks')), false);
assert.equal(JSON.stringify(missionDefinitions).includes('clockState'), false);
assert.equal(JSON.stringify(missionDefinitions).includes('timeAdvanced'), false);
assert.equal(JSON.stringify(missionDefinitions).includes('expiredAfterKnownDeadline'), false);
assert.equal(packageData.manifest.version, '0.3.0-pre-alpha.2');
```

- [ ] **Step 2: Run the Ashes test and confirm RED**

Run: `node tools/scripts/test-ashes-v1-campaign.mjs`

Expected: failures identifying the Hesperus and Chapter 7 clocks and the old package version.

- [ ] **Step 3: Remove Hesperus deadline mechanics**

In Prelude, delete `clock.hesperus-life-support`, `policy.hesperus.authoritative-time`, `event.hesperus.life-support-window-expired`, the `expiredAfterKnownDeadline` terminal rule, the `known-deadline-expired` outcome derivation, and clock-dependent transition routing. Retain only outcomes supported by narrated accepted facts/events/outcomes.

- [ ] **Step 4: Remove Chapter 7 task-group timing mechanics**

Delete `clock.peace.task-group-arrival`, `policy.chapter7.authoritative-time`, and the automatic `event.chapter7.task-group-arrived` consequence if it has no independent narrated evidence policy. Rewrite scenario fixtures to prove progression from accepted narrative evidence only.

- [ ] **Step 5: Apply version changes consistently**

Set the package manifest and every mission `packageBinding.packageVersion` to `0.3.0-pre-alpha.2`. Set Prelude and Chapter 7 definition versions to `1.1.0`; retain `1.0.0` for unchanged missions.

- [ ] **Step 6: Run focused package tests and confirm GREEN**

Run: `node tools/scripts/test-ashes-v1-campaign.mjs`

Run: `node tools/scripts/test-v1-semantic-authority-cutover.mjs`

Run: `node tools/scripts/test-campaign-package-context.mjs`

Expected: all pass with zero authored countdowns.

- [ ] **Step 7: Commit the content cutover**

```text
feat(ashes): remove mission countdowns

Advance Ashes and the changed mission contracts so the runtime can migrate the
immediately preceding clock-bearing saves without treating the edit as in-place.
```

### Task 4: Remove countdown projection and Mission-panel rendering

**Files:**
- Modify: `src/mission/v1/player-projection.mjs`
- Modify: `src/ui/view-models/certified-mission-view.mjs`
- Modify: `src/ui/v1-player-facing-panel-model.mjs`
- Modify: `src/ui/mission-panel.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-v1-mission-player-projection.mjs`
- Modify: `tools/scripts/test-v1-composite-player-projection.mjs`
- Modify: `tools/scripts/test-v1-duty-report-planner.mjs`
- Modify: `tools/scripts/test-v1-duty-report-runtime.mjs`

- [ ] **Step 1: Add failing projection tests**

```js
assert.equal(Object.hasOwn(projection.mission, 'clocks'), false);
assert.equal(Object.hasOwn(panelModel.mission, 'clocks'), false);
assert.equal(projection.time.kind, 'directive.timePlayerProjection.v1');
assert.match(projection.time.shipClock.label, /^\d{2}:\d{2}:\d{2}$/);
assert.match(projection.time.stardate.label, /^\d+\.\d$/);
```

Add a DOM assertion that the Mission panel does not render `.mission-clock-section` or the heading `Time-sensitive`, while its header chronometer remains.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node tools/scripts/test-v1-mission-player-projection.mjs`

Run: `node tools/scripts/test-v1-composite-player-projection.mjs`

Expected: failures because mission clock arrays are still projected.

- [ ] **Step 3: Remove clock projection and rendering**

Delete the `clocks` mapping from mission projections/view models, delete `appendClocks()` and its call, and remove only the CSS selectors dedicated to mission countdown cards. Do not alter shared chronometer selectors.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `node tools/scripts/test-v1-mission-player-projection.mjs`

Run: `node tools/scripts/test-v1-composite-player-projection.mjs`

Run: `node tools/scripts/test-v1-duty-report-planner.mjs`

Run: `node tools/scripts/test-v1-duty-report-runtime.mjs`

Expected: all pass and canonical time remains projected.

- [ ] **Step 5: Commit the UI removal**

```text
refactor(ui): remove mission countdown panels
```

### Task 5: Add the guarded one-shot save migration

**Files:**
- Create: `src/runtime/v1-mission-clock-removal-migration.mjs`
- Modify: `src/runtime/campaign-start-controller.mjs`
- Modify: `src/runtime/v1-campaign-state.mjs`
- Modify: `tools/scripts/test-campaign-start-service.mjs`
- Create: `tools/scripts/test-v1-mission-clock-removal-migration.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] **Step 1: Write failing migration tests**

Cover a fresh `.2` save, a normal active `.1` Prelude save, a `.1` Chapter 7 save, completed clock-bearing history, an already-expired Hesperus loss, a future/unknown package version, and idempotent reruns. Use this public result shape:

```js
const result = migrateV1MissionClockRemoval({
  campaignState: oldState,
  packageData,
  missionDefinitions,
});
assert.deepEqual(result, {
  ok: true,
  migrated: true,
  campaignState: expectedClocklessState,
  diagnostics: {
    sourcePackageVersion: '0.3.0-pre-alpha.1',
    targetPackageVersion: '0.3.0-pre-alpha.2',
    removedTimeEvidenceCount: 1,
  },
});
```

Ambiguous narrated history must produce `{ ok: false, reasonCode: 'clock-removal-narrative-ambiguity' }` without mutating input.

- [ ] **Step 2: Run the migration test and confirm RED**

Run: `node tools/scripts/test-v1-mission-clock-removal-migration.mjs`

Expected: module-not-found or missing-export failure.

- [ ] **Step 3: Implement pure replay migration**

Recognize only Ashes `.1` to `.2`. Deep-clone input, remove `timeAdvanced` evidence entries, remove persisted `clocks`, update package/definition bindings, and rebuild active and historical mission authority by replaying surviving accepted evidence against the matching clockless definition. Preserve source contribution IDs, evidence keys, accepted narrative facts/events/outcomes, mission revision monotonicity, journey receipts, custody metadata, and `timeLedger` exactly.

- [ ] **Step 4: Integrate migration at controller hydration**

After `refreshActive()` loads the exact active save and before runtime `setState()`, call the migrator with the loaded package and definitions. Persist a successful migration through the existing compare-and-swap save path with a migration-specific custody commit ID. Throw an error with the migration reason code on ambiguity; never partially persist. Apply the same guard when explicitly loading another active save.

- [ ] **Step 5: Prove migration persistence and idempotence**

Run: `node tools/scripts/test-v1-mission-clock-removal-migration.mjs`

Run: `node tools/scripts/test-campaign-start-service.mjs`

Expected: all pass; a migrated save reloads clockless and a second initialization performs no write.

- [ ] **Step 6: Register the migration test in the alpha gate**

Add the script beside mission runtime/state tests in `run-alpha-gate.mjs`.

- [ ] **Step 7: Commit migration support**

```text
feat(runtime): migrate clock-bearing Ashes saves

Replay only the immediately preceding package version and fail closed when a
clock-expired history cannot be preserved without inventing narrative facts.
```

### Task 6: Update current documentation and complete source verification

**Files:**
- Modify: `docs/architecture/MISSION_STATE.md`
- Modify: `docs/architecture/V1_GAMEPLAY_ARCHITECTURE.md`
- Modify: `docs/user/FIRST_CAMPAIGN_WORKFLOW.md`
- Modify: `docs/user/DIRECTIVE_OPERATOR_MANUAL.md`
- Modify: any remaining current tests/fixtures found by the removal audit

- [ ] **Step 1: Update current contracts and player guidance**

State explicitly that mission urgency is narrated and evidence-backed, mission/objective countdowns do not exist in V1, and canonical time/date still advances only when accepted narration establishes elapsed time.

- [ ] **Step 2: Run the removal audit**

Run:

```powershell
rg -n 'clockState|timeAdvanced|expiredAfterKnownDeadline|mission-clock|Time-sensitive|"clocks"' schemas src packages tests tools/scripts docs/architecture docs/user styles/directive.css
```

Expected: no live mission-clock contract or UI hits. Allow only migration constants/tests and historical design/plan documentation; inspect every hit individually.

- [ ] **Step 3: Run focused retained-time tests**

Run: `node tools/scripts/test-v1-accepted-pair-time.mjs`

Run: `node tools/scripts/test-v1-time-player-projection.mjs`

Run: `node tools/scripts/test-authoritative-ship-chronometer-visual.mjs`

Expected: all pass with ship time, date, and Stardate unchanged.

- [ ] **Step 4: Run the full source gate**

Run: `npm.cmd test`

Expected: exit 0 with every registered test passing.

- [ ] **Step 5: Commit documentation and residual cleanup**

```text
docs(mission): define narrative urgency
```

### Task 7: Verify the installed runtime and push main

**Files:**
- Read: the exact active `directive-v1-index.v1.json`
- Back up before mutation: exact active index, save manifest/base/deltas, bound chat JSONL, and installed Directive segment files
- Install from: repository root
- Install to: the currently active SillyTavern Directive extension directory, verified before synchronization

- [ ] **Step 1: Confirm clean task scope**

Run: `git status --short`

Expected: only intended task files plus the pre-existing unrelated `debug.log` modification.

- [ ] **Step 2: Resolve and back up the exact live save**

Read the active profile's `directive-v1-index.v1.json` first. If it names an active save, resolve only that save's manifest/base/delta records and bound chat. Copy those exact artifacts to a timestamped backup directory before allowing migration. If the index has no active save, record that fact and do not infer one from broad searches.

- [ ] **Step 3: Synchronize the verified installed extension**

Confirm source HEAD and installed-source parity targets, then copy the repository to the active extension directory while excluding `.git`, `node_modules`, artifacts, temporary files, and `debug.log`.

- [ ] **Step 4: Verify real runtime behavior**

Open the bound campaign in the installed host. Confirm:

- Mission view has no `Time-sensitive` section or countdown values.
- The Mission/Campaign ship chronometer still shows `HH:MM:SS` and one-decimal Stardate/date data.
- Prelude does not reveal Hesperus danger or a deadline before accepted narration establishes it.
- A previous `.1` save either migrates once with unchanged `timeLedger` and narrated facts, or fails closed with the explicit ambiguity diagnostic.

- [ ] **Step 5: Run a fresh full gate after installed verification**

Run: `npm.cmd test`

Expected: exit 0.

- [ ] **Step 6: Review and commit any verification-only corrections**

Use a terse Conventional Commit message scoped to the corrected subsystem. Do not stage `debug.log`.

- [ ] **Step 7: Confirm GitHub and remote ancestry**

Run with network permission: `gh auth status`

Run with network permission: `gh repo view --json nameWithOwner,url,defaultBranchRef`

Run: `git fetch origin main`

Run: `git merge-base --is-ancestor origin/main HEAD`

Expected: GitHub authentication succeeds and local `main` contains current `origin/main`.

- [ ] **Step 8: Push completed main**

Run: `git push origin main`

Expected: remote `main` advances to the verified local HEAD.

- [ ] **Step 9: Verify remote completion**

Run with network permission: `gh api repos/{owner}/{repo}/commits/main --jq '{sha:.sha,message:.commit.message,date:.commit.author.date}'`

Expected: remote SHA equals `git rev-parse HEAD`.
