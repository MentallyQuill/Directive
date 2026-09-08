import { parseStructuredJsonText } from '../../providers/structured-output-parser.mjs';
import { createScenePacingSchema, pacingObservationErrors } from '../../narration/scene-pacing.mjs';
import { createGenerationRoleRegistry } from '../../generation/generation-roles.mjs';
import { acceptedPairTimeDecisionErrors, createTimeInterpretationSchema } from '../../time/accepted-time-interpretation.mjs';

export const MISSION_EVIDENCE_INTERPRETATION_KIND = 'directive.missionEvidenceInterpretation.v1';
export const MISSION_EVIDENCE_INTERPRETER_ROLE_ID = 'acceptedPairMissionEvidence';
export const MISSION_EVIDENCE_INTERPRETER_TIMEOUT_MS = createGenerationRoleRegistry()
    .get(MISSION_EVIDENCE_INTERPRETER_ROLE_ID).timeoutMs;

const MISSION_EVIDENCE_MAX_TOKENS = 8192;

const ASSISTANT_ACCEPTANCE_VALUES = new Set(['accepted', 'rejected', 'corrected', 'ambiguous']);
const SOURCE_SLOTS = new Set(['previousAssistant', 'currentPlayer']);
const TOP_LEVEL_FIELDS = new Set(['kind', 'assistantAcceptance', 'claims', 'peopleEvents', 'abstained', 'time', 'scenePacing']);
const CLAIM_FIELDS = new Set(['candidateId', 'sourceSlot', 'value', 'evidenceQuote', 'materiallyNewEvidence']);
const PEOPLE_INTRODUCTION_FIELDS = new Set(['type', 'localRef', 'name', 'introductionSummary', 'sourceSlot', 'evidenceQuote']);
const PEOPLE_FACT_FIELDS = new Set(['type', 'personRef', 'field', 'value', 'sourceSlot', 'evidenceQuote']);
const PEOPLE_RELATIONSHIP_FIELDS = new Set(['type', 'personRef', 'summary', 'sourceSlot', 'evidenceQuote']);
const PEOPLE_FACT_NAMES = new Set([
    'displayName', 'role', 'affiliation', 'species', 'age', 'birthplace',
    'serviceBackground', 'assignmentHistory', 'profileSummary',
]);
const MAX_DURABLE_SELECTIONS = 4;
const MAX_CLAIMS = MAX_DURABLE_SELECTIONS;
const MAX_PEOPLE_EVENTS = 24;
const MIN_EVIDENCE_QUOTE_LENGTH = 12;
const MAX_EVIDENCE_QUOTE_LENGTH = 240;

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

function normalizedEvidenceText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function evidenceQuoteErrors(value, sourcePair, path) {
    const quote = normalizedEvidenceText(value?.evidenceQuote);
    const errors = [];
    if (quote.length < MIN_EVIDENCE_QUOTE_LENGTH || quote.length > MAX_EVIDENCE_QUOTE_LENGTH) {
        errors.push(`${path}.evidenceQuote must contain 12 through 240 characters`);
        return errors;
    }
    const sourceText = normalizedEvidenceText(sourcePair?.[value?.sourceSlot]?.text);
    if (!sourceText.includes(quote)) {
        errors.push(`${path}.evidenceQuote must occur in its authorized source`);
    }
    return errors;
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
            required: ['type', 'localRef', 'name', 'introductionSummary', 'sourceSlot', 'evidenceQuote'],
            properties: {
                type: { type: 'string', const: 'personIntroduced' },
                localRef: { type: 'string', pattern: '^[a-z0-9][a-z0-9._:-]*$', maxLength: 80 },
                name: { type: 'string', minLength: 1, maxLength: 120 },
                introductionSummary: { type: 'string', minLength: 1, maxLength: 512 },
                sourceSlot: { type: 'string', const: 'previousAssistant' },
                evidenceQuote: { type: 'string', minLength: MIN_EVIDENCE_QUOTE_LENGTH, maxLength: MAX_EVIDENCE_QUOTE_LENGTH },
            },
        }, {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'personRef', 'field', 'value', 'sourceSlot', 'evidenceQuote'],
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
                evidenceQuote: { type: 'string', minLength: MIN_EVIDENCE_QUOTE_LENGTH, maxLength: MAX_EVIDENCE_QUOTE_LENGTH },
            },
        }, {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'personRef', 'summary', 'sourceSlot', 'evidenceQuote'],
            properties: {
                type: { type: 'string', const: 'relationshipEvidence' },
                personRef,
                summary: { type: 'string', minLength: 1, maxLength: 512 },
                sourceSlot,
                evidenceQuote: { type: 'string', minLength: MIN_EVIDENCE_QUOTE_LENGTH, maxLength: MAX_EVIDENCE_QUOTE_LENGTH },
            },
        }],
    };
}

function durableSelectionBudgetSchema(candidateSelectionCount) {
    const maximumClaims = Math.min(MAX_CLAIMS, candidateSelectionCount);
    return {
        oneOf: Array.from({ length: maximumClaims + 1 }, (_, claimCount) => ({
            type: 'object',
            properties: {
                claims: {
                    type: 'array',
                    minItems: claimCount,
                    maxItems: claimCount,
                },
                peopleEvents: {
                    type: 'array',
                    maxItems: MAX_DURABLE_SELECTIONS - claimCount,
                },
            },
        })),
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
                required: hasValue
                    ? ['candidateId', 'sourceSlot', 'value', 'evidenceQuote']
                    : ['candidateId', 'sourceSlot', 'evidenceQuote'],
                properties: {
                    candidateId: { type: 'string', const: candidate.id },
                    sourceSlot: { type: 'string', const: sourceSlot },
                    ...(hasValue ? { value: constSchema(value) } : {}),
                    ...(candidate.corrections?.length ? { materiallyNewEvidence: {type:'boolean',const:true} } : {}),
                    evidenceQuote: {
                        type: 'string',
                        minLength: MIN_EVIDENCE_QUOTE_LENGTH,
                        maxLength: MAX_EVIDENCE_QUOTE_LENGTH,
                    },
                },
            };
        }));
    });
    return {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'assistantAcceptance', 'claims', 'peopleEvents', 'abstained', 'time', ...(candidatePacket.scenePacing ? ['scenePacing'] : [])],
        allOf: [durableSelectionBudgetSchema(candidateSelections.length)],
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
            time: createTimeInterpretationSchema(),
            ...(candidatePacket.scenePacing ? {scenePacing:createScenePacingSchema(candidatePacket.scenePacing)} : {}),
        },
    };
}


function peopleEventErrors(value, peopleContext = {}, sourcePair = {}) {
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
        errors.push(...evidenceQuoteErrors(event, sourcePair, path));
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

function interpretationErrors(value, candidatePacket, peopleContext, sourcePair, timeContext) {
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
    errors.push(...acceptedPairTimeDecisionErrors(value.time, sourcePair, value.assistantAcceptance, timeContext));
    errors.push(...peopleEventErrors(value.peopleEvents || [], peopleContext, sourcePair));
    // Older outputs may omit pacing; runtime treats omission as a hold, never permission.
    if (value.scenePacing !== undefined) errors.push(...pacingObservationErrors(value.scenePacing, {...candidatePacket.scenePacing,sourcePair}));
    if (!Array.isArray(value.claims)) {
        errors.push('claims must be an array');
        return errors;
    }
    if (value.claims.length > MAX_CLAIMS) errors.push(`claims must contain no more than ${MAX_CLAIMS} selections`);
    if (value.claims.length + (value.peopleEvents || []).length > MAX_DURABLE_SELECTIONS) {
        errors.push(`interpretation must contain no more than ${MAX_DURABLE_SELECTIONS} durable selections`);
    }
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
        errors.push(...evidenceQuoteErrors(claim, sourcePair, path));
        if (candidate.corrections?.length && claim.materiallyNewEvidence !== true) errors.push(`${path} requires materially new evidence after the player correction`);
        if (claim.materiallyNewEvidence !== undefined && claim.materiallyNewEvidence !== true) errors.push(`${path} materiallyNewEvidence must be true when supplied`);
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

export function parseMissionAcceptedPairInterpretationOutput(value, {
    candidatePacket,
    sourcePair = {},
    peopleContext = {},
    timeContext = {},
} = {}) {
    const parsed = typeof value === 'string'
        ? parseStructuredJsonText(value)
        : { ok: Boolean(value && typeof value === 'object' && !Array.isArray(value)), value };
    if (!parsed.ok) {
        return { ok: false, errors: ['interpretation output must contain valid JSON'] };
    }
    const boundedValue = cloneJson(parsed.value);
    const claimCount = Array.isArray(boundedValue?.claims) ? boundedValue.claims.length : 0;
    const peopleCapacity = Math.max(0, MAX_DURABLE_SELECTIONS - claimCount);
    const rawPeopleEventCount = Array.isArray(boundedValue?.peopleEvents) ? boundedValue.peopleEvents.length : 0;
    if (Array.isArray(boundedValue?.peopleEvents) && rawPeopleEventCount > peopleCapacity) {
        boundedValue.peopleEvents = boundedValue.peopleEvents.slice(0, peopleCapacity);
    }
    const discardedOverflowPeopleEventCount = Math.max(0, rawPeopleEventCount - peopleCapacity);
    const errors = interpretationErrors(boundedValue, candidatePacket, peopleContext, sourcePair, timeContext);
    if (errors.length > 0) return { ok: false, errors };
    const discardedAssistantClaimCount = boundedValue.assistantAcceptance === 'accepted'
        ? 0
        : boundedValue.claims.filter((claim) => claim.sourceSlot === 'previousAssistant').length;
    const claims = boundedValue.assistantAcceptance === 'accepted'
        ? boundedValue.claims
        : boundedValue.claims.filter((claim) => claim.sourceSlot !== 'previousAssistant');
    const acceptedPeopleEvents = boundedValue.assistantAcceptance === 'accepted'
        ? (boundedValue.peopleEvents || [])
        : (boundedValue.peopleEvents || []).filter((event) => event.sourceSlot !== 'previousAssistant');
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
    const time = cloneJson(boundedValue.time);
    return {
        ok: true,
        value: {
            kind: MISSION_EVIDENCE_INTERPRETATION_KIND,
            assistantAcceptance: boundedValue.assistantAcceptance,
            claims: cloneJson(claims),
            peopleEvents: cloneJson(peopleEvents),
            abstained: boundedValue.abstained,
            time,
            ...(boundedValue.scenePacing !== undefined ? {scenePacing:cloneJson(boundedValue.scenePacing)} : {}),
        },
        discardedAssistantClaimCount,
        discardedAssistantPeopleEventCount: (boundedValue.peopleEvents || []).length - peopleEvents.length,
        discardedOverflowPeopleEventCount,
    };
}

export function createMissionAcceptedPairInterpretationPrompt({
    candidatePacket = {}, sourcePair = {}, timeContext = {}, peopleContext = {},
} = {}) {
    const jsonSchema = createMissionAcceptedPairInterpretationSchema({ candidatePacket });
    const systemPrompt = [
        'You are Directive V1 Mission Evidence Interpreter, a bounded Utility analysis role.',
        ...(candidatePacket.scenePacing ? [
            'Also observe scene participation in this same call. Use only supplied visible objectives and their authored scenePacing requirements. This observation controls the NEXT response, not permission to certify the previous response retroactively.',
            'A greeting, broad order, information request, or NPC monologue is not completed participation. Cite contiguous exact quotes from BOTH currentPlayer and previousAssistant for each requirement actually engaged. Do not invent agreement or treat narrated player conduct as player participation.',
            'Keep the current scene unless the player explicitly leaves, delegates, or asks to skip/summarize it. Use resolve only when the player chooses an actionable resolution after the required discussion; it permits depicting an outcome but never guarantees success or authorizes departure. List any unresolved question or objection. If uncertain use continue and empty participation. Null objectiveId supports ordinary conversation without objective progress.',
            'For leave, delegate, skip, or resolve, intentQuote must quote the CURRENT PLAYER. Mentioning a future departure or discussing delegation is not enacting it. Requests for information are not requests to fast-forward. Never move the story because enough turns have elapsed.',
            'Set missionDepartureQuote only when the CURRENT PLAYER explicitly chooses to finish this mission, conclude the interval/campaign, or proceed to the next mission. Leaving a room, concluding one conversation, delegating an objective, and asking about the next assignment do NOT authorize mission departure. Otherwise return an empty missionDepartureQuote.',
        ] : []),
        'Select only candidate IDs supplied in this request. Do not create or invent policies, targets, values, state, summaries, trackers, objectives, consequences, rewards, or narration.',
        'The previous assistant text is eligible only if the current player reply accepts, continues from, or acts on that selected response.',
        'Mark the assistant response rejected, corrected, or ambiguous when the player disputes it or does not clearly proceed from it.',
        'The current player text may prove only candidates authorized for currentPlayer. It never proves action success or world truth.',
        'When candidate guidance explicitly defines a joint accepted-pair condition, currentPlayer may prove only its player-controlled acceptance or choice while the claim remains anchored to previousAssistant; this does not let player prose establish an NPC action or world outcome.',
        'Plans, attempts, guesses, questions, atmosphere, transient emotion, and mere mentions are not completed events or observed outcomes.',
        'Use each candidate guidance and exclusions literally. For clearOutcome, require a depicted settled result. When evidence is insufficient, omit the claim.',
        'Every claim and People observation must include evidenceQuote: a verbatim 12–240 character excerpt from its selected source slot that directly proves the selection.',
        'Copy one continuous excerpt exactly as written. Never join separated passages, insert ellipses, paraphrase, or repair the source inside evidenceQuote. Use a shorter intact excerpt when needed.',
        'Return no more than four durable selections total across claims and People observations.',
        'abstained refers to mission claims only. If claims is nonempty, set abstained to false. Set it to true only when claims is empty; never return claims together with abstained:true.',
        'Observe People changes in the same response. A direct NPC encounter may create personIntroduced only when that NPC gives the player a usable name. A name merely mentioned by someone else does not create a person and must be omitted.',
        'Use a supplied known person ID whenever the subject matches the knownPeople directory. Never merge identities, invent a durable person ID, infer private information, or turn routine dialogue into relationship evidence.',
        'publicFactLearned is limited to public identity or professional facts explicitly established in the accepted source. relationshipEvidence must describe an observable interaction outcome, commitment, trust change, disagreement, obligation, or repair rather than sentiment speculation.',
        'Independently estimate elapsed story time across the complete accepted pair. The supplied footer is a proposal, not authority.',
        'Obey time.scope. When time.scope.previousAssistantTiming is opening-baseline, the previous assistant text establishes the clock at its final current-scene moment: do not charge its retrospective setup, earlier events, or transition to that baseline as new elapsed time. Count only time enacted by the current player after that baseline.',
        'Every time decision requires basis: explicitDuration, implicitAction, sceneTransition, noPassage, or unresolved. Use noPassage only with unchanged and unresolved only with indeterminate. Unresolved timing blocks settlement for recovery; do not use it merely because an ordinary action lacks an exact stopwatch duration.',
        'For implicitAction, supply sourceSlot and evidenceQuote (1–240 verbatim characters) showing newly enacted speech or action. Estimate net whole seconds contextually; never use word count, fixed per-message increments, or an activity-duration table. Advances beyond five minutes require explicit duration or scene-transition evidence; this is an evidence threshold, not a default duration or a clamp.',
        'For explicitDuration or sceneTransition, add durationSeconds, durationSourceSlot, and durationEvidenceQuote. The quote must be verbatim from that source and show enacted forward passage, not a refusal, question, plan, hypothetical, schedule, or past event. Convert explicit quantities accurately: ten minutes is 600 seconds. For a scene transition derive the forward interval from supplied current time and the stated destination; never copy an absolute clock into elapsedSeconds.',
        'durationSeconds equals elapsedSeconds when the quoted interval covers the whole passage. For an explicit interval followed or preceded by additional immediate action, elapsedSeconds may include up to five additional minutes only with separate sourceSlot and evidenceQuote for that action. Do not count concurrent actions twice: a ten-minute wait with five minutes of work during it consumes ten minutes, not fifteen. For longer or multiple intervals quote the passage establishing their total; use unresolved when their relationship cannot be determined.',
        'Account for both the previous-assistant response and the current player response. Mission-claim rejection or correction does not erase time consumed by visible speech or action.',
        'When assistantAcceptance is not accepted, source time only from surviving passage established in currentPlayer. Do not charge rejected sleep, travel, or other fictional events. A spoken correction may still consume seconds; an OOC-only correction does not.',
        'The clock already includes the action of the player who prompted previousAssistant when that earlier pair was settled. Use time.alreadyCountedPlayer as context only: do not charge that action again when the assistant recaps it. Include only new continuation beyond it and the current player action. Restating a prior duration is not another duration. Account for overlapping actions by net scene passage, not by adding every mentioned interval.',
        'Spoken dialogue, pauses, and immediate physical actions normally consume whole seconds even when ship time remains within the same minute. Use zero only when the complete pair supports no fictional time passage.',
        'Advance time only when visible prose supports waiting, travel, work, rest, a scene cut, or another completed duration.',
        'Deadlines, schedules, past events, hypothetical durations, and statements about how long something usually takes do not themselves advance the current scene.',
        'Use advance with a positive whole number of seconds, unchanged with zero when no fictional time passes, or indeterminate with zero when evidence conflicts or is insufficient.',
        'Resolve only settled results. Orders, intentions, attempts, temporary stabilization, predictions, negated outcomes, and questions are not completed outcomes even when quoted accurately. Apply the full authored requirement, including evidence accumulated in current state.',
        'Candidates with corrections include evidence rejected by the player. Repetition, paraphrase, retrospective discussion, or a new message quoting that same event is not new evidence. Select such a candidate only for a materially new enacted result after the correction, and explicitly set materiallyNewEvidence:true. Otherwise abstain on it. Player-set resolutions are authoritative.',
        'Return exactly one JSON object with no markdown or prose:',
        'The complete output schema below applies in Prompt JSON mode as well as native schema mode. Omit claim value unless that candidate permits it. People observations use type, personRef (or localRef for introductions), sourceSlot, and evidenceQuote; do not invent alternative field names. Keep time.reason within 180 characters.',
        `Output JSON Schema: ${JSON.stringify(jsonSchema)}`,
        ...(candidatePacket.scenePacing ? ['Also include scenePacing in the output: {"objectiveId":"the current authored objective id","intent":"continue","intentQuote":"","missionDepartureQuote":"","unresolved":"remaining question or empty string","participation":[]}. Populate participation only with real, relevant player and assistant quotations; missing pacing holds the scene.'] : []),
        '{"kind":"directive.missionEvidenceInterpretation.v1","assistantAcceptance":"accepted|rejected|corrected|ambiguous","claims":[{"candidateId":"policy.id","sourceSlot":"previousAssistant|currentPlayer","value":"only-when-candidate-allows","evidenceQuote":"verbatim source excerpt"}],"peopleEvents":[],"abstained":false,"time":{"decision":"advance|unchanged|indeterminate","basis":"explicitDuration|implicitAction|sceneTransition|noPassage|unresolved","elapsedSeconds":0,"reason":"concise-visible-evidence","confidence":0.0}}',
        'Explicit-duration time example only: {"decision":"advance","basis":"explicitDuration","elapsedSeconds":600,"reason":"explicit-wait","confidence":0.95,"durationSeconds":600,"durationSourceSlot":"currentPlayer","durationEvidenceQuote":"I wait exactly ten minutes before entering."}',
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
        ...(candidatePacket.scenePacing ? {scenePacing:cloneJson(candidatePacket.scenePacing)} : {}),
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
        jsonSchema,
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
                evidenceQuote: normalizedEvidenceText(selection.evidenceQuote),
                evidenceQuoteHash: stableHash(normalizedEvidenceText(selection.evidenceQuote)),
                ...(selection.materiallyNewEvidence === true ? {materiallyNewEvidence:true} : {}),
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
        onAttempt = null,
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
                    { timeoutMs, signal: providerSignal, allowVisibleOutputRetry: false, onAttempt },
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
        const parsed = parseMissionAcceptedPairInterpretationOutput(text, { candidatePacket, sourcePair, peopleContext, timeContext });
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
                discardedOverflowPeopleEventCount: parsed.discardedOverflowPeopleEventCount,
                providerId: generation?.diagnostics?.providerId || generation?.response?.providerId || null,
                model: generation?.response?.model || null,
                latencyMs: generation?.diagnostics?.latencyMs ?? null,
            },
        };
    };
}
