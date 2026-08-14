import assert from 'node:assert/strict';

import { createShipPlayerProjection } from '../../src/projection/v1/ship-projection.mjs';
import { createCohesionIssueCreatedEffect } from '../../src/ship/v1/cohesion-state.mjs';
import { createShipOperationalPacket } from '../../src/ship/v1/ship-operational-packet.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const assets = loadAshesRuntimeAssets();
const state = createAshesInitialState({ campaignId: 'campaign.projection', saveId: 'save.projection' });
const templateIds = [
  'cohesion.l1.missed-watch',
  'cohesion.l1.new-to-ship',
  'cohesion.l1.message-from-home',
  'cohesion.l1.credit-where-due',
  'cohesion.l1.handoff-gap',
  'cohesion.l1.next-step-owner',
  'cohesion.l1.bad-drill-habit',
  'cohesion.l1.maintenance-window',
];
const effects = templateIds.map((templateId, index) => createCohesionIssueCreatedEffect({
  id: `effect.created.${index}`,
  issueId: `issue.generated.${index}`,
  templateId,
  segmentIds: [5 + index],
  sequence: index + 1,
  opportunitySequence: index + 1,
  binding: {
    mode: index < 4 ? 'backgroundOnly' : 'roleOnly',
    ...(index < 4 ? { crew: { id: `cohesion-crew.${index}`, name: ['Ari Chen', 'Bela Okafor', 'Caro Thale', 'Davin Ruiz'][index] } } : {}),
    roles: { department: 'operations' },
    variation: `variation-${index}`,
  },
  sourceContributionIds: [`contribution.${index}`],
}));
state.storySettlement = {
  kind: 'directive.storySettlement.v1',
  version: 1,
  branchId: 'save.projection',
  revision: 1,
  activeEpisode: null,
  episodes: [{ id: 'episode.projection', status: 'sealed', effects }],
  receipts: [],
};

const projection = createShipPlayerProjection({
  campaignState: state,
  runtimeAssets: assets,
  definition: {},
  missionProjection: {},
});
assert.equal(projection.cohesion.total, 35);
assert.equal(projection.cohesion.band.id, 'critical');
assert.equal(projection.cohesion.segments.length, 20);
assert.equal(projection.cohesion.segments.filter(({ filled }) => !filled).length, 13);
assert.equal(projection.cohesion.visibleTasks.length, 5);
assert.equal(projection.cohesion.visibleTasks[0].id, 'cohesion-authored.sensor-calibration');
assert.equal(projection.cohesion.visibleTasks[1].id, 'cohesion-authored.systems-integration');
assert.equal(projection.cohesion.visibleTasks[2].reward.cohesion, 5);
assert.equal(projection.cohesion.visibleTasks[2].currentPhase.label.length > 0, true);
assert.equal(projection.cohesion.visibleTasks[2].playerText.whyItMatters.length > 0, true);
assert.equal(projection.cohesion.visibleTasks[2].computerHelp.length > 0, true);
assert.equal(projection.cohesion.visibleTasks[2].binding.crew.name, 'Ari Chen');
assert.deepEqual(projection.cohesion.backlog, { count: 5, cohesion: 25 });
assert.equal(Object.hasOwn(projection.cohesion, 'queuedTasks'), false);
assert.equal(JSON.stringify(projection).includes('The Maintenance Window'), false, 'queued task premises stay private');
assert.equal(projection.sourceRefs.packageIds.includes(assets.cohesionCatalog.id), true);

const packet = createShipOperationalPacket({
  shipDataset: assets.shipDataset,
  cohesionCatalog: assets.cohesionCatalog,
  storySettlement: state.storySettlement,
  missionDefinition: {},
  branchId: 'save.projection',
});
assert.equal(packet.cohesion.total, 35);
assert.equal(packet.cohesion.band, 'critical');
assert.match(packet.cohesion.causalInstruction, /demanding relevant action/i);
assert.equal(packet.cohesion.visibleConditions.length, 5);
assert.equal(packet.cohesion.visibleConditions[2].computerHelp.length > 0, true);
assert.deepEqual(packet.cohesion.backlog, { count: 5, cohesion: 25 });
assert.equal(JSON.stringify(packet).includes('The Maintenance Window'), false);
assert.equal(packet.capabilities.length >= 0, true);
assert.equal(Array.isArray(packet.constraints), true);
assert.equal(Array.isArray(packet.interactions), true);
assert.equal(JSON.stringify(packet).includes('st-preset'), false);

for (const [total, expected, pattern] of [
  [75, 'ready', /issue-specific/i],
  [70, 'strained', /relevant visible condition/i],
  [35, 'critical', /demanding relevant action/i],
]) {
  const adjusted = structuredClone(state.storySettlement);
  const desiredDebt = 100 - total;
  adjusted.episodes[0].effects = effects.slice(0, Math.max(0, (desiredDebt - 25) / 5));
  const next = createShipOperationalPacket({
    shipDataset: assets.shipDataset,
    cohesionCatalog: assets.cohesionCatalog,
    storySettlement: adjusted,
    missionDefinition: {},
    branchId: 'save.projection',
  });
  assert.equal(next.cohesion.band, expected);
  assert.match(next.cohesion.causalInstruction, pattern);
}

console.log('V1 Cohesion projection passed.');
