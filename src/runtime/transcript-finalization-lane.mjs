export function transcriptNotReady(reason = 'unfinished-transcript') {
  return Object.assign(new Error('The current reply is still being prepared. Wait for it to finish before changing campaign progress.'),
    { code: 'DIRECTIVE_TRANSCRIPT_NOT_READY', reasonCode: reason });
}

// Runtime-local ownership, not a persisted chronology or proof of native idleness.
export function createTranscriptFinalizationLane() {
  const owners = new Map();
  let sequence = 0;
  function current(key) { return key ? owners.get(key) || null : null; }
  function begin(key, phase = 'preparing') {
    if (!key) return null;
    const prior = current(key);
    if (prior) throw transcriptNotReady(prior.running ? 'finalization-running' : prior.phase);
    const owner = { id: ++sequence, key, phase, revoked: false, running: false };
    owners.set(key, owner);
    return owner;
  }
  function finalize(key) {
    const prior = current(key);
    if (prior?.running) return { owner: prior, duplicate: true };
    if (prior) prior.revoked = true;
    const owner = { id: ++sequence, key, phase: 'finalizing', revoked: false, running: true };
    if (key) owners.set(key, owner);
    return { owner, duplicate: false };
  }
  function assertOwner(owner, key) {
    if (!owner || owner.revoked || owner.key !== key || current(key) !== owner) throw transcriptNotReady('transcript-owner-changed');
  }
  function assertWritable(key, owner = null) {
    const active = current(key);
    if (!active) {
      if (owner) assertOwner(owner, key);
      return;
    }
    assertOwner(owner, key);
    if (!['preparing', 'finalizing'].includes(owner.phase)) throw transcriptNotReady(owner.phase);
  }
  function finish(owner, success) {
    if (!owner) return;
    owner.running = false;
    if (current(owner.key) !== owner) return;
    if (success && !owner.revoked) owners.delete(owner.key);
    else owner.phase = 'failed';
  }
  function cancel(key) {
    const owner = current(key);
    if (owner) { owner.revoked = true; owner.phase = 'failed'; }
  }
  return { current, begin, finalize, assertOwner, assertWritable, finish, cancel,
    releaseUnchanged(owner) { if (owner && !owner.running && current(owner.key) === owner) owners.delete(owner.key); },
    producing(owner) { assertOwner(owner, owner?.key); owner.phase = 'producing'; },
    status(key) { const owner = current(key); return owner ? { phase: owner.phase, running: owner.running } : null; },
  };
}
