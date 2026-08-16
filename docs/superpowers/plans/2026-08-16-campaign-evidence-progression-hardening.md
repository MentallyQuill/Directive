# Campaign Evidence Progression Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent unsupported accepted-pair interpretations from completing campaign objectives or operational work, audit all Ashes of Peace objective gates, and repair the active Sam Vickers save without changing narration.

**Architecture:** Retain one Utility interpretation call, but make every durable selection cite an exact accepted-source excerpt and reject over-broad outputs before persistence. Add deterministic terminal-policy classification and base-state gating, strengthen weak authored campaign progression policies, then rebuild the guarded live save from its remaining authoritative evidence.

**Tech Stack:** Node.js ESM, JSON Schema, Directive V1 mission reducer and Story Settlement, SillyTavern segmented JSON storage, repository script tests through `npm.cmd`.

## Global Constraints

- Preserve accepted-pair authority: an assistant response remains provisional until the next player message accepts it.
- Preserve one `acceptedPairMissionEvidence` Utility call per ordinary accepted pair; add no model call.
- Every evidence quote is 12 through 240 characters after whitespace normalization and must occur in its authorized source.
- Permit at most four durable Mission, Ship, Cohesion, and People selections in one interpretation.
- Fail closed with no partial semantic commit when grounding, budget, or terminal eligibility fails.
- Do not add regex narration adjudication, provider-specific behavior, sidecar state, or player-facing evidence UI.
- Back up the exact active save/index/chat/timeline artifacts before live mutation.
- Preserve unrelated `debug.log` work and the existing local commits on `main`.

---

### Task 1: Ground every accepted-pair semantic selection

**Files:**
- Modify: `src/mission/v1/accepted-pair-interpreter.mjs`
- Modify: `src/people/accepted-pair-people.mjs`
- Test: `tools/scripts/test-v1-accepted-pair-interpreter.mjs`
- Test: `tools/scripts/test-v1-accepted-pair-people.mjs`

**Interfaces:**
- Consumes: `candidatePacket`, `sourcePair`, and `peopleContext` already passed to `parseMissionAcceptedPairInterpretationOutput`.
- Produces: selections and People observations with `evidenceQuote: string`; `validateInterpretationGrounding(value, { candidatePacket, sourcePair, peopleContext })` returns an error array used by the parser.

- [ ] **Step 1: Add failing interpreter tests**

Add real parser cases with this shape:

```js
const grounded = interpretation({
  claims: [{
    candidateId: 'policy.hesperus.rescue-result',
    sourceSlot: 'previousAssistant',
    value: 'safe',
    evidenceQuote: 'The last passenger crossed into the Breckenridge airlock safely.',
  }],
});
assert.equal(parseMissionAcceptedPairInterpretationOutput(grounded, {
  candidatePacket,
  sourcePair: acceptedPair('The last passenger crossed into the Breckenridge airlock safely.'),
}).ok, true);
```

Assert rejection for missing quotes, quotes shorter than 12 characters, quotes longer than 240 characters, quotes absent from the selected source, People events without grounding, and five combined durable selections.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node tools/scripts/test-v1-accepted-pair-interpreter.mjs` and `node tools/scripts/test-v1-accepted-pair-people.mjs`

Expected: FAIL because claim and People schemas do not accept or validate `evidenceQuote`, and the existing maximum permits five claims.

- [ ] **Step 3: Implement grounded selection parsing**

Add `evidenceQuote` to claim and People field sets and schemas. Normalize source and quote whitespace with one helper, validate the 12–240 character bound, require normalized source inclusion, and change the parser signature to:

```js
parseMissionAcceptedPairInterpretationOutput(value, {
  candidatePacket,
  sourcePair = {},
  peopleContext = {},
} = {})
```

Count `claims.length + peopleEvents.length`; if it exceeds four, return `ok: false`. Preserve `evidenceQuote` through `materializeMissionEvidenceProposal` and prepared People events.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run the two commands from Step 2.

Expected: both scripts print their existing success line and exit 0.

- [ ] **Step 5: Commit grounded selection custody**

```powershell
git add src/mission/v1/accepted-pair-interpreter.mjs src/people/accepted-pair-people.mjs tools/scripts/test-v1-accepted-pair-interpreter.mjs tools/scripts/test-v1-accepted-pair-people.mjs
git commit -m "fix(mission): ground accepted evidence"
```

### Task 2: Gate terminal evidence against pre-pair state

**Files:**
- Modify: `src/mission/v1/evidence-contracts.mjs`
- Modify: `src/mission/v1/mission-package-linter.mjs`
- Test: `tools/scripts/test-v1-mission-evidence.mjs`
- Test: `tools/scripts/test-v1-mission-package-linter.mjs`

**Interfaces:**
- Consumes: mission objective `terminalWhen` predicates and authored evidence policies.
- Produces: `terminalEvidencePolicyIds(definition): Set<string>` and a linter error for terminal assistant policies whose causal gate is `true`.

- [ ] **Step 1: Add failing terminal-gate tests**

Create a definition where one proposal supplies both `event.stage-begun` and terminal `outcome.result=completed`, while the terminal policy requires `event.stage-begun`. Assert that the event is accepted but the terminal outcome is rejected with `precondition-not-met` when the stage was absent from the input state. Add a linter fixture whose objective terminal result is authored by an assistant policy with `when: true` and assert a specific certification error.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `node tools/scripts/test-v1-mission-evidence.mjs` and `node tools/scripts/test-v1-mission-package-linter.mjs`

Expected: the same-proposal terminal outcome is currently accepted and the linter currently permits `when: true`.

- [ ] **Step 3: Implement terminal-policy discovery and base-state validation**

Walk objective terminal predicates with `collectMissionPredicateRefs`, match referenced events/outcomes to evidence policies, and classify their policy IDs. In `validateMissionEvidenceProposal`, evaluate classified terminal policies against the original mission context; continue using staged context for nonterminal disclosure ordering. Add the linter rule while exempting `decisionRecorded` policies sourced only from `user`.

- [ ] **Step 4: Run the focused tests and confirm GREEN**

Run the two commands from Step 2.

Expected: both scripts exit 0, terminal chaining is rejected, and atomic player decisions remain valid.

- [ ] **Step 5: Commit deterministic terminal gating**

```powershell
git add src/mission/v1/evidence-contracts.mjs src/mission/v1/mission-package-linter.mjs tools/scripts/test-v1-mission-evidence.mjs tools/scripts/test-v1-mission-package-linter.mjs
git commit -m "fix(mission): gate terminal evidence"
```

### Task 3: Audit all Ashes of Peace objective progression

**Files:**
- Modify: `packages/bundled/breckenridge/v1/*.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/*-scenarios.fixture.json` where causal prerequisites change
- Modify: `tools/scripts/test-ashes-v1-campaign.mjs`
- Create: `tools/scripts/test-ashes-objective-progression-gates.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: all 13 mission definitions, 50 objectives, 143 terminal routes, and their evidence policies.
- Produces: campaign certification proving every terminal assistant policy has a prior causal gate and every terminal route remains reachable in positive scenarios.

- [ ] **Step 1: Add the failing campaign audit**

Create `test-ashes-objective-progression-gates.mjs` to load every `*.mission-v1.json`, trace each objective terminal event/outcome to its evidence policy, and assert:

```js
assert.notEqual(policy.when, true, `${definition.id}:${objective.id}:${policy.id} needs a causal gate`);
assert.ok(policy.interpretation?.evidenceStandard, `${policy.id} needs an interpretation standard`);
```

Permit atomic user-only `decisionRecorded` policies. Register the script in the normal test command.

- [ ] **Step 2: Run the audit and confirm RED**

Run: `node tools/scripts/test-ashes-objective-progression-gates.mjs`

Expected: FAIL for Prelude command handover/staff readiness and Chapter 7 terminal policies currently authored under `when: true`.

- [ ] **Step 3: Strengthen Prelude progression**

Add explicit preterminal evidence for completed handover closure, per-role readiness/delegation exchanges, and Hesperus contact. Make staff readiness depend on the authored readiness exchanges, make rescue result depend on previously accepted contact, and make rescue cost depend on a terminal rescue result. Tighten record-review language to maintenance records and remove chair occupancy or boundary agreement as handover completion.

- [ ] **Step 4: Strengthen Chapter 7 and audit the remaining eleven definitions**

Give the Chapter 7 standoff, civilian, interface, annex-control, coalition-posture, and settlement results their existing causal decision/event prerequisites. Inspect every remaining terminal policy with a nontrivial `when` predicate and strengthen any predicate that names only setup knowledge but not the story stage required by its terminal result.

- [ ] **Step 5: Update scenario fixtures and prove reachability**

Insert new prerequisite claims before affected terminal claims in positive scenarios. Add negative scenarios for premature terminal selection and keep the expected objective dispositions unchanged for genuinely completed paths.

- [ ] **Step 6: Run campaign certification and confirm GREEN**

Run: `node tools/scripts/test-ashes-objective-progression-gates.mjs` and `node tools/scripts/test-ashes-v1-campaign.mjs`

Expected: all 13 definitions, all 50 objectives, all authored scenarios, and the new negative gates pass.

- [ ] **Step 7: Commit the campaign-wide audit**

```powershell
git add packages/bundled/breckenridge/v1 tests/fixtures/mission/v1 tools/scripts/test-ashes-objective-progression-gates.mjs tools/scripts/test-ashes-v1-campaign.mjs package.json
git commit -m "fix(campaign): enforce objective progression"
```

### Task 4: Add exact incident transcript regressions

**Files:**
- Create: `tests/fixtures/mission/v1/prelude-premature-completion-regression.fixture.json`
- Create: `tools/scripts/test-prelude-premature-completion-regression.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: the accepted assistant/player pairs that produced contribution IDs `eb870bc9`, `f31b2dac`, and `a8f4f5a6`.
- Produces: a deterministic regression test proving none of the unsupported candidate selections can cross parser and progression gates.

- [ ] **Step 1: Add the fixture and failing assertions**

Store the exact relevant transcript text and the formerly selected policy IDs. Assert that ungrounded selections are rejected; grounded but causally premature handover, staff-readiness, Hesperus rescue, and Ship-test selections are rejected or unavailable; and the resulting projected objectives remain active.

- [ ] **Step 2: Run the regression and confirm RED where coverage is missing**

Run: `node tools/scripts/test-prelude-premature-completion-regression.mjs`

Expected: at least one assertion fails until all Prelude candidate gates and grounding paths are wired together.

- [ ] **Step 3: Complete only the missing integration wiring**

Update candidate materialization or test helpers only where the real end-to-end path drops `evidenceQuote` or bypasses base-state terminal gating. Do not add transcript-specific keyword logic.

- [ ] **Step 4: Run the regression and focused suite GREEN**

Run: `node tools/scripts/test-prelude-premature-completion-regression.mjs`, `node tools/scripts/test-v1-accepted-pair-interpreter.mjs`, and `node tools/scripts/test-v1-mission-evidence.mjs`.

Expected: all exit 0.

- [ ] **Step 5: Commit the incident regression**

```powershell
git add tests/fixtures/mission/v1/prelude-premature-completion-regression.fixture.json tools/scripts/test-prelude-premature-completion-regression.mjs package.json
git commit -m "test(mission): cover premature completion"
```

### Task 5: Build and execute the guarded live-save repair

**Files:**
- Create: `tools/scripts/repair-sam-vickers-premature-evidence.mjs`
- Create: `tools/scripts/test-repair-sam-vickers-premature-evidence.mjs`
- Modify: `package.json`
- Mutate after backup: the exact active default-user index, segmented save files, and timeline record outside the repository

**Interfaces:**
- Consumes: an adapter compatible with `loadV1CampaignSave`/`storeV1CampaignSave`, exact repair guards, and a dry-run/apply mode.
- Produces: `repairPrematureEvidence(save, guards)` returning `{ save, removedEvidenceKeys, removedEffectIds, validation }` without filesystem access; CLI persistence is a thin wrapper.

- [ ] **Step 1: Add failing pure repair tests**

Create a synthetic save containing valid evidence plus the exact unsupported contribution/policy pairs. Assert that the repair removes only the allowlisted entries/effects, rebuilds mission state from the remaining evidence, preserves accepted-pair receipts and narration contributions, and stops on any identity/hash mismatch.

- [ ] **Step 2: Run the repair test and confirm RED**

Run: `node tools/scripts/test-repair-sam-vickers-premature-evidence.mjs`

Expected: FAIL because the pure repair function does not exist.

- [ ] **Step 3: Implement the pure repair and guarded CLI**

Use `createMissionState` plus `reduceMissionEvidence` to rebuild authority, then run `validateMissionStateAuthority`, Story Settlement effect filtering, `assertV1CampaignState`, and `buildV1RuntimePlayerProjection`. Default to dry-run. Require `--apply`, the exact default-user root, and all expected save/package/player/chat/source hashes before writing through `storeV1CampaignSave`.

- [ ] **Step 4: Run the repair tests and dry-run GREEN**

Run the test from Step 2, then run the CLI without `--apply` against the live root.

Expected: tests pass; dry-run reports only the allowlisted unsupported evidence/effects and no files change.

- [ ] **Step 5: Back up and apply the exact repair**

Create one timestamped backup directory under `data/default-user/backups/Directive/`, copy the index, active manifest, base, every referenced segment, bound chat, and timeline journal, then execute the CLI with `--apply`.

- [ ] **Step 6: Validate repaired authority and projections**

Reload the segmented save, run `assertV1CampaignState`, validate Mission authority, build the player projection, and assert command handover, staff readiness, and Hesperus rescue are active while unrelated valid facts, time, and accepted-pair receipts remain.

- [ ] **Step 7: Commit repair tooling and tests**

```powershell
git add tools/scripts/repair-sam-vickers-premature-evidence.mjs tools/scripts/test-repair-sam-vickers-premature-evidence.mjs package.json
git commit -m "fix(storage): repair premature evidence"
```

### Task 6: Full verification, installation, and publication

**Files:**
- Verify: all modified source, campaign, fixture, tool, and documentation files
- Synchronize: `F:\SillyTavern\SillyTavern\data\default-user\extensions\directive`

**Interfaces:**
- Consumes: committed implementation and repaired live save.
- Produces: passing source tests, installed-source parity, valid live projections, and pushed `main`.

- [ ] **Step 1: Run focused verification**

Run all scripts added or modified by Tasks 1–5 plus `node tools/scripts/test-v1-projection-rebuild.mjs` and `node tools/scripts/test-v1-storage-repository.mjs`.

- [ ] **Step 2: Run the full gate**

Run: `npm.cmd test`

Expected: exit 0 with every registered Directive check passing.

- [ ] **Step 3: Check repository hygiene**

Run: `git diff --check`, `git status --short`, and inspect `git diff origin/main...HEAD --stat` plus the scoped diff. Confirm `debug.log` is the only unrelated dirty file and is not staged.

- [ ] **Step 4: Synchronize the installed extension and prove parity**

Copy repository files to the installed default-user extension while excluding `.git`, `node_modules`, artifacts, temporary files, and `debug.log`. Hash every changed runtime/campaign file in source and install and assert equality.

- [ ] **Step 5: Revalidate the installed live save**

Load the repaired active save using installed modules, build the installed player projection, and assert the three reported objectives are not terminal and the false Ship milestone effects are absent.

- [ ] **Step 6: Verify GitHub authentication with network access and push main**

Run `gh auth status`, verify the repository identity, fetch current remote state, confirm `main` is a fast-forward push, then run `git push origin main`.

- [ ] **Step 7: Verify the remote commit**

Use `gh api repos/{owner}/{repo}/commits/main` and confirm its SHA equals local `git rev-parse HEAD`. Report source tests, installed parity, live-save proof, backup location, and remote SHA.
