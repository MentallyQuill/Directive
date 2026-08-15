import assert from 'node:assert/strict';

import { saveCharacterCreatorDraftRecord } from '../../src/creators/character-creator-draft.mjs';
import { getNestedValue, setNestedValue } from '../../src/ui/runtime-ui-kit.js';

const target = {};
setNestedValue(target, 'identity.name', 'Ari Venn');
assert.equal(getNestedValue(target, 'identity.name'), 'Ari Venn');

for (const path of ['__proto__.polluted', 'identity.constructor.polluted', 'identity.prototype.polluted', '']) {
  assert.throws(() => setNestedValue(target, path, true), /safe object keys/);
}
assert.equal(Object.prototype.polluted, undefined);

const draft = {
  kind: 'directive.characterCreatorDraft.v1',
  status: 'inProgress',
  revision: 1,
  activeStep: 'identity',
  input: {},
  progress: { completedSteps: [] },
  autosave: { history: [] }
};
assert.throws(
  () => saveCharacterCreatorDraftRecord(draft, {
    input: JSON.parse('{"__proto__":{"polluted":true}}')
  }, { savedAt: '2026-08-10T00:00:00.000Z' }),
  /Unsafe Character Creator input key/
);
assert.equal(Object.prototype.polluted, undefined);

console.log('PASS safe object boundaries');
