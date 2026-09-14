// Synthetic source-bound extraction evaluation. No live host or save access.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createContinuityAnalyst } from '../../src/story/continuity-analyst.mjs';
import { resolveAnalysisLimits } from '../../src/generation/analysis-limits.mjs';
import { stableSha256Hex } from '../../src/runtime/v1-stable-hash.mjs';
import { makeDirectorRequest } from './director-contract-test-fixtures.mjs';

const fallback = 'Two Type-9s are standing by as a cargo fallback.';
const staffing = 'Renwick needs additional cargo handlers.';
const deadline = 'The callback is at fourteen-thirty.';
const earlier = 'Restoration is expected at fifteen hundred.';
const later = 'Restoration is now expected at sixteen hundred.';

export function createExtractionCases({ capacity = 1 } = {}) {
  const definitions = [
    ['private-call', `Sam privately hears Renwick say, "${staffing}"`, `Sam tells Nayar, "${fallback}"`, [['staffing', staffing, false, 'previousAssistant'], ['fallback', fallback, true, 'currentPlayer']]],
    ['late-arrival', `Renwick privately tells Sam, "${deadline}" The call ends. Nayar arrives afterward.`, `Sam tells Nayar, "${fallback}"`, [['deadline', deadline, false, 'previousAssistant'], ['fallback', fallback, true, 'currentPlayer']]],
    ['partial-document', `Sam privately reads a PADD: "${deadline} ${staffing}" Nayar cannot see the PADD.`, `Sam reads only this section aloud to Nayar: "${fallback}"`, [['deadline', deadline, false, 'previousAssistant'], ['staffing', staffing, false, 'previousAssistant'], ['fallback', fallback, true, 'currentPlayer']]],
    ['reported-communication', 'Nayar meets an unidentified crewman.', `The crewman tells Nayar, "I heard someone claim that ${staffing}" Sam asks what was actually witnessed.`, [['reported-staffing', staffing, true, 'currentPlayer']]],
    ['outdated-report', `Sam tells Nayar, "${earlier}"`, `Cross privately tells Sam, "${later}" Sam returns to Nayar without relaying the update.`, [['earlier', earlier, true, 'previousAssistant'], ['later', later, false, 'currentPlayer']]],
    ['explicit-briefing', 'Nayar waits for Sam in the cargo bay.', `Sam tells Nayar, "${fallback} ${staffing} ${deadline}"`, [['fallback', fallback, true, 'currentPlayer'], ['staffing', staffing, true, 'currentPlayer'], ['deadline', deadline, true, 'currentPlayer']]],
  ];
  return definitions.map(([id, assistant, player, facts]) => {
    const request = makeDirectorRequest();
    request.analysisLimits = resolveAnalysisLimits({ analysisCapacity: capacity });
    request.authoredContext.referenceIds = ['person.nayar'];
    request.authoredContext.references = [{ id: 'person.nayar', name: 'Priya Nayar', kind: 'person' }];
    for (const [slot, text] of [['previousAssistant', assistant], ['currentPlayer', player]]) {
      request.pendingPair[slot].text = text;
      request.pendingPair[slot].textHash = stableSha256Hex(text);
    }
    return { id, request, facts: facts.map(([factId, quote, received, sourceSlot]) => ({ id: factId, quote, received, sourceSlot })) };
  });
}

export function scoreExtractedAccess(scenario, changes) {
  const observed = new Set();
  let unclassifiedAccessRecords = 0;
  for (const change of changes) {
    if (change.operation !== 'addFact' || !change.informationAccess?.recipientIds?.includes('person.nayar')) continue;
    const quote = String(change.evidenceQuote || '').trim();
    const matches = scenario.facts.filter(fact => fact.sourceSlot === change.sourceSlot && quote.length >= 12
      && (fact.quote.includes(quote) || quote.includes(fact.quote)));
    if (!matches.length) unclassifiedAccessRecords++;
    for (const fact of matches) observed.add(fact.id);
  }
  return {
    unsupportedGrants: scenario.facts.filter(fact => !fact.received && observed.has(fact.id)).length,
    omissions: scenario.facts.filter(fact => fact.received && !observed.has(fact.id)).length,
    correctReceipts: scenario.facts.filter(fact => fact.received && observed.has(fact.id)).length,
    unclassifiedAccessRecords,
  };
}

export async function runExtractionEvaluation({ generate, capacity = 1 } = {}) {
  const cases = createExtractionCases({ capacity });
  if (typeof generate !== 'function') return { status: 'unrun', cases: cases.map(({ id }) => id) };
  const results = [];
  for (const scenario of cases) {
    let calls = 0;
    const analyst = createContinuityAnalyst({ generationRouter: {
      generate: async (role, request, options) => { calls++; return generate(role, request, options, scenario.id); },
    } });
    const started = performance.now();
    const result = await analyst({ request: scenario.request });
    results.push({ id: scenario.id, ok: result.ok, reasonCode: result.reasonCode || null, calls,
      milliseconds: performance.now() - started,
      ...(result.ok ? scoreExtractedAccess(scenario, result.proposal.threadChanges) : {}),
    });
  }
  return { status: 'evaluated', capacity,
    scope: 'Exact labelled source-span receipt checks through the production analyst. Unclassified records require review; this does not score belief, speaker attribution, narrator prose, or live-host behavior.',
    cases: results,
    totals: Object.fromEntries(['unsupportedGrants', 'omissions', 'correctReceipts', 'unclassifiedAccessRecords'].map(key => [key, results.reduce((sum, row) => sum + (row[key] || 0), 0)])),
    invalidCases: results.filter(row => !row.ok).length,
  };
}

async function main(args) {
  if (args.length === 0) return runExtractionEvaluation();
  if (args[0] === '--requests' && args.length === 1) {
    const requests = [];
    await runExtractionEvaluation({ generate: async (role, request, _options, id) => {
      requests.push({ id, role, request });
      return { ok: false, error: { code: 'evaluation-export-only' } };
    } });
    return { status: 'unrun', requests };
  }
  if (args[0] === '--responses' && args.length === 2) {
    const saved = JSON.parse(await readFile(args[1], 'utf8'));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new TypeError('Expected an object keyed by exported case ID');
    return { ...await runExtractionEvaluation({ generate: async (_role, _request, _options, id) => {
      if (!Object.hasOwn(saved, id)) return { ok: false, error: { code: 'evaluation-response-missing' } };
      return { ok: true, response: { text: typeof saved[id] === 'string' ? saved[id] : JSON.stringify(saved[id]) } };
    } }), provenance: 'replayed supplied responses; no live provider called' };
  }
  throw new TypeError('Usage: node tools/scripts/character-information-extractor-evaluation.mjs [--requests | --responses FILE]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.invalidCases || result.totals?.unsupportedGrants || result.totals?.omissions || result.totals?.unclassifiedAccessRecords) process.exitCode = 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
