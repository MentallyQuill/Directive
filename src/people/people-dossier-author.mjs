import { parseStructuredJsonText } from '../providers/structured-output-parser.mjs';

export const PEOPLE_DOSSIER_ROLE_ID = 'peopleDossierAuthor';
export const PEOPLE_DOSSIER_BATCH_KIND = 'directive.peopleDossierBatch.v1';

const DOSSIER_FIELDS = Object.freeze([
    'personId',
    'displayName',
    'role',
    'affiliation',
    'species',
    'age',
    'birthplace',
    'serviceBackground',
    'assignmentHistory',
    'profileSummary',
]);
const DOSSIER_FIELD_SET = new Set(DOSSIER_FIELDS);
const MAX_INTRODUCTIONS = 8;

function compact(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function responsePayload(generation = {}) {
    for (const candidate of [
        generation?.response?.structuredOutput,
        generation?.response?.json,
        generation?.response?.data,
        generation?.response?.content,
    ]) {
        if (isObject(candidate)) return candidate;
    }
    return generation?.response?.text
        || (typeof generation?.response?.content === 'string' ? generation.response.content : '')
        || generation?.response?.raw?.text
        || generation?.text
        || (typeof generation?.content === 'string' ? generation.content : '')
        || '';
}

function parsedObject(value) {
    if (isObject(value)) return { ok: true, value: structuredClone(value) };
    return parseStructuredJsonText(value);
}

export function parsePeopleDossierBatchOutput(value, { introductions = [] } = {}) {
    const parsed = parsedObject(value);
    if (!parsed.ok || !isObject(parsed.value)) {
        return { ok: false, errors: ['dossier output must contain one JSON object'] };
    }
    const errors = [];
    for (const field of Object.keys(parsed.value)) {
        if (!new Set(['kind', 'dossiers']).has(field)) errors.push(`dossier batch contains unknown field: ${field}`);
    }
    if (parsed.value.kind !== PEOPLE_DOSSIER_BATCH_KIND) errors.push(`dossier batch kind must be ${PEOPLE_DOSSIER_BATCH_KIND}`);
    if (!Array.isArray(parsed.value.dossiers)) {
        errors.push('dossiers must be an array');
        return { ok: false, errors };
    }
    const introductionsById = new Map(introductions.map((entry) => [entry.personId, entry]));
    if (parsed.value.dossiers.length !== introductionsById.size) {
        errors.push('dossiers must contain exactly one record per requested introduction');
    }
    const seen = new Set();
    const dossiers = [];
    for (const [index, dossier] of parsed.value.dossiers.entries()) {
        const path = `dossiers[${index}]`;
        if (!isObject(dossier)) {
            errors.push(`${path} must be an object`);
            continue;
        }
        for (const field of Object.keys(dossier)) {
            if (!DOSSIER_FIELD_SET.has(field)) errors.push(`${path} contains unknown field: ${field}`);
        }
        for (const field of DOSSIER_FIELDS) {
            if (!Object.hasOwn(dossier, field)) errors.push(`${path} is missing field: ${field}`);
        }
        const introduction = introductionsById.get(dossier.personId);
        if (!introduction) errors.push(`${path} references an unrequested personId`);
        else if (compact(dossier.displayName) !== compact(introduction.name)) {
            errors.push(`${path} displayName must preserve the accepted introduced name`);
        }
        if (seen.has(dossier.personId)) errors.push(`${path} personId is duplicated`);
        seen.add(dossier.personId);
        const normalized = { personId: dossier.personId, displayName: compact(dossier.displayName) };
        for (const field of DOSSIER_FIELDS.slice(2)) {
            const valueForField = dossier[field];
            if (valueForField === null) {
                normalized[field] = null;
                continue;
            }
            const text = compact(valueForField);
            const maximum = field === 'profileSummary' ? 512 : 240;
            if (!text || [...text].length > maximum) errors.push(`${path} ${field} is invalid`);
            normalized[field] = text || null;
        }
        dossiers.push(normalized);
    }
    for (const personId of introductionsById.keys()) {
        if (!seen.has(personId)) errors.push(`dossiers is missing requested personId: ${personId}`);
    }
    return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { kind: PEOPLE_DOSSIER_BATCH_KIND, dossiers } };
}

export function createPeopleDossierRequest({ introductions = [], campaignContext = {} } = {}) {
    if (!Array.isArray(introductions) || introductions.length === 0 || introductions.length > MAX_INTRODUCTIONS) {
        throw new TypeError(`People dossier author requires 1-${MAX_INTRODUCTIONS} introductions`);
    }
    const nullableText = (maximum) => ({
        anyOf: [{ type: 'string', minLength: 1, maxLength: maximum }, { type: 'null' }],
    });
    const dossierVariants = introductions.map((introduction) => ({
        type: 'object',
        additionalProperties: false,
        required: [...DOSSIER_FIELDS],
        properties: {
            personId: { type: 'string', const: introduction.personId },
            displayName: { type: 'string', const: introduction.name },
            role: nullableText(240),
            affiliation: nullableText(240),
            species: nullableText(240),
            age: nullableText(240),
            birthplace: nullableText(240),
            serviceBackground: nullableText(240),
            assignmentHistory: nullableText(240),
            profileSummary: nullableText(512),
        },
    }));
    const systemPrompt = [
        'You are Directive People Dossier Author, a bounded Reasoning role.',
        'Author one coherent ordinary public record for every newly introduced person in this batch. Use the accepted name and direct public introduction context exactly.',
        'You may create plausible public identity and professional details that fit the supplied public campaign and ship context: role, affiliation, species, age or age description, birthplace or origin, service or professional background, assignment history, and a concise public profile summary.',
        'Do not include secrets, private motives, hidden loyalties, private beliefs, romance, personality diagnoses, undisclosed trauma, future plot, narration guidance, or any information the player should not be able to read on an ordinary personnel or public record.',
        'Use null only when a field is genuinely inapplicable. Do not add fields, commentary, confidence, or rationale.',
        'Return exactly one strict JSON object matching the supplied schema.',
    ].join('\n');
    const payload = {
        publicCampaignContext: {
            campaignTitle: compact(campaignContext.campaignTitle),
            shipName: compact(campaignContext.shipName),
            shipSummary: compact(campaignContext.shipSummary).slice(0, 800),
        },
        introductions: introductions.map((introduction) => ({
            personId: introduction.personId,
            name: compact(introduction.name),
            introductionSummary: compact(introduction.introductionSummary).slice(0, 512),
        })),
    };
    return {
        kind: 'directive.peopleDossierBatchRequest.v1',
        systemPrompt,
        prompt: `${systemPrompt}\n\nAuthor this public dossier batch:\n${JSON.stringify(payload, null, 2)}`,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Author this public dossier batch:\n${JSON.stringify(payload, null, 2)}` },
        ],
        structuredOutput: true,
        jsonSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'dossiers'],
            properties: {
                kind: { type: 'string', const: PEOPLE_DOSSIER_BATCH_KIND },
                dossiers: {
                    type: 'array',
                    minItems: introductions.length,
                    maxItems: introductions.length,
                    items: { oneOf: dossierVariants },
                },
            },
        },
        metadata: {
            roleId: PEOPLE_DOSSIER_ROLE_ID,
            introductionCount: introductions.length,
            personIds: introductions.map((introduction) => introduction.personId),
        },
        parameters: { temperature: 0.35, top_p: 0.9, max_tokens: Math.max(1200, introductions.length * 700) },
    };
}

export function createPeopleDossierAuthor({ generationRouter = null, timeoutMs = 30000 } = {}) {
    return async function authorPeopleDossiers({ introductions = [], campaignContext = {}, signal = null } = {}) {
        if (typeof generationRouter?.generate !== 'function') {
            return { ok: false, status: 'unavailable', reasonCode: 'provider-missing', diagnostics: {} };
        }
        let request;
        try {
            request = createPeopleDossierRequest({ introductions, campaignContext });
        } catch {
            return { ok: false, status: 'rejected', reasonCode: 'invalid-request', diagnostics: {} };
        }
        let generation;
        try {
            generation = await generationRouter.generate(PEOPLE_DOSSIER_ROLE_ID, request, {
                timeoutMs,
                signal,
                allowVisibleOutputRetry: false,
            });
        } catch {
            return { ok: false, status: 'unavailable', reasonCode: 'provider-threw', diagnostics: {} };
        }
        const diagnostics = {
            providerId: generation?.diagnostics?.providerId || generation?.response?.providerId || null,
            model: generation?.diagnostics?.model || generation?.response?.model || null,
            latencyMs: generation?.diagnostics?.latencyMs ?? null,
        };
        if (generation?.ok !== true) {
            return { ok: false, status: 'unavailable', reasonCode: 'provider-empty', diagnostics };
        }
        const parsed = parsePeopleDossierBatchOutput(responsePayload(generation), { introductions });
        if (!parsed.ok) {
            return {
                ok: false,
                status: 'rejected',
                reasonCode: 'invalid-output',
                diagnostics: { ...diagnostics, errorCount: parsed.errors.length },
            };
        }
        return {
            ok: true,
            status: 'authored',
            dossiers: parsed.value.dossiers,
            diagnostics,
        };
    };
}
