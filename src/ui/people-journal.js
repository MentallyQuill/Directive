import { createElement } from './runtime-ui-kit.js';
import { createPlayerPortraitImage } from './directive-media.js';

export function createPeopleRoster(records, selectedId, onSelect) {
  const roster = createElement('aside', 'people-roster');
  roster.dataset.directiveScrollOwner = 'true';
  const head = createElement('header', 'people-roster-head');
  const kicker = createElement('span');
  kicker.textContent = 'Personnel records';
  const title = createElement('h2');
  title.textContent = 'People';
  head.append(kicker, title);
  roster.appendChild(head);
  const list = createElement('div', 'people-roster-list');
  records.forEach((record) => {
    const row = createElement('button', `people-row${record.id === selectedId ? ' active' : ''}`);
    row.type = 'button';
    row.dataset.personId = record.id;
    row.setAttribute('aria-pressed', record.id === selectedId ? 'true' : 'false');
    const state = createElement('span', 'people-row-state');
    state.textContent = record.isPlayer ? 'You' : 'Crew';
    const name = createElement('strong');
    name.textContent = record.name;
    const billet = createElement('span', 'people-row-billet');
    billet.textContent = record.billet || record.role || '';
    row.append(state, name, billet);
    row.addEventListener('click', () => onSelect(record.id));
    list.appendChild(row);
  });
  roster.appendChild(list);
  return roster;
}

function appendDefinition(detail, label, value) {
  if (!value) return;
  const block = createElement('section', 'people-detail-block');
  const heading = createElement('h3');
  heading.textContent = label;
  const copy = createElement('p');
  copy.textContent = value;
  block.append(heading, copy);
  detail.appendChild(block);
}

export function createPeopleDetail(record) {
  const detail = createElement('section', 'people-detail');
  detail.dataset.directiveScrollOwner = 'true';
  if (!record) return detail;
  detail.dataset.personId = record.id;
  const hero = createElement('header', 'people-detail-hero');
  if (record.isPlayer) {
    hero.appendChild(createPlayerPortraitImage(record.portrait, {
      wrapperClass: 'people-detail-portrait',
      label: record.name,
      loading: 'eager'
    }));
  }
  const identity = createElement('div', 'people-detail-identity');
  const kicker = createElement('span');
  kicker.textContent = record.isPlayer ? 'Your commander' : 'Personnel record';
  const name = createElement('h2');
  name.textContent = record.name;
  const billet = createElement('strong');
  billet.textContent = [record.rank, record.billet || record.role].filter(Boolean).join(' / ');
  identity.append(kicker, name, billet);
  if (record.species?.label) {
    const species = createElement('span', 'people-detail-species');
    species.textContent = record.species.label;
    identity.appendChild(species);
  }
  hero.appendChild(identity);
  detail.appendChild(hero);

  appendDefinition(detail, 'Profile', record.profileSummary || record.appearance || record.dossier?.identitySummary || record.dossier?.briefBiography);
  appendDefinition(detail, 'Current posture', record.relationshipPosture);
  if (record.moments?.length) {
    const section = createElement('section', 'people-detail-block');
    const heading = createElement('h3');
    heading.textContent = 'Defining moments';
    const list = createElement('ul');
    record.moments.forEach((moment) => {
      const item = createElement('li');
      item.textContent = moment.summary;
      list.appendChild(item);
    });
    section.append(heading, list);
    detail.appendChild(section);
  }
  return detail;
}
