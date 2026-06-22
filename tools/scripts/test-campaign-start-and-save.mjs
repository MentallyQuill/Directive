import fs from 'node:fs';
import path from 'node:path';
import {
  acceptCharacterCreatorDraftRecord,
  createCharacterCreatorDraftRecord,
  createCreatorReviewFromDraft,
  getCharacterCreatorDraftProgress,
  loadCharacterCreatorDraftRecord,
  saveCharacterCreatorDraftRecord
} from '../../src/creators/character-creator-draft.mjs';
import { createInitialCampaignStateFromCreatorReview } from '../../src/campaign/campaign-start.mjs';
import {
  createCampaignSaveAsRecord,
  createFirstCampaignSaveRecord,
  createSaveListEntry,
  loadCampaignSaveRecord,
  overwriteCampaignSaveRecord
} from '../../src/storage/save-records.mjs';

const root = process.cwd();
const errors = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
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

function requireThrows(fn, expectedText, location) {
  try {
    fn();
    at(location, `expected throw containing "${expectedText}"`);
  } catch (error) {
    if (!String(error.message).includes(expectedText)) {
      at(location, `got "${error.message}", expected text "${expectedText}"`);
    }
  }
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.starship-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const packageBefore = stable(packageData);
const projectionBefore = stable(projection);

const draft = createCharacterCreatorDraftRecord({
  packageData,
  draftId: 'creator-draft-test',
  createdAt: '2026-06-18T18:00:00.000Z'
});

requireEqual(draft.kind, 'directive.characterCreatorDraft', 'draft kind');
requireEqual(draft.status, 'inProgress', 'draft status');
requireEqual(draft.roleMode, 'lockedRole', 'draft roleMode');
requireEqual(draft.lockedRole.rank, 'Commander', 'draft lockedRole.rank');
requireEqual(draft.progress.readyForCampaignStart, false, 'draft initial readyForCampaignStart');

const partialDraft = saveCharacterCreatorDraftRecord(draft, {
  activeStep: 'service',
  input: {
    identity: {
      name: 'Ari Valez',
      pronounsOrAddress: 'they/them',
      speciesId: 'trill',
      ageBandId: 'mid-career',
      appearance: 'Calm, precise, and usually composed in a dark-shouldered command uniform.',
      firstImpression: 'Measured, observant, and hard to rush.'
    }
  }
}, {
  savedAt: '2026-06-18T18:05:00.000Z',
  reason: 'manualSave'
});

requireEqual(partialDraft.revision, 2, 'partial draft revision');
requireEqual(partialDraft.activeStep, 'service', 'partial draft activeStep');
requireEqual(partialDraft.progress.identityComplete, true, 'partial draft identityComplete');
requireEqual(partialDraft.progress.readyForCampaignStart, false, 'partial draft readyForCampaignStart');
requireIncludes(partialDraft.autosave.history.map((entry) => entry.reason), 'manualSave', 'partial draft autosave history');

const restoredPartial = loadCharacterCreatorDraftRecord(partialDraft);
restoredPartial.input.identity.name = 'Changed';
requireEqual(partialDraft.input.identity.name, 'Ari Valez', 'draft restore clone isolation');

requireThrows(
  () => createCreatorReviewFromDraft(partialDraft),
  'not ready for campaign start',
  'incomplete draft review creation'
);

const completeDraft = saveCharacterCreatorDraftRecord(partialDraft, {
  activeStep: 'review',
  input: {
    service: {
      careerBackgroundId: 'operations-logistics',
      formativeExperienceId: 'disaster-relief-evacuation',
      assignmentReasonId: 'relevant-specialist-experience',
      mustBeTrueFact: 'They once coordinated an evacuation under communications blackout.'
    },
    personality: {
      traits: {
        insight: 'analytical',
        connection: 'candid',
        execution: 'resourceful'
      },
      flawId: 'guarded',
      additionalGenerationNote: 'Keep the biography restrained and professional.'
    },
    dossier: {
      detailLevel: 'Standard',
      identitySummary: 'Ari Valez is a Trill Starfleet Commander assigned as XO of the Breckenridge.',
      serviceSummary: 'Operations and logistics specialist shaped by disaster relief and evacuation work.',
      briefBiography: 'Ari Valez built their Starfleet career around logistics, evacuation discipline, and the quiet work of keeping crews and civilians alive when plans fail. Their record includes difficult relief assignments where communications, supplies, and trust all broke down at once. That experience made them comfortable with imperfect information and careful delegation, but it also left them guarded when others ask for personal reassurance before the work is done. Starfleet selected Valez for the Breckenridge because the Asterion Reach needs an executive officer who can coordinate reconstruction pressure without mistaking order for peace.',
      traits: 'Analytical, candid, resourceful; guarded under personal pressure.',
      publicReputation: 'Ari Valez is known as a capable logistics-minded Commander with a direct manner and a strong record in relief operations.',
      optionalOpenThread: 'A former relief colleague may still be serving somewhere in the Asterion theater.',
      editedByPlayer: true
    }
  }
}, {
  savedAt: '2026-06-18T18:20:00.000Z',
  reason: 'autosave'
});

const progress = getCharacterCreatorDraftProgress(completeDraft);
requireEqual(progress.completedSteps, ['identity', 'service', 'personality', 'review'], 'complete draft completedSteps');
requireEqual(progress.readyForCampaignStart, true, 'complete draft readyForCampaignStart');

const acceptedDraft = acceptCharacterCreatorDraftRecord(completeDraft, {
  acceptedAt: '2026-06-18T18:25:00.000Z'
});
requireEqual(acceptedDraft.status, 'accepted', 'accepted draft status');
requireEqual(acceptedDraft.acceptedReview.identity.name, 'Ari Valez', 'accepted review name');
requireThrows(
  () => saveCharacterCreatorDraftRecord(acceptedDraft, {}, { savedAt: '2026-06-18T18:26:00.000Z' }),
  'accepted',
  'accepted draft cannot be modified'
);

const campaignState = createInitialCampaignStateFromCreatorReview({
  packageData,
  projection,
  creatorReview: acceptedDraft.acceptedReview,
  campaignId: 'campaign-ashes-test',
  createdAt: '2026-06-18T18:30:00.000Z',
  simulationMode: 'Exploration',
  creatorDraftId: acceptedDraft.id
});

requireEqual(campaignState.campaign.id, 'campaign-ashes-test', 'campaign id');
requireEqual(campaignState.campaign.status, 'activating', 'campaign status before host activation');
requireEqual(campaignState.campaign.characterCreatorDraftId, acceptedDraft.id, 'campaign creatorDraftId');
requireEqual(campaignState.player.creationStatus, 'complete', 'campaign player creationStatus');
requireEqual(campaignState.player.name, 'Ari Valez', 'campaign player name');
requireEqual(campaignState.player.rank, 'Commander', 'campaign player rank');
requireEqual(campaignState.player.billet, 'Executive Officer', 'campaign player billet');
requireEqual(campaignState.player.species.label, 'Trill', 'campaign player species');
requireEqual(campaignState.player.service.careerBackground.id, 'operations-logistics', 'campaign careerBackground');
requireEqual(campaignState.player.personality.traits.connection.id, 'candid', 'campaign connection trait');
requireEqual(campaignState.player.dossier.editedByPlayer, true, 'campaign dossier editedByPlayer');
requireEqual(campaignState.settings.simulationMode, 'Exploration', 'campaign simulationMode');
requireEqual(campaignState.ui.activeTab, 'Mission', 'campaign active tab');
requireEqual(campaignState.commandLog.entries.at(-1).type, 'campaignStart', 'campaign command log start entry');

requireThrows(
  () => createInitialCampaignStateFromCreatorReview({
    packageData,
    projection,
    creatorReview: partialDraft.input,
    campaignId: 'bad-campaign',
    createdAt: '2026-06-18T18:30:00.000Z'
  }),
  'not ready',
  'partial creator review rejected'
);

const firstSave = createFirstCampaignSaveRecord({
  campaignState,
  packageData,
  saveId: 'save-ashes-first',
  savedAt: '2026-06-18T18:31:00.000Z'
});

requireEqual(firstSave.kind, 'directive.campaignSave', 'first save kind');
requireEqual(firstSave.slotType, 'firstSave', 'first save slotType');
requireEqual(firstSave.metadata.playerName, 'Ari Valez', 'first save metadata playerName');
requireEqual(firstSave.metadata.packageTitle, 'U.S.S. Breckenridge: Ashes of Peace', 'first save metadata packageTitle');
requireEqual(firstSave.metadata.stardate, 53049.2, 'first save metadata stardate');
requireEqual(firstSave.metadata.simulationMode, 'Exploration', 'first save metadata simulationMode');

const loadedState = loadCampaignSaveRecord(firstSave);
loadedState.player.name = 'Changed';
requireEqual(firstSave.payload.campaignState.player.name, 'Ari Valez', 'load save clone isolation');

const updatedCampaignState = {
  ...campaignState,
  campaign: {
    ...campaignState.campaign,
    currentStardate: 53050.1
  }
};
const overwrittenSave = overwriteCampaignSaveRecord(firstSave, {
  campaignState: updatedCampaignState,
  packageData,
  savedAt: '2026-06-18T18:40:00.000Z',
  summary: 'Manual save after character review.'
});
requireEqual(overwrittenSave.id, firstSave.id, 'overwrite keeps save id');
requireEqual(overwrittenSave.revision, 2, 'overwrite revision');
requireEqual(overwrittenSave.metadata.stardate, 53050.1, 'overwrite metadata stardate');
requireEqual(overwrittenSave.metadata.summary, 'Manual save after character review.', 'overwrite metadata summary');

const saveAs = createCampaignSaveAsRecord(overwrittenSave, {
  newSaveId: 'save-ashes-copy',
  name: 'Ari Valez - Ashes Manual Branch',
  savedAt: '2026-06-18T18:45:00.000Z'
});
requireEqual(saveAs.id, 'save-ashes-copy', 'save as id');
requireEqual(saveAs.name, 'Ari Valez - Ashes Manual Branch', 'save as name');
requireEqual(saveAs.revision, 1, 'save as revision');
requireEqual(saveAs.payload.campaignState.player.name, 'Ari Valez', 'save as payload');

const listEntry = createSaveListEntry(saveAs);
requireEqual(listEntry.id, saveAs.id, 'save list id');
requireEqual(listEntry.metadata.playerName, 'Ari Valez', 'save list playerName');
delete listEntry.metadata.playerName;
requireEqual(saveAs.metadata.playerName, 'Ari Valez', 'save list clone isolation');

requireEqual(stable(packageData), packageBefore, 'package template immutability');
requireEqual(stable(projection), projectionBefore, 'projection template immutability');

if (errors.length > 0) {
  console.error('Campaign start and save test failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Campaign start and save tests passed: creator draft, campaign start, first save, save as, overwrite, load');
