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

const DRAG_THEME_PROPERTIES = [
  '--directive-expanded-bg', '--directive-expanded-raised', '--directive-expanded-surface',
  '--directive-expanded-high', '--directive-expanded-text', '--directive-expanded-muted',
  '--directive-expanded-amber', '--directive-expanded-gold', '--directive-expanded-salmon',
  '--directive-expanded-lilac', '--directive-expanded-blue', '--directive-expanded-violet',
  '--bg', '--raised', '--surface', '--high', '--text', '--muted', '--amber', '--gold',
  '--salmon', '--lilac', '--blue', '--violet', '--directive-focus'
];

const activeGrabbingOwners = new WeakMap();

function acquireGrabbingCursor(ownerDocument) {
  const root = ownerDocument?.documentElement;
  if (!root) return false;
  activeGrabbingOwners.set(ownerDocument, (activeGrabbingOwners.get(ownerDocument) || 0) + 1);
  root.classList.add('directive-reorder-grabbing');
  return true;
}

function releaseGrabbingCursor(ownerDocument) {
  if (!ownerDocument) return;
  const remaining = (activeGrabbingOwners.get(ownerDocument) || 0) - 1;
  if (remaining > 0) {
    activeGrabbingOwners.set(ownerDocument, remaining);
    return;
  }
  activeGrabbingOwners.delete(ownerDocument);
  ownerDocument.documentElement?.classList.remove('directive-reorder-grabbing');
}

function copyInheritedCustomProperties(source, target) {
  const sourceStyle = getComputedStyle(source);
  for (const property of DRAG_THEME_PROPERTIES) target.style.setProperty(property, sourceStyle.getPropertyValue(property));
  for (const property of ['color', 'font-family', 'font-size', 'line-height']) {
    target.style.setProperty(property, sourceStyle.getPropertyValue(property));
  }
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
  dropDurationMs = 0,
  dropListSelector = '',
  dropZoneSelector = '',
  onDrop = null,
  deferredDrop = false,
  dropRootSelector = '',
  dropBeforeClass = 'is-drop-before',
  dropTargetClass = 'is-drop-target',
  keyboard = true,
  longPressMs = 175,
  touchTarget = null,
  liftVibrationMs = 0,
  dropVibrationMs = 0,
  autoScrollEdgePx = 44,
  autoScrollMaxStep = 14
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
  let suppressTouchClickUntil = 0;
  const requestVibration = (duration) => {
    if (!duration) return;
    try { state?.blurTarget?.navigator?.vibrate?.(duration); } catch { /* Haptics are a progressive enhancement. */ }
  };
  const reducedMotion = () => state?.blurTarget?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const ghostTransform = (x, y, scale = 1) => `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  const flushGhostPosition = () => {
    if (!state?.active || !state.ghost) return;
    if (state.ghostMoveFrame) state.blurTarget?.cancelAnimationFrame?.(state.ghostMoveFrame);
    state.ghostMoveFrame = 0;
    state.ghost.style.transform = ghostTransform(state.ghostX, state.ghostY, state.ghostScale);
  };
  const scheduleGhostPosition = (x, y) => {
    if (!state?.active) return;
    state.ghostX = x;
    state.ghostY = y;
    if (state.ghostMoveFrame) return;
    state.ghostMoveFrame = state.blurTarget?.requestAnimationFrame?.(flushGhostPosition) || 0;
    if (!state.ghostMoveFrame) flushGhostPosition();
  };
  const layoutTop = (element) => {
    let top = 0;
    for (let current = element; current; current = current.offsetParent) {
      top += current.offsetTop || 0;
    }
    return top;
  };
  const relocatePlaceholder = (parent, before = null) => {
    if (!state?.placeholder || !parent) return;
    if (state.placeholder.parentElement === parent && state.placeholder.nextSibling === before) return;
    const root = reflowRootSelector ? state.list.closest(reflowRootSelector) : state.ownerDocument;
    const elements = [...(root?.querySelectorAll?.(itemSelector) || [])]
      .filter((element) => element?.getClientRects?.().length > 0);
    const beforeGeometry = new Map(elements.map((element) => [element, {
      presentationTop: element.getBoundingClientRect().top,
      layoutTop: layoutTop(element)
    }]));
    parent.insertBefore(state.placeholder, before);
    const duration = reducedMotion() ? 0 : reflowDurationMs;
    if (!duration) {
      state.reflowAnimations?.forEach((animation) => animation.cancel());
      state.reflowAnimations?.clear();
      return;
    }
    for (const element of elements) {
      if (!element.isConnected || typeof element.animate !== 'function') continue;
      const previous = beforeGeometry.get(element);
      const nextLayoutTop = layoutTop(element);
      if (Math.abs(previous.layoutTop - nextLayoutTop) < 0.5) continue;
      const currentAnimation = state.reflowAnimations.get(element);
      currentAnimation?.cancel();
      state.reflowAnimations.delete(element);
      const next = element.getBoundingClientRect();
      const deltaY = previous.presentationTop - next.top;
      if (Math.abs(deltaY) < 0.5) continue;
      const animation = element.animate([
        { transform: `translateY(${deltaY}px)` },
        { transform: 'translateY(0)' }
      ], { duration, easing: reflowEasing });
      state.reflowAnimations.set(element, animation);
      animation.finished.catch(() => {}).finally(() => {
        if (state?.reflowAnimations?.get(element) === animation) state.reflowAnimations.delete(element);
      });
    }
  };
  const clearDropMarkers = () => {
    if (!state || !deferredDrop) return;
    const root = dropRootSelector ? state.list.closest(dropRootSelector) : state.ownerDocument;
    root?.querySelectorAll?.(`.${dropBeforeClass},.${dropTargetClass}`)
      .forEach((item) => item.classList.remove(dropBeforeClass, dropTargetClass));
  };
  const detachActiveListeners = () => {
    if (!state) return;
    clearTimeout(state.timer);
    if (state.autoScrollFrame) state.blurTarget?.cancelAnimationFrame?.(state.autoScrollFrame);
    if (state.ghostMoveFrame) state.blurTarget?.cancelAnimationFrame?.(state.ghostMoveFrame);
    state.blurTarget?.removeEventListener?.('blur', state.onWindowBlur);
    state.ownerDocument?.removeEventListener?.('pointermove', state.onPointerMove, true);
    state.ownerDocument?.removeEventListener?.('pointerup', state.onPointerUp, true);
    state.ownerDocument?.removeEventListener?.('pointercancel', state.onPointerCancel, true);
    state.ownerDocument?.removeEventListener?.('keydown', state.onKeyDown, true);
    state.ownerDocument?.removeEventListener?.('touchmove', state.onTouchMove, true);
  };
  const finalize = (commit = true) => {
    if (!state) return;
    if (state.active) {
      const list = state.list;
      try { state.captureTarget?.releasePointerCapture?.(state.pointerId); } catch { /* The pointer may already be released. */ }
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
        requestVibration(dropVibrationMs);
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
      state.reflowAnimations?.forEach((animation) => animation.cancel());
      state.ghost.remove();
      state.ghostHost?.remove();
      if (!commit && state.restoreFocusOnCancel) state.handle.focus?.({ preventScroll: true });
    }
    if (state.ownsGrabbingCursor) releaseGrabbingCursor(state.ownerDocument);
    state = null;
  };
  const end = (commit = true, { instant = false } = {}) => {
    if (!state || state.finishing) return;
    if (state.active && ['touch', 'pen'].includes(state.pointerType) && touchTarget) suppressTouchClickUntil = Date.now() + 600;
    flushGhostPosition();
    detachActiveListeners();
    const shouldDock = state.active && !deferredDrop && dropDurationMs > 0 && state.placeholder?.isConnected && state.ghost?.isConnected;
    if (!shouldDock) {
      finalize(commit);
      return;
    }
    state.finishing = true;
    const validCommit = commit && Boolean(state.dropList);
    if (!validCommit) relocatePlaceholder(state.originList, state.originNextSibling?.parentElement === state.originList ? state.originNextSibling : null);
    if (instant) {
      finalize(false);
      return;
    }
    const ghostRect = state.ghost.getBoundingClientRect();
    const slotRect = state.placeholder.getBoundingClientRect();
    state.ghost.classList.add('is-snapping');
    state.placeholder.classList.add('is-drop-committing');
    const duration = reducedMotion() ? 0 : dropDurationMs;
    const complete = () => {
      if (!state) return;
      finalize(validCommit);
    };
    if (!duration || typeof state.ghost.animate !== 'function') {
      queueMicrotask(complete);
      return;
    }
    const animation = state.ghost.animate([
      {
        transform: ghostTransform(ghostRect.left, ghostRect.top, state.ghostScale),
        boxShadow: '0 10px 24px rgba(0, 0, 0, .48)'
      },
      {
        transform: ghostTransform(slotRect.left, slotRect.top, 1),
        boxShadow: '0 1px 3px rgba(0, 0, 0, .18)'
      }
    ], { duration, easing: reflowEasing, fill: 'forwards' });
    state.dropAnimation = animation;
    animation.finished.catch(() => {}).finally(complete);
  };
  const activate = () => {
    if (!state || state.active) return;
    if (['touch', 'pen'].includes(state.pointerType) && touchTarget) suppressTouchClickUntil = Date.now() + 600;
    const itemRect = state.item.getBoundingClientRect();
    const originNextSibling = state.item.nextSibling;
    const preview = previewSelector ? state.item.querySelector(previewSelector) : state.item;
    const previewSource = preview || state.item;
    const rect = previewSource.getBoundingClientRect();
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
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.querySelectorAll('a,button,input,select,textarea,[tabindex]').forEach((element) => element.setAttribute('tabindex', '-1'));
    ghost.classList.remove('active', 'is-dragging', 'is-drop-before', 'is-drop-target');
    ghost.classList.add('mobile-drag-ghost');
    if (previewClass) ghost.classList.add(previewClass);
    const pointerOffsetX = state.originX - rect.left;
    const pointerOffsetY = state.originY - rect.top;
    const ghostScale = previewClass === 'people-drag-ghost' ? 1.015 : 1;
    const ghostX = lockAxis === 'y' ? rect.left : state.x - pointerOffsetX;
    const ghostY = state.y - pointerOffsetY;
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
      left: '0',
      top: '0',
      transform: ghostTransform(ghostX, ghostY, ghostScale),
      willChange: 'transform',
      pointerEvents: 'none',
      boxShadow: '0 10px 24px rgba(0, 0, 0, .48)',
      opacity: ghostOpacity || (deferredDrop ? '.92' : (previewClass === 'people-drag-ghost' ? '.5' : '.9'))
    });
    const ghostHost = document.createElement('div');
    ghostHost.className = 'directive-expanded-shell directive-drag-layer';
    copyInheritedCustomProperties(previewSource, ghostHost);
    if (placeholder) state.item.replaceWith(placeholder);
    state.item.classList.add('is-dragging');
    document.body.appendChild(ghostHost);
    ghostHost.appendChild(ghost);
    const positionedRect = ghost.getBoundingClientRect();
    const positionedPointerOffsetX = state.x - positionedRect.left;
    const positionedPointerOffsetY = state.y - positionedRect.top;
    const captureTarget = placeholder || state.item;
    try { captureTarget?.setPointerCapture?.(state.pointerId); } catch { /* Synthetic and legacy touch events may not expose an active pointer. */ }
    Object.assign(state, {
      active: true,
      placeholder,
      ghost,
      ghostHost,
      ghostX,
      ghostY,
      ghostScale,
      ghostMoveFrame: 0,
      handleCenterX: positionedPointerOffsetX,
      handleCenterY: positionedPointerOffsetY,
      captureTarget,
      scroll: scrollContainerFor(state.list),
      reflowAnimations: new Map(),
      autoScrollFrame: 0,
      originList: state.list,
      originNextSibling,
      hitTestX: itemRect.left + (itemRect.width / 2)
    });
    state.ownsGrabbingCursor = acquireGrabbingCursor(state.ownerDocument);
    requestVibration(liftVibrationMs);
  };
  const updateDropTarget = (clientX, clientY) => {
    if (!state?.active) return;
    const hovered = state.ownerDocument.elementFromPoint(lockAxis === 'y' ? state.hitTestX : clientX, clientY);
    let dropList = dropListSelector ? hovered?.closest(dropListSelector) : state.list;
    if (!dropList && dropZoneSelector) dropList = hovered?.closest(dropZoneSelector)?.querySelector(dropListSelector);
    if (dropList && dropList.getClientRects().length === 0) dropList = null;
    const target = hovered?.closest(itemSelector);
    if (state.placeholder && (hovered === state.placeholder || state.placeholder.contains(hovered))) {
      state.dropList = state.placeholder.parentElement;
      state.beforeItem = state.placeholder.nextElementSibling?.matches?.(itemSelector) ? state.placeholder.nextElementSibling : null;
      return;
    }
    if (deferredDrop) {
      clearDropMarkers();
      state.dropList = null;
      state.beforeItem = null;
      if (dropList && target && target !== state.item && target.parentElement === dropList) {
        const candidates = [...dropList.querySelectorAll(`:scope > ${itemSelector}`)].filter((item) => item !== state.item);
        const targetIndex = candidates.indexOf(target);
        const rect = target.getBoundingClientRect();
        const beforeItem = clientY < rect.top + rect.height / 2 ? target : candidates[targetIndex + 1] || null;
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
      relocatePlaceholder(target.parentElement, clientY < rect.top + rect.height / 2 ? target : target.nextSibling);
      state.dropList = dropList;
    } else if (dropList) {
      relocatePlaceholder(dropList);
      state.dropList = dropList;
    } else {
      state.dropList = null;
    }
  };
  const scrollAtActiveEdge = () => {
    const scroll = state?.scroll;
    if (!scroll || !state?.active) return false;
    const rect = scroll === state.ownerDocument.scrollingElement ? { top: 0, bottom: state.blurTarget.innerHeight } : scroll.getBoundingClientRect();
    let delta = 0;
    if (state.y < rect.top + autoScrollEdgePx) {
      const intensity = Math.min(1, Math.max(0, (rect.top + autoScrollEdgePx - state.y) / autoScrollEdgePx));
      delta = -Math.max(1, Math.round(autoScrollMaxStep * intensity));
    } else if (state.y > rect.bottom - autoScrollEdgePx) {
      const intensity = Math.min(1, Math.max(0, (state.y - (rect.bottom - autoScrollEdgePx)) / autoScrollEdgePx));
      delta = Math.max(1, Math.round(autoScrollMaxStep * intensity));
    }
    if (!delta) return false;
    const before = scroll.scrollTop;
    scroll.scrollTop += delta;
    return scroll.scrollTop !== before;
  };
  const continueAutoScroll = () => {
    if (!state) return;
    state.autoScrollFrame = 0;
    if (!scrollAtActiveEdge()) return;
    updateDropTarget(state.x, state.y);
    state.autoScrollFrame = state.blurTarget?.requestAnimationFrame?.(continueAutoScroll) || 0;
  };
  const movePointer = (event) => {
    if (!state || (state.pointerId !== undefined && event.pointerId !== state.pointerId)) return;
    const movedBeforeLift = Math.abs(event.clientX - state.originX) > 8 || Math.abs(event.clientY - state.originY) > 8;
    state.x = event.clientX; state.y = event.clientY;
    if (!state.active) {
      if (movedBeforeLift) end(false);
      return;
    }
    event.preventDefault?.();
    const ghostX = !deferredDrop && lockAxis !== 'y' ? event.clientX - state.handleCenterX : state.ghostX;
    scheduleGhostPosition(ghostX, event.clientY - state.handleCenterY);
    updateDropTarget(event.clientX, event.clientY);
    const scrolled = scrollAtActiveEdge();
    if (scrolled) updateDropTarget(state.x, state.y);
    if (scrolled && !state.autoScrollFrame) state.autoScrollFrame = state.blurTarget?.requestAnimationFrame?.(continueAutoScroll) || 0;
  };
  const finishPointer = (event) => {
    if (!state || (state.pointerId !== undefined && event.pointerId !== state.pointerId)) return;
    if (state.active && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) movePointer(event);
    end(true);
  };
  const cancelPointer = (event) => {
    if (!state || (state.pointerId !== undefined && event.pointerId !== state.pointerId)) return;
    end(false);
  };
  const beginPointer = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const pointerType = event.pointerType || 'mouse';
    const coarse = ['touch', 'pen'].includes(pointerType);
    if (event.currentTarget !== handle && (!coarse || handle.contains(event.target))) return;
    const item = handle.closest(itemSelector);
    const list = handle.closest(listSelector);
    const id = item?.getAttribute(idAttribute);
    if (!item || !list || !id) return;
    if (!coarse) event.preventDefault();
    end(false);
    const ownerDocument = handle.ownerDocument || document;
    const blurTarget = handle.ownerDocument?.defaultView || globalThis;
    const onWindowBlur = () => end(false, { instant: true });
    const onTouchMove = (touchEvent) => {
      if (state?.active) touchEvent.preventDefault();
    };
    const onKeyDown = (keyEvent) => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      end(false);
    };
    state = {
      item, list, id, handle,
      x: event.clientX, y: event.clientY,
      originX: event.clientX, originY: event.clientY,
      pointerId: event.pointerId,
      pointerType,
      active: false, timer: 0,
      restoreFocusOnCancel: !coarse && event.currentTarget === handle,
      ownerDocument, blurTarget, onWindowBlur, onKeyDown, onTouchMove,
      captureTarget: event.currentTarget || handle,
      onPointerMove: movePointer,
      onPointerUp: finishPointer,
      onPointerCancel: cancelPointer
    };
    blurTarget.addEventListener?.('blur', onWindowBlur, { once: true });
    ownerDocument.addEventListener('pointermove', movePointer, true);
    ownerDocument.addEventListener('pointerup', finishPointer, true);
    ownerDocument.addEventListener('pointercancel', cancelPointer, true);
    ownerDocument.addEventListener('keydown', onKeyDown, true);
    if (coarse) ownerDocument.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
    if (coarse) state.timer = setTimeout(activate, longPressMs);
    else activate();
  };
  handle.addEventListener('pointerdown', beginPointer);
  if (touchTarget && touchTarget !== handle) {
    touchTarget.addEventListener('pointerdown', beginPointer);
    touchTarget.addEventListener('click', (event) => {
      if (Date.now() >= suppressTouchClickUntil) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }
  return handle;
}
