import { deriveMissionEntryContext } from '../mission/v1/mission-entry-capabilities.mjs';
import {
    initialMissionRunId,
    successorMissionRunId,
} from '../mission/v1/mission-journey.mjs';
import { reduceMissionEvidence } from '../mission/v1/mission-reducer.mjs';
import { createMissionState } from '../mission/v1/mission-state.mjs';
import { validateMissionStateAuthority } from '../mission/v1/mission-state-authority.mjs';
import { ASHES_V1_PACKAGE_ID } from '../packages/bundled-package-registry.mjs';

export const MISSION_CLOCK_REMOVAL_SOURCE_VERSION = '0.3.0-pre-alpha.1';
export const MISSION_CLOCK_REMOVAL_TARGET_VERSION = '0.3.0-pre-alpha.2';

const AMBIGUOUS_DISPOSITION = 'expiredAfterKnownDeadline';
const AMBIGUOUS_EVENT = 'event.hesperus.life-support-window-expired';
const SEMANTIC_STATE_FIELDS = Object.freeze([
    'status',
    'objectives',
    'knownFacts',
    'worldFacts',
    'events',
    'outcomes',
    'outcomeDimensions',
    'terminalDisposition',
]);

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function same(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function resultError(reasonCode, diagnostics = {}) {
    return {
        ok: false,
        migrated: false,
        reasonCode,
        campaignState: null,
        diagnostics,
    };
}

function definitionsById(missionDefinitions = []) {
    return new Map((Array.isArray(missionDefinitions) ? missionDefinitions : [])
        .map((record) => record?.definition || record)
        .filter((definition) => definition?.id)
        .map((definition) => [definition.id, definition]));
}

function containsClockExpiryMeaning(state = {}) {
    return Object.values(state.objectives || {})
        .some((objective) => objective?.disposition === AMBIGUOUS_DISPOSITION)
        || (state.events || []).includes(AMBIGUOUS_EVENT);
}

function evidenceBatches(evidenceLog = []) {
    const batches = [];
    for (const entry of evidenceLog) {
        if (entry?.claimType === 'timeAdvanced') continue;
        const revision = Number.isInteger(entry?.acceptedAtMissionRevision)
            ? entry.acceptedAtMissionRevision
            : 0;
        const previous = batches.at(-1);
        if (!previous || previous.revision !== revision) batches.push({ revision, claims: [] });
        batches.at(-1).claims.push(clone(entry));
    }
    return batches;
}

function rebuildMissionState({ oldState, definition, history }) {
    if (!oldState || !definition) return { ok: false, reasonCode: 'clock-removal-definition-unavailable' };
    if (containsClockExpiryMeaning(oldState)) {
        return { ok: false, reasonCode: 'clock-removal-narrative-ambiguity' };
    }
    let entryContext;
    try {
        entryContext = definition.entryCapabilities?.length > 0
            ? deriveMissionEntryContext({ targetDefinition: definition, history })
            : undefined;
    } catch {
        return { ok: false, reasonCode: 'clock-removal-entry-context-invalid' };
    }
    let rebuilt;
    try {
        rebuilt = createMissionState({
            definition,
            branchId: oldState.branchId,
            ...(entryContext ? { entryContext } : {}),
        });
        for (const batch of evidenceBatches(oldState.evidenceLog || [])) {
            rebuilt = reduceMissionEvidence({
                definition,
                state: rebuilt,
                acceptedClaims: batch.claims,
                sourceContribution: null,
            }).state;
        }
    } catch {
        return { ok: false, reasonCode: 'clock-removal-evidence-replay-failed' };
    }
    for (const field of SEMANTIC_STATE_FIELDS) {
        if (!same(oldState[field], rebuilt[field])) {
            return { ok: false, reasonCode: 'clock-removal-narrative-ambiguity' };
        }
    }
    rebuilt.invalidatedSourceContributionIds = clone(oldState.invalidatedSourceContributionIds || []);
    rebuilt.revision = Math.max(oldState.revision || 0, rebuilt.revision);
    const authority = validateMissionStateAuthority({ definition, state: rebuilt });
    if (!authority.ok) {
        return {
            ok: false,
            reasonCode: 'clock-removal-replay-authority-invalid',
            errors: authority.errors,
        };
    }
    return { ok: true, state: rebuilt };
}

function migratedRunId({ branchId, history, definition }) {
    if (history.length === 0) return initialMissionRunId({ branchId, definition });
    const previous = history.at(-1);
    return successorMissionRunId({
        branchId,
        sourceRunId: previous.runId,
        transitionId: previous.state.transitionReceipt.transitionId,
        sourceMissionRevision: previous.state.revision,
        targetDefinition: definition,
    });
}

function migrateMissionJourney(campaignState, definitions) {
    const oldMission = campaignState.mission || {};
    const history = [];
    for (const oldArchive of oldMission.v1History || []) {
        const definition = definitions.get(oldArchive?.definitionId);
        const rebuilt = rebuildMissionState({ oldState: oldArchive?.state, definition, history });
        if (!rebuilt.ok) return rebuilt;
        const runId = migratedRunId({
            branchId: rebuilt.state.branchId,
            history,
            definition,
        });
        history.push({
            kind: oldArchive.kind,
            contractVersion: oldArchive.contractVersion,
            runId,
            definitionId: definition.id,
            definitionVersion: definition.version,
            sourceId: definition.packageBinding.sourceId,
            packageBinding: clone(definition.packageBinding),
            branchId: rebuilt.state.branchId,
            archivedAtJourneyRevision: history.length + 1,
            state: rebuilt.state,
        });
    }
    const activeDefinition = definitions.get(oldMission.v1?.definitionId);
    const active = rebuildMissionState({ oldState: oldMission.v1, definition: activeDefinition, history });
    if (!active.ok) return active;
    const activeRunId = migratedRunId({
        branchId: active.state.branchId,
        history,
        definition: activeDefinition,
    });
    return {
        ok: true,
        mission: {
            ...clone(oldMission),
            activeMissionId: activeDefinition.packageBinding.sourceId,
            v1: active.state,
            v1Journey: {
                ...clone(oldMission.v1Journey),
                revision: history.length,
                activeRunId,
            },
            v1History: history,
        },
    };
}

export function migrateV1MissionClockRemoval({
    campaignState = null,
    packageData = null,
    missionDefinitions = [],
} = {}) {
    const input = clone(campaignState);
    const sourceVersion = input?.activeCampaignPackage?.packageVersion || null;
    const targetVersion = packageData?.manifest?.version || null;
    const diagnostics = {
        sourcePackageVersion: sourceVersion,
        targetPackageVersion: targetVersion,
        removedTimeEvidenceCount: 0,
    };
    if (input?.activeCampaignPackage?.packageId !== ASHES_V1_PACKAGE_ID) {
        return resultError('clock-removal-package-unsupported', diagnostics);
    }
    if (targetVersion !== MISSION_CLOCK_REMOVAL_TARGET_VERSION) {
        return resultError('clock-removal-target-version-invalid', diagnostics);
    }
    if (sourceVersion === MISSION_CLOCK_REMOVAL_TARGET_VERSION) {
        return { ok: true, migrated: false, reasonCode: null, campaignState: input, diagnostics };
    }
    if (sourceVersion !== MISSION_CLOCK_REMOVAL_SOURCE_VERSION) {
        return resultError('clock-removal-source-version-unsupported', diagnostics);
    }
    diagnostics.removedTimeEvidenceCount = [
        input?.mission?.v1,
        ...(input?.mission?.v1History || []).map((archive) => archive?.state),
    ].reduce((count, state) => count + (state?.evidenceLog || [])
        .filter((entry) => entry?.claimType === 'timeAdvanced').length, 0);

    const definitions = definitionsById(missionDefinitions);
    const journey = migrateMissionJourney(input, definitions);
    if (!journey.ok) return resultError(journey.reasonCode, { ...diagnostics, errors: journey.errors || [] });

    input.activeCampaignPackage.packageVersion = MISSION_CLOCK_REMOVAL_TARGET_VERSION;
    input.campaign.runtimeArchitecture.packageVersion = MISSION_CLOCK_REMOVAL_TARGET_VERSION;
    input.mission = journey.mission;
    return {
        ok: true,
        migrated: true,
        reasonCode: null,
        campaignState: input,
        diagnostics,
    };
}
