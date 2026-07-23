import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  DIRECTIVE_PRIMARY_ROUTES,
  resolveDirectiveRouteId
} from '../../src/ui/directive-routes.mjs';

const runtimeShell = fs.readFileSync('src/runtime/runtime-shell.js', 'utf8');

assert.deepEqual(DIRECTIVE_PRIMARY_ROUTES.map(({ id }) => id), [
  'campaign', 'mission', 'people', 'ship', 'settings'
]);
assert.equal(resolveDirectiveRouteId('log', { hasActiveCampaign: true }), 'mission');
assert.equal(resolveDirectiveRouteId('intel', { hasActiveCampaign: true }), 'mission');
assert.equal(resolveDirectiveRouteId('log', { hasActiveCampaign: false }), 'campaign');
assert.equal(resolveDirectiveRouteId('', { hasActiveCampaign: true }), 'mission');
assert.equal(resolveDirectiveRouteId('people', { hasActiveCampaign: true }), 'people');
assert.equal(resolveDirectiveRouteId('crew', { hasActiveCampaign: true }), 'mission');
assert.doesNotMatch(runtimeShell, /renderCommandLogPanel/);
assert.doesNotMatch(runtimeShell, /activeTab === 'log'/);

console.log('Player-facing route contracts passed');
