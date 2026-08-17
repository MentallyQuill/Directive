import assert from 'node:assert/strict';

import {
  __directiveNotificationSurfaceTestHooks,
  acquireDirectiveNotificationSurface,
  refreshDirectiveNotificationSurface,
  releaseDirectiveNotificationSurface,
  resetDirectiveNotificationSurface,
} from '../../src/ui/directive-notification-surface.js';
import { installFakeDom } from './helpers/fake-dom.mjs';

const centeredBelowBar = __directiveNotificationSurfaceTestHooks.computePlacement({
  chatRect: { left: 340, top: 48, right: 940, bottom: 800, width: 600, height: 752 },
  topBarRect: { left: 340, top: 0, right: 940, bottom: 48, width: 600, height: 48 },
  surfaceSize: { width: 340, height: 210 },
  toastRects: [],
  viewportWidth: 1280,
});

assert.deepEqual(centeredBelowBar, {
  left: 640,
  top: 56,
  shiftedByNativeToast: false,
  width: 340,
});

const shiftedBelowNativeToast = __directiveNotificationSurfaceTestHooks.computePlacement({
  chatRect: { left: 340, top: 48, right: 940, bottom: 800, width: 600, height: 752 },
  topBarRect: { left: 340, top: 0, right: 940, bottom: 48, width: 600, height: 48 },
  surfaceSize: { width: 340, height: 210 },
  toastRects: [{ left: 490, top: 48, right: 790, bottom: 110, width: 300, height: 62 }],
  viewportWidth: 1280,
});

assert.deepEqual(shiftedBelowNativeToast, {
  left: 640,
  top: 116,
  shiftedByNativeToast: true,
  width: 340,
});

const unchangedBesideNativeToast = __directiveNotificationSurfaceTestHooks.computePlacement({
  chatRect: { left: 340, top: 48, right: 940, bottom: 800, width: 600, height: 752 },
  topBarRect: { left: 340, top: 0, right: 940, bottom: 48, width: 600, height: 48 },
  surfaceSize: { width: 340, height: 210 },
  toastRects: [{ left: 12, top: 48, right: 312, bottom: 110, width: 300, height: 62 }],
  viewportWidth: 1280,
});

assert.equal(unchangedBesideNativeToast.top, 56);
assert.equal(unchangedBesideNativeToast.shiftedByNativeToast, false);

const unchangedBesideRightNativeToast = __directiveNotificationSurfaceTestHooks.computePlacement({
  chatRect: { left: 340, top: 48, right: 940, bottom: 800, width: 600, height: 752 },
  topBarRect: { left: 340, top: 0, right: 940, bottom: 48, width: 600, height: 48 },
  surfaceSize: { width: 340, height: 210 },
  toastRects: [{ left: 956, top: 48, right: 1256, bottom: 110, width: 300, height: 62 }],
  viewportWidth: 1280,
});
assert.equal(unchangedBesideRightNativeToast.shiftedByNativeToast, false);

const unchangedAboveBottomNativeToast = __directiveNotificationSurfaceTestHooks.computePlacement({
  chatRect: { left: 340, top: 48, right: 940, bottom: 800, width: 600, height: 752 },
  topBarRect: { left: 340, top: 0, right: 940, bottom: 48, width: 600, height: 48 },
  surfaceSize: { width: 340, height: 210 },
  toastRects: [{ left: 490, top: 720, right: 790, bottom: 782, width: 300, height: 62 }],
  viewportWidth: 1280,
});
assert.equal(unchangedAboveBottomNativeToast.shiftedByNativeToast, false);

const document = installFakeDom();
resetDirectiveNotificationSurface('test-start');
const activitySurface = acquireDirectiveNotificationSurface('activity');
const gameplaySurface = acquireDirectiveNotificationSurface('gameplay');
const systemSurface = acquireDirectiveNotificationSurface('system');

assert.equal(activitySurface.host, gameplaySurface.host);
assert.equal(systemSurface.host, activitySurface.host);
assert.equal(document.documentElement.querySelectorAll('#directive-notifications').length, 1);
assert.equal(activitySurface.activitySlot.parentNode, activitySurface.host);
assert.equal(systemSurface.systemSlot.parentNode, systemSurface.host);
assert.equal(activitySurface.gameplaySlot.parentNode, activitySurface.host);
assert.deepEqual(systemSurface.host.children, [
  systemSurface.activitySlot,
  systemSurface.systemSlot,
  systemSurface.gameplaySlot,
]);

releaseDirectiveNotificationSurface('activity');
assert.equal(document.getElementById('directive-notifications'), gameplaySurface.host);
releaseDirectiveNotificationSurface('gameplay');
assert.equal(document.getElementById('directive-notifications'), systemSurface.host);
releaseDirectiveNotificationSurface('system');
assert.equal(document.getElementById('directive-notifications'), null);

const topBar = document.createElement('div');
topBar.id = 'top-bar';
topBar.getBoundingClientRect = () => ({ left: 340, top: 0, right: 940, bottom: 48, width: 600, height: 48 });
const chat = document.createElement('div');
chat.id = 'sheld';
chat.getBoundingClientRect = () => ({ left: 340, top: 48, right: 940, bottom: 800, width: 600, height: 752 });
document.body.append(topBar, chat);

const toastContainer = document.createElement('div');
toastContainer.id = 'toast-container';
const toast = document.createElement('div');
toast.className = 'toast';
toast.getBoundingClientRect = () => ({ left: 490, top: 48, right: 790, bottom: 110, width: 300, height: 62 });
toastContainer.appendChild(toast);
document.body.appendChild(toastContainer);

const measuredSurface = acquireDirectiveNotificationSurface('activity');
measuredSurface.host.getBoundingClientRect = () => ({ left: 470, top: 56, right: 810, bottom: 266, width: 340, height: 210 });
const refreshed = refreshDirectiveNotificationSurface();
assert.equal(refreshed.top, 116);
assert.equal(measuredSurface.host.style.left, '640px');
assert.equal(measuredSurface.host.style.top, '116px');
assert.equal(measuredSurface.host.style.width, '340px');
chat.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
const retainedGeometry = refreshDirectiveNotificationSurface();
assert.equal(retainedGeometry.left, 640, 'a temporarily collapsed chat host should retain the last valid center');
assert.equal(retainedGeometry.width, 340, 'a temporarily collapsed chat host should retain the last valid width');
releaseDirectiveNotificationSurface('activity');

const observerEvents = [];
globalThis.ResizeObserver = class {
  constructor() { observerEvents.push('resize-created'); }
  observe() { observerEvents.push('resize-observed'); }
  disconnect() { observerEvents.push('resize-disconnected'); }
};
globalThis.MutationObserver = class {
  constructor() { observerEvents.push('mutation-created'); }
  observe() { observerEvents.push('mutation-observed'); }
  disconnect() { observerEvents.push('mutation-disconnected'); }
};
globalThis.addEventListener = (type) => observerEvents.push(`window-add-${type}`);
globalThis.removeEventListener = (type) => observerEvents.push(`window-remove-${type}`);

acquireDirectiveNotificationSurface('activity');
assert.equal(observerEvents.includes('resize-observed'), true);
assert.equal(observerEvents.includes('mutation-observed'), true);
assert.equal(observerEvents.includes('window-add-resize'), true);
releaseDirectiveNotificationSurface('activity');
assert.equal(observerEvents.includes('resize-disconnected'), true);
assert.equal(observerEvents.includes('mutation-disconnected'), true);
assert.equal(observerEvents.includes('window-remove-resize'), true);

console.log('Directive notification surface tests passed.');
