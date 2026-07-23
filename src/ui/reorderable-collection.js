export const DIRECTIVE_TOUCH_REORDER_DELAY_MS = 175;

function compact(value) {
  return String(value || '').trim();
}

function clampIndex(value, length) {
  const number = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : length;
  return Math.max(0, Math.min(number, Math.max(0, length)));
}

function normalizeCategories(categories = []) {
  const seenCategories = new Set();
  const seenRecords = new Set();
  const normalized = [];
  for (const source of Array.isArray(categories) ? categories : []) {
    const id = compact(source?.id);
    if (!id || seenCategories.has(id)) continue;
    seenCategories.add(id);
    const recordIds = [];
    for (const value of Array.isArray(source?.recordIds) ? source.recordIds : []) {
      const recordId = compact(value);
      if (!recordId || seenRecords.has(recordId)) continue;
      seenRecords.add(recordId);
      recordIds.push(recordId);
    }
    normalized.push({ ...source, id, recordIds });
  }
  return normalized;
}

export function moveItemInList(items = [], fromIndex, toIndex) {
  const next = Array.isArray(items) ? items.slice() : [];
  const from = Math.trunc(Number(fromIndex));
  if (!Number.isInteger(from) || from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(clampIndex(toIndex, next.length), 0, item);
  return next;
}

export function createReorderableCollectionController({ categories = [], onChange = null } = {}) {
  let state = normalizeCategories(categories);

  const snapshot = () => state.map((category) => ({
    ...category,
    recordIds: category.recordIds.slice()
  }));

  const emit = (detail) => {
    const next = snapshot();
    onChange?.(next, detail);
    return next;
  };

  const locateRecord = (recordId) => {
    const id = compact(recordId);
    for (let categoryIndex = 0; categoryIndex < state.length; categoryIndex += 1) {
      const recordIndex = state[categoryIndex].recordIds.indexOf(id);
      if (recordIndex >= 0) return { id, categoryIndex, recordIndex };
    }
    return null;
  };

  return {
    snapshot,
    moveCategory({ categoryId, toIndex } = {}) {
      const id = compact(categoryId);
      const fromIndex = state.findIndex((category) => category.id === id);
      if (fromIndex < 0) return snapshot();
      state = moveItemInList(state, fromIndex, toIndex);
      return emit({ kind: 'category', categoryId: id, fromIndex, toIndex: state.findIndex((item) => item.id === id) });
    },
    moveRecord({ recordId, toCategoryId, toIndex } = {}) {
      const located = locateRecord(recordId);
      const targetIndex = state.findIndex((category) => category.id === compact(toCategoryId));
      if (!located || targetIndex < 0) return snapshot();
      const next = snapshot();
      next[located.categoryIndex].recordIds.splice(located.recordIndex, 1);
      const insertionIndex = clampIndex(toIndex, next[targetIndex].recordIds.length);
      next[targetIndex].recordIds.splice(insertionIndex, 0, located.id);
      state = next;
      return emit({
        kind: 'record',
        recordId: located.id,
        fromCategoryId: next[located.categoryIndex].id,
        toCategoryId: next[targetIndex].id,
        toIndex: insertionIndex
      });
    },
    moveRecordByKeyboard({ recordId, direction } = {}) {
      const located = locateRecord(recordId);
      if (!located || !['up', 'down'].includes(direction)) return snapshot();
      const offset = direction === 'up' ? -1 : 1;
      const target = located.recordIndex + offset;
      if (target < 0 || target >= state[located.categoryIndex].recordIds.length) return snapshot();
      const next = snapshot();
      next[located.categoryIndex].recordIds = moveItemInList(
        next[located.categoryIndex].recordIds,
        located.recordIndex,
        target
      );
      state = next;
      return emit({ kind: 'record', recordId: located.id, direction, toIndex: target });
    }
  };
}
