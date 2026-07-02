import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeDirectiveHost } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { listCampaignSaves } from '../../src/storage/directive-storage-repository.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function stable(value) {
  return JSON.stringify(value);
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const missionGraphs = [
  'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
  'packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json',
  'packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json'
].map((filePath) => ({ path: filePath, graph: readJson(filePath) }));

const host = createFakeDirectiveHost({
  chatNative: true,
  chatOptions: { chatId: 'difficulty-pre-campaign-chat', entityName: 'Captain Whitaker' },
  generationOptions: {
    responses: {
      campaignIntro: {
        providerId: 'fake-reasoning',
        text: 'Captain Whitaker yields the watch to Commander Serrin as the Breckenridge clears moorings.'
      }
    }
  }
});

let idSequence = 0;
let clock = Date.parse('2026-06-24T10:00:00.000Z');
const app = createDirectiveRuntimeApp({
  host,
  packageLoader: async () => ({
    packages: [packageData],
    projections: [projection],
    crewDatasets: [{
      path: 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
      dataset: crewDataset
    }],
    missionGraphs
  }),
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-difficulty-${idSequence}`;
  },
  now() {
    const value = new Date(clock).toISOString();
    clock += 1000;
    return value;
  }
});

await app.initialize();
await app.startCreatorDraft({ packageId: packageData.manifest.id });
let view = await app.saveCreatorDraft({
  reason: 'difficultyRuntimeDraft',
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
        traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' },
        flawId: 'impatient'
      },
      dossier: {
        detailLevel: 'Standard',
        briefBiography: 'Talia Serrin is a tactical-minded Starfleet Commander whose war service taught her to make timely decisions without treating lives as expendable.',
        publicReputation: 'A decisive and observant officer known for increasingly measured restraint.'
      },
      settings: {
        simulationMode: 'Command'
      }
    }
  }
});
assert.equal(view.creator.canBeginCampaign, true);

view = await app.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });
assert.equal(view.campaignState.settings.simulationMode, 'Command');
assert.equal(host.prompt.inspect().status, 'installed');
const promptRevisionBefore = host.prompt.inspect().revision;
const commandLogBefore = stable(view.campaignState.commandLog.entries);
const turnLedgerBefore = stable(view.campaignState.turnLedger?.entries || []);

const changed = await app.updateCampaignDifficulty({
  simulationMode: 'Exploration',
  reason: 'runtime-test-soften'
});
assert.equal(changed.changed, true);
assert.equal(changed.previousMode, 'Command');
assert.equal(changed.simulationMode, 'Exploration');
assert.equal(changed.campaignState.settings.simulationMode, 'Exploration');
assert.equal(host.prompt.inspect().revision > promptRevisionBefore, true, 'campaign difficulty change should rebuild prompt context');
assert.equal(stable(changed.campaignState.commandLog.entries), commandLogBefore, 'difficulty change must not rewrite Command Log entries');
assert.equal(stable(changed.campaignState.turnLedger?.entries || []), turnLedgerBefore, 'difficulty change must not rewrite committed turn ledger entries');
assert.equal(
  changed.campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'campaignDifficultyChange'),
  false,
  'difficulty change must not write administrative events into recoveryJournal'
);
assert.equal(
  changed.campaignState.runtimeTracking.lifecycleJournal.some((entry) => entry.type === 'campaignDifficultyChange' && entry.details.nextMode === 'Exploration'),
  true,
  'difficulty change should leave a compact administrative lifecycle record'
);

const savesAfterChange = await listCampaignSaves(host.storage);
const activeSave = savesAfterChange.find((save) => save.id === changed.view.activeSaveId);
assert.equal(activeSave.metadata.simulationMode, 'Exploration');

const unchanged = await app.updateCampaignDifficulty({ simulationMode: 'Exploration' });
assert.equal(unchanged.changed, false);
assert.equal(unchanged.campaignState.settings.simulationMode, 'Exploration');

await assert.rejects(
  () => app.updateCampaignDifficulty({ simulationMode: 'Hardcore' }),
  /Campaign difficulty must be one of:/
);
const invalidModeView = await app.getCurrentView({ tabId: 'campaign' });
assert.equal(invalidModeView.campaignState.settings.simulationMode, 'Exploration');

const preview = await app.previewDirectorTurn({
  playerInput: 'I report to Captain Whitaker, acknowledge the active Hesperus situation, and coordinate a cautious response from the bridge.'
});
assert(preview.view.pendingDirectorTurn, 'preview should leave a pending Director outcome');

await assert.rejects(
  () => app.updateCampaignDifficulty({ simulationMode: 'Command' }),
  /Resolve or discard the pending outcome before changing campaign difficulty/
);

await app.discardProvisionalDirectorTurn();
const restoredCommand = await app.updateCampaignDifficulty({
  simulationMode: 'Command',
  reason: 'runtime-test-restore-command'
});
assert.equal(restoredCommand.changed, true);
assert.equal(restoredCommand.campaignState.settings.simulationMode, 'Command');
assert.equal(
  restoredCommand.campaignState.runtimeTracking.recoveryJournal.some((entry) => entry.type === 'campaignDifficultyChange'),
  false
);
assert.equal(
  restoredCommand.campaignState.runtimeTracking.lifecycleJournal.some((entry) => entry.type === 'campaignDifficultyChange' && entry.details.nextMode === 'Command'),
  true
);

console.log('Campaign difficulty runtime tests passed: campaign state update, prompt rebuild, save metadata, no retroactive rewrite, and pending-outcome blocking');
