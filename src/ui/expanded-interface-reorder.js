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

function copyRenderedStyles(source, target) {
  const sourceElements = [source, ...source.querySelectorAll('*')];
  const targetElements = [target, ...target.querySelectorAll('*')];
  sourceElements.forEach((sourceElement, index) => {
    const targetElement = targetElements[index];
    if (!targetElement?.style) return;
    const sourceStyle = getComputedStyle(sourceElement);
    for (const property of sourceStyle) {
      targetElement.style.setProperty(property, sourceStyle.getPropertyValue(property), sourceStyle.getPropertyPriority(property));
    }
  });
}

export function bindPresentationReorderHandle(handle, {
  itemSelector,
  listSelector,
  idAttribute,
  order,
  onCommit,
  previewSelector = '',
  previewClass = '',
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
    state.blurTarget?.removeEventListener?.('blur', state.onWindowBlur);
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
      state.ghostHost?.remove();
    }
    state = null;
  };
  const activate = () => {
    if (!state || state.active) return;
    const itemRect = state.item.getBoundingClientRect();
    const preview = previewSelector ? state.item.querySelector(previewSelector) : state.item;
    const previewSource = preview || state.item;
    const rect = previewSource.getBoundingClientRect();
    const handleRect = handle.getBoundingClientRect();
    const itemStyle = getComputedStyle(state.item);
    const placeholder = document.createElement('div');
    placeholder.className = 'mobile-drag-placeholder';
    Object.assign(placeholder.style, {
      boxSizing: 'border-box',
      height: `${itemRect.height}px`,
      minHeight: '0',
      marginTop: itemStyle.marginTop,
      marginBottom: itemStyle.marginBottom
    });
    const ghost = previewSource.cloneNode(true);
    copyRenderedStyles(previewSource, ghost);
    ghost.classList.remove('is-dragging');
    ghost.classList.add('mobile-drag-ghost');
    if (previewClass) ghost.classList.add(previewClass);
    const handleCenterX = handleRect.left + (handleRect.width / 2) - rect.left;
    const handleCenterY = handleRect.top + (handleRect.height / 2) - rect.top;
    Object.assign(ghost.style, {
      position: 'fixed',
      zIndex: '9999',
      boxSizing: 'border-box',
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      minWidth: '0',
      maxWidth: 'none',
      minHeight: '0',
      maxHeight: 'none',
      margin: '0',
      left: `${state.x - handleCenterX}px`,
      top: `${state.y - handleCenterY}px`,
      pointerEvents: 'none',
      boxShadow: '0 10px 24px rgba(0, 0, 0, .48)',
      opacity: previewClass === 'people-drag-ghost' ? '.5' : '.9'
    });
    state.item.before(placeholder);
    state.item.classList.add('is-dragging');
    const ghostHost = document.createElement('div');
    ghostHost.className = 'directive-expanded-shell directive-drag-layer';
    document.body.appendChild(ghostHost);
    ghostHost.appendChild(ghost);
    const ghostHandle = [...ghost.querySelectorAll('button')]
      .find((candidate) => candidate.getAttribute('aria-label') === handle.getAttribute('aria-label'));
    if (ghostHandle) {
      const ghostHandleRect = ghostHandle.getBoundingClientRect();
      const deltaX = state.x - (ghostHandleRect.left + ghostHandleRect.width / 2);
      const deltaY = state.y - (ghostHandleRect.top + ghostHandleRect.height / 2);
      ghost.style.left = `${Number.parseFloat(ghost.style.left) + deltaX}px`;
      ghost.style.top = `${Number.parseFloat(ghost.style.top) + deltaY}px`;
    }
    const positionedRect = ghost.getBoundingClientRect();
    const positionedHandleCenterX = state.x - positionedRect.left;
    const positionedHandleCenterY = state.y - positionedRect.top;
    Object.assign(state, {
      active: true,
      placeholder,
      ghost,
      ghostHost,
      handleCenterX: positionedHandleCenterX,
      handleCenterY: positionedHandleCenterY,
      scroll: scrollContainerFor(state.list)
    });
  };
  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const item = handle.closest(itemSelector);
    const list = handle.closest(listSelector);
    const id = item?.getAttribute(idAttribute);
    if (!item || !list || !id) return;
    event.preventDefault();
    end(false);
    try { handle.setPointerCapture?.(event.pointerId); } catch { /* Synthetic and legacy touch events may not expose an active pointer. */ }
    const blurTarget = handle.ownerDocument?.defaultView || globalThis;
    const onWindowBlur = () => end(false);
    state = { item, list, id, x: event.clientX, y: event.clientY, pointerType: event.pointerType || 'mouse', active: false, timer: 0, blurTarget, onWindowBlur };
    blurTarget.addEventListener?.('blur', onWindowBlur, { once: true });
    state.timer = setTimeout(activate, ['touch', 'pen'].includes(state.pointerType) ? longPressMs : 0);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!state) return;
    state.x = event.clientX; state.y = event.clientY;
    if (!state.active) return;
    state.ghost.style.left = `${event.clientX - state.handleCenterX}px`;
    state.ghost.style.top = `${event.clientY - state.handleCenterY}px`;
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
  handle.addEventListener('lostpointercapture', () => end(false));
  return handle;
}
