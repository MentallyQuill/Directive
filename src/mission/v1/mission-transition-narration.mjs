import { createHash } from 'node:crypto';

import { validateMissionJourney } from './mission-journey.mjs';
import { validateStorySettlement } from '../../story/story-settlement-contracts.mjs';
import { selectCurrentStoryEpisodes } from '../../story/story-settlement.mjs';

export const MISSION_TRANSITION_NARRATION_PACKET_KIND = 'directive.missionTransitionNarrationPacket.v1';
export const MISSION_TRANSITION_NARRATION_REQUEST_KIND = 'directive.missionTransitionNarrationRequest.v1';
export const MISSION_TRANSITION_NARRATION_CANDIDATE_KIND = 'directive.missionTransitionNarrationCandidate.v1';
export const MISSION_TRANSITION_NARRATION_REVIEW_REQUEST_KIND = 'directive.missionTransitionNarrationReviewRequest.v1';
export const MISSION_TRANSITION_NARRATION_REVIEW_KIND = 'directive.missionTransitionNarrationReview.v1';
export const MISSION_TRANSITION_NARRATION_FALLBACK_KIND = 'directive.missionTransitionNarrationFallback.v1';
export const MISSION_TRANSITION_NARRATION_CONTRACT_VERSION = 1;

const PACKET_FIELDS = new Set([
    'kind',
    'contractVersion',
    'transitionKey',
    'packageBinding',
    'branchId',
    'sourceRunId',
    'sourceMissionId',
    'sourceDefinitionVersion',
    'sourceDisposition',
    'next',
    'knownOutcomes',
    'visibleEffects',
    'mustNarrate',
    'mustNotReveal',
]);
const PACKAGE_FIELDS = new Set(['packageId', 'packageVersion']);
const NEXT_FIELDS = new Set(['kind', 'id', 'playerSafeSetup']);
const EFFECT_FIELDS = new Set(['id', 'type', 'targetId', 'value', 'summary']);
const CANDIDATE_FIELDS = new Set(['kind', 'transitionKey', 'text']);
const REVIEW_FIELDS = new Set(['kind', 'transitionKey', 'decision', 'reasonCodes', 'guidance']);
const REVIEW_DECISIONS = new Set(['accept', 'retry', 'reject']);
const REVIEW_REASON_CODES = new Set([
    'unauthorized-outcome',
    'transition-target-drift',
    'source-disposition-drift',
    'hidden-state-leak',
    'missing-required-beat',
    'contradiction',
    'prose-quality',
]);
const TARGET_KINDS = new Set(['mission', 'phase']);
const MAX_OUTCOMES = 12;
const MAX_VISIBLE_EFFECTS = 24;
const MAX_GUARDRAILS = 24;
const MAX_PACKET_TEXT = 1200;
const MAX_CANDIDATE_TEXT = 4000;
const MAX_GUIDANCE_TEXT = 600;

function cloneJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stableId(value) {
    return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(String(value ?? '').trim());
}

function unknownFields(value, allowed) {
    return isObject(value) ? Object.keys(value).filter((field) => !allowed.has(field)) : [];
}

function uniqueText(values = [], maximum = MAX_GUARDRAILS) {
    const result = [];
    for (const value of Array.isArray(values) ? values : []) {
        const text = compact(value);
        if (text && !result.includes(text)) result.push(text);
    }
    return result.slice(0, maximum);
}

function transitionError(reasonCode) {
    const error = new Error('V1 mission transition narration is unavailable.');
    error.code = 'DIRECTIVE_MISSION_TRANSITION_NARRATION_UNAVAILABLE';
    error.reasonCode = reasonCode;
    return error;
}

function stableTransitionKey(parts) {
    return `mission-transition.${createHash('sha256')
        .update(parts.map((part) => String(part ?? '')).join('|'))
        .digest('hex')
        .slice(0, 24)}`;
}

function definitionList(definitions = []) {
    return (Array.isArray(definitions) ? definitions : [])
        .map((entry) => entry?.definition || entry)
        .filter((entry) => isObject(entry));
}

function exactDefinition(definitions, definitionId) {
    const matches = definitionList(definitions).filter((definition) => definition.id === definitionId);
    return matches.length === 1 ? matches[0] : null;
}

function sourceTransitionRun(campaignState = {}) {
    const current = campaignState?.mission?.v1;
    const journey = campaignState?.mission?.v1Journey;
    if (current?.status === 'terminal' && current?.transitionReceipt?.packet && stableId(journey?.activeRunId)) {
        return { state: current, runId: journey.activeRunId };
    }
    const history = campaignState?.mission?.v1History;
    const archive = Array.isArray(history) ? history.at(-1) : null;
    if (archive?.state?.status === 'terminal' && archive?.state?.transitionReceipt?.packet) {
        return { state: archive.state, runId: archive.runId };
    }
    throw transitionError('transition-source-unavailable');
}

function visibleStoryEffects(campaignState, sourceDefinition) {
    const settlement = campaignState?.storySettlement;
    const validation = validateStorySettlement(settlement || {});
    if (!validation.ok) throw transitionError('story-settlement-invalid');
    const episodes = selectCurrentStoryEpisodes(settlement).filter(
        (episode) => (episode.references?.missionIds || []).includes(sourceDefinition.id),
    );
    const summaries = new Map([
        ...(sourceDefinition.facts || []).map((item) => [item.id, item.playerText?.summary]),
        ...(sourceDefinition.events || []).map((item) => [item.id, item.playerText?.summary]),
        ...(sourceDefinition.outcomes || []).map((item) => [item.id, item.playerText?.summary]),
    ]);
    const effects = [];
    for (const episode of episodes) {
        for (const effect of episode.effects || []) {
            if (effect.status !== 'active' || effect.playerVisibility !== 'visible') continue;
            if (effects.some((entry) => entry.id === effect.id)) continue;
            effects.push({
                id: effect.id,
                type: effect.type,
                targetId: effect.targetId ?? null,
                ...(Object.hasOwn(effect, 'value') ? { value: cloneJson(effect.value) } : {}),
                ...(compact(summaries.get(effect.targetId)) ? { summary: compact(summaries.get(effect.targetId)) } : {}),
            });
        }
    }
    return effects.slice(-MAX_VISIBLE_EFFECTS);
}

export function createMissionTransitionNarrationPacket({
    campaignState = {},
    definitions = [],
} = {}) {
    const availableDefinitions = definitionList(definitions);
    const source = sourceTransitionRun(campaignState);
    const sourceDefinition = exactDefinition(availableDefinitions, source.state.definitionId);
    if (!sourceDefinition) throw transitionError('transition-source-definition-unavailable');
    const journey = validateMissionJourney({ campaignState, definitions: availableDefinitions });
    if (!journey.ok) throw transitionError('mission-journey-invalid');
    const receipt = source.state.transitionReceipt;
    const packet = receipt.packet;
    if (packet.sourceMissionId !== sourceDefinition.id
        || packet.sourceDisposition !== source.state.terminalDisposition
        || JSON.stringify(packet.next) !== JSON.stringify(receipt.target)) {
        throw transitionError('transition-receipt-invalid');
    }
    const branchId = campaignState?.campaignChatBinding?.saveId;
    const activePackage = campaignState?.activeCampaignPackage || {};
    if (!stableId(branchId)
        || activePackage.packageId !== sourceDefinition.packageBinding.packageId
        || activePackage.packageVersion !== sourceDefinition.packageBinding.packageVersion) {
        throw transitionError('transition-package-or-branch-mismatch');
    }
    const knownOutcomes = uniqueText([
        ...(packet.playerKnownOutcomeSummary || []),
        ...(packet.optionalOutcomeSummaries || []),
        ...(packet.unresolvedPlayerKnownConsequences || []),
    ], MAX_OUTCOMES);
    const value = {
        kind: MISSION_TRANSITION_NARRATION_PACKET_KIND,
        contractVersion: MISSION_TRANSITION_NARRATION_CONTRACT_VERSION,
        transitionKey: stableTransitionKey([
            sourceDefinition.packageBinding.packageId,
            sourceDefinition.packageBinding.packageVersion,
            branchId,
            source.runId,
            receipt.transitionId,
            receipt.committedAtRevision,
        ]),
        packageBinding: {
            packageId: sourceDefinition.packageBinding.packageId,
            packageVersion: sourceDefinition.packageBinding.packageVersion,
        },
        branchId,
        sourceRunId: source.runId,
        sourceMissionId: sourceDefinition.id,
        sourceDefinitionVersion: sourceDefinition.version,
        sourceDisposition: source.state.terminalDisposition,
        next: {
            kind: packet.next.kind,
            id: packet.next.id,
            playerSafeSetup: compact(packet.next.playerSafeSetup),
        },
        knownOutcomes,
        visibleEffects: visibleStoryEffects(campaignState, sourceDefinition),
        mustNarrate: uniqueText(packet.mustNarrate),
        mustNotReveal: uniqueText(packet.mustNotReveal),
    };
    const validation = validateMissionTransitionNarrationPacket(value);
    if (!validation.ok) throw transitionError('transition-narration-packet-invalid');
    return value;
}

function validateTextArray(value, label, maximum, errors) {
    if (!Array.isArray(value)) {
        errors.push(`${label} must be an array`);
        return;
    }
    if (value.length > maximum) errors.push(`${label} exceeds ${maximum} entries`);
    if (new Set(value).size !== value.length) errors.push(`${label} must be unique`);
    for (const text of value) {
        if (typeof text !== 'string' || !compact(text) || text !== compact(text) || text.length > MAX_PACKET_TEXT) {
            errors.push(`${label} contains invalid text`);
        }
    }
}

export function validateMissionTransitionNarrationPacket(value = {}) {
    const errors = [];
    if (!isObject(value)) return { ok: false, errors: ['packet must be an object'] };
    for (const field of unknownFields(value, PACKET_FIELDS)) errors.push(`packet contains unknown field: ${field}`);
    for (const field of PACKET_FIELDS) if (!Object.hasOwn(value, field)) errors.push(`packet is missing field: ${field}`);
    if (value.kind !== MISSION_TRANSITION_NARRATION_PACKET_KIND) errors.push('packet kind is invalid');
    if (value.contractVersion !== MISSION_TRANSITION_NARRATION_CONTRACT_VERSION) errors.push('packet contractVersion is unknown');
    for (const field of ['transitionKey', 'branchId', 'sourceRunId', 'sourceMissionId', 'sourceDefinitionVersion', 'sourceDisposition']) {
        if (!stableId(value[field])) errors.push(`packet ${field} must be a stable id`);
    }
    if (!isObject(value.packageBinding)) errors.push('packet packageBinding must be an object');
    else {
        for (const field of unknownFields(value.packageBinding, PACKAGE_FIELDS)) errors.push(`packet packageBinding contains unknown field: ${field}`);
        for (const field of PACKAGE_FIELDS) if (!stableId(value.packageBinding[field])) errors.push(`packet packageBinding ${field} is invalid`);
    }
    if (!isObject(value.next)) errors.push('packet next must be an object');
    else {
        for (const field of unknownFields(value.next, NEXT_FIELDS)) errors.push(`packet next contains unknown field: ${field}`);
        for (const field of NEXT_FIELDS) if (!Object.hasOwn(value.next, field)) errors.push(`packet next is missing field: ${field}`);
        if (!TARGET_KINDS.has(value.next.kind)) errors.push('packet next kind is invalid');
        if (!stableId(value.next.id)) errors.push('packet next id is invalid');
        if (!compact(value.next.playerSafeSetup) || value.next.playerSafeSetup !== compact(value.next.playerSafeSetup)
            || value.next.playerSafeSetup.length > MAX_PACKET_TEXT) errors.push('packet next playerSafeSetup is invalid');
    }
    validateTextArray(value.knownOutcomes, 'packet knownOutcomes', MAX_OUTCOMES, errors);
    validateTextArray(value.mustNarrate, 'packet mustNarrate', MAX_GUARDRAILS, errors);
    validateTextArray(value.mustNotReveal, 'packet mustNotReveal', MAX_GUARDRAILS, errors);
    if (!Array.isArray(value.visibleEffects)) errors.push('packet visibleEffects must be an array');
    else {
        if (value.visibleEffects.length > MAX_VISIBLE_EFFECTS) errors.push('packet visibleEffects exceeds limit');
        const effectIds = new Set();
        for (const effect of value.visibleEffects) {
            if (!isObject(effect)) {
                errors.push('packet visible effect must be an object');
                continue;
            }
            for (const field of unknownFields(effect, EFFECT_FIELDS)) errors.push(`packet visible effect contains unknown field: ${field}`);
            if (!stableId(effect.id) || effectIds.has(effect.id)) errors.push('packet visible effect id is invalid or duplicate');
            effectIds.add(effect.id);
            if (!compact(effect.type) || effect.type.length > 160) errors.push('packet visible effect type is invalid');
            if (effect.targetId !== null && !stableId(effect.targetId)) errors.push('packet visible effect targetId is invalid');
            if (Object.hasOwn(effect, 'value') && effect.value !== null
                && !['string', 'number', 'boolean'].includes(typeof effect.value)) {
                errors.push('packet visible effect value must be scalar');
            }
            if (Object.hasOwn(effect, 'summary')
                && (!compact(effect.summary) || effect.summary !== compact(effect.summary)
                    || effect.summary.length > MAX_PACKET_TEXT)) {
                errors.push('packet visible effect summary is invalid');
            }
        }
    }
    return { ok: errors.length === 0, errors };
}

export function createMissionTransitionNarrationFallback(packet = {}) {
    const validation = validateMissionTransitionNarrationPacket(packet);
    if (!validation.ok) throw new TypeError('mission transition narration fallback requires a valid packet');
    const parts = uniqueText([
        ...packet.knownOutcomes,
        packet.next.playerSafeSetup,
    ], MAX_OUTCOMES + 1);
    return {
        kind: MISSION_TRANSITION_NARRATION_FALLBACK_KIND,
        transitionKey: packet.transitionKey,
        text: parts.join(' ').slice(0, 2400),
    };
}

export function createMissionTransitionNarrationRequest(packet = {}) {
    const validation = validateMissionTransitionNarrationPacket(packet);
    if (!validation.ok) throw new TypeError('mission transition narration request requires a valid packet');
    return {
        kind: MISSION_TRANSITION_NARRATION_REQUEST_KIND,
        packet: cloneJson(packet),
        authority: {
            may: ['voice', 'pacing', 'dialogue', 'sensory-detail', 'connective-prose'],
            must: ['preserve-source-disposition', 'preserve-transition-target', 'honor-known-outcomes', 'include-required-beats'],
            mustNot: ['change-source-disposition', 'change-transition-target', 'invent-outcomes', 'reveal-forbidden-state'],
        },
        outputContract: {
            kind: MISSION_TRANSITION_NARRATION_CANDIDATE_KIND,
            fields: ['kind', 'transitionKey', 'text'],
            additionalProperties: false,
            maximumTextCharacters: MAX_CANDIDATE_TEXT,
        },
    };
}

function parseJsonObject(output) {
    if (isObject(output)) return cloneJson(output);
    if (typeof output !== 'string') return null;
    try {
        const parsed = JSON.parse(output);
        return isObject(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function parseMissionTransitionNarrationCandidate(output, { packet = {} } = {}) {
    const errors = [];
    if (!validateMissionTransitionNarrationPacket(packet).ok) errors.push('candidate packet is invalid');
    const value = parseJsonObject(output);
    if (!value) return { ok: false, errors: [...errors, 'candidate must be one JSON object'] };
    for (const field of unknownFields(value, CANDIDATE_FIELDS)) errors.push(`candidate contains unknown field: ${field}`);
    for (const field of CANDIDATE_FIELDS) if (!Object.hasOwn(value, field)) errors.push(`candidate is missing field: ${field}`);
    if (value.kind !== MISSION_TRANSITION_NARRATION_CANDIDATE_KIND) errors.push('candidate kind is invalid');
    if (value.transitionKey !== packet.transitionKey) errors.push('candidate transitionKey does not match');
    const text = typeof value.text === 'string' ? value.text.trim() : '';
    if (!text || text !== value.text || [...text].length > MAX_CANDIDATE_TEXT) errors.push('candidate text is invalid');
    return errors.length > 0
        ? { ok: false, errors }
        : { ok: true, errors: [], value: { kind: value.kind, transitionKey: value.transitionKey, text } };
}

export function createMissionTransitionNarrationReviewRequest({
    packet = {},
    candidate = {},
    attemptNumber = 1,
} = {}) {
    const parsed = parseMissionTransitionNarrationCandidate(candidate, { packet });
    if (!parsed.ok) throw new TypeError('mission transition narration review requires a valid candidate');
    if (!Number.isInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > 2) {
        throw new TypeError('mission transition narration review attemptNumber must be 1 or 2');
    }
    return {
        kind: MISSION_TRANSITION_NARRATION_REVIEW_REQUEST_KIND,
        transitionKey: packet.transitionKey,
        attemptNumber,
        authorizedState: {
            sourceDisposition: packet.sourceDisposition,
            next: cloneJson(packet.next),
            knownOutcomes: cloneJson(packet.knownOutcomes),
            visibleEffects: cloneJson(packet.visibleEffects),
            mustNarrate: cloneJson(packet.mustNarrate),
        },
        authority: {
            mustNotReveal: cloneJson(packet.mustNotReveal),
            allowedDecisions: ['accept', 'retry', 'reject'],
            maximumRetries: 1,
        },
        candidate: cloneJson(parsed.value),
    };
}

export function parseMissionTransitionNarrationReviewProposal(output, { request = {} } = {}) {
    const errors = [];
    const value = parseJsonObject(output);
    if (!value) return { ok: false, errors: ['review must be one JSON object'] };
    for (const field of unknownFields(value, REVIEW_FIELDS)) errors.push(`review contains unknown field: ${field}`);
    for (const field of REVIEW_FIELDS) if (!Object.hasOwn(value, field)) errors.push(`review is missing field: ${field}`);
    if (value.kind !== MISSION_TRANSITION_NARRATION_REVIEW_KIND) errors.push('review kind is invalid');
    if (!stableId(request.transitionKey) || value.transitionKey !== request.transitionKey) errors.push('review transitionKey does not match');
    if (!REVIEW_DECISIONS.has(value.decision)) errors.push('review decision is invalid');
    if (!Array.isArray(value.reasonCodes) || new Set(value.reasonCodes).size !== value.reasonCodes.length
        || value.reasonCodes.some((code) => !REVIEW_REASON_CODES.has(code))) {
        errors.push('review reasonCodes are invalid');
    }
    if (value.decision === 'accept' && value.reasonCodes?.length > 0) errors.push('accepted review cannot contain reasonCodes');
    if (value.decision !== 'accept' && value.reasonCodes?.length === 0) errors.push('non-accepted review requires reasonCodes');
    if (value.decision === 'retry') {
        if (!compact(value.guidance) || value.guidance !== compact(value.guidance) || value.guidance.length > MAX_GUIDANCE_TEXT) {
            errors.push('retry review guidance is invalid');
        }
    } else if (value.guidance !== null) {
        errors.push('non-retry review guidance must be null');
    }
    return errors.length > 0
        ? { ok: false, errors }
        : { ok: true, errors: [], value: cloneJson(value) };
}

export function resolveMissionTransitionNarrationReview({
    review = {},
    attemptNumber = 1,
    candidate = null,
    fallback = null,
} = {}) {
    if (review.decision === 'accept' && candidate?.text) {
        return { action: 'accept', output: cloneJson(candidate), guidance: null };
    }
    if (review.decision === 'retry' && attemptNumber === 1) {
        return { action: 'retry', output: null, guidance: review.guidance };
    }
    return { action: 'fallback', output: cloneJson(fallback), guidance: null };
}
