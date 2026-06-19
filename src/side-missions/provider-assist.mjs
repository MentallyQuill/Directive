import { cloneJson } from '../pressures/pressure-ledger.mjs';
import { hiddenTruthTerm } from './opportunity-signals.mjs';

export const SIDE_MISSION_PROVIDER_ROLE_IDS = Object.freeze({
  signalDetector: 'sideMissionSignalDetector',
  candidateBuilder: 'sideMissionCandidateBuilder',
  sceneFramer: 'sideMissionSceneFramer'
});

const VALID_ROLE_IDS = Object.freeze(new Set(Object.values(SIDE_MISSION_PROVIDER_ROLE_IDS)));

const FORBIDDEN_PROPOSAL_KEYS = Object.freeze(new Set([
  'accepted',
  'campaignState',
  'commandLog',
  'completedAssignments',
  'completedOpportunities',
  'outcomeBand',
  'pressureDelta',
  'pressureDeltas',
  'pressureLedger',
  'rawProviderOutput',
  'reward',
  'rewards',
  'score',
  'sideMissions',
  'sourceCommandLogIds',
  'sourceEventIds',
  'sourceFactIds',
  'sourceFlagIds',
  'sourcePressureIds',
  'stateDelta',
  'status',
  'threshold',
  'validation'
]));

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function compactText(value, maxLength = 420) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function requireObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireFunction(value, label) {
  if (typeof value !== 'function') {
    throw new Error(`${label} must be a function`);
  }
}

function normalizeRoleId(roleId) {
  const id = String(roleId || SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder).trim();
  if (!VALID_ROLE_IDS.has(id)) {
    throw new Error(`Unknown side-mission provider role "${id}".`);
  }
  return id;
}

function safeMessage(message, fallback = 'Side-mission provider assistance failed.') {
  const text = compactText(message || fallback, 180);
  if (hiddenTruthTerm(text)) {
    return 'Provider output included hidden or Director-only language.';
  }
  return text;
}

function parseJsonText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw Object.assign(new Error('Provider returned empty structured output.'), {
      code: 'DIRECTIVE_SIDE_MISSION_PROVIDER_EMPTY_JSON'
    });
  }
  if (hiddenTruthTerm(trimmed)) {
    throw Object.assign(new Error('Provider output included hidden or Director-only language.'), {
      code: 'DIRECTIVE_SIDE_MISSION_PROVIDER_HIDDEN_LEAK',
      hiddenLeakBlocked: true
    });
  }
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const jsonText = unfenced.startsWith('{')
    ? unfenced
    : extractFirstJsonObject(unfenced);
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw Object.assign(new Error('Provider returned invalid structured JSON.'), {
      code: 'DIRECTIVE_SIDE_MISSION_PROVIDER_INVALID_JSON'
    });
  }
}

function extractFirstJsonObject(text) {
  const source = String(text || '');
  const start = source.indexOf('{');
  if (start < 0) {
    return source;
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  return source.slice(start);
}

export function parseSideMissionProviderResponse(response = {}) {
  if (isObject(response?.content)) return cloneJson(response.content);
  if (isObject(response?.json)) return cloneJson(response.json);
  if (isObject(response?.data)) return cloneJson(response.data);
  if (isObject(response?.structuredOutput)) return cloneJson(response.structuredOutput);
  if (typeof response?.content === 'string') return parseJsonText(response.content);
  if (typeof response?.text === 'string') return parseJsonText(response.text);
  if (isObject(response) && (Array.isArray(response.proposals) || isObject(response.proposal))) {
    return cloneJson(response);
  }
  throw Object.assign(new Error('Provider returned no structured JSON proposal payload.'), {
    code: 'DIRECTIVE_SIDE_MISSION_PROVIDER_MISSING_JSON'
  });
}

function candidateByReference(opportunityReview, proposal) {
  const candidates = asArray(opportunityReview?.candidates);
  const candidateId = compactText(proposal?.candidateId || proposal?.sourceCandidateId, 120);
  const opportunityId = compactText(proposal?.opportunityId, 120);
  return candidates.find((candidate) => (
    (candidateId && candidate.id === candidateId)
    || (opportunityId && candidate.opportunityId === opportunityId)
  )) || null;
}

function playerSafeCandidateContext(candidate) {
  return {
    id: candidate.id,
    opportunityId: candidate.opportunityId,
    title: candidate.title,
    scope: candidate.scope,
    intervalId: candidate.intervalId || null,
    playerSummary: candidate.playerSummary,
    reviewQuestion: candidate.reviewQuestion,
    reason: candidate.reason,
    rawValuesHidden: true
  };
}

function proposalList(payload) {
  if (Array.isArray(payload?.proposals)) return payload.proposals;
  if (Array.isArray(payload?.candidateProposals)) return payload.candidateProposals;
  if (Array.isArray(payload?.sceneFramings)) return payload.sceneFramings;
  if (isObject(payload?.proposal)) return [payload.proposal];
  if (isObject(payload?.candidateProposal)) return [payload.candidateProposal];
  if (isObject(payload?.sceneFraming)) return [payload.sceneFraming];
  if (isObject(payload) && (payload.candidateId || payload.opportunityId)) return [payload];
  return [];
}

function findForbiddenProposalKey(value, path = '$') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = findForbiddenProposalKey(value[index], `${path}[${index}]`);
      if (nested) return nested;
    }
    return null;
  }
  if (!isObject(value)) return null;
  for (const [key, nestedValue] of Object.entries(value)) {
    if (FORBIDDEN_PROPOSAL_KEYS.has(key)) {
      return `${path}.${key}`;
    }
    const nested = findForbiddenProposalKey(nestedValue, `${path}.${key}`);
    if (nested) return nested;
  }
  return null;
}

function validateNoHiddenText(value) {
  return hiddenTruthTerm(value) ? false : true;
}

function normalizeExpectedOutputs(values) {
  return asArray(values)
    .map((value) => compactText(value, 180))
    .filter(Boolean)
    .slice(0, 4);
}

function normalizeSceneBrief(proposal) {
  const scene = isObject(proposal?.sceneBrief)
    ? proposal.sceneBrief
    : (isObject(proposal?.sceneFraming) ? proposal.sceneFraming : null);
  if (!scene) return null;
  const openingSituation = compactText(scene.openingSituation || scene.playerSummary || scene.summary);
  const sceneQuestion = compactText(scene.sceneQuestion || scene.commandQuestion || scene.question, 260);
  const expectedOutputs = normalizeExpectedOutputs(scene.expectedOutputs || scene.outputs);
  if (!openingSituation && !sceneQuestion && expectedOutputs.length === 0) {
    return null;
  }
  return {
    openingSituation,
    sceneQuestion,
    expectedOutputs,
    rawValuesHidden: true
  };
}

function normalizeProposal({
  roleId,
  proposal,
  opportunityReview,
  index
}) {
  if (!isObject(proposal)) {
    return {
      ok: false,
      code: 'DIRECTIVE_SIDE_MISSION_PROVIDER_INVALID_PROPOSAL',
      message: 'Provider proposal must be an object.'
    };
  }
  if (!validateNoHiddenText(proposal)) {
    return {
      ok: false,
      code: 'DIRECTIVE_SIDE_MISSION_PROVIDER_HIDDEN_LEAK',
      message: 'Provider proposal included hidden or Director-only language.',
      hiddenLeakBlocked: true
    };
  }
  const forbiddenPath = findForbiddenProposalKey(proposal);
  if (forbiddenPath) {
    return {
      ok: false,
      code: 'DIRECTIVE_SIDE_MISSION_PROVIDER_AUTHORITY_KEY',
      message: 'Provider proposal attempted to author deterministic state or source fields.',
      forbiddenPath
    };
  }
  const candidate = candidateByReference(opportunityReview, proposal);
  if (!candidate) {
    return {
      ok: false,
      code: 'DIRECTIVE_SIDE_MISSION_PROVIDER_UNKNOWN_CANDIDATE',
      message: 'Provider proposal did not match an eligible deterministic side-mission candidate.'
    };
  }

  const title = compactText(proposal.title || proposal.candidateTitle || candidate.title, 120);
  const playerSummary = compactText(proposal.playerSummary || proposal.summary || candidate.playerSummary);
  const reviewQuestion = compactText(proposal.reviewQuestion || proposal.commandQuestion || proposal.question || candidate.reviewQuestion, 260);
  const sceneBrief = normalizeSceneBrief(proposal);
  const hasCandidatePhrasing = Boolean(title || playerSummary || reviewQuestion);
  const hasSceneBrief = Boolean(sceneBrief);

  if (roleId === SIDE_MISSION_PROVIDER_ROLE_IDS.sceneFramer && !hasSceneBrief) {
    return {
      ok: false,
      code: 'DIRECTIVE_SIDE_MISSION_PROVIDER_MISSING_SCENE_BRIEF',
      message: 'Scene framer output must include a sceneBrief proposal.'
    };
  }
  if (roleId === SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder && !hasCandidatePhrasing && !hasSceneBrief) {
    return {
      ok: false,
      code: 'DIRECTIVE_SIDE_MISSION_PROVIDER_MISSING_CANDIDATE_TEXT',
      message: 'Candidate builder output must include candidate phrasing or scene framing.'
    };
  }

  const normalized = {
    kind: 'directive.sideMissionProviderProposal',
    id: compactText(proposal.id || `provider-proposal.${candidate.opportunityId}.${index + 1}`, 160),
    roleId,
    candidateId: candidate.id,
    opportunityId: candidate.opportunityId,
    title,
    playerSummary,
    reviewQuestion,
    sceneBrief,
    proposalOnly: true,
    authoritative: false,
    matchedDeterministicCandidate: playerSafeCandidateContext(candidate),
    validation: {
      status: 'valid',
      authority: 'deterministic-side-mission-provider-assist-validator',
      reasons: [
        'Matched an eligible deterministic side-mission candidate.',
        'Contains no hidden-truth terms.',
        'Does not author source ids, scores, state deltas, rewards, or status.'
      ]
    },
    rawValuesHidden: true
  };

  if (!validateNoHiddenText(normalized)) {
    return {
      ok: false,
      code: 'DIRECTIVE_SIDE_MISSION_PROVIDER_HIDDEN_LEAK',
      message: 'Provider proposal normalized into hidden or Director-only language.',
      hiddenLeakBlocked: true
    };
  }

  return {
    ok: true,
    proposal: normalized
  };
}

function createDiagnostic({
  roleId,
  status,
  code,
  message,
  generationResult = null,
  acceptedCount = 0,
  rejectedCount = 0,
  hiddenLeakBlocked = false
}) {
  return {
    kind: 'directive.sideMissionProviderAssistDiagnostic',
    roleId,
    status,
    code,
    message: safeMessage(message),
    acceptedCount,
    rejectedCount,
    hiddenLeakBlocked,
    providerId: generationResult?.diagnostics?.providerId || null,
    model: generationResult?.diagnostics?.model || null,
    providerOutputStored: false,
    campaignStateMutated: false,
    rawValuesHidden: true
  };
}

function ensureSideMissions(state) {
  state.sideMissions = {
    openOrdersIntervals: [],
    availableAssignments: [],
    completedAssignments: [],
    opportunityReviews: [],
    opportunityCooldowns: [],
    scheduledOpportunities: [],
    completedOpportunities: [],
    providerAssistProposals: [],
    providerAssistDiagnostics: [],
    ...(state.sideMissions || {})
  };
  if (!Array.isArray(state.sideMissions.providerAssistProposals)) state.sideMissions.providerAssistProposals = [];
  if (!Array.isArray(state.sideMissions.providerAssistDiagnostics)) state.sideMissions.providerAssistDiagnostics = [];
  return state.sideMissions;
}

function upsertById(items = [], record) {
  const byId = new Map((items || []).filter((item) => item?.id).map((item) => [item.id, item]));
  byId.set(record.id, {
    ...(byId.get(record.id) || {}),
    ...record
  });
  return [...byId.values()];
}

function requestIdFromResult(result) {
  return compactText(
    result?.request?.requestId
      || result?.requestId
      || `side-mission-provider-assist.${result?.roleId || 'unknown'}`,
    180
  );
}

function persistedProposal(proposal, { result, requestId, appliedAt }) {
  return {
    ...cloneJson(proposal),
    id: proposal.id || `provider-proposal.${requestId}.${proposal.opportunityId || 'unknown'}`,
    requestId,
    roleId: result.roleId,
    status: 'proposed',
    appliedAt: appliedAt || null,
    proposalOnly: true,
    authoritative: false,
    providerOutputStored: false,
    rawValuesHidden: true
  };
}

function persistedDiagnostic(diagnostic, { result, requestId, appliedAt }) {
  return {
    ...cloneJson(diagnostic),
    id: `${requestId}.diagnostic.${diagnostic.code || result.status || 'status'}`,
    requestId,
    roleId: result.roleId,
    appliedAt: appliedAt || null,
    proposalOnly: true,
    providerOutputStored: false,
    campaignStateMutatedByProvider: false,
    rawValuesHidden: true
  };
}

function resultFromDiagnostic({
  roleId,
  status,
  code,
  message,
  generationResult = null,
  request = null,
  hiddenLeakBlocked = false
}) {
  return {
    kind: 'directive.sideMissionProviderAssistResult',
    ok: false,
    status,
    roleId,
    request: request ? cloneJson(request) : null,
    proposals: [],
    diagnostics: [
      createDiagnostic({
        roleId,
        status,
        code,
        message,
        generationResult,
        hiddenLeakBlocked: hiddenLeakBlocked || code === 'DIRECTIVE_SIDE_MISSION_PROVIDER_HIDDEN_LEAK'
      })
    ],
    proposalOnly: true,
    providerOutputStored: false,
    campaignStateMutated: false,
    rawValuesHidden: true
  };
}

export function buildSideMissionProviderAssistRequest({
  opportunityReview,
  roleId = SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder,
  candidateId = null,
  opportunityId = null,
  requestId = null
} = {}) {
  const normalizedRoleId = normalizeRoleId(roleId);
  requireObject(opportunityReview, 'opportunityReview');
  const candidates = asArray(opportunityReview.candidates)
    .filter((candidate) => (
      (!candidateId || candidate.id === candidateId)
      && (!opportunityId || candidate.opportunityId === opportunityId)
    ))
    .map(playerSafeCandidateContext);
  if (candidates.length === 0) {
    throw new Error(`No eligible deterministic side-mission candidate found for provider role "${normalizedRoleId}".`);
  }
  return {
    kind: 'directive.sideMissionProviderAssistRequest',
    requestId: requestId || null,
    roleId: normalizedRoleId,
    instruction: 'Return structured JSON only. Improve candidate phrasing or scene framing, but do not author state, source ids, scores, rewards, status, hidden truths, or consequences.',
    validationAuthority: 'deterministic-side-mission-provider-assist-validator',
    acceptedOutputContract: {
      proposals: [
        {
          candidateId: 'existing deterministic candidate id',
          opportunityId: 'existing deterministic opportunity id',
          title: 'optional player-facing title',
          playerSummary: 'optional player-safe phrasing',
          reviewQuestion: 'optional player-facing command question',
          sceneBrief: {
            openingSituation: 'optional player-safe scene framing',
            sceneQuestion: 'optional player-facing decision question',
            expectedOutputs: ['optional player-safe expected outputs']
          }
        }
      ]
    },
    candidates,
    rawValuesHidden: true
  };
}

export function validateSideMissionProviderPayload({
  payload,
  opportunityReview,
  roleId = SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder
} = {}) {
  const normalizedRoleId = normalizeRoleId(roleId);
  requireObject(opportunityReview, 'opportunityReview');
  if (!isObject(payload)) {
    return {
      ok: false,
      status: 'rejected',
      proposals: [],
      diagnostics: [
        createDiagnostic({
          roleId: normalizedRoleId,
          status: 'rejected',
          code: 'DIRECTIVE_SIDE_MISSION_PROVIDER_INVALID_PAYLOAD',
          message: 'Provider structured payload must be an object.'
        })
      ],
      rawValuesHidden: true
    };
  }
  if (!validateNoHiddenText(payload)) {
    return {
      ok: false,
      status: 'rejected',
      proposals: [],
      diagnostics: [
        createDiagnostic({
          roleId: normalizedRoleId,
          status: 'rejected',
          code: 'DIRECTIVE_SIDE_MISSION_PROVIDER_HIDDEN_LEAK',
          message: 'Provider proposal included hidden or Director-only language.',
          hiddenLeakBlocked: true
        })
      ],
      rawValuesHidden: true
    };
  }

  const rawProposals = proposalList(payload);
  if (rawProposals.length === 0) {
    return {
      ok: false,
      status: 'rejected',
      proposals: [],
      diagnostics: [
        createDiagnostic({
          roleId: normalizedRoleId,
          status: 'rejected',
          code: 'DIRECTIVE_SIDE_MISSION_PROVIDER_NO_PROPOSALS',
          message: 'Provider structured payload did not include proposals.'
        })
      ],
      rawValuesHidden: true
    };
  }

  const proposals = [];
  const rejected = [];
  for (let index = 0; index < rawProposals.length; index += 1) {
    const normalized = normalizeProposal({
      roleId: normalizedRoleId,
      proposal: rawProposals[index],
      opportunityReview,
      index
    });
    if (normalized.ok) {
      proposals.push(normalized.proposal);
    } else {
      rejected.push(normalized);
    }
  }

  const status = proposals.length > 0 ? 'accepted' : 'rejected';
  return {
    ok: proposals.length > 0,
    status,
    proposals: cloneJson(proposals),
    diagnostics: [
      createDiagnostic({
        roleId: normalizedRoleId,
        status,
        code: proposals.length > 0
          ? 'DIRECTIVE_SIDE_MISSION_PROVIDER_PROPOSALS_ACCEPTED'
          : (rejected[0]?.code || 'DIRECTIVE_SIDE_MISSION_PROVIDER_PROPOSALS_REJECTED'),
        message: proposals.length > 0
          ? 'Provider proposals passed deterministic side-mission validation and remain proposal-only.'
          : (rejected[0]?.message || 'Provider proposals were rejected.'),
        acceptedCount: proposals.length,
        rejectedCount: rejected.length,
        hiddenLeakBlocked: rejected.some((entry) => entry.hiddenLeakBlocked)
      })
    ],
    rejectedDiagnostics: rejected.map((entry) => ({
      code: entry.code,
      message: safeMessage(entry.message),
      hiddenLeakBlocked: entry.hiddenLeakBlocked === true,
      rawValuesHidden: true
    })),
    rawValuesHidden: true
  };
}

export async function runSideMissionProviderAssistance({
  generationRouter,
  opportunityReview,
  roleId = SIDE_MISSION_PROVIDER_ROLE_IDS.candidateBuilder,
  candidateId = null,
  opportunityId = null,
  requestId = null
} = {}) {
  const normalizedRoleId = normalizeRoleId(roleId);
  requireObject(generationRouter, 'generationRouter');
  requireFunction(generationRouter.generate, 'generationRouter.generate');
  const request = buildSideMissionProviderAssistRequest({
    opportunityReview,
    roleId: normalizedRoleId,
    candidateId,
    opportunityId,
    requestId
  });
  const generationResult = await generationRouter.generate(normalizedRoleId, request);
  if (!generationResult.ok) {
    return resultFromDiagnostic({
      roleId: normalizedRoleId,
      status: 'failed',
      code: generationResult.error?.code || 'DIRECTIVE_SIDE_MISSION_PROVIDER_FAILED',
      message: generationResult.error?.message || 'Side-mission provider assistance failed.',
      generationResult,
      request
    });
  }

  let payload = null;
  try {
    payload = parseSideMissionProviderResponse(generationResult.response);
  } catch (error) {
    return resultFromDiagnostic({
      roleId: normalizedRoleId,
      status: 'rejected',
      code: error?.code || 'DIRECTIVE_SIDE_MISSION_PROVIDER_INVALID_JSON',
      message: error?.message || 'Provider returned invalid structured JSON.',
      generationResult,
      request,
      hiddenLeakBlocked: error?.hiddenLeakBlocked === true
    });
  }

  const validated = validateSideMissionProviderPayload({
    payload,
    opportunityReview,
    roleId: normalizedRoleId
  });

  return {
    kind: 'directive.sideMissionProviderAssistResult',
    ok: validated.ok,
    status: validated.status,
    roleId: normalizedRoleId,
    request,
    proposals: cloneJson(validated.proposals),
    diagnostics: validated.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      providerId: diagnostic.providerId || generationResult.diagnostics?.providerId || null,
      model: diagnostic.model || generationResult.diagnostics?.model || null
    })),
    rejectedDiagnostics: cloneJson(validated.rejectedDiagnostics || []),
    proposalOnly: true,
    providerOutputStored: false,
    campaignStateMutated: false,
    rawValuesHidden: true
  };
}

export function applySideMissionProviderAssistResult({
  campaignState,
  result,
  appliedAt = null
} = {}) {
  requireObject(campaignState, 'campaignState');
  requireObject(result, 'sideMissionProviderAssistResult');
  const nextState = cloneJson(campaignState);
  const sideMissions = ensureSideMissions(nextState);
  const requestId = requestIdFromResult(result);
  const proposals = asArray(result.proposals).map((proposal) => persistedProposal(proposal, {
    result,
    requestId,
    appliedAt
  }));
  const diagnostics = [
    ...asArray(result.diagnostics),
    ...asArray(result.rejectedDiagnostics)
  ].map((diagnostic) => persistedDiagnostic(diagnostic, {
    result,
    requestId,
    appliedAt
  }));

  for (const proposal of proposals) {
    if (!validateNoHiddenText(proposal)) {
      throw new Error('Refusing to persist hidden or Director-only provider proposal text.');
    }
    sideMissions.providerAssistProposals = upsertById(sideMissions.providerAssistProposals, proposal);
  }
  for (const diagnostic of diagnostics) {
    if (!validateNoHiddenText(diagnostic)) {
      throw new Error('Refusing to persist hidden or Director-only provider diagnostic text.');
    }
    sideMissions.providerAssistDiagnostics = upsertById(sideMissions.providerAssistDiagnostics, diagnostic);
  }
  sideMissions.lastProviderAssistRequestId = requestId;
  sideMissions.lastProviderAssistStatus = result.status || null;

  return {
    kind: 'directive.committedSideMissionProviderAssistDiagnostics',
    requestId,
    acceptedProposalCount: proposals.length,
    diagnosticCount: diagnostics.length,
    proposals: cloneJson(proposals),
    diagnostics: cloneJson(diagnostics),
    campaignState: nextState,
    proposalOnly: true,
    providerOutputStored: false,
    rawValuesHidden: true
  };
}
