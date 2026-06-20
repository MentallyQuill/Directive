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
  __directiveRuntimeActionTestHooks,
  listRuntimeActions,
  registerRuntimeAction,
  runRuntimeAction
} from '../../src/runtime/runtime-actions.js';
import {
  DIRECTIVE_RUNTIME_PANEL_ID,
  DIRECTIVE_RUNTIME_TABS,
  __directiveRuntimeShellTestHooks
} from '../../src/runtime/runtime-shell.js';

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

  click() {
    const handler = this.eventListeners.get('click');
    if (handler) handler({ type: 'click', target: this });
  }

  matches(selector) {
    if (selector.startsWith('.')) {
      return this.classList.contains(selector.slice(1));
    }
    const dataMatch = /^\[data-([a-z0-9-]+)="([^"]+)"\]$/i.exec(selector);
    if (dataMatch) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return this.dataset[key] === dataMatch[2];
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

  addEventListener() {}
}

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
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
  'src/extension/runtime-mount.js',
  'src/extension/global-bridge.js',
  'src/hosts/sillytavern/bootstrap.js',
  'src/hosts/sillytavern/lifecycle.js',
  'src/hosts/sillytavern/shell-events.js',
  'src/runtime/runtime-actions.js',
  'src/runtime/runtime-shell.js',
  'src/runtime/runtime-app.mjs',
  'styles/directive.css'
]) {
  const legacyIdentifierPattern = new RegExp(`\\b${['sa', 'ga'].join('')}\\b`, 'i');
  assert(!legacyIdentifierPattern.test(await readText(relativePath)), `${relativePath} should not contain legacy project identifiers`);
}

const directiveCss = await readText('styles/directive.css');
const runtimePanelCss = /\.directive-runtime-panel\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
assert.match(runtimePanelCss, /\btop:\s*16px;/, 'desktop runtime panel should be anchored from the top');
assert.doesNotMatch(runtimePanelCss, /\bbottom:\s*16px;/, 'desktop runtime panel should not use bottom-control placement');
const runtimeBodyCss = /\.directive-runtime-body\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
assert.match(runtimeBodyCss, /\boverflow:\s*auto;/, 'runtime body should own scroll containment');
const routeLabelCss = /\.directive-mobile-bottom-label\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
assert.match(routeLabelCss, /\btext-overflow:\s*ellipsis;/, 'route labels should truncate instead of overflowing');
assert.match(routeLabelCss, /\bwhite-space:\s*nowrap;/, 'route labels should not wrap inside compact bottom navigation');
assert.match(directiveCss, /\.directive-icon-button:disabled/, 'top-right shell actions should expose disabled styling');

const fakeDocument = new FakeDocument();
globalThis.document = fakeDocument;

const menu = fakeDocument.createElement('div');
menu.id = 'extensionsMenu';
fakeDocument.body.appendChild(menu);

const placeholder = fakeDocument.createElement('div');
placeholder.id = 'extensionsMenuDefault';
menu.appendChild(placeholder);

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
assert.equal(menuButton.title, 'Open Directive.');
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

__directiveRuntimeActionTestHooks.clearRuntimeActions();
__directiveRuntimeShellTestHooks.reset();
configureRuntimeActions();
assert.deepEqual(
  listRuntimeActions().map((action) => action.id),
  ['runtime.show', 'runtime.hide', 'runtime.refresh', 'runtime.open', 'runtime.toggle', 'runtime.setTab', 'ui.refresh']
);

await runRuntimeAction('runtime.open');
const panel = fakeDocument.getElementById(DIRECTIVE_RUNTIME_PANEL_ID);
assert(panel, 'runtime.open should create the Directive runtime panel');
assert.equal(panel.hidden, false);
assert.equal(panel.classList.contains('directive-runtime-panel-open'), true);
assert.equal(panel.dataset.directiveShell, 'bottom-navigation');
assert.equal(panel.querySelectorAll('.directive-shell-actions').length, 1);
assert.equal(panel.querySelectorAll('.directive-shell-actions')[0].dataset.directiveShellActions, 'top-right');
const backButton = panel.querySelector('[data-shell-action="back"]');
assert.equal(backButton, null, 'runtime shell should not expose tab-history Back control');
assert.equal(panel.querySelector('[data-mobile-shell-action="back"]'), null, 'mobile shell should not expose tab-history Back control');
assert.equal(panel.querySelectorAll('.directive-mobile-bottom-tab').length, DIRECTIVE_RUNTIME_TABS.length);
assert.equal(panel.querySelectorAll('.directive-mobile-bottom-tab')[0].children.at(-1).textContent, 'Starships');
assert.equal(panel.querySelectorAll('.directive-mobile-bottom-tab')[0].getAttribute('aria-selected'), 'true');

await runRuntimeAction('runtime.setTab', { tabId: 'mission' });
assert.equal(__directiveRuntimeShellTestHooks.getActiveTab(), 'mission');
assert.equal(panel.querySelector('[data-shell-action="back"]'), null, 'route navigation should not create a Back control');
assert.equal(panel.querySelectorAll('.directive-mobile-bottom-tab')[1].getAttribute('aria-selected'), 'true');

await runRuntimeAction('runtime.setTab', { tabId: 'crew' });
assert.equal(__directiveRuntimeShellTestHooks.getActiveTab(), 'crew');
assert.equal(panel.querySelectorAll('.directive-mobile-bottom-tab')[2].getAttribute('aria-selected'), 'true');
assert.equal(panel.querySelector('[data-shell-action="back"]'), null, 'primary route navigation should remain direct-only');

await runRuntimeAction('runtime.hide');
assert.equal(panel.hidden, true);

__directiveRuntimeShellTestHooks.reset();
__directiveRuntimeActionTestHooks.clearRuntimeActions();
delete globalThis.document;

console.log('Extension shell tests passed: manifest, menu button, runtime actions, direct bottom-navigation shell');
