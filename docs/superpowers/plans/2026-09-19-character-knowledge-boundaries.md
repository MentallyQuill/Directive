# Character knowledge boundaries implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegate only when the user or applicable instructions authorize it.

**Goal:** Prevent characters from acquiring private knowledge through shared generation context while preserving competence, plausible inference, false reports, narrative quality, and accepted-pair authority.

**Architecture:** Source-bound archive projections feed isolated character calls, causally ordered communication, buffered narrative assembly, and mandatory pre-publication review. Reuse existing provider routing, cancellation, transcript ownership, continuity validation, and reconciliation. Add an explicit protected-mode narration route inside the existing settings owner.

**Tech stack:** JavaScript ESM; existing Node assertion scripts; existing SillyTavern adapters and Playwright/browser fixtures. No new database, vector service, or runtime dependency.

**Spec:** [Character knowledge boundaries design](../specs/2026-09-19-character-knowledge-boundaries-design.md).

**Baseline:** `5b6a04cd5f5992171645cad67ed7b883eb9dbf2b`. Paths below are repository-relative. Run commands from the isolated implementation worktree. This is a proposed plan; unchecked steps have not been performed.

## Global constraints

- Preserve accepted-pair authority and existing source/swipe identity. Do not introduce a second knowledge store.
- Inspect current Main before implementation; this file records the reviewed baseline, not permission to overwrite intervening changes.
- Keep the user's dirty primary checkout and running SillyTavern installation intact. Publish scoped implementation changes to Main under the standing project workflow; installation/live testing are separate steps within their authorized scope.
- Use the GitHub CLI only with network permission enabled. If its token is expired, request reauthentication.
- Keep new functionality behind `characterKnowledge.mode: protected` until rollout gates pass. Legacy saves/settings must load unchanged.
- Do not use Claude connections in this soak. Runtime provider selection and the Codex model doing development/test writing are separate decisions.
- No paid live evaluation until a fresh request/time budget is approved. Offline scripts and fake-provider tests require no model calls.
- Add tests to `tools/scripts/run-alpha-gate.mjs`; do not remove existing coverage. Test correctness through externally observable contracts, not snapshots of implementation details.
- Use existing `resolveProviderMaxTokens`, `resolveAnalysisLimits`, and cancellation ownership. Do not create parallel retry or capacity policies.
- Snippets in the spec are executable reference cores, not drop-in production modules; build the adapters, schema validation, and tests described here around them.

## Review focus

1. **Input contamination:** hidden information in task wording, profile/preset injections, retries, caches, author notes, and world info. Tasks 2, 4, 10.
2. **Epistemic correctness:** exposure versus truth/belief, competence, old reports, accessible corrections, inference, and deception. Tasks 2, 5, 7, 10.
3. **Causal custody:** same-reply disclosure, discarded output, source edits/deletions, swipes, replay, and legacy migration. Tasks 1, 3, 6, 8, 9.
4. **Cancellation/publication races:** Stop after every await, Regenerate handoff, failure after persistence, duplicate publication, and stale binding/configuration. Tasks 4, 6, 8, 10.
5. **Reliability/cost:** quote hydration, semantic rejection, empty/reasoning-only content, physical attempts, bounded repair, latency, and positive controls. Tasks 3, 4, 7, 10, 11.

## Dependency map and interfaces

Task 1 defines contracts. Tasks 2 and 3 can then proceed independently. Task 4 establishes safe generation transport. Task 5 depends on 2 and 4; task 6 on 1, 3, and 5; task 7 on 4–6; task 8 on 6–7; task 9 integrates settings and compatibility after 4 and 8. Task 10 verifies the complete path. Task 11 performs separately budgeted live evaluation and rollout.

Keep new modules narrow:

| New module | Public contract |
| --- | --- |
| `src/story/character-knowledge-contracts.mjs` | Parse/version packet, contribution, exposure, segment, and review wire contracts; reject unknown fields and invalid references. |
| `src/story/character-knowledge.mjs` | `createCharacterKnowledgePacket({ snapshot, personId, sourcePair, provisionalExposures, beforeOrder, limits })` returns `{ ok, packet, digest, diagnostics }` or a typed failure. Reads validated archive projections only. |
| `src/story/evidence-passages.mjs` | `createEvidencePassageCatalog({ sourcePair, limits, requestId })`; `hydrateEvidenceReferences({ value, catalog, sourcePair })`. Hydration produces existing validator input. |
| `src/story/character-responder.mjs` | `createCharacterResponder({ generation, contracts })` returns `respond({ packet, signal, budget })`; output includes validated contributions and candidate disclosures, never committed state. |
| `src/runtime/character-scene-coordinator.mjs` | `createCharacterSceneCoordinator({ generation, knowledge, responder, narrator, reviewer, ownership })` returns `prepare({ flight, analysis, signal, budget })`; result is a reviewed draft or typed failure, never a host mutation. |
| `src/narration/character-scene-narrator.mjs` | `createCharacterSceneNarrator({ generation, contracts })` returns `narrate({ scenePacket, contributions, signal, budget })`; validates segments and assembles exact contributions. |
| `src/story/character-knowledge-reviewer.mjs` | `createCharacterKnowledgeReviewer({ generation, contracts })` returns `review({ candidate, support, signal, budget })`; returns a digest-bound verdict, never replacement prose or access grants. |
| `src/generation/turn-attempt-budget.mjs` | `createTurnAttemptBudget({ limit, signal })`; synchronous reservation/claim/release methods for physical attempts, shared across roles. |

`snapshot` means the existing validated accepted state plus source lineage, not arbitrary model JSON. `generation` is the existing routed and cancellation-aware service with the added isolated-context contract. `ownership.assertCurrent(flight)` verifies the current transcript owner, binding, source/config hashes, and epoch; it does not create an independent owner. All errors preserve cancellation identity and distinguish transport, parsing, semantic, stale-source, and budget failures.

## Task 1: Define contracts and adversarial fixtures

**Requirements:** K2–K7, K11–K12.

**Create:** `src/story/character-knowledge-contracts.mjs`, `tools/scripts/test-character-knowledge-contracts.mjs`, `tools/fixtures/character-knowledge/scenarios.json`.

**Inspect:** `src/story/continuity-contracts.mjs`, `src/runtime/v1-accepted-pair-source.mjs`, existing information-access tests.

- [ ] Encode packet, contribution, exposure, segment, review, and per-swipe receipt v1 contracts. Define opaque IDs, bounded strings/arrays, duplicate rejection, permitted modes, and strict unknown-field handling.
- [ ] Define a narrative position as validated source identity plus causal order; do not derive chronology from retrieval order. Legacy events without intra-source order cannot authorize a same-reply dependency unless validated evidence establishes it.
- [ ] Add sanitized fixtures for Bronn and Nayar, explicit-disclosure positive controls, false reports, corrections, professional competence, inference, private player thought, radio/whisper access, and player agency. Include expected knowledge and forbidden claims independently of model output.
- [ ] Define a flight receipt containing version, publication ID, selected-source identity, contribution/packet/candidate digests, review verdict, and provisional exposures. Keep provider secrets and full prompt contents out of receipts.
- [ ] **Red:** `node tools/scripts/test-character-knowledge-contracts.mjs` fails on missing parsers or acceptance of a forged audience/source/extra field.
- [ ] **Green:** Implement pure parsers and typed errors until valid fixtures pass and malformed references fail. Confirm legacy continuity events still validate without new metadata.
- [ ] Commit: `feat(story): define character knowledge contracts`.

## Task 2: Compile character-scoped information

**Requirements:** K1–K4, K8, K12.

**Create:** `src/story/character-knowledge.mjs`, `tools/scripts/test-character-knowledge-packets.mjs`.

**Inspect/reuse:** `src/story/character-information.mjs`, `src/story/continuity-contracts.mjs`; locate archive pruning/retrieval through their current imports rather than inventing a second index.

**Modify only if required:** existing archive retrieval to expose source-bound records before presentation truncation.

- [ ] Adapt accepted continuity events, validated source lineage, authored access, and provisional exposures into the spec's normalized candidate representation. Resolve dependent source invalidation before admission.
- [ ] Separate character-scoped observations and authored competence from narrator/chat-wide context. Keep only the reacting character's private identity information; filter task wording and other people's descriptors too.
- [ ] Implement task-relevant retrieval over the full eligible archive, including premise/correction dependencies. Preserve old and mistaken claims as such. Never infer universal ignorance from missing metadata.
- [ ] Use the spec's allowlist compiler core, adding schema checks, source normalization, deterministic canonical digesting, and token/character limits. Report a typed capacity failure when required information cannot fit.
- [ ] **Red:** add an executable test equivalent to this packet boundary case. Its normalized-fixture call targets a helper exported by the new module for the adapter's final stage:

```js
import assert from 'node:assert/strict';
import { compileCharacterPacket } from '../../src/story/character-knowledge.mjs';

const packet = compileCharacterPacket({
  personId: 'bronn', identity: { name: 'Bronn', role: 'officer' },
  publicSituation: 'The captain requests a status report.',
  validSourceIds: new Set(['source-public', 'source-private']), beforeOrder: 3,
  candidates: [
    { id: 'public', text: 'The door is sealed.', claimType: 'narrated-fact',
      recipientIds: ['bronn'], acquisition: 'observed', learnedAt: 1,
      status: 'current', sourceIds: ['source-public'] },
    { id: 'private', text: 'Private deadline: three minutes.', claimType: 'character-claim',
      recipientIds: ['sato'], acquisition: 'heard', learnedAt: 1,
      status: 'current', sourceIds: ['source-private'] },
  ],
});
assert.deepEqual(packet.information.map(item => item.id), ['public']);
assert.equal(JSON.stringify(packet).includes('three minutes'), false);
```

- [ ] Add the inverse positive control: an explicit later disclosure to Bronn admits the private detail only after its causal position. Cover a false report, inaccessible correction, missing access metadata, source invalidation, >6 eligible statements, and required-record overflow.
- [ ] **Green:** run `node tools/scripts/test-character-knowledge-packets.mjs` and `node tools/scripts/test-character-information-projection.mjs`. Both pass; the older summary retains its presentation semantics.
- [ ] Commit: `feat(story): compile scoped character knowledge`.

## Task 3: Introduce source passage references

**Requirements:** K3, K5, K9.

**Create:** `src/story/evidence-passages.mjs`, `tools/scripts/test-evidence-passages.mjs`.

**Modify:** `src/story/continuity-analyst.mjs`, `src/mission/v1/accepted-pair-interpreter.mjs`, and the existing request/schema builders reached by those modules; preserve validator APIs in `src/story/continuity-contracts.mjs` and accepted-pair People/time modules.

- [ ] Generate bounded contiguous passage catalogs tied to request ID, source slot, message/swipe/text hash, and exact offsets. Derive bounds from `resolveAnalysisLimits`; use opaque IDs without embedding private text.
- [ ] Add wire schemas/prompts for passage IDs in every relevant quote-bearing location, including audience evidence. Reject mixed ID-plus-literal fields and foreign IDs before normalization.
- [ ] Hydrate to existing quote/source fields, then invoke existing validation. Preserve persisted anchors and canonical accepted-pair hashes. Keep the legacy literal-quote path during migration.
- [ ] Extend continuity analysis with bounded current-source exposure proposals, using the same catalog. Do not add an unconditional extraction call or admit audience guesses without validation.
- [ ] **Red:** `node tools/scripts/test-evidence-passages.mjs` fails for missing hydration. Include a near-limit quote, Unicode/whitespace, overlapping passages, forged offsets, wrong swipe/hash/request, unsupported claims with valid IDs, and passage text that is no longer current.
- [ ] **Green:** hydrated valid evidence passes the same existing validator; forged/unsupported evidence fails. Run `node tools/scripts/test-information-access-events.mjs`, `node tools/scripts/test-information-access-analyst.mjs`, and `node tools/scripts/test-information-extractor-evaluation.mjs`.
- [ ] Verify bounded validation feedback still reaches retries and does not include another character's secret when reused downstream.
- [ ] Commit: `feat(story): resolve source evidence by passage`.

## Task 4: Add isolated generation routes and a shared attempt budget

**Requirements:** K8–K10, K12.

**Create:** `src/generation/turn-attempt-budget.mjs`, `tools/scripts/test-character-isolated-transport.mjs`, `tools/scripts/test-turn-attempt-budget.mjs`.

**Modify:** `src/generation/generation-roles.mjs`, `src/providers/directive-provider-settings.mjs`, `src/providers/generation-policy.mjs`, `src/hosts/sillytavern/provider-client.mjs`, `src/hosts/sillytavern/generation-client.mjs`, `src/hosts/sillytavern/settings-store.mjs`, and `createDirectiveGenerationRouter` in `src/runtime/runtime-app.mjs`.

- [ ] Register `characterResponder`, `sceneNarrator`, and `characterKnowledgeReviewer` as non-state-mutating roles. Extend the existing settings owner with the narration lane; retain utility/reasoning values and role limits unchanged.
- [ ] Add a generation request contract for isolated context that survives routing and retries. Enforce it at final outgoing messages after profile handling. Permit only reviewed system/style instructions, the supplied packet, and allowlisted sampling parameters.
- [ ] Explicitly reject native fallback APIs that cannot prove isolation. Do not certify an isolated route merely because its profile name says it is isolated.
- [ ] Integrate a shared synchronous physical-attempt budget at the actual transport-attempt boundary, including visible-output continuation and transport retries. Reserve finalization capacity atomically for parallel branches; release unused reservations on abort/failure.
- [ ] Thread the existing cancellation signal through every new role. Preserve normalized failure kinds and existing output-limit notifications.
- [ ] **Red:** plant different secret canaries in history, world info, preset/system additions, author note, other character card, retry feedback, and cache. Capture actual outgoing requests and fail if any forbidden canary appears.
- [ ] **Green:** `node tools/scripts/test-character-isolated-transport.mjs` and `node tools/scripts/test-turn-attempt-budget.mjs` pass. A concurrency test proves the limit cannot be exceeded by two simultaneous claims; stopping one branch releases only its own reservation.
- [ ] Run existing `test-directive-provider-routing.mjs`, `test-sillytavern-generation-client.mjs`, `test-configured-generation-limits.mjs`, and `test-generation-cancellation.mjs` with `node tools/scripts/<filename>`.
- [ ] Commit: `feat(generation): enforce isolated role requests`.

## Task 5: Generate validated character contributions

**Requirements:** K1, K2, K4, K6, K10.

**Create:** `src/story/character-responder.mjs`, `tools/scripts/test-character-responder.mjs`.

**Reuse:** the generation router, structured-output parsing, and contract parsers from tasks 1–4.

- [ ] Implement `respond({ packet, signal, budget })` with one character per request. Include no raw source pair, complete campaign, or other private packet in prompt construction.
- [ ] Use strict speech/action contributions with basis IDs and epistemic modes. Validate IDs, recipients, lengths, duplicates, and references before returning candidates.
- [ ] Require accessible premises for recall/inference. Preserve deception as character speech; prohibit proposals that directly mutate world or mission state. Exclude the player character from generated NPC contributions.
- [ ] Reuse bounded validation feedback and existing error categories. Any retry feedback is sanitized to the same packet's access scope.
- [ ] **Red:** fake-provider outputs citing another character's record, choosing player speech, granting arbitrary audiences, or using a fabricated contribution ID must be rejected.
- [ ] **Green:** `node tools/scripts/test-character-responder.mjs` passes, including routine competence, a reasonable inference, a question, a lie, and a cancellation between request completion and parsing.
- [ ] Commit: `feat(story): generate scoped character responses`.

## Task 6: Coordinate causal rounds and provisional disclosures

**Requirements:** K3, K5, K7, K10–K11.

**Create:** `src/runtime/character-scene-coordinator.mjs`, `tools/scripts/test-character-scene-coordinator.mjs`.

**Inspect:** `src/runtime/parallel-turn-analysis.mjs`, `src/runtime/turn-state-reconciler.mjs`, `src/runtime/generation-cancellation.mjs`.

- [ ] Start after existing analysis admission. Freeze a flight identity tied to the existing transcript owner and snapshot. Do not rerun or commit settlement merely to regenerate prose.
- [ ] Choose only necessary reacting NPCs from validated scene participants, with three actors/two rounds/four character calls as initial limits. Absent or unconscious characters require an explicitly valid communication/perception path.
- [ ] Build and validate an acyclic disclosure graph. Run independent actors with concurrency two; recompile dependent recipients only after admitted prior contributions. Assign order in code, not from model-supplied numbers.
- [ ] Hold disclosures in flight memory. Replacing an upstream contribution invalidates its dependent packets, contributions, narration, and review receipt. No cycle or capacity overflow falls back to unrestricted prose.
- [ ] Use dependency-complete cache keys, including source/configuration and packet digests. Clear affected entries on invalidation; never reuse a cached successful verdict for changed text.
- [ ] **Red:** A tells B a fact, B reacts before A speaks, and a canceled A leaves B's knowledge behind. Each must fail.
- [ ] **Green:** `node tools/scripts/test-character-scene-coordinator.mjs` passes positive disclosure order, independent parallelism, cyclic proposals, capacity failure, Stop, stale source, and dependency replacement. Assert authoritative state is byte-for-byte unchanged by preparation.
- [ ] Run existing causal order and parallel-analysis tests: `test-continuity-causal-order.mjs`, `test-information-acquisition-order.mjs`, `test-parallel-turn-analysis.mjs`, and `test-turn-state-reconciliation.mjs`.
- [ ] Commit: `feat(runtime): coordinate causal character scenes`.

## Task 7: Assemble and review buffered narration

**Requirements:** K4, K6, K9–K11.

**Create:** `src/narration/character-scene-narrator.mjs`, `src/story/character-knowledge-reviewer.mjs`, `tools/scripts/test-character-scene-narration.mjs`, `tools/scripts/test-character-knowledge-review.mjs`.

**Modify:** coordinator from task 6; reuse relevant style/pacing guidance from `src/narration/narration-policy.mjs` and `src/narration/scene-pacing.mjs` through an explicit allowlist.

- [ ] Build a player-visible narrator packet with approved contributions and safe director constraints. Exclude hidden campaign explanations, raw history, and all-character private dossiers.
- [ ] Generate strict prose/character-reference segments. Insert approved character text exactly; validate completeness, uniqueness, causal order, and scene/channel placement. Treat all text as escaped display data.
- [ ] Implement a reviewer returning only schema-validated findings and a candidate/packet-bound verdict. Check indirect speech, thoughts, anticipatory actions, narrator disclosure, unsupported inference, and player agency, not just dialogue.
- [ ] Permit one repair cycle. Narrator-only repair retains valid actor contributions; actor repair invalidates dependent outputs. Sanitize feedback and re-review the complete final candidate.
- [ ] Empty, unavailable, malformed, or stale review results fail closed. An exhausted attempt budget offers Retry without publishing rejected text or secrets.
- [ ] **Red:** fake narrator adds “Bronn had known about the three-minute deadline all along” outside an exact dialogue segment. Structural insertion alone passes; the injected reviewer finding must block publication eligibility.
- [ ] **Green:** both new scripts pass clean verdict, indirect leak, secret-in-feedback, missing/duplicate segment, changed audience, invalid reviewer reference, second rejection, budget exhaustion, and Stop during repair. Fake-model tests verify enforcement, not the real reviewer's detection accuracy.
- [ ] Commit: `feat(narration): review protected scene drafts`.

## Task 8: Integrate native generation and guarded publication

**Requirements:** K3, K5, K7, K11.

**Create:** `tools/scripts/test-character-scene-publication.mjs`, `tools/scripts/test-character-knowledge-replay.mjs`.

**Modify:** `src/runtime/runtime-app.mjs`, `src/hosts/sillytavern/runtime-bridge.mjs`, `src/hosts/sillytavern/chat-adapter.mjs`, and the existing orchestrator reached by `getChatTurnOrchestrator()`; retain existing transcript/recovery ownership.

- [ ] Intercept protected normal/continue/regenerate before native unrestricted output. Return an owned response strategy that suppresses default generation and starts the coordinator. Preserve quiet/impersonation behavior and fresh-gesture Stop recovery.
- [ ] Add a guarded publication operation in the chat adapter, checking full flight identity immediately before mutation under serialized ownership. Extend existing post/swipe methods rather than appending chat rows elsewhere.
- [ ] Attach versioned per-swipe receipts and provisional disclosures. Preserve idempotent publication IDs and verify read-back. Deduplicated text must not mix provenance from different attempts.
- [ ] Handle mutation/save/display failures explicitly: reconcile by publication ID before retrying; do not duplicate a row after uncertain persistence. On Regenerate, preserve prior swipe metadata and bind new proposals to the selected new swipe.
- [ ] Feed accepted selected-source proposals through existing continuity validation and atomic reconciliation on the next accepted pair. Verify edits/deletes/swipe changes remove invalid descendants and replay yields the same accepted result.
- [ ] Cover opening generation through the same protected path when enabled; otherwise protected mode could leak before the first normal turn. Gate activation until opening, normal, continue, and regenerate are all supported.
- [ ] **Red:** stop immediately before append, change binding after review, fail persistence after mutation, replay a selected swipe, and retry the same publication ID. Assert no stale/duplicate output or accepted knowledge.
- [ ] **Green:** both new scripts pass. Run `test-retry-generation-handoff.mjs`, `test-recovery-ownership.mjs`, `test-v1-accepted-pair-source.mjs`, and `test-continuity-lineage.mjs`.
- [ ] Assert mission/objective/time/reward state does not change during generation or repair; only existing accepted-pair settlement can change it.
- [ ] Commit: `feat(runtime): publish protected scenes safely`.

## Task 9: Settings, migration, progress, and diagnostics

**Requirements:** K7, K9–K12.

**Create:** `tools/scripts/test-character-knowledge-settings.mjs`.

**Modify:** `src/providers/directive-provider-settings.mjs`, `src/hosts/sillytavern/settings-store.mjs`, `src/ui/settings-panel.js`, `src/ui/view-models/certified-settings-view.mjs`, `src/hosts/sillytavern/turn-progress-view.js` and existing runtime activity reporting.

- [ ] Add the protected/legacy setting and explicit Narration profile selection. Enabling protected mode requires a valid isolated narration route; expose adoption of the current route as an explicit action, not an invisible migration.
- [ ] Preserve existing utility/reasoning profiles, credentials, role overrides, and settings draft ownership. Do not write new keys or modify unrelated connection profiles.
- [ ] Keep actor/round/attempt limits and exact role output caps under Advanced. Explain the extra work in plain language, with no claim of guaranteed leak prevention.
- [ ] Emit progress into the current activity surface. Keep Stop available throughout actor, narrator, reviewer, and repair phases. Hide rejected text and secret findings from player-facing notifications.
- [ ] Record phase durations, physical attempt counts, normalized failures, token usage when reported, repair counts, and hash-only custody details. Unknown token counts remain unknown, not zero.
- [ ] **Red/Green:** `node tools/scripts/test-character-knowledge-settings.mjs` covers legacy load, explicit activation, route absence, dirty settings drafts, switching mode, capacity validation, and private diagnostics. Existing settings/capacity tests remain green.
- [ ] Commit: `feat(settings): expose protected character scenes`.

## Task 10: Complete offline and installed-host verification

**Requirements:** K1–K12.

**Create:** `tools/scripts/test-character-knowledge-end-to-end.mjs`, `tools/scripts/test-character-knowledge-host.mjs`, `docs/character-knowledge-evaluation.md`.

**Modify:** `tools/scripts/run-alpha-gate.mjs` to register all new offline checks.

- [ ] Run a fake-provider end-to-end fixture through existing analysis, protected generation, publication, acceptance, and replay. Assert world state and mission custody alongside knowledge behavior.
- [ ] Fault-inject cancellation at every awaited phase, config/source/binding changes, role retries, second semantic failure, save failure, duplicate publication, and reload. Verify all physical attempts count toward the shared ceiling.
- [ ] Capture final outgoing host requests with synthetic secrets in every forbidden injection surface. Assert no cross-character leakage even on retries and fallback attempts.
- [ ] Exercise opening, normal send, Continue, Regenerate, swipe selection, edit/delete, Stop then Regenerate, and chat switching in an isolated test host. Verify no unreviewed streaming or default narrator request escapes interception.
- [ ] Run `npm.cmd test` from the implementation worktree. Record the actual check count and results; do not copy the baseline's count as proof.
- [ ] Run browser/installed-host checks separately where the offline gate cannot establish real host behavior. State any unavailable host verification explicitly; do not mark it passed from fake adapters.
- [ ] Review the complete diff against the five focus areas and requirement table. Resolve findings before publication and verify no unrelated files or running-host data changed.
- [ ] Commit: `test(story): verify character knowledge boundaries`.

## Task 11: Budgeted live evaluation and gradual rollout

**Requirements:** K1–K12; especially semantic quality and K10.

**Update:** `docs/character-knowledge-evaluation.md` with measured results and limitations. No claim of completion until live criteria are measured.

- [ ] Prepare a concrete request/time budget for the 30-scenario, three-repetition evaluation, including existing analysis calls, transport retries, and the ten-attempt protected-phase ceiling. Request a new budget before paid calls; the former soak window has expired.
- [ ] Use a distinct test character/campaign and the approved NanoGPT routes. Keep existing production saves and Claude connections untouched. Confirm selected profiles and output limits without printing credentials.
- [ ] Evaluate baseline and protected output against the same source/knowledge state. Human-adjudicate leaks, positive controls, reviewer false rejections, and narrative usefulness; do not let the same reviewer grade itself as the sole judge.
- [ ] Record zero/nonzero critical leaks, deterministic custody failures, visible-response success, positive-control success, false-rejection rate, p50/p95 latency, physical attempts, and available token counts. Keep exact denominators and distinguish generated failures from reviewer rejection.
- [ ] Require the spec's release thresholds: zero observed critical leaks/custody failures, ≥95% visible-response and positive-control success, ≤10% reviewer false rejection. If any threshold fails, keep explicit opt-in and fix the demonstrated cause before retesting affected cases.
- [ ] Only after the gate passes, consider protected mode as the default for new saves. Existing saves still require explicit enablement. Preserve a legacy fallback setting for future generation; do not erase accepted knowledge or silently switch modes on failure.
- [ ] Publish the evaluated implementation and evaluation report through the project's Main workflow; verify the remote revision. Describe residual probabilistic limits rather than promising perfect epistemic reasoning.

## Completion checklist

- [ ] Every K1–K12 requirement has a passing automated contract test or a recorded live/manual evaluation result, with limitations stated.
- [ ] No full shared context reaches character generation; no unchecked native narration bypass remains in protected mode.
- [ ] Same-reply disclosures, source invalidation, replay, Stop, and Regenerate preserve custody.
- [ ] Reviewer rejection and provider failures never publish partial or secret rejected output.
- [ ] Profile migration, settings drafts, player agency, mission objectives, time, and rewards retain their existing authority.
- [ ] Measured quality and cost support the selected routes; the ten-attempt ceiling and global live budget are both enforced.
- [ ] Scoped changes are published and the running host's installed revision is verified only within an authorized installation step.

Document publication alone completes the planning request. It does not check off implementation, approve a fresh paid soak, or certify the proposed design's live quality.
