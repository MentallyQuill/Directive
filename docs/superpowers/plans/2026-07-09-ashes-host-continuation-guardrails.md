# Ashes Host Continuation Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Ashes of Peace host-continuation turns from drifting away from the active mission structure by preserving mandatory prompt blocks, requiring active-scene readiness, injecting mission guardrails, routing large scene jumps through Directive, and reviewing host-native completions for mission-guardrail violations.

**Architecture:** Keep host continuation, but make it safer. The prompt path must fail closed when required campaign context is missing; the turn router must stop treating phase-changing player moves as ordinary continuation; SRE must review generated host prose against active mission guardrails before the response is treated as clean.

**Tech Stack:** Node.js ES modules, Directive context orchestrator, LENS prompt scheduler, chat turn orchestrator, source reconciliation engine, built-in `node:assert/strict` script tests.

## Global Constraints

- Pre-alpha compatibility rule: update current contracts in place; do not preserve stale prompt, state, or recovery behavior.
- Do not expose Director-only facts, hidden clocks, raw prompts, private NPC thoughts, provider reasoning, cookies, CSRF tokens, or API keys.
- Host continuation must still support ordinary dialogue and small local actions.
- Hesperus player-facing guidance must not reveal hidden truth; it may state allowed surface boundaries such as rescue, repair limits, passenger safety, and accountability.
- A prompt packet that omits locally mandatory context must block host continuation instead of silently releasing host generation.
- Keep fixes package-shaped where practical; Ashes-specific guardrails belong in package/mission-derived context or mission review helpers, not generic hardcoded narration.

---

## File Structure

- Modify `src/runtime/lens-prompt-scheduler.mjs`
  - Preserve `mustInclude` blocks during final LENS budget filtering.
  - Expand host-continuation readiness from generic identity/yield keys to active scene and foreground assignment keys.

- Modify `src/context/context-orchestrator.mjs`
  - Add a compact `mission-guardrails` context candidate derived from active mission/phase package data.
  - Mark foreground mission/assignment context as required when an active mission or foreground quest exists.

- Modify `src/context/scene-pacing-guidance.mjs`
  - Add Ashes/Hesperus player-safe guardrail lines.
  - Export a helper used by `context-orchestrator.mjs`.

- Modify `src/runtime/chat-turn-orchestrator.mjs`
  - Route montage, broad time skip, phase jump, and new-mission trigger turns through Directive review instead of plain host continuation.

- Modify `src/runtime/source-reconciliation-engine.mjs`
  - Add mission-guardrail review to host-native continuity review.

- Modify tests:
  - `tools/scripts/test-lens-prompt-budget-lane-contracts.mjs`
  - `tools/scripts/test-open-world-context-budget.mjs`
  - `tools/scripts/test-prompt-dirty-domains.mjs`
  - `tools/scripts/test-response-dispatcher-core-bridge.mjs`
  - `tools/scripts/test-turn-intent-classifier-fixtures.mjs`
  - `tools/scripts/test-continuity-contradiction-guard.mjs`

---

### Task 1: Preserve `mustInclude` Blocks Through LENS Budget Filtering

**Files:**
- Modify: `src/runtime/lens-prompt-scheduler.mjs`
- Test: `tools/scripts/test-lens-prompt-budget-lane-contracts.mjs`
- Test: `tools/scripts/test-open-world-context-budget.mjs`

**Interfaces:**
- Consumes: prompt blocks with `{ id, promptKey, mustInclude, tokenEstimate, lensPromptBudgetLane }`.
- Produces: final installed prompt packet where `mustInclude === true` blocks cannot be omitted by LENS budget filtering.

- [ ] **Step 1: Write the failing LENS budget test**

Append this case before the final `console.log` in `tools/scripts/test-lens-prompt-budget-lane-contracts.mjs`:

```js
let mustIncludeInstallCount = 0;
const mustIncludeScheduler = createLensPromptScheduler({
  coreStore: {
    async appendDiagnostics() {
      return { id: 'must-include-diagnostic' };
    }
  },
  clock: () => '2026-07-09T12:00:00.000Z',
  buildDirectivePromptPacket: async ({ revision, cacheKey }) => ({
    kind: 'directive.playerSafePromptContext',
    revision,
    cacheKey,
    blocks: [
      {
        id: 'immediate-scene',
        promptKey: 'directive.campaign.immediate-scene',
        text: 'Immediate scene must remain present even when activeScene is tight.',
        tokenEstimate: 700,
        mustInclude: true,
        lensPromptBudgetLane: 'activeScene'
      },
      {
        id: 'foreground-quest',
        promptKey: 'directive.campaign.foreground-quest',
        text: 'Foreground assignment must remain present even when activeScene is tight.',
        tokenEstimate: 700,
        mustInclude: true,
        lensPromptBudgetLane: 'activeScene'
      }
    ],
    promptBudgetLanes: [{
      id: 'activeScene',
      budgetTokens: 900,
      refs: [
        { id: 'immediate-scene', hash: 'scene-hash', estimatedTokens: 700 },
        { id: 'foreground-quest', hash: 'quest-hash', estimatedTokens: 700 }
      ]
    }]
  }),
  installPromptPacket: async (packet) => {
    mustIncludeInstallCount += 1;
    return {
      ok: true,
      promptKeys: packet.blocks.map((block) => block.promptKey)
    };
  },
  observeExternalPromptEnvironment: async () => ({ host: 'sillytavern', status: 'observed' })
});

mustIncludeScheduler.markDirty({ dirtyDomains: ['missionQuestThread'], idempotencyKey: 'must-include-dirty' });
const mustIncludeFlush = await mustIncludeScheduler.flushVisible({
  transactionId: 'txn-must-include-budget',
  binding: { campaignId: 'campaign-must-include-budget' },
  idempotencyKey: 'must-include-flush'
});
assert.equal(mustIncludeFlush.status, 'installed');
assert.equal(mustIncludeInstallCount, 1);
assert.equal(mustIncludeFlush.promptBudgetEnforcement.status, 'mustIncludeOverBudget');
assert.deepEqual(
  mustIncludeFlush.installed.promptKeys,
  ['directive.campaign.immediate-scene', 'directive.campaign.foreground-quest']
);
assert.equal(mustIncludeFlush.promptBudgetEnforcement.mustIncludeOverBudgetBlocks.length, 1);
assert.equal(mustIncludeFlush.promptBudgetEnforcement.omittedBlockCount, 0);
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node tools/scripts/test-lens-prompt-budget-lane-contracts.mjs
```

Expected: FAIL because `foreground-quest` is filtered as `budget-exceeded`.

- [ ] **Step 3: Preserve must-include blocks in final filtering**

In `src/runtime/lens-prompt-scheduler.mjs`, replace the block loop inside `applyPromptBudgetTraceToPacket(...)` with this shape:

```js
  const includedBlocks = [];
  const omittedBlocks = [];
  const mustIncludeOverBudgetBlocks = [];
  for (const block of blocks) {
    const keys = blockMatchKeys(block);
    const omittedByBudget = keys.some((key) => omittedKeys.has(key));
    if (omittedByBudget && block.mustInclude === true) {
      mustIncludeOverBudgetBlocks.push(compactObject({
        id: block.id || null,
        promptKey: block.promptKey || null,
        hash: block.hash || block.contentHash || null,
        lane: promptBlockBudgetLane(block),
        reason: 'must-include-over-budget'
      }));
      includedBlocks.push(stripBuildOnlyBlockBudgetFields(block));
      continue;
    }
    if (omittedByBudget) {
      omittedBlocks.push(compactObject({
        id: block.id || null,
        promptKey: block.promptKey || null,
        hash: block.hash || block.contentHash || null,
        lane: promptBlockBudgetLane(block),
        omissionReason: 'budget-exceeded'
      }));
      continue;
    }
    includedBlocks.push(stripBuildOnlyBlockBudgetFields(block));
  }
```

Then update the enforcement object status:

```js
  const enforcement = compactObject({
    kind: 'directive.lensPromptBudgetEnforcement.v1',
    schemaVersion: 1,
    status: blockingLanes.length
      ? 'blocked'
      : (mustIncludeOverBudgetBlocks.length ? 'mustIncludeOverBudget' : (omittedBlocks.length ? 'filtered' : 'pass')),
    originalBlockCount: blocks.length,
    includedBlockCount: includedBlocks.length,
    omittedBlockCount: omittedBlocks.length,
    omittedBlocks,
    mustIncludeOverBudgetBlocks,
    blockingLanes
  });
```

- [ ] **Step 4: Verify existing context budget expectations still hold**

Run:

```powershell
node tools/scripts/test-lens-prompt-budget-lane-contracts.mjs
node tools/scripts/test-open-world-context-budget.mjs
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/runtime/lens-prompt-scheduler.mjs tools/scripts/test-lens-prompt-budget-lane-contracts.mjs
git commit -m "fix: preserve mandatory prompt blocks"
```

---

### Task 2: Strengthen Host-Continuation Prompt Readiness

**Files:**
- Modify: `src/runtime/lens-prompt-scheduler.mjs`
- Modify: `src/runtime/response-dispatcher.mjs` if needed only to report the expanded missing keys already returned by readiness.
- Test: `tools/scripts/test-prompt-dirty-domains.mjs`
- Test: `tools/scripts/test-response-dispatcher-core-bridge.mjs`

**Interfaces:**
- Consumes: final installed prompt keys.
- Produces: `REQUIRED_HOST_CONTINUE_PROMPT_KEYS` that include active-scene and foreground assignment context.

- [ ] **Step 1: Update readiness tests to require active-scene context**

In `tools/scripts/test-prompt-dirty-domains.mjs`, replace the required-key assertion near the visible flush with:

```js
assert.deepEqual(visibleFlush.installed.requiredPromptKeys, [
  'directive.contract',
  'directive.campaign.player-character',
  'directive.campaign.turn-yield',
  'directive.campaign.immediate-scene',
  'directive.campaign.foreground-quest'
]);
assert.equal(visibleFlush.installed.promptKeys.includes('directive.campaign.immediate-scene'), true);
assert.equal(visibleFlush.installed.promptKeys.includes('directive.campaign.foreground-quest'), true);
```

In `tools/scripts/test-response-dispatcher-core-bridge.mjs`, add a second missing-key assertion to the prompt gate test:

```js
assert.equal(promptGateResult.promptReadiness.missingRequiredPromptKeys.includes('directive.campaign.foreground-quest'), true);
assert.equal(promptGateDiagnostics.at(-1).missingRequiredPromptKeys.includes('directive.campaign.foreground-quest'), true);
```

Also update that test's fake readiness object:

```js
promptReadiness: async () => ({
  ok: false,
  requiredPromptKeysPresent: false,
  promptKeys: ['directive.contract', 'directive.campaign.player-character'],
  missingRequiredPromptKeys: ['directive.campaign.turn-yield', 'directive.campaign.foreground-quest'],
  directiveOwnedRevision: 7,
  reason: 'missing-required-prompt-keys'
}),
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
node tools/scripts/test-prompt-dirty-domains.mjs
node tools/scripts/test-response-dispatcher-core-bridge.mjs
```

Expected: FAIL because active-scene/foreground keys are not required yet.

- [ ] **Step 3: Expand required host-continuation keys**

In `src/runtime/lens-prompt-scheduler.mjs`, replace `REQUIRED_HOST_CONTINUE_PROMPT_KEYS` with:

```js
export const REQUIRED_HOST_CONTINUE_PROMPT_KEYS = Object.freeze([
  'directive.contract',
  'directive.campaign.player-character',
  'directive.campaign.turn-yield',
  'directive.campaign.immediate-scene',
  'directive.campaign.foreground-quest'
]);
```

- [ ] **Step 4: Verify prompt readiness blocks unsafe host release**

Run:

```powershell
node tools/scripts/test-prompt-dirty-domains.mjs
node tools/scripts/test-response-dispatcher-core-bridge.mjs
```

Expected: both PASS. The dispatcher test must prove `continueHostGeneration` is not called when `foreground-quest` is missing.

- [ ] **Step 5: Commit**

```powershell
git add src/runtime/lens-prompt-scheduler.mjs tools/scripts/test-prompt-dirty-domains.mjs tools/scripts/test-response-dispatcher-core-bridge.mjs
git commit -m "fix: require active scene for host continuation"
```

---

### Task 3: Add Player-Safe Mission Guardrail Prompt Blocks

**Files:**
- Modify: `src/context/scene-pacing-guidance.mjs`
- Modify: `src/context/context-orchestrator.mjs`
- Test: `tools/scripts/test-open-world-context-budget.mjs`
- Test: `tools/scripts/test-player-safe-prompt-context.mjs`

**Interfaces:**
- Consumes:
  - `campaignState.mission.activeMissionId`
  - `campaignState.mission.activePhaseId`
  - `packageData.manifest.id`
- Produces:
  - `missionGuardrailGuidance({ campaignState, packageData, scene }): { id, title, lines } | null`
  - prompt block `directive.campaign.mission-guardrails`

- [ ] **Step 1: Add failing context assertions**

In `tools/scripts/test-open-world-context-budget.mjs`, after the existing block presence assertions, add:

```js
const guardrailBlock = plan.blocks.find((block) => block.id === 'mission-guardrails');
assert(guardrailBlock, 'Ashes context plan must include a mission guardrail block.');
assert.equal(guardrailBlock.promptKey, 'directive.campaign.mission-guardrails');
assert.equal(guardrailBlock.mustInclude, true);
assert.equal(plan.text.includes('Keep Hesperus focused on rescue, repair limits, passenger safety, and accountability.'), true);
assert.equal(plan.text.includes('Pale Lantern'), false, 'Mission guardrail prompt must not expose hidden conspiracy labels.');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools/scripts/test-open-world-context-budget.mjs
```

Expected: FAIL because no `mission-guardrails` block exists.

- [ ] **Step 3: Add mission guardrail guidance helper**

In `src/context/scene-pacing-guidance.mjs`, add these helpers before `scenePacingGuidance(...)`:

```js
export function missionGuardrailGuidance({
  campaignState,
  packageData = null,
  scene = null
} = {}) {
  const missionId = activeMissionId(campaignState, scene);
  const phaseId = activePhaseId(campaignState, scene);
  if (!isAshesOfPeace(packageData) || missionId !== 'prelude-a-ship-underway') return null;
  if (phaseId !== 'hesperus-diversion' && phaseId !== 'hesperus-aftermath') return null;
  return {
    id: 'mission-guardrails',
    title: 'Mission Guardrails',
    lines: [
      'Keep Hesperus focused on rescue, repair limits, passenger safety, and accountability.',
      'Treat theft, piracy, sabotage, or wider plot explanations as unconfirmed hypotheses unless visible evidence has established them.',
      'Do not escalate Hesperus into a new conspiracy, combat encounter, or unrelated anomaly.',
      'If evidence is incomplete, let officers frame uncertainty and next safe checks rather than declaring a hidden cause.'
    ]
  };
}
```

- [ ] **Step 4: Emit the prompt block from context orchestration**

In `src/context/context-orchestrator.mjs`, import the helper:

```js
  missionGuardrailGuidance,
```

Inside `buildCandidates(...)`, after `yieldGuidance`, add:

```js
  const missionGuardrails = missionGuardrailGuidance({
    campaignState: state,
    packageData,
    scene
  });
```

Then add this candidate after `turn-yield` and before `replyHeaderBlock`:

```js
    normalizeCandidate(state, missionGuardrails ? {
      id: 'mission-guardrails',
      title: 'Mission Guardrails',
      mustInclude: true,
      salienceScore: 100,
      placement: 'inPrompt',
      depth: 0,
      ttl: 'scene',
      priority: 997,
      lensPromptBudgetLane: 'stableRules',
      reason: 'The host model must preserve the active mission boundary during continuation.',
      sourceIds: [state?.mission?.activeMissionId, state?.mission?.activePhaseId].filter(Boolean),
      content: list(missionGuardrails.lines)
    } : null),
```

- [ ] **Step 5: Verify guardrail is injected and player-safe**

Run:

```powershell
node tools/scripts/test-open-world-context-budget.mjs
node tools/scripts/test-player-safe-prompt-context.mjs
```

Expected: both PASS. The context text includes Hesperus surface guardrails and does not include hidden campaign labels.

- [ ] **Step 6: Commit**

```powershell
git add src/context/scene-pacing-guidance.mjs src/context/context-orchestrator.mjs tools/scripts/test-open-world-context-budget.mjs tools/scripts/test-player-safe-prompt-context.mjs
git commit -m "fix: inject mission guardrails into host prompt"
```

---

### Task 4: Route Phase-Changing Montages Through Directive Review

**Files:**
- Modify: `src/adjudication/utility-turn-classifier.mjs`
- Modify: `src/adjudication/utility-turn-arbiter.mjs`
- Modify: `src/runtime/chat-turn-orchestrator.mjs` only if the classifier/arbiter decision needs a new local route handler.
- Test: `tools/scripts/test-turn-intent-classifier-fixtures.mjs`
- Test: `tools/scripts/test-chat-turn-orchestrator.mjs`

**Interfaces:**
- Consumes: player text and current mission context.
- Produces: a route that does not use plain `hostContinue` when player text compresses days, jumps phases, or introduces a new mission trigger.

- [ ] **Step 1: Add classifier fixture for the live failure shape**

In `tests/fixtures/classifier/turn-intent-language.fixture.json`, add a fixture entry in the host-continuation/routing section:

```json
{
  "id": "ashes-prelude-week-montage-distress-signal",
  "text": "The week took on its own rhythm. Day One, engineering traced the relay issue. Day Two, the crew settled into a new schedule. Then Nayar picked up a civilian distress signal and Sam asked her to clean it up.",
  "expected": {
    "classification": "sceneNavigation",
    "responseStrategy": "directivePosted",
    "workerPlan": {
      "promptUpdate": true
    }
  }
}
```

If this fixture file uses a different exact schema for expectations, mirror the nearest existing `sceneNavigation` fixture and keep the same id/text.

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools/scripts/test-turn-intent-classifier-fixtures.mjs
```

Expected: FAIL because the text is classified as ordinary host continuation.

- [ ] **Step 3: Add deterministic montage/phase-jump detection**

In `src/adjudication/utility-turn-classifier.mjs`, add this helper near existing deterministic classifiers:

```js
function looksLikePhaseChangingMontage(normalized = '') {
  const text = String(normalized || '').trim();
  if (!text) return false;
  const hasDaySequence = /\bday\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i.test(text);
  const hasWeekMontage = /\b(?:the\s+)?week\s+(?:took|settled|passed|moved|went)\b/i.test(text);
  const hasNewMissionTrigger = /\b(?:distress\s+signal|distress\s+beacon|new\s+contact|incoming\s+hail|emergency\s+signal)\b/i.test(text);
  const hasCompressionVerb = /\b(?:montage|summarize|fast[-\s]?forward|days?\s+passed|over\s+the\s+next)\b/i.test(text);
  return (hasDaySequence || hasWeekMontage || hasCompressionVerb) && hasNewMissionTrigger;
}
```

Then in the deterministic classification path, before ordinary `sceneColor` / `hostContinue`, add:

```js
  if (looksLikePhaseChangingMontage(normalized)) {
    return {
      classification: 'sceneNavigation',
      responseStrategy: 'directivePosted',
      confidence: 0.86,
      ambiguity: 'medium',
      action: 'review phase-changing montage before continuing',
      target: 'active mission phase',
      workerPlan: {
        promptUpdate: true,
        narrator: false,
        mission: true,
        continuity: true,
        ship: true,
        commandBearing: false
      },
      reasons: [
        'Player text compresses elapsed campaign time and introduces a new operational trigger.'
      ]
    };
  }
```

- [ ] **Step 4: Add an orchestrator regression for no host release**

In `tools/scripts/test-chat-turn-orchestrator.mjs`, add a focused fake-host case near existing host-continuation routing tests:

```js
const montageHostReleases = [];
const montageHost = createFakeDirectiveHost({
  chatId: 'ashes-montage-chat',
  continueHostGeneration: async () => {
    montageHostReleases.push('released');
    return { released: true };
  }
});
let montageState = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
montageState.campaign = { ...montageState.campaign, id: 'campaign-ashes-montage' };
montageState.campaignChatBinding = {
  hostId: 'fake',
  chatId: 'ashes-montage-chat',
  campaignId: 'campaign-ashes-montage',
  saveId: 'save-ashes-montage',
  status: 'bound'
};
const montageOrchestrator = createChatTurnOrchestrator({
  host: montageHost,
  getCampaignState: () => montageState,
  setCampaignState: (next) => { montageState = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { montageState = initializeCampaignRuntimeTracking(next); },
  now
});
const montageResult = await montageOrchestrator.observePlayerMessage({
  chatId: 'ashes-montage-chat',
  hostMessageId: 'player-montage-1',
  isUser: true,
  text: 'The week took on its own rhythm. Day One, Engineering handled the relay issue. Then Nayar picked up a civilian distress signal.'
});
assert.notEqual(montageResult.responseStrategy, 'injectAndContinue');
assert.equal(montageHostReleases.length, 0);
```

If `createFakeDirectiveHost` is not available in this test file, use the existing fake host factory already used by neighboring orchestrator tests and keep the assertion on `continueHostGeneration` calls.

- [ ] **Step 5: Verify routing**

Run:

```powershell
node tools/scripts/test-turn-intent-classifier-fixtures.mjs
node tools/scripts/test-chat-turn-orchestrator.mjs
```

Expected: both PASS. The montage/new-trigger text does not release host continuation.

- [ ] **Step 6: Commit**

```powershell
git add src/adjudication/utility-turn-classifier.mjs tests/fixtures/classifier/turn-intent-language.fixture.json tools/scripts/test-turn-intent-classifier-fixtures.mjs tools/scripts/test-chat-turn-orchestrator.mjs
git commit -m "fix: route phase jumps through directive"
```

---

### Task 5: Review Host-Native Completions For Mission-Guardrail Violations

**Files:**
- Modify: `src/continuity/contradiction-guard.mjs`
- Modify: `src/runtime/source-reconciliation-engine.mjs` if the guard helper is kept separate from continuity facts.
- Test: `tools/scripts/test-continuity-contradiction-guard.mjs`
- Test: `tools/scripts/test-response-dispatcher-core-bridge.mjs`

**Interfaces:**
- Consumes:
  - generated host-native text
  - `campaignState.mission.activeMissionId`
  - `campaignState.mission.activePhaseId`
  - `packageData.manifest.id`
- Produces: continuity review findings with `kind: 'mission-guardrail-violation'` and `severity: 'blocker'`.

- [ ] **Step 1: Add failing mission-guardrail tests**

In `tools/scripts/test-continuity-contradiction-guard.mjs`, add:

```js
const hesperusState = {
  mission: {
    activeMissionId: 'prelude-a-ship-underway',
    activePhaseId: 'hesperus-diversion'
  }
};

function reviewHesperus(text) {
  return reviewContinuityContradictions({
    text,
    campaignState: hesperusState,
    packageData
  });
}

const pirateAssertionReview = reviewHesperus([
  'Bronn folded his arms. "Pirates took the Hesperus cargo; that much is clear."',
  'Whitaker nodded and ordered pursuit of the raiders.'
].join(' '));
assert.equal(pirateAssertionReview.ok, false);
assert(pirateAssertionReview.findings.some((finding) => finding.kind === 'mission-guardrail-violation'));

const cautiousHypothesisReview = reviewHesperus([
  'Bronn folded his arms. "Piracy is one possibility, but the evidence is not there yet."',
  'Whitaker ordered the crew to keep the Hesperus rescue and repair assessment first.'
].join(' '));
assert.equal(cautiousHypothesisReview.ok, true);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools/scripts/test-continuity-contradiction-guard.mjs
```

Expected: FAIL because the review does not detect mission guardrail violations.

- [ ] **Step 3: Add mission guardrail findings**

In `src/continuity/contradiction-guard.mjs`, add:

```js
function isAshesHesperus(campaignState = {}, packageData = null) {
  const packageId = compact(packageData?.manifest?.id || packageData?.id);
  const missionId = compact(campaignState?.mission?.activeMissionId);
  const phaseId = compact(campaignState?.mission?.activePhaseId || campaignState?.mission?.phase);
  return packageId === 'directive:campaign-package:breckenridge-ashes-of-peace'
    && missionId === 'prelude-a-ship-underway'
    && (phaseId === 'hesperus-diversion' || phaseId === 'hesperus-aftermath');
}

function missionGuardrailFindings(text, campaignState, packageData) {
  if (!isAshesHesperus(campaignState, packageData)) return [];
  const normalized = String(text || '').replace(/\s+/g, ' ');
  const assertsPiracy = /\b(?:pirates?|raiders?)\b.{0,120}\b(?:took|stole|hit|robbed|attacked|forced|ambushed)\b/i.test(normalized)
    || /\b(?:cargo|grain|shipment)\b.{0,120}\b(?:was|were)\s+(?:stolen|taken)\b/i.test(normalized);
  const marksSpeculation = /\b(?:maybe|possibly|could|might|hypothesis|unconfirmed|not\s+there\s+yet|one\s+possibility)\b/i.test(normalized);
  if (assertsPiracy && !marksSpeculation) {
    return [{
      kind: 'mission-guardrail-violation',
      factId: 'ashes.prelude.hesperus.ordinary-rescue-guardrail',
      severity: 'blocker',
      summary: 'Generated text asserts piracy, theft, or raider causality as fact during Hesperus instead of preserving it as unconfirmed speculation.'
    }];
  }
  const assertsSabotage = /\b(?:sabotage|conspiracy|inside\s+job|secret\s+plot|trap)\b/i.test(normalized)
    && !marksSpeculation;
  if (assertsSabotage) {
    return [{
      kind: 'mission-guardrail-violation',
      factId: 'ashes.prelude.hesperus.ordinary-rescue-guardrail',
      severity: 'blocker',
      summary: 'Generated text escalates Hesperus into sabotage or conspiracy without player-visible support.'
    }];
  }
  return [];
}
```

Then include it in `reviewContinuityContradictions(...)`:

```js
  const findings = [
    ...speciesFindings(text, factIndex.facts, packageData),
    ...ageFindings(text, factIndex.facts, packageData),
    ...uniformDivisionFindings(text, factIndex.facts, packageData),
    ...travelFindings(text, factIndex.facts),
    ...missionGuardrailFindings(text, campaignState, packageData)
  ];
```

- [ ] **Step 4: Add response-dispatcher recovery proof**

In `tools/scripts/test-response-dispatcher-core-bridge.mjs`, add a fake host-native completion case modeled on the existing host-native continuity contradiction test, but use Hesperus state and text:

```js
const hesperusViolationResponses = [];
const hesperusViolationHost = {
  chat: {
    async continueHostGeneration({ onHostGenerationObserved }) {
      const observedMessage = {
        hostMessageId: 'assistant-hesperus-violation',
        index: 12,
        text: 'Bronn folded his arms. "Pirates took the Hesperus cargo; that much is clear." Whitaker ordered pursuit of the raiders.'
      };
      if (typeof onHostGenerationObserved === 'function') {
        await onHostGenerationObserved(observedMessage);
      }
      return {
        released: true,
        observedMessage,
        hostGenerationReleasedAt: '2026-07-09T12:10:00.000Z'
      };
    }
  }
};
let hesperusViolationState = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
hesperusViolationState.campaign = {
  ...hesperusViolationState.campaign,
  id: 'campaign-hesperus-violation'
};
hesperusViolationState.mission = {
  ...hesperusViolationState.mission,
  activeMissionId: 'prelude-a-ship-underway',
  activePhaseId: 'hesperus-diversion',
  phase: 'hesperus-diversion'
};
const hesperusViolationStore = {
  async advanceTurn(transactionId, patch = {}) {
    return { id: transactionId, phase: patch.phase || 'hostContinueReleased', route: patch.route || 'hostContinue' };
  },
  async markRecoveryRequired(transactionId, recoveryBundle = {}) {
    hesperusViolationResponses.push({ transactionId, recoveryBundle: cloneJson(recoveryBundle) });
    return { recoveryCaseId: `recovery:${transactionId}`, status: 'recorded', reason: recoveryBundle.reason || null };
  },
  async readProjections() {
    return {
      ingressLedger: [{
        id: 'ingress-hesperus-violation',
        ingressId: 'ingress-hesperus-violation',
        transactionId: 'txn-hesperus-violation',
        coreTransactionId: 'txn-hesperus-violation',
        status: 'sourceObserved'
      }],
      responseLedger: [],
      recoveryJournal: []
    };
  }
};
const hesperusViolationDispatcher = createResponseDispatcher({
  host: hesperusViolationHost,
  coreTurnStore: hesperusViolationStore,
  getCampaignState: () => hesperusViolationState,
  setCampaignState: (next) => { hesperusViolationState = initializeCampaignRuntimeTracking(next); },
  persist: async (next) => { hesperusViolationState = initializeCampaignRuntimeTracking(next); },
  now
});
const hesperusViolationResult = await hesperusViolationDispatcher.dispatch({
  campaignState: hesperusViolationState,
  ingressId: 'ingress-hesperus-violation',
  strategy: 'injectAndContinue',
  responseKind: 'hostGeneration',
  packageData
});
assert.equal(hesperusViolationResult.ok, false);
assert.equal(hesperusViolationResult.recoveryRequired, true);
assert.equal(
  hesperusViolationResult.continuityReview.findings.some((finding) => finding.kind === 'mission-guardrail-violation'),
  true
);
```

- [ ] **Step 5: Verify guardrail recovery**

Run:

```powershell
node tools/scripts/test-continuity-contradiction-guard.mjs
node tools/scripts/test-response-dispatcher-core-bridge.mjs
```

Expected: both PASS. A host-native Hesperus piracy assertion creates recovery instead of being treated as clean completion.

- [ ] **Step 6: Commit**

```powershell
git add src/continuity/contradiction-guard.mjs tools/scripts/test-continuity-contradiction-guard.mjs tools/scripts/test-response-dispatcher-core-bridge.mjs
git commit -m "fix: review mission guardrail violations"
```

---

## Integration Verification

- [ ] **Step 1: Run focused prompt and routing tests**

```powershell
node tools/scripts/test-lens-prompt-budget-lane-contracts.mjs
node tools/scripts/test-open-world-context-budget.mjs
node tools/scripts/test-prompt-dirty-domains.mjs
node tools/scripts/test-turn-intent-classifier-fixtures.mjs
node tools/scripts/test-continuity-contradiction-guard.mjs
node tools/scripts/test-response-dispatcher-core-bridge.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run the relevant runtime lifecycle checks**

```powershell
node tools/scripts/test-player-safe-prompt-context.mjs
node tools/scripts/test-chat-turn-orchestrator.mjs
node tools/scripts/test-sillytavern-runtime-lifecycle.mjs
```

Expected: all PASS.

- [ ] **Step 3: Run alpha gate**

```powershell
node tools/scripts/run-alpha-gate.mjs
```

Expected: PASS. If the command times out, rerun with a longer timeout before treating it as a regression.

- [ ] **Step 4: Live proof on default-user Ashes**

Before trusting live behavior, sync or verify the installed SillyTavern extension copy. Then open the latest bound Ashes chat and inspect `host.prompt.inspect().blocks`.

Required live evidence:

```js
const keys = host.prompt.inspect().blocks.map((block) => block.promptKey);
[
  'directive.contract',
  'directive.campaign.player-character',
  'directive.campaign.turn-yield',
  'directive.campaign.immediate-scene',
  'directive.campaign.foreground-quest',
  'directive.campaign.mission-guardrails'
].forEach((key) => console.assert(keys.includes(key), `missing ${key}`));
```

Then send a bounded Hesperus follow-up that invites uncertainty, not a new fact:

```text
"Let's keep piracy as a hypothesis, not a conclusion. Nayar, prioritize passenger risk and the repair picture. Bronn, keep a quiet security watch for evidence, not assumptions."
```

Expected live result:

- Host continuation yields after one playable beat.
- The reply treats piracy as unconfirmed.
- Hesperus remains framed around rescue, repair limits, passenger safety, and accountability.
- Prompt diagnostics show no omitted `foreground-quest`, `immediate-scene`, `turn-yield`, or `mission-guardrails` block.

---

## Self-Review

- Spec coverage:
  - Fix 1 is covered by Task 1.
  - Fix 2 is covered by Task 2.
  - Fix 3 is covered by Task 3.
  - Fix 4 is covered by Task 4.
  - Fix 5 is covered by Task 5.
- Placeholder scan:
  - The plan contains no deferred implementation placeholders.
  - The one schema note in Task 4 instructs the implementer to mirror an existing fixture only if the current fixture file has a stricter schema; the required id, text, and expected route remain explicit.
- Type consistency:
  - `missionGuardrailGuidance(...)` is defined in Task 3 before `context-orchestrator.mjs` consumes it.
  - `REQUIRED_HOST_CONTINUE_PROMPT_KEYS` remains the single readiness source consumed by scheduler and dispatcher tests.
  - `mission-guardrail-violation` findings use the same `findings[]` shape already consumed by host-native continuity recovery.
