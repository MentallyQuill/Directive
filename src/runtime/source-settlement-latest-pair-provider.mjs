import { parseStructuredJsonText } from '../providers/structured-output-parser.mjs';
import { getDefaultGenerationRoleDefinitions } from '../generation/generation-roles.mjs';
import {
  SOURCE_SETTLEMENT_LATEST_PAIR_MODE,
  SOURCE_SETTLEMENT_LATEST_PAIR_PROJECTION_SOURCE,
  SOURCE_SETTLEMENT_LATEST_PAIR_ROLE_ID
} from './source-settlement-latest-pair-contract.mjs';

const LATEST_PAIR_SOURCE_SETTLEMENT_TIMEOUT_MS = getDefaultGenerationRoleDefinitions()[SOURCE_SETTLEMENT_LATEST_PAIR_ROLE_ID]?.timeoutMs || 45000;
const KIND = 'directive.sceneHandshakeSettlement.v1';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function selectedAssistantVariantLedgerRecord(variant = null) {
  if (!variant || typeof variant !== 'object' || Array.isArray(variant)) return null;
  return {
    kind: 'directive.selectedAssistantVariant.v1',
    hostMessageId: variant.hostMessageId || null,
    selectedVariantId: variant.selectedVariantId || variant.variantId || null,
    selectedSwipeIndex: Number.isInteger(variant.selectedSwipeIndex) ? variant.selectedSwipeIndex : null,
    swipeCount: Number.isInteger(variant.swipeCount) ? variant.swipeCount : null,
    visibleTextHash: variant.visibleTextHash || null,
    selectedTextHash: variant.selectedTextHash || variant.textHash || null,
    sourceIntegrity: variant.sourceIntegrity || 'clean',
    directiveOwned: variant.directiveOwned === true,
    responseId: variant.responseId || null,
    outcomeId: variant.outcomeId || null
  };
}

function timeoutError(code, message, timeoutMs) {
  const error = new Error(message);
  error.code = code;
  error.timeoutMs = timeoutMs;
  return error;
}

async function withTimeout(promise, timeoutMs, errorFactory) {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timeoutId = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(errorFactory()), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function responseText(generated = {}) {
  return generated?.response?.text
    || generated?.response?.content
    || generated?.response?.raw?.text
    || generated?.text
    || generated?.content
    || '';
}

export function createLatestPairSourceSettlementPrompt(snapshot) {
  const system = [
    'You are Directive Scene Handshake, a Utility-lane state settlement checker.',
    'Decide whether the current player reply accepts the immediately previous assistant response as current fiction.',
    'Extract only explicit player-visible command-log-worthy facts, low-risk ship technical-debt/readiness notes, thread evidence, and current orders placed on the player command character from that previous assistant response.',
    'openAssignmentProposals is only for obligations assigned to the player character. Do not put orders the player gave to crew, crew acknowledgements, delegated department tasks, or subordinate work items in openAssignmentProposals.',
    'For each openAssignmentProposals item, include a brief headline title, one concise detail sentence, assignedByActorId when known, and assignedActorIds containing the player id when the order is on the player.',
    'If the previous assistant response gives numbered, ordinal, or clearly stated assignments to the player and the player accepts or acts on them, openAssignmentProposals must contain one proposal per accepted player assignment.',
    'Do not return acceptedPreviousResponse true with empty proposal arrays when explicit current orders on the player, objectives, or readiness issues were accepted.',
    'Do not infer hidden motives, private relationship values, terminal outcomes, formal objective progress, Command Bearing awards, damage, casualties, or mission phase changes.',
    'Return one strict JSON object only. Do not narrate and do not include markdown.',
    'If the player rejects, corrects, rerolls, or challenges the previous assistant response, return acceptedPreviousResponse false and disposition "defer".',
    'Use this shape:',
    '{"kind":"directive.sceneHandshakeSettlement.v1","acceptedPreviousResponse":true,"playerReplyRelation":"acknowledges","confidence":0.9,"disposition":"autoCommit","needsInternalReview":false,"internalReviewReasons":[],"deferReason":null,"operatorRecoveryOnly":false,"openAssignmentProposals":[],"commandLogProposals":[],"shipReadinessProposals":[],"threadSignals":[]}'
  ].join('\n');
  const user = [
    'Scene Handshake snapshot:',
    JSON.stringify(snapshot, null, 2)
  ].join('\n');
  return {
    prompt: `${system}\n\n${user}`,
    systemPrompt: system,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    metadata: {
      source: SOURCE_SETTLEMENT_LATEST_PAIR_PROJECTION_SOURCE,
      sourceSettlementMode: SOURCE_SETTLEMENT_LATEST_PAIR_MODE,
      snapshotKind: snapshot.kind,
      campaignId: snapshot.envelope.campaignId,
      chatId: snapshot.envelope.chatId,
      previousAssistantHostMessageId: snapshot.source.previousAssistant.hostMessageId,
      currentPlayerHostMessageId: snapshot.source.currentPlayer.hostMessageId,
      selectedAssistantVariant: selectedAssistantVariantLedgerRecord(snapshot.source.previousAssistant.selectedVariant),
      promptBudget: cloneJson(snapshot.budget),
      optionalSlicesIncluded: cloneJson(snapshot.budget?.optionalSlicesIncluded || []),
      sourceTextHashes: cloneJson({
        previousAssistant: snapshot.source.previousAssistant.textHash,
        selectedAssistantVariant: snapshot.source.previousAssistant.selectedVariant?.selectedTextHash || snapshot.source.previousAssistant.textHash,
        currentPlayer: snapshot.source.currentPlayer.textHash,
        range: snapshot.source.sourceRangeHash
      })
    }
  };
}

export function parseLatestPairSourceSettlementOutput(value) {
  const parsed = typeof value === 'string'
    ? parseStructuredJsonText(value)
    : { ok: value && typeof value === 'object' && !Array.isArray(value), value };
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: 'DIRECTIVE_SOURCE_SETTLEMENT_LATEST_PAIR_PARSE_FAILED',
        message: parsed.error || parsed.diagnostic?.message || 'SRE latest-pair output was not valid JSON.',
        diagnostic: cloneJson(parsed.diagnostic || null)
      }
    };
  }
  if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    return {
      ok: false,
      error: {
        code: 'DIRECTIVE_SOURCE_SETTLEMENT_LATEST_PAIR_OBJECT_REQUIRED',
        message: 'SRE latest-pair output must be a JSON object.'
      }
    };
  }
  return { ok: true, value: cloneJson(parsed.value) };
}

export function createLatestPairSourceSettlementProvider({
  generationRouter = null,
  now = null,
  validateLatestPairSettlement = null
} = {}) {
  return async function runLatestPairSourceSettlementProvider(payload = {}) {
    const snapshot = payload.snapshot || null;
    if (!snapshot) {
      const error = new Error('SRE latest-pair settlement requires a Scene Handshake snapshot.');
      error.code = 'DIRECTIVE_SOURCE_SETTLEMENT_LATEST_PAIR_MISSING_SNAPSHOT';
      throw error;
    }
    if (typeof generationRouter?.generate !== 'function') {
      const error = new Error('SRE latest-pair settlement requires generationRouter.generate().');
      error.code = 'DIRECTIVE_SOURCE_SETTLEMENT_LATEST_PAIR_NO_GENERATOR';
      throw error;
    }
    if (typeof validateLatestPairSettlement !== 'function') {
      const error = new Error('SRE latest-pair settlement requires validateLatestPairSettlement().');
      error.code = 'DIRECTIVE_SOURCE_SETTLEMENT_LATEST_PAIR_NO_VALIDATOR';
      throw error;
    }
    const request = createLatestPairSourceSettlementPrompt(snapshot);
    let generation = null;
    try {
      generation = await withTimeout(
        Promise.resolve(generationRouter.generate(
          SOURCE_SETTLEMENT_LATEST_PAIR_ROLE_ID,
          request,
          { timeoutMs: LATEST_PAIR_SOURCE_SETTLEMENT_TIMEOUT_MS }
        )),
        LATEST_PAIR_SOURCE_SETTLEMENT_TIMEOUT_MS,
        () => timeoutError(
          'DIRECTIVE_SOURCE_SETTLEMENT_LATEST_PAIR_PROVIDER_TIMEOUT',
          'SRE latest-pair provider timed out before returning output.',
          LATEST_PAIR_SOURCE_SETTLEMENT_TIMEOUT_MS
        )
      );
    } catch (error) {
      const wrapped = new Error('SRE latest-pair provider threw before returning output.');
      wrapped.code = error?.code || 'DIRECTIVE_SOURCE_SETTLEMENT_LATEST_PAIR_PROVIDER_THROW';
      wrapped.providerId = error?.providerId || null;
      wrapped.latencyMs = error?.latencyMs ?? null;
      wrapped.timeoutMs = error?.timeoutMs ?? null;
      throw wrapped;
    }
    const text = responseText(generation);
    if (!generation?.ok || !text) {
      const error = new Error('SRE latest-pair provider returned no usable output.');
      error.code = 'DIRECTIVE_SOURCE_SETTLEMENT_LATEST_PAIR_PROVIDER_EMPTY';
      error.providerId = generation?.diagnostics?.providerId || generation?.response?.providerId || null;
      error.latencyMs = generation?.diagnostics?.latencyMs ?? null;
      throw error;
    }
    const parse = parseLatestPairSourceSettlementOutput(text);
    if (!parse.ok) {
      const error = new Error('SRE latest-pair provider returned invalid settlement JSON.');
      error.code = 'DIRECTIVE_SOURCE_SETTLEMENT_LATEST_PAIR_PARSE_FAILED';
      error.providerId = generation?.diagnostics?.providerId || generation?.response?.providerId || null;
      error.latencyMs = generation?.diagnostics?.latencyMs ?? null;
      throw error;
    }
    const validation = validateLatestPairSettlement(parse.value, {
      campaignState: payload.campaignState,
      snapshot,
      settlementId: payload.settlementId,
      recordedAt: payload.observedAt || timestamp(now)
    });
    if (validation.disposition !== 'autoCommit' && validation.settlement?.acceptedPreviousResponse) {
      const error = new Error(`SRE latest-pair provider output rejected: ${validation.reasons.join(', ') || validation.disposition}.`);
      error.code = 'DIRECTIVE_SOURCE_SETTLEMENT_LATEST_PAIR_VALIDATION_REJECTED';
      error.providerId = generation?.diagnostics?.providerId || generation?.response?.providerId || null;
      error.latencyMs = generation?.diagnostics?.latencyMs ?? null;
      throw error;
    }
    return {
      settlement: validation.settlement,
      operations: validation.operations,
      generation: {
        ok: generation.ok === true,
        diagnostics: cloneJson(generation.diagnostics || null),
        response: {
          providerId: generation?.response?.providerId || null,
          model: generation?.response?.model || null
        }
      },
      parse: {
        ok: true
      },
      reasons: cloneJson(validation.reasons || [])
    };
  };
}

export const LATEST_PAIR_SOURCE_SETTLEMENT_PROVIDER_KIND = KIND;
