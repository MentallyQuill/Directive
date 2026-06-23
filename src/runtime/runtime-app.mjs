import {
  deleteCommittedOutcome as restoreBeforeCommittedOutcome,
  pruneTurnSaveHistory,
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
import { resolveDirectiveNarrationContext } from '../generation/narration-context.mjs';
import { classifyChatTurn } from '../adjudication/utility-turn-classifier.mjs';
import { createCampaignSidecarScheduler } from '../jobs/campaign-sidecar-scheduler.mjs';
import { assertDirectiveHost } from '../hosts/host-contract.mjs';
import { runDirectiveAssist as runDirectiveAssistService } from '../assist/directive-assist.mjs';
import { runCharacterCreatorSectionDraft } from '../creators/character-creator-assist.mjs';
import { createPlayerPortraitUpload } from '../media/player-portrait-assets.mjs';
import { runCommandLogSummarySidecar } from '../jobs/command-log-summary-sidecar.mjs';
import { normalizeCampaignPackageZip } from '../packages/campaign-package-importer.mjs';
import {
  abandonQuest,
  acceptQuest,
  delegateQuest,
  offerQuest,
  openWorldQuestView,
  pauseForegroundQuest,
  rankQuestOpportunities,
  refreshQuestAvailability
} from '../quests/quest-director.mjs';
import {
  chooseForegroundQuest,
  timeAdvanceBoundary,
  travelBoundary
} from '../directors/director-coordinator.mjs';
import {
  listImportedCampaignPackageRecords,
  deletePlayerPortraitAsset,
  storePlayerPortraitAsset,
  storeImportedCampaignPackageRecord,
  loadDirectiveUiPreferences,
  saveDirectiveUiPreferences
} from '../storage/directive-storage-repository.mjs';
import { createCampaignStartController } from './campaign-start-controller.mjs';
import { createCampaignActivationCoordinator } from './campaign-activation-coordinator.mjs';
import { createCampaignConclusionService } from './campaign-conclusion-service.mjs';
import { createChatTurnOrchestrator } from './chat-turn-orchestrator.mjs';
import { createMessageReconciler } from './message-reconciler.mjs';
import { createResponseDispatcher } from './response-dispatcher.mjs';
import {
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking,
  recordModelCallEvent,
  recordRecoveryEvent
} from './state-delta-gateway.mjs';
import { createSceneReconciliationService } from './scene-reconciliation.mjs';
import { createTurnCommitCoordinator } from './turn-commit-coordinator.mjs';
import {
  commitProvisionalDirectorTurnRuntime,
  createProvisionalDirectorTurnRuntime,
  runDirectorTurnRuntime
} from './director-turn-runtime.mjs';

export const BUNDLED_CAMPAIGN_PACKAGE_REFS = Object.freeze([
  {
    packageUrl: new URL('../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json', import.meta.url),
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

function mergeObjects(base, patch) {
  if (!isObject(patch)) {
    return cloneJson(base || {});
  }
  const next = cloneJson(base || {});
  for (const [key, value] of Object.entries(patch)) {
    if (isObject(value) && isObject(next[key])) {
      next[key] = mergeObjects(next[key], value);
    } else {
      next[key] = cloneJson(value);
    }
  }
  return next;
}

function getNestedValue(source, path) {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

function setNestedValue(target, path, value) {
  const keys = String(path || '').split('.').filter(Boolean);
  if (keys.length === 0) return;
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    if (!isObject(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = value;
}

const DEFAULT_TURN_SAVE_HISTORY_LIMIT = 20;
const MIN_TURN_SAVE_HISTORY_LIMIT = 2;
const MAX_TURN_SAVE_HISTORY_LIMIT = 60;
const DEFAULT_AUTOSAVE_EVERY_MESSAGES = 20;
const MIN_AUTOSAVE_EVERY_MESSAGES = 1;
const MAX_AUTOSAVE_EVERY_MESSAGES = 200;

function normalizeTurnSaveHistoryLimit(value, fallback = DEFAULT_TURN_SAVE_HISTORY_LIMIT) {
  const numeric = Math.round(Number(value));
  const fallbackNumeric = Math.round(Number(fallback));
  const candidate = Number.isFinite(numeric)
    ? numeric
    : (Number.isFinite(fallbackNumeric) ? fallbackNumeric : DEFAULT_TURN_SAVE_HISTORY_LIMIT);
  return Math.max(
    MIN_TURN_SAVE_HISTORY_LIMIT,
    Math.min(MAX_TURN_SAVE_HISTORY_LIMIT, candidate)
  );
}

function normalizeAutosaveEveryMessages(value, fallback = DEFAULT_AUTOSAVE_EVERY_MESSAGES) {
  const numeric = Math.round(Number(value));
  const fallbackNumeric = Math.round(Number(fallback));
  const candidate = Number.isFinite(numeric)
    ? numeric
    : (Number.isFinite(fallbackNumeric) ? fallbackNumeric : DEFAULT_AUTOSAVE_EVERY_MESSAGES);
  return Math.max(
    MIN_AUTOSAVE_EVERY_MESSAGES,
    Math.min(MAX_AUTOSAVE_EVERY_MESSAGES, candidate)
  );
}

function applyTurnSaveHistoryLimit(campaignState, value = null) {
  if (!campaignState) return campaignState;
  const limit = normalizeTurnSaveHistoryLimit(
    value ?? campaignState.settings?.maxTurnSaveHistory ?? campaignState.runtimeTracking?.historyLimit
  );
  const next = initializeCampaignRuntimeTracking(campaignState, { historyLimit: limit });
  const history = Array.isArray(next.runtimeTracking.history)
    ? next.runtimeTracking.history.slice(Math.max(0, next.runtimeTracking.history.length - limit))
    : [];
  next.settings = {
    ...(next.settings || {}),
    maxTurnSaveHistory: limit
  };
  next.runtimeTracking = {
    ...next.runtimeTracking,
    historyLimit: limit,
    history,
    historyIndex: history.length - 1
  };
  return pruneTurnSaveHistory(next, limit);
}

function applyAutosaveEveryMessages(campaignState, value = null) {
  if (!campaignState) return campaignState;
  const interval = normalizeAutosaveEveryMessages(
    value ?? campaignState.settings?.autosaveEveryMessages
  );
  return {
    ...campaignState,
    settings: {
      ...(campaignState.settings || {}),
      autosaveEveryMessages: interval
    }
  };
}

function applyRuntimeSettings(campaignState, {
  maxTurnSaveHistory = null,
  autosaveEveryMessages = null
} = {}) {
  if (!campaignState) return campaignState;
  const next = applyTurnSaveHistoryLimit(campaignState, maxTurnSaveHistory);
  return applyAutosaveEveryMessages(next, autosaveEveryMessages);
}

function committedMessageCount(campaignState) {
  const runtimeCount = campaignState?.runtimeTracking?.lastCommittedTurn?.sequence;
  if (Number.isFinite(Number(runtimeCount)) && Number(runtimeCount) > 0) return Number(runtimeCount);
  const turnCount = campaignState?.turnLedger?.entries?.length;
  return Number.isFinite(Number(turnCount)) ? Number(turnCount) : 0;
}

function shouldAutosaveStableTurn(campaignState) {
  const interval = normalizeAutosaveEveryMessages(campaignState?.settings?.autosaveEveryMessages);
  const count = committedMessageCount(campaignState);
  return count > 0 && count % interval === 0;
}

function compactString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function flatFieldsToPatch(fields = {}, { baseInput = null, missingOnly = false } = {}) {
  const patch = {};
  for (const [path, value] of Object.entries(fields || {})) {
    if (!path || value === undefined || value === null) continue;
    if (missingOnly) {
      const existing = getNestedValue(baseInput, path);
      if (typeof existing === 'string' && existing.trim()) continue;
    }
    setNestedValue(patch, path, value);
  }
  return patch;
}

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function creatorInputReadyForReview(input = {}) {
  const identity = input.identity || {};
  const service = input.service || {};
  const personality = input.personality || {};
  const traits = personality.traits || {};
  return hasText(identity.name)
    && hasText(identity.pronounsOrAddress)
    && hasText(identity.speciesId)
    && hasText(identity.ageBandId)
    && hasText(identity.appearance)
    && hasText(service.careerBackgroundId)
    && hasText(service.formativeExperienceId)
    && hasText(service.assignmentReasonId)
    && hasText(traits.insight)
    && hasText(traits.connection)
    && hasText(traits.execution)
    && hasText(personality.flawId);
}

function creatorReviewHasGaps(input = {}) {
  const dossier = input.dossier || {};
  return !hasText(dossier.briefBiography) || !hasText(dossier.publicReputation);
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

export async function loadBundledCampaignPackageRecords({
  refs = BUNDLED_CAMPAIGN_PACKAGE_REFS,
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
      hasPromptMetadata: isObject(assets.packageData?.contextPolicy)
        && assets.packageData.contextPolicy.hiddenStatePolicy === 'explicit-player-safe-projection-only',
      missionGraphCount: Array.isArray(assets.missionGraphs) ? assets.missionGraphs.length : 0
    };
  }
  return summaries;
}

export function createDirectiveRuntimeApp({
  host = null,
  adapter = null,
  packageLoader = loadBundledCampaignPackageRecords,
  idFactory = defaultIdFactory(),
  narrationProvider = null,
  now = null
} = {}) {
  const runtimeHost = host ? assertDirectiveHost(host) : null;
  const storageAdapter = adapter || runtimeHost?.storage;
  let campaignState = null;
  let modelCallEventSequence = 0;
  const pendingModelCallEvents = [];

  function applyPendingModelCallEvents(state) {
    if (!state || pendingModelCallEvents.length === 0) return state;
    let next = initializeCampaignRuntimeTracking(state);
    const seen = new Set((next.runtimeTracking.modelCallJournal || []).map((entry) => entry.id));
    for (const event of pendingModelCallEvents) {
      if (seen.has(event.id)) continue;
      next = recordModelCallEvent(next, event);
      seen.add(event.id);
    }
    return next;
  }

  function recordRuntimeModelCallEvent(event = {}) {
    const modelCallEvent = {
      id: `model-call:${++modelCallEventSequence}:${event.roleId || 'unknown'}`,
      ...cloneJson(event),
      campaignRevision: campaignState?.runtimeTracking?.revision || 0,
      recordedAt: timestampFromNow(now)
    };
    pendingModelCallEvents.push(modelCallEvent);
    if (pendingModelCallEvents.length > 200) pendingModelCallEvents.shift();
    if (campaignState) {
      campaignState = applyPendingModelCallEvents(campaignState);
    }
  }

  function gameplayStateFingerprint(state) {
    const snapshot = cloneJson(state ?? null);
    if (snapshot?.runtimeTracking) {
      delete snapshot.runtimeTracking.modelCallJournal;
    }
    return JSON.stringify(snapshot);
  }

  const defaultGenerationRouter = runtimeHost
    ? createGenerationRouter({
        generationClient: runtimeHost.generation,
        now,
        onModelCall: recordRuntimeModelCallEvent
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
  let lastOpenWorldActionResult = null;
  let lastDirectiveAssistResult = null;
  let lastSceneReconciliationResult = null;
  let lastCharacterCreatorSectionDraftResult = null;
  let lastStateSafetyResult = null;
  let lastActivationResult = null;
  let lastConclusionResult = null;
  let lastDirectivePresetStatus = null;
  let lastDirectivePresetInstallResult = null;
  let lastManualSaveGuard = null;
  let currentChatScope = null;
  let hiddenCampaignSessionKeys = new Set();
  let lastError = null;
  let chatNativeServices = null;
  let durabilityCoordinator = null;
  let publicApi = null;

  async function loadUiPreferences() {
    const preferences = await loadDirectiveUiPreferences(storageAdapter, {
      now: timestampFromNow(now)
    });
    hiddenCampaignSessionKeys = new Set(
      (preferences.hiddenCampaignSessionKeys || [])
        .map((key) => compactString(key))
        .filter(Boolean)
    );
    return preferences;
  }

  async function persistUiPreferences() {
    return saveDirectiveUiPreferences(storageAdapter, {
      hiddenCampaignSessionKeys: [...hiddenCampaignSessionKeys]
    }, {
      now: timestampFromNow(now)
    });
  }

  function activeSaveGuardSummary(reason) {
    switch (reason) {
      case 'ok':
        return 'Ready to save: the active chat matches this save.';
      case 'no-campaign-state':
        return 'Load a campaign save before saving.';
      case 'campaign-chat-unbound':
        return 'This save is not linked to a campaign chat yet. Use Rebind Chat, then save from that chat.';
      case 'no-active-chat-selected':
        return 'Choose the campaign chat for this save before saving. Save Game is disabled until that chat is active.';
      case 'missing-host-identity-capability':
        return 'This host cannot tell Directive which chat is active, so Save Game is disabled here.';
      case 'different-directive-save':
        return 'The active chat is linked to a different save branch of this campaign. Load that branch, or open this save\'s campaign chat before saving.';
      case 'different-directive-campaign':
        return 'The active chat is linked to a different Directive campaign. Open this save\'s campaign chat before saving.';
      case 'unbound-chat':
        return 'The active chat is not linked to this save. Open this save\'s campaign chat before saving.';
      case 'binding-save-mismatch':
        return 'This save\'s chat link points to a different save id. Load the save again or use Rebind Chat before saving.';
      case 'corrupt-metadata':
        return 'The active chat has conflicting Directive save data. Use Rebind Chat before saving.';
      case 'metadata-unreadable':
        return 'Directive could not read the active chat\'s save data. Open this save\'s campaign chat and try again.';
      default:
        return 'Save Game is disabled until Directive can confirm the active chat belongs to this save.';
    }
  }

  function activeSaveGuardRecoveryActions(reason, binding = null) {
    switch (reason) {
      case 'ok':
        return [];
      case 'different-directive-save':
        return ['loadActiveChatSave', 'openCampaignChat'];
      case 'campaign-chat-unbound':
      case 'corrupt-metadata':
      case 'binding-save-mismatch':
        return ['rebindChat'];
      case 'missing-host-identity-capability':
        return ['hostCapabilityDiagnostic'];
      case 'no-active-chat-selected':
      case 'different-directive-campaign':
      case 'unbound-chat':
      case 'metadata-unreadable':
      default:
        return binding?.chatId ? ['openCampaignChat'] : [];
    }
  }

  function activeSaveGuardResult(reason, {
    state = campaignState,
    binding = state?.campaignChatBinding || null,
    expectedSaveId = null,
    activeChatId = '',
    activeMetadata = null,
    metadataError = null
  } = {}) {
    const boundCampaignId = compactString(binding?.campaignId) || compactString(state?.campaign?.id);
    const boundSaveId = compactString(binding?.saveId) || compactString(expectedSaveId);
    const activeCampaignId = compactString(activeMetadata?.campaignId);
    const activeSaveId = compactString(activeMetadata?.saveId);
    const summary = activeSaveGuardSummary(reason);
    return {
      ok: reason === 'ok',
      reason,
      summary,
      activeChatId: compactString(activeChatId) || null,
      boundChatId: compactString(binding?.chatId) || null,
      activeMetadata: cloneJson(activeMetadata || null),
      metadataError: metadataError ? { message: metadataError?.message || String(metadataError) } : null,
      boundCampaignId: boundCampaignId || null,
      boundSaveId: boundSaveId || null,
      activeCampaignId: activeCampaignId || null,
      activeSaveId: activeSaveId || null,
      recoveryActions: activeSaveGuardRecoveryActions(reason, binding)
    };
  }

  async function rebuildPackageLibrary({ recoverActiveSave = true } = {}) {
    const loaded = await packageLoader();
    importedPackageRecords = await listImportedCampaignPackageRecords(storageAdapter);
    await loadUiPreferences();
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
      ? applyRuntimeSettings(controller.activeCampaignState)
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
    const packageId = campaignState?.activeCampaignPackage?.packageId || controller?.activePackageId;
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

  function activeCreatorRuntimeAssets() {
    const packageId = creatorView?.package?.id || controller?.activePackageId || campaignView?.activePackageId;
    const assets = packageId ? runtimeAssetsByPackageId.get(packageId) : null;
    if (!assets?.packageData) {
      throw new Error(`No Character Creator package assets are loaded for package "${packageId || 'unknown'}"`);
    }
    return assets;
  }

  function canStorePlayerPortraits() {
    return typeof storageAdapter?.writeBase64File === 'function';
  }

  function assertPlayerPortraitStorageSupported() {
    if (!canStorePlayerPortraits()) {
      const error = new Error('This Directive host does not support player portrait uploads.');
      error.code = 'DIRECTIVE_PLAYER_PORTRAIT_UNSUPPORTED';
      throw error;
    }
  }

  async function appendReviewFallbackIfNeeded(patch = {}) {
    const normalizedPatch = cloneJson(patch);
    if (normalizedPatch.activeStep !== 'review') {
      return normalizedPatch;
    }
    const mergedInput = mergeObjects(creatorView?.input || {}, normalizedPatch.input || {});
    if (!creatorInputReadyForReview(mergedInput) || !creatorReviewHasGaps(mergedInput)) {
      return normalizedPatch;
    }
    const assets = activeCreatorRuntimeAssets();
    const assistResult = await runCharacterCreatorSectionDraft({
      packageData: assets.packageData,
      creatorView,
      sectionId: 'review',
      input: mergedInput,
      generationRouter: null,
      useProvider: false
    });
    const fallbackPatch = flatFieldsToPatch(assistResult.fields || {}, {
      baseInput: mergedInput,
      missingOnly: true
    });
    if (Object.keys(fallbackPatch).length === 0) {
      return normalizedPatch;
    }
    normalizedPatch.input = mergeObjects(normalizedPatch.input || {}, fallbackPatch);
    lastCharacterCreatorSectionDraftResult = {
      ...cloneJson(assistResult),
      autoApplied: true
    };
    return normalizedPatch;
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

  async function currentHostChatForSaveGuard() {
    const chat = runtimeHost?.chat || null;
    const hasCurrentChatId = typeof chat?.getCurrentChatId === 'function';
    const hasCurrentBinding = typeof chat?.getCurrentBinding === 'function';
    if (!chat || (!hasCurrentChatId && !hasCurrentBinding)) {
      return { capability: false, activeChatId: '', activeIdentity: null };
    }
    let activeChatId = '';
    let activeIdentity = null;
    if (hasCurrentChatId) {
      activeChatId = compactString(await chat.getCurrentChatId());
    }
    if ((!activeChatId || hasCurrentBinding) && hasCurrentBinding) {
      activeIdentity = await chat.getCurrentBinding();
      if (!activeChatId) activeChatId = compactString(activeIdentity?.chatId);
    }
    return {
      capability: true,
      activeChatId,
      activeIdentity: cloneJson(activeIdentity || null)
    };
  }

  async function currentHostChatMetadataForSaveGuard() {
    if (typeof runtimeHost?.chat?.getBindingMetadata !== 'function') {
      return { metadata: null, error: null };
    }
    try {
      return {
        metadata: cloneJson(await runtimeHost.chat.getBindingMetadata()),
        error: null
      };
    } catch (error) {
      return { metadata: null, error };
    }
  }

  async function evaluateActiveChatSaveGuard(state = campaignState, {
    expectedSaveId = null
  } = {}) {
    if (!state) {
      return activeSaveGuardResult('no-campaign-state', { state, expectedSaveId });
    }
    const binding = state.campaignChatBinding || null;
    if (!binding?.chatId) {
      return activeSaveGuardResult('campaign-chat-unbound', { state, binding, expectedSaveId });
    }

    const boundSaveId = compactString(binding.saveId) || compactString(expectedSaveId);
    const loadedSaveId = compactString(expectedSaveId);
    if (loadedSaveId && boundSaveId && loadedSaveId !== boundSaveId) {
      return activeSaveGuardResult('binding-save-mismatch', { state, binding, expectedSaveId });
    }

    const current = await currentHostChatForSaveGuard();
    if (!current.capability) {
      return activeSaveGuardResult('missing-host-identity-capability', { state, binding, expectedSaveId });
    }
    if (!current.activeChatId) {
      return activeSaveGuardResult('no-active-chat-selected', { state, binding, expectedSaveId });
    }

    const { metadata, error } = await currentHostChatMetadataForSaveGuard();
    if (error) {
      return activeSaveGuardResult('metadata-unreadable', {
        state,
        binding,
        expectedSaveId,
        activeChatId: current.activeChatId,
        metadataError: error
      });
    }

    const boundCampaignId = compactString(binding.campaignId) || compactString(state.campaign?.id);
    const activeCampaignId = compactString(metadata?.campaignId);
    const activeSaveId = compactString(metadata?.saveId);
    const activeChatMatches = current.activeChatId === compactString(binding.chatId);
    if (!activeChatMatches) {
      if (activeCampaignId && boundCampaignId && activeCampaignId !== boundCampaignId) {
        return activeSaveGuardResult('different-directive-campaign', {
          state,
          binding,
          expectedSaveId,
          activeChatId: current.activeChatId,
          activeMetadata: metadata
        });
      }
      if (activeCampaignId && activeCampaignId === boundCampaignId && activeSaveId && activeSaveId !== boundSaveId) {
        return activeSaveGuardResult('different-directive-save', {
          state,
          binding,
          expectedSaveId,
          activeChatId: current.activeChatId,
          activeMetadata: metadata
        });
      }
      return activeSaveGuardResult('unbound-chat', {
        state,
        binding,
        expectedSaveId,
        activeChatId: current.activeChatId,
        activeMetadata: metadata
      });
    }

    if (metadata) {
      if (
        (activeCampaignId && boundCampaignId && activeCampaignId !== boundCampaignId)
        || (activeSaveId && boundSaveId && activeSaveId !== boundSaveId)
      ) {
        return activeSaveGuardResult('corrupt-metadata', {
          state,
          binding,
          expectedSaveId,
          activeChatId: current.activeChatId,
          activeMetadata: metadata
        });
      }
    }

    return activeSaveGuardResult('ok', {
      state,
      binding,
      expectedSaveId,
      activeChatId: current.activeChatId,
      activeMetadata: metadata
    });
  }

  async function refreshManualSaveGuard(state = campaignState, options = {}) {
    lastManualSaveGuard = await evaluateActiveChatSaveGuard(state, {
      expectedSaveId: options.expectedSaveId ?? controller?.activeSaveId ?? state?.campaignChatBinding?.saveId ?? null
    });
    return lastManualSaveGuard;
  }

  function campaignPackageIdForState(state = null) {
    return state?.activeCampaignPackage?.packageId
      || state?.packageId
      || state?.campaign?.packageId
      || controller?.activePackageId
      || campaignView?.activePackageId
      || null;
  }

  function optionalRuntimeAssetsForState(state = null) {
    const packageId = campaignPackageIdForState(state);
    if (!packageId) return null;
    return runtimeAssetsByPackageId.get(packageId) || null;
  }

  function packageContextForState(state = null) {
    const packageId = campaignPackageIdForState(state);
    if (!packageId || !controller?.getPackageContext) return null;
    try {
      return controller.getPackageContext({ packageId });
    } catch {
      return null;
    }
  }

  function normalizedBinding(binding = null) {
    if (!binding || typeof binding !== 'object') return null;
    return {
      hostId: compactString(binding.hostId) || runtimeHost?.id || null,
      chatId: compactString(binding.chatId) || null,
      chatName: compactString(binding.chatName || binding.name) || null,
      campaignId: compactString(binding.campaignId) || null,
      saveId: compactString(binding.saveId) || null,
      entityType: compactString(binding.entityType) || null,
      entityId: compactString(binding.entityId) || null,
      entityName: compactString(binding.entityName) || null,
      status: compactString(binding.status) || null
    };
  }

  function bindingFromSave(save = null) {
    return normalizedBinding(save?.metadata?.campaignChatBinding || null);
  }

  function bindingFromState(state = null) {
    const binding = normalizedBinding(state?.campaignChatBinding || null);
    if (!binding) return null;
    return {
      ...binding,
      campaignId: binding.campaignId || compactString(state?.campaign?.id) || null,
      saveId: binding.saveId || compactString(controller?.activeSaveId) || null
    };
  }

  function campaignSessionKeyFromParts({ hostId = null, campaignId = null, saveId = null, chatId = null } = {}) {
    return [
      compactString(hostId) || runtimeHost?.id || 'host',
      compactString(campaignId) || 'campaign',
      compactString(saveId) || 'save',
      compactString(chatId) || 'chat'
    ].join(':');
  }

  function campaignSessionKeyForSave(save = null) {
    const binding = bindingFromSave(save);
    const metadata = save?.metadata || {};
    return campaignSessionKeyFromParts({
      hostId: binding?.hostId || runtimeHost?.id || 'host',
      campaignId: binding?.campaignId || metadata.campaignId,
      saveId: binding?.saveId || save?.id,
      chatId: binding?.chatId || metadata.chatId
    });
  }

  function campaignSessionKeyForState(state = null, fallbackSaveId = null) {
    const binding = bindingFromState(state);
    return campaignSessionKeyFromParts({
      hostId: binding?.hostId || runtimeHost?.id || 'host',
      campaignId: binding?.campaignId || state?.campaign?.id,
      saveId: binding?.saveId || fallbackSaveId,
      chatId: binding?.chatId
    });
  }

  async function loadCampaignStateForSessionSave(saveId = null) {
    const id = compactString(saveId);
    if (!id) return null;
    const loadedBinding = bindingFromState(campaignState);
    if (campaignState && id === (loadedBinding?.saveId || controller?.activeSaveId)) {
      return campaignState;
    }
    campaignState = applyRuntimeSettings(await controller.loadGame({ saveId: id }));
    pendingDirectorTurn = null;
    pendingOutcomeReplacement = null;
    await refreshCampaignView();
    return campaignState;
  }

  function saveMatchesChat(save, chatId, metadata = null) {
    const id = compactString(chatId);
    if (!id) return false;
    const binding = bindingFromSave(save);
    if (binding?.chatId && binding.chatId === id) return true;
    const metaCampaignId = compactString(metadata?.campaignId);
    const metaSaveId = compactString(metadata?.saveId);
    return Boolean(metaSaveId && save?.id === metaSaveId && (!metaCampaignId || save?.metadata?.campaignId === metaCampaignId));
  }

  function currentChatStatus({ activeChatId = '', metadata = null, save = null, state = null } = {}) {
    const loadedCampaignId = compactString(campaignState?.campaign?.id);
    const loadedSaveId = compactString(controller?.activeSaveId || campaignState?.campaignChatBinding?.saveId);
    const activeCampaignId = compactString(metadata?.campaignId || save?.metadata?.campaignId || state?.campaign?.id);
    const activeSaveId = compactString(metadata?.saveId || save?.id || state?.campaignChatBinding?.saveId);
    if (!activeChatId) return 'none-selected';
    if (!activeCampaignId && !activeSaveId && !state) return 'non-directive';
    if (loadedCampaignId && activeCampaignId && activeCampaignId !== loadedCampaignId) return 'different-campaign';
    if (loadedSaveId && activeSaveId && activeSaveId !== loadedSaveId) return 'different-save';
    return 'matching-campaign';
  }

  function chatNativeViewForState(state = null, saveGuard = null) {
    if (!state) return null;
    return {
      binding: cloneJson(state.campaignChatBinding || null),
      activation: cloneJson(state.activationJournal || null),
      tracking: state.runtimeTracking ? {
        revision: state.runtimeTracking.revision || 0,
        lastStableRevision: state.runtimeTracking.lastStableRevision || 0,
        historyDepth: state.runtimeTracking.history?.length || 0,
        ingressCount: state.runtimeTracking.ingressLedger?.length || 0,
        responseCount: state.runtimeTracking.responseLedger?.length || 0,
        sidecarCount: state.runtimeTracking.sidecarJournal?.length || 0,
        modelCallCount: state.runtimeTracking.modelCallJournal?.length || 0,
        lastDelta: cloneJson(state.runtimeTracking.lastDelta || null),
        lastCommittedTurn: cloneJson(state.runtimeTracking.lastCommittedTurn || null),
        latestModelCall: cloneJson((state.runtimeTracking.modelCallJournal || []).at(-1) || null)
      } : null,
      prompt: cloneJson(state.campaignChatBinding?.promptContext || null),
      manualSaveGuard: cloneJson(saveGuard || null),
      pendingInteractions: cloneJson(state.runtimeTracking?.pendingInteractions || []),
      recovery: cloneJson(state.runtimeTracking?.recoveryJournal || []),
      modelCalls: cloneJson(state.runtimeTracking?.modelCallJournal || []),
      sceneReconciliation: cloneJson(state.runtimeTracking?.sceneReconciliation || null)
    };
  }

  function liveCampaignStateForView() {
    const scoped = currentChatScope?.campaignState || null;
    const scopedBinding = bindingFromState(scoped);
    const loadedBinding = bindingFromState(campaignState);
    if (
      scoped
      && campaignState
      && scopedBinding?.chatId
      && loadedBinding?.chatId
      && scopedBinding.chatId === loadedBinding.chatId
      && (scopedBinding.saveId || '') === (loadedBinding.saveId || '')
    ) {
      return campaignState;
    }
    if (scoped) return scoped;
    return null;
  }

  function shouldRenderLoadedCampaignState(tabId, currentChatCampaignState = null) {
    if (currentChatCampaignState || !campaignState) return false;
    if (!['campaign', 'mission'].includes(tabId)) return false;
    const campaignStatus = compactString(campaignState.campaign?.status);
    if (['activating', 'activationFailed'].includes(campaignStatus)) return true;
    if (currentChatScope?.error) return false;
    if (['metadata-conflict', 'different-save', 'different-campaign'].includes(currentChatScope?.currentChat?.status)) return false;
    const loadedBinding = bindingFromState(campaignState);
    const activeChatId = compactString(currentChatScope?.currentChat?.chatId);
    return Boolean(
      campaignStatus === 'active'
      && activeChatId
      && loadedBinding?.chatId
      && loadedBinding.chatId === activeChatId
    );
  }

  async function refreshBlockedManualSaveGuard() {
    if (!campaignState) return null;
    const binding = bindingFromState(campaignState);
    const guard = await evaluateActiveChatSaveGuard(campaignState, {
      expectedSaveId: binding?.saveId || controller?.activeSaveId || null
    });
    lastManualSaveGuard = cloneJson(guard);
    return guard;
  }

  function campaignSessionStatus(save = null, binding = null) {
    if (save?.metadata?.campaignStatus) return save.metadata.campaignStatus;
    if (!binding?.chatId) return 'needs-chat';
    if (save?.current === true) return 'current';
    return save?.slotType === 'autosave' ? 'autosave' : 'stored';
  }

  function buildCampaignSessions() {
    const saves = Array.isArray(campaignView?.saves) ? campaignView.saves : [];
    const nonAutosaves = saves.filter((save) => save?.slotType !== 'autosave' || save?.current === true);
    const baseRows = nonAutosaves.length ? nonAutosaves : saves.slice(0, 12);
    return baseRows.map((save) => {
      const binding = bindingFromSave(save);
      const key = campaignSessionKeyForSave(save);
      const currentChatMatch = Boolean(currentChatScope?.currentChat?.chatId && saveMatchesChat(save, currentChatScope.currentChat.chatId, currentChatScope.currentChat.metadata));
      return {
        key,
        saveId: save.id,
        campaignId: save.metadata?.campaignId || binding?.campaignId || null,
        campaignTitle: save.metadata?.campaignTitle || 'Campaign',
        packageId: save.metadata?.packageId || null,
        packageTitle: save.metadata?.packageTitle || null,
        playerName: save.metadata?.playerName || 'Player Commander',
        shipName: save.metadata?.shipName || null,
        saveName: save.name || save.id,
        slotType: save.slotType || 'manual',
        current: save.current === true,
        updatedAt: save.updatedAt || save.metadata?.lastUpdatedAt || null,
        stardate: save.metadata?.stardate || null,
        activeMissionId: save.metadata?.activeMissionId || null,
        activePhaseId: save.metadata?.activePhaseId || null,
        summary: save.metadata?.summary || null,
        binding: cloneJson(binding),
        status: campaignSessionStatus(save, binding),
        hidden: hiddenCampaignSessionKeys.has(key),
        currentChat: currentChatMatch,
        attention: !binding?.chatId ? 'missing-chat' : (currentChatMatch ? 'current-chat' : null)
      };
    }).sort((left, right) => {
      if (Boolean(left.attention) !== Boolean(right.attention)) return left.attention ? -1 : 1;
      if (left.currentChat !== right.currentChat) return left.currentChat ? -1 : 1;
      if (left.hidden !== right.hidden) return left.hidden ? 1 : -1;
      return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
    });
  }

  function campaignIndexView() {
    const sessions = buildCampaignSessions();
    return {
      sessions,
      visibleSessions: sessions.filter((session) => !session.hidden),
      hiddenSessionKeys: [...hiddenCampaignSessionKeys],
      counts: {
        sessions: sessions.length,
        visible: sessions.filter((session) => !session.hidden).length,
        hidden: sessions.filter((session) => session.hidden).length
      }
    };
  }

  async function refreshCurrentChatCampaignScope() {
    const current = await currentHostChatForSaveGuard();
    const base = {
      currentChat: {
        capability: current.capability === true,
        chatId: current.activeChatId || null,
        identity: cloneJson(current.activeIdentity || null),
        metadata: null,
        status: current.capability ? 'none-selected' : 'missing-capability'
      },
      campaignState: null,
      saveId: null,
      campaignId: null,
      guard: null,
      error: null
    };
    if (!current.capability) {
      const guard = await refreshBlockedManualSaveGuard();
      currentChatScope = {
        ...base,
        guard: cloneJson(guard || null)
      };
      return currentChatScope;
    }
    if (!current.activeChatId) {
      const guard = await refreshBlockedManualSaveGuard();
      currentChatScope = {
        ...base,
        guard: cloneJson(guard || null)
      };
      return currentChatScope;
    }

    const { metadata, error } = await currentHostChatMetadataForSaveGuard();
    base.currentChat.metadata = cloneJson(metadata || null);
    if (error) {
      currentChatScope = {
        ...base,
        currentChat: {
          ...base.currentChat,
          status: 'metadata-conflict'
        },
        error: { message: error?.message || String(error) }
      };
      return currentChatScope;
    }

    const saves = Array.isArray(campaignView?.saves) ? campaignView.saves : [];
    const save = saves.find((entry) => saveMatchesChat(entry, current.activeChatId, metadata)) || null;
    let resolvedState = null;
    let status = 'non-directive';
    let guard = null;
    if (save) {
      try {
        resolvedState = await loadCampaignStateForSessionSave(save.id);
        const binding = bindingFromState(resolvedState);
        if (binding?.chatId && binding.chatId !== current.activeChatId) {
          status = 'metadata-conflict';
        } else {
          status = currentChatStatus({
            activeChatId: current.activeChatId,
            metadata,
            save,
            state: resolvedState
          });
          guard = await evaluateActiveChatSaveGuard(resolvedState, { expectedSaveId: save.id });
        }
      } catch (loadError) {
        status = 'missing-save';
        base.error = { message: loadError?.message || String(loadError) };
      }
    } else if (metadata?.saveId || metadata?.campaignId) {
      status = 'missing-save';
    } else {
      const loadedBinding = bindingFromState(campaignState);
      if (loadedBinding?.chatId && loadedBinding.chatId === current.activeChatId) {
        resolvedState = campaignState;
        status = currentChatStatus({
          activeChatId: current.activeChatId,
          metadata,
          state: resolvedState
        });
        guard = await evaluateActiveChatSaveGuard(resolvedState, { expectedSaveId: loadedBinding.saveId || controller?.activeSaveId || null });
      }
    }

    if (!guard && campaignState) {
      const loadedBinding = bindingFromState(campaignState);
      guard = await evaluateActiveChatSaveGuard(campaignState, {
        expectedSaveId: loadedBinding?.saveId || controller?.activeSaveId || null
      });
    }

    if (guard) {
      lastManualSaveGuard = cloneJson(guard);
    }

    currentChatScope = {
      ...base,
      currentChat: {
        ...base.currentChat,
        status
      },
      campaignState: cloneJson(resolvedState),
      saveId: save?.id || bindingFromState(resolvedState)?.saveId || null,
      campaignId: save?.metadata?.campaignId || resolvedState?.campaign?.id || null,
      guard: cloneJson(guard || null)
    };
    return currentChatScope;
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
        roleRouting: cloneJson(runtimeHost.providers.listRoleRouting?.() || []),
        profiles: cloneJson(runtimeHost.providers.listProfiles?.() || [])
      };
    } catch (error) {
      return {
        error: { message: error?.message || String(error) }
      };
    }
  }

  function directivePresetViewData() {
    if (!runtimeHost?.presets) return null;
    try {
      const status = runtimeHost.presets.latestStatus?.() || runtimeHost.presets.getStatus?.() || null;
      lastDirectivePresetStatus = cloneJson(status);
      return {
        status: cloneJson(status),
        lastInstallResult: cloneJson(lastDirectivePresetInstallResult)
      };
    } catch (error) {
      return {
        status: {
          state: 'error',
          pill: 'Error',
          message: error?.message || String(error),
          canInstall: false
        },
        lastInstallResult: cloneJson(lastDirectivePresetInstallResult)
      };
    }
  }

  function viewEnvelope(tabId) {
    if (campaignState) campaignState = applyPendingModelCallEvents(campaignState);
    const currentChatCampaignState = liveCampaignStateForView();
    const renderLoadedCampaignState = shouldRenderLoadedCampaignState(tabId, currentChatCampaignState);
    const renderedCampaignState = currentChatCampaignState || (renderLoadedCampaignState ? campaignState : null);
    const activePackage = controller?.activePackageId
      ? controller.getPackageContext({ packageId: controller.activePackageId })
      : null;
    const currentChatActivePackage = packageContextForState(renderedCampaignState);
    const renderedAssets = optionalRuntimeAssetsForState(renderedCampaignState);
    const loadedAssets = optionalRuntimeAssetsForState(campaignState);
    const renderedSaveGuard = renderLoadedCampaignState ? lastManualSaveGuard : (currentChatScope?.guard || null);
    let openWorld = null;
    if (renderedCampaignState) {
      if (renderedAssets?.packageData) {
        openWorld = openWorldQuestView(renderedCampaignState, renderedAssets.packageData);
      }
    }
    return {
      kind: 'directive.runtimeView',
      activeTab: tabId,
      activeScreen,
      activePackageId: controller?.activePackageId || campaignView?.activePackageId || null,
      activeSaveId: controller?.activeSaveId || campaignView?.activeSaveId || null,
      activePackage: cloneJson(activePackage),
      currentChatActivePackage: cloneJson(currentChatActivePackage),
      campaign: campaignViewEnvelope(),
      campaignIndex: campaignIndexView(),
      creator: cloneJson(creatorView),
      campaignState: cloneJson(renderedCampaignState),
      currentChatCampaignState: cloneJson(currentChatCampaignState),
      loadedCampaignState: cloneJson(campaignState),
      loadedSave: {
        saveId: controller?.activeSaveId || campaignState?.campaignChatBinding?.saveId || null,
        campaignId: campaignState?.campaign?.id || null,
        status: campaignState ? (currentChatCampaignState || renderLoadedCampaignState ? 'loaded' : 'loaded-not-current-chat') : 'none'
      },
      playerSafeCampaign: createPlayerSafeCampaignProjection({
        campaignState: renderedCampaignState,
        packageData: renderedAssets?.packageData || null,
        crewDataset: renderedAssets?.crewDataset || null
      }),
      loadedPlayerSafeCampaign: createPlayerSafeCampaignProjection({
        campaignState,
        packageData: loadedAssets?.packageData || null,
        crewDataset: loadedAssets?.crewDataset || null
      }),
      chatNative: chatNativeViewForState(renderedCampaignState, renderedSaveGuard),
      loadedChatNative: chatNativeViewForState(campaignState, lastManualSaveGuard),
      currentChat: cloneJson(currentChatScope?.currentChat || null),
      currentChatCampaignGuard: cloneJson(currentChatScope?.guard || null),
      providerConfiguration: providerViewData(),
      directivePreset: directivePresetViewData(),
      promptInspection: cloneJson(runtimeHost?.prompt?.inspect?.() || null),
      host: runtimeHost ? {
        id: runtimeHost.id,
        displayName: runtimeHost.displayName,
        capabilities: cloneJson(runtimeHost.capabilities)
      } : null,
      media: {
        playerPortraitImportSupported: canStorePlayerPortraits()
      },
      storageDiagnostics: cloneJson(controller?.storageDiagnostics || null),
      lastDirectorTurn: cloneJson(lastDirectorTurn),
      lastNarrationResult: cloneJson(lastNarrationResult),
      lastCommandLogSummarySidecarResult: cloneJson(lastCommandLogSummarySidecarResult),
      lastOpenWorldActionResult: cloneJson(lastOpenWorldActionResult),
      lastDirectiveAssistResult: cloneJson(lastDirectiveAssistResult),
      lastSceneReconciliationResult: cloneJson(lastSceneReconciliationResult),
      lastCharacterCreatorSectionDraftResult: cloneJson(lastCharacterCreatorSectionDraftResult),
      lastStateSafetyResult: cloneJson(lastStateSafetyResult),
      lastActivationResult: cloneJson(lastActivationResult),
      lastConclusionResult: cloneJson(lastConclusionResult),
      lastDirectivePresetInstallResult: cloneJson(lastDirectivePresetInstallResult),
      pendingDirectorTurn: cloneJson(pendingDirectorTurn),
      pendingOutcomeReplacement: cloneJson(pendingOutcomeReplacement),
      openWorld: cloneJson(openWorld),
      lastError: lastError ? {
        message: lastError.message || String(lastError)
      } : null
    };
  }

  async function autosaveStableTurn(outcomeId) {
    const interval = normalizeAutosaveEveryMessages(campaignState?.settings?.autosaveEveryMessages);
    const messageCount = committedMessageCount(campaignState);
    if (!shouldAutosaveStableTurn(campaignState)) {
      return {
        ok: true,
        skipped: true,
        reason: 'autosave-interval',
        outcomeId: outcomeId || null,
        messageCount,
        autosaveEveryMessages: interval,
        nextAutosaveIn: messageCount > 0 ? interval - (messageCount % interval) : interval
      };
    }
    try {
      const result = await controller.autosaveCurrentGame({
        campaignState,
        summary: `Autosave after ${messageCount} committed message${messageCount === 1 ? '' : 's'}.`
      });
      await refreshCampaignView();
      return {
        ok: true,
        skipped: false,
        outcomeId: outcomeId || null,
        messageCount,
        autosaveEveryMessages: interval,
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

  const OPEN_WORLD_MUTATION_DOMAINS = Object.freeze([
    'campaign',
    'mission',
    'worldState',
    'storyArcLedger',
    'questLedger',
    'dynamicQuestCatalog',
    'knowledgeLedger',
    'threadLedger',
    'eventLedger',
    'attentionState',
    'pressureLedger',
    'relationships',
    'crew',
    'ship',
    'campaignTracks',
    'campaignAssets',
    'turnLedger',
    'commandLog',
    'runtimeTracking'
  ]);

  async function commitOpenWorldMutation(nextState, {
    source = 'openWorldRuntime',
    reason = 'Open-world campaign state updated.',
    summary = reason,
    eventId = null,
    stable = true
  } = {}) {
    requireObject(nextState, 'nextState');
    const gateway = createStateDeltaGateway({
      getState: () => campaignState,
      setState: (state) => { campaignState = cloneJson(state); },
      persist: (state, delta) => persistRuntimeCampaignState(state, delta?.summary || delta?.reason || summary),
      now
    });
    const tracked = await gateway.commit(nextState, {
      source,
      reason,
      summary,
      domains: OPEN_WORLD_MUTATION_DOMAINS,
      outcomeId: eventId,
      stable
    });
    campaignState = tracked;
    await refreshCampaignView();
    return tracked;
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
        ok: result.featureOk === true,
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
    campaignState = applyPendingModelCallEvents(cloneJson(state));
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
    const sceneReconciliation = createSceneReconciliationService({
      getCampaignState,
      stateDeltaGateway,
      host: runtimeHost,
      now,
      idFactory
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
      sceneReconciliation,
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
        await refreshManualSaveGuard();
        await refreshCurrentChatCampaignScope();
        return viewEnvelope('campaign');
      });
    },

    async getCurrentView({ tabId = 'campaign' } = {}) {
      return run(async () => {
        await ensureInitialized();
        if (tabId === 'campaign' && activeScreen !== 'creator') {
          await refreshCampaignView();
        }
        await refreshManualSaveGuard();
        await refreshCurrentChatCampaignScope();
        return viewEnvelope(tabId);
      });
    },

    getChatTurnOrchestrator() {
      return ensureChatNativeServices()?.orchestrator || null;
    },

    async observeHostPlayerMessage(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        await refreshCurrentChatCampaignScope();
        const services = ensureChatNativeServices();
        if (!services) return { handled: false, reason: 'chat-native-host-unavailable' };
        return services.orchestrator.observePlayerMessage(payload);
      });
    },

    async interceptHostGeneration(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        await refreshCurrentChatCampaignScope();
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
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        const services = ensureChatNativeServices();
        const result = services
          ? await services.orchestrator.handleChatChanged(payload)
          : { active: false, reason: 'chat-native-host-unavailable' };
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return result;
      });
    },

    async openCampaignChat({ saveId = null, binding = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const requestedSaveId = compactString(saveId);
        if (requestedSaveId) {
          await loadCampaignStateForSessionSave(requestedSaveId);
        }
        const targetBinding = normalizedBinding(binding)
          || bindingFromState(campaignState)
          || null;
        if (!targetBinding?.chatId) return { ok: false, reason: 'campaign-chat-unbound' };
        const opened = await runtimeHost?.chat?.open?.(targetBinding);
        await refreshManualSaveGuard();
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        const services = ensureChatNativeServices();
        const chatChange = services
          ? await services.orchestrator.handleChatChanged({ reason: 'open-campaign-chat' })
          : null;
        return {
          ok: opened !== false,
          binding: cloneJson(targetBinding),
          chatChange: cloneJson(chatChange || null),
          view: viewEnvelope('mission')
        };
      });
    },

    async hideCampaignSession({ key } = {}) {
      return run(async () => {
        await ensureInitialized();
        const sessionKey = compactString(key);
        if (!sessionKey) throw new Error('Campaign session key is required.');
        hiddenCampaignSessionKeys.add(sessionKey);
        await persistUiPreferences();
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return viewEnvelope('campaign');
      });
    },

    async showCampaignSession({ key } = {}) {
      return run(async () => {
        await ensureInitialized();
        const sessionKey = compactString(key);
        if (!sessionKey) throw new Error('Campaign session key is required.');
        hiddenCampaignSessionKeys.delete(sessionKey);
        await persistUiPreferences();
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return viewEnvelope('campaign');
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

    async setReconciliationStart(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.setStart(payload);
        lastSceneReconciliationResult = cloneJson(result);
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async setReconciliationEnd(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.setEnd(payload);
        lastSceneReconciliationResult = cloneJson(result);
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async reconcileMessage(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.reconcileMessage(payload);
        lastSceneReconciliationResult = cloneJson(result);
        if (Array.isArray(result?.applied) && result.applied.length > 0) {
          await synchronizeActivePrompt(campaignState, {
            persist: true,
            rebuild: true,
            reason: 'Prompt context rebuilt after scene reconciliation.'
          });
        }
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async reconcileFromHere(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.reconcileFromHere(payload);
        lastSceneReconciliationResult = cloneJson(result);
        if (Array.isArray(result?.applied) && result.applied.length > 0) {
          await synchronizeActivePrompt(campaignState, {
            persist: true,
            rebuild: true,
            reason: 'Prompt context rebuilt after scene reconciliation.'
          });
        }
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async reconcileMarkedPassage(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.reconcileMarked(payload);
        lastSceneReconciliationResult = cloneJson(result);
        if (Array.isArray(result?.applied) && result.applied.length > 0) {
          await synchronizeActivePrompt(campaignState, {
            persist: true,
            rebuild: true,
            reason: 'Prompt context rebuilt after marked scene reconciliation.'
          });
        }
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async recalculateFromHere(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.recalculateFromHere(payload);
        let preview = null;
        if (result?.ok && result.outcomeId && payload.preview !== false) {
          const playerInput = String(
            payload.playerInput
            || payload.message?.text
            || payload.text
            || result.anchor?.textPreview
            || 'Recalculate from selected chat passage.'
          ).trim();
          try {
            preview = await publicApi.previewOutcomeReplacement({
              outcomeId: result.outcomeId,
              playerInput,
              type: 'recalculateFromHere'
            });
          } catch (error) {
            preview = {
              ok: false,
              error: {
                code: error?.code || null,
                message: error?.message || String(error)
              }
            };
          }
        }
        lastSceneReconciliationResult = {
          ...cloneJson(result),
          preview: cloneJson(preview)
        };
        await refreshCampaignView();
        return {
          result: cloneJson(result),
          preview: cloneJson(preview),
          view: viewEnvelope('mission')
        };
      });
    },

    async openPendingReconciliation() {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.openPending();
        lastSceneReconciliationResult = cloneJson(result);
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async applyPendingReconciliation({ proposalId = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.applyPending({ proposalId });
        lastSceneReconciliationResult = cloneJson(result);
        if (result?.ok) {
          await synchronizeActivePrompt(campaignState, {
            persist: true,
            rebuild: true,
            reason: 'Prompt context rebuilt after accepted reconciliation proposal.'
          });
        }
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async rejectPendingReconciliation({ proposalId = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const service = ensureChatNativeServices()?.sceneReconciliation;
        if (!service) throw new Error('Scene reconciliation is unavailable for this host.');
        const result = await service.rejectPending({ proposalId });
        lastSceneReconciliationResult = cloneJson(result);
        await refreshCampaignView();
        return { result: cloneJson(result), view: viewEnvelope('mission') };
      });
    },

    async retryCampaignActivation() {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const services = ensureChatNativeServices();
        if (!services) throw new Error('The active host does not expose Directive chat activation capabilities.');
        const assets = activeRuntimeAssets();
        const existingChatId = campaignState.campaignChatBinding?.chatId || null;
        lastActivationResult = await services.activationCoordinator.activate({
          campaignState,
          packageData: assets.packageData,
          crewDataset: assets.crewDataset,
          saveId: controller.activeSaveId,
          existingChatId,
          createNewChat: !existingChatId
        });
        campaignState = applyRuntimeSettings(lastActivationResult.campaignState);
        await refreshCampaignView();
        return { ...cloneJson(lastActivationResult), view: viewEnvelope('campaign') };
      });
    },

    async rewriteCampaignIntro(payload = {}) {
      return run(async () => {
        await ensureInitialized();
        await refreshCurrentChatCampaignScope();
        requireObject(campaignState, 'campaignState');
        const services = ensureChatNativeServices();
        if (!services?.activationCoordinator?.rewriteIntro) {
          throw new Error('Campaign intro rewrite is unavailable for this host.');
        }
        const assets = activeRuntimeAssets();
        const hostMessageId = compactString(
          payload.hostMessageId
          || payload.message?.hostMessageId
          || payload.message?.id
        ) || null;
        const result = await services.activationCoordinator.rewriteIntro({
          campaignState,
          packageData: assets.packageData,
          saveId: controller.activeSaveId,
          hostMessageId,
          reason: compactString(payload.reason) || 'player-intro-reroll'
        });
        if (result?.campaignState) {
          campaignState = applyRuntimeSettings(result.campaignState);
          lastActivationResult = cloneJson(result);
        }
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return {
          ok: result?.ok !== false,
          reason: result?.ok === false ? (result.summary || result.reason || 'Campaign intro could not be rewritten.') : undefined,
          result: cloneJson(result),
          view: viewEnvelope('mission')
        };
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

    async updateRuntimeHistoryLimit({ maxTurnSaveHistory = null, historyLimit = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const limit = normalizeTurnSaveHistoryLimit(maxTurnSaveHistory ?? historyLimit);
        campaignState = applyRuntimeSettings(campaignState, { maxTurnSaveHistory: limit });
        const save = await controller.saveCurrentGame({
          campaignState,
          summary: `Runtime turn save history limited to ${limit} turn(s).`
        });
        await refreshCampaignView();
        return {
          kind: 'directive.runtimeHistoryLimitUpdated',
          maxTurnSaveHistory: limit,
          historyLimit: limit,
          save: cloneJson(save),
          view: viewEnvelope('settings')
        };
      });
    },

    async updateRuntimeSettings({
      maxTurnSaveHistory = null,
      historyLimit = null,
      autosaveEveryMessages = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const limit = normalizeTurnSaveHistoryLimit(
          maxTurnSaveHistory ?? historyLimit ?? campaignState.settings?.maxTurnSaveHistory ?? campaignState.runtimeTracking?.historyLimit
        );
        const autosaveInterval = normalizeAutosaveEveryMessages(
          autosaveEveryMessages ?? campaignState.settings?.autosaveEveryMessages
        );
        campaignState = applyRuntimeSettings(campaignState, {
          maxTurnSaveHistory: limit,
          autosaveEveryMessages: autosaveInterval
        });
        const save = await controller.saveCurrentGame({
          campaignState,
          summary: `Runtime settings updated: ${limit} turn history, autosave every ${autosaveInterval} message(s).`
        });
        await refreshCampaignView();
        return {
          kind: 'directive.runtimeSettingsUpdated',
          maxTurnSaveHistory: limit,
          historyLimit: limit,
          autosaveEveryMessages: autosaveInterval,
          save: cloneJson(save),
          view: viewEnvelope('settings')
        };
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

    async updateProviderRoleRouting({ roleId, providerKind } = {}) {
      return run(async () => {
        await ensureInitialized();
        const role = requireNonEmptyString(roleId, 'roleId');
        const kind = requireNonEmptyString(providerKind, 'providerKind');
        if (!runtimeHost?.providers?.updateRoleProviderKind) throw new Error('Provider role routing is unavailable on this host.');
        const route = runtimeHost.providers.updateRoleProviderKind(role, kind);
        await refreshCampaignView();
        return { roleId: role, providerKind: kind, route: cloneJson(route), providerConfiguration: providerViewData(), view: viewEnvelope('settings') };
      });
    },

    async resetProviderRoleRouting({ roleId } = {}) {
      return run(async () => {
        await ensureInitialized();
        const role = requireNonEmptyString(roleId, 'roleId');
        if (!runtimeHost?.providers?.resetRoleProviderKind) throw new Error('Provider role routing is unavailable on this host.');
        const route = runtimeHost.providers.resetRoleProviderKind(role);
        await refreshCampaignView();
        return { roleId: role, route: cloneJson(route), providerConfiguration: providerViewData(), view: viewEnvelope('settings') };
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

    async refreshDirectivePresetStatus() {
      return run(async () => {
        await ensureInitialized();
        if (!runtimeHost?.presets?.getStatus) throw new Error('Directive preset status is unavailable on this host.');
        lastDirectivePresetStatus = runtimeHost.presets.getStatus();
        return {
          directivePreset: {
            status: cloneJson(lastDirectivePresetStatus),
            lastInstallResult: cloneJson(lastDirectivePresetInstallResult)
          },
          view: viewEnvelope('settings')
        };
      });
    },

    async installDirectivePreset() {
      return run(async () => {
        await ensureInitialized();
        if (!runtimeHost?.presets?.installBundledPreset) throw new Error('Directive preset installation is unavailable on this host.');
        lastDirectivePresetInstallResult = await runtimeHost.presets.installBundledPreset();
        lastDirectivePresetStatus = lastDirectivePresetInstallResult?.status || runtimeHost.presets.getStatus?.() || null;
        return {
          ...cloneJson(lastDirectivePresetInstallResult),
          directivePreset: {
            status: cloneJson(lastDirectivePresetStatus),
            lastInstallResult: cloneJson(lastDirectivePresetInstallResult)
          },
          view: viewEnvelope('settings')
        };
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

    async rebindCampaignChat({ existingChatId = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        if (!runtimeHost?.chat?.createOrBindCampaignChat) throw new Error('Host chat binding is unavailable.');
        const previousBinding = cloneJson(campaignState.campaignChatBinding || null);
        const reboundAt = timestampFromNow(now);
        const binding = await runtimeHost.chat.createOrBindCampaignChat({
          campaignId: campaignState.campaign?.id,
          saveId: controller.activeSaveId,
          existingChatId,
          createNew: false
        });
        campaignState = {
          ...campaignState,
          campaignChatBinding: {
            ...cloneJson(binding),
            status: 'bound',
            reboundAt,
            introMessageId: campaignState.campaignChatBinding?.introMessageId || null,
            promptContextRevision: 0
          }
        };
        const opened = await runtimeHost.chat.open?.(campaignState.campaignChatBinding);
        if (opened === false) {
          const error = new Error('Directive rebound the campaign chat but the host could not open it.');
          error.code = 'DIRECTIVE_CAMPAIGN_REBIND_OPEN_FAILED';
          throw error;
        }
        const prompt = await synchronizeActivePrompt(campaignState, {
          persist: true,
          rebuild: true,
          reason: 'Prompt context rebuilt after campaign chat rebinding.'
        });
        const recentMessages = typeof runtimeHost.chat.getRecentMessages === 'function'
          ? await runtimeHost.chat.getRecentMessages({ limit: 1, playerSafeOnly: true })
          : null;
        campaignState = recordRecoveryEvent(campaignState, {
          id: `rebind:${campaignState.campaign?.id || 'campaign'}:${reboundAt}`,
          type: 'chatRebind',
          status: 'applied',
          recordedAt: reboundAt,
          details: {
            previousChatId: previousBinding?.chatId || null,
            nextChatId: campaignState.campaignChatBinding?.chatId || null,
            previousBinding,
            binding: cloneJson(campaignState.campaignChatBinding),
            promptContextRevision: campaignState.campaignChatBinding?.promptContextRevision || null,
            chatSyncCheck: recentMessages
              ? {
                  checked: true,
                  recentMessageCount: recentMessages.length,
                  mode: 'metadata-only',
                  historyImported: false
                }
              : {
                  checked: false,
                  reason: 'recent-message-adapter-unavailable',
                  historyImported: false
                }
          }
        });
        await persistRuntimeCampaignState(campaignState, 'Campaign chat rebound and recovery journal updated.');
        await refreshManualSaveGuard();
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
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

    async importCampaignPackageArchive({ fileName, bytes } = {}) {
      return run(async () => {
        await ensureInitialized();
        const importedAt = timestampFromNow(now);
        const normalized = normalizeCampaignPackageZip({
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
        const stored = await storeImportedCampaignPackageRecord(storageAdapter, {
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
        const draftPatch = await appendReviewFallbackIfNeeded(patch);
        const result = await controller.saveCreatorDraft({
          draftId: requireNonEmptyString(activeCreatorDraftId, 'activeCreatorDraftId'),
          patch: draftPatch,
          reason
        });
        creatorView = result.view;
        activeScreen = 'creator';
        await refreshCampaignView();
        return viewEnvelope('campaign');
      });
    },

    async generateCreatorSectionDraft({
      sectionId,
      input = {},
      generationRouter = defaultGenerationRouter,
      useProvider = true
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireNonEmptyString(activeCreatorDraftId, 'activeCreatorDraftId');
        const assets = activeCreatorRuntimeAssets();
        const mergedInput = mergeObjects(creatorView?.input || {}, isObject(input) ? input : {});
        const assistResult = await runCharacterCreatorSectionDraft({
          packageData: assets.packageData,
          creatorView,
          sectionId,
          input: mergedInput,
          generationRouter,
          useProvider
        });
        lastCharacterCreatorSectionDraftResult = cloneJson(assistResult);
        activeScreen = 'creator';
        return {
          assistResult: cloneJson(assistResult),
          view: viewEnvelope('campaign')
        };
      });
    },

    async importCreatorPortrait({
      file = null,
      bytes = null,
      arrayBuffer = null,
      base64 = '',
      mimeType = '',
      fileName = '',
      input = null,
      activeStep = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        assertPlayerPortraitStorageSupported();
        const draftId = requireNonEmptyString(activeCreatorDraftId, 'activeCreatorDraftId');
        const mergedInput = mergeObjects(creatorView?.input || {}, isObject(input) ? input : {});
        const previousPortrait = mergedInput.identity?.portrait || null;
        const upload = await createPlayerPortraitUpload({
          file,
          bytes,
          arrayBuffer,
          base64,
          mimeType,
          fileName,
          ownerKind: 'creatorDraft',
          ownerId: draftId,
          now: () => timestampFromNow(now)
        });
        const portrait = await storePlayerPortraitAsset(storageAdapter, upload, {
          ownerKind: 'creatorDraft',
          ownerId: draftId,
          now: timestampFromNow(now)
        });
        const result = await controller.saveCreatorDraft({
          draftId,
          patch: {
            activeStep: activeStep || creatorView?.activeStep || 'identity',
            input: mergeObjects(mergedInput, {
              identity: {
                portrait
              }
            })
          },
          reason: 'portraitImport'
        });
        creatorView = result.view;
        activeScreen = 'creator';
        if (previousPortrait?.asset?.path && previousPortrait.asset.path !== portrait.asset.path) {
          await deletePlayerPortraitAsset(storageAdapter, previousPortrait, {
            now: timestampFromNow(now)
          });
        }
        await refreshCampaignView();
        return {
          portrait: cloneJson(portrait),
          view: viewEnvelope('campaign')
        };
      });
    },

    async removeCreatorPortrait({
      input = null,
      activeStep = null
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        const draftId = requireNonEmptyString(activeCreatorDraftId, 'activeCreatorDraftId');
        const mergedInput = mergeObjects(creatorView?.input || {}, isObject(input) ? input : {});
        const previousPortrait = mergedInput.identity?.portrait || null;
        const result = await controller.saveCreatorDraft({
          draftId,
          patch: {
            activeStep: activeStep || creatorView?.activeStep || 'identity',
            input: mergeObjects(mergedInput, {
              identity: {
                portrait: null
              }
            })
          },
          reason: 'portraitRemove'
        });
        creatorView = result.view;
        activeScreen = 'creator';
        const deleteResult = previousPortrait
          ? await deletePlayerPortraitAsset(storageAdapter, previousPortrait, {
              now: timestampFromNow(now)
            })
          : null;
        await refreshCampaignView();
        return {
          portrait: null,
          deleteResult: cloneJson(deleteResult),
          view: viewEnvelope('campaign')
        };
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

    async returnCreatorToCampaignLibrary({ patch = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        if (activeCreatorDraftId && patch) {
          requireObject(patch, 'patch');
          const result = await controller.saveCreatorDraft({
            draftId: activeCreatorDraftId,
            patch,
            reason: 'libraryExit'
          });
          creatorView = result.view;
        }
        if (activeCreatorDraftId && creatorView?.progress?.hasMeaningfulInput !== true) {
          await controller.discardCreatorDraft({ draftId: activeCreatorDraftId });
        }
        activeScreen = 'campaign';
        creatorView = null;
        activeCreatorDraftId = null;
        await refreshCampaignView();
        return viewEnvelope('campaign');
      });
    },

    async discardCreatorDraft({ draftId = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const targetDraftId = requireNonEmptyString(draftId || activeCreatorDraftId, 'draftId');
        const result = await controller.discardCreatorDraft({ draftId: targetDraftId });
        if (!activeCreatorDraftId || activeCreatorDraftId === targetDraftId) {
          activeScreen = 'campaign';
          creatorView = null;
          activeCreatorDraftId = null;
        }
        await refreshCampaignView();
        return {
          result: cloneJson(result),
          view: viewEnvelope('campaign')
        };
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
        lastCharacterCreatorSectionDraftResult = null;
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
        campaignState = applyRuntimeSettings(result.campaignState);
        activeCreatorDraftId = null;
        creatorView = null;
        pendingDirectorTurn = null;
        pendingOutcomeReplacement = null;
        lastDirectorTurn = null;
        lastNarrationResult = null;
        lastCommandLogSummarySidecarResult = null;
        lastDirectiveAssistResult = null;
        lastCharacterCreatorSectionDraftResult = null;
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
          campaignState = applyRuntimeSettings(lastActivationResult.campaignState);
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
        await refreshManualSaveGuard();
        await refreshCurrentChatCampaignScope();
        return viewEnvelope('mission');
      });
    },

    async importPlayerPortrait({
      file = null,
      bytes = null,
      arrayBuffer = null,
      base64 = '',
      mimeType = '',
      fileName = ''
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        assertPlayerPortraitStorageSupported();
        requireObject(campaignState, 'campaignState');
        const campaignId = requireNonEmptyString(campaignState.campaign?.id, 'campaignState.campaign.id');
        const previousPortrait = campaignState.player?.portrait || null;
        const upload = await createPlayerPortraitUpload({
          file,
          bytes,
          arrayBuffer,
          base64,
          mimeType,
          fileName,
          ownerKind: 'campaign',
          ownerId: campaignId,
          now: () => timestampFromNow(now)
        });
        const portrait = await storePlayerPortraitAsset(storageAdapter, upload, {
          ownerKind: 'campaign',
          ownerId: campaignId,
          now: timestampFromNow(now)
        });
        campaignState = {
          ...cloneJson(campaignState),
          player: {
            ...(campaignState.player || {}),
            portrait: {
              ...portrait,
              owner: {
                kind: 'campaign',
                id: campaignId,
                subjectId: 'player-commander'
              }
            }
          }
        };
        const save = await persistRuntimeCampaignState(campaignState, 'Updated player character portrait.');
        if (previousPortrait?.asset?.path && previousPortrait.asset.path !== portrait.asset.path) {
          await deletePlayerPortraitAsset(storageAdapter, previousPortrait, {
            now: timestampFromNow(now)
          });
        }
        return {
          portrait: cloneJson(campaignState.player.portrait),
          save,
          view: viewEnvelope('crew')
        };
      });
    },

    async removePlayerPortrait() {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const previousPortrait = campaignState.player?.portrait || null;
        campaignState = {
          ...cloneJson(campaignState),
          player: {
            ...(campaignState.player || {}),
            portrait: null
          }
        };
        const save = await persistRuntimeCampaignState(campaignState, 'Removed player character portrait.');
        const deleteResult = previousPortrait
          ? await deletePlayerPortraitAsset(storageAdapter, previousPortrait, {
              now: timestampFromNow(now)
            })
          : null;
        return {
          portrait: null,
          deleteResult: cloneJson(deleteResult),
          save,
          view: viewEnvelope('crew')
        };
      });
    },

    async loadGame({ saveId }) {
      return run(async () => {
        await ensureInitialized();
        campaignState = applyRuntimeSettings(await controller.loadGame({
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
          campaignState = applyRuntimeSettings(lastActivationResult.campaignState);
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
        await refreshManualSaveGuard();
        await refreshCurrentChatCampaignScope();
        return viewEnvelope('mission');
      });
    },

    async deleteCampaignSave({ saveId }) {
      return run(async () => {
        await ensureInitialized();
        const result = await controller.deleteCampaignSave({
          saveId: requireNonEmptyString(saveId, 'saveId')
        });
        if (result.deletedActive === true) {
          campaignState = null;
          pendingDirectorTurn = null;
          pendingOutcomeReplacement = null;
          lastDirectorTurn = null;
          lastNarrationResult = null;
          lastCommandLogSummarySidecarResult = null;
          lastOpenWorldActionResult = null;
          lastDirectiveAssistResult = null;
          lastSceneReconciliationResult = null;
          lastActivationResult = null;
          lastConclusionResult = null;
          await runtimeHost?.prompt?.clear?.({ reason: 'active-save-deleted' });
        }
        activeScreen = 'campaign';
        await refreshCampaignView();
        return {
          deleteResult: cloneJson(result),
          view: viewEnvelope('campaign')
        };
      });
    },

    async saveCurrentGame({ summary = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const guard = await refreshManualSaveGuard(campaignState);
        if (!guard.ok) {
          await refreshCampaignView();
          return {
            ok: false,
            blocked: true,
            saveGuard: cloneJson(guard),
            view: viewEnvelope('campaign')
          };
        }
        const save = await controller.saveCurrentGame({
          campaignState,
          summary
        });
        await runtimeHost?.chat?.updateBindingMetadata?.(campaignState.campaignChatBinding);
        await refreshManualSaveGuard(campaignState, { expectedSaveId: save.id });
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return {
          ok: true,
          saveGuard: cloneJson(lastManualSaveGuard),
          save: cloneJson(save),
          view: viewEnvelope('mission')
        };
      });
    },

    async saveCurrentGameAs({ name = null, branchFrom = null } = {}) {
      return run(async () => {
        await ensureInitialized();
        const guard = await refreshManualSaveGuard(campaignState);
        if (!guard.ok) {
          await refreshCampaignView();
          return {
            ok: false,
            blocked: true,
            saveGuard: cloneJson(guard),
            view: viewEnvelope('campaign')
          };
        }
        const branchSave = await controller.saveCurrentGameAs({
          name,
          campaignState,
          branchFrom: branchFrom || {
            divergenceOutcomeId: campaignState?.turnLedger?.lastCommittedOutcomeId || null
          }
        });
        campaignState = {
          ...campaignState,
          campaignChatBinding: {
            ...(campaignState.campaignChatBinding || {}),
            saveId: branchSave.id
          }
        };
        await runtimeHost?.chat?.updateBindingMetadata?.(campaignState.campaignChatBinding);
        const promptResult = await synchronizeActivePrompt(campaignState, {
          persist: false,
          rebuild: true,
          reason: 'Prompt context rebuilt after Save Game As branch creation.'
        });
        campaignState = promptResult?.campaignState
          ? applyRuntimeSettings(promptResult.campaignState)
          : applyRuntimeSettings(campaignState);
        const save = await controller.saveCurrentGame({
          saveId: branchSave.id,
          campaignState,
          summary: 'Save branch created. This chat now points to the new branch.'
        });
        await refreshManualSaveGuard(campaignState, { expectedSaveId: save.id });
        await refreshCampaignView();
        await refreshCurrentChatCampaignScope();
        return {
          ok: true,
          saveGuard: cloneJson(lastManualSaveGuard),
          save: cloneJson(save),
          branchSave: cloneJson(branchSave),
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
          packageData: assets.packageData,
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
          packageData: assets.packageData,
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
          packageData: assets.packageData,
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

    async getQuestOpportunities({
      playerIntent = null,
      statuses = ['available', 'offered', 'accepted', 'active', 'delegated'],
      limit = 8
    } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const availability = refreshQuestAvailability(campaignState, assets.packageData, {
          now: () => timestampFromNow(now)
        });
        const stateForView = availability.state;
        return {
          kind: 'directive.openWorldQuestOpportunities',
          changes: cloneJson(availability.changes),
          opportunities: rankQuestOpportunities({
            state: stateForView,
            packageData: assets.packageData,
            playerIntent,
            statuses,
            limit
          }),
          openWorld: openWorldQuestView(stateForView, assets.packageData, { limit }),
          campaignState: cloneJson(campaignState),
          view: viewEnvelope('mission')
        };
      });
    },

    async offerOpenWorldQuest({ questId, reason = 'runtime-quest-offered' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const id = requireNonEmptyString(questId, 'questId');
        const next = offerQuest(campaignState, assets.packageData, id, {
          now: () => timestampFromNow(now),
          reason
        });
        const tracked = await commitOpenWorldMutation(next, {
          source: 'openWorldQuest',
          reason: `Offered open-world quest ${id}.`,
          summary: 'Open-world quest offered.'
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldQuestOffered', questId: id };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
      });
    },

    async acceptOpenWorldQuest({ questId, makeForeground = false, reason = 'runtime-quest-accepted' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const id = requireNonEmptyString(questId, 'questId');
        const next = acceptQuest(campaignState, assets.packageData, id, {
          now: () => timestampFromNow(now),
          makeForeground: makeForeground === true,
          reason
        });
        const tracked = await commitOpenWorldMutation(next, {
          source: 'openWorldQuest',
          reason: `Accepted open-world quest ${id}.`,
          summary: 'Open-world quest accepted.'
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldQuestAccepted', questId: id, foreground: makeForeground === true };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
      });
    },

    async activateOpenWorldQuest({ questId, reason = 'runtime-quest-activated' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const id = requireNonEmptyString(questId, 'questId');
        const result = chooseForegroundQuest({
          state: campaignState,
          packageData: assets.packageData,
          questId: id,
          now: () => timestampFromNow(now)
        });
        const tracked = await commitOpenWorldMutation(result.state, {
          source: 'openWorldQuest',
          reason: reason || `Activated open-world quest ${id}.`,
          summary: 'Open-world quest activated.',
          eventId: result.event?.id || null
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldQuestActivated', questId: id, boundary: cloneJson(result.diagnostics || null) };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
      });
    },

    async pauseOpenWorldQuest({ reason = 'runtime-quest-paused' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const next = pauseForegroundQuest(campaignState, {
          now: () => timestampFromNow(now),
          reason
        });
        const tracked = await commitOpenWorldMutation(next, {
          source: 'openWorldQuest',
          reason: 'Paused foreground open-world quest.',
          summary: 'Foreground quest paused.'
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldQuestPaused' };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
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
        const stateBefore = gameplayStateFingerprint(campaignState);
        const narrationContext = await resolveDirectiveNarrationContext(runtimeHost, {
          roleId: 'directiveAssist'
        });
        const assistResult = await runDirectiveAssistService({
          action,
          inputText,
          campaignState,
          packageData: assets?.packageData || null,
          crewDataset: assets?.crewDataset || null,
          missionGraph: optionalActiveMissionGraph(assets),
          narrationContext,
          generationRouter,
          useProvider
        });
        const campaignStateMutated = stateBefore !== gameplayStateFingerprint(campaignState);
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

    async delegateOpenWorldQuest({ questId, actorIds = [], delegatedTo = [], reason = 'runtime-quest-delegated' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const id = requireNonEmptyString(questId, 'questId');
        const assignees = Array.isArray(actorIds) && actorIds.length ? actorIds : delegatedTo;
        const next = delegateQuest(campaignState, assets.packageData, id, assignees, {
          now: () => timestampFromNow(now),
          reason
        });
        const tracked = await commitOpenWorldMutation(next, {
          source: 'openWorldQuest',
          reason: `Delegated open-world quest ${id}.`,
          summary: 'Open-world quest delegated.'
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldQuestDelegated', questId: id, assignedActorIds: cloneJson(assignees) };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
      });
    },

    async abandonOpenWorldQuest({ questId, reason = 'runtime-quest-abandoned' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const id = requireNonEmptyString(questId, 'questId');
        const result = abandonQuest(campaignState, assets.packageData, id, {
          now: () => timestampFromNow(now),
          reason
        });
        const tracked = await commitOpenWorldMutation(result.state, {
          source: 'openWorldQuest',
          reason: `Abandoned open-world quest ${id}.`,
          summary: 'Open-world quest abandoned.',
          eventId: result.events?.[0]?.id || null
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldQuestAbandoned', questId: id, events: cloneJson(result.events || []) };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
      });
    },

    async travelOpenWorld({ destinationId, reason = 'runtime-travel' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const id = requireNonEmptyString(destinationId, 'destinationId');
        const result = travelBoundary({
          state: campaignState,
          packageData: assets.packageData,
          destinationId: id,
          now: () => timestampFromNow(now)
        });
        const tracked = await commitOpenWorldMutation(result.state, {
          source: 'openWorldTravel',
          reason: reason || `Travelled to ${id}.`,
          summary: 'Open-world travel completed.',
          eventId: result.event?.id || null
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldTravel', destinationId: id, boundary: cloneJson(result.diagnostics || null) };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
      });
    },

    async advanceOpenWorldTime({ hours = 1, reason = 'downtime' } = {}) {
      return run(async () => {
        await ensureInitialized();
        requireObject(campaignState, 'campaignState');
        const assets = activeRuntimeAssets();
        const amount = Math.max(0.25, Number(hours) || 1);
        const result = timeAdvanceBoundary({
          state: campaignState,
          packageData: assets.packageData,
          hours: amount,
          reason,
          now: () => timestampFromNow(now)
        });
        const tracked = await commitOpenWorldMutation(result.state, {
          source: 'openWorldTime',
          reason: `Advanced open-world time by ${amount} hour(s).`,
          summary: 'Open-world time advanced.',
          eventId: result.event?.id || null
        });
        lastOpenWorldActionResult = { kind: 'directive.openWorldTimeAdvanced', hours: amount, boundary: cloneJson(result.diagnostics || null) };
        activeScreen = 'campaign';
        return { ...cloneJson(lastOpenWorldActionResult), campaignState: cloneJson(tracked), view: viewEnvelope('mission') };
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
