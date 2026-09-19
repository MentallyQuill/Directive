# Character knowledge boundaries: verification and release gates

## Status

The implementation is opt-in. Existing settings load in Legacy mode; selecting a Narration profile does not enable Protected mode. Utility and Reasoning selections remain unchanged. A valid saved isolated Narration profile is required for activation.

The protected path builds restricted actor packets, orders same-reply disclosures, buffers narration, reviews the complete candidate, permits one bounded repair, and publishes only a reviewed candidate through existing transcript ownership. Continuity settlement remains the only authority that admits knowledge; generation/review cannot settle mission objectives, time or rewards.

This is a boundary-enforcement implementation, not evidence of perfect model judgment. The semantic reviewer can miss leaks or reject acceptable narration. Paid quality evaluation has not run, and default rollout remains gated.

## Automated evidence

At implementation commit `262a784b4`, `npm.cmd test` passed **279 checks**, including the settings browser checks and the expanded visual suite (25 route/viewport combinations). The final gate adds the two integrated checks below; its final count/result will be recorded after completion.

| Requirement | Evidence |
| --- | --- |
| K1 restricted actor context; K2 exposure is not truth | `test-character-knowledge-packets.mjs`, `test-character-runtime-snapshot.mjs`, `test-character-information-projection.mjs` |
| K3 source custody and disposable projections | `test-character-knowledge-replay.mjs`, `test-character-publication-acceptance.mjs`, `test-continuity-lineage.mjs` |
| K4 inference/deception contracts | `test-character-responder.mjs`, `test-character-knowledge-contracts.mjs` |
| K5 causal audience disclosures | `test-character-scene-coordinator.mjs`, `test-character-scene-admission.mjs`, `test-information-acquisition-order.mjs` |
| K6 whole-candidate review and bounded repair | `test-character-knowledge-review.mjs`, `test-character-scene-review-evidence.mjs`, `test-character-scene-narration.mjs` |
| K7 cancellation, source edits, swipes, recovery | `test-protected-character-runtime.mjs`, `test-protected-character-opening.mjs`, `test-protected-character-continuation.mjs`, `test-character-scene-publication.mjs`, `test-recovery-ownership.mjs` |
| K8 final outbound isolation and transport retries | `test-character-isolated-transport.mjs`, `test-character-knowledge-host.mjs` |
| K9 distinct failures and evidence validation | provider normalization/parser suites, `test-character-knowledge-review.mjs`, source-passage and interpreter suites |
| K10 attempt ceiling and safe diagnostics | `test-turn-attempt-budget.mjs`, `test-character-knowledge-settings.mjs`, `test-protected-character-turn.mjs`, `test-character-knowledge-host.mjs` |
| K11 existing mission/time/reward authority | `test-character-knowledge-end-to-end.mjs`, `test-character-publication-acceptance.mjs`, existing accepted-pair reconciliation suites |
| K12 explicit migration and draft preservation | `test-character-knowledge-settings.mjs`, `test-character-knowledge-settings-browser.mjs`, `test-settings-draft-saves.mjs` |

`test-character-knowledge-end-to-end.mjs` produces a real actor contribution, buffered narration and reviewed receipt, publishes provisionally, then passes that selected response through existing continuity analysis and atomic accepted-pair reconciliation. It checks campaign state remains unchanged during preparation/publication, recipient-only access, retry reuse, stored replay equivalence and removal of access after editing the source.

`test-character-knowledge-host.mjs` connects the real Directive provider and chat adapters to a synthetic host. It captures final requests with forbidden-context canaries, exercises a reasoning-only transport retry, cancels actor/narrator/reviewer/repair calls, changes settings during each role, rejects a candidate twice, and reconciles an uncertain save without new generation. Reported physical attempts must equal actual sends. Saved reviewed receipts survive simulated reload. The test uses no account or paid API.

## Host and browser limits

The desktop/mobile browser fixtures verify actual rendered settings and the Stop control. Adapter and bridge tests cover protected opening, normal send, Continue, Regenerate, reserved swipes, selected-source changes and fresh-gesture recovery. They are isolated fixtures, not an installed-host quality certification.

The candidate has **not been installed into the running SillyTavern host**. A complete native UI smoke test of this revision remains unverified. No running-host files, profiles, credentials, saves or characters were changed for these checks. Before enabling in a real campaign, install through the normal extension workflow and use a distinct disposable character/campaign to exercise opening, send, Continue, Regenerate, swipe selection, edit/delete, Stop then Regenerate, chat switching and reload. Verify native default generation never escapes protected interception and no unreviewed streaming becomes visible.

## Proposed paid evaluation (separate approval)

Use the spec's 30 scenarios with three repetitions per mode: **90 baseline + 90 protected attempts**. Compare identical source/knowledge inputs, including positive controls where a character really was told a fact, lies/mistaken beliefs, partial disclosures, private channels, offscreen events, same-reply reactions, and source invalidation. Human adjudication must be independent of the generation reviewer.

A proposed initial pilot is six representative scenarios, one repetition per mode, with a **120 physical-request / 45-minute hard stop**, whichever comes first. A full evaluation proposal is **2,700 physical requests / 12 hours**, whichever comes first, including all baseline, analysis, repair, transport retry and protected calls. These are maximum budgets for approval, not predicted use or dollar quotes. Confirm provider pricing and enforce a global counter in the evaluation harness before starting; the runtime's ten-attempt ceiling covers only one protected phase and is not a global paid-run budget.

Use only approved NanoGPT profiles, preserving existing credentials and Claude connections. Inspect selected saved profile metadata and configured output limits without printing keys. Use a distinct character name (not another Mara) and a fresh campaign; do not reuse production saves.

Record exact denominators for attempted/completed scenes, visible-response success, critical leaks, custody failures, positive controls, reviewer false rejections, latency p50/p95, physical attempts, repairs and reported tokens. Missing token counts remain unknown. Generated failures and reviewer rejections are separate outcomes. Compare narrative usefulness as well as leak prevention.

Release thresholds remain: zero observed critical leaks/custody failures, at least 95% visible-response and positive-control success, at most 10% reviewer false rejection. A pass is measured evidence for those scenarios, not a guarantee. Any failure keeps opt-in status and requires a demonstrated fix and relevant rerun. Existing saves always require explicit enablement; no failure silently switches modes or erases accepted knowledge.
