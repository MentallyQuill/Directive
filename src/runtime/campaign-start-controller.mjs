import {
  acceptCreatorDraftAndCreateFirstSave,
  loadGame,
  resumeCharacterCreatorDraft,
  saveCharacterCreatorDraftProgress,
  saveGame,
  saveGameAs,
  startCharacterCreatorDraft
} from '../campaign/campaign-start-service.mjs';
import {
  createCharacterCreationContext,
  createStarshipPackageSummary
} from '../packages/starship-package-context.mjs';
import {
  initializeDirectiveStorage,
  listCampaignSaves,
  listCharacterCreatorDrafts
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
  return createStarshipPackageSummary(packageData).packageId;
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
      throw new Error(`Duplicate starship package id "${id}"`);
    }
    packageMap.set(id, cloneJson(packageData));
  }

  for (const [key, projection] of Object.entries(
    Array.isArray(projections) ? Object.fromEntries(projections.map((item, index) => [index, item])) : projections
  )) {
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
    getPackage(packageId) {
      const id = requireNonEmptyString(packageId, 'packageId');
      const packageData = packageMap.get(id);
      if (!packageData) {
        throw new Error(`Unknown starship package "${id}"`);
      }
      return cloneJson(packageData);
    },
    getProjection(packageId) {
      const id = requireNonEmptyString(packageId, 'packageId');
      const projection = projectionMap.get(id);
      if (!projection) {
        throw new Error(`Missing campaign projection for starship package "${id}"`);
      }
      return cloneJson(projection);
    }
  };
}

function completedStepSet(draft) {
  return new Set(draft?.progress?.completedSteps || []);
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

export function createStarshipsViewModel({
  packages,
  drafts = [],
  saves = [],
  activePackageId = null,
  activeSaveId = null
}) {
  const draftSummaries = drafts.map(createDraftSummary);
  const saveSummaries = saves.map(createSaveSummary);
  const packageCards = normalizeRecordList(packages, 'packages').map((packageData) => {
    const summary = createStarshipPackageSummary(packageData);
    const packageDrafts = draftSummaries.filter((draft) => draft.packageId === summary.packageId);
    const packageSaves = saveSummaries.filter((save) => save.metadata.packageId === summary.packageId);
    const latestDraft = firstByPackage(draftSummaries, summary.packageId, (draft) => draft.packageId);
    const latestSave = firstByPackage(saveSummaries, summary.packageId, (save) => save.metadata.packageId);

    return {
      ...summary,
      selected: activePackageId ? activePackageId === summary.packageId : false,
      counts: {
        drafts: packageDrafts.length,
        inProgressDrafts: packageDrafts.filter((draft) => draft.status !== 'accepted').length,
        saves: packageSaves.length
      },
      latestDraft,
      latestSave,
      actions: {
        startNewCampaign: true,
        resumeDraft: latestDraft && latestDraft.status !== 'accepted' ? latestDraft.id : null,
        loadLatestSave: latestSave ? latestSave.id : null
      }
    };
  });

  return {
    kind: 'directive.starshipsView',
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

export function createCharacterCreatorViewModel({ packageData, draft }) {
  requireObject(draft, 'draft');
  const context = createCharacterCreationContext(packageData);
  const complete = completedStepSet(draft);
  const steps = creatorStepLabels(context).map((step) => {
    const id = typeof step === 'string' ? step : step.id;
    return {
      id,
      label: typeof step === 'string' ? step : step.label,
      complete: complete.has(id),
      active: draft.activeStep === id
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
      activeStep: draft.activeStep,
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
    activeStep: draft.activeStep,
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
      || campaignState?.activeStarshipPackage?.packageId
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

    async initialize() {
      await initializeDirectiveStorage(adapter, { now: currentTime() });
      return this.getStarshipsView();
    },

    async getStarshipsView({ packageId = activePackageId } = {}) {
      if (packageId) {
        activePackageId = requireNonEmptyString(packageId, 'packageId');
      }
      const { drafts, saves } = await loadLists();
      return createStarshipsViewModel({
        packages: registry.packages,
        drafts,
        saves,
        activePackageId,
        activeSaveId
      });
    },

    async startCreatorDraft({
      packageId = activePackageId,
      draftId = nextId('creator-draft'),
      activeStep = 'identity'
    } = {}) {
      activePackageId = requireNonEmptyString(packageId, 'packageId');
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
      name = null
    } = {}) {
      const save = await saveGameAs({
        adapter,
        sourceSaveId,
        newSaveId,
        name,
        now: currentTime()
      });
      if (save.current === true) {
        activeSaveId = save.id;
      }
      return cloneJson(save);
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
      activePackageId = campaignState?.activeStarshipPackage?.packageId || activePackageId;
      if (markActive !== false) {
        activeSaveId = id;
      }
      return cloneJson(campaignState);
    }
  };
}
