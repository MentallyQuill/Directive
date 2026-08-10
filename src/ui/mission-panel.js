import { appendEmpty, createElement, createIcon } from './runtime-ui-kit.js';
import { currentChatEmptyMessage } from './current-chat-scope-copy.js';
import {
  createV1MissionPanelModel,
  requireV1PlayerProjection
} from './v1-player-facing-panel-model.mjs';

function statusLabel(objective = {}) {
  if (objective.status === 'terminal') return objective.disposition || 'complete';
  if (objective.status === 'active') return 'active';
  return objective.status || 'available';
}

function createObjective(objective) {
  const complete = objective.status === 'terminal';
  const row = createElement('article', `directive-v1-objective${complete ? ' is-terminal' : ''}`);
  row.dataset.objectiveId = objective.id;

  const marker = createElement('span', 'directive-v1-objective-marker');
  marker.appendChild(createIcon(complete ? 'fa-solid fa-check' : 'fa-regular fa-square'));

  const copy = createElement('div', 'directive-v1-objective-copy');
  const title = createElement('strong');
  title.textContent = objective.title;
  const summary = createElement('p');
  summary.textContent = objective.terminalText || objective.summary;
  copy.append(title, summary);

  const status = createElement('span', 'directive-v1-objective-status');
  status.textContent = statusLabel(objective);
  row.append(marker, copy, status);
  return row;
}

function appendObjectiveGroup(container, label, objectives, { optional = false } = {}) {
  if (!objectives.length) return;
  const section = createElement('section', 'directive-v1-mission-section');
  const heading = createElement('div', 'directive-v1-section-heading');
  const title = createElement('h3');
  title.textContent = label;
  heading.appendChild(title);
  if (optional) {
    const note = createElement('span', 'directive-v1-section-note');
    note.textContent = 'Shapes the outcome; not required to finish';
    heading.appendChild(note);
  }
  const grid = createElement('div', 'directive-v1-objective-grid');
  objectives.forEach((objective) => grid.appendChild(createObjective(objective)));
  section.append(heading, grid);
  container.appendChild(section);
}

function appendClocks(container, clocks) {
  if (!clocks.length) return;
  const section = createElement('section', 'directive-v1-mission-section directive-v1-clocks');
  const heading = createElement('div', 'directive-v1-section-heading');
  const title = createElement('h3');
  title.textContent = 'Time-sensitive';
  heading.appendChild(title);
  const grid = createElement('div', 'directive-v1-clock-grid');
  for (const clock of clocks) {
    const card = createElement('article', 'directive-v1-clock');
    const label = createElement('strong');
    label.textContent = clock.label;
    const value = createElement('span', 'directive-v1-clock-value');
    value.textContent = `${clock.value} ${clock.unit}`;
    const deadline = createElement('p');
    deadline.textContent = clock.deadline;
    card.append(label, value, deadline);
    if (clock.consequence) {
      const consequence = createElement('small');
      consequence.textContent = clock.consequence;
      card.appendChild(consequence);
    }
    grid.appendChild(card);
  }
  section.append(heading, grid);
  container.appendChild(section);
}

function appendSimpleList(container, label, entries, valueFor) {
  if (!entries.length) return;
  const section = createElement('section', 'directive-v1-mission-section');
  const heading = createElement('div', 'directive-v1-section-heading');
  const title = createElement('h3');
  title.textContent = label;
  heading.appendChild(title);
  const list = createElement('ul', 'directive-v1-information-list');
  entries.forEach((entry) => {
    const item = createElement('li');
    item.textContent = valueFor(entry);
    list.appendChild(item);
  });
  section.append(heading, list);
  container.appendChild(section);
}

function appendTerminal(container, terminal) {
  if (!terminal) return;
  const card = createElement('section', 'directive-v1-mission-terminal');
  const kicker = createElement('span');
  kicker.textContent = 'Mission complete';
  const title = createElement('h3');
  title.textContent = terminal.title;
  const summary = createElement('p');
  summary.textContent = terminal.summary;
  card.append(kicker, title, summary);
  if (terminal.next?.summary) {
    const next = createElement('p', 'directive-v1-mission-next');
    next.textContent = terminal.next.summary;
    card.appendChild(next);
  }
  container.appendChild(card);
}

export function renderMissionPanel(body, view) {
  const projection = requireV1PlayerProjection(view);
  if (!projection) {
    appendEmpty(body, currentChatEmptyMessage(view));
    return;
  }
  const mission = createV1MissionPanelModel(projection);
  const surface = createElement('div', 'directive-v1-mission');
  surface.dataset.directiveTour = 'mission.objectives';

  const hero = createElement('header', 'directive-v1-mission-hero');
  const kicker = createElement('span', 'directive-v1-kicker');
  kicker.textContent = mission.status === 'terminal' ? 'Completed mission' : 'Current mission';
  const title = createElement('h2');
  title.textContent = mission.title;
  const summary = createElement('p');
  summary.textContent = mission.summary;
  const progress = createElement('div', 'directive-v1-mission-progress');
  progress.textContent = `${mission.progress.requiredCompleted} of ${mission.progress.requiredTotal} primary objectives complete`;
  hero.append(kicker, title, summary, progress);
  surface.appendChild(hero);

  appendTerminal(surface, mission.terminal);
  appendObjectiveGroup(surface, 'Primary objectives', mission.primaryObjectives);
  appendObjectiveGroup(surface, 'Optional objectives', mission.optionalObjectives, { optional: true });
  appendClocks(surface, mission.clocks);
  appendSimpleList(surface, 'Known information', mission.knownFacts, (fact) => fact.summary);
  appendSimpleList(surface, 'Available support', mission.capabilities, (capability) => (
    capability.summary ? `${capability.label}: ${capability.summary}` : capability.label
  ));

  body.appendChild(surface);
}
