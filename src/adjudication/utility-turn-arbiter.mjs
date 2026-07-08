import {
  TURN_ARBITER_ROLE_ID,
  conservativeArbiterFailurePlan,
  normalizeTurnArbiterPlan
} from './utility-turn-arbiter-contract.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function parseJson(text = '') {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error };
  }
}

function extractResponseText(result = {}) {
  const response = result.response || result;
  if (typeof response.text === 'string') return response.text;
  if (typeof response.content === 'string') return response.content;
  if (typeof response.raw?.text === 'string') return response.raw.text;
  if (response.content && typeof response.content === 'object') {
    return JSON.stringify(response.content);
  }
  return '';
}

function failureReasonFrom(result = {}, fallback = 'arbiter_failed') {
  return compact(result.error?.code || result.error?.message || fallback) || fallback;
}

export function buildTurnArbiterContext({ message = {}, context = {} } = {}) {
  return {
    kind: 'directive.turnArbiterContext.v1',
    schemaVersion: 1,
    campaignId: compact(context.campaignId),
    saveId: compact(context.saveId),
    chatId: compact(message.chatId || context.chatId),
    hostMessageId: compact(message.hostMessageId || message.id),
    textHash: compact(context.textHash),
    playerText: compact(message.text || message.mes || message.content),
    currentMission: cloneJson(context.currentMission || null),
    sourceSettlement: cloneJson(context.sourceSettlement || null),
    selectedAssistantVariant: cloneJson(context.selectedAssistantVariant || null),
    recentTranscript: cloneJson(context.recentTranscript || []),
    openAssignments: cloneJson(context.openAssignments || []),
    pendingInteraction: cloneJson(context.pendingInteraction || null),
    recoverySummary: cloneJson(context.recoverySummary || null),
    promptStatus: cloneJson(context.promptStatus || null),
    sourceClean: context.sourceClean === true,
    ordinaryDialogueLikely: context.ordinaryDialogueLikely === true
  };
}

function arbiterSystemPrompt() {
  return [
    'You are Directive Utility Turn Arbiter.',
    'Return only JSON matching directive.turnArbiterPlan.v1.',
    'Decide route, response owner, scene continuity, and state intent.',
    'Do not mutate state. Proposed operations are advisory only.',
    'Use only supplied player-safe context.',
    'Never reveal hidden state, raw prompts, provider reasoning, private NPC thoughts, cookies, CSRF tokens, or API keys.',
    'If player answers an NPC inside an established scene, prefer hostContinue unless a durable Directive outcome is explicit.',
    'Never set statePlan.commitOutcome true unless route is directiveOutcome and the player clearly asks for durable mission action.',
    'Include sceneContinuity.mustNotReestablish when the visible scene is already established.'
  ].join('\n');
}

function failurePlan({ reason, arbiterContext }) {
  return conservativeArbiterFailurePlan({
    reason,
    sourceClean: arbiterContext.sourceClean,
    ordinaryDialogueLikely: arbiterContext.ordinaryDialogueLikely
  });
}

export async function arbitrateChatTurn({
  message = {},
  context = {},
  generationRouter = null
} = {}) {
  const arbiterContext = buildTurnArbiterContext({ message, context });
  if (!generationRouter || typeof generationRouter.generate !== 'function') {
    return failurePlan({ reason: 'missing_generation_router', arbiterContext });
  }

  let result = null;
  try {
    result = await generationRouter.generate(TURN_ARBITER_ROLE_ID, {
      systemPrompt: arbiterSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: JSON.stringify(arbiterContext)
        }
      ],
      context: arbiterContext,
      modelPreferences: {
        cost: 'low',
        latency: 'fast',
        capability: 'utility-reasoning'
      },
      responseFormat: 'json'
    });
  } catch (error) {
    return failurePlan({ reason: error?.code || error?.message || 'arbiter_exception', arbiterContext });
  }

  if (!result?.ok) {
    return failurePlan({ reason: failureReasonFrom(result), arbiterContext });
  }

  const parsed = parseJson(extractResponseText(result));
  if (!parsed.ok) {
    return failurePlan({ reason: 'arbiter_json_parse_failed', arbiterContext });
  }

  const normalized = normalizeTurnArbiterPlan(parsed.value);
  if (!normalized.ok) {
    return failurePlan({ reason: normalized.error?.code || 'arbiter_schema_invalid', arbiterContext });
  }
  return normalized.plan;
}
