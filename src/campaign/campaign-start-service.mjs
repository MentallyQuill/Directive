import {
  acceptCharacterCreatorDraftRecord,
  createCharacterCreatorDraftRecord,
  saveCharacterCreatorDraftRecord
} from '../creators/character-creator-draft.mjs';
import { createInitialCampaignStateFromCreatorReview } from './campaign-start.mjs';
import {
  createV1CampaignSave,
  deleteV1CampaignSave,
  deleteV1CreatorDraft,
  loadV1CampaignSave,
  loadV1CreatorDraft,
  storeV1CampaignSave,
  storeV1CreatorDraft
} from '../storage/v1-storage-repository.mjs';
import { assertV1CampaignState } from '../runtime/v1-campaign-state.mjs';

function required(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} must be a non-empty string`);
  return text;
}

function stamp(value) {
  const text = required(value || new Date().toISOString(), 'timestamp');
  if (Number.isNaN(Date.parse(text))) throw new Error('timestamp must be an ISO timestamp');
  return text;
}

export async function startCharacterCreatorDraft({
  adapter,
  packageData,
  draftId,
  now,
  activeStep = 'identity'
}) {
  const draft = createCharacterCreatorDraftRecord({
    packageData,
    draftId,
    createdAt: stamp(now),
    activeStep
  });
  return storeV1CreatorDraft(adapter, draft);
}

export async function saveCharacterCreatorDraftProgress({
  adapter,
  draftId,
  patch,
  now,
  reason = 'manualSave'
}) {
  const current = await loadV1CreatorDraft(adapter, draftId);
  const draft = saveCharacterCreatorDraftRecord(current, patch, {
    savedAt: stamp(now),
    reason
  });
  return storeV1CreatorDraft(adapter, draft);
}

export function resumeCharacterCreatorDraft({ adapter, draftId }) {
  return loadV1CreatorDraft(adapter, draftId);
}

export function discardCharacterCreatorDraft({ adapter, draftId, now }) {
  return deleteV1CreatorDraft(adapter, draftId, { now: stamp(now) });
}

export function deleteGame({ adapter, saveId, now }) {
  return deleteV1CampaignSave(adapter, saveId, { now: stamp(now) });
}

export async function acceptCreatorDraftAndCreateFirstSave({
  adapter,
  packageData,
  draftId,
  campaignId,
  saveId,
  now,
  simulationMode = 'Command'
}) {
  const acceptedAt = stamp(now);
  const draft = await loadV1CreatorDraft(adapter, draftId);
  const acceptedDraft = acceptCharacterCreatorDraftRecord(draft, { acceptedAt });
  await storeV1CreatorDraft(adapter, acceptedDraft);

  const campaignState = createInitialCampaignStateFromCreatorReview({
    packageData,
    creatorReview: acceptedDraft.acceptedReview,
    campaignId: required(campaignId, 'campaignId'),
    createdAt: acceptedAt,
    simulationMode,
    creatorDraftId: acceptedDraft.id
  });
  assertV1CampaignState(campaignState);
  const firstSave = await storeV1CampaignSave(adapter, createV1CampaignSave({
    id: required(saveId, 'saveId'),
    name: `${campaignState.player?.name || 'Commander'} - ${campaignState.campaign?.title || 'Campaign'}`,
    slotType: 'active',
    state: campaignState,
    createdAt: acceptedAt
  }));
  return { acceptedDraft, campaignState, firstSave };
}

export async function persistActiveCampaign({
  adapter,
  saveId,
  campaignState,
  now,
  name = null
}) {
  assertV1CampaignState(campaignState);
  const savedAt = stamp(now);
  let createdAt = savedAt;
  let savedName = name;
  try {
    const existing = await loadV1CampaignSave(adapter, saveId);
    if (existing.slotType !== 'active') throw new Error('An active campaign cannot overwrite a checkpoint.');
    createdAt = existing.createdAt;
    savedName ||= existing.name;
  } catch (error) {
    if (!/was not found/.test(String(error?.message || ''))) throw error;
  }
  return storeV1CampaignSave(adapter, createV1CampaignSave({
    id: saveId,
    name: savedName || `${campaignState.player?.name || 'Commander'} - ${campaignState.campaign?.title || 'Campaign'}`,
    state: campaignState,
    createdAt,
    updatedAt: savedAt
  }));
}

export async function createCampaignCheckpoint({
  adapter,
  checkpointId,
  activeSaveId,
  campaignState,
  name,
  now
}) {
  assertV1CampaignState(campaignState);
  const createdAt = stamp(now);
  return storeV1CampaignSave(adapter, createV1CampaignSave({
    id: required(checkpointId, 'checkpointId'),
    name: required(name, 'name'),
    slotType: 'checkpoint',
    parentSaveId: required(activeSaveId, 'activeSaveId'),
    state: campaignState,
    createdAt
  }), { makeActive: false });
}

export async function loadGame({ adapter, saveId }) {
  const save = await loadV1CampaignSave(adapter, saveId);
  return save.state;
}
