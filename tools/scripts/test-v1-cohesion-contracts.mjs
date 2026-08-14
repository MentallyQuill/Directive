import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  COHESION_CATALOG_KIND,
  indexCohesionCatalog,
  validateCohesionCatalog,
} from '../../src/ship/v1/cohesion-contracts.mjs';

const catalog = JSON.parse(fs.readFileSync(
  'packages/bundled/breckenridge/breckenridge.cohesion-catalog.json',
  'utf8',
));

assert.equal(catalog.kind, COHESION_CATALOG_KIND);
assert.deepEqual(validateCohesionCatalog(catalog), { ok: true, errors: [] });

const index = indexCohesionCatalog(catalog);
assert.equal(index.templates.size, 40);
assert.equal(new Set([...index.templates.values()].map((template) => template.title)).size, 40);
assert.deepEqual(
  [1, 2, 3, 4].map((level) => [...index.templates.values()].filter((template) => template.level === level).length),
  [20, 12, 6, 2],
);
assert.deepEqual(catalog.policy.levelWeights, { '1': 50, '2': 30, '3': 15, '4': 5 });
assert.deepEqual(catalog.policy.schedule, {
  warmupHours: 4,
  intervalHours: 12,
  boundaryMinimumHours: 4,
  targetUnresolved: 3,
  crowdedThreshold: 8,
  normalChancePercent: 35,
  crowdedChancePercent: 15,
  criticalPauseBelow: 40,
  visibleLimit: 5,
});
assert.deepEqual(catalog.policy.cooldownChecks, { '1': 3, '2': 6, '3': 12 });

const familyCounts = Object.fromEntries(
  ['personnel', 'coordination', 'training', 'systems', 'shipboardLife']
    .map((family) => [family, [...index.templates.values()].filter((template) => template.primaryFamily === family).length]),
);
assert.deepEqual(familyCounts, {
  personnel: 12,
  coordination: 10,
  training: 8,
  systems: 6,
  shipboardLife: 4,
});

for (const template of index.templates.values()) {
  assert.match(template.id, /^cohesion\.l[1-4]\.[a-z0-9-]+$/);
  assert.equal(template.version, 1);
  assert.equal(template.cohesion, template.level * 5);
  assert.ok(template.playerText.situation);
  assert.ok(template.playerText.objective);
  assert.ok(template.playerText.whyItMatters);
  assert.ok(template.playerText.operationalEffect);
  assert.ok(template.computerHelp);
  assert.ok(template.completion.guidance);
  assert.ok(template.completion.exclusions.length > 0);
  assert.ok(template.phases.length >= 2);
  assert.ok(['backgroundOnly', 'establishedPublic', 'roleOnly'].includes(template.bindingMode));
}

assert.deepEqual(index.authoredIssues.map((issue) => issue.id), [
  'cohesion-authored.sensor-calibration',
  'cohesion-authored.systems-integration',
]);
assert.equal(index.authoredIssues.find((issue) => issue.id.endsWith('systems-integration')).level, 3);
assert.equal(index.authoredIssues.find((issue) => issue.id.endsWith('sensor-calibration')).level, 2);
assert.equal(catalog.backgroundCrew.names.length >= 24, true);
assert.equal(catalog.backgroundCrew.departments.length >= 7, true);

for (const invalid of [
  { ...catalog, kind: 'directive.other.v1' },
  { ...catalog, templates: catalog.templates.slice(0, 39) },
  { ...catalog, templates: [...catalog.templates, structuredClone(catalog.templates[0])] },
]) {
  assert.equal(validateCohesionCatalog(invalid).ok, false);
}

console.log('V1 Cohesion catalog contracts passed.');
