import { canonicalJson } from '../storage/v1-state-delta-codec.mjs';
import { readCharacterScenePublication } from '../story/character-scene-publication.mjs';

/** Synchronous guard shared by generation, live mutation and saved read-back.
 * The host calls `mutated` immediately after its synchronous write, before any
 * display/save await. Only that callback can advance the expected transcript.
 */
export function createCharacterPublicationGuard({ publicationId, identity, baselineRows, readIdentity, readRows } = {}) {
  if (!publicationId || !Array.isArray(baselineRows) || typeof readIdentity !== 'function' || typeof readRows !== 'function') throw new TypeError('character-publication-guard-invalid');
  const expectedIdentity = canonicalJson(identity);
  let expectedRows = canonicalJson(baselineRows), mutationArmed = false, mutated = false;
  function identityCurrent() {
    const value = readIdentity();
    if (value?.then) { Promise.resolve(value).catch(() => null); return false; }
    return canonicalJson(value) === expectedIdentity;
  }
  function liveRows() {
    const rows = readRows();
    if (rows?.then) { Promise.resolve(rows).catch(() => null); return null; }
    return Array.isArray(rows) ? rows : null;
  }
  function isCurrent() {
    try { const rows = liveRows(); return identityCurrent() && rows !== null && canonicalJson(rows) === expectedRows; }
    catch { return false; }
  }
  function assertPublication({ phase, publicationId: actualId, source, persistedSnapshot, mutatedRows } = {}) {
    try {
      if (actualId !== publicationId || !identityCurrent()) return false;
      if (phase === 'mutated') {
        if (!mutationArmed || mutated || !Array.isArray(mutatedRows)) return false;
        const rows = liveRows();
        if (!rows || canonicalJson(rows) !== canonicalJson(mutatedRows)) return false;
        const publications = rows.map((row, index) => readCharacterScenePublication({ ...row, hostMessageId: row.hostMessageId || row.id || String(index) }))
          .filter(value => value.status === 'valid' && value.publicationId === publicationId);
        if (publications.length !== 1 || canonicalJson(publications[0].source) !== canonicalJson(source)) return false;
        expectedRows = canonicalJson(rows); mutationArmed = false; mutated = true;
        return true;
      }
      if (!isCurrent()) return false;
      if (phase === 'before-mutation') {
        if (mutated) return false;
        mutationArmed = true;
        return true;
      }
      if (phase === 'persisted') return mutated && Array.isArray(persistedSnapshot?.rows) && canonicalJson(persistedSnapshot.rows) === expectedRows;
      return phase === 'reconcile';
    } catch { return false; }
  }
  return { isCurrent, assertPublication };
}
