import { addTooltip, clearElement, createElement } from './runtime-ui-kit.js';
import {
  DIRECTIVE_COMM_BADGE_ICON,
  createPackageImage,
  createPlayerPortraitImage
} from './directive-media.js';
import { activePackageForView } from './current-chat-scope-copy.js';
import { bindPresentationReorderHandle } from './expanded-interface-reorder.js';
import { createPlayerPortraitControls } from './player-portrait-controls.js';

const RANK_PIPS = Object.freeze({
  captain: ['solid', 'solid', 'solid', 'solid'],
  commander: ['solid', 'solid', 'solid'],
  lieutenant_commander: ['solid', 'solid', 'hollow'],
  lieutenant: ['solid', 'solid'],
  lieutenant_junior_grade: ['solid', 'hollow'],
  ensign: ['solid']
});

let selectedPersonId = '';
let categoryOrder = [];
let personOrder = [];
const collapsedCategories = new Set(['Known Contacts']);
const openMobilePeople = new Set();
const explicitlyCollapsedMobilePeopleScopes = new Set();
const customCategories = [];
const personCategoryById = new Map();
let editingCategoryId = '';
let pendingDeleteCategoryId = '';

function asArray(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function compact(value) { return typeof value === 'string' ? value.trim() : ''; }

function personImage(view, person, variant, wrapperClass) {
  if (person?.isPlayer) {
    const character = view?.playerCharacterView || view?.loadedPlayerCharacterView || null;
    const portrait = character?.portrait || view?.campaignState?.player?.portrait || null;
    return createPlayerPortraitImage(portrait, {
      wrapperClass,
      label: person.name,
      iconAsset: DIRECTIVE_COMM_BADGE_ICON,
      loading: variant === 'detail' ? 'eager' : 'lazy'
    });
  }
  const resolvedVariant = variant === 'detail' ? 'card' : variant;
  return createPackageImage(activePackageForView(view), {
    kind: 'crew.portrait',
    subjectId: person.id,
    variant: resolvedVariant
  }, {
    wrapperClass,
    label: person.name,
    loading: variant === 'detail' ? 'eager' : 'lazy'
  });
}

function appendPlayerPortraitControls(container, view, person, actions = {}, extraClassName = '') {
  if (!person?.isPlayer) return;
  const character = view?.playerCharacterView || view?.loadedPlayerCharacterView || null;
  const portrait = character?.portrait || view?.campaignState?.player?.portrait || null;
  const controls = createPlayerPortraitControls({ portrait, view, actions, extraClassName });
  container.append(controls.portraitActions, controls.fileInput);
}

function pipStrip(person, className = '') {
  const service = person.service;
  if (service?.organization !== 'starfleet') return null;
  const strip = createElement('span', `people-pips people-pips-${service.department || 'operations'}${className ? ` ${className}` : ''}`);
  strip.setAttribute('role', 'img');
  strip.setAttribute('aria-label', [service.rankLabel, service.department].filter(Boolean).join(', '));
  asArray(RANK_PIPS[service.rankCode]).forEach((kind) => strip.appendChild(createElement('i', `people-pip people-pip-${kind}`)));
  return strip;
}

function disclosureSvg() {
  const svg = document.createElementNS?.('http://www.w3.org/2000/svg', 'svg') || createElement('svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS?.('http://www.w3.org/2000/svg', 'path') || createElement('path');
  path.setAttribute('d', 'm8 10 4 4 4-4');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

function categoriesFor(people) {
  const labels = people.map((person) => personCategoryById.get(person.id) || compact(person.category) || "Ship's Company");
  customCategories.forEach((category) => labels.push(category.label));
  const unique = [...new Set(labels)];
  categoryOrder = [...categoryOrder.filter((label) => unique.includes(label)), ...unique.filter((label) => !categoryOrder.includes(label))];
  return categoryOrder.map((label) => ({
    id: customCategories.find((category) => category.label === label)?.id || label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label,
    system: !customCategories.some((category) => category.label === label),
    people: personOrderFor(people.filter((person) => (personCategoryById.get(person.id) || compact(person.category) || "Ship's Company") === label))
  }));
}

function categoryIconButton(label, glyph, onClick, danger = false) {
  const button = createElement('button', `collection-icon-button${danger ? ' danger' : ''}`);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  addTooltip(button, label);
  button.textContent = glyph;
  button.addEventListener('click', (event) => { event.stopPropagation(); onClick(event); });
  return button;
}

function addCategory(rerender) {
  const id = `custom-${Date.now()}-${customCategories.length + 1}`;
  customCategories.push({ id, label: 'New Category' });
  editingCategoryId = id;
  pendingDeleteCategoryId = '';
  rerender();
}

function removeCategory(category, people, rerender) {
  if (category.system) return;
  for (const person of people) {
    if (personCategoryById.get(person.id) === category.label) personCategoryById.delete(person.id);
  }
  const index = customCategories.findIndex((entry) => entry.id === category.id);
  if (index >= 0) customCategories.splice(index, 1);
  categoryOrder = categoryOrder.filter((label) => label !== category.label);
  editingCategoryId = '';
  pendingDeleteCategoryId = '';
  rerender();
}

function appendCategoryCopyAndActions(category, categoryCopy, actions, people, rerender) {
  const custom = customCategories.find((entry) => entry.id === category.id);
  if (custom && editingCategoryId === category.id) {
    const input = createElement('input', 'collection-category-input');
    input.value = category.label;
    input.setAttribute('aria-label', 'Category name');
    categoryCopy.appendChild(input);
    const save = () => {
      const next = compact(input.value);
      if (next && next !== custom.label) {
        const previous = custom.label;
        custom.label = next;
        categoryOrder = categoryOrder.map((label) => label === previous ? next : label);
        for (const [personId, label] of personCategoryById) if (label === previous) personCategoryById.set(personId, next);
      }
      editingCategoryId = '';
      rerender();
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') save();
      if (event.key === 'Escape') { editingCategoryId = ''; rerender(); }
    });
    actions.append(
      categoryIconButton('Save category', '✓', save),
      categoryIconButton('Cancel edit', '×', () => { editingCategoryId = ''; rerender(); })
    );
    requestAnimationFrame(() => input.focus());
    return;
  }
  const title = createElement('strong'); title.textContent = category.label;
  const count = createElement('small'); count.textContent = `${category.people.length} ${category.people.length === 1 ? 'person' : 'people'}`;
  categoryCopy.append(title, count);
  if (!custom) return;
  if (pendingDeleteCategoryId === category.id) {
    actions.append(
      categoryIconButton('Confirm remove category', '✓', () => removeCategory(category, people, rerender), true),
      categoryIconButton('Cancel remove', '×', () => { pendingDeleteCategoryId = ''; rerender(); })
    );
  } else {
    actions.append(
      categoryIconButton('Rename category', '✎', () => { editingCategoryId = category.id; pendingDeleteCategoryId = ''; rerender(); }),
      categoryIconButton('Remove category', '×', () => { pendingDeleteCategoryId = category.id; editingCategoryId = ''; rerender(); }, true)
    );
  }
}

function personOrderFor(people) {
  const ids = people.map((person) => person.id);
  personOrder = [...personOrder.filter((id) => people.some((person) => person.id === id)), ...ids.filter((id) => !personOrder.includes(id))];
  return ids.sort((left, right) => personOrder.indexOf(left) - personOrder.indexOf(right)).map((id) => people.find((person) => person.id === id));
}

function moveInOrder(order, id, offset, rerender, focusSelector) {
  const index = order.indexOf(id);
  const next = Math.max(0, Math.min(order.length - 1, index + offset));
  if (index < 0 || index === next) return;
  const [moved] = order.splice(index, 1);
  order.splice(next, 0, moved);
  rerender();
  requestAnimationFrame(() => document.querySelector(focusSelector)?.focus());
}

function handle(label, onMove, className = 'collection-drag-handle', reorder = null) {
  const button = createElement('button', className);
  button.type = 'button';
  button.setAttribute('aria-label', `Reorder ${label}`);
  if (reorder) return bindPresentationReorderHandle(button, reorder);
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    onMove(event.key === 'ArrowUp' ? -1 : 1);
  });
  return button;
}

function personRow(view, person, selected, select) {
  const row = createElement('button', `people-row${selected ? ' active' : ''}`);
  row.type = 'button';
  row.dataset.personId = person.id;
  row.dataset.directiveTour = 'crew.roster-row';
  row.setAttribute('aria-selected', selected ? 'true' : 'false');
  row.appendChild(personImage(view, person, 'card', 'people-row-image'));
  const copy = createElement('span', 'people-row-copy');
  const pips = pipStrip(person);
  if (pips) copy.appendChild(pips);
  const name = createElement('strong');
  name.textContent = person.name;
  const role = createElement('span');
  role.textContent = String(person.role || '').split(/\s*\/\s*/)[0];
  copy.append(name, role);
  row.appendChild(copy);
  row.addEventListener('click', () => select(person.id));
  return row;
}

function detail(view, person, actions = {}) {
  const article = createElement('article', 'people-detail');
  article.setAttribute('aria-label', 'Person details');
  if (!person) return article;
  const portrait = createElement('div', 'people-detail__portrait');
  portrait.appendChild(personImage(view, person, 'detail', 'people-detail-image'));
  appendPlayerPortraitControls(portrait, view, person, actions, 'people-player-portrait-actions');
  const copy = createElement('div', 'people-detail__copy');
  const kicker = createElement('div', 'people-detail__kicker');
  kicker.textContent = [person.category, person.affiliation].filter(Boolean).join(' / ');
  const nameRow = createElement('div', 'people-detail__name-row');
  const name = createElement('h2', 'people-detail__name');
  name.textContent = person.name;
  nameRow.appendChild(name);
  const pips = pipStrip(person, 'people-detail__pips');
  if (pips) nameRow.appendChild(pips);
  const role = createElement('div', 'people-detail__role');
  role.textContent = person.role;
  copy.append(kicker, nameRow, role);

  const involvementData = person.involvement || (person.assignment ? { quest: person.assignment } : null);
  if (involvementData) {
    const section = createElement('section', 'people-detail__section');
    const heading = createElement('h3');
    heading.textContent = 'Current involvement';
    const involvement = createElement('div', 'people-involvement');
    const quest = createElement('div');
    const label = createElement('span', 'people-involvement-label');
    label.textContent = 'Active quest';
    const title = createElement('strong');
    title.textContent = involvementData.quest || involvementData.title || person.assignment;
    quest.append(label, title);
    const involvementCopy = createElement('div', 'people-involvement-copy');
    const objective = createElement('strong');
    objective.textContent = involvementData.objective || '';
    const reason = createElement('span');
    reason.textContent = involvementData.role || involvementData.summary || '';
    involvementCopy.append(objective, reason);
    involvement.append(quest, involvementCopy);
    section.append(heading, involvement);
    copy.appendChild(section);
  }

  if (asArray(person.knownFacts).length) {
    const section = createElement('section', 'people-detail__section');
    const heading = createElement('h3');
    heading.textContent = 'Known information';
    const list = createElement('ul', 'people-list');
    person.knownFacts.forEach((fact) => {
      const item = createElement('li');
      item.textContent = fact;
      list.appendChild(item);
    });
    section.append(heading, list);
    copy.appendChild(section);
  }

  if (person.relationship || person.standing || asArray(person.history).length) {
    const disclosure = createElement('details', 'people-disclosure');
    const summary = createElement('summary');
    summary.textContent = 'Relationship & history';
    disclosure.appendChild(summary);
    if (person.relationship || person.standing) {
      const relationship = createElement('p', 'people-relationship');
      relationship.textContent = person.relationship || person.standing;
      disclosure.appendChild(relationship);
    }
    const history = createElement('div', 'people-history');
    asArray(person.history).forEach((entry) => {
      const item = createElement('div', 'people-history-item');
      const text = createElement('span');
      text.textContent = entry.summary || entry.text || entry;
      item.appendChild(text);
      history.appendChild(item);
    });
    disclosure.appendChild(history);
    copy.appendChild(disclosure);
  }
  article.append(portrait, copy);
  return article;
}

function desktop(view, categories, selected, select, rerender, actions = {}) {
  const allPeople = categories.flatMap((category) => category.people);
  const layout = createElement('section', 'people-layout');
  layout.dataset.directiveTour = 'crew.roster crew.detail';
  const roster = createElement('aside', 'people-roster');
  const toolbar = createElement('div', 'people-collection-toolbar');
  const label = createElement('span');
  label.textContent = 'People';
  const add = createElement('button', 'people-tool-button');
  add.type = 'button';
  add.setAttribute('aria-label', 'Add People category');
  add.textContent = '+';
  add.addEventListener('click', () => addCategory(rerender));
  toolbar.append(label, add);
  roster.appendChild(toolbar);
  const collection = createElement('div', 'category-card-collection');
  categories.forEach((category) => {
    const expanded = !collapsedCategories.has(category.label);
    const section = createElement('section', `collection-category${expanded ? ' is-expanded' : ''}`);
    section.dataset.categoryLabel = category.label;
    const head = createElement('div', 'collection-category-head');
    const disclosure = createElement('button', 'collection-disclosure');
    disclosure.type = 'button';
    disclosure.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    disclosure.appendChild(disclosureSvg());
    disclosure.addEventListener('click', () => {
      if (expanded) collapsedCategories.add(category.label); else collapsedCategories.delete(category.label);
      rerender();
    });
    const categoryCopy = createElement('span', 'collection-category-copy');
    const actions = createElement('span', 'collection-category-actions');
    appendCategoryCopyAndActions(category, categoryCopy, actions, allPeople, rerender);
    head.append(disclosure, categoryCopy, actions, handle(category.label, null, 'collection-drag-handle', {
      itemSelector: '.collection-category', listSelector: '.category-card-collection', idAttribute: 'data-category-label', order: () => [...categoryOrder],
      onCommit: (next) => { categoryOrder = next; rerender(); }
    }));
    section.appendChild(head);
    const body = createElement('div', 'collection-category-body');
    body.hidden = !expanded;
    category.people.forEach((person) => {
      const wrapper = createElement('div', 'collection-person-row');
      wrapper.dataset.personId = person.id;
      wrapper.append(personRow(view, person, person.id === selected?.id, select), handle(person.name, null, 'collection-drag-handle', {
        itemSelector: '.collection-person-row', listSelector: '.collection-category-body', idAttribute: 'data-person-id', order: () => category.people.map((entry) => entry.id),
        previewClass: 'people-drag-ghost',
        onCommit: (next) => { personOrder = [...next, ...personOrder.filter((id) => !next.includes(id))]; rerender(); }
      }));
      body.appendChild(wrapper);
    });
    section.appendChild(body);
    collection.appendChild(section);
  });
  const contactsExpanded = !collapsedCategories.has('Known Contacts');
  const contacts = createElement('section', `collection-category${contactsExpanded ? ' is-expanded' : ''}`);
  contacts.dataset.categoryLabel = 'Known Contacts';
  const contactsHead = createElement('div', 'collection-category-head');
  const contactsDisclosure = createElement('button', 'collection-disclosure');
  contactsDisclosure.type = 'button';
  contactsDisclosure.appendChild(disclosureSvg());
  contactsDisclosure.setAttribute('aria-expanded', contactsExpanded ? 'true' : 'false');
  contactsDisclosure.setAttribute('aria-label', `${contactsExpanded ? 'Collapse' : 'Expand'} Known Contacts`);
  contactsDisclosure.addEventListener('click', () => {
    if (contactsExpanded) collapsedCategories.add('Known Contacts'); else collapsedCategories.delete('Known Contacts');
    rerender();
  });
  const contactsCopy = createElement('span', 'collection-category-copy');
  const contactsTitle = createElement('strong'); contactsTitle.textContent = 'Known Contacts';
  const contactsCount = createElement('small'); contactsCount.textContent = '0 people';
  contactsCopy.append(contactsTitle, contactsCount);
  const contactsActions = createElement('span', 'collection-category-actions');
  contactsHead.append(contactsDisclosure, contactsCopy, contactsActions, handle('Known Contacts', null, 'collection-drag-handle', {
    itemSelector: '.collection-category', listSelector: '.category-card-collection', idAttribute: 'data-category-label', order: () => [...categoryOrder, 'Known Contacts'],
    onCommit: (next) => { categoryOrder = next.filter((label) => label !== 'Known Contacts'); rerender(); }
  }));
  const contactsBody = createElement('div', 'collection-category-body');
  contactsBody.hidden = !contactsExpanded;
  const contactsEmpty = createElement('div', 'collection-empty');
  contactsEmpty.textContent = 'New external contacts will appear here.';
  contactsBody.appendChild(contactsEmpty);
  contacts.append(contactsHead, contactsBody);
  collection.appendChild(contacts);
  roster.appendChild(collection);
  layout.append(roster, detail(view, selected, actions));
  return layout;
}

function appendMobilePersonDetail(container, view, person, actions = {}) {
  container.appendChild(personImage(view, person, 'card', 'mobile-crew-detail-image'));
  appendPlayerPortraitControls(container, view, person, actions, 'people-player-portrait-actions people-player-portrait-actions-mobile');
  const kicker = createElement('div', 'mobile-detail-kicker');
  kicker.textContent = [person.category, person.affiliation].filter(Boolean).join(' / ');
  container.appendChild(kicker);

  const involvementData = person.involvement || (person.assignment ? { quest: person.assignment } : null);
  if (involvementData) {
    const section = createElement('section', 'people-detail__section');
    const heading = createElement('h3');
    heading.textContent = 'Current involvement';
    const involvement = createElement('div', 'people-involvement');
    const quest = createElement('div');
    const label = createElement('span', 'people-involvement-label');
    label.textContent = 'Active quest';
    const title = createElement('strong');
    title.textContent = involvementData.quest || involvementData.title || person.assignment;
    quest.append(label, title);
    const involvementCopy = createElement('div', 'people-involvement-copy');
    const objective = createElement('strong');
    objective.textContent = involvementData.objective || '';
    const reason = createElement('span');
    reason.textContent = involvementData.role || involvementData.summary || '';
    involvementCopy.append(objective, reason);
    involvement.append(quest, involvementCopy);
    section.append(heading, involvement);
    container.appendChild(section);
  }

  if (asArray(person.knownFacts).length) {
    const section = createElement('section', 'people-detail__section');
    const heading = createElement('h3');
    heading.textContent = 'Known information';
    const list = createElement('ul', 'people-list');
    person.knownFacts.forEach((fact) => {
      const item = createElement('li');
      item.textContent = fact;
      list.appendChild(item);
    });
    section.append(heading, list);
    container.appendChild(section);
  }

  if (person.relationship || person.standing || asArray(person.history).length) {
    const disclosure = createElement('details', 'people-disclosure');
    const summary = createElement('summary');
    summary.textContent = 'Relationship & history';
    disclosure.appendChild(summary);
    if (person.relationship || person.standing) {
      const relationship = createElement('p', 'people-relationship');
      relationship.textContent = person.relationship || person.standing;
      disclosure.appendChild(relationship);
    }
    const history = createElement('div', 'people-history');
    asArray(person.history).forEach((entry) => {
      const item = createElement('div', 'people-history-item');
      const text = createElement('span');
      text.textContent = entry.summary || entry.text || entry;
      item.appendChild(text);
      history.appendChild(item);
    });
    disclosure.appendChild(history);
    container.appendChild(disclosure);
  }
}

function mobile(view, categories, rerender, actions = {}) {
  const allPeople = categories.flatMap((category) => category.people);
  const route = createElement('section', 'mobile-crew-accordion');
  route.setAttribute('aria-label', 'Known people');
  const toolbar = createElement('div', 'people-collection-toolbar');
  const toolbarLabel = createElement('span');
  toolbarLabel.textContent = `People \u00b7 ${categories.reduce((sum, category) => sum + category.people.length, 0)} known`;
  const add = createElement('button', 'people-tool-button');
  add.type = 'button'; add.setAttribute('aria-label', 'Add People category'); add.textContent = '+';
  add.addEventListener('click', () => addCategory(rerender));
  toolbar.append(toolbarLabel, add);
  route.appendChild(toolbar);
  const people = categories.flatMap((category) => category.people);
  const scopeId = compact(view?.campaignState?.campaign?.id)
    || compact(view?.campaignId)
    || people.map((person) => person.id).sort().join('|');
  const currentPersonIds = new Set(people.map((person) => person.id));
  for (const personId of openMobilePeople) {
    if (!currentPersonIds.has(personId)) openMobilePeople.delete(personId);
  }
  if (people[0] && scopeId && !people.some((person) => openMobilePeople.has(person.id)) && !explicitlyCollapsedMobilePeopleScopes.has(scopeId)) {
    openMobilePeople.add(people[0].id);
  }
  categories.forEach((category) => {
    const expanded = !collapsedCategories.has(category.label);
    const categorySection = createElement('section', `collection-category mobile-people-category${expanded ? ' is-expanded' : ''}`);
    categorySection.dataset.categoryLabel = category.label;
    const group = createElement('div', 'collection-category-head');
    const disclosure = createElement('button', 'collection-disclosure');
    disclosure.type = 'button';
    disclosure.appendChild(disclosureSvg());
    disclosure.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    disclosure.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${category.label}`);
    disclosure.addEventListener('click', () => {
      if (expanded) collapsedCategories.add(category.label); else collapsedCategories.delete(category.label);
      rerender();
    });
    const categoryCopy = createElement('span', 'collection-category-copy');
    const categoryActions = createElement('span', 'collection-category-actions');
    appendCategoryCopyAndActions(category, categoryCopy, categoryActions, allPeople, rerender);
    group.append(disclosure, categoryCopy, categoryActions, handle(category.label, null, 'collection-drag-handle', {
      itemSelector: '.mobile-people-category', listSelector: '.mobile-crew-accordion', idAttribute: 'data-category-label', order: () => [...categoryOrder], onCommit: (next) => { categoryOrder = next.filter((label) => label !== 'Known Contacts'); rerender(); }
    }));
    categorySection.appendChild(group);
    const categoryBody = createElement('div', 'collection-category-body');
    categoryBody.hidden = !expanded;
    category.people.forEach((person) => {
      const open = openMobilePeople.has(person.id);
      const item = createElement('article', `collection-person-row mobile-accordion-item mobile-crew-item${open ? ' is-open' : ''}`);
      item.dataset.personId = person.id;
      const head = createElement('div', 'mobile-accordion-head');
      head.appendChild(personImage(view, person, 'card', 'mobile-crew-avatar'));
      const toggle = createElement('button', 'mobile-accordion-toggle');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      const copy = createElement('span', 'mobile-accordion-copy');
      const pips = pipStrip(person);
      if (pips) copy.appendChild(pips);
      const name = createElement('strong'); name.textContent = person.name;
      const role = createElement('small'); role.textContent = String(person.role || '').split(/\s*\/\s*/)[0];
      copy.append(name, role);
      const chevron = createElement('span', 'mobile-accordion-chevron'); chevron.appendChild(disclosureSvg());
      toggle.append(copy, chevron);
      toggle.addEventListener('click', () => {
        if (open) {
          openMobilePeople.delete(person.id);
          if (!people.some((entry) => openMobilePeople.has(entry.id))) explicitlyCollapsedMobilePeopleScopes.add(scopeId);
        } else {
          openMobilePeople.clear();
          openMobilePeople.add(person.id);
          explicitlyCollapsedMobilePeopleScopes.delete(scopeId);
        }
        selectedPersonId = person.id;
        rerender();
      });
      head.append(toggle, handle(person.name, null, 'collection-drag-handle', {
        itemSelector: '.mobile-crew-item', listSelector: '.collection-category-body', idAttribute: 'data-person-id', order: () => category.people.map((entry) => entry.id),
        previewSelector: '.mobile-accordion-head', previewClass: 'people-drag-ghost',
        onCommit: (next) => { personOrder = [...next, ...personOrder.filter((id) => !next.includes(id))]; rerender(); }
      }));
      item.appendChild(head);
      const mobileDetail = createElement('div', 'mobile-accordion-detail');
      mobileDetail.hidden = !open;
      appendMobilePersonDetail(mobileDetail, view, person, actions);
      item.appendChild(mobileDetail);
      categoryBody.appendChild(item);
    });
    categorySection.appendChild(categoryBody);
    route.appendChild(categorySection);
  });
  const contactsExpanded = !collapsedCategories.has('Known Contacts');
  const contacts = createElement('section', `collection-category mobile-people-category${contactsExpanded ? ' is-expanded' : ''}`);
  const contactsHead = createElement('div', 'collection-category-head');
  const contactsDisclosure = createElement('button', 'collection-disclosure');
  contactsDisclosure.type = 'button'; contactsDisclosure.appendChild(disclosureSvg()); contactsDisclosure.setAttribute('aria-expanded', contactsExpanded ? 'true' : 'false');
  contactsDisclosure.setAttribute('aria-label', `${contactsExpanded ? 'Collapse' : 'Expand'} Known Contacts`);
  contactsDisclosure.addEventListener('click', () => {
    if (contactsExpanded) collapsedCategories.add('Known Contacts'); else collapsedCategories.delete('Known Contacts');
    rerender();
  });
  const contactsCopy = createElement('span', 'collection-category-copy');
  const contactsTitle = createElement('strong'); contactsTitle.textContent = 'Known Contacts';
  const contactsCount = createElement('small'); contactsCount.textContent = '0 people';
  contactsCopy.append(contactsTitle, contactsCount);
  contactsHead.append(contactsDisclosure, contactsCopy, createElement('span', 'collection-category-actions'), handle('Known Contacts', () => {}));
  const contactsBody = createElement('div', 'collection-category-body');
  contactsBody.hidden = !contactsExpanded;
  const contactsEmpty = createElement('div', 'collection-empty');
  contactsEmpty.textContent = 'New external contacts will appear here.';
  contactsBody.appendChild(contactsEmpty);
  contacts.append(contactsHead, contactsBody);
  route.appendChild(contacts);
  return route;
}

export function renderPeopleJournal(body, information = {}, view = {}, actions = {}) {
  const host = createElement('div', 'directive-people-journal-host');
  const rerender = () => {
    clearElement(host);
    const people = asArray(information.crew);
    if (!selectedPersonId || !people.some((person) => person.id === selectedPersonId)) {
      selectedPersonId = people.find((person) => !person.isPlayer)?.id || people[0]?.id || '';
    }
    const selected = people.find((person) => person.id === selectedPersonId) || null;
    const categories = categoriesFor(people);
    host.append(
      desktop(view, categories, selected, (id) => { selectedPersonId = id; rerender(); }, rerender, actions),
      mobile(view, categories, rerender, actions)
    );
  };
  rerender();
  body.appendChild(host);
}
