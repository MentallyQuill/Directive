function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function compactText(value, maxLength = 220) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function advisoryLedgers(state) {
  return [
    ...asArray(state?.commandCompetence?.advisoryLedger),
    ...asArray(state?.commandCompetence?.counselRequestLedger)
  ];
}

function normalizeAdvisoryRecord(record = {}, index = 0) {
  if (record?.playerVisible === false || record?.visibility === 'hidden') return null;
  const subject = compactText(record.subject || record.title || record.summary || 'Advisory note', 96);
  const missionBrief = compactText(record.missionBrief || record.summary || record.logSummary, 260);
  const logSummary = compactText(record.logSummary || record.summary || missionBrief, 260);
  const involvedCrewIds = [...new Set([
    ...asArray(record.involvedCrewIds),
    ...asArray(record.crewIds),
    ...asArray(record.crewNotes).map((note) => note?.crewId || note?.id)
  ].map(cleanText).filter(Boolean))];
  const crewNotes = asArray(record.crewNotes)
    .map((note) => ({
      crewId: cleanText(note?.crewId || note?.id),
      summary: compactText(note?.summary || note?.note || note?.text, 260)
    }))
    .filter((note) => note.crewId && note.summary);
  return {
    id: cleanText(record.id) || `advisory-${index + 1}`,
    type: cleanText(record.type) || 'advisoryNote',
    subject,
    missionBrief,
    logSummary,
    meta: cleanText(record.activePhaseId || record.activeMissionId || record.source || 'Advisory'),
    createdAt: cleanText(record.createdAt || record.recordedAt),
    sourceIngressId: cleanText(record.sourceIngressId || record.ingressId),
    involvedCrewIds,
    crewNotes,
    considerations: asArray(record.considerations).map((item) => compactText(item, 220)).filter(Boolean),
    options: asArray(record.options).map((item) => compactText(item, 220)).filter(Boolean)
  };
}

export function playerSafeAdvisoryRecords(state, { limit = 6 } = {}) {
  const records = advisoryLedgers(state)
    .map(normalizeAdvisoryRecord)
    .filter((record) => record && (record.missionBrief || record.logSummary || record.subject));
  const newest = records.reverse();
  return Number.isFinite(limit) && limit > 0 ? newest.slice(0, limit) : newest;
}

export function advisoryItemsForCrew(state, crewId, { limit = 2 } = {}) {
  const id = cleanText(crewId);
  if (!id) return [];
  const items = [];
  for (const record of playerSafeAdvisoryRecords(state, { limit: 0 })) {
    const note = record.crewNotes.find((entry) => entry.crewId === id);
    if (!note && !record.involvedCrewIds.includes(id)) continue;
    items.push({
      id: record.id,
      title: record.subject || 'Advisory note',
      meta: 'Advisory Note',
      summary: note?.summary || record.missionBrief || record.logSummary
    });
    if (items.length >= limit) break;
  }
  return items;
}
