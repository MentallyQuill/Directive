import {
  acceptCharacterCreatorDraftRecord,
  createCharacterCreatorDraftRecord,
  saveCharacterCreatorDraftRecord
} from '../creators/character-creator-draft.mjs';
import { createInitialCampaignStateFromCreatorReview } from './campaign-start.mjs';
import { createCampaignSaveMetadata } from '../storage/save-records.mjs';
import {
  loadCampaignSaveFromStorage,
  loadCharacterCreatorDraftFromStorage,
  deleteCampaignSaveFromStorage,
  deleteCharacterCreatorDraftFromStorage,
  pruneCampaignAutosaves,
  storeCharacterCreatorDraft
} from '../storage/directive-storage-repository.mjs';
import { persistActiveCampaignStateV2 } from '../storage/active-save-facade-v2.mjs';

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

export async function discardCharacterCreatorDraft({ adapter, draftId, now }) {
  return deleteCharacterCreatorDraftFromStorage(adapter, draftId, {
    now: timestamp({ now })
  });
}

export async function deleteGame({ adapter, saveId, now }) {
  return deleteCampaignSaveFromStorage(adapter, saveId, {
    now: timestamp({ now })
  });
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

  const firstPersist = await persistActiveCampaignStateV2(adapter, {
    saveRecord: {
      kind: 'directive.saveManifest.v2',
      id: requireNonEmptyString(saveId, 'saveId'),
      saveId,
      name: `${campaignState.player?.name || 'Commander'} - ${campaignState.campaign?.title || 'Campaign'}`,
      current: true,
      branchId: saveId,
      metadata: createCampaignSaveMetadata({
        campaignState,
        packageData,
        savedAt: acceptedAt
      })
    },
    campaignState,
    packageData,
    summary: null,
    reason: 'first-save-runtime-v2',
    current: true,
    createIndexEntry: true,
    updateSaveIndex: true,
    name: `${campaignState.player?.name || 'Commander'} - ${campaignState.campaign?.title || 'Campaign'}`,
    slotType: 'active',
    now: acceptedAt
  });

  return {
    acceptedDraft,
    campaignState,
    firstSave: firstPersist.saveIndexEntry
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
  const savedAt = timestamp({ now });
  return persistActiveCampaignStateV2(adapter, {
    saveRecord: {
      kind: 'directive.saveManifest.v2',
      id: requireNonEmptyString(saveId, 'saveId'),
      saveId,
      current: true,
      branchId: saveId,
      metadata: createCampaignSaveMetadata({
        campaignState,
        packageData,
        savedAt,
        summary
      })
    },
    campaignState,
    packageData,
    summary,
    reason: 'manual-save-runtime-v2',
    current: true,
    updateSaveIndex: true,
    now: savedAt
  });
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
  const persist = await persistActiveCampaignStateV2(adapter, {
    saveRecord: {
      kind: 'directive.saveManifest.v2',
      id: requireNonEmptyString(saveId, 'saveId'),
      saveId,
      name: `Autosave - ${campaignState.player?.name || campaignState.campaign?.title || saveId}`,
      current: false,
      branchId: campaignState?.campaignChatBinding?.saveId || saveId,
      metadata: createCampaignSaveMetadata({
        campaignState,
        packageData,
        savedAt,
        summary
      })
    },
    campaignState,
    packageData,
    summary,
    reason: 'autosave-runtime-v2',
    current: false,
    createIndexEntry: true,
    updateSaveIndex: true,
    name: `Autosave - ${campaignState.player?.name || campaignState.campaign?.title || saveId}`,
    slotType: 'autosave',
    now: savedAt
  });
  const prune = await pruneCampaignAutosaves(adapter, {
    campaignId: campaignState.campaign?.id,
    keep,
    now: savedAt
  });
  return {
    save: persist.saveIndexEntry,
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
