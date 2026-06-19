import {
  acceptCharacterCreatorDraftRecord,
  createCharacterCreatorDraftRecord,
  saveCharacterCreatorDraftRecord
} from '../creators/character-creator-draft.mjs';
import { createInitialCampaignStateFromCreatorReview } from './campaign-start.mjs';
import {
  createCampaignSaveAsRecord,
  createAutosaveCampaignSaveRecord,
  createFirstCampaignSaveRecord,
  overwriteCampaignSaveRecord
} from '../storage/save-records.mjs';
import {
  loadCampaignSaveFromStorage,
  loadCampaignSaveRecordFromStorage,
  loadCharacterCreatorDraftFromStorage,
  pruneCampaignAutosaves,
  storeCampaignSave,
  storeCharacterCreatorDraft
} from '../storage/directive-storage-repository.mjs';

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function isoNow() {
  return new Date().toISOString();
}

function timestamp(options = {}) {
  return options.now || options.savedAt || isoNow();
}

export async function startCharacterCreatorDraft({
  adapter,
  packageData,
  draftId,
  now,
  activeStep = 'identity'
}) {
  const createdAt = timestamp({ now });
  const draft = createCharacterCreatorDraftRecord({
    packageData,
    draftId,
    createdAt,
    activeStep
  });
  await storeCharacterCreatorDraft(adapter, draft);
  return draft;
}

export async function saveCharacterCreatorDraftProgress({
  adapter,
  draftId,
  patch,
  now,
  reason = 'manualSave'
}) {
  const existing = await loadCharacterCreatorDraftFromStorage(adapter, draftId);
  const draft = saveCharacterCreatorDraftRecord(existing, patch, {
    savedAt: timestamp({ now }),
    reason
  });
  await storeCharacterCreatorDraft(adapter, draft);
  return draft;
}

export async function resumeCharacterCreatorDraft({ adapter, draftId }) {
  return loadCharacterCreatorDraftFromStorage(adapter, draftId);
}

export async function acceptCreatorDraftAndCreateFirstSave({
  adapter,
  packageData,
  projection,
  draftId,
  campaignId,
  saveId,
  now,
  simulationMode = 'Command'
}) {
  const acceptedAt = timestamp({ now });
  const draft = await loadCharacterCreatorDraftFromStorage(adapter, draftId);
  const acceptedDraft = acceptCharacterCreatorDraftRecord(draft, { acceptedAt });
  await storeCharacterCreatorDraft(adapter, acceptedDraft);

  const campaignState = createInitialCampaignStateFromCreatorReview({
    packageData,
    projection,
    creatorReview: acceptedDraft.acceptedReview,
    campaignId: requireNonEmptyString(campaignId, 'campaignId'),
    createdAt: acceptedAt,
    simulationMode,
    creatorDraftId: acceptedDraft.id
  });

  const firstSave = createFirstCampaignSaveRecord({
    campaignState,
    packageData,
    saveId,
    savedAt: acceptedAt
  });
  await storeCampaignSave(adapter, firstSave);

  return {
    acceptedDraft,
    campaignState,
    firstSave
  };
}

export async function saveGame({
  adapter,
  packageData,
  saveId,
  campaignState,
  now,
  summary = null
}) {
  const existing = await loadCampaignSaveRecordFromStorage(adapter, saveId);
  const save = overwriteCampaignSaveRecord(existing, {
    campaignState,
    packageData,
    savedAt: timestamp({ now }),
    summary
  });
  await storeCampaignSave(adapter, save);
  return save;
}

export async function saveGameAs({
  adapter,
  sourceSaveId,
  newSaveId,
  name = null,
  now
}) {
  const existing = await loadCampaignSaveRecordFromStorage(adapter, sourceSaveId);
  const save = createCampaignSaveAsRecord(existing, {
    newSaveId,
    name,
    savedAt: timestamp({ now })
  });
  await storeCampaignSave(adapter, save);
  return save;
}

export async function autosaveGame({
  adapter,
  packageData,
  saveId,
  campaignState,
  now,
  summary = null,
  keep = 3
}) {
  const savedAt = timestamp({ now });
  const save = createAutosaveCampaignSaveRecord({
    campaignState,
    packageData,
    saveId,
    savedAt,
    summary
  });
  await storeCampaignSave(adapter, save);
  const prune = await pruneCampaignAutosaves(adapter, {
    campaignId: campaignState.campaign?.id,
    keep,
    now: savedAt
  });
  return {
    save,
    prune
  };
}

export async function loadGame({
  adapter,
  saveId,
  now,
  markActive = true
}) {
  return loadCampaignSaveFromStorage(adapter, saveId, {
    now: timestamp({ now }),
    markActive
  });
}
