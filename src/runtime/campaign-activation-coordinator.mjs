import {
  buildPlayerSafePromptContext,
  createPlayerSafeCampaignProjection,
  recordPromptContextRevision
} from '../generation/player-safe-prompt-context-builder.mjs';
import {
  directiveNarrationContextSummary,
  directiveNarrationPerspectiveMode,
  normalizeDirectiveNarrationContext,
  resolveDirectiveNarrationContext
} from '../generation/narration-context.mjs';
import {
  commitTrackedCampaignState,
  initializeCampaignRuntimeTracking
} from './state-delta-gateway.mjs';

const ACTIVATION_STEPS = Object.freeze([
  'prepared',
  'chatBound',
  'introGenerated',
  'introPosted',
  'promptInstalled',
  'chatOpened',
  'activated'
]);
const CAMPAIGN_CHAT_FALLBACK_NAME = 'Directive';
const MAX_CAMPAIGN_CHAT_NAME_LENGTH = 80;

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function createJournal(campaignState, now) {
  const existing = campaignState.activationJournal || {};
  const steps = existing.steps && typeof existing.steps === 'object' ? existing.steps : {};
  return {
    kind: 'directive.campaignActivationJournal',
    version: 1,
    activationId: existing.activationId || `activation:${campaignState.campaign?.id || 'campaign'}`,
    status: existing.status || 'pending',
    startedAt: existing.startedAt || timestamp(now),
    updatedAt: timestamp(now),
    completedAt: existing.completedAt || null,
    error: cloneJson(existing.error || null),
    steps: Object.fromEntries(ACTIVATION_STEPS.map((step) => [step, cloneJson(steps[step] || {
      status: 'pending',
      completedAt: null,
      details: null
    })])),
    introPacket: cloneJson(existing.introPacket || null),
    introRevisions: Array.isArray(existing.introRevisions) ? cloneJson(existing.introRevisions) : []
  };
}

function setStep(journal, step, status, details, now) {
  return {
    ...cloneJson(journal),
    status: status === 'failed' ? 'failed' : journal.status,
    updatedAt: timestamp(now),
    error: status === 'failed' ? cloneJson(details?.error || details || null) : journal.error,
    steps: {
      ...cloneJson(journal.steps),
      [step]: {
        status,
        completedAt: status === 'complete' ? timestamp(now) : null,
        details: cloneJson(details || null)
      }
    }
  };
}

function completed(journal, step) {
  return journal?.steps?.[step]?.status === 'complete';
}

function resetStep(journal, step, details, now) {
  return {
    ...cloneJson(journal),
    updatedAt: timestamp(now),
    steps: {
      ...cloneJson(journal.steps),
      [step]: {
        status: 'pending',
        completedAt: null,
        details: cloneJson(details || null)
      }
    }
  };
}

function campaignChatName(campaignState, packageData) {
  const campaignTitle = compact(
    campaignState.campaign?.title
    || campaignState.campaign?.packageTitle
    || packageData?.manifest?.title
    || packageData?.storyArcs?.campaign?.title
    || packageData?.characterCreation?.campaignContext?.campaignTitle
    || 'Campaign'
  ).replace(/^U\.S\.S\.\s+[^:]+:\s*/i, '');
  const name = `Directive - ${campaignTitle || 'Campaign'}`;
  return name.length <= MAX_CAMPAIGN_CHAT_NAME_LENGTH ? name : CAMPAIGN_CHAT_FALLBACK_NAME;
}

function normalizeIntroNarrationContext(value = null) {
  return normalizeDirectiveNarrationContext(value, { roleId: 'campaignIntro' });
}

function introNarrationContextSummary(context) {
  return directiveNarrationContextSummary(context, { roleId: 'campaignIntro' });
}

async function resolveIntroNarrationContext(host) {
  return resolveDirectiveNarrationContext(host, { roleId: 'campaignIntro' });
}

function introPerspectiveMode(narrationContext) {
  return directiveNarrationPerspectiveMode(narrationContext);
}

function playerLabel(player = {}) {
  return compact([player.rank || 'Commander', player.name || ''].filter(Boolean).join(' ')) || 'the incoming commander';
}

function localIntroPacket({ campaignState, packageData, narrationContext = null }) {
  const resolvedNarrationContext = normalizeIntroNarrationContext(narrationContext);
  const safe = createPlayerSafeCampaignProjection({ campaignState, packageData }) || {};
  const player = safe.player || {};
  const ship = { ...(packageData?.ship || {}), ...(safe.ship || {}) };
  const captain = (packageData?.crew?.senior || []).find((officer) => officer.id === packageData?.ship?.commandStructure?.commandingOfficer)
    || (packageData?.crew?.senior || []).find((officer) => officer.billet === 'Commanding Officer');
  const objectives = safe.mission?.formalObjectives || [];
  const firstDecision = safe.mission?.availableDecisionPointIds?.[0] || null;
  const theater = packageData?.storyArcs?.campaign?.theater || campaignState.campaign?.theater || 'the assigned region';
  const missionProfile = packageData?.characterCreation?.campaignContext?.missionProfile
    || packageData?.storyArcs?.campaign?.thesis
    || 'a politically sensitive Starfleet assignment';
  const assignment = `${theater === 'the assigned region' ? theater : `the ${theater}`} assignment: ${compact(missionProfile)}`;
  const shipDescription = `The ${ship.class || 'Starfleet'} starship ${ship.name || 'assigned vessel'}`;
  const captainLabel = compact(`${captain?.rank || 'Captain'} ${captain?.name || 'Whitaker'}`);
  const billet = player.billet || 'Executive Officer';
  const priorities = objectives.slice(0, 3).map((entry) => compact(entry?.label || entry)).filter(Boolean).join(' ');
  const mode = introPerspectiveMode(resolvedNarrationContext);
  const text = (mode === 'second-person' ? [
    `${shipDescription} holds steady as the last transfer shuttle completes its approach. Beyond the viewports, the work ahead is already waiting: ${compact(assignment)}`,
    '',
    `You arrive as ${playerLabel(player)}, newly assigned as ${billet}. ${captainLabel} retains final authority, but immediate coordination of shipboard operations is now your assigned responsibility.`,
    '',
    priorities ? `Your standing priorities are clear: ${priorities}` : '',
    '',
    firstDecision
      ? `${captain?.name || 'The Captain'} opens the first operational choice. The crew waits for your order.`
      : `${captain?.name || 'The Captain'} leaves the next move with you.`
  ] : mode === 'first-person' ? [
    `${captainLabel}'s log: ${shipDescription} holds steady as the last transfer shuttle completes its approach. Beyond the viewports, the work ahead is already waiting: ${compact(assignment)}`,
    '',
    `${playerLabel(player)}, newly assigned as ${billet}, enters a command team that has already begun forming its own habits. I retain final authority, while immediate coordination of shipboard operations belongs to the XO's assigned responsibility.`,
    '',
    priorities ? `The standing priorities are clear: ${priorities}` : '',
    '',
    firstDecision
      ? `I open the first operational choice. The crew waits for the commander's first order.`
      : `I leave the next move with the incoming XO.`
  ] : [
    `${shipDescription} holds steady as the last transfer shuttle completes its approach. Beyond the viewports, the work ahead is already waiting: ${compact(assignment)}`,
    '',
    `${playerLabel(player)}, newly assigned as ${billet}, enters a command team that has already begun forming its own habits. ${captainLabel} retains final authority, while immediate coordination of shipboard operations belongs to the XO's assigned responsibility.`,
    '',
    priorities ? `The standing priorities are clear: ${priorities}` : '',
    '',
    firstDecision
      ? `${captain?.name || 'The Captain'} opens the first operational choice. The crew waits for the commander's first order.`
      : `${captain?.name || 'The Captain'} leaves the next move with the incoming XO.`
  ]).filter((line, index, array) => line || (index > 0 && array[index - 1])).join('\n').trim();
  return {
    kind: 'directive.campaignIntroPacket',
    source: 'local-fallback',
    text,
    narratorSafe: true,
    narrationContext: introNarrationContextSummary(resolvedNarrationContext),
    campaignId: campaignState.campaign?.id || null
  };
}

async function generateIntro({ campaignState, packageData, generationRouter, narrationContext = null }) {
  const resolvedNarrationContext = normalizeIntroNarrationContext(narrationContext);
  const fallback = localIntroPacket({ campaignState, packageData, narrationContext: resolvedNarrationContext });
  if (!generationRouter?.generate) return fallback;
  const safe = createPlayerSafeCampaignProjection({ campaignState, packageData }) || {};
  const styleContract = [
    'Narration perspective contract:',
    resolvedNarrationContext.instructions,
    '',
    `Resolved perspective: ${resolvedNarrationContext.perspective}`,
    `Perspective source: ${resolvedNarrationContext.source}${resolvedNarrationContext.activePresetName ? ` (${resolvedNarrationContext.activePresetName})` : ''}`,
    resolvedNarrationContext.reason ? `Source note: ${resolvedNarrationContext.reason}` : ''
  ].filter(Boolean).join('\n');
  const prompt = [
    'Write the opening message for a chat-native Starfleet command campaign.',
    'This model call happens outside normal host preset assembly, so apply the narration perspective contract below explicitly.',
    '',
    styleContract,
    '',
    'Use only the player-safe facts below. Establish the ship, assignment, player post, immediate scene, senior handoff, and one playable prompt.',
    'Write normal roleplay prose. Do not include setup instructions, mechanics, hidden values, or JSON.',
    '',
    JSON.stringify({
      campaign: safe.campaign || null,
      player: safe.player || null,
      ship: safe.ship || null,
      mission: safe.mission || null,
      seniorCrew: (packageData?.crew?.senior || []).map((officer) => ({
        name: officer.name,
        rank: officer.rank,
        billet: officer.billet,
        packageRole: officer.packageRole
      }))
    }, null, 2)
  ].join('\n');
  const generated = await generationRouter.generate('campaignIntro', {
    prompt,
    messages: [
      { role: 'system', content: `You write concise, grounded opening prose for Directive campaigns.\n\n${styleContract}` },
      { role: 'user', content: prompt }
    ],
    metadata: {
      narrationContext: introNarrationContextSummary(resolvedNarrationContext)
    },
    parameters: {
      max_tokens: 1200,
      temperature: 0.7
    }
  });
  const responseText = String(generated?.response?.text || generated?.response?.content || generated?.text || generated?.content || '').trim();
  const text = compact(responseText);
  if (!generated?.ok || !text) {
    return {
      ...fallback,
      fallbackReason: generated?.error?.message || 'Intro provider returned empty text.'
    };
  }
  return {
    kind: 'directive.campaignIntroPacket',
    source: 'reasoning-provider',
    providerId: generated.diagnostics?.providerId || generated.response?.providerId || null,
    text: responseText,
    narratorSafe: true,
    narrationContext: introNarrationContextSummary(resolvedNarrationContext),
    campaignId: campaignState.campaign?.id || null
  };
}

async function persistStep(persist, campaignState, summary) {
  if (typeof persist === 'function') {
    await persist(campaignState, summary);
  }
}

function isPlayerMessage(message = null) {
  const user = message?.isUser === true || message?.is_user === true || message?.role === 'user';
  const directiveOwned = message?.isDirectiveOwned === true || message?.directiveOwned === true;
  return Boolean(user && !directiveOwned);
}

async function currentChatHasPlayerMessage(host) {
  const latest = await host?.chat?.getLatestPlayerMessage?.();
  if (isPlayerMessage(latest)) return true;
  const recent = await host?.chat?.getRecentMessages?.({ limit: 500, playerSafeOnly: true });
  return Array.isArray(recent) && recent.some(isPlayerMessage);
}

function seedIntroRevisions({ journal, campaignState, hostMessageId = null, now = null } = {}) {
  if (Array.isArray(journal?.introRevisions) && journal.introRevisions.length > 0) {
    return cloneJson(journal.introRevisions);
  }
  const introPacket = journal?.introPacket || null;
  if (!introPacket?.text) return [];
  return [{
    id: `${journal?.activationId || `activation:${campaignState?.campaign?.id || 'campaign'}`}:intro:0`,
    generatedAt: journal?.steps?.introGenerated?.completedAt || journal?.startedAt || timestamp(now),
    source: introPacket.source || 'unknown',
    providerId: introPacket.providerId || null,
    text: introPacket.text,
    narrationContext: cloneJson(introPacket.narrationContext || null),
    hostMessageId: hostMessageId || campaignState?.campaignChatBinding?.introMessageId || null,
    swipeIndex: 0,
    swipeCount: 1,
    reason: 'initial-campaign-intro'
  }];
}

export function createCampaignActivationCoordinator({
  host,
  generationRouter = null,
  persist = null,
  now = null
} = {}) {
  if (!host?.chat?.createOrBindCampaignChat) {
    throw new Error('Campaign activation requires a host chat adapter.');
  }
  if (!host?.prompt?.install) {
    throw new Error('Campaign activation requires a host prompt adapter.');
  }

  async function activate({
    campaignState,
    packageData,
    crewDataset = null,
    saveId = null,
    existingChatId = null,
    createNewChat = true
  } = {}) {
    let state = initializeCampaignRuntimeTracking(campaignState);
    let journal = createJournal(state, now);
    let promptInstalledThisAttempt = false;
    let currentStep = ACTIVATION_STEPS.find((step) => !completed(journal, step)) || 'prepared';
    if (journal.status === 'failed') {
      journal = {
        ...journal,
        status: 'pending',
        error: null,
        updatedAt: timestamp(now)
      };
    }

    async function checkpoint(step, details, domains = ['activationJournal']) {
      journal = setStep(journal, step, 'complete', details, now);
      const next = {
        ...cloneJson(state),
        activationJournal: cloneJson(journal)
      };
      state = commitTrackedCampaignState({
        campaignState: state,
        nextCampaignState: next,
        delta: {
          source: 'campaignActivation',
          reason: `Campaign activation step completed: ${step}.`,
          summary: `Activation: ${step}`,
          domains,
          stable: true
        },
        now
      });
      await persistStep(persist, state, `Campaign activation: ${step}.`);
    }

    try {
      if (!completed(journal, 'prepared')) {
        currentStep = 'prepared';
        state = {
          ...state,
          campaign: {
            ...state.campaign,
            status: 'activating'
          },
          activationJournal: journal
        };
        await checkpoint('prepared', {
          campaignId: state.campaign?.id,
          saveId
        }, ['campaign', 'activationJournal']);
      }

      if (!completed(journal, 'chatBound')) {
        currentStep = 'chatBound';
        const binding = await host.chat.createOrBindCampaignChat({
          name: campaignChatName(state, packageData),
          fallbackName: CAMPAIGN_CHAT_FALLBACK_NAME,
          campaignId: state.campaign?.id,
          saveId,
          existingChatId,
          createNew: createNewChat
        });
        state = {
          ...state,
          campaignChatBinding: {
            ...cloneJson(binding),
            status: 'bound',
            introMessageId: state.campaignChatBinding?.introMessageId || null,
            promptContextRevision: state.campaignChatBinding?.promptContextRevision || 0,
            boundStateRevision: state.runtimeTracking?.revision || 0
          }
        };
        await checkpoint('chatBound', {
          chatId: binding.chatId,
          createdByDirective: binding.createdByDirective,
          creationMethod: binding.creationMethod
        }, ['campaignChatBinding', 'activationJournal']);
      }

      if (!completed(journal, 'introGenerated')) {
        currentStep = 'introGenerated';
        const narrationContext = await resolveIntroNarrationContext(host);
        const introPacket = await generateIntro({
          campaignState: state,
          packageData,
          generationRouter,
          narrationContext
        });
        journal = {
          ...journal,
          introPacket: cloneJson(introPacket)
        };
        await checkpoint('introGenerated', {
          source: introPacket.source,
          providerId: introPacket.providerId || null,
          narrationContext: introPacket.narrationContext || introNarrationContextSummary(narrationContext)
        }, ['activationJournal']);
      }

      if (!completed(journal, 'introPosted')) {
        currentStep = 'introPosted';
        const introPacket = journal.introPacket || localIntroPacket({ campaignState: state, packageData });
        const posted = await host.chat.postAssistantMessage({
          text: introPacket.text,
          campaignId: state.campaign?.id,
          responseKind: 'campaignIntro',
          idempotencyKey: `${journal.activationId}:intro`
        });
        state = {
          ...state,
          campaignChatBinding: {
            ...state.campaignChatBinding,
            introMessageId: posted.hostMessageId || state.campaignChatBinding?.introMessageId || null
          }
        };
        await checkpoint('introPosted', {
          hostMessageId: posted.hostMessageId || null,
          duplicate: posted.duplicate === true
        }, ['campaignChatBinding', 'activationJournal']);
      }

      if (!completed(journal, 'promptInstalled')) {
        currentStep = 'promptInstalled';
        const promptContext = buildPlayerSafePromptContext({
          campaignState: state,
          packageData,
          crewDataset,
          createdAt: timestamp(now)
        });
        const promptResult = await host.prompt.install({
          binding: state.campaignChatBinding,
          packet: promptContext
        });
        if (!promptResult?.ok) {
          const error = new Error(promptResult?.error?.message || 'Campaign prompt installation failed.');
          error.code = promptResult?.error?.code || 'DIRECTIVE_PROMPT_INSTALL_FAILED';
          throw error;
        }
        promptInstalledThisAttempt = true;
        state = recordPromptContextRevision(state, promptContext, {
          installedAt: timestamp(now),
          status: 'active'
        });
        state.campaignChatBinding = {
          ...state.campaignChatBinding,
          promptInstalledAt: timestamp(now)
        };
        await host.chat.updateBindingMetadata?.(state.campaignChatBinding);
        await checkpoint('promptInstalled', {
          revision: promptContext.revision,
          blockCount: promptContext.blocks.length,
          contentHash: promptContext.contentHash
        }, ['campaignChatBinding', 'activationJournal']);
      }

      if (!completed(journal, 'chatOpened')) {
        currentStep = 'chatOpened';
        const opened = await host.chat.open?.(state.campaignChatBinding);
        if (opened === false) {
          const error = new Error('Directive created the campaign chat but the host could not open it.');
          error.code = 'DIRECTIVE_CAMPAIGN_CHAT_OPEN_FAILED';
          throw error;
        }
        await checkpoint('chatOpened', {
          opened: true
        }, ['activationJournal']);
      }

      if (!completed(journal, 'activated')) {
        currentStep = 'activated';
        state = {
          ...state,
          campaign: {
            ...state.campaign,
            status: 'active',
            activatedAt: state.campaign?.activatedAt || timestamp(now)
          },
          activationJournal: journal
        };
        await checkpoint('activated', {
          campaignId: state.campaign?.id,
          chatId: state.campaignChatBinding?.chatId
        }, ['campaign', 'activationJournal']);
      }

      if (journal.status !== 'complete' || state.campaign?.status !== 'active') {
        journal = {
          ...journal,
          status: 'complete',
          completedAt: journal.completedAt || timestamp(now),
          updatedAt: timestamp(now),
          error: null
        };
        const finalized = {
          ...cloneJson(state),
          campaign: {
            ...state.campaign,
            status: 'active',
            activatedAt: state.campaign?.activatedAt || timestamp(now)
          },
          activationJournal: cloneJson(journal)
        };
        state = commitTrackedCampaignState({
          campaignState: state,
          nextCampaignState: finalized,
          delta: {
            source: 'campaignActivation',
            reason: 'Campaign activation completed.',
            summary: 'Campaign chat, intro, prompt context, and active state are ready.',
            domains: ['campaign', 'activationJournal'],
            stable: true
          },
          now
        });
        await persistStep(persist, state, 'Campaign activation completed.');
      }

      return {
        ok: true,
        campaignState: cloneJson(state),
        binding: cloneJson(state.campaignChatBinding),
        introPacket: cloneJson(journal.introPacket),
        activationJournal: cloneJson(journal)
      };
    } catch (error) {
      const failedStep = currentStep || ACTIVATION_STEPS.find((step) => !completed(journal, step)) || 'prepared';
      const primaryError = {
        code: error?.code || 'DIRECTIVE_CAMPAIGN_ACTIVATION_FAILED',
        message: error?.message || String(error)
      };
      journal = {
        ...setStep(journal, failedStep, 'failed', { error: primaryError }, now),
        status: 'failed'
      };

      let promptCleanup = null;
      if (promptInstalledThisAttempt || completed(journal, 'promptInstalled')) {
        try {
          const cleared = await host.prompt.clear?.({
            binding: state.campaignChatBinding,
            reason: 'activation-failed',
            preservePacket: true
          });
          promptCleanup = {
            attempted: true,
            ok: cleared?.ok !== false,
            status: cleared?.status || 'cleared'
          };
        } catch (cleanupError) {
          promptCleanup = {
            attempted: true,
            ok: false,
            error: {
              code: cleanupError?.code || 'DIRECTIVE_PROMPT_CLEANUP_FAILED',
              message: cleanupError?.message || String(cleanupError)
            }
          };
        }
        journal = resetStep(journal, 'promptInstalled', {
          reason: 'Activation did not complete; prompt context must be reinstalled on retry.',
          cleanup: promptCleanup
        }, now);
        if (completed(journal, 'activated')) {
          journal = resetStep(journal, 'activated', {
            reason: 'Activation did not complete.'
          }, now);
        }
      }

      state = {
        ...state,
        campaign: {
          ...state.campaign,
          status: 'activationFailed'
        },
        campaignChatBinding: state.campaignChatBinding ? {
          ...state.campaignChatBinding,
          status: 'bound',
          promptInstalledAt: null,
          promptSuspendedAt: timestamp(now)
        } : state.campaignChatBinding,
        runtimeTracking: {
          ...state.runtimeTracking,
          promptContext: state.runtimeTracking?.promptContext ? {
            ...state.runtimeTracking.promptContext,
            status: promptCleanup?.ok === false ? 'cleanupFailed' : 'suspended'
          } : state.runtimeTracking?.promptContext
        },
        activationJournal: {
          ...journal,
          error: {
            ...primaryError,
            failedStep,
            promptCleanup: cloneJson(promptCleanup)
          }
        }
      };
      journal = cloneJson(state.activationJournal);
      try {
        await host.chat.updateBindingMetadata?.(state.campaignChatBinding);
      } catch {
        // The recovery journal remains authoritative when host metadata cannot be updated.
      }
      await persistStep(persist, state, 'Campaign activation failed; recovery journal saved.');
      return {
        ok: false,
        error: cloneJson(journal.error),
        campaignState: cloneJson(state),
        activationJournal: cloneJson(journal)
      };
    }
  }

  async function rewriteIntro({
    campaignState,
    packageData,
    saveId = null,
    hostMessageId = null,
    reason = 'player-intro-reroll'
  } = {}) {
    let state = initializeCampaignRuntimeTracking(campaignState);
    let journal = createJournal(state, now);
    const recordedIntroMessageId = String(state.campaignChatBinding?.introMessageId || '').trim();
    const requestedIntroMessageId = String(hostMessageId || '').trim();
    const targetHostMessageId = requestedIntroMessageId || recordedIntroMessageId;

    if (!targetHostMessageId) {
      return {
        ok: false,
        reason: 'intro-message-unavailable',
        summary: 'Campaign intro cannot be rewritten because the intro message is not recorded.',
        campaignState: cloneJson(state),
        activationJournal: cloneJson(journal)
      };
    }
    if (recordedIntroMessageId && requestedIntroMessageId && recordedIntroMessageId !== requestedIntroMessageId) {
      return {
        ok: false,
        reason: 'not-campaign-intro-message',
        summary: 'Rewrite Intro only applies to the recorded campaign intro message.',
        campaignState: cloneJson(state),
        activationJournal: cloneJson(journal)
      };
    }
    if (typeof host.chat.appendAssistantMessageSwipe !== 'function') {
      return {
        ok: false,
        reason: 'assistant-swipes-unavailable',
        summary: 'This host does not expose assistant swipe updates.',
        campaignState: cloneJson(state),
        activationJournal: cloneJson(journal)
      };
    }
    if (await currentChatHasPlayerMessage(host)) {
      return {
        ok: false,
        reason: 'player-message-exists',
        summary: 'Campaign intro swipes are locked after the first player message.',
        campaignState: cloneJson(state),
        activationJournal: cloneJson(journal)
      };
    }

    const narrationContext = await resolveIntroNarrationContext(host);
    const introPacket = await generateIntro({
      campaignState: state,
      packageData,
      generationRouter,
      narrationContext
    });
    const generatedAt = timestamp(now);
    const existingRevisions = seedIntroRevisions({
      journal,
      campaignState: state,
      hostMessageId: targetHostMessageId,
      now
    });
    const revisionId = `${journal.activationId}:intro:${existingRevisions.length}`;
    const swipe = await host.chat.appendAssistantMessageSwipe({
      hostMessageId: targetHostMessageId,
      text: introPacket.text,
      campaignId: state.campaign?.id || null,
      responseKind: 'campaignIntro',
      extra: {
        directive: {
          campaignId: state.campaign?.id || null,
          responseKind: 'campaignIntro',
          introRevisionId: revisionId,
          selectedIntroRevisionId: revisionId,
          introRevisionReason: reason
        }
      }
    });
    const revision = {
      id: revisionId,
      generatedAt,
      source: introPacket.source || 'unknown',
      providerId: introPacket.providerId || null,
      text: introPacket.text,
      narrationContext: cloneJson(introPacket.narrationContext || introNarrationContextSummary(narrationContext)),
      hostMessageId: swipe.hostMessageId || targetHostMessageId,
      swipeIndex: Number.isInteger(swipe.swipeIndex) ? swipe.swipeIndex : null,
      swipeCount: Number.isInteger(swipe.swipeCount) ? swipe.swipeCount : null,
      duplicate: swipe.duplicate === true,
      reason
    };
    journal = {
      ...cloneJson(journal),
      updatedAt: generatedAt,
      introPacket: {
        ...cloneJson(introPacket),
        generatedAt,
        revisionId,
        hostMessageId: revision.hostMessageId,
        swipeIndex: revision.swipeIndex,
        swipeCount: revision.swipeCount,
        selectedIntroRevisionId: revisionId
      },
      introRevisions: [
        ...existingRevisions,
        cloneJson(revision)
      ]
    };
    const next = {
      ...cloneJson(state),
      campaignChatBinding: {
        ...cloneJson(state.campaignChatBinding || {}),
        introMessageId: revision.hostMessageId || recordedIntroMessageId || targetHostMessageId
      },
      activationJournal: cloneJson(journal)
    };
    state = commitTrackedCampaignState({
      campaignState: state,
      nextCampaignState: next,
      delta: {
        source: 'campaignActivation',
        reason: 'Campaign intro rewritten as a selected assistant swipe.',
        summary: 'Campaign intro rewritten.',
        domains: ['activationJournal', 'campaignChatBinding'],
        stable: true
      },
      now
    });
    await host.chat.updateBindingMetadata?.(state.campaignChatBinding);
    await persistStep(persist, state, 'Campaign intro rewritten as a selected assistant swipe.');
    return {
      ok: true,
      summary: 'Campaign intro rewritten.',
      campaignState: cloneJson(state),
      introPacket: cloneJson(journal.introPacket),
      introRevision: cloneJson(revision),
      activationJournal: cloneJson(journal),
      swipe: cloneJson(swipe),
      saveId
    };
  }

  return {
    activate,
    rewriteIntro
  };
}

export const __campaignActivationCoordinatorTestHooks = Object.freeze({
  ACTIVATION_STEPS,
  CAMPAIGN_CHAT_FALLBACK_NAME,
  MAX_CAMPAIGN_CHAT_NAME_LENGTH,
  createJournal,
  setStep,
  resetStep,
  campaignChatName,
  currentChatHasPlayerMessage,
  seedIntroRevisions,
  normalizeIntroNarrationContext,
  introNarrationContextSummary,
  localIntroPacket
});
