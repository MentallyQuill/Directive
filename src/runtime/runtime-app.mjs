import { createCharacterRuntimeSnapshot } from './character-runtime-snapshot.mjs';
import { prepareProtectedCharacterTurn } from './protected-character-turn.mjs';
import { createCharacterPublicationGuard } from './character-publication-guard.mjs';
import { stableSha256Hex } from './v1-stable-hash.mjs';
import { createProtectedNarrationPacing } from '../narration/character-scene-narrator.mjs';
import { isStatePublicationError } from './state-publication-errors.mjs';
import { normalizeNarrationSettings, createNarrationPolicy } from '../narration/narration-policy.mjs';
import { createScenePacingContext } from '../narration/scene-pacing.mjs';
import { createCharacterInformationProjection, CHARACTER_INFORMATION_POLICY } from '../story/character-information.mjs';
import { createOpeningLifecycle } from '../narration/opening-lifecycle.mjs';
import { createTranscriptFinalizationLane, transcriptNotReady } from './transcript-finalization-lane.mjs';
import { createGenerationCancellation, generationAbortedError } from './generation-cancellation.mjs';
import { getOpeningPremiseErrors } from '../narration/campaign-opening.mjs';
import { runCharacterCreatorSectionDraft } from '../creators/character-creator-assist.mjs';
import {
  armV1CommandBearingEdge,
  pendingV1CommandBearingEdge,
  refundV1CommandBearingSpend,
  reserveV1CohesionRelief,
  reserveV1CommandBearingEdge
} from '../command/v1-command-bearing.mjs';
import { createPlayerPortraitUpload } from '../media/player-portrait-assets.mjs';
import { createGenerationRoleRegistry } from '../generation/generation-roles.mjs';
import { resolveAnalysisLimits, resolveProviderMaxTokens } from '../generation/analysis-limits.mjs';
import { normalizeDirectiveProviderSettings, providerKindForRole } from '../providers/directive-provider-settings.mjs';
import {
  createV1PromptProjection,
  createV1WorkingStoryPromptProjection
} from '../projection/v1/prompt-projection.mjs';
import { createPeoplePromptProjection } from '../projection/v1/people-projection.mjs';
import { deriveGameplayNotifications } from '../projection/v1/gameplay-notifications.mjs';
import { createPlayerAuthorityPolicy } from './player-authority-policy.mjs';
import { normalizeV1HostMessageVisibility, stableJsonStringify } from './v1-host-message-contracts.mjs';
import { createSimulationModePolicy } from '../simulation/simulation-mode-policy.mjs';
import { createMissionTransitionNarrationPacket } from '../mission/v1/mission-transition-narration.mjs';
import { createDutyReportManifest } from '../mission/v1/duty-report-delivery.mjs';
import { evaluateMissionPredicate } from '../mission/v1/predicate-evaluator.mjs';
import { missionStateContext } from '../mission/v1/mission-state.mjs';
import { createShipOperationalPacket } from '../ship/v1/ship-operational-packet.mjs';
import {
  deleteV1PlayerPortrait,
  storeV1PlayerPortrait
} from '../storage/v1-player-portrait-storage.mjs';
import { createCampaignStartController } from './campaign-start-controller.mjs';
import {
  createV1CampaignLibrary,
  indexRuntimeAssets,
  loadBundledCampaignPackageRecords
} from './package-library.mjs';
import { createStateDeltaGateway } from './state-delta-gateway.mjs';
import {
  V1_ACCEPTED_PAIR_SOURCE_WINDOW,
  captureV1AssistantSourceVariant,
  captureV1StorySource,
  prepareV1AcceptedPairSnapshot,
} from './v1-accepted-pair-source.mjs';
import {
  prepareV1AcceptedPairTimeAdvance,
  prepareV1AcceptedPairTimeInvalidationByHostMessages
} from './v1-accepted-pair-time.mjs';
import {
  buildV1RuntimePlayerProjection,
  createNarrationGenerationTargetKey,
  createV1MissionRuntime,
  captureAcceptedPairAnalysis
} from './v1-mission-runtime.mjs';
import { assertV1CampaignState } from './v1-campaign-state.mjs';
import { createTimelineTransactionService } from './timeline-transaction-service.mjs';
import { BRANCH_DECISION_HISTORY_UNAVAILABLE, BRANCH_DECISION_HISTORY_MESSAGE, nativeBranchRefusalMatches } from './native-branch-refusal.mjs';
import {
  acceptedPairFingerprint,
  assertAcceptedPairRecovery,
  createAcceptedPairCallBudget,
  noAcceptedPairRecovery,
  pairRetryRecovery,
  reconcileRequiredRecovery,
} from './accepted-pair-recovery-state.mjs';
import { createStoryDirectionAnalyst } from '../story/story-director.mjs';
import { createCharacterSceneAdmission } from '../story/character-scene-admission.mjs';
import { createContinuityAnalyst, parseContinuityAnalystOutput } from '../story/continuity-analyst.mjs';
import { selectDirectorReceipt } from '../story/story-settlement.mjs';
import { createPeopleDossierAuthor } from '../people/people-dossier-author.mjs';
import {
  createPeopleDossierQueue,
  prepareDossierAttempt,
  prepareDossierEnrichment,
  prepareDossierRetries,
} from './people-dossier-queue.mjs';
import { createTurnCommit } from './turn-state-reconciler.mjs';
import { createTurnProgressReporter } from './turn-progress.mjs';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact(value) {
  return String(value ?? '').trim();
}

const DIRECTIVE_PROMPT_BINDING_FIELDS = Object.freeze([
  'hostId', 'campaignId', 'saveId', 'chatId', 'entityType', 'entityId', 'entityName',
]);

function directiveBindingMatches(expected, actual) {
  if (!expected || !actual) return false;
  return DIRECTIVE_PROMPT_BINDING_FIELDS.every((field) => {
    const expectedValue = compact(expected[field]);
    return Boolean(expectedValue) && expectedValue === compact(actual[field]);
  });
}

function sameDirectivePromptTarget(captured = {}, current = {}) {
  if (!captured.campaignState || captured.campaignState !== current.campaignState) return false;
  if (captured.revision !== current.campaignState?.stateCustody?.revision) return false;
  const expected = captured.binding;
  const stateBinding = current.campaignState?.campaignChatBinding;
  const hostBinding = current.hostBinding;
  return directiveBindingMatches(expected, stateBinding)
    && directiveBindingMatches(expected, hostBinding);
}

function directivePromptTargetStatus(captured = {}, current = {}) {
  if (sameDirectivePromptTarget(captured, current)) return 'current';
  return directiveBindingMatches(current.campaignState?.campaignChatBinding, current.hostBinding)
    ? 'changed-bound-target'
    : 'unbound';
}

export const __directiveRuntimeAppTestHooks = Object.freeze({
  promptTargetStatus: directivePromptTargetStatus,
});

function required(value, label) {
  const text = compact(value);
  if (!text) throw new Error(`${label} must be a non-empty string`);
  return text;
}

function stableHash(value = '') {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeMessage(host, payload) {
  return host.chat?.normalizeMessagePayload?.(payload)
    || (object(payload?.message) ? payload.message : payload)
    || null;
}

function messageId(payload, normalized = null) {
  return compact(
    normalized?.hostMessageId
    || normalized?.id
    || payload?.hostMessageId
    || payload?.messageId
    || payload?.message_id
    || payload?.id
    || payload?.message?.hostMessageId
    || payload?.message?.id
  ) || null;
}

function isUserMessage(message = {}) {
  return message.isUser === true || message.is_user === true || message.role === 'user';
}

function activeSourceRow(message = {}) {
  const inferred = normalizeV1HostMessageVisibility(message.raw || message);
  const visibility = object(message.visibility)
    ? { ...inferred, ...message.visibility }
    : inferred;
  return message.isSystem !== true
    && message.is_system !== true
    && visibility.sourceRowExists !== false
    && visibility.hiddenByHost !== true
    && visibility.sourceMutation !== true;
}

function acceptedPairSourceAuthority(snapshot = {}) {
  const envelope = snapshot?.envelope || {};
  return {
    envelope: {
      campaignId: envelope.campaignId || null,
      saveId: envelope.saveId || null,
      chatId: envelope.chatId || null,
      packageId: envelope.packageId || null,
      packageVersion: envelope.packageVersion || null,
      activeMissionId: envelope.activeMissionId || null,
    },
    source: clone(snapshot?.source || null),
  };
}

function acceptedPairHostMessageId(message = {}) {
  return compact(message?.hostMessageId || message?.id || String(message?.index ?? '')).slice(0, 180) || null;
}

function acceptedPairSourceStale(reason) {
  const error = new Error(`The accepted-pair source changed before its state commit (${reason}).`);
  error.code = 'DIRECTIVE_ACCEPTED_PAIR_SOURCE_STALE';
  error.details = { reason };
  return error;
}

function assertAcceptedPairSourcePrecondition({ before, options, host }) {
  const precondition = options?.acceptedPairSourcePrecondition;
  if (!precondition) return;
  if (precondition.kind !== 'directive.acceptedPairSourcePrecondition.v1'
    || !object(precondition.binding)
    || !object(precondition.snapshot)) {
    throw acceptedPairSourceStale('precondition-invalid');
  }
  const currentBinding = host.chat?.getCurrentBinding?.();
  if (currentBinding && typeof currentBinding.then === 'function') {
    Promise.resolve(currentBinding).catch(() => {});
    throw acceptedPairSourceStale('binding-read-async');
  }
  if (!directiveBindingMatches(precondition.binding, before?.campaignChatBinding)
    || !directiveBindingMatches(precondition.binding, currentBinding)) {
    throw acceptedPairSourceStale('binding-changed');
  }
  const expectedPlayerId = acceptedPairHostMessageId(precondition.snapshot?.source?.currentPlayer);
  const expectedAuthority = stableJsonStringify(acceptedPairSourceAuthority(precondition.snapshot));
  const readRows = (limit) => {
    const rows = host.chat?.getRecentMessages?.({ limit, playerSafeOnly: false });
    if (rows && typeof rows.then === 'function') {
      Promise.resolve(rows).catch(() => {});
      throw acceptedPairSourceStale('source-read-async');
    }
    if (!Array.isArray(rows)) throw acceptedPairSourceStale('source-read-unavailable');
    return rows;
  };
  const inspectRows = (rows) => {
    const activeRows = rows.filter(activeSourceRow);
    const playerMatches = activeRows
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => isUserMessage(player) && acceptedPairHostMessageId(player) === expectedPlayerId);
    if (!expectedPlayerId || playerMatches.length !== 1) return 'player-source-missing';
    const { player, index: playerIndex } = playerMatches[0];
    const trailingRows = activeRows.slice(playerIndex + 1);
    if (precondition.replacementTail) {
      if (trailingRows.some(isUserMessage) || stableJsonStringify(trailingRows) !== stableJsonStringify(precondition.replacementTail)) return 'replacement-source-changed';
    } else if (trailingRows.some((row) => !isUserMessage(row))) {
      return 'player-source-not-current';
    }
    const prepared = prepareV1AcceptedPairSnapshot({
      campaignState: before,
      currentPlayerMessage: player,
      recentMessages: activeRows,
      requirePromptingPlayerAnchor: true,
      chatId: currentBinding.chatId,
    });
    if (!prepared.ok) return prepared.reason || 'source-invalid';
    return stableJsonStringify(acceptedPairSourceAuthority(prepared.snapshot)) === expectedAuthority
      ? null
      : 'source-authority-changed';
  };
  const recent = readRows(V1_ACCEPTED_PAIR_SOURCE_WINDOW);
  let staleReason = inspectRows(recent);
  if (staleReason && recent.length >= V1_ACCEPTED_PAIR_SOURCE_WINDOW) {
    staleReason = inspectRows(readRows(Number.MAX_SAFE_INTEGER));
  }
  if (staleReason) throw acceptedPairSourceStale(staleReason);
}

function persistedAcceptedSourceMessageIds(campaignState = {}) {
  const ids = new Set();
  const invalidatedContributionIds = new Set([
    ...(campaignState?.storySettlement?.receipts || [])
      .filter((receipt) => receipt?.disposition === 'invalidated')
      .flatMap((receipt) => receipt?.sourceContributionIds || []),
    ...(campaignState?.mission?.v1?.invalidatedSourceContributionIds || []),
    ...(campaignState?.mission?.v1History || [])
      .flatMap((entry) => entry?.state?.invalidatedSourceContributionIds || [])
  ]);
  const add = (value) => {
    const id = compact(value);
    if (id && !id.startsWith('time-boundary:') && !id.startsWith('runtime-policy:')) ids.add(id);
  };
  for (const entry of [
    ...(campaignState?.timeLedger?.entries || []),
    ...(campaignState?.timeLedger?.decisions || [])
  ]) {
    for (const id of entry?.evidenceMessageIds || []) add(id);
  }
  for (const episode of campaignState?.storySettlement?.episodes || []) {
    for (const contribution of episode?.contributions || []) {
      if (!invalidatedContributionIds.has(contribution?.id)) add(contribution?.messageId);
    }
  }
  const missionRuns = [
    campaignState?.mission?.v1,
    ...(campaignState?.mission?.v1History || []).map((entry) => entry?.state)
  ];
  for (const run of missionRuns) {
    for (const evidence of run?.evidenceLog || []) {
      if (!invalidatedContributionIds.has(evidence?.sourceContributionId)) add(evidence?.sourceRef?.messageId);
    }
  }
  for (const spend of Object.values(campaignState?.commandBearing?.spends || {})) {
    if (spend?.status === 'refunded') continue;
    add(spend?.armedByPlayerMessageId);
    add(spend?.assistantMessageId);
    add(spend?.acceptedByPlayerMessageId);
  }
  return ids;
}

export function createActiveAcceptedPairLineage({
  campaignState,
  recentMessages = [],
  chatId = null
} = {}) {
  const activeMessages = (Array.isArray(recentMessages) ? recentMessages : [])
    .filter(activeSourceRow);
  const lineage = [];
  const seenPlayerMessageIds = new Set();
  for (const message of activeMessages) {
    if (!isUserMessage(message)) continue;
    const prepared = prepareV1AcceptedPairSnapshot({
      campaignState,
      currentPlayerMessage: message,
      recentMessages: activeMessages,
      chatId
    });
    if (!prepared.ok) continue;
    const currentPlayerHostMessageId = compact(
      prepared.snapshot?.source?.currentPlayer?.hostMessageId
    );
    if (!currentPlayerHostMessageId || seenPlayerMessageIds.has(currentPlayerHostMessageId)) continue;
    seenPlayerMessageIds.add(currentPlayerHostMessageId);
    lineage.push({
      previousAssistantHostMessageId: compact(
        prepared.snapshot?.source?.previousAssistant?.hostMessageId
      ) || null,
      currentPlayerHostMessageId,
      sourceRangeHash: compact(prepared.snapshot?.source?.sourceRangeHash) || null
    });
  }
  return lineage;
}

function currentTime(state) {
  const stardate = Number(state?.timeLedger?.stardate ?? state?.campaign?.currentStardate);
  const clock = state?.timeLedger?.shipClock || {};
  const second = Number(clock.secondOfDay ?? (Number(clock.minuteOfDay) * 60));
  if (!Number.isFinite(stardate) || !Number.isFinite(second)) return null;
  const normalized = ((Math.round(second) % 86400) + 86400) % 86400;
  const hour = Math.floor(normalized / 3600);
  const minute = Math.floor((normalized % 3600) / 60);
  const remainder = normalized % 60;
  return {
    stardate,
    secondOfDay: normalized,
    minuteOfDay: Math.floor(normalized / 60),
    elapsedSeconds: Number(state?.timeLedger?.elapsedSeconds ?? (Number(state?.timeLedger?.elapsedMinutes || 0) * 60)),
    shipTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(remainder).padStart(2, '0')} hours`
  };
}

export function createDirectiveGenerationRouter(host) {
  function getSettings() {
    const source = host.providers?.getSettings?.() || host.providers?.settings?.getAll?.();
    return source ? normalizeDirectiveProviderSettings(source) : null;
  }
  function getRoleSettings(roleId, providerKind = null) {
    const lane = getSettings()?.[providerKind || providerKindForRole(roleId)];
    return lane ? { ...lane, ...Object.fromEntries(Object.entries(lane.roleLimits?.[roleId] || {}).filter(([, value]) => value != null)) } : null;
  }
  function getTimeoutMs(roleId, fallback, providerKind = null) {
    const settings = getRoleSettings(roleId, providerKind);
    return settings ? settings.timeoutSeconds * 1000 : fallback;
  }
  function getMaxTokens(roleId, fallback, providerKind = null) {
    const settings = getSettings();
    return settings ? resolveProviderMaxTokens(settings, providerKind || providerKindForRole(roleId), roleId) : fallback;
  }
  return {
    getTimeoutMs,
    getMaxTokens,
    getMaxAttempts(roleId, fallback = 2) {
      return getRoleSettings(roleId)?.maxAttempts ?? fallback;
    },
    getAnalysisLimits() {
      return resolveAnalysisLimits(getSettings()?.utility);
    },
    reportValidationFailure(roleId, errors) {
      host.logger?.warn?.(`[Directive] Model validation failed: ${JSON.stringify({ roleId, errors })}`);
    },
    async generate(roleId, request, options = {}) {
      try {
        const maxTokens = getMaxTokens(roleId, request?.parameters?.max_tokens, options.providerKind);
        const configuredRequest = maxTokens == null ? request : {
          ...request, parameters: { ...request?.parameters, max_tokens: maxTokens },
        };
        const response = await host.generation.generate(roleId, configuredRequest, {
          ...options,
          timeoutMs: getTimeoutMs(roleId, options.timeoutMs, options.providerKind),
        });
        return {
          ok: true,
          response: clone(response),
          diagnostics: {
            providerId: response?.providerId || null,
            model: response?.model || null,
            usage: clone(response?.usage || null),
            providerKind: response?.providerKind || null
          }
        };
      } catch (error) {
        if (isStatePublicationError(error)) throw error;
        host.logger?.warn?.('[Directive] Model request failed: ' + JSON.stringify({
          roleId,
          code: error?.code || 'DIRECTIVE_PROVIDER_FAILED',
          finishReason: error?.details?.finishReason || null,
          maxTokens: error?.details?.maxTokens || null,
        }));
        return {
          ok: false,
          error: {
            code: error?.code || 'DIRECTIVE_PROVIDER_FAILED',
            message: error?.message || String(error),
            retryable: error?.retryable === true,
            ...(error?.details ? { details: clone(error.details) } : {})
          },
          diagnostics: {
            providerKind: error?.providerKind || null,
            transportCode: error?.details?.transportCode || null
          }
        };
      }
    }
  };
}

function playerPortraitImportSupported(host) {
  return typeof host?.storage?.writeBase64File === 'function'
    && typeof host?.storage?.deleteFile === 'function';
}

function openingPromptProjection({ state, runtimeAssets, acceptedPairLineage = [], openingRecord = null }) {
  const campaign = runtimeAssets?.packageData?.campaign;
  const retainedPremise = openingRecord?.kind === 'directive.openingRecord.v1'
    && openingRecord.campaignId === state.campaign?.id
    && getOpeningPremiseErrors(openingRecord.inputs?.premise).length === 0
    ? openingRecord.inputs.premise : null;
  const openingContext = retainedPremise || campaign?.openingPremise;
  if (!openingContext) {
    throw new Error('Directive V1 runtime assets require campaign.openingPremise.');
  }
  const acceptedPairCount = acceptedPairLineage.length;
  const unanswered = acceptedPairCount === 0;
  if (unanswered) {
    return {
      phase: 'unanswered',
      premise: clone(openingContext),
      continuitySummary: openingContext.continuitySummary,
      firstPlayableScene: openingContext.firstPlayableScene,
      firstSceneGuidance: clone(openingContext.firstSceneGuidance),
      continuationGuidance: clone(openingContext.continuationGuidance || [])
    };
  }
  const openingMissionId = runtimeAssets.packageData.manifest.openingMissionId;
  const inOpeningMission = state.mission?.activeMissionId === openingMissionId;
  const firstSceneComplete = state.mission?.v1?.objectives?.[openingContext.firstSceneEndObjectiveId]?.state === 'terminal';
  if (inOpeningMission && !firstSceneComplete) {
    return {
      phase: 'firstMeeting',
      stage: acceptedPairCount === 1 ? 'introductionPending' : 'conversationAnswered',
      continuitySummary: openingContext.continuitySummary,
      firstPlayableScene: openingContext.firstPlayableScene,
      firstSceneGuidance: clone(openingContext.firstSceneGuidance),
      continuationGuidance: clone(openingContext.continuationGuidance || [])
    };
  }
  return {
    phase: 'continuity',
    continuitySummary: openingContext.continuitySummary
  };
}

function transitionPromptProjection(state, runtimeAssets) {
  const definition = (runtimeAssets?.missionDefinitions || []).map(entry=>entry.definition || entry).find(entry=>entry.id === state?.mission?.v1?.definitionId);
  if (definition && state.mission.v1.status === 'terminal' && createScenePacingContext({definition,state:state.mission.v1,receipts:state.storySettlement?.acceptedPairReceipts || []})?.allowMissionDeparture === false) return null;
  if (state?.mission?.v1?.status !== 'terminal' && state?.storySettlement?.activeEpisode !== null) {
    return null;
  }
  try {
    return createMissionTransitionNarrationPacket({
      campaignState: state,
      definitions: runtimeAssets?.missionDefinitions || []
    });
  } catch {
    return null;
  }
}

function availableDirectorActors(runtimeAssets = {}) {
  const aliases = {
    command: ['captain', 'diplomacy'],
    operations: ['communications', 'intelligence'],
    science: ['sensors'],
    tactical: ['security'],
    medical: ['counseling']
  };
  return (runtimeAssets?.crewDataset?.officers || []).map((officer) => {
    const department = compact(officer?.service?.department).toLowerCase();
    return {
      id: officer.id,
      available: true,
      capabilityRoles: [...new Set([
        department,
        ...(aliases[department] || []),
        ...(officer.capabilityRoles || [])
      ].filter(Boolean))]
    };
  });
}

function activeMissionDefinition(state, runtimeAssets) {
  const definitionId = state?.mission?.v1?.definitionId;
  if (!definitionId) return null;
  return (runtimeAssets?.missionDefinitions || [])
    .map((entry) => entry?.definition || entry)
    .find((definition) => definition?.id === definitionId) || null;
}

function eligibleSupportingCharacterGuides({ state, projection, runtimeAssets }) {
  const definition = activeMissionDefinition(state, runtimeAssets);
  const activeMissionId = definition?.id || null;
  const predicateContext = definition
    ? missionStateContext(definition, state?.mission?.v1 || {})
    : null;
  const acceptedPersonIds = new Set([
    ...(projection?.people?.people || []).map(person => person?.id),
    ...(projection?.story?.entries || []).flatMap(entry => entry?.references?.participantIds || [])
  ].filter(Boolean));
  return (runtimeAssets?.crewDataset?.supportingCharacters || [])
    .filter(character => {
      if (acceptedPersonIds.has(character.id)) return true;
      const matchingRules = Array.isArray(character?.guideEligibility)
        ? character.guideEligibility.filter(candidate => candidate?.missionId === activeMissionId)
        : [];
      if (!predicateContext || matchingRules.length !== 1) return false;
      const result = evaluateMissionPredicate(matchingRules[0].when, predicateContext);
      return result.ok && result.value;
    })
    .map(character => ({
      id: character.id,
      name: character.name,
      ...(compact(character.species) ? { species: character.species } : {}),
      ...(object(character.service) ? { service: clone(character.service) } : {}),
      ...clone(character.narrationGuide)
    }));
}

export function createV1RuntimePromptPacket({
  state,
  projection,
  runtimeAssets,
  acceptedPairLineage = [],
  director = null,
  narrationSettings = {},
  openingRecord = null
}) {
  const narrationPolicy = createNarrationPolicy({ settings: narrationSettings, player: state.player });
  const playerAuthority = createPlayerAuthorityPolicy({ playerName: state.player?.name });
  const simulationPolicy = createSimulationModePolicy(state.settings?.simulationMode);
  const story = createV1PromptProjection({
    storyProjection: projection.story,
    activeMissionId: projection.mission?.missionId,
    participantIds: projection.people?.people?.map((person) => person.id) || [],
    locationId: state.worldState?.currentLocationId || null
  });
  const armedEdge = projection.commandBearing?.pendingEdge?.status === 'armed'
    ? projection.commandBearing.pendingEdge
    : null;
  const armedCohesionRelief = projection.commandBearing?.pendingCohesionRelief?.status === 'armed'
    ? projection.commandBearing.pendingCohesionRelief
    : null;
  const shipMechanics = createShipOperationalPacket({
    shipDataset: runtimeAssets?.shipDataset,
    cohesionCatalog: runtimeAssets?.cohesionCatalog,
    storySettlement: state.storySettlement,
    missionDefinition: activeMissionDefinition(state, runtimeAssets) || {},
    branchId: state?.campaignChatBinding?.saveId || '',
  });
  const payload = {
    player: {
      name: state.player?.name,
      pronounsOrAddress: state.player?.pronounsOrAddress,
      rank: state.player?.rank,
      billet: state.player?.billet,
      role: state.player?.role,
      dossier: state.player?.dossier
    },
    campaign: {
      title: state.campaign?.title,
      missionId: state.mission?.activeMissionId,
      locationId: state.worldState?.currentLocationId,
      currentTime: currentTime(state),
      simulationMode: simulationPolicy.simulationMode,
      consequencePolicy: simulationPolicy.settingsSummary
    },
    mission: projection.mission,
    people: createPeoplePromptProjection({ peopleProjection: projection.people }),
    ship: projection.ship,
    shipMechanics,
    commandBearing: projection.commandBearing,
    narrativeEdge: armedEdge ? {
      spendId: armedEdge.id,
      instruction: 'Create one credible favorable opening or soften one immediate cost. Do not guarantee success, override established facts, decide the player action, or erase a consequence.'
    } : null,
    cohesionRelief: armedCohesionRelief ? {
      spendId: armedCohesionRelief.id,
      targetIssueId: armedCohesionRelief.targetIssueId,
      cohesion: armedCohesionRelief.cohesion,
      instruction: 'Resolve the named visible Cohesion issue through a credible commander-led result in this response. Do not invent a different issue, bypass unrelated permanent capability evidence, or clear anonymous backlog debt.'
    } : null,
    narrationPolicy,
    narrationGuidance: {
      characterReferencePolicy: 'Character references are out-of-world performance guidance. Borrow only their named qualities; the authored character voice and constraints govern dialogue ahead of generic prose flavor. Preserve each original character identity, profession, species, history, knowledge, and accepted relationships. Treat supplied service rank and department as authoritative. Do not import reference-character events, powers, catchphrases, or plot outcomes, and do not mention the references in story prose. Supporting-character entries do not establish presence or authorize an introduction; use them only when the current scene independently calls for that person.',
      crew: (runtimeAssets?.crewDataset?.officers || []).map((officer) => ({
        id: officer.id,
        name: officer.name,
        billet: officer.billet,
        ...(object(officer.service) ? { service: clone(officer.service) } : {}),
        ...clone(officer.narrationGuide)
      })),
      supportingCharacters: eligibleSupportingCharacterGuides({ state, projection, runtimeAssets }),
      ship: clone(runtimeAssets?.shipDataset?.profile || null)
    },
    opening: { ...openingPromptProjection({ state, runtimeAssets, acceptedPairLineage, openingRecord }),
      ...(acceptedPairLineage.length === 0 && openingRecord && openingRecord.campaignId === state.campaign?.id ? { openingDirection: clone(openingRecord.direction), openingInputs: clone(openingRecord.inputs) } : {}) },
    acceptedStory: story,
    characterInformation: createCharacterInformationProjection({
      events: state.storySettlement?.continuityEvents || [],
      personIds: [...new Set([
        ...(projection.people?.people || []).map(person => person.id),
        ...(runtimeAssets?.crewDataset?.officers || []).map(person => person.id),
        ...(runtimeAssets?.crewDataset?.supportingCharacters || []).map(person => person.id),
      ].filter(Boolean))],
    }),
    workingStory: createV1WorkingStoryPromptProjection({ settlement: state.storySettlement }),
    pendingTransition: transitionPromptProjection(state, runtimeAssets),
    pendingDutyReport: director?.dutyReport || null,
    storyDirection: director?.storyInstruction || null,
  };
  const sceneDefinition = (runtimeAssets?.missionDefinitions || []).map(entry=>entry.definition || entry).find(entry=>entry.id === state?.mission?.v1?.definitionId);
  payload.scenePacing = sceneDefinition ? createScenePacingContext({definition:sceneDefinition,state:state.mission.v1,receipts:state.storySettlement?.acceptedPairReceipts || []}) : null;
  const text = [
    'DIRECTIVE V1 CAMPAIGN CONTEXT',
    CHARACTER_INFORMATION_POLICY,
    playerAuthority.narratorConstraint,
    narrationPolicy.instruction,
    'Continue a story-first command RPG from the accepted state below.',
    ...(payload.scenePacing ? [
      'SCENE PACING: Develop the current scene in response to the player. An available objective is not an instruction to finish it. Keep questions, objections, and consequential choices playable. Do not narrate the player agreeing, deciding, leaving, or completing required participation.',
      'Use scenePacing.currentScene and the visible objective participation requirements. Unless ready is true or the player explicitly delegates/skips that objective, do not depict its completed outcome or summarize away its defining encounter. A ready scene permits a supported result, never automatic success. Resolve one consequential interaction and leave the next player response open.',
      'Objective completion does not authorize a scene cut. Unless scenePacing.allowDeparture is true, preserve conversation and aftermath; do not introduce unrelated missions, reports, abrupt travel, or a major time jump. Deliver only an explicitly supplied pendingDutyReport. An established immediate danger may have consequences, but do not invent an emergency to hurry a scene. Honor explicit player departure, delegation, refusal, and requests to summarize within accepted facts.',
    ] : []),
    'Authored campaign constraints and accepted mechanical state govern outcomes. Preserve accepted continuity without promoting improvised additions into authored campaign requirements. Visible chat may contain provisional narration, character claims, attempts, or corrections; those are not all established facts. Never expose undiscovered facts or hidden objective text.',
    'Develop local consequences in response to the player. Respect a player-led diversion, keep established opportunities available, and offer natural resolution without forcing agreement, inventing an emergency, or erasing established costs.',
    ...(payload.storyDirection ? ['STORY DIRECTION: Follow storyDirection for this beat within accepted state, player authority, scene pacing and authored campaign constraints. It does not authorize objective completion, secret revelations, off-screen success, or overriding the player.'] : []),
    'Do not invent completed objectives, Command Bearing awards, mechanical relationship changes, authoritative ship conditions, authored mission deadlines, or trackers. Narrate consequences only when supported by accepted state, visible causality, and the selected difficulty policy. Local story additions remain provisional.',
    'A response is provisional until the player sends their next message with that response selected. Swipes replace it before acceptance.',
    'Depict outcomes naturally in prose; Directive will separately interpret only closed mission evidence candidates after acceptance.',
    payload.opening.phase === 'unanswered'
      ? 'OPENING REGENERATION: Use the campaign-owned opening.premise and any stored openingDirection and openingInputs. Preserve established continuity and required facts. Weave the selected supported background into the scene; do not invent history or player reactions. Wording may vary with the current narration policy, but end at opening.firstPlayableScene before the next player action. Do not enact firstSceneGuidance yet.'
      : 'Treat opening.continuitySummary as established past experience. Do not replay or recap it unless the player naturally calls for it.',
    payload.opening.phase === 'firstMeeting' && payload.opening.stage === 'introductionPending'
      ? 'FIRST SCENE: Follow the campaign-owned opening.firstSceneGuidance in order, within the selected narration policy. Leave the next player response open.'
      : '',
    payload.opening.phase === 'firstMeeting' && payload.opening.stage === 'conversationAnswered'
      ? 'FIRST SCENE CONTINUATION: The player has answered the initial conversational opening. The first-reply-only restrictions no longer apply. Follow opening.continuationGuidance while preserving established continuity and player authority.'
      : '',
    armedEdge
      ? 'COMMAND BEARING EDGE IS ARMED. Apply the bounded narrativeEdge instruction in the state packet once in this response.'
      : '',
    armedCohesionRelief
      ? 'COMMAND BEARING COHESION RELIEF IS ARMED. Resolve only cohesionRelief.targetIssueId through a visible causal result in this response.'
      : '',
    payload.pendingTransition
      ? 'MISSION TRANSITION: Realize pendingTransition in this response. Include every mustNarrate beat, honor next.playerSafeSetup and knownOutcomes, and reveal nothing prohibited by mustNotReveal. Do not invent an additional transition or alter its disposition.'
      : '',
    payload.pendingDutyReport
      ? 'DUTY REPORT: Present pendingDutyReport.segment.canonicalText verbatim exactly once as a separate written report shown to the player by the named reporter, outside quoted dialogue. The canonical segment is report text, not words for a character to speak; surrounding dialogue should remain natural. Do not paraphrase the canonical segment, expose internal identifiers, or add facts beyond the player-safe segment.'
      : '',
    payload.shipMechanics
      ? 'SHIP OPERATIONAL MECHANICS: Apply shipMechanics only when the player or scene invokes the named system. Active capabilities permit the listed authored routes but never guarantee success. Active constraints block unsupported shortcuts. Use interactions as exact mission-specific affordances and honor every listed limit.'
      : '',
    simulationPolicy.narratorConstraint,
    'Keep named crew identities and roles exact. Let an appropriate officer offer fair, in-world guidance when the player lacks necessary knowledge.',
    payload.campaign.currentTime
      ? 'SHIP TIME: campaign.currentTime is the accepted current time at the start of this response. Directive displays accepted ship time in its interface. Use it only for chronology. For an event that occurred at or after campaign opening, do not describe it as more than campaign.currentTime.elapsedSeconds ago. When no prior timestamp supports an exact relative interval, use a qualitative callback instead. Do not print a Stardate, ship-time header, footer, tracker, or timestamp.'
      : '',
    JSON.stringify(payload, null, 2)
  ].filter(Boolean).join('\n\n');
  return {
    kind: 'directive.promptPacket.v1',
    revision: state.stateCustody.revision,
    hash: stableHash(text),
    text,
    blocks: [{
      id: 'v1-state',
      title: 'Directive V1 accepted state',
      text,
      placement: 'inChat',
      depth: 0,
      role: 'system',
      priority: 1000
    }]
  };
}

function providerConfiguration(host) {
  const settings = normalizeDirectiveProviderSettings(
    host.providers?.getSettings?.() || host.providers?.settings?.getAll?.() || {}
  );
  const status = {};
  for (const kind of ['utility', 'reasoning']) {
    const source = host.providers?.status?.(kind) || { ready: true, label: 'Current SillyTavern model' };
    status[kind] = {
      kind,
      provider: source.provider === 'profile' ? 'profile' : 'st',
      ready: source.ready === true,
      label: compact(source.label) || 'Current SillyTavern model',
      sourceLabel: compact(source.sourceLabel) || (source.provider === 'profile' ? 'Connection Profile' : 'Current Model'),
      completionMode: ['chat', 'text'].includes(source.completionMode) ? source.completionMode : 'unknown',
      identity: compact(source.identity) || null,
      profile: source.profile ? {
        id: compact(source.profile.id),
        label: compact(source.profile.label || source.profile.name || source.profile.id),
        name: compact(source.profile.name || source.profile.label || source.profile.id),
        model: compact(source.profile.model),
        completionMode: ['chat', 'text'].includes(source.profile.completionMode) ? source.profile.completionMode : 'unknown'
      } : null,
      certification: clone(source.certification || settings[kind]?.certification || { status: 'not-run' })
    };
  }
  const profiles = (host.providers?.listProfiles?.() || []).map((profile) => ({
    id: compact(profile.id),
    label: compact(profile.label || profile.name || profile.id),
    name: compact(profile.name || profile.label || profile.id),
    model: compact(profile.model),
    completionMode: ['chat', 'text'].includes(profile.completionMode) ? profile.completionMode : 'unknown'
  })).filter((profile) => profile.id);
  return {
    settings: clone(settings),
    status: clone(status),
    profiles: clone(profiles)
  };
}

const GENERATION_ROUTING = createGenerationRoleRegistry().list();

function diagnosticsConfiguration(host) {
  return { transcriptAvailable: typeof host.chat?.getRecentMessages === 'function' };
}

async function playerVisibleTranscript(host) {
  if (typeof host.chat?.getRecentMessages !== 'function') return null;
  const source = await host.chat.getRecentMessages({ limit: 10000, playerSafeOnly: true });
  if (!Array.isArray(source)) return null;
  const messages = source.filter((message) => (
    message
    && message.isSystem !== true
    && message.visibility?.hiddenByHost !== true
    && message.visibility?.sourceMutation !== true
    && compact(message.text)
  )).map((message) => ({
    hostMessageId: compact(message.hostMessageId || message.id) || null,
    role: message.isUser === true ? 'user' : 'assistant',
    text: String(message.text)
  }));
  return { kind: 'directive.playerVisibleTranscript.v1', messages };
}

function presetConfiguration(host) {
  const status = host.presets?.getStatus?.() || {
    state: 'unavailable', pill: 'Unavailable', message: 'SillyTavern preset management is unavailable.', canInstall: false
  };
  return {
    status: clone(status),
    autoCheck: clone(host.presets?.getAutoCheckPreference?.() || { enabled: true })
  };
}

export function createDirectiveRuntimeApp({
  host,
  packageLoader = loadBundledCampaignPackageRecords,
  now = () => new Date().toISOString(),
  idFactory = null,
  getCharacterKnowledgeSettings = null
} = {}) {
  if (!host?.storage || !host?.chat || !host?.prompt) throw new Error('Directive V1 requires storage, chat, and prompt host adapters.');
  const generationCancellation = createGenerationCancellation(host.generation);
  const guardedGeneration = { ...generationCancellation.generation };
  for (const method of ['generate', 'generateNarration']) {
    const generate = generationCancellation.generation?.[method];
    if (typeof generate !== 'function') continue;
    guardedGeneration[method] = async (...args) => {
      await controller?.verifySaveWritable?.();
      const result = await generate.apply(generationCancellation.generation, args);
      await controller?.verifySaveWritable?.();
      return result;
    };
  }
  host = { ...host, generation: guardedGeneration };
  const turnProgress = createTurnProgressReporter();
  let canceledThroughEpoch = -1;
  function assertTurnActive(scope) {
    if (scope?.signal?.aborted || generationCancellation.stopped || (scope && scope.epoch <= canceledThroughEpoch)) {
      throw generationAbortedError();
    }
  }
  const generationRouter = createDirectiveGenerationRouter(host);
  let fallbackNarrationSettings = normalizeNarrationSettings();
  const narrationSettings = () => normalizeNarrationSettings(host.narration?.getSettings?.() || fallbackNarrationSettings);
  const transcriptLane = createTranscriptFinalizationLane();
  let executingTranscriptOwner = null;
  const finalizationFlights = new Map();
  const failedFinalizations = new Map();
  const openingPublications = new Map();
  const protectedOpenings = new Map();
  const pendingProtectedTurns = new Map();
  const pendingProtectedFinalizations = new Map();
  const characterKnowledgeSettings = () => getCharacterKnowledgeSettings?.() ?? state?.settings?.characterKnowledge ?? null;
  let activeTimelineLoad = null;
  function transcriptKey() {
    const binding = host.chat.getCurrentBinding?.();
    if (binding && typeof binding.then === 'function') {
      Promise.resolve(binding).catch(() => {});
      return null;
    }
    if (!binding?.chatId) return null;
    return JSON.stringify([...['hostId', 'entityType', 'entityId', 'chatId'].map(key => String(binding[key] ?? '')),
      String(state?.campaign?.id ?? ''), String(state?.campaignChatBinding?.saveId ?? '')]);
  }
  function assertTranscriptWritable(owner = null) {
    if (activeTimelineLoad) throw transcriptNotReady('timeline-load-pending');
    const previous = transcriptLane.current(transcriptKey());
    if (!owner && previous?.phase === 'failed' && !failedFinalizations.has(transcriptKey()) && !openingPublications.has(transcriptKey())) {
      releaseUnchangedTranscript(previous);
    }
    transcriptLane.assertWritable(transcriptKey(), owner);
    if (!owner && typeof host.chat.getGenerationActivity === 'function') {
      const activity = host.chat.getGenerationActivity();
      if (activity?.status !== 'idle') throw transcriptNotReady(activity?.status === 'active' ? 'native-generation-active' : 'native-generation-unknown');
    }
  }
  function transcriptObservation() {
    const sampled = host.chat.captureCurrentTranscriptSnapshot?.();
    return sampled?.status === 'captured' ? JSON.stringify(sampled.snapshot.rows) : null;
  }
  function beginTranscriptPreparation() {
    const owner = transcriptLane.begin(transcriptKey());
    if (owner) owner.baseline = transcriptObservation();
    return owner;
  }
  function claimTranscriptPreparation(owner) {
    if (owner.preparationStarted) throw transcriptNotReady('preparation-already-running');
    owner.preparationStarted = true;
    owner.preparationFinished = new Promise(resolve => { owner.finishPreparation = resolve; });
  }
  function unchangedTranscriptObservation(owner) {
    const observed = transcriptObservation();
    let noAssistantOutput = owner?.baseline === observed;
    if (owner?.baseline && observed && !noAssistantOutput && !openingPublications.has(owner.key)) {
      const before = JSON.parse(owner.baseline), after = JSON.parse(observed);
      const tail = after.at(-1);
      noAssistantOutput = after.length === before.length + 1 && isUserMessage(tail)
        && before.every((row, index) => JSON.stringify(row) === JSON.stringify(after[index]));
    }
    return owner?.baseline != null && noAssistantOutput ? observed : null;
  }
  function releaseUnchangedTranscript(owner) {
    const activity = host.chat.getGenerationActivity?.();
    if (owner && !owner.running && unchangedTranscriptObservation(owner) !== null
      && (!activity || activity.status === 'idle')) {
      transcriptLane.releaseUnchanged(owner);
      return true;
    }
    return false;
  }
  function changedAssistantOutput(owner) {
    if (!owner || owner.running || !owner.baseline) return null;
    const sampled = host.chat.captureCurrentTranscriptSnapshot?.();
    if (sampled?.status !== 'captured') return null;
    const before = JSON.parse(owner.baseline), after = sampled.snapshot.rows;
    if (![before.length, before.length + 1].includes(after.length) || !after.length) return null;
    const prefixLength = after.length === before.length ? after.length - 1 : before.length;
    if (before.slice(0, prefixLength).some((row, index) => {
      if (JSON.stringify(row) === JSON.stringify(after[index])) return false;
      // Native saveReply initializes empty reasoning on the preceding user row
      // before appending its assistant. Accept only that exact normalization;
      // earlier rows, visible text, and all other metadata remain immutable.
      if (after.length !== before.length + 1 || index !== before.length - 1 || !isUserMessage(row)
        || (row.extra != null && (typeof row.extra !== 'object' || Array.isArray(row.extra)))
        || row.extra?.reasoning) return true;
      const normalized = {...row, extra:{...row.extra, reasoning:''}};
      return JSON.stringify(normalized) !== JSON.stringify(after[index]);
    })) return null;
    const tail = after.at(-1);
    if (tail.is_user === true || tail.isUser === true || ['user', 'system'].includes(tail.role) || tail.is_system === true || tail.isSystem === true) return null;
    if (JSON.stringify(after) === owner.baseline) return null;
    const recent = host.chat.getRecentMessages?.({ limit: 1, playerSafeOnly: false });
    if (!Array.isArray(recent) || recent.length !== 1) return null;
    const message = recent[0];
    if (!captureV1AssistantSourceVariant(message).ok) return null;
    return { payload: { message: clone(message) },
      expectedTranscript: JSON.stringify(after), capturedDutyReport: preparedNarrationDutyReport,
      completionTarget: captureDirectivePromptTarget() };
  }
  function rememberStoppedOutput(owner) {
    const output = changedAssistantOutput(owner);
    if (output) failedFinalizations.set(owner.key, output);
  }
  const openingLifecycle = createOpeningLifecycle({
    getAnalysisLimits: () => generationRouter.getAnalysisLimits(),
    chat: host.chat,
    getBinding: () => state?.campaignChatBinding || {},
    isCurrent: binding => currentChatIsBound() && ['campaignId', 'saveId', 'chatId'].every(key => binding[key] === state?.campaignChatBinding?.[key]),
    generateDirector: request => host.generation.generate('openingSceneDirector', request, { allowVisibleOutputRetry: false, signal: generationCancellation.signal }),
    generateNarration: request => {
      if (!host.generation.generateNarration) throw new Error('The host does not support opening narration.');
      return host.generation.generateNarration(request);
    },
    getProseGuidance: () => host.presets?.getProseGuidance?.() || '',
    postOpening: options => postFinalizedOpening(options),
    publishProtectedOpening: input => publishProtectedOpening(input)
  });
  let initialized = false;
  let initializing = false;
  let records = null;
  let runtimeAssets = null;
  let controller = null;
  let state = null;
  let gateway = null;
  let missionRuntime = null;
  let preparedNarrationDutyReport = null;
  let timelineTransactions = null;
  let rejectedNativeBranch = null;

  function rejectedBranchMatchesCurrentChat() {
    if (!rejectedNativeBranch || currentChatIsBound()
      || !['campaignId', 'saveId', 'chatId'].every(field =>
        compact(rejectedNativeBranch.parentBinding?.[field]) === compact(state?.campaignChatBinding?.[field]))) return false;
    const current = host.chat.getCurrentBinding?.();
    return ['hostId', 'chatId', 'entityType', 'entityId', 'entityName'].every(field =>
      compact(rejectedNativeBranch.childBinding?.[field]) === compact(current?.[field]));
  }

  function rejectedBranchResult(error, childBinding = null) {
    if (error?.code !== BRANCH_DECISION_HISTORY_UNAVAILABLE) return null;
    rejectedNativeBranch = {
      status: 'blocked',
      reasonCode: BRANCH_DECISION_HISTORY_UNAVAILABLE,
      message: BRANCH_DECISION_HISTORY_MESSAGE + (error.details?.refusalPersistenceFailed
        ? ' The block could not be saved for reload. Return to the original timeline before reloading.' : ''),
      childBinding: clone(error.details?.childBinding || childBinding || host.chat.getCurrentBinding?.()),
      parentBinding: clone(error.details?.parentBinding || state?.campaignChatBinding),
    };
    sendRuntimeUiMessage({ type: 'directive.nativeBranchRefusal.v1', payload: clone(rejectedNativeBranch) });
    return clone(rejectedNativeBranch);
  }
  let creatorView = null;
  let activeDraftId = null;
  let activeScreen = 'campaign';
  let storageDiagnostics = null;
  let settlementQueue = Promise.resolve();
  let acceptedPairRecovery = noAcceptedPairRecovery();
  let acceptedPairRecoveryGestureId = null;
  const acceptedPairCallBudget = createAcceptedPairCallBudget();
  let hostGenerationGestureSequence = 0;
  let activeHostGenerationGesture = null;
  let activeAnalysisController = null;
  let activeAnalysisFingerprint = null;
  let nativeNarrationActive = false;
  let dossierPauseSequence = 0;
  let dossierDrain = null;
  let activeDossierJob = null;
  const stagedDossiers = new Map();
  const dossierQueue = createPeopleDossierQueue({
    author: createPeopleDossierAuthor({ generationRouter }),
    stageResult: ({ job, outcome }) => {
      if (activeDossierJob?.job.id === job.id) {
        activeDossierJob.terminal = true;
        stagedDossiers.set(job.id, { job, outcome, binding: activeDossierJob.binding });
      }
    },
  });

  function pauseDossiers() {
    const pauseId = ++dossierPauseSequence;
    nativeNarrationActive = true;
    if (activeDossierJob && !stagedDossiers.has(activeDossierJob.job.id)) {
      stagedDossiers.set(activeDossierJob.job.id, {
        ...activeDossierJob, outcome: { ok: false, reasonCode: 'dossier-canceled' },
      });
    }
    if (activeDossierJob) activeDossierJob.terminal = true;
    dossierQueue.clear();
    return pauseId;
  }

  function releaseDossierPause(pauseId) {
    if (pauseId !== dossierPauseSequence || internalChatOpenDepth > 0) return false;
    nativeNarrationActive = false;
    scheduleIdleDossiers();
    return true;
  }

  async function releaseDossierPauseAfter(pauseId, task) {
    try {
      return await task();
    } finally {
      releaseDossierPause(pauseId);
    }
  }

  function dossierIdle() {
    return host.generation?.supportsIndependentBackgroundRequests === true
      && !transcriptLane.current(transcriptKey())
      && (typeof host.chat.getGenerationActivity !== 'function' || host.chat.getGenerationActivity()?.status === 'idle')
      && !controller?.getSavePublicationStatus?.()
      && !generationCancellation.stopped
      && !nativeNarrationActive && !activeAnalysisController && state && currentChatIsBound();
  }

  function sameDossierBinding(binding) {
    return ['campaignId', 'saveId', 'chatId'].every(key => binding?.[key] === state?.campaignChatBinding?.[key]);
  }

  // Call only inside the settlement queue so terminal outcomes precede retry selection.
  async function reconcileStagedDossiers() {
    for (const [id, staged] of stagedDossiers) {
      if (!sameDossierBinding(staged.binding)) { stagedDossiers.delete(id); continue; }
      const prepared = prepareDossierEnrichment({ campaignState: state, job: staged.job, outcome: staged.outcome });
      const proposal = createTurnCommit({ before: state, after: prepared.candidateState,
        turnKey: `dossier.merge.${id}.${state.stateCustody.revision}` });
      if (proposal) await gateway.applyProposal(proposal);
      if (stagedDossiers.get(id) === staged) stagedDossiers.delete(id);
    }
  }

  function scheduleIdleDossiers() {
    if (dossierDrain || !dossierIdle()) return;
    let admissionDeferred = false;
    dossierDrain = (async () => {
      while (dossierIdle()) {
        let nextJob = null;
        await enqueueSettlement(async () => {
          if (!dossierIdle()) return;
          await reconcileStagedDossiers();
          if (!dossierIdle()) return;
          const job = (state.storySettlement?.pendingDossiers || []).find(item => item.status === 'pending' && item.attemptCount === 0);
          if (!job) return;
          const prepared = prepareDossierAttempt({ campaignState: state, jobId: job.id });
          const proposal = createTurnCommit({ before: state, after: prepared.candidateState,
            turnKey: `dossier.attempt.${job.id}.${state.stateCustody.revision}` });
          if (proposal) await gateway.applyProposal(proposal);
          if (prepared.job) nextJob = { job: prepared.job, binding: clone(state.campaignChatBinding) };
        });
        if (!nextJob) break;
        activeDossierJob = nextJob;
        if (!dossierIdle()) {
          stagedDossiers.set(nextJob.job.id, { ...nextJob, outcome: {ok:false,reasonCode:'dossier-canceled'} });
          activeDossierJob = null;
          break;
        }
        try { await dossierQueue.run(nextJob.job); }
        finally { activeDossierJob = null; }
      }
    })().catch(error => {
      admissionDeferred = error?.code === 'DIRECTIVE_TRANSCRIPT_NOT_READY';
      if (!admissionDeferred) host.logger?.warn?.('[Directive] Optional biography enrichment was deferred.', error);
    }).finally(() => {
      dossierDrain = null;
      if (admissionDeferred && dossierIdle()) scheduleIdleDossiers();
    });
  }
  let internalChatOpenDepth = 0;
  let deferredInternalChatChange = null;
  let deferredInternalChatChangeScheduled = false;

  function scheduleDeferredInternalChatChange() {
    if (initializing || deferredInternalChatChangeScheduled || internalChatOpenDepth > 0 || !deferredInternalChatChange) return;
    deferredInternalChatChangeScheduled = true;
    Promise.resolve().then(async () => {
      deferredInternalChatChangeScheduled = false;
      if (internalChatOpenDepth > 0 || !deferredInternalChatChange) return;
      const payload = deferredInternalChatChange;
      deferredInternalChatChange = null;
      try {
        await publicApi.handleHostChatChanged({ ...payload, deferredDirectiveHostChange: true });
      } catch (error) {
        host.logger?.warn?.('[Directive] Deferred host chat reconciliation failed.', error);
      }
      scheduleDeferredInternalChatChange();
    });
  }

  async function withInternalChatOpen(task) {
    await controller?.verifySaveWritable?.();
    internalChatOpenDepth += 1;
    try {
      return await task();
    } finally {
      internalChatOpenDepth -= 1;
      scheduleDeferredInternalChatChange();
    }
  }

  function activeSave() {
    return controller?.getActiveSave?.() || null;
  }

  function setState(next) {
    state = next ? assertV1CampaignState(clone(next)) : null;
  }

  function configureStateRuntime() {
    if (!state) {
      gateway = null;
      missionRuntime = null;
      return;
    }
    gateway = createStateDeltaGateway({
      getState: () => state,
      setState,
      beforeCommit: ({ before, options }) => {
        controller.assertSaveWritable?.();
        assertTranscriptWritable(executingTranscriptOwner);
        assertAcceptedPairSourcePrecondition({ before, options, host });
      },
      persist: async (next, _descriptor, { progressScope = null, applicationContext = null } = {}) => {
        await turnProgress.run('saving', () => (
          controller.persistActiveCampaign({ campaignState: next, applicationContext })
        ), { scope: progressScope });
      }
    });
    missionRuntime = createV1MissionRuntime({
      getState: () => state,
      stateDeltaGateway: gateway,
      generationRouter,
      getCharacterKnowledgeSettings: characterKnowledgeSettings,
      directStory: createStoryDirectionAnalyst({ generationRouter }),
      analyzeContinuity: createContinuityAnalyst({ generationRouter }),
      providerFingerprints: () => providerConfiguration(host),
      prepareAcceptedPairTime: ({ campaignState, snapshot, timeDecision, runtimeAssets: acceptedAssets }) => (
        prepareV1AcceptedPairTimeAdvance({
          campaignState,
          snapshot,
          packageData: acceptedAssets?.packageData || records.packageData,
          timeDecision,
          now
        })
      ),
      now,
      turnProgress,
    });
  }

  function projectionResult() {
    if (!state) return { ok: true, projection: null };
    return buildV1RuntimePlayerProjection({ campaignState: state, runtimeAssets });
  }

  function sendRuntimeUiMessage(message) {
    try {
      const result = host.ui?.send?.(message);
      Promise.resolve(result).catch((error) => {
        host.logger?.warn?.('[Directive] Runtime UI message failed.', error);
      });
      return true;
    } catch (error) {
      host.logger?.warn?.('[Directive] Runtime UI message failed.', error);
      return false;
    }
  }

  function currentChatIsBound() {
    const expected = state?.campaignChatBinding;
    const current = host.chat.getCurrentBinding?.();
    if (!expected || !current) return false;
    return ['hostId', 'campaignId', 'saveId', 'chatId', 'entityType', 'entityId', 'entityName'].every((field) => {
      const expectedValue = compact(expected[field]);
      const currentValue = compact(current[field]);
      return Boolean(expectedValue && currentValue && expectedValue === currentValue);
    });
  }

  function sameHostChatIdentity(expected, current) {
    if (!expected || !current) return false;
    return ['hostId', 'chatId', 'entityType', 'entityId', 'entityName'].every((field) => {
      const expectedValue = compact(expected[field]);
      return !expectedValue || expectedValue === compact(current[field]);
    });
  }

  async function activateNarrationPreset() {
    if (typeof host.presets?.activateNarrationPreset !== 'function') return { ok: false, reason: 'unsupported' };
    try {
      const result = await host.presets.activateNarrationPreset();
      if (result?.ok === false) {
        host.logger?.warn?.('[Directive] Could not activate the Directive narration preset; continuing with the runtime campaign packet.', result);
      }
      return result;
    } catch (error) {
      host.logger?.warn?.('[Directive] Could not activate the Directive narration preset; continuing with the runtime campaign packet.', error);
      return { ok: false, reason: 'activation-failed', error };
    }
  }

  async function restoreNarrationPreset() {
    if (typeof host.presets?.restoreNarrationPreset !== 'function') return { ok: false, reason: 'unsupported' };
    try {
      return await host.presets.restoreNarrationPreset();
    } catch (error) {
      host.logger?.warn?.('[Directive] Could not restore the preset selected before campaign play.', error);
      return { ok: false, reason: 'restore-failed', error };
    }
  }

  async function syncPrompt({
    rebuild = false,
    progressScope = null,
    generationType = 'normal',
    generationTargetKey = undefined,
    cancelIfUnbound = false,
  } = {}) {
    if (generationCancellation.stopped || (progressScope && progressScope.epoch <= canceledThroughEpoch)) {
      return staleDirectivePromptResult('host-generation-stopped');
    }
    if (!state || !currentChatIsBound()) {
      preparedNarrationDutyReport = null;
      if (cancelIfUnbound) return staleDirectivePromptResult('unbound');
      await restoreNarrationPreset();
      await host.prompt.clear?.({ reason: 'unbound-v1-chat' });
      return { ok: true, active: false };
    }
    return syncBoundPrompt({ rebuild, progressScope, generationType, generationTargetKey });
  }

  function captureDirectivePromptTarget() {
    return {
      campaignState: state,
      revision: state?.stateCustody?.revision,
      binding: clone(state?.campaignChatBinding),
    };
  }

  function currentDirectivePromptTargetStatus(target) {
    return directivePromptTargetStatus(target, {
      campaignState: state,
      hostBinding: host.chat.getCurrentBinding?.(),
    });
  }

  function staleDirectivePromptResult(targetStatus) {
    return {
      ok: false,
      active: false,
      status: 'stale-target',
      reasonCode: 'prompt-target-changed',
      targetStatus,
    };
  }

  async function syncBoundPrompt({ rebuild = false, progressScope = null, generationType = 'normal', generationTargetKey = undefined } = {}) {
    await controller.verifySaveWritable?.();
    assertTurnActive(progressScope);
    if (typeof host.presets?.activateNarrationPreset === 'function') {
      await turnProgress.run('activating-preset', () => activateNarrationPreset(), { scope: progressScope });
    }
    if (!state || !currentChatIsBound()) {
      await restoreNarrationPreset();
      await host.prompt.clear?.({ reason: 'chat-changed-during-preset-activation' });
      return { ok: true, active: false };
    }
    const promptTarget = captureDirectivePromptTarget();
    assertTurnActive(progressScope);
    const campaignState = promptTarget.campaignState;
    let context;
    try {
      context = await turnProgress.run('building-context', () => {
        const result = buildV1RuntimePlayerProjection({ campaignState, runtimeAssets });
        if (!result.ok) {
          const error = new Error(`Directive V1 player projection unavailable: ${result.reasonCode || 'unknown'}`);
          error.code = 'DIRECTIVE_V1_PROJECTION_UNAVAILABLE';
          error.reasonCode = result.reasonCode || 'v1-projection-unavailable';
          throw error;
        }
        const acceptedPairLineage = (campaignState.storySettlement?.acceptedPairReceipts || [])
          .slice(0, 2)
          .map((receipt) => ({
            previousAssistantHostMessageId: compact(receipt.previousAssistant?.messageId) || null,
            currentPlayerHostMessageId: compact(receipt.currentPlayer?.messageId) || null,
            sourceRangeHash: compact(receipt.sourceRangeHash) || null,
          }));
        const preparedDutyReport = missionRuntime.preparePendingDutyReport({
          runtimeAssets,
          availableActors: availableDirectorActors(runtimeAssets),
          responseId: 'pending-host-response',
          sourceTransactionId: `pending-host-generation.${campaignState.stateCustody.revision}`
        });
        const director = {
          storyInstruction: selectDirectorReceipt(campaignState.storySettlement, {
            branchId: campaignState.campaignChatBinding.saveId,
            packageId: campaignState.activeCampaignPackage.packageId,
            packageVersion: campaignState.activeCampaignPackage.packageVersion,
            missionId: campaignState.mission?.v1?.definitionId,
            generationType,
            generationTargetKey,
          })?.instruction || null,
          dutyReport: preparedDutyReport?.ok && preparedDutyReport.status === 'ready'
            ? { packet: preparedDutyReport.packet, segment: preparedDutyReport.segment }
            : null
        };
        const dutyReportDefinition = clone((runtimeAssets?.missionDefinitions || []).map(entry => entry?.definition || entry)
          .find(entry => entry?.id === preparedDutyReport?.definitionId));
        return { projection: result.projection, acceptedPairLineage, director, preparedDutyReport, dutyReportDefinition };
      }, { scope: progressScope });
    } catch (error) {
      if (error?.code === 'DIRECTIVE_V1_PROJECTION_UNAVAILABLE') {
        const targetStatus = currentDirectivePromptTargetStatus(promptTarget);
        if (targetStatus !== 'current') {
          return staleDirectivePromptResult(targetStatus);
        }
        await host.prompt.clear?.({ reason: error.reasonCode });
      }
      throw error;
    }
    const afterContextStatus = currentDirectivePromptTargetStatus(promptTarget);
    assertTurnActive(progressScope);
    if (afterContextStatus !== 'current') {
      return staleDirectivePromptResult(afterContextStatus);
    }
    const packet = await turnProgress.run('assembling-prompt', () => createV1RuntimePromptPacket({
      state: campaignState,
      projection: context.projection,
      runtimeAssets,
      acceptedPairLineage: context.acceptedPairLineage,
      director: context.director,
      narrationSettings: narrationSettings(),
      openingRecord: host.chat.getOpeningRecord?.() || null
    }), { scope: progressScope });
    const afterAssemblyStatus = currentDirectivePromptTargetStatus(promptTarget);
    assertTurnActive(progressScope);
    if (afterAssemblyStatus !== 'current') {
      return staleDirectivePromptResult(afterAssemblyStatus);
    }
    const method = rebuild && host.prompt.rebuild ? 'rebuild' : 'install';
    const installed = await turnProgress.run('installing-prompt', () => host.prompt[method]({
      binding: clone(promptTarget.binding),
      packet,
    }), { scope: progressScope });
    if (installed?.ok === false) {
      const error = new Error('Directive could not install the prepared turn context.');
      error.code = 'DIRECTIVE_PROMPT_INSTALL_FAILED';
      throw error;
    }
    assertTurnActive(progressScope);
    if (currentDirectivePromptTargetStatus(promptTarget) === 'current') {
      preparedNarrationDutyReport = {
        target: promptTarget,
        preparation: clone(context.preparedDutyReport),
        definition: context.dutyReportDefinition,
      };
    }
    return installed;
  }

  async function commitCommandBearingChange(result, {
    proposalId,
    source
  } = {}) {
    if (!result?.applied) return result;
    const committed = await gateway.applyProposal({
      id: proposalId,
      baseRevision: gateway.revision(),
      domains: ['commandBearing'],
      patch: { commandBearing: result.commandBearing },
      source
    });
    setState(committed.campaignState);
    return { ...result, commandBearing: clone(state.commandBearing) };
  }

  async function armPendingCommandBearingEdge(playerMessage) {
    const pending = state ? pendingV1CommandBearingEdge(state.commandBearing) : null;
    const playerMessageId = messageId(playerMessage, normalizeMessage(host, playerMessage));
    if (!pending || pending.status !== 'reserved' || !playerMessageId) {
      return { applied: false, reasonCode: pending ? 'edge-not-reservable' : 'no-pending-edge' };
    }
    const result = armV1CommandBearingEdge(state.commandBearing, {
      spendId: pending.id,
      playerMessageId,
      now
    });
    return commitCommandBearingChange(result, {
      proposalId: `v1-command-bearing.arm.${pending.id}.${playerMessageId}`,
      source: 'commandBearingGenerationBoundary'
    });
  }

  function acceptedCommandBearingEdgeForSnapshot(snapshot) {
    const pending = state ? pendingV1CommandBearingEdge(state.commandBearing) : null;
    if (!pending || pending.status !== 'armed') {
      return null;
    }
    const previousAssistant = snapshot?.source?.previousAssistant;
    const currentPlayer = snapshot?.source?.currentPlayer;
    if (!previousAssistant?.hostMessageId || !previousAssistant?.textHash || !currentPlayer?.hostMessageId) {
      return null;
    }
    if (previousAssistant.promptingPlayerHostMessageId !== pending.armedByPlayerMessageId) {
      return null;
    }
    return {
      spendId: pending.id,
      effect: pending.effect,
      targetIssueId: pending.targetIssueId || null,
      cohesion: pending.cohesion || null,
      assistantMessageId: previousAssistant.hostMessageId,
      assistantTextHash: previousAssistant.textHash,
      acceptedByPlayerMessageId: currentPlayer.hostMessageId,
    };
  }

  function prepareCommandBearingRefundForInvalidatedMessage(hostMessageId, eventType) {
    const matches = Object.values(state?.commandBearing?.spends || {}).filter((spend) => (
      spend.status !== 'refunded'
      && [
        spend.armedByPlayerMessageId,
        spend.assistantMessageId,
        spend.acceptedByPlayerMessageId
      ].includes(hostMessageId)
    ));
    if (!matches.length) return { applied: false, reasonCode: 'no-matching-edge', patch: {}, domains: [] };
    let commandBearing = clone(state.commandBearing);
    let refundedCount = 0;
    for (const spend of matches) {
      const result = refundV1CommandBearingSpend(commandBearing, {
        spendId: spend.id,
        reason: `The source was invalidated by ${eventType}.`,
        now
      });
      commandBearing = result.commandBearing;
      if (result.applied) refundedCount += 1;
    }
    if (!refundedCount) return { applied: false, reasonCode: 'no-refundable-edge', patch: {}, domains: [] };
    return {
      applied: true,
      refundedCount,
      commandBearing: clone(commandBearing),
      patch: { commandBearing: clone(commandBearing) },
      domains: ['commandBearing']
    };
  }

  async function ensureInitialized() {
    if (!initialized) await publicApi.initialize();
  }

  async function cleanupPlayerPortrait(portrait, reason) {
    if (controller?.getSavePublicationStatus?.()) {
      return { attempted: false, deleted: false, reason: 'state-publication-pending' };
    }
    if (!portrait?.asset?.path) {
      return { attempted: false, deleted: false, reason: 'no-player-portrait' };
    }
    try {
      return {
        attempted: true,
        ...(await deleteV1PlayerPortrait(host.storage, portrait))
      };
    } catch (error) {
      const cleanup = {
        attempted: true,
        deleted: false,
        reason,
        errorCode: compact(error?.code) || null,
        message: compact(error?.message) || 'Player portrait cleanup failed.'
      };
      host.logger?.warn?.('[Directive] Player portrait cleanup failed.', cleanup);
      return cleanup;
    }
  }

  async function commitBinding(binding, { updateHostMetadata = true } = {}) {
    const exact = {
      kind: 'directive.campaignChatBinding.v1',
      version: 1,
      hostId: host.id,
      campaignId: state.campaign.id,
      saveId: activeSave().id,
      chatId: required(binding.chatId, 'binding.chatId'),
      entityType: binding.entityType || null,
      entityId: binding.entityId || null,
      entityName: binding.entityName || null,
      chatName: binding.chatName || null,
      status: 'bound',
      boundAt: now()
    };
    const committed = await gateway.applyProposal({
      id: `v1-chat-bind.${state.campaign.id}.${exact.chatId}`,
      baseRevision: gateway.revision(),
      domains: ['campaign', 'campaignChatBinding'],
      patch: {
        campaign: { status: 'active' },
        campaignChatBinding: exact
      },
      source: 'v1CampaignStart'
    });
    setState(committed.campaignState);
    await controller.verifySaveWritable?.();
    if (updateHostMetadata) await host.chat.updateBindingMetadata?.(exact);
    return exact;
  }

  async function openExactCampaignChat(binding) {
    const chatId = required(binding?.chatId, 'binding.chatId');
    const opened = typeof host.chat.openCampaignChat === 'function'
      ? await withInternalChatOpen(() => host.chat.openCampaignChat(binding))
      : false;
    const currentBinding = host.chat.getCurrentBinding?.();
    const exact = currentBinding && ['hostId', 'campaignId', 'saveId', 'chatId', 'entityType', 'entityId', 'entityName'].every((field) => (
      compact(binding?.[field])
      && compact(binding?.[field]) === compact(currentBinding?.[field])
    ));
    if (opened === false || exact !== true) {
      const error = new Error(`Directive could not open campaign chat "${chatId}".`);
      error.code = 'DIRECTIVE_CAMPAIGN_CHAT_OPEN_FAILED';
      throw error;
    }
    return true;
  }

  async function createOrRestoreCampaignChat() {
    const save = activeSave();
    if (!state || !save) throw new Error('No active V1 campaign is available.');
    if (state.campaignChatBinding?.chatId) {
      await openExactCampaignChat(state.campaignChatBinding);
      return state.campaignChatBinding;
    }
    const previousState = clone(state);
    const previousSave = clone(save);
    const previousChat = clone(host.chat.getCurrentBinding?.() || {
      chatId: compact(host.chat.getCurrentChatId?.()) || null
    });
    let binding = null;
    try {
      binding = await withInternalChatOpen(() => host.chat.createOrBindCampaignChat({
        campaignId: state.campaign.id,
        saveId: save.id,
        name: `${state.campaign.title} - ${state.player.name}`,
        createNew: true
      }));
      const exactBinding = await commitBinding(binding, { updateHostMetadata: false });
      await openExactCampaignChat(exactBinding);
      await controller.verifySaveWritable?.();
      await host.chat.updateBindingMetadata?.(exactBinding);
      return exactBinding;
    } catch (error) {
      if (isStatePublicationError(error)) throw error;
      if (!binding && error?.createdBinding?.createdByDirective === true) {
        binding = clone(error.createdBinding);
      }
      try {
        const restored = await controller.persistActiveCampaign({
          campaignState: previousState,
          saveId: previousSave.id,
          name: previousSave.name
        });
        setState(restored.state);
        configureStateRuntime();
      } catch (rollbackError) {
        if (isStatePublicationError(rollbackError)) throw rollbackError;
        host.logger?.warn?.('[Directive] Could not restore the unbound campaign after chat binding failed.', rollbackError);
        // A failed compensation is not evidence that the committed binding disappeared.
        // Keep its host resources unless persistence positively restored the prior save.
        throw error;
      }
      const currentRollbackChat = host.chat.getCurrentBinding?.() || {
        chatId: compact(host.chat.getCurrentChatId?.()) || null
      };
      if (previousChat?.chatId && !sameHostChatIdentity(previousChat, currentRollbackChat)) {
        try {
          await withInternalChatOpen(() => host.chat.open?.(previousChat));
        } catch (rollbackError) {
          host.logger?.warn?.('[Directive] Could not reopen the previous host chat after campaign binding failed.', rollbackError);
        }
      }
      let deletedFailedCharacter = false;
      if (binding?.createdByDirective === true
        && binding.entityType === 'character'
        && (binding.entityId || binding.entityAvatar || (binding.campaignId && binding.saveId))
        && binding.entityName
        && typeof host.chat.deleteCampaignCharacter === 'function') {
        try {
          const cleanup = await withInternalChatOpen(() => host.chat.deleteCampaignCharacter(binding));
          deletedFailedCharacter = cleanup?.deleted === true;
          if (!deletedFailedCharacter) {
            host.logger?.warn?.('[Directive] Could not remove a failed campaign character and its chats.', cleanup);
          }
        } catch (cleanupError) {
          host.logger?.warn?.('[Directive] Could not remove a failed campaign character and its chats.', cleanupError);
        }
      }
      if (!deletedFailedCharacter
        && binding?.createdByDirective === true
        && binding.chatId
        && !sameHostChatIdentity(binding, previousChat)
        && typeof host.chat.deleteCampaignChat === 'function') {
        try {
          const cleanup = await withInternalChatOpen(() => host.chat.deleteCampaignChat(binding));
          if (cleanup?.deleted !== true) {
            host.logger?.warn?.('[Directive] Could not remove a failed campaign chat.', cleanup);
          }
        } catch (cleanupError) {
          host.logger?.warn?.('[Directive] Could not remove a failed campaign chat.', cleanupError);
        }
      }
      try {
        await syncPrompt({ rebuild: true });
      } catch (rollbackError) {
        host.logger?.warn?.('[Directive] Could not restore prompt state after campaign binding failed.', rollbackError);
      }
      throw error;
    }
  }

  async function postFinalizedOpening(options) {
    const key = transcriptKey(), scope = turnProgress.createScope();
    if (finalizationFlights.has(key)) throw transcriptNotReady('finalization-running');
    assertTranscriptWritable();
    const { owner } = transcriptLane.finalize(key);
    owner.baseline = transcriptObservation();
    openingPublications.set(key, { owner, options: clone(options) });
    const target = captureDirectivePromptTarget();
    const check = () => {
      assertTurnActive(scope);
      transcriptLane.assertOwner(owner, transcriptKey());
      if (currentDirectivePromptTargetStatus(target) !== 'current') throw transcriptNotReady('opening-target-changed');
    };
    const flight = enqueueStateMutation(async () => {
      check();
      const posted = await host.chat.postAssistantMessage(options);
      check();
      if (posted?.posted === true || posted?.duplicate === true) {
        const message = await host.chat.getMessage?.(posted.hostMessageId);
        check();
        const metadata = message?.metadata || message?.raw?.extra?.directive || message?.raw?.metadata?.directive;
        if (!message || metadata?.idempotencyKey !== options.idempotencyKey
          || String(message.text || message.mes || message.content || '') !== String(options.text).trim()) {
          throw transcriptNotReady('opening-readback-mismatch');
        }
      } else if (posted?.reason !== 'chat-not-empty') throw transcriptNotReady('opening-post-unconfirmed');
      return posted;
    }, { transcriptOwner: owner });
    finalizationFlights.set(key, flight);
    try { const result = await flight; transcriptLane.finish(owner, true); openingPublications.delete(key); return result; }
    catch (error) { transcriptLane.finish(owner, false); throw error; }
    finally { if (finalizationFlights.get(key) === flight) finalizationFlights.delete(key); }
  }

  async function publishProtectedOpening({ recoveryOnly = false, request, admission, input, expectedBinding, assertCurrent }) {
    const retained = protectedOpenings.get(transcriptKey());
    if (!retained || (recoveryOnly && !retained.turn)) return null;
    assertCurrent();
    if (!retained.turn) {
      if (!retained.guard.isCurrent()) throw Object.assign(new Error('Opening source changed.'), { code: 'DIRECTIVE_CHARACTER_SCENE_STALE' });
      const premise = input.premise;
      const scenePolicy = { situation: `Establish the campaign opening and stop at this boundary: ${premise.firstPlayableScene}. Leave the next action to the player.`,
        constraints: [premise.continuitySummary, ...premise.requiredContext].map((text, index) => ({ id: `opening.required.${index}`, text })) };
      retained.turn = await prepareProtectedCharacterTurn({ generation: generationRouter, campaignState: state, crewDataset: runtimeAssets.crewDataset,
        messages: retained.messages, sourcePair: request.context.characterKnowledge.sourcePair, admission, scenePolicy,
        identity: retained.identity, guard: retained.guard, publicationId: retained.publicationId, expectedBinding,
        requireEmpty: true, signal: retained.signal, settings: narrationSettings() });
    }
    const result = await enqueueStateMutation(() => retained.turn.hasPublished
      ? retained.turn.recoverPublished(options => host.chat.publishProtectedScene(options), { signal: retained.signal })
      : retained.turn.publish(options => host.chat.publishProtectedScene(options)), { transcriptOwner: retained.ownership.owner });
    assertCurrent();
    return result;
  }

  async function runProtectedOpening(signal) {
    const key = transcriptKey();
    let retained = protectedOpenings.get(key);
    const prior = transcriptLane.current(key);
    if (prior?.running) throw transcriptNotReady('opening-running');
    if (retained && prior) transcriptLane.releaseUnchanged(prior);
    assertTranscriptWritable();
    const owner = beginTranscriptPreparation(); owner.running = true;
    const scope = turnProgress.createScope();
    const combinedSignal = AbortSignal.any([signal, scope.signal].filter(Boolean));
    let success = false;
    try {
      if (typeof host.chat.publishProtectedScene !== 'function') throw new Error('Protected opening publication is unavailable.');
      if (retained) {
        retained.ownership.owner = owner; retained.ownership.scope = scope; retained.signal = combinedSignal;
      } else {
        await host.prompt.clear?.({ reason: 'protected-character-opening' });
        assertTurnActive(scope);
        const captured = host.chat.captureCurrentTranscriptSnapshot?.();
        const messages = host.chat.getRecentMessages?.({ limit: Number.MAX_SAFE_INTEGER, playerSafeOnly: false });
        if (captured?.status !== 'captured' || !Array.isArray(messages)) throw new Error('Opening transcript capture is unavailable.');
        const rows = captured.snapshot.rows, ownership = { owner, scope };
        const sourceDigest = stableSha256Hex(stableJsonStringify(rows));
        const readIdentity = () => {
          assertTurnActive(ownership.scope); transcriptLane.assertOwner(ownership.owner, transcriptKey());
          return { bindingKey: transcriptKey(), branchId: state.campaignChatBinding.saveId, sourceDigest,
            stateDigest: stableSha256Hex(stableJsonStringify(state)),
            settingsDigest: stableSha256Hex(stableJsonStringify({ providers: providerConfiguration(host), narration: narrationSettings(), knowledge: characterKnowledgeSettings() })), epoch: ownership.scope.epoch };
        };
        const identity = readIdentity();
        const publicationId = `directive.v1.opening.${stableSha256Hex(`${key}:${Date.now()}:${Math.random()}`)}`;
        const guard = createCharacterPublicationGuard({ publicationId, identity, baselineRows: rows, readIdentity,
          readRows: () => { const current = host.chat.captureCurrentTranscriptSnapshot?.(); return current?.status === 'captured' ? current.snapshot.rows : null; } });
        const snapshot = createCharacterRuntimeSnapshot({ campaignState: state, crewDataset: runtimeAssets.crewDataset, messages });
        retained = { ownership, signal: combinedSignal, identity, publicationId, guard, messages, turn: null,
          people: [...snapshot.characters].map(([id, person]) => ({ id, name: person.name })) };
        protectedOpenings.set(key, retained);
      }
      const result = await openingLifecycle.generate({ premise: records.packageData.campaign.openingPremise, player: clone(state.player),
        settings: narrationSettings(), characterKnowledge: { mode: 'protected', people: retained.people } });
      success = result?.ok === true;
      if (success) { retained.turn?.dispose(); protectedOpenings.delete(key); }
      else if (!retained.turn?.hasPublished && result?.error?.code !== 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING') {
        retained.turn?.dispose(); protectedOpenings.delete(key);
      }
      return result;
    } finally {
      transcriptLane.finish(owner, success);
      if (!success && !retained?.turn?.hasPublished) releaseUnchangedTranscript(owner);
    }
  }

  async function postOpeningIfEmpty(signal = generationCancellation.signal) {
    await controller.verifySaveWritable?.();
    if (signal.aborted) return { ok: false, posted: false, reason: 'host-generation-stopped' };
    if (characterKnowledgeSettings()?.mode === 'protected') return runProtectedOpening(signal);
    const openingKey = transcriptKey();
    const pendingOpening = openingPublications.get(openingKey);
    if (pendingOpening && !pendingOpening.owner.running) {
      const activity = host.chat.getGenerationActivity?.();
      if (activity && activity.status !== 'idle') throw transcriptNotReady('opening-recovery-active');
      if (!releaseUnchangedTranscript(pendingOpening.owner)) {
        const observed = transcriptObservation();
        if (!observed || !pendingOpening.owner.baseline) throw transcriptNotReady('opening-recovery-unverified');
        const before = JSON.parse(pendingOpening.owner.baseline), after = JSON.parse(observed);
        if (after.length !== before.length + 1
          || before.some((row, index) => JSON.stringify(row) !== JSON.stringify(after[index]))) throw transcriptNotReady('opening-recovery-unverified');
        const messages = host.chat.getRecentMessages?.({ limit: 1, playerSafeOnly: false });
        const posted = Array.isArray(messages) && messages.find(message => (message.metadata || message.raw?.extra?.directive)?.idempotencyKey === pendingOpening.options.idempotencyKey);
        if (!posted || String(posted.text || '') !== String(pendingOpening.options.text).trim()) throw transcriptNotReady('opening-recovery-unverified');
        if (signal.aborted || transcriptKey() !== openingKey) throw transcriptNotReady('opening-target-changed');
        transcriptLane.releaseUnchanged(pendingOpening.owner);
      }
      openingPublications.delete(openingKey);
    }
    return openingLifecycle.generate({
      premise: records.packageData.campaign.openingPremise,
      player: clone(state.player),
      settings: narrationSettings()
    });
  }

  function enqueueStateMutation(task, { campaignLease = true, publicationRecovery = false, transcriptOwner = null, transcriptRecovery = false } = {}) {
    const precedingLoad = !publicationRecovery && !transcriptRecovery ? activeTimelineLoad : null;
    if (!publicationRecovery && !transcriptRecovery && !activeTimelineLoad) {
      try { assertTranscriptWritable(transcriptOwner); } catch (error) { return Promise.reject(error); }
    }
    const guardedTask = async () => {
      if (precedingLoad) {
        const completion = await precedingLoad.finished;
        if (completion.error) throw completion.error;
      }
      if (!publicationRecovery) await controller?.verifySaveWritable?.();
      if (!publicationRecovery && !transcriptRecovery) assertTranscriptWritable(transcriptOwner);
      const previousOwner = executingTranscriptOwner;
      executingTranscriptOwner = transcriptOwner;
      try { return await task(); }
      finally { executingTranscriptOwner = previousOwner; }
    };
    const execute = () => {
      const campaignId = compact(state?.campaign?.id);
      if (campaignLease && timelineTransactions && campaignId) {
        return timelineTransactions.runExclusive({ campaignId, task: guardedTask });
      }
      return guardedTask();
    };
    const next = settlementQueue.then(execute, execute);
    settlementQueue = next.catch(() => null);
    return next;
  }

  function enqueueSettlement(task, options) {
    return enqueueStateMutation(task, options);
  }

  async function settleSnapshot(snapshot, ingressId = null, {
    generationType = 'normal',
    syncPromptAfter = true,
    publishNotifications = true,
    attemptKind = 'automatic',
    allowModelCall = true,
    updateRecovery = true,
    recoveryGestureId = null,
    progressScope = turnProgress.createScope(),
  } = {}) {
    assertTurnActive(progressScope);
    const acceptedPairSourcePrecondition = {
      kind: 'directive.acceptedPairSourcePrecondition.v1',
      binding: clone(state?.campaignChatBinding),
      snapshot: clone(snapshot),
    };
    if (characterKnowledgeSettings()?.mode === 'protected' && ['continue', 'swipe', 'regenerate'].includes(generationType)) {
      const rows = host.chat.getRecentMessages?.({ limit: Number.MAX_SAFE_INTEGER, playerSafeOnly: false });
      if (!Array.isArray(rows)) throw acceptedPairSourceStale('source-read-unavailable');
      const active = rows.filter(activeSourceRow);
      const index = active.findIndex(row => isUserMessage(row) && acceptedPairHostMessageId(row) === acceptedPairHostMessageId(snapshot?.source?.currentPlayer));
      if (index < 0 || active.slice(index + 1).some(isUserMessage)) throw acceptedPairSourceStale('player-source-not-current');
      acceptedPairSourcePrecondition.replacementTail = clone(active.slice(index + 1));
    }
    const envelope = snapshot?.envelope || {};
    const currentEnvelope = {
      campaignId: state?.campaign?.id || null,
      saveId: state?.campaignChatBinding?.saveId || null,
      chatId: state?.campaignChatBinding?.chatId || null,
      packageId: state?.activeCampaignPackage?.packageId || null,
      packageVersion: state?.activeCampaignPackage?.packageVersion || null
    };
    if (Object.entries(currentEnvelope).some(([field, value]) => (
      compact(value) && compact(envelope[field]) !== compact(value)
    ))) {
      const error = new Error('The accepted-pair source belongs to a different campaign timeline.');
      error.code = 'DIRECTIVE_ACCEPTED_PAIR_ENVELOPE_STALE';
      error.details = { expected: currentEnvelope, actual: clone(envelope) };
      throw error;
    }
    let previousProjection = null;
    try {
      const previousProjectionResult = projectionResult();
      if (previousProjectionResult?.ok === true) previousProjection = clone(previousProjectionResult.projection);
    } catch (error) {
      host.logger?.warn?.('[Directive] Could not capture the prior gameplay notification projection.', error);
    }
    const analysisController = typeof AbortController === 'function' ? new AbortController() : null;
    const analysisSignal = AbortSignal.any([analysisController?.signal, progressScope?.signal].filter(Boolean));
    activeAnalysisController = analysisController;
    let mission = null;
    let persistenceAttempts = 0;
    const fingerprint = acceptedPairFingerprint(snapshot);
    activeAnalysisFingerprint = fingerprint;
    const budgetAttemptKind = attemptKind === 'manual' ? 'manual' : 'automatic';
    const budgetReserved = allowModelCall === true
      && fingerprint
      && acceptedPairCallBudget.reserve(fingerprint, budgetAttemptKind);
    try {
      do {
        persistenceAttempts += 1;
        mission = await missionRuntime.settleAcceptedPair({
          runtimeAssets,
          snapshot,
          generationType,
          acceptedCommandBearingEdge: acceptedCommandBearingEdgeForSnapshot(snapshot),
          signal: analysisSignal,
          allowModelCall: budgetReserved === true,
          acceptedPairSourcePrecondition,
          progressScope,
        });
      } while (mission?.ok === false
        && mission.reasonCode === 'persistence-failed'
        && persistenceAttempts < 3
        && analysisSignal.aborted !== true);
    } finally {
      if (activeAnalysisController === analysisController) {
        activeAnalysisController = null;
        activeAnalysisFingerprint = null;
        if (!nativeNarrationActive) scheduleIdleDossiers();
      }
    }
    if (mission?.ok === true) {
      acceptedPairCallBudget.clear(fingerprint);
    } else if (budgetReserved && (progressScope?.signal?.aborted || mission?.attempted !== true)) {
      acceptedPairCallBudget.release(fingerprint, budgetAttemptKind);
    }
    if (progressScope?.signal?.aborted) throw generationAbortedError();
    const time = mission?.time || null;
    const settlementBlocked = mission?.ok === false;
    if (updateRecovery && settlementBlocked) {
      host.logger?.warn?.('[Directive] Turn preparation blocked: ' + JSON.stringify({
        reasonCode: mission.reasonCode,
        blockedRoles: mission.blockedRoles || mission.diagnostics?.blockedRoles || [],
      }));
      if (mission.reasonCode === 'accepted-pair-source-stale') {
        acceptedPairCallBudget.clear(fingerprint);
        acceptedPairRecovery = reconcileRequiredRecovery(mission.reasonCode);
        acceptedPairRecoveryGestureId = recoveryGestureId;
      } else {
        acceptedPairRecovery = pairRetryRecovery({
          snapshot,
          ingressId,
          reasonCode: mission.reasonCode,
          persistenceAttempts,
          blockedRoles: mission.blockedRoles || mission.diagnostics?.blockedRoles || [],
          turnKey: mission.turnKey || mission.diagnostics?.turnKey || null,
          generationType,
        });
        acceptedPairRecoveryGestureId = recoveryGestureId;
      }
    } else if (updateRecovery && mission?.ok === true
      && (acceptedPairRecovery.mode !== 'pair-retry'
        || acceptedPairRecovery.pair?.fingerprint === fingerprint)) {
      acceptedPairRecovery = noAcceptedPairRecovery();
      acceptedPairRecoveryGestureId = null;
    }
    const commandBearing = mission?.acceptedCommandBearingEdge || {
      applied: false,
      reasonCode: 'no-accepted-edge'
    };
    let notifications = [];
    if (mission?.ok === true && publishNotifications) {
      try {
        const nextProjectionResult = projectionResult();
        notifications = nextProjectionResult?.ok === true
          ? deriveGameplayNotifications({
            previousProjection,
            nextProjection: nextProjectionResult.projection
          })
          : [];
        if (notifications.length > 0) {
          sendRuntimeUiMessage({
            type: 'directive.gameplayNotifications.publish.v1',
            payload: { records: clone(notifications) }
          });
        }
      } catch (error) {
        notifications = [];
        host.logger?.warn?.('[Directive] Could not derive gameplay notifications from committed state.', error);
      }
    }
    if (mission?.ok === true && syncPromptAfter) await syncPrompt({ progressScope, generationType,
      generationTargetKey:createNarrationGenerationTargetKey({snapshot,generationType}) });
    return {
      time,
      mission,
      commandBearing,
      notifications: clone(notifications),
      persistenceAttempts,
      settlementBlocked,
      campaignState: clone(state)
    };
  }

  async function acceptedSnapshotForMessage(currentPlayerMessage, recentMessages, ingressId = null) {
    // Failed host generations can append player messages without an assistant
    // reply. Its first accepting player remains the source for settlement.
    if (!activeSourceRow(currentPlayerMessage)) {
      return { ok: false, reason: 'player-source-inactive', snapshot: null };
    }
    const findAcceptingPlayer = (messages) => {
      const activeMessages = messages.filter(activeSourceRow);
      let index = activeMessages.findIndex(item => messageId(item, item) === messageId(currentPlayerMessage, currentPlayerMessage));
      if (index < 0) return { player: null, messages: activeMessages, reachedStart: true, reason: 'player-source-inactive' };
      let player = currentPlayerMessage;
      for (index -= 1; index >= 0; index -= 1) {
        const item = activeMessages[index];
        if (!isUserMessage(item)) return {
          player,
          messages: activeMessages,
          reachedStart: index === 0,
        };
        player = item;
      }
      return { player, messages: activeMessages, reachedStart: true };
    };
    let resolved = findAcceptingPlayer(recentMessages);
    if (resolved.reachedStart && recentMessages.length >= V1_ACCEPTED_PAIR_SOURCE_WINDOW) {
      recentMessages = await host.chat.getRecentMessages?.({ limit: Number.MAX_SAFE_INTEGER, playerSafeOnly: false }) || recentMessages;
      resolved = findAcceptingPlayer(recentMessages);
    }
    if (!resolved.player) return { ok: false, reason: resolved.reason, snapshot: null };
    return prepareV1AcceptedPairSnapshot({
      campaignState: state,
      currentPlayerMessage: resolved.player,
      recentMessages: resolved.messages,
      requirePromptingPlayerAnchor: true,
      chatId: host.chat.getCurrentChatId?.(),
      ingressId
    });
  }

  function scheduleEpisodeReviewFlight({
    automatic = true,
    signal = null,
    progressScope = turnProgress.createScope(),
  } = {}) {
    if (!state || !missionRuntime) {
      return Promise.resolve({ ok: false, attempted: false, status: 'inactive', reasonCode: 'inactive' });
    }
    // Retrospective review is part of the next turn's mandatory director request.
    return Promise.resolve({ ok: true, attempted: false, status: 'deferred-to-director', reasonCode: null });
  }

  async function rebuildAcceptedStateFromChat({
    progressScope = turnProgress.createScope(),
  } = {}) {
    if (!state || !currentChatIsBound()) return { replayed: 0, blocked: false };
    const messages = await host.chat.getRecentMessages?.({ limit: Number.MAX_SAFE_INTEGER, playerSafeOnly: false }) || [];
    const activeMessages = messages.filter(activeSourceRow);
    const activeMessageIds = new Set(activeMessages.map((message) => messageId(message, message)).filter(Boolean));
    let reconciled = 0;
    for (const persistedId of persistedAcceptedSourceMessageIds(state)) {
      if (activeMessageIds.has(persistedId)) continue;
      const invalidated = await invalidateSourceAuthority(persistedId, 'source-missing-from-chat');
      if (invalidated.mission?.ok === false) {
        acceptedPairRecovery = reconcileRequiredRecovery('source-invalidation-persistence-failed');
        acceptedPairRecoveryGestureId = null;
        return {
          replayed: 0,
          reconciled,
          blocked: true,
          blockedAtMessageId: persistedId,
          retryPending: true
        };
      }
      if (invalidated.mission?.noChange !== true || invalidated.time?.status === 'invalidated') reconciled += 1;
    }
    let replayed = 0;
    let blockedAtMessageId = null;
    let unresolvedCount = 0;
    for (const message of activeMessages) {
      if (!isUserMessage(message)) continue;
      const hostMessageId = message.hostMessageId || message.id;
      const prepared = await acceptedSnapshotForMessage(message, activeMessages, `replay.${hostMessageId}`);
      if (!prepared.ok) continue;
      const result = await settleSnapshot(prepared.snapshot, `replay.${hostMessageId}`, {
        syncPromptAfter: false,
        publishNotifications: false,
        attemptKind: 'reconcile',
        allowModelCall: false,
        updateRecovery: false,
        progressScope,
      });
      if (result.mission?.ok === false) {
        unresolvedCount += 1;
        blockedAtMessageId ||= hostMessageId || null;
        continue;
      }
      if (result.mission?.status !== 'already-settled') replayed += 1;
    }
    acceptedPairRecovery = noAcceptedPairRecovery();
    acceptedPairRecoveryGestureId = null;
    await syncPrompt({ rebuild: true, progressScope });
    return {
      replayed,
      ...(reconciled > 0 ? { reconciled } : {}),
      ...(unresolvedCount > 0 ? { unresolved: unresolvedCount } : {}),
      blocked: false,
      blockedAtMessageId,
      retryPending: false
    };
  }

  async function invalidateSourceAuthority(id, eventType, progressScope = null) {
    const timePlan = prepareV1AcceptedPairTimeInvalidationByHostMessages({
      campaignState: state,
      hostMessageIds: [id],
      packageData: records.packageData,
      now,
      eventType
    });
    const commandBearing = prepareCommandBearingRefundForInvalidatedMessage(id, eventType);
    const authorityPatch = {
      ...(timePlan.patch || {}),
      ...(commandBearing.patch || {})
    };
    const authorityDomains = [...new Set([
      ...(timePlan.domains || []),
      ...(commandBearing.domains || [])
    ])];
    const mission = await missionRuntime.invalidateSourceMutation({
      runtimeAssets,
      hostMessageId: id,
      eventType,
      authorityPatch,
      authorityDomains,
      progressScope,
    });
    const time = timePlan.patch
      ? { ...timePlan, status: mission.ok === true ? 'invalidated' : 'unavailable', campaignState: clone(state), patch: null }
      : timePlan;
    return { mission, time, commandBearing };
  }

  async function invalidateSource(payload, eventType) {
    pauseDossiers();
    const progressScope = turnProgress.createScope();
    const sourceChatId = compact(payload?.chatId || payload?.message?.chatId || host.chat.getCurrentChatId?.());
    const key = transcriptKey();
    const preparing = transcriptLane.current(key);
    if (preparing?.phase === 'preparing' && preparing.preparationStarted
      && currentChatIsBound() && (!sourceChatId || sourceChatId === compact(state?.campaignChatBinding?.chatId))) {
      // Cancellation completion is awaited outside the settlement queue: the
      // interceptor itself may need that queue to unwind its owned preparation.
      transcriptLane.cancel(key);
      activeAnalysisController?.abort();
      await preparing.preparationFinished;
      if (transcriptKey() !== key) return { handled: false, reason: 'source-chat-changed' };
    }
    const failedOwner = transcriptLane.current(key);
    let preparingOwner = null, preparingTranscript = null;
    if (eventType === 'message-deleted' && failedOwner?.phase === 'preparing'
      && !failedOwner.preparationStarted && failedOwner.generationType === 'regenerate'
      && messageId(payload, normalizeMessage(host, payload)) === failedOwner.regenerateSourceId
      && failedOwner.baseline) {
      const baseline = JSON.parse(failedOwner.baseline);
      const current = transcriptObservation();
      if (baseline.length && current === JSON.stringify(baseline.slice(0, -1))) {
        preparingOwner = failedOwner;
        preparingTranscript = current;
      }
    }
    if (failedOwner?.phase === 'failed' && !failedOwner.running && !finalizationFlights.has(key)
      && host.chat.getGenerationActivity?.()?.status === 'idle'
      && currentChatIsBound() && (!sourceChatId || sourceChatId === compact(state?.campaignChatBinding?.chatId))
      && messageId(payload, normalizeMessage(host, payload))) {
      // An explicit idle source mutation abandons the failed generation's old
      // annotation obligation. Its retained retry must never rewrite that row.
      transcriptLane.releaseUnchanged(failedOwner);
      failedFinalizations.delete(key);
      openingPublications.delete(key);
      pendingProtectedFinalizations.delete(key);
    }
    if (currentChatIsBound() && (!sourceChatId || sourceChatId === compact(state?.campaignChatBinding?.chatId))) {
      pendingProtectedTurns.get(key)?.turn.dispose();
      pendingProtectedTurns.delete(key);
      protectedOpenings.get(key)?.turn?.dispose();
      protectedOpenings.delete(key);
      activeAnalysisController?.abort();
    }
    return enqueueSettlement(async () => {
      if (preparingOwner && transcriptObservation() !== preparingTranscript) throw transcriptNotReady('regenerate-source-changed');
      if (!state || !currentChatIsBound()) return { handled: false, reason: 'inactive-or-unbound' };
      if (sourceChatId && sourceChatId !== compact(state.campaignChatBinding?.chatId)) {
        return { handled: false, reason: 'source-chat-changed' };
      }
      const normalized = normalizeMessage(host, payload);
      if (compact(normalized?.chatId) && compact(normalized.chatId) !== compact(state.campaignChatBinding?.chatId)) {
        return { handled: false, reason: 'source-chat-changed' };
      }
      const id = messageId(payload, normalized);
      if (!id) return { handled: false, reason: 'message-id-unavailable' };
      acceptedPairRecovery = reconcileRequiredRecovery(eventType);
      acceptedPairRecoveryGestureId = null;
      const { mission, time, commandBearing } = await invalidateSourceAuthority(id, eventType, progressScope);
      if (preparingOwner && transcriptObservation() === preparingTranscript) preparingOwner.baseline = preparingTranscript;
      await syncPrompt({ rebuild: true, progressScope });
      const replay = {
        replayed: 0,
        blocked: false,
        deferred: true,
        reasonCode: acceptedPairRecovery.reasonCode,
      };
      return { handled: true, mission, time, commandBearing, replay };
    }, { transcriptOwner: preparingOwner });
  }

  async function campaignViewEnvelope(tabId) {
    const campaignView = await controller.getCampaignView();
    const bound = currentChatIsBound();
    const visibleState = bound ? state : null;
    let projection = null;
    if (visibleState) {
      const built = projectionResult();
      if (!built.ok) {
        const error = new Error(`Directive V1 state cannot be projected: ${built.reasonCode || 'unknown'}`);
        error.code = 'DIRECTIVE_V1_PROJECTION_UNAVAILABLE';
        throw error;
      }
      projection = built.projection;
    }
    return {
      kind: 'directive.runtimeView.v1',
      tabId,
      activeScreen,
      campaign: { packages: campaignView.packages },
      campaignIndex: { campaigns: campaignView.campaigns },
      campaignState: clone(visibleState),
      v1PlayerProjection: clone(projection),
      creator: clone(creatorView),
      activePackage: clone(records.packageData),
      activeSaveId: activeSave()?.id || null,
      storageDiagnostics: clone(storageDiagnostics),
      media: {
        playerPortraitImportSupported: playerPortraitImportSupported(host)
      },
      narrationSettings: narrationSettings(),
      openingGeneration: bound ? (openingLifecycle.currentStatus() || ((await host.chat.getRecentMessages({ limit: 4 })).some(message => !message.isSystem && message.role !== 'system') ? null : {status: 'pending', message: 'Your character is ready. Generate the opening scene to begin.'})) : null,
      providerConfiguration: providerConfiguration(host),
      directivePreset: presetConfiguration(host),
      generationRouting: clone(GENERATION_ROUTING),
      diagnostics: diagnosticsConfiguration(host)
    };
  }

  async function publishProtectedGeneration({ preparedSnapshot, direction, generationType, generationTargetKey, transcriptOwner, progressScope, recoverPublished = false }) {
    const key = transcriptKey();
    const pending = pendingProtectedTurns.get(key);
    if (pending && pending.targetKey !== generationTargetKey) throw Object.assign(new Error('The prior protected publication must be recovered first.'), { code: 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING' });
    if (!['normal', 'swipe', 'regenerate', 'continue'].includes(generationType) || !preparedSnapshot || !direction?.mission?.directorReceipt?.characterScene) {
      throw Object.assign(new Error('Protected scene preparation is unavailable for this source.'), { code: 'DIRECTIVE_CHARACTER_SCENE_PREPARATION_UNAVAILABLE' });
    }
    if (typeof host.chat.publishProtectedScene !== 'function') throw Object.assign(new Error('Protected publication is unavailable.'), { code: 'DIRECTIVE_CHARACTER_PUBLICATION_UNAVAILABLE' });
    let retained = pending;
    if (retained) {
      retained.ownership.owner = transcriptOwner;
      retained.ownership.scope = progressScope;
    } else {
      await host.prompt.clear?.({ reason: 'protected-character-scene' });
      assertTurnActive(progressScope);
      const sampled = host.chat.captureCurrentTranscriptSnapshot?.();
      const messages = host.chat.getRecentMessages?.({ limit: Number.MAX_SAFE_INTEGER, playerSafeOnly: false });
      if (sampled?.status !== 'captured' || !Array.isArray(messages)) throw Object.assign(new Error('Transcript capture is unavailable.'), { code: 'DIRECTIVE_CHARACTER_SNAPSHOT_INVALID' });
      const rows = sampled.snapshot.rows;
      const ownership = { owner: transcriptOwner, scope: progressScope };
      const sourceDigest = stableSha256Hex(stableJsonStringify(rows));
      const readIdentity = () => {
        assertTurnActive(ownership.scope);
        transcriptLane.assertOwner(ownership.owner, transcriptKey());
        return { bindingKey: transcriptKey(), branchId: state.campaignChatBinding.saveId, sourceDigest,
          stateDigest: stableSha256Hex(stableJsonStringify(state)),
          settingsDigest: stableSha256Hex(stableJsonStringify({ providers: providerConfiguration(host), narration: narrationSettings(), knowledge: characterKnowledgeSettings() })),
          epoch: ownership.scope.epoch };
      };
      const identity = readIdentity();
      const publicationId = `character-scene.${stableSha256Hex(`${key}:${Date.now()}:${Math.random()}`)}`;
      const guard = createCharacterPublicationGuard({ publicationId, identity, baselineRows: rows, readIdentity,
        readRows: () => { const current = host.chat.captureCurrentTranscriptSnapshot?.(); return current?.status === 'captured' ? current.snapshot.rows : null; } });
      let sourcePair = Object.fromEntries(['previousAssistant', 'currentPlayer'].map(slot => {
        const source = preparedSnapshot.source[slot];
        return [slot, { messageId: source.hostMessageId, selectedSwipeId: slot === 'previousAssistant' ? source.selectedVariantId ?? source.selectedVariant?.selectedVariantId ?? null : null,
          textHash: source.textHash, text: source.text }];
      }));
      const definition = (runtimeAssets?.missionDefinitions || []).map(entry => entry.definition || entry).find(entry => entry.id === state.mission?.v1?.definitionId);
      const pacing = createProtectedNarrationPacing(definition ? { definition, state: state.mission.v1, receipts: state.storySettlement?.acceptedPairReceipts || [] } : {});
      const target = generationType === 'normal' ? null : [...messages].reverse().find(message => activeSourceRow(message) && !isUserMessage(message) && !message.isSystem && !message.is_system);
      if (generationType !== 'normal' && !target) throw Object.assign(new Error('The selected response is unavailable.'), { code: 'DIRECTIVE_CHARACTER_SNAPSHOT_INVALID' });
      let admission = direction.mission.directorReceipt.characterScene;
      let continuation = null;
      if (generationType === 'continue') {
        const captured = captureV1StorySource(target);
        if (!captured.ok) throw Object.assign(new Error('The selected continuation source is invalid.'), { code: 'DIRECTIVE_CHARACTER_SNAPSHOT_INVALID' });
        const { role, ...previousAssistant } = captured.value;
        sourcePair = { ...sourcePair, previousAssistant };
        continuation = { source: { messageId: previousAssistant.messageId, selectedSwipeId: previousAssistant.selectedSwipeId, textHash: previousAssistant.textHash }, text: previousAssistant.text };
        const analysis = captureAcceptedPairAnalysis({ campaignState: state, runtimeAssets, snapshot: preparedSnapshot, generationType, focused: true, characterKnowledge: characterKnowledgeSettings() });
        const { publicationDisclosures: priorDisclosures, ...continuationScene } = analysis.directorRequest.currentScene;
        const request = { ...analysis.directorRequest, pendingPair: sourcePair,
          currentScene: { ...continuationScene, sceneOnly: true } };
        const result = await createContinuityAnalyst({ generationRouter })({ request, signal: progressScope.signal });
        const parsed = result?.ok ? parseContinuityAnalystOutput(result.proposal, { request }) : null;
        if (!parsed?.ok || parsed.value.coverage !== 'complete' || parsed.value.threadChanges.length || !guard.isCurrent()) throw Object.assign(new Error('Continuation scene preparation is unavailable.'), { code: 'DIRECTIVE_CHARACTER_SCENE_PREPARATION_UNAVAILABLE' });
        admission = createCharacterSceneAdmission({ proposal: parsed.value.characterScene, sourcePair,
          playerId: request.currentScene.playerId, knownPersonIds: new Set(request.authoredContext.references.filter(ref => ref.kind === 'person').map(ref => ref.id)), explicitAudience: new Map() });
      }
      const turn = await prepareProtectedCharacterTurn({ generation: generationRouter, campaignState: state, crewDataset: runtimeAssets.crewDataset,
        messages, sourcePair, admission, continuation, sourceContributionIds: direction.mission.directorReceipt.sourceContributionIds,
        identity, guard, publicationId, expectedBinding: clone(state.campaignChatBinding), hostMessageId: target ? messageId(target, target) : null,
        signal: AbortSignal.any([generationCancellation.signal, progressScope.signal].filter(Boolean)), settings: narrationSettings(), pacing });
      retained = { turn, ownership, targetKey: generationTargetKey, publicationBaseline: JSON.stringify(rows), preparation: { preparedSnapshot, direction, generationType, generationTargetKey } };
      pendingProtectedTurns.set(key, retained);
    }
    try {
      const publication = await enqueueStateMutation(() => recoverPublished
        ? retained.turn.recoverPublished(options => host.chat.publishProtectedScene(options), { signal: AbortSignal.any([generationCancellation.signal, progressScope.signal].filter(Boolean)) })
        : retained.turn.publish(options => host.chat.publishProtectedScene(options)), { transcriptOwner });
      pendingProtectedTurns.delete(key);
      transcriptOwner.baseline = retained.publicationBaseline;
      transcriptLane.producing(transcriptOwner);
      const message = await host.chat.getMessage?.(publication.hostMessageId);
      pendingProtectedFinalizations.set(key, { publication, attempts: retained.turn.attempts });
      const finalization = await publicApi.handleHostGenerationEnded({ message });
      if (!finalization?.hostMessageId || finalization.metadataAttachment || finalization.timeFooterNormalization) {
        if (!failedFinalizations.has(key)) {
          transcriptLane.finish(transcriptOwner, false);
          failedFinalizations.set(key, { payload: { message: clone(message) }, capturedDutyReport: null,
            completionTarget: captureDirectivePromptTarget(), expectedTranscript: transcriptObservation() });
        }
        throw Object.assign(new Error('Protected scene finalization is pending.'), { code: 'DIRECTIVE_CHARACTER_FINALIZATION_PENDING' });
      }
      pendingProtectedFinalizations.delete(key);
      return { publication, finalization, displayRefreshRequired: publication.displayUpdated === false, attempts: retained.turn.attempts };
    } catch (error) {
      if (error?.code !== 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING') {
        retained.turn.dispose();
        if (!retained.turn.hasPublished) pendingProtectedTurns.delete(key);
      }
      throw error;
    }
  }

  const orchestrator = {
    async interceptGeneration({ type = 'normal', recoveryIntent = 'direct', signal = null } = {}) {
      if (characterKnowledgeSettings()?.mode === 'protected' && ['quiet', 'impersonate'].includes(compact(type))) return { handled: false, reason: 'non-story-generation' };
      if (activeTimelineLoad) return { handled: true, abortDefaultGeneration: true,
        responseStrategy: 'cancelStaleTurn', reasonCode: 'timeline-load-pending' };
      const generationGesture = activeHostGenerationGesture;
      const generationGestureId = generationGesture?.id ?? null;
      if (signal?.aborted || (recoveryIntent === 'native' && generationCancellation.stopped)) {
        return {
          handled: true,
          abortDefaultGeneration: true,
          responseStrategy: 'cancelStaleTurn',
          reasonCode: 'host-generation-stopped',
        };
      }
      generationCancellation.resume();
      pauseDossiers();
      const generationType = compact(type) || 'normal';
      let generationTargetKey = null;
      let protectedPreparation = null;
      let transcriptOwner = generationGesture?.transcriptOwner || null;
      // A completed blocked attempt released its preparation; the gesture still
      // owns the existing retry budget, not a running transcript reservation.
      if (transcriptOwner?.preparationReleased && transcriptLane.current(transcriptKey()) !== transcriptOwner) transcriptOwner = null;
      let narrationPermitted = false;
      let preparationClaimed = false;
      // A dialog dismissal cancels only this attempt, including queued work.
      const progressScope = Object.freeze({ ...turnProgress.createScope(), signal });
      try {
      assertTurnActive(progressScope);
      if (transcriptOwner) {
        claimTranscriptPreparation(transcriptOwner);
        preparationClaimed = true;
      }
      await ensureInitialized();
      const canceledPublicationOwner = transcriptLane.current(transcriptKey());
      if (canceledPublicationOwner?.phase === 'failed' && !canceledPublicationOwner.running
        && canceledPublicationOwner.preparationSettled === true && !finalizationFlights.has(transcriptKey())
        && pendingProtectedTurns.get(transcriptKey())?.turn.hasPublished) {
        // A drained write retains its exact reviewed row and will be revalidated
        // under this fresh user gesture before any save or finalization.
        transcriptLane.releaseUnchanged(canceledPublicationOwner);
        failedFinalizations.delete(transcriptKey());
        transcriptOwner = null;
      }
      if (transcriptLane.current(transcriptKey())?.phase === 'failed') {
        if (finalizationFlights.has(transcriptKey())) throw transcriptNotReady('finalization-running');
        const prior = failedFinalizations.get(transcriptKey());
        if (prior) {
          const protectedCompletion = pendingProtectedFinalizations.get(transcriptKey());
          const finalization = await publicApi.handleHostGenerationEnded(prior.payload, prior);
          if (protectedCompletion && finalization?.hostMessageId && !finalization.metadataAttachment && !finalization.timeFooterNormalization) {
            pendingProtectedFinalizations.delete(transcriptKey());
            return { handled: true, abortDefaultGeneration: true, responseStrategy: 'protectedScenePublished', ...protectedCompletion,
              finalization, displayRefreshRequired: protectedCompletion.publication.displayUpdated === false };
          }
        }
        else releaseUnchangedTranscript(transcriptLane.current(transcriptKey()));
        if (transcriptLane.current(transcriptKey())) throw transcriptNotReady('finalization-failed');
        transcriptOwner = null;
      }
      if (currentChatIsBound() && !transcriptOwner) {
        transcriptOwner = beginTranscriptPreparation();
        claimTranscriptPreparation(transcriptOwner);
        preparationClaimed = true;
      }
      await settlementQueue;
      await controller.verifySaveWritable?.();
      assertTurnActive(progressScope);
      if (rejectedBranchMatchesCurrentChat()) {
        await host.prompt.clear?.({ reason: BRANCH_DECISION_HISTORY_UNAVAILABLE });
        return { handled: true, abortDefaultGeneration: true,
          responseStrategy: 'cancelStaleTurn', reasonCode: BRANCH_DECISION_HISTORY_UNAVAILABLE };
      }
      if (!state || !currentChatIsBound()) {
        await host.prompt.clear?.({ reason: 'generation-interceptor-inactive-or-unbound' });
        return { handled: false, reason: 'inactive-or-unbound' };
      }
      if (characterKnowledgeSettings()?.mode === 'protected' && ['swipe', 'regenerate'].includes(generationType)
        && typeof host.chat.prepareProtectedGeneration === 'function') {
        await enqueueStateMutation(() => host.chat.prepareProtectedGeneration({ type: generationType,
          expectedBinding: clone(state.campaignChatBinding), signal: generationCancellation.signal,
          assertCurrent: () => { assertTurnActive(progressScope); transcriptLane.assertOwner(transcriptOwner, transcriptKey()); return currentChatIsBound(); },
        }), { transcriptOwner });
      }
      const existingProtectedWrite = pendingProtectedTurns.get(transcriptKey());
      if (existingProtectedWrite?.turn.hasPublished) {
        try {
          const result = await publishProtectedGeneration({ ...existingProtectedWrite.preparation, transcriptOwner, progressScope, recoverPublished: true });
          return { handled: true, abortDefaultGeneration: true, responseStrategy: 'protectedScenePublished', ...result };
        } catch (error) {
          if (error?.code === 'DIRECTIVE_GENERATION_ABORTED') throw error;
          return { handled: true, abortDefaultGeneration: true, responseStrategy: 'blockAndRetry',
            settlementError: { code: error?.code || 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING', reasonCode: error?.code || 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING', blockedRoles: [], persistenceAttempts: 0 } };
        }
      }
      assertAcceptedPairRecovery(acceptedPairRecovery);
      const recoveryBelongsToCurrentGesture = recoveryIntent === 'native'
        && generationGestureId !== null
        && acceptedPairRecoveryGestureId === generationGestureId;
      const mayRetryPendingRecovery = recoveryIntent === 'explicit'
        || recoveryIntent === 'direct'
        || (recoveryIntent === 'native'
          && generationGesture?.manualRecoveryEligible === true
          && !recoveryBelongsToCurrentGesture);
      // A passive interceptor can arrive without a generation-start event and
      // may retain ordinary source-mutation reconciliation. A rejected commit
      // requires a new manual gesture because its replay may need model work.
      const mayReconcilePendingRecovery = mayRetryPendingRecovery
        || (recoveryIntent === 'native'
          && generationGestureId === null
          && acceptedPairRecovery.reasonCode !== 'accepted-pair-source-stale');
      if (acceptedPairRecovery.mode === 'reconcile-required' && !mayReconcilePendingRecovery) {
        return {
          handled: true,
          abortDefaultGeneration: true,
          responseStrategy: 'blockAndRetry',
          settlementError: {
            code: 'DIRECTIVE_ACCEPTED_PAIR_SETTLEMENT_BLOCKED',
            reasonCode: acceptedPairRecovery.reasonCode,
            blockedRoles: [],
            persistenceAttempts: 0,
          },
        };
      }
      if (acceptedPairRecovery.mode === 'pair-retry' && mayRetryPendingRecovery) {
        // A fresh Generate gesture retries the failed analysis, just like the dialog.
        await publicApi.retryPendingAcceptedPairSettlement({
          progressScope,
          recoveryGestureId: recoveryIntent === 'direct' ? null : generationGestureId,
          dedupeRecoveryGesture: recoveryIntent === 'native',
          transcriptOwner,
        });
      }
      assertTurnActive(progressScope);
      if (acceptedPairRecovery.mode === 'pair-retry') {
        return {
          handled: true,
          abortDefaultGeneration: true,
          responseStrategy: 'blockAndRetry',
          settlementError: {
            code: 'DIRECTIVE_ACCEPTED_PAIR_SETTLEMENT_BLOCKED',
            reasonCode: acceptedPairRecovery.reasonCode,
            blockedRoles: acceptedPairRecovery.pair.blockedRoles || [],
            persistenceAttempts: acceptedPairRecovery.pair.persistenceAttempts
          }
        };
      }
      const latestPlayerMessage = await host.chat.getLatestPlayerMessage?.();
      assertTurnActive(progressScope);
      let acceptedPairReplay = null;
      if (acceptedPairRecovery.mode === 'reconcile-required') {
        acceptedPairReplay = await enqueueSettlement(() => rebuildAcceptedStateFromChat({ progressScope }), { transcriptOwner });
      } else if (latestPlayerMessage) {
        await publicApi.observeHostPlayerMessage({
          message: latestPlayerMessage,
          source: 'v1-generation-boundary'
        }, { progressScope, generationType, syncPromptAfter:false, transcriptOwner });
        await settlementQueue;
      }
      if (latestPlayerMessage) await enqueueSettlement(() => {
        assertTurnActive(progressScope);
        return armPendingCommandBearingEdge(latestPlayerMessage);
      }, { transcriptOwner });
      assertTurnActive(progressScope);
      if (acceptedPairRecovery.mode !== 'none' || acceptedPairReplay?.blocked === true) {
        return {
          handled: true,
          abortDefaultGeneration: true,
          responseStrategy: 'blockAndRetry',
          settlementError: {
            code: 'DIRECTIVE_ACCEPTED_PAIR_SETTLEMENT_BLOCKED',
            reasonCode: acceptedPairRecovery.reasonCode || 'accepted-pair-replay-pending',
            blockedRoles: acceptedPairRecovery.pair?.blockedRoles || [],
            persistenceAttempts: acceptedPairRecovery.pair?.persistenceAttempts || 0
          },
          acceptedPairReplay
        };
      }
      // Host continuation/swipe can arrive without a new player observation.
      // Recheck the exact generation target; a valid committed receipt is a no-op.
      if (latestPlayerMessage) {
        const recent = await host.chat.getRecentMessages?.({limit:V1_ACCEPTED_PAIR_SOURCE_WINDOW,playerSafeOnly:false}) || [];
        const prepared = await acceptedSnapshotForMessage(latestPlayerMessage, recent);
        if (prepared?.ok) {
          generationTargetKey = createNarrationGenerationTargetKey({snapshot:prepared.snapshot,generationType});
          const direction = await enqueueSettlement(() => settleSnapshot(prepared.snapshot, null, {
            syncPromptAfter:false, publishNotifications:false, progressScope, generationType,
            recoveryGestureId:generationGestureId,
          }), { transcriptOwner });
          protectedPreparation = { preparedSnapshot: prepared.snapshot, direction };
          assertTurnActive(progressScope);
          if (direction.settlementBlocked) return {
            handled:true, abortDefaultGeneration:true, responseStrategy:'blockAndRetry',
            settlementError:{code:'DIRECTIVE_TURN_DIRECTION_BLOCKED',reasonCode:direction.mission?.reasonCode,
              blockedRoles:acceptedPairRecovery.pair?.blockedRoles || [], persistenceAttempts:direction.persistenceAttempts || 0},
          };
        } else if (prepared?.reason !== 'no-previous-assistant') {
          const error = new Error('The selected story sources could not be verified for narration.');
          error.code = 'DIRECTIVE_TURN_SOURCE_INVALID';
          throw error;
        }
      }
      if (characterKnowledgeSettings()?.mode === 'protected') {
        try {
          const result = await publishProtectedGeneration({ ...protectedPreparation, generationType, generationTargetKey, transcriptOwner, progressScope });
          return { handled: true, abortDefaultGeneration: true, responseStrategy: 'protectedScenePublished', ...result };
        } catch (error) {
          if (error?.code === 'DIRECTIVE_GENERATION_ABORTED') throw error;
          return { handled: true, abortDefaultGeneration: true, responseStrategy: 'blockAndRetry',
            settlementError: { code: error?.code || 'DIRECTIVE_CHARACTER_SCENE_FAILED', reasonCode: error?.code || 'DIRECTIVE_CHARACTER_SCENE_FAILED', blockedRoles: [], persistenceAttempts: 0 } };
        }
      }
      const promptSync = await syncPrompt({
        progressScope,
        generationType,
        generationTargetKey,
        cancelIfUnbound: true,
      });
      if (promptSync?.status === 'stale-target' || promptSync?.active === false) {
        return {
          handled: true,
          abortDefaultGeneration: true,
          responseStrategy: 'cancelStaleTurn',
          reasonCode: promptSync.reasonCode || 'prompt-target-changed',
        };
      }
      await controller.verifySaveWritable?.();
      if (transcriptOwner) {
        transcriptLane.assertOwner(transcriptOwner, transcriptKey());
        transcriptOwner.baseline = transcriptObservation();
        transcriptLane.producing(transcriptOwner);
      }
      narrationPermitted = true;
      return {
        handled: true,
        abortDefaultGeneration: false,
        responseStrategy: 'injectAndContinue',
        acceptedPairReplay
      };
      } catch (error) {
        if (error?.code === 'DIRECTIVE_TRANSCRIPT_NOT_READY') return {
          handled: true, abortDefaultGeneration: true, responseStrategy: 'cancelStaleTurn', reasonCode: error.reasonCode,
          settlementError: { code: error.code, reasonCode: error.reasonCode, message: error.message },
        };
        if (isStatePublicationError(error)) {
          const reasonCode = error.code === 'DIRECTIVE_V1_STATE_PERSISTENCE_PENDING'
            ? 'state-publication-writing'
            : error.code === 'DIRECTIVE_V1_STATE_PUBLICATION_ACK_PENDING'
              ? (error.details?.publication === 'not-committed'
                ? 'state-publication-not-committed-acknowledgement' : 'state-publication-acknowledgement')
              : 'state-publication-pending';
          return { handled: true, abortDefaultGeneration: true, responseStrategy: 'blockAndRetry',
            reasonCode, settlementError: { code: error.code, reasonCode, message: error.message } };
        }
        if (error?.code !== 'DIRECTIVE_GENERATION_ABORTED') throw error;
        return { handled: true, abortDefaultGeneration: true, responseStrategy: 'cancelStaleTurn', reasonCode: 'host-generation-stopped' };
      } finally {
        if (preparationClaimed && !narrationPermitted && transcriptOwner?.phase === 'preparing') {
          transcriptLane.finish(transcriptOwner, true);
          transcriptOwner.preparationReleased = true;
        }
        if (preparationClaimed) {
          transcriptOwner.preparationSettled = true;
          transcriptOwner.finishPreparation?.();
        }
      }
    }
  };

  const publicApi = {
    subscribeTurnProgress: (listener) => turnProgress.subscribeTurnProgress(listener),
    resetTurnProgress: () => turnProgress.resetTurnProgress(),
    isCurrentChatBound: () => currentChatIsBound(),
    getCurrentChatBinding: () => clone(state?.campaignChatBinding || null),
    getRejectedNativeBranch: () => rejectedBranchMatchesCurrentChat() ? clone(rejectedNativeBranch) : null,
    async initialize() {
      if (initialized) return campaignViewEnvelope('campaign');
      if (initializing) {
        const error = new Error('Directive runtime initialization is already in progress.');
        error.code = 'DIRECTIVE_RUNTIME_INITIALIZATION_IN_PROGRESS';
        throw error;
      }
      initializing = true;
      try {
        await host.chat.prepareGenerationActivity?.();
        records = await packageLoader();
        runtimeAssets = indexRuntimeAssets(records).get(records.packageData.manifest.id);
        controller = createCampaignStartController({
          adapter: host.storage,
          packages: [records.packageData],
          missionDefinitions: records.missionDefinitions,
          campaignLibrary: records.campaignLibrary || createV1CampaignLibrary(),
          idFactory,
          now
        });
        const recovered = await controller.initialize();
        for (const pendingDeletion of recovered.pendingCampaignDeletions || []) {
          try {
            await controller.resumeCampaignDeletion({
              campaignId: pendingDeletion.campaignId,
              deleteHostEntity: (binding) => withInternalChatOpen(() => (
                host.chat.deleteCampaignCharacter(binding, { allowAlreadyAbsent: true })
              )),
            });
          } catch (error) {
            if (['DIRECTIVE_V1_CAMPAIGN_DELETION_TOMBSTONE_INVALID', 'DIRECTIVE_V1_CAMPAIGN_DELETION_RESUME_TARGET_INVALID']
              .includes(String(error?.code || ''))) {
              throw error;
            }
            host.logger?.warn?.('[Directive] Pending campaign deletion will be retried on the next startup.', {
              code: compact(error?.code) || 'DIRECTIVE_CAMPAIGN_DELETION_RESUME_FAILED',
              campaignId: pendingDeletion.campaignId,
            });
          }
        }
        setState(recovered.campaignState);
        configureStateRuntime();
        timelineTransactions = createTimelineTransactionService({
          controller,
          chat: host.chat,
          prompt: host.prompt,
          getState: () => state,
          setState,
          configureRuntime: configureStateRuntime,
          rebuildPrompt: () => syncPrompt({ rebuild: true }),
          openCampaignChat: (binding) => withInternalChatOpen(() => host.chat.openCampaignChat(binding)),
          cloneCampaignChat: (options) => withInternalChatOpen(() => host.chat.cloneCampaignChat(options)),
          runtimeAssets,
          idFactory,
          now
        });
        initialized = true;
        await host.ui?.mount?.();
        if (state) await publicApi.handleHostChatChanged();
        const publication = controller.getSavePublicationStatus?.();
        storageDiagnostics = publication
          ? { ok: false, publication: clone(publication), reasonCode: 'state-publication-pending' }
          : await controller.verifyStorage();
        return campaignViewEnvelope('campaign');
      } finally {
        initializing = false;
        if (initialized) scheduleDeferredInternalChatChange();
      }
    },

    getChatTurnOrchestrator: () => orchestrator,

    handleHostGenerationStarted({ type = 'normal', automaticTrigger = false, dryRun = false, quietToLoud = false } = {}) {
      if (dryRun === true) return { handled: false, reason: 'dry-run' };
      if (type === 'impersonate' || (type === 'quiet' && !quietToLoud)) return { handled: false, reason: 'non-narration-generation' };
      if (activeTimelineLoad) {
        activeTimelineLoad.interrupted = true;
        return { handled: true, reason: 'timeline-load-pending' };
      }
      const generationType = compact(type) || 'normal';
      const manualRecoveryEligible = automaticTrigger !== true
        && !['quiet', 'impersonate'].includes(generationType);
      const stoppedOwner = transcriptLane.current(transcriptKey());
      // Native Regenerate sets its busy flag before announcing the fresh gesture.
      // A drained, canceled preparation with no output can transfer custody here;
      // the busy flag alone cannot distinguish that new gesture from the old one.
      if (manualRecoveryEligible && generationCancellation.stopped && !activeAnalysisController
        && stoppedOwner?.revoked && stoppedOwner.phase === 'failed' && !stoppedOwner.running
        && (!stoppedOwner.preparationStarted || stoppedOwner.preparationSettled === true)
        && !finalizationFlights.has(stoppedOwner.key) && !failedFinalizations.has(stoppedOwner.key)
        && !openingPublications.has(stoppedOwner.key) && currentChatIsBound()
        && ['idle', 'active'].includes(host.chat.getGenerationActivity?.()?.status)
        && stoppedOwner.stoppedTranscript != null && stoppedOwner.stoppedTranscript === transcriptObservation()) {
        transcriptLane.releaseUnchanged(stoppedOwner);
      }
      if (!activeAnalysisController) releaseUnchangedTranscript(transcriptLane.current(transcriptKey()));
      preparedNarrationDutyReport = null;
      pauseDossiers();
      const priorOwner = transcriptLane.current(transcriptKey());
      const preparingOwner = priorOwner?.phase === 'preparing' && !priorOwner.preparationStarted ? priorOwner : null;
      activeHostGenerationGesture = {
        id: ++hostGenerationGestureSequence,
        manualRecoveryEligible,
        transcriptOwner: preparingOwner || (currentChatIsBound() && !priorOwner ? beginTranscriptPreparation() : null),
      };
      if (activeHostGenerationGesture.transcriptOwner) {
        const owner = activeHostGenerationGesture.transcriptOwner;
        owner.generationType = generationType;
        if (generationType === 'regenerate') {
          const recent = host.chat.getRecentMessages?.({ limit: 1, playerSafeOnly: false });
          const tail = Array.isArray(recent) ? recent.at(-1) : null;
          owner.regenerateSourceId = tail && !isUserMessage(tail) && activeSourceRow(tail) ? messageId(tail, tail) : null;
        }
      }
      if (manualRecoveryEligible) generationCancellation.resume();
      return { handled: true, gestureId: activeHostGenerationGesture.id };
    },

    handleHostStreamTokenReceived() {
      if (activeTimelineLoad) { activeTimelineLoad.interrupted = true; return { handled: false, reason: 'timeline-load-pending' }; }
      if (!currentChatIsBound()) return { handled: false };
      const owner = transcriptLane.current(transcriptKey()) || beginTranscriptPreparation();
      if (owner.phase === 'preparing') transcriptLane.producing(owner);
      return { handled: true };
    },

    getTranscriptFinalizationStatus: () => activeTimelineLoad ? { phase: 'loading', running: true } : transcriptLane.status(transcriptKey()),

    async getCurrentView({ tabId = 'campaign' } = {}) {
      await ensureInitialized();
      return campaignViewEnvelope(tabId);
    },

    async adjustObjectiveProgress(options = {}) {
      await ensureInitialized();
      if (!state || !currentChatIsBound()) {
        return { ok: false, message: 'Open the current campaign chat before adjusting progress.' };
      }
      const mission = projectionResult()?.projection?.mission;
      const objective = mission?.objectives?.find(item => item.id === options.objectiveId);
      if (!objective?.progressControl || mission?.missionId !== options.missionId || mission?.runId !== options.expectedRunId
        || objective?.progressControl?.expectedRevision !== options.expectedRevision) {
        return { ok: false, message: 'Progress changed while this control was open. Review the current Mission card and try again.' };
      }
      // Only this flight's cancellation may be recovered after committing the correction.
      const canceledFingerprint = activeAnalysisController && !activeAnalysisController.signal.aborted
        ? activeAnalysisFingerprint : null;
      if (canceledFingerprint) activeAnalysisController.abort(new Error('objective-progress-adjusted'));
      return enqueueSettlement(async () => {
        if (!state || !currentChatIsBound()) {
          return { ok: false, message: 'The campaign chat changed. Open the current mission and try again.' };
        }
        const previousProjection = projectionResult()?.projection || null;
        let result;
        try {
          result = await missionRuntime.adjustObjectiveProgress({ ...options, runtimeAssets });
        } catch (error) {
          host.logger?.warn?.('[Directive] Objective progress could not be committed.', error);
          return { ok: false, message: 'Progress could not be saved. Refresh the mission and try again.' };
        }
        if (result.ok !== true) return result;
        const nextProjection = projectionResult()?.projection || null;
        sendRuntimeUiMessage({
          type: 'directive.gameplayNotifications.retire.v1',
          payload: { missionId: options.missionId, objectiveIds: [options.objectiveId] }
        });
        const notifications = deriveGameplayNotifications({ previousProjection, nextProjection });
        if (notifications.length) sendRuntimeUiMessage({
          type: 'directive.gameplayNotifications.publish.v1', payload: { records: clone(notifications) }
        });
        // The state is already committed: a prompt refresh failure must not invite a duplicate mutation.
        try { await syncPrompt(); } catch (error) {
          host.logger?.warn?.('[Directive] Progress saved; prompt refresh will be retried.', error);
        }
        return { ...result, notifications: clone(notifications) };
      });
    },

    async buildV1PlayerProjection() {
      await ensureInitialized();
      return clone(projectionResult());
    },

    async reserveCommandBearingEdge() {
      await ensureInitialized();
      if (!state || !currentChatIsBound()) return { applied: false, reasonCode: 'inactive-or-unbound' };
      return enqueueSettlement(async () => {
        const createdAt = now();
        const spendId = typeof idFactory === 'function'
          ? idFactory('command-bearing-edge')
          : `command-bearing-edge.${state.stateCustody.revision + 1}.${stableHash(`${activeSave()?.id || ''}.${createdAt}`)}`;
        const result = reserveV1CommandBearingEdge(state.commandBearing, {
          spendId,
          reason: 'Create one credible favorable edge without erasing established costs.',
          now: createdAt
        });
        const committed = await commitCommandBearingChange(result, {
          proposalId: `v1-command-bearing.reserve.${spendId}`,
          source: 'commandBearingPlayerAction'
        });
        await syncPrompt();
        return { ...committed, spendId };
      });
    },

    async reserveCohesionRelief({ issueId } = {}) {
      await ensureInitialized();
      if (!state || !currentChatIsBound()) return { applied: false, reasonCode: 'inactive-or-unbound' };
      return enqueueSettlement(async () => {
        const task = projectionResult()?.projection?.ship?.cohesion?.visibleTasks?.find(({ id }) => id === issueId);
        if (!task) return { applied: false, reasonCode: 'cohesion-target-unavailable' };
        const createdAt = now();
        const spendId = typeof idFactory === 'function'
          ? idFactory('command-bearing-cohesion')
          : `command-bearing-cohesion.${state.stateCustody.revision + 1}.${stableHash(`${activeSave()?.id || ''}.${issueId}.${createdAt}`)}`;
        const result = reserveV1CohesionRelief(state.commandBearing, {
          spendId,
          targetIssueId: task.id,
          cohesion: Math.min(20, task.reward.cohesion),
          reason: `Commit command attention to resolving ${task.title}.`,
          now: createdAt
        });
        const committed = await commitCommandBearingChange(result, {
          proposalId: `v1-command-bearing.reserve-cohesion.${spendId}`,
          source: 'commandBearingPlayerAction'
        });
        await syncPrompt();
        return { ...committed, spendId, targetIssueId: task.id };
      });
    },

    async cancelCohesionRelief() {
      return publicApi.cancelCommandBearingEdge();
    },

    async cancelCommandBearingEdge() {
      await ensureInitialized();
      if (!state || !currentChatIsBound()) return { applied: false, reasonCode: 'inactive-or-unbound' };
      return enqueueSettlement(async () => {
        const pending = pendingV1CommandBearingEdge(state.commandBearing);
        if (!pending) return { applied: false, reasonCode: 'no-pending-edge' };
        const result = refundV1CommandBearingSpend(state.commandBearing, {
          spendId: pending.id,
          reason: 'The player cancelled the reserved edge before acceptance.',
          now
        });
        const committed = await commitCommandBearingChange(result, {
          proposalId: `v1-command-bearing.cancel.${pending.id}`,
          source: 'commandBearingPlayerAction'
        });
        await syncPrompt();
        return { ...committed, spendId: pending.id };
      });
    },

    async observeHostPlayerMessage(payload = {}, {
      progressScope = turnProgress.createScope(),
      generationType = 'normal',
      syncPromptAfter = true,
      transcriptOwner = null,
    } = {}) {
      if (!transcriptOwner && transcriptLane.current(transcriptKey())?.phase === 'preparing') {
        return { handled: true, deferred: true, reason: 'generation-preparation-pending' };
      }
      const recoveryGesture = activeHostGenerationGesture;
      const recoveryGestureId = recoveryGesture?.id ?? null;
      pauseDossiers();
      await ensureInitialized();
      const sourceChatId = compact(payload?.chatId || payload?.message?.chatId || host.chat.getCurrentChatId?.());
      return enqueueSettlement(async () => {
        assertTurnActive(progressScope);
        if (!state || !currentChatIsBound()) return { handled: false, reason: 'inactive-or-unbound' };
        if (sourceChatId && sourceChatId !== compact(state.campaignChatBinding?.chatId)) {
          return { handled: false, reason: 'source-chat-changed' };
        }
        let acceptedPairReplay = null;
        const recoveryBelongsToCurrentGesture = recoveryGestureId !== null
          && acceptedPairRecoveryGestureId === recoveryGestureId;
        const mayReconcileRecovery = recoveryGestureId === null
          || (recoveryGesture?.manualRecoveryEligible === true && !recoveryBelongsToCurrentGesture);
        if (acceptedPairRecovery.mode === 'reconcile-required' && !mayReconcileRecovery) {
          return {
            handled: false,
            reason: acceptedPairRecovery.reasonCode,
            responseStrategy: 'blockAndRetry',
            abortDefaultGeneration: true,
            settlementBlocked: true,
            campaignState: clone(state),
          };
        }
        if (acceptedPairRecovery.mode === 'reconcile-required') {
          acceptedPairReplay = await rebuildAcceptedStateFromChat({ progressScope });
          if (acceptedPairReplay.blocked === true) {
            return {
              handled: false,
              reason: 'accepted-pair-replay-pending',
              responseStrategy: 'blockAndRetry',
              abortDefaultGeneration: true,
              acceptedPairReplay,
              campaignState: clone(state),
            };
          }
        }
        if (acceptedPairRecovery.mode === 'pair-retry') {
          return {
            handled: false,
            reason: 'accepted-pair-retry-pending',
            responseStrategy: 'blockAndRetry',
            abortDefaultGeneration: true,
            settlementBlocked: true,
            campaignState: clone(state),
          };
        }
        const current = normalizeMessage(host, payload) || await host.chat.getLatestPlayerMessage?.();
        if (compact(current?.chatId) && compact(current.chatId) !== compact(state.campaignChatBinding?.chatId)) {
          return { handled: false, reason: 'source-chat-changed' };
        }
        if (!current || !isUserMessage(current) || !compact(current.text || current.mes || current.content)) {
          return { handled: false, reason: 'no-player-message' };
        }
        const recent = await host.chat.getRecentMessages?.({
          limit: V1_ACCEPTED_PAIR_SOURCE_WINDOW,
          playerSafeOnly: false,
        }) || [];
        if (!currentChatIsBound() || sourceChatId !== compact(state.campaignChatBinding?.chatId)) {
          return { handled: false, reason: 'source-chat-changed' };
        }
        const ingressId = payload.ingressId || messageId(payload, current);
        const prepared = await acceptedSnapshotForMessage(current, recent, ingressId);
        if (!prepared.ok) {
          if (syncPromptAfter) await syncPrompt({ progressScope });
          return { handled: false, reason: prepared.reason };
        }
        return {
        handled: true,
        responseStrategy: 'injectAndContinue',
        abortDefaultGeneration: false,
          ...(acceptedPairReplay ? { acceptedPairReplay } : {}),
          ...(await settleSnapshot(prepared.snapshot, ingressId, {
            progressScope, generationType, syncPromptAfter, recoveryGestureId,
          }))
        };
      }, { transcriptOwner });
    },

    async handleHostGenerationEnded(payload = {}, retryInput = null) {
      if (activeTimelineLoad) return { handled: false, reason: 'timeline-load-pending' };
      if (generationCancellation.stopped) return { handled: false, reason: 'host-generation-stopped' };
      if (!state || !currentChatIsBound()) return { handled: false, reason: 'inactive-or-unbound' };
      if (retryInput && failedFinalizations.get(transcriptKey()) !== retryInput) throw transcriptNotReady('unknown-finalization-retry');
      const key = transcriptKey();
      if (finalizationFlights.has(key)) return finalizationFlights.get(key);
      const previousOwner = transcriptLane.current(key);
      const explicitMessage = typeof payload === 'object' && payload !== null
        && (payload.message || payload.hostMessageId || payload.messageId || payload.id);
      const retained = failedFinalizations.get(key);
      if (!retryInput && previousOwner?.phase === 'failed' && retained && explicitMessage
        && messageId(payload, normalizeMessage(host, payload)) === messageId(retained.payload, normalizeMessage(host, retained.payload))) {
        retryInput = retained;
      }
      const activity = host.chat.getGenerationActivity?.();
      if (activity && activity.replyStatus !== 'idle' && Object.hasOwn(activity, 'replyStatus')) {
        return { handled: false, reason: 'native-reply-not-ended' };
      }
      if (!retryInput && previousOwner) {
        const output = changedAssistantOutput(previousOwner);
        if (!output) {
          if (!explicitMessage && releaseUnchangedTranscript(previousOwner)) { nativeNarrationActive = false; scheduleIdleDossiers(); }
          return { handled: false, reason: 'no-owned-assistant-output' };
        }
        const suppliedId = explicitMessage ? messageId(payload, normalizeMessage(host, payload)) : null;
        if (suppliedId && suppliedId !== messageId(output.payload.message, output.payload.message)) return { handled: false, reason: 'stale-generation-ended' };
        payload = output.payload;
      } else if (!retryInput && !explicitMessage) {
        return { handled: false, reason: 'unowned-generation-ended' };
      }
      if (!retryInput) {
        const observed = object(payload?.message) ? payload.message : normalizeMessage(host, payload);
        const current = host.chat.getMessage?.(messageId(payload, observed));
        const supplied = captureV1AssistantSourceVariant(observed);
        const actual = current && activeSourceRow(current) ? captureV1AssistantSourceVariant(current) : null;
        if (!supplied.ok || !actual?.ok || JSON.stringify(supplied.value) !== JSON.stringify(actual.value)) {
          return { handled: false, reason: 'stale-generation-ended' };
        }
      }
      // Retain the exact version and authored segment installed for this response
      // before any host reads await. Never reinterpret an earlier preparation.
      const capturedDutyReport = retryInput ? retryInput.capturedDutyReport : preparedNarrationDutyReport;
      const { owner } = transcriptLane.finalize(key);
      activeHostGenerationGesture = null;
      nativeNarrationActive = true;
      const progressScope = turnProgress.createScope();
      const completionTarget = retryInput?.completionTarget || captureDirectivePromptTarget();
      const assertFinalizationOwner = () => {
        assertTurnActive(progressScope);
        transcriptLane.assertOwner(owner, transcriptKey());
        if (currentDirectivePromptTargetStatus(completionTarget) !== 'current') throw transcriptNotReady('source-chat-changed');
      };
      const flight = (async () => {
      await ensureInitialized();
      return enqueueStateMutation(async () => {
      assertFinalizationOwner();
      if (retryInput?.expectedTranscript && transcriptObservation() !== retryInput.expectedTranscript) throw transcriptNotReady('stopped-output-changed');
      if (!state || !currentChatIsBound()) {
        return { handled: false, reason: 'inactive-or-unbound' };
      }
      // Host observations are already normalized. Wrapping their raw payload a
      // second time loses selected-swipe metadata in adapters that normalize once.
      let message = object(payload?.message) ? payload.message : normalizeMessage(host, payload);
      const directId = messageId(payload, message);
      if (directId && (!object(message) || !compact(message.text || message.mes || message.content))) {
        message = await host.chat.getMessage?.(directId);
      }
      let recent = [];
      if (!object(message) || isUserMessage(message) || message.isSystem === true || message.is_system === true) {
        return { handled: false, reason: 'assistant-message-unavailable' };
      }
      const hostMessageId = messageId(message, message);
      if (!hostMessageId || !activeSourceRow(message)) return { handled: false, reason: 'assistant-message-unavailable' };
      const beforeMutation = await host.chat.getMessage?.(hostMessageId);
      assertFinalizationOwner();
      const suppliedSource = captureV1AssistantSourceVariant(message);
      const actualSource = beforeMutation && activeSourceRow(beforeMutation) ? captureV1AssistantSourceVariant(beforeMutation) : null;
      if (!actualSource?.ok || (!retryInput && (!suppliedSource.ok
        || JSON.stringify(actualSource.value) !== JSON.stringify(suppliedSource.value)))) {
        throw transcriptNotReady('assistant-source-changed');
      }
      message = beforeMutation;
      const assertCurrentSource = expected => {
        assertFinalizationOwner();
        const current = host.chat.getMessage?.(hostMessageId);
        const observed = current && activeSourceRow(current) ? captureV1AssistantSourceVariant(current) : null;
        const source = captureV1AssistantSourceVariant(expected);
        if (!source.ok || !observed?.ok || JSON.stringify(source.value) !== JSON.stringify(observed.value)) throw transcriptNotReady('assistant-source-changed');
      };
      let timeFooterNormalization = null;
      await controller.verifySaveWritable?.();
      assertCurrentSource(message);
      if (hostMessageId && typeof host.chat.stripAssistantTimeFooter === 'function') {
        try {
          assertCurrentSource(message);
          const sanitized = await host.chat.stripAssistantTimeFooter({ hostMessageId });
          assertFinalizationOwner();
          if (sanitized?.ok !== true) {
            timeFooterNormalization = {
              attempted: true,
              stripped: false,
              reasonCode: compact(sanitized?.reason) || 'assistant-time-footer-normalization-unavailable',
            };
            host.logger?.warn?.('Directive assistant time footer normalization was unavailable.', sanitized);
          } else if (object(sanitized?.message)) {
            const prior = captureV1AssistantSourceVariant(message);
            const after = captureV1AssistantSourceVariant(sanitized.message);
            if (!prior.ok || !after.ok || after.value.timeFooter || prior.value.text !== after.value.text
              || prior.value.hostMessageId !== after.value.hostMessageId
              || prior.value.selectedSwipeIndex !== after.value.selectedSwipeIndex) throw new Error('Assistant footer readback differs.');
            assertCurrentSource(sanitized.message);
            message = sanitized.message;
          } else throw new Error('Assistant footer readback unavailable.');
        } catch (error) {
          if (error?.code === 'DIRECTIVE_TRANSCRIPT_NOT_READY' || error?.code === 'DIRECTIVE_GENERATION_ABORTED') throw error;
          timeFooterNormalization = {
            attempted: true,
            stripped: false,
            reasonCode: 'assistant-time-footer-normalization-failed',
          };
          host.logger?.warn?.('Directive assistant time footer normalization failed.', error);
        }
      }
      const responseText = compact(message?.text || message?.mes || message?.content);
      if (!hostMessageId || !responseText) {
        return {
          handled: false,
          reason: 'assistant-message-unavailable',
        };
      }
      const responseId = `host-response.${hostMessageId}`;
      const sourceTransactionId = `host-generation.${compact(state.campaignChatBinding?.chatId)}.${hostMessageId}`;
      if (recent.length === 0) {
        recent = await host.chat.getRecentMessages?.({
          limit: V1_ACCEPTED_PAIR_SOURCE_WINDOW,
          playerSafeOnly: false,
        }) || [];
      }
      const assistantIndex = recent.findIndex((item) => messageId(item, item) === hostMessageId);
      const completedSource = captureV1AssistantSourceVariant(message);
      const currentMessage = typeof host.chat.getMessage === 'function'
        ? await host.chat.getMessage(hostMessageId) : recent[assistantIndex];
      assertFinalizationOwner();
      if (generationCancellation.stopped || progressScope.epoch <= canceledThroughEpoch) {
        return { handled: false, reason: 'host-generation-stopped' };
      }
      if (currentDirectivePromptTargetStatus(completionTarget) !== 'current') {
        return { handled: false, reason: 'source-chat-changed' };
      }
      const currentSource = currentMessage && activeSourceRow(currentMessage)
        ? captureV1AssistantSourceVariant(currentMessage) : null;
      if (!completedSource.ok || !currentSource?.ok
        || JSON.stringify(completedSource.value) !== JSON.stringify(currentSource.value)) {
        return { handled: false, reason: 'assistant-source-changed' };
      }
      const promptingPlayer = recent.slice(0, assistantIndex < 0 ? recent.length : assistantIndex)
        .reverse()
        .find((item) => isUserMessage(item) && activeSourceRow(item));
      const runtimeMetadata = {
        responseId,
        promptingPlayerHostMessageId: messageId(promptingPlayer, promptingPlayer) || null,
      };
      const prepared = capturedDutyReport && (retryInput || capturedDutyReport === preparedNarrationDutyReport)
        && currentDirectivePromptTargetStatus(capturedDutyReport.target) === 'current'
        ? capturedDutyReport.preparation : null;
      let dutyReport = {
        attached: false,
        reasonCode: prepared?.reasonCode || prepared?.status || 'no-pending-report',
      };
      if (prepared?.ok && prepared.status === 'ready'
        && typeof host.chat.attachAssistantRuntimeMetadata === 'function') {
        const definition = capturedDutyReport.definition;
        if (definition) {
          let manifest = null;
          try {
            manifest = createDutyReportManifest({
              definition,
              packet: prepared.packet,
              branchId: prepared.manifestInput.branchId,
              responseId,
              sourceTransactionId,
              responseText,
              segment: prepared.segment,
              contractVersion: prepared.manifestInput.contractVersion ?? prepared.segment.contractVersion,
            });
          } catch {
            dutyReport = { attached: false, reasonCode: 'canonical-segment-not-delivered' };
          }
          if (manifest) {
            runtimeMetadata.dutyReportManifest = manifest;
            dutyReport = { attached: true, reportId: manifest.reportId, reasonCode: null };
          }
        } else {
          dutyReport = { attached: false, reasonCode: 'definition-unavailable' };
        }
      }
      let metadataAttachment = null;
      if (typeof host.chat.attachAssistantRuntimeMetadata === 'function') {
        try {
          await controller.verifySaveWritable?.();
          assertCurrentSource(message);
          const attached = await host.chat.attachAssistantRuntimeMetadata({ hostMessageId, runtimeMetadata });
          assertFinalizationOwner();
          if (attached?.ok !== true) throw new Error('Assistant runtime metadata attachment was not confirmed.');
          const verified = await host.chat.getMessage?.(hostMessageId);
          assertFinalizationOwner();
          const verifiedSource = captureV1AssistantSourceVariant(verified);
          if (!verifiedSource.ok || verifiedSource.value.hostMessageId !== completedSource.value.hostMessageId
            || verifiedSource.value.selectedResponseHash !== completedSource.value.selectedResponseHash
            || (completedSource.value.selectedSwipeIndex !== null
              && verifiedSource.value.selectedSwipeIndex !== completedSource.value.selectedSwipeIndex)) {
            throw new Error('Assistant selected source changed during metadata attachment.');
          }
          const raw = verified?.raw || verified;
          const selectedIndex = raw?.swipe_id ?? raw?.swipeId ?? raw?.swipeIndex;
          const stored = raw?.swipe_info?.[selectedIndex]?.extra?.runtimeMetadata || raw?.extra?.runtimeMetadata;
          if (!stored || Object.entries(runtimeMetadata).some(([field, value]) => JSON.stringify(stored[field]) !== JSON.stringify(value))) {
            throw new Error('Assistant runtime metadata readback differs.');
          }
        } catch (error) {
          if (error?.code === 'DIRECTIVE_TRANSCRIPT_NOT_READY' || error?.code === 'DIRECTIVE_GENERATION_ABORTED') throw error;
          metadataAttachment = {
            attached: false,
            reasonCode: 'assistant-runtime-metadata-attachment-failed',
          };
          if (dutyReport.attached) {
            dutyReport = {
              attached: false,
              reasonCode: 'assistant-runtime-metadata-attachment-failed',
            };
          }
          host.logger?.warn?.('Directive assistant runtime metadata attachment failed.', error);
        }
      }
      assertFinalizationOwner();
      const episodeReview = { ok: true, attempted: false, status: 'deferred-to-director', reasonCode: null };
      return {
        handled: dutyReport.attached || episodeReview.attempted === true,
        status: dutyReport.attached ? 'duty-report-custody-attached' : 'generation-ended-reviewed',
        hostMessageId,
        ...(dutyReport.reportId ? { reportId: dutyReport.reportId } : {}),
        dutyReport,
        ...(metadataAttachment ? { metadataAttachment } : {}),
        ...(timeFooterNormalization ? { timeFooterNormalization } : {}),
        episodeReview,
      };
      }, { transcriptOwner: owner });
      })();
      finalizationFlights.set(key, flight);
      try {
        const result = await flight;
        const success = Boolean(result?.hostMessageId && !result.timeFooterNormalization && !result.metadataAttachment);
        transcriptLane.finish(owner, success);
        if (success) failedFinalizations.delete(key);
        else failedFinalizations.set(key, { payload: clone(payload), capturedDutyReport, completionTarget, expectedTranscript: transcriptObservation() });
        return result;
      } catch (error) {
        transcriptLane.finish(owner, false);
        failedFinalizations.set(key, { payload: clone(payload), capturedDutyReport, completionTarget, expectedTranscript: transcriptObservation() });
        if (error?.code === 'DIRECTIVE_GENERATION_ABORTED') return { handled: false, reason: 'host-generation-stopped' };
        throw error;
      } finally {
        if (finalizationFlights.get(key) === flight) finalizationFlights.delete(key);
        if (transcriptKey() === key && !transcriptLane.current(key)) { nativeNarrationActive = false; scheduleIdleDossiers(); }
      }
    },

    async schedulePendingEpisodeReview(options = {}) {
      const progressScope = turnProgress.createScope();
      await ensureInitialized();
      return scheduleEpisodeReviewFlight({ ...options, automatic: true, progressScope });
    },

    async retryPendingEpisodeReview(options = {}) {
      const progressScope = turnProgress.createScope();
      await ensureInitialized();
      return scheduleEpisodeReviewFlight({ ...options, automatic: false, progressScope });
    },

    async retryPendingPeopleDossiers() {
      generationCancellation.resume();
      await ensureInitialized();
      const result = await enqueueSettlement(async () => {
        if (!state || !currentChatIsBound()) return {ok:false, reasonCode:'inactive-or-unbound'};
        await reconcileStagedDossiers();
        const activeJobIds = activeDossierJob && !activeDossierJob.terminal
          ? [activeDossierJob.job.id] : [];
        const prepared = prepareDossierRetries({ campaignState: state, activeJobIds });
        const candidateState = prepared.candidateState;
        const queued = prepared.queuedJobIds.length;
        const proposal = createTurnCommit({before:state, after:candidateState,
          turnKey:`dossier.retry.${state.campaignChatBinding.saveId}.${state.stateCustody.revision}`});
        if (proposal) await gateway.applyProposal(proposal);
        return {ok:true, queued};
      });
      scheduleIdleDossiers();
      return result;
    },

    async retryPendingAcceptedPairSettlement({
      progressScope = null,
      recoveryGestureId = null,
      dedupeRecoveryGesture = false,
      transcriptOwner = null,
    } = {}) {
      if (!progressScope) generationCancellation.resume();
      progressScope ||= turnProgress.createScope();
      assertTurnActive(progressScope);
      await ensureInitialized();
      return enqueueSettlement(async () => {
        assertTurnActive(progressScope);
        assertAcceptedPairRecovery(acceptedPairRecovery);
        if (dedupeRecoveryGesture
          && recoveryGestureId !== null
          && acceptedPairRecovery.mode === 'pair-retry'
          && acceptedPairRecoveryGestureId === recoveryGestureId) {
          return {
            ok: false,
            reasonCode: acceptedPairRecovery.reasonCode,
            settlementBlocked: true,
          };
        }
        if (acceptedPairRecovery.mode === 'none') {
          return { ok: false, reasonCode: 'no-pending-settlement', settlementBlocked: false };
        }
        if (!state || !currentChatIsBound()) {
          return { ok: false, reasonCode: 'inactive-or-unbound', settlementBlocked: true };
        }
        if (acceptedPairRecovery.mode === 'reconcile-required') {
          const acceptedPairReplay = await rebuildAcceptedStateFromChat({ progressScope });
          const settlementBlocked = acceptedPairReplay.blocked === true;
          return {
            ok: !settlementBlocked,
            reasonCode: settlementBlocked ? 'accepted-pair-replay-pending' : null,
            settlementBlocked,
            acceptedPairReplay
          };
        }
        const pending = clone(acceptedPairRecovery.pair);
        const current = await host.chat.getLatestPlayerMessage?.();
        const recent = await host.chat.getRecentMessages?.({
          limit: V1_ACCEPTED_PAIR_SOURCE_WINDOW,
          playerSafeOnly: false,
        }) || [];
        const prepared = current
          ? await acceptedSnapshotForMessage(current, recent, `retry.${messageId(current, current)}`)
          : null;
        assertTurnActive(progressScope);
        if (!prepared?.ok
          || compact(prepared.snapshot?.source?.sourceRangeHash) !== compact(pending.snapshot?.source?.sourceRangeHash)) {
          acceptedPairRecovery = reconcileRequiredRecovery('pending-source-stale');
          acceptedPairRecoveryGestureId = null;
          return { ok: false, reasonCode: 'pending-source-stale', settlementBlocked: false };
        }
        // A new explicit gesture grants one failed-role attempt for this source.
        acceptedPairCallBudget.release(pending.fingerprint, 'manual');
        const settled = await settleSnapshot(pending.snapshot, pending.ingressId, {
          generationType: pending.generationType || 'normal',
          attemptKind: 'manual',
          allowModelCall: true,
          recoveryGestureId,
          progressScope,
        });
        return {
          ...settled,
          ok: settled.mission?.ok === true,
          settlementBlocked: settled.settlementBlocked === true
        };
      }, { transcriptOwner });
    },

    handleHostMessageEdited: (payload = {}) => invalidateSource(payload, 'message-edited'),
    // Native deletes first and emits the removed numeric index. Preserve that
    // identity even though the host can no longer normalize the missing row.
    handleHostMessageDeleted: (payload = {}) => invalidateSource(
      Number.isSafeInteger(payload) && payload >= 0 ? {hostMessageId:String(payload)} : payload,
      'message-deleted'
    ),
    handleHostMessageSelectedSwipeChanged: (payload = {}) => invalidateSource(payload, 'selected-swipe-changed'),
    async handleHostMessageVisibilityChanged(payload = {}) {
      const explicit = typeof payload.visible === 'boolean'
        || typeof payload.hidden === 'boolean'
        || typeof payload.is_hidden === 'boolean';
      return explicit ? invalidateSource(payload, 'message-visibility-changed') : { handled: false, reason: 'not-a-visibility-change' };
    },

    async handleHostChatChanged(payload = {}) {
      // Revoke earlier chat work before waiting for any queue/host operation.
      for (const key of finalizationFlights.keys()) if (key !== transcriptKey()) transcriptLane.cancel(key);
      activeHostGenerationGesture = null;
      const dossierPauseId = pauseDossiers();
      activeAnalysisController?.abort();
      if (internalChatOpenDepth > 0) {
        deferredInternalChatChange = clone(payload || {});
        return {
          active: currentChatIsBound(),
          chatId: compact(host.chat.getCurrentChatId?.()),
          acceptedPairReplay: null,
          timelineFork: null,
          internalDirectiveOpen: true,
          deferred: true
        };
      }
      return releaseDossierPauseAfter(dossierPauseId, async () => {
      turnProgress.resetTurnProgress();
      const progressScope = turnProgress.createScope();
      await ensureInitialized();
      sendRuntimeUiMessage({
        type: 'directive.gameplayNotifications.reset.v1',
        payload: { reason: 'chat-changed' }
      });
      return enqueueStateMutation(async () => {
      const chatId = compact(host.chat.getCurrentChatId?.());
      const metadata = await host.chat.getBindingMetadata?.();
      let timelineFork = null;
      if (state?.campaign?.id) {
        try {
          timelineFork = await timelineTransactions?.recoverActiveOperation({ campaignId: state.campaign.id });
        } catch (error) {
          await host.prompt.clear?.({ reason: 'timeline-recovery-incomplete' });
          return {
            active: error?.code === BRANCH_DECISION_HISTORY_UNAVAILABLE && currentChatIsBound(),
            chatId: compact(host.chat.getCurrentChatId?.()),
            acceptedPairReplay: null,
            timelineFork: rejectedBranchResult(error) || {
              status: 'timeline-preparation-incomplete',
              reasonCode: error?.code || 'timeline-recovery-failed',
              message: error?.message || String(error)
            }
          };
        }
      }
      if (!timelineFork && !currentChatIsBound()) {
        const marker = await host.chat.getNativeBranchRefusal?.();
        if (nativeBranchRefusalMatches(marker, { parentBinding: state?.campaignChatBinding, childBinding: host.chat.getCurrentBinding?.() })) {
          await host.prompt.clear?.({ reason: BRANCH_DECISION_HISTORY_UNAVAILABLE });
          return { active: false, chatId, acceptedPairReplay: null,
            timelineFork: rejectedBranchResult({ code: BRANCH_DECISION_HISTORY_UNAVAILABLE, details: marker }) };
        }
      }
      if (!timelineFork && !currentChatIsBound() && state?.campaignChatBinding?.chatId
        && typeof host.chat.inspectNativeBranchCandidate === 'function') {
        const lineage = await host.chat.inspectNativeBranchCandidate({
          parentBinding: state.campaignChatBinding,
          branchIntent: payload?.nativeBranchIntent || null
        });
        if (lineage?.ok) {
          try {
            timelineFork = await timelineTransactions.adoptNativeBranch(lineage);
          } catch (error) {
            await host.prompt.clear?.({ reason: 'timeline-preparation-incomplete' });
            return {
              active: false,
              chatId,
              acceptedPairReplay: null,
              timelineFork: rejectedBranchResult(error, lineage.childBinding) || {
                status: 'timeline-preparation-incomplete',
                reasonCode: error?.code || 'timeline-activation-failed',
                message: error?.message || String(error)
              }
            };
          }
        }
      }
      let acceptedPairReplay = null;
      if (currentChatIsBound()) {
        rejectedNativeBranch = null;
        try {
          acceptedPairReplay = await timelineTransactions.runExclusive({
            campaignId: state.campaign.id,
            task: () => rebuildAcceptedStateFromChat({ progressScope })
          });
        } catch (error) {
          if (!timelineFork) throw error;
          acceptedPairRecovery = reconcileRequiredRecovery('post-fork-replay-failed');
          acceptedPairRecoveryGestureId = null;
          host.logger?.warn?.('[Directive] Post-fork accepted-pair replay failed after the new timeline was committed.', error);
          acceptedPairReplay = {
            replayed: 0,
            blocked: true,
            reasonCode: 'post-fork-replay-failed',
            message: error?.message || String(error)
          };
        }
      }
      else await syncPrompt({ progressScope });
      return { active: currentChatIsBound(), chatId, acceptedPairReplay, timelineFork };
      }, { campaignLease: false, transcriptRecovery: true });
      });
    },

    async handleHostGenerationStopped() {
      const stoppedOwner = transcriptLane.current(transcriptKey());
      // Start precedes the native user append. Capture that permitted single-row
      // change at Stop, then require exact stability before a fresh busy gesture.
      if (stoppedOwner) stoppedOwner.stoppedTranscript = unchangedTranscriptObservation(stoppedOwner);
      const protectedWrite = pendingProtectedTurns.get(transcriptKey());
      if (!protectedWrite?.turn.hasPublished && !protectedOpenings.get(transcriptKey())?.turn?.hasPublished) rememberStoppedOutput(stoppedOwner);
      if (protectedWrite && !protectedWrite.turn.hasPublished) {
        protectedWrite.turn.dispose(); pendingProtectedTurns.delete(transcriptKey());
      }
      transcriptLane.cancel(transcriptKey());
      preparedNarrationDutyReport = null;
      activeHostGenerationGesture = null;
      canceledThroughEpoch = turnProgress.createScope().epoch;
      generationCancellation.stop();
      openingLifecycle.cancel();
      pauseDossiers();
      nativeNarrationActive = false;
      turnProgress.resetTurnProgress();
      if (!activeAnalysisController || activeAnalysisController.signal.aborted) {
        return { ok: true, canceled: false, reason: 'no-directive-analysis-active' };
      }
      activeAnalysisController.abort(new Error('host-generation-stopped'));
      return { ok: true, canceled: true, reason: 'directive-analysis-aborted' };
    },

    clearDirectivePrompt: (options = {}) => {
      preparedNarrationDutyReport = null;
      return host.prompt.clear?.(options);
    },

    async startCreatorDraft(options = {}) {
      await ensureInitialized();
      const result = await controller.startCreatorDraft(options);
      activeDraftId = result.draft.id;
      creatorView = result.view;
      activeScreen = 'creator';
      return campaignViewEnvelope('campaign');
    },

    async resumeCreatorDraft({ draftId } = {}) {
      await ensureInitialized();
      const result = await controller.resumeCreatorDraft({ draftId });
      activeDraftId = result.draft.id;
      creatorView = result.view;
      activeScreen = 'creator';
      return campaignViewEnvelope('campaign');
    },

    async saveCreatorDraft({ patch, reason = 'manualSave' } = {}) {
      await ensureInitialized();
      const result = await controller.saveCreatorDraft({ draftId: activeDraftId, patch, reason });
      creatorView = result.view;
      return campaignViewEnvelope('campaign');
    },

    async generateCreatorSectionDraft({ sectionId, input = {}, useProvider = true, signal = null, onProgress = null } = {}) {
      generationCancellation.resume();
      signal = AbortSignal.any([generationCancellation.signal, signal].filter(Boolean));
      await ensureInitialized();
      const assistResult = await runCharacterCreatorSectionDraft({
        packageData: records.packageData,
        creatorView,
        sectionId,
        input,
        generationRouter,
        useProvider,
        signal,
        onProgress
      });
      return { assistResult: clone(assistResult), view: await campaignViewEnvelope('campaign') };
    },

    async importCreatorPortrait({ file, bytes, arrayBuffer, base64, mimeType, fileName, input = {}, activeStep = null } = {}) {
      await ensureInitialized();
      const upload = await createPlayerPortraitUpload({
        file, bytes, arrayBuffer, base64, mimeType, fileName,
        ownerKind: 'creatorDraft', ownerId: activeDraftId, now
      });
      const portrait = await storeV1PlayerPortrait(host.storage, upload, {
        ownerKind: 'creatorDraft', ownerId: activeDraftId, now
      });
      const previous = creatorView?.input?.identity?.portrait || null;
      let result;
      try {
        result = await controller.saveCreatorDraft({
          draftId: activeDraftId,
          patch: {
            activeStep: activeStep || creatorView.activeStep,
            input: { ...clone(input), identity: { ...(input.identity || {}), portrait } }
          },
          reason: 'portraitImport'
        });
      } catch (error) {
        await cleanupPlayerPortrait(portrait, 'portrait-import-rollback-failed');
        throw error;
      }
      creatorView = result.view;
      const previousCleanup = previous?.asset?.path && previous.asset.path !== portrait.asset.path
        ? await cleanupPlayerPortrait(previous, 'replaced-player-portrait-cleanup-failed')
        : { attempted: false, deleted: false, reason: 'no-replaced-player-portrait' };
      return { portrait: clone(portrait), previousCleanup, view: await campaignViewEnvelope('campaign') };
    },

    async removeCreatorPortrait({ input = {}, activeStep = null } = {}) {
      await ensureInitialized();
      const previous = creatorView?.input?.identity?.portrait || null;
      const result = await controller.saveCreatorDraft({
        draftId: activeDraftId,
        patch: {
          activeStep: activeStep || creatorView.activeStep,
          input: { ...clone(input), identity: { ...(input.identity || {}), portrait: null } }
        },
        reason: 'portraitRemove'
      });
      creatorView = result.view;
      const portraitCleanup = await cleanupPlayerPortrait(previous, 'removed-player-portrait-cleanup-failed');
      return { portrait: null, deleteResult: portraitCleanup, portraitCleanup, view: await campaignViewEnvelope('campaign') };
    },

    async importCampaignPlayerPortrait({ file, bytes, arrayBuffer, base64, mimeType, fileName } = {}) {
      await ensureInitialized();
      if (activeTimelineLoad) {
        const completion = await activeTimelineLoad.finished;
        if (completion.error) throw completion.error;
      }
      assertTranscriptWritable();
      await controller.verifySaveWritable?.();
      assertTranscriptWritable();
      if (!state) throw new Error('No active V1 campaign is available.');
      const upload = await createPlayerPortraitUpload({
        file, bytes, arrayBuffer, base64, mimeType, fileName,
        ownerKind: 'campaign', ownerId: state.campaign.id, now
      });
      await controller.verifySaveWritable?.();
      assertTranscriptWritable();
      const portrait = await storeV1PlayerPortrait(host.storage, upload, {
        ownerKind: 'campaign', ownerId: state.campaign.id, now
      });
      let mutation;
      try {
        mutation = await enqueueSettlement(async () => {
          const previous = clone(state.player.portrait || null);
          const committed = await gateway.applyProposal({
            id: `v1-player-portrait.import.${state.campaign.id}.${portrait.asset.updatedAt}`,
            baseRevision: gateway.revision(),
            domains: ['playerPortrait'],
            operations: [{ op: 'set', path: ['player', 'portrait'], value: portrait }],
            source: 'playerPortraitImport'
          });
          setState(committed.campaignState);
          return { previous };
        });
      } catch (error) {
        if (!isStatePublicationError(error)) await cleanupPlayerPortrait(portrait, 'player-portrait-import-rollback-failed');
        throw error;
      }
      const previous = mutation.previous;
      const previousCleanup = previous?.asset?.path && previous.asset.path !== portrait.asset.path
        ? await cleanupPlayerPortrait(previous, 'replaced-player-portrait-cleanup-failed')
        : { attempted: false, deleted: false, reason: 'no-replaced-player-portrait' };
      return { portrait: clone(portrait), previousCleanup, view: await campaignViewEnvelope('crew') };
    },

    async removeCampaignPlayerPortrait() {
      await ensureInitialized();
      if (!state) throw new Error('No active V1 campaign is available.');
      const { previous } = await enqueueSettlement(async () => {
        const prior = clone(state.player.portrait || null);
        const committed = await gateway.applyProposal({
          id: `v1-player-portrait.remove.${state.campaign.id}.${now()}`,
          baseRevision: gateway.revision(),
          domains: ['playerPortrait'],
          operations: [{ op: 'set', path: ['player', 'portrait'], value: null }],
          source: 'playerPortraitRemove'
        });
        setState(committed.campaignState);
        return { previous: prior };
      });
      const portraitCleanup = await cleanupPlayerPortrait(previous, 'removed-player-portrait-cleanup-failed');
      return { portrait: null, portraitCleanup, view: await campaignViewEnvelope('crew') };
    },

    async returnCreatorToCampaignLibrary({ patch = null } = {}) {
      if (patch && activeDraftId) await publicApi.saveCreatorDraft({ patch, reason: 'returnToLibrary' });
      activeScreen = 'campaign';
      creatorView = null;
      activeDraftId = null;
      return campaignViewEnvelope('campaign');
    },

    async discardCreatorDraft() {
      const portrait = clone(creatorView?.input?.identity?.portrait || null);
      const result = await controller.discardCreatorDraft({ draftId: activeDraftId });
      const portraitCleanup = await cleanupPlayerPortrait(portrait, 'discarded-draft-portrait-cleanup-failed');
      activeScreen = 'campaign';
      creatorView = null;
      activeDraftId = null;
      return {
        ...(await campaignViewEnvelope('campaign')),
        discardResult: clone(result),
        portraitCleanup
      };
    },

    async acceptCreatorDraftAndStartCampaign({ simulationMode = 'Command' } = {}) {
      generationCancellation.resume();
      const generationSignal = generationCancellation.signal;
      await ensureInitialized();
      const result = await controller.acceptCreatorDraftAndStartCampaign({ draftId: activeDraftId, simulationMode });
      setState(result.campaignState);
      configureStateRuntime();
      activeScreen = 'campaign';
      creatorView = null;
      activeDraftId = null;
      await createOrRestoreCampaignChat();
      await syncPrompt({ rebuild: true });
      const opening = await postOpeningIfEmpty(generationSignal);
      if (currentChatIsBound()) await syncPrompt({ rebuild: true });
      return { result: clone(result), opening: clone(opening), view: await campaignViewEnvelope('mission') };
    },

    async recoverSavePublication({ saveId = null } = {}) {
      await ensureInitialized();
      return enqueueStateMutation(async () => {
        const result = await controller.recoverSavePublication({ saveId });
        controller.assertSaveWritable?.(saveId || undefined);
        setState(controller.getActiveSave()?.state || null);
        configureStateRuntime();
        acceptedPairRecovery = noAcceptedPairRecovery();
        acceptedPairRecoveryGestureId = null;
        preparedNarrationDutyReport = null;
        return result;
      }, { campaignLease: false, publicationRecovery: true });
    },

    getSavePublicationStatus: (saveId) => controller?.getSavePublicationStatus?.(saveId) || null,

    async openCampaignChat({ saveId = null } = {}) {
      const generationSignal = generationCancellation.signal;
      await ensureInitialized();
      if (controller.getSavePublicationStatus?.(saveId || undefined)) {
        await publicApi.recoverSavePublication({ saveId });
      }
      await controller.verifySaveWritable?.(saveId || undefined);
      if (saveId && saveId !== activeSave()?.id) {
        setState(await controller.loadGame({ saveId }));
        configureStateRuntime();
      }
      const binding = await createOrRestoreCampaignChat();
      if (currentChatIsBound()) rejectedNativeBranch = null;
      await syncPrompt({ rebuild: true });
      const opening = await postOpeningIfEmpty(generationSignal);
      if (currentChatIsBound()) await syncPrompt({ rebuild: true });
      return { ok: opening.ok, opening, binding: clone(binding), view: await campaignViewEnvelope('mission') };
    },

    async deleteCampaign({ campaignId, saveId = null } = {}) {
      await ensureInitialized();
      return enqueueSettlement(async () => {
      if (typeof host.chat.deleteCampaignCharacter !== 'function') {
        const error = new Error('SillyTavern character deletion is unavailable.');
        error.code = 'DIRECTIVE_CAMPAIGN_CHARACTER_DELETE_UNAVAILABLE';
        throw error;
      }
      const deletion = await controller.deleteCampaignWithHost({
        campaignId,
        saveId,
        deleteHostEntity: (binding) => withInternalChatOpen(() => (
          host.chat.deleteCampaignCharacter(binding)
        )),
      });
      const { hostDeletion, ...result } = deletion;
      setState(null);
      configureStateRuntime();
      activeScreen = 'campaign';
      creatorView = null;
      activeDraftId = null;
      await restoreNarrationPreset();
      await host.prompt.clear?.({ reason: 'campaign-deleted' });
      return {
        result: clone(result),
        hostDeletion: clone(hostDeletion),
        view: await campaignViewEnvelope('campaign')
      };
      });
    },

    async saveGame({ name } = {}) {
      await ensureInitialized();
      return enqueueStateMutation(async () => {
        const transaction = await timelineTransactions.saveGame({ name: required(name, 'name') });
        return {
          checkpoint: clone(transaction.checkpoint),
          transaction: clone(transaction),
          view: await campaignViewEnvelope('campaign')
        };
      }, { campaignLease: false });
    },

    async renameSavedGame({ savedGameId, name } = {}) {
      await ensureInitialized();
      return enqueueSettlement(async () => {
        const savedGame = await controller.renameSavedGame({ savedGameId, name });
        return { savedGame: clone(savedGame), view: await campaignViewEnvelope('campaign') };
      });
    },

    async loadGame({ savedGameId = null, checkpointId = null } = {}) {
      await ensureInitialized();
      return enqueueStateMutation(async () => {
        const activity = host.chat.getGenerationActivity?.();
        if (finalizationFlights.size || (activity && activity.status !== 'idle')) throw transcriptNotReady('recovery-transcript-active');
        const reservation = { key: transcriptKey(), campaignId: state?.campaign?.id, baseline: transcriptObservation(), interrupted: false, committed: false };
        reservation.finished = new Promise(resolve => { reservation.finish = resolve; });
        let loadError = null;
        activeTimelineLoad = reservation;
        const assertExecution = ({ phase } = {}) => {
          if (phase === 'committed') reservation.committed = true;
          if (reservation.committed) return; // Complete the journaled switch; never invent rollback after publication.
          const currentActivity = host.chat.getGenerationActivity?.();
          if (activeTimelineLoad !== reservation || reservation.interrupted || transcriptKey() !== reservation.key
            || transcriptObservation() !== reservation.baseline || finalizationFlights.size
            || (currentActivity && currentActivity.status !== 'idle')) throw transcriptNotReady('timeline-load-source-changed');
        };
        try {
          const transaction = await timelineTransactions.loadGame({ savedGameId: required(savedGameId || checkpointId, 'savedGameId'), assertExecution });
          const timeline = await controller.loadSaveRecord({ saveId: transaction.childSaveId });
          if (currentChatIsBound()) rejectedNativeBranch = null;
          return { transaction: clone(transaction), timeline: clone(timeline), view: await campaignViewEnvelope('mission') };
        } catch (error) {
          loadError = error;
          if (error?.code === 'DIRECTIVE_TRANSCRIPT_NOT_READY') {
            try {
              const operation = await controller.loadTimelineOperation({ campaignId: reservation.campaignId });
              if (operation?.operationType === 'load-game' && operation.stage !== 'completed') {
                error.details = { ...error.details, timelineRecoveryRequired: true,
                  operationId: operation.operationId, stage: operation.stage };
                error.message = 'Loading the saved game was interrupted. Its recovery record has been preserved. Retry Load Game after generation stops.';
              }
            } catch { /* Preserve the original conflict if recovery diagnostics cannot be read. */ }
          }
          throw error;
        } finally {
          if (activeTimelineLoad === reservation) activeTimelineLoad = null;
          reservation.finish({ error: loadError });
        }
      }, { campaignLease: false, transcriptRecovery: true });
    },

    async loadCheckpoint({ checkpointId } = {}) {
      return publicApi.loadGame({ savedGameId: checkpointId });
    },

    async deleteSave(options = {}) {
      await ensureInitialized();
      return enqueueSettlement(async () => {
      const result = await controller.deleteSave(options);
      const binding = result.checkpointChatIsDistinct === true ? result.campaignChatBinding : null;
      let chatCleanup = { attempted: false, deleted: false, reason: 'no-checkpoint-chat' };
      if (binding?.chatId && typeof host.chat.deleteCampaignChat === 'function') {
        let canDelete = true;
        let reopenedActiveChat = false;
        if (compact(host.chat.getCurrentChatId?.()) === binding.chatId) {
          try {
            await openExactCampaignChat(state?.campaignChatBinding);
            reopenedActiveChat = true;
          } catch (error) {
            canDelete = false;
            chatCleanup = {
              attempted: true,
              deleted: false,
              reason: 'checkpoint-chat-still-active',
              errorCode: compact(error?.code) || null,
              message: compact(error?.message) || 'The active campaign chat could not be reopened.'
            };
          }
        }
        try {
          if (canDelete) {
            chatCleanup = {
              attempted: true,
              ...(await host.chat.deleteCampaignChat(binding))
            };
          }
        } catch (error) {
          chatCleanup = {
            attempted: true,
            deleted: false,
            reason: 'checkpoint-chat-delete-failed',
            errorCode: compact(error?.code) || null,
            message: compact(error?.message) || 'Checkpoint chat deletion failed.'
          };
        }
        if (reopenedActiveChat) {
          try {
            await syncPrompt({ rebuild: true });
          } catch (error) {
            host.logger?.warn?.('[Directive] Could not restore prompt state after checkpoint deletion.', error);
          }
        }
      }
      return { result, chatCleanup, view: await campaignViewEnvelope('campaign') };
      });
    },

    verifyActiveSave: () => controller.verifyStorage(),
    async exportSupportDiagnostics({ includeStoryTranscript = false } = {}) {
      const bundle = {
        kind: 'directive.supportBundle.v1',
        createdAt: now(),
        hostId: host.id,
        activeSaveId: activeSave()?.id || null,
        storage: await controller.verifyStorage(),
        providers: providerConfiguration(host),
        narrationSettings: narrationSettings(),
        openingNarrationSettings: currentChatIsBound() && host.chat.getOpeningRecord?.()?.narrationSettings
          ? normalizeNarrationSettings(host.chat.getOpeningRecord().narrationSettings) : null,
        routing: clone(GENERATION_ROUTING),
        runtime: {
          acceptedPairCallBudgetEntries: acceptedPairCallBudget.entryCount(),
        },
        stateEnvelope: state ? {
          campaignId: state.campaign.id,
          package: state.activeCampaignPackage,
          missionId: state.mission.activeMissionId,
          revision: state.stateCustody.revision
        } : null
      };
      if (includeStoryTranscript === true) {
        const transcript = await playerVisibleTranscript(host);
        if (transcript) bundle.storyTranscript = transcript;
      }
      return { fileName: `directive-support-${Date.now()}.json`, jsonText: JSON.stringify(bundle, null, 2) };
    },
    async updateProviderSettings({ kind, patch } = {}) {
      pauseDossiers();
      activeAnalysisController?.abort(new Error('provider-settings-changed'));
      const result = host.providers?.updateSettings
        ? host.providers.updateSettings(kind, patch)
        : host.providers?.settings?.update?.(kind, patch);
      return {
        settings: clone(result),
        status: clone(host.providers?.status?.(kind) || null)
      };
    },
    async testProvider({ kind } = {}) {
      const result = await host.providers?.test?.(kind);
      return {
        ...clone(result || {}),
        status: clone(host.providers?.status?.(kind) || null)
      };
    },

    refreshDirectivePresetStatus: async () => presetConfiguration(host),
    async updateNarrationSettings(patch = {}) {
      const next = normalizeNarrationSettings({ ...narrationSettings(), ...patch });
      fallbackNarrationSettings = host.narration?.updateSettings ? await host.narration.updateSettings(next) : next;
      if (state && currentChatIsBound()) await syncPrompt({ rebuild: true });
      return { narrationSettings: narrationSettings(), view: await campaignViewEnvelope('settings') };
    },

    async retryOpening() {
      generationCancellation.resume();
      const generationSignal = generationCancellation.signal;
      await ensureInitialized();
      if (!state || !currentChatIsBound()) return { ok: false, message: 'Open the campaign chat to generate its opening.' };
      await syncPrompt({ rebuild: true });
      const opening = await postOpeningIfEmpty(generationSignal);
      if (currentChatIsBound()) await syncPrompt({ rebuild: true });
      return { ...opening, view: await campaignViewEnvelope('mission') };
    },

    updateDirectivePresetAutoCheck: async ({ enabled } = {}) => host.presets?.setAutoCheckPreference?.({ enabled }),
    installDirectivePreset: async () => host.presets?.installBundledPreset?.(),
    getDirectivePresetStartupReminder: async () => host.presets?.getStartupCheck?.() || { shouldPrompt: false },
    dismissDirectivePresetStartupReminder: async ({ disable = false, bundledVersion = null } = {}) => (
      disable
        ? host.presets?.setAutoCheckPreference?.({ enabled: false })
        : host.presets?.dismissAutoCheckForVersion?.(bundledVersion)
    ),

    async resetRuntimeUiState() {
      turnProgress.resetTurnProgress();
      activeScreen = 'campaign';
      creatorView = null;
      activeDraftId = null;
      return { reset: true };
    }
  };

  return publicApi;
}
