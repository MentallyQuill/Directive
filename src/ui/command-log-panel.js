import {
  addTooltip,
  appendEmpty,
  appendSectionTitle,
  clearElement,
  createCard,
  createCardTitle,
  createElement,
  createIcon
} from './runtime-ui-kit.js';
import { currentChatEmptyMessage } from './current-chat-scope-copy.js';
import { playerSafeAdvisoryRecords } from './advisory-records.js';

const LOG_SUMMARY_COLLAPSE_LENGTH = 360;

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function displayValue(value, fallback = 'None') {
  const text = cleanText(value ?? '');
  return text || fallback;
}

function logItemText(value) {
  if (typeof value === 'string') return cleanText(value);
  if (!value || typeof value !== 'object') return cleanText(value);
  return cleanText(value.summary || value.label || value.description || value.title || value.name || value.id || '');
}

function compactText(value, maxLength = LOG_SUMMARY_COLLAPSE_LENGTH) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
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

function latestStardate(entries) {
  return entries.find((entry) => entry?.stardate)?.stardate || 'None';
}

function createLogStatusBlock(label, value, tone = 'neutral', tooltip = '') {
  const block = createElement('div', `directive-lcars-status-block directive-log-status-block directive-status-${tone}`);
  const key = createElement('span', 'directive-lcars-status-label');
  key.textContent = label;
  const content = createElement('strong', 'directive-lcars-status-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  block.append(key, content);
  if (tooltip) addTooltip(block, tooltip);
  return block;
}

function appendLogPillList(container, label, items, className = '') {
  const safeItems = asArray(items).map(logItemText).filter(Boolean);
  if (safeItems.length === 0) return false;
  const group = createElement('section', `directive-log-detail-group${className ? ` ${className}` : ''}`);
  addTooltip(group, `${label} for this committed player-facing command record.`);
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

function setLogSummaryToggleContent(button, expanded) {
  clearElement(button);
  const label = createElement('span');
  label.textContent = expanded ? 'Less' : 'More...';
  button.append(createIcon(expanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'), label);
}

function createLogSummaryDisclosure(summaryText) {
  const fullText = displayValue(summaryText, 'Command record committed.');
  const wrapper = createElement('div', 'directive-log-summary-disclosure');
  const summary = createElement('p', 'directive-log-summary');
  wrapper.appendChild(summary);
  if (fullText.length <= LOG_SUMMARY_COLLAPSE_LENGTH) {
    summary.textContent = fullText;
    return wrapper;
  }

  summary.textContent = compactText(fullText);
  const toggle = createElement('button', 'directive-log-summary-toggle directive-secondary-command');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Show full command log summary');
  addTooltip(toggle, 'Show full command log summary.');
  setLogSummaryToggleContent(toggle, false);
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    summary.textContent = expanded ? fullText : compactText(fullText);
    wrapper.classList.toggle('directive-log-summary-expanded', expanded);
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.setAttribute('aria-label', expanded ? 'Collapse command log summary' : 'Show full command log summary');
    addTooltip(toggle, expanded ? 'Collapse command log summary.' : 'Show full command log summary.');
    setLogSummaryToggleContent(toggle, expanded);
  });
  wrapper.appendChild(toggle);
  return wrapper;
}

function createLogEntryCard(entry, displayIndex, chronologicalNumber = displayIndex + 1) {
  const assisted = normalizeAssistedSummary(entry);
  const isLatest = displayIndex === 0;
  const consequenceCount = asArray(entry.visibleConsequences).length;
  const linkedAssignmentTitles = asArray(entry.linkedAssignmentTitles);
  const title = assisted.title || formatLogType(entry.type) || entry.id;
  const card = createCard(`directive-log-entry-card directive-lcars-panel${isLatest ? ' directive-log-latest-entry' : ''}`);
  card.dataset.directiveTour = isLatest ? 'log.entry.latest log.entry' : 'log.entry';
  addTooltip(card, 'Committed player-facing campaign record. Hidden Director state is not shown.');
  card.dataset.logEntry = 'true';
  card.dataset.logKind = assisted.summary ? 'summary' : consequenceCount ? 'consequence' : 'recorded';
  card.dataset.logSearchText = [
    title,
    entry.type,
    entry.stardate,
    assisted.summary,
    ...asArray(entry.visibleConsequences),
    ...asArray(entry.summaryInputs),
    ...linkedAssignmentTitles
  ].filter(Boolean).join(' ').toLowerCase();

  const marker = createElement('div', 'directive-log-timeline-marker');
  const markerIndex = createElement('strong');
  markerIndex.textContent = String(chronologicalNumber).padStart(2, '0');
  const markerDot = createElement('span');
  marker.append(markerIndex, markerDot);

  const content = createElement('div', 'directive-log-entry-content');
  const header = createElement('div', 'directive-log-entry-header');
  const identity = createElement('div', 'directive-log-entry-identity');
  const kicker = createElement('span', 'directive-lcars-kicker');
  kicker.textContent = isLatest ? 'Latest Record' : formatLogType(entry.type);
  identity.append(kicker, createCardTitle(title || 'Command Log Entry'));
  if (entry.stardate) {
    const meta = createElement('p', 'directive-log-entry-meta');
    meta.textContent = `Stardate ${entry.stardate}`;
    identity.appendChild(meta);
  }
  header.appendChild(identity);
  if (consequenceCount) {
    const badge = createElement('span', 'directive-log-entry-badge directive-log-badge-consequence');
    badge.textContent = `${consequenceCount} ${consequenceCount === 1 ? 'Consequence' : 'Consequences'}`;
    header.appendChild(badge);
  }
  content.appendChild(header);

  const summary = assisted.summary || asArray(entry.summaryInputs).map(logItemText).filter(Boolean)[0] || asArray(entry.visibleConsequences).map(logItemText).filter(Boolean)[0] || 'Command record committed.';
  content.appendChild(createLogSummaryDisclosure(summary));

  const details = createElement('div', 'directive-log-entry-details');
  details.hidden = !isLatest;
  appendLogPillList(details, 'Highlights', assisted.highlights, 'directive-log-highlights');
  appendLogPillList(details, 'Linked Orders', linkedAssignmentTitles, 'directive-log-linked-assignments');
  appendLogPillList(details, 'Visible Consequences', entry.visibleConsequences, 'directive-log-consequences');
  appendLogPillList(details, 'Committed Inputs', entry.summaryInputs, 'directive-log-inputs');

  const footer = createElement('div', 'directive-log-entry-footer');
  const toggle = createElement('button', 'directive-log-detail-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', isLatest ? 'true' : 'false');
  addTooltip(toggle, isLatest ? 'Hide highlights, consequences, and committed inputs.' : 'Show highlights, consequences, and committed inputs.');
  toggle.append(createIcon('fa-solid fa-list-ul'));
  const toggleLabel = createElement('span');
  toggleLabel.textContent = isLatest ? 'Hide Details' : 'View Details';
  toggle.appendChild(toggleLabel);
  toggle.addEventListener('click', () => {
    details.hidden = !details.hidden;
    const open = !details.hidden;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggleLabel.textContent = open ? 'Hide Details' : 'View Details';
    addTooltip(toggle, open ? 'Hide highlights, consequences, and committed inputs.' : 'Show highlights, consequences, and committed inputs.');
  });
  footer.appendChild(toggle);
  content.append(details, footer);
  card.append(marker, content);
  return card;
}

function createAdvisoryLogSection(records = []) {
  const section = createElement('section', 'directive-log-advisory-section directive-lcars-panel');
  section.dataset.directiveTour = 'log.advisory-notes';
  addTooltip(section, 'Player-safe counsel and decision-support notes. These are not committed outcome records.');
  const header = createElement('header', 'directive-log-advisory-header');
  const copy = createElement('div');
  const kicker = createElement('span', 'directive-lcars-kicker');
  kicker.textContent = 'Decision Support';
  const title = createElement('h3', 'directive-log-overview-title');
  title.textContent = 'Advisory Notes';
  const summary = createElement('p');
  summary.textContent = 'Counsel requests and player-safe advisory context recorded without turning them into chat narration or committed outcomes.';
  copy.append(kicker, title, summary);
  header.appendChild(copy);
  section.appendChild(header);

  const list = createElement('div', 'directive-log-advisory-list');
  for (const record of records) {
    const item = createElement('article', 'directive-log-advisory-card');
    item.dataset.logEntry = 'true';
    item.dataset.logKind = 'advisory';
    item.dataset.logSearchText = [record.subject, record.logSummary, record.missionBrief, ...record.options, ...record.considerations].filter(Boolean).join(' ').toLowerCase();
    const itemKicker = createElement('span', 'directive-lcars-kicker');
    itemKicker.textContent = record.meta || 'Advisory';
    const itemTitle = createElement('h4', 'directive-log-advisory-title');
    itemTitle.textContent = record.subject || 'Advisory note';
    item.append(itemKicker, itemTitle, createLogSummaryDisclosure(record.logSummary || record.missionBrief));
    if (record.options.length || record.considerations.length) {
      const details = createElement('div', 'directive-log-entry-details');
      appendLogPillList(details, 'Options', record.options, 'directive-log-inputs');
      appendLogPillList(details, 'Context', record.considerations, 'directive-log-highlights');
      item.appendChild(details);
    }
    list.appendChild(item);
  }
  section.appendChild(list);
  return section;
}

export function renderCommandLogPanel(body, view) {
  appendSectionTitle(body, 'Log');
  const state = view?.campaignState;
  if (!state) {
    appendEmpty(body, currentChatEmptyMessage(view));
    return;
  }

  const entries = state.commandLog?.entries || [];
  const advisoryRecords = playerSafeAdvisoryRecords(state, { limit: 20 });
  if (entries.length === 0 && advisoryRecords.length === 0) {
    appendEmpty(body, 'No command log entries.');
    return;
  }

  const ordered = entries.slice().reverse();
  const consoleSurface = createElement('div', 'directive-log-console directive-lcars-console');
  const consequenceCount = entries.reduce((total, entry) => total + asArray(entry.visibleConsequences).length, 0);

  const overview = createElement('section', 'directive-log-overview directive-lcars-panel');
  overview.dataset.directiveTour = 'log.overview';
  addTooltip(overview, 'Searchable player-facing command history from newest to oldest.');
  const overviewHeader = createElement('header', 'directive-log-overview-header');
  const overviewCopy = createElement('div');
  const kicker = createElement('span', 'directive-lcars-kicker');
  kicker.textContent = 'Memory Index & Recall';
  const title = createElement('h3', 'directive-log-overview-title');
  title.textContent = 'Command History';
  const summary = createElement('p');
  summary.textContent = 'Review player-facing decisions, outcomes, and committed consequences from newest to oldest.';
  overviewCopy.append(kicker, title, summary);
  overviewHeader.appendChild(overviewCopy);
  overview.appendChild(overviewHeader);
  if (entries.length > 5 || consequenceCount > 5) {
    const statusGrid = createElement('div', 'directive-log-status-grid');
    statusGrid.append(
      createLogStatusBlock('Entries', entries.length, 'success', 'Number of player-facing command log entries.'),
      createLogStatusBlock('Latest', latestStardate(ordered), 'neutral', 'Most recent stardate recorded in the command log.'),
      createLogStatusBlock('Consequences', consequenceCount, consequenceCount > 0 ? 'warning' : 'neutral', 'Visible consequences attached to committed command records.')
    );
    if (advisoryRecords.length) {
      statusGrid.appendChild(createLogStatusBlock('Advisory', advisoryRecords.length, 'warning', 'Player-safe counsel and decision-support notes.'));
    }
    overview.appendChild(statusGrid);
  }
  consoleSurface.appendChild(overview);

  const controls = createElement('div', 'directive-log-controls directive-lcars-panel');
  controls.dataset.directiveTour = 'log.search';
  const searchWrap = createElement('label', 'directive-log-search');
  searchWrap.dataset.directiveTour = 'log.search.input';
  searchWrap.appendChild(createIcon('fa-solid fa-magnifying-glass'));
  const search = createElement('input', 'directive-log-search-input');
  search.type = 'search';
  search.placeholder = 'Search command history';
  search.setAttribute('aria-label', 'Search command history');
  addTooltip(search, 'Search player-facing command history.');
  searchWrap.appendChild(search);
  const filters = createElement('div', 'directive-log-filter-row');
  filters.dataset.directiveTour = 'log.filters';
  const filterDefinitions = [
    ['all', 'All Records'],
    ['summary', 'Summaries'],
    ['consequence', 'Consequences'],
    ['advisory', 'Advisory']
  ];
  const filterButtons = [];
  let activeFilter = 'all';
  let timeline = null;
  let filterScope = null;
  const applyFilters = () => {
    const query = String(search.value || '').trim().toLowerCase();
    for (const item of filterScope?.querySelectorAll?.('[data-log-entry="true"]') || timeline?.querySelectorAll?.('[data-log-entry="true"]') || []) {
      const matchesText = !query || String(item.dataset.logSearchText || '').includes(query);
      const matchesKind = activeFilter === 'all' || item.dataset.logKind === activeFilter;
      item.hidden = !(matchesText && matchesKind);
    }
  };
  for (const [id, label] of filterDefinitions) {
    const button = createElement('button', `directive-log-filter${id === 'all' ? ' directive-log-filter-active' : ''}`);
    button.type = 'button';
    button.dataset.logFilter = id;
    button.textContent = label;
    button.setAttribute('aria-pressed', id === 'all' ? 'true' : 'false');
    addTooltip(button, id === 'all'
      ? 'Show all command records.'
      : id === 'summary'
        ? 'Show records with generated summaries.'
        : 'Show records with visible consequences.');
    button.addEventListener('click', () => {
      activeFilter = id;
      for (const peer of filterButtons) {
        const selected = peer.dataset.logFilter === id;
        peer.classList.toggle('directive-log-filter-active', selected);
        peer.setAttribute('aria-pressed', selected ? 'true' : 'false');
      }
      applyFilters();
    });
    filterButtons.push(button);
    filters.appendChild(button);
  }
  search.addEventListener('input', applyFilters);
  controls.append(searchWrap, filters);
  if (entries.length > 3 || advisoryRecords.length > 3) {
    consoleSurface.appendChild(controls);
  }

  if (advisoryRecords.length) {
    consoleSurface.appendChild(createAdvisoryLogSection(advisoryRecords));
  }

  timeline = createElement('div', 'directive-log-timeline');
  timeline.dataset.directiveTour = 'log.timeline';
  for (const [displayIndex, entry] of ordered.entries()) {
    timeline.appendChild(createLogEntryCard(entry, displayIndex, entries.length - displayIndex));
  }
  if (ordered.length) {
    consoleSurface.appendChild(timeline);
  }
  filterScope = consoleSurface;
  applyFilters();
  body.appendChild(consoleSurface);
}
