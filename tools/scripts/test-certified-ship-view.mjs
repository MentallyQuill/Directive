import assert from 'node:assert/strict';
import { buildCertifiedShipView } from '../../src/ui/view-models/certified-ship-view.mjs';

const projection = {
  ship: {
    kind: 'directive.shipPlayerProjection.v1',
    shipId: 'ship.breckenridge',
    name: 'U.S.S. Breckenridge',
    class: 'Intrepid-class',
    registry: 'NCC-74638',
    capabilitySummary: 'Long-range explorer returned to service.',
    operationalStatus: {
      status: 'serviceable',
      summary: 'Integrated validation continues.',
      readiness: null,
      materialLimitations: [{ id: 'limit.warp', summary: 'Maximum warp remains restricted.' }],
      readinessObjectiveLink: null
    },
    capabilities: [{ id: 'cap.sensors', summary: 'Long-range sensors are available.' }]
  },
  issues: [{ title: 'private issue tracker must not escape' }]
};

assert.deepEqual(buildCertifiedShipView(projection), {
  id: 'ship.breckenridge',
  name: 'U.S.S. Breckenridge',
  className: 'Intrepid-class',
  registry: 'NCC-74638',
  summary: 'Long-range explorer returned to service.',
  operationalStatus: {
    status: 'serviceable',
    summary: 'Integrated validation continues.',
    readiness: null,
    readinessObjectiveLink: null
  },
  limitations: [{ id: 'limit.warp', summary: 'Maximum warp remains restricted.' }],
  capabilities: [{ id: 'cap.sensors', summary: 'Long-range sensors are available.' }]
});

console.log('PASS certified Ship view');
