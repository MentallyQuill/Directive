import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { applyPressureLedgerDelta } from '../../src/pressures/pressure-ledger.mjs';
import { buildPressureLedgerDeltaForTurn } from '../../src/pressures/pressure-seeding.mjs';
import { escalateIgnoredPressures, suppressPressure } from '../../src/pressures/pressure-cooldowns.mjs';
import { selectSideMissionCandidates } from '../../src/pressures/side-mission-candidates.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function recordIds(ledger) {
  return (ledger.records || []).map((record) => record.id);
}

function flagValue(state, flagId) {
  return (state.mission?.outcomeFlags || []).find((flag) => flag.id === flagId)?.value;
}

function setFlag(state, flagId, value) {
  const flag = (state.mission?.outcomeFlags || []).find((item) => item.id === flagId);
  if (!flag) throw new Error(`Missing flag "${flagId}"`);
  flag.value = value;
}

function assertHiddenTermsAbsent(value) {
  const text = JSON.stringify(value).toLowerCase();
  for (const term of [
    'lantern',
    'compact recovery team',
    'no pathogen',
    'forged starfleet signals',
    'transponder modules'
  ]) {
    assert.equal(text.includes(term), false, `must not leak hidden term "${term}"`);
  }
}

const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.starship-package.json');

const preludeState = cloneJson(projection.initialState);
preludeState.player.name = 'Talia Serrin';
preludeState.player.creationStatus = 'ready';
preludeState.mission.activePhaseId = 'final-command-review';
preludeState.mission.phase = 'final-command-review';
setFlag(preludeState, 'prelude.ship-state', 'complete-with-accepted-limitation');
setFlag(preludeState, 'prelude.bronn', 'debate-not-closed');
setFlag(preludeState, 'prelude.priya', 'approval-bottlenecked');
setFlag(preludeState, 'prelude.hesperus-resolution', 'passengers-transferred');

const delta = buildPressureLedgerDeltaForTurn({
  campaignState: preludeState,
  outcomePacket: {
    id: 'outcome.pressure.final-review',
    resultBand: 'Success',
    summary: 'Final review completed.',
    costs: [],
    revealedFactIds: [],
    commandDecisionAwards: []
  },
  intentParse: {
    primaryIntent: 'complete-final-command-review',
    signals: {}
  }
});

applyPressureLedgerDelta(preludeState, delta);
assert.equal(preludeState.pressureLedger.rawValuesHidden, true);
assert.ok(recordIds(preludeState.pressureLedger).includes('pressure.ship.imani-technical-debt'));
assert.ok(recordIds(preludeState.pressureLedger).includes('pressure.crew.bronn-fallback-command'));
assert.ok(recordIds(preludeState.pressureLedger).includes('pressure.crew.priya-coordination-network'));
assert.ok(recordIds(preludeState.pressureLedger).includes('pressure.obligation.hesperus-follow-up'));
assert.equal(preludeState.pressureLedger.records.length >= 4, true);
assert.equal(flagValue(preludeState, 'prelude.ship-state'), 'complete-with-accepted-limitation');
assertHiddenTermsAbsent(preludeState.pressureLedger.records.map((record) => record.playerSummary));

const saveLoaded = cloneJson(preludeState);
assert.deepEqual(recordIds(saveLoaded.pressureLedger), recordIds(preludeState.pressureLedger), 'pressure survives JSON save/load clone');

const branchState = cloneJson(saveLoaded);
branchState.campaign.id = 'branch-pressure-test';
assert.deepEqual(recordIds(branchState.pressureLedger), recordIds(preludeState.pressureLedger), 'pressure survives branch clone');

const beforeOpenOrders = cloneJson(preludeState);
beforeOpenOrders.mainCampaign.completedChapters = ['prelude-a-ship-underway', 'chapter-1-the-empty-convoy'];
const earlyReview = selectSideMissionCandidates({
  campaignState: beforeOpenOrders,
  packageData
});
assert.equal(earlyReview.candidates.length, 0);
assert.equal(
  earlyReview.waiting.some((item) => item.sideAssignmentId === 'side-the-long-repair' && /chapter-2-false-colors/.test(item.reason)),
  true,
  'pressure remains active but ineligible before Open Orders I'
);

const openOrdersState = cloneJson(preludeState);
openOrdersState.mainCampaign.completedChapters = ['prelude-a-ship-underway', 'chapter-1-the-empty-convoy', 'chapter-2-false-colors'];
openOrdersState.mainCampaign.availableChapters = ['open-orders-1-work-worth-doing'];
const review = selectSideMissionCandidates({
  campaignState: openOrdersState,
  packageData
});
assert.equal(review.generatedFrom, 'package-authored-open-orders');
assert.equal(review.candidates.length > 0, true);
assert.equal(review.candidates.length <= 2, true);
assert.equal(
  review.candidates.some((candidate) => ['side-the-long-repair', 'side-quiet-channels'].includes(candidate.sideAssignmentId)),
  true,
  'first Open Orders review should qualify an authored Imani or Priya pressure candidate'
);
assert.equal(review.candidates.every((candidate) => candidate.reason.includes('available because')), true);
assertHiddenTermsAbsent(review);

const suppressedLedger = suppressPressure(openOrdersState.pressureLedger, {
  pressureId: 'pressure.ship.imani-technical-debt',
  suppressedUntilChapterId: 'chapter-3-dead-letters',
  reason: 'Player chose not now during Open Orders review.'
});
assert.equal(recordIds(suppressedLedger).includes('pressure.ship.imani-technical-debt'), true);
assert.equal(
  suppressedLedger.records.find((record) => record.id === 'pressure.ship.imani-technical-debt').status,
  'suppressed'
);
const suppressedReview = selectSideMissionCandidates({
  campaignState: { ...openOrdersState, pressureLedger: suppressedLedger },
  packageData
});
assert.equal(
  suppressedReview.candidates.some((candidate) => candidate.pressureId === 'pressure.ship.imani-technical-debt'),
  false
);
assert.equal(
  suppressedReview.suppressed.some((item) => item.pressureId === 'pressure.ship.imani-technical-debt'),
  true
);

const escalation = escalateIgnoredPressures(openOrdersState.pressureLedger, {
  pressureIds: ['pressure.ship.imani-technical-debt'],
  completedChapterId: 'chapter-2-false-colors',
  reason: 'Open Orders work was ignored after a campaign beat.'
});
const escalated = escalation.pressureLedger.records.find((record) => record.id === 'pressure.ship.imani-technical-debt');
assert.equal(escalated.escalationBand, 'escalation');
assert.equal(escalated.urgencyBand, 'high');
assert.equal(escalated.cooldown.ignoredBeatCount, 1);

console.log('Pressure ledger tests passed: seeding, save/load clone, branch clone, candidate selection, suppression, and escalation');
