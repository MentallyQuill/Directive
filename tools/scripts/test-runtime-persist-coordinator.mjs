import assert from 'node:assert/strict';

import { createRuntimePersistCoordinator } from '../../src/runtime/runtime-persist-coordinator.mjs';
import { __directiveRuntimeAppTestHooks } from '../../src/runtime/runtime-app.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function nextMicrotask() {
  await Promise.resolve();
  await Promise.resolve();
}

{
  const writes = [];
  const firstWrite = deferred();
  const secondWrite = deferred();
  const coordinator = createRuntimePersistCoordinator({
    persistNow: async (state, summary, options) => {
      writes.push({ state, summary, options });
      if (writes.length === 1) return firstWrite.promise;
      if (writes.length === 2) return secondWrite.promise;
      return { ok: true, write: writes.length };
    },
    mergePendingRequest: (_prior, next) => next
  });

  const firstPersist = coordinator.persist({ revision: 1 }, 'hot-path ingress');
  const secondPersist = coordinator.persist({ revision: 2 }, 'background save');
  const thirdPersist = coordinator.persist({ revision: 3 }, 'newer background save');

  await nextMicrotask();
  assert.equal(writes.length, 1, 'first write should start immediately');

  let firstResolved = false;
  firstPersist.then(() => { firstResolved = true; });
  firstWrite.resolve({ ok: true, write: 1 });
  await nextMicrotask();

  assert.equal(firstResolved, true, 'hot-path persist must resolve after its own write, not after pending saves drain');
  assert.equal(writes.length, 2, 'latest pending write should continue after first promise resolves');
  assert.deepEqual(writes[1].state, { revision: 3 }, 'queued saves should still coalesce to newest state');
  assert.equal(writes[1].options.forceSaveIndexUpdate, false, 'ordinary coalesced hot saves should not force save-index rewrites');

  let secondResolved = false;
  let thirdResolved = false;
  secondPersist.then(() => { secondResolved = true; });
  thirdPersist.then(() => { thirdResolved = true; });
  secondWrite.resolve({ ok: true, write: 2 });
  await nextMicrotask();

  assert.equal(secondResolved, true, 'coalesced pending waiter should resolve when pending write persists');
  assert.equal(thirdResolved, true, 'all coalesced pending waiters should resolve together');
}

{
  const writes = [];
  const firstWrite = deferred();
  const secondWrite = deferred();
  const coordinator = createRuntimePersistCoordinator({
    persistNow: async (state, summary, options) => {
      writes.push({ state, summary, options });
      if (writes.length === 1) return firstWrite.promise;
      if (writes.length === 2) return secondWrite.promise;
      return { ok: true, write: writes.length };
    },
    mergePendingRequest: (_prior, next) => next
  });

  const firstPersist = coordinator.persist({ revision: 1 }, 'first write');
  const indexedPendingPersist = coordinator.persist({ revision: 2 }, 'admin metadata save', { forceSaveIndexUpdate: true });
  const newerPendingPersist = coordinator.persist({ revision: 3 }, 'newer background save');

  await nextMicrotask();
  firstWrite.resolve({ ok: true, write: 1 });
  await firstPersist;
  await nextMicrotask();

  assert.equal(writes.length, 2, 'coalesced force-index write should continue after first write');
  assert.deepEqual(writes[1].state, { revision: 3 }, 'latest state should still win when force-index pending write coalesces');
  assert.equal(writes[1].options.forceSaveIndexUpdate, true, 'force-index metadata intent must survive pending-write coalescing');

  secondWrite.resolve({ ok: true, write: 2 });
  await indexedPendingPersist;
  await newerPendingPersist;
}

{
  const writes = [];
  const firstWrite = deferred();
  const secondWrite = deferred();
  const coordinator = createRuntimePersistCoordinator({
    persistNow: async (state, summary) => {
      writes.push({ state, summary });
      if (writes.length === 1) return firstWrite.promise;
      if (writes.length === 2) return secondWrite.promise;
      return { ok: true, write: writes.length };
    },
    mergePendingRequest: (_prior, next) => next
  });

  const firstPersist = coordinator.persist({ revision: 1 }, 'first write');
  const pendingPersist = coordinator.persist({ revision: 2 }, 'pending write');

  await nextMicrotask();
  firstWrite.resolve({ ok: true, write: 1 });
  await firstPersist;
  await nextMicrotask();

  const pendingFailure = new Error('pending persist failed');
  secondWrite.reject(pendingFailure);
  await assert.rejects(
    pendingPersist,
    /pending persist failed/,
    'pending waiter should reject when coalesced pending write fails'
  );
  await coordinator.settle();

  const recovered = await coordinator.persist({ revision: 3 }, 'recovered write');
  assert.deepEqual(recovered, { ok: true, write: 3 }, 'coordinator should accept later writes after pending failure');
  assert.deepEqual(writes.map((write) => write.state.revision), [1, 2, 3]);
}

{
  const { mergeRuntimePersistPendingRequest } = __directiveRuntimeAppTestHooks;
  const prior = {
    state: {
      campaign: { id: 'campaign-merge' },
      campaignChatBinding: { chatId: 'chat-merge', saveId: 'save-merge', promptContextRevision: 7 },
      commandLog: { entries: [{ id: 'log-1' }, { id: 'log-2' }] },
      runtimeResume: { sidecarCount: 5 },
      runtimeTracking: {
        revision: 12,
        mechanicsRevision: 9,
        ingressLedger: [{ id: 'old-ingress-raw-copy-forbidden' }],
        responseLedger: [{ id: 'old-response-raw-copy-forbidden' }],
        recoveryJournal: [{ id: 'old-recovery-raw-copy-forbidden' }],
        pendingInteractions: [
          {
            id: 'pending-normal',
            kind: 'missionComponentReview',
            status: 'pending',
            authority: 'corePendingInteractionProjection',
            compatibilityMirror: { kind: 'directive.pendingInteractionCompatibilityMirror.v1' },
            coreProjection: { kind: 'directive.corePendingInteractionProjectionRef.v1', status: 'pending' }
          },
          {
            id: 'pending-terminal',
            kind: 'terminalOutcomeDecision',
            status: 'pending',
            authority: 'terminalDecisionProjection',
            compatibilityMirror: { kind: 'directive.pendingInteractionCompatibilityMirror.v1' },
            coreProjection: { kind: 'directive.terminalPendingInteractionProjectionRef.v1', status: 'pending' }
          }
        ]
      },
      directiveRuntimeEvidence: {
        coreStoreReadProjections: {
          kind: 'directive.coreStoreReadProjections.v1',
          runtimeAuthority: 'coreStoreV2',
          pendingInteractions: [
            {
              id: 'pending-normal',
              kind: 'missionComponentReview',
              status: 'pending',
              authority: 'corePendingInteractionProjection',
              compatibilityMirror: { kind: 'directive.pendingInteractionCompatibilityMirror.v1' },
              coreProjection: { kind: 'directive.corePendingInteractionProjectionRef.v1', status: 'pending' }
            },
            {
              id: 'pending-terminal',
              kind: 'terminalOutcomeDecision',
              status: 'pending',
              authority: 'terminalDecisionProjection',
              compatibilityMirror: { kind: 'directive.pendingInteractionCompatibilityMirror.v1' },
              coreProjection: { kind: 'directive.terminalPendingInteractionProjectionRef.v1', status: 'pending' }
            }
          ],
          ingressLedger: [
            { id: 'core-ingress-prior', hostMessageId: '1' },
            {
              id: 'core-ingress-shared',
              hostMessageId: '3',
              transactionId: 'txn-shared-rich',
              sourceFrameId: 'frame-shared-rich',
              textHash: 'hash-rich'
            }
          ]
        }
      }
    },
    summary: 'prior'
  };
  const next = {
    state: {
      campaign: { id: 'campaign-merge' },
      campaignChatBinding: { chatId: 'chat-merge', saveId: 'save-merge', promptContextRevision: 3 },
      commandLog: { entries: [{ id: 'log-1' }] },
      runtimeResume: { sidecarCount: 2 },
      runtimeTracking: {
        revision: 10,
        mechanicsRevision: 8,
        pendingInteractions: []
      },
      directiveRuntimeEvidence: {
        coreStoreReadProjections: {
          kind: 'directive.coreStoreReadProjections.v1',
          responseLedgerRevision: 4,
          ingressLedger: [
            {
              id: 'core-ingress-shared',
              hostMessageId: '3',
              status: 'classified'
            }
          ],
          responseLedger: [{ id: 'core-response-next', hostMessageId: '2' }]
        }
      }
    },
    summary: 'next'
  };

  const merged = mergeRuntimePersistPendingRequest(prior, next, {
    chatId: 'chat-merge',
    fallbackSaveId: 'save-merge'
  });

  assert.equal(merged.summary, 'next', 'latest persist summary should win');
  assert.equal(merged.state.runtimeTracking.revision, 12, 'fresher prior runtime revision should survive coalescing');
  assert.equal(merged.state.runtimeTracking.mechanicsRevision, 9, 'fresher prior mechanics revision should survive coalescing');
  assert.equal(merged.state.campaignChatBinding.promptContextRevision, 7, 'fresher prompt revision should survive coalescing');
  assert.deepEqual(merged.state.commandLog.entries.map((entry) => entry.id), ['log-1', 'log-2']);
  assert.equal(merged.state.runtimeResume.sidecarCount, 5, 'fresher compact sidecar cursor should survive coalescing');
  assert.deepEqual(
    merged.state.runtimeTracking.pendingInteractions.map((entry) => entry.id),
    [],
    'runtime persist merge must keep old runtimeTracking.pendingInteractions empty'
  );
  assert.deepEqual(
    merged.state.directiveRuntimeEvidence.coreStoreReadProjections.pendingInteractions.map((entry) => entry.id),
    ['pending-normal'],
    'runtime persist merge should retain only mergeable non-terminal pending interactions under CORE read projections'
  );
  assert.equal(JSON.stringify(merged.state.runtimeTracking).includes('old-ingress-raw-copy-forbidden'), false);
  assert.equal(JSON.stringify(merged.state.runtimeTracking).includes('old-response-raw-copy-forbidden'), false);
  assert.equal(JSON.stringify(merged.state.runtimeTracking).includes('old-recovery-raw-copy-forbidden'), false);
  assert.deepEqual(
    merged.state.directiveRuntimeEvidence.coreStoreReadProjections.ingressLedger.map((entry) => entry.id),
    ['core-ingress-prior', 'core-ingress-shared']
  );
  const sharedIngress = merged.state.directiveRuntimeEvidence.coreStoreReadProjections.ingressLedger
    .find((entry) => entry.id === 'core-ingress-shared');
  assert.equal(sharedIngress.status, 'classified', 'same-key newer projection status should win');
  assert.equal(sharedIngress.transactionId, 'txn-shared-rich', 'same-key leaner newer projection must not drop richer prior transaction evidence');
  assert.equal(sharedIngress.sourceFrameId, 'frame-shared-rich', 'same-key leaner newer projection must not drop richer prior source-frame evidence');
  assert.equal(sharedIngress.textHash, 'hash-rich', 'same-key leaner newer projection must not drop richer prior hash evidence');
  assert.deepEqual(
    merged.state.directiveRuntimeEvidence.coreStoreReadProjections.responseLedger.map((entry) => entry.id),
    ['core-response-next']
  );
  assert.equal(merged.state.directiveRuntimeEvidence.coreStoreReadProjections.responseLedgerRevision, 4);
}

console.log('Runtime persist coordinator tests passed.');
