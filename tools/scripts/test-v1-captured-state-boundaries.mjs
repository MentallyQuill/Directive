import assert from 'node:assert/strict';
import { withCampaignTimelineLease } from '../../src/runtime/timeline-transaction-service.mjs';
import { V1_BRANCH_HISTORY_LIMITS, historyObjectPath, assertHistoryObject } from '../../src/storage/v1-branch-history-contracts.mjs';
import * as storage from '../../src/storage/v1-storage-repository.mjs';
import { sha256Json, encodeV1StateDelta, canonicalJson } from '../../src/storage/v1-state-delta-codec.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createV1MissionRuntime, buildV1RuntimePlayerProjection } from '../../src/runtime/v1-mission-runtime.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createScenePacingContext } from '../../src/narration/scene-pacing.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const saveId = 'save.captured';
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


const writeCaptured = storage.storeV1CampaignSaveWithCapture;
async function acknowledgeCaptured(adapter, result) {
  if (!result.intent) return;
  const acknowledged = await storage.acknowledgeV1CampaignSavePublication(adapter, {
    saveId: result.intent.saveId, requestHash: result.intent.requestHash });
  assert.equal(acknowledged.acknowledged, true, JSON.stringify(acknowledged));
}
assert.equal(typeof writeCaptured, 'function', 'repository publishes exact state and captured transcript anchor together');
const fingerprint = await sha256Json(assets.missionDefinitions);
const rowHashes = await Promise.all(Array.from({ length: 10001 }, (_, i) => sha256Json({ row: i })));
function saveFor(value) { return storage.createV1CampaignSave({ id: saveId, state: value, createdAt: now, updatedAt: now }); }
async function request(before, after, rows, operationId, mode = 'commit') {
  return { kind: 'directive.authorityBoundaryCapture.v1', version: 1, mode, operationId,
    writerKind: 'test.public-objective-runtime',
    origin: { campaignId: after.campaign.id, saveId, chatId: after.campaignChatBinding.chatId,
      entityType: 'character', entityId: 'character.captured' },
    packageFingerprint: fingerprint,
    before: { revision: before.stateCustody.revision, stateHash: await sha256Json(before) },
    after: { revision: after.stateCustody.revision, stateHash: await sha256Json(after) },
    transcript: { projectionVersion: 1, rowCount: rows.length, rowHashes: rows, vectorHash: await sha256Json(rows) } };
}
let expectedManifest = await adapter.readJson(manifestPath);
const allStates = [...captured.values()];
const initial = allStates[0];
const baselineCapture = await request(initial, initial, rowHashes.slice(0, 3), 'operation.baseline', 'baseline');
const baselineInput = { expectedManifest, previousSave: saveFor(initial), capture: baselineCapture };
const baselineBefore = structuredClone(baselineInput);
const baseline = await writeCaptured(adapter, saveFor(initial), baselineInput);
assert.equal(baseline.publication, 'committed', JSON.stringify(baseline));
assert.deepEqual(baselineInput, baselineBefore, 'capture inputs remain detached');
assert.ok(baseline.manifest.branchHistory);
assert.equal(baseline.manifest.branchHistory.floorRevision, initial.stateCustody.revision);
assert.equal(baseline.manifest.branchHistory.headRevision, initial.stateCustody.revision);
assert.equal((await adapter.readJson(storage.V1_STORAGE_PATHS.index)).activeSaveId, saveId);
const retryWrites = adapter.writes;
assert.equal((await writeCaptured(adapter, saveFor(initial), baselineInput)).publication, 'committed');
assert.equal(adapter.writes, retryWrites, 'exact same operation retry writes neither delta nor acknowledgement');
await acknowledgeCaptured(adapter, baseline);

const baselineFiles = adapter.snapshot();
// Independent review reproductions: rehashed metadata must not impersonate an
// exact request, and defined saved native entity fields constrain provenance.
{
  const drift = memoryAdapter(baselineFiles);
  const page = await drift.readJson(baseline.manifest.branchHistory.page.path);
  page.records[0].capture.writerKind = 'writer.TAMPERED';
  const contentHash = await sha256Json(page);
  const changedHead = structuredClone(baseline.manifest);
  changedHead.branchHistory.page = { contentHash, path: historyObjectPath(saveId, 'page', contentHash) };
  drift.set(changedHead.branchHistory.page.path, page); drift.set(manifestPath, changedHead);
  const retry = await writeCaptured(drift, saveFor(initial), baselineInput);
  let renameRejected = false;
  try { await storage.storeV1CampaignSave(drift, { ...saveFor(initial), name: 'Rejected drift rename' }, { previousSave: saveFor(initial) }); }
  catch { renameRejected = true; }
  const entityResults = [];
  for (const field of ['entityId', 'entityType']) {
    const bound = structuredClone(initial);
    bound.campaignChatBinding.entityType = 'character'; bound.campaignChatBinding.entityId = 'entity.correct';
    const mem = memoryAdapter(), save = saveFor(bound);
    await storage.storeV1CampaignSave(mem, save);
    const expectedManifest = await mem.readJson(manifestPath);
    const capture = await request(bound, bound, rowHashes.slice(0, 3), `operation.entity-${field}`, 'baseline');
    capture.origin.entityId = 'entity.correct';
    capture.origin[field] = field === 'entityId' ? 'entity.WRONG' : 'group';
    const beforeWrites = mem.writes;
    const result = await writeCaptured(mem, save, { expectedManifest, previousSave: save, capture });
    entityResults.push({ publication: result.publication, writes: mem.writes - beforeWrites });
  }
  assert.deepEqual({ retry: retry.publication, renameRejected, entityResults }, {
    retry: 'uncertain', renameRejected: true,
    entityResults: [{ publication: 'not-committed', writes: 0 }, { publication: 'not-committed', writes: 0 }],
  }, 'full persisted request identity and defined entity provenance must be verified');
}
// Rehashed entity drift remains invalid even with a self-consistent request hash.
for (const field of ['entityId', 'entityType']) {
  const bound = structuredClone(initial);
  bound.campaignChatBinding.entityType = 'character'; bound.campaignChatBinding.entityId = 'entity.correct';
  const mem = memoryAdapter(), save = saveFor(bound);
  await storage.storeV1CampaignSave(mem, save);
  const expectedManifest = await mem.readJson(manifestPath);
  const capture = await request(bound, bound, rowHashes.slice(0, 3), `operation.entity-read-${field}`, 'baseline');
  capture.origin.entityId = 'entity.correct';
  const result = await writeCaptured(mem, save, { expectedManifest, previousSave: save, capture });
  assert.equal(result.publication, 'committed');
  const corrupted = memoryAdapter(mem.snapshot());
  const page = await corrupted.readJson(result.manifest.branchHistory.page.path), record = page.records[0];
  record.capture.origin[field] = field === 'entityId' ? 'entity.WRONG' : 'group';
  const { head, ...transcript } = record.capture.transcript;
  record.requestHash = await sha256Json({ expectedManifestHash: record.expectedManifestHash, save,
    capture: { ...record.capture, transcript: { ...transcript, rowHashes: capture.transcript.rowHashes } } });
  const contentHash = await sha256Json(page), manifest = structuredClone(result.manifest);
  manifest.branchHistory.page = { contentHash, path: historyObjectPath(saveId, 'page', contentHash) };
  corrupted.set(manifest.branchHistory.page.path, page); corrupted.set(manifestPath, manifest);
  assert.equal((await writeCaptured(corrupted, save, { expectedManifest, previousSave: save, capture })).publication, 'uncertain');
  await assert.rejects(() => storage.storeV1CampaignSave(corrupted, { ...save, name: 'Rejected entity rename' }, { previousSave: save }));
  assert.equal(corrupted.writes, 0);
}
const next = allStates[1];
const commitCapture = await request(initial, next, rowHashes.slice(0, 5), 'operation.first');
const commitInput = { expectedManifest: baseline.manifest, previousSave: saveFor(initial), capture: commitCapture };
const committed = await writeCaptured(adapter, saveFor(next), commitInput);
assert.equal(committed.publication, 'committed', JSON.stringify(committed));
assert.equal(committed.manifest.branchHistory.recordCount, 2);
const commitWrites = adapter.writes;
assert.equal((await writeCaptured(adapter, saveFor(next), commitInput)).publication, 'committed');
assert.equal(adapter.writes, commitWrites);
const changedRetry = structuredClone(commitInput);
changedRetry.capture.writerKind = 'different-payload';
assert.notEqual((await writeCaptured(adapter, saveFor(next), changedRetry)).publication, 'committed');
assert.equal(adapter.writes, commitWrites);

let previous = next;
await acknowledgeCaptured(adapter, committed);
expectedManifest = committed.manifest;
for (let i = 2; i < allStates.length; i++) {
  const value = allStates[i];
  const capture = await request(previous, value, rowHashes.slice(0, i < 4 ? 5 : 7), `operation.public-${i}`);
  const result = await writeCaptured(adapter, saveFor(value), { expectedManifest, previousSave: saveFor(previous), capture });
  assert.equal(result.publication, 'committed', JSON.stringify(result));
  if (value.stateCustody.revision === afterReopen.stateCustody.revision) {
    const restarted = memoryAdapter(adapter.snapshot());
    const resolved = await storage.resolveV1CampaignSavePublication(restarted, { saveId, requestHash: result.intent.requestHash });
    assert.equal(resolved.publication, 'committed');
    assert.deepEqual(resolved.save.state, afterReopen, 'fresh captured-intent recovery preserves the complete public correction state');
    await acknowledgeCaptured(restarted, resolved);
    assert.equal(restarted.writes, 0, 'correction recovery never republishes its revision');
  }
  await acknowledgeCaptured(adapter, result);
  expectedManifest = result.manifest;
  previous = value;
}
for (const [revision, expected] of captured) {
  const hydrated = await storage.loadV1CampaignStateAtRevision(adapter, saveId, { expectedManifest, revision });
  assert.deepEqual(hydrated.state, expected, `public reducer full-state boundary ${revision}`);
}
const protectedWrites = adapter.writes;
await assert.rejects(() => storage.storeV1CampaignSave(adapter, saveFor({ ...state,
  stateCustody: { ...state.stateCustody, revision: state.stateCustody.revision + 1 } }), { previousSave: saveFor(state) }),
  { code: 'DIRECTIVE_V1_CAPTURE_REQUIRED' });
assert.equal(adapter.writes, protectedWrites, 'ordinary changed-state write rejects before segment writes');

// Reuse a verified earlier head for deterministic publication faults.
function faultAdapter(seed, { write = null, read = null } = {}) {
  const inner = memoryAdapter(seed);
  return { ...inner, get writes() { return inner.writes; },
    async readJson(path) { if (read) await read(path, inner); return inner.readJson(path); },
    async writeJson(path, value) { if (write) await write(path, value, inner); else await inner.writeJson(path, value); } };
}
for (const [stage, outcome, afterWrite] of [
  ['history-vector', 'not-committed', false], ['history-page', 'not-committed', false],
  ['segment-', 'not-committed', false], ['.v1.json', 'not-committed', false],
  ['.v1.json', 'committed', true], ['index.v1.json', 'committed', false],
]) {
  let fired = false;
  const faulty = faultAdapter(baselineFiles, { async write(path, value, inner) {
    const match = stage === '.v1.json' ? path === manifestPath : path.includes(stage);
    if (!fired && match) {
      fired = true;
      if (afterWrite) await inner.writeJson(path, value);
      throw new Error('injected write failure');
    }
    await inner.writeJson(path, value);
  } });
  const result = await writeCaptured(faulty, saveFor(next), commitInput);
  assert.equal(fired, true, stage);
  assert.equal(result.publication, outcome, `${stage} ${JSON.stringify(result)}`);
  if (outcome === 'not-committed') assert.deepEqual(await faulty.readJson(manifestPath), baseline.manifest);
}
const broken = faultAdapter(baselineFiles, { async write(path, value, inner) {
  if (path === manifestPath) { inner.set(path, { torn: true }); throw new Error('torn manifest'); }
  await inner.writeJson(path, value);
} });
assert.equal((await writeCaptured(broken, saveFor(next), commitInput)).publication, 'uncertain');
const missingIndex = memoryAdapter(baselineFiles);
missingIndex.delete(storage.V1_STORAGE_PATHS.index);
assert.notEqual((await writeCaptured(missingIndex, saveFor(next), commitInput)).publication, 'committed');
assert.equal(missingIndex.writes, 0, 'preflight never creates missing index');
for (const mutate of [
  capture => { capture.transcript.rowCount++; },
  capture => { capture.transcript.vectorHash = 'f'.repeat(64); },
  capture => { capture.origin.saveId = 'save.foreign'; },
  capture => { capture.after.revision = Number.MAX_SAFE_INTEGER + 1; },
  capture => { capture.mode = 'gap'; },
]) {
  const bad = memoryAdapter(baselineFiles), input = structuredClone(commitInput);
  mutate(input.capture);
  assert.equal((await writeCaptured(bad, saveFor(next), input)).publication, 'not-committed');
  assert.equal(bad.writes, 0);
}
const nonPrefix = memoryAdapter(baselineFiles);
const changedRows = await request(initial, next, [rowHashes[9], ...rowHashes.slice(1, 5)], 'operation.nonprefix');
const refused = await writeCaptured(nonPrefix, saveFor(next), { ...commitInput, capture: changedRows });
assert.equal(refused.publication, 'not-committed');
assert.equal(refused.error.code, 'DIRECTIVE_V1_CAPTURE_TRANSCRIPT_NONPREFIX');
assert.equal(nonPrefix.writes, 0);

// Save payload identity must be fully represented by persisted metadata+state.
{
  const extra = memoryAdapter(baselineFiles);
  const result = await writeCaptured(extra, { ...saveFor(next), unpersistedField: 'must not disappear' }, commitInput);
  assert.equal(result.publication, 'not-committed');
  assert.equal(extra.writes, 0);
}
// Content-addressed paths are immutable even when an unreferenced object exists.
{
  const collision = memoryAdapter(baselineFiles);
  const basePage = await collision.readJson(baseline.manifest.branchHistory.page.path);
  const vector = { kind: 'directive.branchHistoryVector.v1', version: 1, ownerSaveId: saveId,
    previous: basePage.records[0].capture.transcript.head, rowCount: 5, rows: rowHashes.slice(3, 5) };
  const path = historyObjectPath(saveId, 'vector', await sha256Json(vector));
  const conflicting = { corrupt: 'preserve this evidence' }; collision.set(path, conflicting);
  const result = await writeCaptured(collision, saveFor(next), commitInput);
  assert.equal(result.publication, 'not-committed');
  assert.equal(result.error.code, 'DIRECTIVE_V1_CAPTURE_IMMUTABLE_CONFLICT');
  assert.deepEqual(await collision.readJson(path), conflicting);
  assert.equal(collision.writes, 0);
}
// A checkpoint owns its objects while preserving the origin active custody.
{
  const checkpointAdapter = memoryAdapter();
  const checkpoint = storage.createV1CampaignSave({ id: 'save.captured-checkpoint', state: allStates[3],
    slotType: 'checkpoint', parentSaveId: saveId, createdAt: now });
  await storage.storeV1CampaignSave(checkpointAdapter, checkpoint, { makeActive: false });
  const manifest = await checkpointAdapter.readJson(storage.V1_STORAGE_PATHS.save(checkpoint.id));
  const capture = await request(checkpoint.state, checkpoint.state, rowHashes, 'operation.checkpoint-baseline', 'baseline');
  const result = await writeCaptured(checkpointAdapter, checkpoint, { expectedManifest: manifest, previousSave: checkpoint, capture });
  assert.equal(result.publication, 'committed', JSON.stringify(result));
  assert.equal(result.manifest.branchHistory.ownerSaveId, checkpoint.id);
  assert.equal(result.manifest.branchHistory.floorRevision, checkpoint.state.stateCustody.revision);
  assert.equal((await checkpointAdapter.readJson(storage.V1_STORAGE_PATHS.index)).activeSaveId, null);
  const objects = Object.entries(checkpointAdapter.snapshot()).filter(([path]) => path.includes('.history-'));
  assert.ok(objects.length >= 40, '10,001-row vector uses bounded immutable chunks');
  assert.ok(objects.every(([path, object]) => path.startsWith(`v1/saves/${checkpoint.id}.history-`) && object.ownerSaveId === checkpoint.id));
  const input = { expectedManifest: manifest, previousSave: checkpoint, capture };
  const writes = checkpointAdapter.writes;
  assert.equal((await writeCaptured(checkpointAdapter, checkpoint, input)).publication, 'committed');
  assert.equal(checkpointAdapter.writes, writes);
}
// Bounds and prefix redundancy are checked before publication, without truncation.
{
  const tooLarge = memoryAdapter(baselineFiles);
  const rows = Array(V1_BRANCH_HISTORY_LIMITS.rows + 1).fill(rowHashes[0]);
  const capture = await request(initial, next, rows, 'operation.overflow');
  const result = await writeCaptured(tooLarge, saveFor(next), { ...commitInput, capture });
  assert.equal(result.publication, 'not-committed');
  assert.equal(result.error.code, 'DIRECTIVE_V1_CAPTURE_LIMIT_EXCEEDED');
  assert.equal(tooLarge.writes, 0);
}
// Same-state metadata cannot preserve an unverified history reference.
{
  const metadata = memoryAdapter(baselineFiles);
  const renamed = { ...saveFor(initial), name: 'Captured metadata only' };
  await storage.storeV1CampaignSave(metadata, renamed, { previousSave: saveFor(initial) });
  assert.deepEqual((await metadata.readJson(manifestPath)).branchHistory, baseline.manifest.branchHistory);
  const renamedAgain = { ...renamed, name: 'Captured metadata renamed again' };
  await storage.storeV1CampaignSave(metadata, renamedAgain, { previousSave: renamed });
  const retryCount = metadata.writes;
  assert.equal((await writeCaptured(metadata, saveFor(initial), baselineInput)).publication, 'uncertain',
    'old candidate retry cannot silently undo a later metadata rename');
  assert.equal(metadata.writes, retryCount);
  const afterRenameInput = { ...commitInput, expectedManifest: await metadata.readJson(manifestPath), previousSave: renamedAgain };
  const afterRenameSave = { ...saveFor(next), name: renamedAgain.name };
  assert.equal((await writeCaptured(metadata, afterRenameSave, afterRenameInput)).publication, 'committed',
    'stored original metadata keeps request verification valid across rename');
  const afterRenameWrites = metadata.writes;
  assert.equal((await writeCaptured(metadata, afterRenameSave, afterRenameInput)).publication, 'committed');
  assert.equal(metadata.writes, afterRenameWrites);
  const corrupted = memoryAdapter(baselineFiles);
  const pagePath = baseline.manifest.branchHistory.page.path;
  const page = await corrupted.readJson(pagePath);
  page.records[0].capture.writerKind = 'tampered';
  corrupted.set(pagePath, page);
  await assert.rejects(() => storage.storeV1CampaignSave(corrupted, renamed, { previousSave: saveFor(initial) }));
  assert.equal(corrupted.writes, 0);
}
// Hash-valid but semantically invalid graphs still refuse metadata preservation.
for (const variant of ['foreign-object-owner', 'foreign-origin', 'bad-vector-count', 'bad-vector-hash', 'missing-vector']) {
  const corrupted = memoryAdapter(baselineFiles);
  const manifest = structuredClone(baseline.manifest);
  const page = await corrupted.readJson(manifest.branchHistory.page.path);
  const capture = page.records[0].capture;
  const vector = await corrupted.readJson(capture.transcript.head.path);
  if (variant === 'missing-vector') corrupted.delete(capture.transcript.head.path);
  else if (variant === 'foreign-origin') capture.origin.saveId = 'save.foreign';
  else {
    if (variant === 'foreign-object-owner') vector.ownerSaveId = 'save.foreign';
    if (variant === 'bad-vector-count') vector.rowCount++;
    if (variant === 'bad-vector-hash') vector.rows[0] = rowHashes[99];
    const contentHash = await sha256Json(vector);
    capture.transcript.head = { contentHash, path: historyObjectPath(saveId, 'vector', contentHash) };
    corrupted.set(capture.transcript.head.path, vector);
  }
  const contentHash = await sha256Json(page);
  manifest.branchHistory.page = { contentHash, path: historyObjectPath(saveId, 'page', contentHash) };
  corrupted.set(manifest.branchHistory.page.path, page); corrupted.set(manifestPath, manifest);
  await assert.rejects(() => storage.storeV1CampaignSave(corrupted, { ...saveFor(initial), name: 'Invalid graph rename' },
    { previousSave: saveFor(initial) }), undefined, variant);
  assert.equal(corrupted.writes, 0, variant);
}
{
  const page = await adapter.readJson(expectedManifest.branchHistory.page.path);
  assert.throws(() => assertHistoryObject({ ...page, records: Array(65).fill(page.records[0]) }, saveId, 'page'),
    { code: 'DIRECTIVE_V1_CAPTURE_LIMIT_EXCEEDED' });
  assert.throws(() => assertHistoryObject({ kind: 'directive.branchHistoryVector.v1', version: 1, ownerSaveId: saveId,
    previous: null, rowCount: 257, rows: Array(257).fill(rowHashes[0]) }, saveId, 'vector'),
  { code: 'DIRECTIVE_V1_CAPTURE_LIMIT_EXCEEDED' });
  assert.throws(() => historyObjectPath('../foreign', 'vector', rowHashes[0]));
}
// Empty vectors remain exact anchors and can be extended later.
{
  const empty = memoryAdapter();
  await storage.storeV1CampaignSave(empty, saveFor(initial));
  const manifest = await empty.readJson(manifestPath);
  const capture = await request(initial, initial, [], 'operation.empty', 'baseline');
  const result = await writeCaptured(empty, saveFor(initial), { expectedManifest: manifest, previousSave: saveFor(initial), capture });
  assert.equal(result.publication, 'committed');
  const page = await empty.readJson(result.manifest.branchHistory.page.path);
  assert.equal(page.records[0].capture.transcript.head, null);
  assert.equal(Object.keys(empty.snapshot()).filter(path => path.includes('history-vector')).length, 0);
  await acknowledgeCaptured(empty, result);
  const nextCapture = await request(initial, next, rowHashes.slice(0, 3), 'operation.after-empty');
  assert.equal((await writeCaptured(empty, saveFor(next), { expectedManifest: result.manifest,
    previousSave: saveFor(initial), capture: nextCapture })).publication, 'committed');
}
// The declared shared lease makes an ordinary writer observe the new baseline.
{
  const queued = memoryAdapter(Object.fromEntries(Object.entries(baselineFiles).filter(([path]) => !path.includes('.history-'))));
  queued.set(manifestPath, baselineInput.expectedManifest);
  const first = withCampaignTimelineLease(initial.campaign.id,
    async () => {
      const result = await writeCaptured(queued, saveFor(initial), baselineInput);
      await acknowledgeCaptured(queued, result);
      return result;
    }, { lockManager: null });
  const second = withCampaignTimelineLease(initial.campaign.id,
    () => storage.storeV1CampaignSave(queued, saveFor(next), { previousSave: saveFor(initial) }), { lockManager: null });
  assert.equal((await first).publication, 'committed');
  await assert.rejects(() => second, { code: 'DIRECTIVE_V1_CAPTURE_REQUIRED' });
  assert.equal((await queued.readJson(manifestPath)).currentRevision, initial.stateCustody.revision);
}
// No-op, ambiguous, corrupt-prior, corrupt-candidate and post-verification races.
for (const variant of ['noop-manifest', 'corrupt-prior', 'corrupt-candidate', 'unreadable-candidate', 'changed-head', 'changed-pointer']) {
  let published = false, injected = false;
  const faulty = faultAdapter(baselineFiles, {
    async write(path, value, inner) {
      if (path === manifestPath) {
        if (variant === 'noop-manifest') { injected = true; return; }
        published = true;
        await inner.writeJson(path, value);
        if (variant === 'corrupt-candidate') {
          const page = await inner.readJson(value.branchHistory.page.path);
          page.records.at(-1).requestHash = 'a'.repeat(64);
          inner.set(value.branchHistory.page.path, page); injected = true;
        }
        return;
      }
      if (path.includes('segment-') && variant === 'corrupt-prior') {
        const base = await inner.readJson(baseline.manifest.base.path);
        base.state.campaign.title = 'corrupted prior'; inner.set(baseline.manifest.base.path, base);
        injected = true; throw new Error('segment write failed after prior damage');
      }
      await inner.writeJson(path, value);
    },
    async read(path, inner) {
      if (published && path === manifestPath && variant === 'unreadable-candidate') { injected = true; throw new Error('unreadable manifest'); }
      if (!injected && path.includes('history-vector') && variant === 'changed-head') {
        const manifest = await inner.readJson(manifestPath); manifest.updatedAt = '2026-09-14T13:00:00.000Z';
        inner.set(manifestPath, manifest); injected = true;
      }
      if (!injected && path.includes('history-vector') && variant === 'changed-pointer') {
        const index = await inner.readJson(storage.V1_STORAGE_PATHS.index); index.activeSaveId = 'save.other';
        inner.set(storage.V1_STORAGE_PATHS.index, index); injected = true;
      }
    },
  });
  const result = await writeCaptured(faulty, saveFor(next), commitInput);
  assert.equal(injected, true, variant);
  assert.equal(result.publication, variant === 'noop-manifest' ? 'not-committed' : 'uncertain', `${variant}: ${JSON.stringify(result)}`);
}
// Pointer drift at acknowledgement is conflicting ownership, not an ack-only error.
{
  const faulty = faultAdapter(baselineFiles, { async write(path, value, inner) {
    if (path === storage.V1_STORAGE_PATHS.index) {
      inner.set(path, { ...value, activeSaveId: 'save.other' });
      throw new Error('pointer changed during acknowledgement');
    }
    await inner.writeJson(path, value);
  } });
  const result = await writeCaptured(faulty, saveFor(next), commitInput);
  assert.equal(result.publication, 'uncertain');
}
// Immutable input cloning holds across asynchronous preflight reads.
{
  const input = structuredClone(commitInput), record = saveFor(next), before = structuredClone(record);
  let changed = false;
  const delayed = faultAdapter(baselineFiles, { async read(path) {
    if (!changed) { changed = true; input.capture.writerKind = 'mutated after call'; record.name = 'mutated after call'; }
  } });
  const result = await writeCaptured(delayed, record, input);
  assert.equal(result.publication, 'committed');
  assert.deepEqual(result.save, before);
  const page = await delayed.readJson(result.manifest.branchHistory.page.path);
  assert.equal(page.records.at(-1).capture.writerKind, commitInput.capture.writerKind);
}
// Actual state-custody commits cross catalog and mutable state-segment rollover.
const beforeRollover = expectedManifest;
for (let i = 0; i < 66; i++) {
  await gateway.applyProposal({ baseRevision: gateway.revision(), domains: ['worldState'],
    operations: [{ op: 'set', path: 'worldState.visitedLocationIds', value: [...state.worldState.visitedLocationIds, `capture.rollover.${i}`] }],
    source: 'captured-boundary-rollover-test' });
  const capture = await request(previous, state, rowHashes.slice(0, 7), `operation.rollover-${i}`);
  const result = await writeCaptured(adapter, saveFor(state), { expectedManifest, previousSave: saveFor(previous), capture });
  assert.equal(result.publication, 'committed', JSON.stringify(result));
  await acknowledgeCaptured(adapter, result);
  expectedManifest = result.manifest; previous = structuredClone(state);
}
assert.ok(expectedManifest.segments.length >= 2);
assert.ok(expectedManifest.branchHistory.recordCount > 64);
const page = await adapter.readJson(expectedManifest.branchHistory.page.path);
assert.ok(page.previous);
assert.equal((await adapter.readJson(page.previous.path)).records.length, 64);
assert.equal((await writeCaptured(adapter, saveFor(next), commitInput)).publication, 'uncertain', 'old operation cannot adopt a newer head');
await assert.rejects(() => storage.loadV1CampaignStateAtRevision(adapter, saveId, { expectedManifest: beforeRollover, revision: 0 }),
  { code: 'DIRECTIVE_V1_HISTORY_HEAD_CHANGED' });
for (const historical of [beforeReopen, afterReopen]) {
  const restored = await storage.loadV1CampaignStateAtRevision(adapter, saveId, { expectedManifest, revision: historical.stateCustody.revision });
  assert.deepEqual(restored.state, historical, 'rollover restores full correction effect custody');
}
console.log('V1 captured state boundary tests passed');
