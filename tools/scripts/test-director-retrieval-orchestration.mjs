import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildAudienceGateReport,
  runDirectorRetrieval
} from '../../src/retrieval/packet-builder.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

const graph = readJson('packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const shipDataset = readJson('packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json');
const simulationFixture = readJson('tests/fixtures/simulation/combined-load-hazard-modes.fixture.json');
const finalReviewTurn = readJson('tests/fixtures/mission/prelude-final-review-turn.turn.fixture.json');
const seniorBriefingFixture = readJson('tests/fixtures/retrieval/prelude-senior-staff-briefing.fixture.json');
const readyRoomFixture = readJson('tests/fixtures/retrieval/prelude-whitaker-ready-room.fixture.json');

function retrievalFor({ sceneSnapshot, primaryIntent, turnId, outcomeId, campaignState = {} }) {
  return runDirectorRetrieval({
    crewDataset,
    shipDataset,
    missionGraph: graph,
    sceneSnapshot,
    campaignState,
    intentParse: { primaryIntent },
    turnId,
    outcomeId
  });
}

const commandModeRun = retrievalFor({
  sceneSnapshot: {
    ...simulationFixture.baseSceneSnapshot,
    simulationMode: 'Command'
  },
  primaryIntent: 'resolve-combined-load-test',
  turnId: 'turn.retrieval.combined-load.command',
  outcomeId: 'outcome.retrieval.combined-load.command',
  campaignState: simulationFixture.baseCampaignState
});
const explorationModeRun = retrievalFor({
  sceneSnapshot: {
    ...simulationFixture.baseSceneSnapshot,
    simulationMode: 'Exploration'
  },
  primaryIntent: 'resolve-combined-load-test',
  turnId: 'turn.retrieval.combined-load.exploration',
  outcomeId: 'outcome.retrieval.combined-load.exploration',
  campaignState: simulationFixture.baseCampaignState
});

assert.deepEqual(commandModeRun.packets.narrator.cardIds, [
  'crew.imani.voice.technical-debt',
  'crew.priya.voice.dependencies-access',
  'ship.intrepid.location.bridge'
]);
assert.equal(commandModeRun.packets.narrator.hydratedCards.some((card) => card.guidance?.stateRefs || card.guidance?.effects), false);
assert.equal(
  commandModeRun.packets.crewDirector.hydratedCards.some((card) => (
    card.id === 'crew.imani.voice.technical-debt'
    && card.guidance?.voiceCapsule?.coreEngine
    && card.guidance.voiceCapsule.exampleLineShapes?.length === 1
  )),
  true
);
assert.equal(
  commandModeRun.packets.crewDirector.hydratedCards.some((card) => card.id === 'crew.priya.voice.dependencies-access'),
  true
);
assert.deepEqual(explorationModeRun.packets.narrator.cardIds, commandModeRun.packets.narrator.cardIds);
assert.equal(commandModeRun.journal.outcomeId, 'outcome.retrieval.combined-load.command');
assert.equal(commandModeRun.journal.providerStatus, 'not-used');
assert.equal(commandModeRun.journal.selectedCountsByAudience.narrator, 3);
assert.equal(commandModeRun.journal.phaseId, 'combined-load-test');

const finalReviewRun = retrievalFor({
  sceneSnapshot: finalReviewTurn.sceneSnapshot,
  primaryIntent: finalReviewTurn.intentParse.primaryIntent,
  turnId: finalReviewTurn.turnId,
  outcomeId: finalReviewTurn.outcomePacket.id
});
assert.deepEqual(finalReviewRun.packets.narrator.cardIds, [
  'crew.whitaker.voice.command-pressure',
  'crew.priya.voice.dependencies-access',
  'ship.intrepid.location.main-engineering'
]);
assert.equal(finalReviewTurn.sceneSnapshot.presentCharacters.includes('priya-nayar'), false);

const readyRoomReport = buildAudienceGateReport({
  cards: crewDataset.cards,
  sceneSnapshot: readyRoomFixture.sceneSnapshot,
  audiences: readyRoomFixture.sceneSnapshot.audiences
});
assert.equal(readyRoomReport.selectedByAudience.narrator.includes('crew.whitaker.profile.commanding-officer'), true);
assert.equal(readyRoomReport.selectedByAudience.crewDirector.includes('crew.whitaker.relationship.new-xo-evaluation'), true);
assert.equal(readyRoomReport.selectedByAudience.narrator.includes('crew.whitaker.relationship.new-xo-evaluation'), false);
assert.equal(
  readyRoomReport.blockedByAudience.crewDirector.some((block) => block.id === 'crew.whitaker.reveal.process-is-not-courage' && block.reason === 'knowledgeGate'),
  true
);
const readyRoomRun = retrievalFor({
  sceneSnapshot: readyRoomFixture.sceneSnapshot,
  primaryIntent: 'complete-ready-room-handover',
  turnId: 'turn.retrieval.ready-room',
  outcomeId: 'outcome.retrieval.ready-room'
});
assert.equal(readyRoomRun.journal.phaseId, 'ready-room-handover');
assert.equal(readyRoomRun.packets.crewDirector.cardIds.includes('crew.whitaker.voice.command-pressure'), true);
assert.equal(readyRoomRun.packets.crewDirector.cardIds.includes('crew.whitaker.profile.commanding-officer'), true);
assert.equal(readyRoomRun.packets.crewDirector.cardIds.includes('crew.whitaker.relationship.new-xo-evaluation'), true);

const shuttleRun = retrievalFor({
  sceneSnapshot: {
    ...finalReviewTurn.sceneSnapshot,
    activePhaseId: 'shuttle-rendezvous',
    phaseId: 'shuttle-rendezvous',
    locationId: 'intrepid.shuttlebay-complex',
    playerInput: 'The shuttle lines up for shuttlebay docking from astern.',
    audiences: ['missionDirector', 'shipDirector', 'narrator']
  },
  primaryIntent: 'establish-arrival-tone',
  turnId: 'turn.retrieval.shuttle-rendezvous',
  outcomeId: 'outcome.retrieval.shuttle-rendezvous'
});
assert.deepEqual(shuttleRun.packets.narrator.cardIds.slice(0, 2), [
  'ship.intrepid.exterior.shuttle-approach',
  'ship.intrepid.location.shuttlebay'
]);
assert.equal(shuttleRun.packets.shipDirector.cardIds.includes('ship.intrepid.exterior.shuttle-approach'), true);
assert.equal(shuttleRun.packets.shipDirector.cardIds.includes('ship.intrepid.location.shuttlebay'), true);
const hydratedShuttlebay = shuttleRun.packets.narrator.hydratedCards.find((card) => card.id === 'ship.intrepid.location.shuttlebay');
assert(hydratedShuttlebay, 'Narrator packet should hydrate the shuttlebay card.');
assert.match(JSON.stringify(hydratedShuttlebay.guidance), /Deck 10 aft dorsal secondary hull/i);
assert.match(JSON.stringify(hydratedShuttlebay.guidance), /saucer-underside|belly shuttlebay|primary-hull mouth/i);

const seniorBriefingReport = buildAudienceGateReport({
  cards: crewDataset.cards,
  sceneSnapshot: seniorBriefingFixture.sceneSnapshot,
  audiences: seniorBriefingFixture.sceneSnapshot.audiences
});
assert.deepEqual(
  [...seniorBriefingReport.selectedByAudience.narrator].sort(),
  [...seniorBriefingFixture.expected.selectedByAudience.narrator].sort()
);
assert.equal(
  seniorBriefingReport.blockedByAudience.crewDirector.some((block) => block.id === 'crew.imani.reveal.life-continued-elsewhere' && block.reason === 'knowledgeGate'),
  true
);

const syntheticAudienceReport = buildAudienceGateReport({
  cards: [
    {
      id: 'test.hidden.card',
      type: 'mission.hiddenTruth',
      visibility: 'directorOnly',
      audiences: ['missionDirector', 'narrator'],
      scope: {
        campaigns: ['ashes-of-peace'],
        missions: ['prelude-a-ship-underway']
      },
      gates: {
        playerKnowledge: 'none',
        requiresRevealedFactIds: [],
        blocksUntilFactIds: [],
        requiresOutcomeIds: []
      },
      payload: {
        narratorSafe: true
      }
    }
  ],
  sceneSnapshot: {
    campaignId: 'ashes-of-peace',
    missionId: 'prelude-a-ship-underway',
    stardate: 53049.2,
    presentCharacters: [],
    audiences: ['missionDirector', 'narrator']
  },
  audiences: ['missionDirector', 'narrator']
});
assert.deepEqual(syntheticAudienceReport.selectedByAudience.missionDirector, ['test.hidden.card']);
assert.deepEqual(syntheticAudienceReport.selectedByAudience.narrator, []);
assert.equal(syntheticAudienceReport.blockedByAudience.narrator[0].reason, 'hiddenVisibility');

console.log('Director retrieval orchestration passed.');
