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
const campaignState = {
  ...campaignProjection.initialState,
  campaign: {
    ...campaignProjection.initialState.campaign,
    id: 'campaign-director-packet-test'
  },
  continuity: {
    ...campaignProjection.initialState.continuity,
    acceptedFacts: [directorOnlyFact]
  }
};

const narratorPacket = buildContinuityDirectorPacket({
  audience: 'narrator',
  campaignState,
  packageData,
  crewDataset,
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

const digest = compactContinuityDirectorPacket(missionPacket);
assert.equal(digest.kind, 'directive.continuityDirectorPacketDigest.v1');
assert.equal(digest.hash, missionPacket.hash);
assert.equal(digest.sourceHash, missionPacket.sourceHash);
assert.equal(digest.selectedFactCount, missionPacket.facts.length);
assert.equal(digest.selectedFactIdHashes.length, missionPacket.facts.length);
const serializedDigest = JSON.stringify(digest);
assert.doesNotMatch(serializedDigest, /crew\.hadrik-bronn\.species|director\.secret\.medical-review|Hidden medical review/);

console.log('Continuity Director packet tests passed: audience gates, advisory-only packet shape, and compact provenance digest');
