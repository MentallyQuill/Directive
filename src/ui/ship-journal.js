import { createPackageImage } from './directive-media.js';
import { resolvePackageImage } from '../packages/package-image-resolver.mjs';
import { createShipCalloutLayout } from './ship-callout-layout.js';
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

function createDetail(task, commandBearing, actions, { includeHeader = true } = {}) {
  const content = createElement('div', 'ship-task-detail-content');
  if (includeHeader) {
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
  }

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
      ? document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
      : createElement('polyline');
    line.setAttribute('class', 'ship-task-leader');
    line.setAttribute('points', `${x1},${y1} ${x2},${y2}`);
    line.dataset.taskId = task.id;
    svg.appendChild(line);
  });
  return svg;
}

function installCalloutLayout({ workspace, orbit, shipVisual, leaderSvg, leaders, buttons, mobileCallouts, mobileBadges, tasks, shipId, visualAnchors }) {
  if (typeof orbit?.getBoundingClientRect !== 'function' || typeof globalThis.requestAnimationFrame !== 'function') return;
  const image = shipVisual.querySelector?.('.directive-media-image');
  if (!image || typeof image.getBoundingClientRect !== 'function') {
    leaderSvg.classList.add('is-layout-unavailable');
    return;
  }
  let frame = 0;
  let observer = null;
  const layout = () => {
    frame = 0;
    if (!workspace.isConnected) {
      observer?.disconnect?.();
      return;
    }
    const mobile = globalThis.matchMedia?.('(max-width: 820px)')?.matches === true;
    const orbitRect = mobile ? mobileCallouts.getBoundingClientRect() : orbit.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const controls = mobile ? mobileBadges : buttons;
    const controlSizes = Object.fromEntries(controls.map((control) => {
      const rect = control.getBoundingClientRect();
      return [control.dataset.taskId, { width: rect.width, height: rect.height }];
    }));
    const result = createShipCalloutLayout({
      mode: mobile ? 'mobile' : 'desktop',
      orbitRect,
      imageRect,
      imageNaturalSize: { width: image.naturalWidth, height: image.naturalHeight },
      anchors: visualAnchors,
      shipId,
      tasks,
      controlSizes,
    });
    leaderSvg.setAttribute('viewBox', `0 0 ${orbitRect.width} ${orbitRect.height}`);
    leaderSvg.dataset.crossingCount = String(result.crossingCount);
    leaderSvg.classList.toggle('is-layout-unavailable', !result.valid);
    result.placements.forEach((placement) => {
      const button = controls.find(({ dataset }) => dataset.taskId === placement.taskId);
      const leader = leaders.find(({ dataset }) => dataset.taskId === placement.taskId);
      if (!button || !leader) return;
      button.style.left = `${placement.controlRect.x}px`;
      button.style.top = `${placement.controlRect.y}px`;
      button.dataset.slot = placement.slotId;
      button.dataset.corner = placement.corner;
      leader.dataset.slot = placement.slotId;
      leader.dataset.corner = placement.corner;
      leader.dataset.anchor = placement.anchor;
      leader.setAttribute('points', placement.points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '));
    });
    workspace.dataset.calloutLayoutReady = result.valid ? 'true' : 'false';
  };
  const schedule = () => {
    if (frame) return;
    frame = globalThis.requestAnimationFrame(layout);
  };
  if (typeof globalThis.ResizeObserver === 'function') {
    observer = new globalThis.ResizeObserver(schedule);
    observer.observe(orbit);
    observer.observe(image);
    observer.observe(mobileCallouts);
  } else {
    globalThis.addEventListener?.('resize', schedule, { passive: true });
  }
  if (!image.complete) {
    image.addEventListener('load', schedule, { once: true });
    image.addEventListener('error', schedule, { once: true });
  }
  schedule();
}

function createSvgElement(tagName, className = '') {
  const element = typeof document.createElementNS === 'function'
    ? document.createElementNS('http://www.w3.org/2000/svg', tagName)
    : createElement(tagName);
  className.split(/\s+/).filter(Boolean).forEach((name) => element.classList.add(name));
  return element;
}

const COHESION_SEGMENT_GEOMETRY = Object.freeze({
  desktop: Object.freeze({ centerRadius: 44, bandWidth: 3.2, gapDegrees: 2, cornerRadius: 0.4 }),
  mobile: Object.freeze({ centerRadius: 44, bandWidth: 6.3, gapDegrees: 2, cornerRadius: 0.9 }),
});

function cohesionSegmentPath(index, {
  centerRadius,
  bandWidth,
  gapDegrees,
  cornerRadius,
}) {
  const center = 50;
  const slotDegrees = 18;
  const outerRadius = centerRadius + (bandWidth / 2);
  const innerRadius = centerRadius - (bandWidth / 2);
  const startAngle = -90 + (index * slotDegrees) + (gapDegrees / 2);
  const endAngle = -90 + ((index + 1) * slotDegrees) - (gapDegrees / 2);
  const outerInset = cornerRadius * (180 / Math.PI) / outerRadius;
  const innerInset = cornerRadius * (180 / Math.PI) / innerRadius;
  const point = (radius, angle) => {
    const radians = angle * (Math.PI / 180);
    return [center + (radius * Math.cos(radians)), center + (radius * Math.sin(radians))];
  };
  const format = ([x, y]) => `${x.toFixed(3)} ${y.toFixed(3)}`;
  const outerStartFace = point(outerRadius - cornerRadius, startAngle);
  const outerStartCorner = point(outerRadius, startAngle);
  const outerStartArc = point(outerRadius, startAngle + outerInset);
  const outerEndArc = point(outerRadius, endAngle - outerInset);
  const outerEndCorner = point(outerRadius, endAngle);
  const outerEndFace = point(outerRadius - cornerRadius, endAngle);
  const innerEndFace = point(innerRadius + cornerRadius, endAngle);
  const innerEndCorner = point(innerRadius, endAngle);
  const innerEndArc = point(innerRadius, endAngle - innerInset);
  const innerStartArc = point(innerRadius, startAngle + innerInset);
  const innerStartCorner = point(innerRadius, startAngle);
  const innerStartFace = point(innerRadius + cornerRadius, startAngle);

  return [
    `M ${format(outerStartFace)}`,
    `Q ${format(outerStartCorner)} ${format(outerStartArc)}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${format(outerEndArc)}`,
    `Q ${format(outerEndCorner)} ${format(outerEndFace)}`,
    `L ${format(innerEndFace)}`,
    `Q ${format(innerEndCorner)} ${format(innerEndArc)}`,
    `A ${innerRadius} ${innerRadius} 0 0 0 ${format(innerStartArc)}`,
    `Q ${format(innerStartCorner)} ${format(innerStartFace)}`,
    `L ${format(outerStartFace)}`,
    'Z',
  ].join(' ');
}

function createRing(cohesion) {
  const ring = createElement('div', 'ship-cohesion-ring');
  ring.setAttribute('role', 'list');
  ring.setAttribute('aria-label', `Cohesion ${cohesion.total} out of 100`);
  const back = createSvgElement('svg', 'ship-cohesion-ring-layer is-back');
  const front = createSvgElement('svg', 'ship-cohesion-ring-layer is-front');
  [back, front].forEach((layer) => {
    layer.setAttribute('viewBox', '0 0 100 100');
    layer.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    layer.setAttribute('focusable', 'false');
  });
  const segments = [];
  cohesion.segments.forEach((segment) => {
    const item = createSvgElement('g', `ship-cohesion-segment ${segment.filled ? 'is-filled' : 'is-debt'}${segment.queued ? ' is-queued' : ''}`);
    item.dataset.segmentIndex = String(segment.index);
    item.style.setProperty('--ship-cohesion-index', String(segment.index));
    item.style.setProperty('--ship-cohesion-wave-delay', `${-((segment.index + 1) * 0.5)}s`);
    if (segment.taskId) item.dataset.taskId = segment.taskId;
    item.setAttribute('role', 'listitem');
    item.setAttribute('aria-label', segment.filled ? `Cohesion segment ${segment.index + 1}, ready` : `Cohesion segment ${segment.index + 1}, unresolved`);
    Object.entries(COHESION_SEGMENT_GEOMETRY).forEach(([variant, geometry]) => {
      const shape = createSvgElement('path', `ship-cohesion-segment-shape is-${variant}`);
      shape.setAttribute('d', cohesionSegmentPath(segment.index, geometry));
      shape.setAttribute('aria-hidden', 'true');
      item.appendChild(shape);
    });
    (segment.index < 10 ? back : front).appendChild(item);
    segments.push(item);
  });
  ring.append(back, front);
  return { root: ring, segments };
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
  const resolvedShipVisual = resolvePackageImage(activePackage || {}, {
    kind: 'ship.cohesion', subjectId: ship.id, variant: 'hero',
  });
  const tasks = cohesion.visibleTasks || [];
  const leaders = createLeaders(tasks);
  const taskNav = createElement('nav', 'ship-task-nav');
  taskNav.setAttribute('aria-label', 'Available command tasks');
  const mobileCallouts = createElement('div', 'ship-task-mobile-callouts');
  mobileCallouts.setAttribute('aria-label', 'Ship task locations');
  const detail = createElement('section', 'ship-task-detail');
  detail.id = 'ship-task-detail';
  detail.setAttribute('aria-live', 'polite');
  const buttons = [];
  const mobileBadges = [];
  const mobilePanels = [];
  const segments = ring.segments;
  let selectedId = tasks[0]?.id || null;
  let expandedId = null;

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
    mobileBadges.forEach((badge) => {
      const active = badge.dataset.taskId === taskId;
      badge.classList.toggle('is-selected', active);
      badge.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    replaceChildren(detail, createDetail(task, commandBearing, actions));
    preview(taskId);
  };
  const toggleExpanded = (taskId, { forceOpen = false } = {}) => {
    expandedId = forceOpen ? taskId : (expandedId === taskId ? null : taskId);
    buttons.forEach((button, index) => {
      const expanded = button.dataset.taskId === expandedId;
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      if (mobilePanels[index]) mobilePanels[index].hidden = !expanded;
    });
  };

  tasks.forEach((task, index) => {
    const button = createElement('button', 'ship-task-button');
    button.type = 'button';
    button.dataset.taskId = task.id;
    button.dataset.anchor = task.anchor || '';
    const buttonId = `ship-task-button-${index}`;
    const panelId = `ship-task-mobile-panel-${index}`;
    button.id = buttonId;
    button.setAttribute('aria-controls', `ship-task-detail ${panelId}`);
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-expanded', 'false');
    const titleRow = createElement('span', 'ship-task-button-title');
    const label = createElement('strong');
    label.textContent = task.title;
    const titleIcon = createTaskCategoryIcon(task);
    if (titleIcon) titleRow.appendChild(titleIcon);
    titleRow.appendChild(label);
    const disclosure = createElement('span', 'ship-task-disclosure');
    disclosure.setAttribute('aria-hidden', 'true');
    titleRow.appendChild(disclosure);
    const info = createElement('span', 'ship-task-button-info');
    const next = createElement('span', 'ship-task-button-next');
    next.textContent = task.currentPhase ? `Next: ${task.currentPhase.label}` : 'Ready for closure';
    info.append(next, createReward(task));
    button.append(titleRow, info);

    const mobileBadge = createElement('button', 'ship-task-mobile-callout');
    mobileBadge.type = 'button';
    mobileBadge.dataset.taskId = task.id;
    mobileBadge.setAttribute('aria-label', `${task.title}, level ${task.level}, restores ${task.reward.cohesion} Cohesion`);
    mobileBadge.setAttribute('aria-controls', panelId);
    mobileBadge.setAttribute('aria-pressed', 'false');
    const badgeIcon = createTaskCategoryIcon(task);
    if (badgeIcon) mobileBadge.appendChild(badgeIcon);
    const badgeLevel = createElement('span', 'ship-task-mobile-level');
    badgeLevel.textContent = `L${task.level}`;
    mobileBadge.appendChild(badgeLevel);
    mobileBadges.push(mobileBadge);
    mobileCallouts.appendChild(mobileBadge);

    const mobilePanel = createElement('section', 'ship-task-mobile-panel');
    mobilePanel.id = panelId;
    mobilePanel.hidden = true;
    mobilePanel.setAttribute('role', 'region');
    mobilePanel.setAttribute('aria-labelledby', buttonId);
    mobilePanel.appendChild(createDetail(task, commandBearing, actions, { includeHeader: false }));

    button.addEventListener('click', () => {
      select(task.id);
      toggleExpanded(task.id);
    });
    button.addEventListener('focus', () => preview(task.id));
    button.addEventListener('blur', () => preview(selectedId));
    button.addEventListener('pointerenter', () => preview(task.id));
    button.addEventListener('pointerleave', () => preview(selectedId));
    mobileBadge.addEventListener('click', () => {
      select(task.id);
      toggleExpanded(task.id, { forceOpen: true });
      const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
      mobilePanel.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
    });
    buttons.push(button);
    mobilePanels.push(mobilePanel);
    taskNav.append(button, mobilePanel);
  });
  const orbit = createElement('div', 'ship-cohesion-orbit');
  orbit.append(ring.root, shipVisual, leaders, taskNav, mobileCallouts);
  stage.append(orbit, detail);
  workspace.appendChild(stage);
  installCalloutLayout({
    workspace,
    orbit,
    shipVisual,
    leaderSvg: leaders,
    leaders: [...leaders.children],
    buttons,
    mobileCallouts,
    mobileBadges,
    tasks,
    shipId: ship.id,
    visualAnchors: resolvedShipVisual.visualAnchors || {},
  });

  if (cohesion.backlog.count > 0) {
    const backlog = createElement('p', 'ship-cohesion-backlog');
    backlog.textContent = `${cohesion.backlog.count} more issues queued · ${cohesion.backlog.cohesion} Cohesion to restore`;
    workspace.appendChild(backlog);
  }
  workspace.appendChild(createHistory(cohesion.completedHistory || []));
  if (selectedId) select(selectedId);
  return workspace;
}
