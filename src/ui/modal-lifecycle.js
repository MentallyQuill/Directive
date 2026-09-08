const documents = new WeakMap();
const contains = (parent, node) => parent === node || [...(parent?.children || [])].some(child => contains(child, node));
const children = node => [...(node?.children || [])];
function focusable(dialog) {
  const result = [];
  const visit = node => {
    for (const child of children(node)) {
      if (child.hidden || child.inert || child.disabled || child.getAttribute?.('aria-hidden') === 'true') continue;
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(child) : null;
      if (style?.display === 'none' || style?.visibility === 'hidden') continue;
      const explicit = child.getAttribute?.('tabindex');
      if ((explicit !== null && explicit !== undefined ? Number(explicit) >= 0 : ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(child.tagName) || child.tagName === 'A' && child.getAttribute?.('href'))
        && !(child.tagName === 'INPUT' && child.type === 'hidden')) result.push(child);
      visit(child);
    }
  };
  visit(dialog);
  return result;
}

/** Bind after attaching an overlay. Only the top modal owns keyboard/focus.
 * Release is idempotent and is also called after external DOM removal. */
export function bindDirectiveModal({ overlay, dialog, opener = null, initialFocus = null, onDismiss = null, dismissOnBackdrop = false, canDismiss = () => true, onRelease = null } = {}) {
  const doc = dialog.ownerDocument || document;
  let state = documents.get(doc);
  if (!state) { state = { stack: [], inert: new Map() }; documents.set(doc, state); }
  const entry = { overlay, dialog, opener: opener || doc.activeElement, release: null };
  const top = () => state.stack.at(-1);
  const refresh = () => {
    for (const [node, value] of state.inert) node.inert = value;
    state.inert.clear();
    let branch = top()?.overlay;
    while (branch && branch !== doc.body) {
      const parent = branch.parentNode;
      if (!parent) break;
      for (const sibling of children(parent)) {
        if (sibling === branch) continue;
        state.inert.set(sibling, sibling.inert === true);
        sibling.inert = true;
      }
      branch = parent;
    }
  };
  const focusInside = () => {
    const candidate = typeof initialFocus === 'function' ? initialFocus() : initialFocus;
    (candidate && contains(dialog, candidate) && !candidate.disabled ? candidate : focusable(dialog)[0] || dialog).focus?.({ preventScroll: true });
  };
  const dismiss = reason => { if (top() === entry && canDismiss()) onDismiss?.(reason); };
  const keydown = event => {
    if (top() !== entry) return;
    if (event.key === 'Escape') {
      event.preventDefault?.(); event.stopPropagation?.(); dismiss('escape'); return;
    }
    if (event.key !== 'Tab') return;
    const controls = focusable(dialog);
    const first = controls[0], last = controls.at(-1);
    if (!controls.length) { event.preventDefault?.(); dialog.focus?.(); return; }
    if (!contains(dialog, doc.activeElement) || doc.activeElement === dialog || event.shiftKey && doc.activeElement === first || !event.shiftKey && doc.activeElement === last) {
      event.preventDefault?.(); (event.shiftKey ? last : first).focus?.({ preventScroll: true });
    }
  };
  const focusin = event => { if (top() === entry && !contains(dialog, event.target)) focusInside(); };
  const backdrop = event => { if (event.target === overlay && dismissOnBackdrop) dismiss('backdrop'); };
  const cancel = event => { event.preventDefault?.(); dismiss('cancel'); };
  let observer;
  const release = () => {
    const index = state.stack.indexOf(entry);
    if (index < 0) return;
    const wasTop = top() === entry;
    state.stack.splice(index, 1);
    observer?.disconnect();
    dialog.removeEventListener?.('keydown', keydown);
    dialog.removeEventListener?.('cancel', cancel);
    doc.removeEventListener?.('focusin', focusin, true);
    overlay.removeEventListener?.('click', backdrop);
    refresh();
    onRelease?.();
    if (!wasTop) return;
    const current = top();
    const target = entry.opener;
    if (target?.isConnected && !target.inert && (!current || contains(current.dialog, target))) target.focus?.({ preventScroll: true });
    else if (current) (focusable(current.dialog)[0] || current.dialog).focus?.({ preventScroll: true });
    else {
      const fallback = doc.getElementById?.('directive-runtime-panel') || doc.body;
      const prior = fallback?.getAttribute?.('tabindex');
      fallback?.setAttribute?.('tabindex', '-1'); fallback?.focus?.({ preventScroll: true });
      if (prior == null) fallback?.removeAttribute?.('tabindex'); else fallback?.setAttribute?.('tabindex', prior);
    }
  };
  entry.release = release;
  state.stack.push(entry);
  overlay.dataset.directiveModalOverlay = 'true';
  dialog.dataset.directiveModal = 'true';
  dialog.setAttribute('tabindex', '-1');
  dialog.addEventListener('keydown', keydown);
  dialog.addEventListener('cancel', cancel);
  doc.addEventListener?.('focusin', focusin, true);
  overlay.addEventListener('click', backdrop);
  refresh();
  if (typeof MutationObserver === 'function') {
    observer = new MutationObserver(() => {
      for (const item of [...state.stack]) if (!item.overlay.isConnected) item.release();
      refresh();
    });
    observer.observe(doc.body, { childList: true, subtree: true });
  }
  queueMicrotask(() => { if (top() === entry && overlay.isConnected && !contains(dialog, doc.activeElement)) focusInside(); });
  return release;
}
