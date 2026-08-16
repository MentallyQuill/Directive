import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { revalidateMissionEvidenceReplay } from '../../src/mission/v1/evidence-contracts.mjs';
import { validateMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { validateMissionStateAuthority } from '../../src/mission/v1/mission-state-authority.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createMissionPlayerProjection } from '../../src/mission/v1/player-projection.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import {
    appendShipWorkEvidenceToMissionState,
} from '../../src/ship/v1/ship-work-evidence.mjs';
import { deriveShipMechanicsState } from '../../src/ship/v1/ship-mechanics-state.mjs';
import { pruneStoryEffects } from '../../src/story/story-settlement.mjs';
import {
    loadV1CampaignSave,
    storeV1CampaignSave,
} from '../../src/storage/v1-storage-repository.mjs';
import { toSillyTavernStorageFileName } from '../../src/storage/logical-storage-paths.mjs';

const SAVE_ID = 'save.1786851317628.1';
const CAMPAIGN_ID = 'campaign-1786395087827-1';
const PACKAGE_ID = 'directive:campaign-package:breckenridge-ashes-of-peace';
const PACKAGE_VERSION = '0.3.0-pre-alpha.1';
const CHAT_ID = 'Ashes of Peace - ReadyRoom continuation 3 - Branch #2';
const MISSION_ID = 'mission.prelude-a-ship-underway';
const EXPECTED_CUSTODY_REVISION = 51;

const CONTRIBUTIONS = Object.freeze([
    Object.freeze({
        id: 'contribution.v1.eb870bc9',
        messageId: '12',
        swipeId: '0',
        textHash: 'e3d534d3',
        acceptedAtRevision: 3,
    }),
    Object.freeze({
        id: 'contribution.v1.f31b2dac',
        messageId: '34',
        swipeId: '0',
        textHash: '9910c8b5',
        acceptedAtRevision: 12,
    }),
    Object.freeze({
        id: 'contribution.v1.a8f4f5a6',
        messageId: '36',
        swipeId: '0',
        textHash: 'c58333e5',
        acceptedAtRevision: 14,
    }),
]);

const EVIDENCE = Object.freeze([
    ['contribution.v1.eb870bc9', 'policy.prelude.command-handover-completed', 'eventOccurred', 'event.prelude.command-handover-completed', null],
    ['contribution.v1.f31b2dac', 'policy.prelude.sickbay-consultation-held', 'eventOccurred', 'event.prelude.sickbay-consultation-held', null],
    ['contribution.v1.f31b2dac', 'policy.prelude.staff-readiness-established', 'eventOccurred', 'event.prelude.staff-readiness-established', null],
    ['contribution.v1.f31b2dac', 'policy.prelude.poker-invitation-disclosed', 'factDisclosed', 'fact.prelude.poker-invitation', null],
    ['contribution.v1.f31b2dac', 'ship-milestone.integration-isolation-test', 'shipMilestoneCompleted', 'ship-milestone.integration-isolation-test', null],
    ['contribution.v1.f31b2dac', 'ship-milestone.sensor-controlled-baseline', 'shipMilestoneCompleted', 'ship-milestone.sensor-controlled-baseline', null],
    ['contribution.v1.a8f4f5a6', 'policy.prelude.poker-conversation-held', 'eventOccurred', 'event.prelude.poker-conversation-held', null],
    ['contribution.v1.a8f4f5a6', 'policy.hesperus.records-reviewed', 'eventOccurred', 'event.hesperus.records-reviewed', null],
    ['contribution.v1.a8f4f5a6', 'policy.hesperus.rescue-cost', 'outcomeObserved', 'outcome.hesperus.rescue-cost', 'material'],
    ['contribution.v1.a8f4f5a6', 'policy.hesperus.rescue-result', 'outcomeObserved', 'outcome.hesperus.rescue-result', 'safeWithCost'],
    ['contribution.v1.a8f4f5a6', 'policy.prelude.redline-inventory-drift-disclosed', 'factDisclosed', 'fact.prelude.redline.inventory-drift', null],
    ['contribution.v1.a8f4f5a6', 'policy.hesperus.injector-limit-disclosed', 'factDisclosed', 'fact.hesperus.injector-limit', null],
    ['contribution.v1.a8f4f5a6', 'ship-milestone.integration-combined-load-test', 'shipMilestoneCompleted', 'ship-milestone.integration-combined-load-test', null],
    ['contribution.v1.a8f4f5a6', 'ship-milestone.sensor-live-load-validation', 'shipMilestoneCompleted', 'ship-milestone.sensor-live-load-validation', null],
]);

const EFFECTS = Object.freeze([
    ['effect.v1.4803bb2c463d6c7a6d573f49', 'mission.eventOccurred', 'event.prelude.command-handover-completed', null, 'contribution.v1.eb870bc9'],
    ['effect.v1.2fac6668f2d741664cfc5443', 'mission.eventOccurred', 'event.prelude.sickbay-consultation-held', null, 'contribution.v1.f31b2dac'],
    ['effect.v1.0f0619fc45afea5d93640c66', 'mission.eventOccurred', 'event.prelude.staff-readiness-established', null, 'contribution.v1.f31b2dac'],
    ['effect.v1.bc524a39c894a99c19c6f434', 'mission.factDisclosed', 'fact.prelude.poker-invitation', null, 'contribution.v1.f31b2dac'],
    ['effect.v1.ffeea8b727110f6b693d367a', 'ship.milestoneCompleted', 'ship-milestone.integration-isolation-test', 'ship-system.systems-integration', 'contribution.v1.f31b2dac'],
    ['effect.v1.1c7014f16d75b78b0c2da37b', 'ship.milestoneCompleted', 'ship-milestone.sensor-controlled-baseline', 'ship-system.sensor-calibration', 'contribution.v1.f31b2dac'],
    ['effect.v1.567022a784b3f31ec473205a', 'mission.eventOccurred', 'event.prelude.poker-conversation-held', null, 'contribution.v1.a8f4f5a6'],
    ['effect.v1.9ffa6f350db039eccf097191', 'mission.eventOccurred', 'event.hesperus.records-reviewed', null, 'contribution.v1.a8f4f5a6'],
    ['effect.v1.8eef0a2e6a62b23dcb429f51', 'mission.outcomeObserved', 'outcome.hesperus.rescue-cost', 'material', 'contribution.v1.a8f4f5a6'],
    ['effect.v1.84386dbe9e1de45023de2c2d', 'mission.outcomeObserved', 'outcome.hesperus.rescue-result', 'safeWithCost', 'contribution.v1.a8f4f5a6'],
    ['effect.v1.2f54a2646e37786b21b3fa2f', 'mission.factDisclosed', 'fact.prelude.redline.inventory-drift', null, 'contribution.v1.a8f4f5a6'],
    ['effect.v1.8e8549870c40f7cbee4e4cd4', 'mission.factDisclosed', 'fact.hesperus.injector-limit', null, 'contribution.v1.a8f4f5a6'],
    ['effect.v1.f0e5b2c517302a5806ad0296', 'ship.milestoneCompleted', 'ship-milestone.integration-combined-load-test', 'ship-system.systems-integration', 'contribution.v1.a8f4f5a6'],
    ['effect.v1.83206395d5643d5c7d14fcf9', 'ship.milestoneCompleted', 'ship-milestone.sensor-live-load-validation', 'ship-system.sensor-calibration', 'contribution.v1.a8f4f5a6'],
]);

export const SAM_VICKERS_PREMATURE_EVIDENCE_REPAIR = Object.freeze({
    saveId: SAVE_ID,
    campaignId: CAMPAIGN_ID,
    packageId: PACKAGE_ID,
    packageVersion: PACKAGE_VERSION,
    chatId: CHAT_ID,
    missionId: MISSION_ID,
    expectedCustodyRevision: EXPECTED_CUSTODY_REVISION,
    contributions: CONTRIBUTIONS,
    evidence: EVIDENCE,
    effects: EFFECTS,
});

function jsonEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function key(parts) {
    return JSON.stringify(parts.map((part) => part ?? null));
}

function failGuard(errors) {
    const error = new Error(`Sam Vickers repair target did not match:\n${errors.join('\n')}`);
    error.code = 'DIRECTIVE_SAM_VICKERS_REPAIR_GUARD_FAILED';
    error.details = errors;
    throw error;
}

export function inspectSamVickersPrematureEvidenceRepair(save, { requireRevision = true } = {}) {
    const errors = [];
    const state = save?.state || {};
    const mission = state?.mission?.v1 || {};
    const binding = state?.campaignChatBinding || {};
    const checks = [
        [save?.id, SAVE_ID, 'save id'],
        [save?.campaignId, CAMPAIGN_ID, 'save campaign id'],
        [save?.packageId, PACKAGE_ID, 'save package id'],
        [save?.packageVersion, PACKAGE_VERSION, 'save package version'],
        [state?.campaign?.id, CAMPAIGN_ID, 'state campaign id'],
        [state?.player?.id, 'player-commander', 'player id'],
        [state?.player?.name, 'Sam Vickers', 'player name'],
        [binding?.saveId, SAVE_ID, 'chat binding save id'],
        [binding?.chatId, CHAT_ID, 'chat binding id'],
        [mission?.definitionId, MISSION_ID, 'active mission id'],
        [mission?.branchId, SAVE_ID, 'mission branch id'],
        [mission?.status, 'active', 'mission status'],
    ];
    if (requireRevision) checks.push([state?.stateCustody?.revision, EXPECTED_CUSTODY_REVISION, 'state custody revision']);
    for (const [actual, expected, label] of checks) {
        if (actual !== expected) errors.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }

    const contributions = (state?.storySettlement?.episodes || []).flatMap((episode) => episode.contributions || []);
    for (const expected of CONTRIBUTIONS) {
        const matches = contributions.filter((candidate) => candidate.id === expected.id);
        if (matches.length !== 1) {
            errors.push(`contribution ${expected.id}: expected one match, got ${matches.length}`);
            continue;
        }
        for (const field of ['messageId', 'swipeId', 'textHash', 'acceptedAtRevision']) {
            if (matches[0][field] !== expected[field]) {
                errors.push(`contribution ${expected.id} ${field} mismatch`);
            }
        }
    }

    const targetContributionIds = new Set(CONTRIBUTIONS.map((entry) => entry.id));
    const actualEvidence = (mission.evidenceLog || []).filter((entry) => targetContributionIds.has(entry.sourceContributionId));
    const expectedEvidenceKeys = EVIDENCE.map(([contributionId, policyId, claimType, targetId, value]) => (
        key([contributionId, policyId, claimType, targetId, value])
    )).sort();
    const actualEvidenceKeys = actualEvidence.map((entry) => key([
        entry.sourceContributionId,
        entry.policyId,
        entry.claimType,
        entry.targetId,
        entry.value,
    ])).sort();
    if (!jsonEqual(actualEvidenceKeys, expectedEvidenceKeys)) {
        errors.push('the exact derived mission/ship evidence set no longer matches');
    }

    const targetEffectIds = new Set(EFFECTS.map(([id]) => id));
    const allEffects = (state?.storySettlement?.episodes || []).flatMap((episode) => episode.effects || []);
    const actualEffects = allEffects.filter((effect) => targetEffectIds.has(effect.id));
    const expectedEffectKeys = EFFECTS.map(([id, type, targetId, value, contributionId]) => (
        key([id, type, targetId, value, contributionId, 'active'])
    )).sort();
    const actualEffectKeys = actualEffects.map((effect) => key([
        effect.id,
        effect.type,
        effect.targetId,
        effect.value,
        effect.sourceContributionIds?.length === 1 ? effect.sourceContributionIds[0] : null,
        effect.status,
    ])).sort();
    if (!jsonEqual(actualEffectKeys, expectedEffectKeys)) {
        errors.push('the exact active Story Settlement effect set no longer matches');
    }

    return {
        ok: errors.length === 0,
        errors,
        evidenceCount: actualEvidence.length,
        effectCount: actualEffects.length,
        contributionCount: CONTRIBUTIONS.length,
    };
}

function orderedEvidenceBatches(evidenceLog = []) {
    const batches = [];
    for (const entry of evidenceLog) {
        const revision = entry.acceptedAtMissionRevision;
        if (batches.length === 0 || batches.at(-1).revision !== revision) {
            batches.push({ revision, claims: [] });
        }
        batches.at(-1).claims.push(structuredClone(entry));
    }
    return batches;
}

function rebuildMission({ definition, mission, storySettlement, shipDataset }) {
    const removedContributionIds = new Set(CONTRIBUTIONS.map((entry) => entry.id));
    const survivingEvidence = (mission.evidenceLog || []).filter(
        (entry) => !removedContributionIds.has(entry.sourceContributionId),
    );
    const shipState = deriveShipMechanicsState({ shipDataset, storySettlement });
    const activeEffectIds = new Set((storySettlement.episodes || []).flatMap(
        (episode) => (episode.effects || []).filter((effect) => effect.status === 'active').map((effect) => effect.id),
    ));
    let rebuilt = createMissionState({
        definition,
        branchId: mission.branchId,
        ...(mission.entryContext === undefined ? {} : { entryContext: mission.entryContext }),
    });
    const unexpectedRejections = [];
    for (const batch of orderedEvidenceBatches(survivingEvidence)) {
        const shipClaims = batch.claims.filter((claim) => claim.domain === 'shipWork');
        const missionClaims = batch.claims.filter((claim) => claim.domain !== 'shipWork');
        if (shipClaims.length > 0) rebuilt = appendShipWorkEvidenceToMissionState(rebuilt, shipClaims);
        const replay = revalidateMissionEvidenceReplay({
            definition,
            state: rebuilt,
            claims: missionClaims,
            shipCapabilityEvidenceById: shipState.capabilityEvidenceById,
            activeDependencyEffectIds: activeEffectIds,
        });
        unexpectedRejections.push(...replay.rejectedClaims);
        if (replay.acceptedClaims.length > 0) {
            rebuilt = reduceMissionEvidence({
                definition,
                state: rebuilt,
                acceptedClaims: replay.acceptedClaims,
                sourceContribution: null,
                shipCapabilityEvidenceById: shipState.capabilityEvidenceById,
            }).state;
        }
    }
    if (unexpectedRejections.length > 0) {
        const error = new Error('Guarded repair refused to remove additional surviving evidence.');
        error.code = 'DIRECTIVE_SAM_VICKERS_REPAIR_UNEXPECTED_REJECTION';
        error.details = unexpectedRejections;
        throw error;
    }
    rebuilt.revision = mission.revision + 1;
    rebuilt.invalidatedSourceContributionIds = structuredClone(
        mission.invalidatedSourceContributionIds || [],
    );
    if (rebuilt.transitionReceipt) rebuilt.transitionReceipt.committedAtRevision = rebuilt.revision;
    const authority = validateMissionStateAuthority({ definition, state: rebuilt });
    if (!authority.ok) {
        const error = new Error(`Rebuilt mission authority is invalid:\n${authority.errors.join('\n')}`);
        error.code = 'DIRECTIVE_SAM_VICKERS_REPAIR_AUTHORITY_INVALID';
        throw error;
    }
    return rebuilt;
}

function projectionState(projection, objectiveId) {
    const objective = (projection?.objectives || []).find((entry) => entry.id === objectiveId);
    return {
        status: objective?.status || null,
        disposition: objective?.disposition || null,
    };
}

export async function prepareSamVickersPrematureEvidenceRepair(save, {
    definition,
    missionDefinitions,
    shipDataset,
    now = new Date().toISOString(),
    requireRevision = true,
} = {}) {
    const inspection = inspectSamVickersPrematureEvidenceRepair(save, { requireRevision });
    if (!inspection.ok) failGuard(inspection.errors);
    if (definition?.id !== MISSION_ID || !Array.isArray(missionDefinitions) || !shipDataset?.mechanics) {
        throw new TypeError('current Prelude definition, campaign mission definitions, and ship dataset are required');
    }

    const before = structuredClone(save);
    const contributionSnapshots = new Map(CONTRIBUTIONS.map(({ id }) => [
        id,
        (before.state.storySettlement.episodes || []).flatMap((episode) => episode.contributions || [])
            .find((entry) => entry.id === id),
    ]));
    const acceptedPairReceipts = structuredClone(before.state.storySettlement.acceptedPairReceipts || []);
    const targetEffectIds = EFFECTS.map(([id]) => id);
    const storySettlement = pruneStoryEffects(before.state.storySettlement, { effectIds: targetEffectIds });
    const rebuiltMission = rebuildMission({
        definition,
        mission: before.state.mission.v1,
        storySettlement,
        shipDataset,
    });

    let campaignState = structuredClone(before.state);
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
    });
    await gateway.applyProposal({
        operations: [
            { op: 'set', path: 'storySettlement', value: storySettlement },
            { op: 'set', path: 'mission.v1', value: rebuiltMission },
            ...(campaignState?.mission?.v1Conclusion == null
                ? []
                : [{ op: 'set', path: 'mission.v1Conclusion', value: null }]),
        ],
        domains: ['storySettlement', 'mission'],
        baseRevision: campaignState.stateCustody.revision,
        source: 'repairSamVickersPrematureEvidence',
        reason: 'Removed exact unsupported mission and ship interpretations while preserving accepted narration.',
        metadata: {
            contributionCount: CONTRIBUTIONS.length,
            evidenceCount: EVIDENCE.length,
            effectCount: EFFECTS.length,
        },
    });

    const journey = validateMissionJourney({ campaignState, definitions: missionDefinitions });
    if (!journey.ok) {
        const error = new Error(`Repaired mission journey is invalid:\n${journey.errors.join('\n')}`);
        error.code = 'DIRECTIVE_SAM_VICKERS_REPAIR_JOURNEY_INVALID';
        throw error;
    }
    const allContributions = (campaignState.storySettlement.episodes || []).flatMap(
        (episode) => episode.contributions || [],
    );
    for (const [id, snapshot] of contributionSnapshots) {
        if (!jsonEqual(allContributions.find((entry) => entry.id === id), snapshot)) {
            throw new Error(`repair changed accepted narration contribution ${id}`);
        }
    }
    if (!jsonEqual(campaignState.storySettlement.acceptedPairReceipts || [], acceptedPairReceipts)) {
        throw new Error('repair changed accepted-pair receipts');
    }
    const projection = createMissionPlayerProjection({ definition, state: campaignState.mission.v1 });
    const objectiveStates = Object.fromEntries([
        'objective.prelude.command-handover',
        'objective.prelude.staff-readiness',
        'objective.prelude.hesperus-rescue',
    ].map((id) => [id, projectionState(projection, id)]));
    for (const [id, objective] of Object.entries(objectiveStates)) {
        if (new Set(['completed', 'completedWithCost', 'failed', 'superseded']).has(objective.disposition)) {
            throw new Error(`${id} remained terminal after repair`);
        }
    }

    return {
        save: {
            ...before,
            updatedAt: now,
            state: campaignState,
        },
        report: {
            removedEvidenceCount: EVIDENCE.length,
            removedEffectCount: EFFECTS.length,
            preservedContributionCount: CONTRIBUTIONS.length,
            preservedAcceptedPairReceiptCount: acceptedPairReceipts.length,
            stateRevisionBefore: before.state.stateCustody.revision,
            stateRevisionAfter: campaignState.stateCustody.revision,
            missionRevisionBefore: before.state.mission.v1.revision,
            missionRevisionAfter: campaignState.mission.v1.revision,
            objectiveStates,
        },
    };
}

export async function prepareSamVickersPreservedAuthorityCorrection(save, {
    definition,
    missionDefinitions,
    now = new Date().toISOString(),
} = {}) {
    const errors = [];
    const state = save?.state || {};
    const mission = state?.mission?.v1 || {};
    const targetContributionIds = new Set(CONTRIBUTIONS.map((entry) => entry.id));
    const expectedInvalidated = [
        'contribution.v1.3a145d30',
        'contribution.v1.6cac05d9',
        ...CONTRIBUTIONS.map((entry) => entry.id),
    ];
    for (const [actual, expected, label] of [
        [save?.id, SAVE_ID, 'save id'],
        [state?.stateCustody?.revision, 52, 'state custody revision'],
        [mission?.revision, 17, 'mission revision'],
        [mission?.definitionId, MISSION_ID, 'active mission id'],
        [mission?.status, 'active', 'mission status'],
    ]) {
        if (actual !== expected) errors.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
    if (!jsonEqual(mission.invalidatedSourceContributionIds || [], expectedInvalidated)) {
        errors.push('mission invalidated-source markers do not match the exact post-repair state');
    }
    if ((mission.evidenceLog || []).some((entry) => targetContributionIds.has(entry.sourceContributionId))) {
        errors.push('targeted unsupported evidence unexpectedly returned');
    }
    const targetEffectIds = new Set(EFFECTS.map(([id]) => id));
    if ((state?.storySettlement?.episodes || []).flatMap((episode) => episode.effects || [])
        .some((effect) => targetEffectIds.has(effect.id))) {
        errors.push('targeted unsupported Story Settlement effects unexpectedly returned');
    }
    const allContributions = (state?.storySettlement?.episodes || []).flatMap(
        (episode) => episode.contributions || [],
    );
    for (const expected of CONTRIBUTIONS) {
        const contribution = allContributions.find((entry) => entry.id === expected.id);
        if (!contribution || contribution.messageId !== expected.messageId || contribution.textHash !== expected.textHash) {
            errors.push(`preserved narration contribution ${expected.id} is missing or changed`);
        }
    }
    if (errors.length > 0) failGuard(errors);

    const before = structuredClone(save);
    const repairedMission = structuredClone(mission);
    repairedMission.invalidatedSourceContributionIds = (mission.invalidatedSourceContributionIds || [])
        .filter((id) => !targetContributionIds.has(id));
    repairedMission.revision += 1;
    if (repairedMission.transitionReceipt) {
        repairedMission.transitionReceipt.committedAtRevision = repairedMission.revision;
    }
    const authority = validateMissionStateAuthority({ definition, state: repairedMission });
    if (!authority.ok) {
        throw new Error(`Corrected mission authority is invalid:\n${authority.errors.join('\n')}`);
    }
    let campaignState = structuredClone(state);
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
    });
    await gateway.applyProposal({
        operations: [{ op: 'set', path: 'mission.v1', value: repairedMission }],
        domains: ['mission'],
        baseRevision: campaignState.stateCustody.revision,
        source: 'repairSamVickersPreservedAuthorityMarkers',
        reason: 'Restored accepted narration source authority after surgical effect rollback.',
        metadata: { restoredContributionCount: CONTRIBUTIONS.length },
    });
    const journey = validateMissionJourney({ campaignState, definitions: missionDefinitions });
    if (!journey.ok) throw new Error(`Corrected mission journey is invalid:\n${journey.errors.join('\n')}`);
    return {
        save: { ...before, updatedAt: now, state: campaignState },
        report: {
            restoredContributionAuthorityCount: CONTRIBUTIONS.length,
            stateRevisionBefore: before.state.stateCustody.revision,
            stateRevisionAfter: campaignState.stateCustody.revision,
            missionRevisionBefore: before.state.mission.v1.revision,
            missionRevisionAfter: campaignState.mission.v1.revision,
            remainingInvalidatedSourceContributionIds: campaignState.mission.v1.invalidatedSourceContributionIds,
        },
    };
}

function loadRuntimeAssets(repoRoot) {
    const definitionNames = [
        'prelude-a-ship-underway',
        'chapter-1-the-empty-convoy',
        'chapter-2-false-colors',
        'open-orders-1-work-worth-doing',
        'chapter-3-dead-letters',
        'chapter-4-the-colony-that-stayed',
        'chapter-5-old-lessons',
        'open-orders-2-what-survives',
        'chapter-6-the-cost-of-knowing',
        'chapter-7-a-peace-of-their-own',
        'open-orders-3-before-the-lamps-go-out',
        'chapter-8-the-last-directive',
        'epilogue-the-terms-we-keep',
    ];
    const missionDefinitions = definitionNames.map((name) => JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'packages', 'bundled', 'breckenridge', 'v1', `${name}.mission-v1.json`),
        'utf8',
    )));
    return {
        missionDefinitions,
        definition: missionDefinitions.find((entry) => entry.id === MISSION_ID),
        shipDataset: JSON.parse(fs.readFileSync(path.join(
            repoRoot,
            'packages',
            'bundled',
            'breckenridge',
            'breckenridge-intrepid-class.ship-dataset.json',
        ), 'utf8')),
    };
}

function filesystemAdapter(userFilesRoot, { writable = false } = {}) {
    function physical(logicalKey) {
        return path.join(userFilesRoot, toSillyTavernStorageFileName(logicalKey));
    }
    return {
        async readJson(logicalKey) {
            return JSON.parse(fs.readFileSync(physical(logicalKey), 'utf8'));
        },
        async writeJson(logicalKey, value) {
            if (!writable) throw new Error('repair storage adapter is read-only');
            fs.writeFileSync(physical(logicalKey), `${JSON.stringify(value)}\n`, 'utf8');
        },
    };
}

function fileHash(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function createBackup({ dataRoot, userFilesRoot, chatPath, now }) {
    const stamp = now.replace(/[-:.TZ]/g, '').slice(0, 14);
    const backupRoot = path.join(dataRoot, 'backups', 'Directive', `${stamp}-sam-vickers-premature-evidence`);
    fs.mkdirSync(backupRoot, { recursive: true });
    const prefix = `directive-v1-saves-${SAVE_ID}`;
    const sources = [
        path.join(userFilesRoot, 'directive-v1-index.v1.json'),
        path.join(userFilesRoot, `directive-v1-operations-${CAMPAIGN_ID}.timeline.v1.json`),
        ...fs.readdirSync(userFilesRoot)
            .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
            .map((name) => path.join(userFilesRoot, name)),
        chatPath,
    ];
    const uniqueSources = [...new Set(sources.map((entry) => path.resolve(entry)))];
    const manifest = [];
    for (const source of uniqueSources) {
        if (!fs.existsSync(source)) throw new Error(`backup source is missing: ${source}`);
        const destination = path.join(backupRoot, path.basename(source));
        fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
        manifest.push({ source, destination, sha256: fileHash(source), byteLength: fs.statSync(source).size });
    }
    fs.writeFileSync(
        path.join(backupRoot, 'backup-manifest.json'),
        `${JSON.stringify({ createdAt: now, saveId: SAVE_ID, files: manifest }, null, 2)}\n`,
        'utf8',
    );
    return { backupRoot, manifest };
}

async function runCli() {
    const args = new Set(process.argv.slice(2));
    const apply = args.has('--apply');
    const correctPreservedAuthority = args.has('--correct-preserved-authority');
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const dataRoot = process.env.DIRECTIVE_SILLYTAVERN_DATA_ROOT
        ? path.resolve(process.env.DIRECTIVE_SILLYTAVERN_DATA_ROOT)
        : path.resolve('F:/SillyTavern/SillyTavern/data/default-user');
    const userFilesRoot = path.join(dataRoot, 'user', 'files');
    const chatPath = path.join(
        dataRoot,
        'chats',
        'Ashes of Peace - Sam Vickers',
        `${CHAT_ID}.jsonl`,
    );
    const adapter = filesystemAdapter(userFilesRoot, { writable: apply });
    const before = await loadV1CampaignSave(adapter, SAVE_ID);
    const assets = loadRuntimeAssets(repoRoot);
    const now = new Date().toISOString();
    const prepared = correctPreservedAuthority
        ? await prepareSamVickersPreservedAuthorityCorrection(before, { ...assets, now })
        : await prepareSamVickersPrematureEvidenceRepair(before, { ...assets, now });
    if (!apply) {
        console.log(JSON.stringify({ mode: 'dry-run', ...prepared.report }, null, 2));
        return;
    }

    const chatHashBefore = fileHash(chatPath);
    const backup = createBackup({ dataRoot, userFilesRoot, chatPath, now });
    await storeV1CampaignSave(adapter, prepared.save, { previousSave: before, makeActive: true });
    const after = await loadV1CampaignSave(adapter, SAVE_ID);
    if (!jsonEqual(stable(after), stable(prepared.save))) {
        throw new Error('persisted repair did not hydrate to the prepared save');
    }
    if (fileHash(chatPath) !== chatHashBefore) throw new Error('chat narration changed during repair');
    console.log(JSON.stringify({
        mode: 'applied',
        backupRoot: backup.backupRoot,
        backupFileCount: backup.manifest.length,
        ...prepared.report,
    }, null, 2));
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
    runCli().catch((error) => {
        console.error(error?.stack || error);
        if (error?.details) console.error(JSON.stringify(error.details, null, 2));
        process.exitCode = 1;
    });
}
