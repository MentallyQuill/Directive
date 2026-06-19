import {
  deleteCommittedOutcome as restoreBeforeCommittedOutcome,
  recordNarrationFailure,
  recordNarrationSuccess
} from '../campaign/transaction-state.mjs';
import { recoverCommandBearing } from '../command/command-bearing.mjs';
import { generateNarrationFromTurn } from '../generation/narration.mjs';
import { createSillyTavernNarrationProvider } from '../providers/sillytavern-narration-provider.mjs';
import { createDirectiveFileStorageAdapter } from '../storage/directive-file-api.mjs';
import { createCampaignStartController } from './campaign-start-controller.mjs';
import {
  commitProvisionalDirectorTurnRuntime,
  createProvisionalDirectorTurnRuntime,
  runDirectorTurnRuntime
} from './director-turn-runtime.mjs';

export const BUNDLED_STARSHIP_PACKAGE_REFS = Object.freeze([
  {
    packageUrl: new URL('../../packages/bundled/breckinridge/ashes-of-peace.starship-package.json', import.meta.url),
    projectionUrl: new URL('../../packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json', import.meta.url),
    projectionPath: 'packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json',
    crewDatasetUrl: new URL('../../packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json', import.meta.url),
    crewDatasetPath: 'packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json',
    missionGraphUrl: new URL('../../packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json', import.meta.url),
    missionGraphPath: 'packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json',
    missionGraphUrls: [
      {
        url: new URL('../../packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json', import.meta.url),
        path: 'packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json'
      },
      {
        url: new URL('../../packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json', import.meta.url),
        path: 'packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json'
      }
    ]
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

function timestampFromNow(now) {
  if (typeof now === 'function') return now();
  if (typeof now === 'string' && now.trim()) return now;
  return new Date().toISOString();
}

function packageIdOf(packageData) {
  return packageData?.manifest?.id;
}

function unwrapProjectionRecord(record) {
  return record?.projection || record;
}

function projectionPathOf(record) {
  return record?.path || '';
}

function unwrapCrewDatasetRecord(record) {
  if (!record) return null;
  return {
    path: record.path || '',
    dataset: record.dataset || record
  };
}

function unwrapMissionGraphRecords(record) {
  if (!record) return [];
  const records = Array.isArray(record) ? record : [record];
  return records.filter(Boolean).map((item) => ({
    path: item.path || '',
    graph: item.graph || item
  }));
}

function recordForPackage(records, packageId, index) {
  if (!records) return null;
  if (Array.isArray(records)) {
    return records[index] || null;
  }
  return records[packageId] || null;
}

function indexRuntimeAssets({ packages = [], projections = [], crewDatasets = [], missionGraphs = [] }) {
  const byPackageId = new Map();
  packages.forEach((packageData, index) => {
    const packageId = packageIdOf(packageData);
    if (!packageId) return;
    const projectionRecord = recordForPackage(projections, packageId, index);
    const crewDatasetRecord = unwrapCrewDatasetRecord(recordForPackage(crewDatasets, packageId, index));
    const graphRecords = unwrapMissionGraphRecords(recordForPackage(missionGraphs, packageId, index));
    const missionGraphsById = new Map();
    for (const graphRecord of graphRecords) {
      const graphId = graphRecord.graph?.manifest?.id || graphRecord.graph?.id || graphRecord.path;
      if (graphId) {
        missionGraphsById.set(graphId, graphRecord);
      }
    }
    byPackageId.set(packageId, {
      projection: unwrapProjectionRecord(projectionRecord),
      projectionPath: projectionPathOf(projectionRecord),
      crewDataset: crewDatasetRecord?.dataset || null,
      crewDatasetPath: crewDatasetRecord?.path || '',
      missionGraphs: graphRecords,
      missionGraphsById
    });
  });
  return byPackageId;
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
  const crewDatasets = [];
  const missionGraphs = [];
  for (const ref of refs) {
    const packageData = await fetchJsonAsset(ref.packageUrl, { fetchImpl });
    const projection = await fetchJsonAsset(ref.projectionUrl, { fetchImpl });
    const crewDataset = ref.crewDatasetUrl ? await fetchJsonAsset(ref.crewDatasetUrl, { fetchImpl }) : null;
    const graphRefs = Array.isArray(ref.missionGraphUrls) && ref.missionGraphUrls.length > 0
      ? ref.missionGraphUrls
      : ref.missionGraphUrl
        ? [{ url: ref.missionGraphUrl, path: ref.missionGraphPath || '' }]
        : [];
    const graphRecords = [];
    for (const graphRef of graphRefs) {
      const graph = await fetchJsonAsset(graphRef.url, { fetchImpl });
      graphRecords.push({
        path: graphRef.path || '',
        graph
      });
    }
    packages.push(packageData);
    projections.push({
      path: ref.projectionPath || '',
      projection
    });
    crewDatasets.push(crewDataset ? {
      path: ref.crewDatasetPath || '',
      dataset: crewDataset
    } : null);
    missionGraphs.push(graphRecords);
  }
  return { packages, projections, crewDatasets, missionGraphs };
}

export function createDirectiveRuntimeApp({
  adapter = createDirectiveFileStorageAdapter(),
  packageLoader = loadBundledStarshipPackageRecords,
  idFactory = defaultIdFactory(),
  narrationProvider = createSillyTavernNarrationProvider(),
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
  let runtimeAssetsByPackageId = new Map();
  let lastDirectorTurn = null;
  let lastNarrationResult = null;
  let pendingDirectorTurn = null;
  let pendingOutcomeReplacement = null;
  let lastError = null;

  async function ensureInitialized() {
    if (initialized) return;
    const loaded = await packageLoader();
    const packages = loaded.packages || [];
    const projectionRecords = loaded.projections || [];
    const projections = Array.isArray(projectionRecords)
      ? projectionRecords.map(unwrapProjectionRecord)
      : Object.fromEntries(Object.entries(projectionRecords).map(([packageId, record]) => [packageId, unwrapProjectionRecord(record)]));
    runtimeAssetsByPackageId = indexRuntimeAssets({
      packages,
      projections: projectionRecords,
      crewDatasets: loaded.crewDatasets || [],
      missionGraphs: loaded.missionGraphs || []
    });
    controller = createCampaignStartController({
      adapter,
      packages,
      projections,
      idFactory,
      now
    });
    starshipsView = await controller.initialize();
    campaignState = controller.activeCampaignState || null;
    if (campaignState) {
      activeScreen = 'campaign';
    }
    initialized = true;
  }

  async function refreshStarshipsView() {
    await ensureInitialized();
    starshipsView = await controller.getStarshipsView();
    return cloneJson(starshipsView);
  }

  function activeRuntimeAssets() {
    const packageId = campaignState?.activeStarshipPackage?.packageId || controller?.activePackageId;
    const assets = packageId ? runtimeAssetsByPackageId.get(packageId) : null;
    if (!assets) {
      throw new Error(`No runtime mission assets are loaded for package "${packageId || 'unknown'}"`);
    }
    return assets;
  }

  function activeMissionGraphRecord(assets, sceneSnapshotOverrides = {}) {
    const graphId = sceneSnapshotOverrides.activeMissionGraphId
      || campaignState?.mission?.activeMissionGraphId
      || assets.missionGraphs[0]?.graph?.manifest?.id;
    const record = assets.missionGraphsById.get(graphId) || assets.missionGraphs[0] || null;
    if (!record?.graph) {
      throw new Error(`No mission graph is loaded for "${graphId || 'active mission'}"`);
    }
    return record;
  }

  function viewEnvelope(tabId) {
    const activePackage = controller?.activePackageId
      ? controller.getPackageContext({ packageId: controller.activePackageId })
      : null;
    return {
      kind: 'directive.runtimeView',
      activeTab: tabId,
      activeScreen,
      activePackageId: controller?.activePackageId || starshipsView?.activePackageId || null,
      activeSaveId: controller?.activeSaveId || starshipsView?.activeSaveId || null,
      activePackage: cloneJson(activePackage),
      starships: cloneJson(starshipsView),
      creator: cloneJson(creatorView),
      campaignState: cloneJson(campaignState),
      storageDiagnostics: cloneJson(controller?.storageDiagnostics || null),
      lastDirectorTurn: cloneJson(lastDirectorTurn),
      lastNarrationResult: cloneJson(lastNarrationResult),
      pendingDirectorTurn: cloneJson(pendingDirectorTurn),
      pendingOutcomeReplacement: cloneJson(pendingOutcomeReplacement),
      lastError: lastError ? {
        message: lastError.message || String(lastError)
      } : null
    };
  }

  async function autosaveStableTurn(outcomeId) {
    try {
      const result = await controller.autosaveCurrentGame({
        campaignState,
        summary: `Autosave after ${outcomeId || 'committed Director outcome'}.`
      });
      await refreshStarshipsView();
      return {
        ok: true,
        ...cloneJson(result)
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          message: error?.message || String(error)
        }
      };
    }
  }

  async function generateNarrationForLastTurnNow({ provider = narrationProvider } = {}) {
    requireObject(campaignState, 'campaignState');
    requireObject(lastDirectorTurn, 'lastDirectorTurn');
    const outcomeId = lastDirectorTurn.outcomePacket?.id;
    try {
      const narration = await generateNarrationFromTurn({
        campaignState,
        turnPacket: lastDirectorTurn,
        provider,
        now: () => timestampFromNow(now)
      });
      campaignState = recordNarrationSuccess(campaignState, outcomeId, narration);
      const autosave = await autosaveStableTurn(outcomeId);
      lastNarrationResult = {
        ok: true,
        narration,
        autosave
      };
      return {
        ok: true,
        narration: cloneJson(narration),
        autosave: cloneJson(autosave),
        campaignState: cloneJson(campaignState),
        view: viewEnvelope('mission')
      };
    } catch (error) {
      const failure = {
        failedAt: timestampFromNow(now),
        providerId: provider?.id || null,
        message: error?.message || String(error),
        retryable: true
      };
      campaignState = recordNarrationFailure(campaignState, outcomeId, failure);
      lastNarrationResult = {
        ok: false,
        error: cloneJson(failure)
      };
      return {
        ok: false,
        error: cloneJson(failure),
        campaignState: cloneJson(campaignState),
        view: viewEnvelope('mission')
      };
    }
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
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        lastDirectorTurn = null;
        lastNarrationResult = null;
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
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        lastDirectorTurn = null;
        lastNarrationResult = null;
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

    async saveCurrentGameAs({ name = null, branchFrom = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const save = await controller.saveCurrentGameAs({
          name,
          campaignState,
          branchFrom: branchFrom || {
            divergenceOutcomeId: campaignState?.turnLedger?.lastCommittedOutcomeId || null
          }
        });
        await refreshStarshipsView();
        return {
          save: cloneJson(save),
          view: viewEnvelope('mission')
        };
      });
    },

    async runDirectorTurn({
      playerInput,
      sceneSnapshotOverrides = {},
      turnId = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const graphRecord = activeMissionGraphRecord(assets, sceneSnapshotOverrides);
        const result = runDirectorTurnRuntime({
          campaignState,
          graph: graphRecord.graph,
          projection: assets.projection,
          crewDataset: assets.crewDataset,
          graphPath: graphRecord.path || campaignState.mission?.activeMissionGraphPath,
          projectionPath: assets.projectionPath,
          turnId: turnId || idFactory('turn'),
          playerInput,
          sceneSnapshotOverrides
        });
        campaignState = result.campaignState;
        lastDirectorTurn = result.turnPacket;
        lastNarrationResult = null;
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        activeScreen = 'campaign';
        return {
          turnPacket: cloneJson(result.turnPacket),
          narratorPacket: cloneJson(result.narratorPacket),
          commandLogPacket: cloneJson(result.commandLogPacket),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async previewDirectorTurn({
      playerInput,
      sceneSnapshotOverrides = {},
      turnId = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const graphRecord = activeMissionGraphRecord(assets, sceneSnapshotOverrides);
        const result = createProvisionalDirectorTurnRuntime({
          campaignState,
          graph: graphRecord.graph,
          projection: assets.projection,
          crewDataset: assets.crewDataset,
          graphPath: graphRecord.path || campaignState.mission?.activeMissionGraphPath,
          projectionPath: assets.projectionPath,
          turnId: turnId || idFactory('turn'),
          playerInput,
          sceneSnapshotOverrides
        });
        pendingDirectorTurn = result.turnPacket;
        pendingOutcomeReplacement = null;
        lastNarrationResult = null;
        activeScreen = 'campaign';
        return {
          turnPacket: cloneJson(result.turnPacket),
          provisionalOutcome: cloneJson(result.provisionalOutcome),
          commandBearingPrompt: cloneJson(result.commandBearingPrompt),
          narratorPacket: cloneJson(result.narratorPacket),
          commandLogPacket: cloneJson(result.commandLogPacket),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async commitProvisionalDirectorTurn({
      spendTrack = null,
      confirmWarnings = false,
      confirmedWarningIds = [],
      generateNarration = true,
      provider = narrationProvider
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        requireObject(pendingDirectorTurn, 'pendingDirectorTurn');
        const replacement = pendingOutcomeReplacement ? cloneJson(pendingOutcomeReplacement) : null;
        const baseCampaignState = replacement?.snapshotBefore || campaignState;
        const result = commitProvisionalDirectorTurnRuntime({
          campaignState: baseCampaignState,
          turnPacket: pendingDirectorTurn,
          spendTrack,
          confirmWarnings,
          confirmedWarningIds
        });
        campaignState = result.campaignState;
        if (replacement) {
          campaignState.turnLedger = campaignState.turnLedger || { entries: [], swipeRerollForbidden: true };
          campaignState.turnLedger.replacementHistory = [
            ...(campaignState.turnLedger.replacementHistory || []),
            {
              type: replacement.type || 'rerunOutcome',
              replacedOutcomeId: replacement.outcomeId,
              replacementOutcomeId: result.turnPacket.outcomePacket.id,
              replacedTurnId: replacement.turnId || null,
              acceptedAt: timestampFromNow(now)
            }
          ];
          campaignState.turnLedger.lastReplacedOutcomeId = replacement.outcomeId;
        }
        lastDirectorTurn = result.turnPacket;
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        lastNarrationResult = null;
        activeScreen = 'campaign';
        const narrationResult = generateNarration
          ? await generateNarrationForLastTurnNow({ provider })
          : null;
        return {
          turnPacket: cloneJson(result.turnPacket),
          commandBearingSpend: cloneJson(result.commandBearingSpend),
          narratorPacket: cloneJson(result.narratorPacket),
          commandLogPacket: cloneJson(result.commandLogPacket),
          narrationResult: cloneJson(narrationResult),
          autosave: cloneJson(narrationResult?.autosave || null),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async discardProvisionalDirectorTurn() {
      return run(async () => {
        await ensureInitialized();
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        return viewEnvelope('mission');
      });
    },

    async previewOutcomeReplacement({
      outcomeId,
      playerInput,
      turnId = null,
      type = 'rerunOutcome'
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const id = requireNonEmptyString(outcomeId, 'outcomeId');
        const ledgerEntry = (campaignState.turnLedger?.entries || []).find((entry) => entry.outcomeId === id);
        if (!ledgerEntry) {
          throw new Error(`Cannot rerun unknown outcome "${id}"`);
        }
        const snapshotBefore = cloneJson(ledgerEntry.snapshotBefore);
        const assets = activeRuntimeAssets();
        const graphRecord = activeMissionGraphRecord(assets, {
          activeMissionGraphId: snapshotBefore?.mission?.activeMissionGraphId
        });
        const result = createProvisionalDirectorTurnRuntime({
          campaignState: snapshotBefore,
          graph: graphRecord.graph,
          projection: assets.projection,
          crewDataset: assets.crewDataset,
          graphPath: graphRecord.path || snapshotBefore.mission?.activeMissionGraphPath,
          projectionPath: assets.projectionPath,
          turnId: turnId || idFactory('turn-rerun'),
          playerInput
        });
        pendingOutcomeReplacement = {
          type,
          outcomeId: id,
          turnId: ledgerEntry.turnId || null,
          snapshotBefore,
          previewCreatedAt: timestampFromNow(now)
        };
        pendingDirectorTurn = {
          ...result.turnPacket,
          replacementForOutcomeId: id,
          replacementType: type
        };
        activeScreen = 'campaign';
        return {
          turnPacket: cloneJson(pendingDirectorTurn),
          provisionalOutcome: cloneJson(result.provisionalOutcome),
          commandBearingPrompt: cloneJson(result.commandBearingPrompt),
          narratorPacket: cloneJson(result.narratorPacket),
          commandLogPacket: cloneJson(result.commandLogPacket),
          pendingOutcomeReplacement: cloneJson(pendingOutcomeReplacement),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async deleteCommittedOutcome({ outcomeId } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const id = requireNonEmptyString(outcomeId, 'outcomeId');
        campaignState = restoreBeforeCommittedOutcome(campaignState, id);
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        lastDirectorTurn = null;
        lastNarrationResult = null;
        activeScreen = 'campaign';
        return {
          deletedOutcomeId: id,
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async recoverCommandBearingPoint({ recoveryId = null, track } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const recovery = recoverCommandBearing(campaignState.commandStyle || {}, {
          recoveryId: recoveryId || idFactory('command-recovery'),
          track
        });
        campaignState = {
          ...cloneJson(campaignState),
          commandStyle: recovery.commandStyle
        };
        return {
          applied: recovery.applied,
          reason: recovery.reason,
          commandStyle: cloneJson(campaignState.commandStyle),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('settings')
        };
      });
    },

    async generateNarrationForLastTurn({ provider = narrationProvider } = {}) {
      return run(async () => {
        await ensureInitialized();
        return generateNarrationForLastTurnNow({ provider });
      });
    },

    async retryNarrationForLastTurn({ provider = narrationProvider } = {}) {
      return run(async () => {
        await ensureInitialized();
        return generateNarrationForLastTurnNow({ provider });
      });
    }
  };
}
