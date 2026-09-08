const busyButtons = new WeakMap();

/** Keep a pending action focusable and guard activation. Returns an idempotent
 * restore function; calling with false restores the current operation. */
export function setButtonBusy(button, busy, { label } = {}) {
  if (!button) return () => {};
  const current = busyButtons.get(button);
  if (!busy) { current?.(); return () => {}; }
  if (current) return current;
  const original = {
    ariaBusy: button.getAttribute?.('aria-busy'),
    ariaDisabled: button.getAttribute?.('aria-disabled'),
    busy: button.dataset?.directiveBusy,
    width: button.style?.width || '', minWidth: button.style?.minWidth || '',
    maxWidth: button.style?.maxWidth || '', boxSizing: button.style?.boxSizing || ''
  };
  const target = button.querySelector?.(':scope > span:last-child') || button;
  const text = target.textContent;
  const width = button.getBoundingClientRect?.().width;
  if (width > 0 && button.style) {
    button.style.boxSizing = 'border-box';
    button.style.width = button.style.minWidth = button.style.maxWidth = `${width}px`;
  }
  button.setAttribute?.('aria-busy', 'true');
  button.setAttribute?.('aria-disabled', 'true');
  if (button.dataset) button.dataset.directiveBusy = 'true';
  if (label !== undefined) target.textContent = label;
  const block = event => { event.preventDefault?.(); event.stopImmediatePropagation?.(); };
  button.addEventListener?.('click', block, true);
  const restoreAttribute = (name, value) => value == null ? button.removeAttribute?.(name) : button.setAttribute?.(name, value);
  const restore = () => {
    if (busyButtons.get(button) !== restore) return;
    busyButtons.delete(button);
    button.removeEventListener?.('click', block, true);
    restoreAttribute('aria-busy', original.ariaBusy);
    restoreAttribute('aria-disabled', original.ariaDisabled);
    if (button.dataset) {
      if (original.busy === undefined) delete button.dataset.directiveBusy;
      else button.dataset.directiveBusy = original.busy;
    }
    if (button.style) for (const key of ['width', 'minWidth', 'maxWidth', 'boxSizing']) button.style[key] = original[key];
    if (label !== undefined) target.textContent = text;
  };
  busyButtons.set(button, restore);
  return restore;
}

export function isButtonBusy(button) { return busyButtons.has(button); }
