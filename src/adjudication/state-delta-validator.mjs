const resultBands = new Set([
  'Great Success',
  'Success',
  'Partial Success',
  'Partial Failure',
  'Failure',
  'Great Failure'
]);

export function validateDirectorTurn({ graphIndex, turnPacket }) {
  const errors = [];
  const at = (location, message) => errors.push(`${location}: ${message}`);

  if (!resultBands.has(turnPacket.outcomePacket?.resultBand)) {
    at('$.outcomePacket.resultBand', `unknown result band "${turnPacket.outcomePacket?.resultBand}"`);
  }

  if (turnPacket.stateDelta?.outcomeId !== turnPacket.outcomePacket?.id) {
    at('$.stateDelta.outcomeId', 'must match outcomePacket.id');
  }
  if (turnPacket.narratorPacket?.sourceOutcomeId !== turnPacket.outcomePacket?.id) {
    at('$.narratorPacket.sourceOutcomeId', 'must match outcomePacket.id');
  }
  if (turnPacket.commandLogPacket?.sourceOutcomeId !== turnPacket.outcomePacket?.id) {
    at('$.commandLogPacket.sourceOutcomeId', 'must match outcomePacket.id');
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
