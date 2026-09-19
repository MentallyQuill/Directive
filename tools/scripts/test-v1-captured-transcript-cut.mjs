import assert from 'node:assert/strict';
import { V1_BRANCH_HISTORY_LIMITS, historyObjectPath } from '../../src/storage/v1-branch-history-contracts.mjs';
import * as storage from '../../src/storage/v1-storage-repository.mjs';
import { sha256Json, canonicalJson } from '../../src/storage/v1-state-delta-codec.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime } from '../../src/runtime/v1-mission-runtime.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createScenePacingContext } from '../../src/narration/scene-pacing.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const saveId = 'save.transcript-cut';
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
    async deleteJson(path) { files.delete(path); },
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
const gateway = createStateDeltaGateway({ getState: () => state, setState: next => {
  state = next;
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


const states = [...captured.values()];
assert.equal(states.length, 8, 'public correction fixture boundary count');
const counts = [3, 5, 5, 7, 9, 9, 11, 13];
const hashes = await Promise.all(Array.from({ length: 15 }, (_, row) => sha256Json({ controlledRow: row })));
const fingerprint = await sha256Json(assets.missionDefinitions);
const saveFor = value => storage.createV1CampaignSave({ id: saveId, state: value, createdAt: now, updatedAt: now });
const uncapturedFiles = adapter.snapshot();
let manifest = await adapter.readJson(manifestPath);
for (let index = 0; index < states.length; index++) {
  const after = states[index], before = states[Math.max(0, index - 1)];
  const rows = hashes.slice(0, counts[index]);
  const result = await storage.storeV1CampaignSaveWithCapture(adapter, saveFor(after), { expectedManifest: manifest,
    previousSave: saveFor(before), capture: {
      kind: 'directive.authorityBoundaryCapture.v1', version: 1, mode: index ? 'commit' : 'baseline',
      operationId: `cut.operation.${index}`, writerKind: 'test.public-objective-runtime',
      origin: { campaignId: after.campaign.id, saveId, chatId: after.campaignChatBinding.chatId, entityType: 'character', entityId: 'cut.fixture' },
      packageFingerprint: fingerprint,
      before: { revision: before.stateCustody.revision, stateHash: await sha256Json(before) },
      after: { revision: after.stateCustody.revision, stateHash: await sha256Json(after) },
      transcript: { projectionVersion: 1, rowCount: rows.length, rowHashes: rows, vectorHash: await sha256Json(rows) },
    } });
  assert.equal(result.publication, 'committed', JSON.stringify(result));
  if (result.intent) assert.equal((await storage.acknowledgeV1CampaignSavePublication(adapter,
    { saveId, requestHash: result.intent.requestHash })).acknowledged, true);
  manifest = result.manifest;
}
const transcript = { projectionVersion: 1, rowCount: hashes.length, rowHashes: hashes, vectorHash: await sha256Json(hashes) };
const loadCut = storage.loadV1CampaignStateAtTranscriptCut;
assert.equal(typeof loadCut, 'function', 'repository restores the complete latest captured state at an exact transcript cut');
const beforeFiles = adapter.snapshot(), writeCount = adapter.writes;
const readOnly = { readJson: path => adapter.readJson(path) };
for (const [cut, index] of [[3,0], [4,0], [5,2], [6,2], [7,3], [8,3], [9,5], [10,5], [11,6], [12,6], [13,7], [15,7]]) {
  const result = await loadCut(readOnly, saveId, { expectedManifest: manifest, transcript, retainedRowCount: cut });
  assert.deepEqual(result.state, states[index], `cut ${cut} restores independently retained full state`);
  assert.equal(result.revision, states[index].stateCustody.revision);
  assert.equal(result.stateHash, await sha256Json(states[index]));
  assert.equal(result.capture.selected.index, index);
  assert.equal(result.capture.selected.operationId, `cut.operation.${index}`);
  assert.equal(result.capture.selected.vectorHash, await sha256Json(hashes.slice(0, counts[index])));
  assert.equal(result.capture.parent.vectorHash, transcript.vectorHash);
  assert.equal(result.capture.cut.vectorHash, await sha256Json(hashes.slice(0, cut)));
  assert.equal(result.capture.floor.revision, states[0].stateCustody.revision);
  assert.equal(result.origin.saveId, saveId);
}
await assert.rejects(loadCut(readOnly, saveId, { expectedManifest: manifest, transcript, retainedRowCount: 2 }),
  { code: 'DIRECTIVE_V1_HISTORY_CUT_UNAVAILABLE' });
assert.deepEqual(adapter.snapshot(), beforeFiles);
assert.equal(adapter.writes, writeCount);
console.log('PASS captured transcript cuts: public resolve/materialize/reopen/resume states, same-vector latest and floor');

const options = () => ({ expectedManifest: structuredClone(manifest), transcript: structuredClone(transcript), retainedRowCount: 5 });
await assert.rejects(loadCut(memoryAdapter(uncapturedFiles), saveId, { ...options(), expectedManifest: uncapturedFiles[manifestPath] }),
  { code: 'DIRECTIVE_V1_HISTORY_CAPTURE_UNAVAILABLE' });
for (const index of [0, 4, 12]) {
  const input = options();
  input.transcript.rowHashes[index] = await sha256Json({ edited: index });
  input.transcript.vectorHash = await sha256Json(input.transcript.rowHashes);
  await assert.rejects(loadCut(readOnly, saveId, input), { code: 'DIRECTIVE_V1_CAPTURE_TRANSCRIPT_NONPREFIX' },
    `published parent row ${index} must match even outside the retained cut`);
}
for (const mutate of [
  input => { input.retainedRowCount = -1; },
  input => { input.retainedRowCount = 1.5; },
  input => { input.retainedRowCount = Number.MAX_SAFE_INTEGER + 1; },
  input => { input.retainedRowCount = 16; },
  input => { input.transcript.projectionVersion = 2; },
  input => { input.transcript.rowCount++; },
  input => { input.transcript.rowHashes[1] = 'not-a-hash'; },
  input => { input.transcript.vectorHash = 'f'.repeat(64); },
  input => { input.transcript.extra = true; },
  input => { delete input.transcript.rowHashes[1]; },
]) {
  const input = options(); mutate(input);
  await assert.rejects(loadCut(readOnly, saveId, input), { code: 'DIRECTIVE_V1_HISTORY_REQUEST_INVALID' });
}
{
  let invoked = 0;
  const input = options();
  Object.defineProperty(input, 'transcript', { enumerable: true, get() { invoked++; return transcript; } });
  await assert.rejects(loadCut(readOnly, saveId, input), { code: 'DIRECTIVE_V1_HISTORY_REQUEST_INVALID' });
  assert.equal(invoked, 0, 'request accessors are never invoked');
}
{
  const input = options();
  input.transcript.rowHashes = Array(V1_BRANCH_HISTORY_LIMITS.rows + 1).fill(hashes[0]);
  input.transcript.rowCount = input.transcript.rowHashes.length;
  await assert.rejects(loadCut(readOnly, saveId, input), { code: 'DIRECTIVE_V1_CAPTURE_LIMIT_EXCEEDED' });
}

// A changed old anchor can preserve the latest request identity and all ordinary
// structural checks. The cut reader must recompute EVERY historical request.
async function changedCatalog(mutate) {
  const bad = memoryAdapter(beforeFiles), head = structuredClone(manifest);
  const page = await bad.readJson(head.branchHistory.page.path);
  await mutate(page);
  const contentHash = await sha256Json(page);
  head.branchHistory.page = { path: historyObjectPath(saveId, 'page', contentHash), contentHash };
  bad.set(head.branchHistory.page.path, page); bad.set(manifestPath, head);
  return { bad, head };
}
{
  const { bad, head } = await changedCatalog(page => { page.records[1].capture.transcript = structuredClone(page.records[0].capture.transcript); });
  await storage.loadVerifiedV1ActiveCampaignAuthority(bad, { saveId, expectedManifest: head });
  await assert.rejects(loadCut(bad, saveId, { ...options(), expectedManifest: head, retainedRowCount: 3 }),
    /Historical capture does not match its exact request identity/);
}
for (const mutate of [
  page => { page.records[1].capture.writerKind = 'forged-writer'; },
  page => { page.records[1].saveMetadata.name = 'Forged historical name'; },
  page => { page.records[1].expectedManifestHash = 'f'.repeat(64); },
  page => { page.records[1].capture.packageFingerprint = 'f'.repeat(64); },
  page => { page.records[1].capture.origin.chatId = 'wrong-chat'; },
  page => { page.records[1].requestHash = 'f'.repeat(64); },
]) {
  const { bad, head } = await changedCatalog(mutate);
  await assert.rejects(loadCut(bad, saveId, { ...options(), expectedManifest: head }));
  assert.equal(bad.writes, 0);
}
for (const path of [manifest.base.path, manifest.segments.at(-1).path, manifest.branchHistory.page.path,
  ...Object.keys(beforeFiles).filter(path => path.includes('.history-vector-')).filter((_, i, paths) => i === 0 || i === paths.length - 1)]) {
  const absent = memoryAdapter(beforeFiles); absent.delete(path);
  await assert.rejects(loadCut(absent, saveId, options()), undefined, `missing ${path}`);
  const corrupt = memoryAdapter(beforeFiles), value = await corrupt.readJson(path);
  if (path === manifest.base.path) value.state.campaign.title += ' corrupt';
  else if (value.deltas) value.deltas.at(-1).afterHash = 'f'.repeat(64);
  else if (value.rows) value.rows[0] = 'f'.repeat(64);
  else value.records[0].capture.writerKind = 'corrupt';
  corrupt.set(path, value);
  await assert.rejects(loadCut(corrupt, saveId, options()), undefined, `corrupt ${path}`);
  assert.equal(corrupt.writes, 0);
}

{
  const input = options(), detachedExpected = structuredClone(input);
  let release, entered;
  const paused = new Promise(resolve => { entered = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  let first = true;
  const reading = loadCut({ async readJson(path) { if (first) { first = false; entered(); await barrier; } return adapter.readJson(path); } }, saveId, input);
  await paused;
  input.transcript.rowHashes[0] = 'f'.repeat(64);
  input.transcript.rowCount = 0;
  input.expectedManifest.currentStateHash = 'f'.repeat(64);
  input.retainedRowCount = 0;
  release();
  const result = await reading;
  assert.deepEqual(result.state, states[2]);
  assert.equal(result.capture.parent.vectorHash, detachedExpected.transcript.vectorHash);
  result.state.campaign.title = 'Caller mutation';
  result.provenance.base.path = 'Caller mutation';
  assert.deepEqual(adapter.snapshot(), beforeFiles);
}
for (const atRead of [1, 2, 3, 4]) {
  let reads = 0;
  const stale = { async readJson(path) {
    const value = await adapter.readJson(path);
    if (path === manifestPath && ++reads === atRead) value.currentStateHash = 'f'.repeat(64);
    return value;
  } };
  await assert.rejects(loadCut(stale, saveId, options()), { code: 'DIRECTIVE_V1_HISTORY_HEAD_CHANGED' });
}
assert.deepEqual(adapter.snapshot(), beforeFiles);
assert.equal(adapter.writes, writeCount, 'all cut-reader success and refusal paths remain read-only');
console.log('PASS complete parent prefix, all historical request identities, corruption, head races and detached bounded inputs');

{
  const fresh = memoryAdapter();
  const floorState = states[3], floorSave = saveFor(floorState);
  await storage.storeV1CampaignSave(fresh, floorSave);
  const initialManifest = await fresh.readJson(manifestPath);
  const page = await adapter.readJson(manifest.branchHistory.page.path);
  const capture = structuredClone(page.records[3].capture);
  capture.mode = 'baseline';
  capture.operationId = 'cut.nonzero-floor';
  capture.before = structuredClone(capture.after);
  delete capture.transcript.head;
  capture.transcript.rowHashes = hashes.slice(0, capture.transcript.rowCount);
  const stored = await storage.storeV1CampaignSaveWithCapture(fresh, floorSave,
    { expectedManifest: initialManifest, previousSave: floorSave, capture });
  assert.equal(stored.publication, 'committed', JSON.stringify(stored));
  const seed = fresh.snapshot(), writes = fresh.writes;
  const request = { expectedManifest: stored.manifest, transcript, retainedRowCount: 7 };
  const restored = await loadCut(fresh, saveId, request);
  assert.deepEqual(restored.state, floorState);
  assert.equal(restored.coverage.baseRevision, floorState.stateCustody.revision);
  assert.deepEqual(restored.coverage.availableRevisions, [floorState.stateCustody.revision]);
  assert.equal(restored.capture.floor.rowCount, 7);
  await assert.rejects(loadCut(fresh, saveId, { ...request, retainedRowCount: 6 }),
    { code: 'DIRECTIVE_V1_HISTORY_CUT_UNAVAILABLE' });
  assert.deepEqual(fresh.snapshot(), seed);
  assert.equal(fresh.writes, writes);
}
{
  const rows = [...hashes, ...Array(V1_BRANCH_HISTORY_LIMITS.rows - hashes.length).fill(hashes[0])];
  const input = { ...options(), retainedRowCount: rows.length,
    transcript: { projectionVersion: 1, rowCount: rows.length, rowHashes: rows, vectorHash: await sha256Json(rows) } };
  assert.deepEqual((await loadCut(readOnly, saveId, input)).state, states.at(-1), 'exact row limit accepts the complete parent suffix');
}
{
  const renamed = memoryAdapter(beforeFiles);
  const save = saveFor(states.at(-1));
  save.name = 'Metadata-only renamed campaign';
  await storage.storeV1CampaignSave(renamed, save);
  const head = await renamed.readJson(manifestPath), seed = renamed.snapshot(), writes = renamed.writes;
  assert.equal(head.saveMetadata.name, save.name);
  assert.deepEqual((await loadCut(renamed, saveId, { ...options(), expectedManifest: head })).state, states[2],
    'historical request identity uses the original candidate metadata across a legitimate rename');
  assert.deepEqual(renamed.snapshot(), seed);
  assert.equal(renamed.writes, writes);
}
{
  const corrupt = memoryAdapter(beforeFiles), head = structuredClone(manifest);
  const reference = head.segments.at(-1), segment = await corrupt.readJson(reference.path);
  const operation = segment.deltas.at(-1).operations.find(operation => operation.op === 'set');
  assert.ok(operation, 'later real runtime delta has a set operation to corrupt');
  operation.value = null;
  reference.contentHash = await sha256Json(segment);
  reference.byteLength = new TextEncoder().encode(canonicalJson(segment)).byteLength;
  corrupt.set(reference.path, segment); corrupt.set(manifestPath, head);
  await assert.rejects(loadCut(corrupt, saveId, { ...options(), expectedManifest: head, retainedRowCount: 3 }),
    error => error.code?.startsWith('DIRECTIVE_V1_STATE_DELTA_'),
    'a rehashed later segment must fail actual state replay even when selecting the intact baseline');
  assert.equal(corrupt.writes, 0);
}
console.log('PASS nonzero checkpoint floor, exact 20000-row boundary, rename and rehashed suffix corruption');
