import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createRecallQuery,
  normalizeRecallIndexEntry,
  queryRecallIndex,
  RECALL_INDEX_ENTRY_KIND,
  RECALL_QUERY_KIND,
  RECALL_RESULT_KIND
} from '../../src/retrieval/recall-index.mjs';

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const schema = readJson('schemas/runtime/recall-index.schema.json');
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.additionalProperties, false);
assert.deepEqual(schema.required, ['entry', 'query', 'result']);

const committedBronn = normalizeRecallIndexEntry({
  id: 'recall-bronn-warning',
  campaignId: 'campaign-ashes',
  saveId: 'save-ashes',
  branchId: 'main',
  sourceFrameRef: {
    id: 'frame-29',
    textHash: 'player-hash-29',
    selectedAssistantVariantHash: 'assistant-hash-28',
    rawPlayerText: 'Sam waited for her reply. This raw text must not serialize.'
  },
  coreEventRefs: [{
    id: 'event-29',
    type: 'mechanicsCommitted',
    providerOutput: 'Raw provider output must not serialize.'
  }],
  sceneSealRef: {
    id: 'seal-ready-room',
    hash: 'seal-hash',
    rawTranscript: 'Raw transcript must not serialize.'
  },
  phaseId: 'ready-room-handover',
  sceneId: 'scene-ready-room',
  locationId: 'ready-room',
  actorIds: ['bronn', 'sam-vickers'],
  subjectIds: ['command-handoff'],
  threadIds: ['thread-command-trust'],
  missionIds: ['mission-ashes'],
  tags: ['handoff', 'trust'],
  keywords: ['Tellarite', 'warning'],
  authority: 'committed',
  textHash: 'accepted-text-hash',
  preview: 'Bronn warned Sam that a command handoff is only clean when the crew can see the new officer make a decision.',
  rawSummaryceptionText: 'Summaryception text must not serialize.'
});

const packageFact = normalizeRecallIndexEntry({
  id: 'package-breckenridge-layout',
  campaignId: 'campaign-ashes',
  saveId: 'save-ashes',
  branchId: 'main',
  authority: 'package',
  locationId: 'shuttlebay-two',
  actorIds: ['sam-vickers'],
  subjectIds: ['ship-layout'],
  missionIds: ['mission-ashes'],
  tags: ['ship'],
  keywords: ['shuttlebay'],
  textHash: 'package-card-hash',
  metadataHash: 'package-metadata-hash'
});

const semanticCandidate = normalizeRecallIndexEntry({
  id: 'semantic-vector-hit',
  campaignId: 'campaign-ashes',
  saveId: 'save-ashes',
  branchId: 'main',
  authority: 'diagnosticCandidate',
  actorIds: ['sam-vickers'],
  subjectIds: ['command-handoff'],
  keywords: ['warning'],
  embeddingRef: {
    id: 'embedding-1',
    hash: 'embedding-ref-hash',
    vectorPayload: 'Raw vector payload must not serialize.',
    apiKey: 'SECRET-QDRANT-KEY'
  },
  textHash: 'semantic-hit-hash'
});

const staleSwipe = normalizeRecallIndexEntry({
  id: 'stale-selected-swipe',
  campaignId: 'campaign-ashes',
  saveId: 'save-ashes',
  branchId: 'main',
  authority: 'committed',
  sourceFrameRef: { id: 'frame-stale', textHash: 'old-selected-swipe-hash' },
  actorIds: ['bronn'],
  subjectIds: ['command-handoff'],
  stale: true,
  staleReason: 'selected-swipe-invalidated',
  textHash: 'old-assistant-hash'
});

for (const entry of [committedBronn, packageFact, semanticCandidate, staleSwipe]) {
  assert.equal(entry.kind, RECALL_INDEX_ENTRY_KIND);
  assert.equal(entry.schemaVersion, 1);
  assert.match(entry.hash, /^[a-f0-9]{64}$/);
  const serialized = JSON.stringify(entry);
  assert.equal(serialized.includes('Raw provider output'), false);
  assert.equal(serialized.includes('Raw transcript'), false);
  assert.equal(serialized.includes('Sam waited for her reply'), false);
  assert.equal(serialized.includes('Summaryception text'), false);
  assert.equal(serialized.includes('Raw vector payload'), false);
  assert.equal(serialized.includes('SECRET'), false);
}

const query = createRecallQuery({
  campaignId: 'campaign-ashes',
  saveId: 'save-ashes',
  branchId: 'main',
  sourceFrameId: 'frame-30',
  actorIds: ['sam-vickers', 'bronn'],
  subjectIds: ['command-handoff'],
  locationId: 'ready-room',
  missionId: 'mission-ashes',
  threadIds: ['thread-command-trust'],
  phaseId: 'ready-room-handover',
  tags: ['handoff'],
  keywords: ['warning'],
  limit: 2
});

assert.equal(query.kind, RECALL_QUERY_KIND);
assert.equal(query.includeSemanticCandidates, false);
assert.match(query.hash, /^[a-f0-9]{64}$/);

const deterministicResult = queryRecallIndex({
  entries: [semanticCandidate, packageFact, committedBronn, staleSwipe],
  query
});

assert.equal(deterministicResult.kind, RECALL_RESULT_KIND);
assert.equal(deterministicResult.trace.deterministicFirst, true);
assert.equal(deterministicResult.trace.semanticCandidatesAuthoritative, false);
assert.deepEqual(
  deterministicResult.includedRefs.map((ref) => ref.id),
  ['recall-bronn-warning', 'package-breckenridge-layout']
);
assert.equal(deterministicResult.includedRefs[0].authority, 'committed');
assert.equal(deterministicResult.includedRefs[0].directiveAuthority, true);
assert.equal(
  deterministicResult.omittedRefs.find((ref) => ref.id === 'semantic-vector-hit')?.omissionReason,
  'semantic-candidates-disabled'
);
assert.equal(
  deterministicResult.omittedRefs.find((ref) => ref.id === 'stale-selected-swipe')?.omissionReason,
  'selected-swipe-invalidated'
);
assert.match(deterministicResult.recallIndexRevision, /^[a-f0-9]{64}$/);
assert.match(deterministicResult.queryHash, /^[a-f0-9]{64}$/);

const semanticResult = queryRecallIndex({
  entries: [semanticCandidate, committedBronn],
  query: {
    ...query,
    includeSemanticCandidates: true,
    limit: 3
  }
});

const semanticRef = semanticResult.includedRefs.find((ref) => ref.id === 'semantic-vector-hit');
assert.equal(semanticRef.semanticCandidate, true);
assert.equal(semanticRef.directiveAuthority, false);
assert.equal(semanticRef.scoreReasons.includes('semanticCandidateNonAuthoritative'), true);
assert.equal(JSON.stringify(semanticResult).includes('Raw vector payload'), false);
assert.equal(JSON.stringify(semanticResult).includes('SECRET'), false);

console.log('Directive Recall Index contract tests passed.');

