import fs from 'node:fs';
import path from 'node:path';
import {
  acceptCreatorDraftAndCreateFirstSave,
  autosaveGame,
  loadGame,
  resumeCharacterCreatorDraft,
  saveCharacterCreatorDraftProgress,
  saveGame,
  saveGameAs,
  saveTerminalBranch,
  startCharacterCreatorDraft
} from '../../src/campaign/campaign-start-service.mjs';
import {
  DIRECTIVE_STORAGE_PATHS,
  getDirectiveStorageIndexes,
  listCampaignSaves,
  listCharacterCreatorDrafts
} from '../../src/storage/directive-storage-repository.mjs';

const root = process.cwd();
const errors = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function stable(value) {
  return JSON.stringify(value);
}

function at(location, message) {
  errors.push(`${location}: ${message}`);
}

function requireEqual(actual, expected, location) {
  if (stable(actual) !== stable(expected)) {
    at(location, `got ${stable(actual)}, expected ${stable(expected)}`);
  }
}

function requireIncludes(values, expected, location) {
  if (!Array.isArray(values) || !values.includes(expected)) {
    at(location, `missing "${expected}"`);
  }
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
    snapshot() {
      return Object.fromEntries([...files.entries()].map(([key, value]) => [key, cloneJson(value)]));
    }
  };
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const adapter = createMemoryJsonAdapter();

const draft = await startCharacterCreatorDraft({
  adapter,
  packageData,
  draftId: 'creator-draft-service',
  now: '2026-06-18T20:00:00.000Z'
});
requireEqual(draft.status, 'inProgress', 'new draft status');
requireEqual(draft.activeStep, 'identity', 'new draft activeStep');

await saveCharacterCreatorDraftProgress({
  adapter,
  draftId: draft.id,
  now: '2026-06-18T20:03:00.000Z',
  reason: 'manualSave',
  patch: {
    activeStep: 'service',
    input: {
      identity: {
        name: 'Ren Okada',
        pronounsOrAddress: 'he/him',
        speciesId: 'human',
        ageBandId: 'mid-career',
        appearance: 'Rested, deliberate, and visibly attentive to junior officers.'
      }
    }
  }
});

let resumed = await resumeCharacterCreatorDraft({ adapter, draftId: draft.id });
requireEqual(resumed.input.identity.name, 'Ren Okada', 'resume partial draft name');
requireEqual(resumed.progress.identityComplete, true, 'resume partial draft identityComplete');
requireEqual(resumed.progress.readyForCampaignStart, false, 'resume partial draft not ready');
requireEqual((await listCharacterCreatorDrafts(adapter))[0].activeStep, 'service', 'draft list activeStep');

await saveCharacterCreatorDraftProgress({
  adapter,
  draftId: draft.id,
  now: '2026-06-18T20:11:00.000Z',
  reason: 'autosave',
  patch: {
    activeStep: 'review',
    input: {
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
        briefBiography: 'Ren Okada is a tactical-minded Starfleet Commander whose Dominion War service left him intolerant of vague orders and avoidable risk. He learned to read rooms quickly, speak plainly, and make decisions before hesitation became its own casualty. The same qualities that make him useful aboard the Breckenridge can make him impatient when reconstruction politics slow urgent work. His transfer gives the ship an executive officer with hard-earned operational discipline and a need to prove that decisiveness can serve peace rather than only survival.',
        publicReputation: 'Ren Okada is regarded as a decisive wartime officer still learning how his instincts fit the demands of postwar reconstruction.'
      }
    }
  }
});

resumed = await resumeCharacterCreatorDraft({ adapter, draftId: draft.id });
requireEqual(resumed.progress.readyForCampaignStart, true, 'resume complete draft ready');

const started = await acceptCreatorDraftAndCreateFirstSave({
  adapter,
  packageData,
  projection,
  draftId: draft.id,
  campaignId: 'campaign-service-test',
  saveId: 'save-service-first',
  now: '2026-06-18T20:15:00.000Z',
  simulationMode: 'Command'
});

requireEqual(started.acceptedDraft.status, 'accepted', 'accepted draft status');
requireEqual(started.campaignState.player.name, 'Ren Okada', 'started campaign player');
requireEqual(started.campaignState.settings.simulationMode, 'Command', 'started campaign simulationMode');
requireEqual(started.firstSave.slotType, 'firstSave', 'started first save slotType');
requireEqual(started.firstSave.metadata.playerName, 'Ren Okada', 'started first save metadata playerName');

const mutatedState = cloneJson(started.campaignState);
mutatedState.campaign.currentStardate = 53051.7;
mutatedState.commandLog.entries.push({
  id: 'manual.test-entry',
  summaryInputs: ['Ren Okada reviewed the first mission plan.'],
  visibleConsequences: ['Manual test save point.']
});

const saved = await saveGame({
  adapter,
  packageData,
  saveId: started.firstSave.id,
  campaignState: mutatedState,
  now: '2026-06-18T20:20:00.000Z',
  summary: 'Manual command review save.'
});
requireEqual(saved.revision, 2, 'saveGame revision');
requireEqual(saved.metadata.stardate, 53051.7, 'saveGame stardate');
requireEqual(saved.metadata.summary, 'Manual command review save.', 'saveGame summary');

const branch = await saveGameAs({
  adapter,
  sourceSaveId: saved.id,
  newSaveId: 'save-service-branch',
  name: 'Ren Okada - Alternate Briefing',
  now: '2026-06-18T20:25:00.000Z'
});
requireEqual(branch.id, 'save-service-branch', 'saveGameAs id');
requireEqual(branch.name, 'Ren Okada - Alternate Briefing', 'saveGameAs name');

const terminalBranch = await saveTerminalBranch({
  adapter,
  sourceSaveId: saved.id,
  newSaveId: 'save-service-terminal-branch',
  name: 'Ren Okada - Terminal Timeline',
  now: '2026-06-18T20:26:00.000Z',
  branchFrom: {
    divergenceOutcomeId: 'outcome.terminal-test'
  },
  campaignState: mutatedState,
  packageData,
  summary: 'Terminal timeline preserved.',
  terminalOutcomeId: 'terminal.ashes.breck-destroyed-objective-saved',
  terminalDecisionId: 'terminal-decision:test',
  terminalConditionId: 'terminal.ashes.breck-destroyed-objective-saved'
});
requireEqual(terminalBranch.current, false, 'saveTerminalBranch current false');
requireEqual(terminalBranch.metadata.branch.kind, 'terminalTimeline', 'saveTerminalBranch branch kind');
requireEqual(terminalBranch.metadata.branch.terminalOutcomeId, 'terminal.ashes.breck-destroyed-objective-saved', 'saveTerminalBranch terminalOutcomeId');

const autosaveIds = [];
for (let index = 0; index < 4; index += 1) {
  const autosaveState = cloneJson(mutatedState);
  autosaveState.campaign.currentStardate = 53052 + index;
  const autosave = await autosaveGame({
    adapter,
    packageData,
    saveId: `save-service-autosave-${index + 1}`,
    campaignState: autosaveState,
    now: `2026-06-18T20:2${index + 6}:00.000Z`,
    summary: `Service autosave ${index + 1}.`
  });
  autosaveIds.push(autosave.save.id);
}

let saveList = await listCampaignSaves(adapter);
requireEqual(saveList.length, 6, 'service save list length');
requireIncludes(saveList.map((entry) => entry.id), saved.id, 'service save list first');
requireIncludes(saveList.map((entry) => entry.id), branch.id, 'service save list branch');
requireIncludes(saveList.map((entry) => entry.id), terminalBranch.id, 'service save list terminal branch');
requireEqual(saveList.filter((entry) => entry.slotType === 'autosave').length, 3, 'service autosave rolling cap');
requireEqual(saveList.some((entry) => entry.id === autosaveIds[0]), false, 'service prunes oldest autosave');

const loaded = await loadGame({
  adapter,
  saveId: saved.id,
  now: '2026-06-18T20:30:00.000Z'
});
requireEqual(loaded.player.name, 'Ren Okada', 'loadGame player');
requireEqual(loaded.campaign.currentStardate, 53051.7, 'loadGame stardate');
loaded.player.name = 'Changed';

const indexes = await getDirectiveStorageIndexes(adapter);
requireEqual(indexes.saveIndex.activeSaveId, saved.id, 'loadGame active save id');
requireEqual(indexes.saveIndex.saves[saved.id].current, true, 'loadGame current save');
requireEqual(indexes.saveIndex.saves[branch.id].current, false, 'loadGame branch no longer current');
requireEqual(indexes.saveIndex.saves[terminalBranch.id].current, false, 'loadGame terminal branch remains non-current');
requireEqual(indexes.saveIndex.saves[terminalBranch.id].metadata.branch.kind, 'terminalTimeline', 'save index terminal branch kind');
requireEqual(Object.values(indexes.saveIndex.saves).filter((entry) => entry.slotType === 'autosave').every((entry) => entry.current === false), true, 'autosaves remain non-current after loadGame');

const snapshot = adapter.snapshot();
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.saveIndex].saves[saved.id].metadata.playerName, 'Ren Okada', 'save index persisted playerName');
requireEqual(snapshot[DIRECTIVE_STORAGE_PATHS.creatorDraftIndex].drafts[draft.id].status, 'accepted', 'draft index accepted status');
requireEqual(snapshot[indexes.saveIndex.saves[saved.id].path].payload.campaignState.player.name, 'Ren Okada', 'loadGame clone isolation');

saveList = await listCampaignSaves(adapter);
requireEqual(saveList[0].metadata.playerName, 'Ren Okada', 'service save list metadata retained');

if (errors.length > 0) {
  console.error('Campaign start service test failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Campaign start service tests passed: draft resume, first save, save, save as, autosave, load');
