import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  applyRecallSourceMutation,
  createRecallQuery,
  createRecallSourceMutation,
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
assert.deepEqual(schema.required, ['entry', 'query', 'result', 'mutation']);

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
  retrieval: {
    mode: 'package',
    priority: 82,
    audience: ['narratorSafe', 'playerSafe'],
    knownBy: ['sam-vickers', 'mara-whitaker'],
    sourceAuthority: 'package',
    ragHints: {
      facet: 'ship-layout',
      promptBody: 'Raw prompt hint must not serialize.',
      vectorPayload: 'Raw vector hint must not serialize.'
    }
  },
  textHash: 'package-card-hash',
  metadataHash: 'package-metadata-hash'
});

const semanticCandidate = normalizeRecallIndexEntry({
  id: 'semantic-vector-hit',
  campaignId: 'campaign-ashes',
  saveId: 'save-ashes',
  branchId: 'main',
  authority: 'diagnosticCandidate',
  retrieval: {
    mode: 'semanticCandidate',
    priority: 40,
    audience: ['diagnosticOnly'],
    sourceAuthority: 'diagnosticCandidate',
    ragHints: {
      queryHint: 'command handoff warning',
      embedding: [1, 2, 3]
    }
  },
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

const branchOnlyRecall = normalizeRecallIndexEntry({
  id: 'other-branch-recall',
  campaignId: 'campaign-ashes',
  saveId: 'save-ashes-branch',
  branchId: 'branch-save-as',
  authority: 'committed',
  sourceFrameRef: { id: 'frame-branch', textHash: 'branch-text-hash' },
  actorIds: ['sam-vickers'],
  subjectIds: ['command-handoff'],
  keywords: ['warning'],
  textHash: 'branch-only-hash'
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
  assert.equal(serialized.includes('Raw prompt hint'), false);
  assert.equal(serialized.includes('Raw vector hint'), false);
  assert.equal(serialized.includes('[1,2,3]'), false);
}
assert.equal(packageFact.retrieval.mode, 'package');
assert.equal(packageFact.retrieval.priority, 82);
assert.deepEqual(packageFact.retrieval.knownBy, ['sam-vickers', 'mara-whitaker']);
assert.equal(packageFact.retrieval.ragHints.facet, 'ship-layout');
assert.equal(packageFact.retrieval.ragHints.promptBody, undefined);

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
  entries: [semanticCandidate, packageFact, committedBronn, staleSwipe, branchOnlyRecall],
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
assert.equal(
  deterministicResult.omittedRefs.find((ref) => ref.id === 'other-branch-recall')?.omissionReason,
  'scope-mismatch'
);
const deterministicResultWithoutBranchNoise = queryRecallIndex({
  entries: [semanticCandidate, packageFact, committedBronn, staleSwipe],
  query
});
assert.equal(
  deterministicResult.recallIndexRevision,
  deterministicResultWithoutBranchNoise.recallIndexRevision,
  'Unrelated branch entries must not churn scoped recall revisions.'
);
assert.match(deterministicResult.recallIndexRevision, /^[a-f0-9]{64}$/);
assert.match(deterministicResult.queryHash, /^[a-f0-9]{64}$/);

const packageLoreQuery = createRecallQuery({
  campaignId: 'campaign-ashes',
  saveId: 'save-ashes',
  branchId: 'main',
  retrievalMode: 'package',
  audiences: ['narratorSafe'],
  knownBy: ['sam-vickers'],
  sourceAuthority: 'package',
  keywords: ['shuttlebay'],
  limit: 4
});
const packageLoreResult = queryRecallIndex({
  entries: [semanticCandidate, packageFact, committedBronn],
  query: packageLoreQuery
});
assert.deepEqual(packageLoreResult.includedRefs.map((ref) => ref.id), ['package-breckenridge-layout']);
assert.equal(packageLoreResult.includedRefs[0].retrieval.mode, 'package');
assert.equal(packageLoreResult.includedRefs[0].retrieval.sourceAuthority, 'package');
assert.equal(packageLoreResult.includedRefs[0].scoreReasons.includes('retrievalMode'), true);
assert.equal(packageLoreResult.includedRefs[0].scoreReasons.includes('knownBy'), true);
assert.equal(
  packageLoreResult.omittedRefs.find((ref) => ref.id === 'recall-bronn-warning')?.omissionReason,
  'retrieval-mode-mismatch'
);
assert.equal(JSON.stringify(packageLoreResult).includes('Raw prompt hint'), false);
assert.equal(JSON.stringify(packageLoreResult).includes('Raw vector hint'), false);

const selectedSwipeMutation = createRecallSourceMutation({
  action: 'selected-swipe',
  campaignId: 'campaign-ashes',
  saveId: 'save-ashes',
  branchId: 'main',
  sourceFrameIds: ['frame-29'],
  replacementSourceFrameRefs: [{
    id: 'frame-29-replacement',
    textHash: 'replacement-hash',
    selectedText: 'Raw selected swipe text must not serialize.'
  }],
  occurredAt: '2026-07-02T12:00:00.000Z'
});
assert.match(selectedSwipeMutation.hash, /^[a-f0-9]{64}$/);
assert.equal(JSON.stringify(selectedSwipeMutation).includes('Raw selected swipe text'), false);

const invalidatedRecall = applyRecallSourceMutation({
  entries: [committedBronn, packageFact],
  mutation: selectedSwipeMutation
});
assert.equal(invalidatedRecall.trace.invalidatedCount, 1);
assert.equal(invalidatedRecall.invalidatedSourceFrameIds.includes('frame-29'), true);
assert.equal(JSON.stringify(invalidatedRecall).includes('Raw selected swipe text'), false);
const invalidatedBronn = invalidatedRecall.entries.find((entry) => entry.id === committedBronn.id);
assert.equal(invalidatedBronn.stale, true);
assert.equal(invalidatedBronn.staleReason, 'selected-swipe-invalidated');
assert.equal(invalidatedBronn.invalidatedByRef.action, 'selected-swipe');
const invalidatedResult = queryRecallIndex({
  entries: invalidatedRecall.entries,
  query
});
assert.equal(
  invalidatedResult.omittedRefs.find((ref) => ref.id === committedBronn.id)?.omissionReason,
  'selected-swipe-invalidated'
);

const saveAsFork = applyRecallSourceMutation({
  entries: [committedBronn, packageFact, staleSwipe],
  mutation: {
    action: 'save-as',
    campaignId: 'campaign-ashes',
    saveId: 'save-ashes',
    branchId: 'main',
    targetSaveId: 'save-ashes-copy',
    targetBranchId: 'branch-save-as'
  }
});
assert.equal(saveAsFork.trace.forkedCount, 2);
assert.equal(saveAsFork.trace.invalidatedCount, 0);
const forkedBronn = saveAsFork.entries.find((entry) => entry.forkedFromRef?.id === committedBronn.id);
assert.equal(forkedBronn.saveId, 'save-ashes-copy');
assert.equal(forkedBronn.branchId, 'branch-save-as');
assert.equal(forkedBronn.stale, false);
assert.equal(forkedBronn.forkedFromRef.hash, committedBronn.hash);
const forkQuery = createRecallQuery({
  ...query,
  saveId: 'save-ashes-copy',
  branchId: 'branch-save-as',
  limit: 4
});
const forkResult = queryRecallIndex({
  entries: saveAsFork.entries,
  query: forkQuery
});
assert.equal(forkResult.includedRefs.some((ref) => ref.forkedFromRef?.id === committedBronn.id), true);
assert.equal(forkResult.includedRefs.some((ref) => ref.id === committedBronn.id), false);

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
