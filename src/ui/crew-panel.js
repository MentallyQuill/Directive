import {
  appendEmpty,
  appendSectionTitle,
  createCard,
  createCardTitle,
  createElement,
  createIcon
} from './runtime-ui-kit.js';
import {
  createDivisionMark,
  createPackageImage,
  crewDivision
} from './directive-media.js';

let activeCrewId = 'mara-whitaker';

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function packageCrewById(view) {
  return new Map((view.activePackage?.crew?.senior || []).map((crew) => [crew.id, crew]));
}

function relationshipByCrewId(state) {
  return new Map((state.relationships?.seniorCrew || []).map((entry) => [entry.crewId, entry]));
}

function playerCrewRecord(state, crewId) {
  if (crewId !== 'player-commander') return null;
  return {
    id: 'player-commander',
    name: state.player?.name || 'Player Commander',
    rank: state.player?.rank || 'Commander',
    billet: state.player?.billet || 'Executive Officer',
    species: state.player?.species?.label || state.player?.species || 'Player-defined',
    packageRole: state.player?.role || 'Principal mission commander and coordinator of shipboard operations'
  };
}

function continuityLabel(crewId, relationship) {
  if (crewId === 'player-commander') return 'Player character';
  return relationship ? 'Tracked' : 'Initialized';
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

function createCrewRosterRow({ packageData, crewId, crew, relationship, selected, onSelect }) {
  const continuity = continuityLabel(crewId, relationship);
  const division = crewDivision(crew);
  const row = createElement('button', `directive-crew-roster-row directive-lcars-panel directive-crew-division-${division}${selected ? ' directive-crew-roster-row-active' : ''}`);
  row.type = 'button';
  row.dataset.crewId = crewId;
  row.setAttribute('aria-pressed', selected ? 'true' : 'false');
  row.setAttribute('aria-label', `View ${crew.name || crewId}`);

  const portrait = createPackageImage(packageData, {
    kind: 'crew.portrait.formal',
    subjectId: crewId,
    variant: 'thumb'
  }, {
    wrapperClass: 'directive-crew-roster-portrait',
    label: crew.name,
    icon: crewId === 'player-commander' ? 'fa-solid fa-user-astronaut' : 'fa-solid fa-user'
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
  const statusText = createElement('span');
  statusText.textContent = continuity;
  status.append(createDivisionMark(division), statusText);
  const chevron = createIcon('fa-solid fa-chevron-right directive-crew-row-chevron');
  row.append(portrait, identity, status, chevron);
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

function createCrewDetailPanel({ packageData, crewId, crew, relationship }) {
  const division = crewDivision(crew);
  const continuity = continuityLabel(crewId, relationship);
  const panel = createCard(`directive-crew-detail-panel directive-lcars-panel directive-crew-division-${division}`);
  panel.dataset.crewDetailId = crewId;

  const visual = createPackageImage(packageData, {
    kind: 'crew.portrait.formal',
    subjectId: crewId,
    variant: 'detail'
  }, {
    wrapperClass: 'directive-crew-detail-portrait',
    label: crew.name,
    icon: crewId === 'player-commander' ? 'fa-solid fa-user-astronaut' : 'fa-solid fa-user'
  });

  const copy = createElement('div', 'directive-crew-detail-copy');
  const eyebrow = createElement('div', 'directive-crew-detail-eyebrow');
  const eyebrowText = createElement('span');
  eyebrowText.textContent = `${division} division`;
  eyebrow.append(createDivisionMark(division), eyebrowText);
  copy.appendChild(eyebrow);
  copy.appendChild(createCardTitle(crew.name || crewId));
  const role = createElement('p', 'directive-crew-detail-role');
  role.textContent = `${crew.rank || 'Officer'} / ${crew.billet || 'Crew assignment'}`;
  copy.appendChild(role);

  const facts = createElement('div', 'directive-crew-detail-facts');
  facts.append(
    createCrewFact('Species', crew.species, 'fa-solid fa-dna'),
    createCrewFact('Continuity', continuity, 'fa-solid fa-link'),
    createCrewFact('Duty Status', 'Active', 'fa-solid fa-circle-check'),
    createCrewFact('Record', crewId === 'player-commander' ? 'Player-owned' : 'Package-owned', 'fa-solid fa-id-card')
  );
  copy.appendChild(facts);

  if (crew.packageRole) {
    const missionRole = createElement('section', 'directive-crew-mission-role');
    const title = createElement('h4');
    title.textContent = 'Command Relevance';
    const summary = createElement('p');
    summary.textContent = crew.packageRole;
    missionRole.append(title, summary);
    copy.appendChild(missionRole);
  }

  const continuityHeading = createElement('h4', 'directive-crew-continuity-title');
  continuityHeading.textContent = 'Crew Continuity';
  copy.appendChild(continuityHeading);
  const privacy = createElement('p', 'directive-crew-continuity-note');
  privacy.appendChild(createIcon('fa-solid fa-shield-halved'));
  const privacyText = createElement('span');
  privacyText.textContent = relationship
    ? 'Relationship continuity is active. Underlying metrics remain hidden from the player-facing UI.'
    : 'The officer record is initialized. Relationship continuity begins through play.';
  privacy.appendChild(privacyText);
  copy.appendChild(privacy);

  panel.append(visual, copy);
  return panel;
}

export function renderCrewPanel(body, view) {
  appendSectionTitle(body, 'Crew');
  const state = view?.campaignState;
  if (!state) {
    appendEmpty(body, 'No crew state loaded.');
    return;
  }

  const packageCrew = packageCrewById(view);
  const relationships = relationshipByCrewId(state);
  const seniorCrewIds = asArray(state.crew?.seniorCrewIds);
  if (seniorCrewIds.length === 0) {
    appendEmpty(body, 'No senior crew initialized.');
    return;
  }

  const roster = seniorCrewIds.map((crewId) => ({
    crewId,
    crew: playerCrewRecord(state, crewId) || packageCrew.get(crewId) || { id: crewId, name: crewId },
    relationship: relationships.get(crewId)
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
  summary.textContent = 'Review duty assignments, package records, and player-safe continuity status.';
  headerCopy.append(kicker, title, summary);
  const ready = createElement('span', 'directive-crew-ready-badge');
  const readyText = createElement('span');
  readyText.textContent = 'Roster ready';
  ready.append(createIcon('fa-solid fa-circle-check'), readyText);
  header.append(headerCopy, ready);
  consoleSurface.appendChild(header);

  const readiness = createElement('div', 'directive-crew-readiness-grid');
  readiness.append(
    createCrewStatusBlock('Senior Crew', seniorCrewIds.length, 'success', 'fa-solid fa-people-group'),
    createCrewStatusBlock('Continuity', state.crew?.relationshipModel ? 'Tracked' : 'Initializing', state.crew?.relationshipModel ? 'success' : 'warning', 'fa-solid fa-link'),
    createCrewStatusBlock('Casualties', casualties.length, casualties.length > 0 ? 'danger' : 'success', 'fa-solid fa-kit-medical'),
    createCrewStatusBlock('Reassignments', reassignments.length, reassignments.length > 0 ? 'warning' : 'success', 'fa-solid fa-right-left')
  );
  consoleSurface.appendChild(readiness);

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
