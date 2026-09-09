import { normalizeNarrationSettings, createNarrationPolicy } from '../narration/narration-policy.mjs';
import { createScenePacingContext } from '../narration/scene-pacing.mjs';
import { createOpeningLifecycle } from '../narration/opening-lifecycle.mjs';
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
import { normalizeDirectiveProviderSettings, providerKindForRole } from '../providers/directive-provider-settings.mjs';
import {
  createV1PromptProjection,
  createV1WorkingStoryPromptProjection
} from '../projection/v1/prompt-projection.mjs';
import { createPeoplePromptProjection } from '../projection/v1/people-projection.mjs';
import { deriveGameplayNotifications } from '../projection/v1/gameplay-notifications.mjs';
import { createPlayerAuthorityPolicy } from './player-authority-policy.mjs';
import { normalizeV1HostMessageVisibility } from './v1-host-message-contracts.mjs';
import { createSimulationModePolicy } from '../simulation/simulation-mode-policy.mjs';
import { createMissionTransitionNarrationPacket } from '../mission/v1/mission-transition-narration.mjs';
import { createDutyReportManifest } from '../mission/v1/duty-report-delivery.mjs';
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
  prepareV1AcceptedPairSnapshot,
} from './v1-accepted-pair-source.mjs';
import {
  prepareV1AcceptedPairTimeAdvance,
  prepareV1AcceptedPairTimeInvalidationByHostMessages
} from './v1-accepted-pair-time.mjs';
import {
  buildV1RuntimePlayerProjection,
  createNarrationGenerationTargetKey,
  createV1MissionRuntime
} from './v1-mission-runtime.mjs';
import { assertV1CampaignState } from './v1-campaign-state.mjs';
import { createTimelineTransactionService } from './timeline-transaction-service.mjs';
import {
  acceptedPairFingerprint,
  assertAcceptedPairRecovery,
  createAcceptedPairCallBudget,
  noAcceptedPairRecovery,
  pairRetryRecovery,
  reconcileRequiredRecovery,
} from './accepted-pair-recovery-state.mjs';
import { createStoryDirector } from '../story/story-director.mjs';
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
  function getTimeoutMs(roleId, fallback, providerKind = null) {
    const source = host.providers?.getSettings?.() || host.providers?.settings?.getAll?.();
    if (!source) return fallback;
    return normalizeDirectiveProviderSettings(source)[providerKind || providerKindForRole(roleId)].timeoutSeconds * 1000;
  }
  return {
    getTimeoutMs,
    async generate(roleId, request, options = {}) {
      try {
        const response = await host.generation.generate(roleId, request, {
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
      characterReferencePolicy: 'Character references are out-of-world performance guidance. Borrow only their named qualities; the authored character voice and constraints govern dialogue ahead of generic prose flavor. Preserve each original character identity, profession, species, history, knowledge, and accepted relationships. Do not import reference-character events, powers, catchphrases, or plot outcomes, and do not mention the references in story prose. Supporting-character entries do not establish presence or authorize an introduction; use them only when the current scene independently calls for that person.',
      crew: (runtimeAssets?.crewDataset?.officers || []).map((officer) => ({
        id: officer.id,
        name: officer.name,
        billet: officer.billet,
        ...clone(officer.narrationGuide)
      })),
      supportingCharacters: (runtimeAssets?.crewDataset?.supportingCharacters || []).map((character) => ({
        id: character.id,
        name: character.name,
        ...clone(character.narrationGuide)
      })),
      ship: clone(runtimeAssets?.shipDataset?.profile || null)
    },
    opening: { ...openingPromptProjection({ state, runtimeAssets, acceptedPairLineage, openingRecord }),
      ...(acceptedPairLineage.length === 0 && openingRecord && openingRecord.campaignId === state.campaign?.id ? { openingDirection: clone(openingRecord.direction), openingInputs: clone(openingRecord.inputs) } : {}) },
    acceptedStory: story,
    workingStory: createV1WorkingStoryPromptProjection({ settlement: state.storySettlement }),
    pendingTransition: transitionPromptProjection(state, runtimeAssets),
    pendingDutyReport: director?.dutyReport || null,
    storyDirection: director?.storyInstruction || null,
  };
  const sceneDefinition = (runtimeAssets?.missionDefinitions || []).map(entry=>entry.definition || entry).find(entry=>entry.id === state?.mission?.v1?.definitionId);
  payload.scenePacing = sceneDefinition ? createScenePacingContext({definition:sceneDefinition,state:state.mission.v1,receipts:state.storySettlement?.acceptedPairReceipts || []}) : null;
  const text = [
    'DIRECTIVE V1 CAMPAIGN CONTEXT',
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
      ? 'DUTY REPORT: Deliver pendingDutyReport.segment.canonicalText verbatim exactly once in this response, naturally spoken or presented by the named reporter. Do not paraphrase the canonical segment, expose internal identifiers, or add facts beyond the player-safe segment.'
      : '',
    payload.shipMechanics
      ? 'SHIP OPERATIONAL MECHANICS: Apply shipMechanics only when the player or scene invokes the named system. Active capabilities permit the listed authored routes but never guarantee success. Active constraints block unsupported shortcuts. Use interactions as exact mission-specific affordances and honor every listed limit.'
      : '',
    simulationPolicy.narratorConstraint,
    'Keep named crew identities and roles exact. Let an appropriate officer offer fair, in-world guidance when the player lacks necessary knowledge.',
    payload.campaign.currentTime
      ? 'SHIP TIME: campaign.currentTime is the accepted current time at the start of this response. Directive displays accepted ship time in its interface. Use it only for chronology. Do not print a Stardate, ship-time header, footer, tracker, or timestamp.'
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
  idFactory = null
} = {}) {
  if (!host?.storage || !host?.chat || !host?.prompt) throw new Error('Directive V1 requires storage, chat, and prompt host adapters.');
  const turnProgress = createTurnProgressReporter();
  const generationRouter = createDirectiveGenerationRouter(host);
  let fallbackNarrationSettings = normalizeNarrationSettings();
  const narrationSettings = () => normalizeNarrationSettings(host.narration?.getSettings?.() || fallbackNarrationSettings);
  const openingLifecycle = createOpeningLifecycle({
    chat: host.chat,
    getBinding: () => state?.campaignChatBinding || {},
    isCurrent: binding => currentChatIsBound() && ['campaignId', 'saveId', 'chatId'].every(key => binding[key] === state?.campaignChatBinding?.[key]),
    generateDirector: request => host.generation.generate('openingSceneDirector', request, { allowVisibleOutputRetry: false }),
    generateNarration: request => {
      if (!host.generation.generateNarration) throw new Error('The host does not support opening narration.');
      return host.generation.generateNarration(request);
    },
    getProseGuidance: () => host.presets?.getProseGuidance?.() || ''
  });
  let initialized = false;
  let initializing = false;
  let records = null;
  let runtimeAssets = null;
  let controller = null;
  let state = null;
  let gateway = null;
  let missionRuntime = null;
  let timelineTransactions = null;
  let creatorView = null;
  let activeDraftId = null;
  let activeScreen = 'campaign';
  let storageDiagnostics = null;
  let settlementQueue = Promise.resolve();
  let acceptedPairRecovery = noAcceptedPairRecovery();
  const acceptedPairCallBudget = createAcceptedPairCallBudget();
  let activeAnalysisController = null;
  let activeAnalysisFingerprint = null;
  let nativeNarrationActive = false;
  let dossierDrain = null;
  let activeDossierJob = null;
  const stagedDossiers = new Map();
  const dossierQueue = createPeopleDossierQueue({
    author: createPeopleDossierAuthor({ generationRouter }),
    stageResult: ({ job, outcome }) => {
      if (activeDossierJob?.job.id === job.id) {
        stagedDossiers.set(job.id, { job, outcome, binding: activeDossierJob.binding });
      }
    },
  });

  function pauseDossiers() {
    nativeNarrationActive = true;
    if (activeDossierJob && !stagedDossiers.has(activeDossierJob.job.id)) {
      stagedDossiers.set(activeDossierJob.job.id, {
        ...activeDossierJob, outcome: { ok: false, reasonCode: 'dossier-canceled' },
      });
    }
    dossierQueue.clear();
  }

  function dossierIdle() {
    return host.generation?.supportsIndependentBackgroundRequests === true
      && !nativeNarrationActive && !activeAnalysisController && state && currentChatIsBound();
  }

  function sameDossierBinding(binding) {
    return ['campaignId', 'saveId', 'chatId'].every(key => binding?.[key] === state?.campaignChatBinding?.[key]);
  }

  function scheduleIdleDossiers() {
    if (dossierDrain || !dossierIdle()) return;
    dossierDrain = (async () => {
      while (dossierIdle()) {
        let nextJob = null;
        await enqueueSettlement(async () => {
          if (!dossierIdle()) return;
          for (const [id, staged] of stagedDossiers) {
            if (!sameDossierBinding(staged.binding)) { stagedDossiers.delete(id); continue; }
            const prepared = prepareDossierEnrichment({ campaignState: state, job: staged.job, outcome: staged.outcome });
            const proposal = createTurnCommit({ before: state, after: prepared.candidateState,
              turnKey: `dossier.merge.${id}.${state.stateCustody.revision}` });
            if (proposal) await gateway.applyProposal(proposal);
            stagedDossiers.delete(id);
          }
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
    })().catch(error => host.logger?.warn?.('[Directive] Optional biography enrichment was deferred.', error))
      .finally(() => { dossierDrain = null; });
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
      persist: async (next, _descriptor, { progressScope = null } = {}) => {
        await turnProgress.run('saving', () => (
          controller.persistActiveCampaign({ campaignState: next })
        ), { scope: progressScope });
      }
    });
    missionRuntime = createV1MissionRuntime({
      getState: () => state,
      stateDeltaGateway: gateway,
      generationRouter,
      directStory: createStoryDirector({ generationRouter }),
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

  function sendGameplayNotificationMessage(message) {
    try {
      const result = host.ui?.send?.(message);
      Promise.resolve(result).catch((error) => {
        host.logger?.warn?.('[Directive] Gameplay notification UI message failed.', error);
      });
      return true;
    } catch (error) {
      host.logger?.warn?.('[Directive] Gameplay notification UI message failed.', error);
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
    if (!state || !currentChatIsBound()) {
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
    if (typeof host.presets?.activateNarrationPreset === 'function') {
      await turnProgress.run('activating-preset', () => activateNarrationPreset(), { scope: progressScope });
    }
    if (!state || !currentChatIsBound()) {
      await restoreNarrationPreset();
      await host.prompt.clear?.({ reason: 'chat-changed-during-preset-activation' });
      return { ok: true, active: false };
    }
    const promptTarget = captureDirectivePromptTarget();
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
        return { projection: result.projection, acceptedPairLineage, director };
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
      await host.chat.updateBindingMetadata?.(exactBinding);
      return exactBinding;
    } catch (error) {
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
        host.logger?.warn?.('[Directive] Could not restore the unbound campaign after chat binding failed.', rollbackError);
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

  async function postOpeningIfEmpty() {
    return openingLifecycle.generate({
      premise: records.packageData.campaign.openingPremise,
      player: clone(state.player),
      settings: narrationSettings()
    });
  }

  function enqueueStateMutation(task, { campaignLease = true } = {}) {
    const execute = () => {
      const campaignId = compact(state?.campaign?.id);
      if (campaignLease && timelineTransactions && campaignId) {
        return timelineTransactions.runExclusive({ campaignId, task });
      }
      return task();
    };
    const next = settlementQueue.then(execute, execute);
    settlementQueue = next.catch(() => null);
    return next;
  }

  function enqueueSettlement(task) {
    return enqueueStateMutation(task);
  }

  async function settleSnapshot(snapshot, ingressId = null, {
    generationType = 'normal',
    syncPromptAfter = true,
    publishNotifications = true,
    attemptKind = 'automatic',
    allowModelCall = true,
    updateRecovery = true,
    progressScope = turnProgress.createScope(),
  } = {}) {
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
          signal: analysisController?.signal || null,
          allowModelCall: budgetReserved === true,
          progressScope,
        });
      } while (mission?.ok === false
        && mission.reasonCode === 'persistence-failed'
        && persistenceAttempts < 3
        && analysisController?.signal?.aborted !== true);
    } finally {
      if (activeAnalysisController === analysisController) {
        activeAnalysisController = null;
        activeAnalysisFingerprint = null;
        if (!nativeNarrationActive) scheduleIdleDossiers();
      }
    }
    if (mission?.ok === true) {
      acceptedPairCallBudget.clear(fingerprint);
    } else if (budgetReserved && mission?.attempted !== true) {
      acceptedPairCallBudget.release(fingerprint, budgetAttemptKind);
    }
    const time = mission?.time || null;
    const settlementBlocked = mission?.ok === false;
    if (updateRecovery && settlementBlocked) {
      acceptedPairRecovery = pairRetryRecovery({
        snapshot,
        ingressId,
        reasonCode: mission.reasonCode,
        persistenceAttempts,
        blockedRoles: mission.blockedRoles || mission.diagnostics?.blockedRoles || [],
        turnKey: mission.turnKey || mission.diagnostics?.turnKey || null,
        generationType,
      });
    } else if (updateRecovery && mission?.ok === true
      && (acceptedPairRecovery.mode !== 'pair-retry'
        || acceptedPairRecovery.pair?.fingerprint === fingerprint)) {
      acceptedPairRecovery = noAcceptedPairRecovery();
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
          sendGameplayNotificationMessage({
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
    const findAcceptingPlayer = (messages) => {
      let index = messages.findIndex(item => messageId(item, item) === messageId(currentPlayerMessage, currentPlayerMessage));
      let player = currentPlayerMessage;
      for (index -= 1; index >= 0; index -= 1) {
        const item = messages[index];
        if (item.isSystem || item.role === 'system') continue;
        if (!isUserMessage(item)) return {
          player,
          reachedStart: !messages.slice(0, index).some(row => !row.isSystem && row.role !== 'system'),
        };
        player = item;
      }
      return { player, reachedStart: true };
    };
    let resolved = findAcceptingPlayer(recentMessages);
    if (resolved.reachedStart && recentMessages.length >= V1_ACCEPTED_PAIR_SOURCE_WINDOW) {
      recentMessages = await host.chat.getRecentMessages?.({ limit: Number.MAX_SAFE_INTEGER, playerSafeOnly: false }) || recentMessages;
      resolved = findAcceptingPlayer(recentMessages);
    }
    return prepareV1AcceptedPairSnapshot({
      campaignState: state,
      currentPlayerMessage: resolved.player,
      recentMessages,
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
    if (currentChatIsBound() && (!sourceChatId || sourceChatId === compact(state?.campaignChatBinding?.chatId))) {
      activeAnalysisController?.abort();
    }
    return enqueueSettlement(async () => {
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
      const { mission, time, commandBearing } = await invalidateSourceAuthority(id, eventType, progressScope);
      await syncPrompt({ rebuild: true, progressScope });
      const replay = {
        replayed: 0,
        blocked: false,
        deferred: true,
        reasonCode: acceptedPairRecovery.reasonCode,
      };
      return { handled: true, mission, time, commandBearing, replay };
    });
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

  const orchestrator = {
    async interceptGeneration({ type = 'normal' } = {}) {
      pauseDossiers();
      const generationType = compact(type) || 'normal';
      let generationTargetKey = null;
      const progressScope = turnProgress.createScope();
      await ensureInitialized();
      await settlementQueue;
      if (!state || !currentChatIsBound()) {
        await host.prompt.clear?.({ reason: 'generation-interceptor-inactive-or-unbound' });
        return { handled: false, reason: 'inactive-or-unbound' };
      }
      assertAcceptedPairRecovery(acceptedPairRecovery);
      if (acceptedPairRecovery.mode === 'pair-retry') {
        // A fresh Generate gesture retries the failed analysis, just like the dialog.
        await publicApi.retryPendingAcceptedPairSettlement();
      }
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
      let acceptedPairReplay = null;
      if (acceptedPairRecovery.mode === 'reconcile-required') {
        acceptedPairReplay = await enqueueSettlement(() => rebuildAcceptedStateFromChat({ progressScope }));
      } else if (latestPlayerMessage) {
        await publicApi.observeHostPlayerMessage({
          message: latestPlayerMessage,
          source: 'v1-generation-boundary'
        }, { progressScope, generationType, syncPromptAfter:false });
        await settlementQueue;
      }
      if (latestPlayerMessage) await enqueueSettlement(() => armPendingCommandBearingEdge(latestPlayerMessage));
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
          }));
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
      return {
        handled: true,
        abortDefaultGeneration: false,
        responseStrategy: 'injectAndContinue',
        acceptedPairReplay
      };
    }
  };

  const publicApi = {
    subscribeTurnProgress: (listener) => turnProgress.subscribeTurnProgress(listener),
    resetTurnProgress: () => turnProgress.resetTurnProgress(),
    isCurrentChatBound: () => currentChatIsBound(),
    async initialize() {
      if (initialized) return campaignViewEnvelope('campaign');
      if (initializing) {
        const error = new Error('Directive runtime initialization is already in progress.');
        error.code = 'DIRECTIVE_RUNTIME_INITIALIZATION_IN_PROGRESS';
        throw error;
      }
      initializing = true;
      try {
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
        storageDiagnostics = await controller.verifyStorage();
        return campaignViewEnvelope('campaign');
      } finally {
        initializing = false;
        if (initialized) scheduleDeferredInternalChatChange();
      }
    },

    getChatTurnOrchestrator: () => orchestrator,

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
        sendGameplayNotificationMessage({
          type: 'directive.gameplayNotifications.retire.v1',
          payload: { missionId: options.missionId, objectiveIds: [options.objectiveId] }
        });
        const notifications = deriveGameplayNotifications({ previousProjection, nextProjection });
        if (notifications.length) sendGameplayNotificationMessage({
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
    } = {}) {
      pauseDossiers();
      await ensureInitialized();
      const sourceChatId = compact(payload?.chatId || payload?.message?.chatId || host.chat.getCurrentChatId?.());
      return enqueueSettlement(async () => {
        if (!state || !currentChatIsBound()) return { handled: false, reason: 'inactive-or-unbound' };
        if (sourceChatId && sourceChatId !== compact(state.campaignChatBinding?.chatId)) {
          return { handled: false, reason: 'source-chat-changed' };
        }
        let acceptedPairReplay = null;
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
          ...(await settleSnapshot(prepared.snapshot, ingressId, { progressScope, generationType, syncPromptAfter }))
        };
      });
    },

    async handleHostGenerationEnded(payload = {}) {
      nativeNarrationActive = false;
      const progressScope = turnProgress.createScope();
      await ensureInitialized();
      if (!state || !currentChatIsBound()) {
        return { handled: false, reason: 'inactive-or-unbound' };
      }
      let message = normalizeMessage(host, payload);
      const directId = messageId(payload, message);
      if (directId && (!object(message) || !compact(message.text || message.mes || message.content))) {
        message = await host.chat.getMessage?.(directId);
      }
      let recent = [];
      if (!object(message) || isUserMessage(message) || message.isSystem === true || message.is_system === true) {
        recent = await host.chat.getRecentMessages?.({ limit: 20, playerSafeOnly: false }) || [];
        message = [...recent].reverse().find((item) => (
          object(item)
          && !isUserMessage(item)
          && item.isSystem !== true
          && item.is_system !== true
          && activeSourceRow(item)
          && compact(item.text || item.mes || item.content)
        )) || null;
      }
      const hostMessageId = messageId(message, message);
      let timeFooterNormalization = null;
      if (hostMessageId && typeof host.chat.stripAssistantTimeFooter === 'function') {
        try {
          const sanitized = await host.chat.stripAssistantTimeFooter({ hostMessageId });
          if (sanitized?.ok === false) {
            timeFooterNormalization = {
              attempted: true,
              stripped: false,
              reasonCode: compact(sanitized.reason) || 'assistant-time-footer-normalization-unavailable',
            };
            host.logger?.warn?.('Directive assistant time footer normalization was unavailable.', sanitized);
          } else if (object(sanitized?.message)) {
            message = sanitized.message;
          }
        } catch (error) {
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
        const episodeReview = await scheduleEpisodeReviewFlight({ automatic: true, progressScope });
        scheduleIdleDossiers();
        return {
          handled: episodeReview.attempted === true,
          reason: 'assistant-message-unavailable',
          episodeReview,
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
      const promptingPlayer = recent.slice(0, assistantIndex < 0 ? recent.length : assistantIndex)
        .reverse()
        .find((item) => isUserMessage(item) && activeSourceRow(item));
      const runtimeMetadata = {
        responseId,
        promptingPlayerHostMessageId: messageId(promptingPlayer, promptingPlayer) || null,
      };
      const prepared = missionRuntime.preparePendingDutyReport({
        runtimeAssets,
        availableActors: availableDirectorActors(runtimeAssets),
        responseId,
        sourceTransactionId
      });
      let dutyReport = {
        attached: false,
        reasonCode: prepared?.reasonCode || prepared?.status || 'no-pending-report',
      };
      if (prepared?.ok && prepared.status === 'ready'
        && typeof host.chat.attachAssistantRuntimeMetadata === 'function') {
        const definition = (runtimeAssets?.missionDefinitions || [])
          .map((entry) => entry?.definition || entry)
          .find((entry) => entry?.id === prepared.definitionId);
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
          await host.chat.attachAssistantRuntimeMetadata({ hostMessageId, runtimeMetadata });
        } catch (error) {
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
      const episodeReview = await scheduleEpisodeReviewFlight({ automatic: true, progressScope });
      scheduleIdleDossiers();
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
      await ensureInitialized();
      const result = await enqueueSettlement(async () => {
        if (!state || !currentChatIsBound()) return {ok:false, reasonCode:'inactive-or-unbound'};
        const activeJobIds = [
          ...(activeDossierJob?.job?.id ? [activeDossierJob.job.id] : []),
          ...stagedDossiers.keys(),
        ];
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

    async retryPendingAcceptedPairSettlement() {
      const progressScope = turnProgress.createScope();
      await ensureInitialized();
      return enqueueSettlement(async () => {
        assertAcceptedPairRecovery(acceptedPairRecovery);
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
        if (!prepared?.ok
          || compact(prepared.snapshot?.source?.sourceRangeHash) !== compact(pending.snapshot?.source?.sourceRangeHash)) {
          acceptedPairRecovery = reconcileRequiredRecovery('pending-source-stale');
          return { ok: false, reasonCode: 'pending-source-stale', settlementBlocked: false };
        }
        // A new explicit gesture grants one failed-role attempt for this source.
        acceptedPairCallBudget.release(pending.fingerprint, 'manual');
        const settled = await settleSnapshot(pending.snapshot, pending.ingressId, {
          generationType: pending.generationType || 'normal',
          attemptKind: 'manual',
          allowModelCall: true,
          progressScope,
        });
        return {
          ...settled,
          ok: settled.mission?.ok === true,
          settlementBlocked: settled.settlementBlocked === true
        };
      });
    },

    handleHostMessageEdited: (payload = {}) => invalidateSource(payload, 'message-edited'),
    handleHostMessageDeleted: (payload = {}) => invalidateSource(payload, 'message-deleted'),
    handleHostMessageSelectedSwipeChanged: (payload = {}) => invalidateSource(payload, 'selected-swipe-changed'),
    async handleHostMessageVisibilityChanged(payload = {}) {
      const explicit = typeof payload.visible === 'boolean'
        || typeof payload.hidden === 'boolean'
        || typeof payload.is_hidden === 'boolean';
      return explicit ? invalidateSource(payload, 'message-visibility-changed') : { handled: false, reason: 'not-a-visibility-change' };
    },

    async handleHostChatChanged(payload = {}) {
      pauseDossiers();
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
      turnProgress.resetTurnProgress();
      const progressScope = turnProgress.createScope();
      await ensureInitialized();
      sendGameplayNotificationMessage({
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
            active: false,
            chatId,
            acceptedPairReplay: null,
            timelineFork: {
              status: 'timeline-preparation-incomplete',
              reasonCode: error?.code || 'timeline-recovery-failed',
              message: error?.message || String(error)
            }
          };
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
              timelineFork: {
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
        try {
          acceptedPairReplay = await timelineTransactions.runExclusive({
            campaignId: state.campaign.id,
            task: () => rebuildAcceptedStateFromChat({ progressScope })
          });
        } catch (error) {
          if (!timelineFork) throw error;
          acceptedPairRecovery = reconcileRequiredRecovery('post-fork-replay-failed');
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
      }, { campaignLease: false });
    },

    async handleHostGenerationStopped() {
      pauseDossiers();
      nativeNarrationActive = false;
      turnProgress.resetTurnProgress();
      if (!activeAnalysisController || activeAnalysisController.signal.aborted) {
        scheduleIdleDossiers();
        return { ok: true, canceled: false, reason: 'no-directive-analysis-active' };
      }
      activeAnalysisController.abort(new Error('host-generation-stopped'));
      return { ok: true, canceled: true, reason: 'directive-analysis-aborted' };
    },

    clearDirectivePrompt: (options = {}) => host.prompt.clear?.(options),

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
      if (!state) throw new Error('No active V1 campaign is available.');
      const upload = await createPlayerPortraitUpload({
        file, bytes, arrayBuffer, base64, mimeType, fileName,
        ownerKind: 'campaign', ownerId: state.campaign.id, now
      });
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
        await cleanupPlayerPortrait(portrait, 'player-portrait-import-rollback-failed');
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
      await ensureInitialized();
      const result = await controller.acceptCreatorDraftAndStartCampaign({ draftId: activeDraftId, simulationMode });
      setState(result.campaignState);
      configureStateRuntime();
      activeScreen = 'campaign';
      creatorView = null;
      activeDraftId = null;
      await createOrRestoreCampaignChat();
      await syncPrompt({ rebuild: true });
      const opening = await postOpeningIfEmpty();
      if (currentChatIsBound()) await syncPrompt({ rebuild: true });
      return { result: clone(result), opening: clone(opening), view: await campaignViewEnvelope('mission') };
    },

    async openCampaignChat({ saveId = null } = {}) {
      await ensureInitialized();
      if (saveId && saveId !== activeSave()?.id) {
        setState(await controller.loadGame({ saveId }));
        configureStateRuntime();
      }
      const binding = await createOrRestoreCampaignChat();
      await syncPrompt({ rebuild: true });
      const opening = await postOpeningIfEmpty();
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
        const transaction = await timelineTransactions.loadGame({ savedGameId: required(savedGameId || checkpointId, 'savedGameId') });
        const timeline = await controller.loadSaveRecord({ saveId: transaction.childSaveId });
        return { transaction: clone(transaction), timeline: clone(timeline), view: await campaignViewEnvelope('mission') };
      }, { campaignLease: false });
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
      await ensureInitialized();
      if (!state || !currentChatIsBound()) return { ok: false, message: 'Open the campaign chat to generate its opening.' };
      await syncPrompt({ rebuild: true });
      const opening = await postOpeningIfEmpty();
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
