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
  compareAndSwapActiveV1CampaignSave,
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
import {
  deleteTimelineOperation,
  loadTimelineOperation,
  storeTimelineOperation
} from './timeline-operation-journal.mjs';

const CREATOR_STEPS = Object.freeze(['identity', 'service', 'personality', 'review']);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function required(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} must be a non-empty string`);
  return text;
}

function campaignDeletionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
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
  const savedGames = checkpoints.map((checkpoint) => ({
    id: checkpoint.id,
    name: checkpoint.name,
    chapter: checkpoint.chapter,
    stardate: checkpoint.stardate,
    createdAt: checkpoint.createdAt,
    loadable: true
  }));
  return {
    id: save.campaignId,
    packageId: save.packageId,
    title: save.campaignTitle || save.state?.campaign?.title || 'Campaign',
    premise: null,
    playerName: save.playerName || save.state?.player?.name || null,
    playerRole: save.playerRole || save.state?.player?.role || save.state?.player?.billet || null,
    shipName: save.shipName || save.state?.ship?.name || null,
    chapter: save.chapter || save.state?.mission?.activeMissionId || null,
    stardate: save.stardate || save.state?.campaign?.currentStardate || null,
    lastPlayedAt: save.updatedAt,
    active: save.id === activeSaveId,
    canOpenChat: true,
    canSaveGame: save.id === activeSaveId,
    characterName: save.state?.campaignChatBinding?.entityName || null,
    activeTimeline: { saveId: save.id, chatId: save.chatId || save.state?.campaignChatBinding?.chatId || null },
    savedGames,
    checkpoints: clone(savedGames)
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
  const activeTimelines = saves.filter((save) => (
    save.slotType === 'active'
    && save.id === activeSaveId
    && save.packageId === ASHES_V1_PACKAGE_ID
  ));
  const campaigns = activeTimelines.map((save) => campaignSummaryFromSave(
    save,
    activeSaveId,
    saves.filter((checkpoint) => checkpoint.slotType === 'checkpoint'
      && checkpoint.campaignId === save.campaignId)
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

  async function requireCurrentActiveTimeline() {
    const index = await initializeV1Storage(adapter, { now: currentTime() });
    if (!activeSave || index.activeSaveId !== activeSave.id) {
      const error = new Error('The active campaign timeline changed in another Directive runtime.');
      error.code = 'DIRECTIVE_TIMELINE_PARENT_STALE';
      error.details = {
        expectedSaveId: activeSave?.id || null,
        actualSaveId: index.activeSaveId || null
      };
      throw error;
    }
    return index;
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
      const [drafts, saveSummaries, index] = await Promise.all([
        listV1CreatorDrafts(adapter),
        listV1CampaignSaves(adapter),
        initializeV1Storage(adapter, { now: currentTime() })
      ]);
      const activeSaves = await Promise.all(saveSummaries
        .filter((save) => save.slotType === 'active')
        .map((save) => loadV1CampaignSave(adapter, save.id)));
      const saves = [
        ...activeSaves,
        ...saveSummaries.filter((save) => save.slotType !== 'active')
      ];
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
      await requireCurrentActiveTimeline();
      const checkpointId = nextId('checkpoint');
      try {
        return await createCampaignCheckpoint({
          adapter,
          checkpointId,
          activeSaveId: activeSave.id,
          campaignState: assertV1CampaignState(campaignState),
          name: required(name, 'name'),
          now: currentTime()
        });
      } catch (error) {
        try {
          await deleteV1CampaignSave(adapter, checkpointId, { now: currentTime() });
        } catch (cleanupError) {
          error.cleanupError = cleanupError;
        }
        throw error;
      }
    },

    async prepareTimelineCheckpoint({ name, checkpointId = null, campaignState = activeState } = {}) {
      if (!activeSave || activeSave.slotType !== 'active') throw new Error('No active V1 timeline is available.');
      await requireCurrentActiveTimeline();
      const requestedName = required(name, 'name');
      if (checkpointId) {
        try {
          const existing = await loadV1CampaignSave(adapter, checkpointId);
          if (existing.slotType !== 'checkpoint'
            || existing.parentSaveId !== activeSave.id
            || JSON.stringify(existing.state) !== JSON.stringify(campaignState)) {
            throw new Error('The existing timeline checkpoint does not match this operation.');
          }
          await storeV1CampaignSave(adapter, existing, { makeActive: false });
          return clone(existing);
        } catch (error) {
          if (!/was not found/i.test(String(error?.message || ''))) throw error;
        }
      }
      const saves = await listV1CampaignSaves(adapter);
      const usedNames = new Set(saves
        .filter((save) => save.campaignId === activeSave.campaignId && save.slotType === 'checkpoint')
        .map((save) => String(save.name || '').trim().toLowerCase()));
      let uniqueName = requestedName;
      for (let suffix = 2; usedNames.has(uniqueName.toLowerCase()); suffix += 1) uniqueName = `${requestedName} (${suffix})`;
      return createCampaignCheckpoint({
        adapter,
        checkpointId: checkpointId || nextId('checkpoint'),
        activeSaveId: activeSave.id,
        campaignState: assertV1CampaignState(campaignState),
        name: uniqueName,
        now: currentTime()
      });
    },

    async persistInactiveTimeline({ save } = {}) {
      const record = createV1CampaignSave({
        id: required(save?.id, 'save.id'),
        name: save?.name,
        slotType: 'active',
        state: assertV1CampaignState(save?.state),
        createdAt: save?.createdAt || currentTime(),
        updatedAt: save?.updatedAt || currentTime()
      });
      if (activeSave && record.campaignId !== activeSave.campaignId) {
        throw new Error('An inactive timeline must belong to the active campaign.');
      }
      await storeV1CampaignSave(adapter, record, { makeActive: false });
      return clone(record);
    },

    async activatePersistedTimeline({ expectedSaveId, nextSaveId } = {}) {
      await compareAndSwapActiveV1CampaignSave(adapter, {
        expectedSaveId: required(expectedSaveId, 'expectedSaveId'),
        nextSaveId: required(nextSaveId, 'nextSaveId'),
        now: currentTime()
      });
      await refreshActive();
      return { activeSave: clone(activeSave), campaignState: clone(activeState) };
    },

    async renameSavedGame({ savedGameId, name } = {}) {
      const current = await loadV1CampaignSave(adapter, required(savedGameId, 'savedGameId'));
      if (current.slotType !== 'checkpoint') throw new Error('Only an immutable saved game can be renamed.');
      const renamed = createV1CampaignSave({
        id: current.id,
        name: required(name, 'name'),
        slotType: 'checkpoint',
        parentSaveId: current.parentSaveId,
        state: current.state,
        createdAt: current.createdAt,
        updatedAt: currentTime()
      });
      await storeV1CampaignSave(adapter, renamed, { makeActive: false });
      return clone(renamed);
    },

    async retireSupersededTimeline({ saveId } = {}) {
      const id = required(saveId, 'saveId');
      const index = await initializeV1Storage(adapter, { now: currentTime() });
      if (index.activeSaveId === id) throw new Error('The active V1 timeline cannot be retired.');
      return deleteV1CampaignSave(adapter, id, { now: currentTime() });
    },

    storeTimelineOperation: (operation) => storeTimelineOperation(adapter, operation),
    loadTimelineOperation: ({ campaignId }) => loadTimelineOperation(adapter, required(campaignId, 'campaignId')),
    deleteTimelineOperation: ({ campaignId }) => deleteTimelineOperation(adapter, required(campaignId, 'campaignId')),
    loadSaveRecord: ({ saveId }) => loadV1CampaignSave(adapter, required(saveId, 'saveId')),
    getStorageIndex: () => initializeV1Storage(adapter, { now: currentTime() }),

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
      const campaignChatBinding = clone(save.state?.campaignChatBinding || null);
      return {
        ...deletion,
        slotType: save.slotType,
        campaignChatBinding,
        checkpointChatIsDistinct: save.slotType === 'checkpoint'
          && Boolean(campaignChatBinding?.chatId)
          && campaignChatBinding.chatId !== activeState?.campaignChatBinding?.chatId
      };
    },

    async prepareCampaignDeletion({ campaignId, saveId = null } = {}) {
      const expectedCampaignId = required(campaignId, 'campaignId');
      const expectedSaveId = saveId ? required(saveId, 'saveId') : null;
      const [saves, index] = await Promise.all([
        listV1CampaignSaves(adapter),
        initializeV1Storage(adapter, { now: currentTime() })
      ]);
      const summary = saves.find((candidate) => (
        candidate.slotType === 'active'
        && candidate.id === index.activeSaveId
        && candidate.campaignId === expectedCampaignId
        && (!expectedSaveId || candidate.id === expectedSaveId)
      ));
      if (!summary) {
        throw campaignDeletionError(
          'DIRECTIVE_CAMPAIGN_DELETE_TARGET_NOT_FOUND',
          'The selected V1 campaign was not found.'
        );
      }
      const save = await loadV1CampaignSave(adapter, summary.id);
      const binding = clone(save.state?.campaignChatBinding || null);
      const entityId = String(binding?.entityId ?? '').trim();
      const entityName = String(binding?.entityName ?? '').trim();
      const exactCharacterBinding = binding?.kind === 'directive.campaignChatBinding.v1'
        && binding.version === 1
        && binding.status === 'bound'
        && binding.entityType === 'character'
        && Boolean(entityId)
        && Boolean(entityName)
        && binding.campaignId === save.campaignId
        && binding.saveId === save.id;
      if (!exactCharacterBinding) {
        throw campaignDeletionError(
          'DIRECTIVE_CAMPAIGN_DELETE_CHARACTER_REQUIRED',
          'The selected campaign has no exact SillyTavern character binding.'
        );
      }
      return {
        campaignId: save.campaignId,
        saveId: save.id,
        checkpointIds: saves
          .filter((candidate) => (
            candidate.slotType === 'checkpoint'
            && candidate.campaignId === save.campaignId
          ))
          .map((candidate) => candidate.id),
        saveIds: saves
          .filter((candidate) => candidate.campaignId === save.campaignId)
          .map((candidate) => candidate.id),
        campaignChatBinding: binding
      };
    },

    async deleteCampaign({ campaignId, saveId } = {}) {
      const target = await this.prepareCampaignDeletion({ campaignId, saveId });
      for (const recordId of target.saveIds.filter((id) => id !== target.saveId)) {
        await deleteV1CampaignSave(adapter, recordId, { now: currentTime() });
      }
      const activeDeletion = await deleteV1CampaignSave(adapter, target.saveId, { now: currentTime() });
      if (activeSave?.id === target.saveId) {
        activeSave = null;
        activeState = null;
      }
      return {
        deleted: activeDeletion.deleted,
        campaignId: target.campaignId,
        saveId: target.saveId,
        checkpointIds: clone(target.checkpointIds)
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
