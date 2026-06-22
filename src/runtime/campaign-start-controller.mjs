import {
  acceptCreatorDraftAndCreateFirstSave,
  autosaveGame,
  discardCharacterCreatorDraft,
  loadGame,
  resumeCharacterCreatorDraft,
  saveCharacterCreatorDraftProgress,
  saveGame,
  saveGameAs,
  startCharacterCreatorDraft
} from '../campaign/campaign-start-service.mjs';
import {
  createCharacterCreationContext,
  createCampaignPackageSummary
} from '../packages/campaign-package-context.mjs';
import {
  createCampaignPackageDiagnosticsSummary,
  diagnoseCampaignPackageRecord
} from '../packages/package-diagnostics.mjs';
import {
  cleanMissingStorageIndexRecords,
  diagnoseDirectiveStorage,
  initializeDirectiveStorage,
  loadCampaignSaveRecordFromStorage,
  listCampaignSaves,
  listCharacterCreatorDrafts,
  recoverActiveCampaignSave
} from '../storage/directive-storage-repository.mjs';

const DEFAULT_CREATOR_STEPS = ['identity', 'service', 'personality', 'review'];

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeRecordList(value, label) {
  if (Array.isArray(value)) {
    return value;
  }
  if (isObject(value)) {
    return Object.values(value);
  }
  throw new Error(`${label} must be an array or object map`);
}

function packageIdOf(packageData) {
  return createCampaignPackageSummary(packageData).packageId;
}

function projectionPackageId(projection) {
  return projection?.sourcePackage?.packageId || projection?.manifest?.packageId || null;
}

function createPackageRegistry({ packages, projections = [] }) {
  const packageMap = new Map();
  const projectionMap = new Map();

  for (const packageData of normalizeRecordList(packages, 'packages')) {
    const id = packageIdOf(packageData);
    if (packageMap.has(id)) {
      throw new Error(`Duplicate campaign package id "${id}"`);
    }
    packageMap.set(id, cloneJson(packageData));
  }

  for (const [key, projection] of Object.entries(
    Array.isArray(projections) ? Object.fromEntries(projections.map((item, index) => [index, item])) : projections
  )) {
    if (!projection) continue;
    requireObject(projection, `projections.${key}`);
    const id = projectionPackageId(projection) || (typeof key === 'string' ? key : null);
    if (!id || id === String(Number(id))) {
      throw new Error(`Projection "${key}" must identify a source package id`);
    }
    projectionMap.set(id, cloneJson(projection));
  }

  return {
    packageIds: [...packageMap.keys()],
    packages: [...packageMap.values()].map(cloneJson),
    diagnosePackages({ campaignState = null } = {}) {
      const diagnostics = {};
      for (const [id, packageData] of packageMap.entries()) {
        diagnostics[id] = diagnoseCampaignPackageRecord({
          packageData,
          projection: projectionMap.get(id) || null,
          campaignState: campaignState?.activeCampaignPackage?.packageId === id ? campaignState : null
        });
      }
      return diagnostics;
    },
    getPackage(packageId) {
      const id = requireNonEmptyString(packageId, 'packageId');
      const packageData = packageMap.get(id);
      if (!packageData) {
        throw new Error(`Unknown campaign package "${id}"`);
      }
      return cloneJson(packageData);
    },
    getProjection(packageId) {
      const id = requireNonEmptyString(packageId, 'packageId');
      const projection = projectionMap.get(id);
      if (!projection) {
        throw new Error(`Missing campaign projection for campaign package "${id}"`);
      }
      return cloneJson(projection);
    }
  };
}

function completedStepSet(draft) {
  return new Set(draft?.progress?.completedSteps || []);
}

function stepStateFor({ id, index, activeStep, completedSteps, firstIncompleteIndex }) {
  if (id === activeStep) return 'active';
  if (completedSteps.has(id)) return 'complete';
  if (index === firstIncompleteIndex) return 'available';
  return 'locked';
}

function creatorStepLabels(context) {
  const configured = context.flow?.steps;
  if (Array.isArray(configured) && configured.length > 0) {
    return configured;
  }
  return DEFAULT_CREATOR_STEPS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) }));
}

function createDraftSummary(entry) {
  return {
    id: entry.id,
    status: entry.status,
    revision: entry.revision,
    packageId: entry.packageId,
    packageTitle: entry.packageTitle,
    campaignId: entry.campaignId,
    campaignTitle: entry.campaignTitle,
    shipId: entry.shipId,
    shipName: entry.shipName,
    roleLabel: entry.roleLabel,
    activeStep: entry.activeStep,
    progress: cloneJson(entry.progress || {}),
    hasMeaningfulInput: entry.progress?.hasMeaningfulInput === true,
    updatedAt: entry.updatedAt,
    acceptedAt: entry.acceptedAt || null
  };
}

function createSaveSummary(entry) {
  return {
    id: entry.id,
    name: entry.name,
    slotType: entry.slotType,
    revision: entry.revision,
    updatedAt: entry.updatedAt,
    current: entry.current === true,
    metadata: cloneJson(entry.metadata || {})
  };
}

function firstByPackage(entries, packageId, getEntryPackageId) {
  return entries.find((entry) => getEntryPackageId(entry) === packageId) || null;
}

export function createCampaignViewModel({
  packages,
  drafts = [],
  saves = [],
  activePackageId = null,
  activeSaveId = null,
  packageDiagnostics = {},
  runtimeAssetSummaries = {}
}) {
  const draftSummaries = drafts.map(createDraftSummary);
  const saveSummaries = saves.map(createSaveSummary);
  const diagnosticsFor = (packageId) => {
    if (packageDiagnostics instanceof Map) {
      return packageDiagnostics.get(packageId) || null;
    }
    return packageDiagnostics?.[packageId] || null;
  };
  const runtimeAssetsFor = (packageId) => {
    if (runtimeAssetSummaries instanceof Map) {
      return runtimeAssetSummaries.get(packageId) || null;
    }
    return runtimeAssetSummaries?.[packageId] || null;
  };
  const packageCards = normalizeRecordList(packages, 'packages').map((packageData) => {
    const summary = createCampaignPackageSummary(packageData);
    const diagnostics = diagnosticsFor(summary.packageId);
    const runtimeAssets = runtimeAssetsFor(summary.packageId);
    const packageDrafts = draftSummaries.filter((draft) => draft.packageId === summary.packageId);
    const resumableDrafts = packageDrafts.filter((draft) => (
      draft.status === 'inProgress'
      && draft.progress?.hasMeaningfulInput === true
    ));
    const packageSaves = saveSummaries.filter((save) => save.metadata.packageId === summary.packageId);
    const latestDraft = firstByPackage(resumableDrafts, summary.packageId, (draft) => draft.packageId);
    const latestSave = firstByPackage(saveSummaries, summary.packageId, (save) => save.metadata.packageId);
    const canStartCampaign = runtimeAssets
      ? runtimeAssets.hasProjection === true
        && runtimeAssets.hasCrewDataset === true
        && runtimeAssets.hasGuardrails === true
        && runtimeAssets.hasCharacterCreationContext === true
        && runtimeAssets.hasPromptMetadata === true
        && Number(runtimeAssets.missionGraphCount || 0) > 0
      : true;

    return {
      ...summary,
      selected: activePackageId ? activePackageId === summary.packageId : false,
      source: runtimeAssets?.source || (summary.bundled ? 'bundled' : 'imported'),
      runtimeAssets: {
        hasProjection: runtimeAssets ? runtimeAssets.hasProjection === true : true,
        hasCrewDataset: runtimeAssets ? runtimeAssets.hasCrewDataset === true : false,
        hasGuardrails: runtimeAssets ? runtimeAssets.hasGuardrails === true : false,
        hasCharacterCreationContext: runtimeAssets ? runtimeAssets.hasCharacterCreationContext === true : false,
        hasPromptMetadata: runtimeAssets ? runtimeAssets.hasPromptMetadata === true : false,
        missionGraphCount: runtimeAssets ? Number(runtimeAssets.missionGraphCount || 0) : 0
      },
      counts: {
        drafts: packageDrafts.length,
        inProgressDrafts: packageDrafts.filter((draft) => draft.status !== 'accepted').length,
        saves: packageSaves.length
      },
      diagnostics: diagnostics ? createCampaignPackageDiagnosticsSummary(diagnostics) : {
        status: 'unknown',
        issueCount: 0,
        errorCount: 0,
        warningCount: 0
      },
      latestDraft,
      latestSave,
      actions: {
        startNewCampaign: canStartCampaign,
        resumeDraft: latestDraft ? latestDraft.id : null,
        loadLatestSave: latestSave ? latestSave.id : null
      }
    };
  });

  return {
    kind: 'directive.campaignView',
    activePackageId,
    activeSaveId,
    packages: packageCards,
    drafts: draftSummaries,
    saves: saveSummaries,
    emptyState: {
      noPackages: packageCards.length === 0,
      noDrafts: draftSummaries.length === 0,
      noSaves: saveSummaries.length === 0
    }
  };
}

export function createRuntimePackageContext(packageData) {
  const summary = createCampaignPackageSummary(packageData);
  return {
    ...summary,
    package: {
      id: summary.packageId,
      slug: summary.slug,
      title: summary.title,
      version: summary.version,
      status: summary.status,
      schemaVersion: packageData.manifest?.schemaVersion || 2
    },
    ship: cloneJson(packageData.ship),
    crew: cloneJson(packageData.crew),
    campaign: cloneJson(packageData.storyArcs?.campaign || {}),
    world: cloneJson(packageData.world || {}),
    storyArcs: cloneJson(packageData.storyArcs || {}),
    questTemplates: cloneJson(packageData.questTemplates || {}),
    threadTemplates: cloneJson(packageData.threadTemplates || {}),
    reactionRules: cloneJson(packageData.reactionRules || {}),
    directorCards: cloneJson(packageData.directorCards || {}),
    contextPolicy: cloneJson(packageData.contextPolicy || {}),
    guardrails: cloneJson(packageData.guardrails || {}),
    assets: cloneJson(packageData.assets || {})
  };
}

export function createCharacterCreatorViewModel({ packageData, draft }) {
  requireObject(draft, 'draft');
  const context = createCharacterCreationContext(packageData);
  const complete = completedStepSet(draft);
  const stepConfigs = creatorStepLabels(context);
  const stepIds = stepConfigs.map((step) => (typeof step === 'string' ? step : step.id));
  const activeStep = stepIds.includes(draft.activeStep) ? draft.activeStep : stepIds[0] || 'identity';
  const firstIncompleteIndex = stepIds.findIndex((id) => !complete.has(id));
  const steps = stepConfigs.map((step, index) => {
    const id = typeof step === 'string' ? step : step.id;
    const state = stepStateFor({
      id,
      index,
      activeStep,
      completedSteps: complete,
      firstIncompleteIndex: firstIncompleteIndex === -1 ? stepIds.length : firstIncompleteIndex
    });
    return {
      id,
      label: typeof step === 'string' ? step : step.label,
      complete: complete.has(id),
      active: activeStep === id,
      state,
      enabled: state !== 'locked'
    };
  });

  return {
    kind: 'directive.characterCreatorView',
    draft: {
      id: draft.id,
      status: draft.status,
      revision: draft.revision,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      acceptedAt: draft.acceptedAt || null,
      activeStep,
      autosave: cloneJson(draft.autosave || {})
    },
    package: cloneJson(context.package),
    campaign: cloneJson(context.campaign),
    ship: cloneJson(context.ship),
    role: {
      mode: context.roleMode,
      lockedRole: cloneJson(context.lockedRole),
      selectableRoles: cloneJson(context.selectableRoles || [])
    },
    steps,
    activeStep,
    input: cloneJson(draft.input || {}),
    progress: cloneJson(draft.progress || {}),
    requiredFields: cloneJson(context.fields.required),
    optionalFields: cloneJson(context.fields.optional),
    options: cloneJson(context.options),
    dossier: cloneJson(context.dossier),
    generationRules: cloneJson(context.generationRules),
    continuityGuardrails: cloneJson(context.continuityGuardrails),
    canBeginCampaign: draft.progress?.readyForCampaignStart === true && draft.status !== 'accepted'
  };
}

function createDefaultIdFactory() {
  let sequence = 0;
  return (prefix) => {
    sequence += 1;
    return `${prefix}-${Date.now()}-${sequence}`;
  };
}

function normalizeIdFactory(idFactory) {
  if (!idFactory) {
    return createDefaultIdFactory();
  }
  if (typeof idFactory === 'function') {
    return idFactory;
  }
  if (typeof idFactory.nextId === 'function') {
    return (prefix) => idFactory.nextId(prefix);
  }
  throw new Error('idFactory must be a function or provide nextId(prefix)');
}

function normalizeNow(now) {
  if (typeof now === 'function') {
    return now;
  }
  if (typeof now === 'string' && now.trim() !== '') {
    return () => now;
  }
  return () => new Date().toISOString();
}

export function createCampaignStartController({
  adapter,
  packages,
  projections = [],
  runtimeAssetSummaries = {},
  idFactory = null,
  now = null
}) {
  requireObject(adapter, 'adapter');
  const registry = createPackageRegistry({ packages, projections });
  const nextId = normalizeIdFactory(idFactory);
  const currentTime = normalizeNow(now);
  let activePackageId = registry.packageIds[0] || null;
  let activeSaveId = null;
  let activeCampaignState = null;
  let storageDiagnostics = null;

  async function loadLists() {
    await initializeDirectiveStorage(adapter, { now: currentTime() });
    const [drafts, saves] = await Promise.all([
      listCharacterCreatorDrafts(adapter),
      listCampaignSaves(adapter)
    ]);
    const currentSave = saves.find((save) => save.current === true);
    activeSaveId = currentSave?.id || activeSaveId;
    return { drafts, saves };
  }

  function packageForDraft(draft) {
    return registry.getPackage(draft.package?.id);
  }

  function packageForState(campaignState, fallbackPackageId = null) {
    const packageId = fallbackPackageId
      || campaignState?.activeCampaignPackage?.packageId
      || activePackageId;
    return registry.getPackage(packageId);
  }

  return {
    get packageIds() {
      return [...registry.packageIds];
    },

    get activePackageId() {
      return activePackageId;
    },

    get activeSaveId() {
      return activeSaveId;
    },

    get activeCampaignState() {
      return cloneJson(activeCampaignState);
    },

    get storageDiagnostics() {
      return cloneJson(storageDiagnostics);
    },

    getPackageContext({ packageId = activePackageId } = {}) {
      return createRuntimePackageContext(registry.getPackage(packageId));
    },

    async initialize({ recoverActiveSave = true } = {}) {
      await initializeDirectiveStorage(adapter, { now: currentTime() });
      if (recoverActiveSave) {
        const recovery = await recoverActiveCampaignSave(adapter, { now: currentTime() });
        if (recovery.campaignState) {
          activeCampaignState = cloneJson(recovery.campaignState);
          activeSaveId = recovery.activeSaveId;
          activePackageId = recovery.campaignState?.activeCampaignPackage?.packageId || activePackageId;
        }
      }
      storageDiagnostics = await diagnoseDirectiveStorage(adapter, { now: currentTime() });
      return this.getCampaignView();
    },

    async diagnoseStorage() {
      storageDiagnostics = await diagnoseDirectiveStorage(adapter, { now: currentTime() });
      return cloneJson(storageDiagnostics);
    },

    async verifyActiveSave({ saveId = activeSaveId } = {}) {
      const id = requireNonEmptyString(saveId, 'saveId');
      const checkedAt = currentTime();
      let saveRecord = null;
      const issues = [];
      try {
        saveRecord = await loadCampaignSaveRecordFromStorage(adapter, id);
      } catch (error) {
        issues.push({
          severity: 'error',
          code: error?.code || 'active-save-unreadable',
          message: error?.message || String(error),
          ownerId: id,
          kind: 'directive.campaignSave'
        });
      }
      storageDiagnostics = await diagnoseDirectiveStorage(adapter, { now: currentTime() });
      return {
        kind: 'directive.activeSaveVerification',
        checkedAt,
        saveId: id,
        ok: issues.length === 0 && saveRecord?.kind === 'directive.campaignSave',
        status: issues.length === 0 ? 'ok' : 'error',
        revision: saveRecord?.revision ?? null,
        updatedAt: saveRecord?.updatedAt || null,
        campaignId: saveRecord?.metadata?.campaignId || null,
        activeMissionId: saveRecord?.metadata?.activeMissionId || null,
        issues
      };
    },

    async exportActiveSave({ saveId = activeSaveId } = {}) {
      const id = requireNonEmptyString(saveId, 'saveId');
      const saveRecord = await loadCampaignSaveRecordFromStorage(adapter, id);
      return {
        kind: 'directive.activeSaveExport',
        exportedAt: currentTime(),
        saveId: id,
        fileName: `directive-save-${id}.json`,
        saveRecord: cloneJson(saveRecord)
      };
    },

    async cleanMissingStorageRecords() {
      const cleanup = await cleanMissingStorageIndexRecords(adapter, { now: currentTime() });
      storageDiagnostics = await diagnoseDirectiveStorage(adapter, { now: currentTime() });
      return cloneJson(cleanup);
    },

    async getCampaignView({ packageId = activePackageId } = {}) {
      if (packageId) {
        activePackageId = requireNonEmptyString(packageId, 'packageId');
      }
      const { drafts, saves } = await loadLists();
      return createCampaignViewModel({
        packages: registry.packages,
        drafts,
        saves,
        activePackageId,
        activeSaveId,
        packageDiagnostics: registry.diagnosePackages({ campaignState: activeCampaignState }),
        runtimeAssetSummaries
      });
    },

    async startCreatorDraft({
      packageId = activePackageId,
      draftId = nextId('creator-draft'),
      activeStep = 'identity'
    } = {}) {
      activePackageId = requireNonEmptyString(packageId, 'packageId');
      const assetSummary = runtimeAssetSummaries instanceof Map
        ? runtimeAssetSummaries.get(activePackageId)
        : runtimeAssetSummaries?.[activePackageId];
      if (assetSummary && (
        assetSummary.hasProjection !== true
        || assetSummary.hasCrewDataset !== true
        || assetSummary.hasGuardrails !== true
        || assetSummary.hasCharacterCreationContext !== true
        || assetSummary.hasPromptMetadata !== true
        || Number(assetSummary.missionGraphCount || 0) <= 0
      )) {
        throw new Error(`Campaign package "${activePackageId}" is missing projection, crew, guardrail, Character Creator, prompt, or mission assets required to start a campaign.`);
      }
      const packageData = registry.getPackage(activePackageId);
      const draft = await startCharacterCreatorDraft({
        adapter,
        packageData,
        draftId,
        activeStep,
        now: currentTime()
      });
      return {
        draft: cloneJson(draft),
        view: createCharacterCreatorViewModel({ packageData, draft })
      };
    },

    async saveCreatorDraft({
      draftId,
      patch,
      reason = 'manualSave'
    }) {
      const draft = await saveCharacterCreatorDraftProgress({
        adapter,
        draftId,
        patch,
        reason,
        now: currentTime()
      });
      activePackageId = draft.package?.id || activePackageId;
      return {
        draft: cloneJson(draft),
        view: createCharacterCreatorViewModel({
          packageData: packageForDraft(draft),
          draft
        })
      };
    },

    async resumeCreatorDraft({ draftId }) {
      const draft = await resumeCharacterCreatorDraft({ adapter, draftId });
      activePackageId = draft.package?.id || activePackageId;
      return {
        draft: cloneJson(draft),
        view: createCharacterCreatorViewModel({
          packageData: packageForDraft(draft),
          draft
        })
      };
    },

    async discardCreatorDraft({ draftId }) {
      return discardCharacterCreatorDraft({
        adapter,
        draftId: requireNonEmptyString(draftId, 'draftId'),
        now: currentTime()
      });
    },

    async acceptCreatorDraftAndStartCampaign({
      draftId,
      packageId = activePackageId,
      campaignId = nextId('campaign'),
      saveId = nextId('save'),
      simulationMode = 'Command'
    }) {
      activePackageId = requireNonEmptyString(packageId, 'packageId');
      const packageData = registry.getPackage(activePackageId);
      const projection = registry.getProjection(activePackageId);
      const result = await acceptCreatorDraftAndCreateFirstSave({
        adapter,
        packageData,
        projection,
        draftId,
        campaignId,
        saveId,
        simulationMode,
        now: currentTime()
      });
      activeCampaignState = cloneJson(result.campaignState);
      activeSaveId = result.firstSave.id;
      return cloneJson(result);
    },

    async saveCurrentGame({
      saveId = activeSaveId,
      campaignState = activeCampaignState,
      packageId = null,
      summary = null
    } = {}) {
      const id = requireNonEmptyString(saveId, 'saveId');
      requireObject(campaignState, 'campaignState');
      const packageData = packageForState(campaignState, packageId);
      const save = await saveGame({
        adapter,
        packageData,
        saveId: id,
        campaignState,
        summary,
        now: currentTime()
      });
      activeSaveId = save.id;
      activePackageId = save.metadata?.packageId || activePackageId;
      activeCampaignState = cloneJson(campaignState);
      return cloneJson(save);
    },

    async saveCurrentGameAs({
      sourceSaveId = activeSaveId,
      newSaveId = nextId('save'),
      name = null,
      branchFrom = null,
      campaignState = activeCampaignState,
      summary = null
    } = {}) {
      requireObject(campaignState, 'campaignState');
      const packageData = packageForState(campaignState);
      const save = await saveGameAs({
        adapter,
        sourceSaveId,
        newSaveId,
        name,
        now: currentTime(),
        branchFrom,
        campaignState,
        packageData,
        summary
      });
      if (save.current === true) {
        activeSaveId = save.id;
      }
      return cloneJson(save);
    },

    async autosaveCurrentGame({
      saveId = nextId('autosave'),
      campaignState = activeCampaignState,
      packageId = null,
      summary = null,
      keep = 3
    } = {}) {
      requireObject(campaignState, 'campaignState');
      const packageData = packageForState(campaignState, packageId);
      const result = await autosaveGame({
        adapter,
        packageData,
        saveId,
        campaignState,
        summary,
        keep,
        now: currentTime()
      });
      activePackageId = result.save.metadata?.packageId || activePackageId;
      activeCampaignState = cloneJson(campaignState);
      return cloneJson(result);
    },

    async loadGame({ saveId, markActive = true } = {}) {
      const id = requireNonEmptyString(saveId, 'saveId');
      const campaignState = await loadGame({
        adapter,
        saveId: id,
        markActive,
        now: currentTime()
      });
      activeCampaignState = cloneJson(campaignState);
      activePackageId = campaignState?.activeCampaignPackage?.packageId || activePackageId;
      if (markActive !== false) {
        activeSaveId = id;
      }
      return cloneJson(campaignState);
    }
  };
}
