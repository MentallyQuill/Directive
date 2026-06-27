import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  CONTINUITY_MATRIX_REQUIRED_PROMPT_KEYS,
  CONTINUITY_MATRIX_REQUIRED_SOURCE_IDS,
  buildContinuityMatrixLanes,
  coordinatorReadinessUsers,
  summarizeContinuityMatrixLane,
  summarizeFactualGroundingArtifacts,
  summarizeLaneArtifactCompleteness,
  summarizePromptInspectionArtifact,
  summarizeReusableContinuityMatrixLane
} from './run-continuity-matrix-five-user-soak.mjs';

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, String(value), 'utf8');
}

function makeArtifactRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'directive-cpm-five-user-'));
}

function writePassingLaneArtifacts(root, { turnLimit = null } = {}) {
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
  writeJson(path.join(root, 'prompt-inspection', 'run-end.json'), {
    promptInspection: {
      status: 'active',
      revision: 12,
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

const root = makeArtifactRoot();
writePassingLaneArtifacts(root);
const promptSummary = summarizePromptInspectionArtifact({ artifactRoot: root });
assert.equal(promptSummary.status, 'pass');
assert.equal(promptSummary.missingPromptKeys.length, 0);
assert.equal(promptSummary.missingSourceIds.length, 0);
const factualSummary = summarizeFactualGroundingArtifacts({ artifactRoot: root });
assert.equal(factualSummary.status, 'pass');
assert.equal(factualSummary.checkCount, 2);
assert.equal(factualSummary.badCount, 0);
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
assert.equal(laneSummary.factualGrounding.counts.respected, 6);
assert.equal(summarizeReusableContinuityMatrixLane({
  lane: lanes[0],
  artifactRoot: root,
  turnLimit: null
}), null);

const fullRoot = makeArtifactRoot();
writePassingLaneArtifacts(fullRoot);
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
writePassingLaneArtifacts(partialFactDepthRoot, { turnLimit: 5 });
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

fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(fullRoot, { recursive: true, force: true });
fs.rmSync(boundedRoot, { recursive: true, force: true });
fs.rmSync(partialFactDepthRoot, { recursive: true, force: true });
fs.rmSync(missingRoot, { recursive: true, force: true });
fs.rmSync(badFactRoot, { recursive: true, force: true });
fs.rmSync(warningFactRoot, { recursive: true, force: true });

console.log('test-continuity-matrix-five-user-soak-coordinator: ok');
