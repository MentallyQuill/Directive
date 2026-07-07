import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeDirectiveHost } from '../../src/hosts/fake/fake-host.mjs';
import {
  __directiveRuntimeAppTestHooks,
  createDirectiveRuntimeApp
} from '../../src/runtime/runtime-app.mjs';
import { createRepairRuntime } from '../../src/runtime/repair-runtime.mjs';
import { loadCoreStoreStateV2, readCoreStoreProjectionsV2 } from '../../src/storage/core-store-v2.mjs';
import { loadV2Checkpoint, writeV2Checkpoint } from '../../src/storage/transaction-store-v2.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMemoryJsonAdapter() {
  const files = new Map();
  return {
    async readJson(filePath) {
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      files.set(filePath, cloneJson(value));
    },
    async deleteJsonFile(filePath) {
      files.delete(filePath);
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    }
  };
}

function createSequence(values) {
  let index = 0;
  return () => values[index++] || values.at(-1);
}

function stableMechanics(campaignState) {
  return JSON.stringify({
    mission: campaignState.mission,
    clocks: campaignState.clocks,
    commandBearing: campaignState.commandBearing,
    relationships: campaignState.relationships,
    commandLog: campaignState.commandLog
  });
}

function assertNoRawRollbackPayload(value, label) {
  const text = JSON.stringify(value || {});
  assert.equal(/snapshotBefore|rawSnapshot|rawPlayer|playerInput|providerText|prompt/i.test(text), false, `${label} must stay compact and raw-redacted`);
}

const boundedReplacementHistory = __directiveRuntimeAppTestHooks.boundedReplacementHistory(
  Array.from({ length: 40 }, (_, index) => ({
    type: 'rerunOutcome',
    replacedOutcomeId: `old-${index}`,
    replacementOutcomeId: `new-${index}`
  })),
  {
    type: 'rerunOutcome',
    replacedOutcomeId: 'old-40',
    replacementOutcomeId: 'new-40'
  }
);
assert.equal(boundedReplacementHistory.length, 32);
assert.equal(boundedReplacementHistory[0].replacedOutcomeId, 'old-9');
assert.equal(boundedReplacementHistory.at(-1).replacementOutcomeId, 'new-40');
const coreProjectionEvidence = __directiveRuntimeAppTestHooks.coreProjectionFreshnessEvidence({
  turnLedger: {
    entries: [{ outcomeId: 'outcome-core-evidence' }],
    replacementHistory: [{
      kind: 'directive.coreOutcomeReplacementRef.v1',
      replacedOutcomeId: 'outcome-core-evidence',
      replacementOutcomeId: 'outcome-core-evidence-rerun'
    }],
    lastReplacedOutcomeId: 'outcome-core-evidence'
  }
});
assert.equal(coreProjectionEvidence.runtimeAuthority, 'coreStoreV2', 'runtime-injected CORE projections must mark CORE as authoritative resume source');
assert.equal(coreProjectionEvidence.turnLedger.replacementHistory.at(-1).replacementOutcomeId, 'outcome-core-evidence-rerun');
assert.equal(coreProjectionEvidence.turnLedger.lastReplacedOutcomeId, 'outcome-core-evidence');
const emptyCoreProjectionEvidence = __directiveRuntimeAppTestHooks.coreProjectionFreshnessEvidence(
  {
    turnLedger: { entries: [], replacementHistory: [] },
    ingressLedger: [],
    responseLedger: [],
    recoveryJournal: []
  },
  {
    runtimeTracking: {
      ingressLedger: [{ id: 'legacy-ingress-1' }],
      responseLedger: [{ id: 'legacy-response-1' }],
      recoveryJournal: [{ id: 'legacy-recovery-1' }]
    },
    turnLedger: {
      entries: [{ outcomeId: 'legacy-outcome-1' }],
      replacementHistory: [{ replacedOutcomeId: 'legacy-old-1', replacementOutcomeId: 'legacy-new-1' }]
    }
  }
);
assert.equal(
  emptyCoreProjectionEvidence.runtimeAuthority,
  undefined,
  'runtime-injected empty CORE projections must not mark CORE authoritative over populated legacy ledgers'
);
assert.throws(
  () => __directiveRuntimeAppTestHooks.assertFreshOutcomeRerunReplacementTarget({
    replacement: {
      outcomeId: 'outcome-stale-rerun',
      repairDecision: { replacedTransactionId: 'txn-original' }
    },
    ledgerEntry: {
      outcomeId: 'outcome-stale-rerun',
      coreTransactionId: 'txn-current'
    }
  }),
  /stale rerun target/,
  'CORE-backed rerun commit must reject stale preview transaction evidence before opening a replacement transaction'
);
assert.throws(
  () => __directiveRuntimeAppTestHooks.assertOutcomeReplacementCheckpointBase({
    replacement: {
      outcomeId: 'outcome-inline-snapshot-only',
      snapshotBefore: { campaign: { id: 'raw-inline-snapshot' } }
    },
    ledgerEntry: {
      outcomeId: 'outcome-inline-snapshot-only'
    }
  }),
  /CORE checkpoint snapshot is required/,
  'CORE-backed rerun commit must reject inline snapshotBefore without a CORE checkpoint ref.'
);
assert.doesNotThrow(
  () => __directiveRuntimeAppTestHooks.assertOutcomeReplacementCheckpointBase({
    replacement: {
      outcomeId: 'outcome-core-checkpoint',
      snapshotBefore: { campaign: { id: 'core-loaded-snapshot' } },
      coreCheckpointRef: {
        kind: 'directive.coreMechanicsCheckpointRef.v1',
        checkpointId: 'checkpoint-outcome-core'
      }
    },
    ledgerEntry: {
      outcomeId: 'outcome-core-checkpoint'
    }
  }),
  'CORE-backed rerun commit should allow snapshot state loaded from a compact CORE checkpoint ref.'
);

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const missionGraph = readJson('packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json');

let idSequence = 0;
let denyCommittedOutcomeDeleteRollback = false;
let committedOutcomeDeleteRollbackEvaluations = 0;
const adapter = createMemoryJsonAdapter();
const host = createFakeDirectiveHost({
  chatNative: true,
  storage: adapter,
  chatOptions: {
    chatId: 'stage18-pre-campaign-chat',
    entityName: 'Captain Whitaker'
  }
});
const app = createDirectiveRuntimeApp({
  host,
  packageLoader: async () => ({
    packages: [packageData],
    projections: [{
      path: 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
      projection
    }],
    crewDatasets: [{
      path: 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
      dataset: crewDataset
    }],
    missionGraphs: [{
      path: 'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
      graph: missionGraph
    }]
  }),
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-stage18-${idSequence}`;
  },
  repairRuntimeFactory(options = {}) {
    const base = createRepairRuntime(options);
    return {
      ...base,
      evaluateCommittedOutcomeDeleteRollbackActuation(input = {}) {
        committedOutcomeDeleteRollbackEvaluations += 1;
        if (!denyCommittedOutcomeDeleteRollback) {
          return base.evaluateCommittedOutcomeDeleteRollbackActuation(input);
        }
        return {
          kind: 'directive.repairRollbackActuationDecision.v1',
          authorized: false,
          action: 'blockRollbackActuation',
          reason: 'test-denied-committed-outcome-delete',
          eventType: 'committedOutcomeDeleted',
          sourceKind: 'committedOutcome',
          transactionId: input.coreRecovery?.transactionId || null,
          recoveryCaseId: input.coreRecovery?.recoveryCaseId || null,
          outcomeId: input.sourceMutation?.outcomeId || input.decision?.outcomeId || null,
          restoreRevision: input.repairProjection?.restoreRevision ?? null
        };
      }
    };
  },
  now: createSequence([
    '2026-06-19T07:00:00.000Z',
    '2026-06-19T07:01:00.000Z',
    '2026-06-19T07:02:00.000Z',
    '2026-06-19T07:03:00.000Z',
    '2026-06-19T07:04:00.000Z',
    '2026-06-19T07:05:00.000Z',
    '2026-06-19T07:06:00.000Z',
    '2026-06-19T07:07:00.000Z',
    '2026-06-19T07:08:00.000Z',
    '2026-06-19T07:09:00.000Z',
    '2026-06-19T07:10:00.000Z',
    '2026-06-19T07:11:00.000Z',
    '2026-06-19T07:12:00.000Z',
    '2026-06-19T07:13:00.000Z',
    '2026-06-19T07:14:00.000Z',
    '2026-06-19T07:15:00.000Z',
    '2026-06-19T07:16:00.000Z',
    '2026-06-19T07:17:00.000Z'
  ])
});

const narrator = {
  id: 'stage18-narrator',
  async generateNarration(request) {
    return {
      providerId: 'stage18-narrator',
      text: `Narrated ${request.sourceOutcomeId}.`
    };
  }
};

async function previewCommit(turnId, playerInput) {
  await app.previewDirectorTurn({ turnId, playerInput });
  return app.commitProvisionalDirectorTurn({ provider: narrator, generateNarration: true });
}

await app.initialize();
await app.startCreatorDraft({ packageId: packageData.manifest.id });
await app.saveCreatorDraft({
  reason: 'manualSave',
  patch: {
    activeStep: 'review',
    input: {
      identity: {
        name: 'Talia Serrin',
        pronounsOrAddress: 'she/her',
        speciesId: 'human',
        ageBandId: 'mid-career',
        appearance: 'A composed officer with a quiet voice and a habit of watching the room before speaking.'
      },
      service: {
        careerBackgroundId: 'tactical-security',
        formativeExperienceId: 'dominion-war-fleet-service',
        assignmentReasonId: 'experienced-outsider-transfer'
      },
      personality: {
        traits: {
          insight: 'perceptive',
          connection: 'candid',
          execution: 'decisive'
        },
        flawId: 'impatient'
      },
      dossier: {
        detailLevel: 'Standard',
        briefBiography: 'Talia Serrin is a tactical-minded Starfleet Commander whose Dominion War service taught her to make quick decisions without treating lives as expendable.',
        publicReputation: 'Talia Serrin is known as a decisive and observant officer whose restraint has improved since the war.'
      }
    }
  }
});
await app.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });

await previewCommit('turn.stage18.arrival.001', 'I report aboard without interrupting the working transfer, ask Priya for live status and Bronn for the acting XO handoff, then report to Captain Whitaker once docking is complete.');
await previewCommit('turn.stage18.handover.001', 'In the ready room I tell Whitaker that no life is expendable and the crew deserves the truth. I ask Bronn for the clean handoff details and define executive authority as clear recommendations, private disagreement, and public support for lawful final decisions.');
await previewCommit('turn.stage18.readiness.001', 'I set the readiness priorities in sequence: Priya owns schedule coordination and exception routing, Imani gets protected repair and documentation time before the combined-load test, Miriam sets medical fatigue restrictions, Rowan defines the sensor threshold for interrupting the schedule, and Kieran gets a bounded flight profile. We accept the remaining combined-load risk explicitly and defer noncritical polish until after the fallback-command drill.');
await previewCommit('turn.stage18.fallback.001', 'Use Bronn\'s failure conditions to standardize one shipwide fallback-command procedure. Run a cross-department walkthrough, have Priya route the command-network certificate exception into accountable remediation, and assign Imani to patch and audit the older auxiliary-control identity before the combined-load test.');
await previewCommit('turn.stage18.rhythm.001', 'I hold focused follow-ups with Priya, Bronn, and Imani instead of another all-hands meeting. Priya owns routine coordination check-ins, Bronn is told to bring failure-condition objections before command closes debate, and Imani gets a standing expectation to escalate technical debt thresholds. I invite pushback, set clear boundaries for dissent, and assign follow-up owners.');

await app.recoverCommandBearingPoint({
  recoveryId: 'stage18.resolve.recovery',
  track: 'Resolve'
});
const originalReadied = await app.readyCommandBearingPoint({
  readiedId: 'stage18.resolve.readied',
  track: 'Resolve'
});
assert.equal(originalReadied.applied, true);

const originalPreview = await app.previewDirectorTurn({
  turnId: 'turn.stage18.hesperus.001',
  playerInput: 'Transfer the medically vulnerable passengers first, secure the falsified inspection record, order the Hesperus owner to remain available for formal inquiry, and leave a repair team only for impulse-safe stabilization. Log that the Breckenridge is accepting a minor delay for passenger safety and evidence preservation.'
});
assert.equal(originalPreview.commandBearingPrompt.eligible, true);
const originalPreOutcomeState = cloneJson(originalPreview.campaignState);
const originalCommit = await app.commitProvisionalDirectorTurn({
  readiedCommandBearing: {
    ...originalReadied.commandBearing.readied,
    rationale: 'The player used lawful authority, evidence custody, deadlines, and clear consequences proportionately while prioritizing passenger safety.',
    fit: 'strong',
    causalBasis: ['lawful authority', 'evidence custody', 'accepted delay']
  },
  provider: narrator,
  generateNarration: true
});
const originalOutcomeId = originalCommit.turnPacket.outcomePacket.id;
assert.equal(originalOutcomeId, 'outcome.stage18.hesperus.001');
assert.equal(originalCommit.campaignState.mission.activePhaseId, 'hesperus-aftermath');
assert.equal(originalCommit.campaignState.commandBearing.resolve.points, 0);
assert.equal(originalCommit.campaignState.commandBearing.resolve.marks, 1);
assert.equal(originalCommit.campaignState.commandBearing.spendLedger[originalOutcomeId].track, 'resolve');
const originalLedgerEntry = originalCommit.campaignState.turnLedger.entries.find((entry) => entry.outcomeId === originalOutcomeId);
assert.equal(originalLedgerEntry?.snapshotBeforeRetained, true, 'direct preview fixture must retain only CORE checkpoint snapshot evidence.');
assert.ok(originalLedgerEntry?.coreCheckpointRef, 'direct preview fixture should record CORE checkpoint ref for rerun base.');
assert.equal(Object.prototype.hasOwnProperty.call(originalLedgerEntry, 'snapshotBefore'), false, 'direct preview fixture must not store raw snapshotBefore.');
const mutateRuntimeAppCampaignState = __directiveRuntimeAppTestHooks.mutateCampaignStateForTest;
assert.equal(typeof app[mutateRuntimeAppCampaignState], 'function', 'runtime app test hook should allow focused malformed ledger setup.');
const mutateRuntimeCoreStoreState = __directiveRuntimeAppTestHooks.mutateCoreStoreStateForTest;
assert.equal(typeof app[mutateRuntimeCoreStoreState], 'function', 'runtime app test hook should allow focused malformed CORE store setup.');

const coreRerunCheckpointId = 'core-mechanics-stage18-rerun-preview';
const mutateCoreRerunTurnProjection = async ({ checkpointId, includeCheckpointRef = true }) => {
  await app[mutateRuntimeCoreStoreState]((state) => {
    const next = cloneJson(state);
    next.turns = Array.isArray(next.turns) ? next.turns : [];
    let turn = next.turns.find((item) => item.outcomeId === originalOutcomeId);
    if (!turn) {
      turn = {
        id: originalLedgerEntry?.id || 'core-turn-stage18-original-rerun',
        turnId: originalLedgerEntry?.turnId || 'turn.stage18.hesperus.001',
        outcomeId: originalOutcomeId,
        phase: originalLedgerEntry?.phase || 'committed'
      };
      next.turns.push(turn);
    }
    turn.snapshotBeforeRetained = true;
    turn.coreTransactionId = 'txn-stage18-original-rerun';
    turn.transactionId = 'txn-stage18-original-rerun';
    if (includeCheckpointRef) {
      turn.coreCheckpointRef = {
        kind: 'directive.coreMechanicsCheckpointRef.v1',
        campaignId: next.campaignId,
        saveId: next.saveId,
        checkpointId,
        layout: 'core',
        sourceRevision: 18
      };
    } else {
      delete turn.coreCheckpointRef;
    }
    return next;
  });
};
await writeV2Checkpoint(host.storage, {
  campaignId: originalCommit.campaignState.campaign.id,
  saveId: originalCommit.campaignState.campaignChatBinding.saveId,
  checkpointId: coreRerunCheckpointId,
  layout: 'core',
  checkpoint: {
    kind: 'directive.coreMechanicsCheckpoint.v1',
    type: 'coreMechanicsPreOutcome',
    checkpointId: coreRerunCheckpointId,
    outcomeId: originalOutcomeId,
    sourceKind: 'coreStoreV2.checkpoint',
    sourceRevision: 18,
    campaignState: originalPreOutcomeState
  }
});
await mutateCoreRerunTurnProjection({ checkpointId: coreRerunCheckpointId });
await app[mutateRuntimeAppCampaignState]((state) => {
  const next = cloneJson(state);
  const entry = next.turnLedger.entries.find((item) => item.outcomeId === originalOutcomeId);
  assert.ok(entry, 'CORE checkpoint rerun fixture must find the outcome entry.');
  assert.equal(Object.prototype.hasOwnProperty.call(entry, 'snapshotBefore'), false, 'CORE checkpoint rerun fixture must start raw-snapshot-free.');
  entry.snapshotBeforeRetained = true;
  entry.coreTransactionId = 'txn-stage18-original-rerun';
  entry.coreCheckpointRef = {
    kind: 'directive.coreMechanicsCheckpointRef.v1',
    campaignId: next.campaign.id,
    saveId: next.campaignChatBinding.saveId,
    checkpointId: coreRerunCheckpointId,
    layout: 'core',
    sourceRevision: 18
  };
  return next;
});
const coreCheckpointRerunPreview = await app.previewOutcomeReplacement({
  outcomeId: originalOutcomeId,
  turnId: 'turn.stage18.hesperus.core-checkpoint-rerun',
  playerInput: 'I rerun the Hesperus outcome from the CORE checkpoint artifact instead of an old turn-ledger snapshot.'
});
assert.equal(coreCheckpointRerunPreview.view.pendingOutcomeReplacement.outcomeId, originalOutcomeId);
assert.equal(coreCheckpointRerunPreview.view.pendingOutcomeReplacement.repairDecision.snapshotPresent, true);
assert.equal(coreCheckpointRerunPreview.view.pendingOutcomeReplacement.repairDecision.authorized, true);
assert.equal(coreCheckpointRerunPreview.view.pendingOutcomeReplacement.repairDecision.action, 'createRerunBranchCandidate');
assert.equal(coreCheckpointRerunPreview.view.pendingOutcomeReplacement.repairDecision.replacedTransactionId, 'txn-stage18-original-rerun');
assert.equal(coreCheckpointRerunPreview.view.pendingOutcomeReplacement.coreCheckpointRef.checkpointId, coreRerunCheckpointId);
assert.equal(coreCheckpointRerunPreview.view.pendingOutcomeReplacement.snapshotSourceKind, 'coreStoreV2.checkpoint');
assert.equal(coreCheckpointRerunPreview.view.pendingDirectorTurn.replacementForOutcomeId, originalOutcomeId);
await app.discardProvisionalDirectorTurn();
await app[mutateRuntimeAppCampaignState](() => cloneJson(originalCommit.campaignState));

await app[mutateRuntimeAppCampaignState]((state) => {
  const next = cloneJson(state);
  const entry = next.turnLedger.entries.find((item) => item.outcomeId === originalOutcomeId);
  assert.ok(entry, 'Malformed rerun fixture must find the outcome entry.');
  assert.equal(Object.prototype.hasOwnProperty.call(entry, 'snapshotBefore'), false, 'Malformed rerun fixture must stay raw-snapshot-free.');
  delete entry.snapshotBefore;
  entry.snapshotBeforeRetained = true;
  entry.coreTransactionId = 'txn-stage18-original-rerun';
  entry.coreCheckpointRef = {
    kind: 'directive.coreMechanicsCheckpointRef.v1',
    campaignId: next.campaign.id,
    saveId: next.campaignChatBinding.saveId,
    checkpointId: 'stage18-missing-rerun-checkpoint',
    layout: 'core',
    sourceRevision: 18
  };
  return next;
});
const beforeMissingSnapshotRerun = await app.getCurrentView({ tabId: 'mission' });
await mutateCoreRerunTurnProjection({ checkpointId: 'stage18-missing-rerun-checkpoint' });
await assert.rejects(
  () => app.previewOutcomeReplacement({
    outcomeId: originalOutcomeId,
    turnId: 'turn.stage18.hesperus.missing-snapshot-rerun',
    playerInput: 'I try to rerun the Hesperus outcome after the retained snapshot artifact went missing.'
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_REPAIR_RERUN_NOT_AUTHORIZED');
    assert.equal(error.details?.outcomeId, originalOutcomeId);
    assert.equal(error.details?.decision?.deniedReason, 'outcome-rerun-snapshot-evidence-missing');
    return true;
  },
  'Missing retained rerun snapshot must reject through REPAIR before previewing branch mechanics.'
);
const afterMissingSnapshotRerun = await app.getCurrentView({ tabId: 'mission' });
assert.equal(afterMissingSnapshotRerun.pendingOutcomeReplacement?.outcomeId || null, beforeMissingSnapshotRerun.pendingOutcomeReplacement?.outcomeId || null, 'Missing-snapshot rerun must not cache a new pending replacement.');
assert.equal(afterMissingSnapshotRerun.pendingDirectorTurn?.turnId || null, beforeMissingSnapshotRerun.pendingDirectorTurn?.turnId || null, 'Missing-snapshot rerun must not cache a new pending Director turn.');
assert.equal(JSON.stringify(afterMissingSnapshotRerun.pendingDirectorTurn || {}).includes('missing-snapshot-rerun'), false);
assert.equal(JSON.stringify(afterMissingSnapshotRerun.pendingDirectorTurn || {}).includes('retained snapshot artifact'), false);
await app[mutateRuntimeAppCampaignState](() => cloneJson(originalCommit.campaignState));

await app[mutateRuntimeAppCampaignState]((state) => {
  const next = cloneJson(state);
  const entry = next.turnLedger.entries.find((item) => item.outcomeId === originalOutcomeId);
  assert.ok(entry, 'No-ref rerun fixture must find the outcome entry.');
  assert.equal(Object.prototype.hasOwnProperty.call(entry, 'snapshotBefore'), false, 'No-ref rerun fixture must stay raw-snapshot-free.');
  delete entry.coreCheckpointRef;
  entry.snapshotBeforeRetained = true;
  return next;
});
await mutateCoreRerunTurnProjection({ includeCheckpointRef: false });
const beforeNoRefRerun = await app.getCurrentView({ tabId: 'mission' });
const beforeNoRefRerunState = beforeNoRefRerun.loadedCampaignState || beforeNoRefRerun.campaignState;
const beforeNoRefRerunEntry = beforeNoRefRerunState.turnLedger.entries.find((entry) => entry.outcomeId === originalOutcomeId);
assert.equal(Object.prototype.hasOwnProperty.call(beforeNoRefRerunEntry, 'snapshotBefore'), false, 'No-ref rerun fixture must not keep raw snapshot present.');
assert.equal(beforeNoRefRerunEntry.snapshotBeforeRetained, true);
assert.equal(beforeNoRefRerunEntry.coreCheckpointRef, undefined);
await assert.rejects(
  () => app.previewOutcomeReplacement({
    outcomeId: originalOutcomeId,
    turnId: 'turn.stage18.hesperus.no-ref-rerun',
    playerInput: 'I try to rerun from an old raw snapshot without a CORE checkpoint reference.'
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_REPAIR_RERUN_NOT_AUTHORIZED');
    assert.equal(error.details?.outcomeId, originalOutcomeId);
    assert.equal(error.details?.decision?.deniedReason, 'outcome-rerun-snapshot-evidence-missing');
    return true;
  },
  'CORE-backed rerun preview must not fall back to raw snapshot when checkpoint ref is missing.'
);
const afterNoRefRerun = await app.getCurrentView({ tabId: 'mission' });
assert.equal(afterNoRefRerun.pendingOutcomeReplacement?.outcomeId || null, beforeNoRefRerun.pendingOutcomeReplacement?.outcomeId || null, 'No-ref rerun must not cache a pending replacement.');
assert.equal(afterNoRefRerun.pendingDirectorTurn?.turnId || null, beforeNoRefRerun.pendingDirectorTurn?.turnId || null, 'No-ref rerun must not cache a pending Director turn.');
assert.equal(JSON.stringify(afterNoRefRerun.pendingDirectorTurn || {}).includes('no-ref-rerun'), false);
await app[mutateRuntimeAppCampaignState](() => cloneJson(originalCommit.campaignState));
await mutateCoreRerunTurnProjection({ checkpointId: coreRerunCheckpointId });

const beforeRewrite = stableMechanics(originalCommit.campaignState);
const rewrite = await app.retryNarrationForLastTurn({ provider: narrator });
assert.equal(rewrite.ok, true);
assert.equal(stableMechanics(rewrite.campaignState), beforeRewrite);

await app[mutateRuntimeAppCampaignState]((state) => {
  const next = cloneJson(state);
  const entry = next.turnLedger.entries.find((item) => item.outcomeId === originalOutcomeId);
  assert.ok(entry, 'Replacement preview fixture must find the outcome entry.');
  assert.equal(Object.prototype.hasOwnProperty.call(entry, 'snapshotBefore'), false, 'Replacement preview fixture must stay raw-snapshot-free.');
  entry.snapshotBeforeRetained = true;
  entry.coreTransactionId = 'txn-stage18-original-rerun';
  entry.coreCheckpointRef = {
    kind: 'directive.coreMechanicsCheckpointRef.v1',
    campaignId: next.campaign.id,
    saveId: next.campaignChatBinding.saveId,
    checkpointId: coreRerunCheckpointId,
    layout: 'core',
    sourceRevision: 18
  };
  return next;
});

const replacementPreview = await app.previewOutcomeReplacement({
  outcomeId: originalOutcomeId,
  turnId: 'turn.stage18.hesperus.replacement',
  playerInput: 'I order the Breckenridge to leave the mission area because I want distance from the Hesperus.'
});
assert.equal(replacementPreview.provisionalOutcome.resultBand, 'Partial Failure');
assert.equal(replacementPreview.campaignState.mission.activePhaseId, 'hesperus-aftermath');
assert.equal(replacementPreview.view.pendingOutcomeReplacement.outcomeId, originalOutcomeId);
assert.equal(replacementPreview.view.pendingDirectorTurn.replacementForOutcomeId, originalOutcomeId);
assert.equal(replacementPreview.view.pendingOutcomeReplacement.repairDecision.kind, 'directive.repairOutcomeRerunActuationDecision.v1');
assert.equal(replacementPreview.view.pendingOutcomeReplacement.repairDecision.authorized, true);
assert.equal(replacementPreview.view.pendingOutcomeReplacement.repairDecision.action, 'createRerunBranchCandidate');
assert.equal(replacementPreview.view.pendingOutcomeReplacement.repairDecision.replacedTransactionId, 'txn-stage18-original-rerun');
assert.equal(Object.prototype.hasOwnProperty.call(replacementPreview.view.pendingOutcomeReplacement.repairDecision, 'legacyNoCoreRerunAllowed'), false);
assert.equal(replacementPreview.view.pendingOutcomeReplacement.repairDecision.outcomeId, originalOutcomeId);

const replacementCommit = await app.commitProvisionalDirectorTurn({
  provider: narrator,
  generateNarration: true
});
const replacementOutcomeId = replacementCommit.turnPacket.outcomePacket.id;
assert.equal(replacementOutcomeId, 'outcome.stage18.hesperus.replacement');
assert.equal(replacementCommit.campaignState.mission.activePhaseId, 'hesperus-diversion');
assert.equal(replacementCommit.campaignState.commandBearing.resolve.points, 1);
assert.equal(replacementCommit.campaignState.commandBearing.resolve.marks || 0, 0);
assert.equal(replacementCommit.campaignState.commandBearing.spendLedger?.[originalOutcomeId], undefined);
const replacementCoreProjections = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: replacementCommit.campaignState.campaign.id,
  saveId: replacementCommit.campaignState.campaignChatBinding.saveId
});
assert.equal(replacementCoreProjections.turnLedger.lastReplacedOutcomeId, originalOutcomeId);
const replacementHistory = replacementCoreProjections.turnLedger.replacementHistory.at(-1);
assert.equal(replacementHistory.type, 'rerunOutcome');
assert.equal(replacementHistory.replacedOutcomeId, originalOutcomeId);
assert.equal(replacementHistory.replacementOutcomeId, replacementOutcomeId);
assert.equal(replacementHistory.replacedTurnId, 'turn.stage18.hesperus.001');
assert.equal(replacementHistory.repairDecision.kind, 'directive.repairOutcomeRerunActuationDecision.v1');
assert.equal(replacementHistory.repairDecision.authorized, true);
assert.equal(replacementHistory.repairDecision.action, 'createRerunBranchCandidate');
assert.equal(replacementHistory.repairDecision.replacedTransactionId, 'txn-stage18-original-rerun');
assert.equal(Object.prototype.hasOwnProperty.call(replacementHistory.repairDecision, 'legacyNoCoreRerunAllowed'), false);
assert.match(replacementHistory.acceptedAt, /^2026-06-19T07:/);

const branchSourceChatId = host.chat.getCurrentChatId();
const branch = await app.saveCurrentGameAs({ name: 'Stage 18 Replacement Branch' });
assert.equal(branch.ok, true);
const branchMetadata = branch.save.saveIndexEntry?.metadata?.branch || branch.branchSave?.saveIndexEntry?.metadata?.branch;
const branchState = branch.view.loadedCampaignState || branch.view.campaignState;
assert.equal(branchMetadata.parentSaveId, 'save-stage18-3');
assert.equal(branchMetadata.divergenceOutcomeId, replacementOutcomeId);
assert.equal(
  branchState.turnLedger.lastCommittedOutcomeId || branchState.turnLedger.entries?.at(-1)?.outcomeId,
  replacementOutcomeId
);
assert.equal(branchState.campaignChatBinding.saveId, branch.save.id);
assert.equal(branch.branchChat.sourceChatId, branchSourceChatId);
assert.notEqual(branch.branchChat.chatId, branchSourceChatId);
assert.equal(host.chat.getCurrentChatId(), branch.branchChat.chatId);
assert.equal(host.chat.getBindingMetadata().saveId, branch.save.id);
const branchReplacementEntry = branchState.turnLedger.entries.find((entry) => entry.outcomeId === replacementOutcomeId);
assert.ok(branchReplacementEntry?.coreTransactionId, 'Save As branch must preserve CORE transaction refs for copied outcomes.');
assert.ok(branchReplacementEntry?.coreCheckpointRef?.checkpointId, 'Save As branch must preserve CORE checkpoint refs for copied outcomes.');
const branchCoreState = await loadCoreStoreStateV2(host.storage, {
  campaignId: branchState.campaign.id,
  saveId: branch.save.id,
  branchId: branch.save.id,
  missingOk: false
});
assert.ok(
  branchCoreState.transactions?.[branchReplacementEntry.coreTransactionId],
  'Save As branch must clone the CORE transaction state for copied committed outcomes.'
);
const branchReplacementCheckpoint = await loadV2Checkpoint(host.storage, {
  campaignId: branchState.campaign.id,
  saveId: branch.save.id,
  checkpointId: branchReplacementEntry.coreCheckpointRef.checkpointId,
  layout: 'core'
});
assert.equal(
  branchReplacementCheckpoint.checkpoint.campaignState.campaignChatBinding.saveId,
  branch.save.id,
  'Save As branch checkpoint snapshots must point at the branch save, not the parent save.'
);

const coreDeleteSource = host.chat.pushPlayerMessage({
  hostMessageId: 'stage18-core-delete-source',
  text: 'I order helm to change course and pursue the freighter while Operations preserves civilian-channel evidence.'
});
let coreDeleteTurn = await app.observeHostPlayerMessage({
  chatId: host.chat.getCurrentChatId(),
  message: coreDeleteSource
});
if (coreDeleteTurn.responseStrategy === 'pause') {
  const pausedView = await app.getCurrentView({ tabId: 'mission' });
  const pending = pausedView.chatNative.pendingInteractions.find((entry) => entry.status === 'pending');
  assert.ok(pending, 'CORE delete fixture should expose a resolvable pending interaction when classification pauses.');
  coreDeleteTurn = (await app.resolvePendingChatInteraction({
    interactionId: pending.id,
    action: pending.kind === 'riskConfirmationNeeded' ? 'confirm' : 'accept'
  })).result;
}
assert.equal(coreDeleteTurn.handled, true, 'CORE delete fixture must commit through the host-native path.');
const beforeCoreDelete = await app.getCurrentView({ tabId: 'mission' });
const coreDeleteLedgerEntry = beforeCoreDelete.campaignState.turnLedger.entries.at(-1);
assert.ok(coreDeleteLedgerEntry?.outcomeId, 'CORE delete fixture should commit an outcome.');
assert.ok(coreDeleteLedgerEntry?.coreTransactionId, 'CORE delete fixture outcome must carry a CORE transaction id.');
const coreDeletedOutcomeId = coreDeleteLedgerEntry.outcomeId;
const coreDeletedTransactionId = coreDeleteLedgerEntry.coreTransactionId;
const retainedSnapshotBaseline = await app.getCurrentView({ tabId: 'mission' });
await app[mutateRuntimeAppCampaignState]((state) => {
  const next = cloneJson(state);
  const entry = next.turnLedger.entries.find((item) => item.outcomeId === coreDeletedOutcomeId);
  assert.ok(entry, 'Malformed retained-snapshot fixture must find the outcome entry.');
  entry.stateRevision = Number(next.runtimeTracking?.revision);
  assert.equal(Number.isFinite(entry.stateRevision), true, 'Malformed retained-snapshot fixture must retain deterministic stateRevision fallback evidence.');
  delete entry.snapshotBefore;
  entry.snapshotBeforeRetained = false;
  return next;
});
await app[mutateRuntimeCoreStoreState]((state) => {
  const next = cloneJson(state);
  const turn = (Array.isArray(next.turns) ? next.turns : []).find((item) => item.outcomeId === coreDeletedOutcomeId);
  assert.ok(turn, 'Malformed retained-snapshot fixture must find the CORE turn projection.');
  turn.stateRevision = Number(retainedSnapshotBaseline.campaignState.runtimeTracking?.revision);
  assert.equal(Number.isFinite(turn.stateRevision), true, 'Malformed retained-snapshot fixture must retain deterministic CORE stateRevision fallback evidence.');
  delete turn.snapshotBefore;
  turn.snapshotBeforeRetained = false;
  return next;
});
const beforeMissingSnapshotDelete = await app.getCurrentView({ tabId: 'mission' });
const missingSnapshotLedgerEntry = beforeMissingSnapshotDelete.campaignState.turnLedger.entries.find((entry) => entry.outcomeId === coreDeletedOutcomeId);
assert.equal(missingSnapshotLedgerEntry.coreTransactionId, coreDeletedTransactionId);
assert.equal(Object.prototype.hasOwnProperty.call(missingSnapshotLedgerEntry, 'snapshotBefore'), false);
assert.notEqual(missingSnapshotLedgerEntry.snapshotBeforeRetained, true);
const beforeMissingSnapshotCoreProjections = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: beforeMissingSnapshotDelete.campaignState.campaign.id,
  saveId: beforeMissingSnapshotDelete.campaignState.campaignChatBinding.saveId
});
const beforeMissingSnapshotRecoveryCount = beforeMissingSnapshotCoreProjections.recoveryJournal.filter((entry) => (
  entry.transactionId === coreDeletedTransactionId
  && entry.dependentOutcomeId === coreDeletedOutcomeId
)).length;
const beforeMissingSnapshotRollbackCount = beforeMissingSnapshotCoreProjections.rollbackActuations.filter((entry) => (
  entry.transactionId === coreDeletedTransactionId
  && entry.outcomeId === coreDeletedOutcomeId
)).length;
const beforeMissingSnapshotDeleteRollbackEvaluations = committedOutcomeDeleteRollbackEvaluations;
await assert.rejects(
  () => app.deleteCommittedOutcome({ outcomeId: coreDeletedOutcomeId }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_REPAIR_DELETE_OUTCOME_RETAINED_SNAPSHOT_REQUIRED');
    assert.equal(error.details?.outcomeId, coreDeletedOutcomeId);
    assert.equal(error.details?.transactionId, coreDeletedTransactionId);
    return true;
  },
  'Missing retained snapshot must reject before REPAIR authorization, CORE recovery, or old restore.'
);
const afterMissingSnapshotDelete = await app.getCurrentView({ tabId: 'mission' });
assert.deepEqual(afterMissingSnapshotDelete.campaignState.turnLedger, beforeMissingSnapshotDelete.campaignState.turnLedger, 'Missing-snapshot delete must not mutate turn ledger state.');
assert.equal(afterMissingSnapshotDelete.campaignState.turnLedger.lastCommittedOutcomeId, coreDeletedOutcomeId, 'Missing-snapshot delete must not run old snapshot restore.');
assert.equal(afterMissingSnapshotDelete.campaignState.mission.activePhaseId, beforeMissingSnapshotDelete.campaignState.mission.activePhaseId, 'Missing-snapshot delete must not mutate campaign state.');
assert.deepEqual(afterMissingSnapshotDelete.pendingOutcomeReplacement || null, beforeMissingSnapshotDelete.pendingOutcomeReplacement || null, 'Missing-snapshot delete must not mutate pending outcome replacement cache.');
assert.deepEqual(afterMissingSnapshotDelete.pendingDirectorTurn || null, beforeMissingSnapshotDelete.pendingDirectorTurn || null, 'Missing-snapshot delete must not mutate pending director turn cache.');
assert.equal(committedOutcomeDeleteRollbackEvaluations, beforeMissingSnapshotDeleteRollbackEvaluations, 'Missing-snapshot delete must not ask REPAIR to authorize rollback.');
const afterMissingSnapshotCoreProjections = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: beforeMissingSnapshotDelete.campaignState.campaign.id,
  saveId: beforeMissingSnapshotDelete.campaignState.campaignChatBinding.saveId
});
assert.equal(
  afterMissingSnapshotCoreProjections.recoveryJournal.filter((entry) => (
    entry.transactionId === coreDeletedTransactionId
    && entry.dependentOutcomeId === coreDeletedOutcomeId
  )).length,
  beforeMissingSnapshotRecoveryCount,
  'Missing-snapshot delete must not write CORE recovery projection.'
);
assert.equal(
  afterMissingSnapshotCoreProjections.rollbackActuations.filter((entry) => (
    entry.transactionId === coreDeletedTransactionId
    && entry.outcomeId === coreDeletedOutcomeId
  )).length,
  beforeMissingSnapshotRollbackCount,
  'Missing-snapshot delete must not write CORE rollback actuation projection.'
);
await app[mutateRuntimeAppCampaignState]((state) => {
  const next = cloneJson(retainedSnapshotBaseline.campaignState || state);
  const entry = next.turnLedger.entries.find((item) => item.outcomeId === coreDeletedOutcomeId);
  assert.ok(entry?.coreCheckpointRef, 'Denied delete fixture must retain CORE checkpoint evidence.');
  entry.snapshotBeforeRetained = true;
  return next;
});
assert.ok(coreDeleteLedgerEntry.coreCheckpointRef?.checkpointId, 'CORE delete fixture outcome must carry a CORE checkpoint ref.');
const coreDeleteCheckpointId = coreDeleteLedgerEntry.coreCheckpointRef.checkpointId;

await app[mutateRuntimeAppCampaignState]((state) => {
  const next = cloneJson(state);
  const entry = next.turnLedger.entries.find((item) => item.outcomeId === coreDeletedOutcomeId);
  assert.ok(entry, 'No-ref delete fixture must find the outcome entry.');
  assert.equal(Object.prototype.hasOwnProperty.call(entry, 'snapshotBefore'), false, 'No-ref delete fixture must stay raw-snapshot-free.');
  delete entry.coreCheckpointRef;
  entry.snapshotBeforeRetained = true;
  return next;
});
const hydratedNoRefDelete = await app.getCurrentView({ tabId: 'mission' });
const hydratedNoRefEntry = hydratedNoRefDelete.campaignState.turnLedger.entries.find((entry) => entry.outcomeId === coreDeletedOutcomeId);
assert.equal(Object.prototype.hasOwnProperty.call(hydratedNoRefEntry, 'snapshotBefore'), false, 'CORE hydration must not restore raw snapshots.');
assert.notEqual(hydratedNoRefEntry.snapshotBeforeRetained, true, 'CORE hydration must not promote retained-snapshot authority from old turn rows.');
assert.ok(
  hydratedNoRefEntry.coreCheckpointRef?.checkpointId,
  'CORE hydration should preserve CORE checkpoint refs even when an old ledger mirror deletes its ref.'
);
await app[mutateRuntimeAppCampaignState]((state) => {
  const next = cloneJson(retainedSnapshotBaseline.campaignState || state);
  const entry = next.turnLedger.entries.find((item) => item.outcomeId === coreDeletedOutcomeId);
  assert.ok(entry?.coreCheckpointRef, 'Denied delete fixture must retain CORE checkpoint evidence.');
  entry.snapshotBeforeRetained = true;
  return next;
});
await app[mutateRuntimeCoreStoreState]((state) => {
  const next = cloneJson(state);
  const turn = next.turns.find((item) => item.outcomeId === coreDeletedOutcomeId);
  assert.ok(turn?.coreCheckpointRef, 'Denied delete fixture must retain CORE checkpoint evidence.');
  turn.snapshotBeforeRetained = true;
  return next;
});

let beforeDeniedDelete = await app.getCurrentView({ tabId: 'mission' });
const beforeDeniedCoreProjections = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: beforeDeniedDelete.campaignState.campaign.id,
  saveId: beforeDeniedDelete.campaignState.campaignChatBinding.saveId
});
const beforeDeniedRecoveryCount = beforeDeniedCoreProjections.recoveryJournal.filter((entry) => (
  entry.transactionId === coreDeletedTransactionId
  && entry.dependentOutcomeId === coreDeletedOutcomeId
)).length;
const beforeDeniedRollbackCount = beforeDeniedCoreProjections.rollbackActuations.filter((entry) => (
  entry.transactionId === coreDeletedTransactionId
  && entry.outcomeId === coreDeletedOutcomeId
)).length;
await app[mutateRuntimeAppCampaignState]((state) => {
  const next = cloneJson(state);
  const entry = next.turnLedger.entries.find((item) => item.outcomeId === coreDeletedOutcomeId);
  assert.ok(entry?.coreCheckpointRef, 'Denied delete fixture must retain CORE checkpoint evidence.');
  entry.snapshotBeforeRetained = true;
  return next;
});
beforeDeniedDelete = await app.getCurrentView({ tabId: 'mission' });
denyCommittedOutcomeDeleteRollback = true;
await assert.rejects(
  () => app.deleteCommittedOutcome({ outcomeId: coreDeletedOutcomeId }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_REPAIR_DELETE_OUTCOME_ROLLBACK_NOT_AUTHORIZED');
    assert.equal(error.details?.outcomeId, coreDeletedOutcomeId);
    assert.equal(error.details?.transactionId, coreDeletedTransactionId);
    return true;
  },
  'Denied REPAIR rollback must reject committed outcome delete before CORE recovery is written.'
);
denyCommittedOutcomeDeleteRollback = false;
const afterDeniedDelete = await app.getCurrentView({ tabId: 'mission' });
assert.deepEqual(afterDeniedDelete.campaignState.turnLedger, beforeDeniedDelete.campaignState.turnLedger, 'Denied delete must not mutate turn ledger state.');
assert.equal(afterDeniedDelete.campaignState.turnLedger.lastCommittedOutcomeId, coreDeletedOutcomeId, 'Denied delete must not run old snapshot restore.');
assert.equal(afterDeniedDelete.campaignState.mission.activePhaseId, beforeDeniedDelete.campaignState.mission.activePhaseId, 'Denied delete must not mutate campaign state.');
assert.deepEqual(afterDeniedDelete.pendingOutcomeReplacement || null, beforeDeniedDelete.pendingOutcomeReplacement || null, 'Denied delete must not mutate pending outcome replacement cache.');
assert.deepEqual(afterDeniedDelete.pendingDirectorTurn || null, beforeDeniedDelete.pendingDirectorTurn || null, 'Denied delete must not mutate pending director turn cache.');
const afterDeniedCoreProjections = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: beforeDeniedDelete.campaignState.campaign.id,
  saveId: beforeDeniedDelete.campaignState.campaignChatBinding.saveId
});
assert.equal(
  afterDeniedCoreProjections.recoveryJournal.filter((entry) => (
    entry.transactionId === coreDeletedTransactionId
    && entry.dependentOutcomeId === coreDeletedOutcomeId
  )).length,
  beforeDeniedRecoveryCount,
  'Denied delete must not write CORE recovery projection.'
);
assert.equal(
  afterDeniedCoreProjections.rollbackActuations.filter((entry) => (
    entry.transactionId === coreDeletedTransactionId
    && entry.outcomeId === coreDeletedOutcomeId
  )).length,
  beforeDeniedRollbackCount,
  'Denied delete must not write CORE rollback actuation projection.'
);

await app[mutateRuntimeAppCampaignState](() => retainedSnapshotBaseline.loadedCampaignState || retainedSnapshotBaseline.campaignState);
await app[mutateRuntimeCoreStoreState]((state) => {
  const next = cloneJson(state);
  const turn = next.turns.find((item) => item.outcomeId === coreDeletedOutcomeId);
  assert.ok(turn?.coreCheckpointRef, 'Missing CORE checkpoint fixture must start from a CORE turn checkpoint ref.');
  turn.snapshotBeforeRetained = true;
  turn.coreCheckpointRef = {
    ...turn.coreCheckpointRef,
    kind: turn.coreCheckpointRef?.kind || 'directive.coreMechanicsCheckpointRef.v1',
    campaignId: turn.coreCheckpointRef?.campaignId || next.campaignId,
    saveId: turn.coreCheckpointRef?.saveId || next.saveId,
    checkpointId: 'stage18-missing-delete-checkpoint',
    layout: turn.coreCheckpointRef?.layout || 'core',
    sourceRevision: 20
  };
  return next;
});
await app[mutateRuntimeAppCampaignState]((state) => {
  const next = cloneJson(state);
  const entry = next.turnLedger.entries.find((item) => item.outcomeId === coreDeletedOutcomeId);
  assert.ok(entry, 'Missing CORE checkpoint fixture must find the outcome entry.');
  assert.equal(Object.prototype.hasOwnProperty.call(entry, 'snapshotBefore'), false, 'Missing CORE checkpoint fixture must stay raw-snapshot-free.');
  entry.snapshotBeforeRetained = true;
  entry.coreCheckpointRef = {
    ...(entry.coreCheckpointRef || coreDeleteLedgerEntry.coreCheckpointRef),
    checkpointId: 'stage18-missing-delete-checkpoint',
    sourceRevision: 20
  };
  return next;
});
const beforeMissingCoreCheckpointDelete = await app.getCurrentView({ tabId: 'mission' });
const beforeMissingCoreCheckpointState = beforeMissingCoreCheckpointDelete.loadedCampaignState || beforeMissingCoreCheckpointDelete.campaignState;
const beforeMissingCoreCheckpointEntry = beforeMissingCoreCheckpointState.turnLedger.entries.find((entry) => entry.outcomeId === coreDeletedOutcomeId);
assert.equal(Object.prototype.hasOwnProperty.call(beforeMissingCoreCheckpointEntry, 'snapshotBefore'), false, 'Missing CORE checkpoint test must not keep raw snapshot present.');
assert.equal(beforeMissingCoreCheckpointEntry.snapshotBeforeRetained, true);
assert.equal(beforeMissingCoreCheckpointEntry.coreCheckpointRef.checkpointId, 'stage18-missing-delete-checkpoint');
const beforeMissingCoreCheckpointProjections = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: beforeMissingCoreCheckpointState.campaign.id,
  saveId: beforeMissingCoreCheckpointState.campaignChatBinding.saveId
});
const beforeMissingCoreCheckpointRecoveryCount = beforeMissingCoreCheckpointProjections.recoveryJournal.filter((entry) => (
  entry.transactionId === coreDeletedTransactionId
  && entry.dependentOutcomeId === coreDeletedOutcomeId
)).length;
const beforeMissingCoreCheckpointRollbackCount = beforeMissingCoreCheckpointProjections.rollbackActuations.filter((entry) => (
  entry.transactionId === coreDeletedTransactionId
  && entry.outcomeId === coreDeletedOutcomeId
)).length;
const beforeMissingCoreCheckpointDeleteRollbackEvaluations = committedOutcomeDeleteRollbackEvaluations;
await assert.rejects(
  () => app.deleteCommittedOutcome({ outcomeId: coreDeletedOutcomeId }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_REPAIR_DELETE_OUTCOME_RETAINED_SNAPSHOT_REQUIRED');
    assert.equal(error.details?.outcomeId, coreDeletedOutcomeId);
    assert.equal(error.details?.transactionId, coreDeletedTransactionId);
    return true;
  },
  'Missing CORE checkpoint artifact must fail closed without old raw snapshot fallback.'
);
const afterMissingCoreCheckpointDelete = await app.getCurrentView({ tabId: 'mission' });
const afterMissingCoreCheckpointState = afterMissingCoreCheckpointDelete.loadedCampaignState || afterMissingCoreCheckpointDelete.campaignState;
const afterMissingCoreCheckpointEntry = afterMissingCoreCheckpointState.turnLedger.entries.find((entry) => entry.outcomeId === coreDeletedOutcomeId);
assert.ok(afterMissingCoreCheckpointEntry, 'Missing CORE checkpoint delete must keep the target outcome in the turn ledger.');
assert.equal(Object.prototype.hasOwnProperty.call(afterMissingCoreCheckpointEntry, 'snapshotBefore'), false, 'Missing CORE checkpoint delete must not reintroduce raw snapshot state.');
assert.equal(afterMissingCoreCheckpointState.turnLedger.lastCommittedOutcomeId, coreDeletedOutcomeId, 'Missing CORE checkpoint delete must not fall back to old snapshot restore.');
assert.equal(afterMissingCoreCheckpointState.mission.activePhaseId, beforeMissingCoreCheckpointState.mission.activePhaseId, 'Missing CORE checkpoint delete must not mutate campaign state.');
assert.equal(committedOutcomeDeleteRollbackEvaluations, beforeMissingCoreCheckpointDeleteRollbackEvaluations, 'Missing CORE checkpoint delete must not ask REPAIR to authorize rollback.');
const afterMissingCoreCheckpointProjections = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: beforeMissingCoreCheckpointState.campaign.id,
  saveId: beforeMissingCoreCheckpointState.campaignChatBinding.saveId
});
assert.equal(
  afterMissingCoreCheckpointProjections.recoveryJournal.filter((entry) => (
    entry.transactionId === coreDeletedTransactionId
    && entry.dependentOutcomeId === coreDeletedOutcomeId
  )).length,
  beforeMissingCoreCheckpointRecoveryCount,
  'Missing CORE checkpoint delete must not write CORE recovery projection.'
);
assert.equal(
  afterMissingCoreCheckpointProjections.rollbackActuations.filter((entry) => (
    entry.transactionId === coreDeletedTransactionId
    && entry.outcomeId === coreDeletedOutcomeId
  )).length,
  beforeMissingCoreCheckpointRollbackCount,
  'Missing CORE checkpoint delete must not write CORE rollback actuation projection.'
);
await app[mutateRuntimeCoreStoreState]((state) => {
  const next = cloneJson(state);
  const turn = next.turns.find((item) => item.outcomeId === coreDeletedOutcomeId);
  assert.ok(turn, 'CORE checkpoint delete fixture must restore original CORE turn row.');
  turn.coreCheckpointRef = cloneJson(coreDeleteLedgerEntry.coreCheckpointRef);
  return next;
});
await app[mutateRuntimeAppCampaignState](() => retainedSnapshotBaseline.loadedCampaignState || retainedSnapshotBaseline.campaignState);

const loadedExistingCoreDeleteCheckpoint = await loadV2Checkpoint(host.storage, {
  campaignId: retainedSnapshotBaseline.campaignState.campaign.id,
  saveId: retainedSnapshotBaseline.campaignState.campaignChatBinding.saveId,
  checkpointId: coreDeleteCheckpointId,
  layout: 'core'
});
const coreDeleteSnapshot = cloneJson(loadedExistingCoreDeleteCheckpoint.checkpoint?.campaignState);
assert.ok(coreDeleteSnapshot, 'CORE checkpoint delete fixture must have an existing CORE pre-outcome checkpoint.');
coreDeleteSnapshot.campaign = {
  ...(coreDeleteSnapshot.campaign || {}),
  coreCheckpointDeleteRestoreCanary: 'CORE_DELETE_RESTORE_CANARY'
};
await writeV2Checkpoint(host.storage, {
  campaignId: retainedSnapshotBaseline.campaignState.campaign.id,
  saveId: retainedSnapshotBaseline.campaignState.campaignChatBinding.saveId,
  checkpointId: coreDeleteCheckpointId,
  layout: 'core',
  checkpoint: {
    kind: 'directive.coreMechanicsCheckpoint.v1',
    type: 'coreMechanicsPreOutcome',
    checkpointId: coreDeleteCheckpointId,
    outcomeId: coreDeletedOutcomeId,
    sourceKind: 'coreStoreV2.checkpoint',
    sourceRevision: 19,
    campaignState: coreDeleteSnapshot
  }
});
const loadedCoreDeleteCheckpoint = await loadV2Checkpoint(host.storage, {
  campaignId: retainedSnapshotBaseline.campaignState.campaign.id,
  saveId: retainedSnapshotBaseline.campaignState.campaignChatBinding.saveId,
  checkpointId: coreDeleteCheckpointId,
  layout: 'core'
});
assert.equal(
  loadedCoreDeleteCheckpoint.checkpoint.campaignState.campaign.coreCheckpointDeleteRestoreCanary,
  'CORE_DELETE_RESTORE_CANARY',
  'CORE checkpoint delete fixture must persist the restore canary.'
);
await app[mutateRuntimeAppCampaignState]((state) => {
  const next = cloneJson(state);
  const entry = next.turnLedger.entries.find((item) => item.outcomeId === coreDeletedOutcomeId);
  assert.ok(entry, 'CORE checkpoint delete fixture must find the outcome entry.');
  assert.equal(Object.prototype.hasOwnProperty.call(entry, 'snapshotBefore'), false, 'CORE checkpoint delete fixture must start raw-snapshot-free.');
  entry.snapshotBeforeRetained = true;
  entry.coreCheckpointRef = {
    ...entry.coreCheckpointRef,
    kind: entry.coreCheckpointRef?.kind || 'directive.coreMechanicsCheckpointRef.v1',
    campaignId: entry.coreCheckpointRef?.campaignId || next.campaign.id,
    saveId: entry.coreCheckpointRef?.saveId || next.campaignChatBinding.saveId,
    checkpointId: coreDeleteCheckpointId,
    layout: entry.coreCheckpointRef?.layout || 'core',
    sourceRevision: 19
  };
  return next;
});
const beforeCoreCheckpointDelete = await app.getCurrentView({ tabId: 'mission' });
const coreCheckpointDeleteEntry = beforeCoreCheckpointDelete.campaignState.turnLedger.entries.find((entry) => entry.outcomeId === coreDeletedOutcomeId);
assert.equal(Object.prototype.hasOwnProperty.call(coreCheckpointDeleteEntry, 'snapshotBefore'), false);
assert.equal(coreCheckpointDeleteEntry.snapshotBeforeRetained, true);
assert.equal(coreCheckpointDeleteEntry.coreCheckpointRef.checkpointId, coreDeleteCheckpointId);

const deleted = await app.deleteCommittedOutcome({ outcomeId: coreDeletedOutcomeId });
assert.equal(deleted.deletedOutcomeId, coreDeletedOutcomeId);
assert.equal(deleted.rollbackActuation.status, 'recorded');
assert.equal(deleted.rollbackActuation.rollback.kind, 'directive.repairRollbackActuationRecord.v1');
assert.equal(deleted.rollbackActuation.rollback.transactionId, coreDeletedTransactionId);
assert.equal(deleted.rollbackActuation.rollback.outcomeId, coreDeletedOutcomeId);
assert.equal(deleted.rollbackActuation.rollback.rollbackActuation.kind, 'directive.repairRollbackActuationDecision.v1');
assert.equal(deleted.rollbackActuation.rollback.rollbackActuation.authorized, true);
assert.equal(deleted.rollbackActuation.rollback.rollbackActuation.sourceKind, 'committedOutcome');
assert.equal(deleted.rollbackActuation.rollback.rollbackActuation.outcomeId, coreDeletedOutcomeId);
assert.equal(deleted.rollbackActuation.rollback.rollbackActuation.transactionId, coreDeletedTransactionId);
assert.ok(deleted.rollbackActuation.rollback.rollbackActuation.recoveryCaseId, 'Delete rollback evidence must include recovery case id.');
assert.equal(Number.isFinite(Number(deleted.rollbackActuation.rollback.rollbackActuation.restoreRevision)), true, 'Delete rollback evidence must include restore revision.');
assertNoRawRollbackPayload(deleted.rollbackActuation, 'delete rollback evidence');
const deleteCoreProjections = await readCoreStoreProjectionsV2(host.storage, {
  campaignId: deleted.campaignState.campaign.id,
  saveId: deleted.campaignState.campaignChatBinding.saveId
});
const projectedDeleteRollback = deleteCoreProjections.rollbackActuations.find((entry) => (
  entry.transactionId === coreDeletedTransactionId
  && entry.outcomeId === coreDeletedOutcomeId
));
assert.ok(projectedDeleteRollback, 'CORE projections must expose rollback actuation for deleted committed outcome.');
assert.equal(projectedDeleteRollback.rollbackActuation.authorized, true);
assert.equal(projectedDeleteRollback.rollbackActuation.sourceKind, 'committedOutcome');
assertNoRawRollbackPayload(projectedDeleteRollback, 'projected delete rollback evidence');
const projectedDeleteRecovery = deleteCoreProjections.recoveryJournal.find((entry) => (
  entry.transactionId === coreDeletedTransactionId
  && entry.dependentOutcomeId === coreDeletedOutcomeId
  && entry.status === 'resolved'
));
assert.ok(projectedDeleteRecovery, 'CORE projections must expose recovery resolution for deleted committed outcome transaction.');
assert.equal(projectedDeleteRecovery.status, 'resolved');
assert.equal(deleted.campaignState.mission.activePhaseId, 'hesperus-diversion');
assert.equal(deleted.campaignState.commandBearing.resolve.points, 1);
assert.equal(deleted.campaignState.commandBearing.resolve.marks || 0, 0);
assert.equal(deleted.campaignState.turnLedger.lastCommittedOutcomeId, replacementOutcomeId);
assert.equal(
  deleted.campaignState.campaign.coreCheckpointDeleteRestoreCanary,
  'CORE_DELETE_RESTORE_CANARY',
  'Committed outcome delete must restore from CORE checkpoint artifact when a checkpoint ref exists.'
);

console.log('Stage 18 rerun/branch/recovery tests passed: narration rewrite, outcome rerun, rollback, branch metadata, and delete restore');
