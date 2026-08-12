# Native Timeline Hardening Design

## Status

Approved for uninterrupted implementation, merge to `main`, push, installation in the `default-user` SillyTavern extension, and live verification.

This specification hardens the native branch, Save Game, and Load Game feature that shipped from the 2026-08-11 native chat branch timeline design. It does not change the player model. It closes authority, atomicity, recovery, and concurrency gaps found by adversarial review.

## Observed Failure Modes

The current implementation can be made to exhibit these failures:

- Save Game publishes a checkpoint that still references the mutable active chat before its immutable clone exists.
- A save-file write followed by a failed index write leaves a valid checkpoint file that an idempotent retry returns without repairing the index.
- Recovery of a pre-commit native branch inspects whichever chat is current instead of reopening the journaled child, so recovery can strand when SillyTavern returns to the parent.
- Native-branch proof accepts bindings with missing entity identity, does not require host or campaign equality, and ignores hidden/source-mutation changes in retained messages.
- Timeline operations use a different queue from accepted-pair settlement and can race semantic state commits.
- Newly cloned immutable chats have no transcript attestation, so an edited saved chat can be loaded with state that no longer corresponds to its transcript.
- A 180-character SillyTavern filename can consume the numeric collision suffix and select an existing filename.
- Runtime binding checks compare only the chat filename even though the same filename can exist under another character.
- Load Game does not reject a selected save from another campaign before creating external artifacts.
- A failed post-fork accepted-pair replay does not retain the retry flag.
- Load Game recovery lacks failure injection coverage across every journal stage.
- Separate Directive runtime instances do not share an operation lease.

## Required Behavior

### Save Game Atomicity

Save Game must clone and persist the immutable SillyTavern chat before it publishes the checkpoint in Directive storage. The checkpoint state written to storage must already contain the cloned chat binding. If checkpoint publication fails, Directive must remove only the exact clone it created; the active timeline remains unchanged.

An idempotent checkpoint retry must rewrite/reconcile the index summary even when the checkpoint file already exists. A previously completed save-file write must never remain permanently invisible because the later index write failed.

### Exact Binding and Lineage Authority

Every active or candidate binding comparison must require exact equality for:

- host ID;
- campaign ID;
- chat ID;
- entity type;
- entity ID; and
- entity name.

Native-branch transcript normalization must include role, stable host-message ID, selected swipe identity, selected text, normalized host visibility, and normalized source-mutation data. Any retained-message difference in those fields invalidates the branch candidate.

### Immutable Transcript Attestation

Every newly cloned saved-game chat binding must carry a versioned transcript attestation containing the normalized message count and deterministic lineage hash. Load Game must verify that attestation against the exact preserved chat before it clones, checkpoints, or switches anything.

Existing saved games without an attestation remain loadable for compatibility. Once present, an attestation is mandatory authority and a missing verifier or mismatch fails closed.

### One Semantic Mutation Queue

Accepted-pair settlement, native-branch adoption/recovery, Save Game, Load Game, saved-game rename, and saved-game deletion must use the same runtime mutation queue. A timeline operation sees all earlier settlement writes and prevents later settlement writes until its state transition completes.

The timeline transaction service must additionally use a cooperative per-campaign lease. Browser environments use the Web Locks API when available so tabs coordinate; tests and single-realm environments use a module-level FIFO fallback. Recovery must not recursively reacquire its own lease.

### Journal Recovery

Before proving a pending native branch, recovery must reopen the exact child binding recorded by the journal. It must then repeat the normal lineage proof and stage validation. Failure to open or prove that exact child leaves the journal pending and generation disabled.

Every Load Game stage must be failure-injected in tests. Before `active-pointer-switched`, recovery retains the parent as authority. At or after that commit point, recovery completes forward with the exact child. Retries must not create duplicate checkpoints, child saves, or chat clones.

### Early Validation and Retry Semantics

Load Game must reject a selected record whose campaign or package authority differs from the active campaign before prompt clearing or any host/storage write.

If accepted-pair replay after a committed fork fails, the runtime must retain `acceptedPairReplayNeeded = true`. The next eligible event or generation interception retries the replay before campaign generation.

### Collision-Safe Chat Naming

The SillyTavern clone filename algorithm must reserve space for every collision suffix before applying the 180-character limit. The returned filename must be absent from the existing-name set, including when the unsuffixed base already occupies all 180 characters.

## Authority and Failure Invariants

1. No checkpoint references a mutable chat that will continue receiving messages.
2. No active pointer changes before child state, chat binding, transcript proof, and journal state all validate.
3. A saved chat with a present attestation is never loaded after transcript mutation.
4. A retry repairs durable summaries and resumes the same deterministic operation.
5. Recovery acts on the exact journaled chat and entity, never ambient UI context.
6. Accepted-pair settlement and timeline mutations never overlap within one runtime.
7. Cooperative runtime instances serialize timeline operations for the same campaign.
8. Cross-campaign records fail before any mutation.
9. Legacy unattested saves remain compatible, but newly created saves are always attested.
10. Ordinary non-campaign chats remain unaffected.

## Component Changes

- `native-branch-lineage.mjs` owns complete normalized transcript fingerprints and versioned transcript attestations.
- SillyTavern and fake chat adapters attach and verify attestations and enforce collision-safe names.
- `runtime-app.mjs` owns the single semantic mutation queue, exact current-binding comparison, clone-before-publish Save Game, and replay retry state.
- `timeline-transaction-service.mjs` owns early selected-save validation, cooperative campaign leasing, exact-child recovery, and attestation checks.
- `campaign-start-controller.mjs` repairs checkpoint index visibility during idempotent retry.

No new semantic chronology or per-message full-state save is introduced.

## Verification

Focused regression tests must prove each reproduced failure is red before its fix and green after it. The complete `npm.cmd test` alpha gate must pass in the feature worktree and again on merged `main`.

The installed `default-user` extension must be updated from merged `main`. Live proof must use an isolated temporary Directive campaign/chat created for verification or a read-only inspection of existing player data; it must not delete or rewrite the Sam Vickers campaign artifacts. GitHub verification must confirm local `main`, `origin/main`, and the installed extension all identify the same final commit.

## Non-Goals

- No per-message full campaign snapshots.
- No SillyTavern core changes.
- No migration that invents attestations for legacy saved chats.
- No automatic repair of an attestation mismatch.
- No deletion or normalization of existing player campaign data.
