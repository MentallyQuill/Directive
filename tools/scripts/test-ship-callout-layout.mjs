import assert from 'node:assert/strict';
import {
  controlCorners,
  createShipCalloutLayout,
  renderedContainRect,
  resolveAnchorPoint,
  segmentsIntersect,
} from '../../src/ui/ship-callout-layout.js';

assert.deepEqual(
  renderedContainRect(
    { x: 10, y: 20, width: 800, height: 400 },
    { width: 1000, height: 1000 },
  ),
  { x: 210, y: 20, width: 400, height: 400 },
);

assert.deepEqual(resolveAnchorPoint({
  anchor: 'bridge',
  anchors: { bridge: { x: 0.5, y: 0.25 } },
  imageRect: { x: 110, y: 220, width: 400, height: 200 },
  orbitRect: { x: 10, y: 20, width: 800, height: 500 },
}), { x: 300, y: 250, anchor: 'bridge' });

assert.equal(resolveAnchorPoint({
  anchor: 'forward',
  anchors: { 'forward-sensors': { x: 0.8, y: 0.5 }, 'central-saucer': { x: 0.5, y: 0.5 } },
  imageRect: { x: 0, y: 0, width: 100, height: 100 },
  orbitRect: { x: 0, y: 0 },
}).anchor, 'forward-sensors');

assert.deepEqual(controlCorners({ x: 20, y: 30, width: 100, height: 40 }), [
  { id: 'top-left', x: 20, y: 30 },
  { id: 'top-right', x: 120, y: 30 },
  { id: 'bottom-left', x: 20, y: 70 },
  { id: 'bottom-right', x: 120, y: 70 },
]);

assert.equal(segmentsIntersect(
  [{ x: 0, y: 0 }, { x: 10, y: 10 }],
  [{ x: 0, y: 10 }, { x: 10, y: 0 }],
), true);
assert.equal(segmentsIntersect(
  [{ x: 0, y: 0 }, { x: 10, y: 10 }],
  [{ x: 0, y: 0 }, { x: -10, y: 10 }],
), false);

const anchors = {
  'forward-sensors': { x: 0.82, y: 0.5 },
  engineering: { x: 0.3, y: 0.24 },
  'crew-habitat': { x: 0.49, y: 0.56 },
  'central-saucer': { x: 0.62, y: 0.48 },
  shuttlebay: { x: 0.2, y: 0.16 },
};
const tasks = [
  { id: 'task.sensors', anchor: 'forward-sensors' },
  { id: 'task.engineering', anchor: 'engineering' },
  { id: 'task.crew', anchor: 'crew-habitat' },
  { id: 'task.handoff', anchor: 'central-saucer' },
  { id: 'task.shuttlebay', anchor: 'shuttlebay' },
];
const desktopInput = {
  mode: 'desktop',
  orbitRect: { x: 0, y: 0, width: 900, height: 500 },
  imageRect: { x: 45, y: 65, width: 810, height: 360 },
  imageNaturalSize: { width: 1672, height: 941 },
  anchors,
  shipId: 'uss-breckenridge',
  tasks,
  controlSizes: Object.fromEntries(tasks.map(({ id }) => [id, { width: 190, height: 50 }])),
};
const desktopLayout = createShipCalloutLayout(desktopInput);
assert.equal(desktopLayout.valid, true);
assert.equal(desktopLayout.placements.length, 5);
assert.equal(new Set(desktopLayout.placements.map(({ slotId }) => slotId)).size, 5);
assert.equal(desktopLayout.overlapCount, 0);
assert.equal(desktopLayout.crossingCount, 0);
assert.deepEqual(createShipCalloutLayout(desktopInput), desktopLayout);

console.log('Ship callout layout geometry passed.');
