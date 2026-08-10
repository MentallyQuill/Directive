import { createElement } from './runtime-ui-kit.js';

function compact(value) {
  return String(value || '').trim();
}

export function createResponsiveRecordState({ recordIds = [], selectedRecordId = '', openRecordId = '', onChange = null } = {}) {
  const ids = [...new Set((Array.isArray(recordIds) ? recordIds : []).map(compact).filter(Boolean))];
  let selected = ids.includes(compact(selectedRecordId)) ? compact(selectedRecordId) : (ids[0] || null);
  let open = ids.includes(compact(openRecordId)) ? compact(openRecordId) : null;
  const snapshot = () => ({ selectedRecordId: selected, openRecordId: open });
  const emit = () => {
    const next = snapshot();
    onChange?.(next);
    return next;
  };
  return {
    snapshot,
    select(recordId) {
      const id = compact(recordId);
      if (!ids.includes(id) || id === selected) return snapshot();
      selected = id;
      return emit();
    },
    toggle(recordId) {
      const id = compact(recordId);
      if (!ids.includes(id)) return snapshot();
      const changed = selected !== id || open !== (open === id ? null : id);
      selected = id;
      open = open === id ? null : id;
      return changed ? emit() : snapshot();
    }
  };
}

export function createResponsiveRecordList({
  records = [],
  selectedRecordId = '',
  openRecordId = '',
  renderSummary,
  renderDetail,
  onChange = null
} = {}) {
  const normalized = (Array.isArray(records) ? records : []).filter((record) => compact(record?.id));
  const state = createResponsiveRecordState({
    recordIds: normalized.map((record) => record.id),
    selectedRecordId,
    openRecordId,
    onChange
  });
  const list = createElement('div', 'directive-responsive-record-list');
  list.dataset.responsiveRecordList = 'true';

  const render = () => {
    const current = state.snapshot();
    list.replaceChildren();
    for (const record of normalized) {
      const id = compact(record.id);
      const row = createElement('article', 'directive-responsive-record');
      row.dataset.recordId = id;
      const button = createElement('button', 'directive-responsive-record-summary');
      button.type = 'button';
      button.setAttribute('aria-expanded', current.openRecordId === id ? 'true' : 'false');
      button.setAttribute('aria-pressed', current.selectedRecordId === id ? 'true' : 'false');
      const summary = renderSummary?.(record, current) ?? document.createTextNode(record.label || id);
      button.append(summary);
      button.addEventListener('click', () => {
        state.toggle(id);
        render();
      });
      row.append(button);
      if (current.openRecordId === id) {
        const detail = createElement('div', 'directive-responsive-record-detail');
        detail.dataset.recordDetailId = id;
        const content = renderDetail?.(record, current);
        if (content) detail.append(content);
        row.append(detail);
      }
      list.append(row);
    }
  };
  render();
  return { element: list, state, render };
}
