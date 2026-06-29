import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  externalContextFixtureDepthCheckStatus
} from './lib/sillytavern-live-harness.mjs';

import {
  CONTINUITY_MATRIX_REQUIRED_PROMPT_KEYS,
  CONTINUITY_MATRIX_REQUIRED_SOURCE_IDS,
  buildReport,
  buildContinuityMatrixLanes,
  coordinatorReadinessUsers,
  summarizeExternalContextProbe,
  summarizeExternalContextGenerationArtifacts,
  summarizeExternalContextPromptArtifact,
  summarizeContinuityMatrixLane,
  summarizeFactualGroundingArtifacts,
  summarizeGenerationTimingCoreProof,
  summarizeLaneArtifactCompleteness,
  summarizePromptInspectionArtifact,
  readinessCommandArgs,
  summarizeReadiness,
  summarizeReusableContinuityMatrixLane
} from './run-continuity-matrix-five-user-soak.mjs';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, String(value), 'utf8');
}

function makeArtifactRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'directive-cpm-five-user-'));
}

function timingCheck({
  status = 'pass',
  proof = null,
  summary = 'Delegated smoke proved generation-start timing for 1 turn(s); max latency 4200 ms.'
} = {}) {
  return {
    id: 'live-generation-start-timing',
    status,
    summary,
    details: {
      proof: proof || {
        status: 'pass',
        source: 'coreStoreTurnTiming',
        timingSource: 'coreProjection',
        checkedTurnCount: 1,
        skippedTurnCount: 1,
        maxGenerationStartLatencyMs: 4200,
        routes: ['directivePosted'],
        entries: [
          {
            route: 'directivePosted',
            responseKind: 'committedOutcome',
            timingStatus: 'pass',
            turnLatency: {
              generationStartLatencyMs: 4200,
              architectureWithin60s: true
            }
          }
        ],
        skippedEntries: [
          {
            route: 'directivePosted',
            responseKind: 'clarificationNeeded',
            timingStatus: 'skipped-non-generation'
          }
        ]
      }
    }
  };
}

function promptInspectionFixture({
  revision = 12,
  hash = 'prompt-hash',
  refHash = 'a'.repeat(64),
  knownExternalPromptKeys = ['summaryception', '3_vectfox', 'worldInfoBefore'],
  finalHostPromptMayIncludeExternal = true,
  externalPromptEnvironmentTargets = {
    stLorebooks: {
      active: true,
      enabled: true,
      promptPositions: ['before']
    },
    memoryBooks: {
      active: true,
      enabled: true,
      entryCount: 4
    },
    summaryception: {
      enabled: true,
      promptKeyActive: true,
      layerCount: 1,
      ghostedCount: 2
    },
    vectFox: {
      enabled: true,
      generationInterceptorActive: true,
      promptKeys: ['3_vectfox']
    }
  }
} = {}) {
  return {
    promptInspection: {
      status: 'active',
      revision,
      hash,
      externalPromptEnvironmentRef: {
        kind: 'directive.externalPromptEnvironmentRef.v1',
        schemaVersion: 1,
        hash: refHash,
        byteLength: 512,
        status: 'observed',
        observedAt: '2026-06-28T22:10:00.000Z',
        knownExternalPromptKeys
      },
      finalHostPromptMayIncludeExternal,
      externalPromptEnvironmentTargets,
      redactions: [{ key: 'qdrant_api_key', reason: 'secret' }],
      blocks: [
        {
          id: 'continuity-contract',
          promptKey: 'directive.contract',
          sourceIds: []
        },
        {
          id: 'continuity-invariants',
          promptKey: 'directive.continuity.invariants',
          sourceIds: [
            'crew.hadrik-bronn.species',
            'ship.uss-breckenridge.travel.not-six-days-impulse'
          ]
        },
        {
          id: 'continuity-scene-active',
          promptKey: 'directive.scene.active',
          sourceIds: []
        },
        {
          id: 'continuity-domain',
          promptKey: 'directive.continuity.domain',
          sourceIds: ['crew.hadrik-bronn.age-description']
        },
        {
          id: 'continuity-recap-committed',
          promptKey: 'directive.recap.committed',
          sourceIds: []
        },
        {
          id: 'continuity-revolving-context',
          promptKey: 'directive.context.revolving',
          sourceIds: []
        }
      ]
    }
  };
}

function writePromptInspectionArtifact(root, {
  reason = 'pre-generation',
  scriptMessageId = 'soak-turn-01',
  scriptCategory = 'factual-director',
  chatLength = 2,
  promptInspection = promptInspectionFixture()
} = {}) {
  const fileName = reason === 'run-end'
    ? 'run-end.json'
    : `${reason}-${scriptMessageId}-${String(chatLength).padStart(4, '0')}.json`
      .replace(/[^a-zA-Z0-9._-]+/g, '-');
  writeJson(path.join(root, 'prompt-inspection', fileName), {
    kind: 'directive.sillytavern.promptInspectionSnapshot',
    schemaVersion: 1,
    capturedAt: '2026-06-28T22:10:00.000Z',
    reason,
    scriptMessageId: reason === 'run-end' ? null : scriptMessageId,
    scriptLabel: reason === 'run-end' ? null : `Turn ${scriptMessageId}`,
    scriptCategory: reason === 'run-end' ? null : scriptCategory,
    currentChatId: 'ashes-chat',
    chatLength,
    ...promptInspection
  });
}

function writePassingLaneArtifacts(root, {
  turnLimit = null,
  includeTiming = true,
  timingProof = null,
  promptCaptureCount = 1,
  includePreGenerationPromptCaptures = true
} = {}) {
  writeText(path.join(root, 'summary.md'), '# Lane Summary\n');
  writeText(path.join(root, 'live-log.jsonl'), `${JSON.stringify({ kind: 'run-end', status: 'pass' })}\n`);
  writeText(path.join(root, 'transcript', 'readable-chat.md'), '# Transcript\n\nBronn is Tellarite.\n');
  writeJson(path.join(root, 'fact-checks', 'canary-index.json'), {
    kind: 'directive.liveCampaignSoak.factualCanaryIndex',
    canaryCount: 2
  });
  writeJson(path.join(root, 'report.json'), {
    status: 'pass',
    runId: 'lane-run',
    mode: 'live',
    checks: [
      { id: 'live-factual-grounding-transcript-audit', status: 'pass', summary: 'ok' },
      { id: 'served-extension-freshness', status: 'pass', summary: 'ok' },
      ...(includeTiming ? [timingCheck({ proof: timingProof })] : []),
      {
        id: 'live-execution-turn-limit',
        status: turnLimit ? 'warning' : 'pass',
        summary: turnLimit ? `limited to ${turnLimit}` : 'full run',
        details: { turnLimit, fullTurnCount: 52 }
      }
    ],
    warnings: [],
    failures: []
  });
  if (includePreGenerationPromptCaptures) {
    for (let turn = 1; turn <= promptCaptureCount; turn += 1) {
      writePromptInspectionArtifact(root, {
        reason: 'pre-generation',
        scriptMessageId: `soak-turn-${String(turn).padStart(2, '0')}`,
        chatLength: turn + 1,
        promptInspection: promptInspectionFixture({
          revision: 11 + turn,
          hash: `prompt-hash-${turn}`,
          refHash: `${String(turn % 10).repeat(64)}`
        })
      });
    }
  }
  writePromptInspectionArtifact(root, {
    reason: 'run-end',
    scriptMessageId: 'campaign',
    chatLength: promptCaptureCount + 2,
    promptInspection: promptInspectionFixture({
      revision: 99,
      hash: 'run-end-prompt-hash',
      refHash: 'a'.repeat(64)
    })
  });
  writeJson(path.join(root, 'fact-checks', 'soak-turn-01', 'fact-check.json'), {
    status: 'pass',
    counts: {
      respected: 2,
      omitted: 0,
      unsupportedDetail: 0,
      contradicted: 0,
      promptAvailable: 3
    },
    results: []
  });
  writeJson(path.join(root, 'fact-checks', 'transcript-level', 'fact-check.json'), {
    status: 'pass',
    counts: {
      respected: 4,
      omitted: 0,
      unsupportedDetail: 0,
      contradicted: 0,
      promptAvailable: 3
    },
    results: []
  });
}

assert.equal(CONTINUITY_MATRIX_REQUIRED_PROMPT_KEYS.includes('directive.continuity.invariants'), true);
assert.equal(CONTINUITY_MATRIX_REQUIRED_SOURCE_IDS.includes('crew.hadrik-bronn.species'), true);
assert.equal(CONTINUITY_MATRIX_REQUIRED_SOURCE_IDS.includes('ship.uss-breckenridge.travel.not-six-days-impulse'), true);

const lanes = buildContinuityMatrixLanes({
  users: [
    { handle: 'directive-soak-a', password: 'a' },
    { handle: 'directive-soak-b', password: 'b' },
    { handle: 'directive-soak-c', password: 'c' },
    { handle: 'directive-soak-d', password: 'd' },
    { handle: 'directive-soak-e', password: 'e' }
  ]
});
const configuredSoakUsers = [
  { handle: 'directive-soak-a', password: 'a' },
  { handle: 'directive-soak-b', password: 'b' },
  { handle: 'directive-soak-c', password: 'c' },
  { handle: 'directive-soak-d', password: 'd' },
  { handle: 'directive-soak-e', password: 'e' }
];
const focusedLanes = buildContinuityMatrixLanes({
  users: configuredSoakUsers,
  laneFilter: ['ashes-command-bearing-endings']
});
assert.equal(focusedLanes.length, 1);
assert.deepEqual(coordinatorReadinessUsers({ configured: configuredSoakUsers, lanes: focusedLanes }).map((user) => user.handle), [
  'directive-soak-a',
  'directive-soak-b',
  'directive-soak-c',
  'directive-soak-d',
  'directive-soak-e'
]);
assert.deepEqual(readinessCommandArgs({ activateExternalContextFixture: false }), [
  'tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs',
  '--live',
  '--write-artifacts'
]);
assert.deepEqual(readinessCommandArgs({ activateExternalContextFixture: true }), [
  'tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs',
  '--live',
  '--activate-external-context-fixture',
  '--write-artifacts'
]);
assert.equal(lanes.length, 5);
assert.deepEqual(lanes.map((lane) => lane.userHandle), [
  'directive-soak-a',
  'directive-soak-b',
  'directive-soak-c',
  'directive-soak-d',
  'directive-soak-e'
]);
assert.equal(lanes.every((lane) => lane.userConfigured), true);
assert.equal(buildContinuityMatrixLanes({ users: [], laneFilter: ['ashes-factual-director'] }).length, 1);

function probeUser(handle, {
  summaryceptionStatus = 'browser-confirmed',
  vectFoxStatus = 'disabled',
  unavailableSignals = []
} = {}) {
  return {
    handle,
    status: 'pass',
    contextReady: true,
    currentChatId: `ashes-${handle}`,
    chatLength: 12,
    diskEnvironmentHash: `disk-${handle}`,
    browserEnvironmentHash: `browser-${handle}`,
    combinedEnvironmentHash: `combined-${handle}`,
    hostPromptRegistry: {
      available: true,
      keyCount: 4,
      promptKeys: ['summaryception', '3_vectfox', 'worldInfoBefore', 'directive.campaign.context']
    },
    externalPromptEnvironment: {
      knownExternalPromptKeys: ['summaryception', '3_vectfox', 'worldInfoBefore'],
      rawPromptBody: 'RAW_PROMPT_CANARY_SHOULD_NOT_SURFACE'
    },
    targets: {
      stLorebooks: {
        status: 'browser-confirmed',
        diskSignals: { installed: true, enabled: true, settingsHash: `wi-${handle}` },
        browserSignals: { settingsSeen: true, globalSignatureSeen: true, promptKeySeen: true, chatMetadataSeen: true },
        promptKeys: ['worldInfoBefore'],
        chatMetadataCounts: { chatBoundWorld: 1 },
        messageMarkerCounts: {},
        unavailableReasons: []
      },
      memoryBooks: {
        status: 'browser-confirmed',
        diskSignals: { installed: true, enabled: true, settingsHash: `stmb-${handle}` },
        browserSignals: { settingsSeen: true, globalSignatureSeen: true, chatMetadataSeen: true, messageMarkerSeen: true },
        promptKeys: [],
        chatMetadataCounts: { chatBoundWorld: 1 },
        messageMarkerCounts: { memoryBooksHidden: 1 },
        unavailableReasons: []
      },
      summaryception: {
        status: summaryceptionStatus,
        diskSignals: { installed: true, enabled: summaryceptionStatus !== 'not-installed', settingsHash: `sc-${handle}` },
        browserSignals: { settingsSeen: true, globalSignatureSeen: true, promptKeySeen: true, chatMetadataSeen: true, messageMarkerSeen: true },
        promptKeys: ['summaryception'],
        chatMetadataCounts: { ghostedCount: 3, layerCount: 2 },
        messageMarkerCounts: { summaryceptionGhosted: 3 },
        unavailableReasons: unavailableSignals
      },
      vectFox: {
        status: vectFoxStatus,
        diskSignals: { installed: true, enabled: vectFoxStatus === 'browser-confirmed', disabledPresent: vectFoxStatus === 'disabled', settingsHash: `vf-${handle}` },
        browserSignals: { settingsSeen: true, globalSignatureSeen: true, promptKeySeen: vectFoxStatus === 'browser-confirmed', messageMarkerSeen: false },
        promptKeys: vectFoxStatus === 'browser-confirmed' ? ['3_vectfox'] : [],
        chatMetadataCounts: {},
        messageMarkerCounts: { vectFoxGhosted: 0 },
        unavailableReasons: unavailableSignals
      }
    },
    unavailableSignals,
    redactions: [{ key: 'qdrant_api_key', reason: 'secret' }, { key: 'rawPromptBody', reason: 'raw-payload' }]
  };
}

const readinessRoot = makeArtifactRoot();
const externalProbe = {
  kind: 'directive.sillytavern.externalContextProbe.v1',
  schemaVersion: 1,
  runId: 'readiness-external',
  capturedAt: '2026-06-28T22:00:00.000Z',
  mode: 'live-browser-preflight',
  required: true,
  status: 'pass',
  baseUrl: 'http://127.0.0.1:8000',
  users: configuredSoakUsers.map((user) => probeUser(user.handle))
};
writeJson(path.join(readinessRoot, 'report.json'), {
  status: 'pass',
  runId: 'readiness-external',
  checks: [{ id: 'host-extension-compatibility', status: 'pass', summary: 'ok' }],
  externalContextProbe: externalProbe
});
const externalProbeSummary = summarizeExternalContextProbe(externalProbe);
assert.equal(externalProbeSummary.userCount, 5);
assert.equal(externalProbeSummary.targetStatusCounts['browser-confirmed'], 15);
assert.equal(externalProbeSummary.targetStatusCounts.disabled, 5);
assert.equal(externalProbeSummary.fixtureDepth.status, 'warning');
assert.deepEqual(externalProbeSummary.fixtureDepth.missingTargets, ['vectFox']);
assert.equal(externalProbeSummary.fixtureDepth.targetCoverage.stLorebooks.richUserCount, 5);
assert.equal(externalProbeSummary.fixtureDepth.targetCoverage.memoryBooks.richUserCount, 5);
assert.equal(externalProbeSummary.fixtureDepth.targetCoverage.summaryception.richUserCount, 5);
assert.equal(externalProbeSummary.fixtureDepth.targetCoverage.vectFox.richUserCount, 0);
assert.equal(externalProbeSummary.users[0].redactionReasons.includes('secret'), true);
assert.equal(externalProbeSummary.users[0].targets.summaryception.chatMetadataCounts.ghostedCount, 3);
assert.equal(JSON.stringify(externalProbeSummary).includes('RAW_PROMPT_CANARY'), false);
const richExternalProbeSummary = summarizeExternalContextProbe({
  ...externalProbe,
  users: configuredSoakUsers.map((user) => probeUser(user.handle, { vectFoxStatus: 'browser-confirmed' }))
});
assert.equal(richExternalProbeSummary.fixtureDepth.status, 'pass');
assert.deepEqual(richExternalProbeSummary.fixtureDepth.missingTargets, []);
assert.equal(richExternalProbeSummary.fixtureDepth.fullFixtureUserHandles.length, 5);
const readinessSummary = summarizeReadiness({
  exitCode: 0,
  signal: null,
  stdout: JSON.stringify({ status: 'pass', artifactRoot: readinessRoot }),
  stderr: '',
  json: { status: 'pass', artifactRoot: readinessRoot }
}, { readiness: path.dirname(readinessRoot) }, 'parent-run');
assert.equal(readinessSummary.status, 'pass');
assert.equal(readinessSummary.externalContextProbe.status, 'pass');
assert.equal(readinessSummary.externalContextProbe.fixtureDepth.status, 'warning');
assert.equal(readinessSummary.externalContextProbe.users[4].targets.vectFox.status, 'disabled');
assert.equal(externalContextFixtureDepthCheckStatus({
  live: true,
  turnLimit: '1',
  fixtureDepth: readinessSummary.externalContextProbe.fixtureDepth
}), 'warning');
assert.equal(externalContextFixtureDepthCheckStatus({
  live: true,
  turnLimit: '',
  fixtureDepth: readinessSummary.externalContextProbe.fixtureDepth,
  fullCertificationRequired: true
}), 'fail');
assert.equal(externalContextFixtureDepthCheckStatus({
  live: true,
  turnLimit: '',
  fixtureDepth: richExternalProbeSummary.fixtureDepth,
  fullCertificationRequired: true
}), 'pass');

const root = makeArtifactRoot();
writePassingLaneArtifacts(root);
const promptSummary = summarizePromptInspectionArtifact({ artifactRoot: root });
assert.equal(promptSummary.status, 'pass');
assert.equal(promptSummary.missingPromptKeys.length, 0);
assert.equal(promptSummary.missingSourceIds.length, 0);
const externalPromptSummary = summarizeExternalContextPromptArtifact({ artifactRoot: root });
assert.equal(externalPromptSummary.status, 'pass');
assert.equal(externalPromptSummary.externalPromptEnvironmentRef.hash, 'a'.repeat(64));
assert.deepEqual(externalPromptSummary.knownExternalPromptKeys, ['3_vectfox', 'summaryception', 'worldInfoBefore']);
assert.equal(externalPromptSummary.directiveOwnedPromptKeys.includes('directive.contract'), true);
assert.equal(externalPromptSummary.finalHostPromptMayIncludeExternal, true);
const externalGenerationSummary = summarizeExternalContextGenerationArtifacts({ artifactRoot: root });
assert.equal(externalGenerationSummary.status, 'pass');
assert.equal(externalGenerationSummary.captureCount, 1);
assert.equal(externalGenerationSummary.expectedCaptureCount, null);
assert.equal(externalGenerationSummary.knownExternalPromptKeys.includes('3_vectfox'), true);
assert.equal(externalGenerationSummary.richFixturePressure.status, 'pass');
assert.deepEqual(externalGenerationSummary.richFixturePressure.missingTargets, []);
const factualSummary = summarizeFactualGroundingArtifacts({ artifactRoot: root });
assert.equal(factualSummary.status, 'pass');
assert.equal(factualSummary.checkCount, 2);
assert.equal(factualSummary.badCount, 0);
const timingSummary = summarizeGenerationTimingCoreProof({ artifactRoot: root });
assert.equal(timingSummary.status, 'pass');
assert.equal(timingSummary.proof.timingSource, 'coreProjection');
const laneSummary = summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: root }),
    stderr: '',
    json: { status: 'pass', artifactRoot: root }
  },
  artifactRoot: root
});
assert.equal(laneSummary.status, 'pass');
assert.equal(laneSummary.promptInspection.presentSourceIds.includes('crew.hadrik-bronn.species'), true);
assert.equal(laneSummary.externalContextProof.status, 'pass');
assert.equal(laneSummary.externalContextProof.knownExternalPromptKeys.includes('summaryception'), true);
assert.equal(laneSummary.externalContextGenerationProof.status, 'pass');
assert.equal(laneSummary.externalContextGenerationProof.captureCount, 1);
assert.equal(laneSummary.externalContextGenerationProof.richFixturePressure.status, 'pass');
assert.equal(laneSummary.factualGrounding.counts.respected, 6);
assert.equal(laneSummary.generationTimingProof.status, 'pass');
assert.equal(summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: root,
  turnLimit: null
}), null);
const aggregateRichPassReport = buildReport({
  runId: 'aggregate-rich-pass',
  mode: 'live',
  options: {
    live: true,
    turnLimit: '1',
    skipReadiness: false,
    resume: false,
    laneFilter: []
  },
  paths: { root },
  lanes: [lanes[0]],
  readiness: {
    status: 'pass',
    externalContextProbe: {
      status: 'pass',
      fixtureDepth: richExternalProbeSummary.fixtureDepth
    }
  },
  laneSummaries: [laneSummary]
});
const aggregateRichPassCheck = aggregateRichPassReport.checks.find((entry) => entry.id === 'external-context-generation-proof');
assert.equal(aggregateRichPassCheck.status, 'pass');
assert.equal(aggregateRichPassCheck.details.richFixtureUserHandles.includes('directive-soak-a'), true);

const missingTimingRoot = makeArtifactRoot();
writePassingLaneArtifacts(missingTimingRoot, { includeTiming: false });
const missingTimingSummary = summarizeGenerationTimingCoreProof({ artifactRoot: missingTimingRoot });
assert.equal(missingTimingSummary.status, 'fail');
assert.match(missingTimingSummary.summary, /missing live-generation-start-timing/);
assert.equal(summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: missingTimingRoot }),
    stderr: '',
    json: { status: 'pass', artifactRoot: missingTimingRoot }
  },
  artifactRoot: missingTimingRoot
}).status, 'fail');
assert.equal(summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: missingTimingRoot,
  turnLimit: null
}), null);

const runtimeTimingRoot = makeArtifactRoot();
writePassingLaneArtifacts(runtimeTimingRoot, {
  timingProof: {
    status: 'pass',
    source: 'runtimeSnapshot',
    timingSource: 'runtimeSnapshot',
    checkedTurnCount: 1,
    maxGenerationStartLatencyMs: 4200
  }
});
const runtimeTimingSummary = summarizeGenerationTimingCoreProof({ artifactRoot: runtimeTimingRoot });
assert.equal(runtimeTimingSummary.status, 'fail');
assert.match(runtimeTimingSummary.summary, /not persisted CORE projection/);

const skippedTimingRoot = makeArtifactRoot();
writePassingLaneArtifacts(skippedTimingRoot, {
  timingProof: {
    status: 'skipped',
    source: 'coreStoreTurnTiming',
    timingSource: 'coreProjection',
    checkedTurnCount: 0,
    skippedTurnCount: 2,
    skippedEntries: [{ responseKind: 'clarificationNeeded' }]
  }
});
const skippedTimingSummary = summarizeGenerationTimingCoreProof({ artifactRoot: skippedTimingRoot });
assert.equal(skippedTimingSummary.status, 'warning');
assert.match(skippedTimingSummary.summary, /incomplete/);

const fullRoot = makeArtifactRoot();
writePassingLaneArtifacts(fullRoot, { promptCaptureCount: 52 });
for (let turn = 2; turn <= 52; turn += 1) {
  writeJson(path.join(fullRoot, 'fact-checks', `soak-turn-${String(turn).padStart(2, '0')}`, 'fact-check.json'), {
    status: 'pass',
    counts: {
      respected: 1,
      omitted: 0,
      unsupportedDetail: 0,
      contradicted: 0,
      promptAvailable: 1
    },
    results: []
  });
}
const reusableFullLane = summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: fullRoot,
  turnLimit: null
});
assert.equal(reusableFullLane.reused, true);
assert.equal(reusableFullLane.status, 'pass');
assert.equal(summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: root,
  turnLimit: '1'
}), null);

const boundedRoot = makeArtifactRoot();
writePassingLaneArtifacts(boundedRoot, { turnLimit: 1 });
const reusableBoundedLane = summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: boundedRoot,
  turnLimit: '1'
});
assert.equal(reusableBoundedLane.reused, true);
assert.equal(reusableBoundedLane.status, 'pass');
assert.equal(summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: boundedRoot,
  turnLimit: null
}), null);

const partialFactDepthRoot = makeArtifactRoot();
writePassingLaneArtifacts(partialFactDepthRoot, { turnLimit: 5, promptCaptureCount: 5 });
const partialFactDepth = summarizeLaneArtifactCompleteness({
  artifactRoot: partialFactDepthRoot,
  turnLimit: '5'
});
assert.equal(partialFactDepth.status, 'warning');
assert.equal(partialFactDepth.factCheckDepthMissing, true);
const reusablePartialFactDepth = summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: partialFactDepthRoot,
  turnLimit: '5'
});
assert.equal(reusablePartialFactDepth.reused, true);
assert.equal(reusablePartialFactDepth.status, 'warning');

const missingGenerationPromptRoot = makeArtifactRoot();
writePassingLaneArtifacts(missingGenerationPromptRoot, { includePreGenerationPromptCaptures: false });
const missingGenerationPromptSummary = summarizeExternalContextGenerationArtifacts({ artifactRoot: missingGenerationPromptRoot });
assert.equal(missingGenerationPromptSummary.status, 'fail');
assert.equal(missingGenerationPromptSummary.captureCount, 0);
assert.match(missingGenerationPromptSummary.summary, /No generation-time/);
assert.equal(summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: missingGenerationPromptRoot }),
    stderr: '',
    json: { status: 'pass', artifactRoot: missingGenerationPromptRoot }
  },
  artifactRoot: missingGenerationPromptRoot
}).status, 'fail');

const shallowGenerationPromptRoot = makeArtifactRoot();
writePassingLaneArtifacts(shallowGenerationPromptRoot, { turnLimit: 3, promptCaptureCount: 2 });
const shallowGenerationPromptSummary = summarizeExternalContextGenerationArtifacts({
  artifactRoot: shallowGenerationPromptRoot,
  turnLimit: '3'
});
assert.equal(shallowGenerationPromptSummary.status, 'fail');
assert.equal(shallowGenerationPromptSummary.captureDepthMissing, true);
assert.equal(shallowGenerationPromptSummary.expectedCaptureCount, 3);

const badGenerationPromptRoot = makeArtifactRoot();
writePassingLaneArtifacts(badGenerationPromptRoot);
const badGenerationPrompt = readJson(path.join(badGenerationPromptRoot, 'prompt-inspection', 'pre-generation-soak-turn-01-0002.json'));
delete badGenerationPrompt.promptInspection.externalPromptEnvironmentRef;
badGenerationPrompt.promptInspection.knownExternalPromptKeys = [];
writeJson(path.join(badGenerationPromptRoot, 'prompt-inspection', 'pre-generation-soak-turn-01-0002.json'), badGenerationPrompt);
const badGenerationPromptSummary = summarizeExternalContextGenerationArtifacts({ artifactRoot: badGenerationPromptRoot });
assert.equal(badGenerationPromptSummary.status, 'fail');
assert.equal(badGenerationPromptSummary.failedCaptureCount, 1);
assert.equal(badGenerationPromptSummary.unavailableSignals.includes('external-prompt-environment-ref-missing'), true);

const genericExternalPromptRoot = makeArtifactRoot();
writePassingLaneArtifacts(genericExternalPromptRoot);
const genericPromptPath = path.join(genericExternalPromptRoot, 'prompt-inspection', 'pre-generation-soak-turn-01-0002.json');
const genericPrompt = readJson(genericPromptPath);
genericPrompt.promptInspection.knownExternalPromptKeys = ['1_memory'];
genericPrompt.promptInspection.externalPromptEnvironmentRef.knownExternalPromptKeys = ['1_memory'];
genericPrompt.promptInspection.externalPromptEnvironmentTargets = {
  stLorebooks: { active: false, enabled: false },
  memoryBooks: { active: false, enabled: false, entryCount: 0 },
  summaryception: { enabled: false, promptKeyActive: false },
  vectFox: { enabled: false, generationInterceptorActive: false, promptKeys: [] }
};
writeJson(genericPromptPath, genericPrompt);
const genericExternalGeneration = summarizeExternalContextGenerationArtifacts({ artifactRoot: genericExternalPromptRoot });
assert.equal(genericExternalGeneration.status, 'pass', 'Generic external key still proves only basic generation-time observability.');
assert.equal(genericExternalGeneration.richFixturePressure.status, 'fail');
assert.deepEqual(genericExternalGeneration.richFixturePressure.missingTargets, ['stLorebooks', 'memoryBooks', 'summaryception', 'vectFox']);
const genericLaneSummary = summarizeContinuityMatrixLane({
  lane: lanes[0],
  child: {
    exitCode: 0,
    signal: null,
    stdout: JSON.stringify({ status: 'pass', artifactRoot: genericExternalPromptRoot }),
    stderr: '',
    json: { status: 'pass', artifactRoot: genericExternalPromptRoot }
  },
  artifactRoot: genericExternalPromptRoot
});
assert.equal(genericLaneSummary.externalContextGenerationProof.status, 'pass');
assert.equal(genericLaneSummary.externalContextGenerationProof.richFixturePressure.status, 'fail');
const aggregateGenericReport = buildReport({
  runId: 'aggregate-rich-fail',
  mode: 'live',
  options: {
    live: true,
    turnLimit: '1',
    skipReadiness: false,
    resume: false,
    laneFilter: []
  },
  paths: { root: genericExternalPromptRoot },
  lanes: [lanes[0]],
  readiness: {
    status: 'pass',
    externalContextProbe: {
      status: 'pass',
      fixtureDepth: richExternalProbeSummary.fixtureDepth
    }
  },
  laneSummaries: [genericLaneSummary]
});
const aggregateGenericCheck = aggregateGenericReport.checks.find((entry) => entry.id === 'external-context-generation-proof');
assert.equal(aggregateGenericCheck.status, 'fail');
assert.match(aggregateGenericCheck.summary, /rich fixture lane/);

const missingRoot = makeArtifactRoot();
writePassingLaneArtifacts(missingRoot);
writeJson(path.join(missingRoot, 'prompt-inspection', 'run-end.json'), {
  promptInspection: {
    status: 'active',
    blocks: [
      { id: 'continuity-contract', promptKey: 'directive.contract', sourceIds: [] }
    ]
  }
});
const missingPromptSummary = summarizePromptInspectionArtifact({ artifactRoot: missingRoot });
assert.equal(missingPromptSummary.status, 'fail');
assert.equal(missingPromptSummary.missingSourceIds.includes('crew.hadrik-bronn.species'), true);

const missingExternalRoot = makeArtifactRoot();
writePassingLaneArtifacts(missingExternalRoot);
const missingExternalPrompt = readJson(path.join(missingExternalRoot, 'prompt-inspection', 'run-end.json'));
delete missingExternalPrompt.promptInspection.externalPromptEnvironmentRef;
missingExternalPrompt.promptInspection.finalHostPromptMayIncludeExternal = null;
writeJson(path.join(missingExternalRoot, 'prompt-inspection', 'run-end.json'), missingExternalPrompt);
const missingExternalSummary = summarizeExternalContextPromptArtifact({ artifactRoot: missingExternalRoot });
assert.equal(missingExternalSummary.status, 'fail');
assert.equal(missingExternalSummary.unavailableSignals.includes('external-prompt-environment-ref-missing'), true);
assert.equal(summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: missingExternalRoot,
  turnLimit: null
}), null);

const badFactRoot = makeArtifactRoot();
writePassingLaneArtifacts(badFactRoot);
writeJson(path.join(badFactRoot, 'fact-checks', 'soak-turn-01', 'fact-check.json'), {
  status: 'fail',
  counts: {
    respected: 0,
    omitted: 0,
    unsupportedDetail: 0,
    contradicted: 1
  },
  results: [{ verdict: 'contradicted' }]
});
const badFactSummary = summarizeFactualGroundingArtifacts({ artifactRoot: badFactRoot });
assert.equal(badFactSummary.status, 'fail');
assert.equal(badFactSummary.badCount, 1);

const warningFactRoot = makeArtifactRoot();
writePassingLaneArtifacts(warningFactRoot);
writeJson(path.join(warningFactRoot, 'fact-checks', 'soak-turn-01', 'fact-check.json'), {
  status: 'warning',
  counts: {
    respected: 1,
    omitted: 1,
    unsupportedDetail: 0,
    contradicted: 0
  },
  results: [{ verdict: 'omitted', severity: 'P2 factual warning' }]
});
const warningFactSummary = summarizeFactualGroundingArtifacts({ artifactRoot: warningFactRoot });
assert.equal(warningFactSummary.status, 'warning');
assert.equal(warningFactSummary.badCount, 1);

const coordinatorSource = fs.readFileSync('tools/scripts/run-continuity-matrix-five-user-soak.mjs', 'utf8');
assert.match(coordinatorSource, /external-context-readiness-proof/);
assert.match(coordinatorSource, /external-context-fixture-depth/);
assert.match(coordinatorSource, /external-context-generation-proof/);
assert.match(coordinatorSource, /generation-start-timing-core-proof/);
assert.match(coordinatorSource, /summarizeGenerationTimingCoreProof/);
assert.match(coordinatorSource, /External Context Readiness/);
assert.match(coordinatorSource, /FixtureDepth/);
assert.match(coordinatorSource, /hostExtensions: path\.join\(root, 'host-extensions'\)/);
assert.match(coordinatorSource, /hostExtensions: paths\.hostExtensions/);

fs.rmSync(readinessRoot, { recursive: true, force: true });
fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(missingTimingRoot, { recursive: true, force: true });
fs.rmSync(runtimeTimingRoot, { recursive: true, force: true });
fs.rmSync(skippedTimingRoot, { recursive: true, force: true });
fs.rmSync(fullRoot, { recursive: true, force: true });
fs.rmSync(boundedRoot, { recursive: true, force: true });
fs.rmSync(partialFactDepthRoot, { recursive: true, force: true });
fs.rmSync(missingGenerationPromptRoot, { recursive: true, force: true });
fs.rmSync(shallowGenerationPromptRoot, { recursive: true, force: true });
fs.rmSync(badGenerationPromptRoot, { recursive: true, force: true });
fs.rmSync(genericExternalPromptRoot, { recursive: true, force: true });
fs.rmSync(missingRoot, { recursive: true, force: true });
fs.rmSync(missingExternalRoot, { recursive: true, force: true });
fs.rmSync(badFactRoot, { recursive: true, force: true });
fs.rmSync(warningFactRoot, { recursive: true, force: true });

console.log('test-continuity-matrix-five-user-soak-coordinator: ok');
