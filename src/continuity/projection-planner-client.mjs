import { parseStructuredJsonText } from '../providers/structured-output-parser.mjs';
import { cloneJson, compact } from './fact-schema.mjs';
import { CONTINUITY_PLAN_KIND } from './projection-plan-validator.mjs';
import {
  buildContinuityProjectionPlannerRequest,
  continuityProjectionPlannerSystemPrompt
} from './projection-planner-prompt.mjs';

export const CONTINUITY_PROJECTION_PLANNER_ROLE_ID = 'continuityProjectionPlanner';

function extractResponsePayload(result = {}) {
  const response = result?.response || result || {};
  if (typeof response?.text === 'string') return response.text;
  if (typeof response?.content === 'string') return response.content;
  if (typeof response?.message?.content === 'string') return response.message.content;
  if (response?.content && typeof response.content === 'object') return JSON.stringify(response.content);
  if (response?.packet && typeof response.packet === 'object') return JSON.stringify(response.packet);
  if (response?.json && typeof response.json === 'object') return JSON.stringify(response.json);
  return '';
}

function normalizeParsedPlan(value = {}) {
  const candidate = value?.kind === CONTINUITY_PLAN_KIND
    ? value
    : (value?.plan?.kind === CONTINUITY_PLAN_KIND ? value.plan : null);
  if (!candidate || !Array.isArray(candidate.operations)) {
    return {
      ok: false,
      error: 'Planner output did not contain a continuity projection plan.'
    };
  }
  return {
    ok: true,
    plan: {
      kind: CONTINUITY_PLAN_KIND,
      operations: Array.isArray(candidate.operations) ? candidate.operations : [],
      omitted: Array.isArray(candidate.omitted) ? candidate.omitted : [],
      guardFocus: Array.isArray(candidate.guardFocus) ? candidate.guardFocus : [],
      compressionGroups: Array.isArray(candidate.compressionGroups) ? candidate.compressionGroups : []
    }
  };
}

export async function planContinuityProjection({
  generationRouter = null,
  factIndex,
  sourceFrame = null,
  projectionHints = [],
  policy = {},
  signal = null
} = {}) {
  const request = buildContinuityProjectionPlannerRequest({
    factIndex,
    sourceFrame,
    projectionHints,
    policy
  });
  if (typeof generationRouter?.generate !== 'function') {
    return {
      ok: false,
      skipped: true,
      plan: null,
      request,
      fallbackReason: 'no-generation-router'
    };
  }
  const systemPrompt = continuityProjectionPlannerSystemPrompt();
  const generation = await generationRouter.generate(CONTINUITY_PROJECTION_PLANNER_ROLE_ID, {
    kind: 'directive.generationRequest.continuityProjectionPlanner.v1',
    prompt: `${systemPrompt}\n\n${JSON.stringify(request, null, 2)}`,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: JSON.stringify(request, null, 2)
      }
    ],
    structuredOutput: true,
    parserSchema: CONTINUITY_PLAN_KIND,
    metadata: {
      sourceHash: sourceFrame?.sourceHash || null,
      requestHash: request.requestHash || null,
      candidateFactCount: request.candidateFacts.length
    },
    parameters: {
      temperature: 0,
      max_tokens: 1400
    }
  }, signal ? { signal } : {});
  if (generation?.ok !== true) {
    return {
      ok: false,
      plan: null,
      request,
      fallbackReason: compact(generation?.error?.code) || 'planner-generation-failed',
      diagnostics: cloneJson(generation?.diagnostics || null),
      error: cloneJson(generation?.error || null)
    };
  }
  const parsed = parseStructuredJsonText(extractResponsePayload(generation), { requireObject: true });
  if (!parsed.ok) {
    return {
      ok: false,
      plan: null,
      request,
      fallbackReason: 'planner-json-parse-failed',
      diagnostics: cloneJson(generation?.diagnostics || null),
      error: cloneJson(parsed.diagnostic || { message: parsed.error })
    };
  }
  const normalized = normalizeParsedPlan(parsed.value);
  if (!normalized.ok) {
    return {
      ok: false,
      plan: null,
      request,
      fallbackReason: 'planner-plan-shape-invalid',
      diagnostics: cloneJson(generation?.diagnostics || null),
      error: { message: normalized.error }
    };
  }
  return {
    ok: true,
    plan: normalized.plan,
    request,
    diagnostics: cloneJson(generation?.diagnostics || null),
    repairedJson: parsed.repaired === true
  };
}

export const __continuityProjectionPlannerClientTestHooks = Object.freeze({
  extractResponsePayload,
  normalizeParsedPlan
});
