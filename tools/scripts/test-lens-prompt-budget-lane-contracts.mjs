import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createLensPromptBudgetTrace,
  LENS_PROMPT_BUDGET_LANES,
  LENS_PROMPT_BUDGET_TRACE_KIND,
  promptBudgetLaneIds
} from '../../src/runtime/lens-prompt-budget-trace.mjs';
import {
  createLensPromptScheduler
} from '../../src/runtime/lens-prompt-scheduler.mjs';
import {
  buildLensPromptPacket
} from '../../src/runtime/lens-prompt-packet-builder.mjs';

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const schema = readJson('schemas/runtime/lens-prompt-budget-trace.schema.json');
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.additionalProperties, false);
assert.equal(schema.required.includes('lanes'), true);
assert.deepEqual(promptBudgetLaneIds(), [
  'stableRules',
  'protectedContinuity',
  'activeScene',
  'activeCast',
  'missionPressure',
  'recentTranscript',
  'recall',
  'volatileTurn',
  'externalEnvironment'
]);
assert.deepEqual(promptBudgetLaneIds(), [...LENS_PROMPT_BUDGET_LANES]);

const trace = createLensPromptBudgetTrace({
  packetId: 'packet-1',
  promptRevision: 12,
  cacheKey: 'cache-key-1',
  cacheInputs: {
    mechanicsRevision: 44,
    promptDomainVector: {
      continuity: 9,
      sourceBinding: 2
    },
    recallIndexRevision: 'recall-rev-1',
    sceneSealRevision: 'seal-rev-1',
    pressureArcDigestRevision: 'pressure-arc-rev-1',
    packageRevision: 'package-rev-1',
    promptBudgetLaneOverrides: {
      recall: {
        budgetTokens: 100,
        reservedFloor: 0
      },
      protectedContinuity: {
        budgetTokens: 100,
        reservedFloor: 80,
        overflowPolicy: 'fail-closed'
      }
    },
    externalPromptEnvironmentRef: {
      kind: 'directive.externalPromptEnvironmentRef.v1',
      hash: 'external-hash',
      rawPromptBody: 'External raw prompt body must not serialize.'
    },
    externalPromptEnvironmentTargets: {
      stLorebooks: {
        status: 'active',
        active: true,
        activeNameCount: 1,
        rawContentCaptured: false
      },
      memoryBooks: {
        status: 'valid',
        enabled: true,
        entryCount: 48,
        rangeDiagnostics: { status: 'valid', rangeHash: 'range-hash' },
        rawMemoryBookText: 'Memory Book raw text must not serialize.'
      },
      summaryception: {
        status: 'current',
        promptKeyActive: true,
        staleness: { status: 'current' },
        summaryceptionSummary: 'Summaryception raw summary must not serialize.'
      },
      vectFox: {
        status: 'external-backend-configured',
        enabled: true,
        promptKeys: ['3_vectfox'],
        backendDiagnostics: { status: 'external-backend-configured', backendType: 'qdrant' },
        vectorPayload: 'Vector payload must not serialize.'
      }
    }
  },
  lanes: [
    {
      id: 'stableRules',
      budgetTokens: 400,
      reservedFloor: 300,
      authority: 'directive',
      refs: [{
        id: 'rules-directive',
        kind: 'rules',
        hash: 'rules-hash',
        estimatedTokens: 120,
        text: 'Prompt body text must not serialize.'
      }]
    },
    {
      id: 'protectedContinuity',
      budgetTokens: 100,
      reservedFloor: 80,
      authority: 'directive',
      refs: [
        {
          id: 'private-bronn-fact',
          kind: 'directive.continuityFactRef.v1',
          hash: 'private-bronn-fact-hash',
          estimatedTokens: 70
        },
        {
          id: 'protected-hard-floor',
          kind: 'directive.continuityFactRef.v1',
          hash: 'protected-hard-floor-hash',
          estimatedTokens: 70,
          rawTranscript: 'Protected continuity raw text must not serialize.'
        }
      ]
    },
    {
      id: 'recall',
      budgetTokens: 100,
      reservedFloor: 0,
      authority: 'directive',
      refs: [
        {
          id: 'recall-bronn-warning',
          kind: 'directive.recallIndexEntry.v1',
          authority: 'committed',
          textHash: 'recall-text-hash-1',
          estimatedTokens: 70,
          rawTranscript: 'Raw transcript must not serialize.'
        },
        {
          id: 'recall-omitted',
          kind: 'directive.recallIndexEntry.v1',
          authority: 'package',
          hash: 'recall-hash-2',
          estimatedTokens: 60,
          providerOutput: 'Provider output must not serialize.'
        }
      ]
    },
    {
      id: 'externalEnvironment',
      budgetTokens: 0,
      reservedFloor: 0,
      authority: 'diagnostic',
      refs: [{
        id: 'external-ref',
        kind: 'directive.externalPromptEnvironmentRef.v1',
        hash: 'external-hash',
        estimatedTokens: 999,
        summaryceptionSummary: 'Summaryception summary must not serialize.',
        vectorPayload: 'Vector payload must not serialize.',
        apiKey: 'SECRET'
      }]
    }
  ]
});

assert.equal(trace.kind, LENS_PROMPT_BUDGET_TRACE_KIND);
assert.equal(trace.schemaVersion, 1);
assert.equal(trace.promptRevision, 12);
assert.match(trace.hash, /^[a-f0-9]{64}$/);
assert.equal(trace.cacheInputs.mechanicsRevision, 44);
assert.equal(trace.cacheInputs.recallIndexRevision, 'recall-rev-1');
assert.equal(trace.cacheInputs.sceneSealRevision, 'seal-rev-1');
assert.equal(trace.cacheInputs.pressureArcDigestRevision, 'pressure-arc-rev-1');
assert.equal(trace.cacheInputs.packageRevision, 'package-rev-1');
assert.equal(trace.cacheInputs.promptBudgetLaneOverrides.recall.budgetTokens, 100);
assert.equal(trace.cacheInputs.promptBudgetLaneOverrides.protectedContinuity.overflowPolicy, 'fail-closed');
assert.equal(trace.cacheInputs.externalPromptEnvironmentRef.hash, 'external-hash');
assert.equal(trace.cacheInputs.externalPromptEnvironmentTargets.memoryBooks.rangeDiagnostics.status, 'valid');
assert.equal(trace.cacheInputs.externalPromptEnvironmentTargets.summaryception.staleness.status, 'current');
assert.equal(trace.cacheInputs.externalPromptEnvironmentTargets.vectFox.backendDiagnostics.status, 'external-backend-configured');
assert.equal(Object.hasOwn(trace.cacheInputs.externalPromptEnvironmentTargets.vectFox, 'promptKeys'), false);

const recallLane = trace.lanes.find((lane) => lane.id === 'recall');
const protectedContinuityLane = trace.lanes.find((lane) => lane.id === 'protectedContinuity');
assert.equal(protectedContinuityLane.overflowPolicy, 'fail-closed');
assert.equal(protectedContinuityLane.status, 'blocked-over-budget');
assert.equal(protectedContinuityLane.blocking, true);
assert.equal(protectedContinuityLane.budgetExceeded, true);
assert.equal(protectedContinuityLane.includedRefs.length, 2);
assert.equal(protectedContinuityLane.omittedRefs.length, 0);
assert.equal(protectedContinuityLane.overBudgetRefs.length, 1);
assert.equal(protectedContinuityLane.overBudgetRefs[0].omissionReason, 'protected-budget-exceeded');
assert.equal(protectedContinuityLane.omissionReasons.includes('protected-budget-exceeded'), true);
assert.equal(protectedContinuityLane.reservedFloorSatisfied, true);

assert.equal(recallLane.includedRefs.length, 1);
assert.equal(recallLane.overflowPolicy, 'omit-overflow');
assert.equal(recallLane.status, 'omitted-overflow');
assert.equal(recallLane.blocking, false);
assert.equal(recallLane.budgetExceeded, true);
assert.equal(recallLane.includedRefs[0].id, 'recall-bronn-warning');
assert.equal(recallLane.includedRefs[0].hash, 'recall-text-hash-1');
assert.equal(Object.hasOwn(recallLane.includedRefs[0], 'textHash'), false);
assert.equal(recallLane.omittedRefs.length, 1);
assert.equal(recallLane.omittedRefs[0].id, 'recall-omitted');
assert.equal(recallLane.omittedRefs[0].omissionReason, 'budget-exceeded');
assert.equal(recallLane.omissionReasons.includes('budget-exceeded'), true);

const externalLane = trace.lanes.find((lane) => lane.id === 'externalEnvironment');
assert.equal(externalLane.diagnosticOnly, true);
assert.equal(externalLane.overflowPolicy, 'diagnostic-only');
assert.equal(externalLane.status, 'diagnostic-only');
assert.equal(externalLane.budgetExceeded, false);
assert.equal(externalLane.includedRefs.length, 1);
assert.equal(externalLane.estimatedTokens, 999);

const serialized = JSON.stringify(trace);
assert.equal(serialized.includes('Prompt body text'), false);
assert.equal(serialized.includes('Raw transcript'), false);
assert.equal(serialized.includes('Protected continuity raw text'), false);
assert.equal(serialized.includes('Provider output'), false);
assert.equal(serialized.includes('External raw prompt body'), false);
assert.equal(serialized.includes('Memory Book raw text'), false);
assert.equal(serialized.includes('Summaryception raw summary'), false);
assert.equal(serialized.includes('Summaryception summary'), false);
assert.equal(serialized.includes('Vector payload'), false);
assert.equal(serialized.includes('SECRET'), false);

assert.throws(
  () => createLensPromptBudgetTrace({ lanes: [{ id: 'notALane' }] }),
  /Unknown LENS prompt budget lane/
);

const installedPackets = [];
const filteringScheduler = createLensPromptScheduler({
  clock: () => '2026-07-02T10:00:00.000Z',
  buildDirectivePromptPacket: async ({ revision, cacheKey }) => ({
    kind: 'directive.playerSafePromptContext',
    revision,
    cacheKey,
    blocks: [
      {
        id: 'stable-contract',
        promptKey: 'directive.contract',
        text: 'Stable Directive contract.',
        tokenEstimate: 10
      },
      {
        id: 'recall-small',
        promptKey: 'directive.test.recall.small',
        lensPromptBudgetLane: 'recall',
        text: 'Small recall survives.',
        tokenEstimate: 70
      },
      {
        id: 'recall-large',
        promptKey: 'directive.test.recall.large',
        lensPromptBudgetLane: 'recall',
        text: 'Large recall is omitted by LENS budget.',
        tokenEstimate: 80,
        rawTranscript: 'Raw omitted recall text must not persist.'
      }
    ],
    promptBudgetLanes: [
      {
        id: 'stableRules',
        budgetTokens: 500,
        refs: [{ id: 'stable-contract', hash: 'stable-contract-hash', estimatedTokens: 10 }]
      },
      {
        id: 'recall',
        budgetTokens: 100,
        refs: [
          { id: 'recall-small', hash: 'recall-small-hash', estimatedTokens: 70 },
          { id: 'recall-large', hash: 'recall-large-hash', estimatedTokens: 80, rawTranscript: 'Raw omitted recall text must not persist.' }
        ]
      }
    ]
  }),
  installPromptPacket: async ({ packet }) => {
    installedPackets.push(packet);
    return { ok: true };
  },
  observeExternalPromptEnvironment: async () => ({ host: 'sillytavern', status: 'observed' })
});
filteringScheduler.markDirty({ dirtyDomains: ['factIndex'], idempotencyKey: 'filter-dirty' });
const filteredFlush = await filteringScheduler.flushVisible({
  transactionId: 'txn-filter-budget',
  binding: { campaignId: 'campaign-budget-filter' },
  idempotencyKey: 'filter-flush'
});
assert.equal(filteredFlush.status, 'installed');
assert.equal(filteredFlush.promptBudgetEnforcement.status, 'filtered');
assert.deepEqual(filteredFlush.packet.blocks.map((block) => block.id), ['stable-contract', 'recall-small']);
assert.equal(filteredFlush.promptBudgetEnforcement.omittedBlocks[0].id, 'recall-large');
assert.deepEqual(installedPackets[0].blocks.map((block) => block.id), ['stable-contract', 'recall-small']);
assert.equal(JSON.stringify(filteredFlush).includes('Raw omitted recall text'), false);

const packageOverrideScheduler = createLensPromptScheduler({
  clock: () => '2026-07-02T10:05:00.000Z',
  buildDirectivePromptPacket: async ({ revision, cacheKey }) => ({
    kind: 'directive.playerSafePromptContext',
    revision,
    cacheKey,
    blocks: [
      {
        id: 'recall-package-small',
        promptKey: 'directive.test.recall.package-small',
        lensPromptBudgetLane: 'recall',
        text: 'Package small recall survives.',
        tokenEstimate: 70
      },
      {
        id: 'recall-package-large',
        promptKey: 'directive.test.recall.package-large',
        lensPromptBudgetLane: 'recall',
        text: 'Package large recall omitted.',
        tokenEstimate: 80
      }
    ]
  }),
  installPromptPacket: async () => ({ ok: true }),
  observeExternalPromptEnvironment: async () => ({ host: 'sillytavern', status: 'observed' })
});
packageOverrideScheduler.markDirty({ dirtyDomains: ['factIndex'], idempotencyKey: 'package-override-dirty' });
const packageOverrideFlush = await packageOverrideScheduler.flushVisible({
  transactionId: 'txn-package-budget',
  binding: { campaignId: 'campaign-budget-package' },
  campaignContext: {
    promptBudgetLaneOverrides: {
      recall: {
        budgetTokens: 100,
        reservedFloor: 0
      }
    }
  },
  idempotencyKey: 'package-override-flush'
});
assert.equal(packageOverrideFlush.promptBudgetTrace.cacheInputs.promptBudgetLaneOverrides.recall.budgetTokens, 100);
assert.equal(packageOverrideFlush.promptBudgetTrace.lanes.find((lane) => lane.id === 'recall').budgetTokens, 100);
assert.deepEqual(packageOverrideFlush.packet.blocks.map((block) => block.id), ['recall-package-small']);
assert.equal(packageOverrideFlush.promptBudgetEnforcement.omittedBlocks[0].id, 'recall-package-large');

const automaticRecallLaneScheduler = createLensPromptScheduler({
  clock: () => '2026-07-02T10:07:00.000Z',
  buildDirectivePromptPacket: async ({ revision, cacheKey }) => ({
    kind: 'directive.playerSafePromptContext',
    revision,
    cacheKey,
    blocks: [{
      id: 'active-scene',
      promptKey: 'directive.scene.active',
      text: 'Active scene stays installed.',
      tokenEstimate: 50
    }],
    recallRefs: [
      {
        id: 'core-recall-scene-seal',
        authority: 'committed',
        textHash: 'core-recall-scene-seal-hash',
        estimatedTokens: 120,
        sourceFrameRef: {
          id: 'frame-scene-seal',
          rawPlayerText: 'Raw player text from aux recall must not persist.'
        }
      },
      {
        id: 'package-recall-layout',
        authority: 'package',
        metadataHash: 'package-recall-layout-hash',
        estimatedTokens: 120,
        preview: 'Raw package preview should not be copied into the trace ref.'
      }
    ],
    omittedRecallRefs: [{
      id: 'stale-recall-source',
      authority: 'committed',
      textHash: 'stale-recall-source-hash',
      omissionReason: 'stale-source',
      rawTranscript: 'Raw stale recall text must not persist.'
    }]
  }),
  installPromptPacket: async () => ({ ok: true }),
  observeExternalPromptEnvironment: async () => ({ host: 'sillytavern', status: 'observed' })
});
automaticRecallLaneScheduler.markDirty({ dirtyDomains: ['factIndex'], idempotencyKey: 'automatic-recall-dirty' });
const automaticRecallFlush = await automaticRecallLaneScheduler.flushVisible({
  transactionId: 'txn-automatic-recall-budget',
  binding: { campaignId: 'campaign-budget-recall' },
  campaignContext: {
    promptBudgetLaneOverrides: {
      recall: {
        budgetTokens: 150,
        reservedFloor: 0
      }
    }
  },
  idempotencyKey: 'automatic-recall-flush'
});
const automaticRecallLane = automaticRecallFlush.promptBudgetTrace.lanes.find((lane) => lane.id === 'recall');
assert.equal(automaticRecallLane.includedRefs[0].id, 'core-recall-scene-seal');
assert.equal(automaticRecallLane.includedRefs[0].hash, 'core-recall-scene-seal-hash');
assert.equal(automaticRecallLane.omittedRefs.some((ref) => ref.id === 'package-recall-layout' && ref.omissionReason === 'budget-exceeded'), true);
assert.equal(automaticRecallLane.omittedRefs.some((ref) => ref.id === 'stale-recall-source' && ref.omissionReason === 'stale-source'), true);
assert.equal(JSON.stringify(automaticRecallFlush).includes('Raw player text from aux recall'), false);
assert.equal(JSON.stringify(automaticRecallFlush).includes('Raw stale recall text'), false);
assert.equal(JSON.stringify(automaticRecallFlush).includes('Raw package preview'), false);

const activeCastContinuityScheduler = createLensPromptScheduler({
  clock: () => '2026-07-02T10:08:00.000Z',
  buildDirectivePromptPacket: async ({ revision, cacheKey }) => ({
    kind: 'directive.playerSafePromptContext',
    revision,
    cacheKey,
    blocks: [{
      id: 'continuity-domain',
      promptKey: 'directive.continuity.domain',
      text: 'Continuity domain block contains rendered private knowledge, but budget refs stay compact.',
      tokenEstimate: 90,
      promptBudgetRefs: [
        {
          id: 'witness.bronn.private-report',
          kind: 'directive.continuityFactRef.v1',
          lensPromptBudgetLane: 'activeCast',
          hash: 'private-bronn-fact-hash',
          estimatedTokens: 30,
          text: 'Raw private continuity fact must not persist.'
        },
        {
          id: 'ship.layout.invariant',
          kind: 'directive.continuityFactRef.v1',
          lensPromptBudgetLane: 'protectedContinuity',
          hash: 'ship-layout-fact-hash',
          estimatedTokens: 40,
          summary: 'Raw protected continuity fact must not persist.'
        }
      ]
    }]
  }),
  installPromptPacket: async () => ({ ok: true }),
  observeExternalPromptEnvironment: async () => ({ host: 'sillytavern', status: 'observed' })
});
activeCastContinuityScheduler.markDirty({ dirtyDomains: ['factIndex'], idempotencyKey: 'active-cast-continuity-dirty' });
const activeCastContinuityFlush = await activeCastContinuityScheduler.flushVisible({
  transactionId: 'txn-active-cast-continuity',
  binding: { campaignId: 'campaign-budget-active-cast' },
  idempotencyKey: 'active-cast-continuity-flush'
});
const activeCastContinuityLane = activeCastContinuityFlush.promptBudgetTrace.lanes.find((lane) => lane.id === 'activeCast');
const protectedContinuityFromFactLane = activeCastContinuityFlush.promptBudgetTrace.lanes.find((lane) => lane.id === 'protectedContinuity');
assert.equal(activeCastContinuityLane.includedRefs.some((ref) => ref.id === 'witness.bronn.private-report'), true);
assert.equal(protectedContinuityFromFactLane.includedRefs.some((ref) => ref.id === 'ship.layout.invariant'), true);
assert.equal(JSON.stringify(activeCastContinuityFlush).includes('Raw private continuity fact'), false);
assert.equal(JSON.stringify(activeCastContinuityFlush).includes('Raw protected continuity fact'), false);

const productionRecallPacket = await buildLensPromptPacket({
  promptInput: {
    campaignState: {
      campaign: { id: 'campaign-budget-recall', title: 'Budget Recall', status: 'active' },
      player: { id: 'player-commander', name: 'Talia Serrin' },
      mission: {},
      commandLog: { entries: [] },
      turnLedger: { entries: [] }
    },
    coreRecallEntries: [{
      id: 'core-aux-recall-production',
      authority: 'committed',
      textHash: 'core-aux-recall-production-hash',
      sourceFrameRef: {
        id: 'frame-production-recall',
        rawPlayerText: 'Raw production recall source must not persist.'
      },
      rawTranscript: 'Raw production recall transcript must not persist.'
    }]
  },
  revision: 91,
  cacheKey: 'production-recall-cache-key'
});
assert.equal(productionRecallPacket.recallRefs[0].id, 'core-aux-recall-production');
assert.equal(productionRecallPacket.recallRefs[0].hash, 'core-aux-recall-production-hash');
assert.equal(JSON.stringify(productionRecallPacket).includes('Raw production recall'), false);

let blockedInstallCount = 0;
const blockingScheduler = createLensPromptScheduler({
  clock: () => '2026-07-02T10:10:00.000Z',
  buildDirectivePromptPacket: async ({ revision, cacheKey }) => ({
    kind: 'directive.playerSafePromptContext',
    revision,
    cacheKey,
    blocks: [
      {
        id: 'protected-a',
        promptKey: 'directive.continuity.invariants',
        text: 'Protected continuity A.',
        tokenEstimate: 70
      },
      {
        id: 'protected-b',
        promptKey: 'directive.continuity.domain',
        text: 'Protected continuity B.',
        tokenEstimate: 70
      }
    ],
    promptBudgetLanes: [{
      id: 'protectedContinuity',
      budgetTokens: 100,
      refs: [
        { id: 'protected-a', hash: 'protected-a-hash', estimatedTokens: 70 },
        { id: 'protected-b', hash: 'protected-b-hash', estimatedTokens: 70 }
      ]
    }]
  }),
  installPromptPacket: async () => {
    blockedInstallCount += 1;
    return { ok: true };
  },
  observeExternalPromptEnvironment: async () => ({ host: 'sillytavern', status: 'observed' })
});
blockingScheduler.markDirty({ dirtyDomains: ['factIndex'], idempotencyKey: 'block-dirty' });
const blockedFlush = await blockingScheduler.flushVisible({
  transactionId: 'txn-block-budget',
  binding: { campaignId: 'campaign-budget-block' },
  idempotencyKey: 'block-flush'
});
assert.equal(blockedFlush.status, 'promptBudgetBlocked');
assert.equal(blockedFlush.promptBudgetEnforcement.status, 'blocked');
assert.deepEqual(blockedFlush.promptBudgetEnforcement.blockingLanes, ['protectedContinuity']);
assert.equal(blockedFlush.promptBudgetTrace.lanes.find((lane) => lane.id === 'protectedContinuity').blocking, true);
assert.equal(blockedInstallCount, 0);

console.log('LENS prompt budget lane contract tests passed.');
