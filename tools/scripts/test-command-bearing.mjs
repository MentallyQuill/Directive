import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  applyCommandMarkAwards,
  attachReadiedCommandBearingPoint,
  cancelReadiedCommandBearingPoint,
  createCommandBearingInterventionPrompt,
  evaluateCommandBearingSpend,
  improveOutcomeByCommandPoint,
  migrateCommandBearingState,
  planCommandBearingClosureReviews,
  planCommandBearingStateClosureReviews,
  projectCommandBearingForPlayer,
  readyCommandBearingPoint,
  recoverCommandBearing,
  refreshCommandBearing,
  spendCommandBearingPoint,
  validateCommandBearingClosureCandidate,
  validateCommandBearingClosureSignal,
  validateCommandBearingEvidenceProposal,
  validateCommandBearingProjection,
  validateCommandBearingRelationshipPerceptionProposal,
  validateCommandBearingReviewProposal,
  validateCommandBearingSpendCommit
} from '../../src/command/command-bearing.mjs';
import {
  parseCommandBearingEvidenceProposalOutput,
  parseCommandBearingReviewProposalOutput
} from '../../src/jobs/sidecar-output-contracts.mjs';
import { validateCommandBearingReadiedSpendFit } from '../../src/command/command-bearing-fit.mjs';
import { runCommandBearingClosureReview } from '../../src/command/command-bearing-review.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');

let command = refreshCommandBearing(projection.initialState.commandStyle);
assert.equal(command.version, 1);
assert.equal(command.tracks.inspiration.rank, 1);
assert.equal(command.inspiration.rank, 1);
assert.equal(command.resolve.rank, 1);
assert.equal(command.reserve.capacity, 1);
assert.deepEqual(command.evidenceLedger.records, []);
assert.deepEqual(command.reviewLedger.records, []);

const migrated = migrateCommandBearingState({ commandStyle: projection.initialState.commandStyle });
assert.equal(migrated.tracks.resolve.rank, 1);

command = applyCommandMarkAwards(command, [{
  track: 'Resolve',
  decisionId: 'command.test.1',
  summary: 'The commander accepted responsibility for a bounded delay.'
}]);
assert.equal(command.resolve.marks, 1);
assert.equal(command.resolve.rank, 1);
assert.equal(command.resolve.rankTitle, 'Practiced');

command = applyCommandMarkAwards(command, [{
  track: 'Resolve',
  decisionId: 'command.test.1',
  summary: 'Duplicate awards do not add Marks.'
}]);
assert.equal(command.resolve.marks, 1, 'duplicate award source must not add another Mark');

command = applyCommandMarkAwards(command, [{
  track: 'Inspiration',
  decisionId: 'command.test.1',
  summary: 'The same command decision can also demonstrate Inspiration once.'
}]);
assert.equal(command.inspiration.marks, 1, 'same decision can award the other Command Bearing track');
assert.equal(command.resolve.marks, 1, 'dual-track award must not duplicate the existing Resolve Mark');

command = applyCommandMarkAwards(command, [{
  track: 'Resolve',
  decisionId: 'command.test.2',
  summary: 'The commander set a credible boundary.'
}]);
assert.equal(command.resolve.marks, 2);
assert.equal(command.resolve.rank, 2);
assert.equal(command.resolve.rankTitle, 'Established');
assert.equal(command.resolve.pointCap, 1);

command = applyCommandMarkAwards(command, [
  { track: 'Resolve', decisionId: 'command.test.3', summary: 'Sustained commitment.' },
  { track: 'Resolve', decisionId: 'command.test.4', summary: 'Prepared contingency.' },
  { track: 'Resolve', decisionId: 'command.test.5', summary: 'Public accountability.' }
]);
assert.equal(command.resolve.marks, 5);
assert.equal(command.resolve.rank, 3);
assert.equal(command.resolve.rankTitle, 'Proven');
assert.equal(command.resolve.pointCap, 2);
assert.equal(command.reserve.capacity, 2);

let recovery = recoverCommandBearing(command, {
  recoveryId: 'recovery.duty-cycle.001',
  track: 'Resolve'
});
assert.equal(recovery.applied, true);
command = recovery.commandStyle;
assert.equal(command.resolve.points, 1);
assert.equal(command.reserve.lastRecoveryId, 'recovery.duty-cycle.001');

recovery = recoverCommandBearing(command, {
  recoveryId: 'recovery.duty-cycle.001',
  track: 'Resolve'
});
assert.equal(recovery.applied, false);
assert.equal(recovery.commandStyle.resolve.points, 1);

recovery = recoverCommandBearing(command, {
  recoveryId: 'recovery.duty-cycle.002',
  track: 'Resolve'
});
assert.equal(recovery.applied, true);
command = recovery.commandStyle;
assert.equal(command.resolve.points, 2);

recovery = recoverCommandBearing(command, {
  recoveryId: 'recovery.duty-cycle.003',
  track: 'Inspiration'
});
assert.equal(recovery.applied, false, 'shared reserve cap prevents extra points');
assert.equal(recovery.commandStyle.inspiration.points, 0);

assert.equal(improveOutcomeByCommandPoint('Great Failure'), 'Partial Failure');
assert.equal(improveOutcomeByCommandPoint('Failure'), 'Partial Success');
assert.equal(improveOutcomeByCommandPoint('Partial Failure'), 'Success');
assert.equal(improveOutcomeByCommandPoint('Partial Success'), 'Great Success');

const eligibility = evaluateCommandBearingSpend(command, {
  outcomeId: 'outcome.command-bearing.test',
  resultBand: 'Partial Success',
  eligibleTracks: ['Resolve'],
  rationale: {
    resolve: 'The commander has lawful authority and accepted the cost.'
  }
});
assert.equal(eligibility.eligible, true);
assert.equal(eligibility.options[0].to, 'Great Success');

const prompt = createCommandBearingInterventionPrompt(command, {
  outcomeId: 'outcome.command-bearing.test',
  resultBand: 'Partial Success',
  eligibleTracks: ['Resolve'],
  rationale: {
    resolve: 'The commander has lawful authority and accepted the cost.'
  }
});
assert.equal(prompt.eligible, true);
assert.deepEqual(prompt.actions.map((action) => action.label), ['Use Resolve', 'Accept Outcome']);

const spend = spendCommandBearingPoint(command, {
  outcomeId: 'outcome.command-bearing.test',
  track: 'Resolve',
  resultBand: 'Partial Success',
  eligibleTracks: ['Resolve'],
  rationale: 'The commander has lawful authority and accepted the cost.'
});
assert.equal(spend.applied, true);
assert.equal(spend.to, 'Great Success');
assert.equal(spend.commandStyle.resolve.points, 1);
assert.equal(spend.commandStyle.spendLedger['outcome.command-bearing.test'].track, 'resolve');

const duplicateSpend = spendCommandBearingPoint(spend.commandStyle, {
  outcomeId: 'outcome.command-bearing.test',
  track: 'Resolve',
  resultBand: 'Partial Success',
  eligibleTracks: ['Resolve']
});
assert.equal(duplicateSpend.applied, false);

const successEligibility = evaluateCommandBearingSpend(spend.commandStyle, {
  outcomeId: 'outcome.command-bearing.success',
  resultBand: 'Success',
  eligibleTracks: ['Resolve']
});
assert.equal(successEligibility.eligible, false);

let readied = readyCommandBearingPoint(spend.commandStyle, {
  readiedId: 'readied.resolve.001',
  track: 'Resolve',
  saveId: 'save-1',
  chatId: 'chat-1',
  createdAt: '2026-06-25T00:00:00.000Z'
});
assert.equal(readied.applied, true);
assert.equal(readied.commandBearing.readied.track, 'resolve');
assert.equal(readied.commandBearing.tracks.resolve.points, 1, 'readying does not deduct a point');

let attached = attachReadiedCommandBearingPoint(readied.commandBearing, {
  readiedId: 'readied.resolve.001',
  ingressId: 'ingress-1',
  hostMessageId: '42',
  chatId: 'chat-1'
});
assert.equal(attached.applied, true);
assert.equal(attached.commandBearing.readied.status, 'attached');
assert.equal(attached.commandBearing.readied.ingressId, 'ingress-1');

const validSpendCommit = validateCommandBearingSpendCommit({
  outcomeId: 'outcome.readied.001',
  ingressId: 'ingress-1',
  readiedId: 'readied.resolve.001',
  track: 'resolve',
  from: 'Failure',
  to: 'Partial Success',
  fit: 'strong',
  causalBasis: ['The player accepted responsibility for a lawful order.']
}, {
  commandBearing: attached.commandBearing,
  readied: attached.commandBearing.readied,
  ingressId: 'ingress-1',
  chatId: 'chat-1',
  outcomeId: 'outcome.readied.001'
});
assert.equal(validSpendCommit.accepted, true);

const noProviderSpendFit = await validateCommandBearingReadiedSpendFit({
  track: 'resolve',
  inputText: 'I hold position, accept the exposure, and keep the convoy covered.',
  generationRouter: null
});
assert.equal(noProviderSpendFit.valid, false, 'post-send spend validation must fail closed without a provider route');
assert.equal(noProviderSpendFit.source, 'provider-unavailable-closed');

const hiddenLeakSpendFit = await validateCommandBearingReadiedSpendFit({
  track: 'resolve',
  inputText: 'I hold position, accept the exposure, and keep the convoy covered.',
  generationRouter: {
    generate: async () => ({
      ok: true,
      response: {
        content: {
          kind: 'directive.commandBearingFitCheck',
          track: 'resolve',
          fit: 'strong',
          valid: true,
          summary: 'The hidden relationship score says this should work.'
        }
      }
    })
  }
});
assert.equal(hiddenLeakSpendFit.valid, false, 'hidden-leaking spend validation must fail closed');
assert.equal(hiddenLeakSpendFit.source, 'provider-invalid-closed');

const invalidSpendCommit = validateCommandBearingSpendCommit({
  outcomeId: 'outcome.readied.001',
  ingressId: 'ingress-1',
  readiedId: 'readied.resolve.001',
  track: 'resolve',
  from: 'Failure',
  to: 'Success'
}, {
  commandBearing: attached.commandBearing,
  readied: attached.commandBearing.readied,
  ingressId: 'ingress-1',
  chatId: 'chat-1',
  outcomeId: 'outcome.readied.001'
});
assert.equal(invalidSpendCommit.accepted, false, 'Readied spend must improve exactly two bands');

const canceled = cancelReadiedCommandBearingPoint(attached.commandBearing, {
  readiedId: 'readied.resolve.001'
});
assert.equal(canceled.applied, true);
assert.equal(canceled.commandBearing.readied, null);

const closureSignal = validateCommandBearingClosureSignal({
  closureSignals: {
    possibleClosure: true,
    confidence: 'medium',
    closureTypes: ['thread'],
    playerFacingReason: 'The exchange appears to be wrapping the staff disagreement.'
  }
});
assert.equal(closureSignal.accepted, true);

const utilityOnlyClosure = validateCommandBearingClosureCandidate({
  closureId: 'closure.thread.cross.1',
  closureType: 'thread',
  source: 'utilityClosureSignal',
  proof: ['Utility suggested closure'],
  reviewEligible: true
});
assert.equal(utilityOnlyClosure.accepted, false, 'Utility signal alone cannot prove closure');

const provenClosure = validateCommandBearingClosureCandidate({
  closureId: 'closure.thread.cross.1',
  closureType: 'thread',
  source: 'committedState',
  proof: ['thread status changed to closed'],
  reviewEligible: true,
  evidenceIds: ['bearing-evidence.001']
});
assert.equal(provenClosure.accepted, true);

const plannedClosure = planCommandBearingClosureReviews({
  commandBearing: {
    evidenceLedger: {
      records: [{
        id: 'bearing-evidence.thread.cross.resolve',
        sourceOutcomeId: 'outcome.evidence.thread.cross',
        threadId: 'thread.cross',
        primarySignal: 'resolve',
        trackSignals: ['resolve'],
        strength: 'strong',
        criteria: { agency: true, commitment: true, causality: true },
        actionSummary: 'Accepted the cost of delaying launch.',
        consequenceSummary: 'The ship kept technical integrity.',
        playerFacingSummary: 'This showed Resolve through disciplined command.',
        visible: true,
        status: 'open'
      }, {
        id: 'bearing-evidence.thread.other.resolve',
        sourceOutcomeId: 'outcome.evidence.thread.other',
        threadId: 'thread.other',
        primarySignal: 'resolve',
        trackSignals: ['resolve'],
        strength: 'moderate',
        criteria: { agency: true, commitment: true, causality: true },
        actionSummary: 'Handled another issue.',
        playerFacingSummary: 'This belongs to a different thread.',
        visible: true,
        status: 'open'
      }]
    }
  },
  threadClosureReviews: [{
    id: 'closure.thread.cross.1',
    threadId: 'thread.cross',
    status: 'resolved',
    summary: 'The Cross warning thread resolved after a grounded command decision.',
    sourceOutcomeId: 'outcome.evidence.thread.cross'
  }],
  closureSignals: {
    possibleClosure: true,
    closureTypes: ['thread']
  }
});
assert.equal(plannedClosure.closureCandidates.length, 1);
assert.equal(plannedClosure.reviewQueue.length, 1);
assert.deepEqual(plannedClosure.reviewQueue[0].evidenceIds, ['bearing-evidence.thread.cross.resolve']);
assert.equal(plannedClosure.reviewQueue[0].utilitySuggested, true);

const stateClosurePlan = planCommandBearingStateClosureReviews({
  previousState: {
    questLedger: {
      instances: [{ id: 'chapter-1-test', templateId: 'chapter-1-test', kind: 'chapter', title: 'Chapter Test', status: 'active' }]
    },
    storyArcLedger: {
      arcs: [{ id: 'arc.test', status: 'active' }],
      milestones: [{ id: 'milestone.test', arcId: 'arc.test', status: 'available' }]
    }
  },
  currentState: {
    commandBearing: refreshCommandBearing({
      evidenceLedger: {
        records: [
          {
            id: 'bearing-evidence.chapter.resolve',
            sourceOutcomeId: 'outcome.chapter.resolve',
            sourceTurnId: 'turn.chapter.resolve',
            questId: 'chapter-1-test',
            chapterId: 'chapter-1-test',
            primarySignal: 'resolve',
            trackSignals: ['resolve'],
            strength: 'strong',
            criteria: { agency: true, commitment: true, causality: true },
            actionSummary: 'Closed the chapter with a lawful command burden.',
            consequenceSummary: 'The chapter reached resolution with a visible cost.',
            playerFacingSummary: 'This may support Resolve at chapter closure.',
            visible: true,
            status: 'open'
          },
          {
            id: 'bearing-evidence.arc.inspiration',
            sourceOutcomeId: 'outcome.arc.inspiration',
            sourceTurnId: 'turn.arc.inspiration',
            arcId: 'arc.test',
            primarySignal: 'inspiration',
            trackSignals: ['inspiration'],
            strength: 'moderate',
            criteria: { agency: true, commitment: true, causality: true },
            actionSummary: 'Built shared purpose across the arc.',
            consequenceSummary: 'The arc closed with crew alignment intact.',
            playerFacingSummary: 'This may support Inspiration at arc closure.',
            visible: true,
            status: 'open'
          }
        ]
      }
    }),
    questLedger: {
      instances: [{ id: 'chapter-1-test', templateId: 'chapter-1-test', kind: 'chapter', title: 'Chapter Test', status: 'resolved', outcomeId: 'outcome.chapter.resolve' }]
    },
    storyArcLedger: {
      arcs: [{ id: 'arc.test', status: 'complete' }],
      milestones: [{ id: 'milestone.test', arcId: 'arc.test', status: 'complete' }]
    }
  },
  closureSignals: {
    possibleClosure: true,
    confidence: 'high',
    closureTypes: ['chapter', 'storyArc', 'milestone'],
    playerFacingReason: 'The chapter and arc have reached closure.'
  }
});
assert(stateClosurePlan.reviewQueue.some((item) => item.closureType === 'chapter' && item.evidenceIds.includes('bearing-evidence.chapter.resolve')));
assert(stateClosurePlan.reviewQueue.some((item) => item.closureType === 'storyArc' && item.evidenceIds.includes('bearing-evidence.arc.inspiration')));
assert(stateClosurePlan.reviewQueue.some((item) => item.closureType === 'milestone' && item.evidenceIds.includes('bearing-evidence.arc.inspiration')));

const alreadyReviewedClosure = planCommandBearingClosureReviews({
  commandBearing: {
    evidenceLedger: {
      records: [{
        id: 'bearing-evidence.thread.cross.resolve',
        sourceOutcomeId: 'outcome.evidence.thread.cross',
        threadId: 'thread.cross',
        primarySignal: 'resolve',
        trackSignals: ['resolve'],
        strength: 'strong',
        criteria: { agency: true, commitment: true, causality: true },
        actionSummary: 'Accepted the cost of delaying launch.',
        playerFacingSummary: 'This showed Resolve through disciplined command.',
        visible: true,
        status: 'open'
      }]
    },
    reviewLedger: {
      reviewedClosureIds: {
        'closure.thread.cross.1': true
      }
    }
  },
  threadClosureReviews: [{
    id: 'closure.thread.cross.1',
    threadId: 'thread.cross',
    status: 'resolved',
    summary: 'Duplicate closure.'
  }]
});
assert.equal(alreadyReviewedClosure.reviewQueue.length, 0, 'reviewed closures must not queue another Mark Review');
assert.equal(
  alreadyReviewedClosure.diagnostics[0].rejectionCodes.includes('DIRECTIVE_COMMAND_BEARING_CLOSURE_DUPLICATE'),
  true
);

const evidence = validateCommandBearingEvidenceProposal({
  evidence: [{
    id: 'bearing-evidence.001',
    sourceOutcomeId: 'outcome.evidence.001',
    sourceTurnId: 'turn.evidence.001',
    threadId: 'thread.cross',
    primarySignal: 'resolve',
    trackSignals: ['resolve'],
    strength: 'strong',
    criteria: { agency: true, commitment: true, causality: true },
    actionSummary: 'Accepted Cross warning and delayed launch.',
    consequenceSummary: 'Lost time, protected ship capability.',
    playerFacingSummary: 'This showed Resolve through discipline and accepted cost.',
    visible: true
  }]
}, {
  sourceOutcomeId: 'outcome.evidence.001',
  sourceTurnId: 'turn.evidence.001',
  suppliedThreadIds: ['thread.cross']
});
assert.equal(evidence.accepted, true);
assert.equal(evidence.records[0].primarySignal, 'resolve');

const evidenceCannotAward = validateCommandBearingEvidenceProposal({
  markAwarded: true,
  evidence: []
}, {
  sourceOutcomeId: 'outcome.evidence.002'
});
assert.equal(evidenceCannotAward.accepted, false);

const review = validateCommandBearingReviewProposal({
  closureId: 'closure.thread.cross.1',
  markAwarded: true,
  awardedTrack: 'resolve',
  criteriaSatisfied: { agency: true, commitment: true, causality: true },
  evidenceIds: ['bearing-evidence.001'],
  awardSummary: 'The commander protected technical integrity under pressure.'
}, {
  closureId: 'closure.thread.cross.1',
  suppliedEvidenceIds: ['bearing-evidence.001'],
  commandBearing: command
});
assert.equal(review.accepted, true);
assert.equal(review.records[0].awardedTrack, 'resolve');

const noAwardReview = validateCommandBearingReviewProposal({
  closureId: 'closure.thread.cross.2',
  markAwarded: false,
  awardedTrack: null,
  criteriaSatisfied: { agency: true, commitment: false, causality: true },
  evidenceIds: ['bearing-evidence.002'],
  noAwardReason: 'The decisive result came from prior crew preparation.'
}, {
  closureId: 'closure.thread.cross.2',
  suppliedEvidenceIds: ['bearing-evidence.002'],
  commandBearing: command
});
assert.equal(noAwardReview.accepted, true);

const perception = validateCommandBearingRelationshipPerceptionProposal({
  playerPerceptions: [{
    crewId: 'imani-cross',
    dimension: 'professional_confidence',
    playerFacingImpact: 'Slight Improvement',
    perceivedByCharacter: {
      clarity: 'clear',
      cue: 'Cross stopped pressing the warning once the delay was accepted.',
      summary: 'The commander may notice that Cross treats the decision as technically grounded.'
    },
    sourceOutcomeId: 'outcome.evidence.001'
  }]
}, {
  suppliedCrewIds: ['imani-cross'],
  sourceOutcomeId: 'outcome.evidence.001'
});
assert.equal(perception.accepted, true);

const unsafeProjection = validateCommandBearingProjection({
  summary: 'hidden relationship score increased'
});
assert.equal(unsafeProjection.accepted, false);

const projected = projectCommandBearingForPlayer(command);
assert.equal(projected.tracks.resolve.label, 'Resolve');
assert.equal(projected.guards.rawValuesHidden, true);

const parsedEvidence = parseCommandBearingEvidenceProposalOutput(JSON.stringify({
  evidence: [{
    sourceOutcomeId: 'outcome.evidence.003',
    primarySignal: 'inspiration',
    trackSignals: ['inspiration'],
    strength: 'moderate',
    criteria: { agency: true, commitment: true, causality: true },
    actionSummary: 'Built consensus before assigning the watch.',
    consequenceSummary: 'The staff accepted the plan without a dignity cost.',
    playerFacingSummary: 'This showed Inspiration through trust and shared purpose.',
    visible: true
  }]
}), {
  sourceOutcomeId: 'outcome.evidence.003'
});
assert.equal(parsedEvidence.ok, true);
assert.equal(parsedEvidence.value[0].primarySignal, 'inspiration');

const rejectedReview = parseCommandBearingReviewProposalOutput({
  closureId: 'closure.thread.hidden.1',
  markAwarded: true,
  awardedTrack: 'resolve',
  criteriaSatisfied: { agency: true, commitment: true, causality: true },
  evidenceIds: ['bearing-evidence.hidden'],
  awardSummary: 'Resolve increased because a hidden relationship score changed.'
}, {
  closureId: 'closure.thread.hidden.1',
  suppliedEvidenceIds: ['bearing-evidence.hidden'],
  commandBearing: command
});
assert.equal(rejectedReview.ok, false, 'sidecar parser must reject hidden-leaking review output');

const reviewRunnerState = {
  commandBearing: refreshCommandBearing({
    evidenceLedger: {
      records: [{
        id: 'bearing-evidence.runner.resolve',
        sourceOutcomeId: 'outcome.runner.resolve',
        sourceTurnId: 'turn.runner.resolve',
        threadId: 'thread.runner.resolve',
        primarySignal: 'resolve',
        trackSignals: ['resolve'],
        strength: 'strong',
        criteria: { agency: true, commitment: true, causality: true },
        actionSummary: 'Held the line on lawful evacuation order.',
        consequenceSummary: 'The crew absorbed delay while civilians cleared the bay.',
        playerFacingSummary: 'This may support Resolve because the commander accepted a cost to keep the order lawful.',
        visible: true,
        status: 'open'
      }]
    }
  })
};
const reviewRunnerCalls = [];
const reviewRunnerAccepted = await runCommandBearingClosureReview({
  campaignState: reviewRunnerState,
  reviewQueueItem: {
    closureId: 'closure.thread.runner.resolve.1',
    closureType: 'thread',
    source: 'threadLedger',
    evidenceIds: ['bearing-evidence.runner.resolve'],
    closureSummary: 'The evacuation thread reached a lawful stopping point.'
  },
  generationRouter: {
    async generate(roleId, request) {
      reviewRunnerCalls.push({ roleId, request });
      return {
        ok: true,
        response: {
          text: JSON.stringify({
            closureId: 'closure.thread.runner.resolve.1',
            markAwarded: true,
            awardedTrack: 'resolve',
            criteriaSatisfied: { agency: true, commitment: true, causality: true },
            evidenceIds: ['bearing-evidence.runner.resolve'],
            awardSummary: 'The commander accepted a real delay to keep evacuation authority lawful.'
          })
        },
        diagnostics: { providerId: 'fake-command-bearing-reviewer' }
      };
    }
  }
});
assert.equal(reviewRunnerAccepted.ok, true);
assert.equal(reviewRunnerAccepted.reviewRecord.awardedTrack, 'resolve');
assert.equal(reviewRunnerCalls[0].roleId, 'commandBearingEvaluator');
assert.match(reviewRunnerCalls[0].request.prompt, /Agency, Commitment, and Causality/);

const reviewRunnerRejected = await runCommandBearingClosureReview({
  campaignState: reviewRunnerState,
  reviewQueueItem: {
    closureId: 'closure.thread.runner.resolve.2',
    closureType: 'thread',
    source: 'threadLedger',
    evidenceIds: ['bearing-evidence.runner.resolve'],
    closureSummary: 'A second closure should fail on hidden text.'
  },
  generationRouter: {
    async generate() {
      return {
        ok: true,
        response: {
          text: JSON.stringify({
            closureId: 'closure.thread.runner.resolve.2',
            markAwarded: true,
            awardedTrack: 'resolve',
            criteriaSatisfied: { agency: true, commitment: true, causality: true },
            evidenceIds: ['bearing-evidence.runner.resolve'],
            awardSummary: 'Resolve rises because a hidden relationship score improved.'
          })
        }
      };
    }
  }
});
assert.equal(reviewRunnerRejected.ok, false);
assert.equal(reviewRunnerRejected.status, 'rejected');

console.log('Command Bearing tests passed: commandBearing migration, Marks, ranks, Recovery, reserve caps, Readied points, spend validation, proposal validators, sidecar proposal parsers, and player projection');
