import {
  appendEmpty,
  appendSectionTitle,
  createCard,
  createCardTitle,
  createElement,
  createMetaRow,
  joinList
} from './runtime-ui-kit.js';

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

export function renderCrewPanel(body, view) {
  appendSectionTitle(body, 'Crew');
  const state = view?.campaignState;
  if (!state) {
    appendEmpty(body, 'No crew state loaded.');
    return;
  }

  const packageCrew = packageCrewById(view);
  const relationships = relationshipByCrewId(state);
  const list = createElement('div', 'directive-card-list');
  for (const crewId of state.crew?.seniorCrewIds || []) {
    const crew = playerCrewRecord(state, crewId) || packageCrew.get(crewId) || { id: crewId, name: crewId };
    const relationship = relationships.get(crewId);
    const card = createCard('directive-crew-card');
    card.append(
      createCardTitle(crew.name || crew.id),
      createMetaRow('Rank', crew.rank),
      createMetaRow('Billet', crew.billet),
      createMetaRow('Species', crew.species),
      createMetaRow('Role', crew.packageRole),
      createMetaRow('Continuity', relationship ? 'Tracked behind the scenes' : crewId === 'player-commander' ? 'Player character' : 'Initialized')
    );
    list.appendChild(card);
  }

  if (list.children.length === 0) {
    appendEmpty(body, 'No senior crew initialized.');
    return;
  }
  body.appendChild(list);

  const status = createCard('directive-crew-status-card');
  status.append(
    createCardTitle('Crew Continuity'),
    createMetaRow('Relationship Dimensions', joinList(state.crew?.relationshipModel?.dimensions)),
    createMetaRow('Raw Values', state.crew?.relationshipModel?.rawValuesHidden ? 'Hidden' : 'Visible'),
    createMetaRow('Casualties', joinList(state.crew?.casualties)),
    createMetaRow('Reassignments', joinList(state.crew?.reassignments))
  );
  body.appendChild(status);
}
