# Durable Accepted-Pair Settlement Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable, exact, invalidatable accepted-pair receipts to Story Settlement so native branch replay is zero-call for retained history and never suppresses new or mutated pairs.

**Architecture:** A focused runtime receipt module creates and matches canonical pair fingerprints. Story Settlement owns receipt persistence and invalidation, while the V1 state spine commits receipt changes atomically with existing gameplay authority. Existing two-contribution matching is retained only as a legacy compatibility fallback.

**Tech Stack:** Browser-safe JavaScript modules, Directive V1 Story Settlement/state spine, Node.js assertion tests, SillyTavern default-user installed extension.

## Global Constraints

- Preserve the exact default-user Sam Vickers chat and active save.
- Keep Story Settlement as semantic authority; do not create another top-level tracker.
- Keep schema version 1 and accept old saves with no `acceptedPairReceipts` field.
- A pair identity includes both message IDs, both selected swipe IDs, both text hashes, and the source-range hash.
- Rejected or corrected assistant prose never becomes a Story Settlement contribution.
- No provider calls are permitted during deterministic native branch reconstruction.

---

### Task 1: Receipt contract and pure identity module

**Files:**
- Create: `src/runtime/v1-accepted-pair-receipt.mjs`
- Modify: `src/story/story-settlement-contracts.mjs`
- Modify: `schemas/story/story-settlement.schema.json`
- Test: `tools/scripts/test-v1-story-settlement-contracts.mjs`

**Interfaces:**
- Produces: `createV1AcceptedPairReceipt(...)`, `v1AcceptedPairReceiptMatches(...)`, and validated optional `storySettlement.acceptedPairReceipts`.

- [ ] **Step 1: Write failing contract tests** for exact descriptors, nullable swipe IDs, supported acceptance outcomes, duplicate fingerprints, and malformed receipts.
- [ ] **Step 2: Run `node tools/scripts/test-v1-story-settlement-contracts.mjs`** and verify the new receipt cases fail.
- [ ] **Step 3: Implement the minimal receipt constants, validation, fingerprint creation, and exact matcher.** Use `stableHash24` only as an index; compare every descriptor when matching.
- [ ] **Step 4: Run the contract tests** and verify they pass.

### Task 2: Story Settlement receipt custody and invalidation

**Files:**
- Modify: `src/story/story-settlement.mjs`
- Test: `tools/scripts/test-v1-story-settlement.mjs`

**Interfaces:**
- Produces: `recordAcceptedPairReceipt(settlement, receipt)` and `invalidateAcceptedPairReceipts(settlement, { sourceMessageIds })`.

- [ ] **Step 1: Write failing lifecycle tests** proving append, exact replacement, unrelated retention, message-source invalidation, and legacy settlement compatibility.
- [ ] **Step 2: Run `node tools/scripts/test-v1-story-settlement.mjs`** and verify the lifecycle cases fail.
- [ ] **Step 3: Implement receipt recording and invalidation.** Each material mutation increments Story Settlement revision once and validates the result.
- [ ] **Step 4: Run the lifecycle tests** and verify they pass.

### Task 3: Atomic state-spine integration

**Files:**
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `src/runtime/v1-branch-reconstruction.mjs`
- Test: `tools/scripts/test-v1-state-spine-runtime.mjs`
- Test: `tools/scripts/test-v1-branch-reconstruction.mjs`
- Test: `tools/scripts/test-v1-mission-journey-rebuild.mjs`

**Interfaces:**
- Consumes: Story Settlement receipt record/invalidate functions.
- Produces: `settleAcceptedPair({ acceptedPairReceipt })` and `invalidateSources({ sourceMessageIds })` atomic behavior.

- [ ] **Step 1: Write failing state-spine, reconstruction, and journey tests** for receipt-only invalidation, discarded-host receipt pruning, and causal descendant receipt pruning.
- [ ] **Step 2: Run the focused scripts** and verify the new assertions fail.
- [ ] **Step 3: Record receipts in every successful settlement proposal and remove them during source invalidation.** Commit receipt-only changes even when no contribution ID is owned by mission or story evidence.
- [ ] **Step 4: Pass discarded host IDs into branch reconstruction invalidation and prune receipts for every mission/story descendant removed by causal rollback.** Keep `modelCallCount` equal to zero during deterministic reconstruction.
- [ ] **Step 5: Run all focused scripts** and verify they pass.

### Task 4: Mission runtime dedupe and production invalidation

**Files:**
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Test: `tools/scripts/test-v1-mission-authoritative-time-runtime.mjs`

**Interfaces:**
- Consumes: receipt creation/matching and state-spine receipt custody.
- Produces: receipt-first exact pair dedupe plus two-contribution legacy fallback.

- [ ] **Step 1: Add failing regressions** for 129 later time decisions, accepted-invalidated-corrected rebind, and identical-text swipe `0` to `1`.
- [ ] **Step 2: Run `node tools/scripts/test-v1-mission-authoritative-time-runtime.mjs`** and verify each regression fails for the expected stale or missing authority reason.
- [ ] **Step 3: Replace time-decision matching with durable receipt matching.** Create a receipt from the interpreted outcome and pass it into the atomic state-spine settlement.
- [ ] **Step 4: Allow `invalidateSourceMutation` to commit receipt/time authority changes with zero contribution IDs.**
- [ ] **Step 5: Run the authoritative-time runtime test** and verify all positive and negative cases pass.

### Task 5: Verification, installation, live proof, and release

**Files:**
- Verify intended source/test/docs only.
- Install production source into `F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive`.

**Interfaces:**
- Produces: tested source, exact installed-file hash equality, unchanged repaired live authority, and pushed `main`.

- [ ] **Step 1: Run the focused runtime, Story Settlement, branch, and app suites.**
- [ ] **Step 2: Request an independent read-only diff review and address every critical or important finding.**
- [ ] **Step 3: Run `npm.cmd test`** and require `[v1-gate] passed 134 focused checks.`
- [ ] **Step 4: Back up and install only the final production source.** Do not start SillyTavern until the installed hash matches the repository hash.
- [ ] **Step 5: Start SillyTavern and verify the exact active save remains custody 45, mission 11, story 90, with 40 contributions and no historical Utility replay.**
- [ ] **Step 6: Stop the diagnostic server, stage only intended files, commit, synchronize with current `origin/main`, rerun proportionate verification if rebased, and push `main`.**
