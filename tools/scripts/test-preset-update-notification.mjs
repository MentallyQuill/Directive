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

console.log('Preset update notification tests passed.');
