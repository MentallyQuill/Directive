import assert from 'node:assert/strict';

import { bootstrapDirectiveExtension } from '../../src/hosts/sillytavern/bootstrap.js';
import { getSillyTavernDirectiveRuntimeBridge } from '../../src/hosts/sillytavern/runtime-bridge.mjs';
import { resetDirectiveNotificationSurface } from '../../src/ui/directive-notification-surface.js';
import {
  directiveStartupRecoveryMessage,
  resetDirectiveStartupRecoveryNotification,
} from '../../src/ui/startup-recovery-notification.js';
import { installFakeDom } from './helpers/fake-dom.mjs';

const all = (root) => [root, ...root.children.flatMap(all)];
const document = installFakeDom();
const log = [];
let activated = false;
const error = new Error('raw internal failure with secret save.123 and v1/recovery/private.json');
error.code = 'DIRECTIVE_V1_MONOLITHIC_SAVE_UNRECOVERABLE';
error.details = { saveId: 'secret-save-id', recoveryPath: 'v1/recovery/private.json' };

const result = await bootstrapDirectiveExtension({
  context: { document },
  hostFactory: () => ({
    id: 'sillytavern',
    logger: { error: (message) => log.push(message) },
  }),
  appFactory: () => ({
    async initialize() { throw error; },
  }),
  activateRuntime: async () => { activated = true; },
});

assert.deepEqual(result, {
  ok: false,
  reason: 'storage-recovery-required',
  errorCode: 'DIRECTIVE_V1_MONOLITHIC_SAVE_UNRECOVERABLE',
});
assert.equal(activated, false, 'runtime activation must stop after a recovery failure');
assert.deepEqual(getSillyTavernDirectiveRuntimeBridge(), {
  runtimeApp: null,
  orchestrator: null,
  host: null,
  enabled: false,
});
const notification = document.querySelector('.directive-startup-recovery-notification');
assert.ok(notification, 'a persistent startup recovery notification must be mounted');
assert.equal(notification.getAttribute('role'), 'alert');
const text = all(notification).map((node) => node.textContent || '').join(' ');
assert.match(text, /Directive save needs attention/);
assert.match(text, /left unchanged/);
assert.match(text, /Back up the directive-v1 files/);
assert.match(text, /DIRECTIVE_V1_MONOLITHIC_SAVE_UNRECOVERABLE/);
assert.doesNotMatch(text, /secret-save-id|private\.json|raw internal failure/);
assert.equal(log.length, 1);
assert.doesNotMatch(log[0], /secret-save-id|private\.json|raw internal failure/);

assert.deepEqual(
  directiveStartupRecoveryMessage({ code: 'DIRECTIVE_V1_MONOLITHIC_RECOVERY_INDEX_WRITE_FAILED' }),
  {
    code: 'DIRECTIVE_V1_MONOLITHIC_RECOVERY_INDEX_WRITE_FAILED',
    message: 'Directive upgraded the older V1 save, but could not finish publishing its recovery verification record. Reload SillyTavern to retry safely before continuing.',
  },
  'post-migration provenance publication failures must not claim the save was left unchanged',
);

const dismiss = all(notification).find((node) => node.tagName === 'BUTTON');
await dismiss.click();
assert.equal(document.querySelector('.directive-startup-recovery-notification'), null);

resetDirectiveStartupRecoveryNotification('test-cleanup');
resetDirectiveNotificationSurface('test-cleanup');
console.log('PASS SillyTavern startup recovery notification');
