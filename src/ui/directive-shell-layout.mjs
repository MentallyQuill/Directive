export const DIRECTIVE_SHELL_LAYOUT_STORAGE_KEY = 'directive.runtime.commandSpine.layout.v1';
export const DIRECTIVE_SHELL_LAYOUT_VERSION = 1;
export const DIRECTIVE_SHELL_MOBILE_BREAKPOINT = 680;
export const DIRECTIVE_SPINE_WIDTH_COMPACT = 52;
export const DIRECTIVE_SPINE_WIDTH_EXPANDED = 144;
export const DIRECTIVE_SPINE_HEIGHT_MAX = 400;
export const DIRECTIVE_DRAWER_GAP = 10;
export const DIRECTIVE_SHELL_MARGIN = 16;
export const DIRECTIVE_MIN_DRAWER_WIDTH = 440;
export const DIRECTIVE_MIN_DRAWER_HEIGHT = 380;

let memoryLayout = null;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function viewportWidth(fallback = 1440) {
  return finiteNumber(
    globalThis.innerWidth
      || globalThis.window?.innerWidth
      || globalThis.document?.documentElement?.clientWidth,
    fallback
  );
}

function viewportHeight(fallback = 900) {
  return finiteNumber(
    globalThis.innerHeight
      || globalThis.window?.innerHeight
      || globalThis.document?.documentElement?.clientHeight,
    fallback
  );
}

function clamp(value, min, max, fallback = min) {
  const safeMin = finiteNumber(min, 0);
  const safeMax = Math.max(safeMin, finiteNumber(max, safeMin));
  const number = finiteNumber(value, finiteNumber(fallback, safeMin));
  return Math.max(safeMin, Math.min(number, safeMax));
}

function safeStorage() {
  try {
    const storage = globalThis.localStorage;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      return null;
    }
    return storage;
  } catch {
    return null;
  }
}

export function getDirectiveShellViewport(overrides = {}) {
  return {
    width: Math.max(320, finiteNumber(overrides.width, viewportWidth())),
    height: Math.max(320, finiteNumber(overrides.height, viewportHeight()))
  };
}

export function normalizeDirectiveSpineMode(mode) {
  return mode === 'expanded' ? 'expanded' : 'compact';
}

export function getDirectiveSpineWidth(mode = 'compact') {
  return normalizeDirectiveSpineMode(mode) === 'expanded'
    ? DIRECTIVE_SPINE_WIDTH_EXPANDED
    : DIRECTIVE_SPINE_WIDTH_COMPACT;
}

export function getDirectiveSpineHeight(overrides = {}) {
  const viewport = getDirectiveShellViewport(overrides);
  return Math.round(Math.min(DIRECTIVE_SPINE_HEIGHT_MAX, viewport.height - (DIRECTIVE_SHELL_MARGIN * 2)));
}

export function isDirectiveMobileShell(width = viewportWidth()) {
  return finiteNumber(width, 1440) <= DIRECTIVE_SHELL_MOBILE_BREAKPOINT;
}

export function createDefaultDirectiveShellLayout(overrides = {}) {
  const viewport = getDirectiveShellViewport(overrides);
  const spineMode = normalizeDirectiveSpineMode(overrides.spineMode);
  const spineWidth = getDirectiveSpineWidth(spineMode);
  const maxWidth = Math.max(
    320,
    viewport.width - spineWidth - DIRECTIVE_DRAWER_GAP - (DIRECTIVE_SHELL_MARGIN * 2)
  );
  const targetWidth = Math.round((viewport.width * 0.47) - spineWidth - DIRECTIVE_DRAWER_GAP);
  const drawerWidth = clamp(targetWidth, Math.min(DIRECTIVE_MIN_DRAWER_WIDTH, maxWidth), maxWidth, maxWidth);
  const maxHeight = Math.max(320, viewport.height - (DIRECTIVE_SHELL_MARGIN * 2));
  const targetHeight = Math.min(700, Math.round(viewport.height * 0.76));
  const drawerHeight = clamp(targetHeight, Math.min(DIRECTIVE_MIN_DRAWER_HEIGHT, maxHeight), maxHeight, maxHeight);
  const spineHeight = getDirectiveSpineHeight(viewport);
  const maxShelfTop = Math.max(DIRECTIVE_SHELL_MARGIN, viewport.height - spineHeight - DIRECTIVE_SHELL_MARGIN);
  const shelfTop = clamp(
    Math.round((viewport.height - spineHeight) / 2),
    DIRECTIVE_SHELL_MARGIN,
    maxShelfTop,
    DIRECTIVE_SHELL_MARGIN
  );

  return {
    version: DIRECTIVE_SHELL_LAYOUT_VERSION,
    activeRoute: 'starships',
    drawerOpen: false,
    drawerWidth: Math.round(drawerWidth),
    drawerHeight: Math.round(drawerHeight),
    shelfLeft: DIRECTIVE_SHELL_MARGIN,
    shelfTop: Math.round(shelfTop),
    spineMode,
    fullscreen: false
  };
}

export function constrainDirectiveShellLayout(layout = {}, overrides = {}) {
  const viewport = getDirectiveShellViewport(overrides);
  const defaults = createDefaultDirectiveShellLayout({
    ...viewport,
    spineMode: layout.spineMode
  });
  const spineMode = normalizeDirectiveSpineMode(layout.spineMode ?? defaults.spineMode);
  const spineWidth = getDirectiveSpineWidth(spineMode);
  const maxWidth = Math.max(
    320,
    viewport.width - spineWidth - DIRECTIVE_DRAWER_GAP - (DIRECTIVE_SHELL_MARGIN * 2)
  );
  const maxHeight = Math.max(320, viewport.height - (DIRECTIVE_SHELL_MARGIN * 2));
  const minWidth = Math.min(DIRECTIVE_MIN_DRAWER_WIDTH, maxWidth);
  const minHeight = Math.min(DIRECTIVE_MIN_DRAWER_HEIGHT, maxHeight);
  const drawerOpen = layout.drawerOpen === true;
  const drawerWidth = Math.round(clamp(layout.drawerWidth, minWidth, maxWidth, defaults.drawerWidth));
  const drawerHeight = Math.round(clamp(layout.drawerHeight, minHeight, maxHeight, defaults.drawerHeight));
  const visibleWidth = drawerOpen
    ? spineWidth + DIRECTIVE_DRAWER_GAP + drawerWidth
    : spineWidth;
  const maxShelfLeft = Math.max(DIRECTIVE_SHELL_MARGIN, viewport.width - visibleWidth - DIRECTIVE_SHELL_MARGIN);
  const spineHeight = getDirectiveSpineHeight(viewport);
  const centeredDrawerOverflow = drawerOpen
    ? Math.max(0, (drawerHeight - spineHeight) / 2)
    : 0;
  const minShelfTop = DIRECTIVE_SHELL_MARGIN + centeredDrawerOverflow;
  const maxShelfTop = Math.max(
    minShelfTop,
    viewport.height - spineHeight - DIRECTIVE_SHELL_MARGIN - centeredDrawerOverflow
  );

  return {
    version: DIRECTIVE_SHELL_LAYOUT_VERSION,
    activeRoute: String(layout.activeRoute || defaults.activeRoute).trim() || defaults.activeRoute,
    drawerOpen,
    drawerWidth,
    drawerHeight,
    shelfLeft: Math.round(clamp(layout.shelfLeft, DIRECTIVE_SHELL_MARGIN, maxShelfLeft, defaults.shelfLeft)),
    shelfTop: Math.round(clamp(layout.shelfTop, minShelfTop, maxShelfTop, defaults.shelfTop)),
    spineMode,
    fullscreen: layout.fullscreen === true
  };
}

export function loadDirectiveShellLayout(overrides = {}) {
  const storage = safeStorage();
  let candidate = memoryLayout;

  if (storage) {
    try {
      const raw = storage.getItem(DIRECTIVE_SHELL_LAYOUT_STORAGE_KEY);
      if (raw) candidate = JSON.parse(raw);
    } catch {
      candidate = memoryLayout;
    }
  }

  const normalized = constrainDirectiveShellLayout(
    candidate && typeof candidate === 'object'
      ? candidate
      : createDefaultDirectiveShellLayout(overrides),
    overrides
  );
  normalized.fullscreen = false;
  memoryLayout = { ...normalized };
  return { ...normalized };
}

export function saveDirectiveShellLayout(layout = {}, overrides = {}) {
  const normalized = constrainDirectiveShellLayout(layout, overrides);
  const persisted = {
    ...normalized,
    fullscreen: false
  };
  memoryLayout = { ...persisted };

  const storage = safeStorage();
  if (storage) {
    try {
      storage.setItem(DIRECTIVE_SHELL_LAYOUT_STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // Runtime layout remains available in memory when host storage is unavailable.
    }
  }
  return { ...normalized };
}

export function resetDirectiveShellLayout(overrides = {}) {
  const storage = safeStorage();
  if (storage) {
    try {
      storage.removeItem?.(DIRECTIVE_SHELL_LAYOUT_STORAGE_KEY);
    } catch {
      // Ignore host storage failures and reset the in-memory layout.
    }
  }
  memoryLayout = createDefaultDirectiveShellLayout(overrides);
  return { ...memoryLayout };
}

export const __directiveShellLayoutTestHooks = Object.freeze({
  clearMemory() {
    memoryLayout = null;
  },
  getMemory() {
    return memoryLayout ? { ...memoryLayout } : null;
  }
});
