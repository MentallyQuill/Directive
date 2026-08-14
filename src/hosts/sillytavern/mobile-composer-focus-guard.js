const CHAT_INPUT_SELECTORS = Object.freeze([
  '#send_textarea',
  'textarea#send_textarea',
  'textarea[name="send_textarea"]',
  '#send_textarea textarea'
]);

const MOBILE_VIEWPORT_QUERY = '(max-width: 640px)';
const DEFAULT_RELEASE_DELAY_MS = 400;
const WATCHDOG_DELAY_MS = 10000;

function inactiveGuard() {
  return Object.freeze({
    active: false,
    release() {},
    releaseAfter() {}
  });
}

function isMobileViewport(windowRef) {
  if (!windowRef) return false;
  if (typeof windowRef.matchMedia === 'function') {
    return windowRef.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
  }
  return Number(windowRef.innerWidth) <= 640;
}

function findComposer(documentRef) {
  for (const selector of CHAT_INPUT_SELECTORS) {
    const composer = documentRef.querySelector?.(selector);
    if (composer) return composer;
  }
  return null;
}

function isEditable(element) {
  return element?.matches?.('input, textarea, [contenteditable="true"]') === true;
}

export function createDirectiveMobileComposerFocusGuard({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  schedule = globalThis.setTimeout,
  cancel = globalThis.clearTimeout
} = {}) {
  if (!documentRef?.addEventListener || !documentRef?.removeEventListener
    || !isMobileViewport(windowRef) || typeof schedule !== 'function') {
    return inactiveGuard();
  }
  const composer = findComposer(documentRef);
  if (!composer?.setAttribute || !composer?.removeAttribute) return inactiveGuard();

  const priorFocus = documentRef.activeElement || null;
  const inputMode = composer.getAttribute?.('inputmode');
  const readOnlyAttribute = composer.getAttribute?.('readonly');
  const readOnlyProperty = composer.readOnly;
  let released = false;
  let timer = null;

  const restoreComposer = () => {
    if (inputMode === null || inputMode === undefined) composer.removeAttribute('inputmode');
    else composer.setAttribute('inputmode', inputMode);
    if (readOnlyAttribute === null || readOnlyAttribute === undefined) composer.removeAttribute('readonly');
    else composer.setAttribute('readonly', readOnlyAttribute);
    composer.readOnly = readOnlyProperty;
  };

  const release = () => {
    if (released) return;
    released = true;
    if (timer !== null && typeof cancel === 'function') cancel(timer);
    timer = null;
    documentRef.removeEventListener('focusin', onFocusIn, true);
    restoreComposer();
  };

  const onFocusIn = (event) => {
    if (event?.target !== composer) return;
    const restoreTarget = event.relatedTarget || priorFocus;
    composer.blur?.();
    if (restoreTarget && restoreTarget !== composer && restoreTarget.isConnected !== false
      && !isEditable(restoreTarget) && typeof restoreTarget.focus === 'function') {
      restoreTarget.focus({ preventScroll: true });
    }
  };

  composer.setAttribute('inputmode', 'none');
  composer.setAttribute('readonly', '');
  composer.readOnly = true;
  documentRef.addEventListener('focusin', onFocusIn, true);
  timer = schedule(release, WATCHDOG_DELAY_MS);

  return Object.freeze({
    active: true,
    release,
    releaseAfter(delayMs = DEFAULT_RELEASE_DELAY_MS) {
      if (released) return;
      if (timer !== null && typeof cancel === 'function') cancel(timer);
      timer = schedule(release, Math.max(0, Number(delayMs) || 0));
    }
  });
}
