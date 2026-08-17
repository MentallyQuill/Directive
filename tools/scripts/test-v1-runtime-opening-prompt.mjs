import assert from 'node:assert/strict';
import fs from 'node:fs';

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
  text: packageData.campaign.openingMessage
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
assert.match(packet.text, /"canonicalOpeningMessage":/);
assert.match(packet.text, /Yesterday morning, your shuttle rendezvoused/);
assert.match(packet.text, /Preserve every established opening beat/);
assert.match(packet.text, /Do not take the player through the ready-room door/);
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
assert.match(firstMeetingPacket.text, /FIRST MEETING:/);
assert.match(firstMeetingPacket.text, /This response is only the greeting, ordinary courtesy, and one genuine conversational opening/);
assert.match(firstMeetingPacket.text, /Do not discuss readiness problems, crew conflicts, the Asterion Reach, flight plans, mission details, reports, command expectations, or the handover terms yet/);
assert.match(firstMeetingPacket.text, /End after Whitaker gives the player a natural opening to answer/);

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
assert.match(conversationAnsweredPacket.text, /FIRST MEETING CONTINUATION:/);
assert.match(conversationAnsweredPacket.text, /transition naturally into the command handover/);
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
assert.doesNotMatch(postHandoverPacket.text, /FIRST MEETING:/);

console.log('V1 runtime opening prompt tests passed.');
