import assert from 'node:assert/strict';

import { SOAK_CAMPAIGN_MATRIX } from './soak-sillytavern-campaign-live.mjs';
import { buildFactualGroundingCanaryPacks } from './lib/factual-grounding-canaries.mjs';
import {
  buildFactualGroundingCheck,
  promptBlocksFromInspection
} from './lib/factual-grounding-evaluator.mjs';

const ashesPackageId = 'directive:campaign-package:breckenridge-ashes-of-peace';
const packs = buildFactualGroundingCanaryPacks({ campaignMatrix: SOAK_CAMPAIGN_MATRIX });
const ashesPack = packs.find((pack) => pack.packageId === ashesPackageId);
assert(ashesPack, 'Ashes of Peace factual canary pack should exist.');

const bronnCanary = ashesPack.canaries.find((entry) => entry.id.endsWith('.senior-crew.hadrik-bronn.identity'));
const whitakerCanary = ashesPack.canaries.find((entry) => entry.id.endsWith('.senior-crew.mara-whitaker.identity'));
const nayarCanary = ashesPack.canaries.find((entry) => entry.id.endsWith('.senior-crew.priya-nayar.identity'));
const crossCanary = ashesPack.canaries.find((entry) => entry.id.endsWith('.senior-crew.imani-cross.identity'));
const transitCanary = ashesPack.canaries.find((entry) => entry.id.endsWith('.opening.transit-premise'));
assert(bronnCanary, 'Bronn identity canary should exist.');
assert(whitakerCanary, 'Whitaker identity canary should exist.');
assert(nayarCanary, 'Nayar identity canary should exist.');
assert(crossCanary, 'Cross identity canary should exist.');
assert(transitCanary, 'Ashes transit-premise canary should exist.');

assert(bronnCanary.expectedPromptKeys.includes('directive.continuity.invariants'));
assert(bronnCanary.expectedPromptKeys.includes('directive.continuity.domain'));
assert(bronnCanary.expectedPromptKeys.includes('directive.scene.active'));
assert(bronnCanary.expectedSourceIds.includes('crew.hadrik-bronn.species'));
assert(bronnCanary.expectedSourceIds.includes('crew.hadrik-bronn.age-description'));
assert(bronnCanary.expectedSourceIds.includes('crew.hadrik-bronn.uniform-division-color'));

assert(transitCanary.expectedPromptKeys.includes('directive.continuity.invariants'));
assert(transitCanary.expectedPromptKeys.includes('directive.continuity.domain'));
assert(transitCanary.expectedPromptKeys.includes('directive.scene.active'));
assert.match(transitCanary.summary, /shuttlebay two.*aft section between the swept nacelle pylons/i);
assert(transitCanary.expectedSourceIds.includes('ship.uss-breckenridge.travel.not-six-days-impulse'));
assert(transitCanary.expectedSourceIds.includes('ship.uss-breckenridge.travel.current-route'));

const matrixPromptBlocks = promptBlocksFromInspection({
  blocks: [
    {
      id: 'matrix-invariants',
      promptKey: 'directive.continuity.invariants',
      ttl: 'campaign',
      sourceHash: 'sha256:matrix-invariants',
      sourceIds: [
        'crew.hadrik-bronn.species',
        'crew.hadrik-bronn.age-description',
        'crew.hadrik-bronn.uniform-division-color',
        'crew.mara-whitaker.species',
        'crew.mara-whitaker.billet',
        'crew.priya-nayar.species',
        'crew.priya-nayar.billet',
        'ship.uss-breckenridge.travel.not-six-days-impulse'
      ]
    },
    {
      id: 'matrix-domain',
      promptKey: 'directive.continuity.domain',
      ttl: 'scene',
      sourceHash: 'sha256:matrix-domain',
      sourceIds: [
        'crew.hadrik-bronn.billet',
        'ship.uss-breckenridge.travel.current-route'
      ]
    },
    {
      id: 'matrix-active-scene',
      promptKey: 'directive.scene.active',
      ttl: 'turn',
      sourceHash: 'sha256:matrix-active-scene',
      sourceIds: [
        'ship.uss-breckenridge.travel.crew-underway-duration'
      ]
    }
  ]
});

const metadataOnlyCheck = buildFactualGroundingCheck({
  pack: ashesPack,
  generatedMessageId: 'matrix-metadata-only',
  generatedMessageIndex: 0,
  transcriptPointer: 'transcript/readable-chat.md#matrix-metadata-only',
  promptBlocks: matrixPromptBlocks,
  requiredFactIds: [bronnCanary.id, transitCanary.id],
  generatedText: 'Hadrik Bronn, a human male in his early forties, says the ship has been at impulse for six days since leaving Utopia Planitia.'
});

assert.equal(metadataOnlyCheck.status, 'fail');
assert.equal(metadataOnlyCheck.counts.contradicted, 2);
assert.equal(metadataOnlyCheck.promptAvailability.byFactId[bronnCanary.id].status, 'available');
assert.equal(metadataOnlyCheck.promptAvailability.byFactId[transitCanary.id].status, 'available');
assert.equal(metadataOnlyCheck.results.find((entry) => entry.factId === bronnCanary.id).rootCauseLabel, 'model-ignored-available-fact');
assert.equal(metadataOnlyCheck.results.find((entry) => entry.factId === transitCanary.id).rootCauseLabel, 'model-ignored-available-fact');
assert(metadataOnlyCheck.results.find((entry) => entry.factId === bronnCanary.id).matchedPromptMetadata.some((entry) => entry.term === 'crew.hadrik-bronn.species'));
assert(metadataOnlyCheck.results.find((entry) => entry.factId === transitCanary.id).matchedPromptMetadata.some((entry) => entry.term === 'ship.uss-breckenridge.travel.not-six-days-impulse'));

const transcriptShapeCheck = buildFactualGroundingCheck({
  pack: ashesPack,
  generatedMessageId: 'matrix-transcript-shape',
  generatedMessageIndex: null,
  transcriptPointer: 'transcript/readable-chat.md',
  promptBlocks: matrixPromptBlocks,
  generatedText: [
    'Lieutenant Commander Hadrik Bronn was waiting in the shuttlebay.',
    'Broad and compact, russet-skinned, his strong Tellarite snout and heavy brows caught the bay lights.',
    'Late fifties by human reckoning, he extended the acting-XO handoff package.',
    'Captain Whitaker expects the new XO on the bridge.',
    'Lieutenant Vale remained at the conn while Lieutenant Nayar watched operations telemetry.',
    'The Tellarite equivalent of a smile faded. Captain Whitaker stayed in the ready room.',
    'His expression read as almost friendly. To his left, Lieutenant Priya Nayar held a PADD.'
  ].join(' ')
});

assert.equal(transcriptShapeCheck.status, 'pass');
assert.equal(transcriptShapeCheck.counts.contradicted, 0);
assert.equal(transcriptShapeCheck.counts.omitted, 0);

const uniformColorCheck = buildFactualGroundingCheck({
  pack: ashesPack,
  generatedMessageId: 'matrix-uniform-color',
  generatedMessageIndex: null,
  transcriptPointer: 'transcript/readable-chat.md#uniform-color',
  promptBlocks: matrixPromptBlocks,
  requiredFactIds: [bronnCanary.id],
  generatedText: 'Lieutenant Commander Hadrik Bronn waits at the foot of the ramp. He wears the red-and-black of tactical, not command, though the acting-XO pip is visible on his collar.'
});

assert.equal(uniformColorCheck.status, 'fail');
assert.equal(uniformColorCheck.counts.contradicted, 1);
assert(uniformColorCheck.results.find((entry) => entry.factId === bronnCanary.id).contradictionMatches.some((entry) => /red-and-black|uniform color/i.test(entry.term)));

const unrelatedUniformMentionCheck = buildFactualGroundingCheck({
  pack: ashesPack,
  generatedMessageId: 'matrix-unrelated-uniform-color',
  generatedMessageIndex: null,
  transcriptPointer: 'transcript/readable-chat.md#unrelated-uniform-color',
  promptBlocks: matrixPromptBlocks,
  requiredFactIds: [whitakerCanary.id],
  generatedText: [
    'Lieutenant Commander Hadrik Bronn waits at the foot of the ramp in a mustard-yellow tactical tunic.',
    'Captain Mara Whitaker, a Human commanding officer in burgundy-red command uniform, expects the new executive officer on the bridge.'
  ].join(' ')
});

assert.equal(unrelatedUniformMentionCheck.status, 'pass');
assert.equal(unrelatedUniformMentionCheck.counts.contradicted, 0);

const quotedSentenceBoundaryCheck = buildFactualGroundingCheck({
  pack: ashesPack,
  generatedMessageId: 'matrix-quoted-sentence-boundary',
  generatedMessageIndex: null,
  transcriptPointer: 'transcript/readable-chat.md#quoted-sentence-boundary',
  promptBlocks: matrixPromptBlocks,
  generatedText: 'Commander Cross flagged a few interactions in the upgraded systems that had not been stress-tested together yet." He paused, and the blunt Tellarite expression settled into professional regard.'
});

assert.equal(quotedSentenceBoundaryCheck.status, 'pass');
assert.equal(quotedSentenceBoundaryCheck.counts.contradicted, 0);

const crossVerbTellariteCheck = buildFactualGroundingCheck({
  pack: ashesPack,
  generatedMessageId: 'matrix-cross-verb-tellarite',
  generatedMessageIndex: null,
  transcriptPointer: 'transcript/readable-chat.md#cross-verb-tellarite',
  promptBlocks: matrixPromptBlocks,
  generatedText: [
    'Lieutenant Commander Hadrik Bronn watched the shuttle cross the forcefield threshold with the planted patience of a Tellarite officer.',
    'Commander Cross had the refit discrepancy list in engineering.'
  ].join(' ')
});

assert.equal(crossVerbTellariteCheck.status, 'pass');
assert.equal(crossVerbTellariteCheck.counts.contradicted, 0);

const sameSentenceSpeciesError = buildFactualGroundingCheck({
  pack: ashesPack,
  generatedMessageId: 'matrix-same-sentence-species-error',
  generatedMessageIndex: null,
  transcriptPointer: 'transcript/readable-chat.md#species-error',
  promptBlocks: matrixPromptBlocks,
  requiredFactIds: [whitakerCanary.id, nayarCanary.id],
  generatedText: 'Captain Mara Whitaker is a Tellarite officer. Lieutenant Priya Nayar is a Tellarite operations officer.'
});

assert.equal(sameSentenceSpeciesError.status, 'fail');
assert.equal(sameSentenceSpeciesError.counts.contradicted, 2);

console.log('factual grounding matrix prompt proof ok');
