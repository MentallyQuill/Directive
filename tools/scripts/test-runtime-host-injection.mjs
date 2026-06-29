import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createFakeDirectiveHost } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function createSequence(values) {
  let index = 0;
  return () => values[index++] || values.at(-1);
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const missionGraph = readJson('packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json');
const fixture = readJson('tests/fixtures/mission/prelude-hesperus-fraud-director-loop.fixture.json');

async function loadRuntimeAssets() {
  return {
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
  };
}

const host = createFakeDirectiveHost({
  generationOptions: {
    responses: {
      commandLogSummarizer: {
        providerId: 'fake-host-summary',
        model: 'fake-low-cost-utility',
        text: JSON.stringify({
          sourceOutcomeId: 'outcome.host-injection.hesperus.001',
          title: 'Hesperus protected',
          summary: 'The Breckenridge protected the Hesperus passengers while preserving the falsified record for formal inquiry.'
        })
      },
      narration: {
        providerId: 'fake-host-narrator',
        text: 'The Breckenridge accepts the delay, protects the passengers, and preserves the falsified record for formal inquiry.'
      },
      factualGroundingReviewer: {
        providerId: 'fake-host-factual-reviewer',
        model: 'fake-low-cost-utility',
        text: JSON.stringify({
          status: 'pass',
          overallAssessment: 'The visible transcript remains grounded in the supplied canaries.',
          findings: []
        })
      },
      storyQualityReviewer: {
        providerId: 'fake-host-story-quality-reviewer',
        model: 'fake-low-cost-utility',
        text: JSON.stringify({
          status: 'pass',
          overallAssessment: 'The visible transcript is coherent, third-person, and agency-safe.',
          scores: []
        })
      }
    }
  }
});

let idSequence = 0;
const app = createDirectiveRuntimeApp({
  host,
  packageLoader: loadRuntimeAssets,
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-host-injection-${idSequence}`;
  },
  now: createSequence([
    '2026-06-19T16:00:00.000Z',
    '2026-06-19T16:01:00.000Z',
    '2026-06-19T16:02:00.000Z',
    '2026-06-19T16:03:00.000Z',
    '2026-06-19T16:04:00.000Z'
  ])
});

const initialView = await app.initialize();
assert.equal(initialView.host.id, 'fake');
assert.equal(initialView.host.capabilities.generation.batchConcurrent, true);
assert.equal(
  initialView.providerConfiguration.roleRouting.find((entry) => entry.roleId === 'relationshipEvaluator')?.providerKind,
  'utility'
);
const routeOverride = await app.updateProviderRoleRouting({
  roleId: 'relationshipEvaluator',
  providerKind: 'reasoning'
});
assert.equal(routeOverride.route.providerKind, 'reasoning');
assert.equal(routeOverride.providerConfiguration.roleRouting.find((entry) => entry.roleId === 'relationshipEvaluator')?.overridden, true);
const routeReset = await app.resetProviderRoleRouting({ roleId: 'relationshipEvaluator' });
assert.equal(routeReset.route.providerKind, 'utility');
assert.equal(routeReset.providerConfiguration.roleRouting.find((entry) => entry.roleId === 'relationshipEvaluator')?.overridden, false);

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

const sceneSnapshot = fixture.input.sceneSnapshot;
const turn = await app.runDirectorTurn({
  turnId: 'turn.host-injection.hesperus.001',
  playerInput: sceneSnapshot.playerInput,
  sceneSnapshotOverrides: {
    activePhaseId: sceneSnapshot.activePhaseId,
    stardate: sceneSnapshot.stardate,
    locationId: sceneSnapshot.locationId,
    presentCharacters: sceneSnapshot.presentCharacters,
    knownFactIds: sceneSnapshot.knownFactIds,
    activeDecisionPointIds: sceneSnapshot.activeDecisionPointIds
  }
});
assert.equal(turn.view.host.id, 'fake');
assert.equal(turn.turnPacket.outcomePacket.resultBand, 'Partial Success');
assert.equal(turn.commandLogSummaryResult.status, 'deferred');
assert.equal(turn.campaignState.commandLog.entries.at(-1).assistedSummary, undefined);
assert.equal(host.generation.calls().length, 0);

const narration = await app.generateNarrationForLastTurn();
assert.equal(narration.ok, true);
assert.equal(narration.narration.providerId, 'fake-host-narrator');
assert.equal(host.generation.calls()[0].role, 'narration');
assert.equal(host.generation.calls()[0].request.role.id, 'narration');
assert.equal(narration.view.host.id, 'fake');
const flushedCommandLogSummary = await app.flushChatSidecars();
assert.equal(flushedCommandLogSummary.commandLogSummaryResult.ok, true);
assert.equal(host.generation.calls()[1].role, 'commandLogSummarizer');
assert.equal(host.generation.calls()[1].request.role.id, 'commandLogSummarizer');
assert.equal(host.generation.calls()[1].request.modelPreferences.cost, 'low');
const flushedState = flushedCommandLogSummary.view.campaignState || flushedCommandLogSummary.view.loadedCampaignState;
assert.equal(
  flushedState.commandLog.entries.at(-1).assistedSummary.summary,
  'The Breckenridge protected the Hesperus passengers while preserving the falsified record for formal inquiry.'
);
const directDiagnosticFlush = await app.flushRuntimeDiagnostics();
assert.equal(directDiagnosticFlush.ok, true);

const factualReviewRequest = {
  kind: 'directive.liveCampaignSoak.factualModelReviewRequest',
  schemaVersion: 1,
  requestId: 'fact-model-review-host-injection',
  packageId: packageData.manifest.id,
  packageTitle: packageData.manifest.title,
  packId: 'fact-canaries-host-injection',
  packHash: 'pack-hash',
  transcriptPointer: 'transcript/readable-chat.md',
  hiddenStatePolicy: 'Use only player-safe canaries and visible transcript excerpts. Do not use raw prompts, hidden state, cookies, CSRF tokens, or API keys.',
  evaluatorInstructions: ['Return strict JSON matching responseSchema.'],
  responseSchema: {
    type: 'object',
    required: ['status', 'findings', 'overallAssessment'],
    properties: {
      status: { type: 'string' },
      findings: { type: 'array' },
      overallAssessment: { type: 'string' }
    }
  },
  canaries: [{
    id: 'opening.transit-premise',
    category: 'opening-premise',
    severity: 'P1 factual blocker',
    summary: 'The Breckenridge has been underway at warp for weeks before meeting the player shuttle.',
    assertions: ['underway at warp for weeks'],
    positiveTerms: ['warp', 'weeks'],
    contradictionWatchlist: ['impulse for six days'],
    sourcePointers: [{ path: 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json', pointer: '/opening', note: 'player-safe premise' }],
    hiddenStateSafe: true
  }],
  transcript: [{
    index: 1,
    role: 'directive',
    text: 'The Breckenridge receives the new XO after weeks at warp.'
  }],
  deterministicChecks: [],
  inputHash: 'review-input-hash'
};
const factualReview = await app.runFactualGroundingReview({ reviewRequest: factualReviewRequest });
assert.equal(factualReview.ok, true);
assert.equal(factualReview.generation.roleId, 'factualGroundingReviewer');
assert.equal(factualReview.generation.providerKind, 'utility');
assert.equal(factualReview.generation.providerId, 'fake-host-factual-reviewer');
assert.equal(factualReview.modelCallDelta, 1);
assert.equal(factualReview.campaignStateMutated, false);
assert.equal(factualReview.modelCall.roleId, 'factualGroundingReviewer');
assert.equal(factualReview.modelCall.metadata.requestId, 'fact-model-review-host-injection');
assert.equal(host.generation.calls().at(-1).role, 'factualGroundingReviewer');
assert.equal(host.generation.calls().at(-1).request.role.id, 'factualGroundingReviewer');
assert.doesNotMatch(JSON.stringify(host.generation.calls().at(-1).request), /rawPrompt|apiKey|csrfToken/);
const storyQualityReviewRequest = {
  kind: 'directive.liveCampaignSoak.storyQualityModelReviewRequest',
  schemaVersion: 1,
  requestId: 'story-quality-review-host-injection',
  runId: 'host-injection-test',
  transcriptPointer: 'transcript/readable-chat.md',
  hiddenStatePolicy: 'Use only visible transcript excerpts.',
  responseSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'overallAssessment', 'scores'],
    properties: {
      status: { type: 'string' },
      overallAssessment: { type: 'string' },
      scores: { type: 'array' }
    }
  },
  scoreDefinitions: [{ score: 2, label: 'good', meaning: 'coherent' }],
  dimensions: ['continuity'],
  transcript: [{ index: 1, role: 'directive', text: 'The Breckenridge receives the new XO after weeks at warp.' }],
  deterministicScores: [],
  inputHash: 'story-quality-input-hash'
};
const storyQualityReview = await app.runStoryQualityReview({ reviewRequest: storyQualityReviewRequest });
assert.equal(storyQualityReview.ok, true);
assert.equal(storyQualityReview.generation.roleId, 'storyQualityReviewer');
assert.equal(storyQualityReview.generation.providerKind, 'utility');
assert.equal(storyQualityReview.generation.providerId, 'fake-host-story-quality-reviewer');
assert.equal(storyQualityReview.modelCallDelta, 1);
assert.equal(storyQualityReview.campaignStateMutated, false);
assert.equal(storyQualityReview.modelCall.roleId, 'storyQualityReviewer');
assert.equal(storyQualityReview.modelCall.metadata.requestId, 'story-quality-review-host-injection');
assert.equal(host.generation.calls().at(-1).role, 'storyQualityReviewer');
assert.equal(host.generation.calls().at(-1).request.role.id, 'storyQualityReviewer');
assert.doesNotMatch(JSON.stringify(host.generation.calls().at(-1).request), /rawPrompt|apiKey|csrfToken/);
await assert.rejects(
  () => app.runStoryQualityReview({
    reviewRequest: {
      ...storyQualityReviewRequest,
      rawPrompt: 'forbidden'
    }
  }),
  /forbidden field/
);
await assert.rejects(
  () => app.runFactualGroundingReview({
    reviewRequest: {
      ...factualReviewRequest,
      canaries: [{ ...factualReviewRequest.canaries[0], hiddenStateSafe: false }]
    }
  }),
  /not marked player-safe/
);
await assert.rejects(
  () => app.runFactualGroundingReview({
    reviewRequest: {
      ...factualReviewRequest,
      rawPrompt: 'hidden prompt body'
    }
  }),
  /forbidden field/
);

const noSummaryHost = createFakeDirectiveHost({
  generationOptions: {
    responses: {
      narration: {
        providerId: 'fake-host-narrator',
        text: 'The Breckenridge accepts the delay without running a command-log summary sidecar.'
      }
    }
  }
});
let noSummaryIdSequence = 0;
const noSummaryApp = createDirectiveRuntimeApp({
  host: noSummaryHost,
  packageLoader: loadRuntimeAssets,
  idFactory(prefix) {
    noSummaryIdSequence += 1;
    return `${prefix}-no-summary-${noSummaryIdSequence}`;
  },
  now: createSequence([
    '2026-06-19T17:00:00.000Z',
    '2026-06-19T17:01:00.000Z',
    '2026-06-19T17:02:00.000Z',
    '2026-06-19T17:03:00.000Z',
    '2026-06-19T17:04:00.000Z'
  ])
});
await noSummaryApp.initialize();
await noSummaryApp.startCreatorDraft({ packageId: packageData.manifest.id });
await noSummaryApp.saveCreatorDraft({
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
await noSummaryApp.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });
const noSummaryTurn = await noSummaryApp.runDirectorTurn({
  turnId: 'turn.host-injection.no-summary.001',
  playerInput: sceneSnapshot.playerInput,
  generateCommandLogSummary: false,
  sceneSnapshotOverrides: {
    activePhaseId: sceneSnapshot.activePhaseId,
    stardate: sceneSnapshot.stardate,
    locationId: sceneSnapshot.locationId,
    presentCharacters: sceneSnapshot.presentCharacters,
    knownFactIds: sceneSnapshot.knownFactIds,
    activeDecisionPointIds: sceneSnapshot.activeDecisionPointIds
  }
});
assert.equal(noSummaryTurn.commandLogSummaryResult, null);
assert.equal(noSummaryHost.generation.calls().length, 0);
assert.equal(noSummaryTurn.campaignState.commandLog.entries.at(-1).assistedSummary, undefined);
const noSummaryNarration = await noSummaryApp.generateNarrationForLastTurn();
assert.equal(noSummaryNarration.ok, true);
assert.equal(noSummaryHost.generation.calls().length, 1);
assert.equal(noSummaryHost.generation.calls()[0].role, 'narration');
const noSummaryFlush = await noSummaryApp.flushChatSidecars();
assert.equal(noSummaryFlush.commandLogSummaryResult, null);
assert.equal(noSummaryHost.generation.calls().filter((entry) => entry.role === 'commandLogSummarizer').length, 0);

console.log('Runtime host injection tests passed: host metadata, Command Log summary sidecar, factual review, no-generation summary suppression, and narration');
