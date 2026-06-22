import assert from 'node:assert/strict';

import { createHostCapabilities, normalizeDirectiveHost } from '../../src/hosts/host-contract.mjs';
import { createFakeEventAdapter, createFakeJsonStorage, createFakeUiAdapter } from '../../src/hosts/fake/fake-host.mjs';
import {
  buildCommandLogSummarySidecarJob,
  runCommandLogSummarySidecar
} from '../../src/jobs/command-log-summary-sidecar.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createCampaignState() {
  return {
    campaign: {
      id: 'campaign-summary-test',
      title: 'Ashes of Peace',
      currentStardate: 53049.4
    },
    settings: {
      simulationMode: 'Command'
    },
    mission: {
      activeMissionId: 'chapter-1-the-empty-convoy',
      activeMissionGraphId: 'chapter-1-the-empty-convoy',
      activePhaseId: 'hesperus-aftermath'
    },
    commandLog: {
      summariesGeneratedFromCommittedStateOnly: true,
      entries: [
        {
          sourceOutcomeId: 'outcome.summary.001',
          summaryInputs: [
            'The Breckenridge accepted a modest delay to protect the Hesperus passengers.',
            'The falsified inspection record was preserved for formal follow-up.'
          ],
          visibleConsequences: [
            'Inspection fraud preserved for formal follow-up.',
            'Resolve progression earned.'
          ]
        }
      ]
    },
    turnLedger: {
      entries: [
        {
          turnId: 'turn.summary.001',
          outcomeId: 'outcome.summary.001'
        }
      ],
      swipeRerollForbidden: true
    }
  };
}

const turnPacket = {
  turnId: 'turn.summary.001',
  outcomePacket: {
    id: 'outcome.summary.001',
    resultBand: 'Partial Success',
    summary: 'The player protected civilians and preserved evidence at the cost of schedule margin.'
  },
  commandLogPacket: {
    sourceOutcomeId: 'outcome.summary.001',
    summaryInputs: [
      'The Breckenridge accepted a modest delay to protect the Hesperus passengers.'
    ],
    visibleConsequences: [
      'Inspection fraud preserved for formal follow-up.'
    ]
  }
};

function createHost({ id, batchConcurrent, generateImpl }) {
  const calls = [];
  const host = normalizeDirectiveHost({
    id,
    displayName: id === 'lumiverse' ? 'Lumiverse' : 'SillyTavern',
    capabilities: createHostCapabilities({
      storage: {
        json: true
      },
      generation: {
        quiet: true,
        batch: batchConcurrent,
        batchConcurrent,
        structuredOutput: true
      }
    }),
    storage: createFakeJsonStorage(),
    events: createFakeEventAdapter(),
    ui: createFakeUiAdapter(),
    generation: {
      async generate(roleId, request) {
        calls.push({
          mode: 'generate',
          roleId,
          request: cloneJson(request)
        });
        return generateImpl(roleId, request);
      },
      async batch(requests, options) {
        calls.push({
          mode: 'batch',
          requests: cloneJson(requests),
          options: cloneJson(options)
        });
        return Promise.all(requests.map((request) => generateImpl(request.roleId, request)));
      }
    }
  });
  return {
    host,
    calls
  };
}

const job = buildCommandLogSummarySidecarJob({
  hostId: 'sillytavern',
  campaignState: createCampaignState(),
  turnPacket,
  saveId: 'save-summary-test',
  revision: 1
});
assert.equal(job.type, 'commandLogSummary');
assert.equal(job.roleId, 'commandLogSummarizer');
assert.equal(job.policy.timeoutMs, 8000);
assert.equal(job.request.parameters.max_tokens, 220);
assert.equal(job.request.modelPreferences.cost, 'low');
assert.equal(job.request.modelPreferences.latency, 'fast');
assert.equal(JSON.stringify(job.request).includes('stateDelta'), false);
assert.equal(JSON.stringify(job.request).includes('hiddenStateRefs'), false);

const sillytavern = createHost({
  id: 'sillytavern',
  batchConcurrent: false,
  generateImpl(roleId) {
    return {
      providerId: 'sillytavern-current-provider',
      model: 'current-chat-utility',
      text: JSON.stringify({
        sourceOutcomeId: 'outcome.summary.001',
        title: 'Hesperus protected',
        summary: 'The Breckenridge protected the Hesperus passengers while preserving the falsified record for formal review.',
        highlights: [
          'Civilian safety took priority.',
          'Evidence remains available for follow-up.'
        ]
      }),
      roleId
    };
  }
});
const sillyResult = await runCommandLogSummarySidecar({
  host: sillytavern.host,
  campaignState: createCampaignState(),
  turnPacket,
  saveId: 'save-summary-test',
  revision: 1,
  now: () => '2026-06-19T18:00:00.000Z'
});
assert.equal(sillyResult.batchResult.strategy, 'sequential');
assert.equal(sillyResult.applied, true);
assert.equal(sillyResult.featureOk, true);
assert.equal(sillyResult.ok, true);
assert.equal(sillyResult.campaignState.commandLog.entries[0].assistedSummary.status, 'complete');
assert.equal(
  sillyResult.campaignState.commandLog.entries[0].assistedSummary.summary,
  'The Breckenridge protected the Hesperus passengers while preserving the falsified record for formal review.'
);
assert.equal(sillytavern.calls[0].mode, 'generate');
assert.equal(sillytavern.calls[0].roleId, 'commandLogSummarizer');

const lumiverse = createHost({
  id: 'lumiverse',
  batchConcurrent: true,
  generateImpl(roleId) {
    return {
      providerId: 'lumiverse-spindle',
      model: 'low-cost-utility',
      packet: {
        sourceOutcomeId: 'outcome.summary.001',
        title: 'Evidence preserved',
        summary: 'The command choice kept passengers safe and left the inspection fraud ready for official follow-up.'
      },
      roleId
    };
  }
});
const lumiverseResult = await runCommandLogSummarySidecar({
  host: lumiverse.host,
  campaignState: createCampaignState(),
  turnPacket,
  saveId: 'save-summary-test',
  revision: 1
});
assert.equal(lumiverseResult.batchResult.strategy, 'concurrent');
assert.equal(lumiverseResult.featureOk, true);
assert.equal(lumiverseResult.campaignState.commandLog.entries[0].assistedSummary.providerId, 'lumiverse-spindle');
assert.equal(lumiverse.calls[0].mode, 'batch');
assert.equal(lumiverse.calls[0].requests[0].roleId, 'commandLogSummarizer');

const failing = createHost({
  id: 'sillytavern',
  batchConcurrent: false,
  generateImpl() {
    throw Object.assign(new Error('summary provider offline'), {
      code: 'SUMMARY_PROVIDER_OFFLINE'
    });
  }
});
const failedResult = await runCommandLogSummarySidecar({
  host: failing.host,
  campaignState: createCampaignState(),
  turnPacket
});
assert.equal(failedResult.applied, true);
assert.equal(failedResult.featureOk, false);
assert.equal(failedResult.ok, false);
assert.equal(failedResult.diagnosticPersisted, true);
assert.equal(failedResult.campaignState.commandLog.entries[0].assistedSummary.status, 'failed');
assert.equal(failedResult.campaignState.commandLog.entries[0].assistedSummary.error.code, 'SUMMARY_PROVIDER_OFFLINE');

const invalidJson = createHost({
  id: 'sillytavern',
  batchConcurrent: false,
  generateImpl() {
    return {
      providerId: 'sillytavern-current-provider',
      model: 'current-chat-utility',
      text: 'summary without json'
    };
  }
});
const invalidJsonResult = await runCommandLogSummarySidecar({
  host: invalidJson.host,
  campaignState: createCampaignState(),
  turnPacket
});
assert.equal(invalidJsonResult.applied, true);
assert.equal(invalidJsonResult.featureOk, false);
assert.equal(invalidJsonResult.ok, false);
assert.equal(invalidJsonResult.campaignState.commandLog.entries[0].assistedSummary.status, 'failed');
assert.equal(invalidJsonResult.campaignState.commandLog.entries[0].assistedSummary.error.code, 'DIRECTIVE_SIDECAR_JSON_INVALID');
assert.equal(invalidJsonResult.campaignState.commandLog.entries[0].assistedSummary.diagnostics.output.parse.ok, false);

console.log('Command Log summary sidecar tests passed: low-cost request, SillyTavern sequential path, Lumiverse batch path, and fail-soft update');
