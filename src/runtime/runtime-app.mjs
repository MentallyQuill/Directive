import { runCharacterCreatorSectionDraft } from '../creators/character-creator-assist.mjs';
import {
  armV1CommandBearingEdge,
  commitV1CommandBearingEdge,
  pendingV1CommandBearingEdge,
  refundV1CommandBearingSpend,
  reserveV1CommandBearingEdge
} from '../command/v1-command-bearing.mjs';
import { createPlayerPortraitUpload } from '../media/player-portrait-assets.mjs';
import { createGenerationRoleRegistry } from '../generation/generation-roles.mjs';
import { normalizeDirectiveProviderSettings } from '../providers/directive-provider-settings.mjs';
import { createV1PromptProjection } from '../projection/v1/prompt-projection.mjs';
import { normalizeV1HostMessageVisibility } from './v1-host-message-contracts.mjs';
import { createSimulationModePolicy } from '../simulation/simulation-mode-policy.mjs';
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
import { prepareV1AcceptedPairSnapshot } from './v1-accepted-pair-source.mjs';
import {
  commitV1AcceptedPairTimeAdvance,
  invalidateV1AcceptedPairTimeByHostMessage
} from './v1-accepted-pair-time.mjs';
import {
  buildV1RuntimePlayerProjection,
  createV1MissionRuntime
} from './v1-mission-runtime.mjs';
import { assertV1CampaignState } from './v1-campaign-state.mjs';
import { createTimelineTransactionService } from './timeline-transaction-service.mjs';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact(value) {
  return String(value ?? '').trim();
}

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
  return visibility.sourceRowExists !== false
    && visibility.hiddenByHost !== true
    && visibility.sourceMutation !== true;
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

function timeHeader(state) {
  const stardate = Number(state?.timeLedger?.stardate ?? state?.campaign?.currentStardate);
  const minute = Number(state?.timeLedger?.shipClock?.minuteOfDay);
  if (!Number.isFinite(stardate) || !Number.isFinite(minute)) return '';
  const normalized = ((Math.round(minute) % 1440) + 1440) % 1440;
  const clock = `${String(Math.floor(normalized / 60)).padStart(2, '0')}${String(normalized % 60).padStart(2, '0')} hours`;
  return `*Stardate ${stardate.toFixed(1).padStart(7, '0')} | ${clock}*`;
}

export function createDirectiveGenerationRouter(host) {
  return {
    async generate(roleId, request, options = {}) {
      try {
        const response = await host.generation.generate(roleId, request, options);
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

function openingPromptProjection({ state, runtimeAssets, acceptedPairLineage = [] }) {
  const campaign = runtimeAssets?.packageData?.campaign;
  const openingContext = campaign?.openingContext;
  if (!openingContext) {
    throw new Error('Directive V1 runtime assets require campaign.openingContext.');
  }
  const acceptedPairCount = acceptedPairLineage.length;
  const unanswered = acceptedPairCount === 0;
  if (unanswered) {
    return {
      phase: 'unanswered',
      canonicalOpeningMessage: campaign.openingMessage,
      continuitySummary: openingContext.continuitySummary,
      firstPlayableScene: openingContext.firstPlayableScene,
      firstSceneGuidance: clone(openingContext.firstSceneGuidance)
    };
  }
  const openingMissionId = runtimeAssets.packageData.manifest.openingMissionId;
  const inOpeningMission = state.mission?.activeMissionId === openingMissionId;
  const handoverTerminal = state.mission?.v1?.objectives?.['objective.prelude.command-handover']?.state === 'terminal';
  if (inOpeningMission && !handoverTerminal) {
    return {
      phase: 'firstMeeting',
      stage: acceptedPairCount === 1 ? 'introductionPending' : 'conversationAnswered',
      continuitySummary: openingContext.continuitySummary,
      firstPlayableScene: openingContext.firstPlayableScene,
      firstSceneGuidance: clone(openingContext.firstSceneGuidance)
    };
  }
  return {
    phase: 'continuity',
    continuitySummary: openingContext.continuitySummary
  };
}

export function createV1RuntimePromptPacket({
  state,
  projection,
  runtimeAssets,
  acceptedPairLineage = []
}) {
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
      timeHeader: timeHeader(state),
      simulationMode: simulationPolicy.simulationMode,
      consequencePolicy: simulationPolicy.settingsSummary
    },
    mission: projection.mission,
    people: projection.people,
    ship: projection.ship,
    commandBearing: projection.commandBearing,
    narrativeEdge: armedEdge ? {
      spendId: armedEdge.id,
      instruction: 'Create one credible favorable opening or soften one immediate cost. Do not guarantee success, override established facts, decide the player action, or erase a consequence.'
    } : null,
    narrationGuidance: {
      crew: (runtimeAssets?.crewDataset?.officers || []).map((officer) => ({
        id: officer.id,
        name: officer.name,
        billet: officer.billet,
        ...clone(officer.narrationGuide)
      })),
      ship: clone(runtimeAssets?.shipDataset?.profile || null)
    },
    opening: openingPromptProjection({ state, runtimeAssets, acceptedPairLineage }),
    acceptedStory: story
  };
  const text = [
    'DIRECTIVE V1 CAMPAIGN CONTEXT',
    'Continue a story-first command RPG from the accepted state below.',
    'Only this packet and the visible chat are canon. Never expose undiscovered facts or hidden objective text.',
    'Do not invent completed objectives, Command Bearing awards, relationship changes, ship conditions, clocks, or trackers. Narrate consequences only when supported by accepted state, visible causality, and the selected difficulty policy.',
    'A response is provisional until the player sends their next message with that response selected. Swipes replace it before acceptance.',
    'Depict outcomes naturally in prose; Directive will separately interpret only closed mission evidence candidates after acceptance.',
    payload.opening.phase === 'unanswered'
      ? 'OPENING REGENERATION: Preserve every established opening beat in opening.canonicalOpeningMessage and opening.continuitySummary. Wording may vary, but end at opening.firstPlayableScene. Do not take the player through the ready-room door, decide their action, or advance into the meeting.'
      : 'Treat opening.continuitySummary as established past experience. Do not replay or recap it unless the player naturally calls for it.',
    payload.opening.phase === 'firstMeeting' && payload.opening.stage === 'introductionPending'
      ? 'FIRST MEETING: This response is only the greeting, ordinary courtesy, and one genuine conversational opening. Follow opening.firstSceneGuidance in order. Do not discuss readiness problems, crew conflicts, the Asterion Reach, flight plans, mission details, reports, command expectations, or the handover terms yet. End after Whitaker gives the player a natural opening to answer and establish their own social posture.'
      : '',
    payload.opening.phase === 'firstMeeting' && payload.opening.stage === 'conversationAnswered'
      ? 'FIRST MEETING CONTINUATION: The player has answered Whitaker’s conversational opening, so the first-reply-only restrictions in opening.firstSceneGuidance are satisfied and no longer apply. Preserve the established warmth and transition naturally into the command handover without turning it into an interrogation, wartime emergency, or abrupt mission briefing.'
      : '',
    armedEdge
      ? 'COMMAND BEARING EDGE IS ARMED. Apply the bounded narrativeEdge instruction in the state packet once in this response.'
      : '',
    simulationPolicy.narratorConstraint,
    'Keep named crew identities and roles exact. Let Captain Whitaker or another appropriate officer offer fair, in-world guidance when the player lacks necessary knowledge.',
    payload.campaign.timeHeader
      ? `Begin the assistant response with exactly: ${payload.campaign.timeHeader}`
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
  const generationRouter = createDirectiveGenerationRouter(host);
  let initialized = false;
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
  let acceptedPairReplayNeeded = false;

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
      persist: async (next) => {
        await controller.persistActiveCampaign({ campaignState: next });
      }
    });
    missionRuntime = createV1MissionRuntime({
      getState: () => state,
      stateDeltaGateway: gateway,
      generationRouter,
      now
    });
  }

  function projectionResult() {
    if (!state) return { ok: true, projection: null };
    return buildV1RuntimePlayerProjection({ campaignState: state, runtimeAssets });
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

  async function syncPrompt({ rebuild = false } = {}) {
    if (!state || !currentChatIsBound()) {
      await restoreNarrationPreset();
      await host.prompt.clear?.({ reason: 'unbound-v1-chat' });
      return { ok: true, active: false };
    }
    await activateNarrationPreset();
    if (!state || !currentChatIsBound()) {
      await restoreNarrationPreset();
      await host.prompt.clear?.({ reason: 'chat-changed-during-preset-activation' });
      return { ok: true, active: false };
    }
    const result = projectionResult();
    if (!result.ok) {
      await host.prompt.clear?.({ reason: result.reasonCode || 'v1-projection-unavailable' });
      const error = new Error(`Directive V1 player projection unavailable: ${result.reasonCode || 'unknown'}`);
      error.code = 'DIRECTIVE_V1_PROJECTION_UNAVAILABLE';
      throw error;
    }
    const recentMessages = await host.chat.getRecentMessages?.({ limit: 500 }) || [];
    if (!state || !currentChatIsBound()) {
      await restoreNarrationPreset();
      await host.prompt.clear?.({ reason: 'chat-changed-during-history-read' });
      return { ok: true, active: false };
    }
    const normalizedMessages = recentMessages
      .map((message) => normalizeMessage(host, message))
      .filter(Boolean);
    const acceptedPairLineage = createActiveAcceptedPairLineage({
      campaignState: state,
      recentMessages: normalizedMessages,
      chatId: host.chat.getCurrentChatId?.()
    });
    const method = rebuild && host.prompt.rebuild ? 'rebuild' : 'install';
    return host.prompt[method]({
      binding: clone(state.campaignChatBinding),
      packet: createV1RuntimePromptPacket({
        state,
        projection: result.projection,
        runtimeAssets,
        acceptedPairLineage
      })
    });
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

  async function commitAcceptedCommandBearingEdge(snapshot) {
    const pending = state ? pendingV1CommandBearingEdge(state.commandBearing) : null;
    if (!pending || pending.status !== 'armed') {
      return { applied: false, reasonCode: 'no-armed-edge' };
    }
    const previousAssistant = snapshot?.source?.previousAssistant;
    const currentPlayer = snapshot?.source?.currentPlayer;
    if (!previousAssistant?.hostMessageId || !previousAssistant?.textHash || !currentPlayer?.hostMessageId) {
      return { applied: false, reasonCode: 'accepted-source-incomplete' };
    }
    if (previousAssistant.promptingPlayerHostMessageId !== pending.armedByPlayerMessageId) {
      return { applied: false, reasonCode: 'edge-generation-anchor-mismatch' };
    }
    const result = commitV1CommandBearingEdge(state.commandBearing, {
      spendId: pending.id,
      assistantMessageId: previousAssistant.hostMessageId,
      assistantTextHash: previousAssistant.textHash,
      acceptedByPlayerMessageId: currentPlayer.hostMessageId,
      now
    });
    return commitCommandBearingChange(result, {
      proposalId: `v1-command-bearing.commit.${pending.id}.${previousAssistant.hostMessageId}.${currentPlayer.hostMessageId}`,
      source: 'commandBearingAcceptedPair'
    });
  }

  async function refundCommandBearingForInvalidatedMessage(hostMessageId, eventType) {
    const matches = Object.values(state?.commandBearing?.spends || {}).filter((spend) => (
      spend.status !== 'refunded'
      && [
        spend.armedByPlayerMessageId,
        spend.assistantMessageId,
        spend.acceptedByPlayerMessageId
      ].includes(hostMessageId)
    ));
    if (!matches.length) return { applied: false, reasonCode: 'no-matching-edge' };
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
    if (!refundedCount) return { applied: false, reasonCode: 'no-refundable-edge' };
    const committed = await gateway.applyProposal({
      id: `v1-command-bearing.refund.${hostMessageId}.${eventType}.${matches.map((item) => item.id).join('.')}`,
      baseRevision: gateway.revision(),
      domains: ['commandBearing'],
      patch: { commandBearing },
      source: 'commandBearingSourceInvalidation'
    });
    setState(committed.campaignState);
    return { applied: true, refundedCount, commandBearing: clone(state.commandBearing) };
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
      ? await host.chat.openCampaignChat(binding)
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
      binding = await host.chat.createOrBindCampaignChat({
        campaignId: state.campaign.id,
        saveId: save.id,
        name: `${state.campaign.title} - ${state.player.name}`,
        createNew: true
      });
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
      if (previousChat?.chatId && compact(host.chat.getCurrentChatId?.()) !== previousChat.chatId) {
        try {
          await host.chat.open?.(previousChat);
        } catch (rollbackError) {
          host.logger?.warn?.('[Directive] Could not reopen the previous host chat after campaign binding failed.', rollbackError);
        }
      }
      if (binding?.createdByDirective === true
        && binding.chatId
        && binding.chatId !== previousChat?.chatId
        && typeof host.chat.deleteCampaignChat === 'function') {
        try {
          const cleanup = await host.chat.deleteCampaignChat(binding);
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
    const messages = await host.chat.getRecentMessages?.({ limit: 4 }) || [];
    if (messages.some((message) => !message.isSystem && message.role !== 'system')) return { posted: false, reason: 'chat-not-empty' };
    let opening = compact(records.packageData.campaign.openingMessage);
    if (timeHeader(state) && !opening.startsWith(timeHeader(state))) opening = `${timeHeader(state)}\n\n${opening}`;
    return host.chat.postAssistantMessage({
      text: opening,
      campaignId: state.campaign.id,
      turnId: 'opening',
      outcomeId: 'opening',
      responseKind: 'narration',
      idempotencyKey: `directive.v1.opening.${activeSave().id}`
    });
  }

  function enqueueSettlement(task) {
    const next = settlementQueue.then(task, task);
    settlementQueue = next.catch(() => null);
    return next;
  }

  async function settleSnapshot(snapshot, ingressId = null, { syncPromptAfter = true } = {}) {
    const time = await commitV1AcceptedPairTimeAdvance({
      campaignState: state,
      snapshot,
      packageData: records.packageData,
      generationRouter,
      stateDeltaGateway: gateway,
      ingressId,
      now
    });
    if (time.campaignState) setState(time.campaignState);
    const mission = await missionRuntime.settleAcceptedPair({
      runtimeAssets,
      snapshot
    });
    if (mission?.ok === false) acceptedPairReplayNeeded = true;
    if (missionRuntime.pendingEpisodeReview()) {
      await missionRuntime.reviewPendingEpisode({ runtimeAssets });
    }
    const commandBearing = await commitAcceptedCommandBearingEdge(snapshot);
    if (syncPromptAfter) await syncPrompt();
    return { time, mission, commandBearing, campaignState: clone(state) };
  }

  async function acceptedSnapshotForMessage(currentPlayerMessage, recentMessages, ingressId = null) {
    return prepareV1AcceptedPairSnapshot({
      campaignState: state,
      currentPlayerMessage,
      recentMessages,
      chatId: host.chat.getCurrentChatId?.(),
      ingressId
    });
  }

  async function rebuildAcceptedStateFromChat() {
    if (!state || !currentChatIsBound()) return { replayed: 0, blocked: false };
    const messages = await host.chat.getRecentMessages?.({ limit: 500 }) || [];
    let replayed = 0;
    let blockedAtMessageId = null;
    acceptedPairReplayNeeded = false;
    for (const message of messages) {
      if (!isUserMessage(message)) continue;
      const hostMessageId = message.hostMessageId || message.id;
      const prepared = await acceptedSnapshotForMessage(message, messages, `replay.${hostMessageId}`);
      if (!prepared.ok) continue;
      const result = await settleSnapshot(prepared.snapshot, `replay.${hostMessageId}`, {
        syncPromptAfter: false
      });
      if (result.mission?.ok === false) {
        blockedAtMessageId = hostMessageId || null;
        acceptedPairReplayNeeded = true;
        break;
      }
      if (result.mission?.status !== 'already-settled') replayed += 1;
    }
    await syncPrompt({ rebuild: true });
    return {
      replayed,
      blocked: acceptedPairReplayNeeded,
      blockedAtMessageId,
      retryPending: acceptedPairReplayNeeded
    };
  }

  async function invalidateSource(payload, eventType) {
    if (!state || !currentChatIsBound()) return { handled: false, reason: 'inactive-or-unbound' };
    const normalized = normalizeMessage(host, payload);
    const id = messageId(payload, normalized);
    if (!id) return { handled: false, reason: 'message-id-unavailable' };
    return enqueueSettlement(async () => {
      const mission = await missionRuntime.invalidateSourceMutation({
        runtimeAssets,
        hostMessageId: id,
        eventType
      });
      const time = await invalidateV1AcceptedPairTimeByHostMessage({
        campaignState: state,
        hostMessageId: id,
        packageData: records.packageData,
        stateDeltaGateway: gateway,
        now,
        eventType
      });
      if (time.campaignState) setState(time.campaignState);
      const commandBearing = await refundCommandBearingForInvalidatedMessage(id, eventType);
      const replay = await rebuildAcceptedStateFromChat();
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
      providerConfiguration: providerConfiguration(host),
      directivePreset: presetConfiguration(host),
      generationRouting: clone(GENERATION_ROUTING),
      diagnostics: diagnosticsConfiguration(host)
    };
  }

  const orchestrator = {
    async interceptGeneration() {
      await ensureInitialized();
      await settlementQueue;
      if (!state || !currentChatIsBound()) return { handled: false, reason: 'inactive-or-unbound' };
      const latestPlayerMessage = await host.chat.getLatestPlayerMessage?.();
      let acceptedPairReplay = null;
      if (acceptedPairReplayNeeded) {
        acceptedPairReplay = await enqueueSettlement(() => rebuildAcceptedStateFromChat());
      } else if (latestPlayerMessage) {
        await publicApi.observeHostPlayerMessage({
          message: latestPlayerMessage,
          source: 'v1-generation-boundary'
        });
        await settlementQueue;
      }
      if (latestPlayerMessage) await enqueueSettlement(() => armPendingCommandBearingEdge(latestPlayerMessage));
      await syncPrompt();
      return {
        handled: true,
        abortDefaultGeneration: false,
        responseStrategy: 'injectAndContinue',
        acceptedPairReplay
      };
    }
  };

  const publicApi = {
    async initialize() {
      if (initialized) return campaignViewEnvelope('campaign');
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
        runtimeAssets,
        idFactory,
        now
      });
      initialized = true;
      await host.ui?.mount?.();
      if (state) await publicApi.handleHostChatChanged();
      storageDiagnostics = await controller.verifyStorage();
      return campaignViewEnvelope('campaign');
    },

    getChatTurnOrchestrator: () => orchestrator,

    async getCurrentView({ tabId = 'campaign' } = {}) {
      await ensureInitialized();
      return campaignViewEnvelope(tabId);
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

    async observeHostPlayerMessage(payload = {}) {
      await ensureInitialized();
      if (!state || !currentChatIsBound()) return { handled: false, reason: 'inactive-or-unbound' };
      if (acceptedPairReplayNeeded) {
        const acceptedPairReplay = await enqueueSettlement(() => rebuildAcceptedStateFromChat());
        return {
          handled: acceptedPairReplay.blocked !== true,
          reason: acceptedPairReplay.blocked ? 'accepted-pair-replay-pending' : null,
          responseStrategy: 'injectAndContinue',
          abortDefaultGeneration: false,
          acceptedPairReplay,
          campaignState: clone(state)
        };
      }
      const current = normalizeMessage(host, payload) || await host.chat.getLatestPlayerMessage?.();
      if (!current || !isUserMessage(current) || !compact(current.text || current.mes || current.content)) {
        return { handled: false, reason: 'no-player-message' };
      }
      const recent = await host.chat.getRecentMessages?.({ limit: 500 }) || [];
      const prepared = await acceptedSnapshotForMessage(current, recent, payload.ingressId || messageId(payload, current));
      if (!prepared.ok) {
        await syncPrompt();
        return { handled: false, reason: prepared.reason };
      }
      return enqueueSettlement(async () => ({
        handled: true,
        responseStrategy: 'injectAndContinue',
        abortDefaultGeneration: false,
        ...(await settleSnapshot(prepared.snapshot, payload.ingressId || messageId(payload, current)))
      }));
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
      await ensureInitialized();
      return enqueueSettlement(async () => {
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
          acceptedPairReplay = await rebuildAcceptedStateFromChat();
        } catch (error) {
          if (!timelineFork) throw error;
          acceptedPairReplayNeeded = true;
          host.logger?.warn?.('[Directive] Post-fork accepted-pair replay failed after the new timeline was committed.', error);
          acceptedPairReplay = {
            replayed: 0,
            blocked: true,
            reasonCode: 'post-fork-replay-failed',
            message: error?.message || String(error)
          };
        }
      }
      else await syncPrompt();
      return { active: currentChatIsBound(), chatId, acceptedPairReplay, timelineFork };
      });
    },

    async handleHostGenerationStopped() {
      return { ok: true, canceled: false, reason: 'host-controls-generation' };
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
      const previous = clone(state.player.portrait || null);
      let committed;
      try {
        committed = await gateway.applyProposal({
          id: `v1-player-portrait.import.${state.campaign.id}.${portrait.asset.updatedAt}`,
          baseRevision: gateway.revision(),
          domains: ['playerPortrait'],
          operations: [{ op: 'set', path: ['player', 'portrait'], value: portrait }],
          source: 'playerPortraitImport'
        });
      } catch (error) {
        await cleanupPlayerPortrait(portrait, 'player-portrait-import-rollback-failed');
        throw error;
      }
      setState(committed.campaignState);
      const previousCleanup = previous?.asset?.path && previous.asset.path !== portrait.asset.path
        ? await cleanupPlayerPortrait(previous, 'replaced-player-portrait-cleanup-failed')
        : { attempted: false, deleted: false, reason: 'no-replaced-player-portrait' };
      return { portrait: clone(portrait), previousCleanup, view: await campaignViewEnvelope('crew') };
    },

    async removeCampaignPlayerPortrait() {
      await ensureInitialized();
      if (!state) throw new Error('No active V1 campaign is available.');
      const previous = clone(state.player.portrait || null);
      const committed = await gateway.applyProposal({
        id: `v1-player-portrait.remove.${state.campaign.id}.${now()}`,
        baseRevision: gateway.revision(),
        domains: ['playerPortrait'],
        operations: [{ op: 'set', path: ['player', 'portrait'], value: null }],
        source: 'playerPortraitRemove'
      });
      setState(committed.campaignState);
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
      await postOpeningIfEmpty();
      return { ok: true, binding: clone(binding), view: await campaignViewEnvelope('mission') };
    },

    async deleteCampaign({ campaignId, saveId = null } = {}) {
      await ensureInitialized();
      const target = await controller.prepareCampaignDeletion({ campaignId, saveId });
      if (typeof host.chat.deleteCampaignCharacter !== 'function') {
        const error = new Error('SillyTavern character deletion is unavailable.');
        error.code = 'DIRECTIVE_CAMPAIGN_CHARACTER_DELETE_UNAVAILABLE';
        throw error;
      }
      const hostDeletion = await host.chat.deleteCampaignCharacter(target.campaignChatBinding);
      const result = await controller.deleteCampaign({
        campaignId: target.campaignId,
        saveId: target.saveId
      });
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
    },

    async saveGame({ name } = {}) {
      await ensureInitialized();
      return enqueueSettlement(async () => {
      const checkpointName = required(name, 'name');
      const sourceState = clone(state);
      const sourceChatId = compact(sourceState?.campaignChatBinding?.chatId);
      if (!sourceChatId) {
        const error = new Error('Directive cannot create a checkpoint without an exact bound campaign chat.');
        error.code = 'DIRECTIVE_CHECKPOINT_CHAT_REQUIRED';
        throw error;
      }
      if (typeof host.chat.cloneCampaignChat !== 'function') {
        const error = new Error('The host cannot clone the active campaign chat for a Directive checkpoint.');
        error.code = 'DIRECTIVE_CHECKPOINT_CLONE_UNAVAILABLE';
        throw error;
      }
      let checkpointBinding = null;
      let checkpoint = null;
      try {
        checkpointBinding = await host.chat.cloneCampaignChat({
          sourceChatId,
          targetName: `${sourceState.campaign.title} - ${checkpointName}`,
          open: false,
          campaignId: sourceState.campaign.id,
          saveId: sourceState.campaignChatBinding.saveId,
          sourceBinding: sourceState.campaignChatBinding
        });
        const checkpointState = clone(sourceState);
        checkpointState.campaignChatBinding = {
          ...clone(checkpointBinding),
          kind: 'directive.campaignChatBinding.v1',
          version: 1,
          campaignId: sourceState.campaign.id,
          saveId: sourceState.campaignChatBinding.saveId,
          status: 'bound'
        };
        checkpoint = await controller.createCheckpoint({
          name: checkpointName,
          campaignState: checkpointState
        });
      } catch (error) {
        if (checkpointBinding?.chatId && typeof host.chat.deleteCampaignChat === 'function') {
          try {
            await host.chat.deleteCampaignChat(checkpointBinding);
          } catch (cleanupError) {
            host.logger?.warn?.('[Directive] Could not remove a failed checkpoint chat.', cleanupError);
          }
        }
        throw error;
      }
      return { checkpoint: clone(checkpoint), view: await campaignViewEnvelope('campaign') };
      });
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
      return enqueueSettlement(async () => {
        const transaction = await timelineTransactions.loadGame({ savedGameId: required(savedGameId || checkpointId, 'savedGameId') });
        const timeline = await controller.loadSaveRecord({ saveId: transaction.childSaveId });
        return { transaction: clone(transaction), timeline: clone(timeline), view: await campaignViewEnvelope('mission') };
      });
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
        routing: clone(GENERATION_ROUTING),
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
    updateDirectivePresetAutoCheck: async ({ enabled } = {}) => host.presets?.setAutoCheckPreference?.({ enabled }),
    installDirectivePreset: async () => host.presets?.installBundledPreset?.(),
    getDirectivePresetStartupReminder: async () => host.presets?.getStartupCheck?.() || { shouldPrompt: false },
    dismissDirectivePresetStartupReminder: async ({ disable = false, bundledVersion = null } = {}) => (
      disable
        ? host.presets?.setAutoCheckPreference?.({ enabled: false })
        : host.presets?.dismissAutoCheckForVersion?.(bundledVersion)
    ),

    async resetRuntimeUiState() {
      activeScreen = 'campaign';
      creatorView = null;
      activeDraftId = null;
      return { reset: true };
    }
  };

  return publicApi;
}
