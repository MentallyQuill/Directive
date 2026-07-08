# Utility Turn Arbiter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace deterministic semantic turn fallback with a blocking Utility Turn Arbiter that chooses turn route and response ownership from source-bound context.

**Architecture:** Add a structured `utilityTurnArbiter` Utility role, parse it into a validated `directive.turnArbiterPlan.v1`, and route chat turns from that plan. Deterministic code remains authoritative for custody, stale-source checks, idempotency, persistence, reducer validation, and recovery, but it no longer commits mission outcomes when Utility semantic interpretation fails.

**Tech Stack:** JavaScript ES modules, Directive runtime/generation router, SillyTavern host adapter, Node test scripts, `npm.cmd test`.

## Global Constraints

- Pre-alpha: no legacy compatibility required when replacing old deterministic behavior.
- Arbiter input must be player-safe and source-bound.
- Arbiter output may propose state intent but may not mutate state directly.
- Hidden state, raw prompts, provider reasoning, cookies, CSRF tokens, API keys, raw relationship values, raw pressure values, and private NPC thoughts must not reach the Arbiter.
- Arbiter failure must not commit deterministic mission mechanics.
- `mustNotReestablish` continuity constraints must reach all visible prose routes.
- Provider transport success is not feature success; JSON parse, schema validation, and route validation must pass.

---

## File Structure

- Create `src/adjudication/utility-turn-arbiter-contract.mjs`
  - Owns route constants, schema normalization, validation, hidden-state leak checks, and failure-plan construction.
- Create `src/adjudication/utility-turn-arbiter.mjs`
  - Builds Arbiter context/prompt, calls `generationRouter.generate('utilityTurnArbiter', request)`, parses structured output, and returns validated plan or conservative failure plan.
- Modify `src/generation/generation-roles.mjs`
  - Adds `utilityTurnArbiter` role.
- Modify `src/generation/model-call-authority-matrix.mjs`
  - Adds authority contract for `utilityTurnArbiter`.
- Modify `src/runtime/runtime-app.mjs`
  - Wires Arbiter into chat-native services and passes it into `createChatTurnOrchestrator`.
- Modify `src/runtime/chat-turn-orchestrator.mjs`
  - Uses Arbiter route before branch handling, removes deterministic committed-outcome fallback, and passes continuity constraints into prompt/narration paths.
- Modify `src/mission/director.mjs`
  - Accepts Arbiter intent/continuity as optional input and stores it in turn packets for narration and Command Log context.
- Modify `src/generation/narration.mjs`
  - Includes Arbiter `mustPreserve` and `mustNotReestablish` in narrator prompt contract.
- Test `tools/scripts/test-generation-router.mjs`
- Test `tools/scripts/test-model-call-authority-matrix.mjs`
- Test `tools/scripts/test-utility-turn-arbiter.mjs`
- Test `tools/scripts/test-chat-turn-orchestrator.mjs`
- Test `tools/scripts/test-chat-native-runtime-flow.mjs`

---

### Task 1: Add Arbiter Role And Contract

**Files:**
- Create: `src/adjudication/utility-turn-arbiter-contract.mjs`
- Modify: `src/generation/generation-roles.mjs`
- Modify: `src/generation/model-call-authority-matrix.mjs`
- Modify: `tools/scripts/test-generation-router.mjs`
- Modify: `tools/scripts/test-model-call-authority-matrix.mjs`
- Create: `tools/scripts/test-utility-turn-arbiter.mjs`

**Interfaces:**
- Produces: `TURN_ARBITER_ROLE_ID = 'utilityTurnArbiter'`
- Produces: `normalizeTurnArbiterPlan(value, options) -> { ok, plan, error }`
- Produces: `conservativeArbiterFailurePlan(input) -> TurnArbiterPlan`
- Consumes later: `TurnArbiterPlan.route`, `responsePlan.owner`, `sceneContinuity.mustPreserve`, `sceneContinuity.mustNotReestablish`

- [ ] **Step 1: Write failing contract tests**

Add `tools/scripts/test-utility-turn-arbiter.mjs`:

```js
import assert from 'node:assert/strict';
import {
  TURN_ARBITER_ROLE_ID,
  conservativeArbiterFailurePlan,
  normalizeTurnArbiterPlan
} from '../../src/adjudication/utility-turn-arbiter-contract.mjs';

const valid = normalizeTurnArbiterPlan({
  kind: 'directive.turnArbiterPlan.v1',
  schemaVersion: 1,
  route: 'hostContinue',
  confidence: 0.86,
  ambiguity: 'low',
  playerIntent: {
    speechAct: 'answering-question',
    action: 'defers ship assessment until inspection',
    target: 'mara-whitaker',
    directObject: 'Breckenridge status',
    domainSignals: ['ship'],
    riskSignals: []
  },
  sceneContinuity: {
    currentLocation: 'captain-ready-room',
    currentConversation: 'Whitaker asks Sam for his XO read.',
    mustPreserve: ['Sam is already seated in Whitaker ready room.'],
    mustNotReestablish: ['Sam boarding the ship']
  },
  responsePlan: {
    owner: 'host',
    strategy: 'injectAndContinue',
    guidance: 'Continue current ready-room exchange.'
  },
  statePlan: {
    commitOutcome: false,
    allowedDomains: ['sourceBinding', 'continuity'],
    proposedOperations: [],
    promptDirtyDomains: ['sourceBinding']
  },
  risk: {
    requiresPause: false,
    pauseReason: '',
    reasons: []
  }
});

assert.equal(TURN_ARBITER_ROLE_ID, 'utilityTurnArbiter');
assert.equal(valid.ok, true);
assert.equal(valid.plan.route, 'hostContinue');
assert.equal(valid.plan.responsePlan.owner, 'host');
assert.deepEqual(valid.plan.sceneContinuity.mustNotReestablish, ['Sam boarding the ship']);

const hiddenLeak = normalizeTurnArbiterPlan({
  ...valid.plan,
  playerIntent: {
    ...valid.plan.playerIntent,
    action: 'use hidden pressure score raw value'
  }
});
assert.equal(hiddenLeak.ok, false);
assert.equal(hiddenLeak.error.code, 'hidden_state_leak');

const badRoute = normalizeTurnArbiterPlan({
  ...valid.plan,
  route: 'directiveOutcome',
  responsePlan: { ...valid.plan.responsePlan, owner: 'host' }
});
assert.equal(badRoute.ok, false);
assert.equal(badRoute.error.code, 'route_owner_mismatch');

const failure = conservativeArbiterFailurePlan({
  reason: 'provider_reasoning_only',
  sourceClean: true,
  ordinaryDialogueLikely: true
});
assert.equal(failure.route, 'hostContinue');
assert.equal(failure.statePlan.commitOutcome, false);

console.log('test-utility-turn-arbiter passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/scripts/test-utility-turn-arbiter.mjs`

Expected: FAIL with module-not-found for `src/adjudication/utility-turn-arbiter-contract.mjs`.

- [ ] **Step 3: Add contract module**

Create `src/adjudication/utility-turn-arbiter-contract.mjs`:

```js
export const TURN_ARBITER_ROLE_ID = 'utilityTurnArbiter';
export const TURN_ARBITER_PLAN_KIND = 'directive.turnArbiterPlan.v1';

export const TURN_ARBITER_ROUTES = Object.freeze([
  'hostContinue',
  'directiveOutcome',
  'localPacing',
  'pause',
  'recovery'
]);

const OWNER_BY_ROUTE = Object.freeze({
  hostContinue: 'host',
  directiveOutcome: 'directive',
  localPacing: 'directive',
  pause: 'directive',
  recovery: 'directive'
});

const HIDDEN_STATE_PATTERNS = Object.freeze([
  /\braw (?:pressure|relationship|hidden|secret)\b/i,
  /\bhidden (?:state|truth|pressure|score|value)\b/i,
  /\bprovider reasoning\b/i,
  /\bapi key\b/i,
  /\bcsrf\b/i,
  /\bcookie\b/i,
  /\bprivate npc thought\b/i
]);

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanStringArray(value) {
  return asArray(value).map(compact).filter(Boolean);
}

function hasHiddenStateLeak(value) {
  const text = JSON.stringify(value || {});
  return HIDDEN_STATE_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeRoute(value) {
  const route = compact(value);
  return TURN_ARBITER_ROUTES.includes(route) ? route : '';
}

export function normalizeTurnArbiterPlan(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, plan: null, error: { code: 'not_object' } };
  }
  if (hasHiddenStateLeak(value)) {
    return { ok: false, plan: null, error: { code: 'hidden_state_leak' } };
  }
  const route = normalizeRoute(value.route);
  if (!route) return { ok: false, plan: null, error: { code: 'unsupported_route' } };
  const owner = compact(value.responsePlan?.owner);
  if (owner !== OWNER_BY_ROUTE[route]) {
    return { ok: false, plan: null, error: { code: 'route_owner_mismatch' } };
  }
  const commitOutcome = value.statePlan?.commitOutcome === true;
  if (commitOutcome && route !== 'directiveOutcome') {
    return { ok: false, plan: null, error: { code: 'commit_outcome_route_mismatch' } };
  }
  const confidence = Math.max(0, Math.min(1, Number(value.confidence) || 0));
  const plan = {
    kind: TURN_ARBITER_PLAN_KIND,
    schemaVersion: 1,
    route,
    confidence,
    ambiguity: compact(value.ambiguity) || 'unknown',
    playerIntent: {
      speechAct: compact(value.playerIntent?.speechAct),
      action: compact(value.playerIntent?.action),
      target: compact(value.playerIntent?.target),
      directObject: compact(value.playerIntent?.directObject),
      domainSignals: cleanStringArray(value.playerIntent?.domainSignals),
      riskSignals: cleanStringArray(value.playerIntent?.riskSignals)
    },
    sceneContinuity: {
      currentLocation: compact(value.sceneContinuity?.currentLocation),
      currentConversation: compact(value.sceneContinuity?.currentConversation),
      mustPreserve: cleanStringArray(value.sceneContinuity?.mustPreserve),
      mustNotReestablish: cleanStringArray(value.sceneContinuity?.mustNotReestablish)
    },
    responsePlan: {
      owner,
      strategy: compact(value.responsePlan?.strategy),
      guidance: compact(value.responsePlan?.guidance)
    },
    statePlan: {
      commitOutcome,
      allowedDomains: cleanStringArray(value.statePlan?.allowedDomains),
      proposedOperations: asArray(value.statePlan?.proposedOperations).filter((entry) => entry && typeof entry === 'object'),
      promptDirtyDomains: cleanStringArray(value.statePlan?.promptDirtyDomains)
    },
    risk: {
      requiresPause: value.risk?.requiresPause === true,
      pauseReason: compact(value.risk?.pauseReason),
      reasons: cleanStringArray(value.risk?.reasons)
    },
    diagnostics: {
      sourceUse: compact(value.diagnostics?.sourceUse),
      deterministicFallbackUsed: value.diagnostics?.deterministicFallbackUsed === true
    }
  };
  if (['hostContinue', 'directiveOutcome'].includes(route)
    && plan.sceneContinuity.mustPreserve.length === 0
    && plan.sceneContinuity.mustNotReestablish.length === 0) {
    return { ok: false, plan: null, error: { code: 'missing_scene_continuity' } };
  }
  return { ok: true, plan, error: null };
}

export function conservativeArbiterFailurePlan({
  reason = 'arbiter_failed',
  sourceClean = false,
  ordinaryDialogueLikely = false
} = {}) {
  const hostSafe = sourceClean === true && ordinaryDialogueLikely === true;
  return {
    kind: TURN_ARBITER_PLAN_KIND,
    schemaVersion: 1,
    route: hostSafe ? 'hostContinue' : 'pause',
    confidence: 0,
    ambiguity: 'high',
    playerIntent: {
      speechAct: hostSafe ? 'unknown-dialogue' : 'unknown',
      action: '',
      target: '',
      directObject: '',
      domainSignals: [],
      riskSignals: []
    },
    sceneContinuity: {
      currentLocation: '',
      currentConversation: '',
      mustPreserve: [],
      mustNotReestablish: []
    },
    responsePlan: {
      owner: hostSafe ? 'host' : 'directive',
      strategy: hostSafe ? 'injectAndContinue' : 'pause',
      guidance: hostSafe ? 'Continue from the latest visible exchange. Do not reintroduce already-established scene setup.' : ''
    },
    statePlan: {
      commitOutcome: false,
      allowedDomains: [],
      proposedOperations: [],
      promptDirtyDomains: []
    },
    risk: {
      requiresPause: !hostSafe,
      pauseReason: hostSafe ? '' : reason,
      reasons: [reason].filter(Boolean)
    },
    diagnostics: {
      sourceUse: 'failure fallback',
      deterministicFallbackUsed: false
    }
  };
}
```

- [ ] **Step 4: Add generation role**

Modify `src/generation/generation-roles.mjs`:

```js
utilityTurnArbiter: {
  id: 'utilityTurnArbiter',
  label: 'Utility Turn Arbiter',
  providerKind: 'utility',
  blocking: true,
  output: 'structured-json',
  timeoutMs: BLOCKING_UTILITY_TIMEOUT_MS,
  structuredOutput: true,
  modelPreferences: {
    cost: 'low',
    latency: 'fast',
    capability: 'utility-reasoning'
  },
  mayProposeState: false,
  mayInjectPrompt: false,
  mayRunDuringMainGeneration: true,
  fallback: 'fail-closed'
}
```

Also add `'utilityTurnArbiter'` to exported role id list.

- [ ] **Step 5: Add authority matrix entry**

Modify `src/generation/model-call-authority-matrix.mjs` with:

```js
utilityTurnArbiter: {
  roleId: 'utilityTurnArbiter',
  providerKind: 'utility',
  authority: 'turnRouteArbitration',
  mayProposeState: false,
  mayInjectPrompt: false,
  fallback: 'fail-closed',
  parserSchema: 'directive.turnArbiterPlan.v1',
  hiddenStatePolicy: 'Receives only player-safe source frames, visible transcript excerpts, selected-swipe metadata, current mission routing summaries, prompt status summaries, and recovery summaries. It cannot see raw prompts, provider reasoning, hidden truth, raw relationship values, raw pressure values, private NPC thoughts, cookies, CSRF tokens, or API keys.'
}
```

- [ ] **Step 6: Extend role tests**

Add assertions to `tools/scripts/test-generation-router.mjs`:

```js
assert.equal(registry.get('utilityTurnArbiter').providerKind, 'utility');
assert.equal(registry.get('utilityTurnArbiter').structuredOutput, true);
assert.equal(registry.get('utilityTurnArbiter').fallback, 'fail-closed');
assert.equal(registry.get('utilityTurnArbiter').modelPreferences.cost, 'low');
```

Add assertions to `tools/scripts/test-model-call-authority-matrix.mjs`:

```js
assert.equal(authorityForRole('utilityTurnArbiter').providerKind, 'utility');
assert.equal(authorityForRole('utilityTurnArbiter').fallback, 'fail-closed');
assert.equal(authorityForRole('utilityTurnArbiter').mayProposeState, false);
assert.equal(authorityForRole('utilityTurnArbiter').mayInjectPrompt, false);
```

- [ ] **Step 7: Run focused tests**

Run:

```powershell
node tools/scripts/test-utility-turn-arbiter.mjs
node tools/scripts/test-generation-router.mjs
node tools/scripts/test-model-call-authority-matrix.mjs
```

Expected: all PASS, including `test-utility-turn-arbiter passed`.

- [ ] **Step 8: Commit**

```powershell
git add src/adjudication/utility-turn-arbiter-contract.mjs src/generation/generation-roles.mjs src/generation/model-call-authority-matrix.mjs tools/scripts/test-utility-turn-arbiter.mjs tools/scripts/test-generation-router.mjs tools/scripts/test-model-call-authority-matrix.mjs
git commit -m "feat: add utility turn arbiter contract"
```

---

### Task 2: Build Arbiter Provider Adapter

**Files:**
- Create: `src/adjudication/utility-turn-arbiter.mjs`
- Modify: `tools/scripts/test-utility-turn-arbiter.mjs`

**Interfaces:**
- Consumes: `normalizeTurnArbiterPlan(value)`
- Produces: `arbitrateChatTurn({ message, context, generationRouter }) -> Promise<TurnArbiterPlan>`
- Produces: `buildTurnArbiterContext({ message, state, sourceSettlement }) -> object`

- [ ] **Step 1: Add failing provider tests**

Append to `tools/scripts/test-utility-turn-arbiter.mjs`:

```js
const { arbitrateChatTurn } = await import('../../src/adjudication/utility-turn-arbiter.mjs');

const calls = [];
const router = {
  async generate(roleId, request) {
    calls.push({ roleId, request });
    return {
      ok: true,
      response: {
        text: JSON.stringify(valid.plan)
      },
      diagnostics: {
        providerId: 'fake-utility'
      }
    };
  }
};

const plan = await arbitrateChatTurn({
  message: {
    hostMessageId: '17',
    text: '"I need to inspect the ship first."',
    chatId: 'Directive - Ashes'
  },
  context: {
    campaignId: 'campaign-test',
    saveId: 'save-test',
    currentMission: { activePhaseId: 'ready-room-handover' },
    recentTranscript: [
      { role: 'assistant', text: 'What does my XO see?' },
      { role: 'user', text: 'I need to inspect the ship first.' }
    ]
  },
  generationRouter: router
});
assert.equal(plan.route, 'hostContinue');
assert.equal(calls[0].roleId, 'utilityTurnArbiter');
assert.equal(calls[0].request.modelPreferences.capability, 'utility-reasoning');

const failurePlan = await arbitrateChatTurn({
  message: { hostMessageId: '17', text: 'Answer', chatId: 'chat' },
  context: { sourceClean: true, ordinaryDialogueLikely: true },
  generationRouter: {
    async generate() {
      return { ok: false, error: { code: 'provider_reasoning_only' } };
    }
  }
});
assert.equal(failurePlan.route, 'hostContinue');
assert.equal(failurePlan.statePlan.commitOutcome, false);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/scripts/test-utility-turn-arbiter.mjs`

Expected: FAIL with module-not-found for `src/adjudication/utility-turn-arbiter.mjs`.

- [ ] **Step 3: Implement adapter**

Create `src/adjudication/utility-turn-arbiter.mjs`:

```js
import {
  TURN_ARBITER_ROLE_ID,
  conservativeArbiterFailurePlan,
  normalizeTurnArbiterPlan
} from './utility-turn-arbiter-contract.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function parseJson(text = '') {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error };
  }
}

export function buildTurnArbiterContext({ message = {}, context = {} } = {}) {
  return {
    kind: 'directive.turnArbiterContext.v1',
    schemaVersion: 1,
    campaignId: compact(context.campaignId),
    saveId: compact(context.saveId),
    chatId: compact(message.chatId || context.chatId),
    hostMessageId: compact(message.hostMessageId || message.id),
    textHash: compact(context.textHash),
    playerText: compact(message.text || message.mes || message.content),
    currentMission: cloneJson(context.currentMission || null),
    sourceSettlement: cloneJson(context.sourceSettlement || null),
    selectedAssistantVariant: cloneJson(context.selectedAssistantVariant || null),
    recentTranscript: cloneJson(context.recentTranscript || []),
    openAssignments: cloneJson(context.openAssignments || []),
    pendingInteraction: cloneJson(context.pendingInteraction || null),
    recoverySummary: cloneJson(context.recoverySummary || null),
    promptStatus: cloneJson(context.promptStatus || null),
    sourceClean: context.sourceClean === true,
    ordinaryDialogueLikely: context.ordinaryDialogueLikely === true
  };
}

function arbiterSystemPrompt() {
  return [
    'You are Directive Utility Turn Arbiter.',
    'Return only JSON matching directive.turnArbiterPlan.v1.',
    'Decide route, response owner, scene continuity, and state intent.',
    'Do not mutate state. Proposed operations are advisory only.',
    'Use only supplied player-safe context.',
    'Never reveal hidden state, raw prompts, provider reasoning, private NPC thoughts, cookies, CSRF tokens, or API keys.',
    'If player answers an NPC inside an established scene, prefer hostContinue unless a durable command outcome is explicit.',
    'If route uses prose, include mustPreserve and mustNotReestablish constraints.'
  ].join('\n');
}

export async function arbitrateChatTurn({ message = {}, context = {}, generationRouter = null } = {}) {
  const arbiterContext = buildTurnArbiterContext({ message, context });
  if (!generationRouter?.generate) {
    return conservativeArbiterFailurePlan({
      reason: 'no_generation_router',
      sourceClean: arbiterContext.sourceClean,
      ordinaryDialogueLikely: arbiterContext.ordinaryDialogueLikely
    });
  }
  const generated = await generationRouter.generate(TURN_ARBITER_ROLE_ID, {
    systemPrompt: arbiterSystemPrompt(),
    messages: [
      { role: 'system', content: arbiterSystemPrompt() },
      { role: 'user', content: JSON.stringify(arbiterContext) }
    ],
    context: arbiterContext,
    modelPreferences: {
      cost: 'low',
      latency: 'fast',
      capability: 'utility-reasoning'
    },
    responseFormat: 'json'
  });
  const responseText = generated?.response?.text
    || generated?.response?.content
    || generated?.response?.raw?.text
    || '';
  if (!generated?.ok || !responseText) {
    return conservativeArbiterFailurePlan({
      reason: generated?.error?.code || 'arbiter_provider_failed',
      sourceClean: arbiterContext.sourceClean,
      ordinaryDialogueLikely: arbiterContext.ordinaryDialogueLikely
    });
  }
  const parsed = parseJson(responseText);
  if (!parsed.ok) {
    return conservativeArbiterFailurePlan({
      reason: 'arbiter_json_parse_failed',
      sourceClean: arbiterContext.sourceClean,
      ordinaryDialogueLikely: arbiterContext.ordinaryDialogueLikely
    });
  }
  const normalized = normalizeTurnArbiterPlan(parsed.value);
  if (!normalized.ok) {
    return conservativeArbiterFailurePlan({
      reason: normalized.error?.code || 'arbiter_contract_failed',
      sourceClean: arbiterContext.sourceClean,
      ordinaryDialogueLikely: arbiterContext.ordinaryDialogueLikely
    });
  }
  return normalized.plan;
}
```

- [ ] **Step 4: Run focused test**

Run: `node tools/scripts/test-utility-turn-arbiter.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/adjudication/utility-turn-arbiter.mjs tools/scripts/test-utility-turn-arbiter.mjs
git commit -m "feat: add utility turn arbiter adapter"
```

---

### Task 3: Wire Arbiter Into Runtime Services

**Files:**
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/chat-turn-orchestrator.mjs`
- Modify: `tools/scripts/test-chat-turn-orchestrator.mjs`

**Interfaces:**
- Consumes: `arbitrateChatTurn({ message, context, generationRouter })`
- Produces: orchestrator option `arbitrate`
- Produces: `ingress.arbiterPlan`

- [ ] **Step 1: Add failing orchestrator test for Sam/Whitaker**

In `tools/scripts/test-chat-turn-orchestrator.mjs`, add a fixture near existing route tests:

```js
const samReadyRoomArbiterCalls = [];
const samReadyRoom = await runOrchestratorScenario({
  label: 'sam-ready-room-answer-routes-host-continue',
  messages: [
    {
      id: '16',
      name: 'Directive - Ashes of Peace',
      is_user: false,
      mes: 'Before we talk mission, I want your read on this ship.'
    },
    {
      id: '17',
      name: 'User',
      is_user: true,
      mes: '"With respect, Captain, I have read reports, but I have yet to see anything myself."'
    }
  ],
  arbitrate: async ({ message, context }) => {
    samReadyRoomArbiterCalls.push({ message, context });
    return {
      kind: 'directive.turnArbiterPlan.v1',
      schemaVersion: 1,
      route: 'hostContinue',
      confidence: 0.9,
      ambiguity: 'low',
      playerIntent: {
        speechAct: 'answering-question',
        action: 'defers assessment until inspection',
        target: 'mara-whitaker',
        directObject: 'Breckenridge status',
        domainSignals: ['ship'],
        riskSignals: []
      },
      sceneContinuity: {
        currentLocation: 'captain-ready-room',
        currentConversation: 'Whitaker asks Sam for his XO read.',
        mustPreserve: ['Sam is already in Whitaker ready room.'],
        mustNotReestablish: ['Sam boarding the ship', 'Sam first meeting Whitaker']
      },
      responsePlan: {
        owner: 'host',
        strategy: 'injectAndContinue',
        guidance: 'Continue current ready-room exchange.'
      },
      statePlan: {
        commitOutcome: false,
        allowedDomains: ['sourceBinding', 'continuity'],
        proposedOperations: [],
        promptDirtyDomains: ['sourceBinding']
      },
      risk: {
        requiresPause: false,
        pauseReason: '',
        reasons: []
      },
      diagnostics: {
        sourceUse: 'test',
        deterministicFallbackUsed: false
      }
    };
  }
});

assert.equal(samReadyRoom.responseStrategy, 'injectAndContinue');
assert.equal(samReadyRoom.abortDefaultGeneration, false);
assert.equal(samReadyRoomArbiterCalls.length, 1);
assert.equal(samReadyRoom.state.runtimeTracking.ingressLedger.at(-1).arbiterPlan.route, 'hostContinue');
assert.equal(
  samReadyRoom.host.assistantMessages.some((entry) => /ready room was smaller|marked aboard|Bronn's on the bridge/i.test(entry.text || '')),
  false
);
```

If `runOrchestratorScenario` does not exist, place this case beside the first reusable `createChatTurnOrchestrator` harness in `tools/scripts/test-chat-turn-orchestrator.mjs`. Construct a dedicated `samReadyRoomOrchestrator` with the same fake `chat`, `prompt`, `responseDispatcher`, `stateDeltaGateway`, `coreTurnStore`, package accessors, prompt sync helper, `previewDirectorTurn`, and `commitProvisionalDirectorTurn` stubs used by the existing top-level `orchestrator`; add only the new `arbitrate` option and assertions above.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/scripts/test-chat-turn-orchestrator.mjs`

Expected: FAIL because orchestrator ignores `arbitrate`.

- [ ] **Step 3: Wire runtime-app**

Modify `src/runtime/runtime-app.mjs`:

```js
import { arbitrateChatTurn } from '../adjudication/utility-turn-arbiter.mjs';
```

Replace the old `classify` service with:

```js
const arbitrate = ({ message, context = {} } = {}) => arbitrateChatTurn({
  message,
  context: {
    ...cloneJson(context),
    campaignRevision: campaignState?.runtimeTracking?.revision || 0,
    simulationMode: campaignState?.settings?.simulationMode || 'Command'
  },
  generationRouter: defaultGenerationRouter
});
```

Pass to orchestrator:

```js
arbitrate,
classify,
```

Keep `classify` temporarily for comparison tests and routes not migrated in this task.

- [ ] **Step 4: Add orchestrator option and ingress projection**

Modify `createChatTurnOrchestrator` options:

```js
arbitrate = null,
classify,
```

Before branch handling for a new player ingress, call:

```js
const arbiterPlan = typeof arbitrate === 'function'
  ? await arbitrate({
      message,
      context: buildArbiterRuntimeContext(next, message, ingressId)
    })
  : null;
```

Record it on ingress:

```js
next = await updateIngressState(next, ingressId, {
  arbiterPlan: cloneJson(arbiterPlan || null),
  responseStrategy: arbiterPlan?.responsePlan?.strategy || null
}, `Arbiter routed ${ingressId}.`);
```

Add local context helper:

```js
function buildArbiterRuntimeContext(state, message, ingressId) {
  return {
    campaignId: state?.campaign?.id || state?.campaignChatBinding?.campaignId || null,
    saveId: state?.campaignChatBinding?.saveId || null,
    chatId: message?.chatId || currentChatId(),
    ingressId,
    currentMission: {
      activeMissionId: state?.mission?.activeMissionId || null,
      activePhaseId: state?.mission?.activePhaseId || state?.mission?.phase || null,
      availableDecisionPointIds: state?.mission?.availableDecisionPointIds || []
    },
    openAssignments: state?.mission?.openAssignments || [],
    sourceClean: true,
    ordinaryDialogueLikely: !/\b(order|authorize|relieve|fire|evacuate|lock down|set course|scan|hail)\b/i.test(message?.text || ''),
    recoverySummary: {
      pendingRecoveryCount: Array.isArray(state?.runtimeTracking?.recoveryJournal) ? state.runtimeTracking.recoveryJournal.length : 0
    }
  };
}
```

- [ ] **Step 5: Route from Arbiter plan**

At branch selection:

```js
if (arbiterPlan?.route === 'hostContinue') {
  return handleArbiterHostContinue(next, ingressId, arbiterPlan, message, activityReporter);
}
if (arbiterPlan?.route === 'pause') {
  return postPause(next, ingressId, arbiterPlanToDecision(arbiterPlan), arbiterPauseText(arbiterPlan), { kind: 'arbiterPause', message }, activityReporter);
}
if (arbiterPlan?.route === 'recovery') {
  return arbiterRecoveryResult(next, ingressId, arbiterPlan);
}
if (arbiterPlan?.route === 'localPacing') {
  return handleLocationTransition(next, ingressId, arbiterPlanToDecision(arbiterPlan), message, activityReporter);
}
if (arbiterPlan?.route === 'directiveOutcome') {
  return handleConsequential(next, ingressId, arbiterPlanToDecision(arbiterPlan), message, activityReporter);
}
```

Add `handleArbiterHostContinue`:

```js
async function handleArbiterHostContinue(state, ingressId, arbiterPlan, message, activityReporter = null) {
  reportActivity(activityReporter, {
    phase: 'hostContinuation',
    mode: 'blocking',
    classification: 'hostContinue',
    ingressId
  });
  const next = await syncPrompt(state, 'Prompt context synchronized for Arbiter host continuation.', promptFrameForMessage(state, message, arbiterPlanToDecision(arbiterPlan)), activityReporter, {
    source: 'utilityTurnArbiter',
    classification: 'hostContinue',
    ingressId,
    arbiterPlan: cloneJson(arbiterPlan)
  });
  const dispatched = await dispatchAndRecord({
    state: next,
    ingressId,
    decision: arbiterPlanToDecision(arbiterPlan),
    strategy: 'injectAndContinue',
    text: null,
    responseKind: 'hostGeneration',
    activityReporter
  });
  return {
    handled: true,
    responseStrategy: 'injectAndContinue',
    abortDefaultGeneration: false,
    decision: arbiterPlanToDecision(arbiterPlan),
    campaignState: cloneJson(dispatched.state)
  };
}
```

- [ ] **Step 6: Run orchestrator test**

Run: `node tools/scripts/test-chat-turn-orchestrator.mjs`

Expected: PASS, including new Sam ready-room route.

- [ ] **Step 7: Commit**

```powershell
git add src/runtime/runtime-app.mjs src/runtime/chat-turn-orchestrator.mjs tools/scripts/test-chat-turn-orchestrator.mjs
git commit -m "feat: route chat turns through utility arbiter"
```

---

### Task 4: Remove Deterministic Commit Fallback On Arbiter Failure

**Files:**
- Modify: `src/runtime/chat-turn-orchestrator.mjs`
- Modify: `tools/scripts/test-chat-turn-orchestrator.mjs`
- Modify: `tools/scripts/test-turn-intent-classifier-fixtures.mjs`

**Interfaces:**
- Consumes: Arbiter failure plan from Task 2
- Produces: no deterministic `directiveOutcome` when Arbiter fails

- [ ] **Step 1: Add failure regression**

In `tools/scripts/test-chat-turn-orchestrator.mjs`, add:

```js
const reasoningOnlyFailure = await runOrchestratorScenario({
  label: 'arbiter-reasoning-only-does-not-commit-outcome',
  messages: [
    {
      id: '17',
      name: 'User',
      is_user: true,
      mes: '"With respect, Captain, I need to inspect the ship first."'
    }
  ],
  arbitrate: async () => ({
    kind: 'directive.turnArbiterPlan.v1',
    schemaVersion: 1,
    route: 'hostContinue',
    confidence: 0,
    ambiguity: 'high',
    playerIntent: {
      speechAct: 'unknown-dialogue',
      action: '',
      target: '',
      directObject: '',
      domainSignals: [],
      riskSignals: []
    },
    sceneContinuity: {
      currentLocation: '',
      currentConversation: '',
      mustPreserve: [],
      mustNotReestablish: []
    },
    responsePlan: {
      owner: 'host',
      strategy: 'injectAndContinue',
      guidance: 'Continue from latest visible exchange.'
    },
    statePlan: {
      commitOutcome: false,
      allowedDomains: [],
      proposedOperations: [],
      promptDirtyDomains: []
    },
    risk: {
      requiresPause: false,
      pauseReason: '',
      reasons: ['provider_reasoning_only']
    },
    diagnostics: {
      sourceUse: 'failure fallback',
      deterministicFallbackUsed: false
    }
  })
});

assert.equal(reasoningOnlyFailure.responseStrategy, 'injectAndContinue');
assert.equal(reasoningOnlyFailure.state.runtimeTracking.lastCommittedOutcomeId || null, null);
assert.equal(reasoningOnlyFailure.state.runtimeTracking.ingressLedger.at(-1).arbiterPlan.diagnostics.deterministicFallbackUsed, false);
```

- [ ] **Step 2: Run test to verify old path fails**

Run: `node tools/scripts/test-chat-turn-orchestrator.mjs`

Expected before fix: deterministic committed outcome still appears in some failure path.

- [ ] **Step 3: Delete deterministic committed-outcome fallback**

In `src/runtime/chat-turn-orchestrator.mjs`, find any fallback path that calls `classify(...)` after Arbiter route failure and then calls `handleConsequential(...)` because deterministic classification is consequential. Replace with:

```js
if (!arbiterPlan || arbiterPlan.risk?.reasons?.includes('provider_reasoning_only')) {
  return handleArbiterHostContinue(
    next,
    ingressId,
    conservativeArbiterFailurePlan({
      reason: 'arbiter_failed',
      sourceClean: true,
      ordinaryDialogueLikely: true
    }),
    message,
    activityReporter
  );
}
```

Use imported `conservativeArbiterFailurePlan` from `src/adjudication/utility-turn-arbiter-contract.mjs`.

- [ ] **Step 4: Reclassify classifier fixture expectations**

In `tools/scripts/test-turn-intent-classifier-fixtures.mjs`, keep classifier tests as migration coverage, but stop asserting that classifier fallback alone authorizes runtime commit. Add comment and assertion:

```js
assert.equal(
  decision.diagnostics.providerAttempted === true || decision.diagnostics.providerAttempted === false,
  true,
  'classifier remains diagnostic during Arbiter migration'
);
```

Do not require runtime route from classifier-only fixtures once Arbiter owns route authority.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
node tools/scripts/test-chat-turn-orchestrator.mjs
node tools/scripts/test-turn-intent-classifier-fixtures.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/runtime/chat-turn-orchestrator.mjs tools/scripts/test-chat-turn-orchestrator.mjs tools/scripts/test-turn-intent-classifier-fixtures.mjs
git commit -m "fix: fail closed on arbiter semantic failure"
```

---

### Task 5: Pass Arbiter Continuity Into Director And Narrator

**Files:**
- Modify: `src/mission/director.mjs`
- Modify: `src/generation/narration.mjs`
- Modify: `src/runtime/chat-turn-orchestrator.mjs`
- Modify: `tools/scripts/test-chat-native-runtime-flow.mjs`

**Interfaces:**
- Consumes: `arbiterPlan.sceneContinuity`
- Produces: `turnPacket.arbiterPlan`
- Produces: narrator prompt section `Arbiter Continuity Constraints`

- [ ] **Step 1: Add failing narration continuity test**

In `tools/scripts/test-chat-native-runtime-flow.mjs`, add:

```js
const arbiterContinuityResult = await app.commitProvisionalDirectorTurn({
  generateNarration: true,
  arbiterPlan: {
    kind: 'directive.turnArbiterPlan.v1',
    schemaVersion: 1,
    route: 'directiveOutcome',
    confidence: 0.91,
    ambiguity: 'low',
    playerIntent: {
      speechAct: 'order',
      action: 'start first-hand inspection',
      target: 'ship systems',
      directObject: 'Breckenridge readiness',
      domainSignals: ['ship'],
      riskSignals: []
    },
    sceneContinuity: {
      currentLocation: 'captain-ready-room',
      currentConversation: 'Whitaker has asked for Sam read of the ship.',
      mustPreserve: ['Sam is already in the ready room.'],
      mustNotReestablish: ['Sam boarding the ship', 'Sam first meeting Whitaker']
    },
    responsePlan: {
      owner: 'directive',
      strategy: 'directivePosted',
      guidance: 'Resolve order without reintroducing setup.'
    },
    statePlan: {
      commitOutcome: true,
      allowedDomains: ['mission', 'ship'],
      proposedOperations: [],
      promptDirtyDomains: ['missionQuestThread']
    },
    risk: { requiresPause: false, pauseReason: '', reasons: [] },
    diagnostics: { sourceUse: 'test', deterministicFallbackUsed: false }
  }
});

assert.match(arbiterContinuityResult.narrationResult.narration.prompt || '', /Sam is already in the ready room/);
assert.match(arbiterContinuityResult.narrationResult.narration.prompt || '', /Sam boarding the ship/);
```

Adapt to current fake narrator shape. If fake narrator records request separately, assert against recorded `request.prompt`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/scripts/test-chat-native-runtime-flow.mjs`

Expected: FAIL because narrator prompt lacks Arbiter continuity constraints.

- [ ] **Step 3: Store Arbiter plan on turn packet**

Modify `src/mission/director.mjs`:

```js
const arbiterPlan = cloneJson(input.arbiterPlan || null);
```

Add to returned `turnPacket`:

```js
arbiterPlan,
```

- [ ] **Step 4: Pass Arbiter plan from orchestrator commit**

Modify `handleConsequential` commit call:

```js
committed = await commitProvisionalDirectorTurn({
  readiedCommandBearing,
  generateNarration: true,
  generateCommandLogSummary: true,
  deferCommandLogSummary: true,
  arbiterPlan: cloneJson(decision.arbiterPlan || decision)
});
```

Ensure `arbiterPlanToDecision(arbiterPlan)` includes:

```js
arbiterPlan: cloneJson(arbiterPlan)
```

- [ ] **Step 5: Add narrator prompt section**

Modify `src/generation/narration.mjs` prompt composition to include:

```js
const arbiterPlan = turnPacket.arbiterPlan || null;
const continuity = arbiterPlan?.sceneContinuity || null;
if (continuity) {
  sections.push([
    '## Arbiter Continuity Constraints',
    `Current location: ${continuity.currentLocation || 'unknown'}`,
    `Current conversation: ${continuity.currentConversation || 'unknown'}`,
    'Must preserve:',
    ...(continuity.mustPreserve || []).map((item) => `- ${item}`),
    'Must not re-establish:',
    ...(continuity.mustNotReestablish || []).map((item) => `- ${item}`)
  ].join('\n'));
}
```

Use local section-building style already present in `composeNarrationPrompt`.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
node tools/scripts/test-chat-native-runtime-flow.mjs
node tools/scripts/test-chat-turn-orchestrator.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/mission/director.mjs src/generation/narration.mjs src/runtime/chat-turn-orchestrator.mjs tools/scripts/test-chat-native-runtime-flow.mjs
git commit -m "feat: carry arbiter continuity into narration"
```

---

### Task 6: Demote Ashes Deterministic Resolver To Arbiter-Approved Outcomes

**Files:**
- Modify: `src/adjudication/intent-parser.mjs`
- Modify: `src/adjudication/ashes-of-peace/action-resolver.mjs`
- Modify: `src/mission/director.mjs`
- Modify: `tools/scripts/test-chat-turn-orchestrator.mjs`
- Modify: `tools/scripts/test-runtime-stage9-turn-loop.mjs`

**Interfaces:**
- Consumes: `input.arbiterPlan.route === 'directiveOutcome'`
- Produces: no broad in-phase deterministic outcome without Arbiter approval

- [ ] **Step 1: Add resolver guard tests**

In `tools/scripts/test-runtime-stage9-turn-loop.mjs`, add:

```js
await app.previewDirectorTurn({
  turnId: 'chat-turn:no-arbiter-ready-room',
  playerInput: '"I need to inspect the ship first."'
});
const noArbiterCommit = await app.commitProvisionalDirectorTurn({
  generateNarration: false
});
assert.notEqual(
  noArbiterCommit.turnPacket.outcomePacket.summary,
  'The player comes aboard as a working XO rather than a ceremonial arrival, lets the transfer complete, asks for the live handoff, and reports to Captain Whitaker without making existing routines perform for them.'
);
```

If direct app commit always requires preview, adapt by passing `arbiterPlan: null` and asserting route is blocked/recovery.

- [ ] **Step 2: Run test to verify stale summary appears**

Run: `node tools/scripts/test-runtime-stage9-turn-loop.mjs`

Expected before fix: stale arrival/handoff summary appears for ready-room input.

- [ ] **Step 3: Require Arbiter for broad phase intents**

Modify `src/mission/director.mjs` before `parseIntent(sceneSnapshot)` result is used:

```js
const arbiterPlan = cloneJson(input.arbiterPlan || null);
const arbiterApprovedOutcome = arbiterPlan?.route === 'directiveOutcome'
  && arbiterPlan?.statePlan?.commitOutcome === true;
```

After `parseIntent`, prevent broad phase catch-all outcomes when not approved:

```js
if (!arbiterApprovedOutcome && [
  'establish-arrival-tone',
  'complete-ready-room-handover',
  'set-readiness-priorities',
  'establish-command-rhythm'
].includes(intentParse.primaryIntent)) {
  return buildNoCommittedOutcomeTurnPacket({
    input,
    sceneSnapshot,
    intentParse,
    reason: 'arbiter-required-for-broad-phase-outcome'
  });
}
```

Add helper in `src/mission/director.mjs`:

```js
function buildNoCommittedOutcomeTurnPacket({ input, sceneSnapshot, intentParse, reason }) {
  const outcomePacket = {
    id: `outcome.${String(input.turnId || 'turn').replace(/^turn\./, '')}`,
    resultBand: 'No Change',
    summary: 'No durable mission outcome was committed because the turn requires Utility Arbiter approval.',
    costs: [],
    revealedFactIds: [],
    commandDecisionAwards: [],
    noCommitReason: reason
  };
  return {
    contractVersion: 1,
    turnId: input.turnId,
    graphPath: input.graphPath,
    projectionPath: input.projectionPath,
    sceneSnapshot,
    intentParse,
    actionClassification: { category: 'noDurableOutcome', reason },
    authorityCapabilityCheck: { result: 'notEvaluated', reason },
    pressureFocus: null,
    directorResponse: null,
    outcomePacket,
    stateDelta: {},
    narratorPacket: {
      sourceOutcomeId: outcomePacket.id,
      summary: outcomePacket.summary,
      constraints: ['Do not narrate a durable state change.']
    },
    commandLogPacket: {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [outcomePacket.summary],
      visibleConsequences: []
    },
    arbiterPlan: cloneJson(input.arbiterPlan || null)
  };
}
```

- [ ] **Step 4: Narrow ready-room parser**

Modify `src/adjudication/intent-parser.mjs`:

```js
if (activePhaseId === 'ready-room-handover' && rawInput.trim()) {
  const engagesHandoverValue = namesPersonalValue
    || definesExecutiveAuthority
    || defersPersonalValue
    || /\b(my command value|as xo|executive authority|disagreement|lawful final decision|bronn's acting work)\b/i.test(rawInput);
  if (!engagesHandoverValue) {
    return {
      summary: 'In-scene ready-room dialogue that does not complete the command-value handover.',
      primaryIntent: 'no-action',
      targetIds: ['mara-whitaker'],
      declaredMethod: rawInput.trim(),
      assumptions: [],
      signals
    };
  }
  // Existing complete-ready-room-handover return block stays here unchanged.
}
```

Keep existing signal object intact.

- [ ] **Step 5: Remove stale arrival summary as visible fallback**

Modify `src/adjudication/ashes-of-peace/action-resolver.mjs` so `resolveArrivalTone` summary cannot be selected for `ready-room-handover`:

```js
if (intentParse.primaryIntent === 'establish-arrival-tone') {
  return resolveArrivalTone({ turnId, intentParse });
}
```

Add assertion tests that ready-room non-handover input never returns arrival-tone summary.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
node tools/scripts/test-runtime-stage9-turn-loop.mjs
node tools/scripts/test-chat-turn-orchestrator.mjs
```

Expected: PASS. Sam-style ready-room answer does not produce stale arrival/handoff outcome.

- [ ] **Step 7: Commit**

```powershell
git add src/adjudication/intent-parser.mjs src/adjudication/ashes-of-peace/action-resolver.mjs src/mission/director.mjs tools/scripts/test-chat-turn-orchestrator.mjs tools/scripts/test-runtime-stage9-turn-loop.mjs
git commit -m "fix: require arbiter for broad mission outcomes"
```

---

### Task 7: Verify Full Runtime And Live Ashes Proof

**Files:**
- Modify only if tests expose real defects.
- Evidence: existing test outputs and live SillyTavern run.

**Interfaces:**
- Consumes: all previous tasks
- Produces: verified runtime behavior

- [ ] **Step 1: Run focused gate**

Run:

```powershell
node tools/scripts/test-utility-turn-arbiter.mjs
node tools/scripts/test-generation-router.mjs
node tools/scripts/test-model-call-authority-matrix.mjs
node tools/scripts/test-chat-turn-orchestrator.mjs
node tools/scripts/test-chat-native-runtime-flow.mjs
node tools/scripts/test-runtime-stage9-turn-loop.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run alpha gate**

Run:

```powershell
npm.cmd test
```

Expected: alpha gate PASS.

- [ ] **Step 3: Check installed extension freshness before live proof**

If live SillyTavern serves `F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive`, sync changed runtime files there before browser proof. Confirm changed files match with hashes.

Run:

```powershell
Get-FileHash src/runtime/chat-turn-orchestrator.mjs
Get-FileHash F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive\src\runtime\chat-turn-orchestrator.mjs
```

Expected: hashes match after sync.

- [ ] **Step 4: Reproduce live Ashes ready-room route**

Open the bound Ashes campaign chat for `default-user`. Send a ready-room answer equivalent to:

```text
"With respect, Captain, I have read the reports and Bronn gave me highlights, but I need to inspect the systems myself before I give you a ship-readiness answer."
```

Expected visible behavior:

- no new boarding intro
- no first meeting with Whitaker
- no ready-room reintroduction
- host continuation or Directive outcome starts from current ready-room conversation

- [ ] **Step 5: Inspect live artifacts**

Read newest default-user Ashes JSONL and matching save artifacts. Confirm:

- ingress has `arbiterPlan.route`
- `utilityTurnArbiter` model-call diagnostic exists
- Arbiter failure, if any, has `statePlan.commitOutcome: false`
- no deterministic stale arrival summary in committed event ledger for this turn

- [ ] **Step 6: Final commit if verification fixes were needed**

If Step 1-5 required patches:

```powershell
git add src/runtime/chat-turn-orchestrator.mjs src/runtime/runtime-app.mjs src/adjudication/utility-turn-arbiter.mjs src/adjudication/utility-turn-arbiter-contract.mjs src/generation/narration.mjs src/mission/director.mjs tools/scripts/test-utility-turn-arbiter.mjs tools/scripts/test-chat-turn-orchestrator.mjs tools/scripts/test-chat-native-runtime-flow.mjs
git commit -m "fix: stabilize utility turn arbiter runtime"
```

If no patches needed, no commit.

---

## Self-Review

Spec coverage:

- Role and authority contract covered by Task 1.
- Provider adapter and fail-closed behavior covered by Task 2 and Task 4.
- Runtime routing covered by Task 3.
- Continuity constraints covered by Task 5.
- Deterministic engine demotion covered by Task 6.
- Live proof covered by Task 7.

Placeholder scan:

- No unresolved placeholders.
- No open-ended error handling instructions.
- Every task includes concrete files, interfaces, commands, and expected results.

Type consistency:

- Role id is consistently `utilityTurnArbiter`.
- Plan kind is consistently `directive.turnArbiterPlan.v1`.
- Primary adapter function is consistently `arbitrateChatTurn`.
- Runtime route names match spec: `hostContinue`, `directiveOutcome`, `localPacing`, `pause`, `recovery`.
