# Captured Transcript Cut Reader Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for bounded implementation and independent review. Preserve the full stabilization goal; this reader is a dependency of runtime enrollment and native branch integration.

**Goal:** Restore the exact complete captured state for an append-only native transcript cut, including prior manual corrections and removed effects.

**Architecture:** Reuse verified captured storage and exact revision restoration. The latest capture whose observed vector is a prefix of the retained transcript selects the state. This defines the cut as after all authority changes made before any discarded row existed. Same-vector commits select the latest one. Production capture and branch activation remain disabled until enrollment, immutable inheritance and lifecycle integration are complete.

**Tech Stack:** JavaScript ES modules, existing SHA256/canonical JSON storage contracts, Node assertions.

**Spec:** Active six-area goal; captured-runtime-writer-map-review.md and captured-cut-selection-probe.mjs/.json in artifacts/stabilization-20260914. The controlled probe verifies actual stored resolve/resume/reopen states and shows the current native preflight still refuses them. Its row hashes are controlled fixtures, not native provenance.

## Global constraints

- No host/provider calls, current-save activation, index repair or storage writes from the reader.
- Every caller-owned input is detached before the first await. Exact expected manifest must remain current before and after all verification and result hashing.
- Reuse V1_BRANCH_HISTORY_LIMITS; reject malformed, unsafe, oversized or inconsistent row/count/vector values.
- Verify the complete state suffix and catalog, not merely the selected boundary. Missing/corrupt objects and stale heads return no partial state.
- Entire supplied parent vector must extend the published capture vector; a matching short cut does not excuse an edited parent suffix. V1 is append-only; nonprefix mutation support needs an explicit protocol and must not search unrelated historical paths.
- Do not publish this dependency as completed chronology or enable native branching with partial writer coverage.

## Task 1: Verified cut restoration

**Files:** Modify src/storage/v1-storage-repository.mjs; create tools/scripts/test-v1-captured-transcript-cut.mjs. Root owns release-gate registration and integration documentation.

**Interface:** Export loadV1CampaignStateAtTranscriptCut(adapter, saveId, { expectedManifest, transcript, retainedRowCount }). transcript is the exact V1 projection payload { projectionVersion: 1, rowCount, rowHashes, vectorHash }. Return the existing revision reader's exact state/hash/revision/origin plus explicit capture floor, selected operation/index/vector and supplied parent/cut hashes. The caller must separately verify host provenance, native parent/child lineage and lifecycle admission; the reader grants none of them.

- [x] Write a failing public reader test using real objective resolve/resume/reopen gateway states persisted through storeV1CampaignSaveWithCapture. Include a later correction that changes/prunes authority, two commits at the same vector, cuts at and between anchors, current tail, and before-floor refusal. Assert deep equality with independently retained full states, not just decision flags.
- [x] Run node tools/scripts/test-v1-captured-transcript-cut.mjs; confirm missing-function failure before implementation.
- [x] Validate/detach inputs, verify complete state/history and current expected head, reject missing capture/nonprefix current parent, select latest eligible record, restore its exact revision, and recheck expected head after every asynchronous verification stage. Return detached provenance and no implicit replay.
- [x] Verify every selected historical record's request identity against its exact saved metadata, reconstructed after-state and full vector. Assess all-record validation so forged earlier anchors cannot change cut selection while the latest record remains valid. Reuse state replay rather than holding all full states in memory.
- [x] Add failures for stale/torn head, missing/corrupt earlier and later objects, changed source before/inside/after the cut, malformed vectors, unsafe limits, package/origin drift, forged request metadata, and mutation of input arrays while a read is held. A read-only adapter exposing only readJson must work; count zero writes.
- [x] Run the new suite plus captured-state-boundaries, captured-publication-recovery and exact historical-state suites found in the current gate. Independently review selection policy, whole-chain validation, bounds and async ownership. Preserve RED/GREEN evidence.

## Subsequent integration requirements

The full feature still requires synchronous gateway sampling, controller-owned frozen captured requests, baseline enrollment after binding/opening/migration, captured lifecycle closure, immutable inherited state/history retention before parent retirement, and use of this reader in the actual native branch transaction. Nonprefix edits, deletion and Continue need catalog transitions and truthful coverage. A cut inside an edit-induced coverage gap cannot silently use an older matching state; typed dependency projection or refusal is required. These requirements remain in the active goal and are not satisfied by this reader.
