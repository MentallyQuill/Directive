# Captured publication reconciliation implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Resolve an uncertain captured save publication by reading and verifying its exact prior or attempted head, without retrying any write.

**Architecture:** Add a disabled repository recovery API next to the captured publication API. Reuse the complete state/history verifier and verify index ownership plus a final exact manifest read. Runtime capture and earlier branching remain disabled; controller-owned quarantine and full writer integration follow separately.

**Tech Stack:** JavaScript ES modules, Node assertions, existing JSON storage adapter and SHA256 codec.

**Spec:** `artifacts/stabilization-20260914/branch-chronological-capture-next-implementation.md`, exact durable outcome protocol. Current source audited at `36a709f8ddec6601465a4f63bbb99197b8a231f3`.

## Global constraints

- Preserve the existing legacy persistence API and all existing save formats.
- No provider calls, host changes, state mutation, storage writes, cleanup, pointer switching or automatic retries in reconciliation.
- Manifest equality alone is insufficient: verify its complete state chain and captured history.
- A missing, corrupt, unreadable or unrelated head remains uncertain.
- Inputs must be detached before the first await.
- This API requires the caller's existing campaign lease; it does not provide backend compare-and-swap.
- Reconcile only after the publication attempt has settled and no writes from that attempt remain in flight. A read cannot certify that a still-running writer will never publish later.
- Do not enable runtime capture, replace optimistic rollback, or relax chronological branch refusal in this slice.

## Task 1: Exact read-only outcome resolution

**Files:**
- Modify `src/storage/v1-storage-repository.mjs`.
- Create `tools/scripts/test-v1-captured-publication-recovery.mjs`.
- Modify `tools/scripts/run-alpha-gate.mjs` to include the regression.

**Interface:**

```js
resolveV1CapturedPublication(adapter, {
  expectedManifest,
  attemptedManifest, // null if publication never produced a candidate manifest
  expectedActiveSaveId, // string or null; required, never inferred from current storage
  operationId,
})
// Certain outcomes contain verified save/manifest, operationId and publication.
// committed also contains captureHead.
// Uncertainty preserves detached expected/attempted identities and an error diagnostic.
```

- [x] Write regression cases using a real baseline and captured revision commit, built through the production storage API. Confirm the new export is initially missing.
- [x] Return `committed` only when current equals the exact attempted manifest, the complete chain verifies, and the latest history record matches both operationId and SHA256(expectedManifest).
- [x] Return `not-committed` only when current equals the exact expected manifest and its complete chain verifies. Null attemptedManifest allows only this outcome or uncertainty.
- [x] Recheck the expected indexed save and exact active pointer after chain verification, then read the exact manifest last. Distinct valid later heads are uncertain, not evidence that this operation succeeded.
- [x] Reject malformed identities, equal expected/attempted manifests, foreign save IDs and mismatched operation provenance as uncertainty. Keep detached input evidence in the result.
- [x] Assert no writes/deletes for every test, including invalid, corrupt, missing and racing storage.

Representative assertions, using the fixture created by the test:

```js
const committed = await storage.resolveV1CapturedPublication(committedAdapter, request);
assert.equal(committed.publication, 'committed');
assert.deepEqual(committed.save.state, candidateState);
const prior = await storage.resolveV1CapturedPublication(priorAdapter, request);
assert.equal(prior.publication, 'not-committed');
assert.deepEqual(prior.save.state, previousState);
assert.equal(committedAdapter.writes, 0);
assert.equal(priorAdapter.writes, 0);
```

Failure cases must include matching prior manifest with corrupt base, matching attempted manifest with corrupt history, wrong operation, wrong expected digest, changed pointer, manifest changing during final verification, input mutation during an awaited read, absent manifest, and unreadable storage. Repeated recovery must stay read-only and yield the same verified result without applying another revision.

## Task 2: Review, verification and publication

- [x] Run `node tools/scripts/test-v1-captured-publication-recovery.mjs` and `node tools/scripts/test-v1-captured-state-boundaries.mjs`.
- [x] Obtain independent scoped review of input provenance, complete chain verification, ownership races and read-only guarantees; resolve actionable findings.
- [x] Run `npm.cmd test` once on the final reviewed source, plus `git diff --check` (235 checks passed).
- [ ] Document bounded evidence and remaining runtime blockers in `docs/testing/PLAYER_PROMISE_STABILIZATION.md`; stage only scoped files, commit/push and verify main with network-enabled GitHub CLI.

## Subsequent integration boundary

The next runtime slice must introduce save-scoped quarantine owned outside recreated gateway instances, explicit result transport through controller/service/runtime, candidate ownership checks, blocked dependent generation and every direct writer, and verified restart recovery. `committed` with an acknowledgement diagnostic must remain committed; uncertainty must stop success continuations without restoring an unproven prior state. The current gateway discards fulfilled persistence results and rolls back on exceptions, so it must not consume this API or captured publication implicitly.

Chronology capture additionally needs synchronous detached full transcript anchoring, complete writer disposition, migration/reset treatment, inherited archive ownership and edit/delete mapping. This plan supplies outcome verification only.
