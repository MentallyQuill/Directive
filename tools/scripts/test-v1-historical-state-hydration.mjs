import assert from 'node:assert/strict';
import * as storage from '../../src/storage/v1-storage-repository.mjs';
import { sha256Json, encodeV1StateDelta, canonicalJson } from '../../src/storage/v1-state-delta-codec.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime, buildV1RuntimePlayerProjection } from '../../src/runtime/v1-mission-runtime.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createScenePacingContext } from '../../src/narration/scene-pacing.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const saveId = 'save.historical';
const now = '2026-09-14T12:00:00.000Z';
const manifestPath = storage.V1_STORAGE_PATHS.save(saveId);
function memoryAdapter(seed = {}) {
  const files = new Map(Object.entries(structuredClone(seed)));
  let writes = 0;
  return {
    async readJson(path) {
      if (!files.has(path)) throw Object.assign(new Error(`Missing ${path}`), { code: 'ENOENT' });
      return structuredClone(files.get(path));
    },
    async writeJson(path, value) { writes++; files.set(path, structuredClone(value)); },
    snapshot: () => structuredClone(Object.fromEntries(files)),
    set: (path, value) => files.set(path, structuredClone(value)),
    delete: path => files.delete(path),
    get writes() { return writes; },
  };
}

const adapter = memoryAdapter();
const assets = loadAshesRuntimeAssets();
const definition = assets.missionDefinitions[0];
let state = createAshesInitialState({ campaignId: 'campaign.historical', saveId, chatId: 'chat.historical' });
const journey = createInitialMissionJourney({ definition, branchId: saveId });
state.mission = { activeMissionId: definition.packageBinding.sourceId,
  v1: createMissionState({ definition, branchId: saveId }), v1Journey: journey.journey, v1History: journey.history };
let currentSave = storage.createV1CampaignSave({ id: saveId, state, createdAt: now });
await storage.storeV1CampaignSave(adapter, currentSave);
const captured = new Map([[state.stateCustody.revision, structuredClone(state)]]);
const gateway = createStateDeltaGateway({ getState: () => state, setState: next => { state = next; },
  persist: async next => {
    const save = storage.createV1CampaignSave({ id: saveId, state: next, createdAt: now, updatedAt: now });
    await storage.storeV1CampaignSave(adapter, save, { previousSave: currentSave });
    currentSave = save;
    captured.set(next.stateCustody.revision, structuredClone(next));
  } });
let nextOutput, pairNumber = 0;
const runtime = createV1MissionRuntime({ getState: () => state, stateDeltaGateway: gateway,
  generationRouter: { async generate(role) {
    assert.equal(role, 'acceptedPairMissionEvidence');
    return { ok: true, response: { text: JSON.stringify(nextOutput) } };
  } } });
const handover = 'objective.prelude.command-handover';
const distress = 'fact.hesperus.distress-established';
async function control(action, disposition) {
  const result = await runtime.adjustObjectiveProgress({ runtimeAssets: assets, missionId: definition.id,
    objectiveId: handover, action, ...(disposition ? { disposition } : {}),
    expectedRevision: state.mission.v1.revision, expectedRunId: state.mission.v1Journey.activeRunId });
  assert.equal(result.ok, true, JSON.stringify(result));
}
async function pair() {
  pairNumber++;
  const context = createScenePacingContext({ definition, state: state.mission.v1,
    receipts: state.storySettlement?.acceptedPairReceipts || [] });
  nextOutput = { kind: 'directive.missionEvidenceInterpretation.v1', assistantAcceptance: 'accepted',
    claims: [], peopleEvents: [], abstained: true,
    time: { decision: 'unchanged', basis: 'noPassage', elapsedSeconds: 0, reason: 'No time passes.', confidence: 1 },
    scenePacing: { objectiveId: context.currentScene.objectiveId, intent: 'continue', intentQuote: '',
      unresolved: '', participation: [] } };
  const result = await runtime.settleAcceptedPair({ runtimeAssets: assets, snapshot: {
    kind: 'directive.acceptedPairSnapshot.v1', envelope: { campaignId: state.campaign.id, saveId,
      chatId: state.campaignChatBinding.chatId, packageId: definition.packageBinding.packageId,
      packageVersion: definition.packageBinding.packageVersion, activeMissionId: definition.packageBinding.sourceId },
    source: { sourceRangeHash: `range.${pairNumber}`, previousAssistant: {
      hostMessageId: String(pairNumber * 2), text: 'The officers wait for the next question.',
      textHash: 'a1b2c3d4', sourceIntegrity: 'clean', selectedVariant: { selectedTextHash: 'a1b2c3d4', sourceIntegrity: 'clean' } },
    currentPlayer: { hostMessageId: String(pairNumber * 2 + 1), text: 'Please explain the remaining work.',
      textHash: 'b1c2d3e4', sourceIntegrity: 'clean' } } } });
  assert.equal(result.ok, true, JSON.stringify(result));
}
await pair();
await control('resolve', 'completed');
await pair();
const beforeReopen = structuredClone(state);
await control('reopen');
const afterReopen = structuredClone(state);
assert.equal(beforeReopen.mission.v1.worldFacts.includes(distress), true);
assert.equal(afterReopen.mission.v1.worldFacts.includes(distress), false);
assert.notDeepEqual(beforeReopen.storySettlement, afterReopen.storySettlement, 'fixture correction actually prunes story authority');
await control('resume');
await control('resolve', 'completed');
await pair();

const expectedManifest = await adapter.readJson(manifestPath);
const beforeReads = adapter.snapshot();
const writesBeforeReads = adapter.writes;
const hydrate = storage.loadV1CampaignStateAtRevision;
assert.equal(typeof hydrate, 'function', 'repository must expose exact read-only historical-state hydration');
for (const [revision, expected] of captured) {
  const result = await hydrate({ readJson: adapter.readJson }, saveId, { expectedManifest, revision });
  assert.deepEqual(result.state, expected, `restore complete captured state at custody revision ${revision}`);
  assert.equal(result.stateHash, await sha256Json(expected));
  assert.equal(result.revision, revision);
  assert.equal(result.origin.saveId, saveId);
  assert.equal(result.origin.campaignId, state.campaign.id);
  assert.deepEqual(result.coverage, { baseRevision: expectedManifest.base.revision,
    headRevision: expectedManifest.currentRevision, availableRevisions: [...captured.keys()] });
  assert.deepEqual(result.provenance.base, expectedManifest.base);
  assert.deepEqual(result.provenance.segments, expectedManifest.segments);
  assert.equal(result.provenance.manifestHash, await sha256Json(expectedManifest));
  assert.equal(result.provenance.headStateHash, expectedManifest.currentStateHash);
  assert.equal(buildV1RuntimePlayerProjection({ campaignState: result.state, runtimeAssets: assets }).ok, true);
  result.state.mission.v1.objectiveDecisions = {};
}
assert.equal(adapter.writes, writesBeforeReads);
assert.deepEqual(adapter.snapshot(), beforeReads, 'historical reads never repair index or mutate origin files');
assert.deepEqual(state, captured.get(state.stateCustody.revision));

for (const revision of [-1, 0.5, '1']) {
  await assert.rejects(() => hydrate(adapter, saveId, { expectedManifest, revision }),
    { code: 'DIRECTIVE_V1_HISTORY_REQUEST_INVALID' });
}
await assert.rejects(() => hydrate(adapter, saveId, { expectedManifest, revision: state.stateCustody.revision + 1 }),
  { code: 'DIRECTIVE_V1_HISTORY_REVISION_UNAVAILABLE' });
await assert.rejects(() => hydrate(adapter, saveId, { revision: 0 }),
  { code: 'DIRECTIVE_V1_SAVE_MANIFEST_REJECTED' });
await assert.rejects(() => hydrate(adapter, 'save.other', { expectedManifest, revision: 0 }),
  { code: 'DIRECTIVE_V1_SAVE_MANIFEST_REJECTED' });

// Produce enough real repository commits to roll the active segment. The old
// captured slot will be overwritten: its path is not an immutable archive.
const staleManifest = structuredClone(expectedManifest);
for (let i = 0; i < 66; i++) {
  await gateway.applyProposal({ baseRevision: gateway.revision(), domains: ['worldState'],
    operations: [{ op: 'set', path: 'worldState.visitedLocationIds', value: [...state.worldState.visitedLocationIds, `historical.fixture.${i}`] }],
    source: 'historical-read-rollover-fixture' });
}
const rolledManifest = await adapter.readJson(manifestPath);
assert.ok(rolledManifest.segments.length >= 2);
assert.equal(rolledManifest.segments[0].sealed, true);
const rolledFiles = adapter.snapshot();
const readStart = performance.now();
for (const revision of [0, beforeReopen.stateCustody.revision, afterReopen.stateCustody.revision, 64, state.stateCustody.revision]) {
  const result = await hydrate(adapter, saveId, { expectedManifest: rolledManifest, revision });
  assert.deepEqual(result.state, captured.get(revision), `rollover preserves revision ${revision}`);
  assert.deepEqual(result.coverage.availableRevisions, [...captured.keys()]);
}
const readElapsed = performance.now() - readStart;
assert.deepEqual(adapter.snapshot(), rolledFiles);
await assert.rejects(() => hydrate(adapter, saveId, { expectedManifest: staleManifest, revision: 0 }),
  { code: 'DIRECTIVE_V1_HISTORY_HEAD_CHANGED' });
const overwritten = memoryAdapter(rolledFiles);
overwritten.set(manifestPath, staleManifest);
await assert.rejects(() => hydrate(overwritten, saveId, { expectedManifest: staleManifest, revision: 0 }),
  { code: 'DIRECTIVE_V1_SAVE_SEGMENT_REJECTED' });

const racing = memoryAdapter(rolledFiles);
let changed = false;
await assert.rejects(() => hydrate({ async readJson(path) {
  const value = await racing.readJson(path);
  if (!changed && path.includes('.segment-')) {
    changed = true;
    racing.set(manifestPath, { ...rolledManifest, updatedAt: '2026-09-14T13:00:00.000Z' });
  }
  return value;
} }, saveId, { expectedManifest: rolledManifest, revision: 0 }), { code: 'DIRECTIVE_V1_HISTORY_HEAD_CHANGED' });
assert.equal(changed, true, 'head changes during segment verification are detected on reread');

const missingSegment = memoryAdapter(rolledFiles);
missingSegment.delete(rolledManifest.segments.at(-1).path);
await assert.rejects(() => hydrate(missingSegment, saveId, { expectedManifest: rolledManifest, revision: 0 }), { code: 'ENOENT' });
const badBase = memoryAdapter(rolledFiles);
const baseRecord = await badBase.readJson(rolledManifest.base.path);
baseRecord.state.worldState.visitedLocationIds.push('tampered.base');
badBase.set(rolledManifest.base.path, baseRecord);
await assert.rejects(() => hydrate(badBase, saveId, { expectedManifest: rolledManifest, revision: 0 }),
  { code: 'DIRECTIVE_V1_SAVE_BASE_INTEGRITY_FAILED' });

async function corruptSegment(mutate, { rehash = true } = {}) {
  const corrupted = memoryAdapter(rolledFiles);
  const manifest = structuredClone(rolledManifest);
  const ref = manifest.segments[0];
  const segment = await corrupted.readJson(ref.path);
  mutate(segment);
  corrupted.set(ref.path, segment);
  if (rehash) {
    ref.contentHash = await sha256Json(segment);
    ref.byteLength = new TextEncoder().encode(canonicalJson(segment)).byteLength;
    corrupted.set(manifestPath, manifest);
  }
  return { corrupted, manifest };
}
const corruptBytes = await corruptSegment(segment => { segment.deltas[0].source = 'corrupted'; }, { rehash: false });
await assert.rejects(() => hydrate(corruptBytes.corrupted, saveId, { expectedManifest: corruptBytes.manifest, revision: 0 }),
  { code: 'DIRECTIVE_V1_SAVE_SEGMENT_INTEGRITY_FAILED' });
const discontinuous = await corruptSegment(segment => { segment.deltas[1].beforeRevision = 0; });
await assert.rejects(() => hydrate(discontinuous.corrupted, saveId, { expectedManifest: discontinuous.manifest, revision: 0 }),
  { code: 'DIRECTIVE_V1_STATE_DELTA_REVISION_GAP' });
const hiddenIntermediateCorruption = await corruptSegment(segment => {
  segment.deltas[0].afterHash = '0'.repeat(64);
  segment.deltas[1].beforeHash = '0'.repeat(64);
});
await assert.rejects(() => hydrate(hiddenIntermediateCorruption.corrupted, saveId,
  { expectedManifest: hiddenIntermediateCorruption.manifest, revision: 0 }),
{ code: 'DIRECTIVE_V1_STATE_DELTA_AFTER_HASH_MISMATCH' }, 'even corruption after the requested base boundary must fail');

// The format/codec permits sparse custody boundaries even though the current
// repository writer advances by one. Coverage must not invent intermediate states.
const sparse = memoryAdapter(beforeReads);
const sparseManifest = structuredClone(expectedManifest);
const sparseBase = await sparse.readJson(sparseManifest.base.path);
const sparseState = structuredClone(sparseBase.state);
sparseState.stateCustody.revision = 2;
sparseState.stateCustody.recentCommitIds = ['fixture.sparse'];
const delta = await encodeV1StateDelta({ saveId, before: sparseBase.state, after: sparseState,
  changedRoots: ['stateCustody'], createdAt: now });
const sparsePath = storage.V1_STORAGE_PATHS.saveSegment(saveId, 1, 'a');
const segment = { kind: 'directive.campaignSaveSegment.v1', version: 1, saveId,
  sequence: 1, generation: 1, slot: 'a', deltas: [delta] };
sparse.set(sparsePath, segment);
sparseManifest.segments = [{ path: sparsePath, sequence: 1, generation: 1, slot: 'a', beforeRevision: 0,
  afterRevision: 2, deltaCount: 1, byteLength: new TextEncoder().encode(canonicalJson(segment)).byteLength,
  contentHash: await sha256Json(segment), sealed: false }];
sparseManifest.currentRevision = 2;
sparseManifest.currentStateHash = await sha256Json(sparseState);
sparse.set(manifestPath, sparseManifest);
const sparseResult = await hydrate(sparse, saveId, { expectedManifest: sparseManifest, revision: 2 });
assert.deepEqual(sparseResult.state, sparseState);
assert.deepEqual(sparseResult.coverage, { baseRevision: 0, headRevision: 2, availableRevisions: [0, 2] });
await assert.rejects(() => hydrate(sparse, saveId, { expectedManifest: sparseManifest, revision: 1 }),
  { code: 'DIRECTIVE_V1_HISTORY_REVISION_UNAVAILABLE' });

const checkpointId = 'checkpoint.historical';
const checkpointAdapter = memoryAdapter();
const checkpoint = storage.createV1CampaignSave({ id: checkpointId, slotType: 'checkpoint', parentSaveId: saveId,
  state: beforeReopen, createdAt: now });
await storage.storeV1CampaignSave(checkpointAdapter, checkpoint, { makeActive: false });
const checkpointManifest = await checkpointAdapter.readJson(storage.V1_STORAGE_PATHS.save(checkpointId));
assert.equal(checkpointManifest.segments.length, 0);
assert.ok(checkpointManifest.base.revision > 0);
const checkpointFiles = checkpointAdapter.snapshot();
const checkpointState = await hydrate({ readJson: checkpointAdapter.readJson }, checkpointId,
  { expectedManifest: checkpointManifest, revision: beforeReopen.stateCustody.revision });
assert.deepEqual(checkpointState.state, beforeReopen, 'checkpoint reads preserve exact parent origin custody without rebinding');
assert.deepEqual(checkpointState.coverage, { baseRevision: beforeReopen.stateCustody.revision,
  headRevision: beforeReopen.stateCustody.revision, availableRevisions: [beforeReopen.stateCustody.revision] });
assert.equal(checkpointState.origin.saveId, checkpointId);
assert.equal(checkpointState.origin.parentSaveId, saveId);
assert.equal(checkpointState.origin.branchId, saveId);
assert.equal(checkpointState.origin.slotType, 'checkpoint');
await assert.rejects(() => hydrate(checkpointAdapter, checkpointId,
  { expectedManifest: checkpointManifest, revision: beforeReopen.stateCustody.revision - 1 }),
{ code: 'DIRECTIVE_V1_HISTORY_REVISION_UNAVAILABLE' }, 'checkpoint base proves no earlier historical boundary');
assert.deepEqual(checkpointAdapter.snapshot(), checkpointFiles);

console.log('Verified historical-state hydration restores exact runtime correction states.');
console.log(`Verified ${captured.size} actual boundaries across ${rolledManifest.segments.length} segments; five historical reads took ${Math.round(readElapsed)}ms.`);
