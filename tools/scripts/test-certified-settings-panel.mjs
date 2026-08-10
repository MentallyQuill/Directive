import assert from 'node:assert/strict';
import { renderSettingsPanel, resetSettingsPanelState } from '../../src/ui/settings-panel.js';

class Element {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase(); this.children = []; this.dataset = {}; this.attributes = new Map(); this.listeners = new Map();
    this.className = ''; this.textContent = ''; this.value = ''; this.checked = false; this.hidden = false;
    this.classList = { add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); }, remove: () => {} };
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
}

globalThis.document = { createElement: (tagName) => new Element(tagName), createTextNode: (text) => Object.assign(new Element('#text'), { textContent: text }) };

const body = new Element('div');
resetSettingsPanelState();
renderSettingsPanel(body, {
  activeSaveId: 'save.current',
  directivePreset: { status: { state: 'current', pill: 'Current', installedVersion: '1.0.0', bundledVersion: '1.0.0', canInstall: true }, autoCheck: { enabled: true } },
  providerConfiguration: {
    profiles: [{ id: 'profile.utility', label: 'Utility', model: 'utility-model' }],
    settings: { utility: { provider: 'profile', profileId: 'profile.utility' }, reasoning: { provider: 'st' } },
    status: { utility: { ready: true }, reasoning: { ready: true } }
  }
}, {
  updateProviderSettings() {}, testProvider() {}, installDirectivePreset() {}, refreshDirectivePresetStatus() {},
  updateDirectivePresetAutoCheck() {}, verifyActiveSave() {}, exportSupportDiagnostics() {}
});

const all = (root) => [root, ...root.children.flatMap(all)];
const nodes = all(body);
const byClass = (className) => nodes.filter((node) => node.className.split(/\s+/).includes(className));
const text = nodes.map((node) => node.textContent || '').join(' ');

assert.equal(byClass('settings-layout').length, 1);
assert.equal(nodes.filter((node) => node.dataset.directiveScrollOwner === 'true').length, 1);
assert.match(text, /General/);
assert.match(text, /Advanced/);
assert.match(text, /Directive preset/);
assert.match(text, /Verify active save/);
assert.match(text, /Export support bundle/);
assert.doesNotMatch(text, /reconciliation|continuity|sidecar|tutorial|prompt hash/i);

console.log('PASS certified Settings panel');
