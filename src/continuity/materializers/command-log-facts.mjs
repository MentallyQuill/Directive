import {
  CONTINUITY_VISIBILITY,
  asArray,
  compact,
  createContinuityFact,
  hashContinuityText
} from '../fact-schema.mjs';

const COMMAND_LOG_FACT_LIMIT = 8;

function safeId(value = '') {
  const text = compact(value).toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return text || hashContinuityText(value || 'command-log');
}

function entryVisible(entry = {}) {
  return entry?.visibility !== 'hidden'
    && entry?.playerVisible !== false
    && entry?.status !== 'deleted'
    && entry?.status !== 'invalidated';
}

function summaryForEntry(entry = {}) {
  return compact(
    entry?.assistedSummary?.text
    || entry?.summary
    || asArray(entry?.summaryInputs).map(compact).filter(Boolean).join(' ')
    || entry?.type
    || entry?.id
  );
}

function consequencesForEntry(entry = {}) {
  return asArray(entry?.visibleConsequences).map(compact).filter(Boolean).slice(0, 4);
}

export function materializeCommandLogFacts({ campaignState = null } = {}) {
  const entries = asArray(campaignState?.commandLog?.entries)
    .filter(entryVisible)
    .slice(-COMMAND_LOG_FACT_LIMIT);
  return entries.map((entry, index) => {
    const summary = summaryForEntry(entry);
    if (!summary) return null;
    const consequences = consequencesForEntry(entry);
    const sourceOutcomeId = compact(entry?.sourceOutcomeId || entry?.outcomeId);
    const sourceId = sourceOutcomeId || compact(entry?.id) || hashContinuityText({ summary, consequences, index });
    const rendered = consequences.length
      ? `${summary} Consequences: ${consequences.join('; ')}`
      : summary;
    return createContinuityFact({
      id: `command-log.${safeId(sourceId)}`,
      kind: 'commandLog.committed',
      subject: `commandLog.${safeId(sourceId)}`,
      predicate: 'committedVisibleRecap',
      value: {
        summary,
        consequences,
        sourceOutcomeId: sourceOutcomeId || null
      },
      summary: rendered,
      render: {
        narrator: rendered,
        director: rendered
      },
      source: {
        type: 'campaignState',
        root: 'commandLog.entries',
        sourceOutcomeId: sourceOutcomeId || null,
        entryId: compact(entry?.id) || null
      },
      authority: 'committedOutcome',
      visibility: CONTINUITY_VISIBILITY.narratorSafe,
      criticality: 'medium',
      stability: 'stable',
      tags: ['command', 'commandLog', 'recap', 'committed']
    });
  }).filter(Boolean);
}
