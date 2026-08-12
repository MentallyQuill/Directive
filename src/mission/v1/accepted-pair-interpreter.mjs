import { parseStructuredJsonText } from '../../providers/structured-output-parser.mjs';
import { createGenerationRoleRegistry } from '../../generation/generation-roles.mjs';

export const MISSION_EVIDENCE_INTERPRETATION_KIND = 'directive.missionEvidenceInterpretation.v1';
export const MISSION_EVIDENCE_INTERPRETER_ROLE_ID = 'acceptedPairMissionEvidence';
export const MISSION_EVIDENCE_INTERPRETER_TIMEOUT_MS = createGenerationRoleRegistry()
    .get(MISSION_EVIDENCE_INTERPRETER_ROLE_ID).timeoutMs;

const MISSION_EVIDENCE_MAX_TOKENS = 2500;

const ASSISTANT_ACCEPTANCE_VALUES = new Set(['accepted', 'rejected', 'corrected', 'ambiguous']);
const TIME_DECISION_VALUES = new Set(['advance', 'unchanged', 'indeterminate']);
const SOURCE_SLOTS = new Set(['previousAssistant', 'currentPlayer']);
const TOP_LEVEL_FIELDS = new Set(['kind', 'assistantAcceptance', 'claims', 'abstained', 'time']);
const CLAIM_FIELDS = new Set(['candidateId', 'sourceSlot', 'value']);
const TIME_FIELDS = new Set(['decision', 'elapsedSeconds', 'reason', 'confidence']);
const MAX_CLAIMS = 16;
const MAX_TIME_ADVANCE_SECONDS = 31 * 24 * 60 * 60;

function cloneJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableHash(value = '') {
    let hash = 0x811c9dc5;
    for (const character of String(value)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function responseText(generation = {}) {
    return generation?.response?.text
        || generation?.response?.content
        || generation?.response?.raw?.text
        || generation?.text
        || generation?.content
        || '';
}

function unknownFields(value, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    return Object.keys(value).filter((key) => !allowed.has(key));
}

function valuesEqual(left, right) {
    return Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);
}

function timeDecisionErrors(value) {
    const errors = [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ['time must be an object'];
    for (const field of unknownFields(value, TIME_FIELDS)) errors.push(`time contains unknown field: ${field}`);
    if (!TIME_DECISION_VALUES.has(value.decision)) errors.push('time.decision is unknown');
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
    if (typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 180) {
        errors.push('time.reason must be a nonempty string no longer than 180 characters');
    }
    if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
        errors.push('time.confidence must be between 0 and 1');
    }
    return errors;
}

function interpretationErrors(value, candidatePacket) {
    const errors = [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return ['interpretation output must be a JSON object'];
    }
    for (const field of unknownFields(value, TOP_LEVEL_FIELDS)) errors.push(`interpretation contains unknown field: ${field}`);
    if (value.kind !== MISSION_EVIDENCE_INTERPRETATION_KIND) {
        errors.push(`kind must be ${MISSION_EVIDENCE_INTERPRETATION_KIND}`);
    }
    if (!ASSISTANT_ACCEPTANCE_VALUES.has(value.assistantAcceptance)) {
        errors.push('assistantAcceptance is unknown');
    }
    if (typeof value.abstained !== 'boolean') errors.push('abstained must be a boolean');
    errors.push(...timeDecisionErrors(value.time));
    if (!Array.isArray(value.claims)) {
        errors.push('claims must be an array');
        return errors;
    }
    if (value.claims.length > MAX_CLAIMS) errors.push(`claims must contain no more than ${MAX_CLAIMS} selections`);
    if (value.abstained === true && value.claims.length > 0) errors.push('abstained output cannot contain claims');

    const candidates = new Map((candidatePacket?.candidates || []).map((candidate) => [candidate.id, candidate]));
    const seen = new Set();
    for (const [index, claim] of value.claims.entries()) {
        const path = `claims[${index}]`;
        if (!claim || typeof claim !== 'object' || Array.isArray(claim)) {
            errors.push(`${path} must be an object`);
            continue;
        }
        for (const field of unknownFields(claim, CLAIM_FIELDS)) errors.push(`${path} contains unknown field: ${field}`);
        const candidate = candidates.get(claim.candidateId);
        if (!candidate) {
            errors.push(`${path} references unknown candidate: ${claim.candidateId}`);
            continue;
        }
        if (!SOURCE_SLOTS.has(claim.sourceSlot) || !candidate.sourceSlots.includes(claim.sourceSlot)) {
            errors.push(`${path} sourceSlot is not authorized for ${claim.candidateId}`);
        }
        const candidateValues = Array.isArray(candidate.values) ? candidate.values : null;
        if (candidateValues) {
            if (!Object.hasOwn(claim, 'value')) {
                errors.push(`${path} value is required for ${claim.candidateId}`);
            } else if (!candidateValues.some((entry) => valuesEqual(entry.value, claim.value))) {
                errors.push(`${path} value is not allowed for ${claim.candidateId}`);
            }
        } else if (Object.hasOwn(claim, 'value')) {
            errors.push(`${path} value is not allowed for ${claim.candidateId}`);
        }
        const duplicateKey = `${claim.candidateId}|${claim.sourceSlot}|${JSON.stringify(claim.value)}`;
        if (seen.has(duplicateKey)) errors.push(`${path} is a duplicate claim selection`);
        seen.add(duplicateKey);
    }
    return errors;
}

export function parseMissionAcceptedPairInterpretationOutput(value, { candidatePacket } = {}) {
    const parsed = typeof value === 'string'
        ? parseStructuredJsonText(value)
        : { ok: Boolean(value && typeof value === 'object' && !Array.isArray(value)), value };
    if (!parsed.ok) {
        return { ok: false, errors: ['interpretation output must contain valid JSON'] };
    }
    const errors = interpretationErrors(parsed.value, candidatePacket);
    if (errors.length > 0) return { ok: false, errors };
    const discardedAssistantClaimCount = parsed.value.assistantAcceptance === 'accepted'
        ? 0
        : parsed.value.claims.filter((claim) => claim.sourceSlot === 'previousAssistant').length;
    const claims = parsed.value.assistantAcceptance === 'accepted'
        ? parsed.value.claims
        : parsed.value.claims.filter((claim) => claim.sourceSlot !== 'previousAssistant');
    const time = cloneJson(parsed.value.time);
    return {
        ok: true,
        value: {
            kind: MISSION_EVIDENCE_INTERPRETATION_KIND,
            assistantAcceptance: parsed.value.assistantAcceptance,
            claims: cloneJson(claims),
            abstained: parsed.value.abstained,
            time,
        },
        discardedAssistantClaimCount,
    };
}

export function createMissionAcceptedPairInterpretationPrompt({ candidatePacket = {}, sourcePair = {}, timeContext = {} } = {}) {
    const systemPrompt = [
        'You are Directive V1 Mission Evidence Interpreter, a bounded Utility analysis role.',
        'Select only candidate IDs supplied in this request. Do not create or invent policies, targets, values, state, summaries, trackers, objectives, consequences, rewards, or narration.',
        'The previous assistant text is eligible only if the current player reply accepts, continues from, or acts on that selected response.',
        'Mark the assistant response rejected, corrected, or ambiguous when the player disputes it or does not clearly proceed from it.',
        'The current player text may prove only candidates authorized for currentPlayer. It never proves action success or world truth.',
        'When candidate guidance explicitly defines a joint accepted-pair condition, currentPlayer may prove only its player-controlled acceptance or choice while the claim remains anchored to previousAssistant; this does not let player prose establish an NPC action or world outcome.',
        'Plans, attempts, guesses, questions, atmosphere, transient emotion, and mere mentions are not completed events or observed outcomes.',
        'Use each candidate guidance and exclusions literally. For clearOutcome, require a depicted settled result. When evidence is insufficient, omit the claim.',
        'Independently estimate elapsed story time across the complete accepted pair. The supplied footer is a proposal, not authority.',
        'Account for both the previous-assistant response and the current player response. Mission-claim rejection or correction does not erase time consumed by visible speech or action.',
        'Spoken dialogue, pauses, and immediate physical actions normally consume whole seconds even when the clock remains within the same minute. Use zero only when the complete pair supports no fictional time passage.',
        'Advance time only when visible prose supports waiting, travel, work, rest, a scene cut, or another completed duration.',
        'Deadlines, schedules, past events, hypothetical durations, and statements about how long something usually takes do not themselves advance the current scene.',
        'Use advance with a positive whole number of seconds, unchanged with zero when no fictional time passes, or indeterminate with zero when evidence conflicts or is insufficient.',
        'Return exactly one JSON object with no markdown or prose:',
        '{"kind":"directive.missionEvidenceInterpretation.v1","assistantAcceptance":"accepted|rejected|corrected|ambiguous","claims":[{"candidateId":"policy.id","sourceSlot":"previousAssistant|currentPlayer","value":"only-when-candidate-allows"}],"abstained":false,"time":{"decision":"advance|unchanged|indeterminate","elapsedSeconds":0,"reason":"concise-visible-evidence","confidence":0.0}}',
    ].join('\n');
    const userPayload = {
        envelope: {
            missionId: candidatePacket.missionId,
            definitionVersion: candidatePacket.definitionVersion,
            branchId: candidatePacket.branchId,
            baseRevision: candidatePacket.baseRevision,
        },
        sourcePair: {
            previousAssistant: { text: String(sourcePair.previousAssistant?.text || '') },
            currentPlayer: { text: String(sourcePair.currentPlayer?.text || '') },
        },
        time: cloneJson(timeContext),
        candidates: cloneJson(candidatePacket.candidates || []),
    };
    const user = `Interpret this accepted-pair source against the closed candidate set:\n${JSON.stringify(userPayload, null, 2)}`;
    return {
        prompt: `${systemPrompt}\n\n${user}`,
        systemPrompt,
        maxTokens: MISSION_EVIDENCE_MAX_TOKENS,
        parameters: {
            temperature: 0,
            top_p: 1,
            max_tokens: MISSION_EVIDENCE_MAX_TOKENS,
        },
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: user },
        ],
        metadata: {
            roleId: MISSION_EVIDENCE_INTERPRETER_ROLE_ID,
            missionId: candidatePacket.missionId || null,
            definitionVersion: candidatePacket.definitionVersion || null,
            branchId: candidatePacket.branchId || null,
            baseRevision: candidatePacket.baseRevision ?? null,
            candidateCount: Array.isArray(candidatePacket.candidates) ? candidatePacket.candidates.length : 0,
            previousAssistantTextHash: sourcePair.previousAssistant?.textHash || null,
            currentPlayerTextHash: sourcePair.currentPlayer?.textHash || null,
            proposedTimeFooter: timeContext.footer?.text || null,
        },
    };
}

export function materializeMissionEvidenceProposal({
    interpretation = {},
    candidatePacket = {},
    sourcePair = {},
} = {}) {
    const candidates = new Map((candidatePacket.candidates || []).map((candidate) => [candidate.id, candidate]));
    const claims = [...(interpretation.claims || [])]
        .sort((left, right) => (
            left.candidateId.localeCompare(right.candidateId)
            || left.sourceSlot.localeCompare(right.sourceSlot)
            || JSON.stringify(left.value).localeCompare(JSON.stringify(right.value))
        ))
        .map((selection) => {
            const candidate = candidates.get(selection.candidateId);
            const source = sourcePair[selection.sourceSlot];
            if (!candidate || !source?.messageId || !source?.textHash) {
                throw new TypeError(`Cannot materialize mission evidence selection ${selection.candidateId || '<unknown>'}`);
            }
            const identity = [
                candidatePacket.branchId,
                source.messageId,
                source.selectedSwipeId || 'no-swipe',
                source.textHash,
                selection.candidateId,
                JSON.stringify(selection.value),
            ].join('|');
            return {
                claimId: `claim.${stableHash(identity)}`,
                policyId: candidate.id,
                claimType: candidate.claimType,
                targetId: candidate.targetId,
                ...(Object.hasOwn(selection, 'value') ? { value: cloneJson(selection.value) } : {}),
                sourceRef: {
                    messageId: source.messageId,
                    swipeId: source.selectedSwipeId || null,
                    textHash: source.textHash,
                },
            };
        });
    return {
        kind: 'directive.missionEvidenceProposal.v1',
        branchId: candidatePacket.branchId,
        missionId: candidatePacket.missionId,
        baseRevision: candidatePacket.baseRevision,
        claims,
    };
}

function timeoutResult(timeoutMs) {
    return {
        ok: false,
        status: 'unavailable',
        reasonCode: 'provider-timeout',
        diagnostics: { timeoutMs },
    };
}

async function runWithTimeout(promise, timeoutMs) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
    let timeoutId = null;
    const pending = Promise.resolve(promise);
    try {
        return await Promise.race([
            pending,
            new Promise((resolve) => {
                timeoutId = setTimeout(() => resolve(timeoutResult(timeoutMs)), timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        pending.catch?.(() => null);
    }
}

export function createMissionAcceptedPairInterpreter({
    generationRouter = null,
    timeoutMs = MISSION_EVIDENCE_INTERPRETER_TIMEOUT_MS,
} = {}) {
    return async function interpretMissionAcceptedPair({ candidatePacket = {}, sourcePair = {}, timeContext = {} } = {}) {
        if (typeof generationRouter?.generate !== 'function') {
            return { ok: false, status: 'unavailable', reasonCode: 'provider-missing', diagnostics: {} };
        }
        const request = createMissionAcceptedPairInterpretationPrompt({ candidatePacket, sourcePair, timeContext });
        let generation = null;
        try {
            const result = await runWithTimeout(
                Promise.resolve().then(() => generationRouter.generate(
                    MISSION_EVIDENCE_INTERPRETER_ROLE_ID,
                    request,
                    { timeoutMs },
                )),
                timeoutMs,
            );
            if (result?.ok === false && result?.reasonCode === 'provider-timeout') return result;
            generation = result;
        } catch {
            return { ok: false, status: 'unavailable', reasonCode: 'provider-threw', diagnostics: {} };
        }
        const text = responseText(generation);
        if (generation?.ok !== true || !text) {
            return {
                ok: false,
                status: 'unavailable',
                reasonCode: 'provider-empty',
                diagnostics: {
                    providerId: generation?.diagnostics?.providerId || generation?.response?.providerId || null,
                    latencyMs: generation?.diagnostics?.latencyMs ?? null,
                },
            };
        }
        const parsed = parseMissionAcceptedPairInterpretationOutput(text, { candidatePacket });
        if (!parsed.ok) {
            return {
                ok: false,
                status: 'rejected',
                reasonCode: 'invalid-output',
                diagnostics: {
                    errorCount: parsed.errors.length,
                    providerId: generation?.diagnostics?.providerId || generation?.response?.providerId || null,
                    latencyMs: generation?.diagnostics?.latencyMs ?? null,
                },
            };
        }
        return {
            ok: true,
            status: parsed.value.claims.length > 0 || parsed.value.time.decision === 'advance' ? 'interpreted' : 'no-change',
            interpretation: parsed.value,
            proposal: materializeMissionEvidenceProposal({
                interpretation: parsed.value,
                candidatePacket,
                sourcePair,
            }),
            diagnostics: {
                candidateCount: candidatePacket.candidates.length,
                selectedClaimCount: parsed.value.claims.length,
                discardedAssistantClaimCount: parsed.discardedAssistantClaimCount,
                providerId: generation?.diagnostics?.providerId || generation?.response?.providerId || null,
                model: generation?.response?.model || null,
                latencyMs: generation?.diagnostics?.latencyMs ?? null,
            },
        };
    };
}
