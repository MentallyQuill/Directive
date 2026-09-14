// Offline controlled-state probe. No generation router, provider or host access.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildRichCampaignFixture, assertRichCampaignOracle, RICH_CAMPAIGN_SIZES } from './rich-campaign-soak-fixture.mjs';
import { createV1CampaignSave, storeV1CampaignSave, loadV1CampaignSave, verifyV1Storage, V1_STORAGE_PATHS } from '../../src/storage/v1-storage-repository.mjs';
import { buildV1RuntimePlayerProjection } from '../../src/runtime/v1-mission-runtime.mjs';
import { createV1RuntimePromptPacket } from '../../src/runtime/runtime-app.mjs';
import { reconstructV1BranchState } from '../../src/runtime/v1-branch-reconstruction.mjs';
import { projectDirectorContinuity } from '../../src/story/director-context.mjs';
import { lookupContinuityThreads } from '../../src/story/thread-retrieval.mjs';
import { normalizeAnalysisLimits } from '../../src/generation/analysis-limits.mjs';

const bytes = value => Buffer.byteLength(JSON.stringify(value));
function memoryAdapter() {
  const files = new Map();
  const counters = { reads: 0, writes: 0, bytesWritten: 0 };
  return { files, counters,
    async readJson(key) {
      counters.reads++;
      if (!files.has(key)) throw Object.assign(new Error(`Missing ${key}`), { code: 'ENOENT' });
      return structuredClone(files.get(key));
    },
    async writeJson(key, value) { counters.writes++; counters.bytesWritten += bytes(value); files.set(key, structuredClone(value)); },
    async deleteJsonFile(key) { files.delete(key); },
  };
}
async function sample(fn, list) {
  const start = performance.now();
  const result = await fn();
  list.push(performance.now() - start);
  return result;
}

export async function runRichCampaignSoak({ size = 'small', repetitions = 5, onProgress = () => {} } = {}) {
  if (!RICH_CAMPAIGN_SIZES[size]) throw new TypeError(`Unknown size: ${size}`);
  if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 30) throw new TypeError('repetitions must be 1-30');
  const adapter = memoryAdapter();
  const measurements = { checkpointSave: [], load: [], projection: [], prompt: [], retrieval: [], branch: [] };
  let previousSave = null;
  const buildStart = performance.now();
  const fixture = await buildRichCampaignFixture({ size, onCheckpoint: async (state, pairs) => {
    const save = createV1CampaignSave({ id: state.campaignChatBinding.saveId, name: `Rich ${size}`, state,
      createdAt: '2026-09-14T00:00:00.000Z', updatedAt: new Date(Date.parse('2026-09-14T00:00:00.000Z') + pairs * 1000).toISOString() });
    await sample(() => storeV1CampaignSave(adapter, save, { previousSave }), measurements.checkpointSave);
    previousSave = save;
    if (pairs === 1 || pairs % 25 === 0 || pairs === RICH_CAMPAIGN_SIZES[size].pairs) onProgress({ size, pairs, phase: 'fixture-checkpoint' });
  } });
  const buildMilliseconds = performance.now() - buildStart;
  assertRichCampaignOracle(fixture);
  const original = JSON.stringify(fixture.state);
  assert.equal((await verifyV1Storage(adapter)).ok, true);
  const manifest = adapter.files.get(V1_STORAGE_PATHS.save(previousSave.id));
  assert.equal(Object.hasOwn(manifest, 'state'), false);
  assert.ok(manifest.segments.every(s => s.deltaCount <= 64 && s.byteLength <= 512 * 1024));
  const limits = normalizeAnalysisLimits();
  const retrieval = [], promptCharacters = [], componentCharacters = [];
  const queries = fixture.oracle.threads.slice(0, Math.min(4, fixture.oracle.threads.length)).flatMap(thread => [
    { mode: 'exact-id', thread, options: { referencedIds: [thread.id] } },
    { mode: 'lexical', thread, options: { queryText: thread.title } },
    { mode: 'anchored-paraphrase', thread, options: { queryText: `What freight did we promise the outpost numbered ${thread.title.split(' ').at(-1)}?` } },
    { mode: 'unanchored-paraphrase', thread, options: { queryText: 'What freight did we promise the outpost?' } },
  ]);
  const retrieve = query => lookupContinuityThreads({ events: fixture.state.storySettlement.continuityEvents,
    currentRevision: fixture.state.storySettlement.revision, limits, ...query.options });
  // Warm-up is excluded from the fixed-workload samples below.
  await loadV1CampaignSave(adapter, previousSave.id);
  const warmProjection = buildV1RuntimePlayerProjection({ campaignState: fixture.state, runtimeAssets: fixture.runtimeAssets });
  assert.equal(warmProjection.ok, true);
  createV1RuntimePromptPacket({ state: fixture.state, projection: warmProjection.projection, runtimeAssets: fixture.runtimeAssets });
  for (const query of queries) retrieve(query);
  for (let i = 0; i < repetitions; i++) {
    const loaded = await sample(() => loadV1CampaignSave(adapter, previousSave.id), measurements.load);
    assert.deepEqual(loaded, previousSave, 'exact rich segmented round trip');
    const projected = await sample(() => buildV1RuntimePlayerProjection({ campaignState: loaded.state, runtimeAssets: fixture.runtimeAssets }), measurements.projection);
    assert.equal(projected.ok, true);
    const projection = projected.projection;
    assert.equal(projection.story.entries.length, fixture.dimensions.sealedEpisodes, 'all sealed episodes reach player projection');
    assert.equal(projection.people.people.length, fixture.runtimeAssets.crewDataset.officers.length + fixture.dimensions.people, 'all accepted People reach projection');
    const packet = await sample(() => createV1RuntimePromptPacket({ state: loaded.state, projection, runtimeAssets: fixture.runtimeAssets }), measurements.prompt);
    promptCharacters.push([...packet.text].length);
    const payload = JSON.parse(packet.text.slice(packet.text.indexOf('{\n')));
    assert.ok(payload.acceptedStory.entries.length > 0, 'rich prompt includes actual sealed story records');
    const component = { acceptedStory: JSON.stringify(payload.acceptedStory).length, workingStory: JSON.stringify(payload.workingStory).length };
    assert.ok(component.acceptedStory <= 4000, 'default production accepted-story prompt budget');
    assert.ok(component.workingStory <= 1800, 'default production working-story prompt budget');
    componentCharacters.push(component);
    const context = projectDirectorContinuity({ events: loaded.state.storySettlement.continuityEvents, currentRevision: loaded.state.storySettlement.revision, queryText: 'medical supplies', limits });
    assert.ok([...JSON.stringify(context)].length <= limits.threadContextCharacters, 'production continuity budget');
    for (const query of queries) {
      const result = await sample(() => retrieve(query), measurements.retrieval);
      assert.ok([...JSON.stringify(result)].length <= limits.threadContextCharacters);
      const found = result.records.find(record => record.title === query.thread.title);
      const obsoleteFactCount = result.records.flatMap(record => record.facts).filter(fact => fixture.oracle.threads.some(t => t.initial === fact.text)).length;
      assert.equal(obsoleteFactCount, 0, 'superseded fact cannot return as current');
      const recall = Number(Boolean(found?.facts.some(fact => fact.text === query.thread.revised)));
      if (query.mode === 'exact-id') assert.equal(recall, 1, 'explicit targeted lookup recalls current fact');
      if (i === 0) retrieval.push({ mode: query.mode, question: query.options.queryText || query.thread.id,
        expectedTitle: query.thread.title, expectedFact: query.thread.revised, recall, obsoleteFactCount,
        suppliedRecords: result.records.length, omittedThreads: result.retrieval.omittedThreadCount });
    }
  }
  const branches = [];
  for (const [label, retainedPairs] of [['identical-tail', fixture.dimensions.pairs], ['before-corrections', fixture.dimensions.threads], ['after-corrections', fixture.dimensions.threads * 2], ['inside-episode', fixture.dimensions.threads + 1]]) {
    const saveId = `save.rich-${size}-${label}`;
    const rebuilt = await sample(() => reconstructV1BranchState({ parentState: fixture.state,
      parentMessages: fixture.messages, childMessages: fixture.messages.slice(0, retainedPairs * 2 + 1),
      lineageHash: `lineage.rich-${label}`, targetSaveId: saveId,
      targetChatBinding: { kind: 'directive.campaignChatBinding.v1', version: 1, campaignId: fixture.state.campaign.id, saveId, chatId: `chat.rich-${label}`, status: 'bound' },
      runtimeAssets: fixture.runtimeAssets, now: () => '2026-09-14T12:00:00.000Z',
    }), measurements.branch);
    assert.equal(rebuilt.modelCallCount, 0);
    assert.equal(rebuilt.projection.ok, true);
    assert.equal(rebuilt.campaignState.storySettlement.branchId, saveId);
    assert.deepEqual(rebuilt.campaignState.timeLedger, fixture.state.timeLedger, 'empty time ledger not invented by synthetic story history');
    const counts = assertRichCampaignOracle(fixture, { state: rebuilt.campaignState, retainedPairs });
    branches.push({ label, retainedPairs, ...counts });
  }
  assert.equal(JSON.stringify(fixture.state), original, 'retrieval/storage/branches leave parent unchanged');
  const summary = Object.fromEntries(Object.entries(measurements).map(([key, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return [key, { samples: values.length, medianMs: sorted[Math.floor(sorted.length / 2)], maximumMs: sorted.at(-1) }];
  }));
  return { kind: 'directive.richCampaignOfflineMeasurement.v1', size, dimensions: fixture.dimensions,
    actualMessageRows: fixture.messages.length, stateBytes: bytes(fixture.state), storageBytes: [...adapter.files.values()].reduce((sum, value) => sum + bytes(value), 0),
    segmentCount: manifest.segments.length, storageCounters: adapter.counters, buildMilliseconds,
    repetitions, analysisLimits: limits, measurements, summary, promptCharacters, componentCharacters, retrieval, branches, integrity: 'passed', providerCalls: 0,
    limitations: ['Synthetic source-bound accepted evidence, not real provider acceptance or natural play.',
      'In-memory JSON adapter timings exclude filesystem, browser, host and network latency.',
      'Save samples are distinct accepted-pair checkpoints; load/prompt/retrieval samples repeat one fixed final workload.',
      'Branch samples are one per distinct cut, not repeated timing estimates.',
      'No mission progression, rewards or accumulated time evidence is fabricated; the authored Prelude remains active.',
      'Lookup scoring is deterministic direct retrieval, not a model-selected lookup or live recall score.',
      'Anchored paraphrases share a literal destination number; gains are lexical matching, not synonym or semantic understanding. Unanchored controls intentionally share no content tokens.',
      'Narration prompt sizes measure only createV1RuntimePromptPacket, not native transcript/preset/static context or full provider wire. Parent observed an 85,040-character installed narration wire at nine local pairs; these sizes do not contradict that observation.',
      'Narration packet sizes are measurements, not an assumed global cap; compare sizes/configurations before claiming bounded growth.'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => {
    const match = /^--(sizes|repetitions|output)=(.+)$/.exec(arg);
    if (!match) throw new TypeError('Usage: --sizes=small[,medium,long] --repetitions=5 --output=path.json');
    return [match[1], match[2]];
  }));
  const sizes = (args.sizes || 'small').split(',');
  if (sizes.some(size => !RICH_CAMPAIGN_SIZES[size])) throw new TypeError('sizes must be small,medium,long');
  const output = resolve(args.output || 'artifacts/rich-campaign-soak/results.json');
  const report = { startedAt: new Date().toISOString(), node: process.version, results: [] };
  await mkdir(dirname(output), { recursive: true });
  for (const size of sizes) {
    console.log(`Starting rich ${size} workload; no provider calls.`);
    report.results.push(await runRichCampaignSoak({ size, repetitions: Number(args.repetitions || 5),
      onProgress: progress => console.log(JSON.stringify(progress)) }));
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ size, summary: report.results.at(-1).summary, output }));
  }
}
