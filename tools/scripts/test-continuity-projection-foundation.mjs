import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CONTINUITY_VISIBILITY,
  DIRECTIVE_STATIC_PROMPT_KEYS,
  buildContinuitySourceFrame,
  buildContinuityProjectionMatrix,
  CONTINUITY_PLAN_KIND,
  buildContinuityFactIndex,
  createContinuityFact,
  factKnowledgeScope,
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
const shipDataset = readJson('packages/bundled/breckenridge/breckenridge-intrepid-class.ship-dataset.json');
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
  shipDataset,
  campaignProjection,
  campaignState
});
const byId = new Map(facts.map((fact) => [fact.id, fact]));

assert.equal(byId.get('crew.hadrik-bronn.species')?.value, 'Tellarite');
assert.match(byId.get('crew.hadrik-bronn.species')?.render.narrator || '', /not a default human/i);
assert.equal(byId.get('crew.hadrik-bronn.billet')?.value, 'Chief Tactical and Security Officer');
assert.match(byId.get('crew.hadrik-bronn.age-description')?.summary || '', /Late fifties/i);
assert.match(byId.get('crew.mara-whitaker.age-description')?.summary || '', /47 at campaign start/i);
assert.match(byId.get('crew.mara-whitaker.age-description')?.render.narrator || '', /late forties, not early fifties/i);
assert.match(byId.get('crew.hadrik-bronn.uniform-division-color')?.summary || '', /mustard-yellow/i);
assert.match(byId.get('crew.kieran-vale.uniform-division-color')?.summary || '', /burgundy-red/i);

const travelText = facts
  .filter((fact) => fact.kind.startsWith('ship.travel'))
  .map((fact) => `${fact.summary} ${fact.render.narrator}`)
  .join('\n');
assert.match(travelText, /twenty-five days underway/i);
assert.match(travelText, /Utopia Planitia/i);
assert.match(travelText, /ten-day/i);
assert.match(travelText, /5\.5 to 6 light-years/i);
assert.match(travelText, /drops to impulse.*transfer waypoint/i);
assert.match(travelText, /do not depict.*holding course at warp/i);
assert.match(travelText, /streaking stars at warp/i);
assert.match(travelText, /shuttlebay two.*aft section between the swept nacelle pylons/i);
assert.match(travelText, /Do not describe.*six days at impulse/i);
assert.doesNotMatch(travelText, /six days since leaving Utopia Planitia/i);
assert.match(byId.get('ship.uss-breckenridge.area.intrepid.shuttlebay-complex.layout')?.render.narrator || '', /Deck 10.*aft dorsal secondary hull/i);
assert.match(byId.get('ship.uss-breckenridge.area.intrepid.shuttlebay-complex.not-saucer-underside')?.render.narrator || '', /Do not describe.*saucer-underside/i);
assert.equal(byId.get('ship.uss-breckenridge.area.intrepid.shuttlebay-complex.not-saucer-underside')?.tags.includes('contradiction-guard'), true);

const frameA = buildContinuitySourceFrame({
  campaignState,
  packageData,
  crewDataset,
  shipDataset,
  campaignProjection,
  scene: { activePhaseId: 'shuttle-rendezvous', presentActorIds: ['hadrik-bronn'] },
  playerText: 'I ask Bronn for the real tactical handoff.',
  recentChatMessages: [{ id: '1', role: 'user', text: 'Permission to come aboard.' }]
});
const frameB = buildContinuitySourceFrame({
  campaignState,
  packageData,
  crewDataset,
  shipDataset,
  campaignProjection,
  scene: { activePhaseId: 'shuttle-rendezvous', presentActorIds: ['hadrik-bronn'] },
  playerText: 'I ask Whitaker for the transfer orders.',
  recentChatMessages: [{ id: '1', role: 'user', text: 'Permission to come aboard.' }]
});
assert.equal(frameA.locationId, 'breckenridge-in-transit');
assert.equal(frameA.shipDatasetRevision, shipDataset.manifest.version);
assert.equal(frameA.shipDatasetId, shipDataset.manifest.id);
assert.equal(frameA.shipDatasetAreaIds.includes('intrepid.shuttlebay-complex'), true);
assert.notEqual(frameA.sourceHash, frameB.sourceHash);
assert.deepEqual(frameA.presentActorIds, ['hadrik-bronn']);
assert.equal(frameA.referencedActorIds.includes('hadrik-bronn'), true);
assert.equal(frameA.relevantActorIds.includes('hadrik-bronn'), true);
assert.equal(frameB.referencedActorIds.includes('mara-whitaker'), true);

const acceptedVariantFrame = buildContinuitySourceFrame({
  campaignState,
  packageData,
  crewDataset,
  shipDataset,
  campaignProjection,
  playerText: 'I accept that handoff and continue.',
  acceptedAssistantVariant: {
    hostMessageId: 'assistant-selected-swipe',
    selectedVariantId: '2',
    selectedSwipeIndex: 2,
    swipeCount: 3,
    selectedTextHash: 'selected-bronn-handoff-hash',
    visibleTextHash: 'selected-bronn-handoff-hash',
    sourceIntegrity: 'clean',
    text: 'Bronn gives the selected tactical handoff at the shuttle rendezvous.',
    responseKind: 'hostGeneration'
  }
});
assert.equal(acceptedVariantFrame.acceptedAssistantVariant.hostMessageId, 'assistant-selected-swipe');
assert.equal(acceptedVariantFrame.acceptedAssistantVariant.selectedSwipeIndex, 2);
assert.equal(acceptedVariantFrame.acceptedAssistantVariant.swipeCount, 3);
assert.equal(acceptedVariantFrame.acceptedAssistantVariant.selectedTextHash, 'selected-bronn-handoff-hash');
assert.equal(acceptedVariantFrame.referencedActorIds.includes('hadrik-bronn'), true);
assert.notEqual(acceptedVariantFrame.sourceHash, frameB.sourceHash);
assert.doesNotMatch(JSON.stringify(acceptedVariantFrame), /Discarded draft/i);

const directorOnly = createContinuityFact({
  id: 'hidden.test',
  summary: 'Hidden fact.',
  visibility: CONTINUITY_VISIBILITY.directorOnly
});
assert.equal(isFactVisibleToAudience(directorOnly, CONTINUITY_VISIBILITY.narratorSafe), false);
assert.equal(isFactVisibleToAudience(directorOnly, CONTINUITY_VISIBILITY.directorOnly), true);
assert.equal(directorOnly.disclosureState, 'secret');
assert.equal(factKnowledgeScope({ visibility: CONTINUITY_VISIBILITY.hidden }).disclosureState, 'secret');
assert.equal(factKnowledgeScope({ visibility: CONTINUITY_VISIBILITY.playerFacing }).disclosureState, 'public');

const bronnScopedFact = createContinuityFact({
  id: 'witness.bronn.private-report',
  kind: 'witness.private',
  subject: 'crew.hadrik-bronn',
  predicate: 'private-report',
  summary: 'Bronn privately knows the sensor archive was sealed before the handoff.',
  render: {
    narrator: 'Bronn privately knows the sensor archive was sealed before the handoff.'
  },
  criticality: 'high',
  tags: ['crew', 'witness'],
  knownBy: ['hadrik-bronn'],
  witnessedBy: ['hadrik-bronn'],
  subjectIds: ['hadrik-bronn'],
  disclosureState: 'private',
  disclosureSourceFrameId: 'frame-private-bronn',
  evidenceRefs: [{
    kind: 'directive.sourceFrameRef.v1',
    id: 'frame-private-bronn',
    textHash: 'private-bronn-hash',
    text: 'Raw evidence text must not persist.',
    selectedText: 'Raw selected text must not persist.',
    sourceText: 'Raw source text must not persist.',
    quote: 'Raw quoted text must not persist.',
    excerpt: 'Raw excerpt text must not persist.',
    rawTranscript: 'Raw witness transcript must not persist.',
    providerOutput: 'Raw provider output must not persist.'
  }]
});
const semanticsScopedFact = createContinuityFact({
  id: 'witness.sam.semantics-private',
  kind: 'witness.private',
  subject: 'crew.sam-vickers',
  predicate: 'private-report',
  summary: 'Sam privately knows the dockmaster altered the departure record.',
  render: {
    narrator: 'Sam privately knows the dockmaster altered the departure record.'
  },
  criticality: 'high',
  tags: ['crew', 'witness'],
  semantics: {
    knownBy: ['sam-vickers'],
    witnessedBy: ['sam-vickers'],
    subjectIds: ['sam-vickers'],
    disclosureState: 'private',
    disclosureSourceFrameId: 'frame-private-sam-semantics',
    evidenceRefs: [{
      kind: 'directive.sourceFrameRef.v1',
      id: 'frame-private-sam-semantics',
      textHash: 'private-sam-semantics-hash',
      text: 'Raw semantics evidence must not persist.',
      selectedText: 'Raw selected semantics evidence must not persist.'
    }]
  }
});
const samScopedFact = createContinuityFact({
  id: 'witness.sam.private-report',
  kind: 'witness.private',
  subject: 'crew.sam-vickers',
  predicate: 'private-report',
  summary: 'Sam privately knows the mediator planted a false corridor rumor.',
  render: {
    narrator: 'Sam privately knows the mediator planted a false corridor rumor.'
  },
  criticality: 'high',
  tags: ['crew', 'witness'],
  knownBy: ['sam-vickers'],
  witnessedBy: ['sam-vickers'],
  subjectIds: ['sam-vickers'],
  disclosureState: 'private',
  disclosureSourceFrameId: 'frame-private-sam'
});
const seniorStaffScopedFact = createContinuityFact({
  id: 'witness.senior-staff.private-briefing',
  kind: 'witness.private',
  subject: 'crew.senior-staff',
  predicate: 'private-briefing',
  summary: 'Senior staff privately know the convoy beacon was authenticated.',
  render: {
    narrator: 'Senior staff privately know the convoy beacon was authenticated.'
  },
  criticality: 'high',
  tags: ['crew', 'witness'],
  knownBy: ['senior-staff'],
  witnessedBy: ['senior-staff'],
  subjectIds: ['senior-staff'],
  disclosureState: 'private',
  disclosureSourceFrameId: 'frame-senior-staff-private'
});
const objectiveRumorFact = createContinuityFact({
  id: 'witness.sam.rumor.objective',
  kind: 'witness.objective',
  subject: 'crew.sam-vickers',
  predicate: 'corridor-rumor',
  summary: 'The corridor rumor about the mediator is false.',
  render: {
    narrator: 'The corridor rumor about the mediator is false.'
  },
  criticality: 'high',
  tags: ['crew', 'witness'],
  disclosureState: 'private',
  knownBy: ['sam-vickers'],
  witnessedBy: ['sam-vickers'],
  subjectIds: ['sam-vickers']
});
const samFalseBeliefFact = createContinuityFact({
  id: 'witness.sam.false-belief',
  kind: 'witness.false-belief',
  subject: 'crew.sam-vickers',
  predicate: 'corridor-rumor',
  summary: 'Sam incorrectly believes the mediator planted the corridor rumor.',
  render: {
    narrator: 'Sam incorrectly believes the mediator planted the corridor rumor.'
  },
  criticality: 'hard',
  confidence: 0.99,
  tags: ['crew', 'witness', 'invariant'],
  disclosureState: 'falseBelief',
  knownBy: ['sam-vickers'],
  witnessedBy: ['sam-vickers'],
  subjectIds: ['sam-vickers']
});
const samInferredFact = createContinuityFact({
  id: 'witness.sam.inferred-record',
  kind: 'witness.inferred',
  subject: 'crew.sam-vickers',
  predicate: 'departure-record',
  summary: 'Sam infers the departure record was edited after docking.',
  render: {
    narrator: 'Sam infers the departure record was edited after docking.'
  },
  criticality: 'hard',
  confidence: 0.95,
  tags: ['crew', 'witness', 'invariant'],
  disclosureState: 'inferred',
  knownBy: ['sam-vickers'],
  subjectIds: ['sam-vickers']
});
const samPublicScopedFact = createContinuityFact({
  id: 'witness.sam.public-scoped-report',
  kind: 'witness.scoped',
  subject: 'crew.sam-vickers',
  predicate: 'public-scoped-report',
  summary: 'Sam has a witness-scoped report even though disclosure defaults public.',
  render: {
    narrator: 'Sam has a witness-scoped report even though disclosure defaults public.'
  },
  criticality: 'high',
  tags: ['crew', 'witness'],
  knownBy: ['sam-vickers'],
  witnessedBy: ['sam-vickers']
});
assert.deepEqual(bronnScopedFact.knownBy, ['hadrik-bronn']);
assert.deepEqual(bronnScopedFact.witnessedBy, ['hadrik-bronn']);
assert.deepEqual(bronnScopedFact.subjectIds, ['hadrik-bronn']);
assert.equal(bronnScopedFact.disclosureState, 'private');
assert.equal(bronnScopedFact.evidenceRefs[0].textHash, 'private-bronn-hash');
assert.equal(JSON.stringify(bronnScopedFact).includes('Raw evidence text'), false);
assert.equal(JSON.stringify(bronnScopedFact).includes('Raw selected text'), false);
assert.equal(JSON.stringify(bronnScopedFact).includes('Raw source text'), false);
assert.equal(JSON.stringify(bronnScopedFact).includes('Raw quoted text'), false);
assert.equal(JSON.stringify(bronnScopedFact).includes('Raw excerpt text'), false);
assert.equal(JSON.stringify(bronnScopedFact).includes('Raw witness transcript'), false);
assert.equal(JSON.stringify(bronnScopedFact).includes('Raw provider output'), false);
assert.deepEqual(semanticsScopedFact.knownBy, ['sam-vickers']);
assert.deepEqual(semanticsScopedFact.witnessedBy, ['sam-vickers']);
assert.deepEqual(semanticsScopedFact.subjectIds, ['sam-vickers']);
assert.equal(semanticsScopedFact.disclosureState, 'private');
assert.equal(semanticsScopedFact.disclosureSourceFrameId, 'frame-private-sam-semantics');
assert.equal(semanticsScopedFact.evidenceRefs[0].textHash, 'private-sam-semantics-hash');
assert.equal(JSON.stringify(semanticsScopedFact).includes('Raw semantics evidence'), false);
assert.equal(samFalseBeliefFact.confidence, 0.5);
assert.equal(samInferredFact.confidence, 0.7);

const perspectiveFactIndex = buildContinuityFactIndex({
  campaignState: {
    ...campaignState,
    continuity: {
      ...campaignState.continuity,
      acceptedFacts: [objectiveRumorFact, samFalseBeliefFact]
    }
  },
  packageData: null,
  crewDataset: null,
  shipDataset: null,
  campaignProjection: null
});
assert.equal(perspectiveFactIndex.facts.some((fact) => fact.id === objectiveRumorFact.id), true);
assert.equal(perspectiveFactIndex.facts.some((fact) => fact.id === samFalseBeliefFact.id), true);
assert.equal(perspectiveFactIndex.conflicts.some((conflict) => conflict.rejectedFactId === samFalseBeliefFact.id), false);

const bronnPerspectiveFactIndex = buildContinuityFactIndex({
  campaignState: {
    ...campaignState,
    continuity: {
      ...campaignState.continuity,
      acceptedFacts: [bronnScopedFact, samScopedFact, seniorStaffScopedFact, samPublicScopedFact]
    }
  },
  packageData: null,
  crewDataset: null,
  shipDataset: null,
  campaignProjection: null,
  sourceFrame: {
    presentActorIds: ['hadrik-bronn'],
    actorGroups: {
      'senior-staff': ['hadrik-bronn', 'sam-vickers']
    }
  }
});
assert.equal(bronnPerspectiveFactIndex.facts.some((fact) => fact.id === bronnScopedFact.id), true);
assert.equal(bronnPerspectiveFactIndex.facts.some((fact) => fact.id === seniorStaffScopedFact.id), true);
assert.equal(bronnPerspectiveFactIndex.facts.some((fact) => fact.id === samScopedFact.id), false);
assert.equal(bronnPerspectiveFactIndex.facts.some((fact) => fact.id === samPublicScopedFact.id), false);
assert.equal(
  bronnPerspectiveFactIndex.rejected.some((rejection) => (
    rejection.factId === samScopedFact.id
    && rejection.reason === 'source-frame-knowledge-gate'
  )),
  true
);
assert.equal(
  bronnPerspectiveFactIndex.rejected.some((rejection) => (
    rejection.factId === samPublicScopedFact.id
    && rejection.reason === 'source-frame-knowledge-gate'
  )),
  true
);

const samPerspectiveFactIndex = buildContinuityFactIndex({
  campaignState: {
    ...campaignState,
    continuity: {
      ...campaignState.continuity,
      acceptedFacts: [bronnScopedFact, samScopedFact]
    }
  },
  packageData: null,
  crewDataset: null,
  shipDataset: null,
  campaignProjection: null,
  sourceFrame: {
    presentActorIds: ['sam-vickers']
  }
});
assert.equal(samPerspectiveFactIndex.facts.some((fact) => fact.id === samScopedFact.id), true);
assert.equal(samPerspectiveFactIndex.facts.some((fact) => fact.id === bronnScopedFact.id), false);

const matrix = buildContinuityProjectionMatrix({
  campaignState,
  packageData,
  crewDataset,
  shipDataset,
  campaignProjection,
  scene: { activePhaseId: 'shuttle-rendezvous', presentActorIds: ['hadrik-bronn'] },
  createdAt: '2026-06-26T00:00:00.000Z'
});
assert.deepEqual(matrix.blocks.map((block) => block.promptKey), DIRECTIVE_STATIC_PROMPT_KEYS);
assert.deepEqual(
  matrix.blocks.map((block) => block.lensPromptBudgetLane),
  ['stableRules', 'protectedContinuity', 'activeScene', 'protectedContinuity', 'recentTranscript', 'recentTranscript']
);
assert.equal(matrix.audit.blockCount, DIRECTIVE_STATIC_PROMPT_KEYS.length);
assert.match(matrix.text, /Bronn is Tellarite/i);
assert.match(matrix.text, /mustard-yellow/i);
assert.match(matrix.text, /six days at impulse/i);
assert.match(matrix.text, /Deck 10.*aft dorsal secondary hull/i);
assert.match(matrix.text, /saucer-underside/i);
assert.doesNotMatch(matrix.text, /directorOnly|rawValues/i);

const bronnMatrixScopedState = {
  ...campaignState,
  continuity: {
    ...campaignState.continuity,
    acceptedFacts: [bronnScopedFact, samPublicScopedFact]
  }
};
const bronnMatrixScopedFacts = buildContinuityProjectionMatrix({
  campaignState: bronnMatrixScopedState,
  packageData: null,
  crewDataset: null,
  shipDataset: null,
  campaignProjection: null,
  scene: { activePhaseId: 'shuttle-rendezvous', presentActorIds: ['hadrik-bronn'] },
  projectionPlan: {
    kind: CONTINUITY_PLAN_KIND,
    operations: [
      { factId: bronnScopedFact.id, lane: 'directive.continuity.domain', reason: 'actor-known-private-fact' },
      { factId: samPublicScopedFact.id, lane: 'directive.continuity.domain', reason: 'public-but-scoped-fact' }
    ],
    omitted: []
  },
  createdAt: '2026-06-26T00:00:00.000Z'
});
assert.match(bronnMatrixScopedFacts.text, /Bronn privately knows the sensor archive/i);
assert.doesNotMatch(bronnMatrixScopedFacts.text, /witness-scoped report even though disclosure defaults public/i);
assert.equal(bronnMatrixScopedFacts.plan.selectedFactIds.includes(samPublicScopedFact.id), false);

const turnRelevantMatrix = buildContinuityProjectionMatrix({
  campaignState,
  packageData,
  crewDataset,
  shipDataset,
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

const shipRelevantMatrix = buildContinuityProjectionMatrix({
  campaignState,
  packageData,
  crewDataset,
  shipDataset,
  campaignProjection,
  playerText: 'I head to the mess hall to read the room before going down to the shuttlebay.',
  projectionPlan: {
    kind: CONTINUITY_PLAN_KIND,
    operations: [],
    omitted: []
  },
  createdAt: '2026-06-26T00:00:00.000Z'
});
const messHallOperation = shipRelevantMatrix.plan.operations.find((operation) => (
  operation.factId === 'ship.uss-breckenridge.area.intrepid.mess-hall.layout'
));
assert(messHallOperation, 'Turn-relevant mess hall ship layout should survive Utility omission.');
assert.equal(messHallOperation.lane, 'directive.continuity.domain');
assert.equal(messHallOperation.force, 'boost');
assert.equal(messHallOperation.reason, 'validator-added-turn-relevance');
assert.equal(
  shipRelevantMatrix.plan.selectedFactIds.includes('ship.uss-breckenridge.area.intrepid.shuttlebay-complex.not-saucer-underside'),
  true
);
assert.match(shipRelevantMatrix.text, /Deck 10.*aft dorsal secondary hull/i);

const badReview = reviewContinuityContradictions({
  text: 'Bronn, a human male in his early forties, grunted that the ship had been at impulse for six days since leaving Utopia Planitia. Bronn wears the red-and-black of tactical, not command, though the acting-XO pip is visible on his collar. The shuttlebay doors cycled open as a lit mouth in the underside of the saucer.',
  campaignState,
  packageData,
  crewDataset,
  shipDataset,
  campaignProjection
});
assert.equal(badReview.ok, false);
assert.equal(badReview.findings.some((finding) => finding.kind === 'species-contradiction'), true);
assert.equal(badReview.findings.some((finding) => finding.kind === 'age-contradiction'), true);
assert.equal(badReview.findings.some((finding) => finding.kind === 'uniform-division-color-contradiction'), true);
assert.equal(badReview.findings.some((finding) => finding.kind === 'travel-contradiction'), true);
assert.equal(badReview.findings.some((finding) => finding.kind === 'ship-layout-contradiction'), true);

const goodReview = reviewContinuityContradictions({
  text: 'Bronn, the Tellarite tactical chief, watched the shuttle rendezvous at the transfer waypoint as the craft aligned from astern with shuttlebay two for the final approach.',
  campaignState,
  packageData,
  crewDataset,
  shipDataset,
  campaignProjection
});
assert.equal(goodReview.ok, true);

const witnessCampaignState = {
  ...campaignState,
  continuity: {
    ...campaignState.continuity,
    acceptedFacts: [bronnScopedFact, samScopedFact, seniorStaffScopedFact]
  }
};
const witnessMatrix = buildContinuityProjectionMatrix({
  campaignState: witnessCampaignState,
  packageData,
  crewDataset,
  shipDataset,
  campaignProjection,
  scene: {
    activePhaseId: 'shuttle-rendezvous',
    presentActorIds: ['hadrik-bronn'],
    actorGroups: {
      'senior-staff': ['hadrik-bronn', 'sam-vickers']
    }
  },
  projectionPlan: {
    kind: CONTINUITY_PLAN_KIND,
    operations: [
      { factId: bronnScopedFact.id, lane: 'directive.continuity.domain', reason: 'actor-known-private-fact' },
      { factId: samScopedFact.id, lane: 'directive.continuity.domain', reason: 'blocked-private-fact' },
      { factId: seniorStaffScopedFact.id, lane: 'directive.continuity.domain', reason: 'group-known-private-fact' }
    ],
    omitted: []
  },
  createdAt: '2026-06-26T00:00:00.000Z'
});
assert.match(witnessMatrix.text, /Bronn privately knows the sensor archive/i);
assert.match(witnessMatrix.text, /Knowledge scope: knownBy=hadrik-bronn/i);
assert.match(witnessMatrix.text, /Senior staff privately know the convoy beacon was authenticated/i);
assert.match(witnessMatrix.text, /Knowledge scope: knownBy=senior-staff/i);
assert.doesNotMatch(witnessMatrix.text, /mediator planted a false corridor rumor/i);
assert.equal(witnessMatrix.plan.selectedFactIds.includes(bronnScopedFact.id), true);
assert.equal(witnessMatrix.plan.selectedFactIds.includes(seniorStaffScopedFact.id), true);
assert.equal(witnessMatrix.plan.selectedFactIds.includes(samScopedFact.id), false);
const witnessDomainBlock = witnessMatrix.blocks.find((block) => block.promptKey === 'directive.continuity.domain');
assert.equal(
  witnessDomainBlock.promptBudgetRefs.some((ref) => ref.id === bronnScopedFact.id && ref.lensPromptBudgetLane === 'activeCast'),
  true
);
assert.equal(
  witnessDomainBlock.promptBudgetRefs.some((ref) => ref.id === seniorStaffScopedFact.id && ref.lensPromptBudgetLane === 'activeCast'),
  true
);
const bronnWitnessBudgetRef = witnessDomainBlock.promptBudgetRefs.find((ref) => ref.id === bronnScopedFact.id);
assert.deepEqual(bronnWitnessBudgetRef.knowledgeScope.knownBy, ['hadrik-bronn']);
assert.deepEqual(bronnWitnessBudgetRef.knowledgeScope.witnessedBy, ['hadrik-bronn']);
assert.deepEqual(bronnWitnessBudgetRef.knowledgeScope.subjectIds, ['hadrik-bronn']);
assert.equal(bronnWitnessBudgetRef.knowledgeScope.disclosureState, 'private');
assert.equal(bronnWitnessBudgetRef.knowledgeScope.disclosureSourceFrameId, 'frame-private-bronn');
assert.equal(JSON.stringify(witnessDomainBlock.promptBudgetRefs).includes('sensor archive was sealed'), false);

const samPerspectiveCampaignState = {
  ...campaignState,
  continuity: {
    ...campaignState.continuity,
    acceptedFacts: [objectiveRumorFact, samFalseBeliefFact, samInferredFact]
  }
};
const samPerspectiveMatrix = buildContinuityProjectionMatrix({
  campaignState: samPerspectiveCampaignState,
  packageData,
  crewDataset,
  shipDataset,
  campaignProjection,
  scene: { activePhaseId: 'shuttle-rendezvous', presentActorIds: ['sam-vickers'] },
  projectionPlan: {
    kind: CONTINUITY_PLAN_KIND,
    operations: [
      { factId: samFalseBeliefFact.id, lane: 'directive.continuity.invariants', reason: 'perspective-not-truth-floor' },
      { factId: samInferredFact.id, lane: 'directive.continuity.invariants', reason: 'provisional-not-truth-floor' }
    ],
    omitted: []
  },
  createdAt: '2026-06-26T00:00:00.000Z'
});
assert.match(samPerspectiveMatrix.text, /Sam incorrectly believes the mediator planted the corridor rumor/i);
assert.match(samPerspectiveMatrix.text, /disclosure=falseBelief/i);
assert.match(samPerspectiveMatrix.text, /Sam infers the departure record/i);
assert.match(samPerspectiveMatrix.text, /disclosure=inferred/i);
assert.equal(samPerspectiveMatrix.plan.laneFactIds['directive.continuity.invariants']?.includes(samFalseBeliefFact.id), false);
assert.equal(samPerspectiveMatrix.plan.laneFactIds['directive.continuity.invariants']?.includes(samInferredFact.id), false);
assert.equal(samPerspectiveMatrix.plan.laneFactIds['directive.continuity.domain'].includes(samFalseBeliefFact.id), true);
assert.equal(samPerspectiveMatrix.plan.laneFactIds['directive.continuity.domain'].includes(samInferredFact.id), true);
assert.equal(
  samPerspectiveMatrix.plan.rejections.filter((rejection) => rejection.reason === 'lane-lowered-for-disclosure-state').length >= 2,
  true
);

const unrelatedUniformReview = reviewContinuityContradictions({
  text: 'Lieutenant Commander Hadrik Bronn waited in a mustard-yellow tactical tunic. Captain Mara Whitaker, a Human commanding officer in a burgundy-red command uniform, expected the new XO on the bridge.',
  campaignState,
  packageData,
  crewDataset,
  shipDataset,
  campaignProjection
});
assert.equal(unrelatedUniformReview.ok, true);

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
