import {
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
  createPackageImage,
  createPlayerPortraitImage,
  crewDivision
} from './directive-media.js';

const DEFAULT_CREW_ID = 'mara-whitaker';
const DIVISION_LABELS = {
  command: 'Command',
  science: 'Science / Medical',
  operations: 'Operations'
};
const PRESSURE_VISIBLE_STATUSES = new Set(['active', 'cooling', 'watch']);
const WORK_HIDDEN_STATUSES = new Set(['completed', 'resolved', 'cancelled', 'dismissed']);
const THREAD_VISIBLE_STATUSES = new Set(['engaged', 'active']);
const POSTURE_LABELS = {
  supports: 'Supportive',
  'supports-with-reservations': 'Supportive with reservations',
  undecided: 'Still evaluating',
  concerned: 'Concerned',
  objects: 'Objecting',
  refuses: 'Refusing'
};

let activeCrewId = DEFAULT_CREW_ID;

export function resetCrewPanelState() {
  activeCrewId = DEFAULT_CREW_ID;
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
  return new Map((view.activePackage?.crew?.senior || []).map((crew) => [crew.id, crew]));
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
      summary: compactText(record.playerSummary || record.title, 180)
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

function openWorkForCrew(state, crewId) {
  const byPressureId = pressureMap(state);
  const assignments = asArray(state?.sideMissions?.availableAssignments)
    .filter((assignment) => visibleRecord(assignment))
    .filter((assignment) => !WORK_HIDDEN_STATUSES.has(String(assignment.status || '').toLowerCase()))
    .filter((assignment) => {
      const pressure = byPressureId.get(assignment.pressureId);
      return assignment.pressureId && visibleRecord(pressure) && includesCrewId(pressure, crewId);
    })
    .map((assignment) => {
      const pressure = byPressureId.get(assignment.pressureId);
      const active = state?.sideMissions?.activeAssignmentId === assignment.id;
      return {
        id: assignment.id,
        title: compactText(assignment.title || pressure?.title || 'Open work', 92),
        meta: ['Open Orders', active ? 'Active' : statusLabel(assignment.status)].filter(Boolean).join(' / '),
        summary: compactText(assignment.playerSummary || pressure?.playerSummary || pressure?.title, 180)
      };
    });

  const opportunities = asArray(state?.sideMissions?.scheduledOpportunities)
    .filter((opportunity) => visibleRecord(opportunity))
    .filter((opportunity) => !WORK_HIDDEN_STATUSES.has(String(opportunity.status || '').toLowerCase()))
    .filter((opportunity) => pressureIdsLinkedToCrew(opportunity.sourcePressureIds, byPressureId, crewId))
    .map((opportunity) => ({
      id: opportunity.id,
      title: compactText(opportunity.title || 'Scheduled follow-up', 92),
      meta: ['Follow-up', statusLabel(opportunity.status)].filter(Boolean).join(' / '),
      summary: compactText(opportunity.playerSummary || opportunity.summary || opportunity.reviewQuestion, 180)
    }));

  return limitItems([...assignments, ...opportunities], 3);
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
  const summary = compactText(
    playerFacingText(assisted?.summary)
      || playerFacingText(entry.summary)
      || playerFacingText(entry.summaryInputs?.[0])
      || playerFacingText(asArray(entry.visibleConsequences)[0])
      || title,
    180
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
      summary: compactText(memory.interpretation || memory.event, 180)
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
  return limitItems(asArray(state?.threadLedger?.records)
    .filter((record) => visibleRecord(record))
    .filter((record) => THREAD_VISIBLE_STATUSES.has(String(record.status || '').toLowerCase()))
    .filter((record) => includesCrewId(record, crewId))
    .map((record) => ({
      id: record.id,
      title: compactText(record.title || record.playerSummary || 'Ongoing concern', 92),
      meta: ['Open Thread', statusLabel(record.status)].filter(Boolean).join(' / '),
      summary: compactText(record.playerSummary || record.observableSeed || record.title, 180)
    })), 3);
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

function createCrewStatusBlock(label, value, tone = 'neutral', icon = '') {
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
  return block;
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
  row.setAttribute('aria-pressed', selected ? 'true' : 'false');
  row.setAttribute('aria-label', `View ${crew.name || crewId}, ${crew.rank || 'Officer'}, ${divisionLabel(division)} division`);

  const portraitFrame = crewId === 'player-commander'
    ? createPlayerPortraitImage(portrait, {
        wrapperClass: 'directive-crew-roster-portrait',
        label: crew.name,
        icon: 'fa-solid fa-user-astronaut'
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
  row.addEventListener('click', () => onSelect?.(crewId));
  return row;
}

function createCrewFact(label, value, icon = '') {
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
  return fact;
}

function setBioToggleContent(button, expanded) {
  clearElement(button);
  const label = createElement('span');
  label.textContent = expanded ? 'Less' : 'More...';
  button.append(createIcon(expanded ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'), label);
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
  setBioToggleContent(toggle, false);
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') !== 'true';
    more.hidden = !expanded;
    bio.classList.toggle('directive-crew-public-bio-expanded', expanded);
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    toggle.setAttribute('aria-label', expanded ? 'Collapse public crew profile' : 'Show full public crew profile');
    setBioToggleContent(toggle, expanded);
  });

  bio.append(more, toggle);
  return bio;
}

function createInspectorItem(item) {
  const row = createElement('article', 'directive-crew-inspector-item');
  if (item.meta) {
    const meta = createElement('span', 'directive-crew-inspector-meta');
    meta.textContent = item.meta;
    row.appendChild(meta);
  }
  const title = createElement('strong', 'directive-crew-inspector-item-title');
  title.textContent = item.title || 'Tracked item';
  row.appendChild(title);
  if (item.summary) {
    const summary = createElement('p', 'directive-crew-inspector-item-summary');
    summary.textContent = item.summary;
    row.appendChild(summary);
  }
  return row;
}

function createInspectorSection({ title, icon, items, emptyText }) {
  const section = createElement('section', 'directive-crew-inspector-section');
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

function createCrewInspector({ state, crewId }) {
  const relationship = relationshipForCrew(state, crewId);
  const grid = createElement('div', 'directive-crew-inspector-grid');
  const posture = postureItem(relationship, crewId);
  grid.append(
    createInspectorSection({
      title: 'Command Posture',
      icon: 'fa-solid fa-compass',
      items: posture ? [posture] : [],
      emptyText: 'No qualitative command read has been surfaced yet.'
    }),
    createInspectorSection({
      title: 'Current Pressure',
      icon: 'fa-solid fa-gauge-high',
      items: pressureRecordsForCrew(state, crewId),
      emptyText: 'No visible pressure is currently linked to this officer.'
    }),
    createInspectorSection({
      title: 'Open Work',
      icon: 'fa-solid fa-clipboard-list',
      items: openWorkForCrew(state, crewId),
      emptyText: 'No active Open Orders or follow-up work is linked to this officer.'
    }),
    createInspectorSection({
      title: 'Recent Command Memory',
      icon: 'fa-solid fa-book-open',
      items: recentCommandMemoryForCrew(state, crewId),
      emptyText: 'No recent command-log memory is visible for this officer yet.'
    }),
    createInspectorSection({
      title: 'Open Threads',
      icon: 'fa-solid fa-comments',
      items: openThreadsForCrew(state, crewId),
      emptyText: 'No visible ongoing concern is linked to this officer.'
    })
  );
  return grid;
}

function createCrewDetailPanel({ packageData, crewId, crew, portrait, view, actions = {} }) {
  const division = crewDivision(crew);
  const state = view?.campaignState || {};
  const panel = createCard(`directive-crew-detail-panel directive-lcars-panel directive-crew-division-${division}`);
  panel.dataset.crewDetailId = crewId;

  const visual = crewId === 'player-commander'
    ? createPlayerPortraitImage(portrait, {
        wrapperClass: 'directive-crew-detail-portrait',
        label: crew.name,
        icon: 'fa-solid fa-user-astronaut'
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
    const portraitActions = createElement('div', 'directive-crew-player-portrait-actions');
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
    createCrewFact('Species', crew.species, 'fa-solid fa-dna')
  );
  copy.appendChild(facts);
  copy.appendChild(createCrewInspector({ state, crewId }));

  panel.append(visualStack, copy);
  return panel;
}

export function renderCrewPanel(body, view, actions = {}) {
  appendSectionTitle(body, 'Crew');
  const state = view?.campaignState;
  if (!state) {
    appendEmpty(body, 'No crew state loaded.');
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
      readiness.appendChild(createCrewStatusBlock('Continuity', 'Initializing', 'warning', 'fa-solid fa-link'));
    }
    if (casualties.length) {
      readiness.appendChild(createCrewStatusBlock('Casualties', casualties.length, 'danger', 'fa-solid fa-kit-medical'));
    }
    if (reassignments.length) {
      readiness.appendChild(createCrewStatusBlock('Reassignments', reassignments.length, 'warning', 'fa-solid fa-right-left'));
    }
    consoleSurface.appendChild(readiness);
  }

  const commandDeck = createElement('div', 'directive-crew-command-deck');
  const rosterPanel = createElement('section', 'directive-crew-roster-panel directive-lcars-panel');
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
    }
    const entry = roster.find((item) => item.crewId === crewId) || roster[0];
    detailHost.replaceChildren(createCrewDetailPanel({
      packageData: view.activePackage,
      view,
      actions,
      ...entry
    }));
  };

  for (const entry of roster) {
    list.appendChild(createCrewRosterRow({
      packageData: view.activePackage,
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
