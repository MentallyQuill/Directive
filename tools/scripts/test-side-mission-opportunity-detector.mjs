import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  detectPostChapter1SideMissionOpportunities,
  POST_CHAPTER_1_OPPORTUNITY_INTERVAL
} from '../../src/side-missions/opportunity-detector.mjs';
import { applySideMissionOpportunityReview } from '../../src/side-missions/opportunity-review.mjs';
import {
  applySideMissionOpportunityResolution,
  applySideMissionOpportunitySceneBeat,
  applySideMissionOpportunitySceneStart
} from '../../src/side-missions/opportunity-scene.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertHiddenTermsAbsent(value) {
  const text = JSON.stringify(value).toLowerCase();
  for (const term of [
    'pale lantern',
    'lantern escalation',
    'compact recovery team',
    'no pathogen',
    'forged starfleet signals',
    'stolen transponder',
    'transponder modules',
    'cargo tug',
    'hull projection',
    'local patrol schedules',
    'nightfall',
    'bioweapon',
    'kestrel'
  ]) {
    assert.equal(text.includes(term), false, `must not leak hidden term "${term}"`);
  }
}

function readText(filePath) {
  return fs.readFileSync(path.resolve(root, filePath), 'utf8');
}

function postChapter1BaseState() {
  return {
    campaign: {
      id: 'test-side-mission-opportunities',
      packageId: 'directive:starship-package:breckenridge-ashes-of-peace',
      status: 'active'
    },
    mainCampaign: {
      id: 'ashes-of-peace',
      chapterCursor: 'chapter-2-false-colors',
      completedChapters: ['prelude-a-ship-underway', 'chapter-1-the-empty-convoy'],
      availableChapters: ['chapter-2-false-colors'],
      lockedChapters: ['open-orders-1-work-worth-doing']
    },
    mission: {
      activeMissionId: 'chapter-1-the-empty-convoy',
      completedMissionId: 'chapter-1-the-empty-convoy',
      nextMissionId: 'chapter-2-false-colors',
      transitionStatus: 'chapter-2-pending',
      endState: 'chapter-1-transition-to-false-colors',
      knownFacts: [
        'chapter-1.emergency-transponder-hardware-manifest',
        'chapter-1.emergency-hardware-recovered-under-seal',
        'chapter-1.joint-incident-record-created',
        'chapter-1.starfleet-authentication-failure-acknowledged'
      ],
      hiddenFacts: [
        'chapter-1.truth.compact-recovery-team',
        'chapter-1.truth.no-pathogen'
      ],
      outcomeFlags: [
        { id: 'chapter-1.evidence-custody', value: 'preserved-initially' },
        { id: 'chapter-1.convoy-evidence', value: 'clean-chain-started' },
        { id: 'chapter-1.faraday-evidence-access', value: 'preserved-log-access' },
        { id: 'chapter-1.cargo-recovery-route', value: 'resolved-under-joint-record' },
        { id: 'chapter-1.recovered-hardware-status', value: 'recovered-under-joint-seal' },
        { id: 'chapter-1.incident-record-status', value: 'joint-record-created' },
        { id: 'chapter-1.quarantine-posture', value: 'bypassed' },
        { id: 'chapter-1.quarantine-confidence', value: 'exception-logged' },
        { id: 'chapter-1.rescue-urgency', value: 'accelerated-with-risk' },
        { id: 'chapter-1.parnell-rescue', value: 'risk-accepted' },
        { id: 'chapter-1.pell-contact', value: 'witness-cooperation-secured' },
        { id: 'chapter-1.pell-status', value: 'witness-recruited' },
        { id: 'chapter-1.compact-investigation-access', value: 'joint-access' }
      ]
    },
    pressureLedger: {
      records: [
        {
          id: 'pressure.obligation.convoy-evidence-custody',
          type: 'obligation',
          title: 'Convoy Evidence Custody',
          playerSummary: 'The convoy response created an evidence chain that must be protected through the next contact.',
          status: 'active',
          urgencyBand: 'medium',
          escalationBand: 'signal',
          sourceOutcomeId: 'outcome.chapter1.initial-response',
          lastUpdatedByOutcomeId: 'outcome.chapter1.hardware-recovery',
          linkedFactIds: ['chapter-1.quarantine-code-routing-mismatch'],
          tags: ['evidence', 'custody', 'chapter-1']
        },
        {
          id: 'pressure.obligation.quarantine-exception-review',
          type: 'obligation',
          title: 'Quarantine Exception Review',
          playerSummary: 'The quarantine exception has to be justified and contained after the immediate rescue order.',
          status: 'active',
          urgencyBand: 'high',
          escalationBand: 'escalation',
          sourceOutcomeId: 'outcome.chapter1.initial-response',
          lastUpdatedByOutcomeId: 'outcome.chapter1.first-contact',
          tags: ['medical', 'quarantine', 'accepted-risk', 'chapter-1']
        },
        {
          id: 'pressure.regional.convoy-first-impression',
          type: 'regional',
          title: 'Convoy First Impression',
          playerSummary: 'The first response to Relief Convoy Twelve now shapes regional confidence in Breckenridge command.',
          status: 'active',
          urgencyBand: 'medium',
          escalationBand: 'signal',
          sourceOutcomeId: 'outcome.chapter1.initial-response',
          tags: ['regional-trust', 'chapter-1']
        }
      ],
      candidateReviews: [],
      rawValuesHidden: true
    },
    commandLog: {
      entries: [
        {
          id: 'command-log.chapter1.hardware',
          sourceOutcomeId: 'outcome.chapter1.hardware-recovery',
          summaryInputs: ['Recovered emergency hardware under joint seal.'],
          visibleConsequences: ['Evidence custody and the joint incident record remain active follow-up work.']
        },
        {
          id: 'command-log.chapter1.quarantine',
          sourceOutcomeId: 'outcome.chapter1.initial-response',
          summaryInputs: ['Quarantine exception accepted during rescue.'],
          visibleConsequences: ['Medical review is required after the immediate crisis.']
        }
      ],
      summariesGeneratedFromCommittedStateOnly: true
    },
    sideMissions: {
      opportunityReviews: [],
      opportunityCooldowns: [],
      availableAssignments: [],
      completedAssignments: []
    }
  };
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.starship-package.json');

const earlyState = postChapter1BaseState();
earlyState.mainCampaign.completedChapters = ['prelude-a-ship-underway'];
earlyState.mission.completedMissionId = 'prelude-a-ship-underway';
earlyState.mission.endState = null;
const earlyReview = detectPostChapter1SideMissionOpportunities({
  campaignState: earlyState,
  packageData
});
assert.equal(earlyReview.candidates.length, 0);
assert.equal(earlyReview.packageGuard.eligible, false);
assert.equal(
  earlyReview.packageGuard.reasons.some((reason) => reason.includes(POST_CHAPTER_1_OPPORTUNITY_INTERVAL.afterChapterId)),
  true,
  'package interval guard should block pre-Chapter-1-completion state'
);

const weakState = postChapter1BaseState();
weakState.mission.knownFacts = [];
weakState.mission.outcomeFlags = [
  { id: 'chapter-1.evidence-custody', value: 'preserved-initially' }
];
weakState.pressureLedger.records = [];
weakState.commandLog.entries = [];
const weakReview = detectPostChapter1SideMissionOpportunities({
  campaignState: weakState,
  packageData
});
assert.equal(weakReview.packageGuard.eligible, true);
assert.equal(weakReview.candidates.length, 0);
assert.equal(
  weakReview.waiting.some((item) => item.opportunityId === 'chapter1-missing-hardware-audit' && item.score < item.threshold),
  true,
  'weak evidence signal should stay below presentation threshold'
);

const baseState = postChapter1BaseState();
const baseBefore = cloneJson(baseState);
const packageBefore = cloneJson(packageData);
const review = detectPostChapter1SideMissionOpportunities({
  campaignState: baseState,
  packageData,
  maxCandidates: 4
});
assert.equal(review.kind, 'directive.sideMissionOpportunityReview');
assert.equal(review.generatedFrom, 'deterministic-post-chapter-1');
assert.equal(review.modelCallsUsed, false);
assert.equal(review.packageGuard.eligible, true);
assert.equal(review.packageGuard.interval.id, POST_CHAPTER_1_OPPORTUNITY_INTERVAL.id);
assert.equal(review.rawValuesHidden, true);

const hardwareCandidate = review.candidates.find((candidate) => candidate.opportunityId === 'chapter1-missing-hardware-audit');
assert(hardwareCandidate, 'evidence/hardware side-mission candidate should be produced');
assert.equal(hardwareCandidate.scope, 'medium');
assert.equal(hardwareCandidate.score >= review.threshold, true);
assert.equal(hardwareCandidate.sourcePressureIds.includes('pressure.obligation.convoy-evidence-custody'), true);
assert.equal(hardwareCandidate.sourceFactIds.includes('chapter-1.emergency-hardware-recovered-under-seal'), true);
assert.equal(hardwareCandidate.sourceEventIds.includes('outcome.chapter1.hardware-recovery'), true);
assert.equal(hardwareCandidate.rawValuesHidden, true);

const quarantineCandidate = review.candidates.find((candidate) => candidate.opportunityId === 'chapter1-quarantine-review');
assert(quarantineCandidate, 'pressure/obligation side-mission candidate should be produced');
assert.equal(quarantineCandidate.scope, 'small');
assert.equal(quarantineCandidate.sourcePressureIds.includes('pressure.obligation.quarantine-exception-review'), true);
assert.equal(quarantineCandidate.sourceFlagIds.includes('chapter-1.quarantine-confidence'), true);
assert.equal(quarantineCandidate.sourceEventIds.includes('outcome.chapter1.initial-response'), true);

assertHiddenTermsAbsent(review);
assert.deepEqual(baseState, baseBefore, 'detector must not mutate campaign state');
assert.deepEqual(packageData, packageBefore, 'detector must not mutate package data');

const duplicateState = postChapter1BaseState();
duplicateState.sideMissions.opportunityReviews = [
  {
    id: 'opportunity-review.hardware',
    opportunityId: 'chapter1-missing-hardware-audit',
    cooldownKey: `${POST_CHAPTER_1_OPPORTUNITY_INTERVAL.id}:chapter1-missing-hardware-audit`,
    status: 'selected'
  }
];
const duplicateReview = detectPostChapter1SideMissionOpportunities({
  campaignState: duplicateState,
  packageData,
  maxCandidates: 4
});
assert.equal(
  duplicateReview.candidates.some((candidate) => candidate.opportunityId === 'chapter1-missing-hardware-audit'),
  false,
  'duplicate opportunity should not be emitted again'
);
assert.equal(
  duplicateReview.suppressed.some((item) => item.opportunityId === 'chapter1-missing-hardware-audit'),
  true,
  'duplicate opportunity should be reported as suppressed'
);
assert.equal(
  duplicateReview.candidates.some((candidate) => candidate.opportunityId === 'chapter1-quarantine-review'),
  true,
  'duplicate suppression for one opportunity must not block unrelated candidates'
);

const scheduleState = postChapter1BaseState();
const scheduleBefore = cloneJson(scheduleState);
const scheduled = applySideMissionOpportunityReview({
  campaignState: scheduleState,
  packageData,
  opportunityId: 'chapter1-missing-hardware-audit',
  decision: 'schedule',
  reviewId: 'opportunity-review.hardware-schedule',
  reviewedAt: '2026-06-19T16:30:00.000Z',
  maxCandidates: 4
});
assert.deepEqual(scheduleState, scheduleBefore, 'scheduling an opportunity must not mutate the input campaign state');
assert.equal(scheduled.kind, 'directive.committedSideMissionOpportunityReview');
assert.equal(scheduled.reviewRecord.status, 'scheduled');
assert.equal(scheduled.reviewRecord.opportunityId, 'chapter1-missing-hardware-audit');
assert.equal(scheduled.scheduledOpportunity.status, 'scheduled');
assert.equal(scheduled.scheduledOpportunity.title, 'Missing Hardware Audit');
assert.equal(
  scheduled.campaignState.sideMissions.scheduledOpportunities.some((item) => item.id === 'chapter1-missing-hardware-audit'),
  true,
  'scheduled opportunity should persist in campaign side mission state'
);
assert.equal(
  scheduled.campaignState.commandLog.entries.some((entry) => entry.type === 'sideMissionOpportunityReview'),
  true,
  'scheduling should write a player-facing Command Log row'
);
assertHiddenTermsAbsent(scheduled.reviewRecord);
assertHiddenTermsAbsent(scheduled.scheduledOpportunity);
const afterScheduleReview = detectPostChapter1SideMissionOpportunities({
  campaignState: scheduled.campaignState,
  packageData,
  maxCandidates: 4
});
assert.equal(
  afterScheduleReview.candidates.some((candidate) => candidate.opportunityId === 'chapter1-missing-hardware-audit'),
  false,
  'scheduled opportunity should not reappear as a fresh candidate'
);
assert.equal(
  afterScheduleReview.suppressed.some((item) => item.opportunityId === 'chapter1-missing-hardware-audit'),
  true,
  'scheduled opportunity should be reported as suppressed after review'
);

const sceneStarted = applySideMissionOpportunitySceneStart({
  campaignState: scheduled.campaignState,
  opportunityId: 'chapter1-missing-hardware-audit',
  sceneId: 'side-opportunity-scene.hardware-audit',
  sceneStartedAt: '2026-06-19T16:40:00.000Z',
  reason: 'Player opened this follow-up for scene framing.'
});
assert.equal(sceneStarted.kind, 'directive.committedSideMissionOpportunitySceneStart');
assert.equal(sceneStarted.sceneRecord.status, 'active');
assert.equal(sceneStarted.sceneBrief.rawValuesHidden, true);
assert.equal(
  sceneStarted.sceneBrief.expectedOutputs.includes('Name the responsible owner for the audit.'),
  true,
  'hardware audit follow-up should use deterministic scene framing'
);
assert.equal(
  sceneStarted.campaignState.commandLog.entries.some((entry) => entry.type === 'sideMissionOpportunityScene'),
  true,
  'opening a follow-up should write a player-facing scene Command Log row'
);
assertHiddenTermsAbsent(sceneStarted.sceneRecord);
assertHiddenTermsAbsent(sceneStarted.sceneBrief);

const sceneAdvanced = applySideMissionOpportunitySceneBeat({
  campaignState: sceneStarted.campaignState,
  opportunityId: 'chapter1-missing-hardware-audit',
  beatId: 'side-opportunity-scene-beat.hardware-audit.1',
  beatAt: '2026-06-19T16:45:00.000Z',
  playerIntent: 'Imani owns the inventory while Priya keeps the joint record synchronized.',
  approach: 'technical',
  reason: 'Player advanced the hardware audit follow-up.'
});
assert.equal(sceneAdvanced.sceneBeat.sequence, 1);
assert.equal(sceneAdvanced.sceneRecord.sceneBeats.length, 1);
assert.equal(sceneAdvanced.sceneRecord.sceneStatus, 'in-progress');
assert.equal(
  sceneAdvanced.campaignState.commandLog.entries.some((entry) => entry.type === 'sideMissionOpportunitySceneBeat'),
  true,
  'advancing a follow-up should write a player-facing scene beat Command Log row'
);
assertHiddenTermsAbsent(sceneAdvanced.sceneBeat);

const sceneResolved = applySideMissionOpportunityResolution({
  campaignState: sceneAdvanced.campaignState,
  opportunityId: 'chapter1-missing-hardware-audit',
  resolutionId: 'side-opportunity-resolution.hardware-audit',
  resolvedAt: '2026-06-19T16:50:00.000Z',
  outcomeBand: 'Success',
  assignmentMode: 'delegated',
  delegatedTo: 'Imani and Priya',
  reason: 'Player delegated the hardware audit with command-visible reporting.'
});
assert.equal(sceneResolved.kind, 'directive.committedSideMissionOpportunityResolution');
assert.equal(sceneResolved.resolutionRecord.status, 'completed');
assert.equal(sceneResolved.resolutionRecord.assignmentMode, 'delegated');
assert.equal(sceneResolved.resolutionRecord.delegatedTo, 'Imani and Priya');
assert.equal(
  sceneResolved.campaignState.sideMissions.completedOpportunities.some((item) => item.id === 'chapter1-missing-hardware-audit'),
  true,
  'resolved follow-up should persist in completed opportunity state'
);
assert.equal(
  sceneResolved.campaignState.commandLog.entries.some((entry) => entry.type === 'sideMissionOpportunityResolution'),
  true,
  'resolving a follow-up should write a player-facing resolution Command Log row'
);
assertHiddenTermsAbsent(sceneResolved.resolutionRecord);
assert.deepEqual(
  cloneJson(sceneResolved.campaignState).sideMissions.completedOpportunities,
  sceneResolved.campaignState.sideMissions.completedOpportunities,
  'completed follow-up state should survive JSON save/load clone'
);

const deferred = applySideMissionOpportunityReview({
  campaignState: postChapter1BaseState(),
  packageData,
  opportunityId: 'chapter1-quarantine-review',
  decision: 'defer',
  reviewId: 'opportunity-review.quarantine-defer',
  reviewedAt: '2026-06-19T16:35:00.000Z',
  maxCandidates: 4
});
assert.equal(deferred.reviewRecord.status, 'deferred');
assert.equal(deferred.scheduledOpportunity, null);
assert.equal(deferred.campaignState.sideMissions.scheduledOpportunities.length, 0);
assert.equal(
  deferred.campaignState.sideMissions.opportunityCooldowns.some((item) => (
    item.opportunityId === 'chapter1-quarantine-review'
    && item.suppressedUntilChapterId === 'open-orders-1-work-worth-doing'
  )),
  true,
  'deferred opportunity should create a cooldown through Open Orders I'
);
const afterDeferredReview = detectPostChapter1SideMissionOpportunities({
  campaignState: deferred.campaignState,
  packageData,
  maxCandidates: 4
});
assert.equal(
  afterDeferredReview.candidates.some((candidate) => candidate.opportunityId === 'chapter1-quarantine-review'),
  false,
  'deferred opportunity should not reappear while its cooldown is active'
);

const hiddenState = postChapter1BaseState();
hiddenState.commandLog.entries.push({
  id: 'command-log.chapter1.hidden-hardware',
  sourceOutcomeId: 'outcome.chapter1.hidden',
  summaryInputs: ['Pale Lantern hardware custody was mentioned in a bad source packet.'],
  visibleConsequences: ['Recovered hardware custody cannot be proposed from this packet.']
});
const hiddenReview = detectPostChapter1SideMissionOpportunities({
  campaignState: hiddenState,
  packageData,
  maxCandidates: 4
});
assert.equal(
  hiddenReview.candidates.some((candidate) => candidate.opportunityId === 'chapter1-missing-hardware-audit'),
  false,
  'hidden-source hardware candidate should be blocked'
);
assert.equal(
  hiddenReview.rejected.some((item) => item.opportunityId === 'chapter1-missing-hardware-audit'),
  true,
  'hidden-source hardware candidate should be reported as rejected'
);
assertHiddenTermsAbsent(hiddenReview.candidates);
assertHiddenTermsAbsent(hiddenReview.suppressed);
assertHiddenTermsAbsent(hiddenReview.rejected);

const clonedState = cloneJson(postChapter1BaseState());
const clonedBefore = cloneJson(clonedState);
detectPostChapter1SideMissionOpportunities({
  campaignState: clonedState,
  packageData,
  maxCandidates: 4
});
assert.deepEqual(clonedState, clonedBefore, 'detector must preserve JSON clone immutability');

const runtimeAppSource = readText('src/runtime/runtime-app.mjs');
assert.match(
  runtimeAppSource,
  /detectPostChapter1SideMissionOpportunities/,
  'runtime view should expose deterministic side-mission opportunity reviews'
);
assert.match(
  runtimeAppSource,
  /sideMissionOpportunityReview/,
  'runtime view should pass side-mission opportunity reviews to UI panels'
);
assert.match(
  runtimeAppSource,
  /applySideMissionOpportunityReview/,
  'runtime app should support committing side-mission opportunity review decisions'
);
assert.match(
  runtimeAppSource,
  /commitSideMissionOpportunityReview/,
  'runtime app should expose side-mission opportunity scheduling to the shell'
);
assert.match(
  runtimeAppSource,
  /applySideMissionOpportunitySceneStart/,
  'runtime app should support opening scheduled follow-up scenes'
);
assert.match(
  runtimeAppSource,
  /commitSideMissionOpportunityResolution/,
  'runtime app should expose scheduled follow-up resolution'
);

const missionPanelSource = readText('src/ui/mission-panel.js');
assert.match(
  missionPanelSource,
  /Follow-Up Opportunities/,
  'Mission panel should render player-safe follow-up opportunities'
);
assert.match(
  missionPanelSource,
  /Follow-Up Work/,
  'Mission panel should render scheduled and active follow-up state after player selection'
);
assert.match(
  missionPanelSource,
  /commitSideMissionOpportunityReview/,
  'Mission panel should provide player-facing schedule/defer controls'
);
assert.match(
  missionPanelSource,
  /Open Follow-Up/,
  'Mission panel should provide player-facing follow-up scene start controls'
);
assert.match(
  missionPanelSource,
  /Advance Follow-Up/,
  'Mission panel should provide player-facing follow-up scene beat controls'
);
assert.match(
  missionPanelSource,
  /Resolve Follow-Up/,
  'Mission panel should provide player-facing follow-up resolution controls'
);
assert.match(
  missionPanelSource,
  /candidate\.playerSummary/,
  'Mission panel should render candidate summaries instead of source ids'
);
assert.doesNotMatch(
  missionPanelSource,
  /candidate\.score|sourceEventIds|sourcePressureIds|sourceFlagIds|sourceFactIds|sourceCommandLogIds/,
  'Mission panel must not render detector scores or source ids'
);

console.log('Side-mission opportunity detector tests passed: interval guard, threshold gate, evidence/hardware candidate, pressure/obligation candidate, Schedule/Defer review persistence, follow-up scene lifecycle, duplicate suppression, hidden-source rejection, and clone immutability');
