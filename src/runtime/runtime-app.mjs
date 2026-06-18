import { createDirectiveFileStorageAdapter } from '../storage/directive-file-api.mjs';
import { createCampaignStartController } from './campaign-start-controller.mjs';

export const BUNDLED_STARSHIP_PACKAGE_REFS = Object.freeze([
  {
    packageUrl: new URL('../../packages/bundled/breckinridge/ashes-of-peace.starship-package.json', import.meta.url),
    projectionUrl: new URL('../../packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json', import.meta.url)
  }
]);

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

function defaultFetchImpl() {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Fetch is not available for Directive bundled package loading.');
  }
  return globalThis.fetch.bind(globalThis);
}

function defaultIdFactory() {
  let sequence = 0;
  return (prefix) => {
    sequence += 1;
    const randomPart = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    return `${prefix}-${Date.now()}-${sequence}-${randomPart}`;
  };
}

export async function fetchJsonAsset(url, { fetchImpl = defaultFetchImpl() } = {}) {
  const response = await fetchImpl(url);
  if (!response?.ok) {
    throw new Error(`Directive package asset failed to load: HTTP ${response?.status || 0}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`Directive package asset is not valid JSON: ${error?.message || error}`);
  }
}

export async function loadBundledStarshipPackageRecords({
  refs = BUNDLED_STARSHIP_PACKAGE_REFS,
  fetchImpl = defaultFetchImpl()
} = {}) {
  const packages = [];
  const projections = [];
  for (const ref of refs) {
    packages.push(await fetchJsonAsset(ref.packageUrl, { fetchImpl }));
    projections.push(await fetchJsonAsset(ref.projectionUrl, { fetchImpl }));
  }
  return { packages, projections };
}

export function createDirectiveRuntimeApp({
  adapter = createDirectiveFileStorageAdapter(),
  packageLoader = loadBundledStarshipPackageRecords,
  idFactory = defaultIdFactory(),
  now = null
} = {}) {
  requireObject(adapter, 'adapter');
  if (typeof packageLoader !== 'function') {
    throw new Error('packageLoader must be a function');
  }

  let initialized = false;
  let controller = null;
  let starshipsView = null;
  let creatorView = null;
  let campaignState = null;
  let activeCreatorDraftId = null;
  let activeScreen = 'starships';
  let lastError = null;

  async function ensureInitialized() {
    if (initialized) return;
    const { packages, projections } = await packageLoader();
    controller = createCampaignStartController({
      adapter,
      packages,
      projections,
      idFactory,
      now
    });
    starshipsView = await controller.initialize();
    initialized = true;
  }

  async function refreshStarshipsView() {
    await ensureInitialized();
    starshipsView = await controller.getStarshipsView();
    return cloneJson(starshipsView);
  }

  function viewEnvelope(tabId) {
    return {
      kind: 'directive.runtimeView',
      activeTab: tabId,
      activeScreen,
      activePackageId: controller?.activePackageId || starshipsView?.activePackageId || null,
      activeSaveId: controller?.activeSaveId || starshipsView?.activeSaveId || null,
      starships: cloneJson(starshipsView),
      creator: cloneJson(creatorView),
      campaignState: cloneJson(campaignState),
      lastError: lastError ? {
        message: lastError.message || String(lastError)
      } : null
    };
  }

  async function run(operation) {
    try {
      lastError = null;
      return await operation();
    } catch (error) {
      lastError = error;
      throw error;
    }
  }

  return {
    async initialize() {
      return run(async () => {
        await ensureInitialized();
        return viewEnvelope('starships');
      });
    },

    async getCurrentView({ tabId = 'starships' } = {}) {
      return run(async () => {
        await ensureInitialized();
        if (tabId === 'starships' && activeScreen !== 'creator') {
          await refreshStarshipsView();
        }
        return viewEnvelope(tabId);
      });
    },

    async startCreatorDraft({ packageId = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const result = await controller.startCreatorDraft({
          packageId: packageId || controller.activePackageId
        });
        activeCreatorDraftId = result.draft.id;
        creatorView = result.view;
        activeScreen = 'creator';
        await refreshStarshipsView();
        return viewEnvelope('starships');
      });
    },

    async resumeCreatorDraft({ draftId }) {
      return run(async () => {
        await ensureInitialized();
        const result = await controller.resumeCreatorDraft({
          draftId: requireNonEmptyString(draftId, 'draftId')
        });
        activeCreatorDraftId = result.draft.id;
        creatorView = result.view;
        activeScreen = 'creator';
        return viewEnvelope('starships');
      });
    },

    async saveCreatorDraft({ patch, reason = 'manualSave' }) {
      return run(async () => {
        await ensureInitialized();
        requireObject(patch, 'patch');
        const result = await controller.saveCreatorDraft({
          draftId: requireNonEmptyString(activeCreatorDraftId, 'activeCreatorDraftId'),
          patch,
          reason
        });
        creatorView = result.view;
        activeScreen = 'creator';
        await refreshStarshipsView();
        return viewEnvelope('starships');
      });
    },

    async cancelCreatorDraft() {
      return run(async () => {
        activeScreen = 'starships';
        creatorView = null;
        activeCreatorDraftId = null;
        await refreshStarshipsView();
        return viewEnvelope('starships');
      });
    },

    async acceptCreatorDraftAndStartCampaign({ simulationMode = 'Command' } = {}) {
      return run(async () => {
        await ensureInitialized();
        const result = await controller.acceptCreatorDraftAndStartCampaign({
          draftId: requireNonEmptyString(activeCreatorDraftId, 'activeCreatorDraftId'),
          simulationMode
        });
        campaignState = result.campaignState;
        activeCreatorDraftId = null;
        creatorView = null;
        activeScreen = 'campaign';
        await refreshStarshipsView();
        return viewEnvelope('mission');
      });
    },

    async loadGame({ saveId }) {
      return run(async () => {
        await ensureInitialized();
        campaignState = await controller.loadGame({
          saveId: requireNonEmptyString(saveId, 'saveId')
        });
        activeScreen = 'campaign';
        await refreshStarshipsView();
        return viewEnvelope('mission');
      });
    },

    async saveCurrentGame({ summary = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const save = await controller.saveCurrentGame({
          campaignState,
          summary
        });
        await refreshStarshipsView();
        return {
          save: cloneJson(save),
          view: viewEnvelope('mission')
        };
      });
    },

    async saveCurrentGameAs({ name = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const save = await controller.saveCurrentGameAs({ name });
        await refreshStarshipsView();
        return {
          save: cloneJson(save),
          view: viewEnvelope('mission')
        };
      });
    }
  };
}
