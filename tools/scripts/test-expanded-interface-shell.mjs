import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createDirectiveExpandedShell } from '../../src/ui/directive-expanded-shell.js';

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.classList = {
      add: (...names) => {
        const values = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => values.add(name));
        this.className = [...values].join(' ');
      }
    };
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener() {}
  click() { this.listeners.get('click')?.({ target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} }); }
  focus() { this.focused = true; }
  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (selector === '[data-route-id]' && child.dataset.routeId) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

globalThis.document = {
  createElement: (tagName) => new Element(tagName),
  createTextNode: (text) => Object.assign(new Element('#text'), { textContent: text })
};

const selected = [];
let closed = 0;
const shell = createDirectiveExpandedShell({
  id: 'directive-runtime-panel',
  routes: ['campaign', 'mission', 'people', 'ship', 'settings'].map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
  activeRouteId: 'mission',
  onSelectRoute: (id) => selected.push(id),
  onClose: () => { closed += 1; }
});

assert.match(shell.className, /directive-shell/);
assert.equal(shell.dataset.directiveShell, 'expanded');
assert.equal(shell.dataset.activeRoute, 'mission');

const routeButtons = shell.querySelectorAll('[data-route-id]');
assert.deepEqual(routeButtons.map((button) => button.dataset.routeId), ['campaign', 'mission', 'people', 'ship', 'settings']);
assert.equal(routeButtons[1].getAttribute('aria-selected'), 'true');
routeButtons[2].click();
assert.deepEqual(selected, ['people']);
const routeBar = shell.children[1].children.at(-1);
routeBar.listeners.get('keydown')?.({ key: 'ArrowRight', target: routeButtons[1], preventDefault() {} });
assert.equal(routeButtons[2].focused, true);
assert.deepEqual(selected, ['people', 'people'], 'arrow navigation should focus and activate the next primary route');

const all = [];
const visit = (node) => { all.push(node); (node.children || []).forEach(visit); };
visit(shell);
assert.equal(all.some((node) => /command-spine|command-drawer|resize/.test(node.className)), false);
assert.equal(all.some((node) => node.dataset?.shellAction === 'back'), false);
assert.equal(all.filter((node) => node.dataset?.shellAction === 'close').length, 1);
all.find((node) => node.dataset?.shellAction === 'close').click();
assert.equal(closed, 1);
assert.ok(all.some((node) => node.dataset?.directiveRuntimeBody === 'true'));

const runtimeShellSource = fs.readFileSync(new URL('../../src/runtime/runtime-shell.js', import.meta.url), 'utf8');
const runtimeMountSource = fs.readFileSync(new URL('../../src/extension/runtime-mount.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../styles/directive.css', import.meta.url), 'utf8');
assert.match(runtimeShellSource, /createDirectiveExpandedShell/);
assert.doesNotMatch(runtimeShellSource, /directive-command-spine-shell|directive-shell-layout/);
assert.doesNotMatch(runtimeMountSource, /toggleDrawer|toggleFullscreen|resetLayout|command spine|route drawer|Directive drawer/i);
assert.match(css, /\.directive-runtime-panel\.directive-expanded-shell\s*\{[\s\S]*?position:\s*fixed\s*!important;[\s\S]*?inset:\s*0\s*!important;[\s\S]*?height:\s*100dvh\s*!important;[\s\S]*?overflow:\s*hidden\s*!important;/);
assert.match(css, /\.directive-runtime-panel\.directive-expanded-shell\s*\{[\s\S]*?transform:\s*none\s*!important;/);
assert.match(css, /\.directive-runtime-panel\.directive-expanded-shell::before,\s*\.directive-runtime-panel\.directive-expanded-shell::after\s*\{[\s\S]*?content:\s*none\s*!important;[\s\S]*?display:\s*none\s*!important;/);
assert.match(css, /\.directive-runtime-panel\.directive-expanded-shell\s*\{[\s\S]*?grid-template-columns:\s*40px\s+minmax\(0,\s*1fr\)/);
assert.match(css, /\.directive-runtime-panel\.directive-expanded-shell\s*\{[\s\S]*?grid-template-rows:\s*minmax\(0,\s*1fr\)\s*!important;/);
assert.match(css, /\.directive-expanded-shell \.directive-route-bar\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.directive-runtime-panel\.directive-expanded-shell\s*\{[\s\S]*?grid-template-columns:\s*24px\s+minmax\(0,\s*1fr\)/);
assert.match(css, /scrollbar-width:\s*thin/);
assert.match(css, /::-webkit-scrollbar\s*\{[\s\S]*?width:\s*7px/);

console.log('Expanded interface shell tests passed.');
