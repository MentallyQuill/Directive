import { createPackageImage } from './directive-media.js';
import { createElement } from './runtime-ui-kit.js';

const LEADER_ENDPOINTS = Object.freeze([
  [19, 23, 40, 39], [81, 23, 60, 39], [14, 69, 39, 58], [86, 69, 61, 58], [50, 88, 50, 66],
]);

const TASK_CATEGORY_ICONS = Object.freeze({
  personnel: 'personnel',
  coordination: 'coordination',
  training: 'training',
  systems: 'systems',
  shipboardLife: 'life',
});

function createTaskCategoryIcon(task) {
  const iconName = TASK_CATEGORY_ICONS[task?.primaryFamily];
  if (!iconName) return null;
  const icon = createElement('span', 'ship-task-category-icon');
  icon.dataset.category = task.primaryFamily;
  icon.dataset.icon = iconName;
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function appendCopy(parent, className, label, text) {
  if (!text) return;
  const section = createElement('section', className);
  const heading = createElement('h4');
  heading.textContent = label;
  const copy = createElement('p');
  copy.textContent = text;
  section.append(heading, copy);
  parent.appendChild(section);
}

function taskIdentity(task) {
  const crew = task?.binding?.crew;
  if (!crew?.name) return '';
  return [crew.rank, crew.name, crew.department].filter(Boolean).join(' · ');
}

function replaceChildren(element, ...nodes) {
  if (typeof element.replaceChildren === 'function') {
    element.replaceChildren(...nodes);
    return;
  }
  element.children = [];
  element.append(...nodes);
}

function createReward(task) {
  const reward = createElement('span', 'ship-task-reward');
  reward.textContent = `+${task.reward.cohesion} Cohesion`;
  reward.setAttribute('aria-label', `${task.reward.cohesion} Cohesion reward, ${task.reward.segments} segments`);
  return reward;
}

function createDetail(task, commandBearing, actions) {
  const content = createElement('div', 'ship-task-detail-content');
  const header = createElement('header', 'ship-task-detail-header');
  const identity = createElement('div');
  const eyebrow = createElement('span', 'ship-task-detail-eyebrow');
  eyebrow.textContent = `Level ${task.level} command task`;
  const titleRow = createElement('div', 'ship-task-title-row');
  const title = createElement('h3');
  title.textContent = task.title;
  const titleIcon = createTaskCategoryIcon(task);
  if (titleIcon) titleRow.appendChild(titleIcon);
  titleRow.appendChild(title);
  identity.append(eyebrow, titleRow);
  header.append(identity, createReward(task));
  content.appendChild(header);

  const boundIdentity = taskIdentity(task);
  if (boundIdentity) {
    const crew = createElement('p', 'ship-task-bound-crew');
    crew.textContent = boundIdentity;
    content.appendChild(crew);
  }
  appendCopy(content, 'ship-task-detail-section', 'What needs your attention', task.playerText.situation);
  appendCopy(content, 'ship-task-detail-section', 'Your objective', task.playerText.objective);
  appendCopy(content, 'ship-task-detail-section ship-task-why', 'Why it matters to you', task.playerText.whyItMatters);

  const pursue = createElement('section', 'ship-task-detail-section ship-task-pursue');
  const pursueHeading = createElement('h4');
  pursueHeading.textContent = 'How to pursue it';
  const next = createElement('p', 'ship-task-next-step');
  next.textContent = task.currentPhase ? `Next: ${task.currentPhase.label}` : 'This task is ready for closure.';
  const approaches = createElement('ul', 'ship-task-approaches');
  (task.approaches || []).forEach((approach) => {
    const item = createElement('li');
    item.textContent = approach;
    approaches.appendChild(item);
  });
  const computer = createElement('p', 'ship-task-computer-help');
  computer.textContent = `You can always ask the ship's computer for help. ${task.computerHelp || ''}`;
  pursue.append(pursueHeading, next, approaches, computer);
  content.appendChild(pursue);

  appendCopy(content, 'ship-task-detail-section ship-task-impact', 'While it remains unresolved', task.playerText.operationalEffect);
  if (task.completion?.guidance) appendCopy(content, 'ship-task-detail-section ship-task-completion', 'What completion looks like', task.completion.guidance);

  const progress = createElement('p', 'ship-task-progress');
  const completed = (task.phases || []).filter(({ status }) => status === 'completed').length;
  progress.textContent = `${completed} of ${(task.phases || []).length} steps complete`;
  content.appendChild(progress);

  const command = createElement('div', 'ship-command-relief');
  const pending = commandBearing?.pendingCohesionRelief || null;
  const button = createElement('button', 'ship-command-relief-button');
  button.type = 'button';
  if (pending?.targetIssueId === task.id) {
    button.textContent = 'Cancel reserved Command Bearing';
    button.disabled = typeof actions?.cancelCohesionRelief !== 'function';
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      const result = await actions.cancelCohesionRelief();
      if (result?.applied) {
        button.textContent = 'Command Bearing reservation cancelled';
        button.disabled = true;
      }
    });
  } else {
    const available = Number(commandBearing?.balance || 0) > 0 && !pending;
    button.textContent = pending
      ? 'Command Bearing is reserved for another task'
      : `Spend 1 Command Bearing · resolve +${task.reward.cohesion}`;
    button.disabled = !available || typeof actions?.reserveCohesionRelief !== 'function';
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      const result = await actions.reserveCohesionRelief({ issueId: task.id });
      button.textContent = result?.applied ? 'Command Bearing relief reserved' : 'Command Bearing unavailable';
      if (!result?.applied) button.disabled = false;
    });
  }
  const note = createElement('p');
  note.textContent = 'A point resolves this visible Cohesion issue after its causal result is accepted; it does not bypass unrelated permanent system evidence.';
  command.append(button, note);
  content.appendChild(command);
  return content;
}

function createLeaders(tasks) {
  const svg = typeof document.createElementNS === 'function'
    ? document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    : createElement('svg');
  svg.setAttribute('class', 'ship-task-leaders');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  tasks.forEach((task, index) => {
    const [x1, y1, x2, y2] = LEADER_ENDPOINTS[index] || LEADER_ENDPOINTS.at(-1);
    const line = typeof document.createElementNS === 'function'
      ? document.createElementNS('http://www.w3.org/2000/svg', 'line')
      : createElement('line');
    line.setAttribute('class', 'ship-task-leader');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1); line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.dataset.taskId = task.id;
    svg.appendChild(line);
  });
  return svg;
}

function createRing(cohesion) {
  const ring = createElement('div', 'ship-cohesion-ring');
  ring.setAttribute('role', 'list');
  ring.setAttribute('aria-label', `Cohesion ${cohesion.total} out of 100`);
  cohesion.segments.forEach((segment) => {
    const item = createElement('span', `ship-cohesion-segment ${segment.filled ? 'is-filled' : 'is-debt'}${segment.queued ? ' is-queued' : ''}`);
    item.dataset.segmentIndex = String(segment.index);
    if (segment.taskId) item.dataset.taskId = segment.taskId;
    item.style?.setProperty?.('--cohesion-segment-index', String(segment.index));
    item.setAttribute('role', 'listitem');
    item.setAttribute('aria-label', segment.filled ? `Cohesion segment ${segment.index + 1}, ready` : `Cohesion segment ${segment.index + 1}, unresolved`);
    ring.appendChild(item);
  });
  return ring;
}

function createHistory(records) {
  const history = createElement('details', 'ship-completed-history');
  const summary = createElement('summary');
  summary.textContent = `Completed work (${records.length})`;
  history.appendChild(summary);
  if (records.length) {
    const list = createElement('ul');
    records.forEach((record) => {
      const item = createElement('li');
      item.textContent = `${record.title} · +${record.cohesionRestored} Cohesion`;
      list.appendChild(item);
    });
    history.appendChild(list);
  }
  return history;
}

export function createShipCohesionWorkspace(ship, activePackage, actions = {}, commandBearing = {}) {
  const cohesion = ship.cohesion;
  const workspace = createElement('section', 'ship-cohesion-workspace');
  workspace.dataset.directiveScrollOwner = 'true';
  workspace.dataset.directiveTour = 'ship.status';

  const header = createElement('header', 'ship-cohesion-header');
  const identity = createElement('div', 'ship-cohesion-identity');
  const eyebrow = createElement('span');
  eyebrow.textContent = [ship.className, ship.registry].filter(Boolean).join(' · ');
  const title = createElement('h2');
  title.textContent = ship.name;
  identity.append(eyebrow, title);
  header.appendChild(identity);
  if (!cohesion) {
    const empty = createElement('p', 'ship-cohesion-empty');
    empty.textContent = 'No actionable command work is available right now.';
    workspace.append(header, empty);
    return workspace;
  }
  const score = createElement('div', `ship-cohesion-score is-${cohesion.band.id}`);
  const amount = createElement('strong');
  amount.textContent = `Cohesion ${cohesion.total}`;
  const band = createElement('span');
  band.textContent = cohesion.band.label;
  score.append(amount, band);
  header.appendChild(score);
  workspace.appendChild(header);

  const stage = createElement('div', 'ship-cohesion-stage');
  const ring = createRing(cohesion);
  const shipVisual = createPackageImage(activePackage || {}, {
    kind: 'ship.cohesion', subjectId: ship.id, variant: 'hero',
  }, { wrapperClass: 'ship-cohesion-visual', label: ship.name, loading: 'eager' });
  const tasks = cohesion.visibleTasks || [];
  const leaders = createLeaders(tasks);
  const taskNav = createElement('nav', 'ship-task-nav');
  taskNav.setAttribute('aria-label', 'Available command tasks');
  const detail = createElement('section', 'ship-task-detail');
  detail.id = 'ship-task-detail';
  detail.setAttribute('aria-live', 'polite');
  const buttons = [];
  const segments = [...ring.children];
  let selectedId = tasks[0]?.id || null;

  const preview = (taskId) => {
    segments.forEach((segment) => segment.classList.toggle('is-preview', segment.dataset.taskId === taskId));
    [...leaders.children].forEach((line) => line.classList.toggle('is-active', line.dataset.taskId === taskId));
  };
  const select = (taskId) => {
    const task = tasks.find(({ id }) => id === taskId);
    if (!task) return;
    selectedId = taskId;
    buttons.forEach((button) => {
      const active = button.dataset.taskId === taskId;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    replaceChildren(detail, createDetail(task, commandBearing, actions));
    preview(taskId);
  };

  tasks.forEach((task, index) => {
    const button = createElement('button', `ship-task-button ship-task-position-${index}`);
    button.type = 'button';
    button.dataset.taskId = task.id;
    button.dataset.anchor = task.anchor || '';
    button.setAttribute('aria-controls', 'ship-task-detail');
    button.setAttribute('aria-pressed', 'false');
    const titleRow = createElement('span', 'ship-task-button-title');
    const label = createElement('strong');
    label.textContent = task.title;
    const titleIcon = createTaskCategoryIcon(task);
    if (titleIcon) titleRow.appendChild(titleIcon);
    titleRow.appendChild(label);
    button.append(titleRow, createReward(task));
    button.addEventListener('click', () => select(task.id));
    button.addEventListener('focus', () => preview(task.id));
    button.addEventListener('blur', () => preview(selectedId));
    button.addEventListener('pointerenter', () => preview(task.id));
    button.addEventListener('pointerleave', () => preview(selectedId));
    buttons.push(button);
    taskNav.appendChild(button);
  });
  const orbit = createElement('div', 'ship-cohesion-orbit');
  orbit.append(ring, shipVisual, leaders, taskNav);
  stage.append(orbit, detail);
  workspace.appendChild(stage);

  if (cohesion.backlog.count > 0) {
    const backlog = createElement('p', 'ship-cohesion-backlog');
    backlog.textContent = `${cohesion.backlog.count} more issues queued · ${cohesion.backlog.cohesion} Cohesion to restore`;
    workspace.appendChild(backlog);
  }
  workspace.appendChild(createHistory(cohesion.completedHistory || []));
  if (selectedId) select(selectedId);
  return workspace;
}
