# Native Timeline Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make native branches, Save Game, and Load Game failure-atomic, exactly bound, transcript-attested, recoverable, and serialized with accepted-pair settlement.

**Architecture:** Extend the existing lineage module into the single transcript-fingerprint authority, let host adapters attach and verify immutable-chat attestations, and serialize all semantic mutations through the runtime queue plus a per-campaign transaction lease. Keep the existing journal and active-index commit point, while making retries repair torn summaries and recovery reopen the exact journaled child.

**Tech Stack:** JavaScript ES modules, Node.js assertion scripts, SillyTavern extension APIs, Directive V1 state/storage contracts, Web Locks API with an in-realm FIFO fallback.

## Global Constraints

- Preserve all unrelated work, including `debug.log`, existing player data, and unrelated worktrees.
- Existing saved games without transcript attestations remain readable.
- Newly cloned saved-game chats always receive a versioned attestation.
- No campaign or chat artifact is deleted unless the exact operation proves ownership.
- `index.activeSaveId` remains the semantic commit point.
- No model work is repeated during branch or load reconstruction.
- Use `npm.cmd` for Node package and verification commands on Windows.

---

### Task 1: Complete transcript and binding authority

**Files:**
- Modify: `src/runtime/native-branch-lineage.mjs`
- Modify: `src/hosts/sillytavern/chat-adapter.mjs`
- Modify: `src/hosts/fake/fake-host.mjs`
- Modify: `tools/scripts/test-native-branch-lineage.mjs`
- Modify: `tools/scripts/test-sillytavern-checkpoint-chat.mjs`

**Interfaces:**
- Produces: `createNativeBranchTranscriptAttestation(messages) -> { kind, version, messageCount, lineageHash }`.
- Produces: `verifyNativeBranchTranscriptAttestation(messages, attestation) -> { ok, reasonCode }`.
- Produces: `chat.verifyCampaignChatSnapshot(binding) -> Promise<{ ok, legacy?, reasonCode? }>`.

- [ ] **Step 1: Add failing tests for wrong host/campaign/entity, hidden/source-mutation drift, transcript attestation mismatch, and a 180-character filename collision.**

- [ ] **Step 2: Run `node tools/scripts/test-native-branch-lineage.mjs` and `node tools/scripts/test-sillytavern-checkpoint-chat.mjs`; confirm the new assertions fail for the reproduced behaviors.**

- [ ] **Step 3: Require exact binding fields in lineage proof and include visibility plus source-mutation data in normalized fingerprints.**

- [ ] **Step 4: Attach attestations to cloned bindings, verify them from exact chat snapshots, and reserve filename suffix space before truncation.**

- [ ] **Step 5: Re-run both focused tests and commit with `fix(chat): attest exact timeline clones`.**

### Task 2: Make Save Game publication and checkpoint retry atomic

**Files:**
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/campaign-start-controller.mjs`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Modify: `tools/scripts/test-v1-timeline-storage.mjs`

**Interfaces:**
- Save Game clones first and passes an already-clone-bound state to `controller.createCheckpoint`.
- `prepareTimelineCheckpoint` rewrites the stored record/index summary when its deterministic checkpoint already exists.

- [ ] **Step 1: Add a failing delayed-clone test proving no checkpoint is listable before clone completion and a failing torn-index retry test proving the index remains missing.**

- [ ] **Step 2: Run `node tools/scripts/test-v1-runtime-app.mjs` and `node tools/scripts/test-v1-timeline-storage.mjs`; confirm both failures match the reproduced ordering defects.**

- [ ] **Step 3: Clone the chat before checkpoint publication, validate the clone-bound checkpoint state, and compensate only the exact clone on publication failure.**

- [ ] **Step 4: Re-store an existing deterministic checkpoint during retry so its index summary is reconciled.**

- [ ] **Step 5: Re-run both focused tests and commit with `fix(save): publish only immutable timeline clones`.**

### Task 3: Serialize semantic mutations and enforce early load authority

**Files:**
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/timeline-transaction-service.mjs`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Modify: `tools/scripts/test-v1-native-branch-runtime.mjs`

**Interfaces:**
- Runtime actions enqueue through one `enqueueStateMutation(task)` FIFO.
- Timeline entry points run under `withCampaignTimelineLease(campaignId, task)` without recursive acquisition during recovery.
- Load validates campaign/package and saved-chat attestation before any stage or external write.

- [ ] **Step 1: Add failing tests for settlement/load overlap, duplicate runtime lease entry, cross-campaign load mutation, attestation mismatch, and lost post-fork replay retry.**

- [ ] **Step 2: Run the two focused runtime scripts and confirm the new tests fail for ordering or missing validation, not fixture errors.**

- [ ] **Step 3: Route settlement, chat adoption/recovery, Save, Load, rename, and delete through one runtime FIFO.**

- [ ] **Step 4: Add Web Locks and module-FIFO campaign leasing, then validate campaign/package/attestation before the first Load Game write.**

- [ ] **Step 5: Preserve the replay-needed flag after post-fork replay failure, re-run focused tests, and commit with `fix(runtime): serialize timeline authority`.**

### Task 4: Make journal recovery exact and exhaustively failure-tested

**Files:**
- Modify: `src/runtime/timeline-transaction-service.mjs`
- Modify: `tools/scripts/test-v1-native-branch-runtime.mjs`

**Interfaces:**
- Pre-commit native recovery opens `operation.childBinding` before lineage inspection.
- Load recovery resumes the stored operation at every stage without new IDs or clones.

- [ ] **Step 1: Add a failing recovery test that switches to the parent after `detected`, plus a table-driven Load Game failure harness covering every journal stage.**

- [ ] **Step 2: Run `node tools/scripts/test-v1-native-branch-runtime.mjs` and confirm parent-context recovery fails before the implementation change.**

- [ ] **Step 3: Open and verify the exact journaled child before pre-commit lineage proof; reuse journaled artifacts for every resumed load stage.**

- [ ] **Step 4: Assert pre-commit parent authority, post-commit child authority, immutable selected saves, and no duplicate saved-game/chat artifacts at each injected failure.**

- [ ] **Step 5: Re-run the focused runtime test and commit with `fix(timeline): recover exact journaled chat`.**

### Task 5: Full review, integration, installation, and live proof

**Files:**
- Modify only if verification reveals a defect.

**Interfaces:**
- Final source, merged `main`, `origin/main`, and installed extension commit identities agree.

- [ ] **Step 1: Run all focused scripts changed by Tasks 1-4, then `npm.cmd test`; require 0 failures.**

- [ ] **Step 2: Review the complete diff against this plan and the hardening design; scan for placeholders, stale claims, unguarded writes, and compatibility regressions.**

- [ ] **Step 3: Dispatch an independent code reviewer against the base and feature SHAs; fix every Critical or Important finding test-first and repeat the full gate.**

- [ ] **Step 4: Merge `codex/native-timeline-hardening` into `main`, run `npm.cmd test` on merged `main`, and push `main` to `origin`.**

- [ ] **Step 5: Copy merged source to the `default-user` Directive extension while excluding `.git`, `.worktrees`, `node_modules`, artifacts, and user data; verify its commit marker and run the installed-extension gate.**

- [ ] **Step 6: Run isolated live proof for Save Game ordering, attestation rejection, exact binding, and recovery without altering existing Sam Vickers artifacts. Confirm GitHub reports the final `main` SHA.**
