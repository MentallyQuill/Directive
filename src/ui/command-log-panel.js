import {
  appendEmpty,
  appendSectionTitle,
  createCard,
  createCardTitle,
  createElement
} from './runtime-ui-kit.js';

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function displayValue(value, fallback = 'None') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function parseJsonText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function normalizeAssistedSummary(entry) {
  const assisted = entry?.assistedSummary || null;
  const parsedAssisted = typeof assisted === 'string' ? parseJsonText(assisted) : null;
  const source = parsedAssisted || (assisted && typeof assisted === 'object' ? assisted : {});
  const parsedSummary = parseJsonText(source.summary);
  const merged = parsedSummary ? { ...source, ...parsedSummary } : source;
  const summary = parsedSummary ? parsedSummary.summary : merged.summary;
  return {
    title: displayValue(merged.title, ''),
    status: displayValue(merged.status, summary ? 'complete' : ''),
    summary: displayValue(summary, ''),
    highlights: asArray(merged.highlights || parsedSummary?.highlights),
    providerId: displayValue(merged.providerId, '')
  };
}

function formatLogType(value) {
  const text = displayValue(value, 'Entry')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ');
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatSourceStatus(entry) {
  if (entry?.source || entry?.sourceOutcomeId) return 'Recorded';
  return 'None';
}

function latestStardate(entries) {
  return entries.find((entry) => entry?.stardate)?.stardate || 'None';
}

function assistedStatus(entries) {
  const summaries = entries.map(normalizeAssistedSummary).filter((summary) => summary.status || summary.summary);
  if (summaries.length === 0) return 'None';
  const failed = summaries.filter((summary) => summary.status === 'failed').length;
  if (failed > 0) return `${failed} failed`;
  const complete = summaries.filter((summary) => summary.summary || summary.status === 'complete').length;
  return `${complete}/${summaries.length} ready`;
}

function createLogStatusBlock(label, value, tone = 'neutral') {
  const block = createElement('div', `directive-lcars-status-block directive-log-status-block directive-status-${tone}`);
  const key = createElement('span', 'directive-lcars-status-label');
  key.textContent = label;
  const content = createElement('strong', 'directive-lcars-status-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  block.append(key, content);
  return block;
}

function appendLogPillList(container, label, items, className = '') {
  const safeItems = asArray(items);
  if (safeItems.length === 0) return false;
  const group = createElement('section', `directive-log-detail-group${className ? ` ${className}` : ''}`);
  const heading = createElement('h4', 'directive-inline-title directive-log-detail-title');
  heading.textContent = label;
  const list = createElement('div', 'directive-log-pill-list');
  for (const item of safeItems) {
    const row = createElement('p', 'directive-log-pill');
    row.textContent = item;
    list.appendChild(row);
  }
  group.append(heading, list);
  container.appendChild(group);
  return true;
}

function createLogEntryCard(entry, index) {
  const assisted = normalizeAssistedSummary(entry);
  const isLatest = index === 0;
  const title = assisted.title || formatLogType(entry.type) || entry.id;
  const card = createCard(`directive-log-entry-card directive-lcars-panel${isLatest ? ' directive-log-latest-entry' : ''}`);

  const header = createElement('div', 'directive-log-entry-header');
  const identity = createElement('div', 'directive-log-entry-identity');
  identity.appendChild(createCardTitle(title || 'Command Log Entry'));
  const meta = createElement('p', 'directive-log-entry-meta');
  meta.textContent = [
    formatLogType(entry.type),
    entry.stardate ? `Stardate ${entry.stardate}` : '',
    `Source ${formatSourceStatus(entry)}`
  ].filter(Boolean).join(' / ');
  identity.appendChild(meta);
  const badge = createElement('span', 'directive-log-entry-badge');
  badge.textContent = assisted.summary ? 'Assisted' : assisted.status || 'Recorded';
  header.append(identity, badge);
  card.appendChild(header);

  const summary = assisted.summary || asArray(entry.summaryInputs)[0] || asArray(entry.visibleConsequences)[0] || '';
  if (summary) {
    const summaryBlock = createElement('p', 'directive-log-summary');
    summaryBlock.textContent = summary;
    card.appendChild(summaryBlock);
  }

  appendLogPillList(card, 'Highlights', assisted.highlights, 'directive-log-highlights');
  appendLogPillList(card, 'Visible Consequences', entry.visibleConsequences, 'directive-log-consequences');
  appendLogPillList(card, 'Committed Inputs', entry.summaryInputs, 'directive-log-inputs');
  return card;
}

export function renderCommandLogPanel(body, view) {
  appendSectionTitle(body, 'Log');
  const state = view?.campaignState;
  if (!state) {
    appendEmpty(body, 'No command log entries.');
    return;
  }

  const entries = state.commandLog?.entries || [];
  if (entries.length === 0) {
    appendEmpty(body, 'No command log entries.');
    return;
  }

  const ordered = entries.slice().reverse();
  const consoleSurface = createElement('div', 'directive-log-console directive-lcars-console');
  const consequenceCount = entries.reduce((total, entry) => total + asArray(entry.visibleConsequences).length, 0);
  const statusGrid = createElement('div', 'directive-log-status-grid');
  statusGrid.append(
    createLogStatusBlock('Entries', entries.length, 'success'),
    createLogStatusBlock('Latest', latestStardate(ordered)),
    createLogStatusBlock('Assisted', assistedStatus(entries), 'success'),
    createLogStatusBlock('Consequences', consequenceCount, consequenceCount > 0 ? 'warning' : 'neutral')
  );
  consoleSurface.appendChild(statusGrid);

  const timeline = createElement('div', 'directive-log-timeline');
  for (const [index, entry] of ordered.entries()) {
    timeline.appendChild(createLogEntryCard(entry, index));
  }
  consoleSurface.appendChild(timeline);
  body.appendChild(consoleSurface);
}
