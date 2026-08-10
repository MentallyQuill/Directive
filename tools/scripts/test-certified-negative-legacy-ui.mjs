import assert from 'node:assert/strict';
import { renderSettingsPanel } from '../../src/ui/settings-panel.js';

class Element {
  constructor(tagName) { this.tagName = tagName; this.children = []; this.dataset = {}; this.attributes = new Map(); this.listeners = new Map(); this.className = ''; this.textContent = ''; this.value = ''; this.classList = { add() {}, remove() {} }; }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
}
globalThis.document = { createElement: (tagName) => new Element(tagName), createTextNode: (text) => Object.assign(new Element('#text'), { textContent: text }) };

const body = new Element('div');
renderSettingsPanel(body, { activeSaveId: 'save.current', directivePreset: {}, providerConfiguration: {} }, {});
const text = ((walk) => walk(body).map((node) => node.textContent || '').join(' '))(
  (root) => [root, ...root.children.flatMap((child) => [child, ...child.children.flatMap(function visit(node) { return [node, ...node.children.flatMap(visit)]; })])]
);
for (const prohibited of [
  'Scene Reconciliation', 'Outcome Integrity', 'Open Threads', 'Open World', 'Directive Assist', 'Load Campaign', 'Save Game As'
]) {
  assert.equal(text.includes(prohibited), false, `${prohibited} must not return to certified V1 UI`);
}

console.log('PASS certified negative legacy UI audit');
