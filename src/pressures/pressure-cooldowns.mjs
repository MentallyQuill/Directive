import {
  PRESSURE_ESCALATION_BANDS,
  cloneJson,
  createPressureLedger,
  normalizePressureRecord
} from './pressure-ledger.mjs';

function nextEscalationBand(current) {
  const index = PRESSURE_ESCALATION_BANDS.indexOf(current);
  if (index === -1) {
    return 'signal';
  }
  return PRESSURE_ESCALATION_BANDS[Math.min(index + 1, PRESSURE_ESCALATION_BANDS.length - 1)];
}

export function suppressPressure(pressureLedger, {
  pressureId,
  suppressedUntilChapterId = null,
  reason = 'Player deferred this pressure for now.',
  sourceOutcomeId = null
} = {}) {
  const ledger = createPressureLedger(pressureLedger || {});
  ledger.records = ledger.records.map((record) => {
    if (record.id !== pressureId) {
      return record;
    }
    return normalizePressureRecord({
      ...record,
      status: 'suppressed',
      cooldown: {
        ...record.cooldown,
        suppressedUntilChapterId
      },
      lastUpdatedByOutcomeId: sourceOutcomeId || record.lastUpdatedByOutcomeId,
      history: [
        ...record.history,
        {
          type: 'suppressed',
          reason,
          sourceOutcomeId,
          suppressedUntilChapterId
        }
      ]
    });
  });
  return ledger;
}

export function escalateIgnoredPressures(pressureLedger, {
  pressureIds = [],
  completedChapterId = null,
  reason = 'Ignored pressure escalated after a campaign beat.'
} = {}) {
  const targetIds = new Set(pressureIds);
  const ledger = createPressureLedger(pressureLedger || {});
  const escalatedRecords = [];
  ledger.records = ledger.records.map((record) => {
    if (
      record.status !== 'active'
      || (targetIds.size > 0 && !targetIds.has(record.id))
    ) {
      return record;
    }
    const nextRecord = normalizePressureRecord({
      ...record,
      escalationBand: nextEscalationBand(record.escalationBand),
      urgencyBand: record.urgencyBand === 'urgent' ? 'urgent' : record.urgencyBand === 'high' ? 'urgent' : 'high',
      cooldown: {
        ...record.cooldown,
        ignoredBeatCount: Number(record.cooldown?.ignoredBeatCount || 0) + 1
      },
      history: [
        ...record.history,
        {
          type: 'escalated',
          reason,
          completedChapterId,
          fromBand: record.escalationBand,
          toBand: nextEscalationBand(record.escalationBand)
        }
      ]
    });
    escalatedRecords.push(cloneJson(nextRecord));
    return nextRecord;
  });
  return {
    pressureLedger: ledger,
    escalatedRecords
  };
}
