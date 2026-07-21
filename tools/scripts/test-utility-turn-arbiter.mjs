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
  },
  timePlan: {
    action: 'skip',
    semanticKind: 'none',
    authority: 'none',
    confidence: 0.92,
    evidence: 'Player answers inside the current conversation without implying elapsed time.',
    rationale: 'No clock movement.'
  }
});

assert.equal(TURN_ARBITER_ROLE_ID, 'utilityTurnArbiter');
assert.equal(valid.ok, true);
assert.equal(valid.plan.route, 'hostContinue');
assert.equal(valid.plan.responsePlan.owner, 'host');
assert.deepEqual(valid.plan.sceneContinuity.mustNotReestablish, ['Sam boarding the ship']);
assert.equal(valid.plan.timePlan.action, 'skip');
assert.equal(valid.plan.timePlan.semanticKind, 'none');
assert.equal(valid.plan.timePlan.authority, 'none');

const operatorCut = normalizeTurnArbiterPlan({
  ...valid.plan,
  timePlan: {
    action: 'adjudicate',
    semanticKind: 'sceneCut',
    authority: 'operatorControl',
    confidence: 0.91,
    evidence: 'Cut ahead ten minutes.',
    rationale: 'Conservative explicit scene-control command.'
  }
});
assert.equal(operatorCut.ok, true);
assert.equal(operatorCut.plan.timePlan.action, 'adjudicate');
assert.equal(operatorCut.plan.timePlan.authority, 'operatorControl');

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

const callsBeforePhaseMontage = calls.length;
const phaseMontagePlan = await arbitrateChatTurn({
  message: {
    hostMessageId: '18',
    text: 'The week took on its own rhythm. Day One, Engineering handled the relay issue. Then Nayar picked up a civilian distress signal.',
    chatId: 'Directive - Ashes'
  },
  context: {
    campaignId: 'campaign-test',
    saveId: 'save-test',
    currentMission: { activeMissionId: 'prelude-a-ship-underway', activePhaseId: 'shuttle-rendezvous' },
    sourceClean: true,
    ordinaryDialogueLikely: true
  },
  generationRouter: router
});
assert.equal(calls.length, callsBeforePhaseMontage, 'Phase-changing montage preflight must not risk a model-selected host continuation route.');
assert.equal(phaseMontagePlan.route, 'directiveOutcome');
assert.equal(phaseMontagePlan.statePlan.commitOutcome, true);
assert.equal(phaseMontagePlan.responsePlan.owner, 'directive');
assert.equal(phaseMontagePlan.timePlan.action, 'adjudicate');
assert.equal(phaseMontagePlan.timePlan.semanticKind, 'montage');
assert.equal(phaseMontagePlan.timePlan.authority, 'playerNarration');
assert.equal(phaseMontagePlan.statePlan.promptDirtyDomains.includes('sceneTime'), true);
assert.equal(phaseMontagePlan.statePlan.promptDirtyDomains.includes('sceneLocationTime'), false);
assert.equal(phaseMontagePlan.diagnostics.deterministicFallbackUsed, false);

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

console.log('test-utility-turn-arbiter passed');
