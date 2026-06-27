import {
  addTooltip,
  appendEmpty,
  appendSectionTitle,
  clearElement,
  createButton,
  createCard,
  createCardTitle,
  createElement,
  createIcon
} from './runtime-ui-kit.js';
import {
  DIRECTIVE_COMM_BADGE_ICON,
  createPackageImage,
  createPlayerPortraitImage,
  crewDivision
} from './directive-media.js';
import {
  activePackageForView,
  currentChatEmptyMessage
} from './current-chat-scope-copy.js';
import { advisoryItemsForCrew } from './advisory-records.js';

const DEFAULT_CREW_ID = 'mara-whitaker';
const DIVISION_LABELS = {
  command: 'Command',
  science: 'Science / Medical',
  operations: 'Operations / Security'
};
const PRESSURE_VISIBLE_STATUSES = new Set(['active', 'cooling', 'watch']);
const WORK_HIDDEN_STATUSES = new Set(['completed', 'resolved', 'cancelled', 'dismissed']);
const THREAD_VISIBLE_STATUSES = new Set(['engaged', 'active']);
const INSPECTOR_SUMMARY_COLLAPSE_LENGTH = 190;
const POSTURE_LABELS = {
  supports: 'Supportive',
  'supports-with-reservations': 'Supportive with reservations',
  undecided: 'Still evaluating',
  concerned: 'Concerned',
  objects: 'Objecting',
  refuses: 'Refusing'
};

let activeCrewId = DEFAULT_CREW_ID;
let activeCrewTab = 'character';

export function resetCrewPanelState() {
  activeCrewId = DEFAULT_CREW_ID;
  activeCrewTab = 'character';
}

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

function statusLabel(value) {
  const text = cleanText(value);
  if (!text) return '';
  return text
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function includesCrewId(record, crewId) {
  const ids = [
    ...asArray(record?.linkedCrewIds),
    ...asArray(record?.participants),
    ...asArray(record?.crewIds)
  ].map((id) => String(id));
  return ids.includes(crewId);
}

function visibleRecord(record) {
  return record?.visibility !== 'hidden';
}

function limitItems(items, limit = 2) {
  return items.filter(Boolean).slice(0, limit);
}

function packageCrewById(view) {
  return new Map((activePackageForView(view)?.crew?.senior || []).map((crew) => [crew.id, crew]));
}

function playerCrewRecord(state, crewId) {
  if (crewId !== 'player-commander') return null;
  const publicBio = [
    state.player?.dossier?.briefBiography,
    state.player?.dossier?.publicReputation
  ].map((item) => cleanText(item)).filter(Boolean);
  return {
    id: 'player-commander',
    name: state.player?.name || 'Player Commander',
    rank: state.player?.rank || 'Commander',
    billet: state.player?.billet || 'Executive Officer',
    species: state.player?.species?.label || state.player?.species || 'Player-defined',
    packageRole: state.player?.role || 'Principal mission commander and coordinator of shipboard operations',
    publicBio: publicBio.length ? publicBio : [
      'This commander is defined by the current player dossier and the public record established during character creation.'
    ]
  };
}

function relationshipForCrew(state, crewId) {
  return asArray(state?.relationships?.seniorCrew).find((entry) => entry?.crewId === crewId) || null;
}

function pressureRecordsForCrew(state, crewId) {
  return asArray(state?.pressureLedger?.records)
    .filter((record) => visibleRecord(record))
    .filter((record) => PRESSURE_VISIBLE_STATUSES.has(String(record.status || 'active').toLowerCase()))
    .filter((record) => includesCrewId(record, crewId))
    .map((record) => ({
      id: record.id,
      title: compactText(record.title || record.playerSummary || 'Active pressure', 92),
      meta: [
        statusLabel(record.urgencyBand),
        statusLabel(record.status)
      ].filter(Boolean).join(' / '),
      summary: cleanText(record.playerSummary || record.title)
    }));
}

function pressureMap(state) {
  return new Map(asArray(state?.pressureLedger?.records).map((record) => [record.id, record]));
}

function pressureIdsLinkedToCrew(sourceIds, pressureById, crewId) {
  return asArray(sourceIds).some((pressureId) => {
    const pressure = pressureById.get(pressureId);
    return visibleRecord(pressure) && includesCrewId(pressure, crewId);
  });
}

function openWorkForCrew(view, state, crewId) {
  const assignments = asArray(state?.mission?.openAssignments)
    .filter((assignment) => visibleRecord(assignment))
    .filter((assignment) => !WORK_HIDDEN_STATUSES.has(String(assignment.status || '').toLowerCase()))
    .filter((assignment) => includesCrewId(assignment, crewId))
    .map((assignment) => ({
      id: assignment.id,
      title: compactText(assignment.title || assignment.summary || 'Current order', 92),
      meta: ['Current Order', statusLabel(assignment.status || assignment.dueWindow)].filter(Boolean).join(' / '),
      summary: cleanText([
        assignment.summary || assignment.playerSummary || assignment.title,
        assignment.dueWindow ? `Due: ${assignment.dueWindow}` : ''
      ].filter(Boolean).join(' '))
    }));
  const packageTemplates = [
    ...asArray(activePackageForView(view)?.questTemplates?.templates),
    ...asArray(activePackageForView(view)?.questTemplates)
  ];
  const dynamicTemplates = asArray(state?.dynamicQuestCatalog?.templates);
  const templates = new Map([...packageTemplates, ...dynamicTemplates].filter((template) => template?.id).map((template) => [template.id, template]));
  const questWork = asArray(state?.questLedger?.instances)
    .filter((quest) => visibleRecord(quest))
    .filter((quest) => !WORK_HIDDEN_STATUSES.has(String(quest.status || '').toLowerCase()))
    .filter((quest) => String(quest.status || '').toLowerCase() !== 'latent')
    .filter((quest) => {
      const template = templates.get(quest.templateId || quest.id) || {};
      return asArray(template.anchors?.actorIds).includes(crewId)
        || asArray(quest.assignedActorIds).includes(crewId)
        || asArray(quest.delegation?.assignedActorIds).includes(crewId);
    })
    .map((quest) => {
      const template = templates.get(quest.templateId || quest.id) || {};
      const active = state?.questLedger?.foregroundQuestId === quest.id || state?.attentionState?.foregroundQuestId === quest.id;
      return {
        id: quest.id,
        title: compactText(template.title || quest.title || 'Open work', 92),
        meta: ['Quest', active ? 'Foreground' : statusLabel(quest.status)].filter(Boolean).join(' / '),
        summary: cleanText(template.playerSummary || template.summary || quest.title)
      };
    });
  return limitItems([...assignments, ...questWork], 4);
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

function playerFacingText(value) {
  const parsed = parseJsonText(value);
  if (parsed) {
    return parsed.summary
      || parsed.title
      || asArray(parsed.highlights)[0]
      || asArray(parsed.visibleConsequences)[0]
      || '';
  }
  if (typeof value === 'string' && value.trim().startsWith('{')) return '';
  return cleanText(value);
}

function commandLogByOutcomeId(state) {
  return new Map(asArray(state?.commandLog?.entries)
    .filter((entry) => entry?.sourceOutcomeId)
    .map((entry) => [entry.sourceOutcomeId, entry]));
}

function commandLogItem(entry) {
  if (!entry) return null;
  const assisted = typeof entry.assistedSummary === 'string'
    ? parseJsonText(entry.assistedSummary)
    : entry.assistedSummary;
  const title = compactText(
    assisted?.title
      || entry.title
      || entry.commandLabel
      || 'Recent command decision',
    92
  );
  const summary = cleanText(
    playerFacingText(assisted?.summary)
      || playerFacingText(entry.summary)
      || playerFacingText(entry.summaryInputs?.[0])
      || playerFacingText(asArray(entry.visibleConsequences)[0])
      || title
  );
  return {
    id: entry.sourceOutcomeId || entry.id || title,
    title,
    meta: 'Command Log',
    summary
  };
}

function recentCommandMemoryForCrew(state, crewId) {
  const logsByOutcome = commandLogByOutcomeId(state);
  const seen = new Set();
  const items = [];
  for (const memory of [...asArray(state?.relationships?.memoryLedger)].reverse()) {
    if (memory?.crewId !== crewId) continue;
    const logItem = commandLogItem(logsByOutcome.get(memory.sourceOutcomeId));
    const item = logItem || (memory.visibility !== 'hidden' ? {
      id: memory.sourceOutcomeId || memory.event || memory.interpretation,
      title: compactText(memory.event || 'Recent command memory', 92),
      meta: 'Crew Memory',
      summary: cleanText(memory.interpretation || memory.event)
    } : null);
    if (!item) continue;
    const key = item.id || `${item.title}:${item.summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return limitItems(items);
}

function openThreadsForCrew(state, crewId) {
  return asArray(state?.threadLedger?.records)
    .filter((record) => visibleRecord(record))
    .filter((record) => THREAD_VISIBLE_STATUSES.has(String(record.status || '').toLowerCase()))
    .filter((record) => includesCrewId(record, crewId))
    .map((record) => ({
      id: record.id,
      title: compactText(record.title || record.playerSummary || 'Ongoing concern', 92),
      meta: ['Open Thread', statusLabel(record.status)].filter(Boolean).join(' / '),
      summary: cleanText(record.playerSummary || record.observableSeed || record.title)
    }));
}

function postureItem(relationship, crewId) {
  if (crewId === 'player-commander') {
    return {
      id: 'player-command-posture',
      title: 'Player directed',
      meta: 'Command Posture',
      summary: 'This officer is the player character, so posture is expressed through current command choices.'
    };
  }
  const label = POSTURE_LABELS[relationship?.currentStance] || statusLabel(relationship?.currentStance);
  if (!label) return null;
  return {
    id: `${crewId}-posture`,
    title: label,
    meta: 'Crew Read',
    summary: 'Current qualitative command read from the active relationship state.'
  };
}

function publicBioLines(crew) {
  return asArray(crew?.publicBio)
    .map((line) => compactText(line, 260))
    .filter(Boolean);
}

function biographyParagraphs(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((paragraph) => cleanText(paragraph))
    .filter(Boolean);
}

function createCrewStatusBlock(label, value, tone = 'neutral', icon = '', tooltip = '') {
  const block = createElement('div', `directive-lcars-status-block directive-crew-status-block directive-status-${tone}`);
  if (icon) {
    const iconFrame = createElement('span', 'directive-lcars-status-icon');
    iconFrame.appendChild(createIcon(icon));
    block.appendChild(iconFrame);
  }
  const copy = createElement('span', 'directive-lcars-status-copy');
  const key = createElement('span', 'directive-lcars-status-label');
  key.textContent = label;
  const content = createElement('strong', 'directive-lcars-status-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  copy.append(key, content);
  block.appendChild(copy);
  if (tooltip) addTooltip(block, tooltip);
  return block;
}

function createCrewLocalTabs(onSelect) {
  const tabs = createElement('div', 'directive-crew-local-tabs');
  tabs.setAttribute('role', 'tablist');
  for (const [tabId, label] of [['character', 'Character'], ['crew', 'Crew']]) {
    const selected = activeCrewTab === tabId;
    const button = createElement('button', `directive-crew-local-tab${selected ? ' directive-crew-local-tab-active' : ''}`);
    button.type = 'button';
    button.dataset.directiveCrewSubtab = tabId;
    button.dataset.directiveTour = tabId === 'crew' ? 'crew.subtab.crew' : 'crew.subtab.character';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    button.textContent = label;
    addTooltip(button, tabId === 'character'
      ? 'Show the player character record, Command Bearing history, and player-safe crew interactions.'
      : 'Show the senior staff roster and Duty Roster.');
    button.addEventListener('click', () => onSelect(tabId, tabs));
    tabs.appendChild(button);
  }
  return tabs;
}

function updateCrewLocalTabs(tabs) {
  for (const button of Array.from(tabs.children || [])) {
    const selected = button.dataset.directiveCrewSubtab === activeCrewTab;
    button.classList.toggle('directive-crew-local-tab-active', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
  }
}

function divisionLabel(division) {
  return DIVISION_LABELS[division] || DIVISION_LABELS.operations;
}

function rankPipPattern(rank = '') {
  const text = String(rank || '').toLowerCase();
  if (/captain/.test(text)) return ['solid', 'solid', 'solid', 'solid'];
  if (/lieutenant\s+commander|lt\.?\s*commander/.test(text)) return ['solid', 'solid', 'hollow'];
  if (/commander/.test(text)) return ['solid', 'solid', 'solid'];
  if (/lieutenant\s+junior|lieutenant\s+jg|lt\.?\s*jg/.test(text)) return ['solid', 'hollow'];
  if (/lieutenant|lt\./.test(text)) return ['solid', 'solid'];
  if (/ensign/.test(text)) return ['solid'];
  return [];
}

function createRankPips(rank = '') {
  const pattern = rankPipPattern(rank);
  const pips = createElement('span', 'directive-crew-rank-pips');
  pips.setAttribute('aria-label', `${rank || 'Officer'} rank pips`);
  if (pattern.length === 0) {
    pips.classList.add('directive-crew-rank-pips-empty');
    return pips;
  }
  for (const pipType of pattern) {
    const pip = createElement('span', `directive-crew-rank-pip directive-crew-rank-pip-${pipType}`);
    pip.setAttribute('aria-hidden', 'true');
    pips.appendChild(pip);
  }
  return pips;
}

function createDivisionStrip(division) {
  const strip = createElement('span', `directive-crew-division-strip directive-crew-division-strip-${division}`);
  strip.setAttribute('aria-hidden', 'true');
  return strip;
}

function createDivisionIndicator(division) {
  const indicator = createElement('span', `directive-crew-division-indicator directive-crew-division-indicator-${division}`);
  indicator.appendChild(createDivisionStrip(division));
  const label = createElement('span', 'directive-crew-division-label');
  label.textContent = `${divisionLabel(division)} division`;
  indicator.appendChild(label);
  return indicator;
}

function createCrewRosterRow({ packageData, crewId, crew, portrait, selected, onSelect }) {
  const division = crewDivision(crew);
  const row = createElement('button', `directive-crew-roster-row directive-lcars-panel directive-crew-division-${division}${selected ? ' directive-crew-roster-row-active' : ''}`);
  row.type = 'button';
  row.dataset.crewId = crewId;
  row.dataset.directiveTour = selected ? 'crew.roster-row crew.selected-row' : 'crew.roster-row';
  row.setAttribute('aria-pressed', selected ? 'true' : 'false');
  row.setAttribute('aria-label', `View ${crew.name || crewId}, ${crew.rank || 'Officer'}, ${divisionLabel(division)} division`);
  addTooltip(row, `Open ${crew.rank || 'Officer'} ${crew.name || crewId} officer dossier.`);

  const portraitFrame = crewId === 'player-commander'
    ? createPlayerPortraitImage(portrait, {
        wrapperClass: 'directive-crew-roster-portrait',
        label: crew.name,
        iconAsset: DIRECTIVE_COMM_BADGE_ICON
      })
    : createPackageImage(packageData, {
        kind: 'crew.portrait.formal',
        subjectId: crewId,
        variant: 'thumb'
      }, {
        wrapperClass: 'directive-crew-roster-portrait',
        label: crew.name,
        icon: 'fa-solid fa-user'
      });

  const identity = createElement('span', 'directive-crew-row-identity');
  const rank = createElement('span', 'directive-crew-rank');
  rank.textContent = crew.rank || 'Officer';
  const name = createElement('strong', 'directive-crew-name');
  name.textContent = crew.name || crew.id;
  const billet = createElement('span', 'directive-crew-billet');
  billet.textContent = crew.billet || crew.packageRole || 'Crew assignment';
  identity.append(rank, name, billet);

  const status = createElement('span', 'directive-crew-row-status');
  status.append(createDivisionStrip(division), createRankPips(crew.rank));
  const chevron = createIcon('fa-solid fa-chevron-right directive-crew-row-chevron');
  row.append(portraitFrame, identity, status, chevron);
  row.addEventListener('mousedown', (event) => {
    if (event?.button === 0) event.preventDefault?.();
  });
  row.addEventListener('click', () => onSelect?.(crewId));
  return row;
}

function createCrewFact(label, value, icon = '', tooltip = '') {
  const fact = createElement('div', 'directive-crew-detail-fact');
  if (icon) {
    const iconFrame = createElement('span', 'directive-crew-detail-fact-icon');
    iconFrame.appendChild(createIcon(icon));
    fact.appendChild(iconFrame);
  }
  const copy = createElement('span');
  const key = createElement('span', 'directive-crew-detail-fact-label');
  key.textContent = label;
  const content = createElement('strong', 'directive-crew-detail-fact-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  copy.append(key, content);
  fact.appendChild(copy);
  if (tooltip) addTooltip(fact, tooltip || label);
  return fact;
}

function setBioToggleContent(button, expanded) {
  clearElement(button);
  const label = createElement('span');
  label.textContent = expanded ? 'Less' : 'More...';
  button.append(createIcon(expanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'), label);
}

function setCharacterBiographyToggleContent(button, expanded) {
  clearElement(button);
  const label = createElement('span');
  label.textContent = expanded ? 'Less' : 'More...';
  button.append(createIcon(expanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'), label);
}

function setInspectorSummaryToggleContent(button, expanded) {
  clearElement(button);
  const label = createElement('span');
  label.textContent = expanded ? 'Less' : 'More...';
  button.append(createIcon(expanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'), label);
}

function createInspectorSummary(summaryText) {
  const fullText = cleanText(summaryText);
  if (!fullText) return null;
  const wrapper = createElement('div', 'directive-crew-inspector-summary-disclosure');
  const summary = createElement('p', 'directive-crew-inspector-item-summary');
  wrapper.appendChild(summary);
  if (fullText.length <= INSPECTOR_SUMMARY_COLLAPSE_LENGTH) {
    summary.textContent = fullText;
    return wrapper;
  }

  summary.textContent = compactText(fullText, INSPECTOR_SUMMARY_COLLAPSE_LENGTH);
  const toggle = createElement('button', 'directive-crew-inspector-summary-toggle directive-secondary-command');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Show full tracked crew summary');
  addTooltip(toggle, 'Show full tracked crew summary.');
  setInspectorSummaryToggleContent(toggle, false);
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    summary.textContent = expanded ? fullText : compactText(fullText, INSPECTOR_SUMMARY_COLLAPSE_LENGTH);
    wrapper.classList.toggle('directive-crew-inspector-summary-expanded', expanded);
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.setAttribute('aria-label', expanded ? 'Collapse tracked crew summary' : 'Show full tracked crew summary');
    addTooltip(toggle, expanded ? 'Collapse tracked crew summary.' : 'Show full tracked crew summary.');
    setInspectorSummaryToggleContent(toggle, expanded);
  });
  wrapper.appendChild(toggle);
  return wrapper;
}

function createCrewPublicBio(lines) {
  const bio = createElement('section', 'directive-crew-public-bio');
  const visibleLines = lines.length ? lines : ['Public profile details have not been established for this officer yet.'];
  for (const line of visibleLines.slice(0, 2)) {
    const paragraph = createElement('p', 'directive-crew-public-bio-line');
    paragraph.textContent = line;
    bio.appendChild(paragraph);
  }
  if (visibleLines.length <= 2) return bio;

  const more = createElement('div', 'directive-crew-public-bio-more');
  more.hidden = true;
  for (const line of visibleLines.slice(2)) {
    const paragraph = createElement('p', 'directive-crew-public-bio-line');
    paragraph.textContent = line;
    more.appendChild(paragraph);
  }
  const toggle = createElement('button', 'directive-crew-public-bio-toggle directive-secondary-command');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Show full public crew profile');
  addTooltip(toggle, 'Show full public crew profile.');
  setBioToggleContent(toggle, false);
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    more.hidden = !expanded;
    bio.classList.toggle('directive-crew-public-bio-expanded', expanded);
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.setAttribute('aria-label', expanded ? 'Collapse public crew profile' : 'Show full public crew profile');
    addTooltip(toggle, expanded ? 'Collapse public crew profile.' : 'Show full public crew profile.');
    setBioToggleContent(toggle, expanded);
  });

  bio.append(more, toggle);
  return bio;
}

function createCharacterBiography(dossier = {}) {
  const paragraphs = biographyParagraphs(dossier.briefBiography || dossier.publicReputation);
  if (!paragraphs.length) return null;

  const wrapper = createElement('section', 'directive-character-biography directive-character-biography-disclosure');
  const opening = createElement('p', 'directive-character-biography-line');
  opening.textContent = paragraphs[0];
  wrapper.appendChild(opening);
  if (paragraphs.length <= 1) return wrapper;

  const more = createElement('div', 'directive-character-biography-more');
  more.hidden = true;
  for (const paragraph of paragraphs.slice(1)) {
    const item = createElement('p', 'directive-character-biography-line');
    item.textContent = paragraph;
    more.appendChild(item);
  }

  const toggle = createElement('button', 'directive-character-biography-toggle directive-secondary-command');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Show full player character biography');
  addTooltip(toggle, 'Show full player character biography.');
  setCharacterBiographyToggleContent(toggle, false);
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    more.hidden = !expanded;
    wrapper.classList.toggle('directive-character-biography-expanded', expanded);
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.setAttribute('aria-label', expanded ? 'Collapse player character biography' : 'Show full player character biography');
    addTooltip(toggle, expanded ? 'Collapse player character biography.' : 'Show full player character biography.');
    setCharacterBiographyToggleContent(toggle, expanded);
  });

  wrapper.append(more, toggle);
  return wrapper;
}

function createInspectorItem(item) {
  const row = createElement('article', 'directive-crew-inspector-item');
  addTooltip(row, item.summary || item.title || 'Tracked crew context.');
  if (item.meta) {
    const meta = createElement('span', 'directive-crew-inspector-meta');
    meta.textContent = item.meta;
    row.appendChild(meta);
  }
  const title = createElement('strong', 'directive-crew-inspector-item-title');
  title.textContent = item.title || 'Tracked item';
  row.appendChild(title);
  const summary = createInspectorSummary(item.summary);
  if (summary) row.appendChild(summary);
  return row;
}

function createInspectorSection({ title, icon, items, emptyText, tooltip = '' }) {
  const section = createElement('section', 'directive-crew-inspector-section');
  const tourByTitle = {
    'Command Posture': 'crew.relationships',
    'Command Context': 'crew.advisory',
    'Recent Command Memory': 'crew.memory',
    'Open Threads': 'crew.open-threads',
    'Current Pressure': 'crew.pressure',
    'Open Work': 'crew.open-work'
  };
  if (tourByTitle[title]) section.dataset.directiveTour = tourByTitle[title];
  if (tooltip) addTooltip(section, tooltip);
  const header = createElement('header', 'directive-crew-inspector-section-header');
  const iconFrame = createElement('span', 'directive-crew-inspector-section-icon');
  iconFrame.appendChild(createIcon(icon));
  const heading = createElement('h4');
  heading.textContent = title;
  header.append(iconFrame, heading);
  section.appendChild(header);

  if (items.length) {
    const list = createElement('div', 'directive-crew-inspector-list');
    for (const item of items) list.appendChild(createInspectorItem(item));
    section.appendChild(list);
  } else {
    const empty = createElement('p', 'directive-crew-inspector-empty');
    empty.textContent = emptyText;
    section.appendChild(empty);
  }
  return section;
}

function characterListItem(item = {}, options = {}) {
  const { summaryMaxLength = 340 } = options;
  const row = createElement('article', 'directive-character-record-item');
  if (item.meta || item.type || item.impact) {
    const meta = createElement('span', 'directive-character-record-meta');
    meta.textContent = statusLabel(item.meta || item.type || item.impact);
    row.appendChild(meta);
  }
  const title = createElement('strong', 'directive-character-record-title');
  title.textContent = item.title
    || item.awardSummary
    || item.actionSummary
    || item.crewName
    || item.track
    || 'Record';
  row.appendChild(title);
  const summaryText = item.playerFacingSummary
    || item.consequenceSummary
    || item.noAwardReason
    || item.summary
    || item.cue
    || item.rationale
    || '';
  if (summaryText) {
    const summary = createElement('p', 'directive-character-record-summary');
    summary.textContent = Number.isFinite(summaryMaxLength)
      ? compactText(summaryText, summaryMaxLength)
      : cleanText(summaryText);
    row.appendChild(summary);
  }
  return row;
}

function setCharacterSectionToggleContent(button, expanded) {
  clearElement(button);
  button.appendChild(createIcon(expanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'));
}

function characterListSection({
  title,
  icon,
  items = [],
  emptyText,
  className = '',
  tourTarget = '',
  collapsible = false,
  collapsed = false,
  summaryMaxLength = 340
}) {
  const sectionClasses = [
    'directive-character-section',
    'directive-lcars-panel',
    className,
    collapsible ? 'directive-character-section-collapsible' : '',
    collapsible && collapsed ? 'directive-character-section-collapsed' : ''
  ].filter(Boolean).join(' ');
  const section = createElement('section', sectionClasses);
  if (tourTarget) section.dataset.directiveTour = tourTarget;
  const header = createElement('header', 'directive-character-section-header');
  const iconFrame = createElement('span', 'directive-character-section-icon');
  iconFrame.appendChild(createIcon(icon));
  const heading = createElement('h3', 'directive-subsection-title');
  heading.textContent = title;
  header.append(iconFrame, heading);
  const content = createElement('div', 'directive-character-section-content');
  if (collapsible) {
    content.hidden = collapsed;
    const toggle = createElement('button', 'directive-character-section-toggle directive-secondary-command');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.setAttribute('aria-label', collapsed ? `Show ${title}` : `Collapse ${title}`);
    addTooltip(toggle, collapsed ? `Show ${title}.` : `Collapse ${title}.`);
    setCharacterSectionToggleContent(toggle, !collapsed);
    toggle.addEventListener('click', () => {
      const expanded = content.hidden;
      content.hidden = !expanded;
      section.classList.toggle('directive-character-section-collapsed', !expanded);
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      toggle.setAttribute('aria-label', expanded ? `Collapse ${title}` : `Show ${title}`);
      addTooltip(toggle, expanded ? `Collapse ${title}.` : `Show ${title}.`);
      setCharacterSectionToggleContent(toggle, expanded);
    });
    header.appendChild(toggle);
  }
  section.appendChild(header);
  if (items.length) {
    const list = createElement('div', 'directive-character-record-list');
    for (const item of items) list.appendChild(characterListItem(item, { summaryMaxLength }));
    content.appendChild(list);
  } else {
    const empty = createElement('p', 'directive-runtime-empty');
    empty.textContent = emptyText;
    content.appendChild(empty);
  }
  section.appendChild(content);
  return section;
}

function commandBearingTrackCard(track = {}) {
  const card = createElement('article', 'directive-character-command-bearing-track directive-lcars-panel');
  const label = createElement('span', 'directive-lcars-kicker');
  label.textContent = track.label || statusLabel(track.track) || 'Command Bearing';
  const rank = createElement('strong', 'directive-character-command-bearing-rank');
  rank.textContent = track.rankTitle || `Rank ${track.rank || 0}`;
  const marks = createElement('span', 'directive-character-command-bearing-marks');
  const next = track.nextRankMarks ? ` / ${track.nextRankMarks}` : '';
  marks.textContent = `${Number(track.marks || 0)}${next} Marks`;
  const points = createElement('span', 'directive-character-command-bearing-points');
  points.textContent = `${Number(track.points || 0)} banked`;
  card.append(label, rank, marks, points);
  return card;
}

function createPlayerPortraitControls({ portrait, view, actions = {}, extraClassName = '' } = {}) {
  const supported = view?.media?.playerPortraitImportSupported === true
    && typeof actions.importPlayerPortrait === 'function';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp';
  fileInput.hidden = true;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0] || null;
    if (!file) return;
    await actions.importPlayerPortrait({ file });
    fileInput.value = '';
    await actions.refresh?.();
  });
  const portraitActions = createElement('div', `directive-crew-player-portrait-actions${extraClassName ? ` ${extraClassName}` : ''}`);
  portraitActions.appendChild(createButton({
    label: portrait?.asset?.path ? 'Change' : 'Import',
    icon: 'fa-solid fa-image',
    className: 'directive-button directive-crew-player-portrait-import',
    title: supported ? 'Import a player character portrait' : 'Portrait import is not available on this host',
    disabled: !supported,
    onClick: async () => {
      fileInput.click?.();
    }
  }));
  if (portrait?.asset?.path) {
    portraitActions.appendChild(createButton({
      label: 'Remove',
      icon: 'fa-solid fa-trash-can',
      className: 'directive-button directive-crew-player-portrait-remove',
      title: 'Remove this player character portrait',
      disabled: typeof actions.removePlayerPortrait !== 'function',
      onClick: async () => {
        await actions.removePlayerPortrait();
        await actions.refresh?.();
      }
    }));
  }
  return { portraitActions, fileInput };
}

function renderCharacterTab(body, view, actions = {}) {
  const character = view?.playerCharacterView || view?.loadedPlayerCharacterView || null;
  if (!character) {
    appendEmpty(body, 'No player character record is available for this campaign chat.');
    return;
  }

  const shell = createElement('div', 'directive-character-console directive-lcars-console');
  const hero = createElement('section', 'directive-character-hero directive-lcars-panel');
  hero.dataset.directiveTour = 'crew.character';
  const portrait = createPlayerPortraitImage(character.portrait, {
    wrapperClass: 'directive-character-portrait',
    label: character.identity?.name,
    iconAsset: DIRECTIVE_COMM_BADGE_ICON
  });
  const portraitStack = createElement('div', 'directive-character-portrait-stack');
  const { portraitActions, fileInput } = createPlayerPortraitControls({
    portrait: character.portrait,
    view,
    actions,
    extraClassName: 'directive-character-portrait-actions'
  });
  portraitStack.append(portrait, portraitActions, fileInput);
  const copy = createElement('div', 'directive-character-hero-copy');
  const kicker = createElement('span', 'directive-lcars-kicker');
  kicker.textContent = 'Player Character';
  const name = createElement('h3', 'directive-crew-console-title');
  name.textContent = character.identity?.name || 'Player Character';
  const role = createElement('p', 'directive-character-role');
  role.textContent = [
    character.identity?.rank,
    character.identity?.billet,
    character.identity?.species
  ].filter(Boolean).join(' / ') || 'Player-defined command character';
  copy.append(kicker, name, role);
  const biography = createCharacterBiography(character.dossier);
  if (biography) copy.appendChild(biography);
  hero.append(portraitStack, copy);
  shell.appendChild(hero);

  shell.appendChild(characterListSection({
    title: 'Service Record',
    icon: 'fa-solid fa-id-card-clip',
    items: character.serviceRecord || [],
    emptyText: 'No service record details are available yet.',
    className: 'directive-character-service-record-section',
    collapsible: true,
    collapsed: true,
    summaryMaxLength: null
  }));

  const bearing = character.commandBearingSummary || character.commandBearing || {};
  const bearingSection = createElement('section', 'directive-character-section directive-character-command-bearing directive-lcars-panel');
  bearingSection.dataset.directiveTour = 'crew.command-bearing';
  const bearingHeader = createElement('header', 'directive-character-section-header');
  const bearingIcon = createElement('span', 'directive-character-section-icon');
  bearingIcon.appendChild(createIcon('fa-solid fa-compass-drafting'));
  const bearingTitle = createElement('h3', 'directive-subsection-title');
  bearingTitle.textContent = 'Command Bearing';
  bearingHeader.append(bearingIcon, bearingTitle);
  const reserve = createElement('p', 'directive-character-bearing-reserve');
  reserve.textContent = `${Number(bearing.reserve?.current || 0)} / ${Number(bearing.reserve?.capacity || 0)} reserve points banked`;
  const tracks = createElement('div', 'directive-character-command-bearing-grid');
  for (const track of [bearing.tracks?.inspiration, bearing.tracks?.resolve].filter(Boolean)) {
    tracks.appendChild(commandBearingTrackCard(track));
  }
  bearingSection.append(bearingHeader, reserve, tracks);
  shell.appendChild(bearingSection);

  shell.append(
    characterListSection({
      title: 'Command Bearing Evidence',
      icon: 'fa-solid fa-scale-balanced',
      items: character.commandBearingEvidence || [],
      emptyText: 'No open Command Bearing evidence has been surfaced yet.'
    }),
    characterListSection({
      title: 'Mark Reviews',
      icon: 'fa-solid fa-award',
      items: character.commandBearingReviews || [],
      emptyText: 'No arc or chapter review has awarded or declined a Command Bearing Mark yet.'
    }),
    characterListSection({
      title: 'Recent Command Bearing',
      icon: 'fa-solid fa-clock-rotate-left',
      items: character.commandBearingHistory || [],
      emptyText: 'No recent Command Bearing spend or recovery is recorded.'
    }),
    characterListSection({
      title: 'Standing With Senior Staff',
      icon: 'fa-solid fa-users-viewfinder',
      items: (character.currentStandingSummary || []).map((entry) => ({
        title: entry.crewName,
        summary: entry.posture,
        meta: 'Visible posture'
      })),
      emptyText: 'No player-safe standing summary is available yet.'
    }),
    characterListSection({
      title: 'Crew Interactions',
      icon: 'fa-solid fa-comments',
      items: character.crewInteractionLog || [],
      emptyText: 'No player-safe crew interaction memory is visible yet.',
      tourTarget: 'crew.character.interactions'
    }),
    characterListSection({
      title: 'Perceived Relationship Shifts',
      icon: 'fa-solid fa-eye',
      items: character.relationshipPerceptions || [],
      emptyText: 'No perceived relationship shift has been surfaced yet.',
      tourTarget: 'crew.character.relationships'
    })
  );

  body.appendChild(shell);
}

function createCrewInspector({ view, state, crewId }) {
  const relationship = relationshipForCrew(state, crewId);
  const grid = createElement('div', 'directive-crew-inspector-grid');
  grid.dataset.directiveTour = 'crew.relationships';
  const posture = postureItem(relationship, crewId);
  grid.append(
    createInspectorSection({
      title: 'Command Posture',
      icon: 'fa-solid fa-compass',
      items: posture ? [posture] : [],
      emptyText: 'No qualitative command read has been surfaced yet.',
      tooltip: 'Qualitative visible stance toward current command choices. Numeric relationship scores stay internal.'
    }),
    createInspectorSection({
      title: 'Current Pressure',
      icon: 'fa-solid fa-gauge-high',
      items: pressureRecordsForCrew(state, crewId),
      emptyText: 'No visible pressure is currently linked to this officer.',
      tooltip: 'Visible obligations or stresses tied to this officer.'
    }),
    createInspectorSection({
      title: 'Command Context',
      icon: 'fa-solid fa-clipboard-question',
      items: advisoryItemsForCrew(state, crewId),
      emptyText: 'No player-safe advisory note is currently linked to this officer.',
      tooltip: 'Counsel and decision-support notes involving this officer. Hidden analysis is not shown.'
    }),
    createInspectorSection({
      title: 'Open Work',
      icon: 'fa-solid fa-clipboard-list',
      items: openWorkForCrew(view, state, crewId),
      emptyText: 'No active quest or follow-up work is linked to this officer.',
      tooltip: 'Active side assignments or follow-up work involving this officer.'
    }),
    createInspectorSection({
      title: 'Recent Command Memory',
      icon: 'fa-solid fa-book-open',
      items: recentCommandMemoryForCrew(state, crewId),
      emptyText: 'No recent command-log memory is visible for this officer yet.',
      tooltip: "Command Log items that can inform this officer's current context."
    }),
    createInspectorSection({
      title: 'Open Threads',
      icon: 'fa-solid fa-comments',
      items: openThreadsForCrew(state, crewId),
      emptyText: 'No visible ongoing concern is linked to this officer.',
      tooltip: 'Ongoing personal or shipboard story material involving this officer. Hidden threads are not shown.'
    })
  );
  return grid;
}

function createCrewDetailPanel({ packageData, crewId, crew, portrait, view, actions = {} }) {
  const division = crewDivision(crew);
  const state = view?.campaignState || {};
  const panel = createCard(`directive-crew-detail-panel directive-lcars-panel directive-crew-division-${division}`);
  panel.dataset.crewDetailId = crewId;
  panel.dataset.directiveTour = 'crew.detail';
  panel.setAttribute('aria-label', `${crew.name || crewId} officer dossier`);
  addTooltip(panel, 'Officer dossier with public profile, visible pressures, open work, command memory, and open threads.');

  const visual = crewId === 'player-commander'
    ? createPlayerPortraitImage(portrait, {
        wrapperClass: 'directive-crew-detail-portrait',
        label: crew.name,
        iconAsset: DIRECTIVE_COMM_BADGE_ICON
      })
    : createPackageImage(packageData, {
        kind: 'crew.portrait.formal',
        subjectId: crewId,
        variant: 'detail'
      }, {
        wrapperClass: 'directive-crew-detail-portrait',
        label: crew.name,
        icon: 'fa-solid fa-user'
      });

  const visualStack = createElement('div', 'directive-crew-detail-portrait-stack');
  visualStack.appendChild(visual);
  if (crewId === 'player-commander') {
    const { portraitActions, fileInput } = createPlayerPortraitControls({ portrait, view, actions });
    visualStack.append(portraitActions, fileInput);
  }

  const copy = createElement('div', 'directive-crew-detail-copy');
  const eyebrow = createElement('div', 'directive-crew-detail-eyebrow');
  eyebrow.append(createDivisionIndicator(division), createRankPips(crew.rank));
  copy.appendChild(eyebrow);
  copy.appendChild(createCardTitle(crew.name || crewId));
  const role = createElement('p', 'directive-crew-detail-role');
  role.textContent = `${crew.rank || 'Officer'} / ${crew.billet || 'Crew assignment'}`;
  copy.appendChild(role);
  copy.appendChild(createCrewPublicBio(publicBioLines(crew)));

  const facts = createElement('div', 'directive-crew-detail-facts');
  facts.append(
    createCrewFact('Species', crew.species, 'fa-solid fa-dna', 'Species shown in the public officer dossier.')
  );
  copy.appendChild(facts);

  const inspector = createElement('section', 'directive-crew-dossier-inspector');
  const inspectorHeader = createElement('header', 'directive-crew-dossier-inspector-header');
  const inspectorKicker = createElement('span', 'directive-lcars-kicker');
  inspectorKicker.textContent = 'Officer Dossier';
  const inspectorTitle = createElement('h4');
  inspectorTitle.textContent = `${crew.name || crewId} Context`;
  inspectorHeader.append(inspectorKicker, inspectorTitle);
  inspector.append(inspectorHeader, createCrewInspector({ view, state, crewId }));

  const content = createElement('div', 'directive-crew-dossier-content');
  content.append(copy, inspector);
  panel.append(visualStack, content);
  return panel;
}

function renderCrewRosterTab(body, view, actions = {}) {
  const state = view?.campaignState;
  if (!state) {
    appendEmpty(body, currentChatEmptyMessage(view));
    return;
  }

  const packageCrew = packageCrewById(view);
  const seniorCrewIds = asArray(state.crew?.seniorCrewIds);
  if (seniorCrewIds.length === 0) {
    appendEmpty(body, 'No senior crew initialized.');
    return;
  }

  const roster = seniorCrewIds.map((crewId) => ({
    crewId,
    crew: playerCrewRecord(state, crewId) || packageCrew.get(crewId) || { id: crewId, name: crewId },
    portrait: crewId === 'player-commander' ? state.player?.portrait || null : null
  }));
  if (!roster.some((entry) => entry.crewId === activeCrewId)) {
    activeCrewId = roster.find((entry) => entry.crewId !== 'player-commander')?.crewId || roster[0].crewId;
  }

  const consoleSurface = createElement('div', 'directive-crew-console directive-lcars-console');
  const casualties = asArray(state.crew?.casualties);
  const reassignments = asArray(state.crew?.reassignments);

  const header = createElement('header', 'directive-crew-console-header');
  const headerCopy = createElement('div');
  const kicker = createElement('span', 'directive-lcars-kicker');
  kicker.textContent = 'Personnel Command';
  const title = createElement('h3', 'directive-crew-console-title');
  title.textContent = 'Senior Staff Roster';
  const summary = createElement('p');
  summary.textContent = 'Review senior staff roles and player-safe mission context.';
  headerCopy.append(kicker, title, summary);
  header.appendChild(headerCopy);
  consoleSurface.appendChild(header);

  if (casualties.length || reassignments.length || !state.crew?.relationshipModel) {
    const readiness = createElement('div', 'directive-crew-readiness-grid');
    if (!state.crew?.relationshipModel) {
      readiness.appendChild(createCrewStatusBlock('Continuity', 'Initializing', 'warning', 'fa-solid fa-link', 'Crew relationship and memory model is still initializing.'));
    }
    if (casualties.length) {
      readiness.appendChild(createCrewStatusBlock('Casualties', casualties.length, 'danger', 'fa-solid fa-kit-medical', 'Crew casualty records visible in campaign state.'));
    }
    if (reassignments.length) {
      readiness.appendChild(createCrewStatusBlock('Reassignments', reassignments.length, 'warning', 'fa-solid fa-right-left', 'Crew reassignment records visible in campaign state.'));
    }
    consoleSurface.appendChild(readiness);
  }

  const commandDeck = createElement('div', 'directive-crew-command-deck');
  const rosterPanel = createElement('section', 'directive-crew-roster-panel directive-lcars-panel');
  rosterPanel.dataset.directiveTour = 'crew.roster';
  const rosterHeader = createElement('div', 'directive-crew-roster-header');
  const rosterTitle = createElement('h3', 'directive-subsection-title');
  rosterTitle.textContent = 'Duty Roster';
  const rosterCount = createElement('span');
  rosterCount.textContent = `${roster.length} assigned`;
  rosterHeader.append(rosterTitle, rosterCount);
  const list = createElement('div', 'directive-crew-roster');
  const detailHost = createElement('div', 'directive-crew-detail-host');

  const renderSelection = (crewId) => {
    activeCrewId = crewId;
    for (const button of list.querySelectorAll('[data-crew-id]')) {
      const selected = button.dataset.crewId === crewId;
      button.classList.toggle('directive-crew-roster-row-active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      button.dataset.directiveTour = selected ? 'crew.roster-row crew.selected-row' : 'crew.roster-row';
    }
    const entry = roster.find((item) => item.crewId === crewId) || roster[0];
    detailHost.replaceChildren(createCrewDetailPanel({
      packageData: activePackageForView(view),
      view,
      actions,
      ...entry
    }));
  };

  for (const entry of roster) {
    list.appendChild(createCrewRosterRow({
      packageData: activePackageForView(view),
      ...entry,
      selected: entry.crewId === activeCrewId,
      onSelect: renderSelection
    }));
  }
  rosterPanel.append(rosterHeader, list);
  commandDeck.append(rosterPanel, detailHost);
  consoleSurface.appendChild(commandDeck);
  renderSelection(activeCrewId);

  body.appendChild(consoleSurface);
}

export function renderCrewPanel(body, view, actions = {}) {
  appendSectionTitle(body, 'Personnel');
  const state = view?.campaignState;
  if (!state) {
    appendEmpty(body, currentChatEmptyMessage(view));
    return;
  }

  const tabHost = createElement('div', 'directive-crew-tab-host');
  const tabBody = createElement('div', 'directive-crew-tab-body');
  const renderActive = () => {
    clearElement(tabBody);
    if (activeCrewTab === 'crew') renderCrewRosterTab(tabBody, view, actions);
    else renderCharacterTab(tabBody, view, actions);
  };
  const tabs = createCrewLocalTabs((tabId, tabList) => {
    activeCrewTab = tabId === 'crew' ? 'crew' : 'character';
    updateCrewLocalTabs(tabList);
    renderActive();
  });
  tabHost.append(tabs, tabBody);
  body.appendChild(tabHost);
  renderActive();
}
