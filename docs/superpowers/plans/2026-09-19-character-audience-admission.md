# Character Audience Admission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block unsupported scene and archived recipient grants before any protected character provider request.

**Architecture:** Freeze selected actor knowledge and a complete source-bound access manifest before dispatch. One independent isolated utility call approves that exact manifest, then an ephemeral runtime capability gates all actor packets; trusted host span coverage may avoid the call. Keep the final semantic scene review and shared ten-attempt budget.

**Tech Stack:** Existing ES modules, Node assert regression scripts, SHA-256/canonical JSON helpers, current isolated generation/provider transport; no dependencies.

**Spec:** [Approved design](../specs/2026-09-19-character-audience-admission-design.md).

**Authorization:** User approved the specification and explicitly said no further approval asks. Execute this plan without an additional plan-approval pause. Parent owns integration and live qualification; workers never operate the running host or spend provider calls.

## Global Constraints

- Ordinary protected turns gain one model call within the existing ten-attempt protected budget; preceding accepted-pair analyst calls remain outside that existing budget.
- Check both current perceptions and selected archived/provisional addFact grants. No raw source text enters actors, no persistent grant/knowledge silo, no initial cache.
- No actor call on missing/malformed/reject/stale receipt, missing necessary historical evidence, capacity failure or Stop. No silent format/semantic/visible-output retry or fallback for the new role.
- Preserve exact selected source identities, claim semantics, correction/dependency closure and ordered same-reply exposure. Do not infer source audiences with keyword rules.
- Preserve configured global qualification caps/deadlines; no worker raises token/attempt ceilings or calls a live provider.
- Source baseline: isolated worktree at `275867029092d23649bc312c9d3ad0d6180cf212`. Preserve other workers' edits; stage only owned files. Use `git -c safe.directory=C:/Users/Keptin/.codex/worktrees/directive-live-soak/Directive ...` and `npm.cmd` on Windows.
- Shared runtime request capacity defaults to 48,000 characters; actor packet bounds remain 12,000 characters/conservative UTF-8 estimate and 128 records. Validate complete preflight envelope; never trim required evidence to fit.

## Review Focus

- A historical audience quote and statement share a message but differ in offsets: retain both and validate the entire selected source (Task 1).
- Legacy archive identities exist while original accepted-pair context is absent/ambiguous: block, do not certify from a summary (Task 1/3).
- Provider internally requests a second physical send after empty/reasoning-only output: block before send despite otherwise available turn budget (Task 2).
- A dependent actor's packet adds a new archive candidate after preflight or repair: reject it; allow only checked records plus ordered contributions (Task 3).
- Already-published recovery needs persistence completion, not another model call or append: retain existing recovery behavior (Task 3).

## Ownership and handoffs

Execute implementation tasks sequentially under the selected execution skill. Independent read-only review or evidence work may run alongside implementation. Task 3 consumes both and owns the integrated checker/runtime/regression segment. This is one product change, not separately deployable partial gates.

| Owner | Files |
| --- | --- |
| A: contract/source preparation | New `src/story/character-audience-admission.mjs`, new `src/runtime/character-audience-preparation.mjs`; `src/story/character-knowledge.mjs`, `src/runtime/character-runtime-snapshot.mjs`; new `tools/scripts/test-character-audience-admission.mjs`, new `tools/scripts/test-character-audience-preparation.mjs`, existing packet/snapshot tests |
| B: provider plumbing | `src/generation/generation-roles.mjs`, `src/generation/isolated-request.mjs`, `src/hosts/sillytavern/provider-client.mjs`, `src/providers/character-knowledge-settings.mjs`; existing `test-character-isolated-transport.mjs`, `test-directive-provider-policy.mjs` (only if affected), `test-character-knowledge-settings.mjs` and its browser test if changed. `directive-provider-settings.mjs` derives role mapping from registry; edit only if a test exposes a hardcoded assumption. |
| C: checker + runtime enforcement | New `src/story/character-audience-reviewer.mjs`; `src/runtime/character-scene-coordinator.mjs`, `protected-character-turn.mjs`, `character-scene-diagnostics.mjs`; new reviewer/runtime tests and existing coordinator/protected-turn/settings tests |
| Parent/integrator | `src/runtime/runtime-app.mjs` only if runtime limit/source inputs need propagation; progress UI if needed; `tools/scripts/run-alpha-gate.mjs`; cross-entry test updates, whole diff review, commit/push/install/qualification |

Freeze these interfaces in task messages before edits; communicate any required change to all dependent owners:

```js
// A: character-audience-preparation.mjs
prepareCharacterAudienceInput({ snapshot, messages, sourcePair, admission,
  identity, limits, trustedSpans = [] })
// => { manifest, evidence, manifestDigest, evidenceDigest, identityDigest,
//      preparedByPerson: Map<string, CharacterPacket>, selectedArchiveIds: Map<string,string[]> }
// manifest { kind, policyVersion, entries:[{id,origin,personId,acquisition,
//   sourceRefs,statementRef?,eventId?,routeRecipientId?}], planDigest }
// sourceRef { messageId,selectedSwipeId,textHash,start,end }; evidence retains full sources/pairs.
// Function is pure, clones input, sends no provider request; typed failure instead of partial success.

// A: character-audience-admission.mjs
parseCharacterAudienceReview(value, { manifestDigest,evidenceDigest,identityDigest,entryIds })
// => strict clone {kind,manifestDigest,evidenceDigest,identityDigest,verdict,checkedEntryIds,findings}
// pass: checkedEntryIds exactly entryIds, findings []; reject: bounded entry-bound findings.
createCharacterAudienceAdmission(prepared, review)
// => opaque capability (module-private WeakMap); refuses unvalidated/non-pass review.
assertCharacterAudienceAdmission(capability, {prepared,identity}) // throws if invalid/stale
getAdmittedCharacterPacket(capability, personId) // detached approved base packet; no raw evidence

// C: character-audience-reviewer.mjs
createCharacterAudienceReviewer({ generation }).review({ prepared,budget,reservation,signal,isCurrent })
// => {review,capability}; one generate call, no catch/retry loop; asserts current before/after.
// B: generation role `characterAudienceReviewer` is isolated Utility and forcibly single-send.
// Options used by C: {attemptBudget:budget,attemptReservation:reservation,allowVisibleOutputRetry:false,maxAttempts:1}.

// C: coordinator
createFlight({...existingArgs, audienceAdmission, audiencePreparation})
// Both mandatory for protected dispatch; assert capability before any responder and repair.
// Existing low-level coordinator test fixtures must create valid controlled approval; no test-mode bypass.
```

The capability is runtime custody, not adversarial-JavaScript security. The checker adapter is the production minting callsite; callers cannot pass plain booleans, clone a receipt into a capability, or use a capability for changed data. Whole-source proof remains a model judgment.

### Task 1: Strict manifest, selected-source recovery and frozen knowledge

**Files:** Owner A above. Existing production sources: `continuity-events.mjs::payloadFor/materializeContinuityChanges`, `v1-accepted-pair-source.mjs::captureV1StorySource`, `v1-accepted-pair-receipt.mjs`, `character-scene-admission.mjs::materializeCharacterSceneEvidence` (read/reuse; do not replace source custody).

- [ ] Add fixtures using exact preserved statement/audience quotations from `artifacts/character-knowledge-stabilization/audit-wrong-recipient.json` and `audit-wrong-archive-recipient.json`. Port minimal deterministic fixture data into repository tests; do not depend on workstation artifact paths. Construct archive events through `materializeContinuityChanges` as the audit does. Export `makeAudienceFixture()` from new `tools/scripts/character-audience-test-fixtures.mjs` owned by A, returning `{snapshot,messages,sourcePair,admission,identity,limits}`.
- [ ] Write strict receipt/capability negatives and source-preparation tests. Include exact current scene and archive entry IDs, repeated text offsets, source swap, unknown/duplicate/missing coverage IDs, forged capability, later mutation, missing historical pair, capacity overflow and heard-claim preservation.

```js
const input = makeAudienceFixture();
const prepared = prepareCharacterAudienceInput(input);
assert.ok(prepared.manifest.entries.some(e => e.origin === 'archive'));
assert.ok(prepared.manifest.entries.some(e => e.origin === 'perception'));
assert.throws(() => assertCharacterAudienceAdmission({}, {prepared,identity:input.identity}));
assert.throws(() => prepareCharacterAudienceInput({...input,messages:[]}),
  {code:'DIRECTIVE_CHARACTER_AUDIENCE_SOURCE_UNAVAILABLE'});
assert.throws(() => prepareCharacterAudienceInput({...input,limits:{...input.limits,requestContextCharacters:100}}),
  {code:'DIRECTIVE_CHARACTER_AUDIENCE_CAPACITY'});
```

- [ ] Run `node tools/scripts/test-character-audience-admission.mjs` and `node tools/scripts/test-character-audience-preparation.mjs`; observe missing-function/behavior failure before implementation.
- [ ] Implement manifest construction around the existing compiler selection, not a new retrieval algorithm. Extend packet compilation result with selected archive IDs, or extract the existing selection helper once; preserve current return fields and existing tests. Apply admitted scene perceptions during preparation so mandatory current context is included in sizing. Freeze the initial selected archive set; dependent contribution text is added later with no archive reselection. If exact prepared content plus mandatory causal context cannot fit, fail typed capacity rather than silently replace facts.
- [ ] Resolve full canonical selected source texts from `messages` using `captureV1StorySource`. Match event source contributions and accepted-pair receipts by immutable identity, not chronology guesses. For current authored opening use its sourcePair as explicit source authority. Require unique historical pair context when it is necessary for a selected grant; do not silently accept missing paired sources. Include all `informationAccess.audienceSources`, not just `event.sources` (same message can support different quotes). Never reuse a supplied event quote as the full source.
- [ ] Define trusted span validation in the contract only: exact custody/offset/recipient/channel coverage, explicit denial precedence. Current production host supplies an empty list. Model-proposed metadata cannot enter the trusted list. Full manifest coverage permits deterministic pass; partial coverage leaves remainder for semantic check.
- [ ] Implement strict receipt validation and WeakMap capability; errors: `DIRECTIVE_CHARACTER_AUDIENCE_INVALID`, `..._REJECTED`, `..._SOURCE_UNAVAILABLE`, `..._CAPACITY`; reuse scene-stale and generation-aborted codes where appropriate. No durable writes or cache. Run the two new tests plus `test-character-knowledge-packets.mjs` and `test-character-runtime-snapshot.mjs` green. Notify C that APIs are ready; parent handles commits.

### Task 2: Isolated role with one physical attempt

**Files:** Owner B. No source-preparation dependency. Owner B also owns maxAttempts feasibility/settings tests; C must not edit those files.

- [ ] Add a registry/transport regression for `characterAudienceReviewer`: Utility lane, no prompt/state mutation, fail-closed routing, preset/instruct isolation, no unsafe native fallback. Test empty/reasoning-only, retryable error and cancellation against real fake-host provider-client transport; assert exactly one physical send even with ten available attempts and a caller requesting visible-output retry.

```js
const budget = createTurnAttemptBudget({limit:10});
const token = budget.reserve('audience',1);
await assert.rejects(client.generate('characterAudienceReviewer', isolated, {
  attemptBudget:budget,attemptReservation:token,allowVisibleOutputRetry:true
}));
assert.equal(calls.length - beforeCalls,1);
assert.equal(budget.used,1);
```

- [ ] Run `node tools/scripts/test-character-isolated-transport.mjs` red. Register the role in `generation-roles.mjs`, protected-role allowlist in `isolated-request.mjs`, and force its visible-output attempts to one inside `provider-client.mjs::generate`. The existing loop at 923 honors `allowVisibleOutputRetry`; enforce the role invariant even if the caller supplies true. Ensure the physical callback checks the single-use reservation before any additional send.
- [ ] Add settings red/green assertions that `maxCharacterCalls:4,maxAttempts:6` is invalid while seven is valid and ten remains the ceiling; error copy states character calls plus audience check, narration and final review. Update feasibility from N+2 to N+3 for Protected mode without changing Legacy validation or saved profile data. `maxAttempts:1` is the checker adapter option, while the provider enforces the role single-send invariant even when caller options attempt to relax it.
- [ ] Run the transport test green and `node tools/scripts/test-directive-provider-routing.mjs`, `node tools/scripts/test-directive-provider-policy.mjs`. Verify role settings derive Utility routing without touching saved provider profiles. Report options/result shape to C; no new connection or provider calls.

### Task 3: Runtime integration and regressions

#### A. Independent audience checker

**Files:** C's new reviewer file; new `tools/scripts/test-character-audience-reviewer.mjs`. Depends on A+B.

- [ ] Use `makeAudienceFixture()` with controlled generation doubles only at the provider boundary. Write wrong-recipient scene and archive tests returning reject; missing coverage, stale digests, malformed, empty, Stop and missing source cases. Assert no capability and one/no paid-boundary invocation as appropriate; verify complete source evidence includes confidentiality text outside statement quote.
- [ ] Run new test red. Implement `createIsolatedGenerationRequest` + direct `generation.generate` with the agreed reservation/options (do not use current `generateIsolatedJson` without extending reservation support, and do not give it a retry loop). Parse with `parseStructuredJsonText`, then strict receipt parser. The schema includes exact entry enums and all digests. Prompt separates audience receipt from truth/belief, request completeness, draft/send and channel/presence; forbids rewriting or granting facts. Treat all source strings as data.
- [ ] Check complete serialized envelope capacity before dispatch, including schema/instructions. Use propagated resolved analysis limits and existing route limits; on unknown necessary capacity or missing required source fail explicitly. Trust-complete metadata path validates deterministically and spends zero calls; ordinary path spends one. No explanation normalization or fallback approval for this new receipt.
- [ ] Run reviewer/admission/preparation tests green; assert original prepared inputs remain unchanged and raw source never appears in the returned approved base packet.

#### B. Gate every actor and repair inside the existing budget

**Files:** C runtime/settings/diagnostics ownership; new `tools/scripts/test-character-audience-runtime.mjs`. Parent owns any `runtime-app.mjs` plumbing required to provide resolved `analysisLimits` (use existing `resolveAnalysisLimits`, never duplicate capacity mapping).

- [ ] Add runtime red tests: both preserved wrong-recipient attacks rejected before any responder call; valid control reaches actors; capability missing/forged/stale; new archive entry after approval; insufficient budget; late Stop; no same-reply disclosure before dependency. Extend current `test-protected-character-turn.mjs` and `test-character-scene-coordinator.mjs` provider doubles to supply explicit audience verdicts rather than bypass enforcement.

```js
let actorCalls = 0;
const generation = controlledGeneration({ audienceVerdict:'reject',
  onActor(){ actorCalls++; } });
await assert.rejects(prepareProtectedCharacterTurn({...fixture,generation}),
  {code:'DIRECTIVE_CHARACTER_AUDIENCE_REJECTED'});
assert.equal(actorCalls,0);
```

`controlledGeneration` is a test helper in the new runtime test, dispatching on the literal role names and generating digest-bound receipts from the received JSON; it must not inspect production private state or bypass the real checker.

- [ ] Run new/runtime tests red. In `prepareProtectedCharacterTurn`, capture snapshot/prepare evidence first, create shared budget, reserve audience+existing finalization and verify N+3 initial feasibility before sending. Reuse existing coordinator finalization ownership or hand off explicit reservation tokens; never double-reserve narration/review. Invoke checker before `flight.run()`; dispose budget/reservations on all failures.
- [ ] In coordinator, require matching capability at construction and before each responder call. Use approved detached base packet instead of rerunning optional archive selection; add only validated earlier contributions with checked routes. Preserve graph checks, stale guards and descendant invalidation. Do not expose the checker source evidence to actors or narrator.
- [ ] Consume the settings feasibility change from B; do not edit B-owned settings files. Diagnostic phase `audience` and role accounting include the call without source text. Add the new typed failures to safe diagnostic mappings. Parent updates user-facing progress labels where existing mapping would omit the new phase.
- [ ] Run `test-character-audience-runtime.mjs`, `test-protected-character-turn.mjs`, `test-character-scene-coordinator.mjs`, `test-character-knowledge-settings.mjs`, `test-turn-attempt-budget.mjs` green. Assert initial N+3 and existing repair behavior: no expanded budget, no implicit repeat audience call, final reject still terminal; required causal context overflow fails rather than silently dropping knowledge.

#### C. Cross-entry integration, adversarial review and delivery gate

**Files:** Parent/integrator; no concurrent changes to A/B/C files without coordination.

- [ ] Align protected continuity output schema with the existing parser before provider qualification. `createFocusedStorySchema` currently allows `characterScene:null` unconditionally (story-director.mjs:830), while `parseFocusedStoryOutput` permits it only for `coverage:lookup-needed` and requires an admitted scene otherwise (:866-885). Parent owns `src/story/story-director.mjs` and `tools/scripts/test-character-scene-analysis.mjs` for this adjacent fix. Preserve null for lookup-needed; condition complete/overflow branches on a scene object using the schema dialect supported by existing transport. Do not remove valid lookup flow or accept null to make a provider pass. Add a controlled schema/parser parity test for complete+object, complete+null, lookup-needed+null, lookup-needed+object, and sceneOnly complete behavior; demonstrate red before changing schema. This fixes the contract mismatch rather than adding prompt prose.
- [ ] Add a positive control for the actual sent private typed request: Nayar receives both exact message/confirmation/confidentiality excerpts, the player has a source-supported visible private reply route, and Whitaker receives only the public question/old schedule. A controlled checker pass must allow the legitimate contribution to reach final narration/review; the new gate cannot qualify by permanently blocking every turn. Preserve character claim versus settled scheduling outcome. Qualification must additionally show the live model can pass this positive control; mocks alone prove dispatch logic.
- [ ] Register all four new test scripts in `tools/scripts/run-alpha-gate.mjs`. Port both audit attacks to stable test fixtures and assert the actual protected-turn pipeline never invokes actors on rejected access. Include archived and provisional sources; preserve the audit baseline/negative controls.
- [ ] Run/adjust existing `test-character-opening-context.mjs`, `test-protected-character-opening.mjs`, `test-protected-character-continuation.mjs`, `test-protected-character-runtime.mjs`, `test-character-knowledge-host.mjs`, `test-character-publication-acceptance.mjs`, `test-character-knowledge-end-to-end.mjs`, `test-character-scene-review-evidence.mjs`. Add real entry-path assertions for normal/regenerate/continue/opening and explicit Retry, with source swaps and saved historical recovery. Already-published persistence recovery must issue no extra generation or append.
- [ ] Run `node tools/scripts/test-character-knowledge-settings-browser.mjs` if settings/progress rendering changes. Review legacy-mode paths: no new audience requirement silently applied to legacy narrator requests, and no product claim that its summary projection now has actor-level isolation.
- [ ] Review the complete diff against approved spec. Check five review-focus cases, archive bypass, identity mutation, reservation transfer, full-envelope limits, provider role defaults and no automatic retries. Fix findings with targeted regression red/green; do not substitute prompt string assertions for semantic tests.
- [ ] Run `git -c safe.directory=C:/Users/Keptin/.codex/worktrees/directive-live-soak/Directive diff --check` and `npm.cmd test`, capture full output to a new scoped artifact log, inspect exit 0 and final count. No paid calls in the deterministic gate.
- [ ] Parent performs scoped integration/push and installed-file parity using the user's authorization, preserving unrelated dirt. Live qualification is separate: explicitly record model/route, frozen fixture IDs, physical calls, tokens, latency and every semantic failure under unchanged global stage caps. No worker marks live containment passed from mocks or green unit tests.

## Self-review record

Every approved-spec section maps to Tasks 1–3. A/B are separately reviewable segments, executed sequentially; C depends on agreed interfaces and must not create alternate definitions. Both scene and archived/provisional admission, all source custody, false claims/corrections, trusted metadata, request completeness, single-send transport, ten-attempt reservations, ordered exposure, all entry paths and live-proof limits have named tests above. No additional user approval is needed for this plan under the explicit instruction to continue.
