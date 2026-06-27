import {
  addTooltip,
  appendEmpty,
  clearElement,
  createButton,
  createElement,
  createIcon,
  createInputField
} from './runtime-ui-kit.js';

const COMPONENT_TYPES = Object.freeze([
  ['all', 'All Types'],
  ['note', 'Notes'],
  ['item', 'Items'],
  ['itemStat', 'Item Stats'],
  ['shipIssue', 'Ship Issues'],
  ['lead', 'Leads'],
  ['claim', 'Claims'],
  ['memory', 'Memories'],
  ['question', 'Questions'],
  ['quote', 'Quotes'],
  ['procedure', 'Procedures'],
  ['sourceDocument', 'Source Docs']
]);

const COMPONENT_STATUSES = Object.freeze([
  ['all', 'All Statuses'],
  ['active', 'Active'],
  ['unresolved', 'Unresolved'],
  ['confirmed', 'Confirmed'],
  ['disputed', 'Disputed'],
  ['superseded', 'Superseded'],
  ['archived', 'Archived']
]);

const COMPONENT_SOURCES = Object.freeze([
  ['all', 'All Sources'],
  ['officialPacket', 'Official Packet'],
  ['personalAssessment', 'Personal Assessment'],
  ['dialogue', 'Dialogue'],
  ['playerObservation', 'Player Observation'],
  ['narration', 'Narration'],
  ['systemStatus', 'System Status'],
  ['unknown', 'Unknown']
]);

const SORT_OPTIONS = Object.freeze([
  ['recent', 'Recent'],
  ['updated', 'Updated'],
  ['type', 'Type'],
  ['status', 'Status'],
  ['source', 'Source Order'],
  ['title', 'Title']
]);

const SCOPE_OPTIONS = Object.freeze([
  ['all', 'All Components'],
  ['currentMission', 'Current Mission']
]);

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function labelFromToken(value = '') {
  const text = cleanText(value);
  if (!text) return 'Unknown';
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compactText(value = '', maxLength = 260) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function recordsFromState(state = {}) {
  const records = state?.knowledgeLedger?.components?.records;
  return Array.isArray(records) ? records.filter((record) => record?.id) : [];
}

function optionSelect(className, options, value) {
  const select = createElement('select', className);
  select.value = value;
  for (const [id, label] of options) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = label;
    option.selected = id === value;
    select.appendChild(option);
  }
  return select;
}

function dynamicOptions(records = [], readValues, allLabel) {
  const values = [...new Set(records.flatMap((record) => readValues(record)).map(cleanText).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  return [['all', allLabel], ...values.map((value) => [value, labelFromToken(value)])];
}

function componentText(record = {}) {
  return [
    record.title,
    record.summary,
    record.verbatim,
    ...(Array.isArray(record.tags) ? record.tags : []),
    record.sourceAuthority,
    record.source?.hostMessageId,
    ...(Array.isArray(record.links?.crewIds) ? record.links.crewIds : []),
    ...(Array.isArray(record.links?.shipSystemIds) ? record.links.shipSystemIds : [])
  ].map(cleanText).filter(Boolean).join(' ').toLowerCase();
}

function matchesFilters(record, filters) {
  if (filters.type !== 'all' && record.type !== filters.type) return false;
  if (filters.status !== 'all' && record.status !== filters.status) return false;
  if (filters.source !== 'all' && record.sourceAuthority !== filters.source) return false;
  if (filters.scope === 'currentMission' && filters.currentMissionId && !(record.links?.missionIds || []).includes(filters.currentMissionId)) return false;
  if (filters.tag !== 'all' && !(record.tags || []).includes(filters.tag)) return false;
  if (filters.crew !== 'all' && !(record.links?.crewIds || []).includes(filters.crew)) return false;
  if (filters.shipSystem !== 'all' && !(record.links?.shipSystemIds || []).includes(filters.shipSystem)) return false;
  const query = cleanText(filters.query).toLowerCase();
  return !query || componentText(record).includes(query);
}

function timeValue(value = '') {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceOrderValue(record = {}) {
  const numeric = Number(record.source?.hostMessageId);
  return Number.isFinite(numeric) ? numeric : 999999;
}

function activeMissionId(state = {}) {
  return cleanText(state?.mission?.activeMissionId || state?.mission?.activeMissionGraphId || state?.mission?.activePhaseId);
}

function statusPriority(record = {}) {
  if (record.status === 'unresolved') return 0;
  if (record.status === 'disputed') return 1;
  if (record.status === 'active') return 2;
  if (record.status === 'confirmed') return 3;
  if (record.status === 'superseded') return 4;
  if (record.status === 'archived') return 5;
  return 6;
}

function missionPriority(record = {}, currentMissionId = '') {
  if (!currentMissionId) return 0;
  return (record.links?.missionIds || []).includes(currentMissionId) ? 0 : 1;
}

function sortedRecords(records = [], sort = 'recent', currentMissionId = '') {
  const next = [...records];
  if (sort === 'title') {
    next.sort((left, right) => cleanText(left.title).localeCompare(cleanText(right.title)));
  } else if (sort === 'type') {
    next.sort((left, right) => cleanText(left.type).localeCompare(cleanText(right.type)) || cleanText(left.title).localeCompare(cleanText(right.title)));
  } else if (sort === 'status') {
    next.sort((left, right) => cleanText(left.status).localeCompare(cleanText(right.status)) || cleanText(left.title).localeCompare(cleanText(right.title)));
  } else if (sort === 'source') {
    next.sort((left, right) => sourceOrderValue(left) - sourceOrderValue(right));
  } else if (sort === 'updated') {
    next.sort((left, right) => timeValue(right.lifecycle?.updatedAt) - timeValue(left.lifecycle?.updatedAt));
  } else {
    next.sort((left, right) => (
      missionPriority(left, currentMissionId) - missionPriority(right, currentMissionId)
      || statusPriority(left) - statusPriority(right)
      || timeValue(right.lifecycle?.createdAt) - timeValue(left.lifecycle?.createdAt)
    ));
  }
  return next;
}

function countBy(records = [], predicate) {
  return records.filter(predicate).length;
}

function createCountChip(label, value, tone = '') {
  const chip = createElement('span', `directive-mission-components-count-chip${tone ? ` directive-mission-components-count-${tone}` : ''}`);
  chip.textContent = `${label} ${value}`;
  return chip;
}

function sourceLabel(record = {}) {
  const authority = labelFromToken(record.sourceAuthority || 'unknown');
  const name = cleanText(record.source?.messageName);
  const message = cleanText(record.source?.hostMessageId);
  return [authority, name, message ? `Msg ${message}` : ''].filter(Boolean).join(' / ');
}

function linkChips(record = {}) {
  return [
    ...(Array.isArray(record.links?.crewIds) ? record.links.crewIds : []),
    ...(Array.isArray(record.links?.shipSystemIds) ? record.links.shipSystemIds : []),
    ...(Array.isArray(record.links?.missionIds) ? record.links.missionIds : []),
    ...(Array.isArray(record.tags) ? record.tags : [])
  ].map(cleanText).filter(Boolean).slice(0, 10);
}

function createChip(label, className = '') {
  const chip = createElement('span', `directive-mission-component-chip${className ? ` ${className}` : ''}`);
  chip.textContent = label;
  return chip;
}

function sourceStateLabel(record = {}) {
  const status = cleanText(record.source?.sourceStatus || 'active');
  if (!status || status === 'active') return '';
  return labelFromToken(status);
}

function createComponentEditForm(record, actions) {
  const form = createElement('form', 'directive-mission-component-edit-form');
  const initialValues = {
    title: record.title || '',
    type: record.type || 'note',
    status: record.status || 'active',
    sourceAuthority: record.sourceAuthority || 'unknown',
    summary: record.summary || '',
    tags: (record.tags || []).join(', '),
    crewIds: (record.links?.crewIds || []).join(', '),
    shipSystemIds: (record.links?.shipSystemIds || []).join(', '),
    missionIds: (record.links?.missionIds || []).join(', ')
  };
  const resetForm = () => {
    for (const control of form.querySelectorAll?.('[data-input-path]') || []) {
      control.value = initialValues[control.dataset.inputPath] || '';
    }
  };
  form.append(
    createInputField({ label: 'Title', path: 'title', value: initialValues.title, maxLength: 120 }),
    createInputField({
      label: 'Type',
      path: 'type',
      value: initialValues.type,
      options: COMPONENT_TYPES.filter(([id]) => id !== 'all').map(([id, label]) => ({ id, label }))
    }),
    createInputField({
      label: 'Status',
      path: 'status',
      value: initialValues.status,
      options: COMPONENT_STATUSES.filter(([id]) => id !== 'all').map(([id, label]) => ({ id, label }))
    }),
    createInputField({
      label: 'Source Authority',
      path: 'sourceAuthority',
      value: initialValues.sourceAuthority,
      options: COMPONENT_SOURCES.filter(([id]) => id !== 'all').map(([id, label]) => ({ id, label }))
    }),
    createInputField({ label: 'Summary', path: 'summary', value: initialValues.summary, multiline: true, maxLength: 520 }),
    createInputField({ label: 'Tags', path: 'tags', value: initialValues.tags, maxLength: 240 }),
    createInputField({ label: 'Linked Crew', path: 'crewIds', value: initialValues.crewIds, maxLength: 320 }),
    createInputField({ label: 'Linked Ship Systems', path: 'shipSystemIds', value: initialValues.shipSystemIds, maxLength: 320 }),
    createInputField({ label: 'Linked Missions', path: 'missionIds', value: initialValues.missionIds, maxLength: 320 })
  );

  const source = createElement('div', 'directive-mission-component-source-lock');
  source.append(createIcon('fa-solid fa-lock'));
  const sourceCopy = createElement('span');
  sourceCopy.textContent = compactText(record.verbatim || '', 260);
  source.appendChild(sourceCopy);
  form.appendChild(source);

  const row = createElement('div', 'directive-mission-component-edit-actions directive-action-row');
  row.append(
    createButton({
      label: 'Save Changes',
      icon: 'fa-solid fa-check',
      className: 'directive-button directive-primary-command',
      onClick: async () => {
        const patch = {};
        for (const control of form.querySelectorAll?.('[data-input-path]') || []) {
          if (control.dataset.inputPath === 'tags') {
            patch.tags = cleanText(control.value).split(',').map(cleanText).filter(Boolean);
          } else if (['crewIds', 'shipSystemIds', 'missionIds'].includes(control.dataset.inputPath)) {
            patch.links = patch.links || { ...(record.links || {}) };
            patch.links[control.dataset.inputPath] = cleanText(control.value).split(',').map(cleanText).filter(Boolean);
          } else {
            patch[control.dataset.inputPath] = control.value;
          }
        }
        await actions.updateMissionComponent?.({ componentId: record.id, patch });
        await actions.refresh?.();
      }
    }),
    createButton({
      label: 'Cancel',
      icon: 'fa-solid fa-xmark',
      className: 'directive-button directive-secondary-command',
      onClick: async () => {
        resetForm();
        form.hidden = true;
      }
    })
  );
  form.appendChild(row);
  return form;
}

function createComponentCard(record, actions) {
  const card = createElement('article', `directive-mission-component-card directive-mission-component-type-${record.type || 'note'}`);
  addTooltip(card, 'Player-curated Mission Component. Source text is preserved separately from the editable summary.');

  const header = createElement('div', 'directive-mission-component-card-header');
  const titleBlock = createElement('div', 'directive-mission-component-titleblock');
  const kicker = createElement('div', 'directive-mission-component-kicker-row');
  kicker.append(
    createChip(labelFromToken(record.type), 'directive-mission-component-type-chip'),
    createChip(labelFromToken(record.status), 'directive-mission-component-status-chip')
  );
  const stale = sourceStateLabel(record);
  if (stale) kicker.appendChild(createChip(stale, 'directive-mission-component-source-state-chip'));
  const title = createElement('h4', 'directive-mission-component-title');
  title.textContent = record.title || 'Mission Component';
  titleBlock.append(kicker, title);
  header.appendChild(titleBlock);
  card.appendChild(header);

  const summary = createElement('p', 'directive-mission-component-summary');
  summary.textContent = record.summary || record.verbatim || 'No summary recorded.';
  card.appendChild(summary);

  const meta = createElement('div', 'directive-mission-component-meta');
  const source = createElement('span');
  source.textContent = `Source: ${sourceLabel(record) || 'Unknown source'}`;
  meta.appendChild(source);
  if (record.source?.capturedAt) {
    const captured = createElement('span');
    captured.textContent = `Captured: ${new Date(record.source.capturedAt).toLocaleString?.() || record.source.capturedAt}`;
    meta.appendChild(captured);
  }
  card.appendChild(meta);

  const links = linkChips(record);
  if (links.length) {
    const chipRow = createElement('div', 'directive-mission-component-links');
    for (const link of links) chipRow.appendChild(createChip(link));
    card.appendChild(chipRow);
  }

  const details = createElement('details', 'directive-mission-component-source-details');
  const detailsSummary = createElement('summary');
  detailsSummary.textContent = 'Source Excerpt';
  const excerpt = createElement('p');
  excerpt.textContent = record.verbatim || 'No source excerpt recorded.';
  details.append(detailsSummary, excerpt);
  card.appendChild(details);

  const actionsRow = createElement('div', 'directive-mission-component-actions directive-action-row');
  actionsRow.append(
    createButton({
      label: 'Open Source',
      icon: 'fa-solid fa-location-dot',
      className: 'directive-button directive-secondary-command',
      onClick: async () => {
        await actions.openMissionComponentSource?.({ componentId: record.id });
      }
    }),
    createButton({
      label: 'Edit',
      icon: 'fa-solid fa-pen',
      className: 'directive-button directive-secondary-command',
      onClick: async () => {
        const form = card.querySelector?.('.directive-mission-component-edit-form');
        if (form) form.hidden = !form.hidden;
      }
    }),
    createButton({
      label: 'Archive',
      icon: 'fa-solid fa-box-archive',
      className: 'directive-button directive-secondary-command',
      disabled: record.status === 'archived',
      onClick: async () => {
        await actions.archiveMissionComponent?.({ componentId: record.id });
        await actions.refresh?.();
      }
    })
  );
  card.appendChild(actionsRow);
  const editForm = createComponentEditForm(record, actions);
  editForm.hidden = true;
  card.appendChild(editForm);
  return card;
}

export function renderMissionComponentsPanel(container, view, state, actions = {}) {
  const records = recordsFromState(state);
  const currentMissionId = activeMissionId(state);
  const consoleSurface = createElement('div', 'directive-mission-components-console');
  const header = createElement('div', 'directive-mission-components-header');
  const titleBlock = createElement('div', 'directive-mission-components-titleblock');
  const title = createElement('h3', 'directive-mission-components-title');
  title.textContent = 'Components';
  const summary = createElement('p', 'directive-mission-components-summary');
  summary.textContent = 'Player-curated source evidence for the active mission.';
  titleBlock.append(title, summary);
  header.appendChild(titleBlock);
  consoleSurface.appendChild(header);

  if (records.length === 0) {
    const empty = createElement('div', 'directive-mission-components-empty');
    appendEmpty(empty, 'No Mission Components yet. Highlight useful chat text, then use the Directive ship button to add it here.');
    consoleSurface.appendChild(empty);
    container.appendChild(consoleSurface);
    return;
  }

  const controls = createElement('div', 'directive-mission-components-toolbar');
  const search = createElement('input', 'directive-mission-components-search');
  search.type = 'search';
  search.placeholder = 'Search components...';
  const typeSelect = optionSelect('directive-mission-components-filter', COMPONENT_TYPES, 'all');
  const statusSelect = optionSelect('directive-mission-components-filter', COMPONENT_STATUSES, 'all');
  const sourceSelect = optionSelect('directive-mission-components-filter', COMPONENT_SOURCES, 'all');
  const scopeSelect = optionSelect('directive-mission-components-filter', SCOPE_OPTIONS, 'all');
  scopeSelect.disabled = !currentMissionId;
  const tagSelect = optionSelect('directive-mission-components-filter', dynamicOptions(records, (record) => record.tags || [], 'All Tags'), 'all');
  const crewSelect = optionSelect('directive-mission-components-filter', dynamicOptions(records, (record) => record.links?.crewIds || [], 'All Crew'), 'all');
  const shipSystemSelect = optionSelect('directive-mission-components-filter', dynamicOptions(records, (record) => record.links?.shipSystemIds || [], 'All Ship Systems'), 'all');
  const sortSelect = optionSelect('directive-mission-components-filter', SORT_OPTIONS, 'recent');
  controls.append(search, scopeSelect, typeSelect, statusSelect, sourceSelect, tagSelect, crewSelect, shipSystemSelect, sortSelect);
  consoleSurface.appendChild(controls);

  const countRow = createElement('div', 'directive-mission-components-count-row');
  const list = createElement('div', 'directive-mission-components-list');
  consoleSurface.append(countRow, list);

  const renderList = () => {
    const filters = {
      query: search.value,
      scope: scopeSelect.value,
      currentMissionId,
      type: typeSelect.value,
      status: statusSelect.value,
      source: sourceSelect.value,
      tag: tagSelect.value,
      crew: crewSelect.value,
      shipSystem: shipSystemSelect.value
    };
    const filtered = sortedRecords(records.filter((record) => matchesFilters(record, filters)), sortSelect.value, currentMissionId);
    clearElement(countRow);
    countRow.append(
      createCountChip('All', records.length),
      createCountChip('Unresolved', countBy(records, (record) => record.status === 'unresolved'), 'warning'),
      createCountChip('Ship', countBy(records, (record) => record.type === 'shipIssue')),
      createCountChip('Claims', countBy(records, (record) => record.type === 'claim')),
      createCountChip('Items', countBy(records, (record) => record.type === 'item' || record.type === 'itemStat'))
    );
    clearElement(list);
    if (filtered.length === 0) {
      const empty = createElement('div', 'directive-mission-components-empty');
      appendEmpty(empty, 'No components match these filters.');
      empty.appendChild(createButton({
        label: 'Clear Filters',
        icon: 'fa-solid fa-filter-circle-xmark',
        className: 'directive-button directive-secondary-command',
        onClick: async () => {
          search.value = '';
          typeSelect.value = 'all';
          statusSelect.value = 'all';
          sourceSelect.value = 'all';
          scopeSelect.value = 'all';
          tagSelect.value = 'all';
          crewSelect.value = 'all';
          shipSystemSelect.value = 'all';
          sortSelect.value = 'recent';
          renderList();
        }
      }));
      list.appendChild(empty);
      return;
    }
    for (const record of filtered) {
      list.appendChild(createComponentCard(record, actions));
    }
  };

  for (const control of [search, scopeSelect, typeSelect, statusSelect, sourceSelect, tagSelect, crewSelect, shipSystemSelect, sortSelect]) {
    control.addEventListener?.('input', renderList);
    control.addEventListener?.('change', renderList);
  }
  renderList();
  container.appendChild(consoleSurface);
}
