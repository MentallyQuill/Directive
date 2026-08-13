import { createElement } from './runtime-ui-kit.js';
import { createPackageHeroVisual } from './package-hero-scene.js';
import { bindResponsiveHero } from './responsive-hero.js';

function statusText(value) {
  return String(value || 'unknown').replace(/[-_]+/g, ' ');
}

export function createShipHero(ship, activePackage) {
  const hero = createPackageHeroVisual(activePackage || {}, {
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
  return bindResponsiveHero(hero, { label: 'Ship', secondary: [summary] });
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

function appendStateLadder(card, system) {
  const ladder = createElement('div', 'ship-state-ladder');
  const currentId = system.currentState?.id;
  (system.stateLadder || []).forEach((state) => {
    const step = createElement('span', state.id === currentId ? 'is-current' : '');
    step.textContent = state.label;
    ladder.appendChild(step);
  });
  card.appendChild(ladder);
}

function appendSystemDetail(card, label, text) {
  if (!text) return;
  const block = createElement('div', 'ship-system-detail');
  const heading = createElement('strong');
  heading.textContent = label;
  const copy = createElement('p');
  copy.textContent = text;
  block.append(heading, copy);
  card.appendChild(block);
}

function appendWorkOrders(card, workOrders = []) {
  if (!workOrders.length) return;
  const section = createElement('div', 'ship-work-orders');
  const heading = createElement('strong');
  heading.textContent = 'Ship work';
  const list = createElement('div', 'ship-work-order-list');
  workOrders.forEach((order) => {
    const item = createElement('div', `ship-work-order is-${order.status}`);
    const status = createElement('span');
    status.textContent = order.status === 'satisfied' ? 'Complete' : order.status === 'known' ? 'Available' : 'Undiscovered';
    const title = createElement('b');
    title.textContent = order.label || 'Unknown work order';
    item.append(status, title);
    if (order.summary) {
      const summary = createElement('p');
      summary.textContent = order.summary;
      item.appendChild(summary);
    }
    list.appendChild(item);
  });
  section.append(heading, list);
  card.appendChild(section);
}

function appendSystems(board, systems = []) {
  if (!systems.length) return;
  const section = createElement('section', 'ship-systems-section');
  const heading = createElement('h3');
  heading.textContent = 'Ship systems';
  const grid = createElement('div', 'ship-system-grid');
  systems.forEach((system) => {
    const card = createElement('article', 'ship-system-card');
    const header = createElement('header');
    const identity = createElement('div');
    const title = createElement('h4');
    title.textContent = system.label;
    const summary = createElement('p');
    summary.textContent = system.summary || '';
    identity.append(title, summary);
    const state = createElement('span', 'ship-system-state');
    state.textContent = system.currentState?.label || 'Unknown';
    header.append(identity, state);
    card.appendChild(header);
    appendStateLadder(card, system);
    appendSystemDetail(card, 'Why this state', system.currentState?.why);
    appendSystemDetail(card, 'Gameplay effect', system.currentState?.mechanicalEffect);
    appendWorkOrders(card, system.workOrders);
    grid.appendChild(card);
  });
  section.append(heading, grid);
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
  appendSystems(board, ship.systems || []);
  appendRecordList(board, 'Active constraints', ship.constraints || []);
  appendRecordList(board, 'Material limitations', ship.limitations || []);
  appendRecordList(board, 'Capabilities', ship.capabilities || []);
  return board;
}
