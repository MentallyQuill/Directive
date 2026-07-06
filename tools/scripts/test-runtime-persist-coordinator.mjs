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
  const {
    activeSessionCacheCurrentForSave,
    mergeFresherResponseLedgerProjection,
    promptPacketFromLensFlushResult,
    shouldPreferInMemoryCampaignState,
    stateFreshnessCounters
  } = __directiveRuntimeAppTestHooks;
  const cachedState = {
    campaign: { id: 'campaign-cache-freshness' },
    campaignChatBinding: {
      chatId: 'chat-cache-freshness',
      saveId: 'save-cache-freshness',
      campaignId: 'campaign-cache-freshness',
      status: 'bound'
    },
    directiveRuntimeEvidence: {
      loadedSaveHead: {
        saveUpdatedAt: '2026-07-05T13:26:30.000Z',
        headHash: 'old-head'
      }
    }
  };
  assert.equal(
    activeSessionCacheCurrentForSave(cachedState, {
      saveId: 'save-cache-freshness',
      activeSaveId: 'save-cache-freshness',
      saveRecord: {
        id: 'save-cache-freshness',
        updatedAt: '2026-07-05T13:27:11.000Z',
        manifestRef: { hash: 'new-head' }
      }
    }),
    false,
    'active save cache must reload when save index record is newer than loaded head evidence'
  );
  assert.equal(
    activeSessionCacheCurrentForSave(cachedState, {
      saveId: 'save-cache-freshness',
      activeSaveId: 'save-cache-freshness',
      saveRecord: {
        id: 'save-cache-freshness',
        updatedAt: '2026-07-05T13:26:30.000Z',
        manifestRef: { hash: 'old-head' }
      }
    }),
    true,
    'active save cache may be reused when loaded head evidence matches save index freshness'
  );
  assert.deepEqual(
    promptPacketFromLensFlushResult({
      status: 'reused',
      installed: {
        directiveOwnedRevision: 7,
        promptHash: 'prompt-hash-7',
        promptKeys: ['directive.activeScene', 'directive.mission']
      }
    })?.blocks.map((block) => block.promptKey),
    ['directive.activeScene', 'directive.mission'],
    'Runtime must record LENS installed revision evidence even when flush reuses an installed packet without returning packet text'
  );

  const base = {
    campaign: { id: 'campaign-sre-stale-persist' },
    campaignChatBinding: {
      hostId: 'fake',
      chatId: 'chat-sre-stale-persist',
      saveId: 'save-sre-stale-persist',
      campaignId: 'campaign-sre-stale-persist'
    },
    runtimeTracking: { revision: 2, mechanicsRevision: 0 },
    sceneHandshake: {
      schemaVersion: 1,
      settled: [],
      pendingInternalReview: [],
      deferred: [],
      operatorRecovery: [],
      rejected: [],
      lastResult: null
    },
    mission: { openAssignments: [] },
    ship: { technicalDebt: [] },
    threadLedger: { records: [] },
    commandLog: { entries: [] }
  };
  const candidateWithSreRoots = {
    ...JSON.parse(JSON.stringify(base)),
    campaignChatBinding: {
      ...JSON.parse(JSON.stringify(base.campaignChatBinding)),
      promptContextRevision: 3,
      promptContextHash: 'prompt-hash-rich'
    },
    directiveRuntimeEvidence: {
      lensPromptRevisionRecord: {
        kind: 'directive.lensPromptRevisionRecord.v1',
        status: 'active',
        revision: 3,
        hash: 'prompt-hash-rich',
        packetHash: 'prompt-hash-rich',
        blockCount: 2,
        recordHash: 'lens-record-rich'
      }
    },
    sceneHandshake: {
      ...JSON.parse(JSON.stringify(base.sceneHandshake)),
      settled: [{ id: 'settlement-rich', status: 'settled' }],
      lastResult: { id: 'settlement-rich', status: 'settled' }
    },
    mission: { openAssignments: [{ id: 'assignment-rich' }] },
    ship: { technicalDebt: [{ id: 'ship-rich' }] },
    threadLedger: { records: [{ id: 'thread-rich' }] }
  };
  const staleInMemoryWithResponseOnly = {
    ...JSON.parse(JSON.stringify(base)),
    directiveRuntimeEvidence: {
      coreStoreReadProjections: {
        kind: 'directive.coreStoreReadProjections.v1',
        runtimeAuthority: 'coreStoreV2',
        responses: [{
          id: 'response-rich',
          responseId: 'response-rich',
          hostMessageId: '3',
          status: 'posted',
          authority: 'compatibilityProjection',
          projectionSource: 'coreStoreV2',
          compatibilityMirror: { kind: 'directive.coreResponseCompatibilityMirror.v1' }
        }],
        responseLedgerRevision: 1
      }
    }
  };
  const candidateCounters = stateFreshnessCounters(candidateWithSreRoots);
  assert.equal(candidateCounters.sceneHandshakeSettlements, 1);
  assert.equal(candidateCounters.missionOpenAssignments, 1);
  assert.equal(candidateCounters.shipTechnicalDebt, 1);
  assert.equal(candidateCounters.threadLedgerRecords, 1);
  assert.equal(
    shouldPreferInMemoryCampaignState(candidateWithSreRoots, staleInMemoryWithResponseOnly, {
      chatId: 'chat-sre-stale-persist',
      fallbackHostId: 'fake',
      fallbackSaveId: 'save-sre-stale-persist'
    }),
    false,
    'response-only in-memory projections must not publish stale roots over SRE-applied scene roots'
  );

  const staleInMemoryWithTurnProjection = {
    ...JSON.parse(JSON.stringify(staleInMemoryWithResponseOnly)),
    directiveRuntimeEvidence: {
      coreStoreReadProjections: {
        ...JSON.parse(JSON.stringify(staleInMemoryWithResponseOnly.directiveRuntimeEvidence.coreStoreReadProjections)),
        turnLedger: {
          entries: [{ id: 'turn-stale-response-completion' }]
        }
      }
    }
  };
  assert.equal(
    shouldPreferInMemoryCampaignState(candidateWithSreRoots, staleInMemoryWithTurnProjection, {
      chatId: 'chat-sre-stale-persist',
      fallbackHostId: 'fake',
      fallbackSaveId: 'save-sre-stale-persist'
    }),
    false,
    'response completion with a CORE turn projection must not publish stale roots over SRE-applied scene roots'
  );

  const candidateWithCoreAuthority = {
    ...JSON.parse(JSON.stringify(base)),
    directiveRuntimeEvidence: {
      coreStoreReadProjections: {
        kind: 'directive.coreStoreReadProjections.v1',
        runtimeAuthority: 'coreStoreV2',
        turnLedger: {
          runtimeAuthority: 'coreStoreV2',
          entries: []
        }
      }
    }
  };
  const staleInMemoryWithOldRevisionOnly = {
    ...JSON.parse(JSON.stringify(candidateWithCoreAuthority)),
    runtimeTracking: {
      revision: 99,
      mechanicsRevision: 99
    }
  };
  assert.equal(
    shouldPreferInMemoryCampaignState(candidateWithCoreAuthority, staleInMemoryWithOldRevisionOnly, {
      chatId: 'chat-sre-stale-persist',
      fallbackHostId: 'fake',
      fallbackSaveId: 'save-sre-stale-persist'
    }),
    false,
    'CORE/v2 freshness must not let stale old runtimeTracking revision counters override authoritative projections'
  );

  const staleCandidateWithResponseProjection = {
    ...JSON.parse(JSON.stringify(base)),
    directiveRuntimeEvidence: {
      coreStoreReadProjections: {
        kind: 'directive.coreStoreReadProjections.v1',
        runtimeAuthority: 'coreStoreV2',
        responses: [{
          id: 'response-rich',
          responseId: 'response-rich',
          transactionId: 'txn-rich',
          status: 'posted',
          authority: 'compatibilityProjection',
          projectionSource: 'coreStoreV2'
        }],
        responseLedgerRevision: 2
      }
    }
  };
  const mergedSreAndResponse = mergeFresherResponseLedgerProjection(
    staleCandidateWithResponseProjection,
    candidateWithSreRoots
  );
  assert.equal(mergedSreAndResponse.sceneHandshake.settled.length, 1, 'CORE response preservation must not drop fresher SRE sceneHandshake root.');
  assert.equal(mergedSreAndResponse.sceneHandshake.lastResult.id, 'settlement-rich');
  assert.equal(mergedSreAndResponse.mission.openAssignments.length, 1);
  assert.equal(mergedSreAndResponse.ship.technicalDebt.length, 1);
  assert.equal(mergedSreAndResponse.threadLedger.records.length, 1);
  assert.equal(mergedSreAndResponse.campaignChatBinding.promptContextRevision, 3, 'SRE source-root preservation must not drop the LENS prompt revision created for those roots.');
  assert.equal(mergedSreAndResponse.campaignChatBinding.promptContextHash, 'prompt-hash-rich');
  assert.equal(mergedSreAndResponse.runtimeTracking.promptContext, undefined, 'SRE source-root preservation must not revive old runtimeTracking.promptContext authority.');
  assert.equal(mergedSreAndResponse.directiveRuntimeEvidence.lensPromptRevisionRecord.revision, 3);
  assert.equal(mergedSreAndResponse.directiveRuntimeEvidence.coreStoreReadProjections.responses.length, 1);
  assert.equal(mergedSreAndResponse.directiveRuntimeEvidence.coreStoreReadProjections.responseLedger, undefined);
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
          responses: [{ id: 'core-response-next', hostMessageId: '2' }]
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
  assert.equal(merged.state.runtimeTracking.revision, 10, 'pending persist coalescing must keep next CORE/v2 runtime revision authority');
  assert.equal(merged.state.runtimeTracking.mechanicsRevision, 8, 'pending persist coalescing must keep next CORE/v2 mechanics revision authority');
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
    merged.state.directiveRuntimeEvidence.coreStoreReadProjections.responses.map((entry) => entry.id),
    ['core-response-next']
  );
  assert.equal(merged.state.directiveRuntimeEvidence.coreStoreReadProjections.responseLedgerRevision, 4);
}

{
  const { mergeRuntimePersistPendingRequest } = __directiveRuntimeAppTestHooks;
  const prior = {
    summary: 'prior stale old revisions',
    state: {
      campaign: { id: 'campaign-core-revision' },
      campaignChatBinding: { chatId: 'chat-core-revision', saveId: 'save-core-revision' },
      runtimeTracking: {
        revision: 12,
        mechanicsRevision: 9
      }
    }
  };
  const next = {
    summary: 'next authoritative core',
    state: {
      campaign: { id: 'campaign-core-revision' },
      campaignChatBinding: { chatId: 'chat-core-revision', saveId: 'save-core-revision' },
      runtimeTracking: {
        revision: 10,
        mechanicsRevision: 8
      },
      directiveRuntimeEvidence: {
        coreStoreReadProjections: {
          kind: 'directive.coreStoreReadProjections.v1',
          runtimeAuthority: 'coreStoreV2',
          turnLedger: {
            runtimeAuthority: 'coreStoreV2',
            entries: []
          }
        }
      }
    }
  };
  const merged = mergeRuntimePersistPendingRequest(prior, next, {
    chatId: 'chat-core-revision',
    fallbackSaveId: 'save-core-revision'
  });
  assert.equal(merged.state.runtimeTracking.revision, 10, 'CORE/v2 pending merge must not copy stale prior runtime revision authority');
  assert.equal(merged.state.runtimeTracking.mechanicsRevision, 8, 'CORE/v2 pending merge must not copy stale prior mechanics revision authority');
}

console.log('Runtime persist coordinator tests passed.');
