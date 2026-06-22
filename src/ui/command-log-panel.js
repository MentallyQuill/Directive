import {
  appendEmpty,
  appendSectionTitle,
  createCard,
  createCardTitle,
  createElement,
  createIcon
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

function latestStardate(entries) {
  return entries.find((entry) => entry?.stardate)?.stardate || 'None';
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

function createLogEntryCard(entry, displayIndex, chronologicalNumber = displayIndex + 1) {
  const assisted = normalizeAssistedSummary(entry);
  const isLatest = displayIndex === 0;
  const consequenceCount = asArray(entry.visibleConsequences).length;
  const title = assisted.title || formatLogType(entry.type) || entry.id;
  const card = createCard(`directive-log-entry-card directive-lcars-panel${isLatest ? ' directive-log-latest-entry' : ''}`);
  card.dataset.logEntry = 'true';
  card.dataset.logKind = assisted.summary ? 'summary' : consequenceCount ? 'consequence' : 'recorded';
  card.dataset.logSearchText = [title, entry.type, entry.stardate, assisted.summary, ...asArray(entry.visibleConsequences), ...asArray(entry.summaryInputs)].filter(Boolean).join(' ').toLowerCase();

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

  const summary = assisted.summary || asArray(entry.summaryInputs)[0] || asArray(entry.visibleConsequences)[0] || 'Command record committed.';
  const summaryBlock = createElement('p', 'directive-log-summary');
  summaryBlock.textContent = summary;
  content.appendChild(summaryBlock);

  const details = createElement('div', 'directive-log-entry-details');
  details.hidden = !isLatest;
  appendLogPillList(details, 'Highlights', assisted.highlights, 'directive-log-highlights');
  appendLogPillList(details, 'Visible Consequences', entry.visibleConsequences, 'directive-log-consequences');
  appendLogPillList(details, 'Committed Inputs', entry.summaryInputs, 'directive-log-inputs');

  const footer = createElement('div', 'directive-log-entry-footer');
  const toggle = createElement('button', 'directive-log-detail-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', isLatest ? 'true' : 'false');
  toggle.append(createIcon('fa-solid fa-list-ul'));
  const toggleLabel = createElement('span');
  toggleLabel.textContent = isLatest ? 'Hide Details' : 'View Details';
  toggle.appendChild(toggleLabel);
  toggle.addEventListener('click', () => {
    details.hidden = !details.hidden;
    const open = !details.hidden;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggleLabel.textContent = open ? 'Hide Details' : 'View Details';
  });
  footer.appendChild(toggle);
  content.append(details, footer);
  card.append(marker, content);
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

  const overview = createElement('section', 'directive-log-overview directive-lcars-panel');
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
      createLogStatusBlock('Entries', entries.length, 'success'),
      createLogStatusBlock('Latest', latestStardate(ordered)),
      createLogStatusBlock('Consequences', consequenceCount, consequenceCount > 0 ? 'warning' : 'neutral')
    );
    overview.appendChild(statusGrid);
  }
  consoleSurface.appendChild(overview);

  const controls = createElement('div', 'directive-log-controls directive-lcars-panel');
  const searchWrap = createElement('label', 'directive-log-search');
  searchWrap.appendChild(createIcon('fa-solid fa-magnifying-glass'));
  const search = createElement('input', 'directive-log-search-input');
  search.type = 'search';
  search.placeholder = 'Search command history';
  search.setAttribute('aria-label', 'Search command history');
  searchWrap.appendChild(search);
  const filters = createElement('div', 'directive-log-filter-row');
  const filterDefinitions = [
    ['all', 'All Records'],
    ['summary', 'Summaries'],
    ['consequence', 'Consequences']
  ];
  const filterButtons = [];
  let activeFilter = 'all';
  let timeline = null;
  const applyFilters = () => {
    const query = String(search.value || '').trim().toLowerCase();
    for (const item of timeline?.querySelectorAll?.('[data-log-entry="true"]') || []) {
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
  if (entries.length > 3) {
    consoleSurface.appendChild(controls);
  }

  timeline = createElement('div', 'directive-log-timeline');
  for (const [displayIndex, entry] of ordered.entries()) {
    timeline.appendChild(createLogEntryCard(entry, displayIndex, entries.length - displayIndex));
  }
  consoleSurface.appendChild(timeline);
  body.appendChild(consoleSurface);
}
