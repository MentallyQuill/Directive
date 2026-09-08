# Parallel story director validation

This change contains narrator additions on the following turn. It cannot guarantee that narration never invents a fact, or that a model always classifies a quoted passage correctly. Authored mechanics remain authoritative regardless of the director's interpretation.

## Source and scope

Implementation base: `d5bd5587d` on `origin/main`. Tested implementation commit: `f8ec43b2f2f010d52f6b0fddd979912e8a5f78c9`. The design and implementation plan are dated 2026-09-08.

The active `default-user` Sam Vickers save, installed extension and running host were not changed. Tests use repository fixtures and disposable fake host state.

## Automated evidence

| Scenario | Evidence |
| --- | --- |
| Parallel analysis | Both role functions and both native adapter requests start before either completes. One completed role does not release ownership of the other. |
| Director failure | App narration handoff remains blocked and campaign state remains unchanged. |
| Explicit retry | The successful interpreter result is reused for the same request key; only the failed director is called again. |
| Atomic settlement | Historical relationship review, the current accepted pair, continuity, direction and pending biography jobs share one custody commit. Persistence failure restores the complete prior state. |
| Prompt failure | An unsuccessful prompt installation blocks handoff. Retrying installation does not rerun or recommit accepted analysis. |
| Cancellation | Stopping the app turn aborts both physical role signals. The native interceptor calls its actual abort callback on a bound preparation failure. |
| Biography latency | No dossier call is made before the first handoff. A stalled idle author is canceled by the next turn and does not block that turn's handoff. |
| Campaign coverage | Context construction traverses all 13 current bundled missions. The deterministic corpus includes Ravenna, atmosphere, claims, attempts, delegation, unavailable opportunities, diversion, complication restraint and no-pacing scenes. |

The ordinary critical path contains two analysis requests in parallel, deterministic preparation/one save, then native narration. A due episode review is a subsection of the director request, not a fourth request. A retry may add a failed-role attempt. Opening generation retains its separate opening director. Optional dossier requests occur at idle boundaries, outside the response path.

The tests establish request overlap and ordering at fake transport boundaries. They do not measure provider service latency, token cost, live sampler preservation, or how consistently narration follows direction. No live latency improvement or semantic success rate is claimed.

## Implementation details and limits

- `captureAcceptedPairAnalysis` takes an explicit `campaignState` in addition to assets and snapshot; preparation dependencies are explicit. The live state getter is never redirected to a temporary draft.
- Director receipts bind the branch, package, mission, source range and generation target separately from the analysis request key. A postcommit reuse key covers accepted state, source identity, campaign definition and provider configuration without hashing the receipt itself or transient ingress identifiers. Prompt generation selects the exact target receipt.
- Optional biography helpers live in `src/runtime/people-dossier-queue.mjs`. The app records an attempt at an idle mutation boundary, runs transport outside the lease, and stages the result before a missing-field-only merge.
- Background biographies require a host advertising independent request transport. Native raw/quiet compatibility fallbacks do not launch them automatically because their cancellation/host ownership behavior is not sufficient for safe overlap with subsequent narration.
- `retryPendingPeopleDossiers()` is an explicit technical retry API, including recovery of persisted in-flight jobs orphaned by reload. It excludes live or already staged work. Failures leave the minimal accepted NPC record usable and do not gate narration.
- Supported older V1 settlements may omit the additive arrays. No historical director backfill is performed. This does not add support for previously unsupported save formats.
- A manual objective correction still saves without a model call. If it cancels an unfinished interpreter, narration remains blocked until explicit Retry supplies the missing valid analysis; a completed director alone cannot authorize handoff.
- The legacy episode scheduler module and its isolated regression remain for compatibility, but the app no longer instantiates it or schedules automatic evaluator requests.
- Oversized context or invalid output blocks narration rather than silently omitting obligations or trusting partial results. A provider that ignores cancellation can continue its physical request after the caller times out; that result cannot later mutate the turn.
- Authored-context coverage is marked partial. It uses existing safe mission and operational data; it does not invent missing campaign guidance.

## Live proof pending

The approved plan requires separately scoped authorization before testing against an installed host. That authorization was not included for the active save, so live proof remains pending on a disposable campaign through the ordinary extension workflow. Required measurements are physical request starts/ends, usage, time to first narration, profile/sampler identity, failure/retry, swipe and branch behavior, and a due review plus an introduced NPC.

Semantic evaluation must separately record extraction misses, false obligations, duplicate threads, ignored direction, repeated nudges and relationship/memory loss. The deterministic corpus checks contracts against specified outputs; it is not a benchmark of live model judgment.

## Release verification

On 2026-09-08, `npm.cmd test` passed all **199 focused checks**, including browser runtime safety for **180 production modules**, the existing authoritative-time and branch regressions, provider routing, storage, and UI checks. `git diff --cached --check` passed. Independent integration review found no unresolved issues after the source-cancellation, receipt-reuse, branch-source mapping, schema and dossier fixes.

The final implementation source and tests are in `f8ec43b2f2f010d52f6b0fddd979912e8a5f78c9`; this release-evidence update changes documentation only. No live provider measurement was performed. The main checkout's unrelated `debug.log` was excluded from the implementation commit.
