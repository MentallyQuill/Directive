import {
  deleteCommittedOutcome as restoreBeforeCommittedOutcome,
  recordNarrationFailure,
  recordNarrationSuccess
} from '../campaign/transaction-state.mjs';
import { recoverCommandBearing } from '../command/command-bearing.mjs';
import { generateNarrationFromTurn } from '../generation/narration.mjs';
import { createGenerationRouter } from '../generation/generation-router.mjs';
import {
  buildPlayerSafePromptContext,
  createPlayerSafeCampaignProjection,
  recordPromptContextRevision
} from '../generation/player-safe-prompt-context-builder.mjs';
import { classifyChatTurn } from '../adjudication/utility-turn-classifier.mjs';
import { createCampaignSidecarScheduler } from '../jobs/campaign-sidecar-scheduler.mjs';
import { assertDirectiveHost } from '../hosts/host-contract.mjs';
import { runDirectiveAssist as runDirectiveAssistService } from '../assist/directive-assist.mjs';
import { runCommandLogSummarySidecar } from '../jobs/command-log-summary-sidecar.mjs';
import { normalizeStarshipPackageZip } from '../packages/starship-package-importer.mjs';
import {
  applyOpenOrdersCandidateReview,
  buildOpenOrdersCandidateReview
} from '../pressures/open-orders-review.mjs';
import { detectPostChapter1SideMissionOpportunities } from '../side-missions/opportunity-detector.mjs';
import { applySideMissionOpportunityReview } from '../side-missions/opportunity-review.mjs';
import {
  applySideMissionOpportunityResolution,
  applySideMissionOpportunitySceneBeat,
  applySideMissionOpportunitySceneStart
} from '../side-missions/opportunity-scene.mjs';
import {
  applySideMissionProviderAssistResult,
  runSideMissionProviderAssistance as runSideMissionProviderAssist,
  SIDE_MISSION_PROVIDER_ROLE_IDS
} from '../side-missions/provider-assist.mjs';
import {
  applyOpenOrdersAssignmentSceneBeat,
  applyOpenOrdersAssignmentSceneStart
} from '../pressures/open-orders-scene.mjs';
import { applyOpenOrdersAssignmentResolution } from '../pressures/open-orders-resolution.mjs';
import {
  listImportedStarshipPackageRecords,
  storeImportedStarshipPackageRecord
} from '../storage/directive-storage-repository.mjs';
import { createCampaignStartController } from './campaign-start-controller.mjs';
import { createCampaignActivationCoordinator } from './campaign-activation-coordinator.mjs';
import { createCampaignConclusionService } from './campaign-conclusion-service.mjs';
import { createChatTurnOrchestrator } from './chat-turn-orchestrator.mjs';
import { createMessageReconciler } from './message-reconciler.mjs';
import { createResponseDispatcher } from './response-dispatcher.mjs';
import { createStateDeltaGateway, initializeCampaignRuntimeTracking } from './state-delta-gateway.mjs';
import { createTurnCommitCoordinator } from './turn-commit-coordinator.mjs';
import {
  commitProvisionalDirectorTurnRuntime,
  createProvisionalDirectorTurnRuntime,
  runDirectorTurnRuntime
} from './director-turn-runtime.mjs';

export const BUNDLED_STARSHIP_PACKAGE_REFS = Object.freeze([
  {
    packageUrl: new URL('../../packages/bundled/breckenridge/ashes-of-peace.starship-package.json', import.meta.url),
    projectionUrl: new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json', import.meta.url),
    projectionPath: 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
    crewDatasetUrl: new URL('../../packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json', import.meta.url),
    crewDatasetPath: 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
    missionGraphUrl: new URL('../../packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json', import.meta.url),
    missionGraphPath: 'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
    missionGraphUrls: [
      {
        url: new URL('../../packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json', import.meta.url),
        path: 'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json'
      },
      {
        url: new URL('../../packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json', import.meta.url),
        path: 'packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json'
      },
      {
        url: new URL('../../packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json', import.meta.url),
        path: 'packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json'
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
      packageData,
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

function payloadPackageId(payload) {
  return payload?.sourcePackage?.packageId || payload?.manifest?.packageId || payload?.manifest?.sourcePackageId || null;
}

function importedJsonPayloadEntries(importRecord) {
  return Object.entries(importRecord?.jsonPayloads || {})
    .filter(([, value]) => isObject(value))
    .map(([path, value]) => ({ path, value }));
}

function importedProjectionRecord(importRecord) {
  const packageId = importRecord?.packageId || importRecord?.packageData?.manifest?.id || null;
  const match = importedJsonPayloadEntries(importRecord)
    .find(({ value }) => value?.manifest?.kind === 'directive.campaignStateProjection' && payloadPackageId(value) === packageId);
  return match ? { path: match.path, projection: match.value } : null;
}

function importedCrewDatasetRecord(importRecord) {
  const packageId = importRecord?.packageId || importRecord?.packageData?.manifest?.id || null;
  const match = importedJsonPayloadEntries(importRecord)
    .find(({ value }) => value?.manifest?.kind === 'directive.crewDataset' && payloadPackageId(value) === packageId);
  return match ? { path: match.path, dataset: match.value } : null;
}

function importedMissionGraphRecords(importRecord) {
  const packageId = importRecord?.packageId || importRecord?.packageData?.manifest?.id || null;
  return importedJsonPayloadEntries(importRecord)
    .filter(({ value }) => value?.manifest?.kind === 'directive.missionGraph' && payloadPackageId(value) === packageId)
    .map(({ path, value }) => ({ path, graph: value }));
}

function normalizeLoadedPackageRecords(loaded = {}) {
  const packages = Array.isArray(loaded.packages) ? loaded.packages : Object.values(loaded.packages || {});
  const projections = Array.isArray(loaded.projections) ? loaded.projections : Object.values(loaded.projections || {});
  const crewDatasets = Array.isArray(loaded.crewDatasets) ? loaded.crewDatasets : Object.values(loaded.crewDatasets || {});
  const missionGraphs = Array.isArray(loaded.missionGraphs) ? loaded.missionGraphs : Object.values(loaded.missionGraphs || {});
  return { packages, projections, crewDatasets, missionGraphs };
}

function mergeImportedPackageRecords(baseRecords, importedRecords = []) {
  const records = normalizeLoadedPackageRecords(baseRecords);
  const byPackageId = new Map();
  records.packages.forEach((packageData, index) => {
    const packageId = packageIdOf(packageData);
    if (!packageId) return;
    byPackageId.set(packageId, {
      packageData,
      projection: records.projections[index] || null,
      crewDataset: records.crewDatasets[index] || null,
      missionGraphs: records.missionGraphs[index] || [],
      source: packageData?.manifest?.bundled === true ? 'bundled' : 'loaded'
    });
  });

  for (const importRecord of importedRecords || []) {
    if (!importRecord?.packageData || importRecord.diagnostics?.status === 'error') continue;
    const packageId = importRecord.packageId || importRecord.packageData?.manifest?.id;
    if (!packageId) continue;
    const existing = byPackageId.get(packageId) || {};
    const projection = importedProjectionRecord(importRecord);
    const crewDataset = importedCrewDatasetRecord(importRecord);
    const missionGraphs = importedMissionGraphRecords(importRecord);
    byPackageId.set(packageId, {
      packageData: importRecord.packageData,
      projection: projection || existing.projection || null,
      crewDataset: crewDataset || existing.crewDataset || null,
      missionGraphs: missionGraphs.length > 0 ? missionGraphs : existing.missionGraphs || [],
      source: 'imported'
    });
  }

  const merged = {
    packages: [],
    projections: [],
    crewDatasets: [],
    missionGraphs: [],
    sources: {}
  };
  for (const [packageId, record] of byPackageId.entries()) {
    merged.packages.push(record.packageData);
    merged.projections.push(record.projection);
    merged.crewDatasets.push(record.crewDataset);
    merged.missionGraphs.push(record.missionGraphs);
    merged.sources[packageId] = record.source;
  }
  return merged;
}

function summarizeRuntimeAssets(runtimeAssetsByPackageId, sources = {}) {
  const summaries = {};
  for (const [packageId, assets] of runtimeAssetsByPackageId.entries()) {
    summaries[packageId] = {
      source: sources[packageId] || 'loaded',
      hasProjection: isObject(assets.projection),
      hasCrewDataset: isObject(assets.crewDataset),
      hasGuardrails: isObject(assets.packageData?.guardrails),
      hasCharacterCreationContext: isObject(assets.packageData?.characterCreation),
      hasPromptMetadata: isObject(assets.packageData?.promptInjection)
        && assets.packageData.promptInjection.hiddenStatePolicy === 'explicit-player-safe-projection-only',
      missionGraphCount: Array.isArray(assets.missionGraphs) ? assets.missionGraphs.length : 0
    };
  }
  return summaries;
}

export function createDirectiveRuntimeApp({
  host = null,
  adapter = null,
  packageLoader = loadBundledStarshipPackageRecords,
  idFactory = defaultIdFactory(),
  narrationProvider = null,
  now = null
} = {}) {
  const runtimeHost = host ? assertDirectiveHost(host) : null;
  const storageAdapter = adapter || runtimeHost?.storage;
  const defaultGenerationRouter = runtimeHost
    ? createGenerationRouter({
        generationClient: runtimeHost.generation,
        now
      })
    : null;
  const defaultNarrationProvider = narrationProvider || defaultGenerationRouter?.providerForRole('narration') || null;
  requireObject(storageAdapter, 'adapter');
  if (typeof packageLoader !== 'function') {
    throw new Error('packageLoader must be a function');
  }

  let initialized = false;
  let controller = null;
  let campaignView = null;
  let creatorView = null;
  let campaignState = null;
  let activeCreatorDraftId = null;
  let activeScreen = 'campaign';
  let runtimeAssetsByPackageId = new Map();
  let importedPackageRecords = [];
  let lastPackageImportResult = null;
  let lastDirectorTurn = null;
  let lastNarrationResult = null;
  let pendingDirectorTurn = null;
  let pendingOutcomeReplacement = null;
  let lastCommandLogSummarySidecarResult = null;
  let lastSideMissionProviderAssistResult = null;
  let lastDirectiveAssistResult = null;
  let lastStateSafetyResult = null;
  let lastActivationResult = null;
  let lastConclusionResult = null;
  let lastError = null;
  let chatNativeServices = null;
  let durabilityCoordinator = null;
  let publicApi = null;

  async function rebuildPackageLibrary({ recoverActiveSave = true } = {}) {
    const loaded = await packageLoader();
    importedPackageRecords = await listImportedStarshipPackageRecords(storageAdapter);
    const merged = mergeImportedPackageRecords(loaded, importedPackageRecords);
    const projectionRecords = merged.projections;
    const projections = projectionRecords.map(unwrapProjectionRecord);
    runtimeAssetsByPackageId = indexRuntimeAssets({
      packages: merged.packages,
      projections: projectionRecords,
      crewDatasets: merged.crewDatasets,
      missionGraphs: merged.missionGraphs
    });
    controller = createCampaignStartController({
      adapter: storageAdapter,
      packages: merged.packages,
      projections,
      runtimeAssetSummaries: summarizeRuntimeAssets(runtimeAssetsByPackageId, merged.sources),
      idFactory,
      now
    });
    campaignView = await controller.initialize({ recoverActiveSave });
    campaignState = controller.activeCampaignState
      ? initializeCampaignRuntimeTracking(controller.activeCampaignState)
      : null;
    if (campaignState) {
      activeScreen = 'campaign';
    } else if (activeScreen !== 'creator') {
      activeScreen = 'campaign';
    }
  }

  async function ensureInitialized() {
    if (initialized) return;
    await rebuildPackageLibrary();
    initialized = true;
  }

  async function refreshCampaignView() {
    await ensureInitialized();
    campaignView = await controller.getCampaignView();
    return cloneJson(campaignView);
  }

  function activeRuntimeAssets() {
    const packageId = campaignState?.activeStarshipPackage?.packageId || controller?.activePackageId;
    const assets = packageId ? runtimeAssetsByPackageId.get(packageId) : null;
    if (!assets) {
      throw new Error(`No runtime mission assets are loaded for package "${packageId || 'unknown'}"`);
    }
    return assets;
  }

  function optionalActiveRuntimeAssets() {
    try {
      return activeRuntimeAssets();
    } catch {
      return null;
    }
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

  function optionalActiveMissionGraph(assets) {
    if (!assets) return null;
    try {
      return activeMissionGraphRecord(assets)?.graph || null;
    } catch {
      return null;
    }
  }

  function campaignViewEnvelope() {
    const campaign = cloneJson(campaignView);
    if (!campaign) return campaign;
    campaign.imports = importedPackageRecords.map((record) => ({
      id: record.id,
      packageId: record.packageId,
      packageVersion: record.packageVersion,
      packageTitle: record.packageData?.manifest?.title || record.packageId,
      shipName: record.packageData?.ship?.name || null,
      sourceFileName: record.sourceFileName || null,
      importedAt: record.importedAt || null,
      diagnostics: cloneJson(record.diagnostics || null)
    }));
    campaign.lastImportResult = cloneJson(lastPackageImportResult);
    return campaign;
  }

  function providerViewData() {
    if (!runtimeHost?.providers) return null;
    try {
      return {
        settings: cloneJson(runtimeHost.providers.getSettings?.() || runtimeHost.providers.settings?.getAll?.() || null),
        validation: cloneJson(runtimeHost.providers.validate?.() || null),
        status: {
          utility: cloneJson(runtimeHost.providers.status?.('utility') || null),
          reasoning: cloneJson(runtimeHost.providers.status?.('reasoning') || null)
        },
        profiles: cloneJson(runtimeHost.providers.listProfiles?.() || [])
      };
    } catch (error) {
      return {
        error: { message: error?.message || String(error) }
      };
    }
  }

  function viewEnvelope(tabId) {
    const activePackage = controller?.activePackageId
      ? controller.getPackageContext({ packageId: controller.activePackageId })
      : null;
    let openOrdersReview = null;
    let sideMissionOpportunityReview = null;
    if (campaignState && controller?.activePackageId) {
      const assets = runtimeAssetsByPackageId.get(controller.activePackageId);
      if (assets?.packageData) {
        openOrdersReview = buildOpenOrdersCandidateReview({
          campaignState,
          packageData: assets.packageData
        });
        sideMissionOpportunityReview = detectPostChapter1SideMissionOpportunities({
          campaignState,
          packageData: assets.packageData
        });
      }
    }
    return {
      kind: 'directive.runtimeView',
      activeTab: tabId,
      activeScreen,
      activePackageId: controller?.activePackageId || campaignView?.activePackageId || null,
      activeSaveId: controller?.activeSaveId || campaignView?.activeSaveId || null,
      activePackage: cloneJson(activePackage),
      campaign: campaignViewEnvelope(),
      creator: cloneJson(creatorView),
      campaignState: cloneJson(campaignState),
      playerSafeCampaign: createPlayerSafeCampaignProjection({
        campaignState,
        packageData: optionalActiveRuntimeAssets()?.packageData || null,
        crewDataset: optionalActiveRuntimeAssets()?.crewDataset || null
      }),
      chatNative: campaignState ? {
        binding: cloneJson(campaignState.campaignChatBinding || null),
        activation: cloneJson(campaignState.activationJournal || null),
        tracking: campaignState.runtimeTracking ? {
          revision: campaignState.runtimeTracking.revision || 0,
          lastStableRevision: campaignState.runtimeTracking.lastStableRevision || 0,
          historyDepth: campaignState.runtimeTracking.history?.length || 0,
          ingressCount: campaignState.runtimeTracking.ingressLedger?.length || 0,
          responseCount: campaignState.runtimeTracking.responseLedger?.length || 0,
          sidecarCount: campaignState.runtimeTracking.sidecarJournal?.length || 0,
          lastDelta: cloneJson(campaignState.runtimeTracking.lastDelta || null),
          lastCommittedTurn: cloneJson(campaignState.runtimeTracking.lastCommittedTurn || null)
        } : null,
        prompt: cloneJson(campaignState.campaignChatBinding?.promptContext || null),
        pendingInteractions: cloneJson(campaignState.runtimeTracking?.pendingInteractions || []),
        recovery: cloneJson(campaignState.runtimeTracking?.recoveryJournal || [])
      } : null,
      providerConfiguration: providerViewData(),
      promptInspection: cloneJson(runtimeHost?.prompt?.inspect?.() || null),
      host: runtimeHost ? {
        id: runtimeHost.id,
        displayName: runtimeHost.displayName,
        capabilities: cloneJson(runtimeHost.capabilities)
      } : null,
      storageDiagnostics: cloneJson(controller?.storageDiagnostics || null),
      lastDirectorTurn: cloneJson(lastDirectorTurn),
      lastNarrationResult: cloneJson(lastNarrationResult),
      lastCommandLogSummarySidecarResult: cloneJson(lastCommandLogSummarySidecarResult),
      lastSideMissionProviderAssistResult: cloneJson(lastSideMissionProviderAssistResult),
      lastDirectiveAssistResult: cloneJson(lastDirectiveAssistResult),
      lastStateSafetyResult: cloneJson(lastStateSafetyResult),
      lastActivationResult: cloneJson(lastActivationResult),
      lastConclusionResult: cloneJson(lastConclusionResult),
      pendingDirectorTurn: cloneJson(pendingDirectorTurn),
      pendingOutcomeReplacement: cloneJson(pendingOutcomeReplacement),
      openOrdersReview: cloneJson(openOrdersReview),
      sideMissionOpportunityReview: cloneJson(sideMissionOpportunityReview),
      lastError: lastError ? {
        message: lastError.message || String(lastError)
      } : null
    };
  }

  async function autosaveStableTurn(outcomeId) {
    try {
      const result = await controller.autosaveCurrentGame({
        campaignState,
        summary: 'Autosave after the latest stable committed turn.'
      });
      await refreshCampaignView();
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

  async function generateNarrationForLastTurnNow({ provider = defaultNarrationProvider } = {}) {
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
      const narrationCheckpoint = await ensureTurnCommitCoordinator().markNarration({
        campaignState,
        outcomeId,
        status: 'complete'
      });
      campaignState = narrationCheckpoint.campaignState;
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
      const narrationCheckpoint = await ensureTurnCommitCoordinator().markNarration({
        campaignState,
        outcomeId,
        status: 'failed',
        error: failure
      });
      campaignState = narrationCheckpoint.campaignState;
      lastNarrationResult = {
        ok: false,
        error: cloneJson(failure),
        checkpoint: cloneJson(narrationCheckpoint.save || null)
      };
      return {
        ok: false,
        error: cloneJson(failure),
        campaignState: cloneJson(campaignState),
        view: viewEnvelope('mission')
      };
    }
  }

  async function updateCommandLogSummaryForTurnNow({
    turnPacket,
    enabled = true
  } = {}) {
    if (!enabled || !runtimeHost) {
      lastCommandLogSummarySidecarResult = null;
      return null;
    }
    requireObject(campaignState, 'campaignState');
    requireObject(turnPacket, 'turnPacket');
    try {
      const result = await runCommandLogSummarySidecar({
        host: runtimeHost,
        campaignState,
        turnPacket,
        saveId: controller?.activeSaveId || null,
        revision: campaignState.turnLedger?.entries?.length || 0,
        now: () => timestampFromNow(now)
      });
      campaignState = result.campaignState;
      lastCommandLogSummarySidecarResult = {
        ok: result.applied === true && result.assistedSummary?.status === 'complete',
        ...cloneJson(result)
      };
      return cloneJson(lastCommandLogSummarySidecarResult);
    } catch (error) {
      lastCommandLogSummarySidecarResult = {
        ok: false,
        error: {
          code: error?.code || 'DIRECTIVE_COMMAND_LOG_SUMMARY_SIDECAR_FAILED',
          message: error?.message || String(error)
        }
      };
      return cloneJson(lastCommandLogSummarySidecarResult);
    }
  }

  async function persistRuntimeCampaignState(state, summary = 'Directive campaign state updated.') {
    campaignState = cloneJson(state);
    if (!controller?.activeSaveId) return null;
    const save = await controller.saveCurrentGame({
      campaignState,
      summary
    });
    await refreshCampaignView();
    return cloneJson(save);
  }

  function ensureTurnCommitCoordinator() {
    if (!durabilityCoordinator) {
      durabilityCoordinator = createTurnCommitCoordinator({
        persist: persistRuntimeCampaignState,
        now
      });
    }
    return durabilityCoordinator;
  }

  async function synchronizeActivePrompt(state = campaignState, {
    persist = true,
    rebuild = false,
    reason = 'Campaign prompt context synchronized.'
  } = {}) {
    if (!runtimeHost?.prompt?.install || !state?.campaignChatBinding?.chatId || state.campaign?.status !== 'active') {
      return { ok: false, skipped: true, reason: 'inactive-or-unbound', campaignState: cloneJson(state) };
    }
    const currentChatId = runtimeHost.chat?.getCurrentChatId?.() || runtimeHost.chat?.getCurrentBinding?.()?.chatId || null;
    if (currentChatId && String(currentChatId) !== String(state.campaignChatBinding.chatId)) {
      await runtimeHost.prompt.clear?.({ reason: 'unbound-chat', preservePacket: true });
      return { ok: true, active: false, suspended: true, campaignState: cloneJson(state) };
    }
    const assets = optionalActiveRuntimeAssets();
    const packet = buildPlayerSafePromptContext({
      campaignState: state,
      packageData: assets?.packageData || null,
      crewDataset: assets?.crewDataset || null,
      createdAt: timestampFromNow(now)
    });
    const method = rebuild && runtimeHost.prompt.rebuild ? 'rebuild' : 'install';
    const result = await runtimeHost.prompt[method]({
      binding: state.campaignChatBinding,
      packet
    });
    if (result?.ok === false) {
      const error = new Error(result?.error?.message || 'Directive prompt synchronization failed.');
      error.code = result?.error?.code || 'DIRECTIVE_PROMPT_SYNC_FAILED';
      throw error;
    }
    const next = recordPromptContextRevision(state, packet, {
      installedAt: timestampFromNow(now),
      status: 'active'
    });
    campaignState = next;
    await runtimeHost.chat?.updateBindingMetadata?.(next.campaignChatBinding);
    if (persist) await persistRuntimeCampaignState(next, reason);
    return { ok: true, active: true, packet: cloneJson(packet), campaignState: cloneJson(next) };
  }

  function ensureChatNativeServices() {
    if (chatNativeServices) return chatNativeServices;
    if (
      runtimeHost?.capabilities?.chat?.create !== true
      || runtimeHost?.capabilities?.chat?.postAssistantMessage !== true
      || runtimeHost?.capabilities?.prompt?.install !== true
      || !runtimeHost?.chat?.postAssistantMessage
      || !runtimeHost?.chat?.createOrBindCampaignChat
      || !runtimeHost?.prompt?.install
    ) {
      return null;
    }

    const getCampaignState = () => campaignState;
    const setCampaignState = (state) => { campaignState = cloneJson(state); };
    const persistCampaignState = (state, summary) => persistRuntimeCampaignState(
      state,
      typeof summary === 'string'
        ? summary
        : (summary?.summary || summary?.reason || 'Directive campaign state updated.')
    );
    const stateDeltaGateway = createStateDeltaGateway({
      getState: getCampaignState,
      setState: setCampaignState,
      persist: persistCampaignState,
      now
    });
    const responseDispatcher = createResponseDispatcher({
      host: runtimeHost,
      getCampaignState,
      setCampaignState,
      persist: persistCampaignState,
      now
    });
    const messageReconciler = createMessageReconciler({
      getCampaignState,
      setCampaignState,
      persist: persistCampaignState,
      syncPrompt: async (state) => (await synchronizeActivePrompt(state, {
        persist: false,
        reason: 'Prompt context rebuilt after message recovery.'
      })).campaignState,
      now
    });
    const sidecarScheduler = createCampaignSidecarScheduler({
      generationRouter: defaultGenerationRouter,
      stateDeltaGateway,
      getCampaignState,
      setCampaignState,
      persistCampaignState,
      syncPromptContext: async (state) => {
        const result = await synchronizeActivePrompt(state, {
          persist: false,
          reason: 'Prompt context synchronized after accepted sidecar state delta.'
        });
        return result.campaignState || state;
      },
      now
    });
    const classify = ({ text, context = {} } = {}) => classifyChatTurn({
      text,
      context: {
        ...cloneJson(context),
        campaignRevision: campaignState?.runtimeTracking?.revision || 0,
        simulationMode: campaignState?.settings?.simulationMode || 'Command'
      },
      generationRouter: defaultGenerationRouter
    });
    const activationCoordinator = createCampaignActivationCoordinator({
      host: runtimeHost,
      generationRouter: defaultGenerationRouter,
      persist: persistCampaignState,
      now
    });
    const conclusionService = createCampaignConclusionService({
      host: runtimeHost,
      generationRouter: defaultGenerationRouter,
      getCampaignState,
      setCampaignState,
      persist: persistCampaignState,
      now
    });
    const turnCommitCoordinator = ensureTurnCommitCoordinator();
    const orchestrator = createChatTurnOrchestrator({
      host: runtimeHost,
      classify,
      generationRouter: defaultGenerationRouter,
      responseDispatcher,
      turnCommitCoordinator,
      sidecarScheduler,
      messageReconciler,
      stateDeltaGateway,
      getCampaignState,
      setCampaignState,
      persistCampaignState,
      syncPromptContext: async (state) => {
        const result = await synchronizeActivePrompt(state, {
          persist: false,
          reason: 'Chat-native prompt context synchronized.'
        });
        return result.campaignState || state;
      },
      previewDirectorTurn: (options) => publicApi.previewDirectorTurn(options),
      commitProvisionalDirectorTurn: (options) => publicApi.commitProvisionalDirectorTurn(options),
      discardProvisionalDirectorTurn: () => publicApi.discardProvisionalDirectorTurn(),
      now
    });
    chatNativeServices = {
      activationCoordinator,
      conclusionService,
      turnCommitCoordinator,
      stateDeltaGateway,
      responseDispatcher,
      messageReconciler,
      sidecarScheduler,
      classify,
      orchestrator
    };
    return chatNativeServices;
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

  publicApi = {
    async initialize() {
      return run(async () => {
        await ensureInitialized();
        return viewEnvelope('campaign');
      });
    },

    async getCurrentView({ tabId = 'campaign' } = {}) {
      return run(async () => {
        await ensureInitialized();
        if (tabId === 'campaign' && activeScreen !== 'creator') {
          await refreshCampaignView();
        }
        return viewEnvelope(tabId);
      });
    },

    getChatTurnOrchestrator() {
      return ensureChatNativeServices()?.orchestrator || null;
    },

    async observeHostPlayerMessage(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const services = ensureChatNativeServices();
        if (!services) return { handled: false, reason: 'chat-native-host-unavailable' };
        return services.orchestrator.observePlayerMessage(payload);
      });
    },

    async interceptHostGeneration(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const services = ensureChatNativeServices();
        if (!services) return { handled: false, reason: 'chat-native-host-unavailable' };
        return services.orchestrator.interceptGeneration(payload);
      });
    },

    async handleHostMessageEdited(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const services = ensureChatNativeServices();
        return services
          ? services.orchestrator.handleMessageEdited(payload)
          : { handled: false, reason: 'chat-native-host-unavailable' };
      });
    },

    async handleHostMessageDeleted(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const services = ensureChatNativeServices();
        return services
          ? services.orchestrator.handleMessageDeleted(payload)
          : { handled: false, reason: 'chat-native-host-unavailable' };
      });
    },

    async handleHostChatChanged(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const services = ensureChatNativeServices();
        const result = services
          ? await services.orchestrator.handleChatChanged(payload)
          : { active: false, reason: 'chat-native-host-unavailable' };
        await refreshCampaignView();
        return result;
      });
    },

    async openCampaignChat() {
      return run(async () => {
        await ensureInitialized();
        if (!campaignState?.campaignChatBinding) return { ok: false, reason: 'campaign-chat-unbound' };
        const opened = await runtimeHost?.chat?.open?.(campaignState.campaignChatBinding);
        return { ok: opened !== false, binding: cloneJson(campaignState.campaignChatBinding) };
      });
    },

    async resolvePendingChatInteraction({ interactionId = null, action = 'accept', spendTrack = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const orchestrator = ensureChatNativeServices()?.orchestrator;
        if (!orchestrator?.resolveInteraction) {
          throw new Error('Chat interaction resolution is unavailable for this host.');
        }
        const result = await orchestrator.resolveInteraction({ interactionId, action, spendTrack });
        if (result?.campaignState) campaignState = result.campaignState;
        return {
          result: cloneJson(result),
          view: viewEnvelope('mission')
        };
      });
    },

    async retryCommittedChatResponse({ recoveryId = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const orchestrator = ensureChatNativeServices()?.orchestrator;
        if (!orchestrator?.retryCommittedResponse) {
          throw new Error('Committed chat response recovery is unavailable for this host.');
        }
        const result = await orchestrator.retryCommittedResponse({ recoveryId });
        if (result?.campaignState) campaignState = result.campaignState;
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async retryCampaignActivation({ existingChatId = null, createNewChat = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const services = ensureChatNativeServices();
        if (!services) throw new Error('The active host does not expose Directive chat activation capabilities.');
        const assets = activeRuntimeAssets();
        lastActivationResult = await services.activationCoordinator.activate({
          campaignState,
          packageData: assets.packageData,
          crewDataset: assets.crewDataset,
          saveId: controller.activeSaveId,
          existingChatId: existingChatId || campaignState.campaignChatBinding?.chatId || null,
          createNewChat: createNewChat ?? !campaignState.campaignChatBinding?.chatId
        });
        campaignState = lastActivationResult.campaignState;
        await refreshCampaignView();
        return { ...cloneJson(lastActivationResult), view: viewEnvelope('campaign') };
      });
    },

    async rebuildPromptContext() {
      return run(async () => {
        await ensureInitialized();
        const result = await synchronizeActivePrompt(campaignState, {
          persist: true,
          rebuild: true,
          reason: 'Player-safe campaign prompt context rebuilt manually.'
        });
        await refreshCampaignView();
        return { ...cloneJson(result), view: viewEnvelope('settings') };
      });
    },

    async updateProviderSettings({ kind, patch = {} } = {}) {
      return run(async () => {
        await ensureInitialized();
        const providerKind = requireNonEmptyString(kind, 'kind');
        requireObject(patch, 'patch');
        if (!runtimeHost?.providers?.updateSettings) throw new Error('Provider settings are unavailable on this host.');
        const settings = runtimeHost.providers.updateSettings(providerKind, patch);
        await refreshCampaignView();
        return { kind: providerKind, settings: cloneJson(settings), providerConfiguration: providerViewData(), view: viewEnvelope('settings') };
      });
    },

    async testProvider({ kind } = {}) {
      return run(async () => {
        await ensureInitialized();
        const providerKind = requireNonEmptyString(kind, 'kind');
        if (!runtimeHost?.providers?.test) throw new Error('Provider testing is unavailable on this host.');
        const result = await runtimeHost.providers.test(providerKind);
        return { ...cloneJson(result), providerConfiguration: providerViewData(), view: viewEnvelope('settings') };
      });
    },

    async concludeCampaign(options = {}) {
      return run(async () => {
        await ensureInitialized();
        const services = ensureChatNativeServices();
        if (!services) throw new Error('Campaign conclusion requires a chat-capable host adapter.');
        lastConclusionResult = await services.conclusionService.conclude(options);
        campaignState = lastConclusionResult.campaignState;
        await refreshCampaignView();
        return { ...cloneJson(lastConclusionResult), view: viewEnvelope('campaign') };
      });
    },

    async handleHostMessageSent(payload = {}) {
      return publicApi.observeHostPlayerMessage(payload);
    },

    async rebindCampaignChat({ existingChatId = null, createNewChat = false } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        if (!runtimeHost?.chat?.createOrBindCampaignChat) throw new Error('Host chat binding is unavailable.');
        const assets = activeRuntimeAssets();
        const binding = await runtimeHost.chat.createOrBindCampaignChat({
          name: `Directive - ${campaignState.campaign?.packageTitle || assets.packageData?.manifest?.title || 'Campaign'} - ${campaignState.player?.name || 'Commander'}`,
          campaignId: campaignState.campaign?.id,
          saveId: controller.activeSaveId,
          existingChatId,
          createNew: createNewChat === true
        });
        campaignState = {
          ...campaignState,
          campaignChatBinding: {
            ...cloneJson(binding),
            status: 'bound',
            reboundAt: timestampFromNow(now),
            introMessageId: campaignState.campaignChatBinding?.introMessageId || null,
            promptContextRevision: 0
          }
        };
        await persistRuntimeCampaignState(campaignState, 'Campaign chat binding updated.');
        await runtimeHost.chat.open?.(campaignState.campaignChatBinding);
        const prompt = await synchronizeActivePrompt(campaignState, {
          persist: true,
          rebuild: true,
          reason: 'Prompt context rebuilt after campaign chat rebinding.'
        });
        return {
          binding: cloneJson(campaignState.campaignChatBinding),
          prompt: cloneJson(prompt),
          view: viewEnvelope('campaign')
        };
      });
    },

    async clearPromptContext({ reason = 'manual-clear' } = {}) {
      return run(async () => {
        await ensureInitialized();
        const result = await runtimeHost?.prompt?.clear?.({ reason });
        return {
          result: cloneJson(result || { ok: false, reason: 'prompt-adapter-unavailable' }),
          view: viewEnvelope('settings')
        };
      });
    },

    async archiveCompletedCampaign() {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        if (!['complete', 'archived'].includes(campaignState.campaign?.status)) {
          throw new Error('Only a completed campaign can be archived.');
        }
        campaignState = {
          ...campaignState,
          campaign: {
            ...campaignState.campaign,
            status: 'archived',
            archivedAt: timestampFromNow(now)
          }
        };
        await runtimeHost?.prompt?.clear?.({ reason: 'campaign-archived' });
        const save = await persistRuntimeCampaignState(campaignState, 'Completed campaign archived.');
        return {
          save: cloneJson(save),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('campaign')
        };
      });
    },

    async importStarshipPackageArchive({ fileName, bytes } = {}) {
      return run(async () => {
        await ensureInitialized();
        const importedAt = timestampFromNow(now);
        const normalized = normalizeStarshipPackageZip({
          fileName: requireNonEmptyString(fileName, 'fileName'),
          bytes,
          importedAt
        });
        if (!normalized.ok || !normalized.packageRecord) {
          lastPackageImportResult = {
            ok: false,
            importedAt,
            diagnostics: cloneJson(normalized.diagnostics)
          };
          await refreshCampaignView();
          return viewEnvelope('campaign');
        }

        const importId = idFactory('package-import');
        const stored = await storeImportedStarshipPackageRecord(storageAdapter, {
          ...cloneJson(normalized.packageRecord),
          id: importId,
          importedAt,
          updatedAt: importedAt
        }, { now: importedAt });
        await rebuildPackageLibrary();
        initialized = true;
        await refreshCampaignView();
        lastPackageImportResult = {
          ok: true,
          importId,
          packageId: stored.packageId,
          packageVersion: stored.packageVersion,
          importedAt,
          diagnostics: cloneJson(stored.diagnostics)
        };
        return viewEnvelope('campaign');
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
        await refreshCampaignView();
        return viewEnvelope('campaign');
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
        return viewEnvelope('campaign');
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
        await refreshCampaignView();
        return viewEnvelope('campaign');
      });
    },

    async cancelCreatorDraft() {
      return run(async () => {
        activeScreen = 'campaign';
        creatorView = null;
        activeCreatorDraftId = null;
        await refreshCampaignView();
        return viewEnvelope('campaign');
      });
    },

    async resetRuntimeUiState() {
      return run(async () => {
        await ensureInitialized();
        creatorView = null;
        activeCreatorDraftId = null;
        activeScreen = campaignState ? 'campaign' : 'campaign';
        lastPackageImportResult = null;
        lastDirectiveAssistResult = null;
        lastError = null;
        await refreshCampaignView();
        return viewEnvelope('campaign');
      });
    },

    async acceptCreatorDraftAndStartCampaign({ simulationMode = 'Command' } = {}) {
      return run(async () => {
        await ensureInitialized();
        const result = await controller.acceptCreatorDraftAndStartCampaign({
          draftId: requireNonEmptyString(activeCreatorDraftId, 'activeCreatorDraftId'),
          simulationMode
        });
        campaignState = initializeCampaignRuntimeTracking(result.campaignState);
        activeCreatorDraftId = null;
        creatorView = null;
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        lastDirectorTurn = null;
        lastNarrationResult = null;
        lastCommandLogSummarySidecarResult = null;
        lastDirectiveAssistResult = null;
        lastConclusionResult = null;
        activeScreen = 'campaign';

        const services = ensureChatNativeServices();
        if (services) {
          const assets = activeRuntimeAssets();
          lastActivationResult = await services.activationCoordinator.activate({
            campaignState,
            packageData: assets.packageData,
            crewDataset: assets.crewDataset,
            saveId: controller.activeSaveId,
            createNewChat: true
          });
          campaignState = lastActivationResult.campaignState;
        } else {
          campaignState = {
            ...campaignState,
            campaign: {
              ...campaignState.campaign,
              status: 'active',
              activatedAt: timestampFromNow(now)
            },
            activationJournal: {
              kind: 'directive.campaignActivationJournal',
              status: 'hostUnavailableFallback',
              completedAt: timestampFromNow(now),
              steps: {}
            }
          };
          await persistRuntimeCampaignState(campaignState, 'Campaign activated without a chat-capable host adapter.');
          lastActivationResult = {
            ok: true,
            fallback: true,
            campaignState: cloneJson(campaignState)
          };
        }
        await refreshCampaignView();
        return viewEnvelope('mission');
      });
    },

    async loadGame({ saveId }) {
      return run(async () => {
        await ensureInitialized();
        campaignState = initializeCampaignRuntimeTracking(await controller.loadGame({
          saveId: requireNonEmptyString(saveId, 'saveId')
        }));
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        lastDirectorTurn = null;
        lastNarrationResult = null;
        lastCommandLogSummarySidecarResult = null;
        lastDirectiveAssistResult = null;
        lastConclusionResult = null;
        activeScreen = 'campaign';
        const services = ensureChatNativeServices();
        if (services && ['activating', 'activationFailed'].includes(campaignState.campaign?.status)) {
          const assets = activeRuntimeAssets();
          lastActivationResult = await services.activationCoordinator.activate({
            campaignState,
            packageData: assets.packageData,
            crewDataset: assets.crewDataset,
            saveId: controller.activeSaveId,
            existingChatId: campaignState.campaignChatBinding?.chatId || null,
            createNewChat: !campaignState.campaignChatBinding?.chatId
          });
          campaignState = lastActivationResult.campaignState;
        } else if (services && campaignState.campaign?.status === 'active') {
          await runtimeHost.chat?.open?.(campaignState.campaignChatBinding);
          await synchronizeActivePrompt(campaignState, {
            persist: true,
            rebuild: true,
            reason: 'Campaign prompt context rebuilt after loading the save.'
          });
        } else if (campaignState.campaign?.status === 'complete') {
          await runtimeHost?.prompt?.clear?.({ reason: 'completed-campaign' });
        }
        await refreshCampaignView();
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
        await refreshCampaignView();
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
        await refreshCampaignView();
        return {
          save: cloneJson(save),
          view: viewEnvelope('mission')
        };
      });
    },

    async refreshStorageDiagnostics() {
      return run(async () => {
        await ensureInitialized();
        const diagnostics = await controller.diagnoseStorage();
        lastStateSafetyResult = {
          kind: 'directive.stateSafetyAction',
          action: 'refreshDiagnostics',
          status: diagnostics.status || 'unknown',
          ok: diagnostics.ok === true,
          checkedAt: diagnostics.checkedAt || null,
          summary: `Storage diagnostics refreshed with ${Array.isArray(diagnostics.issues) ? diagnostics.issues.length : 0} issue(s).`
        };
        await refreshCampaignView();
        return {
          storageDiagnostics: cloneJson(diagnostics),
          stateSafety: cloneJson(lastStateSafetyResult),
          view: viewEnvelope('settings')
        };
      });
    },

    async verifyActiveSave() {
      return run(async () => {
        await ensureInitialized();
        const result = await controller.verifyActiveSave();
        lastStateSafetyResult = {
          ...cloneJson(result),
          action: 'verifyActiveSave',
          summary: result.ok
            ? `Active save ${result.saveId} verified at revision ${result.revision ?? 'unknown'}.`
            : `Active save ${result.saveId} could not be verified.`
        };
        await refreshCampaignView();
        return {
          result: cloneJson(result),
          view: viewEnvelope('settings')
        };
      });
    },

    async settleActiveState() {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const save = await controller.saveCurrentGame({
          campaignState,
          summary: 'State Safety settled the active campaign state.'
        });
        lastStateSafetyResult = {
          kind: 'directive.stateSafetyAction',
          action: 'settleActiveState',
          status: 'ok',
          ok: true,
          saveId: save.id,
          revision: save.revision,
          updatedAt: save.updatedAt,
          summary: `Active state settled into ${save.id} at revision ${save.revision}.`
        };
        await refreshCampaignView();
        return {
          save: cloneJson(save),
          view: viewEnvelope('settings')
        };
      });
    },

    async exportActiveSave() {
      return run(async () => {
        await ensureInitialized();
        const result = await controller.exportActiveSave();
        lastStateSafetyResult = {
          kind: 'directive.stateSafetyAction',
          action: 'exportActiveSave',
          status: 'ok',
          ok: true,
          saveId: result.saveId,
          exportedAt: result.exportedAt,
          fileName: result.fileName,
          summary: `Prepared ${result.fileName} for export.`
        };
        return {
          ...cloneJson(result),
          jsonText: JSON.stringify(result.saveRecord, null, 2),
          view: viewEnvelope('settings')
        };
      });
    },

    async cleanMissingStorageRecords() {
      return run(async () => {
        await ensureInitialized();
        const cleanup = await controller.cleanMissingStorageRecords();
        lastStateSafetyResult = {
          ...cloneJson(cleanup),
          action: 'cleanMissingStorageRecords',
          summary: cleanup.removed?.length > 0
            ? `Removed ${cleanup.removed.length} missing index reference(s).`
            : 'No missing index records needed cleanup.'
        };
        await refreshCampaignView();
        return {
          cleanup: cloneJson(cleanup),
          view: viewEnvelope('settings')
        };
      });
    },

    async runDirectorTurn({
      playerInput,
      sceneSnapshotOverrides = {},
      turnId = null,
      generateCommandLogSummary = true
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
        const commandLogSummaryResult = await updateCommandLogSummaryForTurnNow({
          turnPacket: result.turnPacket,
          enabled: generateCommandLogSummary
        });
        activeScreen = 'campaign';
        return {
          turnPacket: cloneJson(result.turnPacket),
          narratorPacket: cloneJson(result.narratorPacket),
          commandLogPacket: cloneJson(result.commandLogPacket),
          commandLogSummaryResult: cloneJson(commandLogSummaryResult),
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
        lastCommandLogSummarySidecarResult = null;
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
      generateCommandLogSummary = true,
      provider = defaultNarrationProvider
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        requireObject(pendingDirectorTurn, 'pendingDirectorTurn');
        const replacement = pendingOutcomeReplacement ? cloneJson(pendingOutcomeReplacement) : null;
        const baseCampaignState = replacement?.snapshotBefore || campaignState;
        const beforeCampaignState = cloneJson(baseCampaignState);
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
        const mechanicsCheckpoint = await ensureTurnCommitCoordinator().checkpointMechanics({
          beforeCampaignState,
          campaignState,
          turnPacket: result.turnPacket,
          ingressId: campaignState.runtimeTracking?.activeIngressId || null
        });
        campaignState = mechanicsCheckpoint.campaignState;
        lastDirectorTurn = result.turnPacket;
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        lastNarrationResult = null;
        const commandLogSummaryResult = await updateCommandLogSummaryForTurnNow({
          turnPacket: result.turnPacket,
          enabled: generateCommandLogSummary
        });
        activeScreen = 'campaign';
        const narrationResult = generateNarration
          ? await generateNarrationForLastTurnNow({ provider })
          : null;
        return {
          turnPacket: cloneJson(result.turnPacket),
          commandBearingSpend: cloneJson(result.commandBearingSpend),
          narratorPacket: cloneJson(result.narratorPacket),
          commandLogPacket: cloneJson(result.commandLogPacket),
          commandLogSummaryResult: cloneJson(commandLogSummaryResult),
          mechanicsCheckpoint: cloneJson(mechanicsCheckpoint),
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
        lastCommandLogSummarySidecarResult = null;
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
        lastCommandLogSummarySidecarResult = null;
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
        lastCommandLogSummarySidecarResult = null;
        activeScreen = 'campaign';
        return {
          deletedOutcomeId: id,
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async getOpenOrdersCandidateReview({ maxCandidates = 2 } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        return buildOpenOrdersCandidateReview({
          campaignState,
          packageData: assets.packageData,
          maxCandidates
        });
      });
    },

    async commitOpenOrdersCandidateReview({
      candidateId = null,
      sideAssignmentId = null,
      decision = 'start',
      reason = null,
      maxCandidates = 2
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const result = applyOpenOrdersCandidateReview({
          campaignState,
          packageData: assets.packageData,
          candidateId,
          sideAssignmentId,
          decision,
          reviewId: idFactory('open-orders-review'),
          reviewedAt: timestampFromNow(now),
          reason,
          maxCandidates
        });
        campaignState = result.campaignState;
        const autosave = await autosaveStableTurn(result.reviewRecord.id);
        activeScreen = 'campaign';
        return {
          reviewRecord: cloneJson(result.reviewRecord),
          pressureDelta: cloneJson(result.pressureDelta),
          autosave: cloneJson(autosave),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async commitSideMissionOpportunityReview({
      candidateId = null,
      opportunityId = null,
      decision = 'schedule',
      reason = null,
      maxCandidates = 2
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const result = applySideMissionOpportunityReview({
          campaignState,
          packageData: assets.packageData,
          candidateId,
          opportunityId,
          decision,
          reviewId: idFactory('side-opportunity-review'),
          reviewedAt: timestampFromNow(now),
          reason,
          maxCandidates
        });
        campaignState = result.campaignState;
        const autosave = await autosaveStableTurn(result.reviewRecord.id);
        activeScreen = 'campaign';
        return {
          reviewRecord: cloneJson(result.reviewRecord),
          cooldownRecord: cloneJson(result.cooldownRecord),
          scheduledOpportunity: cloneJson(result.scheduledOpportunity),
          autosave: cloneJson(autosave),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async runDirectiveAssist({
      action,
      inputText = '',
      generationRouter = defaultGenerationRouter,
      useProvider = true
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        const assets = optionalActiveRuntimeAssets();
        const stateBefore = JSON.stringify(campaignState ?? null);
        const assistResult = await runDirectiveAssistService({
          action,
          inputText,
          campaignState,
          packageData: assets?.packageData || null,
          crewDataset: assets?.crewDataset || null,
          missionGraph: optionalActiveMissionGraph(assets),
          generationRouter,
          useProvider
        });
        const campaignStateMutated = stateBefore !== JSON.stringify(campaignState ?? null);
        lastDirectiveAssistResult = {
          ...cloneJson(assistResult),
          campaignStateMutated,
          committed: false
        };
        return {
          assistResult: cloneJson(lastDirectiveAssistResult),
          campaignStateMutated,
          committed: false,
          campaignState: cloneJson(campaignState),
          view: viewEnvelope(campaignState ? 'mission' : 'campaign')
        };
      });
    },

    async runSideMissionProviderAssistance({
      roleId = SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder,
      candidateId = null,
      opportunityId = null,
      requestId = null,
      maxCandidates = 2,
      generationRouter = defaultGenerationRouter
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        requireObject(generationRouter, 'generationRouter');
        const assets = activeRuntimeAssets();
        const opportunityReview = detectPostChapter1SideMissionOpportunities({
          campaignState,
          packageData: assets.packageData,
          maxCandidates
        });
        const assistResult = await runSideMissionProviderAssist({
          generationRouter,
          opportunityReview,
          roleId,
          candidateId,
          opportunityId,
          requestId: requestId || idFactory('side-opportunity-provider-assist')
        });
        const committed = applySideMissionProviderAssistResult({
          campaignState,
          result: assistResult,
          appliedAt: timestampFromNow(now)
        });
        campaignState = committed.campaignState;
        const autosave = await autosaveStableTurn(committed.requestId);
        lastSideMissionProviderAssistResult = {
          ...cloneJson(assistResult),
          committedDiagnostics: {
            requestId: committed.requestId,
            acceptedProposalCount: committed.acceptedProposalCount,
            diagnosticCount: committed.diagnosticCount,
            autosave: cloneJson(autosave)
          }
        };
        activeScreen = 'campaign';
        return {
          assistResult: cloneJson(assistResult),
          committedDiagnostics: {
            requestId: committed.requestId,
            acceptedProposalCount: committed.acceptedProposalCount,
            diagnosticCount: committed.diagnosticCount
          },
          autosave: cloneJson(autosave),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async startSideMissionOpportunityScene({
      opportunityId = null,
      reason = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const result = applySideMissionOpportunitySceneStart({
          campaignState,
          opportunityId,
          sceneId: idFactory('side-opportunity-scene'),
          sceneStartedAt: timestampFromNow(now),
          reason
        });
        campaignState = result.campaignState;
        const autosave = await autosaveStableTurn(result.sceneRecord.sceneStartedById);
        activeScreen = 'campaign';
        return {
          sceneRecord: cloneJson(result.sceneRecord),
          sceneBrief: cloneJson(result.sceneBrief),
          autosave: cloneJson(autosave),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async commitSideMissionOpportunitySceneBeat({
      opportunityId = null,
      playerIntent = null,
      approach = 'coordination',
      reason = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const result = applySideMissionOpportunitySceneBeat({
          campaignState,
          opportunityId,
          beatId: idFactory('side-opportunity-scene-beat'),
          beatAt: timestampFromNow(now),
          playerIntent,
          approach,
          reason
        });
        campaignState = result.campaignState;
        const autosave = await autosaveStableTurn(result.sceneBeat.id);
        activeScreen = 'campaign';
        return {
          sceneRecord: cloneJson(result.sceneRecord),
          sceneBeat: cloneJson(result.sceneBeat),
          autosave: cloneJson(autosave),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async commitSideMissionOpportunityResolution({
      opportunityId = null,
      outcomeBand = 'Success',
      summary = null,
      reason = null,
      assignmentMode = 'direct',
      delegatedTo = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const result = applySideMissionOpportunityResolution({
          campaignState,
          opportunityId,
          resolutionId: idFactory('side-opportunity-resolution'),
          resolvedAt: timestampFromNow(now),
          outcomeBand,
          summary,
          reason,
          assignmentMode,
          delegatedTo
        });
        campaignState = result.campaignState;
        const autosave = await autosaveStableTurn(result.resolutionRecord.resolvedById);
        activeScreen = 'campaign';
        return {
          resolutionRecord: cloneJson(result.resolutionRecord),
          autosave: cloneJson(autosave),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async startOpenOrdersAssignmentScene({
      assignmentId = null,
      reason = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const result = applyOpenOrdersAssignmentSceneStart({
          campaignState,
          packageData: assets.packageData,
          assignmentId,
          sceneId: idFactory('open-orders-scene'),
          sceneStartedAt: timestampFromNow(now),
          reason
        });
        campaignState = result.campaignState;
        const autosave = await autosaveStableTurn(result.sceneRecord.sceneStartedById);
        activeScreen = 'campaign';
        return {
          sceneRecord: cloneJson(result.sceneRecord),
          sceneBrief: cloneJson(result.sceneBrief),
          pressureDelta: cloneJson(result.pressureDelta),
          autosave: cloneJson(autosave),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async commitOpenOrdersAssignmentSceneBeat({
      assignmentId = null,
      playerIntent = null,
      approach = 'coordination',
      reason = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const result = applyOpenOrdersAssignmentSceneBeat({
          campaignState,
          packageData: assets.packageData,
          assignmentId,
          beatId: idFactory('open-orders-scene-beat'),
          beatAt: timestampFromNow(now),
          playerIntent,
          approach,
          reason
        });
        campaignState = result.campaignState;
        const autosave = await autosaveStableTurn(result.sceneBeat.id);
        activeScreen = 'campaign';
        return {
          sceneRecord: cloneJson(result.sceneRecord),
          sceneBeat: cloneJson(result.sceneBeat),
          pressureDelta: cloneJson(result.pressureDelta),
          autosave: cloneJson(autosave),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async commitOpenOrdersAssignmentResolution({
      assignmentId = null,
      outcomeBand = 'Success',
      summary = null,
      reason = null,
      assignmentMode = 'direct',
      delegatedTo = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const result = applyOpenOrdersAssignmentResolution({
          campaignState,
          packageData: assets.packageData,
          assignmentId,
          resolutionId: idFactory('open-orders-resolution'),
          resolvedAt: timestampFromNow(now),
          outcomeBand,
          summary,
          reason,
          assignmentMode,
          delegatedTo
        });
        campaignState = result.campaignState;
        const autosave = await autosaveStableTurn(result.resolutionRecord.resolvedById);
        activeScreen = 'campaign';
        return {
          resolutionRecord: cloneJson(result.resolutionRecord),
          intervalProgress: cloneJson(result.intervalProgress),
          pressureDelta: cloneJson(result.pressureDelta),
          awardedAsset: cloneJson(result.awardedAsset),
          autosave: cloneJson(autosave),
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

    async generateNarrationForLastTurn({ provider = defaultNarrationProvider } = {}) {
      return run(async () => {
        await ensureInitialized();
        return generateNarrationForLastTurnNow({ provider });
      });
    },

    async retryNarrationForLastTurn({ provider = defaultNarrationProvider } = {}) {
      return run(async () => {
        await ensureInitialized();
        return generateNarrationForLastTurnNow({ provider });
      });
    }
  };
  return publicApi;
}
