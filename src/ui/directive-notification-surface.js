import { appendDirectiveOverlay } from './directive-overlay-root.js';

const OWNER_NAMES = new Set(['activity', 'gameplay']);
const owners = new Set();

let host = null;
let activitySlot = null;
let gameplaySlot = null;
let resizeObserver = null;
let mutationObserver = null;
let resizeListening = false;

function computePlacement({
  chatRect,
  topBarRect = null,
  surfaceSize,
  toastRects = [],
  viewportWidth = globalThis.innerWidth || 1280,
} = {}) {
  const width = Math.max(0, Math.min(340, viewportWidth - 24, chatRect.width - 16));
  const left = chatRect.left + (chatRect.width / 2);
  let top = Math.max(chatRect.top + 8, (topBarRect?.bottom || chatRect.top) + 8);
  let shiftedByNativeToast = false;
  for (const toastRect of [...toastRects].sort((leftToast, rightToast) => leftToast.top - rightToast.top)) {
    const notificationRect = {
      left: left - (width / 2),
      right: left + (width / 2),
      top,
      bottom: top + surfaceSize.height,
    };
    const intersects = notificationRect.left < toastRect.right
      && notificationRect.right > toastRect.left
      && notificationRect.top < toastRect.bottom
      && notificationRect.bottom > toastRect.top;
    if (!intersects) continue;
    top = toastRect.bottom + 6;
    shiftedByNativeToast = true;
  }
  return {
    left,
    top,
    shiftedByNativeToast,
    width,
  };
}

export const __directiveNotificationSurfaceTestHooks = Object.freeze({
  computePlacement,
});

export function acquireDirectiveNotificationSurface(owner) {
  if (!OWNER_NAMES.has(owner)) {
    throw new TypeError('Unknown Directive notification owner.');
  }
  owners.add(owner);
  ensureSurface();
  startObservers();
  refreshDirectiveNotificationSurface();
  return { host, activitySlot, gameplaySlot };
}

export function refreshDirectiveNotificationSurface() {
  if (!host?.parentNode) return null;
  const chat = document.getElementById?.('sheld');
  const topBar = document.getElementById?.('top-bar');
  const viewportWidth = globalThis.innerWidth || document.documentElement?.clientWidth || 1280;
  const chatRect = chat?.getBoundingClientRect?.() || {
    left: 0,
    top: 0,
    right: viewportWidth,
    bottom: globalThis.innerHeight || 800,
    width: viewportWidth,
    height: globalThis.innerHeight || 800,
  };
  const topBarRect = topBar?.getBoundingClientRect?.() || null;
  const surfaceRect = host.getBoundingClientRect?.() || { width: 0, height: 0 };
  const toastContainer = document.getElementById?.('toast-container');
  const toastRects = [...(toastContainer?.children || [])]
    .filter((child) => child.classList?.contains?.('toast') && !child.hidden)
    .map((child) => child.getBoundingClientRect?.())
    .filter((rect) => rect && rect.width > 0 && rect.height > 0);
  const placement = computePlacement({
    chatRect,
    topBarRect,
    surfaceSize: { width: surfaceRect.width || 0, height: surfaceRect.height || 0 },
    toastRects,
    viewportWidth,
  });
  const left = `${placement.left}px`;
  const top = `${placement.top}px`;
  const width = `${placement.width}px`;
  if (host.style.left !== left) host.style.left = left;
  if (host.style.top !== top) host.style.top = top;
  if (host.style.width !== width) host.style.width = width;
  host.dataset.nativeToastCollision = placement.shiftedByNativeToast ? 'true' : 'false';
  return placement;
}

export function releaseDirectiveNotificationSurface(owner) {
  const released = owners.delete(owner);
  if (owners.size === 0) {
    stopObservers();
    host?.remove?.();
    host = null;
    activitySlot = null;
    gameplaySlot = null;
  }
  return { released, owners: owners.size };
}

export function resetDirectiveNotificationSurface(reason = 'reset') {
  owners.clear();
  stopObservers();
  host?.remove?.();
  host = null;
  activitySlot = null;
  gameplaySlot = null;
  return { reset: true, reason };
}
function observeGeometryNodes() {
  if (!resizeObserver) return;
  const nodes = [
    host,
    document.getElementById?.('sheld'),
    document.getElementById?.('top-bar'),
    ...(document.getElementById?.('toast-container')?.children || []),
  ].filter(Boolean);
  for (const node of nodes) resizeObserver.observe(node);
}

function startObservers() {
  if (!resizeObserver && typeof globalThis.ResizeObserver === 'function') {
    resizeObserver = new globalThis.ResizeObserver(() => refreshDirectiveNotificationSurface());
  }
  if (!mutationObserver && typeof globalThis.MutationObserver === 'function') {
    mutationObserver = new globalThis.MutationObserver((mutations = []) => {
      if (mutations.some((mutation) => mutation.target !== host)) {
        observeGeometryNodes();
        refreshDirectiveNotificationSurface();
      }
    });
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
  }
  observeGeometryNodes();
  if (!resizeListening && typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('resize', refreshDirectiveNotificationSurface);
    resizeListening = true;
  }
}

function stopObservers() {
  resizeObserver?.disconnect?.();
  mutationObserver?.disconnect?.();
  resizeObserver = null;
  mutationObserver = null;
  if (resizeListening && typeof globalThis.removeEventListener === 'function') {
    globalThis.removeEventListener('resize', refreshDirectiveNotificationSurface);
  }
  resizeListening = false;
}

function ensureSurface() {
  if (host?.parentNode) return host;
  host = document.createElement('section');
  host.id = 'directive-notifications';
  host.className = 'directive-notification-surface';
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', 'Directive notifications');
  activitySlot = document.createElement('div');
  activitySlot.className = 'directive-notification-activity-slot';
  gameplaySlot = document.createElement('div');
  gameplaySlot.className = 'directive-gameplay-notification-list';
  gameplaySlot.setAttribute('aria-live', 'polite');
  gameplaySlot.setAttribute('aria-relevant', 'additions');
  host.append(activitySlot, gameplaySlot);
  appendDirectiveOverlay(host, { fallbackParent: document.body });
  return host;
}
