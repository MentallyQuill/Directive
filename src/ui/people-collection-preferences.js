export const PEOPLE_PREFERENCES_STORAGE_PREFIX = 'directive.people.preferences.v1:';

export const PEOPLE_SYSTEM_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'ships-company', label: "Ship's Company" }),
  Object.freeze({ id: 'starfleet-federation', label: 'Starfleet and Federation' }),
  Object.freeze({ id: 'local-authorities', label: 'Local Authorities' }),
  Object.freeze({ id: 'allies-contacts', label: 'Allies and Contacts' }),
  Object.freeze({ id: 'adversaries-interest', label: 'Adversaries and Persons of Interest' }),
  Object.freeze({ id: 'unknown-unsorted', label: 'Unknown or Unsorted' })
]);

const SYSTEM_BY_ID = new Map(PEOPLE_SYSTEM_CATEGORIES.map((category) => [category.id, category]));
let fallbackId = 0;

function compact(value) {
  return String(value || '').trim();
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(compact).filter(Boolean))];
}

function copyState(state) {
  return {
    selectedPersonId: state.selectedPersonId,
    collapsedCategoryIds: [...state.collapsedCategoryIds],
    categories: state.categories.map((category) => ({
      id: category.id,
      label: category.label,
      system: category.system,
      recordIds: [...category.recordIds]
    }))
  };
}

function read(storage, key) {
  try {
    const value = storage?.getItem?.(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function write(storage, key, state) {
  try {
    storage?.setItem?.(key, JSON.stringify(state));
  } catch {
    // Presentation preferences must never block the authoritative People view.
  }
}

function customId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return `custom-${globalThis.crypto.randomUUID()}`;
  } catch {
    // Use the deterministic local fallback below.
  }
  fallbackId += 1;
  return `custom-${Date.now()}-${fallbackId}`;
}

function categoryFor(id, source = {}) {
  const system = SYSTEM_BY_ID.get(id);
  if (system) return { ...system, system: true, recordIds: [] };
  return {
    id,
    label: compact(source.label) || 'New Category',
    system: false,
    recordIds: []
  };
}

function reconcile(source, records) {
  const validRecords = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const id = compact(record?.id);
    if (id && !validRecords.has(id)) validRecords.set(id, record);
  }

  const categories = [];
  const categoryIds = new Set();
  const placed = new Set();
  for (const candidate of Array.isArray(source?.categories) ? source.categories : []) {
    const id = compact(candidate?.id);
    if (!id || categoryIds.has(id) || (!SYSTEM_BY_ID.has(id) && candidate?.system === true)) continue;
    const category = categoryFor(id, candidate);
    category.recordIds = unique(candidate?.recordIds).filter((recordId) => validRecords.has(recordId) && !placed.has(recordId));
    category.recordIds.forEach((recordId) => placed.add(recordId));
    categoryIds.add(id);
    categories.push(category);
  }

  const ensureCategory = (id) => {
    const normalized = SYSTEM_BY_ID.has(id) ? id : 'unknown-unsorted';
    let category = categories.find((entry) => entry.id === normalized);
    if (!category) {
      category = categoryFor(normalized);
      categories.push(category);
      categoryIds.add(normalized);
    }
    return category;
  };

  for (const [recordId, record] of validRecords) {
    if (placed.has(recordId)) continue;
    ensureCategory(compact(record.categoryId) || 'unknown-unsorted').recordIds.push(recordId);
    placed.add(recordId);
  }

  const nonEmptyOrCustom = categories.filter((category) => !category.system || category.recordIds.length > 0);
  const selected = compact(source?.selectedPersonId);
  const firstRecordId = nonEmptyOrCustom.flatMap((category) => category.recordIds)[0] || '';
  const existingIds = new Set(nonEmptyOrCustom.map((category) => category.id));
  return {
    selectedPersonId: validRecords.has(selected) ? selected : firstRecordId,
    collapsedCategoryIds: unique(source?.collapsedCategoryIds).filter((id) => existingIds.has(id)),
    categories: nonEmptyOrCustom
  };
}

export function peoplePreferenceScopeKey(view = {}, projection = {}) {
  const campaignId = compact(view?.campaignState?.campaign?.id)
    || compact(view?.campaignState?.id)
    || compact(view?.campaignIndex?.selectedCampaignId)
    || 'campaign';
  const branchId = compact(projection?.branchId)
    || compact(view?.activeSaveId)
    || compact(view?.campaignState?.campaignChatBinding?.saveId)
    || 'main';
  return `${campaignId}:${branchId}`;
}

export function createPeopleCollectionPreferences({
  scopeKey,
  records = [],
  storage = globalThis.localStorage,
  onChange = null
} = {}) {
  const key = `${PEOPLE_PREFERENCES_STORAGE_PREFIX}${encodeURIComponent(compact(scopeKey) || 'default')}`;
  let state = reconcile(read(storage, key), records);

  const persist = (detail = null) => {
    const snapshot = copyState(state);
    write(storage, key, snapshot);
    if (detail) onChange?.(snapshot, detail);
    return snapshot;
  };
  persist();

  const categoryIndex = (id) => state.categories.findIndex((category) => category.id === compact(id));
  const recordLocation = (id) => {
    const recordId = compact(id);
    for (let index = 0; index < state.categories.length; index += 1) {
      const recordIndex = state.categories[index].recordIds.indexOf(recordId);
      if (recordIndex >= 0) return { recordId, categoryIndex: index, recordIndex };
    }
    return null;
  };

  return {
    snapshot: () => copyState(state),
    reconcile(nextRecords = []) {
      state = reconcile(state, nextRecords);
      return persist({ kind: 'reconcile' });
    },
    select(id) {
      const located = recordLocation(id);
      if (!located || state.selectedPersonId === located.recordId) return copyState(state);
      state.selectedPersonId = located.recordId;
      return persist({ kind: 'selection', personId: located.recordId });
    },
    toggleCategory(id) {
      const categoryId = compact(id);
      if (categoryIndex(categoryId) < 0) return copyState(state);
      const collapsed = new Set(state.collapsedCategoryIds);
      if (collapsed.has(categoryId)) collapsed.delete(categoryId); else collapsed.add(categoryId);
      state.collapsedCategoryIds = [...collapsed];
      return persist({ kind: 'collapse', categoryId, collapsed: collapsed.has(categoryId) });
    },
    addCategory(label = 'New Category') {
      const category = { id: customId(), label: compact(label) || 'New Category', system: false, recordIds: [] };
      state.categories.push(category);
      return persist({ kind: 'category-add', categoryId: category.id });
    },
    renameCategory(id, label) {
      const index = categoryIndex(id);
      const nextLabel = compact(label);
      if (index < 0 || state.categories[index].system || !nextLabel) return copyState(state);
      state.categories[index].label = nextLabel;
      return persist({ kind: 'category-rename', categoryId: state.categories[index].id });
    },
    removeCategory(id) {
      const index = categoryIndex(id);
      if (index < 0 || state.categories[index].system) return copyState(state);
      const [removed] = state.categories.splice(index, 1);
      let fallback = state.categories.find((category) => category.id === 'unknown-unsorted');
      if (!fallback) {
        fallback = categoryFor('unknown-unsorted');
        state.categories.push(fallback);
      }
      fallback.recordIds.push(...removed.recordIds.filter((recordId) => !fallback.recordIds.includes(recordId)));
      state.collapsedCategoryIds = state.collapsedCategoryIds.filter((categoryId) => categoryId !== removed.id);
      return persist({ kind: 'category-remove', categoryId: removed.id });
    },
    moveCategory(id, toIndex) {
      const fromIndex = categoryIndex(id);
      if (fromIndex < 0) return copyState(state);
      const target = Math.max(0, Math.min(state.categories.length - 1, Math.trunc(Number(toIndex))));
      if (fromIndex === target) return copyState(state);
      const [category] = state.categories.splice(fromIndex, 1);
      state.categories.splice(target, 0, category);
      return persist({ kind: 'category-move', categoryId: category.id, toIndex: target });
    },
    moveRecord(id, toCategoryId, toIndex) {
      const located = recordLocation(id);
      const targetCategoryIndex = categoryIndex(toCategoryId);
      if (!located || targetCategoryIndex < 0) return copyState(state);
      const [recordId] = state.categories[located.categoryIndex].recordIds.splice(located.recordIndex, 1);
      const targetRecords = state.categories[targetCategoryIndex].recordIds;
      const target = Math.max(0, Math.min(targetRecords.length, Math.trunc(Number(toIndex))));
      targetRecords.splice(target, 0, recordId);
      return persist({
        kind: 'record-move',
        personId: recordId,
        toCategoryId: state.categories[targetCategoryIndex].id,
        toIndex: target
      });
    }
  };
}
