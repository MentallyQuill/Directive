# Captured-publication durable recovery

> Use superpowers:subagent-driven-development. Storage and controller ownership are disjoint; independently review the integrated slice before publication.

Goal: after an interrupted captured-history publication, restart can prove the exact committed or prior state using durable evidence, quarantine uncertainty, and acknowledge without replay. This prepares required chronology recovery; runtime capture and earlier-branch authorization remain disabled until complete writer coverage and historical consumers are implemented.

Contract: use existing same-save publication intent path with strict tagged captured intent. Bind expected and attempted manifests, explicit active pointer, operation ID and canonical captured request hash; hash the entire intent identity. Write/read-verify intent before history, state segment or manifest writes. A committed resolver must verify the complete state/history chain and latest exact operation/request provenance. Read-only resolution rechecks pointer, ticket and final manifest. Separate acknowledgement only deletes the exact verified intent. Ordinary and captured publishers mutually exclude unresolved foreign intents. Exact captured retries resolve without reapplying writes.

Neutral APIs: loadV1CampaignSavePublication(adapter, saveId), resolveV1CampaignSavePublication(adapter, {saveId,requestHash}), acknowledgeV1CampaignSavePublication(adapter, {saveId,requestHash}). Preserve existing ordinary behavior and result contracts. Captured callers explicitly acknowledge terminal outcomes before the next publication.

- [x] Storage owner: repository, new captured-intent regression; minimal explicit-ack setup adaptations in prior captured-state/recovery tests. RED then implementation. Cover fresh adapters/restart, before-intent failure, write-then-throw, unreadable/torn head, corrupt history, ticket races, exact retry, no duplicate revision and mutual exclusion.
- [x] Root: controller neutral dispatch and integration regression. Fresh controller must keep uncertain captured state unavailable, block direct writers, recover complete exact state without duplicate application, and retain evidence when the ticket disappears. Include both baseline and subsequent capture plus unchanged ordinary behavior.
- [x] Independently review strict intent validation, acknowledgement ownership and restart/selection handling; fix reproduced findings.
- [x] Run focused tests, full gate on final source, scoped diff checks. Record actual scope and publish under standing authorization; keep unrelated debug.log untouched.
- [x] After publication, verify installed identity and a bounded captured-intent restart scenario in an isolated disposable storage namespace; do not enable live campaign capture or relax branch refusal.

Acceptance: zero candidate/history/state writes before verified durable intent; zero replay writes during resolution; zero false success or rollback on uncertain storage; exact state including public-reducer corrections recovered; original ordinary suite unchanged. Controlled proof does not substitute for real-provider journeys or the remaining chronology work.

Final source passed all 240 checks and independent integrated review. Published and GitHub-verified source: `33ca1cbf689df94a67571aa26b198ab3a1677114`. All 671 installed and served files match. Native baseline and objective-reopen fixtures recovered after one actual browser reload with exact full-state verification and no replay writes. Exact owned tickets were acknowledged; original globals, 17 checkpoints, 31 transcripts and provider count 368 stayed unchanged.

Two harness failures and their original journals remain preserved: premature asynchronous readiness and an object-key-order-sensitive JSON comparison. Read-only reconciliation found no semantic state difference. The reviewed continuation verified original ticket and full captured-request hashes before acknowledging only the remaining correction ticket. No reload, restaging or baseline reset was repeated. Native evidence is recorded in the player-promise stabilization report; runtime capture and earlier branching remain disabled.
