import assert from 'node:assert/strict';

import {
  DIRECTIVE_PRIMARY_ROUTES,
  resolveDirectiveRouteId
} from '../../src/ui/directive-routes.mjs';

assert.deepEqual(DIRECTIVE_PRIMARY_ROUTES.map(({ id }) => id), [
  'campaign', 'mission', 'people', 'ship', 'settings'
]);
assert.equal(resolveDirectiveRouteId('unknown', { hasActiveCampaign: true }), 'mission');
assert.equal(resolveDirectiveRouteId('unknown', { hasActiveCampaign: false }), 'campaign');
assert.equal(resolveDirectiveRouteId('', { hasActiveCampaign: true }), 'mission');
assert.equal(resolveDirectiveRouteId('people', { hasActiveCampaign: true }), 'people');
console.log('Player-facing route contracts passed');
