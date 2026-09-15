# Active-save publication recovery implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Follow the ownership boundaries below and review the integrated result before publication.

**Goal:** Make current active-campaign saves distinguish verified success, verified failure and uncertainty, without unsafe memory rollback, resource deletion or dependent generation.

**Architecture:** An explicit existing-active-save publisher records a bounded durable intent before candidate writes and publishes through the existing segmented state machinery. A controller-owned barrier retains operation evidence across gateway recreation; startup resolves persisted intents before migration or replay. The gateway preserves an unresolved candidate on a typed uncertainty error, and runtime guards stop dependent writes and generation.

**Tech Stack:** Existing JavaScript modules, JSON storage adapter, segmented saves, campaign lease, Node assertions and fake-host integration tests.

**Spec:** Active thread six-area goal, persistence and recovery requirements; prior captured-publication plan supplies the exact verified outcome principle. Independent design review confirms ordinary save recovery can ship separately from chronology capture.

## Constraints

- Implement the actual ordinary existing-active-save runtime path; keep creation and checkpoint/timeline transaction publication contracts unchanged.
- Preserve legacy storage callers and all save formats. Captured saves still require the captured writer; runtime chronology capture and earlier-branch permissions remain disabled.
- Preserve the synchronous accepted-source check immediately before logical state application.
- Never infer failure from a thrown write: bytes may already have reached storage.
- Use exact expected/attempted manifests and complete chain verification. Corrupt/missing/unrelated outcomes remain uncertain.
- Require caller campaign ownership; this is not backend compare-and-swap. Recovery requires a settled attempt without outstanding writes.
- Do not overwrite or remove an unresolved durable intent. No automatic retry of its authority mutation.
- Protect original/fixture host data and unrelated debug.log. Publish the integrated reviewed and tested slice to main under standing authorization.

## Task 1: Existing-save publisher and durable intent

**Owner:** storage worker, only repository source and `tools/scripts/test-v1-active-save-publication.mjs`.

**Files:** `src/storage/v1-storage-repository.mjs`; new focused test. Add a private storage module only if necessary to keep responsibilities clear, and report that ownership expansion first.

**Public interfaces:**

```js
V1_STORAGE_PATHS.publicationIntent(saveId)
loadV1ActiveCampaignSavePublication(adapter, saveId) // null or validated detached intent
storeV1ActiveCampaignSaveWithOutcome(adapter, save, {
  expectedManifest, previousSave, expectedActiveSaveId,
}) // committed | not-committed | uncertain; includes detached intent/evidence
resolveV1ActiveCampaignSavePublication(adapter, { saveId, requestHash })
// Read-only: none | committed | not-committed | uncertain.
acknowledgeV1ActiveCampaignSavePublication(adapter, { saveId, requestHash })
// Reverify exact owned intent/outcome before removing only that intent.
```

Intent schema: kind `directive.activeSavePublication.v1`, version 1, saveId, requestHash, expectedActiveSaveId, expectedManifest, attemptedManifest. Derive requestHash by SHA256 of canonical remaining fields. Require exact fields, matching safe save IDs, active pointer equal save ID, same immutable save ownership, and a valid unchanged-state metadata update or exactly one custody revision advance. The intent contains manifest references, not a duplicate mutable campaign state.

- [x] Write failing regression tests against missing exports; build candidates through the real gateway and storage fixtures.
- [x] Validate exact existing indexed active save, prior record/head and pointer. Reuse `prepareSaveStateUpdate` and existing complete verifier. Do not call legacy store and attempt to infer its hidden attempted manifest afterward.
- [x] Write and verify intent before segment/manifest writes. Preserve an existing differing intent as a blocker. An identical intent may resolve idempotently but must not replay candidate writes.
- [x] Publish candidate segments/manifest, verify exact outcome, and treat index metadata failure as acknowledgement information after verified commitment.
- [x] Implement read-only resolution and separate intent acknowledgement. Before deletion reverify both ticket ownership and exact certain outcome. Deletion failure must not turn a committed authority result into an uncommitted result.
- [x] Test write-then-throw; definite pre-publication failure; corrupt prior chain; unreadable verification; pointer/head changes; ticket overwrite refusal; lost acknowledgement; restart resolution and no duplicate state revision. Count writes/deletes to prove read-only resolution.

Representative test contract:

```js
assert.equal(result.publication, 'committed'); // adapter wrote manifest then threw
assert.deepEqual((await loadV1CampaignSave(adapter, saveId)).state, candidate);
const writes = adapter.writes;
const resolved = await resolveV1ActiveCampaignSavePublication(adapter, { saveId, requestHash: result.intent.requestHash });
assert.equal(resolved.publication, 'committed');
assert.equal(adapter.writes, writes);
```

## Task 2: Controller barrier and gateway ownership

**Owner:** root. Files: `src/campaign/campaign-start-service.mjs`, `src/runtime/campaign-start-controller.mjs`, `src/runtime/state-delta-gateway.mjs`, controller/gateway tests.

- [x] Add service option for explicit existing-save outcomes, preserving the legacy default and successful public controller save shape.
- [x] Snapshot controller save/state identity before awaiting publication. Maintain a save-scoped pending record outside gateway instances. Adopt returned save only if the operation still owns controller selection/state.
- [x] On verified non-commitment throw a rollback-compatible failure; on uncertainty retain both candidates and intent and throw `DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN`. Committed acknowledgement problems must not roll memory back.
- [x] Expose `assertSaveWritable(saveId)`, `getSavePublicationStatus(saveId)` and `recoverSavePublication({saveId})`. Recovery resolves/acknowledges the exact intent, then adopts only verified state for a still-owned active save.
- [x] Guard direct persistence, migrations, checkpoint creation/binding/load, rename, timeline preparation/activation, deletion and pointer changes involving the pending save. Preserve read-only access and unrelated saves.
- [x] Before startup migration or automatic state use, inspect durable intent and resolve its actual authority. Retain uncertainty; do not erase it through initialize, ordinary load, chat switch or retry.
- [x] Gateway special-cases the typed uncertainty error without rollback and without a successful proposal result. Recheck candidate ownership after awaited persistence; stale completion must not replace newer memory. Keep generic legacy callback failure behavior.

## Task 3: Runtime continuations and integrated regressions

**Owner:** root. Files: `src/runtime/runtime-app.mjs`, `src/runtime/v1-mission-runtime.mjs`, runtime recovery tests and gate entry.

- [x] Add controller barrier to gateway precondition and queued writer boundary, plus provider preparation/continuation checks. A quarantined bound campaign returns an explicit generation block, never native fallthrough.
- [x] Map uncertainty to a distinct settlement reason. Do not automatically retry the original state write; offer verified reload/recovery through the public app operation.
- [x] Skip campaign-chat rollback/deletion and imported-portrait deletion for uncertain persistence. Preserve resources which either durable outcome may reference.
- [x] Test real fake-host runtime save outcomes, generation rejection, direct writer bypasses, gateway recreation, chat switch, delayed callback ownership and startup with durable intent. Verify Stop/Retry does not clear uncertainty or duplicate effects.
- [x] Verify confirmed pre-publication portrait failure still cleans the unused uploaded image, while write-then-throw retains the committed image and uncertain outcome preserves both candidates' resources.

## Task 4: Review and publication

- [x] Independently review each bounded implementation and the complete integrated diff, especially restart ownership and destructive failure cleanup.
- [x] Run focused regressions, then full `npm.cmd test` on final source and scoped diff checks. Reuse valid checks until changes or findings justify reruns.
- [ ] Record scoped results and remaining chronology/live limitations; stage only owned files, commit/push and verify main with network-enabled GitHub CLI.
- [ ] Verify installed identity before subsequent native testing. Real-provider soak still requires NanoGPT reauthentication; offline evidence does not replace it.

Final implementation validation: all 238 gate checks passed after the chat compensation cleanup regression and independent approval. Native installation and controlled failure proof remain pending publication; the latest single provider connectivity attempt returned Unauthorized and supplies no semantic evidence.
