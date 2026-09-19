# Immutable Captured History Archive Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for bounded implementation and independent review. This dependency does not authorize enabling runtime capture or partial native branching.

**Goal:** Preserve a verified captured save graph after its live parent advances or is deleted.

**Architecture:** Copy canonical JSON into immutable content-addressed blobs, then publish a content-addressed descriptor last. A closed, read-only virtual adapter resolves original logical paths from that descriptor, allowing the captured cut reader to retain original ownership and validate the complete history.

**Tech Stack:** Existing JavaScript ES modules, canonical JSON/SHA256, V1 captured storage and Node assertions.

**Spec:** The active six-area stabilization goal, the captured-transcript-cut-reader plan, and the independently reviewed archive invariants recorded below. Capture stays disabled until writer enrollment, inheritance edges and native branch consumption are integrated and verified.

## Contract and constraints

- Add `src/storage/v1-captured-history-archive.mjs` and `tools/scripts/test-v1-captured-history-archive.mjs`. Do not edit the repository reader while its worker owns it.
- Export `createV1CapturedHistoryArchive(adapter, saveId, { expectedManifest, transcript })` and `loadV1CapturedHistoryArchive(adapter, reference)`. Creation requires the caller's existing campaign lease and settled prior writes, as existing captured publication does. Detach and validate all caller inputs before the first await.
- Creation verifies the source through `loadV1CampaignStateAtTranscriptCut` at the supplied full row count. Record the exact logical paths read and their canonical hashes and byte counts without retaining every payload. Repeated reads of the same path must have identical identity.
- Reread and copy each recorded object only when its identity still matches. Store at `v1/history-archives/object-<sha256>.json`. Existing addressed content must hash correctly; refuse conflicts instead of overwriting them. Preserve original JSON owner identifiers.
- Descriptor kind/version must be strict, with exact fields: `kind`, `version`, `source` (reader origin including save/campaign/package/version/slot/parent/branch identity), `manifestHash`, `transcript`, `entries` (sorted unique logical path/contentHash/byteLength), `coverage` (reader state-chain coverage), and `capture` (reader floor, selected head, parent and cut). Reference is the descriptor's exact hash-scoped path and content hash. Descriptor path is `v1/history-archives/archive-<sha256>.json`. The supplied full transcript can extend the captured head: preserve both identities and never claim the uncaptured suffix has an authority capture.
- Derive source identity, package and coverage through the verified reader; descriptor claims must be checked against the archived graph when loading. Do not rely on caller-supplied claims.
- Only the exact save manifest/base/segment paths and owner-scoped history page/vector paths reached by the verifier are allowed. Reject duplicate mappings, foreign owners, unexpected namespaces and missing graph nodes. No global index and no fallback to live storage.
- Before publishing the descriptor, verify the complete virtual graph using the cut reader, including all state suffixes and historical request identities. The virtual adapter exposes only `readJson` and rejects any unmapped path. Require its visited path set to equal the descriptor map, so extra entries are refused.
- Recheck the exact live manifest after source verification, after copying, before descriptor publication and after descriptor readback. A changed head returns no successful reference. Partial immutable objects can remain unreferenced; never remove them during failure recovery.
- Canonical JSON identity is the contract; do not describe this as raw byte preservation.
- Preserve existing per-object/chain limits. Additional archive caps: 36,642 logical entries (manifest + base + 16,384 segments + 256 pages + 20,000 vector chunks); at most that many unique blobs; aggregate payload bytes at most 1,216 MiB (1 GiB segments + 64 MiB base + 64 MiB history + 64 MiB manifest allowance); descriptor at most 16 MiB. Count repeated content once for unique-blob bytes and all entries for logical count. Enforce limits before copying and while reading untrusted descriptors. These are refusal bounds, not allocation targets; stream payload processing.
- No index mutation, activation, native calls, provider calls or deletion. Archive garbage collection remains deferred until reachability includes checkpoints, children, durable intents and incomplete timeline journals.
- An interrupted descriptor write is recoverable by exact content-addressed retry. Once computed, failures expose the deterministic `attemptedReference` and phase (`copy`, `verify`, `publish`, `readback`, or `head-check`) so an error never implies descriptor absence. A future timeline journal records the returned or attempted reference before any dependent child publication or parent retirement. A crash before the journal learns the reference can leave harmless orphan objects; it cannot authorize parent deletion. This module alone does not supply runtime recovery ownership.
- Loading returns a verified read-only adapter, detached source manifest/transcript, reference and derived coverage. No child rebasing occurs here. Future inheritance edges must bind the archive reference, selected state/record/vector and verified rebased child baseline; parent and child state hashes are expected to differ.

## Task 1: Archive creation and verified loading

- [x] Build a small captured history using public storage APIs. Retain independently expected states. Write a failing public archive round-trip test and preserve the missing-export RED result.
- [x] Implement strict descriptor/reference validation, canonical identity helpers, closed virtual reads and bounded source collection/copying.
- [x] Implement create with verify/copy/verify/publish-last order and exact-head checks. Implement load with addressed descriptor verification, graph validation and rederived claims.
- [x] Verify historical cuts after parent advancement, segment a/b rotation and deletion of every live parent file. Assert original ownership and exact complete state equality, with no live fallback or index writes.
- [x] Test mutation during the two-pass copy, repeated path changes, missing/corrupt blobs, forged coverage, foreign-owner paths, duplicate/extra mappings, destination collision, bounds, caller mutation across await, descriptor-write interruption and exact retry. Assert no successful reference on any failure.
- [x] Run the archive suite and captured-cut reader suite; request independent review before integration. Root owns gate registration, release evidence and publication. Do not commit or install unreviewed work.

## Remaining integration

Writer enrollment, nonprefix transition coverage, checkpoint/child inheritance edges, actual earlier-branch consumption and live native proof remain required. A passing archive test supplies storage lifetime evidence only. The six-area goal and mandatory real-provider soak remain open.
