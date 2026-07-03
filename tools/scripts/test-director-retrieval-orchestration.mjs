import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildAudienceGateReport,
  runDirectorRetrieval
} from '../../src/retrieval/packet-builder.mjs';
import { normalizeRecallIndexEntry } from '../../src/retrieval/recall-index.mjs';

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
assert.equal(shuttleRun.diagnostics.recallIndex.entryCount > 0, true);
const narratorRecallRefs = shuttleRun.diagnostics.recallIndex.byAudience.narrator.includedRefs;
assert.equal(narratorRecallRefs.some((ref) => ref.id === 'package-recall:ship.intrepid.exterior.shuttle-approach'), true);
assert.equal(narratorRecallRefs.some((ref) => ref.id === 'package-recall:ship.intrepid.location.shuttlebay'), true);
const shuttleRecallRef = narratorRecallRefs.find((ref) => ref.id === 'package-recall:ship.intrepid.exterior.shuttle-approach');
assert.equal(shuttleRecallRef.retrieval.mode, 'package');
assert.equal(shuttleRecallRef.retrieval.sourceAuthority, 'package');
assert.equal(shuttleRecallRef.retrieval.audience.includes('narrator'), true);
assert.equal(shuttleRecallRef.scoreReasons.includes('retrievalMode'), true);
assert.equal(shuttleRun.packets.narrator.recallRefs.some((ref) => ref.id === shuttleRecallRef.id), true);
const serializedRecallDiagnostics = JSON.stringify(shuttleRun.diagnostics.recallIndex);
assert.equal(serializedRecallDiagnostics.includes('Do not depict routine shuttle docking'), false);
assert.equal(serializedRecallDiagnostics.includes('Deck 10 aft shuttlebay complex'), false);
assert.equal(serializedRecallDiagnostics.includes('saucer-underside shuttlebay'), false);

const coreSceneSealRecall = normalizeRecallIndexEntry({
  id: 'core-recall:scene-seal:shuttle-rendezvous',
  campaignId: finalReviewTurn.sceneSnapshot.campaignId || null,
  saveId: null,
  branchId: 'main',
  authority: 'committed',
  sourceFrameRef: {
    id: 'frame-shuttle-rendezvous',
    textHash: 'frame-shuttle-rendezvous-hash',
    rawPlayerText: 'Raw player text from the CORE source frame must not serialize.'
  },
  sceneSealRef: {
    id: 'scene-seal-shuttle-rendezvous',
    hash: 'scene-seal-shuttle-rendezvous-hash',
    rawSummary: 'Raw FORGE seal summary must not serialize.'
  },
  phaseId: 'shuttle-rendezvous',
  sceneId: 'scene-shuttle-rendezvous',
  locationId: 'intrepid.shuttlebay-complex',
  actorIds: finalReviewTurn.sceneSnapshot.presentCharacters || [],
  subjectIds: ['shuttle-rendezvous'],
  missionIds: [finalReviewTurn.sceneSnapshot.missionId || finalReviewTurn.sceneSnapshot.activeMissionId],
  keywords: ['shuttle-rendezvous', 'intrepid.shuttlebay-complex', 'establish-arrival-tone'],
  retrieval: {
    mode: 'sceneSeal',
    priority: 100,
    audience: ['narrator'],
    sourceAuthority: 'sceneSeal',
    ragHints: {
      facet: 'scene-seal',
      rawPromptText: 'Raw scene-seal prompt hint must not serialize.'
    }
  },
  textHash: 'core-scene-seal-recall-hash',
  preview: 'The shuttle approach has already been framed as a careful, quiet rendezvous at the shuttlebay complex.'
});
const hybridShuttleRun = runDirectorRetrieval({
  crewDataset,
  shipDataset,
  missionGraph: graph,
  sceneSnapshot: {
    ...finalReviewTurn.sceneSnapshot,
    activePhaseId: 'shuttle-rendezvous',
    phaseId: 'shuttle-rendezvous',
    locationId: 'intrepid.shuttlebay-complex',
    playerInput: 'The shuttle lines up for shuttlebay docking from astern.',
    audiences: ['narrator']
  },
  campaignState: simulationFixture.baseCampaignState,
  intentParse: { primaryIntent: 'establish-arrival-tone' },
  turnId: 'turn.retrieval.shuttle-rendezvous.hybrid',
  outcomeId: 'outcome.retrieval.shuttle-rendezvous.hybrid',
  coreRecallEntries: [coreSceneSealRecall],
  audiences: ['narrator']
});
const hybridNarratorRefs = hybridShuttleRun.diagnostics.recallIndex.byAudience.narrator.includedRefs;
assert.equal(hybridNarratorRefs[0].id, 'core-recall:scene-seal:shuttle-rendezvous');
assert.equal(hybridNarratorRefs[0].authority, 'committed');
assert.equal(hybridNarratorRefs[0].retrieval.mode, 'sceneSeal');
assert.equal(hybridNarratorRefs[0].retrieval.sourceAuthority, 'sceneSeal');
assert.equal(hybridNarratorRefs[0].scoreReasons.includes('sceneSeal'), true);
assert.equal(hybridNarratorRefs.some((ref) => ref.id === 'package-recall:ship.intrepid.location.shuttlebay'), true);
assert.equal(
  hybridShuttleRun.packets.narrator.recallRefs.some((ref) => ref.id === 'core-recall:scene-seal:shuttle-rendezvous'),
  true
);
assert.equal(hybridShuttleRun.diagnostics.recallIndex.entryCount > shuttleRun.diagnostics.recallIndex.entryCount, true);
const serializedHybridRecall = JSON.stringify(hybridShuttleRun.diagnostics.recallIndex);
assert.equal(serializedHybridRecall.includes('Raw player text from the CORE source frame'), false);
assert.equal(serializedHybridRecall.includes('Raw FORGE seal summary'), false);
assert.equal(serializedHybridRecall.includes('Raw scene-seal prompt hint'), false);

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
