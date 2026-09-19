import assert from 'node:assert/strict';

import { installFakeDom } from './helpers/fake-dom.mjs';
import {
  resetPresetUpdateNotification,
  showPresetUpdateNotification,
} from '../../src/ui/preset-update-notification.js';

const document = installFakeDom();
const reminder = {
  title: 'Directive Preset update available',
  message: 'Install the latest bundled narration preset.',
  bundledVersion: '0.3.0',
};

const calls = [];
const handlers = {
  onOpen: async () => calls.push('open'),
  onLater: async () => calls.push('later'),
  onDisable: async () => calls.push('disable'),
};

const cards = () => document.documentElement.querySelectorAll('.directive-preset-update-notification');
const byAction = (action) => document.querySelector(`[data-notification-action="${action}"]`);

const shown = showPresetUpdateNotification(reminder, handlers);
assert.deepEqual(shown, { shown: true });
assert.equal(cards().length, 1);
assert.equal(document.querySelector('.directive-preset-update-notification-title').textContent, reminder.title);
assert.equal(document.querySelector('.directive-preset-update-notification-message').textContent, reminder.message);
assert.equal(document.querySelector('.directive-preset-update-notification-meta').textContent, 'Bundled preset 0.3.0');
assert.equal(byAction('open').textContent, 'Open Preset Settings');
assert.equal(byAction('later').textContent, 'Later');
assert.equal(byAction('disable').textContent, 'Stop Reminders');

showPresetUpdateNotification(reminder, handlers);
assert.equal(cards().length, 1, 'showing the same reminder twice replaces rather than duplicates the card');

await byAction('open').click();
assert.deepEqual(calls, ['open']);
assert.equal(cards().length, 0);
assert.equal(document.getElementById('directive-notifications'), null);

showPresetUpdateNotification(reminder, handlers);
await byAction('later').click();
assert.deepEqual(calls, ['open', 'later']);
assert.equal(document.getElementById('directive-notifications'), null);

showPresetUpdateNotification(reminder, handlers);
await byAction('disable').click();
assert.deepEqual(calls, ['open', 'later', 'disable']);
assert.equal(document.getElementById('directive-notifications'), null);

showPresetUpdateNotification(reminder, handlers);
assert.deepEqual(resetPresetUpdateNotification('test-reset'), { reset: true, reason: 'test-reset' });
assert.equal(document.getElementById('directive-notifications'), null);

const createElement = document.createElement.bind(document);
document.createElement = (...args) => {
  const element = createElement(...args);
  element.style.setProperty = (key, value) => { element.style[key] = value; };
  return element;
};
document.documentElement.style.setProperty = () => {};
globalThis.localStorage = { getItem: () => null, setItem() {} };

// Exercise the Settings action through the runtime shell, where installs are wired.
const {
  setDirectiveRuntimeApp,
  openDirectivePresetSettings,
} = await import('../../src/runtime/runtime-shell.js');
let installResult = { ok: true };
let installError = null;
let finishInstall;
setDirectiveRuntimeApp({
  getCurrentView: async () => ({
    directivePreset: {
      status: { state: 'behind', canInstall: true, actionLabel: 'Update Preset' },
      autoCheck: { enabled: true },
    },
  }),
  installDirectivePreset: async () => {
    await new Promise((resolve) => { finishInstall = resolve; });
    if (installError) throw installError;
    return installResult;
  },
});
await openDirectivePresetSettings({ highlight: false });
const installButton = () => document.documentElement.querySelectorAll('button').find((button) => button.children.some((child) => child.textContent === 'Update Preset'));
assert.ok(installButton(), 'Settings exposes the preset update action');

showPresetUpdateNotification(reminder, handlers);
let installing = installButton().click();
assert.equal(cards().length, 1, 'pending installation keeps the reminder visible');
finishInstall();
await installing;
assert.equal(cards().length, 0, 'successful Settings installation retires the stale reminder');
assert.equal(document.getElementById('directive-notifications'), null, 'successful installation releases the notification surface');

installResult = { ok: false };
showPresetUpdateNotification(reminder, handlers);
installing = installButton().click();
finishInstall();
await installing;
assert.equal(cards().length, 1, 'unsuccessful installation keeps the reminder visible');

installError = new Error('Preset save failed');
installing = installButton().click();
finishInstall();
await assert.rejects(installing, /Preset save failed/);
assert.equal(cards().length, 1, 'rejected installation keeps the reminder visible');
resetPresetUpdateNotification('test-cleanup');
setDirectiveRuntimeApp(null);

console.log('Preset update notification tests passed.');
