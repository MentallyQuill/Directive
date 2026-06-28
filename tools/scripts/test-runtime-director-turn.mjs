import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  composeNarrationPrompt
} from '../../src/generation/narration.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryJsonAdapter() {
  const files = new Map();
  return {
    async readJson(filePath) {
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      files.set(filePath, cloneJson(value));
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    }
  };
}

function createSequence(values) {
  let index = 0;
  return () => values[index++] || values.at(-1);
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const shipDataset = readJson('packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json');
const missionGraph = readJson('packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json');
const fixture = readJson('tests/fixtures/mission/prelude-hesperus-fraud-director-loop.fixture.json');

let idSequence = 0;
const app = createDirectiveRuntimeApp({
  adapter: createMemoryJsonAdapter(),
  packageLoader: async () => ({
    packages: [packageData],
    projections: [{
      path: 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
      projection
    }],
    crewDatasets: [{
      path: 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
      dataset: crewDataset
    }],
    shipDatasets: [{
      path: 'packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json',
      dataset: shipDataset
    }],
    missionGraphs: [{
      path: 'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
      graph: missionGraph
    }]
  }),
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-runtime-director-${idSequence}`;
  },
  now: createSequence([
    '2026-06-18T23:00:00.000Z',
    '2026-06-18T23:01:00.000Z',
    '2026-06-18T23:02:00.000Z',
    '2026-06-18T23:03:00.000Z',
    '2026-06-18T23:04:00.000Z',
    '2026-06-18T23:05:00.000Z'
  ])
});

await app.initialize();
await app.startCreatorDraft({ packageId: packageData.manifest.id });
await app.saveCreatorDraft({
  reason: 'manualSave',
  patch: {
    activeStep: 'review',
    input: {
      identity: {
        name: 'Talia Serrin',
        pronounsOrAddress: 'she/her',
        speciesId: 'human',
        ageBandId: 'mid-career',
        appearance: 'A composed officer with a quiet voice and a habit of watching the room before speaking.'
      },
      service: {
        careerBackgroundId: 'tactical-security',
        formativeExperienceId: 'dominion-war-fleet-service',
        assignmentReasonId: 'experienced-outsider-transfer'
      },
      personality: {
        traits: {
          insight: 'perceptive',
          connection: 'candid',
          execution: 'decisive'
        },
        flawId: 'impatient'
      },
      dossier: {
        detailLevel: 'Standard',
        briefBiography: 'Talia Serrin is a tactical-minded Starfleet Commander whose Dominion War service taught her to make quick decisions without treating lives as expendable. Her transfer gives the Breckenridge a disciplined executive officer with a measured command presence.',
        publicReputation: 'Talia Serrin is known as a decisive and observant officer whose restraint has improved since the war.'
      }
    }
  }
});
await app.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });

const sceneSnapshot = fixture.input.sceneSnapshot;
const turnResult = await app.runDirectorTurn({
  turnId: 'turn.runtime.hesperus.001',
  playerInput: sceneSnapshot.playerInput,
  sceneSnapshotOverrides: {
    activePhaseId: sceneSnapshot.activePhaseId,
    stardate: sceneSnapshot.stardate,
    locationId: sceneSnapshot.locationId,
    presentCharacters: sceneSnapshot.presentCharacters,
    knownFactIds: sceneSnapshot.knownFactIds,
    activeDecisionPointIds: sceneSnapshot.activeDecisionPointIds
  }
});

assert.equal(turnResult.turnPacket.outcomePacket.resultBand, 'Partial Success');
assert.equal(turnResult.turnPacket.sceneSnapshot.campaignId, 'ashes-of-peace');
assert.equal(turnResult.turnPacket.sceneSnapshot.campaignInstanceId, 'campaign-runtime-director-2');
assert.equal(turnResult.turnPacket.sceneSnapshot.activePhaseId, 'hesperus-diversion');
assert.equal(turnResult.turnPacket.provenance.continuityProjection.kind, 'directive.continuityDirectorPacketDigest.v1');
assert.equal(turnResult.turnPacket.provenance.continuityProjection.audience, 'missionDirector');
assert.equal(turnResult.turnPacket.provenance.continuityProjection.hash, turnResult.coordinatorDiagnostics.continuityProjection.hash);
assert.equal(typeof turnResult.turnPacket.provenance.continuityProjection.sourceHash, 'string');
assert.equal(turnResult.turnPacket.provenance.continuityProjection.selectedFactCount > 0, true);
assert.equal(
  turnResult.turnPacket.directorPackets.crewDirector.hydratedCards.some((card) => (
    card.type === 'crew.voice'
    && card.guidance?.voiceCapsule?.coreEngine
    && card.guidance.voiceCapsule.exampleLineShapes?.length === 1
  )),
  true
);
assert.equal(turnResult.campaignState.mission.activePhaseId, 'hesperus-aftermath');
assert.equal(turnResult.campaignState.mission.phase, 'hesperus-aftermath');
assert.equal(turnResult.campaignState.turnLedger.swipeRerollForbidden, true);
assert.equal(turnResult.campaignState.turnLedger.lastCommittedOutcomeId, 'outcome.runtime.hesperus.001');
assert.deepEqual(
  turnResult.campaignState.turnLedger.entries.at(-1).continuityProjection,
  turnResult.turnPacket.provenance.continuityProjection
);
assert.equal(turnResult.campaignState.commandBearing.resolve.awardedDecisionIds.includes('command.hesperus-fraud-accountability'), true);
assert.equal(turnResult.campaignState.commandBearing.resolve.marks, 1);
assert.equal(turnResult.campaignState.commandBearing.resolve.rankTitle, 'Practiced');
assert.equal(turnResult.commandLogPacket.visibleConsequences.includes('Resolve progression earned.'), true);
assert.equal(turnResult.narratorPacket.sourceOutcomeId, turnResult.turnPacket.outcomePacket.id);
assert.equal(turnResult.campaignState.commandLog.entries.at(-1).sourceOutcomeId, turnResult.turnPacket.outcomePacket.id);
assert.equal(
  turnResult.campaignState.commandLog.entries.at(-1).visibleConsequences.includes('Inspection fraud preserved for formal follow-up.'),
  true
);

const missionView = await app.getCurrentView({ tabId: 'mission' });
assert.equal(missionView.campaignState, null);
assert.equal(missionView.loadedCampaignState.mission.activePhaseId, 'hesperus-aftermath');
assert.equal(missionView.loadedCampaignState.turnLedger.lastCommittedOutcomeId, 'outcome.runtime.hesperus.001');
assert.equal(missionView.lastDirectorTurn.outcomePacket.id, 'outcome.runtime.hesperus.001');

const mechanicalBeforeNarration = JSON.stringify({
  mission: missionView.loadedCampaignState.mission,
  clocks: missionView.loadedCampaignState.clocks,
  commandBearing: missionView.loadedCampaignState.commandBearing,
  relationships: missionView.loadedCampaignState.relationships,
  commandLog: missionView.loadedCampaignState.commandLog
});
const providerCalls = [];
const narrationResult = await app.generateNarrationForLastTurn({
  provider: {
    id: 'fake-narrator',
    async generateNarration(request) {
      providerCalls.push(request);
      return {
        providerId: 'fake-narrator',
        text: 'The Breckenridge takes the delay, moves the vulnerable passengers first, and preserves the falsified inspection record for formal inquiry.'
      };
    }
  }
});
assert.equal(narrationResult.ok, true);
assert.equal(providerCalls.length, 1);
assert.match(providerCalls[0].prompt, /Narrator Packet/);
assert.match(providerCalls[0].prompt, /Player Identity/);
assert.match(providerCalls[0].prompt, /Known Crew Identity/);
assert.match(providerCalls[0].prompt, /Narrator-Safe Crew Voice Cues/);
assert.match(providerCalls[0].prompt, /Priya turns intent into cooperation/);
assert.match(providerCalls[0].prompt, /Bronn tests every plan against hostile behavior/);
assert.match(providerCalls[0].prompt, /Bronn thinks any unofficial path is a tunnel with a trap at the end/);
assert.match(providerCalls[0].prompt, /Priya Nayar/);
assert.doesNotMatch(providerCalls[0].prompt, /Priya Anand/);
assert.doesNotMatch(providerCalls[0].prompt, /Becky Chambers|Picard|Sisko|Janeway|write like|in the style of/i);
assert.match(providerCalls[0].systemPrompt, /Player Identity section is authoritative/);
assert.match(providerCalls[0].systemPrompt, /Do not invent surnames, rename crew, or merge two officers/);
assert.match(providerCalls[0].systemPrompt, /Treat example line shapes as syntax examples, not catchphrases/);
assert.match(providerCalls[0].prompt, /Do not reroll mechanics/);
assert.match(providerCalls[0].systemPrompt, /Narration perspective contract/);
assert.match(providerCalls[0].systemPrompt, /third person limited external/);
assert.equal(providerCalls[0].narrationContext.roleId, 'narration');
assert.equal(providerCalls[0].narrationContext.source, 'preset-adapter-unavailable');
assert.equal(narrationResult.campaignState.turnLedger.entries.at(-1).narrationStatus, 'complete');
assert.equal(narrationResult.campaignState.turnLedger.entries.at(-1).narration.providerId, 'fake-narrator');
assert.equal(JSON.stringify({
  mission: narrationResult.campaignState.mission,
  clocks: narrationResult.campaignState.clocks,
  commandBearing: narrationResult.campaignState.commandBearing,
  relationships: narrationResult.campaignState.relationships,
  commandLog: narrationResult.campaignState.commandLog
}), mechanicalBeforeNarration);

const boundHostCampaignState = {
  ...cloneJson(missionView.loadedCampaignState),
  campaignChatBinding: {
    entityName: 'Host Shell Persona'
  }
};
const identityPrompt = composeNarrationPrompt({
  campaignState: boundHostCampaignState,
  turnPacket: missionView.lastDirectorTurn
});
assert.match(identityPrompt.prompt, /Talia Serrin/);
assert.match(identityPrompt.prompt, /Host Shell Isolation/);
assert.match(identityPrompt.prompt, /Host Shell Persona/);

const failureResult = await app.generateNarrationForLastTurn({
  provider: {
    id: 'failing-narrator',
    async generateNarration() {
      throw new Error('provider offline');
    }
  }
});
assert.equal(failureResult.ok, false);
assert.equal(failureResult.campaignState.turnLedger.pendingNarrationRecovery.outcomeId, 'outcome.runtime.hesperus.001');
assert.equal(failureResult.campaignState.turnLedger.entries.at(-1).narrationStatus, 'complete');
assert.equal(failureResult.campaignState.turnLedger.entries.at(-1).narrationFailures.length, 1);
assert.equal(JSON.stringify({
  mission: failureResult.campaignState.mission,
  clocks: failureResult.campaignState.clocks,
  commandBearing: failureResult.campaignState.commandBearing,
  relationships: failureResult.campaignState.relationships,
  commandLog: failureResult.campaignState.commandLog
}), mechanicalBeforeNarration);

console.log('Runtime Director turn tests passed: scene snapshot, Director loop, transaction commit, narration success/failure, Mission/Log state update');
