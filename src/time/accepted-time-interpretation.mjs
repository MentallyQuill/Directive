import { explicitDurationSeconds, inspectEnactedDurationEvidence } from './time-evidence.mjs';
const TIME_DECISION_VALUES = new Set(['advance', 'unchanged', 'indeterminate']);
const SOURCE_SLOTS = new Set(['previousAssistant', 'currentPlayer']);
const MAX_TIME_ADVANCE_SECONDS = 31 * 24 * 60 * 60;
const MIN_EVIDENCE_QUOTE_LENGTH = 12;
const MAX_EVIDENCE_QUOTE_LENGTH = 240;
const TIME_FIELDS = new Set([
    'decision', 'elapsedSeconds', 'reason', 'confidence', 'durationSeconds', 'durationSourceSlot', 'durationEvidenceQuote',
    'basis', 'sourceSlot', 'evidenceQuote',
]);
const TIME_BASES = new Set(['explicitDuration', 'implicitAction', 'sceneTransition', 'noPassage', 'unresolved']);

function unknownFields(value, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    return Object.keys(value).filter((key) => !allowed.has(key));
}

function normalizedEvidenceText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function evidenceQuoteErrors(value, sourcePair, path, limits = {}) {
    const quote = normalizedEvidenceText(value?.evidenceQuote);
    const errors = [];
    if (quote.length < MIN_EVIDENCE_QUOTE_LENGTH || quote.length > (limits.timeEvidenceQuoteCharacters ?? MAX_EVIDENCE_QUOTE_LENGTH)) {
        errors.push(`${path}.evidenceQuote must contain 12 through ${limits.timeEvidenceQuoteCharacters ?? 240} characters`);
        return errors;
    }
    const sourceText = normalizedEvidenceText(sourcePair?.[value?.sourceSlot]?.text);
    if (!sourceText.includes(quote)) {
        errors.push(`${path}.evidenceQuote must occur in its authorized source`);
    }
    return errors;
}


export function createTimeInterpretationSchema({ limits = {} } = {}) {
    return {
        type: 'object',
        additionalProperties: false,
        required: ['decision', 'basis', 'elapsedSeconds', 'reason', 'confidence'],
        properties: {
            decision: { type: 'string', enum: [...TIME_DECISION_VALUES] },
            basis: { type: 'string', enum: [...TIME_BASES] },
            sourceSlot: { type: 'string', enum: [...SOURCE_SLOTS] },
            evidenceQuote: { type: 'string', minLength: 1, maxLength: limits.timeEvidenceQuoteCharacters ?? 240 },
            elapsedSeconds: { type: 'integer', minimum: 0, maximum: MAX_TIME_ADVANCE_SECONDS },
            reason: { type: 'string', minLength: 1, maxLength: limits.timeReasonCharacters ?? 180 },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            durationSeconds: { type: 'integer', minimum: 1, maximum: MAX_TIME_ADVANCE_SECONDS },
            durationSourceSlot: { type: 'string', enum: [...SOURCE_SLOTS] },
            durationEvidenceQuote: {
                type: 'string',
                minLength: MIN_EVIDENCE_QUOTE_LENGTH,
                maxLength: limits.timeEvidenceQuoteCharacters ?? MAX_EVIDENCE_QUOTE_LENGTH,
            },
        },
    };
}

export function acceptedPairTimeDecisionErrors(value, sourcePair = {}, assistantAcceptance = 'accepted', timeContext = {}, limits = {}) {
    const errors = [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ['time must be an object'];
    for (const field of unknownFields(value, TIME_FIELDS)) errors.push(`time contains unknown field: ${field}`);
    if (!TIME_DECISION_VALUES.has(value.decision)) errors.push('time.decision is unknown');
    if (!TIME_BASES.has(value.basis)) errors.push('time.basis is unknown');
    if (timeContext.scope?.countPreviousAssistant === false
        && (value.sourceSlot === 'previousAssistant' || value.durationSourceSlot === 'previousAssistant')) {
        errors.push('time opening-baseline passage must come from currentPlayer');
    }
    const expectedDecision = value.basis === 'noPassage' ? 'unchanged' : value.basis === 'unresolved' ? 'indeterminate' : 'advance';
    if (TIME_BASES.has(value.basis) && value.decision !== expectedDecision) errors.push('time.basis conflicts with time.decision');
    const hasActionEvidence = Object.hasOwn(value, 'sourceSlot') || Object.hasOwn(value, 'evidenceQuote');
    if (value.basis === 'implicitAction' || hasActionEvidence) {
        if (value.decision !== 'advance') errors.push('time action evidence is allowed only for advance');
        if (!SOURCE_SLOTS.has(value.sourceSlot)) errors.push('time.sourceSlot is unknown');
        const quote = normalizedEvidenceText(value.evidenceQuote);
        if (!quote || quote.length > (limits.timeEvidenceQuoteCharacters ?? 240) || !normalizedEvidenceText(sourcePair?.[value.sourceSlot]?.text).includes(quote)) {
            errors.push(`time.evidenceQuote must occur in its authorized source and contain 1 through ${limits.timeEvidenceQuoteCharacters ?? 240} characters`);
        }
        if (value.sourceSlot === 'previousAssistant' && assistantAcceptance !== 'accepted') {
            errors.push('time cannot be sourced solely from unaccepted assistant events; use surviving passage established by the player');
        }
    }
    if (!Number.isInteger(value.elapsedSeconds) || value.elapsedSeconds < 0) {
        errors.push('time.elapsedSeconds must be a nonnegative integer');
    } else if (value.elapsedSeconds > MAX_TIME_ADVANCE_SECONDS) {
        errors.push(`time.elapsedSeconds must not exceed ${MAX_TIME_ADVANCE_SECONDS}`);
    }
    if (value.decision === 'advance' && !(value.elapsedSeconds > 0)) {
        errors.push('time advance requires positive elapsedSeconds');
    }
    if (new Set(['unchanged', 'indeterminate']).has(value.decision) && value.elapsedSeconds !== 0) {
        errors.push(`time ${value.decision} requires zero elapsedSeconds`);
    }
    if (typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > (limits.timeReasonCharacters ?? 180)) {
        errors.push(`time.reason must be a nonempty string no longer than ${limits.timeReasonCharacters ?? 180} characters`);
    }
    if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
        errors.push('time.confidence must be between 0 and 1');
    }
    const hasDurationSource = Object.hasOwn(value, 'durationSourceSlot');
    const hasDurationQuote = Object.hasOwn(value, 'durationEvidenceQuote');
    const hasDurationSeconds = Object.hasOwn(value, 'durationSeconds');
    if (new Set(['explicitDuration', 'sceneTransition']).has(value.basis) && !hasDurationSource) {
        errors.push('time explicit passage or scene transition requires duration evidence');
    }
    if (value.decision === 'advance' && value.elapsedSeconds > 300 && !hasDurationSource) {
        errors.push('time advance beyond five minutes requires duration evidence');
    }
    if (new Set([hasDurationSource, hasDurationQuote, hasDurationSeconds]).size > 1) {
        errors.push('time duration evidence requires durationSeconds, durationSourceSlot, and durationEvidenceQuote together');
    } else if (hasDurationSource) {
        if (value.decision !== 'advance') errors.push('time duration evidence is allowed only for advance');
        if (!Number.isInteger(value.durationSeconds)
            || value.durationSeconds <= 0
            || value.durationSeconds > MAX_TIME_ADVANCE_SECONDS) {
            errors.push(`time.durationSeconds must be between 1 and ${MAX_TIME_ADVANCE_SECONDS}`);
        }
        const additionalSeconds = value.elapsedSeconds - value.durationSeconds;
        if (additionalSeconds !== 0 && !(value.basis === 'explicitDuration'
            && additionalSeconds > 0 && additionalSeconds <= 300 && hasActionEvidence
            && normalizedEvidenceText(value.evidenceQuote) !== normalizedEvidenceText(value.durationEvidenceQuote))) {
            errors.push('time.durationSeconds must equal time.elapsedSeconds unless separate evidence supports additional immediate action');
        }
        const quotedSeconds = explicitDurationSeconds(value.durationEvidenceQuote);
        if (quotedSeconds !== null && value.durationSeconds !== quotedSeconds) {
            errors.push(`time.durationSeconds must match the quoted duration of ${quotedSeconds} seconds`);
        }
        if (!SOURCE_SLOTS.has(value.durationSourceSlot)) errors.push('time.durationSourceSlot is unknown');
        if (value.durationSourceSlot === 'previousAssistant' && assistantAcceptance !== 'accepted') {
            errors.push('time duration cannot be sourced solely from unaccepted assistant events');
        }
        errors.push(...evidenceQuoteErrors({
            sourceSlot: value.durationSourceSlot,
            evidenceQuote: value.durationEvidenceQuote,
        }, sourcePair, 'time.duration', limits));
        const durationEvidence = inspectEnactedDurationEvidence({
            sourceText: sourcePair?.[value.durationSourceSlot]?.text,
            evidenceQuote: value.durationEvidenceQuote,
        });
        if (!durationEvidence.ok) {
            errors.push(`time.durationEvidenceQuote must show enacted forward time: ${durationEvidence.reasonCode}`);
        }
    }
    return errors;
}
