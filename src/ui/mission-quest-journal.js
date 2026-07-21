import {
  addTooltip,
  appendBulletList,
  appendEmpty,
  createElement,
  createIcon
} from './runtime-ui-kit.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compact(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function titleCase(value, fallback = '') {
  const text = compact(value).replace(/[-_]+/g, ' ');
  if (!text) return fallback;
  return text.split(/\s+/).map((part) => `${part[0]?.toUpperCase() || ''}${part.slice(1)}`).join(' ');
}

function statusLabel(status) {
  return titleCase(status, 'Inactive');
}

function categoryLabel(category) {
  return titleCase(category, 'Quest');
}

function createHeading(text, level = 'h2', className = '') {
  const heading = createElement(level, className);
  heading.textContent = text;
  return heading;
}

function createQuestRow(quest, selectedId, onSelect) {
  const selected = quest.id === selectedId;
  const row = createElement('button', `directive-quest-row${selected ? ' directive-quest-row-selected' : ''}`);
  row.type = 'button';
  row.dataset.questId = quest.id;
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', selected ? 'true' : 'false');
  row.setAttribute('aria-label', `${quest.title}, ${statusLabel(quest.status)}`);
  const marker = createElement('span', `directive-quest-category directive-quest-category-${quest.category}`);
  marker.textContent = categoryLabel(quest.category);
  const title = createElement('strong', 'directive-quest-row-title');
  title.textContent = quest.title;
  const status = createElement('span', 'directive-quest-row-status');
  status.textContent = statusLabel(quest.status);
  row.append(marker, title, status);
  if (quest.urgency?.label) {
    const urgency = createElement('span', 'directive-quest-row-urgency');
    urgency.textContent = quest.urgency.label;
    row.appendChild(urgency);
  }
  addTooltip(row, `Show details for ${quest.title}`);
  row.addEventListener('click', async (event) => {
    event?.preventDefault?.();
    await onSelect?.(quest.id);
  });
  return row;
}

function createQuestGroup(label, quests, selectedId, onSelect, { collapsed = false } = {}) {
  if (!quests.length) return null;
  const group = createElement(collapsed ? 'details' : 'section', `directive-quest-group directive-quest-group-${label.toLowerCase().replace(/\s+/g, '-')}`);
  if (collapsed) {
    const summary = createElement('summary', 'directive-quest-group-summary');
    summary.append(createHeading(label, 'h3', 'directive-quest-group-title'));
    const count = createElement('span', 'directive-quest-group-count');
    count.textContent = String(quests.length);
    summary.appendChild(count);
    group.appendChild(summary);
  } else {
    group.appendChild(createHeading(label, 'h3', 'directive-quest-group-title'));
  }
  const list = createElement('div', 'directive-quest-group-list');
  list.setAttribute('role', 'group');
  quests.forEach((quest) => list.appendChild(createQuestRow(quest, selectedId, onSelect)));
  group.appendChild(list);
  return group;
}

function createQuestList(quests, selectedId, onSelect) {
  const list = createElement('nav', 'directive-quest-list');
  list.setAttribute('aria-label', 'Quests');
  list.setAttribute('role', 'listbox');
  const current = quests.filter((quest) => ['active', 'available', 'paused'].includes(quest.status));
  const inactive = quests.filter((quest) => quest.status === 'inactive');
  const completed = quests.filter((quest) => ['completed', 'abandoned'].includes(quest.status));
  const groups = [
    createQuestGroup('Current Quests', current, selectedId, onSelect),
    createQuestGroup('Inactive', inactive, selectedId, onSelect, { collapsed: true }),
    createQuestGroup('Completed', completed, selectedId, onSelect, { collapsed: true })
  ];
  groups.filter(Boolean).forEach((group) => list.appendChild(group));
  if (!groups.some(Boolean)) appendEmpty(list, 'No quests are currently available.');
  return list;
}

function appendMetadata(container, label, value) {
  const text = compact(value);
  if (!text) return;
  const row = createElement('div', 'directive-quest-detail-meta');
  const key = createElement('span', 'directive-quest-detail-meta-label');
  key.textContent = label;
  const content = createElement('span', 'directive-quest-detail-meta-value');
  content.textContent = text;
  row.append(key, content);
  container.appendChild(row);
}

function createQuestDetail(quest) {
  const detail = createElement('section', 'directive-quest-detail');
  detail.setAttribute('aria-label', 'Quest details');
  if (!quest) {
    detail.appendChild(createHeading('No Quest Selected', 'h2', 'directive-quest-detail-title'));
    appendEmpty(detail, 'Select a quest to review its current objective and known information.');
    return detail;
  }
  detail.appendChild(createHeading(quest.title, 'h2', 'directive-quest-detail-title'));
  const badge = createElement('div', 'directive-quest-detail-badges');
  const category = createElement('span', 'directive-quest-detail-category');
  category.textContent = categoryLabel(quest.category);
  const status = createElement('span', 'directive-quest-detail-status');
  status.textContent = statusLabel(quest.status);
  badge.append(category, status);
  detail.appendChild(badge);
  if (quest.objective) {
    const objective = createElement('section', 'directive-quest-detail-section directive-quest-objective');
    objective.appendChild(createHeading('Current Objective', 'h3', 'directive-quest-detail-section-title'));
    const copy = createElement('p');
    copy.textContent = quest.objective;
    objective.appendChild(copy);
    detail.appendChild(objective);
  }
  const meta = createElement('div', 'directive-quest-detail-meta-list');
  appendMetadata(meta, 'Urgency', quest.urgency?.label);
  appendMetadata(meta, 'People', asArray(quest.people).map((person) => person.label).filter(Boolean).join(', '));
  appendMetadata(meta, 'Location', quest.location?.label);
  if (meta.children.length) detail.appendChild(meta);
  if (asArray(quest.knownFacts).length) {
    const known = createElement('section', 'directive-quest-detail-section directive-quest-known-facts');
    known.appendChild(createHeading('Known So Far', 'h3', 'directive-quest-detail-section-title'));
    appendBulletList(known, quest.knownFacts.slice(0, 3).map((fact) => fact.text).filter(Boolean), 'directive-quest-fact-list');
    detail.appendChild(known);
  }
  if (asArray(quest.history).length) {
    const history = createElement('details', 'directive-quest-history');
    history.appendChild(createHeading('Related History', 'summary', 'directive-quest-detail-section-title'));
    appendBulletList(history, quest.history.map((entry) => entry.summary).filter(Boolean), 'directive-quest-history-list');
    detail.appendChild(history);
  }
  return detail;
}

export function renderMissionQuestJournal(container, information = {}, actions = {}) {
  const quests = asArray(information.quests);
  const selectedId = compact(information.selectedQuestId);
  const selected = quests.find((quest) => quest.id === selectedId) || null;
  const journal = createElement('section', 'directive-quest-journal');
  journal.setAttribute('aria-label', 'Mission quests');
  journal.dataset.directiveTour = 'mission.overview mission.quest.journal';
  const select = async (questId) => {
    await actions.selectMissionQuest?.({ questId });
    await actions.refresh?.({ preserveScroll: true });
  };
  journal.append(createQuestList(quests, selectedId, select), createQuestDetail(selected));
  container.appendChild(journal);
  return journal;
}
