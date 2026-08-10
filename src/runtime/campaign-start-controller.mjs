import {
  acceptCreatorDraftAndCreateFirstSave,
  createCampaignCheckpoint,
  discardCharacterCreatorDraft,
  persistActiveCampaign,
  resumeCharacterCreatorDraft,
  saveCharacterCreatorDraftProgress,
  startCharacterCreatorDraft
} from '../campaign/campaign-start-service.mjs';
import { createCharacterCreationContext, createCampaignPackageSummary } from '../packages/campaign-package-context.mjs';
import { ASHES_V1_PACKAGE_ID } from '../packages/bundled-package-registry.mjs';
import {
  createV1CampaignSave,
  deleteV1CampaignSave,
  initializeV1Storage,
  listV1CampaignSaves,
  listV1CreatorDrafts,
  loadActiveV1CampaignSave,
  loadV1CampaignSave,
  storeV1CampaignSave,
  verifyV1Storage
} from '../storage/v1-storage-repository.mjs';
import { assertV1CampaignState } from './v1-campaign-state.mjs';

const CREATOR_STEPS = Object.freeze(['identity', 'service', 'personality', 'review']);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function required(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} must be a non-empty string`);
  return text;
}

function normalizeNow(now) {
  if (typeof now === 'function') return now;
  if (typeof now === 'string' && now.trim()) return () => now;
  return () => new Date().toISOString();
}

function normalizeIdFactory(idFactory) {
  if (typeof idFactory === 'function') return idFactory;
  if (typeof idFactory?.nextId === 'function') return (prefix) => idFactory.nextId(prefix);
  let sequence = 0;
  return (prefix) => `${prefix}-${Date.now()}-${++sequence}`;
}

function packageId(packageData) {
  return packageData?.manifest?.id || null;
}

export function createRuntimePackageContext(packageData) {
  const summary = createCampaignPackageSummary(packageData);
  return {
    package: {
      id: summary.packageId,
      title: summary.title,
      version: summary.version,
      status: summary.status
    },
    campaign: clone(summary.campaign),
    ship: clone(summary.ship),
    crew: clone(packageData.crew || {}),
    guardrails: clone(packageData.guardrails || {}),
    assets: clone(packageData.assets || {})
  };
}

function stepState(draft, id, index) {
  const complete = new Set(draft.progress?.completedSteps || []);
  if (draft.activeStep === id) return 'active';
  if (complete.has(id)) return 'complete';
  const firstIncomplete = CREATOR_STEPS.findIndex((step) => !complete.has(step));
  return index === firstIncomplete ? 'available' : 'locked';
}

export function createCharacterCreatorViewModel({ packageData, draft }) {
  const context = createCharacterCreationContext(packageData);
  return {
    kind: 'directive.characterCreatorView.v1',
    draft: {
      id: draft.id,
      status: draft.status,
      revision: draft.revision,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      acceptedAt: draft.acceptedAt || null,
      activeStep: draft.activeStep,
      autosave: clone(draft.autosave || {})
    },
    package: clone(context.package),
    campaign: clone(context.campaign),
    ship: clone(context.ship),
    role: {
      mode: context.roleMode,
      lockedRole: clone(context.lockedRole),
      selectableRoles: clone(context.selectableRoles || [])
    },
    steps: CREATOR_STEPS.map((id, index) => {
      const state = stepState(draft, id, index);
      return {
        id,
        label: id[0].toUpperCase() + id.slice(1),
        complete: state === 'complete',
        active: state === 'active',
        state,
        enabled: state !== 'locked'
      };
    }),
    activeStep: draft.activeStep,
    input: clone(draft.input || {}),
    progress: clone(draft.progress || {}),
    requiredFields: clone(context.fields.required),
    optionalFields: clone(context.fields.optional),
    options: clone(context.options),
    dossier: clone(context.dossier),
    generationRules: clone(context.generationRules),
    continuityGuardrails: clone(context.continuityGuardrails),
    canBeginCampaign: draft.progress?.readyForCampaignStart === true && draft.status !== 'accepted'
  };
}

function campaignSummaryFromSave(save, activeSaveId, checkpoints) {
  return {
    id: save.campaignId,
    packageId: save.packageId,
    title: save.campaignTitle || 'Campaign',
    premise: null,
    playerName: save.playerName,
    playerRole: save.playerRole,
    shipName: save.shipName,
    chapter: save.chapter,
    stardate: save.stardate,
    lastPlayedAt: save.updatedAt,
    active: save.id === activeSaveId,
    canOpenChat: true,
    canSaveGame: save.id === activeSaveId,
    activeTimeline: { saveId: save.id, chatId: save.chatId },
    checkpoints: checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      name: checkpoint.name,
      chapter: checkpoint.chapter,
      stardate: checkpoint.stardate,
      createdAt: checkpoint.createdAt,
      loadable: true
    }))
  };
}

export function createCampaignViewModel({ campaignLibrary, drafts, saves, activeSaveId }) {
  const ashesDrafts = drafts.filter((draft) => draft.packageId === ASHES_V1_PACKAGE_ID && draft.status === 'inProgress');
  const packages = campaignLibrary.map((card) => ({
    ...clone(card),
    actions: card.packageId === ASHES_V1_PACKAGE_ID
      ? {
          startNewCampaign: true,
          resumeDraft: ashesDrafts[0]?.id || null
        }
      : { startNewCampaign: false, resumeDraft: null }
  }));
  const activeTimelines = saves.filter((save) => save.slotType === 'active' && save.packageId === ASHES_V1_PACKAGE_ID);
  const campaigns = activeTimelines.map((save) => campaignSummaryFromSave(
    save,
    activeSaveId,
    saves.filter((checkpoint) => checkpoint.slotType === 'checkpoint'
      && checkpoint.campaignId === save.campaignId
      && checkpoint.parentSaveId === save.id)
  ));
  return {
    kind: 'directive.campaignView.v1',
    packages,
    campaigns,
    drafts: clone(drafts),
    saves: clone(saves),
    activeSaveId
  };
}

export function createCampaignStartController({
  adapter,
  packages,
  missionDefinitions = [],
  campaignLibrary = [],
  idFactory = null,
  now = null
}) {
  if (!adapter) throw new Error('adapter is required');
  const packageRecords = Array.isArray(packages) ? packages : Object.values(packages || {});
  if (packageRecords.length !== 1 || packageId(packageRecords[0]) !== ASHES_V1_PACKAGE_ID) {
    throw new Error('Directive V1 runtime accepts exactly one playable package: Ashes of Peace.');
  }
  const packageData = clone(packageRecords[0]);
  const definitions = clone(missionDefinitions);
  const openingMissionId = packageData.manifest?.openingMissionId;
  const openingMatches = definitions.filter((definition) => (
    definition?.packageBinding?.sourceId === openingMissionId
    && definition?.packageBinding?.packageId === ASHES_V1_PACKAGE_ID
    && definition?.packageBinding?.packageVersion === packageData.manifest?.version
  ));
  if (openingMatches.length !== 1) {
    throw new Error('Directive V1 requires exactly one opening Ashes mission definition.');
  }
  const nextId = normalizeIdFactory(idFactory);
  const currentTime = normalizeNow(now);
  let activeSave = null;
  let activeState = null;
  let activeDraftId = null;

  async function refreshActive() {
    activeSave = await loadActiveV1CampaignSave(adapter);
    activeState = activeSave ? assertV1CampaignState(clone(activeSave.state)) : null;
    return activeSave;
  }

  return {
    async initialize() {
      await initializeV1Storage(adapter, { now: currentTime() });
      await refreshActive();
      return {
        recovered: Boolean(activeSave),
        activeSave: clone(activeSave),
        campaignState: clone(activeState)
      };
    },

    getActiveCampaignState: () => clone(activeState),
    getActiveSave: () => clone(activeSave),
    getActivePackage: () => clone(packageData),
    getActivePackageContext: () => createRuntimePackageContext(packageData),

    async getCampaignView() {
      const [drafts, saves, index] = await Promise.all([
        listV1CreatorDrafts(adapter),
        listV1CampaignSaves(adapter),
        initializeV1Storage(adapter, { now: currentTime() })
      ]);
      return createCampaignViewModel({ campaignLibrary, drafts, saves, activeSaveId: index.activeSaveId });
    },

    async startCreatorDraft({ packageId: requestedPackageId = ASHES_V1_PACKAGE_ID } = {}) {
      if (requestedPackageId !== ASHES_V1_PACKAGE_ID) throw new Error('Only Ashes of Peace is playable in Directive V1.');
      const draft = await startCharacterCreatorDraft({
        adapter,
        packageData,
        draftId: nextId('draft'),
        now: currentTime()
      });
      activeDraftId = draft.id;
      return { draft, view: createCharacterCreatorViewModel({ packageData, draft }) };
    },

    async resumeCreatorDraft({ draftId }) {
      const draft = await resumeCharacterCreatorDraft({ adapter, draftId });
      if (draft.package?.id !== ASHES_V1_PACKAGE_ID) throw new Error('Directive V1 rejects this Character Creator draft.');
      activeDraftId = draft.id;
      return { draft, view: createCharacterCreatorViewModel({ packageData, draft }) };
    },

    async saveCreatorDraft({ draftId = activeDraftId, patch, reason = 'manualSave' }) {
      const draft = await saveCharacterCreatorDraftProgress({
        adapter,
        draftId: required(draftId, 'draftId'),
        patch,
        reason,
        now: currentTime()
      });
      activeDraftId = draft.id;
      return { draft, view: createCharacterCreatorViewModel({ packageData, draft }) };
    },

    async discardCreatorDraft({ draftId = activeDraftId } = {}) {
      const result = await discardCharacterCreatorDraft({
        adapter,
        draftId: required(draftId, 'draftId'),
        now: currentTime()
      });
      if (activeDraftId === draftId) activeDraftId = null;
      return result;
    },

    async acceptCreatorDraftAndStartCampaign({
      draftId = activeDraftId,
      simulationMode = 'Command'
    } = {}) {
      const result = await acceptCreatorDraftAndCreateFirstSave({
        adapter,
        packageData,
        missionDefinitions: definitions,
        draftId: required(draftId, 'draftId'),
        campaignId: nextId('campaign'),
        saveId: nextId('save'),
        simulationMode,
        now: currentTime()
      });
      activeSave = clone(result.firstSave);
      activeState = clone(result.campaignState);
      activeDraftId = null;
      return clone(result);
    },

    async persistActiveCampaign({ campaignState = activeState, saveId = activeSave?.id, name = null } = {}) {
      const save = await persistActiveCampaign({
        adapter,
        saveId: required(saveId, 'saveId'),
        campaignState: assertV1CampaignState(campaignState),
        name,
        now: currentTime()
      });
      activeSave = clone(save);
      activeState = clone(save.state);
      return clone(save);
    },

    async createCheckpoint({ name, campaignState = activeState } = {}) {
      if (!activeSave) throw new Error('No active V1 campaign is available.');
      return createCampaignCheckpoint({
        adapter,
        checkpointId: nextId('checkpoint'),
        activeSaveId: activeSave.id,
        campaignState: assertV1CampaignState(campaignState),
        name: required(name, 'name'),
        now: currentTime()
      });
    },

    async bindCheckpointChat({ checkpointId, binding } = {}) {
      const checkpoint = await loadV1CampaignSave(adapter, required(checkpointId, 'checkpointId'));
      if (checkpoint.slotType !== 'checkpoint') throw new Error('The selected V1 save is not a checkpoint.');
      const nextState = clone(checkpoint.state);
      nextState.campaignChatBinding = {
        ...clone(binding),
        kind: 'directive.campaignChatBinding.v1',
        version: 1,
        campaignId: checkpoint.campaignId,
        saveId: checkpoint.parentSaveId,
        status: 'bound'
      };
      const next = createV1CampaignSave({
        id: checkpoint.id,
        name: checkpoint.name,
        slotType: 'checkpoint',
        parentSaveId: checkpoint.parentSaveId,
        state: nextState,
        createdAt: checkpoint.createdAt,
        updatedAt: currentTime()
      });
      await storeV1CampaignSave(adapter, next, { makeActive: false });
      return clone(next);
    },

    async loadCheckpoint({ checkpointId } = {}) {
      const checkpoint = await loadV1CampaignSave(adapter, required(checkpointId, 'checkpointId'));
      if (checkpoint.slotType !== 'checkpoint') throw new Error('The selected V1 save is not a checkpoint.');
      if (!activeSave || activeSave.slotType !== 'active') throw new Error('No active V1 timeline is available.');
      const state = clone(checkpoint.state);
      if (state.campaignChatBinding) {
        state.campaignChatBinding.saveId = activeSave.id;
        state.campaignChatBinding.chatId = null;
        state.campaignChatBinding.status = 'unbound';
      }
      const timeline = createV1CampaignSave({
        id: activeSave.id,
        name: activeSave.name,
        state,
        createdAt: activeSave.createdAt,
        updatedAt: currentTime()
      });
      await storeV1CampaignSave(adapter, timeline);
      activeSave = clone(timeline);
      activeState = clone(state);
      return { timeline: clone(timeline), checkpoint: clone(checkpoint) };
    },

    async deleteSave({ checkpointId = null, saveId = null } = {}) {
      const id = required(checkpointId || saveId, 'saveId');
      if (id === activeSave?.id) throw new Error('The active V1 timeline cannot be deleted while it is open.');
      const save = await loadV1CampaignSave(adapter, id);
      const deletion = await deleteV1CampaignSave(adapter, id, { now: currentTime() });
      return {
        ...deletion,
        slotType: save.slotType,
        campaignChatBinding: clone(save.state?.campaignChatBinding || null)
      };
    },

    async loadGame({ saveId } = {}) {
      const save = await loadV1CampaignSave(adapter, required(saveId, 'saveId'), {
        makeActive: true,
        now: currentTime()
      });
      if (save.slotType !== 'active') throw new Error('Load checkpoints through loadCheckpoint.');
      activeSave = clone(save);
      activeState = clone(save.state);
      return clone(save.state);
    },

    verifyStorage: () => verifyV1Storage(adapter)
  };
}
