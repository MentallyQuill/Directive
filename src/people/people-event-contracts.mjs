import { stableSha256Hex } from '../runtime/v1-stable-hash.mjs';

export const PEOPLE_EVENT_TYPES = Object.freeze([
    'personIntroduced',
    'publicFactLearned',
    'relationshipEvidence',
]);

export const PUBLIC_PERSON_FACT_FIELDS = Object.freeze([
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

const INTRODUCTION_FIELDS = new Set([
    'id',
    'type',
    'personId',
    'name',
    'introductionSummary',
    'publicFacts',
    'sourceContributionIds',
    'evidenceQuote',
    'evidenceQuoteHash',
]);
const PUBLIC_FACT_FIELDS = new Set([
    'id',
    'type',
    'personId',
    'field',
    'value',
    'sourceContributionIds',
    'evidenceQuote',
    'evidenceQuoteHash',
]);
const RELATIONSHIP_EVIDENCE_FIELDS = new Set([
    'id',
    'type',
    'personId',
    'summary',
    'sourceContributionIds',
    'evidenceQuote',
    'evidenceQuoteHash',
]);

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStableId(value) {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]*$/.test(value);
}

function compact(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function validateSources(value, knownContributionIds, errors) {
    if (!Array.isArray(value) || value.length === 0) {
        errors.push('people event sourceContributionIds must be a non-empty array');
        return;
    }
    if (value.length > 16) errors.push('people event sourceContributionIds exceeds 16 ids');
    if (new Set(value).size !== value.length) errors.push('people event sourceContributionIds must be unique');
    const known = knownContributionIds === null ? null : new Set(knownContributionIds || []);
    for (const id of value) {
        if (!isStableId(id)) errors.push('people event sourceContributionIds contains an invalid id');
        else if (known && !known.has(id)) errors.push(`people event references unknown source contribution: ${id}`);
    }
}

export function validatePeopleEvent(event = {}, {
    knownContributionIds = null,
    knownPersonIds = null,
} = {}) {
    const errors = [];
    if (!isObject(event)) return { ok: false, errors: ['people event must be an object'] };
    if (!PEOPLE_EVENT_TYPES.includes(event.type)) {
        return { ok: false, errors: ['people event type is unsupported'] };
    }
    if (!isStableId(event.id)) errors.push('people event id must be stable');
    if (!isStableId(event.personId)) errors.push('people event personId must be stable');
    if (event.evidenceQuote !== undefined) {
        const quote = compact(event.evidenceQuote);
        if ([...quote].length < 12 || [...quote].length > 240) {
            errors.push('people event evidenceQuote must contain 12 through 240 characters');
        }
        if (!/^[a-f0-9]{8}$/.test(String(event.evidenceQuoteHash || ''))) {
            errors.push('people event evidenceQuoteHash must be an 8-character lowercase hex digest');
        } else if (event.evidenceQuoteHash !== stableSha256Hex(quote).slice(0, 8)) {
            errors.push('people event evidenceQuoteHash does not match evidenceQuote');
        }
    } else if (event.evidenceQuoteHash !== undefined) {
        errors.push('people event evidenceQuoteHash requires evidenceQuote');
    }
    if (event.type === 'personIntroduced') {
        for (const field of Object.keys(event)) {
            if (!INTRODUCTION_FIELDS.has(field)) errors.push(`people event contains unknown field: ${field}`);
        }
        if (!compact(event.name) || [...compact(event.name)].length > 120) {
            errors.push('person introduction name must contain at most 120 characters');
        }
        if (!compact(event.introductionSummary) || [...compact(event.introductionSummary)].length > 512) {
            errors.push('person introduction summary must contain at most 512 characters');
        }
        if (!isObject(event.publicFacts)) {
            errors.push('person introduction publicFacts must be an object');
        } else {
            for (const [field, value] of Object.entries(event.publicFacts)) {
                if (!PUBLIC_PERSON_FACT_FIELDS.includes(field)) {
                    errors.push(`person introduction publicFacts contains unsupported field: ${field}`);
                } else if (!compact(value) || [...compact(value)].length > (field === 'profileSummary' ? 512 : 240)) {
                    errors.push(`person introduction publicFacts ${field} is invalid`);
                }
            }
        }
    } else if (event.type === 'publicFactLearned') {
        for (const field of Object.keys(event)) {
            if (!PUBLIC_FACT_FIELDS.has(field)) errors.push(`people event contains unknown field: ${field}`);
        }
        if (!PUBLIC_PERSON_FACT_FIELDS.includes(event.field)) {
            errors.push('public fact field is unsupported');
        }
        const maximum = event.field === 'profileSummary' ? 512 : 240;
        if (!compact(event.value) || [...compact(event.value)].length > maximum) {
            errors.push('public fact value is invalid');
        }
        const known = knownPersonIds === null ? null : new Set(knownPersonIds || []);
        if (known && !known.has(event.personId)) errors.push(`public fact references unknown person: ${event.personId}`);
    } else if (event.type === 'relationshipEvidence') {
        for (const field of Object.keys(event)) {
            if (!RELATIONSHIP_EVIDENCE_FIELDS.has(field)) errors.push(`people event contains unknown field: ${field}`);
        }
        if (!compact(event.summary) || [...compact(event.summary)].length > 512) {
            errors.push('relationship evidence summary is invalid');
        }
        const known = knownPersonIds === null ? null : new Set(knownPersonIds || []);
        if (known && !known.has(event.personId)) {
            errors.push(`relationship evidence references unknown person: ${event.personId}`);
        }
    }
    validateSources(event.sourceContributionIds, knownContributionIds, errors);
    return { ok: errors.length === 0, errors };
}
