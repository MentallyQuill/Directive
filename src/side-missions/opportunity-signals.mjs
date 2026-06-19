export const HIDDEN_TRUTH_TERMS = Object.freeze([
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
]);

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || '').trim();
}

function collectText(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

export function hiddenTruthTerm(value) {
  const text = collectText(value).toLowerCase();
  return HIDDEN_TRUTH_TERMS.find((term) => text.includes(term)) || null;
}

export function extractOpportunitySignals(campaignState = {}) {
  const mission = campaignState.mission || {};
  const ledger = campaignState.pressureLedger || {};
  const commandLog = campaignState.commandLog || {};
  const mainCampaign = campaignState.mainCampaign || {};

  return {
    completedChapters: asArray(mainCampaign.completedChapters),
    availableChapters: asArray(mainCampaign.availableChapters),
    chapterCursor: mainCampaign.chapterCursor || null,
    mission: {
      activeMissionId: mission.activeMissionId || null,
      completedMissionId: mission.completedMissionId || null,
      nextMissionId: mission.nextMissionId || null,
      transitionStatus: mission.transitionStatus || null,
      endState: mission.endState || null
    },
    outcomeFlags: asArray(mission.outcomeFlags).map((flag) => ({
      id: normalizeText(flag?.id),
      value: flag?.value ?? null,
      sourceEventId: flag?.sourceOutcomeId || flag?.lastUpdatedByOutcomeId || null
    })).filter((flag) => flag.id),
    knownFacts: asArray(mission.knownFacts).map((fact) => (
      typeof fact === 'string'
        ? { id: fact, sourceEventId: null, summary: null }
        : {
            id: normalizeText(fact?.id),
            sourceEventId: fact?.sourceOutcomeId || fact?.lastUpdatedByOutcomeId || null,
            summary: fact?.summary || null
          }
    )).filter((fact) => fact.id),
    pressureRecords: asArray(ledger.records).map((record) => ({
      id: normalizeText(record?.id),
      type: record?.type || 'obligation',
      title: normalizeText(record?.title),
      playerSummary: normalizeText(record?.playerSummary),
      status: record?.status || 'active',
      urgencyBand: record?.urgencyBand || 'medium',
      escalationBand: record?.escalationBand || 'signal',
      sourceOutcomeId: record?.sourceOutcomeId || null,
      lastUpdatedByOutcomeId: record?.lastUpdatedByOutcomeId || null,
      linkedFactIds: asArray(record?.linkedFactIds),
      linkedChapterIds: asArray(record?.linkedChapterIds),
      linkedPhaseIds: asArray(record?.linkedPhaseIds),
      linkedDecisionPointIds: asArray(record?.linkedDecisionPointIds),
      tags: asArray(record?.tags),
      cooldown: cloneJson(record?.cooldown || {})
    })).filter((record) => record.id),
    commandLogEntries: asArray(commandLog.entries).map((entry) => ({
      id: normalizeText(entry?.id),
      type: entry?.type || null,
      sourceOutcomeId: entry?.sourceOutcomeId || null,
      source: entry?.source || null,
      summaryInputs: asArray(entry?.summaryInputs),
      visibleConsequences: asArray(entry?.visibleConsequences),
      title: entry?.title || null,
      summary: entry?.summary || null,
      highlights: asArray(entry?.highlights)
    })).filter((entry) => entry.id || entry.sourceOutcomeId)
  };
}
