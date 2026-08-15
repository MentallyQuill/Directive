# Scalable Accepted-Pair Settlement and Segmented Storage Design

## Status

Approved for implementation on 2026-08-15. This is a new-save storage boundary. Directive will not ship a general migration, compatibility hydration, or automatic semantic replay for earlier saves. A separately authorized one-off Sam Vickers conversion may create a segmented base snapshot without adding runtime migration code.

## Problem

Normal accepted-pair custody currently reads the complete raw chat. Recovery then revisits every player message, and each successful `already-settled` replay can invoke the same pending episode evaluation. A provider timeout therefore turns one Continue into a number of model calls proportional to chat length.

The V1 repository also rewrites one complete campaign-save JSON document on every committed state change. Story Settlement, mission evidence, and time evidence all grow with play, so fixing model calls alone would leave persistence cost proportional to campaign history.

## Goals

- Normal Continue has a constant transcript-read shape independent of chat length.
- A newly accepted pair makes at most one `acceptedPairMissionEvidence` call.
- Settled pairs, reloads, retained branch history, and deterministic reconciliation make zero semantic model calls.
- Episode evaluation remains functional for working-story memory, soft episode boundaries, relationship posture/open matters, and defining People moments.
- One checkpoint makes at most one automatic `episodeEvaluator` call, outside historical replay and outside the blocking narration path.
- Campaign persistence uses bounded JSON delta segments instead of rewriting one ever-growing save file.
- Mission, People, Ship, Command Bearing, time, prompt, notification, branch, swipe, edit, delete, and checkpoint contracts remain logically unchanged.
- Corruption, partial writes, stale async results, missing history, and unsupported saves fail closed.

## Non-goals

- No database, vector store, embeddings, retrieval model, memory agent, lore agent, or per-domain model pipeline.
- No model-generated storage summaries.
- No general save migration or automatic historical backfill.
- No change to player-facing Mission, People, or Ship projection schemas.
- No attempt to guarantee exactly one external provider invocation across a process crash before any result can be durably committed. Authority commitment remains exactly once.

## Accepted-pair hot path

The host adapter will provide an exact bounded source window: the current player message, the immediately preceding non-system assistant response, and the prompting-player anchor needed by Command Bearing custody. The assistant anchor is resolved from attached runtime metadata when present, with a fixed-size non-system tail fallback. Failure to resolve the source window blocks settlement with a specific diagnostic; it never broadens Continue to the complete transcript.

`acceptedPairReceipts` remain the only pair-idempotency ledger. A receipt match is checked before creating any interpretation request. A successful new interpretation atomically commits all deterministic mission, time, People, Ship, Cohesion, Story Settlement, and receipt changes. Persistence retries reuse the same in-memory interpretation.

Runtime recovery becomes one discriminated state:

- `none`
- `pair-retry`, holding one exact source snapshot and interpretation when available
- `reconcile-required`, holding the reason and affected source identity

Provider timeout, abort, empty output, or invalid output never turns into full semantic replay. Transcript reconciliation is an explicit lifecycle operation used for load, branch, mutation, or repair. It may scan locally in cancellable batches, but it cannot invoke a model for a settled pair or silently backfill multiple unsettled pairs.

## Episode evaluation

Episode evaluation is retained. It is removed only from `settleSnapshot()` and historical replay.

Every pending checkpoint has a durable attempt record keyed by branch, episode, and checkpoint sequence. The scheduler is single-flight by that key. It runs after the corresponding SillyTavern narration completes, so a slow evaluator cannot block Continue. A successful result still passes the existing request/proposal validation and stale-token checks before it can mutate only Story Settlement.

Failure preserves the prior working capsule and accepted evidence. The attempt is not automatically repeated for the same checkpoint. Manual retry may explicitly override it. A later checkpoint may make one new automatic call and coalesces still-unreviewed source-backed evidence; it never starts a catch-up loop. Hard mission boundaries continue to seal deterministically without episode evaluation.

The current narration receives the working capsule plus bounded recent accepted evidence already accumulated during pair settlement. The evaluator's refreshed summary, relationship state, or soft seal becomes visible to the UI and the next narration after durable completion.

## Segmented JSON persistence

The public repository API continues to load and return `directive.campaignSave.v1` records with a fully validated logical V1 campaign state. Physical persistence changes to a segmented layout.

### Manifest

`directive.segmentedCampaignSaveManifest.v1` is stored at the existing logical save key. It contains save metadata, storage layout version, base document reference/hash, ordered segment references, current state revision/hash, and active-segment generation. It never embeds campaign state.

### Base

`directive.campaignSaveBase.v1` contains the initial validated campaign-save record. New campaigns therefore begin with a small base. A manually converted save may use its exact validated current state as the base without replaying history.

### Deltas

`directive.campaignStateDelta.v1` records:

- save ID
- state-custody before and after revisions
- canonical before and after SHA-256 hashes
- authorized changed roots
- strict deterministic operations over JSON paths
- timestamp and proposal source metadata

Operations are limited to `set`, `delete`, and `splice`. The encoder must prove that applying its operations to the prior state produces byte-canonically the proposed state before the delta can be stored. The decoder rejects unsafe paths, revision gaps, hash mismatches, unsupported operations, or a result that fails V1 validation.

### Segments

`directive.campaignStateSegment.v1` contains an ordered sequence of deltas. A segment seals at 64 deltas or 512 KiB, whichever occurs first. Sealed segments are immutable and content verified. The current segment alternates between A and B physical files: write and verify the inactive slot, then switch the manifest generation. The previously referenced slot remains recoverable until a later successful commit.

Loading reads the base and referenced segments, verifies their hashes, and applies deltas in revision order. Segment reads may run in parallel; delta application remains ordered. The final logical save must pass `assertV1CampaignSave()` and match the manifest's revision and hash.

Branches and checkpoints may reference immutable parent prefix segments. Their divergence is stored as ordinary validated deltas. Shared content is not eagerly deleted; deletion removes the save manifest and performs only reference-proven cleanup. Orphan cleanup is recoverable maintenance, not part of the durability transaction.

Unsupported monolithic save documents are rejected with an explicit storage-layout error. They are not translated during load.

## Durability order

For an ordinary state commit:

1. Validate the proposed logical campaign save.
2. Compare the loaded manifest revision/hash with the expected prior state.
3. Encode and locally replay the delta; require exact equality with the proposal.
4. Write and read-verify the inactive active-segment slot.
5. Write the next manifest generation pointing at the verified slot.
6. Update the index summary.
7. Return success to the state-delta gateway.

Failure before step 5 leaves the prior manifest authoritative. Failure after step 5 but before index refresh leaves the campaign state recoverable; the next repository load repairs only the index summary from the valid manifest. In-memory state is rolled back on persistence failure under the existing gateway contract.

## Projection and page compatibility

- Mission continues to use the deterministic mission reducer and mission player projection. Episode evaluation does not decide objectives or mission outcomes.
- People introductions and public facts continue to come from accepted-pair interpretation. Relationship posture, open matters, and defining moments continue to come from validated episode evaluation.
- Ship and Cohesion continue to derive from source-backed Story Settlement effects.
- Prompt projection remains bounded to current mission, People, Ship, working story, and a limited relevant sealed-story projection.
- Segment-derived projection caches may be keyed by immutable segment hash for performance, but they are disposable read caches. Segments plus the base remain authority.

## Observability and circuit breakers

Diagnostics record pair fingerprint, receipt hit/miss, recovery state, changed roots, segment sequence/generation, checkpoint token, and per-role call counts. They do not record full player or assistant prose.

The runtime enforces, rather than merely reports, these budgets:

- one Utility interpretation per new pair fingerprint
- zero Utility calls for a receipt hit
- one automatic evaluator attempt per checkpoint token
- zero model calls from deterministic transcript reconciliation

Any attempted budget violation fails closed with a stable diagnostic code.

## Verification

The implementation is incomplete until focused and full tests prove:

- 30-, 1,000-, and 10,000-message transcripts use the same bounded normal source read and model-call count.
- A pending episode checkpoint replayed across thousands of settled pairs makes no evaluator calls; the scheduler later makes exactly one.
- Duplicate delivery, reload, provider failure, persistence retry, chat switch, cancellation, edit, delete, swipe, branch, checkpoint, and stale result cannot double-commit authority.
- Delta round trips cover object changes, array append/remove/mutation, malformed operations, revision gaps, hash corruption, partial writes, A/B recovery, segment rollover, and deletion with shared segments.
- Hydrated segmented saves produce byte-equivalent player and prompt projections to the equivalent in-memory V1 state.
- The full Directive gate passes with no unrelated `debug.log` changes included.

