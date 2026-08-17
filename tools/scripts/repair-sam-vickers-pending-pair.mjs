import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    materializeMissionEvidenceProposal,
} from '../../src/mission/v1/accepted-pair-interpreter.mjs';
import { validateMissionEvidenceProposal } from '../../src/mission/v1/evidence-contracts.mjs';
import { validateMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createMissionPlayerProjection } from '../../src/mission/v1/player-projection.mjs';
import { reduceMissionEvidence } from '../../src/mission/v1/mission-reducer.mjs';
import { validateMissionStateAuthority } from '../../src/mission/v1/mission-state-authority.mjs';
import { prepareV1AcceptedPairSnapshot } from '../../src/runtime/v1-accepted-pair-source.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
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
const EXPECTED_CUSTODY_REVISION = 54;
const EXPECTED_MISSION_REVISION = 19;
const TERMS_QUOTE = 'Everything between here and the storm boundary is yours.';
const COMPLETION_QUOTE = 'Commander Vickers assumes the duties of executive officer of this ship.';

const EXPECTED_LATEST_RECEIPT = Object.freeze({
    sourceRangeHash: '120ea681',
    previousAssistant: Object.freeze({ messageId: '38', selectedSwipeId: '0', textHash: 'f276e334' }),
    currentPlayer: Object.freeze({ messageId: '39', selectedSwipeId: null, textHash: '2864bb9e' }),
    sourceContributionIds: Object.freeze(['contribution.v1.b385057f', 'contribution.v1.0c5db096']),
});
const EXPECTED_PENDING_PAIR = Object.freeze({
    sourceRangeHash: '316f56eb',
    assistantMessageId: '40',
    assistantTextHash: 'ff33f510',
    playerMessageId: '41',
    playerTextHash: '1efb5a69',
});

export const SAM_VICKERS_PENDING_PAIR_REPAIR = Object.freeze({
    saveId: SAVE_ID,
    campaignId: CAMPAIGN_ID,
    packageId: PACKAGE_ID,
    packageVersion: PACKAGE_VERSION,
    chatId: CHAT_ID,
    missionId: MISSION_ID,
    expectedCustodyRevision: EXPECTED_CUSTODY_REVISION,
    expectedMissionRevision: EXPECTED_MISSION_REVISION,
    expectedLatestReceipt: EXPECTED_LATEST_RECEIPT,
    expectedPendingPair: EXPECTED_PENDING_PAIR,
});

function jsonEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function stableHash(value = '') {
    let hash = 0x811c9dc5;
    for (const character of String(value)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function failGuard(errors) {
    const error = new Error(`Sam Vickers pending-pair repair target did not match:\n${errors.join('\n')}`);
    error.code = 'DIRECTIVE_SAM_VICKERS_PENDING_REPAIR_GUARD_FAILED';
    error.details = errors;
    throw error;
}

function sourceMatches(actual, expected) {
    return actual?.messageId === expected.messageId
        && (actual?.selectedSwipeId || null) === (expected.selectedSwipeId || null)
        && actual?.textHash === expected.textHash;
}

function normalizedRuntimeAssets(runtimeAssets = {}) {
    const rawDefinitions = Array.isArray(runtimeAssets.missionDefinitions)
        ? runtimeAssets.missionDefinitions
        : [];
    const records = rawDefinitions.map((entry, index) => (
        entry?.definition
            ? entry
            : { path: `repair-definition-${index}.json`, definition: entry }
    ));
    return {
        ...runtimeAssets,
        missionDefinitions: records,
        missionDefinitionsById: new Map(records.map((record) => [record.definition.id, record])),
    };
}

export function inspectSamVickersPendingPairRepair(save, {
    acceptedTermsSource,
    pendingSnapshot,
} = {}) {
    const errors = [];
    const state = save?.state || {};
    const mission = state?.mission?.v1 || {};
    const binding = state?.campaignChatBinding || {};
    for (const [actual, expected, label] of [
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
        [state?.stateCustody?.revision, EXPECTED_CUSTODY_REVISION, 'state custody revision'],
        [mission?.revision, EXPECTED_MISSION_REVISION, 'mission revision'],
    ]) {
        if (actual !== expected) errors.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }

    const latestReceipt = state?.storySettlement?.acceptedPairReceipts?.at(-1);
    if (latestReceipt?.sourceRangeHash !== EXPECTED_LATEST_RECEIPT.sourceRangeHash
        || !sourceMatches(latestReceipt?.previousAssistant, EXPECTED_LATEST_RECEIPT.previousAssistant)
        || !sourceMatches(latestReceipt?.currentPlayer, EXPECTED_LATEST_RECEIPT.currentPlayer)
        || !jsonEqual(latestReceipt?.sourceContributionIds, EXPECTED_LATEST_RECEIPT.sourceContributionIds)) {
        errors.push('latest accepted-pair receipt is not the guarded 38/39 pair');
    }

    const contributions = (state?.storySettlement?.episodes || []).flatMap((episode) => episode.contributions || []);
    const termsContribution = contributions.find(({ id }) => id === acceptedTermsSource?.contributionId);
    if (!termsContribution
        || termsContribution.messageId !== '38'
        || termsContribution.swipeId !== '0'
        || termsContribution.role !== 'assistant'
        || termsContribution.textHash !== 'f276e334'
        || termsContribution.acceptedAtRevision !== 18) {
        errors.push('accepted message 38 contribution is missing or changed');
    }
    if (acceptedTermsSource?.messageId !== '38'
        || acceptedTermsSource?.selectedSwipeId !== '0'
        || acceptedTermsSource?.textHash !== 'f276e334'
        || !String(acceptedTermsSource?.text || '').includes(TERMS_QUOTE)) {
        errors.push('accepted message 38 source text does not prove the working handover terms');
    }

    const pending = pendingSnapshot?.source || {};
    if (pending.sourceRangeHash !== EXPECTED_PENDING_PAIR.sourceRangeHash
        || pending.previousAssistant?.hostMessageId !== EXPECTED_PENDING_PAIR.assistantMessageId
        || pending.previousAssistant?.textHash !== EXPECTED_PENDING_PAIR.assistantTextHash
        || pending.currentPlayer?.hostMessageId !== EXPECTED_PENDING_PAIR.playerMessageId
        || pending.currentPlayer?.textHash !== EXPECTED_PENDING_PAIR.playerTextHash
        || !String(pending.previousAssistant?.text || '').includes(COMPLETION_QUOTE)) {
        errors.push('pending accepted-pair snapshot is not the guarded 40/41 pair');
    }
    if (pendingSnapshot?.envelope?.saveId !== SAVE_ID
        || pendingSnapshot?.envelope?.chatId !== CHAT_ID
        || pendingSnapshot?.envelope?.campaignId !== CAMPAIGN_ID) {
        errors.push('pending accepted-pair snapshot envelope does not match the active save');
    }

    for (const eventId of [
        'event.prelude.command-handover-terms-settled',
        'event.prelude.command-handover-completed',
        'event.prelude.staff-readiness-established',
    ]) {
        if ((mission.events || []).includes(eventId)) errors.push(`${eventId} was already present`);
    }
    if (!(mission.events || []).includes('event.hesperus.rescue-response-begun')) {
        errors.push('Hesperus response-begun evidence is missing');
    }
    for (const [outcomeId, expected] of [
        ['outcome.hesperus.rescue-result', 'unresolved'],
        ['outcome.hesperus.rescue-cost', 'unassessed'],
    ]) {
        if (mission.outcomes?.[outcomeId] !== expected) {
            errors.push(`${outcomeId}: expected ${expected}, got ${mission.outcomes?.[outcomeId]}`);
        }
    }
    return { ok: errors.length === 0, errors };
}

function stageAcceptedHandoverTerms({ campaignState, definition, acceptedTermsSource }) {
    const mission = campaignState.mission.v1;
    const contribution = (campaignState.storySettlement.episodes || [])
        .flatMap((episode) => episode.contributions || [])
        .find(({ id }) => id === acceptedTermsSource.contributionId);
    const source = {
        contributionId: contribution.id,
        messageId: contribution.messageId,
        branchId: mission.branchId,
        accepted: true,
        selectedSwipeId: contribution.swipeId,
        textHash: contribution.textHash,
        role: contribution.role,
        acceptedAtRevision: contribution.acceptedAtRevision,
    };
    const proposal = {
        kind: 'directive.missionEvidenceProposal.v1',
        branchId: mission.branchId,
        missionId: definition.id,
        baseRevision: mission.revision,
        claims: [{
            claimId: 'claim.sam-vickers.command-handover-terms-backfill',
            policyId: 'policy.prelude.command-handover-terms-settled',
            claimType: 'eventOccurred',
            targetId: 'event.prelude.command-handover-terms-settled',
            evidenceQuote: TERMS_QUOTE,
            evidenceQuoteHash: stableHash(TERMS_QUOTE),
            sourceRef: {
                messageId: source.messageId,
                swipeId: source.selectedSwipeId,
                textHash: source.textHash,
            },
        }],
    };
    const evaluated = validateMissionEvidenceProposal({
        definition,
        state: mission,
        proposal,
        resolveSourceRef: (ref) => (
            ref.messageId === source.messageId
            && (ref.swipeId || null) === (source.selectedSwipeId || null)
            && ref.textHash === source.textHash
                ? source
                : null
        ),
    });
    if (evaluated.acceptedClaims.length !== 1 || evaluated.rejectedClaims.length !== 0) {
        const error = new Error('Accepted message 38 handover terms could not pass the normal evidence gate.');
        error.code = 'DIRECTIVE_SAM_VICKERS_PENDING_REPAIR_TERMS_REJECTED';
        error.details = evaluated.rejectedClaims;
        throw error;
    }
    return reduceMissionEvidence({
        definition,
        state: mission,
        acceptedClaims: evaluated.acceptedClaims,
        sourceContribution: contribution,
    }).state;
}

export async function prepareSamVickersPendingPairRepair(save, {
    runtimeAssets,
    acceptedTermsSource,
    pendingSnapshot,
    now = new Date().toISOString(),
} = {}) {
    const inspection = inspectSamVickersPendingPairRepair(save, { acceptedTermsSource, pendingSnapshot });
    if (!inspection.ok) failGuard(inspection.errors);
    const assets = normalizedRuntimeAssets(runtimeAssets);
    const definition = assets.missionDefinitions
        .map((record) => record.definition)
        .find(({ id }) => id === MISSION_ID);
    if (!definition) throw new TypeError('the current Prelude mission definition is required');

    let campaignState = structuredClone(save.state);
    const gateway = createStateDeltaGateway({
        getState: () => campaignState,
        setState: (next) => { campaignState = next; },
        now: () => now,
    });
    const stagedMission = stageAcceptedHandoverTerms({ campaignState, definition, acceptedTermsSource });
    await gateway.applyProposal({
        operations: [{ op: 'set', path: 'mission.v1', value: stagedMission }],
        domains: ['mission'],
        baseRevision: gateway.revision(),
        source: 'repairSamVickersPendingPairTerms',
        reason: 'Recovered working command-handover terms from already accepted message 38 evidence.',
        metadata: { sourceMessageId: '38', sourceContributionId: acceptedTermsSource.contributionId },
    });
    const stagedCheckpoint = {
        ...structuredClone(save),
        updatedAt: now,
        state: structuredClone(campaignState),
    };

    const interpretAcceptedPair = async ({ candidatePacket, sourcePair }) => {
        const candidateId = 'policy.prelude.command-handover-completed';
        if (!(candidatePacket.candidates || []).some(({ id }) => id === candidateId)) {
            return { ok: false, reasonCode: 'guarded-completion-candidate-unavailable', diagnostics: {} };
        }
        const interpretation = {
            kind: 'directive.missionEvidenceInterpretation.v1',
            assistantAcceptance: 'accepted',
            claims: [{
                candidateId,
                sourceSlot: 'previousAssistant',
                evidenceQuote: COMPLETION_QUOTE,
            }],
            peopleEvents: [],
            abstained: false,
            time: { decision: 'unchanged', elapsedSeconds: 0, reason: 'repair-preserves-time-custody', confidence: 1 },
        };
        return {
            ok: true,
            status: 'interpreted',
            interpretation,
            proposal: materializeMissionEvidenceProposal({ interpretation, candidatePacket, sourcePair }),
            diagnostics: { candidateCount: candidatePacket.candidates.length },
        };
    };
    const runtime = createV1MissionRuntime({
        getState: () => campaignState,
        stateDeltaGateway: gateway,
        interpretAcceptedPair,
        now: () => now,
    });
    const settled = await runtime.settleAcceptedPair({
        runtimeAssets: assets,
        snapshot: pendingSnapshot,
        allowModelCall: true,
    });
    if (!settled.ok || !new Set(['settled', 'settled-no-effect']).has(settled.status)) {
        const error = new Error(`Pending pair 40/41 did not settle: ${settled.reasonCode || settled.status}`);
        error.code = 'DIRECTIVE_SAM_VICKERS_PENDING_REPAIR_SETTLEMENT_FAILED';
        error.details = settled;
        throw error;
    }

    const authority = validateMissionStateAuthority({ definition, state: campaignState.mission.v1 });
    if (!authority.ok) throw new Error(`Repaired mission authority is invalid:\n${authority.errors.join('\n')}`);
    const definitions = assets.missionDefinitions.map((record) => record.definition);
    const journey = validateMissionJourney({ campaignState, definitions });
    if (!journey.ok) throw new Error(`Repaired mission journey is invalid:\n${journey.errors.join('\n')}`);
    const projection = createMissionPlayerProjection({ definition, state: campaignState.mission.v1 });
    const objectiveStates = Object.fromEntries(projection.objectives.map(({ id, status, disposition }) => (
        [id, { status, disposition }]
    )));
    if (objectiveStates['objective.prelude.command-handover']?.disposition !== 'completed'
        || objectiveStates['objective.prelude.staff-readiness']?.disposition !== null
        || objectiveStates['objective.prelude.hesperus-rescue']?.disposition !== null) {
        throw new Error('Repaired objective projection does not match the accepted narration.');
    }

    const repairedSave = { ...structuredClone(save), updatedAt: now, state: campaignState };
    return {
        save: repairedSave,
        persistenceCheckpoints: [stagedCheckpoint, repairedSave],
        report: {
            usedModelCall: false,
            stagedTermsFromMessageId: '38',
            settledAssistantMessageId: '40',
            settledPlayerMessageId: '41',
            stateRevisionBefore: save.state.stateCustody.revision,
            stateRevisionAfter: campaignState.stateCustody.revision,
            missionRevisionBefore: save.state.mission.v1.revision,
            missionRevisionAfter: campaignState.mission.v1.revision,
            settlementStatus: settled.status,
            objectiveStates,
        },
    };
}

function loadRuntimeAssets(repoRoot) {
    const definitionNames = [
        'prelude-a-ship-underway', 'chapter-1-the-empty-convoy', 'chapter-2-false-colors',
        'open-orders-1-work-worth-doing', 'chapter-3-dead-letters', 'chapter-4-the-colony-that-stayed',
        'chapter-5-old-lessons', 'open-orders-2-what-survives', 'chapter-6-the-cost-of-knowing',
        'chapter-7-a-peace-of-their-own', 'open-orders-3-before-the-lamps-go-out',
        'chapter-8-the-last-directive', 'epilogue-the-terms-we-keep',
    ];
    const read = (relative) => JSON.parse(fs.readFileSync(path.join(repoRoot, relative), 'utf8'));
    const missionDefinitions = definitionNames.map((name) => read(
        path.join('packages', 'bundled', 'breckenridge', 'v1', `${name}.mission-v1.json`),
    ));
    return {
        packageData: read(path.join('packages', 'bundled', 'breckenridge', 'ashes-of-peace.campaign-package.json')),
        crewDataset: read(path.join('packages', 'bundled', 'breckenridge', 'breckenridge-senior-staff.crew-dataset.json')),
        shipDataset: read(path.join('packages', 'bundled', 'breckenridge', 'breckenridge-intrepid-class.ship-dataset.json')),
        cohesionCatalog: read(path.join('packages', 'bundled', 'breckenridge', 'breckenridge.cohesion-catalog.json')),
        missionDefinitions,
    };
}

function filesystemAdapter(userFilesRoot, { writable = false } = {}) {
    const physical = (logicalKey) => path.join(userFilesRoot, toSillyTavernStorageFileName(logicalKey));
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
    const backupRoot = path.join(dataRoot, 'backups', 'Directive', `${stamp}-sam-vickers-pending-pair`);
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
    const manifest = [];
    for (const source of [...new Set(sources.map((entry) => path.resolve(entry)))]) {
        if (!fs.existsSync(source)) throw new Error(`backup source is missing: ${source}`);
        const destination = path.join(backupRoot, path.basename(source));
        fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
        manifest.push({ source, destination, sha256: fileHash(source), byteLength: fs.statSync(source).size });
    }
    fs.writeFileSync(path.join(backupRoot, 'backup-manifest.json'), `${JSON.stringify({
        createdAt: now,
        saveId: SAVE_ID,
        files: manifest,
    }, null, 2)}\n`, 'utf8');
    return { backupRoot, manifest };
}

function chatMessages(chatPath) {
    const lines = fs.readFileSync(chatPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    return lines.slice(1).map((raw, index) => ({ ...raw, raw, index }));
}

function preparedSnapshot(campaignState, messages, assistantIndex, playerIndex) {
    const prepared = prepareV1AcceptedPairSnapshot({
        campaignState,
        previousAssistantMessage: messages[assistantIndex],
        currentPlayerMessage: messages[playerIndex],
        recentMessages: messages,
        chatId: CHAT_ID,
        requirePromptingPlayerAnchor: true,
    });
    if (!prepared.ok) throw new Error(`Could not prepare pair ${assistantIndex}/${playerIndex}: ${prepared.reason}`);
    return prepared.snapshot;
}

async function runCli() {
    const apply = new Set(process.argv.slice(2)).has('--apply');
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const dataRoot = process.env.DIRECTIVE_SILLYTAVERN_DATA_ROOT
        ? path.resolve(process.env.DIRECTIVE_SILLYTAVERN_DATA_ROOT)
        : path.resolve('F:/SillyTavern/SillyTavern/data/default-user');
    const userFilesRoot = path.join(dataRoot, 'user', 'files');
    const chatPath = path.join(dataRoot, 'chats', 'Ashes of Peace - Sam Vickers', `${CHAT_ID}.jsonl`);
    const adapter = filesystemAdapter(userFilesRoot, { writable: apply });
    const before = await loadV1CampaignSave(adapter, SAVE_ID);
    const messages = chatMessages(chatPath);
    if (messages.length !== 42) failGuard([`chat message count: expected 42, got ${messages.length}`]);
    const acceptedSnapshot = preparedSnapshot(before.state, messages, 38, 39);
    const pendingSnapshot = preparedSnapshot(before.state, messages, 40, 41);
    const acceptedTermsSource = {
        contributionId: 'contribution.v1.b385057f',
        messageId: acceptedSnapshot.source.previousAssistant.hostMessageId,
        selectedSwipeId: acceptedSnapshot.source.previousAssistant.selectedVariantId,
        textHash: acceptedSnapshot.source.previousAssistant.textHash,
        text: acceptedSnapshot.source.previousAssistant.text,
    };
    const now = new Date().toISOString();
    const prepared = await prepareSamVickersPendingPairRepair(before, {
        runtimeAssets: loadRuntimeAssets(repoRoot),
        acceptedTermsSource,
        pendingSnapshot,
        now,
    });
    if (!apply) {
        console.log(JSON.stringify({ mode: 'dry-run', ...prepared.report }, null, 2));
        return;
    }

    const chatHashBefore = fileHash(chatPath);
    const backup = createBackup({ dataRoot, userFilesRoot, chatPath, now });
    let previousCheckpoint = before;
    for (const checkpoint of prepared.persistenceCheckpoints) {
        await storeV1CampaignSave(adapter, checkpoint, {
            previousSave: previousCheckpoint,
            makeActive: true,
        });
        previousCheckpoint = checkpoint;
    }
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
