# V1 Duty Report Delivery and Player-Knowledge Implementation Plan

> **Execution rule:** implement task by task with red-green-refactor discipline. Do not render or append a player-facing Duty Report block in this slice. Stop at the explicit UI approval boundary.

**Goal:** Make a material crew report become player knowledge only when one authored, player-safe disclosure is bound to an exact assistant response variant, visibly eligible for later rendering, accepted by the player's next message, and committed through the existing V1 evidence spine.

**Architecture:** Mission-owned report routes remain the disclosure authority. A strict provisional manifest binds one route to one response ID, source transaction, deterministic report segment, and response-text hash. The selected assistant swipe carries that manifest as private transaction metadata. On the next player ingress, the existing accepted-pair interpreter decides only whether the assistant response was accepted; deterministic code then validates the manifest against the active package, definition, branch, authored route, policy, selected message, swipe, and hashes. A valid accepted report materializes one `factDisclosed` claim. Its settled delivery receipt is stored on the existing mission evidence entry, so source reconstruction remains the only durable player-knowledge authority.

**Why this is the minimum robust shape:**

- no report queue, player-knowledge ledger, discovery tracker, or second reducer is introduced;
- scheduling, prompt intent, generation success, and message posting never grant knowledge;
- report deduplication is derived from surviving accepted evidence, not mutable flags;
- required disclosures need exact delivery proof, while optional player-safe discoveries may still be interpreted from accepted prose;
- edits, swipes, deletes, supersession, branches, and package changes reuse existing source custody and reconstruction;
- the model interprets freeform acceptance but cannot choose report IDs, fact IDs, policies, delivery status, objective activation, or consequences;
- report discovery, delivery, and objective activation do not award Command Bearing.

## Non-Negotiable Boundaries

- A Duty Report packet is a proposal to communicate; it is not delivery and is not player knowledge.
- A posted response remains provisional while swipeable. Knowledge may commit only on the next accepted player ingress.
- The selected swipe's own metadata is authoritative. Message-level metadata copied from another swipe is insufficient.
- A delivery manifest is valid only when its deterministic segment occurs exactly once in the bound selected response and both hashes match.
- A required disclosure route cannot be committed from narrator prose alone. It needs a valid manifest.
- An optional route may still become known through the existing bounded evidence interpreter when accepted prose explicitly communicates it.
- Invalid, missing, stale, duplicated, or forged manifests fail closed without blocking unrelated accepted-pair evidence.
- At most one report manifest is allowed on one response in V1.
- Delivery receipts contain IDs and hashes only. They do not store a new story summary, raw transcript, hidden fact text, provider output, or arbitrary rationale.
- Source mutation removes the delivery-backed evidence entry and reconstructs `knownFacts`, objective visibility, clocks, outcomes, and Story Settlement from surviving evidence.
- The report planner derives delivered report IDs from valid evidence; provisional or rejected responses do not suppress a later report.
- A required omitted report holds only the dependent knowledge/evaluation path. It does not fail the mission or punish the player.
- No player-facing row, modal, popup, page, objective, Command Log entry, relationship moment, or ship issue is created by this slice.
- Visible chat composition, chat-row styling, Mission-view mirroring, and automatic scheduling remain behind the UI approval gate.

---

### Task 1: Authoring and Packet Contract

**Files:**
- Modify: `schemas/mission/mission-v1.schema.json`
- Modify: `src/mission/v1/mission-contracts.mjs`
- Modify: `src/mission/v1/mission-package-linter.mjs`
- Modify: `src/mission/v1/duty-report-planner.mjs`
- Modify: `packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json`
- Modify: `tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json`
- Modify: `tools/scripts/test-v1-duty-report-planner.mjs`
- Modify: package/schema tests as required

- [x] **Step 1: Write failing closed-authoring tests**

Require every report route to declare a closed confidence level (`preliminary`, `credible`, or `confirmed`) and delivery requirement (`optional` or `required`). Reject unknown values, director-only text, a policy that does not disclose the same fact, and a required route without a reachable fallback actor.

- [x] **Step 2: Keep packets player-safe and bounded**

Carry only report ID, reporter ID, fact ID, urgency, confidence, requirement, player-safe summary, and the authored `factDisclosed` policy reference. Preserve one-report-per-beat deterministic ordering. Do not expose fact director text, policy guidance, predicates, or downstream objective identity.

- [x] **Step 3: Derive report deduplication from accepted evidence**

Add a helper that returns only report IDs present on valid, non-invalidated delivery-backed evidence entries. Keep the existing explicit delivered-ID input for pure planning tests, but let callers derive it without a new state field.

- [x] **Step 4: Migrate Prelude/Hesperus authoring**

Mark the Hesperus distress and passenger-risk routes required because they gate fair mission/risk handling. Keep the escalating technical and accountability discoveries optional: omission leaves them hidden and cannot punish the player. Assign conservative confidence values that match each disclosure stage.

- [x] **Step 5: Run and commit Task 1**

Commit:

```text
feat(mission): define report delivery policy
```

### Task 2: Provisional Delivery Manifest

**Files:**
- Create: `src/mission/v1/duty-report-delivery.mjs`
- Create: `tools/scripts/test-v1-duty-report-delivery.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] **Step 1: Write failing manifest-construction tests**

Create one provisional `directive.dutyReportManifest.v1` only from a packet and exact player-visible segment already present once in the response. Bind contract version, package ID/version, mission definition ID/version, branch, report, fact, reporter, policy, response ID, source transaction ID, response-text hash, and segment hash.

- [ ] **Step 2: Reject ambiguous or unsafe bindings**

Reject missing IDs, unknown route/policy/fact, packet-route mismatch, wrong branch/package/definition, empty or over-budget segment, segment absent from the response, repeated segment, response mismatch, and any unknown manifest field. Never persist raw full-response text in a manifest.

- [ ] **Step 3: Define deterministic segment semantics without rendering them**

Produce a bounded semantic segment payload from the packet: reporter ID, summary, confidence, and urgency. Define the exact canonical text representation and hashing contract that the later approved UI/chat composer must render. Do not call the host or change visible messages in this task.

- [ ] **Step 4: Run and commit Task 2**

Commit:

```text
feat(mission): bind provisional duty reports
```

### Task 3: Selected-Swipe Custody

**Files:**
- Modify: `src/runtime/scene-handshake-settler.mjs`
- Modify: `src/runtime/chat-turn-orchestrator.mjs`
- Modify: `src/runtime/correct-as-swipe.mjs` if metadata is inherited there
- Modify: `tools/scripts/test-v1-accepted-pair-orchestrator.mjs`
- Modify: scene-handshake/source-mutation tests as required

- [ ] **Step 1: Write failing selected-swipe metadata tests**

Read a provisional manifest only from the selected swipe's `swipe_info[].extra.runtimeMetadata`; allow the initial selected response's equivalent metadata when swipe-specific metadata is absent and there is exactly one swipe. Bind it to the Directive response ID and selected text hash. Never accept metadata from a non-selected swipe.

- [ ] **Step 2: Keep transaction evidence out of the Scene Handshake prompt**

Carry the normalized manifest in the internal snapshot used by the V1 shadow, but strip it from the general Scene Handshake provider request and unrelated player-safe projections.

- [ ] **Step 3: Prevent metadata inheritance across rewritten swipes**

Directive-generated alternate or corrective swipes must clear a prior provisional report manifest unless that new variant is independently composed and rebound. Swiping back to the original variant may recover only its own stored manifest.

- [ ] **Step 4: Prove edit, swipe, delete, and restart behavior**

An edited response hash, alternate selected swipe, missing swipe metadata, deleted response, stale source integrity, or JSON round trip must respectively reject, ignore, or preserve the manifest as appropriate. No case commits knowledge here.

- [ ] **Step 5: Run and commit Task 3**

Commit:

```text
feat(runtime): custody report manifests by swipe
```

### Task 4: Accepted Delivery and Evidence Authority

**Files:**
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `src/mission/v1/evidence-contracts.mjs`
- Modify: `src/mission/v1/mission-reducer.mjs`
- Modify: `src/mission/v1/mission-state-authority.mjs`
- Modify: `src/mission/v1/mission-state.mjs` only if validation requires it
- Modify: `tools/scripts/test-v1-mission-runtime.mjs`
- Modify: `tools/scripts/test-v1-state-spine-runtime.mjs`
- Modify: mission evidence/reducer/authority tests as required

- [ ] **Step 1: Write failing accepted-delivery tests**

When the interpreter marks the selected assistant response accepted and its required or optional report manifest validates exactly, deterministically materialize one assistant-sourced `factDisclosed` claim. A rejected, corrected, ambiguous, unavailable, edited, or mismatched response commits no report knowledge.

- [ ] **Step 2: Enforce required versus optional semantics**

Remove model-selected prose-only disclosure claims for required report routes unless the exact manifest validates. Preserve existing model interpretation for optional routes. Do not let a report manifest override other evidence preconditions or establish hidden world truth.

- [ ] **Step 3: Store the settled receipt on existing evidence**

Enrich only the accepted fact-disclosure evidence entry with `directive.dutyReportDelivery.v1`: report/fact/reporter/policy IDs, response ID, host message ID, selected swipe ID, selected visible-text hash, segment hash, source transaction ID, and contract version. Validate it against the evidence source and authored route during replay.

- [ ] **Step 4: Preserve deterministic replay and idempotence**

Replaying the same accepted pair creates no second fact, evidence entry, effect, episode, or receipt. Serialization and authority reconstruction preserve the delivery receipt exactly. Ordinary non-report disclosures remain valid without one.

- [ ] **Step 5: Run and commit Task 4**

Commit:

```text
feat(runtime): settle accepted duty reports
```

### Task 5: Mutation, Recovery, and Planner Integration

**Files:**
- Modify: `src/runtime/v1-state-spine.mjs` only if replay handling needs explicit receipt preservation
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/test-v1-source-mutation-runtime.mjs`
- Modify: `tools/scripts/test-v1-projection-rebuild.mjs`
- Modify: `tools/scripts/test-runtime-host-injection.mjs`
- Create: `tools/scripts/test-v1-duty-report-runtime.mjs` if separation improves coverage
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] **Step 1: Write failing mutation-rebuild tests**

Editing, swiping away, deleting, superseding, or branch-excluding the accepted report response removes its evidence entry on source invalidation, reconstructs `knownFacts`, re-hides dependent objectives/clocks, invalidates downstream effects through their own source custody, and makes the report eligible again when its world-truth precondition still holds.

- [ ] **Step 2: Prove no premature suppression**

A planned, generated, posted, or provisionally selected report does not count as delivered. Provider failure, failed settlement, player rejection, and restart before acceptance all leave the route selectable.

- [ ] **Step 3: Expose a non-UI preparation diagnostic**

Expose a runtime diagnostic/helper that selects one pending report and prepares its bounded segment payload/manifest inputs for a supplied hypothetical response identity. It may not post, render, schedule, update prompts, or mutate campaign state.

- [ ] **Step 4: Prove failure containment**

Invalid report metadata is ignored or returned as sanitized diagnostics while unrelated accepted-pair claims continue. State revision conflicts, package changes, and persistence failures retain existing State Delta Gateway rollback/recovery behavior.

- [ ] **Step 5: Run and commit Task 5**

Commit:

```text
feat(runtime): recover report delivery custody
```

### Task 6: Readiness Evidence and UI Stop

**Files:**
- Create: `docs/development/V1_DUTY_REPORT_DELIVERY_READINESS.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`
- Modify: this plan

- [ ] **Step 1: Run focused and complete gates**

Run report planner/delivery, mission contracts/schema/linter, accepted-pair, mission runtime, state spine, source mutation, projection rebuild, host injection, and complete alpha gates. Record exact counts and elapsed time.

- [ ] **Step 2: Independent robustness review**

Challenge prose-only bypass, copied metadata, swipe selection, edits, deletion, duplicate reports, package drift, branch isolation, replay, optional omission, required omission, provider failure, persistence conflict, hidden leakage, Command Bearing leakage, and tracking spam. Fix every Critical or Important non-UI finding.

- [ ] **Step 3: Document the explicit UI approval boundary**

The remaining visible work must be listed, not implemented: compose/attach the compact report block to the correct assistant row, make it visibly distinct but restrained, preserve it per swipe, decide whether a transient Mission mirror adds value, and certify mobile/desktop presentation. No automatic scheduling or narrator-prompt authority is authorized by deterministic readiness alone.

- [ ] **Step 4: Commit Task 6**

Commit:

```text
docs(runtime): certify duty report custody
```

## Completion Boundary

This plan is complete when Directive can prove, entirely through non-UI contracts and tests, that one exact accepted response variant would settle one authored Duty Report into the existing player-knowledge authority and that source mutation would remove it. Completion does not authorize visible report rendering, automatic report scheduling, narrator prompt integration, Mission-page mirroring, mission transition narration, remaining Ashes migration, legacy cutover, or live certification.
