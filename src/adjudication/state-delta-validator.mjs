import { validateCompetencePacket } from '../competence/competence-packet.mjs';

const resultBands = new Set([
  'Great Success',
  'Success',
  'Partial Success',
  'Partial Failure',
  'Failure',
  'Great Failure'
]);

function hasRecords(value, recordKey) {
  return Array.isArray(value?.[recordKey]) && value[recordKey].length > 0;
}

function requireNonEmptyString(record, field, location, at) {
  if (typeof record?.[field] !== 'string' || record[field].trim() === '') {
    at(`${location}.${field}`, 'must be a non-empty string');
  }
}

function validateSourceOutcome(record, field, outcomeId, location, at) {
  if (record?.[field] !== outcomeId) {
    at(`${location}.${field}`, 'must match outcomePacket.id');
  }
}

function validatePressureIds(record, graphIndex, location, at) {
  for (const pressureId of record?.linkedPressureIds || []) {
    if (!graphIndex.pressures?.has(pressureId)) {
      at(`${location}.linkedPressureIds`, `unknown pressure "${pressureId}"`);
    }
  }
}

function validateLinkedClockIds(record, graphIndex, location, at) {
  for (const clockId of record?.linkedClockIds || []) {
    if (!graphIndex.clocks.has(clockId)) {
      at(`${location}.linkedClockIds`, `unknown clock "${clockId}"`);
    }
  }
}

function validateActorDelta({ graphIndex, outcomeId, actors, at }) {
  if (!actors) return;

  if (hasRecords(actors, 'upsertPostures') && actors.rawValuesHidden !== true) {
    at('$.stateDelta.actors.rawValuesHidden', 'must be true when actor posture records exist');
  }

  for (const [index, posture] of (actors.upsertPostures || []).entries()) {
    const location = `$.stateDelta.actors.upsertPostures[${index}]`;
    for (const field of ['actorId', 'posture', 'visibility', 'sourceOutcomeId', 'lastUpdatedByOutcomeId']) {
      requireNonEmptyString(posture, field, location, at);
    }
    validateSourceOutcome(posture, 'sourceOutcomeId', outcomeId, location, at);
    validateSourceOutcome(posture, 'lastUpdatedByOutcomeId', outcomeId, location, at);
    validatePressureIds(posture, graphIndex, location, at);
  }
}

function validateFrontDelta({ graphIndex, outcomeId, fronts, at }) {
  if (!fronts) return;

  if (hasRecords(fronts, 'upsertRecords') && fronts.rawValuesHidden !== true) {
    at('$.stateDelta.fronts.rawValuesHidden', 'must be true when front records exist');
  }

  for (const [index, front] of (fronts.upsertRecords || []).entries()) {
    const location = `$.stateDelta.fronts.upsertRecords[${index}]`;
    for (const field of ['id', 'status', 'visibility', 'sourceOutcomeId', 'lastUpdatedByOutcomeId']) {
      requireNonEmptyString(front, field, location, at);
    }
    validateSourceOutcome(front, 'sourceOutcomeId', outcomeId, location, at);
    validateSourceOutcome(front, 'lastUpdatedByOutcomeId', outcomeId, location, at);
    validateLinkedClockIds(front, graphIndex, location, at);
    validatePressureIds(front, graphIndex, location, at);
  }
}

export function validateDirectorTurn({ graphIndex, turnPacket }) {
  const errors = [];
  const at = (location, message) => errors.push(`${location}: ${message}`);
  const outcomeId = turnPacket.outcomePacket?.id;

  if (!resultBands.has(turnPacket.outcomePacket?.resultBand)) {
    at('$.outcomePacket.resultBand', `unknown result band "${turnPacket.outcomePacket?.resultBand}"`);
  }

  if (turnPacket.stateDelta?.outcomeId !== outcomeId) {
    at('$.stateDelta.outcomeId', 'must match outcomePacket.id');
  }
  if (turnPacket.narratorPacket?.sourceOutcomeId !== outcomeId) {
    at('$.narratorPacket.sourceOutcomeId', 'must match outcomePacket.id');
  }
  if (turnPacket.commandLogPacket?.sourceOutcomeId !== outcomeId) {
    at('$.commandLogPacket.sourceOutcomeId', 'must match outcomePacket.id');
  }
  if (turnPacket.competencePacket) {
    const validation = validateCompetencePacket(turnPacket.competencePacket);
    for (const error of validation.errors) {
      at('$.competencePacket', error);
    }
  }

  for (const factId of turnPacket.directorResponse?.usedFactIds || []) {
    if (!graphIndex.facts.has(factId)) {
      at('$.directorResponse.usedFactIds', `unknown fact "${factId}"`);
    }
  }
  for (const decisionPointId of turnPacket.directorResponse?.usedDecisionPointIds || []) {
    if (!graphIndex.decisionPoints.has(decisionPointId)) {
      at('$.directorResponse.usedDecisionPointIds', `unknown decision point "${decisionPointId}"`);
    }
  }
  for (const clockId of turnPacket.directorResponse?.usedClockIds || []) {
    if (!graphIndex.clocks.has(clockId)) {
      at('$.directorResponse.usedClockIds', `unknown clock "${clockId}"`);
    }
  }
  for (const decisionId of turnPacket.directorResponse?.commandDecisionCandidates || []) {
    if (!graphIndex.commandDecisions.has(decisionId)) {
      at('$.directorResponse.commandDecisionCandidates', `unknown command decision "${decisionId}"`);
    }
  }

  for (const flag of turnPacket.stateDelta?.mission?.outcomeFlagsSet || []) {
    const graphFlag = graphIndex.outcomeFlags.get(flag.id);
    if (!graphFlag) {
      at('$.stateDelta.mission.outcomeFlagsSet', `unknown outcome flag "${flag.id}"`);
      continue;
    }
    if (!graphFlag.allowedValues?.includes(flag.value)) {
      at(`$.stateDelta.mission.outcomeFlagsSet.${flag.id}`, `invalid value "${flag.value}"`);
    }
  }

  const phaseAdvance = turnPacket.stateDelta?.mission?.phaseAdvance;
  if (phaseAdvance) {
    if (!graphIndex.phases.has(phaseAdvance.from)) {
      at('$.stateDelta.mission.phaseAdvance.from', `unknown phase "${phaseAdvance.from}"`);
    }
    if (!graphIndex.phases.has(phaseAdvance.to)) {
      at('$.stateDelta.mission.phaseAdvance.to', `unknown phase "${phaseAdvance.to}"`);
    }
    if (turnPacket.stateDelta?.mission?.activePhaseIdSet !== phaseAdvance.to) {
      at('$.stateDelta.mission.activePhaseIdSet', 'must match phaseAdvance.to');
    }
    for (const decisionPointId of phaseAdvance.availableDecisionPointIds || []) {
      if (!graphIndex.decisionPoints.has(decisionPointId)) {
        at('$.stateDelta.mission.phaseAdvance.availableDecisionPointIds', `unknown decision point "${decisionPointId}"`);
      }
    }
  }

  for (const clockDelta of turnPacket.stateDelta?.clocks || []) {
    const graphClock = graphIndex.clocks.get(clockDelta.id);
    if (!graphClock) {
      at('$.stateDelta.clocks', `unknown clock "${clockDelta.id}"`);
      continue;
    }
    if (clockDelta.to < graphClock.min || clockDelta.to > graphClock.max) {
      at(`$.stateDelta.clocks.${clockDelta.id}.to`, `must be between ${graphClock.min} and ${graphClock.max}`);
    }
  }

  validateActorDelta({
    graphIndex,
    outcomeId,
    actors: turnPacket.stateDelta?.actors,
    at
  });
  validateFrontDelta({
    graphIndex,
    outcomeId,
    fronts: turnPacket.stateDelta?.fronts,
    at
  });

  if (turnPacket.narratorPacket?.rawHiddenValuesExposed !== false) {
    at('$.narratorPacket.rawHiddenValuesExposed', 'must be false');
  }
  if (turnPacket.narratorPacket?.directorOnlyDataIncluded !== false) {
    at('$.narratorPacket.directorOnlyDataIncluded', 'must be false');
  }
  if (turnPacket.commandLogPacket?.hiddenStateRefs) {
    at('$.commandLogPacket.hiddenStateRefs', 'must not be present');
  }
  if (turnPacket.stateDelta?.relationships?.rawValuesHidden !== true) {
    at('$.stateDelta.relationships.rawValuesHidden', 'must be true');
  }
  if (turnPacket.stateDelta?.turnLedger?.swipeRerollForbidden !== true) {
    at('$.stateDelta.turnLedger.swipeRerollForbidden', 'must be true');
  }

  return {
    ok: errors.length === 0,
    errors
  };
}
