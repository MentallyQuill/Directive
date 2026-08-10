import { createElement } from './runtime-ui-kit.js';
import { createPackageImage } from './directive-media.js';

function statusText(value) {
  return String(value || 'unknown').replace(/[-_]+/g, ' ');
}

export function createShipHero(ship, activePackage) {
  const hero = createPackageImage(activePackage || {}, {
    kind: 'ship.hero',
    subjectId: ship.id,
    variant: 'hero'
  }, {
    wrapperClass: 'ship-hero',
    label: ship.name,
    loading: 'eager'
  });
  const identity = createElement('div', 'ship-hero-identity');
  const kicker = createElement('span');
  kicker.textContent = [ship.className, ship.registry].filter(Boolean).join(' / ');
  const title = createElement('h2');
  title.textContent = ship.name;
  const summary = createElement('p');
  summary.textContent = ship.summary || '';
  identity.append(kicker, title, summary);
  hero.appendChild(identity);
  return hero;
}

function appendRecordList(board, label, records) {
  if (!records.length) return;
  const section = createElement('section', 'ship-board-section');
  const heading = createElement('h3');
  heading.textContent = label;
  const list = createElement('div', 'ship-record-list');
  records.forEach((record) => {
    const item = createElement('article', 'ship-record');
    const title = createElement('strong');
    title.textContent = record.label || record.title || record.summary;
    item.appendChild(title);
    if ((record.label || record.title) && record.summary) {
      const summary = createElement('p');
      summary.textContent = record.summary;
      item.appendChild(summary);
    }
    list.appendChild(item);
  });
  section.append(heading, list);
  board.appendChild(section);
}

export function createShipBoard(ship) {
  const board = createElement('section', 'ship-board');
  board.dataset.directiveScrollOwner = 'true';
  const status = createElement('section', 'ship-operational-status');
  const kicker = createElement('span');
  kicker.textContent = 'Operational status';
  const title = createElement('h3');
  title.textContent = statusText(ship.operationalStatus.status);
  const summary = createElement('p');
  summary.textContent = ship.operationalStatus.summary || '';
  status.append(kicker, title, summary);
  board.appendChild(status);
  appendRecordList(board, 'Material limitations', ship.limitations || []);
  appendRecordList(board, 'Capabilities', ship.capabilities || []);
  return board;
}
