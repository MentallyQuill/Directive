import { validateMissionStateAuthority } from './mission-state-authority.mjs';
import { createMissionState } from './mission-state.mjs';

export const MISSION_JOURNEY_KIND = 'directive.missionJourney.v1';
export const MISSION_RUN_ARCHIVE_KIND = 'directive.missionRunArchive.v1';
export const MISSION_JOURNEY_CONTRACT_VERSION = 1;

const JOURNEY_FIELDS = new Set([
    'kind',
    'contractVersion',
    'branchId',
    'revision',
    'activeRunId',
]);
const ARCHIVE_FIELDS = new Set([
    'kind',
    'contractVersion',
    'runId',
    'definitionId',
    'definitionVersion',
    'sourceId',
    'packageBinding',
    'branchId',
    'archivedAtJourneyRevision',
    'state',
]);

function compact(value) {
    return String(value ?? '').trim();
}

function cloneJson(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableId(value) {
    return /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(compact(value));
}

function stableHash(value = '') {
    let hash = 0x811c9dc5;
    for (const character of String(value)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function sameJson(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function unknownFields(value, allowed) {
    if (!isObject(value)) return [];
    return Object.keys(value).filter((field) => !allowed.has(field));
}

function definitionList(definitions = []) {
    return (Array.isArray(definitions) ? definitions : [])
        .map((entry) => entry?.definition || entry)
        .filter((entry) => isObject(entry));
}

function definitionById(definitions, definitionId) {
    const matches = definitions.filter((definition) => definition.id === definitionId);
    return matches.length === 1 ? matches[0] : null;
}

function targetMatchesDefinition(target = {}, definition = {}) {
    return target.kind === 'mission'
        && (target.id === definition.id || target.id === definition?.packageBinding?.sourceId);
}

function assertJourneyCondition(condition, message) {
    if (!condition) throw new TypeError(message);
}

export function initialMissionRunId({ branchId = null, definition = {} } = {}) {
    assertJourneyCondition(stableId(branchId), 'initial mission run requires a stable branchId');
    assertJourneyCondition(stableId(definition?.id), 'initial mission run requires a stable definition id');
    assertJourneyCondition(stableId(definition?.packageBinding?.packageId), 'initial mission run requires a package id');
    return `mission-run.${stableHash([
        compact(branchId),
        definition.packageBinding.packageId,
        definition.packageBinding.packageVersion,
        definition.id,
        'root',
    ].join('|'))}`;
}

export function successorMissionRunId({
    branchId = null,
    sourceRunId = null,
    transitionId = null,
    targetDefinition = {},
} = {}) {
    assertJourneyCondition(stableId(branchId), 'successor mission run requires a stable branchId');
    assertJourneyCondition(stableId(sourceRunId), 'successor mission run requires a stable source run id');
    assertJourneyCondition(stableId(transitionId), 'successor mission run requires a stable transition id');
    assertJourneyCondition(stableId(targetDefinition?.id), 'successor mission run requires a target definition');
    return `mission-run.${stableHash([
        compact(branchId),
        compact(sourceRunId),
        compact(transitionId),
        targetDefinition.id,
        targetDefinition.version,
    ].join('|'))}`;
}

export function createInitialMissionJourney({ branchId = null, definition = {} } = {}) {
    return {
        journey: {
            kind: MISSION_JOURNEY_KIND,
            contractVersion: MISSION_JOURNEY_CONTRACT_VERSION,
            branchId: compact(branchId),
            revision: 0,
            activeRunId: initialMissionRunId({ branchId, definition }),
        },
        history: [],
    };
}

export function createMissionRunArchive({
    runId = null,
    state = {},
    definition = {},
    archivedAtJourneyRevision = null,
} = {}) {
    assertJourneyCondition(stableId(runId), 'mission archive requires a stable run id');
    assertJourneyCondition(state?.status === 'terminal', 'mission archive requires terminal state');
    assertJourneyCondition(Number.isInteger(archivedAtJourneyRevision) && archivedAtJourneyRevision > 0,
        'mission archive requires a positive journey revision');
    const authority = validateMissionStateAuthority({ definition, state });
    assertJourneyCondition(authority.ok, 'mission archive state authority is invalid');
    return {
        kind: MISSION_RUN_ARCHIVE_KIND,
        contractVersion: MISSION_JOURNEY_CONTRACT_VERSION,
        runId: compact(runId),
        definitionId: definition.id,
        definitionVersion: definition.version,
        sourceId: definition.packageBinding.sourceId,
        packageBinding: cloneJson(definition.packageBinding),
        branchId: state.branchId,
        archivedAtJourneyRevision,
        state: cloneJson(state),
    };
}

export function createSuccessorMissionJourney({
    journey = {},
    history = [],
    sourceState = {},
    sourceDefinition = {},
    targetDefinition = {},
} = {}) {
    assertJourneyCondition(journey?.kind === MISSION_JOURNEY_KIND
        && journey?.contractVersion === MISSION_JOURNEY_CONTRACT_VERSION,
    'successor activation requires a current mission journey');
    assertJourneyCondition(stableId(journey?.branchId) && stableId(journey?.activeRunId),
        'successor activation requires valid current run identity');
    assertJourneyCondition(Number.isInteger(journey?.revision) && journey.revision >= 0,
        'successor activation requires a valid journey revision');
    assertJourneyCondition(Array.isArray(history) && history.length === journey.revision,
        'successor activation history must match the journey revision');
    assertJourneyCondition(!history.some((entry) => entry?.runId === journey.activeRunId
        || entry?.definitionId === sourceDefinition.id),
    'successor activation source must be the unarchived current run');
    assertJourneyCondition(sourceState?.status === 'terminal', 'successor activation requires terminal source state');
    assertJourneyCondition(sourceState?.transitionReceipt, 'successor activation requires a transition receipt');
    assertJourneyCondition(sourceDefinition.id !== targetDefinition.id, 'successor activation cannot self-target');
    assertJourneyCondition(targetMatchesDefinition(sourceState.transitionReceipt.target, targetDefinition),
        'successor target definition does not match the authored transition');
    assertJourneyCondition(sourceDefinition.packageBinding?.packageId === targetDefinition.packageBinding?.packageId
        && sourceDefinition.packageBinding?.packageVersion === targetDefinition.packageBinding?.packageVersion,
    'successor activation requires the same package version');
    const seenDefinitionIds = new Set([
        ...(Array.isArray(history) ? history : []).map((entry) => entry?.definitionId),
        sourceDefinition.id,
    ]);
    assertJourneyCondition(!seenDefinitionIds.has(targetDefinition.id), 'successor activation cannot duplicate a definition');
    const nextRevision = Number(journey.revision) + 1;
    const archived = createMissionRunArchive({
        runId: journey.activeRunId,
        state: sourceState,
        definition: sourceDefinition,
        archivedAtJourneyRevision: nextRevision,
    });
    const activeRunId = successorMissionRunId({
        branchId: journey.branchId,
        sourceRunId: journey.activeRunId,
        transitionId: sourceState.transitionReceipt.transitionId,
        targetDefinition,
    });
    return {
        journey: {
            kind: MISSION_JOURNEY_KIND,
            contractVersion: MISSION_JOURNEY_CONTRACT_VERSION,
            branchId: journey.branchId,
            revision: nextRevision,
            activeRunId,
        },
        history: [...cloneJson(history || []), archived],
        currentState: createMissionState({ definition: targetDefinition, branchId: journey.branchId }),
    };
}

export function validateMissionJourney({ campaignState = {}, definitions = [] } = {}) {
    const errors = [];
    const mission = campaignState?.mission || {};
    const journey = mission.v1Journey;
    const history = mission.v1History;
    const currentState = mission.v1;
    const availableDefinitions = definitionList(definitions);
    if (!isObject(journey)) return { ok: false, errors: ['mission v1Journey must be an object'] };
    if (!Array.isArray(history)) errors.push('mission v1History must be an array');
    if (!isObject(currentState)) errors.push('mission v1 current state must be an object');
    for (const field of unknownFields(journey, JOURNEY_FIELDS)) errors.push(`mission v1Journey contains unknown field: ${field}`);
    if (journey.kind !== MISSION_JOURNEY_KIND) errors.push(`mission v1Journey kind must be ${MISSION_JOURNEY_KIND}`);
    if (journey.contractVersion !== MISSION_JOURNEY_CONTRACT_VERSION) errors.push('mission v1Journey contractVersion is unknown');
    const branchId = compact(campaignState?.campaignChatBinding?.saveId);
    if (!stableId(branchId) || journey.branchId !== branchId) errors.push('mission v1Journey branch does not match the active save');
    if (!Number.isInteger(journey.revision) || journey.revision < 0) errors.push('mission v1Journey revision is invalid');
    if (!stableId(journey.activeRunId)) errors.push('mission v1Journey activeRunId is invalid');
    if (Array.isArray(history) && journey.revision !== history.length) {
        errors.push('mission v1Journey revision must equal archived run count');
    }
    if (!isObject(currentState)) return { ok: false, errors };

    const currentDefinition = definitionById(availableDefinitions, currentState.definitionId);
    if (!currentDefinition) errors.push('current mission definition is unavailable or ambiguous');
    if (currentDefinition) {
        const currentAuthority = validateMissionStateAuthority({ definition: currentDefinition, state: currentState });
        if (!currentAuthority.ok) errors.push('current mission state authority is invalid');
        if (mission.activeMissionId !== currentDefinition.packageBinding.sourceId) {
            errors.push('mission activeMissionId does not match the current V1 definition');
        }
    }
    const activePackage = campaignState?.activeCampaignPackage || {};
    if (currentDefinition && (activePackage.packageId !== currentDefinition.packageBinding.packageId
        || activePackage.packageVersion !== currentDefinition.packageBinding.packageVersion)) {
        errors.push('current mission package does not match the active campaign package');
    }

    const runIds = new Set();
    const definitionIds = new Set();
    let expectedRunId = null;
    let previousArchive = null;
    for (const [index, archive] of (Array.isArray(history) ? history : []).entries()) {
        for (const field of unknownFields(archive, ARCHIVE_FIELDS)) {
            errors.push(`mission archive contains unknown field: ${field}`);
        }
        if (archive?.kind !== MISSION_RUN_ARCHIVE_KIND) errors.push('mission archive kind is invalid');
        if (archive?.contractVersion !== MISSION_JOURNEY_CONTRACT_VERSION) errors.push('mission archive contractVersion is unknown');
        if (!stableId(archive?.runId) || runIds.has(archive.runId)) errors.push('mission archive run identity is invalid or duplicate');
        runIds.add(archive?.runId);
        if (!stableId(archive?.definitionId) || definitionIds.has(archive.definitionId)) {
            errors.push('mission archive definition identity is invalid or duplicate');
        }
        definitionIds.add(archive?.definitionId);
        if (archive?.branchId !== branchId || archive?.state?.branchId !== branchId) errors.push('mission archive branch does not match');
        if (archive?.state?.status !== 'terminal') errors.push('mission archive state must be terminal');
        if (archive?.archivedAtJourneyRevision !== index + 1) errors.push('mission archive journey revision is invalid');
        const definition = definitionById(availableDefinitions, archive?.definitionId);
        if (!definition) {
            errors.push('mission archive definition is unavailable or ambiguous');
        } else {
            if (archive.definitionVersion !== definition.version
                || archive.sourceId !== definition.packageBinding.sourceId
                || !sameJson(archive.packageBinding, definition.packageBinding)
                || archive.state?.definitionId !== definition.id
                || archive.state?.definitionVersion !== definition.version
                || !sameJson(archive.state?.packageBinding, definition.packageBinding)) {
                errors.push('mission archive package or definition binding does not match');
            }
            const authority = validateMissionStateAuthority({ definition, state: archive.state });
            if (!authority.ok) errors.push('mission archive state authority is invalid');
            try {
                expectedRunId = index === 0
                    ? initialMissionRunId({ branchId, definition })
                    : successorMissionRunId({
                        branchId,
                        sourceRunId: previousArchive.runId,
                        transitionId: previousArchive.state.transitionReceipt?.transitionId,
                        targetDefinition: definition,
                    });
            } catch {
                expectedRunId = null;
                errors.push('mission archive run lineage cannot be derived');
            }
            if (archive.runId !== expectedRunId) errors.push('mission archive run identity does not match lineage');
            if (previousArchive && !targetMatchesDefinition(previousArchive.state.transitionReceipt?.target, definition)) {
                errors.push('mission archive transition lineage is broken');
            }
        }
        previousArchive = archive;
    }

    if (definitionIds.has(currentState.definitionId)) errors.push('current mission definition duplicates archived history');
    if (runIds.has(journey.activeRunId)) errors.push('mission v1Journey active run duplicates archived run identity');
    if (currentDefinition) {
        let expectedActiveRunId = null;
        try {
            expectedActiveRunId = previousArchive
                ? successorMissionRunId({
                    branchId,
                    sourceRunId: previousArchive.runId,
                    transitionId: previousArchive.state.transitionReceipt?.transitionId,
                    targetDefinition: currentDefinition,
                })
                : initialMissionRunId({ branchId, definition: currentDefinition });
        } catch {
            errors.push('mission v1Journey active run lineage cannot be derived');
        }
        if (journey.activeRunId !== expectedActiveRunId) errors.push('mission v1Journey activeRunId does not match transition lineage');
        if (previousArchive && !targetMatchesDefinition(previousArchive.state.transitionReceipt?.target, currentDefinition)) {
            errors.push('mission journey transition lineage does not reach the current definition');
        }
    }
    return { ok: errors.length === 0, errors };
}
