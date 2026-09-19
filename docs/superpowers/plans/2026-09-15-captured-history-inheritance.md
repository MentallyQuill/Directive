# Captured History Inheritance Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development with independent review. Keep the six-area goal intact; runtime capture/branch enablement is not part of this storage slice.

**Goal:** Publish a checkpoint or child baseline together with verified immutable provenance that survives later writes and parent deletion.

**Architecture:** One optional manifest-level historyInheritance field binds an immutable archive selection to the exact target baseline. Creation verifies the archived selection and deterministic target derivation; later publication and recovery preserve the exact field. The ordinary save metadata and parent history objects retain their existing ownership.

**Tech Stack:** V1 manifest contracts, canonical JSON/SHA256, captured archives/readers, existing runtime custody rebinder, Node assertions.

**Spec:** artifacts/stabilization-20260914/history-next-integration-design.md and the completed archive/cut-reader plans. Independent design recommended manifest-level provenance because normalized saveMetadata would discard it.

## Contract

- Own src/storage/v1-segmented-save-contracts.mjs, src/storage/v1-storage-repository.mjs, new src/storage/v1-captured-history-inheritance.mjs and tools/scripts/test-v1-captured-history-inheritance.mjs. Root owns gate registration and later controller integration. Preserve prior reviewed reader changes.
- Strict historyInheritance fields: kind `directive.capturedHistoryInheritance.v1`, version1, archive{path,contentHash}, source{saveId,manifestHash,recordIndex,operationId,revision,stateHash,vectorHash,rowCount}, cut{rowCount,vectorHash}, target{saveId,slotType,baselineRevision,baselineStateHash,bindingHash}, derivationVersion1. Validate exact keys, hashes, IDs, safe bounded integers and target save/slot/base identity. No implicit ancestry authorization.
- Field is outside campaign state/saveMetadata. A first manifest with an edge must have matching target base revision/hash. Existing manifest updates must preserve the edge exactly; no ordinary/captured/rename/retry path may add/remove/replace it.
- Export explicit storeV1CampaignSaveWithInheritance(adapter, save, { inheritance, expectedActiveSaveId, runtimeAssets }). It creates only inactive new targets, never switches active pointer. Existing exact baseline+edge is idempotent retry; different existing target refuses. Runtime assets are required for active-child custody derivation; detach caller data before awaits. Avoid top-level cyclic initialization if reusing archive/reader from repository; a dedicated verifier module/dynamic import at invocation is acceptable.
- Verify archive with loadV1CapturedHistoryArchive; restore exact supplied cut via loadV1CampaignStateAtTranscriptCut on its closed adapter. Compare every source selection field and cut hash against derived results. Verify source and target campaign/package identity. No live parent fallback.
- DerivationVersion1 means existing rebindV1CampaignStateCustody for active child using its target binding and runtimeAssets. Compare the ENTIRE derived state to candidate state, including custody, effects and projection validity. Checkpoints preserve selected parent state exactly except an explicitly documented allowed transcript attestation addition required by existing checkpoint creation; do not accept arbitrary state changes. If that attestation case cannot be verified within this slice, refuse it explicitly and keep controller integration unfinished rather than silently accepting it.
- Compare target bindingHash against complete candidate campaignChatBinding, baselineHash against full candidate state. Do not expect parent and active child hashes to match.
- Source graph with inheritance can be preserved; this first creator derives only from the selected archived local coverage. It does not claim ancestor-cut lookup. Ancestor lookup still requires cycle/depth/aggregate limits and verified rebasing through each edge.
- Caller owns campaign lease and settled publication/timeline journal. Check exact expected active pointer before writes and before publishing/index update. No deletes/cleanup on uncertainty. Use write/readback verification, explicit outcome classification and attempted manifest/reference so future journal can reconcile write-then-throw. An error must never imply target absence. Existing target retry must verify complete baseline and edge before repairing only its index summary, preserving the active pointer.
- Publish verified base then first manifest WITH edge, then inactive index summary. Do not temporarily publish target without provenance. Do not overwrite any conflicting preexisting base or manifest during interrupted retry. Preserve exact canonical identities across retry.
- Ordinary/captured intents and reconstructed attempted manifests must reject edge mutations relative to expected manifest. This includes forged intents whose outer hashes are recomputed. The existing create/update machinery must never silently erase inheritance.
- No native/provider calls, activation, parent retirement or garbage collection. Archive deletion isolation remains unchanged. Full checkpoint/child journal threading and actual native branch consumer remain required next.

## Task: Verified atomic inheritance

- [x] Write public failing tests for strict manifest field and inherited target creation using actual captured archive/cut selection and existing custody rebinder. Preserve RED evidence.
- [x] Implement strict field contract and immutable preservation through ordinary/captured update and intent resolution.
- [x] Implement verified first-manifest creation and exact retry without active pointer change or conflicting-object replacement.
- [x] Test exact complete child state and checkpoint preservation, forged source/cut/baseline/binding/derivation, target collisions, missing/corrupt archive, parent deletion, unknown derivation, caller mutation during awaits, active pointer races, interrupted base/manifest/index writes and write-then-throw outcomes.
- [x] Test ordinary updates, captured baseline/commits, renames and outer-rehashed forged intents cannot remove/replace inheritance. Include a second-generation archive preserving its inherited reference without claiming ancestor coverage.
- [x] Run focused inheritance, manifest/storage, captured publication/recovery and archive/cut suites. Independently review state authority, publication outcomes and ownership. Root runs combined gate after source freezes; no commit/install until coherent integration review.

## Follow-through

Thread expected edge and archive/cut through controller prepareTimelineCheckpoint/persistInactiveTimeline and the durable timeline journal before dependent publication. Guard generic checkpoint cleanup against uncertain resumable creation. Actual branch consumer must use exact historic state and verify target before retiring parent. Transcript-only/nonprefix transitions and writer enrollment remain separate required parts of the full integration, not satisfied by this creator.
