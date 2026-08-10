import { runCharacterCreatorSectionDraft } from '../creators/character-creator-assist.mjs';
import { createPlayerPortraitUpload } from '../media/player-portrait-assets.mjs';
import { createV1PromptProjection } from '../projection/v1/prompt-projection.mjs';
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

const ASHES_OPENING_FALLBACK = [
  '*Stardate 53049.2 | 0830 hours*',
  '',
  'The U.S.S. Breckenridge is underway again, four months of repair and modernization still audible in the unfamiliar rhythm of her decks.',
  '',
  'Captain Mara Whitaker waits in the ready room with the command-transfer packet open between two untouched cups of coffee. “Come in, Commander. Before this ship reaches the Asterion Reach, you and I need to decide how we are going to run her.”'
].join('\n');

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

function timeHeader(state) {
  const stardate = Number(state?.timeLedger?.stardate ?? state?.campaign?.currentStardate);
  const minute = Number(state?.timeLedger?.shipClock?.minuteOfDay);
  if (!Number.isFinite(stardate) || !Number.isFinite(minute)) return '';
  const normalized = ((Math.round(minute) % 1440) + 1440) % 1440;
  const clock = `${String(Math.floor(normalized / 60)).padStart(2, '0')}${String(normalized % 60).padStart(2, '0')} hours`;
  return `*Stardate ${stardate.toFixed(1).padStart(7, '0')} | ${clock}*`;
}

function createGenerationRouter(host) {
  return {
    async generate(roleId, request) {
      try {
        const response = await host.generation.generate(roleId, request);
        return {
          ok: true,
          response: clone(response),
          diagnostics: {
            providerId: response?.providerId || null,
            model: response?.model || null
          }
        };
      } catch (error) {
        return {
          ok: false,
          error: { code: error?.code || 'DIRECTIVE_PROVIDER_FAILED', message: error?.message || String(error) },
          diagnostics: {}
        };
      }
    }
  };
}

function promptPacket({ state, projection }) {
  const story = createV1PromptProjection({
    storyProjection: projection.story,
    activeMissionId: projection.mission?.missionId,
    participantIds: projection.people?.people?.map((person) => person.id) || [],
    locationId: state.worldState?.currentLocationId || null
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
      timeHeader: timeHeader(state)
    },
    mission: projection.mission,
    people: projection.people,
    ship: projection.ship,
    commandBearing: projection.commandBearing,
    acceptedStory: story
  };
  const text = [
    'DIRECTIVE V1 CAMPAIGN CONTEXT',
    'Continue a story-first command RPG from the accepted state below.',
    'Only this packet and the visible chat are canon. Never expose undiscovered facts or hidden objective text.',
    'Do not invent completed objectives, Command Bearing awards, relationship changes, ship conditions, clocks, trackers, or consequences.',
    'A response is provisional until the player sends their next message with that response selected. Swipes replace it before acceptance.',
    'Depict outcomes naturally in prose; Directive will separately interpret only closed mission evidence candidates after acceptance.',
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
  const settings = host.providers?.getSettings?.() || host.providers?.settings?.getAll?.() || {};
  const status = {};
  for (const kind of ['utility', 'reasoning']) {
    status[kind] = host.providers?.status?.(kind) || { ready: true, label: 'Current SillyTavern model' };
  }
  return {
    settings: clone(settings),
    status: clone(status),
    profiles: clone(host.providers?.listProfiles?.() || [])
  };
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
  const generationRouter = createGenerationRouter(host);
  let initialized = false;
  let records = null;
  let runtimeAssets = null;
  let controller = null;
  let state = null;
  let gateway = null;
  let missionRuntime = null;
  let creatorView = null;
  let activeDraftId = null;
  let activeScreen = 'campaign';
  let storageDiagnostics = null;
  let settlementQueue = Promise.resolve();

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
    const chatId = compact(host.chat.getCurrentChatId?.());
    return Boolean(chatId && state?.campaignChatBinding?.chatId === chatId);
  }

  async function syncPrompt({ rebuild = false } = {}) {
    if (!state || !currentChatIsBound()) {
      await host.prompt.clear?.({ reason: 'unbound-v1-chat' });
      return { ok: true, active: false };
    }
    const result = projectionResult();
    if (!result.ok) {
      await host.prompt.clear?.({ reason: result.reasonCode || 'v1-projection-unavailable' });
      const error = new Error(`Directive V1 player projection unavailable: ${result.reasonCode || 'unknown'}`);
      error.code = 'DIRECTIVE_V1_PROJECTION_UNAVAILABLE';
      throw error;
    }
    const method = rebuild && host.prompt.rebuild ? 'rebuild' : 'install';
    return host.prompt[method]({
      binding: clone(state.campaignChatBinding),
      packet: promptPacket({ state, projection: result.projection })
    });
  }

  async function ensureInitialized() {
    if (!initialized) await publicApi.initialize();
  }

  async function commitBinding(binding) {
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
    await host.chat.updateBindingMetadata?.(exact);
    return exact;
  }

  async function createOrRestoreCampaignChat() {
    const save = activeSave();
    if (!state || !save) throw new Error('No active V1 campaign is available.');
    if (state.campaignChatBinding?.chatId) {
      await host.chat.openCampaignChat?.(state.campaignChatBinding);
      return state.campaignChatBinding;
    }
    const binding = await host.chat.createOrBindCampaignChat({
      campaignId: state.campaign.id,
      saveId: save.id,
      name: `${state.campaign.title} - ${state.player.name}`,
      createNew: true
    });
    return commitBinding(binding);
  }

  async function postOpeningIfEmpty() {
    const messages = await host.chat.getRecentMessages?.({ limit: 4 }) || [];
    if (messages.some((message) => !message.isSystem && message.role !== 'system')) return { posted: false, reason: 'chat-not-empty' };
    let opening = compact(records.packageData?.campaign?.openingMessage);
    if (!opening) {
      const projection = projectionResult();
      const request = {
        systemPrompt: 'Write the opening assistant message for Directive V1. Use only the supplied accepted state. Do not reveal hidden facts, complete objectives, or create trackers. End with a clear opening for the player to act.',
        prompt: JSON.stringify({
          player: state.player,
          campaign: state.campaign,
          mission: projection.ok ? projection.projection.mission : null,
          people: projection.ok ? projection.projection.people : null,
          ship: projection.ok ? projection.projection.ship : null,
          requiredHeader: timeHeader(state)
        }, null, 2)
      };
      try {
        const generated = await host.generation.generate('narration', request);
        opening = compact(generated?.text || generated?.content);
      } catch (error) {
        host.logger?.warn?.('[Directive] Opening narration provider unavailable; using the Ashes V1 fallback.', error);
      }
    }
    opening ||= ASHES_OPENING_FALLBACK;
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

  async function settleSnapshot(snapshot, ingressId = null) {
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
    if (missionRuntime.pendingEpisodeReview()) {
      await missionRuntime.reviewPendingEpisode({ runtimeAssets });
    }
    await syncPrompt();
    return { time, mission, campaignState: clone(state) };
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
    if (!state || !currentChatIsBound()) return { replayed: 0 };
    const messages = await host.chat.getRecentMessages?.({ limit: 500 }) || [];
    let replayed = 0;
    for (const message of messages) {
      if (!isUserMessage(message)) continue;
      const prepared = await acceptedSnapshotForMessage(message, messages, `replay.${message.hostMessageId || message.id}`);
      if (!prepared.ok) continue;
      const result = await settleSnapshot(prepared.snapshot, `replay.${message.hostMessageId || message.id}`);
      if (result.mission?.status !== 'already-settled') replayed += 1;
    }
    return { replayed };
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
      const replay = await rebuildAcceptedStateFromChat();
      await syncPrompt({ rebuild: true });
      return { handled: true, mission, time, replay };
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
      providerConfiguration: providerConfiguration(host),
      directivePreset: presetConfiguration(host)
    };
  }

  const orchestrator = {
    async interceptGeneration() {
      await ensureInitialized();
      await settlementQueue;
      if (!state || !currentChatIsBound()) return { handled: false, reason: 'inactive-or-unbound' };
      const latestPlayerMessage = await host.chat.getLatestPlayerMessage?.();
      if (latestPlayerMessage) {
        await publicApi.observeHostPlayerMessage({
          message: latestPlayerMessage,
          source: 'v1-generation-boundary'
        });
        await settlementQueue;
      }
      await syncPrompt();
      return {
        handled: true,
        abortDefaultGeneration: false,
        responseStrategy: 'injectAndContinue'
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
        campaignLibrary: records.campaignLibrary || createV1CampaignLibrary(),
        idFactory,
        now
      });
      const recovered = await controller.initialize();
      setState(recovered.campaignState);
      configureStateRuntime();
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

    async observeHostPlayerMessage(payload = {}) {
      await ensureInitialized();
      if (!state || !currentChatIsBound()) return { handled: false, reason: 'inactive-or-unbound' };
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

    async handleHostChatChanged() {
      await ensureInitialized();
      const chatId = compact(host.chat.getCurrentChatId?.());
      const metadata = await host.chat.getBindingMetadata?.();
      if (metadata?.kind === 'directive.campaignChatBinding.v1'
        && metadata.version === 1
        && metadata.chatId === chatId
        && metadata.saveId
        && metadata.saveId !== activeSave()?.id) {
        setState(await controller.loadGame({ saveId: metadata.saveId }));
        configureStateRuntime();
      }
      if (currentChatIsBound()) await syncPrompt({ rebuild: true });
      else await host.prompt.clear?.({ reason: 'chat-changed-unbound' });
      return { active: currentChatIsBound(), chatId };
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
      const result = await controller.saveCreatorDraft({
        draftId: activeDraftId,
        patch: {
          activeStep: activeStep || creatorView.activeStep,
          input: { ...clone(input), identity: { ...(input.identity || {}), portrait } }
        },
        reason: 'portraitImport'
      });
      creatorView = result.view;
      if (previous?.asset?.path && previous.asset.path !== portrait.asset.path) await deleteV1PlayerPortrait(host.storage, previous);
      return { portrait: clone(portrait), view: await campaignViewEnvelope('campaign') };
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
      const deleteResult = previous ? await deleteV1PlayerPortrait(host.storage, previous) : null;
      return { portrait: null, deleteResult, view: await campaignViewEnvelope('campaign') };
    },

    async returnCreatorToCampaignLibrary({ patch = null } = {}) {
      if (patch && activeDraftId) await publicApi.saveCreatorDraft({ patch, reason: 'returnToLibrary' });
      activeScreen = 'campaign';
      creatorView = null;
      activeDraftId = null;
      return campaignViewEnvelope('campaign');
    },

    async discardCreatorDraft() {
      await controller.discardCreatorDraft({ draftId: activeDraftId });
      activeScreen = 'campaign';
      creatorView = null;
      activeDraftId = null;
      return campaignViewEnvelope('campaign');
    },

    async acceptCreatorDraftAndStartCampaign({ simulationMode = 'Command' } = {}) {
      await ensureInitialized();
      const result = await controller.acceptCreatorDraftAndStartCampaign({ draftId: activeDraftId, simulationMode });
      setState(result.campaignState);
      configureStateRuntime();
      await createOrRestoreCampaignChat();
      activeScreen = 'campaign';
      creatorView = null;
      activeDraftId = null;
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
      await host.chat.openCampaignChat?.(binding);
      await syncPrompt({ rebuild: true });
      await postOpeningIfEmpty();
      return { ok: true, binding: clone(binding), view: await campaignViewEnvelope('mission') };
    },

    async saveGame({ name } = {}) {
      await ensureInitialized();
      let checkpoint = await controller.createCheckpoint({ name });
      if (typeof host.chat.cloneCampaignChat === 'function' && state?.campaignChatBinding?.chatId) {
        const checkpointBinding = await host.chat.cloneCampaignChat({
          sourceChatId: state.campaignChatBinding.chatId,
          targetName: `${state.campaign.title} - ${name}`,
          open: false,
          campaignId: state.campaign.id,
          saveId: checkpoint.id,
          sourceBinding: state.campaignChatBinding
        });
        checkpoint = await controller.bindCheckpointChat({
          checkpointId: checkpoint.id,
          binding: checkpointBinding
        });
      }
      return { checkpoint: clone(checkpoint), view: await campaignViewEnvelope('campaign') };
    },

    async loadCheckpoint({ checkpointId } = {}) {
      await ensureInitialized();
      const loaded = await controller.loadCheckpoint({ checkpointId });
      const timeline = loaded.timeline;
      setState(timeline.state);
      configureStateRuntime();
      if (loaded.checkpoint.state?.campaignChatBinding?.chatId && typeof host.chat.cloneCampaignChat === 'function') {
        const binding = await host.chat.cloneCampaignChat({
          sourceChatId: loaded.checkpoint.state.campaignChatBinding.chatId,
          targetName: `${state.campaign.title} - ${loaded.checkpoint.name} continuation`,
          open: true,
          campaignId: state.campaign.id,
          saveId: timeline.id,
          sourceBinding: loaded.checkpoint.state.campaignChatBinding
        });
        await commitBinding(binding);
      } else {
        await createOrRestoreCampaignChat();
      }
      await syncPrompt({ rebuild: true });
      await postOpeningIfEmpty();
      return { timeline: clone(timeline), view: await campaignViewEnvelope('mission') };
    },

    async deleteSave(options = {}) {
      const result = await controller.deleteSave(options);
      return { result, view: await campaignViewEnvelope('campaign') };
    },

    async updateRuntimeSettings(patch = {}) {
      await ensureInitialized();
      if (!state) throw new Error('No active V1 campaign is available.');
      const maxTurnSaveHistory = Math.max(1, Math.min(100, Math.round(Number(patch.maxTurnSaveHistory) || 8)));
      const autosaveEveryMessages = Math.max(1, Math.min(50, Math.round(Number(patch.autosaveEveryMessages) || 5)));
      await gateway.applyProposal({
        id: `v1-settings.${gateway.revision()}.${maxTurnSaveHistory}.${autosaveEveryMessages}`,
        baseRevision: gateway.revision(),
        domains: ['settings'],
        patch: { settings: { maxTurnSaveHistory, autosaveEveryMessages } },
        source: 'v1Settings'
      });
      return campaignViewEnvelope('settings');
    },

    async refreshStorageDiagnostics() {
      storageDiagnostics = await controller.verifyStorage();
      return clone(storageDiagnostics);
    },
    verifyActiveSave: () => controller.verifyStorage(),
    async exportActiveSave() {
      const save = activeSave();
      return { fileName: `directive-v1-${save?.id || 'no-save'}.json`, jsonText: JSON.stringify(save, null, 2) };
    },
    async exportSupportDiagnostics() {
      const bundle = {
        kind: 'directive.supportBundle.v1',
        createdAt: now(),
        hostId: host.id,
        activeSaveId: activeSave()?.id || null,
        storage: await controller.verifyStorage(),
        prompt: host.prompt.inspect?.() || null,
        providers: providerConfiguration(host),
        stateEnvelope: state ? {
          campaignId: state.campaign.id,
          package: state.activeCampaignPackage,
          missionId: state.mission.activeMissionId,
          revision: state.stateCustody.revision
        } : null
      };
      return { fileName: `directive-support-${Date.now()}.json`, jsonText: JSON.stringify(bundle, null, 2) };
    },
    cleanMissingStorageRecords: () => controller.verifyStorage(),

    async updateProviderSettings({ kind, patch } = {}) {
      const result = host.providers?.updateSettings
        ? host.providers.updateSettings(kind, patch)
        : host.providers?.settings?.update?.(kind, patch);
      return clone(result);
    },
    testProvider: ({ kind } = {}) => host.providers?.test?.(kind),

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
