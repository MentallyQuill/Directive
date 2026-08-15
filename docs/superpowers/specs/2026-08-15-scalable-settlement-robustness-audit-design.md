# Scalable Settlement Robustness Audit Design

## Status

Authorized for implementation on 2026-08-15 by the request to audit the shipped scalable-settlement work, make any necessary corrections, and push the result to `main`.

## Scope and invariants

This is a bounded hardening pass over the new-save-only V1 architecture. Accepted-pair receipts and Story Settlement remain semantic authority. SillyTavern remains narrator, provider, and visible-chat owner. The physical layout remains a state-free manifest, immutable base, and bounded JSON delta segments. Episode evaluation remains one non-authoritative post-narration Reasoning call per checkpoint.

This pass will not add migration, compatibility hydration, a database, embeddings, a sidecar authority index, a new model role, or an automatic history summarizer.

## Audit findings

### Manifest commit versus index-cache refresh

For an existing published save, the manifest is the durable commit point and the index summary is a repairable cache. The current repository writes the manifest and then propagates an index write failure. The state gateway consequently rolls memory back even though storage already advanced, and the next persistence attempt sees a false concurrent-update conflict.

An existing save update whose manifest has been written and whose active pointer is already correct must return success even if the summary refresh fails. A later direct load repairs the stale published summary. Brand-new saves and active-pointer changes still require a successful index publication and continue to fail closed.

### Delete ordering

Deleting base and segment files before removing the published index entry can leave a visible manifest pointing at missing state if cleanup fails. Deletion must first remove the save from the index, then remove the manifest and save-owned content. Post-unpublication cleanup failures are reported as recoverable cleanup diagnostics rather than turning the already-committed deletion into a false rollback.

### Hydration hash cost

Every segment is content-hash verified and every delta carries a before/after hash chain, yet hydration currently recomputes full-state SHA-256 before and after every delta. Hydration will instead validate each strict delta against the trusted running hash declared by the verified base/previous delta, apply the operations and revision checks, and compute one final full-state hash against the manifest head. The public standalone delta decoder retains full before/after hashing.

### Host event isolation

The runtime no longer holds Directive's mutation queue during the episode-evaluator provider call, but the SillyTavern `GENERATION_ENDED` listener still returns that promise to the host's sequential event emitter. The shell listener must schedule Directive post-narration work and return immediately so TTS and other extensions are not delayed. Runtime-metadata attachment failure must be contained so it cannot suppress the episode-review scheduler.

### Scale-test truthfulness and bounded caches

The current scale test directly calls the source-window constant and call-budget helper, so those assertions cannot detect a regression in `runtime-app`. A real 10,000-row fake chat must execute `observeHostPlayerMessage()` and assert the actual host read limit, accepted-pair Utility call delta, evaluator-call delta, and successful durable settlement. The per-fingerprint in-memory call-budget entry must be cleared after a successful receipt commit so a long process retains only unresolved failures.

## Failure handling

- Manifest or segment corruption remains fatal and never falls back to a wider transcript or legacy save.
- A stale or malformed delta still fails before the final manifest hash check.
- New-save index publication and active-pointer changes remain transactional.
- Post-delete cleanup diagnostics identify exact logical paths without exposing story prose.
- Detached host-event work logs failure through the existing shell reporting path.

## Verification

The implementation is complete only when focused red/green tests prove each audit finding, the 30/1,000/10,000 storage contract remains green, a real 10,000-row runtime Continue uses one eight-row read and one accepted-pair Utility call with zero evaluator calls, and `npm.cmd test` passes on the integrated `main` tree. `debug.log` must remain uncommitted.
