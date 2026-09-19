import { canonicalJson, sha256Json } from './v1-state-delta-codec.mjs';
import {
  V2_BRANCH_HISTORY_LIMITS as LIMIT, v2Assert, v2Hash, v2Owner, v2Bytes, v2Fields,
  detachV2History, v2HistoryObjectPath, assertV2HistoryRef,
  assertV2HistoryObject, assertV2HistoryBudget,
} from './v2-branch-history-contracts.mjs';

/** Pure planning: no adapter, writes, or authority admission.
 * budget is the verifier's cumulative UNIQUE predecessor/local graph count.
 * This function checks the supplied local graph; the caller must independently
 * verify predecessor counts. objects may include other immutable vector branches
 * for deduplicating a revert, but every supplied branch must be closed and valid.
 */
export async function prepareV2BranchHistoryVector(input) {
  const detached = detachV2History(input);
  v2Assert(detached !== null && typeof detached === 'object' && !Array.isArray(detached),
    'Invalid planner request.');
  const keys = Object.keys(detached);
  v2Assert(v2Fields(detached, keys) && keys.includes('ownerSaveId') && keys.includes('rowHashes')
    && keys.every(key => ['ownerSaveId', 'rowHashes', 'previous', 'budget'].includes(key)),
  'Invalid planner fields.');
  const { ownerSaveId: owner, rowHashes: rows, previous = null } = detached;
  v2Assert(v2Owner(owner) && Array.isArray(rows) && rows.length <= LIMIT.rows && rows.every(v2Hash),
    'Invalid vector request.');
  const budget = assertV2HistoryBudget(detached.budget === undefined
    ? { records: 0, pages: 0, chunks: 0, historyBytes: 0 } : detached.budget);
  const objects = new Map();
  let objectBytes = 0;
  if (previous !== null) {
    v2Assert(v2Fields(previous, ['rowHashes', 'head', 'objects'])
      && Array.isArray(previous.rowHashes) && previous.rowHashes.length <= LIMIT.rows
      && previous.rowHashes.every(v2Hash) && Array.isArray(previous.objects)
      && previous.objects.length <= LIMIT.chunks, 'Invalid previous vector.');
    for (const item of previous.objects) {
      v2Assert(v2Fields(item, ['ref', 'value']), 'Invalid vector object entry.');
      assertV2HistoryRef(item.ref, owner, 'vector');
      assertV2HistoryObject(item.value, owner, 'vector');
      objectBytes += v2Bytes(item.value);
      v2Assert(objectBytes <= budget.historyBytes && objects.size < budget.chunks,
        'Verified budget undercounts supplied graph.');
      v2Assert(await sha256Json(item.value) === item.ref.contentHash && !objects.has(item.ref.path),
        'Corrupt or repeated previous vector object.');
      objects.set(item.ref.path, item);
    }
    // Strictly increasing counts prove acyclicity without quadratic traversal.
    for (const { value } of objects.values()) {
      const prior = value.previous === null ? null : objects.get(value.previous.path);
      v2Assert(value.previous === null || (prior
        && canonicalJson(prior.ref) === canonicalJson(value.previous)), 'Unclosed vector graph.');
      v2Assert(value.rowCount === (prior?.value.rowCount ?? 0) + value.rows.length,
        'Invalid vector graph counts.');
    }
  }
  const chain = [];
  let ref = previous?.head ?? null;
  while (ref !== null) {
    assertV2HistoryRef(ref, owner, 'vector');
    const item = objects.get(ref.path);
    v2Assert(item && canonicalJson(item.ref) === canonicalJson(ref), 'Missing previous vector object.');
    chain.push(item);
    ref = item.value.previous;
  }
  chain.reverse();
  const reconstructed = chain.flatMap(item => item.value.rows);
  v2Assert(canonicalJson(reconstructed) === canonicalJson(previous?.rowHashes ?? []),
    'Previous vector content differs.');
  let commonPrefixLength = 0;
  while (commonPrefixLength < Math.min(rows.length, reconstructed.length)
    && rows[commonPrefixLength] === reconstructed[commonPrefixLength]) commonPrefixLength++;
  let head = null;
  let reusedRowCount = 0;
  for (const item of chain) {
    if (item.value.rowCount > commonPrefixLength) break;
    head = item.ref;
    reusedRowCount = item.value.rowCount;
  }
  const writes = [];
  for (let offset = reusedRowCount; offset < rows.length; offset += LIMIT.chunkRows) {
    const chunk = rows.slice(offset, offset + LIMIT.chunkRows);
    const value = {
      kind: 'directive.branchHistoryVector.v2', version: 2, ownerSaveId: owner,
      previous: head, rowCount: offset + chunk.length, rows: chunk,
    };
    assertV2HistoryObject(value, owner, 'vector');
    const contentHash = await sha256Json(value);
    const next = { path: v2HistoryObjectPath(owner, 'vector', contentHash), contentHash };
    if (objects.has(next.path)) {
      v2Assert(canonicalJson(objects.get(next.path).value) === canonicalJson(value),
        'Immutable vector collision.');
    } else {
      budget.chunks++;
      budget.historyBytes += v2Bytes(value);
      assertV2HistoryBudget(budget);
      const item = { ref: next, value };
      writes.push(item);
      objects.set(next.path, item);
    }
    head = next;
  }
  return {
    head, writes, commonPrefixLength, reusedRowCount, budget,
    transcript: { projectionVersion: 1, rowCount: rows.length, vectorHash: await sha256Json(rows), head },
  };
}
