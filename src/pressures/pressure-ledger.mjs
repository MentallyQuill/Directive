export const PRESSURE_TYPES = Object.freeze(['crew', 'ship', 'regional', 'obligation']);
export const PRESSURE_STATUSES = Object.freeze(['active', 'cooling', 'suppressed', 'resolved']);
export const PRESSURE_URGENCY_BANDS = Object.freeze(['low', 'medium', 'high', 'urgent']);
export const PRESSURE_ESCALATION_BANDS = Object.freeze(['latent', 'signal', 'escalation', 'crisis', 'consequence']);

export function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeEnum(value, allowed, fallback) {
  const text = String(value || '').trim();
  return allowed.includes(text) ? text : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  );
}

export function normalizePressureRecord(record = {}) {
  const id = String(record.id || '').trim();
  if (!id) {
    throw new Error('Pressure record id is required.');
  }
  const playerSummary = String(record.playerSummary || record.title || '').trim();
  if (!playerSummary) {
    throw new Error(`Pressure record "${id}" requires a playerSummary.`);
  }
  const title = String(record.title || playerSummary).trim();
  return {
    id,
    type: normalizeEnum(record.type, PRESSURE_TYPES, 'obligation'),
    title,
    playerSummary,
    directorSummary: String(record.directorSummary || playerSummary).trim(),
    status: normalizeEnum(record.status, PRESSURE_STATUSES, 'active'),
    urgencyBand: normalizeEnum(record.urgencyBand, PRESSURE_URGENCY_BANDS, 'medium'),
    escalationBand: normalizeEnum(record.escalationBand, PRESSURE_ESCALATION_BANDS, 'signal'),
    sourceOutcomeId: record.sourceOutcomeId || null,
    sourceTurnId: record.sourceTurnId || null,
    sourceMissionId: record.sourceMissionId || null,
    sourcePhaseId: record.sourcePhaseId || null,
    lastUpdatedByOutcomeId: record.lastUpdatedByOutcomeId || record.sourceOutcomeId || null,
    linkedCrewIds: asArray(record.linkedCrewIds),
    linkedSystemIds: asArray(record.linkedSystemIds),
    linkedFactIds: asArray(record.linkedFactIds),
    linkedPhaseIds: asArray(record.linkedPhaseIds),
    linkedDecisionPointIds: asArray(record.linkedDecisionPointIds),
    linkedChapterIds: asArray(record.linkedChapterIds),
    linkedTemplateIds: asArray(record.linkedTemplateIds),
    tags: asArray(record.tags),
    cooldown: {
      eligibleAfterChapterId: record.cooldown?.eligibleAfterChapterId || null,
      suppressedUntilChapterId: record.cooldown?.suppressedUntilChapterId || null,
      ignoredBeatCount: Number.isFinite(Number(record.cooldown?.ignoredBeatCount))
        ? Number(record.cooldown.ignoredBeatCount)
        : 0
    },
    history: asArray(record.history),
    rawValuesHidden: true
  };
}

function ensurePressureLedger(state) {
  if (!state.pressureLedger || typeof state.pressureLedger !== 'object' || Array.isArray(state.pressureLedger)) {
    state.pressureLedger = {
      records: [],
      candidateReviews: [],
      rawValuesHidden: true
    };
  }
  if (!Array.isArray(state.pressureLedger.records)) {
    state.pressureLedger.records = [];
  }
  if (!Array.isArray(state.pressureLedger.candidateReviews)) {
    state.pressureLedger.candidateReviews = [];
  }
  state.pressureLedger.rawValuesHidden = true;
  return state.pressureLedger;
}

export function createPressureLedger({ records = [], candidateReviews = [] } = {}) {
  return {
    records: records.map(normalizePressureRecord),
    candidateReviews: cloneJson(candidateReviews),
    rawValuesHidden: true
  };
}

function mergePressureRecord(previous, nextRecord) {
  if (!previous) {
    return normalizePressureRecord(nextRecord);
  }
  const previousRecord = normalizePressureRecord(previous);
  const incoming = normalizePressureRecord(nextRecord);
  return normalizePressureRecord({
    ...previousRecord,
    ...incoming,
    sourceOutcomeId: previousRecord.sourceOutcomeId || incoming.sourceOutcomeId,
    sourceTurnId: previousRecord.sourceTurnId || incoming.sourceTurnId,
    sourceMissionId: previousRecord.sourceMissionId || incoming.sourceMissionId,
    sourcePhaseId: previousRecord.sourcePhaseId || incoming.sourcePhaseId,
    linkedCrewIds: [...new Set([...previousRecord.linkedCrewIds, ...incoming.linkedCrewIds])],
    linkedSystemIds: [...new Set([...previousRecord.linkedSystemIds, ...incoming.linkedSystemIds])],
    linkedFactIds: [...new Set([...previousRecord.linkedFactIds, ...incoming.linkedFactIds])],
    linkedPhaseIds: [...new Set([...previousRecord.linkedPhaseIds, ...incoming.linkedPhaseIds])],
    linkedDecisionPointIds: [...new Set([...previousRecord.linkedDecisionPointIds, ...incoming.linkedDecisionPointIds])],
    linkedChapterIds: [...new Set([...previousRecord.linkedChapterIds, ...incoming.linkedChapterIds])],
    linkedTemplateIds: [...new Set([...previousRecord.linkedTemplateIds, ...incoming.linkedTemplateIds])],
    tags: [...new Set([...previousRecord.tags, ...incoming.tags])],
    cooldown: {
      ...previousRecord.cooldown,
      ...incoming.cooldown
    },
    history: [
      ...previousRecord.history,
      ...incoming.history
    ]
  });
}

export function applyPressureLedgerDelta(state, pressureDelta = {}) {
  if (!pressureDelta || typeof pressureDelta !== 'object') {
    return;
  }
  const ledger = ensurePressureLedger(state);
  const byId = new Map(ledger.records.map((record) => [record.id, normalizePressureRecord(record)]));

  for (const record of pressureDelta.upsertRecords || []) {
    const normalized = normalizePressureRecord(record);
    byId.set(normalized.id, mergePressureRecord(byId.get(normalized.id), normalized));
  }

  for (const suppression of pressureDelta.suppressions || []) {
    const pressureId = suppression.pressureId || suppression.id;
    const existing = byId.get(pressureId);
    if (!existing) {
      continue;
    }
    byId.set(pressureId, normalizePressureRecord({
      ...existing,
      status: 'suppressed',
      cooldown: {
        ...existing.cooldown,
        suppressedUntilChapterId: suppression.suppressedUntilChapterId || existing.cooldown.suppressedUntilChapterId
      },
      lastUpdatedByOutcomeId: suppression.sourceOutcomeId || existing.lastUpdatedByOutcomeId,
      history: [
        ...existing.history,
        compactObject({
          type: 'suppressed',
          reason: suppression.reason || 'Player deferred this pressure for now.',
          sourceOutcomeId: suppression.sourceOutcomeId || null,
          suppressedUntilChapterId: suppression.suppressedUntilChapterId || null
        })
      ]
    }));
  }

  for (const escalation of pressureDelta.escalations || []) {
    const pressureId = escalation.pressureId || escalation.id;
    const existing = byId.get(pressureId);
    if (!existing) {
      continue;
    }
    byId.set(pressureId, normalizePressureRecord({
      ...existing,
      escalationBand: escalation.toBand || existing.escalationBand,
      urgencyBand: escalation.urgencyBand || existing.urgencyBand,
      cooldown: {
        ...existing.cooldown,
        ignoredBeatCount: Number.isFinite(Number(escalation.ignoredBeatCount))
          ? Number(escalation.ignoredBeatCount)
          : existing.cooldown.ignoredBeatCount + 1
      },
      history: [
        ...existing.history,
        compactObject({
          type: 'escalated',
          reason: escalation.reason || 'Pressure escalated after an ignored campaign beat.',
          completedChapterId: escalation.completedChapterId || null,
          fromBand: existing.escalationBand,
          toBand: escalation.toBand || existing.escalationBand
        })
      ]
    }));
  }

  for (const pressureId of pressureDelta.resolvedIds || []) {
    const existing = byId.get(pressureId);
    if (!existing) {
      continue;
    }
    byId.set(pressureId, normalizePressureRecord({
      ...existing,
      status: 'resolved',
      history: [
        ...existing.history,
        { type: 'resolved', reason: 'Pressure resolved by committed campaign state.' }
      ]
    }));
  }

  ledger.records = [...byId.values()];
  if (Array.isArray(pressureDelta.candidateReviewsAdd)) {
    ledger.candidateReviews.push(...cloneJson(pressureDelta.candidateReviewsAdd));
  }
  ledger.rawValuesHidden = true;
}

export function pressurePlayerSummaries(pressureLedger, { status = ['active', 'cooling', 'suppressed'], limit = 6 } = {}) {
  const statuses = new Set(status);
  return (pressureLedger?.records || [])
    .filter((record) => statuses.has(record.status))
    .slice(0, limit)
    .map((record) => ({
      id: record.id,
      type: record.type,
      title: record.title,
      summary: record.playerSummary,
      status: record.status,
      urgencyBand: record.urgencyBand,
      escalationBand: record.escalationBand,
      linkedPhaseIds: record.linkedPhaseIds || [],
      linkedDecisionPointIds: record.linkedDecisionPointIds || [],
      linkedChapterIds: record.linkedChapterIds || [],
      linkedTemplateIds: record.linkedTemplateIds || []
    }));
}
