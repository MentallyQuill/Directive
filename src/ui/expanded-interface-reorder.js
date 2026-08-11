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
  ghostOpacity = '',
  placeholderClass = '',
  lockAxis = '',
  reflowRootSelector = '',
  reflowDurationMs = 0,
  reflowEasing = 'cubic-bezier(.2,.8,.2,1)',
  dropListSelector = '',
  dropZoneSelector = '',
  onDrop = null,
  deferredDrop = false,
  dropRootSelector = '',
  dropBeforeClass = 'is-drop-before',
  dropTargetClass = 'is-drop-target',
  keyboard = true,
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
  if (keyboard) {
    handle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      commitKeyboard(event.key === 'ArrowUp' ? -1 : 1);
    });
  }

  let state = null;
  const reducedMotion = () => state?.blurTarget?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const relocatePlaceholder = (parent, before = null) => {
    if (!state?.placeholder || !parent) return;
    if (state.placeholder.parentElement === parent && state.placeholder.nextSibling === before) return;
    const root = reflowRootSelector ? state.list.closest(reflowRootSelector) : state.ownerDocument;
    const elements = [state.placeholder, ...(root?.querySelectorAll?.(itemSelector) || [])]
      .filter((element) => element?.getClientRects?.().length > 0);
    const beforeRects = new Map(elements.map((element) => [element, element.getBoundingClientRect()]));
    state.reflowAnimations?.forEach((animation) => animation.cancel());
    state.reflowAnimations?.clear();
    parent.insertBefore(state.placeholder, before);
    const duration = reducedMotion() ? 0 : reflowDurationMs;
    if (!duration) return;
    for (const element of elements) {
      if (!element.isConnected || typeof element.animate !== 'function') continue;
      const previous = beforeRects.get(element);
      const next = element.getBoundingClientRect();
      const deltaY = previous.top - next.top;
      if (Math.abs(deltaY) < 0.5) continue;
      const animation = element.animate([
        { transform: `translateY(${deltaY}px)` },
        { transform: 'translateY(0)' }
      ], { duration, easing: reflowEasing });
      state.reflowAnimations.add(animation);
      animation.finished.catch(() => {}).finally(() => state?.reflowAnimations?.delete(animation));
    }
  };
  const clearDropMarkers = () => {
    if (!state || !deferredDrop) return;
    const root = dropRootSelector ? state.list.closest(dropRootSelector) : state.ownerDocument;
    root?.querySelectorAll?.(`.${dropBeforeClass},.${dropTargetClass}`)
      .forEach((item) => item.classList.remove(dropBeforeClass, dropTargetClass));
  };
  const end = (commit = true) => {
    if (!state) return;
    clearTimeout(state.timer);
    state.blurTarget?.removeEventListener?.('blur', state.onWindowBlur);
    state.ownerDocument?.removeEventListener?.('pointermove', state.onPointerMove, true);
    state.ownerDocument?.removeEventListener?.('pointerup', state.onPointerUp, true);
    state.ownerDocument?.removeEventListener?.('pointercancel', state.onPointerCancel, true);
    if (state.active) {
      const list = state.list;
      if (deferredDrop) {
        clearDropMarkers();
        if (commit && state.dropList) {
          const dropList = state.dropList;
          const next = [...dropList.querySelectorAll(`:scope > ${itemSelector}`)]
            .map((item) => item.getAttribute(idAttribute))
            .filter((id) => id && id !== state.id);
          const beforeId = state.beforeItem?.getAttribute(idAttribute) || '';
          const toIndex = beforeId && next.includes(beforeId) ? next.indexOf(beforeId) : next.length;
          if (onDrop) {
            onDrop({ id: state.id, input: state.pointerType, fromList: list, toList: dropList, toIndex });
          } else if (dropList === list) {
            next.splice(toIndex, 0, state.id);
            onCommit(next, { id: state.id, input: state.pointerType });
          }
        }
      } else if (commit) {
        const dropList = state.dropList || list;
        state.placeholder.replaceWith(state.item);
        const next = [...dropList.querySelectorAll(`:scope > ${itemSelector}`)]
          .map((item) => item.getAttribute(idAttribute))
          .filter(Boolean);
        if (onDrop) {
          onDrop({
            id: state.id,
            input: state.pointerType,
            fromList: list,
            toList: dropList,
            toIndex: next.indexOf(state.id)
          });
        } else {
          onCommit(next, { id: state.id, input: state.pointerType });
        }
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
    let placeholder = null;
    if (!deferredDrop) {
      const itemStyle = getComputedStyle(state.item);
      placeholder = document.createElement('div');
      placeholder.className = `mobile-drag-placeholder${placeholderClass ? ` ${placeholderClass}` : ''}`;
      Object.assign(placeholder.style, {
        boxSizing: 'border-box',
        height: `${itemRect.height}px`,
        minHeight: '0',
        marginTop: itemStyle.marginTop,
        marginBottom: itemStyle.marginBottom
      });
    }
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
      opacity: ghostOpacity || (deferredDrop ? '.92' : (previewClass === 'people-drag-ghost' ? '.5' : '.9'))
    });
    if (placeholder) state.item.replaceWith(placeholder);
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
      scroll: scrollContainerFor(state.list),
      reflowAnimations: new Set()
    });
  };
  const movePointer = (event) => {
    if (!state || (state.pointerId !== undefined && event.pointerId !== state.pointerId)) return;
    const movedBeforeLift = Math.abs(event.clientX - state.originX) > 8 || Math.abs(event.clientY - state.originY) > 8;
    state.x = event.clientX; state.y = event.clientY;
    if (!state.active) {
      if (movedBeforeLift) end(false);
      return;
    }
    if (!deferredDrop && lockAxis !== 'y') state.ghost.style.left = `${event.clientX - state.handleCenterX}px`;
    state.ghost.style.top = `${event.clientY - state.handleCenterY}px`;
    state.ghost.hidden = true;
    const hovered = state.ownerDocument.elementFromPoint(event.clientX, event.clientY);
    state.ghost.hidden = false;
    let dropList = dropListSelector ? hovered?.closest(dropListSelector) : state.list;
    if (!dropList && dropZoneSelector) dropList = hovered?.closest(dropZoneSelector)?.querySelector(dropListSelector);
    const target = hovered?.closest(itemSelector);
    if (deferredDrop) {
      clearDropMarkers();
      state.dropList = null;
      state.beforeItem = null;
      if (dropList && target && target !== state.item && target.parentElement === dropList) {
        const candidates = [...dropList.querySelectorAll(`:scope > ${itemSelector}`)].filter((item) => item !== state.item);
        const targetIndex = candidates.indexOf(target);
        const rect = target.getBoundingClientRect();
        const beforeItem = event.clientY < rect.top + rect.height / 2 ? target : candidates[targetIndex + 1] || null;
        state.dropList = dropList;
        state.beforeItem = beforeItem;
        if (beforeItem) beforeItem.classList.add(dropBeforeClass);
        else dropList.closest(dropZoneSelector)?.classList.add(dropTargetClass);
      } else if (dropList && target !== state.item) {
        state.dropList = dropList;
        dropList.closest(dropZoneSelector)?.classList.add(dropTargetClass);
      }
    } else if (dropList && target && target !== state.item && target.parentElement === dropList) {
      const rect = target.getBoundingClientRect();
      relocatePlaceholder(target.parentElement, event.clientY < rect.top + rect.height / 2 ? target : target.nextSibling);
      state.dropList = dropList;
    } else if (dropList) {
      relocatePlaceholder(dropList);
      state.dropList = dropList;
    }
    const scroll = state.scroll;
    if (scroll) {
      const rect = scroll === state.ownerDocument.scrollingElement ? { top: 0, bottom: state.blurTarget.innerHeight } : scroll.getBoundingClientRect();
      if (event.clientY < rect.top + 44) scroll.scrollTop -= 14;
      else if (event.clientY > rect.bottom - 44) scroll.scrollTop += 14;
    }
  };
  const finishPointer = (event) => {
    if (!state || (state.pointerId !== undefined && event.pointerId !== state.pointerId)) return;
    end(true);
  };
  const cancelPointer = (event) => {
    if (!state || (state.pointerId !== undefined && event.pointerId !== state.pointerId)) return;
    end(false);
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
    const ownerDocument = handle.ownerDocument || document;
    const blurTarget = handle.ownerDocument?.defaultView || globalThis;
    const onWindowBlur = () => end(false);
    state = {
      item, list, id,
      x: event.clientX, y: event.clientY,
      originX: event.clientX, originY: event.clientY,
      pointerId: event.pointerId,
      pointerType: event.pointerType || 'mouse',
      active: false, timer: 0,
      ownerDocument, blurTarget, onWindowBlur,
      onPointerMove: movePointer,
      onPointerUp: finishPointer,
      onPointerCancel: cancelPointer
    };
    blurTarget.addEventListener?.('blur', onWindowBlur, { once: true });
    ownerDocument.addEventListener('pointermove', movePointer, true);
    ownerDocument.addEventListener('pointerup', finishPointer, true);
    ownerDocument.addEventListener('pointercancel', cancelPointer, true);
    if (['touch', 'pen'].includes(state.pointerType)) state.timer = setTimeout(activate, longPressMs);
    else activate();
  });
  return handle;
}
