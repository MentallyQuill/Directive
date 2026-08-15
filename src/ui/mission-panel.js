import { appendEmpty, createElement, createIcon } from './runtime-ui-kit.js';
import { appendCurrentChatEmptyState } from './current-chat-empty-state.js';
import { requireV1PlayerProjection } from './v1-player-facing-panel-model.mjs';
import { buildCertifiedMissionView } from './view-models/certified-mission-view.mjs';
import { bindSingleOpenDisclosure } from './mobile-record-disclosure.js';

function objectiveStatus(objective) {
  if (objective.status === 'terminal') return objective.disposition || 'complete';
  return objective.status || 'available';
}

function createObjective(objective) {
  const resolved = objective.status === 'terminal';
  const row = createElement('article', `mission-objective-row${resolved ? ' is-resolved' : ''}`);
  row.dataset.objectiveId = objective.id;
  const marker = createElement('span', 'mission-objective-marker');
  marker.appendChild(createIcon(resolved ? 'fa-solid fa-check' : 'fa-regular fa-square'));
  const copy = createElement('div', 'mission-objective-copy');
  const title = createElement('strong');
  title.textContent = objective.title;
  const summary = createElement('p');
  summary.textContent = objective.terminalText || objective.summary;
  copy.append(title, summary);
  const status = createElement('span', 'mission-objective-status');
  status.textContent = objectiveStatus(objective);
  row.append(marker, copy, status);
  return row;
}

function appendObjectiveGroup(container, label, objectives, note = '') {
  if (!objectives.length) return;
  const section = createElement('section', 'mission-detail-section');
  const heading = createElement('header', 'mission-section-heading');
  const title = createElement('h3');
  title.textContent = label;
  heading.appendChild(title);
  if (note) {
    const aside = createElement('span');
    aside.textContent = note;
    heading.appendChild(aside);
  }
  const list = createElement('div', 'mission-objective-list');
  objectives.forEach((objective) => list.appendChild(createObjective(objective)));
  section.append(heading, list);
  container.appendChild(section);
}

function appendSimpleList(container, label, entries, textFor) {
  if (!entries.length) return;
  const section = createElement('section', 'mission-detail-section');
  const heading = createElement('h3');
  heading.textContent = label;
  const list = createElement('ul', 'mission-information-list');
  entries.forEach((entry) => {
    const item = createElement('li');
    item.textContent = textFor(entry);
    list.appendChild(item);
  });
  section.append(heading, list);
  container.appendChild(section);
}

function appendClocks(container, clocks) {
  if (!clocks.length) return;
  const section = createElement('section', 'mission-detail-section mission-clock-section');
  const heading = createElement('h3');
  heading.textContent = 'Time-sensitive';
  const grid = createElement('div', 'mission-clock-grid');
  clocks.forEach((clock) => {
    const card = createElement('article', 'mission-clock');
    const title = createElement('strong');
    title.textContent = clock.label;
    const value = createElement('span');
    value.textContent = [clock.value, clock.unit].filter((item) => item !== undefined && item !== null).join(' ');
    const deadline = createElement('p');
    deadline.textContent = clock.deadline || clock.summary || '';
    card.append(title, value, deadline);
    grid.appendChild(card);
  });
  section.append(heading, grid);
  container.appendChild(section);
}

function appendTerminal(container, terminal) {
  if (!terminal) return;
  const card = createElement('section', 'mission-terminal');
  const kicker = createElement('span');
  kicker.textContent = 'Mission complete';
  const title = createElement('h3');
  title.textContent = terminal.title || 'Outcome';
  const summary = createElement('p');
  summary.textContent = terminal.summary || '';
  card.append(kicker, title, summary);
  container.appendChild(card);
}

function appendMissionDetail(detail, mission, { compactIdentity = false } = {}) {
  const hero = createElement('header', 'mission-hero');
  if (compactIdentity) hero.classList.add('mission-hero-compact-identity');
  if (!compactIdentity) {
    const state = createElement('span', 'mission-status');
    state.textContent = mission.status === 'terminal' ? 'Completed mission' : 'Current mission';
    const title = createElement('h2');
    title.textContent = mission.title;
    hero.append(state, title);
  }
  const summary = createElement('p');
  summary.textContent = mission.summary;
  hero.appendChild(summary);
  detail.appendChild(hero);

  appendTerminal(detail, mission.terminal);
  appendObjectiveGroup(detail, 'Primary objectives', mission.requiredObjectives);
  appendObjectiveGroup(detail, 'Optional objectives', mission.optionalObjectives, 'Shapes the outcome; not required to finish');
  appendClocks(detail, mission.clocks);
  appendSimpleList(detail, 'Known information', mission.knownFacts, (fact) => fact.summary);
  appendSimpleList(detail, 'Available support', mission.capabilities, (capability) => (
    capability.summary ? `${capability.label || 'Support'}: ${capability.summary}` : capability.label
  ));
}

function mobileMissionDetailId(missionId) {
  return `directive-mission-mobile-${String(missionId).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`;
}

export function renderMissionPanel(body, view) {
  const projection = requireV1PlayerProjection(view);
  if (!projection) {
    appendCurrentChatEmptyState(body, view);
    return;
  }
  const model = buildCertifiedMissionView(projection);
  const mission = model.missions.find((record) => record.id === model.selectedMissionId) || model.missions[0];
  if (!mission) {
    appendEmpty(body, 'No current V1 mission is available.');
    return;
  }

  const surface = createElement('div', 'directive-expanded-mission mission-layout mission-journal');
  surface.dataset.directiveTour = 'mission.objectives';

  const collection = createElement('aside', 'mission-collection mission-index-panel mission-desktop-collection');
  collection.dataset.directiveScrollOwner = 'true';
  const collectionHead = createElement('header', 'mission-index-head');
  const kicker = createElement('span');
  kicker.textContent = 'Active record';
  const collectionTitle = createElement('h2');
  collectionTitle.textContent = 'Mission';
  collectionHead.append(kicker, collectionTitle);
  const row = createElement('article', 'mission-row active');
  row.dataset.missionId = mission.id;
  const rowState = createElement('span', 'mission-row-state');
  rowState.textContent = mission.status;
  const rowTitle = createElement('strong');
  rowTitle.textContent = mission.title;
  const rowSummary = createElement('p');
  rowSummary.textContent = mission.summary;
  row.append(rowState, rowTitle, rowSummary);
  collection.append(collectionHead, row);

  const detail = createElement('section', 'mission-detail mission-desktop-detail');
  detail.dataset.directiveScrollOwner = 'true';
  appendMissionDetail(detail, mission);

  const mobile = createElement('section', 'mission-mobile-accordion');
  mobile.dataset.directiveScrollOwner = 'true';
  const mobileRecords = model.missions.map((record) => {
    const wrapper = createElement('article', 'mission-mobile-record');
    wrapper.dataset.mobileRecordContainerKey = record.id;
    const trigger = createElement('button', 'mission-row mission-mobile-trigger');
    trigger.type = 'button';
    trigger.dataset.mobileRecordKey = record.id;
    const triggerState = createElement('span', 'mission-row-state');
    triggerState.textContent = record.status;
    const triggerTitle = createElement('strong');
    triggerTitle.textContent = record.title;
    const triggerSummary = createElement('p');
    triggerSummary.textContent = record.summary;
    trigger.append(triggerState, triggerTitle, triggerSummary);
    const recordDetail = createElement('div', 'mission-mobile-detail');
    recordDetail.id = mobileMissionDetailId(record.id);
    appendMissionDetail(recordDetail, record, { compactIdentity: true });
    wrapper.append(trigger, recordDetail);
    mobile.appendChild(wrapper);
    return { key: record.id, trigger, panel: recordDetail };
  });
  bindSingleOpenDisclosure({ records: mobileRecords, initialOpenKey: model.selectedMissionId });

  surface.append(collection, detail, mobile);
  body.appendChild(surface);
}
