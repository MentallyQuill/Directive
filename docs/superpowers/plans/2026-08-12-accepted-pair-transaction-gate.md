# Accepted-Pair Transaction Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist each accepted pair's time, mission, Story Settlement, and accepted Command Bearing effects as one failure-atomic state commit, retry persistence twice without repeating Utility work, and block host narration with a manual Retry action after exhaustion.

**Architecture:** Time custody becomes a pure plan consumed by the existing state spine so all accepted-pair roots share one gateway commit. The mission runtime caches only a validated interpretation for the active source/revision, while the runtime app owns the three-attempt persistence policy and pending failure. SillyTavern's interceptor abort callback gates host narration and an accessible retry dialog resumes settlement before invoking the normal host generation path.

**Tech Stack:** Browser-native JavaScript modules, Node.js assertion scripts, SillyTavern generation interceptor API, Directive V1 state gateway.

## Global Constraints

- Gameplay narration remains owned by SillyTavern's active main model and normal extension prompt pipeline.
- Zero net-new per-turn model calls.
- Automatic persistence attempts are one initial attempt plus at most two retries.
- Completed validated Utility output is reused for persistence retries.
- Provider output never mutates semantic state without deterministic validation.
- No legacy migration, sidecar tracker, direct provider credentials, or raw provider error exposure.

---

### Task 1: Pure Accepted-Pair Time Plan

**Files:**
- Modify: `src/runtime/v1-accepted-pair-time.mjs`
- Modify: `tools/scripts/test-v1-accepted-pair-time.mjs`

**Interfaces:**
- Produces: `prepareV1AcceptedPairTimeAdvance({ campaignState, snapshot, packageData, timeDecision, now }) -> { ok, status, proposal, boundary, decision, patch, domains }`.
- Preserves: `commitV1AcceptedPairTimeAdvance(...)`, implemented as prepare then one gateway proposal for callers outside settlement.

- [ ] **Step 1: Write the failing pure-plan tests**

Add assertions that preparation returns exact `campaign`, `worldState`, and `timeLedger` roots without calling persistence, including an `unchanged` zero-second decision.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-v1-accepted-pair-time.mjs`

Expected: FAIL because `prepareV1AcceptedPairTimeAdvance` is not exported.

- [ ] **Step 3: Extract the deterministic planner**

Implement the planner by moving lines that derive `proposal`, `boundary`, `decision`, and next roots out of the commit function. Return:

```js
{
  ok: true,
  status: boundary ? 'planned' : 'recorded',
  proposal,
  boundary,
  decision,
  patch: {
    campaign: next.campaign,
    worldState: next.worldState,
    timeLedger: next.timeLedger
  },
  domains: ['campaign', 'worldState', 'timeLedger']
}
```

The compatibility commit function applies this patch with the existing pair-scoped idempotency ID.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node tools/scripts/test-v1-accepted-pair-time.mjs`

Expected: `V1 accepted-pair time custody tests passed.`

- [ ] **Step 5: Commit**

```bash
git add src/runtime/v1-accepted-pair-time.mjs tools/scripts/test-v1-accepted-pair-time.mjs
git commit -m "refactor(time): separate accepted-pair plan"
```

### Task 2: One State-Spine Commit

**Files:**
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/test-v1-mission-authoritative-time-runtime.mjs`
- Modify: `tools/scripts/test-v1-state-spine-runtime.mjs`

**Interfaces:**
- Consumes: `prepareV1AcceptedPairTimeAdvance(...)` from Task 1.
- Extends: `createV1StateSpine(...).settleAcceptedPair({ authorityPatch, authorityDomains, acceptedCommandBearingEdge, ... })`.
- Produces: exactly one `stateDeltaGateway.applyProposal` for accepted-pair time, mission, Story Settlement, and Command Bearing.

- [ ] **Step 1: Write the failure-order regression tests**

Add a persistence spy that throws on the combined commit and assert all roots retain their prior values. Add a success assertion that the gateway revision increases once and `committedRoots` includes every changed root. Add a Command Bearing fixture proving an armed edge commits in the same write.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node tools/scripts/test-v1-state-spine-runtime.mjs
node tools/scripts/test-v1-mission-authoritative-time-runtime.mjs
```

Expected: FAIL because time currently commits before the state spine and accepted Command Bearing commits afterward.

- [ ] **Step 3: Compose additional authority roots in the spine**

Extend the spine to compare and apply exact additional roots. When mission transition activation requires operations, append one `set` operation per additional root. Otherwise merge the exact patch. Declare all additional domains on the same proposal. Import and apply `commitV1CommandBearingEdge` after mission awards when the supplied edge anchor matches the accepted pair.

- [ ] **Step 4: Replace the mission runtime's time commit with planning**

Build the time plan after validated interpretation and pass its patch/domains to the spine. Return the same public `time` result shape after the combined commit. Remove the post-settlement `commitAcceptedCommandBearingEdge()` call from `runtime-app.mjs`; supply its bounded edge input to the mission runtime instead.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the two commands from Step 2 plus `node tools/scripts/test-v1-runtime-app.mjs`.

- [ ] **Step 6: Commit**

```bash
git add src/runtime/v1-state-spine.mjs src/runtime/v1-mission-runtime.mjs src/runtime/runtime-app.mjs tools/scripts/test-v1-state-spine-runtime.mjs tools/scripts/test-v1-mission-authoritative-time-runtime.mjs tools/scripts/test-v1-runtime-app.mjs
git commit -m "fix(runtime): commit accepted pair atomically"
```

### Task 3: Persistence Retry Without Repeated Utility Work

**Files:**
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/test-v1-mission-runtime.mjs`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`

**Interfaces:**
- Produces: mission-runtime interpretation cache keyed by branch, definition version, mission revision, and complete accepted-pair source hash.
- Produces: `runtimeApp.retryPendingAcceptedPairSettlement() -> { ok, settled, campaignState }`.
- Produces: settlement diagnostics `{ persistenceAttempts, interpretationReused }`.

- [ ] **Step 1: Write failing retry tests**

Configure persistence to fail twice then succeed. Assert three persistence attempts, one interpreter call, one final state revision, and no pending block. Configure all three attempts to fail and assert the pending settlement remains blocked. Invoke manual retry after persistence recovers and assert it succeeds without a second interpreter call.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node tools/scripts/test-v1-mission-runtime.mjs
node tools/scripts/test-v1-runtime-app.mjs
```

- [ ] **Step 3: Cache only validated interpretations**

Store an interpretation only after `interpreted.ok === true` and deterministic proposal validation has completed. Reuse it only while its exact source/revision key matches. Delete it after successful settlement or source invalidation. Never cache provider failures or invalid proposals.

- [ ] **Step 4: Add the bounded retry coordinator**

In `settleSnapshot`, retry only `persistence-failed` results, for three total attempts. Preserve one pending object after exhaustion:

```js
{
  snapshot,
  ingressId,
  reasonCode: 'persistence-failed',
  persistenceAttempts: 3
}
```

Manual retry resumes that object and clears it only after a verified settlement. A different current source invalidates the pending object rather than applying it.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the commands from Step 2.

- [ ] **Step 6: Commit**

```bash
git add src/runtime/v1-mission-runtime.mjs src/runtime/runtime-app.mjs tools/scripts/test-v1-mission-runtime.mjs tools/scripts/test-v1-runtime-app.mjs
git commit -m "fix(runtime): retry settlement persistence"
```

### Task 4: Host Generation Block and Manual Retry

**Files:**
- Create: `src/ui/settlement-retry-dialog.js`
- Modify: `src/hosts/sillytavern/runtime-bridge.mjs`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-sillytavern-event-wiring.mjs`
- Create: `tools/scripts/test-settlement-retry-dialog.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `showSettlementRetryDialog({ reasonCode, attempts, onRetry })` and `closeSettlementRetryDialog()`.
- Consumes: `runtimeApp.retryPendingAcceptedPairSettlement()` and `host.chat.continueHostGeneration(...)`.

- [ ] **Step 1: Write failing bridge and dialog tests**

Assert `directiveGenerationInterceptor` calls the supplied SillyTavern `abort(false)` callback when the orchestrator returns `abortDefaultGeneration: true`. Assert one accessible dialog is rendered, Retry is disabled while pending, and successful retry closes it before calling `continueHostGeneration`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node tools/scripts/test-sillytavern-event-wiring.mjs
node tools/scripts/test-settlement-retry-dialog.mjs
```

- [ ] **Step 3: Return a blocking orchestrator result**

When replay or the current accepted pair remains unsettled, return:

```js
{
  handled: true,
  abortDefaultGeneration: true,
  responseStrategy: 'blockAndRetry',
  settlementError: {
    code: 'DIRECTIVE_ACCEPTED_PAIR_SETTLEMENT_BLOCKED',
    reasonCode,
    persistenceAttempts
  }
}
```

- [ ] **Step 4: Honor the host abort contract and show Retry**

Call `abort(false)` so SillyTavern still invokes other extension interceptors but aborts main generation afterward. The dialog copy states that Directive could not safely record the turn and narration has not begun. Retry settles the exact pending pair, closes the dialog on success, and calls `continueHostGeneration({ reason: 'directive-settlement-retry', automaticTrigger: true, waitForCompletion: false })` so narration re-enters SillyTavern's canonical pipeline.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the commands from Step 2 and `node tools/scripts/test-v1-runtime-app.mjs`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/settlement-retry-dialog.js src/hosts/sillytavern/runtime-bridge.mjs styles/directive.css tools/scripts/test-sillytavern-event-wiring.mjs tools/scripts/test-settlement-retry-dialog.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "fix(host): block narration on unsettled turn"
```

### Task 5: Pass-One Certification

**Files:**
- Modify: `docs/technical/PLAYER_TURN_SEQUENCE.md`
- Modify: `docs/technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md`

**Interfaces:**
- Documents the landed accepted-pair transaction and retry contract.

- [ ] **Step 1: Update the technical contracts**

Document one Utility interpretation, one atomic authority commit, two persistence retries, blocking failure, manual retry, and subsequent normal SillyTavern narration.

- [ ] **Step 2: Run focused failure-order tests**

Run all focused commands from Tasks 1-4.

- [ ] **Step 3: Run the full alpha gate**

Run: `npm.cmd test`

Expected: all focused checks pass.

- [ ] **Step 4: Inspect the diff and commit**

```bash
git diff --check
git add docs/technical/PLAYER_TURN_SEQUENCE.md docs/technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md
git commit -m "docs(runtime): explain settlement gate"
```
