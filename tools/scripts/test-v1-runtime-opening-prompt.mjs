import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPeoplePlayerProjection } from '../../src/projection/v1/people-projection.mjs';

import {
  createActiveAcceptedPairLineage,
  createV1RuntimePromptPacket
} from '../../src/runtime/runtime-app.mjs';

function json(relative) {
  return JSON.parse(fs.readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8'));
}

const packageData = json('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const runtimeAssets = {
  packageData,
  missionDefinitions: [
    json('packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json'),
    json('packages/bundled/breckenridge/v1/chapter-4-the-colony-that-stayed.mission-v1.json'),
    json('packages/bundled/breckenridge/v1/epilogue-the-terms-we-keep.mission-v1.json')
  ],
  crewDataset: json('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json'),
  shipDataset: json('packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json')
};
const state = {
  player: {
    name: 'Sam Vickers',
    rank: 'Commander',
    billet: 'Executive Officer',
    role: 'Principal mission commander',
    dossier: {}
  },
  campaign: { title: 'Ashes of Peace' },
  mission: {
    activeMissionId: 'prelude-a-ship-underway',
    v1: {
      definitionId: 'mission.prelude-a-ship-underway',
      objectives: {
        'objective.prelude.command-handover': {
          state: 'available',
          visibility: 'visible',
          disposition: null
        }
      }
    }
  },
  storySettlement: {
    receipts: [],
    activeEpisode: 'episode.current-conversation',
    episodes: [{
      id: 'episode.current-conversation',
      status: 'open',
      workingCapsule: {
        summary: 'Whitaker and the commander are establishing their working tone.',
        foregroundQuestion: 'How candid will the commander be?',
        recentEvidence: [
          { role: 'assistant', excerpt: 'Whitaker leaves the question open.' },
          { role: 'runtime', excerpt: 'SECRET RUNTIME AUTHORITY' },
          { role: 'user', excerpt: 'I answer her plainly.' }
        ]
      }
    }]
  },
  commandBearing: {},
  settings: { simulationMode: 'Exploration' },
  worldState: { currentLocationId: 'breckenridge-underway' },
  timeLedger: {
    stardate: 53068.4,
    elapsedSeconds: 47,
    shipClock: { secondOfDay: 30647, minuteOfDay: 510, display: '08:30:47 hours' }
  },
  stateCustody: { revision: 0 }
};
const projection = {
  mission: { missionId: 'prelude-a-ship-underway' },
  people: { people: [] },
  ship: {},
  commandBearing: {},
  story: { branchId: 'save-opening', revision: 0, focus: null, entries: [] }
};

const openingAssistant = {
  hostMessageId: 'opening-assistant',
  role: 'assistant',
  text: 'Sam stood outside the ready room.'
};
const hiddenOriginalEntry = {
  hostMessageId: 'player-entry-1-hidden',
  role: 'user',
  text: 'I enter the ready room.',
  visibility: { sourceRowExists: true, hiddenByHost: true, sourceMutation: false }
};
const replayedEntry = {
  hostMessageId: 'player-entry-1-replayed',
  role: 'user',
  text: 'I press the chime and enter.'
};
const introduction = {
  hostMessageId: 'whitaker-introduction',
  role: 'assistant',
  text: 'Whitaker welcomes the commander, offers coffee, and asks about the shuttle trip.'
};
const answeredEntry = {
  hostMessageId: 'player-entry-2',
  role: 'user',
  text: 'The trip was smooth. The ship made a good first impression.'
};
const replayLineage = createActiveAcceptedPairLineage({
  campaignState: state,
  chatId: 'opening-chat',
  recentMessages: [openingAssistant, hiddenOriginalEntry, replayedEntry]
});
assert.deepEqual(replayLineage.map((entry) => entry.currentPlayerHostMessageId), ['player-entry-1-replayed']);
const answeredLineage = createActiveAcceptedPairLineage({
  campaignState: state,
  chatId: 'opening-chat',
  recentMessages: [openingAssistant, hiddenOriginalEntry, replayedEntry, introduction, answeredEntry]
});
assert.deepEqual(answeredLineage.map((entry) => entry.currentPlayerHostMessageId), [
  'player-entry-1-replayed',
  'player-entry-2'
]);
const unpairedPlayerLineage = createActiveAcceptedPairLineage({
  campaignState: state,
  chatId: 'opening-chat',
  recentMessages: [openingAssistant, replayedEntry, answeredEntry]
});
assert.deepEqual(unpairedPlayerLineage.map((entry) => entry.currentPlayerHostMessageId), [
  'player-entry-1-replayed'
]);
const systemRowLineage = createActiveAcceptedPairLineage({
  campaignState: state,
  chatId: 'opening-chat',
  recentMessages: [
    openingAssistant,
    { hostMessageId: 'system-row', role: 'user', text: 'host control', raw: { is_system: true } },
    replayedEntry
  ]
});
assert.deepEqual(systemRowLineage.map((entry) => entry.currentPlayerHostMessageId), ['player-entry-1-replayed']);

const packet = createV1RuntimePromptPacket({
  state,
  projection,
  runtimeAssets,
  acceptedPairLineage: [],
  director: {
    dutyReport: {
      packet: { reporterId: 'priya-nayar' },
      segment: {
        canonicalText: 'Duty Report â€” A distress signal has been confirmed. Confidence: Confirmed.'
      }
    }
  }
});
assert.match(packet.text, /CHARACTER INFORMATION:/);
assert.match(packet.text, /"characterInformation"/);
const openingPayload = JSON.parse(packet.text.slice(packet.text.indexOf('{\n')));
assert.deepEqual(
  openingPayload.narrationGuidance.supportingCharacters.map(character => character.id),
  ['lysa-chen'],
  'Prelude excludes future-stage Mira and undiscovered Rhee and Daro guides'
);
assert.equal(openingPayload.narrationGuidance.crew.length, runtimeAssets.crewDataset.officers.length);
assert.ok(openingPayload.narrationGuidance.crew.some(character => character.id === 'mara-whitaker'));
// Casting guidance must reach narration without introducing people or private facts.
const castingAssets = structuredClone(runtimeAssets);
const castingReference = {
  character: 'George Hammond',
  source: 'Stargate SG-1',
  drawFrom: 'Steady authority and restrained warmth.',
  boundaries: 'Preserve the original character identity and knowledge.'
};
castingAssets.crewDataset.supportingCharacters = [
  {
    id: 'lysa-chen', name: 'Lysa Chen',
    guideEligibility: [{ missionId: 'mission.prelude-a-ship-underway', when: true }],
    profileSummary: 'PRIVATE UNREVEALED HISTORY',
    narrationGuide: { voice: 'Measured and direct.', constraints: ['No automatic approval.'], characterReference: castingReference }
  },
  {
    id: 'mira-solenn', name: 'Mira Solenn',
    guideEligibility: [{ missionId: 'mission.chapter-4-the-colony-that-stayed', when: true }],
    narrationGuide: { voice: 'Technically specific.', constraints: ['Do not invent a billet.'], characterReference: castingReference }
  },
  {
    id: 'unsafe-missing-stage', name: 'Unsafe Missing Stage',
    narrationGuide: { voice: 'Should never be sent.', constraints: ['Fail closed.'], characterReference: castingReference }
  },
  {
    id: 'unused-support', name: 'Unused Support',
    guideEligibility: [],
    narrationGuide: { voice: 'Should never be sent.', constraints: ['Fail closed.'], characterReference: castingReference }
  },
  {
    id: 'invalid-rule', name: 'Invalid Rule',
    guideEligibility: [{ missionId: 'mission.prelude-a-ship-underway', when: { factKnown: 'fact.unknown' } }],
    narrationGuide: { voice: 'Should never be sent.', constraints: ['Fail closed.'], characterReference: castingReference }
  },
  {
    id: 'false-rule', name: 'False Rule',
    guideEligibility: [{ missionId: 'mission.prelude-a-ship-underway', when: false }],
    narrationGuide: { voice: 'Should never be sent.', constraints: ['Fail closed.'], characterReference: castingReference }
  },
  {
    id: 'duplicate-rule', name: 'Duplicate Rule',
    guideEligibility: [
      { missionId: 'mission.prelude-a-ship-underway', when: true },
      { missionId: 'mission.prelude-a-ship-underway', when: false }
    ],
    narrationGuide: { voice: 'Should never be sent.', constraints: ['Fail closed.'], characterReference: castingReference }
  }
];
const castingPacket = createV1RuntimePromptPacket({ state, projection, runtimeAssets: castingAssets });
const castingPayload = JSON.parse(castingPacket.text.slice(castingPacket.text.indexOf('{\n')));
assert.deepEqual(castingPayload.narrationGuidance.supportingCharacters, [{
  id: 'lysa-chen', name: 'Lysa Chen',
  voice: 'Measured and direct.', constraints: ['No automatic approval.'], characterReference: castingReference
}]);
assert.doesNotMatch(castingPacket.text, /PRIVATE UNREVEALED HISTORY/);
assert.doesNotMatch(castingPacket.text, /Mira Solenn|Unsafe Missing Stage|Unused Support|Invalid Rule|False Rule|Duplicate Rule/);
const castingPeople = createPeoplePlayerProjection({ runtimeAssets: castingAssets });
assert.equal(castingPeople.people.length, 7);
assert.equal(castingPeople.people.some(person => person.id === 'lysa-chen'), false);
assert.doesNotMatch(JSON.stringify(castingPeople), /George Hammond|characterReference/);

const chapter4State = structuredClone(state);
chapter4State.mission.activeMissionId = 'chapter-4-the-colony-that-stayed';
chapter4State.mission.v1.definitionId = 'mission.chapter-4-the-colony-that-stayed';
const chapter4Projection = structuredClone(projection);
chapter4Projection.mission.missionId = 'chapter-4-the-colony-that-stayed';
const chapter4Payload = JSON.parse(createV1RuntimePromptPacket({
  state: chapter4State,
  projection: chapter4Projection,
  runtimeAssets: castingAssets
}).text.slice(castingPacket.text.indexOf('{\n')));
assert.deepEqual(
  chapter4Payload.narrationGuidance.supportingCharacters.map(character => character.id),
  ['mira-solenn']
);

const acceptedMiraProjection = structuredClone(projection);
acceptedMiraProjection.people.people = [{ id: 'mira-solenn', name: 'Mira Solenn' }];
const retainedMiraPayload = JSON.parse(createV1RuntimePromptPacket({
  state,
  projection: acceptedMiraProjection,
  runtimeAssets: castingAssets
}).text.slice(castingPacket.text.indexOf('{\n')));
assert.deepEqual(
  retainedMiraPayload.narrationGuidance.supportingCharacters.map(character => character.id),
  ['lysa-chen', 'mira-solenn'],
  'an exact accepted supporting-character ID retains its authored guide beyond the eligible stage'
);
const sameNameProjection = structuredClone(projection);
sameNameProjection.people.people = [{ id: 'person.emergent.mira', name: 'Mira Solenn' }];
const sameNamePayload = JSON.parse(createV1RuntimePromptPacket({
  state,
  projection: sameNameProjection,
  runtimeAssets: castingAssets
}).text.slice(castingPacket.text.indexOf('{\n')));
assert.deepEqual(
  sameNamePayload.narrationGuidance.supportingCharacters.map(character => character.id),
  ['lysa-chen'],
  'a matching name cannot bind an emergent person to authored supporting-character guidance'
);

const daroState = structuredClone(state);
daroState.mission.v1.knownFacts = ['fact.prelude.redline.shortage-consequence'];
const daroPayload = JSON.parse(createV1RuntimePromptPacket({
  state: daroState, projection, runtimeAssets
}).text.slice(castingPacket.text.indexOf('{\n')));
assert.deepEqual(daroPayload.narrationGuidance.supportingCharacters.map(character => character.id), ['lysa-chen', 'daro-tem']);
assert.deepEqual(daroPayload.narrationGuidance.supportingCharacters.find(character => character.id === 'daro-tem'), {
  id: 'daro-tem', name: 'Daro Tem', species: 'Bajoran',
  service: { organization: 'starfleet', department: 'propulsion maintenance', rankCode: 'crewman', rankLabel: 'Crewman' },
  ...runtimeAssets.crewDataset.supportingCharacters.find(character => character.id === 'daro-tem').narrationGuide
});
const rheeState = structuredClone(state);
rheeState.mission.v1.knownFacts = ['fact.prelude.redline.distribution-confirmed'];
const rheePayload = JSON.parse(createV1RuntimePromptPacket({
  state: rheeState, projection, runtimeAssets
}).text.slice(castingPacket.text.indexOf('{\n')));
assert.deepEqual(rheePayload.narrationGuidance.supportingCharacters.map(character => character.id), ['lysa-chen', 'anika-rhee']);

const epilogueState = structuredClone(state);
epilogueState.mission.activeMissionId = 'epilogue-the-terms-we-keep';
epilogueState.mission.v1.definitionId = 'mission.epilogue-the-terms-we-keep';
epilogueState.mission.v1.entryContext = { capabilities: [
  { id: 'capability.epilogue.rhee-lawful-custody' },
  { id: 'capability.epilogue.daro-confidential-care' }
] };
const epilogueProjection = structuredClone(projection);
epilogueProjection.mission.missionId = 'epilogue-the-terms-we-keep';
const epilogueBeforeAftermath = JSON.parse(createV1RuntimePromptPacket({
  state: epilogueState, projection: epilogueProjection, runtimeAssets
}).text.slice(castingPacket.text.indexOf('{\n')));
for (const id of ['lysa-chen', 'anika-rhee', 'daro-tem']) {
  assert.equal(epilogueBeforeAftermath.narrationGuidance.supportingCharacters.some(character => character.id === id), false);
}
epilogueState.mission.v1.knownFacts = ['fact.epilogue.aftermath-record'];
const epilogueAfterAftermath = JSON.parse(createV1RuntimePromptPacket({
  state: epilogueState, projection: epilogueProjection, runtimeAssets
}).text.slice(castingPacket.text.indexOf('{\n')));
for (const id of ['lysa-chen', 'anika-rhee', 'daro-tem']) {
  assert.equal(epilogueAfterAftermath.narrationGuidance.supportingCharacters.some(character => character.id === id), true);
}
const authorityIndex = packet.text.indexOf('PLAYER CHARACTER AUTHORITY - ABSOLUTE.');
assert(authorityIndex > packet.text.indexOf('DIRECTIVE V1 CAMPAIGN CONTEXT'));
assert(authorityIndex < packet.text.indexOf('Continue a story-first command RPG'));
assert(authorityIndex < packet.text.indexOf('DUTY REPORT:'));
assert.match(packet.text, /Never write dialogue for "Sam Vickers"/);
assert.match(packet.text, /acknowledgment, question, order, assent, connective line, or other speech/);
assert.match(packet.text, /briefly and faithfully re-describe dialogue or visible actions already supplied by the user/);
assert.match(packet.text, /stop before the next unprovided word, action, or choice from "Sam Vickers"/);
assert.match(packet.text, /"workingStory"/);
assert.match(packet.text, /Whitaker and the commander are establishing their working tone/);
assert.match(packet.text, /I answer her plainly/);
assert.doesNotMatch(packet.text, /SECRET RUNTIME AUTHORITY/);
assert.match(packet.text, /DUTY REPORT: Deliver pendingDutyReport\.segment\.canonicalText verbatim exactly once/);
assert.match(packet.text, /Duty Report â€” A distress signal has been confirmed/);
assert.match(packet.text, /"phase": "unanswered"/);
assert.doesNotMatch(packet.text, /"canonicalOpeningMessage":/);
assert.match(packet.text, /"premise":/);
assert.match(packet.text, /The player arrived aboard/);
assert.match(packet.text, /Preserve established continuity and required facts/);
assert.match(packet.text, /end at opening.firstPlayableScene before the next player action/);
assert.match(packet.text, /Directive displays accepted ship time in its interface/);
assert.match(packet.text, /Do not print a Stardate, ship-time header, footer, tracker, or timestamp/);
assert.doesNotMatch(packet.text, /End the assistant response with exactly one final nonblank line/);
assert.doesNotMatch(packet.text, /\*Stardate 53068\.4 \| 08:30:47 hours\*/);
assert.doesNotMatch(packet.text, /Begin the assistant response with exactly/);
assert.match(packet.text, /"currentTime": \{/);

const renState = structuredClone(state);
renState.player.name = 'Ren Okada';
const renPacket = createV1RuntimePromptPacket({
  state: renState,
  projection,
  runtimeAssets,
  acceptedPairLineage: []
});
assert.match(renPacket.text, /Never write dialogue for "Ren Okada"/);
assert.doesNotMatch(renPacket.text, /Never write dialogue for "Sam Vickers"/);

const firstMeetingState = structuredClone(state);
firstMeetingState.storySettlement.receipts.push({
  id: 'receipt.opening.insignificant',
  disposition: 'insignificant'
}, {
  id: 'receipt.opening.invalidated-replay',
  disposition: 'invalidated'
});
const firstMeetingPacket = createV1RuntimePromptPacket({
  state: firstMeetingState,
  projection,
  runtimeAssets,
  acceptedPairLineage: [{ currentPlayerHostMessageId: 'player-entry-1-replayed' }]
});
assert.match(firstMeetingPacket.text, /"phase": "firstMeeting"/);
assert.match(firstMeetingPacket.text, /"stage": "introductionPending"/);
assert.doesNotMatch(firstMeetingPacket.text, /"canonicalOpeningMessage":/);
assert.doesNotMatch(firstMeetingPacket.text, /OPENING REGENERATION/);
assert.match(firstMeetingPacket.text, /At 0830 the following morning/);
assert.match(firstMeetingPacket.text, /Whitaker greets the player by name/);
assert.match(firstMeetingPacket.text, /FIRST SCENE:/);
assert.match(firstMeetingPacket.text, /stop after the greeting, courtesy, and one conversational question/);
assert.match(firstMeetingPacket.text, /Do not mention readiness problems, crew conflicts/);
assert.match(firstMeetingPacket.text, /Leave room for the player to answer/);

const conversationAnsweredState = structuredClone(firstMeetingState);
conversationAnsweredState.storySettlement.receipts = [];
const conversationAnsweredPacket = createV1RuntimePromptPacket({
  state: conversationAnsweredState,
  projection,
  runtimeAssets,
  acceptedPairLineage: [
    { currentPlayerHostMessageId: 'player-entry-1-replayed' },
    { currentPlayerHostMessageId: 'player-entry-2' }
  ]
});
assert.match(conversationAnsweredPacket.text, /"phase": "firstMeeting"/);
assert.match(conversationAnsweredPacket.text, /"stage": "conversationAnswered"/);
assert.match(conversationAnsweredPacket.text, /Whitaker greets the player by name/);
assert.match(conversationAnsweredPacket.text, /FIRST SCENE CONTINUATION:/);
assert.match(conversationAnsweredPacket.text, /"allowDeparture": false/);
assert.match(conversationAnsweredPacket.text, /Objective completion does not authorize a scene cut/);
assert.match(conversationAnsweredPacket.text, /"objectiveId": "objective.prelude.command-handover"/);
assert.match(conversationAnsweredPacket.text, /transitioning into the command handover/);
assert.doesNotMatch(conversationAnsweredPacket.text, /This response is only the greeting/);
assert.doesNotMatch(conversationAnsweredPacket.text, /Do not discuss readiness problems/);

const postHandoverState = structuredClone(conversationAnsweredState);
postHandoverState.mission.v1.objectives['objective.prelude.command-handover'] = {
  state: 'terminal',
  visibility: 'resolved',
  disposition: 'completed'
};
const postHandoverPacket = createV1RuntimePromptPacket({
  state: postHandoverState,
  projection,
  runtimeAssets,
  acceptedPairLineage: [
    { currentPlayerHostMessageId: 'player-entry-1-replayed' },
    { currentPlayerHostMessageId: 'player-entry-2' }
  ]
});
assert.match(postHandoverPacket.text, /"phase": "continuity"/);
assert.match(postHandoverPacket.text, /"continuitySummary":/);
assert.doesNotMatch(postHandoverPacket.text, /"firstPlayableScene":/);
assert.doesNotMatch(postHandoverPacket.text, /"firstSceneGuidance":/);
assert.doesNotMatch(postHandoverPacket.text, /FIRST SCENE:/);

console.log('V1 runtime opening prompt tests passed.');
const stableAssets=structuredClone(runtimeAssets);
const storedPremise=structuredClone(packageData.campaign.openingPremise);
storedPremise.firstPlayableScene='The original approved doorway.';
const recorded=createV1RuntimePromptPacket({state:{...state,campaign:{id:'c'}},projection,runtimeAssets:stableAssets,acceptedPairLineage:[],openingRecord:{kind:'directive.openingRecord.v1',campaignId:'c',inputs:{premise:storedPremise},direction:{kind:'directive.openingDirection.v1',sceneMaterialIds:['scene:0'],backgroundIds:[],emphasis:'setting'}}});
assert.equal(JSON.parse(recorded.text.slice(recorded.text.indexOf('{\n'))).opening?.firstPlayableScene,'The original approved doorway.');
