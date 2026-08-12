import assert from 'node:assert/strict';

import { resolveSillyTavernHostContext } from '../../src/hosts/sillytavern/host-factory.mjs';

const bootstrap = { chatId: 'chat.parent' };
const live = { chatId: 'chat.child' };

assert.equal(
  resolveSillyTavernHostContext({ bootstrapContext: bootstrap, currentContext: live }),
  live,
  'the live SillyTavern context must replace the bootstrap snapshot after a chat switch'
);
assert.equal(
  resolveSillyTavernHostContext({ bootstrapContext: bootstrap, currentContext: null }),
  bootstrap,
  'tests and hosts without a global context retain the explicit bootstrap fallback'
);

console.log('SillyTavern host context tests passed.');
