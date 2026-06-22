import {
  buildPlayerSafePromptContext,
  createPlayerSafeCampaignProjection,
  recordPromptContextRevision
} from '../generation/player-safe-prompt-context-builder.mjs';
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
    introPacket: cloneJson(existing.introPacket || null)
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

function localIntroPacket({ campaignState, packageData }) {
  const safe = createPlayerSafeCampaignProjection({ campaignState, packageData }) || {};
  const player = safe.player || {};
  const ship = { ...(packageData?.ship || {}), ...(safe.ship || {}) };
  const captain = (packageData?.crew?.senior || []).find((officer) => officer.id === packageData?.ship?.commandStructure?.commandingOfficer)
    || (packageData?.crew?.senior || []).find((officer) => officer.billet === 'Commanding Officer');
  const objectives = safe.mission?.formalObjectives || [];
  const firstDecision = safe.mission?.availableDecisionPointIds?.[0] || null;
  const assignment = packageData?.storyArcs?.campaign?.premise
    || packageData?.storyArcs?.campaign?.playerBrief
    || packageData?.storyArcs?.campaign?.highConcept
    || campaignState.campaign?.theater
    || 'a politically sensitive Starfleet assignment';
  const text = [
    `The ${ship.class || 'Starfleet'} starship ${ship.name || 'under your new command assignment'} holds steady as the last transfer shuttle completes its approach. Beyond the viewports, the work ahead is already waiting: ${compact(assignment)}`,
    '',
    `${player.rank || 'Commander'} ${player.name || ''}, newly assigned as ${player.billet || 'Executive Officer'}, steps into a command team that has already begun forming its own habits. ${captain?.rank || 'Captain'} ${captain?.name || 'Whitaker'} retains final authority, but the immediate coordination of shipboard operations now falls within your lane.`,
    '',
    objectives.length ? `Your standing priorities are clear: ${objectives.slice(0, 3).map((entry) => compact(entry?.label || entry)).filter(Boolean).join(' ')}` : '',
    '',
    firstDecision
      ? `${captain?.name || 'The Captain'} turns the bridge over to you for the first operational choice. The crew waits to see how you establish the ship's working rhythm.`
      : `${captain?.name || 'The Captain'} gives you the deck. The next move is yours.`
  ].filter((line, index, array) => line || (index > 0 && array[index - 1])).join('\n').trim();
  return {
    kind: 'directive.campaignIntroPacket',
    source: 'local-fallback',
    text,
    narratorSafe: true,
    campaignId: campaignState.campaign?.id || null
  };
}

async function generateIntro({ campaignState, packageData, generationRouter }) {
  const fallback = localIntroPacket({ campaignState, packageData });
  if (!generationRouter?.generate) return fallback;
  const safe = createPlayerSafeCampaignProjection({ campaignState, packageData }) || {};
  const prompt = [
    'Write the opening message for a chat-native Starfleet command campaign.',
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
      { role: 'system', content: 'You write concise, grounded opening prose for Directive campaigns.' },
      { role: 'user', content: prompt }
    ],
    parameters: {
      max_tokens: 1200,
      temperature: 0.7
    }
  });
  const text = compact(generated?.response?.text || generated?.response?.content);
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
    text: generated.response.text.trim(),
    narratorSafe: true,
    campaignId: campaignState.campaign?.id || null
  };
}

async function persistStep(persist, campaignState, summary) {
  if (typeof persist === 'function') {
    await persist(campaignState, summary);
  }
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
        const introPacket = await generateIntro({
          campaignState: state,
          packageData,
          generationRouter
        });
        journal = {
          ...journal,
          introPacket: cloneJson(introPacket)
        };
        await checkpoint('introGenerated', {
          source: introPacket.source,
          providerId: introPacket.providerId || null
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

  return {
    activate
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
  localIntroPacket
});
