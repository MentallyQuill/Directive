import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CONTINUITY_VISIBILITY,
  buildContinuityDirectorPacket,
  compactContinuityDirectorPacket,
  createContinuityFact
} from '../../src/continuity/index.mjs';

const root = process.cwd();
function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, relativePath), 'utf8'));
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const shipDataset = readJson('packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json');
const campaignProjection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const directorOnlyFact = createContinuityFact({
  id: 'director.secret.medical-review',
  subject: 'captain',
  predicate: 'hidden-medical-status',
  summary: 'Hidden medical review remains Director-only.',
  visibility: CONTINUITY_VISIBILITY.directorOnly,
  authority: 'campaignState',
  criticality: 'high',
  tags: ['mission']
});
const bronnPrivateFact = createContinuityFact({
  id: 'witness.bronn.private-tactical-context',
  kind: 'witness.private',
  subject: 'crew.hadrik-bronn',
  predicate: 'tactical-context',
  summary: 'Bronn privately knows the tactical archive was sealed before docking.',
  visibility: CONTINUITY_VISIBILITY.directorOnly,
  authority: 'campaignState',
  criticality: 'high',
  tags: ['crew', 'witness'],
  knownBy: ['hadrik-bronn'],
  witnessedBy: ['hadrik-bronn'],
  subjectIds: ['hadrik-bronn'],
  disclosureState: 'private'
});
const samPrivateFact = createContinuityFact({
  id: 'witness.sam.private-mediator-context',
  kind: 'witness.private',
  subject: 'crew.sam-vickers',
  predicate: 'mediator-context',
  summary: 'Sam privately knows the mediator altered the corridor report.',
  visibility: CONTINUITY_VISIBILITY.directorOnly,
  authority: 'campaignState',
  criticality: 'high',
  tags: ['crew', 'witness'],
  knownBy: ['sam-vickers'],
  witnessedBy: ['sam-vickers'],
  subjectIds: ['sam-vickers'],
  disclosureState: 'private'
});
const campaignState = {
  ...campaignProjection.initialState,
  campaign: {
    ...campaignProjection.initialState.campaign,
    id: 'campaign-director-packet-test'
  },
  continuity: {
    ...campaignProjection.initialState.continuity,
    acceptedFacts: [directorOnlyFact, bronnPrivateFact, samPrivateFact]
  }
};

const narratorPacket = buildContinuityDirectorPacket({
  audience: 'narrator',
  campaignState,
  packageData,
  crewDataset,
  shipDataset,
  campaignProjection,
  scene: { activePhaseId: 'shuttle-rendezvous', presentCharacterIds: ['hadrik-bronn'] },
  playerText: 'I ask Bronn for the real tactical handoff.'
});
assert.equal(narratorPacket.kind, 'directive.continuityDirectorPacket.v1');
assert.equal(narratorPacket.visibilityAudience, CONTINUITY_VISIBILITY.narratorSafe);
assert.equal(narratorPacket.facts.some((fact) => fact.id === directorOnlyFact.id), false);
assert.equal(narratorPacket.facts.some((fact) => fact.visibility === CONTINUITY_VISIBILITY.hidden), false);
assert.ok(narratorPacket.facts.some((fact) => fact.id === 'crew.hadrik-bronn.species'));

const missionPacket = buildContinuityDirectorPacket({
  audience: 'missionDirector',
  campaignState,
  packageData,
  crewDataset,
  shipDataset,
  campaignProjection,
  scene: { activePhaseId: 'shuttle-rendezvous', presentCharacterIds: ['hadrik-bronn'] },
  playerText: 'I ask Bronn for the real tactical handoff.'
});
assert.equal(missionPacket.visibilityAudience, CONTINUITY_VISIBILITY.directorOnly);
assert.ok(missionPacket.facts.some((fact) => fact.id === directorOnlyFact.id));
assert.ok(missionPacket.facts.some((fact) => fact.id === 'crew.hadrik-bronn.species'));
assert.equal(Object.hasOwn(missionPacket, 'stateDelta'), false);
assert.equal(Object.hasOwn(missionPacket, 'outcomePacket'), false);
assert.equal(Object.hasOwn(missionPacket, 'allowedRoots'), false);

const crewPacket = buildContinuityDirectorPacket({
  audience: 'crewDirector',
  campaignState,
  packageData,
  crewDataset,
  shipDataset,
  campaignProjection,
  scene: {
    activePhaseId: 'shuttle-rendezvous',
    presentActorIds: ['hadrik-bronn']
  },
  playerText: 'I ask Bronn for the real tactical handoff.'
});
assert.ok(crewPacket.facts.some((fact) => fact.id === bronnPrivateFact.id));
assert.equal(crewPacket.facts.some((fact) => fact.id === samPrivateFact.id), false);
assert.equal(
  crewPacket.audit.blockedByAudienceCount > 0,
  true,
  'source-frame witness gating should report blocked facts in packet audit'
);

const shipPacket = buildContinuityDirectorPacket({
  audience: 'shipDirector',
  campaignState,
  packageData,
  crewDataset,
  shipDataset,
  campaignProjection,
  scene: { activePhaseId: 'shuttle-rendezvous', locationId: 'breckenridge-in-transit' },
  playerText: 'I ask shuttle control for final shuttlebay clearance.'
});
assert.ok(shipPacket.facts.some((fact) => fact.id === 'ship.uss-breckenridge.area.intrepid.shuttlebay-complex.layout'));
assert.ok(shipPacket.facts.some((fact) => fact.id === 'ship.uss-breckenridge.area.intrepid.shuttlebay-complex.not-saucer-underside'));
assert.match(
  shipPacket.facts.find((fact) => fact.id === 'ship.uss-breckenridge.area.intrepid.shuttlebay-complex.layout')?.summary || '',
  /Deck 10.*aft dorsal secondary hull/i
);

const digest = compactContinuityDirectorPacket(missionPacket);
assert.equal(digest.kind, 'directive.continuityDirectorPacketDigest.v1');
assert.equal(digest.hash, missionPacket.hash);
assert.equal(digest.sourceHash, missionPacket.sourceHash);
assert.equal(digest.selectedFactCount, missionPacket.facts.length);
assert.equal(digest.selectedFactIdHashes.length, missionPacket.facts.length);
const serializedDigest = JSON.stringify(digest);
assert.doesNotMatch(serializedDigest, /crew\.hadrik-bronn\.species|director\.secret\.medical-review|Hidden medical review/);

console.log('Continuity Director packet tests passed: audience gates, advisory-only packet shape, and compact provenance digest');
