import assert from 'node:assert/strict';

import {
  THREAD_EPISODE_FUNCTIONS,
  THREAD_SHAPES,
  THREAD_STATUSES,
  THREAD_TYPES,
  applyThreadLedgerDelta,
  createThreadLedger,
  invalidateThreadEvidenceByAnchorRange,
  normalizeThreadRecord,
  threadPlayerSummaries
} from '../../src/threads/thread-ledger.mjs';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertThrowsMessage(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.match(error.message, pattern);
    return true;
  });
}

function assertTextAbsent(value, terms) {
  const text = JSON.stringify(value).toLowerCase();
  for (const term of terms) {
    assert.equal(text.includes(term.toLowerCase()), false, `must not expose "${term}"`);
  }
}

assert.deepEqual(THREAD_STATUSES, [
  'observed',
  'latent',
  'watchlisted',
  'available',
  'engaged',
  'active',
  'resolved',
  'transformed',
  'dormant',
  'expired',
  'echo'
]);
assert.deepEqual(THREAD_SHAPES, ['vignette', 'recurring_detail', 'character_thread', 'side_assignment']);
assert.deepEqual(THREAD_EPISODE_FUNCTIONS, ['mirror', 'counterpoint', 'relief', 'aftermath', 'setup']);
assert.deepEqual(THREAD_TYPES, [
  'crew_growth',
  'interpersonal_relationship',
  'mentorship',
  'professional_dilemma',
  'humanitarian_assistance',
  'cultural_exchange',
  'scientific_curiosity',
  'shipboard_maintenance',
  'recovery_and_aftermath',
  'hobby_ritual_or_domestic_life',
  'light_comedy',
  'local_civilian_problem',
  'promise_debt_or_favor',
  'identity_and_belonging'
]);

const kieranCommandPreparation = {
  id: 'thread.kieran.command-preparation',
  status: 'latent',
  shape: 'character_thread',
  type: 'crew_growth',
  episodeFunction: 'counterpoint',
  source: {
    id: 'prelude.combined-load-test.03',
    type: 'scene',
    sceneId: 'combined-load-test'
  },
  participants: ['kieran-vale'],
  title: 'Kieran command preparation',
  playerSummary: 'Kieran is seeking extra simulator time after a difficult flight review.',
  observableSeed: 'Kieran requested additional simulator time immediately after criticism.',
  storyQuestion: 'Is Kieran responding to criticism as training, or as personal failure?',
  naturalTrigger: 'During quiet transit, Kieran asks to repeat a dangerous flight scenario under supervision.',
  supportingEvidence: [
    {
      id: 'evidence.kieran.sim-time',
      source: {
        id: 'prelude.combined-load-test.03',
        type: 'scene',
        anchorRange: { rangeHash: 'range.kieran.sim-time' }
      },
      summary: 'Requested additional simulator time after criticism.',
      tags: ['training']
    }
  ],
  bearingPotential: {
    eligible: true,
    inspirationAffordance: {
      strength: 'strong',
      basis: ['mentorship', 'honest disclosure']
    },
    resolveAffordance: {
      strength: 'moderate',
      basis: ['fitness-for-duty boundary']
    }
  },
  rawScores: {
    causalGrounding: 3,
    unresolvedCharge: 3,
    net: 15
  },
  hiddenFacts: [
    'Kieran is converting criticism into a private failure score.',
    'Unsafe safety margin request should remain Director-only until surfaced.'
  ]
};

const bronnTable = {
  id: 'thread.bronn.table',
  status: 'watchlisted',
  shape: 'recurring_detail',
  type: 'hobby_ritual_or_domestic_life',
  episodeFunction: 'relief',
  source: {
    id: 'prelude.off-duty-table.01',
    type: 'scene'
  },
  participants: ['hadrik-bronn'],
  title: "Bronn's table",
  playerSummary: "Bronn's off-duty tactical table is becoming a quiet shipboard ritual.",
  observableSeed: 'A junior officer asked whether the player wanted to join a short off-duty match.',
  storyQuestion: 'What does ordinary strategic play reveal about how Bronn mentors younger officers?',
  supportingEvidence: [
    {
      id: 'evidence.bronn.table',
      source: { id: 'prelude.off-duty-table.01', type: 'scene' },
      summary: 'A junior officer lingered near the tactical table after watch.',
      tags: ['off-duty']
    }
  ],
  rawScores: {
    net: 11
  }
};

const rawKieran = cloneJson(kieranCommandPreparation);
const normalizedKieran = normalizeThreadRecord(kieranCommandPreparation);
assert.deepEqual(kieranCommandPreparation, rawKieran, 'normalization must not mutate source thread record');
assert.equal(normalizedKieran.schemaVersion, undefined);
assert.equal(normalizedKieran.participantIds[0], 'kieran-vale');
assert.equal(normalizedKieran.supportingEvidence[0].source.anchorRange.rangeHash, 'range.kieran.sim-time');
assert.equal(normalizedKieran.evidence, normalizedKieran.supportingEvidence);
assert.equal(normalizedKieran.hiddenFacts, undefined, 'hidden facts must not be retained on normalized player-facing records');

assertThrowsMessage(
  () => normalizeThreadRecord({ ...kieranCommandPreparation, id: '' }),
  /Thread record id is required/
);
assertThrowsMessage(
  () => normalizeThreadRecord({ ...kieranCommandPreparation, status: 'bogus' }),
  /Unknown thread status/
);
assertThrowsMessage(
  () => normalizeThreadRecord({ ...kieranCommandPreparation, shape: 'bogus' }),
  /Unknown thread shape/
);
assertThrowsMessage(
  () => normalizeThreadRecord({ ...kieranCommandPreparation, type: 'bogus' }),
  /Unknown thread type/
);
const fallbackSource = normalizeThreadRecord({
  ...kieranCommandPreparation,
  source: { id: '' },
  supportingEvidence: []
});
assert.equal(fallbackSource.source.id, 'source.thread.kieran.command-preparation');
const fallbackStoryQuestion = normalizeThreadRecord({ ...kieranCommandPreparation, storyQuestion: '' });
assert.equal(
  fallbackStoryQuestion.storyQuestion,
  'Will this unresolved concern receive attention, and what will that attention change?'
);

const startingLedgerInput = {
  records: [kieranCommandPreparation, bronnTable],
  activationReviews: [],
  closureReviews: []
};
const startingLedgerSnapshot = cloneJson(startingLedgerInput);
const ledger = createThreadLedger(startingLedgerInput);
assert.deepEqual(startingLedgerInput, startingLedgerSnapshot, 'ledger creation must not mutate input');
assert.equal(ledger.schemaVersion, 2);
assert.equal(ledger.records.length, 2);

const reinforcedLedger = applyThreadLedgerDelta(ledger, {
  upsertRecords: [
    {
      ...kieranCommandPreparation,
      status: 'watchlisted',
      supportingEvidence: [
        {
          id: 'evidence.kieran.sim-time',
          source: {
            id: 'prelude.combined-load-test.03',
            type: 'scene',
            anchorRange: { rangeHash: 'range.kieran.sim-time' }
          },
          summary: 'Requested additional simulator time after criticism, then accepted supervision.',
          tags: ['training', 'supervised']
        },
        {
          id: 'evidence.kieran.sleep',
          source: { id: 'prelude.miriam-fatigue.01', type: 'scene' },
          summary: 'Miriam flagged that Kieran was sleeping poorly.',
          tags: ['fatigue']
        }
      ]
    }
  ]
});
const reinforcedKieran = reinforcedLedger.records.find((record) => record.id === 'thread.kieran.command-preparation');
assert.equal(reinforcedKieran.status, 'watchlisted');
assert.equal(
  reinforcedKieran.supportingEvidence.filter((item) => item.id === 'evidence.kieran.sim-time').length,
  1,
  'duplicate evidence id should merge'
);
assert.equal(reinforcedKieran.supportingEvidence.some((item) => item.id === 'evidence.kieran.sleep'), true);
assert.equal(ledger.records.find((record) => record.id === 'thread.kieran.command-preparation').status, 'latent');

const activeLedger = applyThreadLedgerDelta(reinforcedLedger, {
  transitions: [
    {
      threadId: 'thread.kieran.command-preparation',
      status: 'available',
      sourceOutcomeId: 'outcome.kieran.quiet-transit'
    },
    {
      threadId: 'thread.kieran.command-preparation',
      status: 'engaged',
      sourceOutcomeId: 'outcome.kieran.player-asks'
    },
    {
      threadId: 'thread.kieran.command-preparation',
      status: 'active',
      sourceOutcomeId: 'outcome.kieran.supervised-training'
    }
  ],
  activationReviewsAdd: [
    {
      threadId: 'thread.kieran.command-preparation',
      selected: true,
      sourceOutcomeId: 'outcome.kieran.quiet-transit'
    }
  ]
});
const activeKieran = activeLedger.records.find((record) => record.id === 'thread.kieran.command-preparation');
assert.equal(activeKieran.status, 'active');
assert.equal(activeKieran.lastUpdatedByOutcomeId, 'outcome.kieran.supervised-training');
assert.equal(activeKieran.history.some((entry) => entry.from === 'engaged' && entry.to === 'active'), true);
assert.equal(activeLedger.activationReviews.length, 1);

assertThrowsMessage(
  () => applyThreadLedgerDelta(ledger, {
    transitions: [
      {
        threadId: 'thread.kieran.command-preparation',
        status: 'active'
      }
    ]
  }),
  /Invalid thread transition/
);

const resolvedLedger = applyThreadLedgerDelta(activeLedger, {
  transitions: [
    {
      threadId: 'thread.kieran.command-preparation',
      status: 'resolved',
      sourceOutcomeId: 'outcome.kieran.closed'
    }
  ],
  closureReviewsAdd: [
    {
      threadId: 'thread.kieran.command-preparation',
      status: 'resolved',
      summary: 'Kieran accepted supervised retraining and changed how he describes failure.',
      sourceOutcomeId: 'outcome.kieran.closed',
      commandBearingEvaluationInput: {
        eligible: true,
        possibleStyles: ['inspiration', 'resolve'],
        hiddenRationale: 'Director-only post-hoc evaluation input.'
      }
    }
  ]
});
const resolvedKieran = resolvedLedger.records.find((record) => record.id === 'thread.kieran.command-preparation');
assert.equal(resolvedKieran.status, 'resolved');
assert.equal(resolvedLedger.closureReviews.length, 1);
assert.equal(activeLedger.closureReviews.length, 0, 'closure append must not mutate previous ledger');

const summaries = threadPlayerSummaries(resolvedLedger, {
  statuses: ['latent', 'watchlisted', 'available', 'engaged', 'active', 'resolved'],
  limit: 10
});
assert.equal(summaries.some((summary) => summary.id === 'thread.bronn.table'), false, 'watchlisted Bronn table must stay hidden');
assert.equal(summaries.some((summary) => summary.id === 'thread.kieran.command-preparation'), true);
assertTextAbsent(summaries, [
  'causalGrounding',
  'rawScores',
  'professionalConfidence',
  'commandReadiness',
  'hiddenFacts',
  'failure score',
  'unsafe safety margin',
  'bearingPotential',
  'inspirationAffordance',
  'resolveAffordance',
  'Command Mark',
  'hiddenRationale'
]);

const noLatentSummaries = threadPlayerSummaries(ledger, {
  statuses: ['latent', 'watchlisted']
});
assert.deepEqual(noLatentSummaries, [], 'player summary projection must never expose latent or watchlisted records');

const invalidated = invalidateThreadEvidenceByAnchorRange(resolvedLedger, 'range.kieran.sim-time');
assert.deepEqual(invalidated.affectedThreadIds, ['thread.kieran.command-preparation']);
const staleKieran = invalidated.ledger.records.find((record) => record.id === 'thread.kieran.command-preparation');
assert.equal(staleKieran.metadata.stale, true);
assert.equal(staleKieran.supportingEvidence.find((item) => item.id === 'evidence.kieran.sim-time').invalidated, true);
assert.deepEqual(threadPlayerSummaries(invalidated.ledger, { statuses: ['resolved'] }), []);

console.log('Thread ledger tests passed: constants, normalization, upsert merge, lifecycle deltas, closure reviews, hidden summaries, invalidation, immutability');
