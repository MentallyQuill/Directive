import {
  captureHostTranscriptSnapshot,
  readTranscriptSnapshotDataProperty,
} from '../hosts/transcript-snapshot-contract.mjs';
import { sha256Json } from '../storage/v1-state-delta-codec.mjs';

const SNAPSHOT_FIELDS = Object.freeze([
  'kind', 'version', 'representation', 'hostId', 'nativeIdentity', 'directiveBinding', 'rowCount', 'rows',
]);
function invalidSnapshot() {
  return Object.freeze({ status: 'unsupported', reasonCode: 'DIRECTIVE_V1_BRANCH_TRANSCRIPT_INVALID',
    detail: 'A complete supported host transcript snapshot is required.' });
}

// Disabled preparation only: these hashes assert projected data equality, not
// accepted-source validity, chronology coverage, or native branch authority.
export async function projectBranchHistoryTranscriptV1(input) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return invalidSnapshot();
    const keys = Reflect.ownKeys(input);
    if (keys.length !== SNAPSHOT_FIELDS.length || !keys.every(key => SNAPSHOT_FIELDS.includes(key))) return invalidSnapshot();
    const envelope = {};
    for (const key of SNAPSHOT_FIELDS) envelope[key] = readTranscriptSnapshotDataProperty(input, key);
    if (envelope.kind !== 'directive.hostTranscriptSnapshot.v1' || envelope.version !== 1
      || envelope.representation !== 'sillytavern.persistable-row-data.v1'
      || (envelope.directiveBinding !== null && (!envelope.directiveBinding
        || typeof envelope.directiveBinding !== 'object' || Array.isArray(envelope.directiveBinding)))
      || !Number.isSafeInteger(envelope.rowCount) || envelope.rowCount < 0
      || !Array.isArray(envelope.rows) || envelope.rowCount !== envelope.rows.length) return invalidSnapshot();

    // Reuse the bounded, descriptor-safe native copier. The complete input and
    // provenance are detached synchronously before the first hashing await.
    const captured = captureHostTranscriptSnapshot(envelope);
    if (captured.status !== 'captured') return captured;
    const snapshot = captured.snapshot;
    const rowHashes = [];
    for (let index = 0; index < snapshot.rowCount; index++) {
      rowHashes.push(await sha256Json({
        kind: 'directive.branchHistoryTranscriptRow.v1', version: 1,
        representation: snapshot.representation, index, row: snapshot.rows[index],
      }));
    }
    // No field exclusions, text normalization, variant repair, or source-row
    // filtering. Even unknown metadata and unselected swipes remain covered.
    const transcript = Object.freeze({ projectionVersion: 1, rowCount: snapshot.rowCount,
      rowHashes: Object.freeze(rowHashes), vectorHash: await sha256Json(rowHashes) });
    const provenance = Object.freeze({
      snapshotKind: snapshot.kind, representation: snapshot.representation, hostId: snapshot.hostId,
      nativeIdentity: snapshot.nativeIdentity, directiveBinding: snapshot.directiveBinding,
      // This hash includes origin/binding. Row/vector hashes deliberately do
      // not, so otherwise identical parent/child rows remain comparable.
      snapshotHash: await sha256Json(snapshot),
    });
    return Object.freeze({ status: 'projected', transcript, provenance });
  } catch {
    // Invalid descriptors/non-JSON data never produce partial transcript hashes.
    return invalidSnapshot();
  }
}
