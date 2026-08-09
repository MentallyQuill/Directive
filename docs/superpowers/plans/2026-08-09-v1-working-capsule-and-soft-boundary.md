# V1 Working Capsule and Soft-Boundary Proposal Implementation Plan

> **Execution rule:** implement task by task with red-green-refactor discipline. Do not change player-facing UI, prompt authority, provider-routing controls, or visible-turn latency.

**Goal:** Let one active Story Settlement episode retain enough bounded, source-backed recent context to support semantic boundary judgment, then expose a fail-closed soft-boundary review path that can continue or seal the episode without per-turn trackers, keyword rules, or an automatically blocking model call.

**Architecture:** Accepted-pair custody records compact contribution metadata and a capped active-only evidence window. A rolling checkpoint marks review eligibility but never seals. A bounded Utility evaluator may replace the working capsule or propose one soft seal using only closed reason/significance codes and exact active contribution/effect IDs. Deterministic code validates package, branch, episode, checkpoint, revision, source membership, significance custody, and compare-and-swap freshness before changing Story Settlement. The normal accepted-pair path does not invoke this evaluator; a diagnostic/runtime review method proves the seam before later background scheduling.

**Pinned behavior:** Preserve the approved borrowed-behavior contracts rather than inventing new extraction semantics:

- Summaryception 5.5.3 at `c67626ab83ee86ec1be4f55b9b3d1d19adb79999`: compare new passage with prior memory and retain only new narrative understanding.
- VectFox 3.6.8 at `886a0144ff8608aabcef4fe1b408a13260c1a730`: delay durable extraction until sources settle, require lasting significance, and retain source-window provenance.
- CharMemory 2.3.1 at `37b21025e120acfbe1dcdeaa8becb05efe7188b4`: encounter-level outcomes, not play-by-play; no memory is valid. Character-moment extraction remains outside this slice.

## Non-Negotiable Boundaries

- No topic, keyword, speaker, sentiment, token-count, or elapsed-time heuristic may seal an episode.
- A checkpoint requests review; it is not boundary evidence.
- Zero player-facing entries are created by capsule observations or evaluator failures.
- Accepted assistant text is eligible only after selected-swipe acceptance; player text remains intent/speech evidence, not proof of outcome.
- Recent evidence excerpts are active-only, whitespace-normalized, individually capped, collectively capped, and removed from sealed history.
- Full transcript, arbitrary model rationale, hidden facts, provider error text, and unrestricted IDs are never stored in the capsule or proposal.
- `continue` replaces the semantic capsule; it does not append another summary.
- `seal` requires a closed soft-boundary reason, at least one closed lasting-significance criterion, and exact current source/effect custody.
- Provider failure, invalid output, unsupported IDs, stale episode revision, stale checkpoint, or source mutation leaves the episode open and review pending.
- Hard boundaries remain deterministic and take precedence over soft review.
- The evaluator uses the existing `utilityJson` provider lane when invoked. No generation role or Settings UI entry is added.
- This plan does not automatically schedule the evaluator in the visible-turn path. Background scheduling requires later latency and concurrency proof.

---

### Task 1: Active Working-Capsule Contract

**Files:**
- Create: `src/story/working-capsule.mjs`
- Modify: `src/story/story-settlement-contracts.mjs`
- Modify: `src/story/story-settlement.mjs`
- Modify: `schemas/story/story-settlement.schema.json`
- Create: `tools/scripts/test-v1-working-capsule.mjs`
- Modify: `tools/scripts/test-v1-story-settlement-contracts.mjs`
- Modify: `tools/scripts/test-v1-story-settlement.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] **Step 1: Write failing bounded-capsule tests**

Prove an open episode starts with an empty `directive.storyWorkingCapsule.v1`. Observing accepted sources stores exact contribution ID, role, text hash, and a normalized excerpt capped at 240 characters. Keep at most six recent excerpts and 1,200 excerpt characters. Duplicate observations are idempotent. Unknown, unaccepted, wrong-branch, and malformed sources fail closed.

- [ ] **Step 2: Prove absence and lifecycle behavior**

An insignificant scene with no active episode creates no capsule. A checkpoint does not create a new story entry. Sealing removes recent excerpts and the mutable capsule from current semantic authority. JSON restart preserves an open capsule exactly.

- [ ] **Step 3: Make mutation conservative**

Active source invalidation removes matching recent evidence. If an invalidated source supports the semantic summary or foreground question, clear those fields, set `needsReview`, and retain only independently grounded surviving evidence. Never regenerate semantic prose during repair.

- [ ] **Step 4: Implement, run, and commit Task 1**

Commit:

```text
feat(story): add bounded working capsule
```

### Task 2: Borrowed-Behavior Evaluator Contract

**Files:**
- Create: `src/story/episode-evaluator.mjs`
- Create: `tests/fixtures/story/v1/episode-evaluator-borrowed-behavior.fixture.json`
- Create: `tools/scripts/test-v1-episode-evaluator.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] **Step 1: Write failing request-budget tests**

The evaluator receives only exact branch/episode/checkpoint identity, the current working capsule, capped recent accepted excerpts, visible typed-effect anchors, approved episode references, and at most two recent current player-safe sealed summaries. No raw transcript range, hidden effect, evidence queue, provider diagnostic, or campaign hidden state enters the request.

- [ ] **Step 2: Write failing closed-output tests**

Allow decisions `continue`, `seal`, or `abstain`. Allow soft-boundary reasons only:

```text
foreground-question-resolved
foreground-question-abandoned
encounter-departure
material-situation-shift
sustained-context-replacement
```

Allow significance criteria only:

```text
material-state-change
consequential-fact-learned
commitment-created-or-resolved
relationship-turning-point
future-constraining-decision
lasting-cost-gain-or-loss
unresolved-consequence
```

Reject unknown IDs, uncited summaries, unsupported criteria, arbitrary rationale, over-budget strings, duplicate refs, and a seal without both boundary and significance custody. `continue` returns one replacement capsule. `abstain` returns no semantic content.

- [ ] **Step 3: Pin conformance fixtures**

Fixture cases preserve the approved extension-derived behavior: repeated prior memory is not re-added; a light flicker or routine acknowledgement does not qualify; one continuous encounter continues; a resolved encounter with a lasting change can seal once; no episode/memory remains valid.

- [ ] **Step 4: Implement fail-soft Utility invocation**

Use the existing `utilityJson` role only. Parse strict JSON, cap timeout, sanitize diagnostics, and never mutate state inside the evaluator client.

- [ ] **Step 5: Run and commit Task 2**

Commit:

```text
feat(story): bound soft boundary proposals
```

### Task 3: Accepted-Source Observation and Review Eligibility

**Files:**
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `tools/scripts/test-v1-state-spine-runtime.mjs`
- Modify: `tools/scripts/test-v1-mission-runtime.mjs`
- Modify: `tools/scripts/test-v1-accepted-pair-orchestrator.mjs`

- [ ] **Step 1: Write failing accepted-source observation tests**

While an episode is active, every accepted player contribution and only an accepted assistant selected variant may enter contribution custody and the capped evidence window, including a pair with no new mission effect. This creates no receipt, episode, objective, issue row, relationship memory, or prompt write. Replay remains idempotent.

- [ ] **Step 2: Generalize checkpoint eligibility**

Checkpoint thresholds count newly accepted contributions, not only effects. When checkpoint sequence exceeds the last successfully evaluated sequence, return one stable review token containing branch, episode, episode revision, and checkpoint sequence. Provider failure does not consume the token; a successful review does.

- [ ] **Step 3: Preserve hard-boundary precedence**

If the accepted pair also carries a valid hard boundary or mission transition, seal deterministically and emit no soft-review token. Insignificant scenes without an active episode remain compact receipts.

- [ ] **Step 4: Run and commit Task 3**

Commit:

```text
feat(runtime): queue bounded episode reviews
```

### Task 4: Transactional Soft Review Application

**Files:**
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Create: `tools/scripts/test-v1-soft-boundary-runtime.mjs`
- Modify: `tools/scripts/test-v1-mission-runtime.mjs`
- Modify: `tools/scripts/test-runtime-host-injection.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] **Step 1: Write failing continue/seal tests**

`continue` atomically replaces the working capsule, clears the processed recent-evidence window, and advances `lastEvaluatedCheckpointSequence` without sealing. `seal` creates exactly one current sealed episode with the approved soft reason, significant criteria, grounded summary, no active excerpts, and no new domain tracker.

- [ ] **Step 2: Enforce stale and mutation rejection**

Reject proposals when branch, episode ID, episode revision, checkpoint sequence, contribution hashes, effect IDs, or gateway revision changed. An edit/delete/swipe between analysis and apply leaves the newer episode open and pending. Replaying an applied proposal is idempotent.

- [ ] **Step 3: Expose diagnostic shadow review**

Add a read/commit runtime method that resolves the exact active V1 definition, consumes a pending token, invokes the bounded evaluator, and applies through State Delta Gateway. Expose it through runtime-app diagnostics/tests only. Calling the normal composite projection must never trigger evaluation.

- [ ] **Step 4: Prove failure containment and restart**

Provider timeout, empty output, invalid JSON, `abstain`, and rejected proposal do not consume eligibility or write semantic state. A serialized pending review survives restart and can later continue or seal. No failure blocks gameplay mechanics.

- [ ] **Step 5: Run and commit Task 4**

Commit:

```text
feat(runtime): apply soft episode reviews
```

### Task 5: Readiness Evidence

**Files:**
- Create: `docs/development/V1_WORKING_CAPSULE_AND_SOFT_BOUNDARY_READINESS.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`
- Modify: this plan

- [ ] **Step 1: Run focused and complete gates**

Run capsule, evaluator, Story Settlement, state-spine, mission-runtime, source-mutation, projection-rebuild, runtime-host, package/schema, and complete alpha gates. Record exact counts and elapsed time.

- [ ] **Step 2: Independent robustness review**

Challenge over-recording, missed boundaries, false splits, summary drift, source mutation, replay, branch isolation, provider failure, latency coupling, and hidden leakage. Fix every Critical or Important finding before certification.

- [ ] **Step 3: Document residual cutover risks**

Retain as later work: measured post-visible-response/background scheduling, character-moment extraction, Duty Report delivery, prompt authority, next-mission activation, remaining Ashes migration, legacy writer retirement, UI approval, parity/live soak, and full rehearsal/certification.

- [ ] **Step 4: Commit Task 5**

Commit:

```text
docs(runtime): certify V1 soft boundaries
```

## Completion Boundary

This plan is complete when accepted active-scene evidence is bounded and source-repairable, checkpoint eligibility is durable, and an explicit runtime call can safely continue or soft-seal the current episode. It does not authorize automatic background scheduling, prompt consumption, UI rendering, character-memory extraction, legacy retirement, or V1 cutover.
