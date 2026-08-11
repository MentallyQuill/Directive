import { createElement } from './runtime-ui-kit.js';
import { createPackageImage, createPlayerPortraitImage } from './directive-media.js';
import { bindPresentationReorderHandle } from './expanded-interface-reorder.js';
import { createPeopleCollectionPreferences } from './people-collection-preferences.js';

const RANK_PIPS = Object.freeze({
  captain: ['solid', 'solid', 'solid', 'solid'],
  commander: ['solid', 'solid', 'solid'],
  lieutenant_commander: ['solid', 'solid', 'hollow'],
  lieutenant: ['solid', 'solid'],
  lieutenant_junior_grade: ['solid', 'hollow'],
  ensign: ['solid']
});

const DIVISION_BY_DEPARTMENT = Object.freeze({
  command: 'command', flight: 'command',
  tactical: 'operations', security: 'operations', operations: 'operations', engineering: 'operations',
  science: 'science', medical: 'science'
});

let editingCategoryId = '';
let pendingDeleteCategoryId = '';
const openMobilePersonByScope = new Map();
const controllerByScope = new Map();

export function resetPeopleJournalState() {
  editingCategoryId = '';
  pendingDeleteCategoryId = '';
}

function recordById(model, id) {
  return model.records.find((record) => record.id === id) || null;
}

function portrait(model, person, variant, wrapperClass) {
  if (person.isPlayer) {
    return createPlayerPortraitImage(person.portrait, {
      wrapperClass,
      label: person.name,
      loading: variant === 'detail' ? 'eager' : 'lazy'
    });
  }
  return createPackageImage(model.packageData, {
    kind: person.portrait?.kind || 'crew.portrait.formal',
    subjectId: person.portrait?.subjectId || person.id,
    variant
  }, {
    wrapperClass,
    label: person.name,
    loading: variant === 'detail' ? 'eager' : 'lazy'
  });
}

function pipStrip(person, className = '') {
  const service = person.service;
  if (service?.organization !== 'starfleet') return null;
  const division = DIVISION_BY_DEPARTMENT[service.department] || 'operations';
  const strip = createElement('span', `people-pips people-pips-${division}${className ? ` ${className}` : ''}`);
  strip.setAttribute('role', 'img');
  strip.setAttribute('aria-label', [service.rankLabel, service.department].filter(Boolean).join(', '));
  for (const kind of RANK_PIPS[service.rankCode] || []) strip.appendChild(createElement('i', `people-pip people-pip-${kind}`));
  return strip;
}

function iconButton(label, glyph, onClick, className = '') {
  const button = createElement('button', `collection-icon-button${className ? ` ${className}` : ''}`);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.textContent = glyph;
  button.addEventListener('click', (event) => {
    event.stopPropagation?.();
    onClick();
  });
  return button;
}

function reorderHandle(label, options) {
  const handle = createElement('button', 'collection-drag-handle');
  handle.type = 'button';
  handle.setAttribute('aria-label', `Reorder ${label}`);
  return bindPresentationReorderHandle(handle, options);
}

function focusPersonHandle(personId) {
  const escaped = globalThis.CSS?.escape?.(personId) || personId.replace(/["\\]/g, '\\$&');
  globalThis.requestAnimationFrame?.(() => {
    const handles = [...(globalThis.document?.querySelectorAll?.(`.collection-person-row[data-person-id="${escaped}"] .collection-drag-handle`) || [])];
    (handles.find((candidate) => candidate.getClientRects().length > 0) || handles[0])?.focus();
  });
}

function focusCategoryHandle(categoryId) {
  const escaped = globalThis.CSS?.escape?.(categoryId) || categoryId.replace(/["\\]/g, '\\$&');
  globalThis.requestAnimationFrame?.(() => {
    const handles = [...(globalThis.document?.querySelectorAll?.(`.collection-category[data-category-id="${escaped}"] > .collection-category-head > .collection-drag-handle`) || [])];
    (handles.find((candidate) => candidate.getClientRects().length > 0) || handles[0])?.focus();
  });
}

function personReorderHandle(person, category, controller, rerender, options = {}) {
  const handle = reorderHandle(person.name, {
    ...options,
    itemSelector: '.collection-person-row',
    listSelector: '.collection-person-list',
    idAttribute: 'data-person-id',
    order: () => controller.snapshot().categories.find(({ id }) => id === category.id)?.recordIds || [],
    onCommit: (ids) => {
      ids.forEach((id, index) => controller.moveRecord(id, category.id, index));
      rerender();
      focusPersonHandle(person.id);
    },
    dropListSelector: '.collection-person-list',
    dropZoneSelector: '.collection-category',
    deferredDrop: true,
    dropRootSelector: '.people-journal-host',
    dropBeforeClass: 'is-drop-before',
    dropTargetClass: 'is-drop-target',
    keyboard: false,
    onDrop: ({ id, toList, toIndex }) => {
      controller.moveRecord(id, toList.dataset.categoryId, toIndex);
      rerender();
      focusPersonHandle(id);
    }
  });
  handle.classList.add('collection-person-drag-handle');
  handle.addEventListener('keydown', (event) => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const snapshot = controller.snapshot();
    const categoryIndex = snapshot.categories.findIndex(({ recordIds }) => recordIds.includes(person.id));
    const recordIndex = snapshot.categories[categoryIndex]?.recordIds.indexOf(person.id) ?? -1;
    if (categoryIndex < 0 || recordIndex < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const offset = event.key === 'ArrowUp' ? -1 : 1;
    const targetIndex = recordIndex + offset;
    if (targetIndex >= 0 && targetIndex < snapshot.categories[categoryIndex].recordIds.length) {
      controller.moveRecord(person.id, snapshot.categories[categoryIndex].id, targetIndex);
    } else {
      const adjacent = snapshot.categories[categoryIndex + offset];
      if (!adjacent) return;
      if (snapshot.collapsedCategoryIds.includes(adjacent.id)) controller.toggleCategory(adjacent.id);
      controller.moveRecord(person.id, adjacent.id, event.key === 'ArrowUp' ? adjacent.recordIds.length : 0);
    }
    rerender();
    focusPersonHandle(person.id);
  });
  return handle;
}

function applyCategoryOrder(controller, ids) {
  ids.forEach((id, index) => controller.moveCategory(id, index));
}

function appendCategoryIdentity(head, category, controller, rerender) {
  const disclosure = createElement('button', 'collection-disclosure');
  disclosure.type = 'button';
  const collapsed = controller.snapshot().collapsedCategoryIds.includes(category.id);
  disclosure.textContent = '›';
  disclosure.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  disclosure.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} ${category.label}`);
  disclosure.addEventListener('click', () => { controller.toggleCategory(category.id); rerender(); });

  const copy = createElement('span', 'collection-category-copy');
  const actions = createElement('span', 'collection-category-actions');
  if (!category.system && editingCategoryId === category.id) {
    const input = createElement('input', 'collection-category-input');
    input.value = category.label;
    input.setAttribute('aria-label', 'Category name');
    const save = () => {
      controller.renameCategory(category.id, input.value);
      editingCategoryId = '';
      rerender();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') save();
      if (event.key === 'Escape') { editingCategoryId = ''; rerender(); }
    });
    copy.appendChild(input);
    actions.append(
      iconButton('Save category', '✓', save),
      iconButton('Cancel edit', '×', () => { editingCategoryId = ''; rerender(); })
    );
    globalThis.requestAnimationFrame?.(() => input.focus?.());
  } else {
    const title = createElement('strong');
    title.textContent = category.label;
    const count = createElement('small');
    count.textContent = `${category.recordIds.length} ${category.recordIds.length === 1 ? 'person' : 'people'}`;
    copy.append(title, count);
    if (!category.system) {
      if (pendingDeleteCategoryId === category.id) {
        actions.append(
          iconButton('Confirm remove category', '✓', () => {
            controller.removeCategory(category.id);
            pendingDeleteCategoryId = '';
            rerender();
          }, 'danger'),
          iconButton('Cancel remove', '×', () => { pendingDeleteCategoryId = ''; rerender(); })
        );
      } else {
        actions.append(
          iconButton('Rename category', '✎', () => { editingCategoryId = category.id; rerender(); }),
          iconButton('Remove category', '×', () => { pendingDeleteCategoryId = category.id; rerender(); }, 'danger')
        );
      }
    }
  }
  head.append(disclosure, copy, actions);
}

function createRecordCopy(person) {
  const copy = createElement('span', 'people-row-copy');
  const pips = pipStrip(person);
  if (pips) copy.appendChild(pips);
  const name = createElement('strong');
  name.textContent = person.name;
  const billet = createElement('span', 'people-row-billet');
  billet.textContent = person.billet || person.role || '';
  copy.append(name, billet);
  return copy;
}

function createDesktopRecord(model, person, category, controller, rerender, selectionState) {
  const row = createElement('article', `collection-person-row${controller.snapshot().selectedPersonId === person.id ? ' active' : ''}`);
  row.dataset.personId = person.id;
  const select = createElement('button', 'people-row');
  select.type = 'button';
  select.dataset.personId = person.id;
  select.setAttribute('aria-pressed', controller.snapshot().selectedPersonId === person.id ? 'true' : 'false');
  select.append(portrait(model, person, 'thumb', 'people-row-image'), createRecordCopy(person));
  select.addEventListener('click', () => { controller.select(person.id); rerender(); });
  const handle = personReorderHandle(person, category, controller, rerender, {
    previewClass: 'people-drag-ghost'
  });
  row.append(select, handle);
  selectionState?.records.set(person.id, { row, select });
  return row;
}

function createCategory(model, category, controller, rerender, mobile = false, renderState = {}) {
  const section = createElement('section', `collection-category${mobile ? ' mobile-people-category' : ''}`);
  section.dataset.categoryId = category.id;
  const head = createElement('header', 'collection-category-head');
  appendCategoryIdentity(head, category, controller, rerender);
  head.appendChild(reorderHandle(category.label, {
    itemSelector: '.collection-category',
    listSelector: mobile ? '.mobile-crew-accordion' : '.people-category-list',
    idAttribute: 'data-category-id',
    order: () => controller.snapshot().categories.map(({ id }) => id),
    onCommit: (ids) => {
      applyCategoryOrder(controller, ids);
      rerender();
      focusCategoryHandle(category.id);
    },
    previewSelector: '.collection-category-head',
    previewClass: 'people-category-drag-ghost'
  }));
  section.appendChild(head);
  if (controller.snapshot().collapsedCategoryIds.includes(category.id)) return section;

  const list = createElement('div', mobile ? 'mobile-people-list collection-person-list' : 'collection-person-list');
  list.dataset.categoryId = category.id;
  for (const personId of category.recordIds) {
    const person = recordById(model, personId);
    if (!person) continue;
    list.appendChild(mobile
      ? createMobileRecord(model, person, category, controller, rerender, renderState.mobile)
      : createDesktopRecord(model, person, category, controller, rerender, renderState.desktop));
  }
  section.appendChild(list);
  return section;
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

export function createPeopleDetail(model, record, { mobile = false } = {}) {
  const detail = createElement('section', `people-detail${mobile ? ' people-detail-mobile' : ''}`);
  if (!mobile) detail.dataset.directiveScrollOwner = 'true';
  if (!record) return detail;
  detail.dataset.personId = record.id;
  const hero = createElement('header', 'people-detail-hero');
  hero.appendChild(portrait(model, record, 'detail', 'people-detail-portrait'));
  const identity = createElement('div', 'people-detail-identity');
  const kicker = createElement('span');
  kicker.textContent = record.isPlayer ? 'Your commander' : 'Personnel record';
  const nameLine = createElement('div', 'people-detail-name-line');
  const name = createElement('h2');
  name.textContent = record.name;
  nameLine.appendChild(name);
  const pips = pipStrip(record, 'people-pips-detail');
  if (pips) nameLine.appendChild(pips);
  const billet = createElement('strong');
  billet.textContent = [record.rank, record.billet || record.role].filter(Boolean).join(' / ');
  identity.append(kicker, nameLine, billet);
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
    const block = createElement('section', 'people-detail-block');
    const heading = createElement('h3');
    heading.textContent = 'Defining moments';
    const list = createElement('ul');
    record.moments.forEach((moment) => {
      const item = createElement('li');
      item.textContent = moment.summary;
      list.appendChild(item);
    });
    block.append(heading, list);
    detail.appendChild(block);
  }
  return detail;
}

function createMobileRecord(model, person, category, controller, rerender, disclosureState) {
  const openId = openMobilePersonByScope.has(model.scopeKey)
    ? openMobilePersonByScope.get(model.scopeKey)
    : controller.snapshot().selectedPersonId;
  const open = openId === person.id;
  const item = createElement('article', `mobile-accordion-item mobile-crew-item collection-person-row${open ? ' is-open' : ''}`);
  item.dataset.personId = person.id;
  const head = createElement('div', 'mobile-accordion-head');
  head.appendChild(portrait(model, person, 'thumb', 'mobile-crew-avatar'));
  const toggle = createElement('button', 'mobile-accordion-toggle');
  toggle.type = 'button';
  toggle.dataset.personId = person.id;
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  const chevron = createElement('span', 'mobile-accordion-chevron');
  chevron.textContent = '›';
  toggle.append(createRecordCopy(person), chevron);
  head.append(toggle, personReorderHandle(person, category, controller, rerender, {
    previewSelector: '.mobile-accordion-head',
    previewClass: 'people-drag-ghost'
  }));
  item.appendChild(head);
  let mobileDetail = null;
  const setExpanded = (expanded) => {
    item.classList.toggle('is-open', expanded);
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (expanded && !mobileDetail) {
      mobileDetail = createElement('div', 'mobile-accordion-detail');
      mobileDetail.appendChild(createPeopleDetail(model, person, { mobile: true }));
      item.appendChild(mobileDetail);
    } else if (!expanded && mobileDetail) {
      mobileDetail.remove();
      mobileDetail = null;
    }
  };
  const disclosure = { item, setExpanded };
  toggle.addEventListener('click', () => {
    const expanding = !item.classList.contains('is-open');
    if (expanding && disclosureState?.openRecord && disclosureState.openRecord !== disclosure) {
      disclosureState.openRecord.setExpanded(false);
    }
    setExpanded(expanding);
    if (disclosureState) disclosureState.openRecord = expanding ? disclosure : null;
    openMobilePersonByScope.set(model.scopeKey, expanding ? person.id : '');
    controller.select(person.id);
    disclosureState?.select(person);
  });
  if (open) {
    setExpanded(true);
    if (disclosureState) disclosureState.openRecord = disclosure;
  }
  return item;
}

function createToolbar(controller, rerender) {
  const toolbar = createElement('div', 'people-collection-toolbar');
  const label = createElement('strong');
  label.textContent = 'Personnel records';
  const add = createElement('button', 'people-add-category');
  add.type = 'button';
  add.textContent = '+ Category';
  add.addEventListener('click', () => {
    const before = new Set(controller.snapshot().categories.map(({ id }) => id));
    const next = controller.addCategory('New Category');
    editingCategoryId = next.categories.find(({ id }) => !before.has(id))?.id || '';
    rerender();
  });
  toolbar.append(label, add);
  return toolbar;
}

export function createPeopleJournal(model, rerender, { storage = globalThis.localStorage } = {}) {
  let controller = controllerByScope.get(model.scopeKey);
  if (!controller) {
    controller = createPeopleCollectionPreferences({
      scopeKey: model.scopeKey,
      records: model.records,
      storage
    });
    controllerByScope.set(model.scopeKey, controller);
  } else {
    controller.reconcile(model.records);
  }
  const snapshot = controller.snapshot();
  const selected = recordById(model, snapshot.selectedPersonId);
  const host = createElement('div', 'people-journal-host');
  host.dataset.directiveScrollOwner = 'true';

  const desktop = createElement('div', 'people-layout people-journal people-desktop-journal');
  const roster = createElement('aside', 'people-roster');
  roster.appendChild(createToolbar(controller, rerender));
  const categories = createElement('div', 'people-category-list');
  categories.dataset.directiveScrollOwner = 'true';
  const desktopSelection = { records: new Map(), detail: null };
  for (const category of snapshot.categories) {
    categories.appendChild(createCategory(model, category, controller, rerender, false, { desktop: desktopSelection }));
  }
  roster.appendChild(categories);
  desktopSelection.detail = createPeopleDetail(model, selected);
  desktop.append(roster, desktopSelection.detail);

  const mobileDisclosure = {
    openRecord: null,
    select(person) {
      for (const [personId, record] of desktopSelection.records) {
        const active = personId === person.id;
        record.row.classList.toggle('active', active);
        record.select.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
      const nextDetail = createPeopleDetail(model, person);
      desktopSelection.detail.parentNode?.replaceChild(nextDetail, desktopSelection.detail);
      desktopSelection.detail = nextDetail;
    }
  };

  const mobile = createElement('div', 'mobile-crew-accordion');
  mobile.appendChild(createToolbar(controller, rerender));
  for (const category of snapshot.categories) {
    mobile.appendChild(createCategory(model, category, controller, rerender, true, { mobile: mobileDisclosure }));
  }
  host.append(desktop, mobile);
  return host;
}
