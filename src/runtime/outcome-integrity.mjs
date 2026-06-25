import { parseStructuredJsonText } from '../providers/structured-output-parser.mjs';
import { stripCampaignReplyHeader } from '../time/campaign-time-header.mjs';

export const OUTCOME_INTEGRITY_ROLE_ID = 'outcomeIntegrityReview';
export const OUTCOME_INTEGRITY_SCHEMA_ID = 'directive.outcomeIntegrityReview.v1';
export const OUTCOME_INTEGRITY_EDIT_ACTION_ID = 'outcomeIntegrity.editProse';
export const OUTCOME_INTEGRITY_EDIT_CHAR_LIMIT = 10000;
export const OUTCOME_INTEGRITY_REVIEW_TIMEOUT_MS = Object.freeze({
  utility: 45000,
  reasoning: 120000
});

export const OUTCOME_INTEGRITY_MODES = Object.freeze(['strict', 'relaxed', 'off']);
export const OUTCOME_INTEGRITY_REVIEW_PROVIDER_KINDS = Object.freeze(['utility', 'reasoning']);

export const DEFAULT_OUTCOME_INTEGRITY_SETTINGS = Object.freeze({
  mode: 'strict',
  reviewProviderKind: 'utility'
});

const REVIEW_VERDICTS = Object.freeze(['accept', 'reject', 'needs_review']);
const REVIEW_CATEGORIES = Object.freeze([
  'outcome_change',
  'cost_or_consequence_change',
  'fact_change',
  'relationship_change',
  'command_bearing_change',
  'dialogue_commitment_change',
  'hidden_state_leak',
  'unsupported_edit',
  'review_failed'
]);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact(value = '', maxLength = 1000) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeExactText(value = '') {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

export function outcomeIntegrityTextHash(value = '') {
  let hash = 0x811c9dc5;
  for (const char of normalizeExactText(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function normalizeOutcomeIntegrityMode(value, fallback = DEFAULT_OUTCOME_INTEGRITY_SETTINGS.mode) {
  const mode = String(value || fallback || '').trim().toLowerCase();
  return OUTCOME_INTEGRITY_MODES.includes(mode) ? mode : DEFAULT_OUTCOME_INTEGRITY_SETTINGS.mode;
}

export function normalizeOutcomeIntegrityReviewProviderKind(value, fallback = DEFAULT_OUTCOME_INTEGRITY_SETTINGS.reviewProviderKind) {
  const kind = String(value || fallback || '').trim().toLowerCase();
  return OUTCOME_INTEGRITY_REVIEW_PROVIDER_KINDS.includes(kind) ? kind : DEFAULT_OUTCOME_INTEGRITY_SETTINGS.reviewProviderKind;
}

export function normalizeOutcomeIntegritySettings(settings = {}) {
  const source = isObject(settings?.outcomeIntegrity)
    ? settings.outcomeIntegrity
    : (isObject(settings) ? settings : {});
  return {
    mode: normalizeOutcomeIntegrityMode(source.mode ?? settings?.outcomeIntegrityMode),
    reviewProviderKind: normalizeOutcomeIntegrityReviewProviderKind(
      source.reviewProviderKind ?? settings?.outcomeIntegrityReviewProviderKind
    )
  };
}

export function applyOutcomeIntegritySettings(campaignState, settings = {}) {
  if (!campaignState) return campaignState;
  const current = normalizeOutcomeIntegritySettings(campaignState.settings || {});
  const patch = isObject(settings?.outcomeIntegrity) ? settings.outcomeIntegrity : settings;
  const nextSettings = {
    mode: normalizeOutcomeIntegrityMode(patch.mode ?? patch.outcomeIntegrityMode ?? current.mode, current.mode),
    reviewProviderKind: normalizeOutcomeIntegrityReviewProviderKind(
      patch.reviewProviderKind ?? patch.outcomeIntegrityReviewProviderKind ?? current.reviewProviderKind,
      current.reviewProviderKind
    )
  };
  return {
    ...campaignState,
    settings: {
      ...(campaignState.settings || {}),
      outcomeIntegrity: nextSettings
    }
  };
}

export function outcomeIntegrityWordCount(value = '') {
  const words = normalizeExactText(value).match(/\S+/g);
  return words ? words.length : 0;
}

function responseKind(response = {}, message = {}) {
  return compact(
    response.responseKind
    || message?.metadata?.responseKind
    || message?.raw?.extra?.directive?.responseKind
    || '',
    80
  );
}

export function findOutcomeIntegrityResponse(campaignState, hostMessageId) {
  const id = compact(hostMessageId, 120);
  if (!id) return null;
  return asArray(campaignState?.runtimeTracking?.responseLedger)
    .find((entry) => compact(entry?.hostMessageId, 120) === id) || null;
}

export function isOutcomeIntegrityProtectedResponse(response = {}, message = {}) {
  if (!response || !isObject(response)) return false;
  if (!compact(response.hostMessageId, 120)) return false;
  if (!compact(response.outcomeId, 160)) return false;
  if (['invalidated', 'recoveryRequired'].includes(String(response.status || ''))) return false;
  const kind = responseKind(response, message);
  if (kind === 'campaignIntro' || kind === 'hostGeneration') return false;
  return true;
}

export function outcomeIntegrityStatusForMessage({ campaignState = null, message = null, hostMessageId = null } = {}) {
  const settings = normalizeOutcomeIntegritySettings(campaignState?.settings || {});
  const id = compact(hostMessageId || message?.hostMessageId || message?.id, 120);
  if (!campaignState) return { protected: false, mode: settings.mode, reason: 'no-campaign-state', nativeEdit: 'allow' };
  if (settings.mode === 'off') return { protected: false, mode: settings.mode, reason: 'off', nativeEdit: 'allow' };
  if (!message) return { protected: false, mode: settings.mode, reason: 'message-unavailable', nativeEdit: 'allow' };
  if (message.isUser === true || message.role === 'user') {
    return { protected: false, mode: settings.mode, reason: 'player-message', nativeEdit: 'allow' };
  }
  if (message.isDirectiveOwned !== true && message.directiveOwned !== true) {
    return { protected: false, mode: settings.mode, reason: 'not-directive-owned', nativeEdit: 'allow' };
  }
  const response = findOutcomeIntegrityResponse(campaignState, id);
  if (!isOutcomeIntegrityProtectedResponse(response, message)) {
    return { protected: false, mode: settings.mode, reason: response ? 'unprotected-response-kind' : 'response-not-recorded', nativeEdit: 'allow' };
  }
  return {
    protected: true,
    mode: settings.mode,
    reviewProviderKind: settings.reviewProviderKind,
    response: cloneJson(response),
    nativeEdit: settings.mode === 'strict' ? 'intercept' : 'allow-review-after'
  };
}

function commandLogForOutcome(campaignState, outcomeId) {
  return asArray(campaignState?.commandLog?.entries || campaignState?.commandLog)
    .filter((entry) => compact(entry?.sourceOutcomeId, 160) === outcomeId)
    .flatMap((entry) => [
      ...asArray(entry.summaryInputs).map((item) => compact(item, 240)),
      ...asArray(entry.visibleConsequences).map((item) => compact(item, 240))
    ])
    .filter(Boolean)
    .slice(0, 10);
}

function domainSummary(value) {
  if (!isObject(value)) return [];
  return Object.keys(value).filter((key) => {
    const item = value[key];
    if (Array.isArray(item)) return item.length > 0;
    if (isObject(item)) return Object.keys(item).length > 0;
    return item !== undefined && item !== null && item !== '';
  }).slice(0, 16);
}

export function buildOutcomeIntegrityLockedContext(campaignState, response = {}) {
  const outcomeId = compact(response.outcomeId, 160);
  const ledgerEntry = asArray(campaignState?.turnLedger?.entries).find((entry) => compact(entry?.outcomeId, 160) === outcomeId) || null;
  const commandLog = commandLogForOutcome(campaignState, outcomeId);
  const stateDelta = isObject(ledgerEntry?.stateDelta) ? ledgerEntry.stateDelta : {};
  const commandBearingDelta = stateDelta.commandBearing || stateDelta.commandStyle || null;
  return {
    outcomeId: outcomeId || null,
    turnId: compact(response.turnId || ledgerEntry?.turnId, 160) || null,
    responseKind: responseKind(response) || null,
    resultBand: compact(ledgerEntry?.resultBand, 80) || null,
    commandLog,
    changedDomains: domainSummary(stateDelta),
    commandBearing: commandBearingDelta ? {
      changed: true,
      earnedCount: asArray(commandBearingDelta.earnedRecordsAdd || commandBearingDelta.commandMarksAdd).length,
      evidenceCount: asArray(commandBearingDelta.evidenceRecordsAdd).length,
      reviewCount: asArray(commandBearingDelta.reviewRecordsAdd).length,
      hasReadiedChange: commandBearingDelta.readied !== undefined
    } : { changed: false },
    relationshipChangeCount: asArray(stateDelta.relationships?.descriptiveChanges).length,
    pressureChangeCount: asArray(stateDelta.pressureLedger?.recordsAdd || stateDelta.pressureLedger?.eventsAdd).length
  };
}

export function buildOutcomeIntegrityEditContext({ campaignState = null, message = null, hostMessageId = null } = {}) {
  const status = outcomeIntegrityStatusForMessage({ campaignState, message, hostMessageId });
  if (!status.protected) {
    return {
      ok: false,
      ...status,
      summary: 'This message is not protected by Outcome Integrity.'
    };
  }
  const text = normalizeExactText(message?.text || message?.raw?.mes || '');
  const response = status.response;
  const lockedContext = buildOutcomeIntegrityLockedContext(campaignState, response);
  return {
    ok: true,
    protected: true,
    mode: status.mode,
    reviewProviderKind: status.reviewProviderKind,
    hostMessageId: compact(hostMessageId || message?.hostMessageId || message?.id, 120),
    response,
    responseId: response?.id || null,
    responseKind: responseKind(response, message) || null,
    currentText: text,
    baseTextHash: outcomeIntegrityTextHash(text),
    wordCount: outcomeIntegrityWordCount(text),
    charCount: text.length,
    editCharLimit: OUTCOME_INTEGRITY_EDIT_CHAR_LIMIT,
    lockedContext,
    guidance: 'Prose edit only. Dialogue and wording can change; committed outcomes, costs, facts, relationships, and Command Bearing cannot.'
  };
}

export function validateOutcomeIntegrityProposedEdit({ context = null, proposedText = '', currentText = null, baseTextHash = null } = {}) {
  const proposed = normalizeExactText(proposedText);
  if (!context?.ok) return { ok: false, reason: 'context-unavailable', message: context?.summary || 'Outcome Integrity context is unavailable.' };
  if (!proposed) return { ok: false, reason: 'empty-edit', message: 'Enter prose before submitting the edit.' };
  if (proposed.length > OUTCOME_INTEGRITY_EDIT_CHAR_LIMIT) {
    return {
      ok: false,
      reason: 'edit-too-long',
      message: `Edits are limited to ${OUTCOME_INTEGRITY_EDIT_CHAR_LIMIT.toLocaleString()} characters.`
    };
  }
  const current = normalizeExactText(currentText ?? context.currentText);
  const expectedHash = compact(baseTextHash || context.baseTextHash, 80);
  if (expectedHash && outcomeIntegrityTextHash(current) !== expectedHash) {
    return {
      ok: false,
      reason: 'stale-base',
      message: 'The selected message changed while the editor was open. Reopen Edit Prose and try again.'
    };
  }
  if (outcomeIntegrityTextHash(proposed) === outcomeIntegrityTextHash(current)) {
    return { ok: false, reason: 'unchanged', message: 'The proposed edit matches the current selected prose.' };
  }
  return { ok: true, proposedText: proposed };
}

export function composeOutcomeIntegrityReviewRequest({ context, proposedText }) {
  const lockedContext = context?.lockedContext || {};
  const system = [
    'You are the Outcome Integrity reviewer for Directive.',
    'Decide whether a player prose edit preserves the already committed campaign outcome.',
    'Accept wording, pacing, grammar, verbosity, and dialogue cleanup edits when they preserve the same commitments.',
    'Reject edits that change outcomes, costs, facts, relationships, Command Bearing, obligations, warnings, knowledge, or hidden state.',
    'Return only JSON matching the requested schema.'
  ].join('\n');
  const user = [
    `Schema: ${OUTCOME_INTEGRITY_SCHEMA_ID}`,
    '',
    'Locked committed context:',
    JSON.stringify(lockedContext, null, 2),
    '',
    'Current assistant prose:',
    stripCampaignReplyHeader(context?.currentText || ''),
    '',
    'Proposed player edit:',
    stripCampaignReplyHeader(proposedText || ''),
    '',
    'Return JSON with keys: schema, verdict, categories, reason, safeSummary.',
    'verdict must be one of: accept, reject, needs_review.',
    'categories may include: outcome_change, cost_or_consequence_change, fact_change, relationship_change, command_bearing_change, dialogue_commitment_change, hidden_state_leak, unsupported_edit.'
  ].join('\n');
  return {
    systemPrompt: system,
    prompt: `${system}\n\n${user}`,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    parameters: {
      temperature: 0,
      top_p: 1,
      max_tokens: 700
    },
    metadata: {
      source: 'outcome-integrity-review',
      schema: OUTCOME_INTEGRITY_SCHEMA_ID,
      hostMessageId: context?.hostMessageId || null,
      responseId: context?.responseId || null
    }
  };
}

function generatedText(generation = {}) {
  return String(
    generation?.response?.text
    || generation?.response?.content
    || generation?.text
    || ''
  ).trim();
}

export function normalizeOutcomeIntegrityReviewOutput(value = {}) {
  if (!isObject(value)) {
    return {
      ok: false,
      verdict: 'reject',
      categories: ['review_failed'],
      reason: 'Provider review did not return an object.'
    };
  }
  if (value.schema !== OUTCOME_INTEGRITY_SCHEMA_ID) {
    return {
      ok: false,
      verdict: 'reject',
      categories: ['review_failed'],
      reason: 'Provider review returned the wrong schema.'
    };
  }
  const verdict = String(value.verdict || '').trim().toLowerCase();
  if (!REVIEW_VERDICTS.includes(verdict)) {
    return {
      ok: false,
      verdict: 'reject',
      categories: ['review_failed'],
      reason: 'Provider review returned an unsupported verdict.'
    };
  }
  const categories = asArray(value.categories)
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => REVIEW_CATEGORIES.includes(item));
  const reason = compact(value.reason || value.summary || value.safeSummary, 600);
  if (verdict !== 'accept' && !reason) {
    return {
      ok: false,
      verdict: 'reject',
      categories: categories.length ? categories : ['review_failed'],
      reason: 'Provider review rejected the edit without a usable explanation.'
    };
  }
  return {
    ok: true,
    schema: OUTCOME_INTEGRITY_SCHEMA_ID,
    verdict,
    accepted: verdict === 'accept',
    categories,
    reason: reason || 'Edit preserves the committed outcome.',
    safeSummary: compact(value.safeSummary || reason, 600),
    raw: cloneJson(value)
  };
}

function reviewFailed(reason, generation = null) {
  return {
    ok: true,
    schema: OUTCOME_INTEGRITY_SCHEMA_ID,
    verdict: 'reject',
    accepted: false,
    categories: ['review_failed'],
    reason: compact(reason, 600) || 'Outcome Integrity could not complete the review.',
    safeSummary: 'Review failed.',
    generation: cloneJson(generation)
  };
}

export async function reviewOutcomeIntegrityEdit({
  generationRouter = null,
  context = null,
  proposedText = '',
  providerKind = null
} = {}) {
  if (!generationRouter || typeof generationRouter.generate !== 'function') {
    return reviewFailed('Outcome Integrity review provider is unavailable.');
  }
  const request = composeOutcomeIntegrityReviewRequest({ context, proposedText });
  const reviewProviderKind = normalizeOutcomeIntegrityReviewProviderKind(providerKind || context?.reviewProviderKind);
  const generation = await generationRouter.generate(OUTCOME_INTEGRITY_ROLE_ID, request, {
    providerKind: reviewProviderKind,
    timeoutMs: OUTCOME_INTEGRITY_REVIEW_TIMEOUT_MS[reviewProviderKind] || OUTCOME_INTEGRITY_REVIEW_TIMEOUT_MS.utility
  });
  if (!generation?.ok) {
    return reviewFailed(generation?.error?.message || 'Outcome Integrity review provider failed.', generation);
  }
  const parsed = parseStructuredJsonText(generatedText(generation), { requireObject: true });
  if (!parsed.ok) {
    return reviewFailed(parsed.error || 'Outcome Integrity review output was not valid JSON.', generation);
  }
  const normalized = normalizeOutcomeIntegrityReviewOutput(parsed.value);
  return {
    ...normalized,
    generation: cloneJson(generation),
    repaired: parsed.repaired === true
  };
}

export function outcomeIntegrityFailureSummary(review = {}) {
  const categories = asArray(review.categories);
  if (categories.includes('command_bearing_change')) return 'This edit changes Command Bearing or its recognition.';
  if (categories.includes('outcome_change')) return 'This edit changes the committed outcome.';
  if (categories.includes('cost_or_consequence_change')) return 'This edit changes a committed cost or consequence.';
  if (categories.includes('relationship_change')) return 'This edit changes a committed relationship result.';
  if (categories.includes('dialogue_commitment_change')) return 'This edit changes what a character committed to in dialogue.';
  if (categories.includes('fact_change')) return 'This edit changes a committed fact.';
  if (categories.includes('hidden_state_leak')) return 'This edit exposes or alters hidden state.';
  if (categories.includes('review_failed')) return 'Outcome Integrity could not verify the edit.';
  return review.reason || 'This edit does not preserve the committed outcome.';
}

export function createOutcomeIntegrityRevisionRecord({
  context,
  proposedText,
  review,
  now = null
} = {}) {
  const editedAt = typeof now === 'function' ? now() : (now || new Date().toISOString());
  const existing = asArray(context?.response?.outcomeIntegrity?.revisions);
  const revisionIndex = existing.length + 1;
  const sourceResponseId = context?.responseId || `response:${context?.hostMessageId || 'unknown'}`;
  return {
    id: `${sourceResponseId}:player-edit:${revisionIndex}`,
    sourceResponseId,
    hostMessageId: context?.hostMessageId || null,
    baseTextHash: context?.baseTextHash || null,
    textHash: outcomeIntegrityTextHash(proposedText),
    editedAt,
    reviewProviderKind: context?.reviewProviderKind || DEFAULT_OUTCOME_INTEGRITY_SETTINGS.reviewProviderKind,
    reviewVerdict: review?.verdict || null,
    reviewCategories: cloneJson(review?.categories || []),
    reviewReason: review?.reason || null
  };
}
