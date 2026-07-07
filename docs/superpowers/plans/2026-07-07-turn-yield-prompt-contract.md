# Turn Yield Prompt Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep host-continuation replies tight enough for player agency by adding a mandatory turn-yield contract plus a dynamic per-turn yield block before `injectAndContinue` releases host generation.

**Architecture:** Extend the existing prompt-context path instead of adding a post-generation rewrite pass. `scene-pacing-guidance.mjs` owns reusable turn-yield lines, `context-orchestrator.mjs` emits a mandatory `turn-yield` prompt block, and LENS/dispatcher readiness treats that block as required for host continuation.

**Tech Stack:** Node.js ES modules, Directive LENS prompt scheduler, SillyTavern prompt adapter, built-in `node:assert/strict` script tests.

## Global Constraints

- Pre-alpha compatibility rule: update current contracts in place; do not preserve stale prompt contracts.
- Normal live host-continuation replies default to 80-140 words.
- Host continuation should advance one immediate beat and yield at the first meaningful player opportunity.
- Do not add a post-generation watchdog in this phase.
- Do not lower provider token limits as the primary fix; prompt behavior must carry the pacing rule.
- Required host-continuation prompt keys after this change: `directive.contract`, `directive.campaign.player-character`, `directive.campaign.turn-yield`.

---

## File Structure

- Modify `src/context/scene-pacing-guidance.mjs`
  - Owns global location pacing lines and new turn-yield contract helpers.
  - New exports:
    - `turnYieldContractLines(): string[]`
    - `turnYieldGuidance(input): { id: string, title: string, lines: string[] }`
    - `turnYieldLines(input): string[]`

- Modify `src/context/context-orchestrator.mjs`
  - Passes `playerText` into context candidate construction.
  - Emits mandatory `turn-yield` prompt block with prompt key `directive.campaign.turn-yield`.

- Modify `src/generation/player-safe-prompt-context-builder.mjs`
  - Passes existing `playerText` into `buildContextPlan(...)`.

- Modify `src/runtime/lens-prompt-scheduler.mjs`
  - Adds `directive.campaign.turn-yield` to `REQUIRED_HOST_CONTINUE_PROMPT_KEYS`.

- Modify `src/runtime/lens-prompt-scheduler-synthetic.mjs`
  - No behavior change beyond consuming the updated required-key list.
  - Test fixtures must include the new key when they expect readiness.

- Modify tests:
  - `tools/scripts/test-player-safe-prompt-context.mjs`
  - `tools/scripts/test-prompt-dirty-domains.mjs`
  - `tools/scripts/test-response-dispatcher-core-bridge.mjs`
  - `tools/scripts/test-chat-turn-orchestrator.mjs` only if route-level regression coverage needs an end-to-end host-continue fixture.

---

### Task 1: Add Turn-Yield Guidance Helpers

**Files:**
- Modify: `src/context/scene-pacing-guidance.mjs`
- Test through: `tools/scripts/test-player-safe-prompt-context.mjs`

**Interfaces:**
- Consumes:
  - `campaignState.player.name`, `campaignState.player.rank`, `scene.presentCharacterIds`, `playerText`
- Produces:
  - `turnYieldContractLines(): string[]`
  - `turnYieldGuidance({ campaignState, packageData, scene, playerText }): { id, title, lines }`
  - `turnYieldLines(input): string[]`

- [ ] **Step 1: Add failing assertions for turn-yield contract lines**

Append these assertions after the existing global pacing assertions in `tools/scripts/test-player-safe-prompt-context.mjs`:

```js
assert.equal(packetJson.includes('Default live reply length: 80-140 words.'), true);
assert.equal(packetJson.includes('Advance exactly one immediate playable beat, then yield.'), true);
assert.equal(packetJson.includes('End at the first meaningful opportunity for the player character to speak, observe, or act.'), true);
assert.equal(packetJson.includes('Do not continue into the next briefing, strategy handoff, relationship calibration, location purpose, or consequence chain unless the player explicitly asks to cut or summarize.'), true);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools/scripts/test-player-safe-prompt-context.mjs
```

Expected: FAIL because the turn-yield contract text is not in the prompt packet.

- [ ] **Step 3: Add helper exports**

Add this code in `src/context/scene-pacing-guidance.mjs` after `GLOBAL_SCENE_PACING_LINES`:

```js
const TURN_YIELD_CONTRACT_LINES = Object.freeze([
  'Default live reply length: 80-140 words.',
  'Use one or two short paragraphs for normal host-continuation replies.',
  'Advance exactly one immediate playable beat, then yield.',
  'Let at most one NPC take initiative before yielding unless the player asked for a cut, montage, or summary.',
  'End at the first meaningful opportunity for the player character to speak, observe, or act.',
  'Do not continue into the next briefing, strategy handoff, relationship calibration, location purpose, or consequence chain unless the player explicitly asks to cut or summarize.'
]);

function compactPlayerText(value = '', maxLength = 180) {
  const text = compact(value).replace(/\s+/g, ' ');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function playerAddress(campaignState = {}) {
  const player = campaignState?.player || {};
  const rank = compact(player.rank);
  const name = compact(player.name || player.characterName || player.id || 'the player character');
  return compact(`${rank ? `${rank} ` : ''}${name}`) || 'the player character';
}

export function turnYieldContractLines() {
  return [...TURN_YIELD_CONTRACT_LINES];
}

export function turnYieldGuidance({
  campaignState,
  packageData = null,
  scene = null,
  playerText = ''
} = {}) {
  const addressedPlayer = playerAddress(campaignState);
  const lastAction = compactPlayerText(playerText);
  return {
    id: 'turn-yield',
    title: 'Turn Yield Contract',
    lines: [
      ...turnYieldContractLines(),
      `Yield target: ${addressedPlayer}.`,
      lastAction ? `Player's latest action: ${lastAction}` : null,
      lastAction && /\?/.test(lastAction)
        ? 'If the player asked a direct question, answer that question briefly, then yield.'
        : 'If the player made a command or approach, show the immediate response to that action, then yield.',
      isAshesOfPeace(packageData) && activeMissionId(campaignState, scene) === 'prelude-a-ship-underway'
        ? 'For Ashes of Peace opening play, do not compress arrival, Bronn handoff, Whitaker handoff, and Reach strategy into one reply.'
        : null
    ].filter(Boolean)
  };
}

export function turnYieldLines(input = {}) {
  return turnYieldGuidance(input).lines;
}
```

- [ ] **Step 4: Run test to verify helper text is still missing from packet**

Run:

```powershell
node tools/scripts/test-player-safe-prompt-context.mjs
```

Expected: still FAIL because helpers exist but no prompt block consumes them yet.

- [ ] **Step 5: Commit helper-only slice**

```powershell
git add src/context/scene-pacing-guidance.mjs tools/scripts/test-player-safe-prompt-context.mjs
git commit -m "test: specify turn yield prompt contract"
```

Expected: commit succeeds with failing test intentionally staged only if following strict red-green branch practice. If the team avoids commits with failing tests, skip this commit and include the helper in Task 2 commit.

---

### Task 2: Emit Mandatory `turn-yield` Prompt Block

**Files:**
- Modify: `src/context/context-orchestrator.mjs`
- Modify: `src/generation/player-safe-prompt-context-builder.mjs`
- Test: `tools/scripts/test-player-safe-prompt-context.mjs`

**Interfaces:**
- Consumes:
  - `turnYieldGuidance({ campaignState, packageData, scene, playerText })`
  - `buildContextPlan({ ..., playerText })`
- Produces:
  - Host prompt block:
    - `id: 'turn-yield'`
    - `promptKey: 'directive.campaign.turn-yield'`
    - `mustInclude: true`
    - `lensPromptBudgetLane: 'activeScene'`

- [ ] **Step 1: Add failing block assertions**

In `tools/scripts/test-player-safe-prompt-context.mjs`, after the `playerCharacterBlock` assertions, add:

```js
const turnYieldBlock = packet.blocks.find((block) => block.id === 'turn-yield');
assert.equal(Boolean(turnYieldBlock), true, 'Prompt packet must include a mandatory turn-yield block.');
assert.equal(turnYieldBlock.promptKey, 'directive.campaign.turn-yield');
assert.equal(turnYieldBlock.mustInclude, true);
assert.equal(turnYieldBlock.lensPromptBudgetLane, 'activeScene');
assert.equal(turnYieldBlock.content.includes('Default live reply length: 80-140 words.'), true);
assert.equal(turnYieldBlock.content.includes('Yield target: Commander Serrin.'), true);
```

Add a Sam-specific assertion after `samVickersPlayerBlock`:

```js
const samVickersYieldBlock = samVickersPacket.blocks.find((block) => block.id === 'turn-yield');
assert.equal(samVickersYieldBlock.promptKey, 'directive.campaign.turn-yield');
assert.equal(samVickersYieldBlock.content.includes('Yield target: Commander Sam Vickers.'), true);
assert.equal(samVickersYieldBlock.content.includes('do not compress arrival, Bronn handoff, Whitaker handoff, and Reach strategy into one reply'), true);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tools/scripts/test-player-safe-prompt-context.mjs
```

Expected: FAIL because no `turn-yield` block exists.

- [ ] **Step 3: Pass `playerText` through context plan**

In `src/generation/player-safe-prompt-context-builder.mjs`, change the `buildContextPlan` call:

```js
const plan = buildContextPlan({
  campaignState,
  packageData,
  crewDataset,
  shipDataset,
  scene: scene || {},
  playerText,
  recentMessageSummary,
  createdAt,
  relevantCrewIds
});
```

In `src/context/context-orchestrator.mjs`, update signatures:

```js
function buildCandidates({ state, packageData, crewDataset, scene = {}, playerText = '', recentMessageSummary = null }) {
```

```js
export function buildContextPlan({
  campaignState,
  packageData,
  crewDataset = null,
  scene = {},
  playerText = '',
  recentMessageSummary = null,
  createdAt = null
} = {}) {
```

and pass `playerText` into `buildCandidates(...)`.

- [ ] **Step 4: Import and emit the prompt block**

Update the import in `src/context/context-orchestrator.mjs`:

```js
import {
  globalScenePacingLines,
  scenePacingGuidance,
  turnYieldGuidance
} from './scene-pacing-guidance.mjs';
```

Inside `buildCandidates(...)`, after `const pacingLines = ...`, add:

```js
const yieldGuidance = turnYieldGuidance({
  campaignState: state,
  packageData,
  scene,
  playerText
});
```

Add this candidate immediately after the `player-character` block and before `replyHeaderBlock`:

```js
normalizeCandidate(state, {
  id: 'turn-yield',
  title: 'Turn Yield Contract',
  mustInclude: true,
  salienceScore: 100,
  placement: 'inPrompt',
  depth: 0,
  ttl: 'turn',
  priority: 998,
  lensPromptBudgetLane: 'activeScene',
  reason: 'The host model must stop after one playable beat and yield agency back to the player.',
  content: list(yieldGuidance.lines)
}),
```

- [ ] **Step 5: Run prompt-context test**

Run:

```powershell
node tools/scripts/test-player-safe-prompt-context.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit prompt block slice**

```powershell
git add src/context/scene-pacing-guidance.mjs src/context/context-orchestrator.mjs src/generation/player-safe-prompt-context-builder.mjs tools/scripts/test-player-safe-prompt-context.mjs
git commit -m "fix: add turn yield prompt block"
```

Expected: commit succeeds.

---

### Task 3: Require Turn-Yield Readiness Before Host Continue

**Files:**
- Modify: `src/runtime/lens-prompt-scheduler.mjs`
- Modify: `tools/scripts/test-prompt-dirty-domains.mjs`
- Modify: `tools/scripts/test-response-dispatcher-core-bridge.mjs`

**Interfaces:**
- Consumes:
  - `REQUIRED_HOST_CONTINUE_PROMPT_KEYS`
  - response dispatcher `promptReadiness` callback
- Produces:
  - Host continue readiness blocks release if `directive.campaign.turn-yield` is missing.

- [ ] **Step 1: Update scheduler fixture expectations first**

In `tools/scripts/test-prompt-dirty-domains.mjs`, add this fixture block to the synthetic `blocks` array after `player-character`:

```js
{
  id: 'turn-yield',
  promptKey: 'directive.campaign.turn-yield',
  title: 'Turn Yield Contract',
  text: 'Default live reply length: 80-140 words. Advance exactly one immediate playable beat, then yield.',
  placement: 'inPrompt',
  depth: 0,
  role: 'system'
},
```

Update the required-key assertion:

```js
assert.deepEqual(visibleFlush.installed.requiredPromptKeys, [
  'directive.contract',
  'directive.campaign.player-character',
  'directive.campaign.turn-yield'
]);
assert.equal(visibleFlush.installed.promptKeys.includes('directive.campaign.turn-yield'), true);
```

- [ ] **Step 2: Add dispatcher missing-key regression**

In `tools/scripts/test-response-dispatcher-core-bridge.mjs`, change the prompt readiness fixture near the end:

```js
promptReadiness: async () => ({
  ok: false,
  requiredPromptKeysPresent: false,
  promptKeys: ['directive.contract', 'directive.campaign.player-character'],
  missingRequiredPromptKeys: ['directive.campaign.turn-yield'],
  directiveOwnedRevision: 7,
  reason: 'missing-required-prompt-keys'
}),
```

Change the assertions:

```js
assert.equal(promptGateResult.promptReadiness.missingRequiredPromptKeys[0], 'directive.campaign.turn-yield');
assert.equal(promptGateDiagnostics.at(-1).missingRequiredPromptKeys[0], 'directive.campaign.turn-yield');
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
node tools/scripts/test-prompt-dirty-domains.mjs
node tools/scripts/test-response-dispatcher-core-bridge.mjs
```

Expected: first test FAILS because required keys do not include `directive.campaign.turn-yield`; second test may PASS before implementation because dispatcher trusts the callback, but it should still document the new missing-key behavior.

- [ ] **Step 4: Add required key**

In `src/runtime/lens-prompt-scheduler.mjs`, update:

```js
export const REQUIRED_HOST_CONTINUE_PROMPT_KEYS = Object.freeze([
  'directive.contract',
  'directive.campaign.player-character',
  'directive.campaign.turn-yield'
]);
```

- [ ] **Step 5: Run readiness tests**

Run:

```powershell
node tools/scripts/test-prompt-dirty-domains.mjs
node tools/scripts/test-response-dispatcher-core-bridge.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit readiness slice**

```powershell
git add src/runtime/lens-prompt-scheduler.mjs tools/scripts/test-prompt-dirty-domains.mjs tools/scripts/test-response-dispatcher-core-bridge.mjs
git commit -m "fix: require turn yield before host continue"
```

Expected: commit succeeds.

---

### Task 4: Add Route-Level Regression for One-Beat Yield Prompt

**Files:**
- Modify: `tools/scripts/test-chat-turn-orchestrator.mjs`

**Interfaces:**
- Consumes:
  - Existing `createChatTurnOrchestrator(...)` test harness
  - Existing fake response dispatcher and prompt sync paths
- Produces:
  - Regression proving `injectAndContinue` path can observe required turn-yield prompt readiness before release.

- [ ] **Step 1: Search existing host-generation route fixture**

Run:

```powershell
rg -n "injectAndContinue|hostGeneration|continueHostGeneration|responseKind" tools/scripts/test-chat-turn-orchestrator.mjs
```

Expected: output shows existing host-generation fixtures and fake dispatcher shape.

- [ ] **Step 2: Add assertion to the nearest existing `injectAndContinue` fixture**

In the fixture that dispatches `responseKind: 'hostGeneration'`, add an assertion to the fake prompt state or dispatcher call payload. Use this exact expected key list when the fixture exposes prompt readiness:

```js
assert.deepEqual(hostContinuePromptReadiness.requiredPromptKeys, [
  'directive.contract',
  'directive.campaign.player-character',
  'directive.campaign.turn-yield'
]);
assert.equal(hostContinuePromptReadiness.requiredPromptKeysPresent, true);
```

If the fixture only records dispatched response calls, assert that the host-generation dispatch did not bypass prompt readiness by checking the dispatcher call contains `responseKind: 'hostGeneration'` and that the preceding prompt sync result includes `directive.campaign.turn-yield`.

- [ ] **Step 3: Run route test**

Run:

```powershell
node tools/scripts/test-chat-turn-orchestrator.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit route regression**

```powershell
git add tools/scripts/test-chat-turn-orchestrator.mjs
git commit -m "test: cover turn yield host route"
```

Expected: commit succeeds. If no clean route-level seam exists without brittle test surgery, do not add this commit; document that Task 3 dispatcher coverage is the route boundary and proceed to Task 5.

---

### Task 5: Verification and Live-Proof Prep

**Files:**
- Modify no production files.
- Optional docs update only if user-facing preset docs need to describe the new default reply length.

**Interfaces:**
- Consumes all previous task commits.
- Produces final verification evidence.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
node tools/scripts/test-player-safe-prompt-context.mjs
node tools/scripts/test-prompt-dirty-domains.mjs
node tools/scripts/test-response-dispatcher-core-bridge.mjs
node tools/scripts/test-chat-turn-orchestrator.mjs
```

Expected: all commands exit 0.

- [ ] **Step 2: Run alpha gate**

Run:

```powershell
npm.cmd test
```

Expected: `[alpha-gate] passed 205 checks.` or updated pass count if the gate list changed.

- [ ] **Step 3: Inspect served-copy status before live proof**

Run:

```powershell
git status --short
```

Expected: clean or only intentional uncommitted live-proof artifacts.

If live proof is requested, sync the changed runtime files into the actual served default-user extension copy and hash-check the touched files before judging the SillyTavern behavior. The live served copy previously used this path:

```text
F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive
```

- [ ] **Step 4: Live proof target**

Use the latest default-user Ashes chat and repeat the problematic Bronn handoff. Success criteria:

```text
Bronn addresses Sam Vickers correctly.
Reply is 80-140 words unless the player asked for a cut, montage, or summary.
Reply advances one immediate tactical-handoff beat.
Reply stops before Whitaker handoff, broad Asterion Reach strategy, or another major location/briefing transition.
Reply leaves Sam a clear chance to speak, observe, or act.
```

- [ ] **Step 5: Final commit if Task 4 or docs changed after Task 3**

```powershell
git status --short
git add <changed-files>
git commit -m "test: verify turn yield prompt contract"
```

Expected: commit succeeds only when there are changes.

---

## Self-Review

- Spec coverage: Approach 1 is covered by Task 1 and Task 2 stable turn-yield contract. Approach 2 is covered by Task 2 dynamic per-turn block. Host-readiness enforcement is covered by Task 3. Route regression and gate verification are covered by Tasks 4 and 5.
- Placeholder scan: no incomplete requirements remain; every task has concrete files, code snippets, commands, and expected results.
- Type consistency: required key is consistently named `directive.campaign.turn-yield`; helper exports are consistently named `turnYieldContractLines`, `turnYieldGuidance`, and `turnYieldLines`.
