import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createV1RuntimePromptPacket } from '../../src/runtime/runtime-app.mjs';

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
  storySettlement: { receipts: [] },
  commandBearing: {},
  settings: { simulationMode: 'Exploration' },
  worldState: { currentLocationId: 'breckenridge-underway' },
  timeLedger: {
    stardate: 53068.4,
    shipClock: { minuteOfDay: 510, display: '0830 hours' }
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

const packet = createV1RuntimePromptPacket({ state, projection, runtimeAssets });
assert.match(packet.text, /"phase": "unanswered"/);
assert.match(packet.text, /"canonicalOpeningMessage":/);
assert.match(packet.text, /Yesterday morning, your shuttle rendezvoused/);
assert.match(packet.text, /Preserve every established opening beat/);
assert.match(packet.text, /Do not take the player through the ready-room door/);

const firstMeetingState = structuredClone(state);
firstMeetingState.storySettlement.receipts.push({
  id: 'receipt.opening.insignificant',
  disposition: 'insignificant'
});
const firstMeetingPacket = createV1RuntimePromptPacket({
  state: firstMeetingState,
  projection,
  runtimeAssets
});
assert.match(firstMeetingPacket.text, /"phase": "firstMeeting"/);
assert.doesNotMatch(firstMeetingPacket.text, /"canonicalOpeningMessage":/);
assert.doesNotMatch(firstMeetingPacket.text, /OPENING REGENERATION/);
assert.match(firstMeetingPacket.text, /At 0830 the following morning/);
assert.match(firstMeetingPacket.text, /Whitaker greets the player by name/);
assert.match(firstMeetingPacket.text, /FIRST MEETING:/);

const postHandoverState = structuredClone(firstMeetingState);
postHandoverState.mission.v1.objectives['objective.prelude.command-handover'] = {
  state: 'terminal',
  visibility: 'resolved',
  disposition: 'completed'
};
const postHandoverPacket = createV1RuntimePromptPacket({
  state: postHandoverState,
  projection,
  runtimeAssets
});
assert.match(postHandoverPacket.text, /"phase": "continuity"/);
assert.match(postHandoverPacket.text, /"continuitySummary":/);
assert.doesNotMatch(postHandoverPacket.text, /"firstPlayableScene":/);
assert.doesNotMatch(postHandoverPacket.text, /"firstSceneGuidance":/);
assert.doesNotMatch(postHandoverPacket.text, /FIRST MEETING:/);

console.log('V1 runtime opening prompt tests passed.');
