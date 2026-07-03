import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  promoteDelegatedSmokeEvidence
} from './soak-sillytavern-campaign-live.mjs';
import {
  summarizeExternalContextGenerationArtifacts,
  summarizeExternalContextSummaryArtifact
} from './run-continuity-matrix-five-user-soak.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'directive-external-context-summary-'));
const report = {
  runId: 'external-context-summary-golden',
  artifacts: {
    root,
    hostExtensions: path.join(root, 'host-extensions'),
    externalContextSummary: path.join(root, 'host-extensions', 'external-context-summary.json'),
    liveLog: path.join(root, 'live-log.jsonl')
  }
};

const richPromptInspection = {
  externalPromptEnvironmentRef: {
    kind: 'directive.externalPromptEnvironmentRef.v1',
    hash: 'a'.repeat(64),
    status: 'observed',
    byteLength: 512
  },
  knownExternalPromptKeys: ['worldInfoBefore', 'summaryception', '3_vectfox', 'directive.lens.runtime-context'],
  directiveOwnedPromptKeys: ['directive.lens.runtime-context'],
  finalHostPromptMayIncludeExternal: true,
  unavailableSignals: [],
  redactions: [{ key: 'qdrant_api_key', reason: 'secret' }],
  externalPromptEnvironmentTargets: {
    stLorebooks: {
      active: true,
      chatBound: true,
      placement: 'worldInfoBefore',
      timingDiagnostics: { observed: true, composeLatencyMs: 12, timingHash: 'l'.repeat(64) },
      rawLorebookText: 'RAW_LOREBOOK_TEXT should not survive.'
    },
    memoryBooks: {
      enabled: true,
      rangeDiagnostics: { status: 'valid', rangeCount: 2 },
      timingDiagnostics: { observed: true, scanLatencyMs: 18, timingHash: 'm'.repeat(64) },
      generatedMemory: 'generated Memory Book text should not survive.'
    },
    summaryception: {
      enabled: true,
      promptKeyActive: true,
      staleness: { status: 'observed' },
      timingDiagnostics: { observed: true, summaryLatencyMs: 44, timingHash: 's'.repeat(64) },
      rawSummary: 'raw Summaryception text should not survive.'
    },
    vectFox: {
      enabled: true,
      promptKeys: ['3_vectfox'],
      generationInterceptorActive: true,
      backendDiagnostics: {
        status: 'external-backend-configured',
        externalTimingObserved: true,
        timingHash: 'v'.repeat(64),
        endpointUrl: 'QDRANT_ENDPOINT should not survive.'
      },
      vectorPayload: 'raw vector payload should not survive.',
      qdrant_api_key: 'SECRET-QDRANT should not survive.'
    }
  }
};

writeJson(path.join(root, 'prompt-inspection', 'soak-turn-01.json'), {
  reason: 'pre-generation',
  scriptMessageId: 'soak-turn-01',
  scriptCategory: 'directiveCommit',
  promptInspection: richPromptInspection
});

const promoted = promoteDelegatedSmokeEvidence({
  report,
  smokeReport: {
    browser: {
      chatCampaignFlow: {
        rounds: [],
        transcriptCaptures: [],
        promptInspectionCaptures: [{
          status: 'pass',
          reason: 'pre-generation',
          scriptMessageId: 'soak-turn-01',
          scriptCategory: 'directiveCommit',
          promptInspection: cloneJson(richPromptInspection)
        }]
      }
    }
  }
});

assert.equal(promoted.externalContextSummary.status, 'pass');
assert.equal(promoted.externalContextSummary.artifactPathRelative, 'host-extensions/external-context-summary.json');

const artifact = readJson(report.artifacts.externalContextSummary);
assert.equal(artifact.kind, 'directive.sillytavern.externalContextSummary.v1');
assert.equal(artifact.authority.directiveAuthority, false);
assert.equal(artifact.aggregate.captureCount, 1);
assert.equal(artifact.aggregate.targetSummaryCount, 1);
assert.equal(artifact.aggregate.knownExternalPromptKeys.includes('summaryception'), true);
assert.equal(artifact.aggregate.knownExternalPromptKeys.includes('3_vectfox'), true);
assert.equal(artifact.aggregate.redactionReasons.includes('secret'), true);
assert.equal(artifact.aggregate.redactionReasons.includes('raw-payload'), true);
assert.equal(artifact.aggregate.timingCoverage.timedTargetCount, 4);
assert.deepEqual(artifact.aggregate.timingCoverage.targetsMissingTiming, []);
assert.equal(artifact.targetSummaries[0].targets.stLorebooks.active, true);
assert.equal(artifact.targetSummaries[0].targets.memoryBooks.rangeDiagnostics.status, 'valid');
assert.equal(artifact.targetSummaries[0].targets.summaryception.staleness.status, 'observed');
assert.equal(artifact.targetSummaries[0].targets.vectFox.backendDiagnostics.status, 'external-backend-configured');
assert.equal(artifact.targetSummaries[0].targets.stLorebooks.timingDiagnostics.observed, true);
assert.equal(artifact.targetSummaries[0].targets.memoryBooks.timingDiagnostics.observed, true);
assert.equal(artifact.targetSummaries[0].targets.summaryception.timingDiagnostics.observed, true);
assert.equal(artifact.targetSummaries[0].targets.vectFox.backendDiagnostics.externalTimingObserved, true);

const serialized = JSON.stringify(artifact);
for (const forbidden of [
  'RAW_LOREBOOK_TEXT',
  'generated Memory Book text',
  'raw Summaryception text',
  'raw vector payload',
  'QDRANT_ENDPOINT',
  'SECRET-QDRANT'
]) {
  assert.equal(serialized.includes(forbidden), false, `external-context summary must not contain ${forbidden}`);
}
assert.equal(Object.hasOwn(artifact.targetSummaries[0].targets.stLorebooks, 'rawLorebookText'), false);
assert.equal(Object.hasOwn(artifact.targetSummaries[0].targets.memoryBooks, 'generatedMemory'), false);
assert.equal(Object.hasOwn(artifact.targetSummaries[0].targets.summaryception, 'rawSummary'), false);
assert.equal(Object.hasOwn(artifact.targetSummaries[0].targets.vectFox, 'vectorPayload'), false);
assert.equal(Object.hasOwn(artifact.targetSummaries[0].targets.vectFox, 'qdrant_api_key'), false);
assert.equal(Object.hasOwn(artifact.targetSummaries[0].targets.vectFox.backendDiagnostics, 'endpointUrl'), false);

const summary = summarizeExternalContextSummaryArtifact({ artifactRoot: root });
assert.equal(summary.status, 'pass');
assert.deepEqual(summary.missingTargetSummaries, []);
assert.deepEqual(summary.placeholderTargetSummaries, []);
assert.deepEqual(summary.usefulTargetSummaries, ['stLorebooks', 'memoryBooks', 'summaryception', 'vectFox']);
assert.equal(summary.finalHostPromptMayIncludeExternal, true);
assert.equal(summary.authority.directiveAuthority, false);
assert.equal(summary.redactionReasons.includes('raw-payload'), true);
assert.equal(summary.timingCoverage.timedTargetCount, 4);
assert.deepEqual(summary.timingCoverage.targetsMissingTiming, []);

const generationSummary = summarizeExternalContextGenerationArtifacts({ artifactRoot: root, turnLimit: 1 });
assert.equal(generationSummary.status, 'pass');
assert.equal(generationSummary.richFixturePressure.status, 'pass');
assert.deepEqual(generationSummary.richFixturePressure.missingTargets, []);
assert.equal(generationSummary.richFixturePressure.targetDiagnostics.memoryBooks.rangeStatus, 'valid');
assert.equal(generationSummary.richFixturePressure.targetDiagnostics.summaryception.stalenessStatus, 'observed');
assert.equal(generationSummary.richFixturePressure.targetDiagnostics.vectFox.backendStatus, 'external-backend-configured');

const missingLorebookTargetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'directive-external-context-summary-missing-lorebook-target-'));
const missingLorebookTargetInspection = cloneJson(richPromptInspection);
delete missingLorebookTargetInspection.externalPromptEnvironmentTargets.stLorebooks;
writeJson(path.join(missingLorebookTargetRoot, 'prompt-inspection', 'soak-turn-01.json'), {
  reason: 'pre-generation',
  scriptMessageId: 'soak-turn-01',
  scriptCategory: 'directiveCommit',
  promptInspection: missingLorebookTargetInspection
});
const missingLorebookTargetGenerationSummary = summarizeExternalContextGenerationArtifacts({
  artifactRoot: missingLorebookTargetRoot,
  turnLimit: 1
});
assert.equal(missingLorebookTargetGenerationSummary.status, 'pass');
assert.equal(missingLorebookTargetGenerationSummary.richFixturePressure.status, 'fail');
assert.equal(missingLorebookTargetGenerationSummary.richFixturePressure.missingTargets.includes('stLorebooks'), true);

const unsafeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'directive-external-context-summary-unsafe-'));
writeJson(path.join(unsafeRoot, 'host-extensions', 'external-context-summary.json'), {
  ...cloneJson(artifact),
  targetSummaries: [{
    ...cloneJson(artifact.targetSummaries[0]),
    targets: {
      ...cloneJson(artifact.targetSummaries[0].targets),
      vectFox: {
        ...cloneJson(artifact.targetSummaries[0].targets.vectFox),
        vectorPayload: 'RAW_VECTOR_PAYLOAD_SHOULD_FAIL'
      }
    }
  }],
  captures: [{
    scriptMessageId: 'soak-turn-01',
    note: 'SECRET-QDRANT-SHOULD-FAIL'
  }]
});
const unsafeSummary = summarizeExternalContextSummaryArtifact({ artifactRoot: unsafeRoot });
assert.equal(unsafeSummary.status, 'fail');
assert.equal(unsafeSummary.missingFields.includes('redaction.forbiddenFields'), true);
assert.equal(unsafeSummary.forbiddenFields.some((entry) => entry.includes('vectorPayload')), true);
assert.equal(unsafeSummary.forbiddenFields.some((entry) => entry.includes('captures')), true);

const missingFinalPromptRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'directive-external-context-summary-no-final-prompt-'));
writeJson(path.join(missingFinalPromptRoot, 'host-extensions', 'external-context-summary.json'), {
  ...cloneJson(artifact),
  aggregate: {
    ...cloneJson(artifact.aggregate),
    finalHostPromptMayIncludeExternal: false
  }
});
const missingFinalPromptSummary = summarizeExternalContextSummaryArtifact({ artifactRoot: missingFinalPromptRoot });
assert.equal(missingFinalPromptSummary.status, 'fail');
assert.equal(missingFinalPromptSummary.missingFields.includes('aggregate.finalHostPromptMayIncludeExternal'), true);

const placeholderRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'directive-external-context-summary-placeholder-'));
writeJson(path.join(placeholderRoot, 'host-extensions', 'external-context-summary.json'), {
  ...cloneJson(artifact),
  targetSummaries: [{
    scriptMessageId: 'soak-turn-01',
    targets: {
      stLorebooks: {},
      memoryBooks: {},
      summaryception: {},
      vectFox: {}
    }
  }]
});
const placeholderSummary = summarizeExternalContextSummaryArtifact({ artifactRoot: placeholderRoot });
assert.equal(placeholderSummary.status, 'fail');
assert.deepEqual(placeholderSummary.missingTargetSummaries, []);
assert.deepEqual(placeholderSummary.placeholderTargetSummaries, ['stLorebooks', 'memoryBooks', 'summaryception', 'vectFox']);
assert.equal(placeholderSummary.missingFields.includes('targetSummaries.usefulTargets'), true);
assert.equal(placeholderSummary.missingFields.includes('aggregate.timingCoverage.targetsWithTiming'), true);

console.log('External context summary artifact tests passed.');
