import assert from 'node:assert/strict';
import { buildMissionDirectorFrame } from '../../src/directors/mission-director-frame.mjs';
import { MISSION_DIRECTOR_FRAME_KIND } from '../../src/directors/mission-director-model-contracts.mjs';

const campaignState = {
  campaign: { id: 'campaign-1' },
  saveId: 'save-1',
  mission: {
    activeMissionId: 'prelude-a-ship-underway',
    activeMissionGraphId: 'ashes-prelude',
    activePhaseId: 'ready-room-handover',
    availableDecisionPointIds: ['decision.ready-room-handover']
  },
  attentionState: {
    foregroundQuestId: 'prelude-a-ship-underway',
    scene: {
      locationId: 'captain-ready-room',
      presentCharacterIds: ['mara-whitaker', 'hadrik-bronn']
    }
  },
  worldState: {
    currentLocationId: 'captain-ready-room',
    currentStardate: 58912.4
  },
  knowledgeLedger: {
    facts: [{ id: 'crew.transfer-cohort-tension', known: true }]
  },
  relationships: {
    seniorCrew: { hiddenRawScore: 9 }
  }
};

const packageData = {
  questTemplates: {
    templates: [{
      id: 'prelude-a-ship-underway',
      title: 'Prelude: A Ship Underway',
      missionGraph: {
        id: 'ashes-prelude',
        phases: [{ id: 'ready-room-handover', label: 'Ready Room Handover' }],
        decisionPoints: [{ id: 'decision.ready-room-handover', label: 'Ready-room handover' }],
        outcomeFlags: [{ id: 'crew.transfer-cohort-tension', allowedValues: [true, false] }]
      }
    }]
  }
};

const { frame, sourceHash, allowedRoots, allowedFactIds, allowedDecisionIds } = buildMissionDirectorFrame({
  campaignState,
  packageData,
  message: {
    text: 'I tell Whitaker I want a first-hand inspection before judging readiness.',
    hostMessageId: 'msg-18'
  },
  chatId: 'chat-1',
  ingressId: 'ingress-1',
  arbiterPlan: { route: 'directiveOutcome' },
  sourceFrameRef: { kind: 'directive.turnSourceFrameRef.v1', sourceId: 'frame-1' },
  recentTranscript: [{ role: 'assistant', text: 'Whitaker asks for Sam first read.' }]
});

assert.equal(frame.kind, MISSION_DIRECTOR_FRAME_KIND);
assert.equal(frame.ingress.ingressId, 'ingress-1');
assert.equal(frame.currentStoryState.activePhaseId, 'ready-room-handover');
assert.equal(frame.packageStoryMap.phases[0].id, 'ready-room-handover');
assert.equal(allowedRoots.includes('mission'), true);
assert.equal(allowedFactIds.includes('crew.transfer-cohort-tension'), true);
assert.equal(allowedDecisionIds.includes('decision.ready-room-handover'), true);
assert.equal(typeof sourceHash, 'string');
assert.equal(JSON.stringify(frame).includes('hiddenRawScore'), false);

console.log('mission director frame passed');
