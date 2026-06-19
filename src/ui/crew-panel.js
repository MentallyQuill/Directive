import {
  appendEmpty,
  appendSectionTitle,
  createCard,
  createCardTitle,
  createElement,
  createMetaRow,
  joinList
} from './runtime-ui-kit.js';

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
    rank: state.player?.rank,
    billet: state.player?.billet,
    species: state.player?.species?.label || state.player?.species
  };
}

function crewStatusTone(value) {
  const label = String(value || '').toLowerCase();
  if (label.includes('none') || label.includes('no ')) return 'warning';
  if (label.includes('tracked') || label.includes('clear') || label.includes('0')) return 'success';
  return 'neutral';
}

function createCrewStatusBlock(label, value, tone = crewStatusTone(value)) {
  const block = createElement('div', `directive-lcars-status-block directive-crew-status-block directive-status-${tone}`);
  const key = createElement('span', 'directive-lcars-status-label');
  key.textContent = label;
  const content = createElement('strong', 'directive-lcars-status-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  block.append(key, content);
  return block;
}

function continuityLabel(crewId, relationship) {
  if (crewId === 'player-commander') return 'Player character';
  return relationship ? 'Tracked' : 'Initialized';
}

function createCrewChip(label, value, tone = '') {
  const chip = createElement('span', `directive-crew-chip${tone ? ` directive-crew-chip-${tone}` : ''}`);
  const key = createElement('span', 'directive-crew-chip-label');
  key.textContent = label;
  const content = createElement('strong', 'directive-crew-chip-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  chip.append(key, content);
  return chip;
}

function createCrewRosterRow({ crewId, crew, relationship }) {
  const continuity = continuityLabel(crewId, relationship);
  const role = crew.packageRole || (crewId === 'player-commander' ? 'Player character and current XO.' : '');
  const isCommand = /commanding officer|executive officer|captain|commander/i.test(`${crew.billet || ''} ${crew.rank || ''}`);
  const row = createCard(`directive-crew-roster-row directive-lcars-panel${isCommand ? ' directive-crew-command-row' : ''}`);

  const header = createElement('div', 'directive-crew-row-header');
  const identity = createElement('div', 'directive-crew-row-identity');
  identity.appendChild(createCardTitle(crew.name || crew.id));
  const billet = createElement('p', 'directive-crew-billet');
  billet.textContent = crew.billet || crew.packageRole || 'Crew Assignment';
  identity.appendChild(billet);

  const continuityBadge = createElement('span', 'directive-crew-continuity-badge');
  continuityBadge.textContent = continuity;
  header.append(identity, continuityBadge);

  const chips = createElement('div', 'directive-crew-chip-row');
  chips.append(
    createCrewChip('Rank', crew.rank),
    createCrewChip('Species', crew.species),
    createCrewChip('Continuity', continuity, continuity === 'Tracked' ? 'success' : '')
  );

  row.append(header, chips);
  if (role) {
    const roleText = createElement('p', 'directive-crew-role');
    roleText.textContent = role;
    row.appendChild(roleText);
  }
  return row;
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

  const consoleSurface = createElement('div', 'directive-crew-console directive-lcars-console');
  const casualties = asArray(state.crew?.casualties);
  const reassignments = asArray(state.crew?.reassignments);
  const readiness = createElement('div', 'directive-crew-readiness-grid');
  readiness.append(
    createCrewStatusBlock('Senior Crew', seniorCrewIds.length),
    createCrewStatusBlock('Continuity', state.crew?.relationshipModel ? 'Tracked' : 'Not initialized', state.crew?.relationshipModel ? 'success' : 'warning'),
    createCrewStatusBlock('Casualties', casualties.length, casualties.length > 0 ? 'danger' : 'success'),
    createCrewStatusBlock('Reassignments', reassignments.length, reassignments.length > 0 ? 'warning' : 'success')
  );
  consoleSurface.appendChild(readiness);

  const list = createElement('div', 'directive-crew-roster');
  for (const crewId of seniorCrewIds) {
    const crew = playerCrewRecord(state, crewId) || packageCrew.get(crewId) || { id: crewId, name: crewId };
    const relationship = relationships.get(crewId);
    list.appendChild(createCrewRosterRow({ crewId, crew, relationship }));
  }
  consoleSurface.appendChild(list);

  const continuityStatus = state.crew?.relationshipModel
    ? 'Senior crew continuity is tracked behind the scenes.'
    : 'No continuity model initialized.';
  const status = createCard('directive-crew-status-card directive-lcars-panel');
  status.append(
    createCardTitle('Crew Continuity'),
    createMetaRow('Continuity Tracking', continuityStatus),
    createMetaRow('Casualties', joinList(casualties)),
    createMetaRow('Reassignments', joinList(reassignments))
  );
  consoleSurface.appendChild(status);
  body.appendChild(consoleSurface);
}
