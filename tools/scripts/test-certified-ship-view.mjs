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
    capabilities: [{ id: 'cap.sensors', label: 'Long-range sensors', summary: 'Long-range sensors are available.' }],
    constraints: [{ id: 'constraint.corroboration', label: 'Corroboration required', summary: 'Fine claims need a second source.' }],
    systems: [{
      id: 'system.sensors', label: 'Sensor Calibration', summary: 'Calibration remains provisional.',
      currentState: { id: 'state.provisional', label: 'Provisional', why: 'No clean baseline is accepted.', mechanicalEffect: 'Fine claims require corroboration.' },
      stateLadder: [{ id: 'state.provisional', rank: 0, label: 'Provisional', why: 'No clean baseline is accepted.', mechanicalEffect: 'Fine claims require corroboration.' }],
      workOrders: [{ id: 'milestone.baseline', status: 'known', label: 'Establish a clean baseline', summary: 'Compare against an independent reference.' }]
    }]
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
  capabilities: [{ id: 'cap.sensors', label: 'Long-range sensors', summary: 'Long-range sensors are available.' }],
  constraints: [{ id: 'constraint.corroboration', label: 'Corroboration required', summary: 'Fine claims need a second source.' }],
  systems: [{
    id: 'system.sensors', label: 'Sensor Calibration', summary: 'Calibration remains provisional.',
    currentState: { id: 'state.provisional', label: 'Provisional', why: 'No clean baseline is accepted.', mechanicalEffect: 'Fine claims require corroboration.' },
    stateLadder: [{ id: 'state.provisional', rank: 0, label: 'Provisional', why: 'No clean baseline is accepted.', mechanicalEffect: 'Fine claims require corroboration.' }],
    workOrders: [{ id: 'milestone.baseline', status: 'known', label: 'Establish a clean baseline', summary: 'Compare against an independent reference.' }]
  }]
});

console.log('PASS certified Ship view');
