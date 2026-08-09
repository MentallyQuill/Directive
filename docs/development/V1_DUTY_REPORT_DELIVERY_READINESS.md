# V1 Duty Report Delivery Readiness

Status: **deterministic non-UI custody ready; visible delivery and live certification not yet authorized or complete**

Date: 2026-08-09

## Certified Scope

Directive can now prepare one authored, player-safe Duty Report without changing campaign state and can settle it as player knowledge only after the exact assistant response variant is accepted by the player's next message.

The implementation deliberately adds no report queue, player-knowledge ledger, discovery tracker, Command Log entry, ship issue, relationship moment, quest row, or Command Bearing award. The existing mission evidence log remains the durable authority. `knownFacts`, objective visibility, clocks, outcomes, and Story Settlement remain projections or reductions of surviving accepted evidence.

The implemented path is:

1. A mission-owned report route becomes eligible from authoritative world and mission state.
2. A pure runtime helper selects one route and returns one bounded packet, deterministic visible segment, and response-binding inputs.
3. A future approved composer may place that exact segment once in an assistant response and attach a private manifest to that response variant.
4. The response remains provisional while swipeable. Planning, generation, posting, or selection does not grant knowledge.
5. On the next player ingress, the accepted-pair interpreter decides whether the selected assistant response was accepted.
6. Deterministic code validates the manifest against package, definition, branch, route, policy, response ID, host message, selected swipe, response proof, segment proof, and source custody.
7. One valid manifest materializes one `factDisclosed` claim through the existing evidence reducer. Required report routes cannot be satisfied by prose-only model claims; optional routes retain bounded prose interpretation.
8. Editing, deleting, swiping away from, superseding, or branch-excluding that source removes the receipt-backed evidence through the existing source-reconstruction path.

## Evidence and Robustness Matrix

| Risk | Implemented boundary | Verification |
| --- | --- | --- |
| Every mention becomes a tracker | A report settles one existing fact-disclosure evidence entry and one source-owned Story effect; unrelated ship, relationship, thread, quest, log, and Command Bearing roots remain byte-for-byte unchanged. | `test-v1-duty-report-runtime.mjs`, `test-v1-mission-runtime.mjs` |
| Prose-only bypass | Required routes discard model-selected disclosure claims unless the selected response carries a valid manifest. Optional routes may still use explicit accepted prose. | `test-v1-mission-runtime.mjs` |
| Copied or stale swipe metadata | Only selected-swipe runtime metadata is eligible. Root fallback is allowed only for the single initial response. Rewritten/corrective swipes strip inherited manifests. | `test-v1-duty-report-delivery.mjs`, `test-v1-accepted-pair-orchestrator.mjs` |
| Edited response | The exact canonical segment must occur once and the normalized response and segment must match independent 64-bit report proofs. | `test-v1-duty-report-delivery.mjs`, `test-v1-mission-runtime.mjs` |
| Host compatibility | The accepted host source remains bound by its real eight-character source hash plus branch, response, message, and swipe identity; report-specific response and segment proofs use 64-bit hashes. | `test-v1-duty-report-runtime.mjs`, `test-v1-working-capsule.mjs`, `test-v1-episode-evaluator.mjs` |
| Premature suppression | Planned, generated, posted, provisional, rejected, provider-failed, persistence-failed, or restarted-before-acceptance reports remain eligible. | `test-v1-duty-report-runtime.mjs` |
| Duplicate delivery | Delivered IDs derive only from surviving receipt-backed evidence; replay of the accepted pair is idempotent. | `test-v1-duty-report-planner.mjs`, `test-v1-mission-runtime.mjs` |
| Package, definition, or branch drift | Preparation and settlement fail closed on exact package, definition, state-authority, and branch mismatches. | `test-v1-duty-report-delivery.mjs`, `test-v1-mission-runtime.mjs`, `test-v1-source-mutation-runtime.mjs` |
| Edit, delete, or swipe repair | Source invalidation removes the report evidence, known fact, source-owned Story effect, dependent objective/deadline projection, and delivered-ID suppression; the report becomes eligible again. | `test-v1-duty-report-runtime.mjs`, `test-v1-source-mutation-runtime.mjs`, `test-v1-projection-rebuild.mjs` |
| Provider or persistence failure | Errors are sanitized. No report fact is committed, and State Delta Gateway rollback preserves the prior state. | `test-v1-duty-report-runtime.mjs`, `test-state-delta-gateway.mjs` |
| Hidden-state leakage | Packets and preparation results contain bounded authored player text and necessary IDs only. Manifests and receipts carry IDs/hashes, not hidden prose, raw transcript, provider output, or rationale. General Scene Handshake prompts strip manifests. | `test-v1-duty-report-delivery.mjs`, `test-v1-duty-report-runtime.mjs` |
| Unfair punishment | Required omissions hold dependent knowledge/evaluation only. Optional discoveries may remain unknown without punishment, and disclosure itself awards no Command Bearing. | Mission route contract tests and unchanged-root assertions in `test-v1-duty-report-runtime.mjs` |

The adversarial review found and fixed one Important issue before this certification: report response and segment proofs originally reused a 32-bit host hash. They now use an independent 64-bit FNV-1a digest, while the accepted host source tuple remains compatible with the existing host adapter.

No unresolved Critical or Important non-UI finding remains in this slice.

## Verification Record

Focused verification covers report planning and binding, mission evidence, accepted-pair settlement, state-spine replay, source mutation, player-projection rebuild, host injection, and State Delta Gateway rollback.

The complete alpha gate contains 266 executable checks, including the new Duty Report runtime test. The final post-hardening run completed successfully in 199.04 seconds:

```text
node tools/scripts/run-alpha-gate.mjs
Exit code: 0
266 checks
199.04 seconds
```

## Deliberate Non-Claims and Residual Risks

- No player-facing Duty Report block is rendered or attached yet. The current composer contract is inert until an approved UI integration calls it.
- No automatic report scheduling, narrator prompt instruction, or crew-interruption policy is wired. The preparation helper is callable and pure; it does not decide when a report should interrupt play.
- Reporter availability is supplied by the future scheduling seam. The planner already enforces authored capabilities, preferred actors, and fallbacks once that bounded roster is supplied.
- V1 allows at most one manifest per response. This is an anti-spam constraint, not a general multi-notification framework.
- `sourceTransactionId` is retained for traceability but is not independently re-resolved from CORE during durable mission-state replay. Durable authority instead rests on the evidence key and exact branch/message/swipe/response/text custody established at commit time.
- The host source hash remains the existing 32-bit host contract. Report-specific response and segment proofs are now 64-bit, and source identity also includes branch, host message, selected swipe, and response ID. This is an integrity/correctness boundary, not an anti-cheat system.
- Deterministic tests do not replace the planned isolated 20-turn strict rehearsal or 25-turn/five-user certification. Live completion remains blocked on those approval-gated runs.

## Explicit UI Approval Boundary

The following work is intentionally not implemented by this readiness slice:

- compose and attach the compact Duty Report segment to the correct assistant response and swipe metadata;
- give the report a restrained, readable chat-row treatment on desktop and mobile;
- decide whether any transient Mission-page mirror adds unique value without duplicating chat information;
- make swipes visibly retain or remove only their own report block;
- certify accessibility, narrow-screen behavior, and no redundant information across Mission, Story, People, Ship, and Log;
- authorize automatic scheduling or narrator prompt authority for report delivery.

These items require the user's explicit UI approval before implementation. Deterministic custody readiness alone does not authorize them.
