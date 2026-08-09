import { clearElement, createElement } from './runtime-ui-kit.js';
import { bindPresentationReorderHandle } from './expanded-interface-reorder.js';

let selectedQuestId = '';
let questOrder = [];
const expandedMobileQuests = new Set();
let mobileQuestsInitialized = false;

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function compact(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function titleCase(value, fallback = '') {
  const text = compact(value).replace(/[-_]+/g, ' ');
  return text ? text.replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
}

function orderedQuests(quests) {
  const ids = new Set(quests.map((quest) => quest.id));
  questOrder = [...questOrder.filter((id) => ids.has(id)), ...quests.map((quest) => quest.id).filter((id) => !questOrder.includes(id))];
  return questOrder.map((id) => quests.find((quest) => quest.id === id)).filter(Boolean);
}

function moveQuest(questId, offset, rerender) {
  const index = questOrder.indexOf(questId);
  const next = Math.max(0, Math.min(questOrder.length - 1, index + offset));
  if (index < 0 || next === index) return;
  const [moved] = questOrder.splice(index, 1);
  questOrder.splice(next, 0, moved);
  rerender();
  requestAnimationFrame(() => document.querySelector(`[data-quest-drag-id="${CSS.escape(questId)}"]`)?.focus());
}

function dragHandle(quest, rerender) {
  const handle = createElement('button', 'mobile-drag-handle');
  handle.type = 'button';
  handle.dataset.questDragId = quest.id;
  handle.setAttribute('aria-label', `Reorder ${quest.title}`);
  return bindPresentationReorderHandle(handle, {
    itemSelector: '.mobile-quest-item',
    listSelector: '.mobile-quest-list',
    idAttribute: 'data-mobile-quest-id',
    order: () => [...questOrder],
    onCommit: (next) => { questOrder = next; rerender(); requestAnimationFrame(() => document.querySelector(`[data-quest-drag-id="${CSS.escape(quest.id)}"]`)?.focus()); }
  });
}

function createTask(text, state = '') {
  const item = createElement('li', `task${state ? ` ${state}` : ''}`);
  const marker = createElement('span', 'task-marker');
  marker.textContent = state === 'complete' ? '\u2713' : '';
  const copy = createElement('span');
  copy.textContent = text;
  item.append(marker, copy);
  return item;
}

function questTasks(quest) {
  const tasks = asArray(quest.tasks || quest.objectives).map((task) => typeof task === 'string' ? { text: task } : task);
  if (tasks.length) return tasks;
  return quest.objective ? [{ text: quest.objective, state: 'current' }] : [];
}

function mobileQuestCategory(category) {
  const value = compact(category).toLowerCase();
  if (value === 'main') return 'Main quest';
  if (value === 'side') return 'Side quest';
  return `${titleCase(category, 'Quest')} quest`;
}

function createDetail(quest) {
  const detail = createElement('article', 'quest-detail');
  detail.setAttribute('aria-label', 'Quest details');
  if (!quest) return detail;
  const header = createElement('header', 'quest-header');
  const kicker = createElement('div', 'detail-kicker');
  kicker.textContent = `${titleCase(quest.category, 'Quest')} Quest`;
  const title = createElement('h2', 'detail-title');
  title.textContent = quest.title;
  header.append(kicker, title);
  const description = createElement('p', 'quest-description');
  description.textContent = quest.description || quest.summary || quest.objective || '';
  header.appendChild(description);
  detail.appendChild(header);

  const tasks = questTasks(quest);
  const completed = tasks.filter((task) => ['complete', 'completed', 'done'].includes(compact(task.state || task.status).toLowerCase())).length;
  const progress = createElement('div', 'progress-row');
  const progressCopy = createElement('span', 'progress-copy');
  progressCopy.textContent = `${completed} of ${Math.max(tasks.length, 1)} complete`;
  const track = createElement('span', 'progress-track');
  const fill = createElement('span', 'progress-fill');
  fill.setAttribute('style', `width:${tasks.length ? (completed / tasks.length) * 100 : 0}%`);
  track.appendChild(fill);
  progress.append(progressCopy, track);
  detail.appendChild(progress);

  const objective = createElement('section', 'objective-block');
  const objectiveTitle = createElement('h3', 'objective-title');
  objectiveTitle.textContent = quest.objective || 'Current objective';
  objective.appendChild(objectiveTitle);
  if (quest.objectiveDescription) {
    const copy = createElement('p', 'objective-description');
    copy.textContent = quest.objectiveDescription;
    objective.appendChild(copy);
  }
  const list = createElement('ul', 'task-list');
  tasks.forEach((task, index) => {
    const raw = compact(task.state || task.status).toLowerCase();
    const state = ['complete', 'completed', 'done'].includes(raw) ? 'complete' : raw === 'current' || (!raw && index === completed) ? 'current' : 'upcoming';
    list.appendChild(createTask(task.text || task.label || task.title || '', state));
  });
  objective.appendChild(list);
  detail.appendChild(objective);

  if (asArray(quest.knownFacts).length) {
    const known = createElement('section', 'objective-block quest-known-constraints');
    const knownTitle = createElement('h3', 'objective-title');
    knownTitle.textContent = 'Known constraints';
    const knownList = createElement('ul', 'task-list');
    asArray(quest.knownFacts).forEach((fact) => knownList.appendChild(createTask(fact.text || fact.summary || fact.label || '', 'upcoming')));
    known.append(knownTitle, knownList);
    detail.appendChild(known);
  }

  const meta = createElement('div', 'quest-meta-row');
  const entries = [
    ['Urgency', quest.urgency?.label],
    ['Location', quest.location?.label || quest.location],
    ['Contact', asArray(quest.people).map((person) => person.label || person.name).filter(Boolean).join(', ')]
  ];
  entries.forEach(([label, value]) => {
    if (!compact(value)) return;
    const item = createElement('div', 'meta-item');
    const key = createElement('span', 'meta-label');
    key.textContent = label;
    const val = createElement('span', 'meta-value');
    val.textContent = value;
    item.append(key, val);
    meta.appendChild(item);
  });
  if (meta.children.length) detail.appendChild(meta);
  return detail;
}

function createDesktop(quests, selected, select) {
  const layout = createElement('section', 'mission-layout');
  layout.setAttribute('aria-label', 'Mission quests');
  layout.dataset.directiveTour = 'mission.overview mission.quest.journal';
  const index = createElement('nav', 'quest-index');
  index.setAttribute('aria-label', 'Quests');
  // The approved desktop composition is a selected-record master/detail view.
  // Other current records remain available in the phone accordion, where the
  // frozen interface explicitly exposes the full presentation-only ordering.
  const current = quests.filter((quest) => quest.id === selected?.id && !['completed', 'abandoned'].includes(quest.status));
  const completed = quests.filter((quest) => ['completed', 'abandoned'].includes(quest.status));
  const heading = createElement('div', 'index-title');
  heading.textContent = `Current Quests ${current.length}`;
  index.appendChild(heading);
  current.forEach((quest) => {
    const row = createElement('button', `quest-row${quest.id === selected?.id ? ' active' : ''}`);
    row.type = 'button';
    row.dataset.questId = quest.id;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', quest.id === selected?.id ? 'true' : 'false');
    row.setAttribute('aria-pressed', quest.id === selected?.id ? 'true' : 'false');
    const title = createElement('div', 'quest-title');
    title.textContent = quest.title;
    const meta = createElement('div', 'quest-meta');
    meta.textContent = `${titleCase(quest.category, 'Quest')} / ${titleCase(quest.status, 'Active')}`;
    row.append(title, meta);
    row.addEventListener('click', () => select(quest.id));
    index.appendChild(row);
  });
  const completedRow = createElement('div', 'quest-group');
  const completedLabel = createElement('span');
  completedLabel.textContent = 'Completed';
  const completedCount = createElement('span');
  completedCount.textContent = String(completed.length);
  completedRow.append(completedLabel, completedCount);
  index.appendChild(completedRow);
  const indexPanel = createElement('div', 'quest-index-panel');
  indexPanel.appendChild(index);
  layout.append(indexPanel, createDetail(selected));
  return layout;
}

function createMobile(quests, rerender) {
  const route = createElement('section', 'mobile-quest-accordion mobile-quest-list');
  route.setAttribute('aria-label', 'Quest journal');
  if (!mobileQuestsInitialized) {
    if (quests[0]) expandedMobileQuests.add(quests[0].id);
    mobileQuestsInitialized = true;
  }
  const heading = createElement('div', 'mobile-section-head');
  const headingLabel = createElement('span');
  headingLabel.textContent = 'Current quests';
  const headingCount = createElement('span');
  headingCount.textContent = `${quests.length} tracked`;
  heading.append(headingLabel, headingCount);
  route.appendChild(heading);
  quests.forEach((quest) => {
    const open = expandedMobileQuests.has(quest.id);
    const item = createElement('article', `mobile-accordion-item mobile-quest-item${open ? ' is-open' : ''}`);
    item.dataset.mobileQuestId = quest.id;
    const head = createElement('div', 'mobile-accordion-head');
    const toggle = createElement('button', 'mobile-accordion-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    const copy = createElement('span', 'mobile-accordion-copy');
    const mobileTitle = createElement('strong');
    mobileTitle.textContent = quest.title;
    const mobileMeta = createElement('small');
    mobileMeta.textContent = `${mobileQuestCategory(quest.category)} / ${titleCase(quest.status, 'Active')}`;
    copy.append(mobileTitle, mobileMeta);
    const chevron = createElement('span', 'mobile-accordion-chevron');
    chevron.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    toggle.append(copy, chevron);
    toggle.addEventListener('click', () => {
      if (open) expandedMobileQuests.delete(quest.id);
      else expandedMobileQuests.add(quest.id);
      rerender();
    });
    head.append(toggle, dragHandle(quest, rerender));
    item.appendChild(head);
    const detail = createElement('div', 'mobile-accordion-detail');
    detail.hidden = !open;
    const kicker = createElement('div', 'mobile-detail-kicker');
    kicker.textContent = quest.objective || 'Current objective';
    const description = createElement('p', 'mobile-detail-copy');
    description.textContent = quest.mobileDescription || quest.description || quest.summary || quest.objectiveDescription || '';
    detail.append(kicker, description);
    const list = createElement('ul', 'mobile-task-list');
    questTasks(quest).forEach((task) => {
      const done = ['complete', 'completed', 'done'].includes(compact(task.state || task.status).toLowerCase());
      const li = createElement('li', done ? 'done' : '');
      const box = createElement('span', 'mobile-task-box');
      const taskCopy = createElement('span');
      taskCopy.textContent = task.text || task.label || task.title || '';
      li.append(box, taskCopy);
      list.appendChild(li);
    });
    detail.appendChild(list);
    const metaValues = [
      quest.location?.label || quest.location,
      asArray(quest.people).map((person) => person.name || person.label).filter(Boolean).join(', ')
    ].map(compact).filter(Boolean);
    if (metaValues.length) {
      const meta = createElement('div', 'mobile-detail-meta');
      metaValues.forEach((value) => {
        const entry = createElement('span');
        entry.textContent = value;
        meta.appendChild(entry);
      });
      detail.appendChild(meta);
    }
    item.appendChild(detail);
    route.appendChild(item);
  });
  const completed = quests.filter((quest) => ['completed', 'abandoned'].includes(compact(quest.status).toLowerCase()));
  const completedRow = createElement('div', 'quest-group');
  const completedLabel = createElement('span');
  completedLabel.textContent = 'Completed';
  const completedCount = createElement('span');
  completedCount.textContent = String(completed.length);
  completedRow.append(completedLabel, completedCount);
  route.appendChild(completedRow);
  return route;
}

export function renderMissionQuestJournal(container, information = {}) {
  const host = createElement('div', 'directive-mission-journal-host');
  const rerender = () => {
    clearElement(host);
    const quests = orderedQuests(asArray(information.quests));
    if (!selectedQuestId || !quests.some((quest) => quest.id === selectedQuestId)) selectedQuestId = information.selectedQuestId || quests[0]?.id || '';
    const selected = quests.find((quest) => quest.id === selectedQuestId) || quests[0] || null;
    host.append(createDesktop(quests, selected, (questId) => {
      selectedQuestId = questId;
      rerender();
    }), createMobile(quests, rerender));
  };
  rerender();
  container.appendChild(host);
  return host;
}
