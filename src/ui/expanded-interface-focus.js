const FORWARD_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const BACKWARD_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

export function nextRovingFocusIndex({ currentIndex = 0, itemCount = 0, key = '' } = {}) {
  const count = Math.max(0, Math.trunc(Number(itemCount) || 0));
  if (!count) return -1;
  const current = Math.max(0, Math.min(Math.trunc(Number(currentIndex) || 0), count - 1));
  if (FORWARD_KEYS.has(key)) return (current + 1) % count;
  if (BACKWARD_KEYS.has(key)) return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return current;
}

export function bindRovingFocus(container, {
  selector = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  orientation = 'horizontal',
  onActivate = null
} = {}) {
  if (!container?.addEventListener) return () => {};
  const allowed = orientation === 'vertical'
    ? new Set(['ArrowUp', 'ArrowDown', 'Home', 'End'])
    : new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

  const controls = () => [...(container.querySelectorAll?.(selector) || [])]
    .filter((element) => element.disabled !== true && element.hidden !== true);

  const sync = (active = null) => {
    const items = controls();
    const selected = active && items.includes(active) ? active : items.find((item) => item.getAttribute?.('aria-selected') === 'true') || items[0];
    for (const item of items) item.tabIndex = item === selected ? 0 : -1;
    return selected;
  };

  const onFocusIn = (event) => sync(event.target);
  const onKeyDown = (event) => {
    if (!allowed.has(event.key)) return;
    const items = controls();
    const currentIndex = items.indexOf(event.target);
    if (currentIndex < 0) return;
    const nextIndex = nextRovingFocusIndex({ currentIndex, itemCount: items.length, key: event.key });
    if (nextIndex < 0 || nextIndex === currentIndex) return;
    event.preventDefault?.();
    sync(items[nextIndex]);
    items[nextIndex].focus?.();
    onActivate?.(items[nextIndex], event);
  };

  sync();
  container.addEventListener('focusin', onFocusIn);
  container.addEventListener('keydown', onKeyDown);
  return () => {
    container.removeEventListener?.('focusin', onFocusIn);
    container.removeEventListener?.('keydown', onKeyDown);
  };
}

export function restoreFocus(element) {
  if (!element?.isConnected || typeof element.focus !== 'function') return false;
  element.focus({ preventScroll: true });
  return true;
}
