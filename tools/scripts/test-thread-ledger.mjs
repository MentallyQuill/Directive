import assert from 'node:assert/strict';

import {
  THREAD_EPISODE_FUNCTIONS,
  THREAD_SHAPES,
  THREAD_STATUSES,
  THREAD_TYPES,
  applyThreadLedgerDelta,
  createThreadLedger,
  mergeThreadEvidence,
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
    type: 'scene'
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
      source: { id: 'prelude.combined-load-test.03', type: 'scene' },
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
  relationshipRawValues: {
    professionalConfidence: 50,
    integrityTrust: 50
  },
  developmentRawValues: {
    commandReadiness: 42,
    professionalStrain: 61
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
      source: { id: 'prelude.off-duty-table.01', type: 'scene' },
      summary: 'A junior officer lingered near the tactical table after watch.',
      tags: ['off-duty']
    }
  ],
  bearingPotential: {
    eligible: false
  },
  rawScores: {
    net: 11
  },
  hiddenFacts: [
    'No Command Mark is expected from Bronn table play.'
  ]
};

const rawKieran = cloneJson(kieranCommandPreparation);
const normalizedKieran = normalizeThreadRecord(kieranCommandPreparation);
assert.deepEqual(kieranCommandPreparation, rawKieran, 'normalization must not mutate source thread record');
assert.equal(normalizedKieran.rawValuesHidden, true);
assert.equal(normalizedKieran.supportingEvidence[0].rawValuesHidden, true);
assert.equal(normalizedKieran.bearingPotential.rawValuesHidden, true);

assertThrowsMessage(
  () => normalizeThreadRecord({ ...kieranCommandPreparation, id: '' }),
  /Thread record id is required/
);
assertThrowsMessage(
  () => normalizeThreadRecord({ ...kieranCommandPreparation, status: '' }),
  /thread status is required/
);
assertThrowsMessage(
  () => normalizeThreadRecord({ ...kieranCommandPreparation, shape: '' }),
  /thread shape is required/
);
assertThrowsMessage(
  () => normalizeThreadRecord({ ...kieranCommandPreparation, type: '' }),
  /thread type is required/
);
assertThrowsMessage(
  () => normalizeThreadRecord({ ...kieranCommandPreparation, source: null }),
  /source is required/
);
assertThrowsMessage(
  () => normalizeThreadRecord({ ...kieranCommandPreparation, storyQuestion: '' }),
  /storyQuestion is required/
);

const mergedEvidence = mergeThreadEvidence(kieranCommandPreparation, [
  {
    id: 'evidence.kieran.sim-time',
    source: { id: 'prelude.combined-load-test.03', type: 'scene' },
    summary: 'Requested additional simulator time after criticism, then accepted supervision.',
    tags: ['supervised']
  },
  {
    source: { id: 'prelude.combined-load-test.03', type: 'scene' },
    summary: 'Duplicate scene evidence should merge by source instead of creating spam.',
    tags: ['duplicate-source']
  },
  {
    source: { id: 'prelude.miriam-fatigue.01', type: 'scene' },
    summary: 'Miriam flagged that Kieran was sleeping poorly.',
    tags: ['fatigue']
  }
]);
assert.equal(
  mergedEvidence.supportingEvidence.filter((item) => item.id === 'evidence.kieran.sim-time').length,
  1,
  'duplicate evidence id should merge'
);
assert.equal(
  mergedEvidence.supportingEvidence.filter((item) => item.source.id === 'prelude.combined-load-test.03').length,
  1,
  'duplicate evidence source should merge'
);
assert.equal(mergedEvidence.supportingEvidence.some((item) => item.source.id === 'prelude.miriam-fatigue.01'), true);
assert.deepEqual(kieranCommandPreparation, rawKieran, 'evidence merge must not mutate source thread record');

const startingLedgerInput = {
  records: [kieranCommandPreparation, bronnTable],
  activationReviews: [],
  closureReviews: []
};
const startingLedgerSnapshot = cloneJson(startingLedgerInput);
const ledger = createThreadLedger(startingLedgerInput);
assert.deepEqual(startingLedgerInput, startingLedgerSnapshot, 'ledger creation must not mutate input');
assert.equal(ledger.rawValuesHidden, true);
assert.equal(ledger.records.length, 2);

const activeLedger = applyThreadLedgerDelta(ledger, {
  evidence: [
    {
      threadId: 'thread.kieran.command-preparation',
      items: [
        {
          source: { id: 'prelude.kieran-unsafe-sim.01', type: 'scene' },
          summary: 'Kieran asked for unsafe simulator conditions.',
          hiddenFactIds: ['hidden.kieran.failure-response']
        }
      ]
    }
  ],
  transitions: [
    {
      threadId: 'thread.kieran.command-preparation',
      status: 'watchlisted',
      sourceOutcomeId: 'outcome.kieran.reinforced'
    },
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
assert.equal(activeKieran.supportingEvidence.some((item) => item.source.id === 'prelude.kieran-unsafe-sim.01'), true);
assert.equal(activeLedger.activationReviews.length, 1);
assert.equal(ledger.records.find((record) => record.id === 'thread.kieran.command-preparation').status, 'latent');

assertThrowsMessage(
  () => applyThreadLedgerDelta(ledger, {
    transitions: [
      {
        threadId: 'thread.kieran.command-preparation',
        status: 'active'
      }
    ]
  }),
  /Invalid thread lifecycle transition/
);

const resolvedLedger = applyThreadLedgerDelta(activeLedger, {
  closureReviewsAdd: [
    {
      threadId: 'thread.kieran.command-preparation',
      status: 'resolved',
      summary: 'Kieran accepted supervised retraining and changed how he describes failure.',
      sourceOutcomeId: 'outcome.kieran.closed',
      relationshipHints: [
        {
          crewId: 'kieran-vale',
          memory: 'The commander treated training pressure as real without humiliating him.'
        }
      ],
      developmentHints: [
        {
          crewId: 'kieran-vale',
          axis: 'command-readiness',
          reason: 'Meaningful risk framing changed.'
        }
      ],
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
assert.equal(resolvedKieran.closureReviews.length, 1);
assert.equal(resolvedLedger.closureReviews.length, 1);
assert.equal(resolvedLedger.closureReviews[0].rawValuesHidden, true);
assert.equal(resolvedLedger.closureReviews[0].commandBearingEvaluationInput.rawValuesHidden, true);
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
  'Command Mark'
]);

const noLatentSummaries = threadPlayerSummaries(ledger, {
  statuses: ['latent', 'watchlisted']
});
assert.deepEqual(noLatentSummaries, [], 'player summary projection must never expose latent or watchlisted records');

console.log('Thread ledger tests passed: constants, normalization, evidence merge, lifecycle deltas, closure reviews, hidden summaries, immutability');
