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
  deleteCampaignSaveFromStorage,
  deleteCharacterCreatorDraftFromStorage,
  pruneCampaignAutosaves,
  storeCampaignSave,
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

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

async function persistSaveRuntimeV2(adapter, {
  save,
  campaignState,
  packageData,
  summary = null,
  reason,
  now
}) {
  await persistActiveCampaignStateV2(adapter, {
    saveRecord: save,
    campaignState,
    packageData,
    summary,
    reason,
    now
  });
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

  const firstSave = createFirstCampaignSaveRecord({
    campaignState,
    packageData,
    saveId,
    savedAt: acceptedAt
  });
  await storeCampaignSave(adapter, firstSave);
  await persistSaveRuntimeV2(adapter, {
    save: firstSave,
    campaignState,
    packageData,
    summary: firstSave.metadata?.summary || null,
    reason: 'first-save-runtime-v2',
    now: acceptedAt
  });

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
  await persistSaveRuntimeV2(adapter, {
    save,
    campaignState,
    packageData,
    summary,
    reason: 'manual-save-runtime-v2',
    now: save.updatedAt
  });
  return save;
}

export async function saveGameAs({
  adapter,
  sourceSaveId,
  newSaveId,
  name = null,
  now,
  branchFrom = null,
  campaignState = null,
  packageData = null,
  summary = null,
  current = true,
  branchMetadata = null
}) {
  const existing = await loadCampaignSaveRecordFromStorage(adapter, sourceSaveId);
  const resolvedCampaignState = campaignState || await loadCampaignSaveFromStorage(adapter, sourceSaveId, {
    now: timestamp({ now }),
    markActive: false
  });
  const save = createCampaignSaveAsRecord(existing, {
    newSaveId,
    name,
    savedAt: timestamp({ now }),
    branchFrom,
    campaignState: resolvedCampaignState,
    packageData,
    summary,
    current,
    branchMetadata
  });
  await storeCampaignSave(adapter, save);
  await persistSaveRuntimeV2(adapter, {
    save,
    campaignState: save.payload?.campaignState,
    packageData: packageData || existing.payload?.packageData || null,
    summary,
    reason: 'save-as-runtime-v2',
    now: save.updatedAt
  });
  return save;
}

export async function saveTerminalBranch({
  adapter,
  sourceSaveId,
  newSaveId,
  name = null,
  now,
  branchFrom = null,
  campaignState = null,
  packageData = null,
  summary = null,
  terminalOutcomeId = null,
  terminalDecisionId = null,
  terminalConditionId = null
}) {
  const branchState = campaignState
    ? {
        ...cloneJson(campaignState),
        campaignChatBinding: campaignState.campaignChatBinding
          ? {
              ...cloneJson(campaignState.campaignChatBinding),
              saveId: newSaveId
            }
          : campaignState.campaignChatBinding
      }
    : campaignState;
  return saveGameAs({
    adapter,
    sourceSaveId,
    newSaveId,
    name,
    now,
    branchFrom,
    campaignState: branchState,
    packageData,
    summary,
    current: false,
    branchMetadata: {
      kind: 'terminalTimeline',
      reason: 'terminalOutcomeDecision',
      terminalOutcomeId,
      terminalDecisionId,
      terminalConditionId
    }
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
  const save = createAutosaveCampaignSaveRecord({
    campaignState,
    packageData,
    saveId,
    savedAt,
    summary
  });
  await storeCampaignSave(adapter, save);
  await persistSaveRuntimeV2(adapter, {
    save,
    campaignState,
    packageData,
    summary,
    reason: 'autosave-runtime-v2',
    now: savedAt
  });
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
