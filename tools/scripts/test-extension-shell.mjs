import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  directiveOnActivate,
  directiveOnClean,
  directiveOnDelete,
  directiveOnDisable,
  directiveOnEnable,
  directiveOnInstall,
  directiveOnUpdate
} from '../../src/extension/lifecycle.js';
import { installExtensionsMenuButton } from '../../src/extension/menu-button.js';
import { configureRuntimeActions } from '../../src/extension/runtime-mount.js';
import {
  DIRECTIVE_OPEN_RUNTIME_BUTTON_ID,
  DIRECTIVE_RESET_WINDOW_BUTTON_ID,
  DIRECTIVE_SETTINGS_PANEL_ID,
  installExtensionsMenuDropdown
} from '../../src/extension/settings-panel.js';
import {
  __directiveRuntimeActionTestHooks,
  listRuntimeActions,
  registerRuntimeAction,
  runRuntimeAction
} from '../../src/runtime/runtime-actions.js';
import {
  DIRECTIVE_RUNTIME_PANEL_ID,
  DIRECTIVE_RUNTIME_TABS,
  __directiveRuntimeShellTestHooks,
  setDirectiveRuntimeApp
} from '../../src/runtime/runtime-shell.js';
import { renderCrewPanel, resetCrewPanelState } from '../../src/ui/crew-panel.js';
import { renderCampaignPanel, resetCampaignPanelState } from '../../src/ui/campaign-panel.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  syncFromString(value) {
    this.values = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  syncToElement() {
    this.element._className = [...this.values].join(' ');
  }

  add(...classes) {
    for (const className of classes) {
      if (className) this.values.add(className);
    }
    this.syncToElement();
  }

  remove(...classes) {
    for (const className of classes) {
      this.values.delete(className);
    }
    this.syncToElement();
  }

  toggle(className, force) {
    if (force === true) {
      this.values.add(className);
    } else if (force === false) {
      this.values.delete(className);
    } else if (this.values.has(className)) {
      this.values.delete(className);
    } else {
      this.values.add(className);
    }
    this.syncToElement();
    return this.values.has(className);
  }

  contains(className) {
    return this.values.has(className);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.parentNode = null;
    this.dataset = {};
    this.textContent = '';
    this.title = '';
    this.type = '';
    this.hidden = false;
    this._id = '';
    this._className = '';
    this.classList = new FakeClassList(this);
    this.style = {
      values: new Map(),
      setProperty(name, value) {
        this.values.set(name, String(value));
        this[name] = String(value);
      }
    };
  }

  get id() {
    return this._id;
  }

  set id(value) {
    this._id = String(value || '');
    this.ownerDocument.registerElement(this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value || '');
    this.classList.syncFromString(this._className);
  }

  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === 'id') this.id = normalized;
    if (name === 'class') this.className = normalized;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = normalized;
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  append(...nodes) {
    for (const node of nodes) {
      this.appendChild(node);
    }
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    this.ownerDocument.registerTree(node);
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of [...this.children]) {
      this.ownerDocument.unregisterTree(child);
      child.parentNode = null;
    }
    this.children = [];
    this.textContent = '';
    this.append(...nodes);
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    }
    this.ownerDocument.unregisterTree(this);
    this.parentNode = null;
  }

  addEventListener(type, handler) {
    this.eventListeners.set(type, handler);
  }

  setPointerCapture() {}

  closest(selector) {
    const selectors = String(selector || '').split(',').map((part) => part.trim()).filter(Boolean);
    let node = this;
    while (node) {
      if (selectors.some((part) => node.matches(part))) return node;
      node = node.parentNode;
    }
    return null;
  }

  getBoundingClientRect() {
    const readNumber = (name, fallback) => {
      const value = this.style?.values?.get(name) ?? this.style?.[name];
      const number = Number.parseFloat(value);
      return Number.isFinite(number) ? number : fallback;
    };
    return {
      left: readNumber('--directive-shell-left', readNumber('left', 16)),
      top: readNumber('--directive-shell-top', readNumber('top', 250)),
      width: readNumber('--directive-spine-width', readNumber('width', 52)),
      height: readNumber('--directive-spine-height', readNumber('height', 400))
    };
  }

  click() {
    const handler = this.eventListeners.get('click');
    if (handler) {
      handler({
        type: 'click',
        target: this,
        currentTarget: this,
        preventDefault() {},
        stopPropagation() {}
      });
    }
  }

  matches(selector) {
    if (/^[a-z]+$/i.test(selector)) {
      return this.tagName.toLowerCase() === selector.toLowerCase();
    }
    if (selector.startsWith('#')) {
      return this.id === selector.slice(1);
    }
    if (selector.startsWith('.')) {
      return this.classList.contains(selector.slice(1));
    }
    const dataMatch = /^\[data-([a-z0-9-]+)="([^"]+)"\]$/i.exec(selector);
    if (dataMatch) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return this.dataset[key] === dataMatch[2];
    }
    const dataPresenceMatch = /^\[data-([a-z0-9-]+)\]$/i.exec(selector);
    if (dataPresenceMatch) {
      const key = dataPresenceMatch[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return this.dataset[key] != null;
    }
    const attributeMatch = /^\[([a-z0-9-]+)="([^"]+)"\]$/i.exec(selector);
    if (attributeMatch) {
      return this.getAttribute(attributeMatch[1]) === attributeMatch[2];
    }
    if (selector === '[data-directive-runtime-body="true"]') {
      return this.dataset.directiveRuntimeBody === 'true';
    }
    return false;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (child.matches(selector)) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

class FakeDocument {
  constructor() {
    this.elementsById = new Map();
    this.body = new FakeElement('body', this);
    this.documentElement = new FakeElement('html', this);
    this.readyState = 'complete';
    this.eventListeners = new Map();
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  registerElement(element) {
    if (element.id) {
      this.elementsById.set(element.id, element);
    }
  }

  registerTree(element) {
    this.registerElement(element);
    for (const child of element.children) {
      this.registerTree(child);
    }
  }

  unregisterTree(element) {
    if (element.id && this.elementsById.get(element.id) === element) {
      this.elementsById.delete(element.id);
    }
    for (const child of element.children) {
      this.unregisterTree(child);
    }
  }

  addEventListener(type, handler) {
    const handlers = this.eventListeners.get(type) || new Set();
    handlers.add(handler);
    this.eventListeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = this.eventListeners.get(type);
    handlers?.delete(handler);
  }

  dispatchEvent(type, event = {}) {
    for (const handler of this.eventListeners.get(type) || []) {
      handler({ type, ...event });
    }
  }
}

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

function createCampaignResetView() {
  const packageTemplate = (packageId, title, selected = false) => ({
    packageId,
    title,
    selected,
    source: selected ? 'bundled' : 'imported',
    campaign: {
      title,
      highConcept: `${title} opens with a missing convoy and a signal no one will claim.\n\nThe Breckinridge arrives with orders to keep the Reach from turning suspicion into weapons fire.\n\nEvery witness has a reason to hide the one fact that matters.`,
      eraLabel: 'During VOY, after DS9',
      structure: {
        expectedLength: '2 sessions',
        mainChapterCount: 1,
        openOrdersCount: 0
      }
    },
    ship: {
      id: 'uss-breckinridge',
      name: 'USS Breckinridge',
      class: 'Intrepid'
    },
    playerRole: {
      rank: 'Commander',
      billet: 'Executive Officer'
    },
    runtimeAssets: {
      hasProjection: true,
      missionGraphCount: 1
    },
    diagnostics: {
      status: 'ready',
      issueCount: 0
    },
    counts: {
      saves: 2
    },
    seniorCrewPreview: []
  });

  return {
    activePackage: {
      packageId: 'pack-alpha',
      package: {
        id: 'pack-alpha'
      },
      manifest: {
        id: 'pack-alpha'
      }
    },
    campaignState: {
      campaign: {
        title: 'Ashes of Peace'
      }
    },
    campaign: {
      activeSaveId: 'save-current',
      packages: [
        packageTemplate('pack-alpha', 'Alpha Campaign', true),
        packageTemplate('pack-beta', 'Beta Campaign')
      ],
      saves: [
        {
          id: 'save-current',
          name: 'Current Save',
          current: true,
          slotType: 'manual',
          updatedAt: '2026-06-20T12:00:00.000Z',
          revision: 1,
          metadata: {
            campaignTitle: 'Alpha Campaign',
            summary: 'Current save summary.'
          }
        },
        {
          id: 'save-branch',
          name: 'Branch Save',
          current: false,
          slotType: 'manual',
          updatedAt: '2026-06-20T13:00:00.000Z',
          revision: 2,
          metadata: {
            campaignTitle: 'Alpha Campaign',
            summary: 'Branch save summary.'
          }
        }
      ]
    }
  };
}

function createCrewResetView() {
  return {
    activePackage: {
      crew: {
        senior: [
          {
            id: 'mara-whitaker',
            name: 'Mara Whitaker',
            rank: 'Captain',
            billet: 'Commanding Officer',
            species: 'Human',
            packageRole: 'Command authority'
          },
          {
            id: 'jalen-orr',
            name: 'Jalen Orr',
            rank: 'Lieutenant Commander',
            billet: 'Operations Officer',
            species: 'Trill',
            packageRole: 'Operations lead'
          }
        ]
      }
    },
    campaignState: {
      player: {
        name: 'Player Commander'
      },
      crew: {
        seniorCrewIds: ['mara-whitaker', 'jalen-orr'],
        relationshipModel: true
      },
      relationships: {
        seniorCrew: []
      }
    }
  };
}

const manifest = JSON.parse(await readText('manifest.json'));
assert.equal(manifest.display_name, 'Directive');
assert.equal(manifest.version, '0.1.0-pre-alpha.1');
assert.equal(manifest.key, 'directive');
assert.equal(manifest.js, 'src/extension/index.js');
assert.equal(manifest.css, 'styles/directive.css');
assert.deepEqual(Object.values(manifest.hooks), [
  'directiveOnInstall',
  'directiveOnUpdate',
  'directiveOnDelete',
  'directiveOnClean',
  'directiveOnEnable',
  'directiveOnDisable',
  'directiveOnActivate'
]);

for (const hook of [
  directiveOnInstall,
  directiveOnUpdate,
  directiveOnDelete,
  directiveOnClean,
  directiveOnEnable,
  directiveOnDisable,
  directiveOnActivate
]) {
  assert.equal(typeof hook, 'function', 'manifest hook should be exported');
}

for (const relativePath of [
  'manifest.json',
  'src/extension/index.js',
  'src/extension/bootstrap.js',
  'src/extension/lifecycle.js',
  'src/extension/menu-button.js',
  'src/extension/settings-panel.js',
  'src/extension/runtime-mount.js',
  'src/extension/global-bridge.js',
  'src/hosts/sillytavern/bootstrap.js',
  'src/hosts/sillytavern/directive-assist-button.js',
  'src/hosts/sillytavern/lifecycle.js',
  'src/hosts/sillytavern/shell-events.js',
  'src/runtime/runtime-actions.js',
  'src/runtime/runtime-shell.js',
  'src/runtime/runtime-app.mjs',
  'src/ui/directive-command-spine-shell.js',
  'src/ui/directive-shell-layout.mjs',
  'styles/directive.css'
]) {
  const legacyIdentifierPattern = new RegExp(`\\b${['sa', 'ga'].join('')}\\b`, 'i');
  assert(!legacyIdentifierPattern.test(await readText(relativePath)), `${relativePath} should not contain legacy project identifiers`);
}

const directiveCss = await readText('styles/directive.css');
const commandSpineCss = /\.directive-runtime-panel\.directive-command-spine-shell\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
assert.match(commandSpineCss, /--directive-shell-left:\s*16px;/, 'desktop command spine should default to the left edge');
assert.match(commandSpineCss, /--directive-shell-top:\s*calc\(\(100dvh - var\(--directive-spine-height\)\) \/ 2\);/, 'desktop command spine should default to vertical center');
assert.match(commandSpineCss, /\bleft:\s*var\(--directive-shell-left\)\s*!important;/, 'desktop command spine should use persisted horizontal shelf geometry');
assert.match(commandSpineCss, /\btop:\s*var\(--directive-shell-top\)\s*!important;/, 'desktop command spine should use persisted vertical shelf geometry');
assert.match(commandSpineCss, /\bwidth:\s*var\(--directive-spine-width\)/, 'desktop shell width should collapse to the command spine');
assert.match(commandSpineCss, /--directive-spine-height:\s*min\(400px,\s*calc\(100dvh - 32px\)\);/, 'desktop shelf should own a stable height independent of drawer resizing');
assert.match(commandSpineCss, /\bheight:\s*var\(--directive-spine-height\)\s*!important;/, 'desktop shelf height should not follow the resizable drawer height');
assert.doesNotMatch(commandSpineCss, /\bheight:\s*min\(var\(--directive-drawer-height\)/, 'desktop shelf must not resize with the drawer');
const commandDrawerCss = [...directiveCss.matchAll(/\.directive-command-spine-shell \.directive-command-drawer\s*\{(?<body>[\s\S]*?)\}/g)]
  .map((match) => match.groups?.body || '')
  .find((body) => /container-type:\s*inline-size;/.test(body)) || '';
assert.match(commandDrawerCss, /\bcontainer-type:\s*inline-size;/, 'command drawer should be the responsive container for resized route content');
const commandDrawerBodyCss = /\.directive-command-spine-shell \.directive-command-drawer-body\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
assert.match(commandDrawerBodyCss, /overflow-y:\s*auto\s*!important;/, 'command drawer body should own scroll containment');
const resizeHandleCss = /\.directive-command-spine-shell \.directive-command-drawer-resize-handle\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
assert.match(resizeHandleCss, /\bbottom:\s*-1px;/, 'drawer resize handle should sit on the bottom edge');
const resizeHandleLeftCss = /\.directive-command-spine-shell \.directive-command-drawer-resize-handle-left\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
assert.equal(resizeHandleLeftCss, '', 'drawer should not style a bottom-left resize handle');
const resizeHandleRightCss = /\.directive-command-spine-shell \.directive-command-drawer-resize-handle-right\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
assert.match(resizeHandleRightCss, /\bright:\s*-1px;/, 'right drawer resize handle should be on the bottom-right corner');
assert.match(directiveCss, /\.directive-command-spine-shell \.directive-command-drawer-resize-handle-right \.directive-command-drawer-resize-icon\s*\{[\s\S]*?transform:\s*scaleX\(-1\);/, 'right drawer resize glyph should face the bottom-right corner');
assert.match(directiveCss, /\.directive-command-spine-shell\.directive-runtime-fullscreen/, 'dense workflows should expose a full-screen workspace mode');
assert.match(directiveCss, /\.directive-command-spine-shell \.directive-command-mobile-nav/, 'mobile fallback should retain bottom-route navigation');
assert.match(directiveCss, /\.directive-icon-button:disabled/, 'drawer header actions should expose disabled styling');
assert.match(directiveCss, /\.directive-extension-dropdown-title/, 'extensions settings drawer should expose Directive title styling');
assert.match(directiveCss, /\.directive-runtime-window-actions/, 'extensions settings drawer should style runtime action buttons');

const fakeDocument = new FakeDocument();
globalThis.document = fakeDocument;

const menu = fakeDocument.createElement('div');
menu.id = 'extensionsMenu';
fakeDocument.body.appendChild(menu);

const settingsContainer = fakeDocument.createElement('div');
settingsContainer.id = 'extensions_settings2';
fakeDocument.body.appendChild(settingsContainer);

const placeholder = fakeDocument.createElement('div');
placeholder.id = 'extensionsMenuDefault';
menu.appendChild(placeholder);

resetCampaignPanelState();
const campaignView = createCampaignResetView();
let campaignBody = fakeDocument.createElement('div');
renderCampaignPanel(campaignBody, campaignView, {
  refresh() {},
  loadGame() {},
  setActiveTab() {}
});
let hookToggle = campaignBody.querySelector('.directive-starship-briefing-hook-toggle');
let hookMore = campaignBody.querySelector('.directive-starship-briefing-hook-more');
assert(hookToggle, 'Campaign briefing should expose an expandable hook toggle for multi-paragraph hooks');
assert.equal(hookToggle.getAttribute('aria-expanded'), 'false');
assert.equal(hookMore.hidden, true);
hookToggle.click();
assert.equal(hookToggle.getAttribute('aria-expanded'), 'true');
assert.equal(hookMore.hidden, false);
assert.equal(hookToggle.children[1].textContent, 'Less');
campaignBody.querySelector('[data-campaign-subtab-target="directive-campaign-records-section"]').click();
campaignBody.querySelectorAll('.directive-starship-library-row')[1].click();
campaignBody.querySelectorAll('.directive-starship-save-row')[1].click();
assert.equal(campaignBody.querySelector('.directive-campaign-section-active').id, 'directive-campaign-records-section');
assert.equal(campaignBody.querySelectorAll('.directive-starship-library-row')[1].getAttribute('aria-pressed'), 'true');
assert.equal(campaignBody.querySelectorAll('.directive-starship-save-row')[1].getAttribute('aria-pressed'), 'true');
resetCampaignPanelState();
campaignBody = fakeDocument.createElement('div');
renderCampaignPanel(campaignBody, campaignView, {
  refresh() {},
  loadGame() {},
  setActiveTab() {}
});
assert.equal(campaignBody.querySelector('.directive-campaign-section-active').id, 'directive-campaign-command-section');
assert.equal(campaignBody.querySelectorAll('.directive-starship-library-row')[0].getAttribute('aria-pressed'), 'true');
assert.equal(campaignBody.querySelectorAll('.directive-starship-save-row')[0].getAttribute('aria-pressed'), 'true');

resetCrewPanelState();
const crewView = createCrewResetView();
let crewBody = fakeDocument.createElement('div');
renderCrewPanel(crewBody, crewView);
crewBody.querySelector('[data-crew-id="jalen-orr"]').click();
assert.equal(crewBody.querySelector('.directive-crew-roster-row-active').dataset.crewId, 'jalen-orr');
resetCrewPanelState();
crewBody = fakeDocument.createElement('div');
renderCrewPanel(crewBody, crewView);
assert.equal(crewBody.querySelector('.directive-crew-roster-row-active').dataset.crewId, 'mara-whitaker');

let openCount = 0;
__directiveRuntimeActionTestHooks.clearRuntimeActions();
registerRuntimeAction('runtime.open', () => {
  openCount += 1;
});

installExtensionsMenuButton();
const menuButton = fakeDocument.getElementById('directive-extensions-menu-button');
assert(menuButton, 'Directive should install an extensions-menu button');
assert.equal(fakeDocument.getElementById('extensionsMenuDefault'), null);
assert.equal(menu.children.includes(menuButton), true);
assert.equal(menuButton.className, 'list-group-item flex-container flexGap5 interactable');
assert.equal(menuButton.title, 'Open Directive command spine.');
assert.equal(menuButton.children[0].className, 'fa-solid fa-compass directive-extensions-menu-icon');
assert.equal(menuButton.children[1].textContent, 'Directive');
menuButton.click();
assert.equal(openCount, 1);

installExtensionsMenuButton();
assert.equal(
  menu.children.filter((child) => child.id === 'directive-extensions-menu-button').length,
  1,
  'Directive should not install duplicate menu buttons'
);

installExtensionsMenuDropdown();
const settingsPanel = fakeDocument.getElementById(DIRECTIVE_SETTINGS_PANEL_ID);
assert(settingsPanel, 'Directive should install a SillyTavern extensions settings dropdown');
assert.equal(settingsContainer.children.includes(settingsPanel), true);
assert.equal(settingsPanel.className, 'directive-settings');
assert.equal(settingsPanel.querySelectorAll('.inline-drawer').length, 1);
assert.equal(settingsPanel.querySelectorAll('.directive-extension-dropdown-title').length, 1);
assert.equal(settingsPanel.querySelectorAll('.directive-extension-dropdown-title')[0].children[0].className, 'fa-solid fa-compass directive-extensions-menu-icon');
assert.equal(settingsPanel.querySelectorAll('.directive-extension-dropdown-title')[0].children[1].textContent, 'Directive');
const openRuntimeButton = fakeDocument.getElementById(DIRECTIVE_OPEN_RUNTIME_BUTTON_ID);
assert(openRuntimeButton, 'Directive settings dropdown should expose Open Runtime');
assert.equal(openRuntimeButton.className, 'menu_button interactable');
assert.equal(openRuntimeButton.title, 'Open the Directive runtime.');
assert.equal(openRuntimeButton.children[0].className, 'fa-solid fa-up-right-from-square');
assert.equal(openRuntimeButton.children[1].textContent, 'Open Runtime');
assert.equal(fakeDocument.getElementById(DIRECTIVE_RESET_WINDOW_BUTTON_ID), null, 'Reset Window should stay hidden until a runtime reset-layout action exists');
openRuntimeButton.click();
assert.equal(openCount, 2);

let resetCount = 0;
registerRuntimeAction('runtime.resetLayout', () => {
  resetCount += 1;
});
installExtensionsMenuDropdown();
const resetWindowButton = fakeDocument.getElementById(DIRECTIVE_RESET_WINDOW_BUTTON_ID);
assert(resetWindowButton, 'Directive settings dropdown should expose Reset Window only when reset layout is registered');
assert.equal(resetWindowButton.className, 'menu_button interactable');
assert.equal(resetWindowButton.title, 'Reset the Directive runtime window to its default layout.');
assert.equal(resetWindowButton.children[0].className, 'fa-solid fa-arrows-rotate');
assert.equal(resetWindowButton.children[1].textContent, 'Reset Window');
resetWindowButton.click();
assert.equal(resetCount, 1);

installExtensionsMenuDropdown();
assert.equal(
  settingsContainer.children.filter((child) => child.id === DIRECTIVE_SETTINGS_PANEL_ID).length,
  1,
  'Directive should not install duplicate settings dropdowns'
);

__directiveRuntimeActionTestHooks.clearRuntimeActions();
__directiveRuntimeShellTestHooks.reset();
configureRuntimeActions();
let runtimeUiResetCount = 0;
setDirectiveRuntimeApp({
  async getCurrentView() {
    return {
      activeScreen: 'campaign',
      campaign: {
        packages: [],
        saves: []
      },
      campaignState: null
    };
  },
  async resetRuntimeUiState() {
    runtimeUiResetCount += 1;
    return {
      activeScreen: 'campaign'
    };
  }
});
assert.deepEqual(
  listRuntimeActions().map((action) => action.id),
  ['runtime.show', 'runtime.hide', 'runtime.refresh', 'runtime.open', 'runtime.toggle', 'runtime.setTab', 'runtime.toggleDrawer', 'runtime.toggleFullscreen', 'runtime.resetLayout', 'ui.refresh', 'assist.run']
);

await runRuntimeAction('runtime.open');
const panel = fakeDocument.getElementById(DIRECTIVE_RUNTIME_PANEL_ID);
assert(panel, 'runtime.open should create the Directive runtime panel');
assert.equal(panel.hidden, false);
assert.equal(panel.classList.contains('directive-runtime-panel-open'), true);
assert.equal(panel.dataset.directiveShell, 'command-spine');
assert.equal(panel.querySelectorAll('.directive-command-spine').length, 1);
assert.equal(panel.querySelectorAll('.directive-command-drawer').length, 1);
assert.equal(panel.querySelectorAll('[data-directive-shelf-drag-handle="true"]').length, 2, 'shelf should expose drag handles on the spine brand and drawer title');
assert.equal(panel.querySelectorAll('.directive-spine-brand-logo').length, 1, 'spine brand should render the branded logo asset slot');
assert.equal(panel.querySelector('.directive-spine-brand-mark'), null, 'spine brand should not keep the old D letter mark');
assert.equal(panel.querySelectorAll('.directive-command-drawer-resize-handle').length, 1, 'drawer should expose one bottom-right resize handle');
assert.equal(panel.querySelectorAll('.directive-command-drawer-resize-handle-left').length, 0, 'drawer should not expose a bottom-left resize handle');
assert.equal(panel.querySelectorAll('.directive-command-drawer-resize-handle-right')[0].dataset.directiveDrawerResizeEdge, 'right');
assert.equal(panel.querySelectorAll('.directive-spine-route').length, DIRECTIVE_RUNTIME_TABS.length);
assert.deepEqual(
  Array.from(panel.querySelectorAll('.directive-spine-route')).map((button) => button.dataset.routeTone),
  DIRECTIVE_RUNTIME_TABS.map((route) => route.id),
  'desktop command spine should expose route tone metadata for shelf color tokens'
);
assert.equal(panel.querySelectorAll('.directive-shell-actions').length, 1);
assert.equal(panel.querySelectorAll('.directive-shell-actions')[0].dataset.directiveShellActions, 'drawer-header');
assert.equal(panel.querySelector('[data-shell-action="back"]'), null, 'runtime shell should not expose tab-history Back control');
assert.equal(panel.querySelectorAll('.directive-mobile-bottom-tab').length, DIRECTIVE_RUNTIME_TABS.length, 'mobile fallback should remain available');
assert.deepEqual(
  Array.from(panel.querySelectorAll('.directive-mobile-bottom-tab')).map((button) => button.dataset.routeTone),
  DIRECTIVE_RUNTIME_TABS.map((route) => route.id),
  'mobile command shelf should expose route tone metadata for bottom-shelf color tokens'
);
assert.equal(panel.querySelectorAll('.directive-mobile-bottom-tab')[0].children.at(-1).textContent, 'Campaign');
assert.equal(panel.querySelectorAll('.directive-mobile-bottom-tab')[0].getAttribute('aria-selected'), 'true');
assert.equal(panel.dataset.drawerOpen, 'false', 'desktop shelf should open with its drawer collapsed');
assert.equal(panel.querySelector('.directive-command-drawer').hidden, true);

const shelfDragHandle = panel.querySelectorAll('[data-directive-shelf-drag-handle="true"]')[0];
const dragStart = shelfDragHandle.eventListeners.get('pointerdown');
assert.equal(typeof dragStart, 'function', 'shelf drag handle should install a pointer gesture');
dragStart({
  button: 0,
  clientX: 16,
  clientY: 250,
  target: shelfDragHandle,
  currentTarget: shelfDragHandle,
  pointerId: 1,
  preventDefault() {},
  stopPropagation() {}
});
fakeDocument.dispatchEvent('pointermove', { clientX: 116, clientY: 310, preventDefault() {} });
fakeDocument.dispatchEvent('pointerup');
assert.equal(__directiveRuntimeShellTestHooks.getLayout().shelfLeft, 116, 'dragging the shelf handle should update persisted horizontal geometry');
assert.equal(__directiveRuntimeShellTestHooks.getLayout().shelfTop, 310, 'dragging the shelf handle should update persisted vertical geometry');
assert.equal(panel.dataset.shelfLeft, '116');
assert.equal(panel.dataset.shelfTop, '310');

await runRuntimeAction('runtime.setTab', { tabId: 'mission' });
assert.equal(__directiveRuntimeShellTestHooks.getActiveTab(), 'mission');
assert.equal(panel.dataset.drawerOpen, 'true');
assert.equal(panel.querySelector('.directive-command-drawer').hidden, false);
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].getAttribute('aria-selected'), 'true');
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].getAttribute('aria-expanded'), 'true');
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].classList.contains('directive-spine-route-selected'), true);
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].classList.contains('directive-spine-route-active'), true);
assert.equal(panel.querySelectorAll('.directive-mobile-bottom-tab')[1].getAttribute('aria-selected'), 'true');

await runRuntimeAction('runtime.toggleDrawer', { tabId: 'mission' });
assert.equal(panel.dataset.drawerOpen, 'false', 'selecting the active open route should close the single drawer');
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].getAttribute('aria-selected'), 'true', 'collapsed current route should remain selected');
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].getAttribute('aria-expanded'), 'false', 'collapsed current route should no longer be expanded');
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].classList.contains('directive-spine-route-selected'), true, 'collapsed current route should keep the selected shelf fill');
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].classList.contains('directive-spine-route-active'), false, 'collapsed current route should drop the active drawer connector');
await runRuntimeAction('runtime.toggleDrawer', { tabId: 'crew' });
assert.equal(__directiveRuntimeShellTestHooks.getActiveTab(), 'crew');
assert.equal(panel.dataset.drawerOpen, 'true');
assert.equal(panel.querySelectorAll('.directive-mobile-bottom-tab')[2].getAttribute('aria-selected'), 'true');

await runRuntimeAction('runtime.toggleFullscreen', { fullscreen: true });
assert.equal(panel.dataset.fullscreen, 'true');
assert.equal(panel.classList.contains('directive-runtime-fullscreen'), true);
await runRuntimeAction('runtime.toggleFullscreen', { fullscreen: false });
assert.equal(panel.dataset.fullscreen, 'false');

await runRuntimeAction('runtime.resetLayout');
assert.equal(__directiveRuntimeShellTestHooks.getActiveTab(), 'campaign');
assert.equal(panel.dataset.drawerOpen, 'false');
assert.equal(__directiveRuntimeShellTestHooks.getLayout().spineMode, 'compact');
assert.equal(__directiveRuntimeShellTestHooks.getLayout().shelfLeft, 16);
assert.equal(__directiveRuntimeShellTestHooks.getLayout().drawerWidth, 615);
assert.equal(__directiveRuntimeShellTestHooks.getLayout().drawerHeight, 684);
assert.equal(runtimeUiResetCount, 1, 'Reset Window should reset transient runtime-app UI state');

await runRuntimeAction('runtime.hide');
assert.equal(panel.hidden, true);

__directiveRuntimeShellTestHooks.reset();
__directiveRuntimeActionTestHooks.clearRuntimeActions();
delete globalThis.document;

console.log('Extension shell tests passed: manifest, extension controls, runtime actions, command spine, resizable drawer, full-screen workspace');
