# Accepted-Pair Schema Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent schema-valid accepted-pair overflow from pausing narration, then settle the exact pending Sam Vickers 40/41 pair without generating new narration.

**Architecture:** Keep the four-item authority bound at both the provider-schema and parser boundaries. Mission, Ship, and Cohesion claims retain priority; excess People observations are pruned deterministically and reported. A separate exact-identity repair tool first restores the previously missed handover-terms stage from accepted message 38, then settles messages 40/41 through the normal mission runtime with grounded completion evidence.

**Tech Stack:** Node.js ESM, JSON Schema, Directive V1 mission runtime/state spine, segmented SillyTavern storage, script-based test gate.

## Global Constraints

- Preserve the four-selection anti-hallucination bound.
- Preserve exact source-quote grounding and pre-existing terminal progression gates.
- Do not generate narration or append chat messages during recovery.
- Back up the exact active index, save segments, timeline journal, and chat before mutation.
- Preserve unrelated `debug.log` work.

---

### Task 1: Align the provider and parser durable-selection bounds

**Files:**
- Modify: `src/mission/v1/accepted-pair-interpreter.mjs`
- Test: `tools/scripts/test-v1-accepted-pair-interpreter.mjs`

**Interfaces:**
- Consumes: `createMissionAcceptedPairInterpretationSchema({ candidatePacket })` and `parseMissionAcceptedPairInterpretationOutput(value, context)`.
- Produces: a schema whose count branches allow `claims.length + peopleEvents.length <= 4`, plus parser diagnostics `discardedOverflowPeopleEventCount`.

- [ ] **Step 1: Write the failing schema and parser tests**

Add assertions that the schema contains five mutually exclusive claim-count branches and that a result with one valid claim plus four valid People events parses successfully with one claim, three People events, and `discardedOverflowPeopleEventCount === 1`. Retain a failure case for five claims.

- [ ] **Step 2: Run the focused interpreter test and confirm RED**

Run: `node tools/scripts/test-v1-accepted-pair-interpreter.mjs`

Expected: FAIL because the schema has independent maxima and the parser rejects the combined overage.

- [ ] **Step 3: Implement the minimal count contract**

Add a schema helper that generates count branches for claim counts zero through four, assigning People maxima four through zero. Before aggregate validation, clone the provider output and slice only `peopleEvents` to `Math.max(0, 4 - claims.length)`. Validate the retained output normally; do not prune claims or bypass any quote, candidate, source-role, value, time, or structural error.

- [ ] **Step 4: Return explicit overflow diagnostics**

Return `discardedOverflowPeopleEventCount` from the parser and interpreter diagnostics. Keep `discardedAssistantPeopleEventCount` limited to assistant-acceptance filtering so the two causes remain distinguishable.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run:

```powershell
node tools/scripts/test-v1-accepted-pair-interpreter.mjs
node tools/scripts/test-v1-mission-runtime.mjs
```

Expected: both scripts pass.

- [ ] **Step 6: Commit the bounded parser change**

```powershell
git add -- src/mission/v1/accepted-pair-interpreter.mjs tools/scripts/test-v1-accepted-pair-interpreter.mjs
git commit -m "fix(mission): reconcile durable output bounds"
```

### Task 2: Add the exact Sam Vickers 40/41 regression

**Files:**
- Create: `tools/scripts/test-sam-vickers-pending-pair-regression.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: the Prelude mission definition, `createMissionState`, candidate/schema/parser functions, and exact message 40/41 excerpts.
- Produces: a registered regression proving the rich pair retains grounded command-stage evidence and caps optional People observations without `invalid-output`.

- [ ] **Step 1: Create the exact transcript fixture**

Include the accepted assistant statements beginning `It is. As of now, Commander Vickers assumes the duties of executive officer of this ship.` and the player directives beginning `Commander, Medical needs personnel.` Use exact excerpts for every evidence quote.

- [ ] **Step 2: Write the failing rich-output assertion**

Construct one valid `policy.prelude.command-handover-terms-settled` claim plus four grounded People observations for Whitaker, Bronn, Sato, and Nayar. Assert parsing succeeds, total retained durable selections equals four, and one People observation is reported discarded for overflow.

- [ ] **Step 3: Confirm the regression fails against the pre-fix parser**

Run: `node tools/scripts/test-sam-vickers-pending-pair-regression.mjs`

Before implementing Task 1 Step 3, run this exact regression alongside the focused interpreter test. Require FAIL with the four-selection aggregate validation error. After Task 1, require PASS.

- [ ] **Step 4: Register and verify the regression**

Add the script to `tools/scripts/run-alpha-gate.mjs`, then run the script directly and the neighboring Prelude regression.

- [ ] **Step 5: Commit the exact regression**

```powershell
git add -- tools/scripts/test-sam-vickers-pending-pair-regression.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "test(mission): cover rich accepted pair"
```

### Task 3: Build a guarded no-generation live repair

**Files:**
- Create: `tools/scripts/repair-sam-vickers-pending-pair.mjs`
- Create: `tools/scripts/test-sam-vickers-pending-pair-repair.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `inspectSamVickersPendingPairRepair(save, chatRows)`, `prepareSamVickersPendingPairRepair(save, options)`, and a CLI supporting dry-run and `--apply`.
- Consumes: `createV1StateSpine`, `createV1MissionRuntime`, `createStateDeltaGateway`, `prepareV1AcceptedPairSnapshot`, segmented storage repository functions, current bundled runtime assets, and exact live source identities.

- [ ] **Step 1: Write exact guard tests**

Require save `save.1786851317628.1`, campaign `campaign-1786395087827-1`, player `Sam Vickers`, bound chat `Ashes of Peace - ReadyRoom continuation 3 - Branch #2`, custody revision 54, mission revision 19, latest settled receipt 38/39, pending rows 40/41, and unchanged source hashes. Mutation of any identity, revision, source text, or receipt must fail closed.

- [ ] **Step 2: Prove the repair test is RED**

Run: `node tools/scripts/test-sam-vickers-pending-pair-repair.mjs`

Expected: FAIL because the repair module does not exist.

- [ ] **Step 3: Stage the missed prerequisite through the state spine**

Resolve the existing accepted assistant contribution for message 38 and apply `policy.prelude.command-handover-terms-settled` with an exact quote from Whitaker's already accepted authority-boundary statement. Supply the existing contribution and source observation so Story Settlement receives the matching mission effect without duplicating narration custody.

- [ ] **Step 4: Settle pending messages 40/41 through the mission runtime**

Prepare the exact accepted-pair snapshot from chat rows 40/41. Inject a deterministic interpreter result selecting `policy.prelude.command-handover-completed` with the exact `As of now` transfer quote, no optional People observations, and unchanged elapsed time. Allow the existing duty-report manifest on message 40 to materialize through its normal custody path. Assert a new 40/41 accepted-pair receipt and contributions are present exactly once.

- [ ] **Step 5: Validate the prepared save**

Require valid mission authority, mission journey, Story Settlement, player projection, and state custody. Assert command handover is completed, staff readiness remains unfinished, Hesperus remains in progress without a terminal disposition, and no unsupported rescue result or rescue cost appears.

- [ ] **Step 6: Implement guarded backup and persistence**

On `--apply`, create a timestamped sibling under `data/default-user/backups/Directive`, copying the exact index, all active save manifest/segments, campaign timeline journal, and chat with SHA-256 manifest. Persist through `storeV1CampaignSave`, reload, compare with the prepared save, and verify the chat hash is unchanged.

- [ ] **Step 7: Register and run repair tests**

Run:

```powershell
node tools/scripts/test-sam-vickers-pending-pair-repair.mjs
node tools/scripts/test-sam-vickers-pending-pair-regression.mjs
```

Expected: both pass.

- [ ] **Step 8: Commit the guarded repair**

```powershell
git add -- tools/scripts/repair-sam-vickers-pending-pair.mjs tools/scripts/test-sam-vickers-pending-pair-repair.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "fix(mission): repair pending accepted pair"
```

### Task 4: Verify, install, apply, and publish

**Files:**
- Verify all files changed by Tasks 1–3.
- Preserve: `debug.log`.

**Interfaces:**
- Consumes: tested source commits and guarded repair CLI.
- Produces: exact installed-source parity, repaired live custody, and a verified `main` push.

- [ ] **Step 1: Run focused and full verification**

Run `git diff --check`, the focused scripts from Tasks 1–3, then `npm.cmd test`. Require every registered alpha-gate check to pass.

- [ ] **Step 2: Review the scoped diff**

Inspect commits and worktree status. Confirm only unrelated `debug.log` remains uncommitted.

- [ ] **Step 3: Synchronize only Git-tracked files to the installed extension**

Copy each path from `git ls-files` into `F:\SillyTavern\SillyTavern\data\default-user\extensions\directive`. Do not copy `.git`, `.agents`, `.codex`, worktrees, temporary output, or `debug.log`.

- [ ] **Step 4: Prove installed parity**

Compare normalized file content or Git blob content for all tracked files, accounting for the repository's CRLF working-tree conversion. Require zero content mismatches and zero workspace-only directories in the installed extension.

- [ ] **Step 5: Dry-run and apply the exact repair**

Run the installed repair CLI without `--apply`, inspect its report, then run with `--apply`. Record the backup path, custody revisions, mission revisions, accepted-pair receipt count, and objective states.

- [ ] **Step 6: Validate through installed modules**

Reload the repaired save through the installed segmented-storage repository. Require mission authority, journey, and projection validation; confirm chat hash preservation and absence of unsupported Hesperus terminal evidence.

- [ ] **Step 7: Push verified main and confirm remote SHA**

Use network-enabled GitHub CLI to check auth/repository, fetch `origin/main`, verify ancestry, push `main`, and confirm `gh api repos/MentallyQuill/Directive/commits/main --jq .sha` equals local `HEAD`.
