import assert from 'node:assert/strict';

import {
  DIRECTIVE_DRAWER_GAP,
  DIRECTIVE_MIN_DRAWER_HEIGHT,
  DIRECTIVE_MIN_DRAWER_WIDTH,
  DIRECTIVE_SHELL_LAYOUT_STORAGE_KEY,
  DIRECTIVE_SHELL_MARGIN,
  DIRECTIVE_SPINE_WIDTH_COMPACT,
  DIRECTIVE_SPINE_WIDTH_EXPANDED,
  __directiveShellLayoutTestHooks,
  constrainDirectiveShellLayout,
  createDefaultDirectiveShellLayout,
  getDirectiveSpineHeight,
  getDirectiveSpineWidth,
  isDirectiveMobileShell,
  loadDirectiveShellLayout,
  resetDirectiveShellLayout,
  saveDirectiveShellLayout
} from '../../src/ui/directive-shell-layout.mjs';

function createMemoryStorage() {
  const records = new Map();
  return {
    getItem(key) {
      return records.has(key) ? records.get(key) : null;
    },
    setItem(key, value) {
      records.set(key, String(value));
    },
    removeItem(key) {
      records.delete(key);
    },
    snapshot() {
      return new Map(records);
    }
  };
}

const originalStorage = globalThis.localStorage;
const originalInnerWidth = globalThis.innerWidth;
const originalInnerHeight = globalThis.innerHeight;
const storage = createMemoryStorage();

globalThis.localStorage = storage;
globalThis.innerWidth = 1440;
globalThis.innerHeight = 900;
__directiveShellLayoutTestHooks.clearMemory();

try {
  const defaults = createDefaultDirectiveShellLayout({ width: 1440, height: 900 });
  const occupiedWidth = DIRECTIVE_SPINE_WIDTH_COMPACT + DIRECTIVE_DRAWER_GAP + defaults.drawerWidth;
  const occupiedRatio = occupiedWidth / 1440;
  const defaultSpineHeight = getDirectiveSpineHeight({ width: 1440, height: 900 });

  assert.equal(defaults.activeRoute, 'campaign');
  assert.equal(defaults.drawerOpen, false, 'the command spine should be the default collapsed surface');
  assert.equal(defaults.spineMode, 'compact');
  assert.equal(defaults.fullscreen, false);
  assert.equal(defaults.shelfLeft, DIRECTIVE_SHELL_MARGIN);
  assert.equal(defaults.shelfTop, Math.round((900 - defaultSpineHeight) / 2));
  assert.ok(
    occupiedRatio >= 0.44 && occupiedRatio <= 0.50,
    `default open drawer should occupy roughly half the viewport; received ${occupiedRatio.toFixed(3)}`
  );
  assert.ok(defaults.drawerHeight <= 700, 'default drawer height should remain compact');
  assert.ok(defaults.drawerHeight >= DIRECTIVE_MIN_DRAWER_HEIGHT);

  assert.equal(getDirectiveSpineWidth('compact'), DIRECTIVE_SPINE_WIDTH_COMPACT);
  assert.equal(getDirectiveSpineWidth('expanded'), DIRECTIVE_SPINE_WIDTH_EXPANDED);
  assert.equal(DIRECTIVE_SPINE_WIDTH_EXPANDED, 176, 'expanded shelf should be wide enough for the wide brand logo');
  assert.equal(isDirectiveMobileShell(680), true);
  assert.equal(isDirectiveMobileShell(681), false);

  const constrained = constrainDirectiveShellLayout({
    activeRoute: 'mission',
    drawerOpen: true,
    drawerWidth: 99999,
    drawerHeight: 99999,
    shelfLeft: 72,
    shelfTop: 88,
    spineMode: 'expanded',
    fullscreen: true
  }, { width: 1024, height: 700 });
  const expectedMaxWidth = 1024
    - 72
    - DIRECTIVE_SPINE_WIDTH_EXPANDED
    - DIRECTIVE_DRAWER_GAP
    - DIRECTIVE_SHELL_MARGIN;
  const expectedMaxHeight = 700 - 88 - DIRECTIVE_SHELL_MARGIN;

  assert.equal(constrained.activeRoute, 'mission');
  assert.equal(constrained.drawerOpen, true);
  assert.equal(constrained.spineMode, 'expanded');
  assert.equal(constrained.drawerWidth, expectedMaxWidth);
  assert.equal(constrained.drawerHeight, expectedMaxHeight);
  assert.equal(constrained.shelfLeft, 72, 'open drawer width constraints should preserve the shelf anchor');
  assert.equal(constrained.shelfTop, 88, 'open drawer height constraints should preserve the shelf anchor');
  assert.equal(constrained.fullscreen, true);

  const openedDefaults = constrainDirectiveShellLayout({
    ...defaults,
    drawerOpen: true
  }, { width: 1440, height: 900 });
  assert.equal(openedDefaults.shelfLeft, defaults.shelfLeft, 'opening the drawer should keep the shelf left edge anchored');
  assert.equal(openedDefaults.shelfTop, defaults.shelfTop, 'opening the drawer should keep the shelf top edge anchored');
  assert.equal(
    openedDefaults.drawerHeight,
    900 - defaults.shelfTop - DIRECTIVE_SHELL_MARGIN,
    'top-anchored drawer should cap height below the shelf instead of moving the shelf'
  );

  const narrow = constrainDirectiveShellLayout({
    drawerWidth: 1,
    drawerHeight: 1
  }, { width: 520, height: 480 });
  assert.ok(narrow.drawerWidth <= 520, 'narrow viewport width must remain constrained');
  assert.ok(narrow.drawerHeight <= 480, 'narrow viewport height must remain constrained');
  const narrowMaxWidth = 520 - DIRECTIVE_SPINE_WIDTH_COMPACT - DIRECTIVE_DRAWER_GAP - (DIRECTIVE_SHELL_MARGIN * 2);
  const narrowMaxHeight = 480 - (DIRECTIVE_SHELL_MARGIN * 2);
  assert.ok(narrow.drawerWidth >= Math.min(DIRECTIVE_MIN_DRAWER_WIDTH, narrowMaxWidth));
  assert.ok(narrow.drawerHeight >= Math.min(DIRECTIVE_MIN_DRAWER_HEIGHT, narrowMaxHeight));

  const collapsedMove = constrainDirectiveShellLayout({
    drawerOpen: false,
    drawerWidth: 612,
    drawerHeight: 604,
    shelfLeft: 9999,
    shelfTop: 9999
  }, { width: 1440, height: 900 });
  assert.equal(
    collapsedMove.shelfLeft,
    1440 - DIRECTIVE_SHELL_MARGIN - DIRECTIVE_SPINE_WIDTH_COMPACT,
    'collapsed shelf should be movable across the desktop viewport'
  );
  assert.equal(
    collapsedMove.shelfTop,
    900 - DIRECTIVE_SHELL_MARGIN - defaultSpineHeight,
    'collapsed shelf should remain clamped within the viewport height'
  );

  const saved = saveDirectiveShellLayout({
    ...defaults,
    activeRoute: 'crew',
    drawerOpen: true,
    drawerWidth: 612,
    drawerHeight: 604,
    shelfLeft: 72,
    shelfTop: 188,
    spineMode: 'expanded',
    fullscreen: true
  }, { width: 1440, height: 900 });
  assert.equal(saved.fullscreen, true, 'current session may enter full-screen workspace');

  const persistedRaw = storage.snapshot().get(DIRECTIVE_SHELL_LAYOUT_STORAGE_KEY);
  assert.ok(persistedRaw, 'resizable drawer geometry should persist');
  const persisted = JSON.parse(persistedRaw);
  assert.equal(persisted.activeRoute, 'crew');
  assert.equal(persisted.drawerOpen, true);
  assert.equal(persisted.drawerWidth, 612);
  assert.equal(persisted.drawerHeight, 604);
  assert.equal(persisted.shelfLeft, 72);
  assert.equal(persisted.shelfTop, 188);
  assert.equal(persisted.spineMode, 'expanded');
  assert.equal(persisted.fullscreen, false, 'full-screen workspaces must not persist across sessions');

  __directiveShellLayoutTestHooks.clearMemory();
  const loaded = loadDirectiveShellLayout({ width: 1440, height: 900 });
  assert.equal(loaded.activeRoute, 'crew');
  assert.equal(loaded.drawerOpen, true);
  assert.equal(loaded.drawerWidth, 612);
  assert.equal(loaded.drawerHeight, 604);
  assert.equal(loaded.shelfLeft, 72);
  assert.equal(loaded.shelfTop, 188);
  assert.equal(loaded.spineMode, 'expanded');
  assert.equal(loaded.fullscreen, false);

  const reset = resetDirectiveShellLayout({ width: 1440, height: 900 });
  assert.equal(reset.drawerOpen, false);
  assert.equal(reset.shelfLeft, DIRECTIVE_SHELL_MARGIN);
  assert.equal(reset.shelfTop, Math.round((900 - defaultSpineHeight) / 2));
  assert.equal(reset.spineMode, 'compact');
  assert.equal(storage.snapshot().has(DIRECTIVE_SHELL_LAYOUT_STORAGE_KEY), false);

  console.log('Command spine layout tests passed.');
} finally {
  __directiveShellLayoutTestHooks.clearMemory();
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
  if (originalInnerWidth === undefined) delete globalThis.innerWidth;
  else globalThis.innerWidth = originalInnerWidth;
  if (originalInnerHeight === undefined) delete globalThis.innerHeight;
  else globalThis.innerHeight = originalInnerHeight;
}
