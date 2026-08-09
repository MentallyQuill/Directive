function scrollContainerFor(element) {
  let current = element?.parentElement;
  while (current) {
    const style = getComputedStyle(current);
    if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight) return current;
    current = current.parentElement;
  }
  return document.scrollingElement;
}

function moveArray(order, id, offset) {
  const current = order.indexOf(id);
  const next = Math.max(0, Math.min(order.length - 1, current + offset));
  if (current < 0 || current === next) return order;
  const result = [...order];
  const [moved] = result.splice(current, 1);
  result.splice(next, 0, moved);
  return result;
}

export function bindPresentationReorderHandle(handle, {
  itemSelector,
  listSelector,
  idAttribute,
  order,
  onCommit,
  longPressMs = 175
} = {}) {
  const commitKeyboard = (offset) => {
    const item = handle.closest(itemSelector);
    const id = item?.getAttribute(idAttribute);
    if (!id) return;
    const current = order();
    const next = moveArray(current, id, offset);
    if (next === current) return;
    onCommit(next, { id, input: 'keyboard' });
  };
  handle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    commitKeyboard(event.key === 'ArrowUp' ? -1 : 1);
  });

  let state = null;
  const end = (commit = true) => {
    if (!state) return;
    clearTimeout(state.timer);
    if (state.active) {
      const list = state.list;
      if (commit) {
        state.placeholder.replaceWith(state.item);
        const next = [...list.querySelectorAll(`:scope > ${itemSelector}`)]
          .map((item) => item.getAttribute(idAttribute))
          .filter(Boolean);
        onCommit(next, { id: state.id, input: state.pointerType });
      } else {
        state.placeholder.replaceWith(state.item);
      }
      state.item.classList.remove('is-dragging');
      state.ghost.remove();
    }
    state = null;
  };
  const activate = () => {
    if (!state || state.active) return;
    const rect = state.item.getBoundingClientRect();
    const placeholder = document.createElement('div');
    placeholder.className = 'mobile-drag-placeholder';
    placeholder.style.height = `${rect.height}px`;
    const ghost = state.item.cloneNode(true);
    ghost.classList.remove('is-dragging');
    ghost.classList.add('mobile-drag-ghost');
    Object.assign(ghost.style, { width: `${rect.width}px`, left: `${rect.left}px`, top: `${rect.top}px` });
    state.item.before(placeholder);
    state.item.classList.add('is-dragging');
    document.body.appendChild(ghost);
    Object.assign(state, { active: true, placeholder, ghost, offsetY: state.y - rect.top, scroll: scrollContainerFor(state.list) });
  };
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const item = handle.closest(itemSelector);
    const list = handle.closest(listSelector);
    const id = item?.getAttribute(idAttribute);
    if (!item || !list || !id) return;
    event.preventDefault();
    try { handle.setPointerCapture?.(event.pointerId); } catch { /* Synthetic and legacy touch events may not expose an active pointer. */ }
    state = { item, list, id, x: event.clientX, y: event.clientY, pointerType: event.pointerType || 'mouse', active: false, timer: 0 };
    state.timer = setTimeout(activate, state.pointerType === 'touch' ? longPressMs : 0);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!state) return;
    state.x = event.clientX; state.y = event.clientY;
    if (!state.active) return;
    state.ghost.style.top = `${event.clientY - state.offsetY}px`;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(itemSelector);
    if (target && target !== state.item && target.parentElement === state.list) {
      const rect = target.getBoundingClientRect();
      target.parentElement.insertBefore(state.placeholder, event.clientY < rect.top + rect.height / 2 ? target : target.nextSibling);
    }
    const scroll = state.scroll;
    if (scroll) {
      const rect = scroll === document.scrollingElement ? { top: 0, bottom: innerHeight } : scroll.getBoundingClientRect();
      if (event.clientY < rect.top + 44) scroll.scrollTop -= 14;
      else if (event.clientY > rect.bottom - 44) scroll.scrollTop += 14;
    }
  });
  handle.addEventListener('pointerup', () => end(true));
  handle.addEventListener('pointercancel', () => end(false));
  return handle;
}
