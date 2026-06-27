import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CONTINUITY_VISIBILITY,
  DIRECTIVE_STATIC_PROMPT_KEYS,
  buildContinuitySourceFrame,
  buildContinuityProjectionMatrix,
  CONTINUITY_PLAN_KIND,
  createContinuityFact,
  isFactVisibleToAudience,
  materializeContinuityFacts,
  normalizeContinuityState,
  quarantineGeneratedClaims,
  reviewContinuityContradictions
} from '../../src/continuity/index.mjs';
import { initializeCampaignRuntimeTracking } from '../../src/runtime/state-delta-gateway.mjs';
import { campaignProjectionStateDomains } from './lib/directive-contracts.mjs';

const root = process.cwd();
function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, relativePath), 'utf8'));
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const campaignProjection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const campaignState = {
  ...campaignProjection.initialState,
  campaign: {
    ...campaignProjection.initialState.campaign,
    id: 'test-save'
  },
  campaignChatBinding: {
    chatId: 'chat-1',
    promptContextRevision: 7
  }
};

assert.ok(campaignProjectionStateDomains.includes('continuity'));
assert.ok(campaignProjection.stateDomains.includes('continuity'));
assert.equal(campaignProjection.initialState.continuity.schemaVersion, 1);
assert.equal(normalizeContinuityState().projectionCache.sourceHash, null);
assert.equal(initializeCampaignRuntimeTracking({ runtimeTracking: {} }).continuity.schemaVersion, 1);

const facts = materializeContinuityFacts({
  packageData,
  crewDataset,
  campaignProjection,
  campaignState
});
const byId = new Map(facts.map((fact) => [fact.id, fact]));

assert.equal(byId.get('crew.hadrik-bronn.species')?.value, 'Tellarite');
assert.match(byId.get('crew.hadrik-bronn.species')?.render.narrator || '', /not a default human/i);
assert.equal(byId.get('crew.hadrik-bronn.billet')?.value, 'Chief Tactical and Security Officer');
assert.match(byId.get('crew.hadrik-bronn.age-description')?.summary || '', /Late fifties/i);

const travelText = facts
  .filter((fact) => fact.kind.startsWith('ship.travel'))
  .map((fact) => `${fact.summary} ${fact.render.narrator}`)
  .join('\n');
assert.match(travelText, /twenty-five days underway/i);
assert.match(travelText, /Utopia Planitia/i);
assert.match(travelText, /ten-day/i);
assert.match(travelText, /5\.5 to 6 light-years/i);
assert.match(travelText, /drops to impulse.*transfer waypoint/i);
assert.match(travelText, /Do not describe.*six days at impulse/i);
assert.doesNotMatch(travelText, /six days since leaving Utopia Planitia/i);

const frameA = buildContinuitySourceFrame({
  campaignState,
  packageData,
  crewDataset,
  campaignProjection,
  scene: { activePhaseId: 'shuttle-rendezvous', presentActorIds: ['hadrik-bronn'] },
  playerText: 'I ask Bronn for the real tactical handoff.',
  recentChatMessages: [{ id: '1', role: 'user', text: 'Permission to come aboard.' }]
});
const frameB = buildContinuitySourceFrame({
  campaignState,
  packageData,
  crewDataset,
  campaignProjection,
  scene: { activePhaseId: 'shuttle-rendezvous', presentActorIds: ['hadrik-bronn'] },
  playerText: 'I ask Whitaker for the transfer orders.',
  recentChatMessages: [{ id: '1', role: 'user', text: 'Permission to come aboard.' }]
});
assert.equal(frameA.locationId, 'breckenridge-in-transit');
assert.notEqual(frameA.sourceHash, frameB.sourceHash);
assert.deepEqual(frameA.presentActorIds, ['hadrik-bronn']);
assert.equal(frameA.referencedActorIds.includes('hadrik-bronn'), true);
assert.equal(frameA.relevantActorIds.includes('hadrik-bronn'), true);
assert.equal(frameB.referencedActorIds.includes('mara-whitaker'), true);

const directorOnly = createContinuityFact({
  id: 'hidden.test',
  summary: 'Hidden fact.',
  visibility: CONTINUITY_VISIBILITY.directorOnly
});
assert.equal(isFactVisibleToAudience(directorOnly, CONTINUITY_VISIBILITY.narratorSafe), false);
assert.equal(isFactVisibleToAudience(directorOnly, CONTINUITY_VISIBILITY.directorOnly), true);

const matrix = buildContinuityProjectionMatrix({
  campaignState,
  packageData,
  crewDataset,
  campaignProjection,
  scene: { activePhaseId: 'shuttle-rendezvous', presentActorIds: ['hadrik-bronn'] },
  createdAt: '2026-06-26T00:00:00.000Z'
});
assert.deepEqual(matrix.blocks.map((block) => block.promptKey), DIRECTIVE_STATIC_PROMPT_KEYS);
assert.equal(matrix.audit.blockCount, DIRECTIVE_STATIC_PROMPT_KEYS.length);
assert.match(matrix.text, /Bronn is Tellarite/i);
assert.match(matrix.text, /six days at impulse/i);
assert.doesNotMatch(matrix.text, /directorOnly|rawValues/i);

const turnRelevantMatrix = buildContinuityProjectionMatrix({
  campaignState,
  packageData,
  crewDataset,
  campaignProjection,
  playerText: 'I ask Bronn to walk me through the tactical handoff before we reach the Asterion waypoint.',
  projectionPlan: {
    kind: CONTINUITY_PLAN_KIND,
    operations: [],
    omitted: []
  },
  createdAt: '2026-06-26T00:00:00.000Z'
});
const bronnProfileOperation = turnRelevantMatrix.plan.operations.find((operation) => (
  operation.factId === 'crew.hadrik-bronn.public-profile'
));
assert(bronnProfileOperation, 'Turn-relevant Bronn profile should survive Utility omission.');
assert.equal(bronnProfileOperation.lane, 'directive.continuity.domain');
assert.equal(bronnProfileOperation.force, 'boost');
assert.equal(bronnProfileOperation.reason, 'validator-added-turn-relevance');
assert.equal(turnRelevantMatrix.sourceFrame.referencedActorIds.includes('hadrik-bronn'), true);

const badReview = reviewContinuityContradictions({
  text: 'Bronn, a human male in his early forties, grunted that the ship had been at impulse for six days since leaving Utopia Planitia.',
  campaignState,
  packageData,
  crewDataset,
  campaignProjection
});
assert.equal(badReview.ok, false);
assert.equal(badReview.findings.some((finding) => finding.kind === 'species-contradiction'), true);
assert.equal(badReview.findings.some((finding) => finding.kind === 'age-contradiction'), true);
assert.equal(badReview.findings.some((finding) => finding.kind === 'travel-contradiction'), true);

const goodReview = reviewContinuityContradictions({
  text: 'Bronn, the Tellarite tactical chief, watched the shuttle rendezvous at the transfer waypoint as the Breckenridge continued its final approach toward the Asterion Reach.',
  campaignState,
  packageData,
  crewDataset,
  campaignProjection
});
assert.equal(goodReview.ok, true);

const candidateQuarantine = quarantineGeneratedClaims(campaignState, {
  text: 'Bronn, the Tellarite tactical chief, watched the shuttle rendezvous at the transfer waypoint.',
  source: { kind: 'test', id: 'candidate' },
  review: goodReview,
  status: 'candidate',
  now: '2026-06-26T00:00:00.000Z'
});
assert.equal(candidateQuarantine.campaignState.continuity.acceptedFacts.length, 0);
assert.equal(candidateQuarantine.campaignState.continuity.candidateClaims.length > 0, true);
assert.equal(candidateQuarantine.campaignState.continuity.rejectedClaims.length, 0);

const rejectedQuarantine = quarantineGeneratedClaims(campaignState, {
  text: 'Bronn, a human male in his early forties, grunted that the ship had been at impulse for six days since leaving Utopia Planitia.',
  source: { kind: 'test', id: 'rejected' },
  review: badReview,
  status: 'rejected',
  now: '2026-06-26T00:00:00.000Z'
});
assert.equal(rejectedQuarantine.campaignState.continuity.acceptedFacts.length, 0);
assert.equal(rejectedQuarantine.campaignState.continuity.rejectedClaims.length > 0, true);

console.log('Continuity Projection Matrix foundation tests passed: state root, source frame, Breckenridge travel, Bronn identity, and visibility gates');
