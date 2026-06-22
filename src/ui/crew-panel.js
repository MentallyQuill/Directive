import {
  appendEmpty,
  appendSectionTitle,
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

let activeCrewId = DEFAULT_CREW_ID;

export function resetCrewPanelState() {
  activeCrewId = DEFAULT_CREW_ID;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function packageCrewById(view) {
  return new Map((view.activePackage?.crew?.senior || []).map((crew) => [crew.id, crew]));
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

function createCrewDetailPanel({ packageData, crewId, crew, portrait, view, actions = {} }) {
  const division = crewDivision(crew);
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

  const facts = createElement('div', 'directive-crew-detail-facts');
  facts.append(
    createCrewFact('Species', crew.species, 'fa-solid fa-dna')
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
