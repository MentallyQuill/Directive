import assert from 'node:assert/strict';

import { validateDirectorTurn } from '../../src/adjudication/state-delta-validator.mjs';

const graphIndex = {
  phases: new Map([['phase.alpha', { id: 'phase.alpha' }]]),
  facts: new Map(),
  clocks: new Map([['clock.alpha', { id: 'clock.alpha', min: 0, max: 4 }]]),
  pressures: new Map([['pressure.alpha', { id: 'pressure.alpha' }]]),
  decisionPoints: new Map(),
  commandDecisions: new Map(),
  outcomeFlags: new Map()
};

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseTurnPacket() {
  return {
    outcomePacket: {
      id: 'outcome.alpha',
      resultBand: 'Success'
    },
    directorResponse: {
      usedFactIds: [],
      usedDecisionPointIds: [],
      usedClockIds: [],
      commandDecisionCandidates: []
    },
    stateDelta: {
      outcomeId: 'outcome.alpha',
      mission: {},
      clocks: [],
      actors: {
        upsertPostures: [{
          actorId: 'actor.alpha',
          posture: 'contained',
          visibility: 'hidden',
          sourceOutcomeId: 'outcome.alpha',
          lastUpdatedByOutcomeId: 'outcome.alpha',
          pressureIds: ['pressure.ledger-alpha'],
          linkedPressureIds: ['pressure.alpha']
        }],
        rawValuesHidden: true
      },
      fronts: {
        upsertRecords: [{
          id: 'front.alpha',
          status: 'contained',
          visibility: 'hidden',
          sourceOutcomeId: 'outcome.alpha',
          lastUpdatedByOutcomeId: 'outcome.alpha',
          pressureIds: ['pressure.ledger-alpha'],
          linkedPressureIds: ['pressure.alpha'],
          linkedClockIds: ['clock.alpha']
        }],
        rawValuesHidden: true
      },
      relationships: {
        rawValuesHidden: true
      },
      turnLedger: {
        swipeRerollForbidden: true
      }
    },
    narratorPacket: {
      sourceOutcomeId: 'outcome.alpha',
      rawHiddenValuesExposed: false,
      directorOnlyDataIncluded: false
    },
    commandLogPacket: {
      sourceOutcomeId: 'outcome.alpha'
    }
  };
}

function validate(packet) {
  return validateDirectorTurn({ graphIndex, turnPacket: packet });
}

function assertInvalid(label, mutate, expectedPattern) {
  const packet = baseTurnPacket();
  mutate(packet);
  const result = validate(packet);
  assert.equal(result.ok, false, `${label} should fail validation`);
  assert.match(result.errors.join('\n'), expectedPattern, `${label} should report expected error`);
}

assert.equal(validate(baseTurnPacket()).ok, true, 'well-formed actor/front state delta passes validation');

assertInvalid(
  'actor records without rawValuesHidden',
  (packet) => {
    delete packet.stateDelta.actors.rawValuesHidden;
  },
  /\$\.stateDelta\.actors\.rawValuesHidden: must be true/
);

assertInvalid(
  'front records without rawValuesHidden',
  (packet) => {
    packet.stateDelta.fronts.rawValuesHidden = false;
  },
  /\$\.stateDelta\.fronts\.rawValuesHidden: must be true/
);

assertInvalid(
  'actor posture missing required field',
  (packet) => {
    delete packet.stateDelta.actors.upsertPostures[0].actorId;
  },
  /\$\.stateDelta\.actors\.upsertPostures\[0\]\.actorId: must be a non-empty string/
);

assertInvalid(
  'front record missing required field',
  (packet) => {
    packet.stateDelta.fronts.upsertRecords[0].status = '';
  },
  /\$\.stateDelta\.fronts\.upsertRecords\[0\]\.status: must be a non-empty string/
);

assertInvalid(
  'actor source outcome mismatch',
  (packet) => {
    packet.stateDelta.actors.upsertPostures[0].sourceOutcomeId = 'outcome.other';
  },
  /\$\.stateDelta\.actors\.upsertPostures\[0\]\.sourceOutcomeId: must match outcomePacket\.id/
);

assertInvalid(
  'front last-updated outcome mismatch',
  (packet) => {
    packet.stateDelta.fronts.upsertRecords[0].lastUpdatedByOutcomeId = 'outcome.other';
  },
  /\$\.stateDelta\.fronts\.upsertRecords\[0\]\.lastUpdatedByOutcomeId: must match outcomePacket\.id/
);

assertInvalid(
  'front linked clock outside graph',
  (packet) => {
    packet.stateDelta.fronts.upsertRecords[0].linkedClockIds = ['clock.missing'];
  },
  /\$\.stateDelta\.fronts\.upsertRecords\[0\]\.linkedClockIds: unknown clock "clock\.missing"/
);

assertInvalid(
  'actor linked pressure outside graph',
  (packet) => {
    packet.stateDelta.actors.upsertPostures[0].linkedPressureIds = ['pressure.missing'];
  },
  /\$\.stateDelta\.actors\.upsertPostures\[0\]\.linkedPressureIds: unknown pressure "pressure\.missing"/
);

assertInvalid(
  'front linked pressure outside graph',
  (packet) => {
    packet.stateDelta.fronts.upsertRecords[0].linkedPressureIds = ['pressure.missing'];
  },
  /\$\.stateDelta\.fronts\.upsertRecords\[0\]\.linkedPressureIds: unknown pressure "pressure\.missing"/
);

const noActorFrontRecords = cloneJson(baseTurnPacket());
noActorFrontRecords.stateDelta.actors = { rawValuesHidden: false };
noActorFrontRecords.stateDelta.fronts = { rawValuesHidden: false };
assert.equal(validate(noActorFrontRecords).ok, true, 'empty actor/front domains do not require rawValuesHidden');

console.log('Mission state-delta contract tests passed: actor/front domains reject malformed hidden-state records');
