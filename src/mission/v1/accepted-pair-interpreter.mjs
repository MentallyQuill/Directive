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
const TOP_LEVEL_FIELDS = new Set(['kind', 'assistantAcceptance', 'claims', 'peopleEvents', 'abstained', 'time']);
const CLAIM_FIELDS = new Set(['candidateId', 'sourceSlot', 'value']);
const PEOPLE_INTRODUCTION_FIELDS = new Set(['type', 'localRef', 'name', 'introductionSummary', 'sourceSlot']);
const PEOPLE_FACT_FIELDS = new Set(['type', 'personRef', 'field', 'value', 'sourceSlot']);
const PEOPLE_RELATIONSHIP_FIELDS = new Set(['type', 'personRef', 'summary', 'sourceSlot']);
const PEOPLE_FACT_NAMES = new Set([
    'displayName', 'role', 'affiliation', 'species', 'age', 'birthplace',
    'serviceBackground', 'assignmentHistory', 'profileSummary',
]);
const TIME_FIELDS = new Set(['decision', 'elapsedSeconds', 'reason', 'confidence']);
const MAX_CLAIMS = 16;
const MAX_PEOPLE_EVENTS = 24;
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

function constSchema(value) {
    if (value === null) return { type: 'null' };
    if (typeof value === 'string') return { type: 'string', const: value };
    if (typeof value === 'number') return { type: 'number', const: value };
    if (typeof value === 'boolean') return { type: 'boolean', const: value };
    return { const: cloneJson(value) };
}

function peopleEventSchema() {
    const sourceSlot = { type: 'string', enum: [...SOURCE_SLOTS] };
    const personRef = { type: 'string', minLength: 1, maxLength: 120 };
    return {
        oneOf: [{
            type: 'object',
            additionalProperties: false,
            required: ['type', 'localRef', 'name', 'introductionSummary', 'sourceSlot'],
            properties: {
                type: { type: 'string', const: 'personIntroduced' },
                localRef: { type: 'string', pattern: '^[a-z0-9][a-z0-9._:-]*$', maxLength: 80 },
                name: { type: 'string', minLength: 1, maxLength: 120 },
                introductionSummary: { type: 'string', minLength: 1, maxLength: 512 },
                sourceSlot: { type: 'string', const: 'previousAssistant' },
            },
        }, {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'personRef', 'field', 'value', 'sourceSlot'],
            properties: {
                type: { type: 'string', const: 'publicFactLearned' },
                personRef,
                field: {
                    type: 'string',
                    enum: [
                        'displayName', 'role', 'affiliation', 'species', 'age', 'birthplace',
                        'serviceBackground', 'assignmentHistory', 'profileSummary',
                    ],
                },
                value: { type: 'string', minLength: 1, maxLength: 512 },
                sourceSlot,
            },
        }, {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'personRef', 'summary', 'sourceSlot'],
            properties: {
                type: { type: 'string', const: 'relationshipEvidence' },
                personRef,
                summary: { type: 'string', minLength: 1, maxLength: 512 },
                sourceSlot,
            },
        }],
    };
}

export function createMissionAcceptedPairInterpretationSchema({ candidatePacket = {} } = {}) {
    const candidateSelections = (candidatePacket.candidates || []).flatMap((candidate) => {
        const sourceSlots = candidate.sourceSlots || [];
        const values = Array.isArray(candidate.values) ? candidate.values.map((entry) => entry.value) : null;
        return sourceSlots.flatMap((sourceSlot) => (values || [undefined]).map((value) => {
            const hasValue = value !== undefined;
            return {
                type: 'object',
                additionalProperties: false,
                required: hasValue ? ['candidateId', 'sourceSlot', 'value'] : ['candidateId', 'sourceSlot'],
                properties: {
                    candidateId: { type: 'string', const: candidate.id },
                    sourceSlot: { type: 'string', const: sourceSlot },
                    ...(hasValue ? { value: constSchema(value) } : {}),
                },
            };
        }));
    });
    return {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'assistantAcceptance', 'claims', 'peopleEvents', 'abstained', 'time'],
        properties: {
            kind: { type: 'string', const: MISSION_EVIDENCE_INTERPRETATION_KIND },
            assistantAcceptance: { type: 'string', enum: [...ASSISTANT_ACCEPTANCE_VALUES] },
            claims: {
                type: 'array',
                maxItems: Math.min(MAX_CLAIMS, candidateSelections.length),
                items: candidateSelections.length > 0 ? { oneOf: candidateSelections } : { type: 'object' },
            },
            abstained: { type: 'boolean' },
            peopleEvents: {
                type: 'array',
                maxItems: MAX_PEOPLE_EVENTS,
                items: peopleEventSchema(),
            },
            time: {
                type: 'object',
                additionalProperties: false,
                required: ['decision', 'elapsedSeconds', 'reason', 'confidence'],
                properties: {
                    decision: { type: 'string', enum: [...TIME_DECISION_VALUES] },
                    elapsedSeconds: { type: 'integer', minimum: 0, maximum: MAX_TIME_ADVANCE_SECONDS },
                    reason: { type: 'string', minLength: 1, maxLength: 180 },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                },
            },
        },
    };
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

function peopleEventErrors(value, peopleContext = {}) {
    const errors = [];
    if (!Array.isArray(value)) return ['peopleEvents must be an array'];
    if (value.length > MAX_PEOPLE_EVENTS) errors.push(`peopleEvents must contain no more than ${MAX_PEOPLE_EVENTS} observations`);
    const knownPersonIds = new Set((peopleContext.knownPeople || []).map((person) => person?.id).filter(Boolean));
    const localRefs = new Set();
    for (const [index, event] of value.entries()) {
        const path = `peopleEvents[${index}]`;
        if (!event || typeof event !== 'object' || Array.isArray(event)) {
            errors.push(`${path} must be an object`);
            continue;
        }
        if (!SOURCE_SLOTS.has(event.sourceSlot)) errors.push(`${path} sourceSlot is unknown`);
        if (event.type === 'personIntroduced') {
            for (const field of unknownFields(event, PEOPLE_INTRODUCTION_FIELDS)) errors.push(`${path} contains unknown field: ${field}`);
            if (event.sourceSlot !== 'previousAssistant') errors.push(`${path} introduction must come from previousAssistant`);
            if (typeof event.localRef !== 'string' || !/^[a-z0-9][a-z0-9._:-]*$/.test(event.localRef) || event.localRef.length > 80) {
                errors.push(`${path} localRef must be stable and at most 80 characters`);
            } else if (localRefs.has(event.localRef)) {
                errors.push(`${path} localRef is duplicated`);
            }
            localRefs.add(event.localRef);
            if (typeof event.name !== 'string' || !event.name.trim() || event.name.length > 120) {
                errors.push(`${path} name is invalid`);
            }
            if (typeof event.introductionSummary !== 'string'
                || !event.introductionSummary.trim()
                || event.introductionSummary.length > 512) {
                errors.push(`${path} introductionSummary is invalid`);
            }
        } else if (event.type === 'publicFactLearned') {
            for (const field of unknownFields(event, PEOPLE_FACT_FIELDS)) errors.push(`${path} contains unknown field: ${field}`);
            if (!PEOPLE_FACT_NAMES.has(event.field)) errors.push(`${path} public fact field is unsupported`);
            if (typeof event.value !== 'string'
                || !event.value.trim()
                || event.value.length > (event.field === 'profileSummary' ? 512 : 240)) {
                errors.push(`${path} public fact value is invalid`);
            }
        } else if (event.type === 'relationshipEvidence') {
            for (const field of unknownFields(event, PEOPLE_RELATIONSHIP_FIELDS)) errors.push(`${path} contains unknown field: ${field}`);
            if (typeof event.summary !== 'string' || !event.summary.trim() || event.summary.length > 512) {
                errors.push(`${path} relationship summary is invalid`);
            }
        } else {
            errors.push(`${path} type is unsupported`);
        }
    }
    for (const [index, event] of value.entries()) {
        if (!new Set(['publicFactLearned', 'relationshipEvidence']).has(event?.type)) continue;
        if (typeof event.personRef !== 'string' || !event.personRef.trim() || event.personRef.length > 120) {
            errors.push(`peopleEvents[${index}] personRef is invalid`);
        } else if ((peopleContext.knownPeople || []).length > 0
            && !knownPersonIds.has(event.personRef)
            && !localRefs.has(event.personRef)) {
            errors.push(`peopleEvents[${index}] references unknown person: ${event.personRef}`);
        }
    }
    return errors;
}

function interpretationErrors(value, candidatePacket, peopleContext) {
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
    errors.push(...peopleEventErrors(value.peopleEvents || [], peopleContext));
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

export function parseMissionAcceptedPairInterpretationOutput(value, { candidatePacket, peopleContext = {} } = {}) {
    const parsed = typeof value === 'string'
        ? parseStructuredJsonText(value)
        : { ok: Boolean(value && typeof value === 'object' && !Array.isArray(value)), value };
    if (!parsed.ok) {
        return { ok: false, errors: ['interpretation output must contain valid JSON'] };
    }
    const errors = interpretationErrors(parsed.value, candidatePacket, peopleContext);
    if (errors.length > 0) return { ok: false, errors };
    const discardedAssistantClaimCount = parsed.value.assistantAcceptance === 'accepted'
        ? 0
        : parsed.value.claims.filter((claim) => claim.sourceSlot === 'previousAssistant').length;
    const claims = parsed.value.assistantAcceptance === 'accepted'
        ? parsed.value.claims
        : parsed.value.claims.filter((claim) => claim.sourceSlot !== 'previousAssistant');
    const acceptedPeopleEvents = parsed.value.assistantAcceptance === 'accepted'
        ? (parsed.value.peopleEvents || [])
        : (parsed.value.peopleEvents || []).filter((event) => event.sourceSlot !== 'previousAssistant');
    const survivingLocalRefs = new Set(acceptedPeopleEvents
        .filter((event) => event.type === 'personIntroduced')
        .map((event) => event.localRef));
    const knownPersonIds = new Set((peopleContext.knownPeople || []).map((person) => person?.id).filter(Boolean));
    const peopleEvents = acceptedPeopleEvents.filter((event) => (
        event.type === 'personIntroduced'
        || knownPersonIds.has(event.personRef)
        || survivingLocalRefs.has(event.personRef)
        || (peopleContext.knownPeople || []).length === 0
    ));
    const time = cloneJson(parsed.value.time);
    return {
        ok: true,
        value: {
            kind: MISSION_EVIDENCE_INTERPRETATION_KIND,
            assistantAcceptance: parsed.value.assistantAcceptance,
            claims: cloneJson(claims),
            peopleEvents: cloneJson(peopleEvents),
            abstained: parsed.value.abstained,
            time,
        },
        discardedAssistantClaimCount,
        discardedAssistantPeopleEventCount: (parsed.value.peopleEvents || []).length - peopleEvents.length,
    };
}

export function createMissionAcceptedPairInterpretationPrompt({
    candidatePacket = {}, sourcePair = {}, timeContext = {}, peopleContext = {},
} = {}) {
    const systemPrompt = [
        'You are Directive V1 Mission Evidence Interpreter, a bounded Utility analysis role.',
        'Select only candidate IDs supplied in this request. Do not create or invent policies, targets, values, state, summaries, trackers, objectives, consequences, rewards, or narration.',
        'The previous assistant text is eligible only if the current player reply accepts, continues from, or acts on that selected response.',
        'Mark the assistant response rejected, corrected, or ambiguous when the player disputes it or does not clearly proceed from it.',
        'The current player text may prove only candidates authorized for currentPlayer. It never proves action success or world truth.',
        'When candidate guidance explicitly defines a joint accepted-pair condition, currentPlayer may prove only its player-controlled acceptance or choice while the claim remains anchored to previousAssistant; this does not let player prose establish an NPC action or world outcome.',
        'Plans, attempts, guesses, questions, atmosphere, transient emotion, and mere mentions are not completed events or observed outcomes.',
        'Use each candidate guidance and exclusions literally. For clearOutcome, require a depicted settled result. When evidence is insufficient, omit the claim.',
        'Observe People changes in the same response. A direct NPC encounter may create personIntroduced only when that NPC gives the player a usable name. A name merely mentioned by someone else does not create a person and must be omitted.',
        'Use a supplied known person ID whenever the subject matches the knownPeople directory. Never merge identities, invent a durable person ID, infer private information, or turn routine dialogue into relationship evidence.',
        'publicFactLearned is limited to public identity or professional facts explicitly established in the accepted source. relationshipEvidence must describe an observable interaction outcome, commitment, trust change, disagreement, obligation, or repair rather than sentiment speculation.',
        'Independently estimate elapsed story time across the complete accepted pair. The supplied footer is a proposal, not authority.',
        'Account for both the previous-assistant response and the current player response. Mission-claim rejection or correction does not erase time consumed by visible speech or action.',
        'Spoken dialogue, pauses, and immediate physical actions normally consume whole seconds even when the clock remains within the same minute. Use zero only when the complete pair supports no fictional time passage.',
        'Advance time only when visible prose supports waiting, travel, work, rest, a scene cut, or another completed duration.',
        'Deadlines, schedules, past events, hypothetical durations, and statements about how long something usually takes do not themselves advance the current scene.',
        'Use advance with a positive whole number of seconds, unchanged with zero when no fictional time passes, or indeterminate with zero when evidence conflicts or is insufficient.',
        'Return exactly one JSON object with no markdown or prose:',
        '{"kind":"directive.missionEvidenceInterpretation.v1","assistantAcceptance":"accepted|rejected|corrected|ambiguous","claims":[{"candidateId":"policy.id","sourceSlot":"previousAssistant|currentPlayer","value":"only-when-candidate-allows"}],"peopleEvents":[],"abstained":false,"time":{"decision":"advance|unchanged|indeterminate","elapsedSeconds":0,"reason":"concise-visible-evidence","confidence":0.0}}',
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
        people: cloneJson(peopleContext),
        candidates: cloneJson(candidatePacket.candidates || []),
    };
    const user = `Interpret this accepted-pair source against the closed candidate set:\n${JSON.stringify(userPayload, null, 2)}`;
    return {
        kind: 'directive.missionEvidenceInterpretationRequest.v1',
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
        jsonSchema: createMissionAcceptedPairInterpretationSchema({ candidatePacket }),
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
                domain: candidate.domain || 'mission',
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

function abortedResult() {
    return {
        ok: false,
        status: 'unavailable',
        reasonCode: 'provider-aborted',
        diagnostics: {},
    };
}

async function runWithTimeout(factory, timeoutMs, externalSignal = null) {
    if (externalSignal?.aborted) return abortedResult();
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const providerSignal = controller?.signal || externalSignal || null;
    let timeoutId = null;
    let removeExternalAbort = null;
    let resolveExternalAbort = null;
    const externalAbort = new Promise((resolve) => { resolveExternalAbort = resolve; });
    if (externalSignal?.addEventListener) {
        const onAbort = () => {
            controller?.abort(externalSignal.reason);
            resolveExternalAbort(abortedResult());
        };
        externalSignal.addEventListener('abort', onAbort, { once: true });
        removeExternalAbort = () => externalSignal.removeEventListener('abort', onAbort);
    }
    let pending = null;
    try {
        pending = Promise.resolve(factory(providerSignal));
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
            return await Promise.race([pending, externalAbort]);
        }
        return await Promise.race([
            pending,
            new Promise((resolve) => {
                timeoutId = setTimeout(() => {
                    controller?.abort(new Error('provider-timeout'));
                    resolve(timeoutResult(timeoutMs));
                }, timeoutMs);
            }),
            externalAbort,
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        removeExternalAbort?.();
        pending?.catch?.(() => null);
    }
}

export function createMissionAcceptedPairInterpreter({
    generationRouter = null,
    timeoutMs = MISSION_EVIDENCE_INTERPRETER_TIMEOUT_MS,
} = {}) {
    return async function interpretMissionAcceptedPair({
        candidatePacket = {}, sourcePair = {}, timeContext = {}, peopleContext = {}, signal = null,
    } = {}) {
        if (typeof generationRouter?.generate !== 'function') {
            return { ok: false, status: 'unavailable', reasonCode: 'provider-missing', diagnostics: {} };
        }
        const request = createMissionAcceptedPairInterpretationPrompt({
            candidatePacket, sourcePair, timeContext, peopleContext,
        });
        let generation = null;
        try {
            const result = await runWithTimeout(
                (providerSignal) => generationRouter.generate(
                    MISSION_EVIDENCE_INTERPRETER_ROLE_ID,
                    request,
                    { timeoutMs, signal: providerSignal, allowVisibleOutputRetry: false },
                ),
                timeoutMs,
                signal,
            );
            if (result?.ok === false && new Set(['provider-timeout', 'provider-aborted']).has(result?.reasonCode)) {
                return result;
            }
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
        const parsed = parseMissionAcceptedPairInterpretationOutput(text, { candidatePacket, peopleContext });
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
            status: parsed.value.claims.length > 0
                || parsed.value.peopleEvents.length > 0
                || parsed.value.time.decision === 'advance'
                ? 'interpreted'
                : 'no-change',
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
                peopleEventCount: parsed.value.peopleEvents.length,
                discardedAssistantPeopleEventCount: parsed.discardedAssistantPeopleEventCount,
                providerId: generation?.diagnostics?.providerId || generation?.response?.providerId || null,
                model: generation?.response?.model || null,
                latencyMs: generation?.diagnostics?.latencyMs ?? null,
            },
        };
    };
}
