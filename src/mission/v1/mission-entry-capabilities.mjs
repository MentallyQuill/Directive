export const MISSION_ENTRY_CONTEXT_KIND = 'directive.missionEntryContext.v1';

const CONTEXT_FIELDS = new Set(['kind', 'capabilities']);
const RECEIPT_FIELDS = new Set([
    'id',
    'sourceRunId',
    'sourceDefinitionId',
    'sourceDefinitionVersion',
    'dimensions',
]);
const DIMENSION_FIELDS = new Set(['id', 'value']);

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

function sameJson(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function unknownFields(value, allowed) {
    if (!isObject(value)) return [];
    return Object.keys(value).filter((field) => !allowed.has(field));
}

function declarations(definition) {
    return Array.isArray(definition?.entryCapabilities) ? definition.entryCapabilities : [];
}

export function validateMissionEntryCapabilitySources({ definition = {}, definitions = [] } = {}) {
    const errors = [];
    const available = (Array.isArray(definitions) ? definitions : [])
        .map((entry) => entry?.definition || entry)
        .filter(isObject);
    for (const capability of declarations(definition)) {
        const path = capability?.id || '<unknown entry capability>';
        const matches = available.filter((candidate) => candidate.id === capability?.source?.definitionId);
        if (matches.length !== 1) {
            errors.push(`${path} source definition is unavailable or ambiguous`);
            continue;
        }
        const source = matches[0];
        if (source.version !== capability.source.definitionVersion) {
            errors.push(`${path} source definition version does not match`);
        }
        if (source.packageBinding?.packageId !== definition.packageBinding?.packageId
            || source.packageBinding?.packageVersion !== definition.packageBinding?.packageVersion) {
            errors.push(`${path} source definition must use the same package version`);
        }
        const dimensions = new Map((source.outcomeDimensions || []).map((dimension) => [dimension.id, dimension]));
        for (const requirement of capability.source.requirements || []) {
            const dimension = dimensions.get(requirement.dimensionId);
            if (!dimension) {
                errors.push(`${path} references unknown source outcome dimension: ${requirement.dimensionId}`);
                continue;
            }
            const authoredValues = new Set((dimension.derive || []).map((derivation) => derivation.value));
            for (const value of requirement.in || []) {
                if (!authoredValues.has(value)) {
                    errors.push(`${path} references unknown source outcome value: ${requirement.dimensionId}=${value}`);
                }
            }
        }
    }
    return { ok: errors.length === 0, errors };
}

export function emptyMissionEntryContext() {
    return {
        kind: MISSION_ENTRY_CONTEXT_KIND,
        capabilities: [],
    };
}

function sourceArchiveFor(capability, history) {
    const matches = history.filter((archive) => (
        archive?.definitionId === capability?.source?.definitionId
        && archive?.definitionVersion === capability?.source?.definitionVersion
    ));
    if (matches.length > 1) {
        throw new TypeError(`mission entry capability source is ambiguous: ${capability.id}`);
    }
    return matches[0] || null;
}

function receiptFor(capability, archive) {
    if (!archive) return null;
    const dimensions = [];
    for (const requirement of capability.source.requirements) {
        const value = archive?.state?.outcomeDimensions?.[requirement.dimensionId];
        if (!requirement.in.includes(value)) return null;
        dimensions.push({ id: requirement.dimensionId, value });
    }
    return {
        id: capability.id,
        sourceRunId: archive.runId,
        sourceDefinitionId: archive.definitionId,
        sourceDefinitionVersion: archive.definitionVersion,
        dimensions,
    };
}

export function deriveMissionEntryContext({ targetDefinition = {}, history = [] } = {}) {
    if (!Array.isArray(history)) throw new TypeError('mission entry capability history must be an array');
    return {
        kind: MISSION_ENTRY_CONTEXT_KIND,
        capabilities: declarations(targetDefinition)
            .map((capability) => receiptFor(capability, sourceArchiveFor(capability, history)))
            .filter(Boolean),
    };
}

export function validateMissionEntryContext({
    definition = {},
    entryContext,
    history,
} = {}) {
    const errors = [];
    const authored = declarations(definition);
    if (authored.length === 0) {
        if (entryContext !== undefined) errors.push('entryContext is not authored for this mission');
        return { ok: errors.length === 0, errors };
    }
    if (!isObject(entryContext)) {
        return { ok: false, errors: ['entryContext is required for authored mission entry capabilities'] };
    }
    for (const field of unknownFields(entryContext, CONTEXT_FIELDS)) {
        errors.push(`entryContext contains unknown field: ${field}`);
    }
    if (entryContext.kind !== MISSION_ENTRY_CONTEXT_KIND) {
        errors.push(`entryContext kind must be ${MISSION_ENTRY_CONTEXT_KIND}`);
    }
    if (!Array.isArray(entryContext.capabilities)) {
        errors.push('entryContext capabilities must be an array');
        return { ok: false, errors };
    }

    const authoredById = new Map(authored.map((capability) => [capability.id, capability]));
    const seen = new Set();
    let previousAuthoredIndex = -1;
    for (const [receiptIndex, receipt] of entryContext.capabilities.entries()) {
        const path = `entryContext.capabilities[${receiptIndex}]`;
        if (!isObject(receipt)) {
            errors.push(`${path} must be an object`);
            continue;
        }
        for (const field of unknownFields(receipt, RECEIPT_FIELDS)) {
            errors.push(`${path} contains unknown field: ${field}`);
        }
        if (!stableId(receipt.id) || !authoredById.has(receipt.id)) {
            errors.push(`${path} references an unknown authored capability`);
            continue;
        }
        if (seen.has(receipt.id)) errors.push(`${path} duplicates capability: ${receipt.id}`);
        seen.add(receipt.id);
        const authoredIndex = authored.findIndex((capability) => capability.id === receipt.id);
        if (authoredIndex <= previousAuthoredIndex) errors.push('entryContext capabilities must follow authored order');
        previousAuthoredIndex = authoredIndex;
        const capability = authoredById.get(receipt.id);
        if (!stableId(receipt.sourceRunId)) errors.push(`${path} sourceRunId must be a stable id`);
        if (receipt.sourceDefinitionId !== capability.source.definitionId
            || receipt.sourceDefinitionVersion !== capability.source.definitionVersion) {
            errors.push(`${path} source definition does not match authored capability`);
        }
        if (!Array.isArray(receipt.dimensions)) {
            errors.push(`${path} dimensions must be an array`);
            continue;
        }
        if (receipt.dimensions.length !== capability.source.requirements.length) {
            errors.push(`${path} dimensions must exactly match authored requirements`);
        }
        for (const [dimensionIndex, dimension] of receipt.dimensions.entries()) {
            const dimensionPath = `${path}.dimensions[${dimensionIndex}]`;
            if (!isObject(dimension)) {
                errors.push(`${dimensionPath} must be an object`);
                continue;
            }
            for (const field of unknownFields(dimension, DIMENSION_FIELDS)) {
                errors.push(`${dimensionPath} contains unknown field: ${field}`);
            }
            const requirement = capability.source.requirements[dimensionIndex];
            if (!requirement || dimension.id !== requirement.dimensionId) {
                errors.push(`${dimensionPath} does not match authored requirement order`);
            } else if (!requirement.in.includes(dimension.value)) {
                errors.push(`${dimensionPath} value does not satisfy authored requirement`);
            }
        }
    }

    if (Array.isArray(history)) {
        try {
            const expected = deriveMissionEntryContext({ targetDefinition: definition, history });
            if (!sameJson(entryContext, expected)) {
                errors.push('entryContext does not match archived mission outcome authority');
            }
        } catch {
            errors.push('entryContext cannot be derived from archived mission history');
        }
    }
    return { ok: errors.length === 0, errors };
}

export function cloneMissionEntryContext(entryContext) {
    return cloneJson(entryContext);
}
