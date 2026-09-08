// src/runtime/turn-state-reconciler.mjs
import { canonicalJson } from '../storage/v1-state-delta-codec.mjs';

const TURN_ROOTS = ['campaign', 'mission', 'storySettlement',
  'commandBearing', 'worldState', 'timeLedger'];

export function createTurnCommit({ before, after, turnKey }) {
  const changedRoot = key => Object.hasOwn(before, key) !== Object.hasOwn(after, key)
    || (Object.hasOwn(before, key) && canonicalJson(before[key]) !== canonicalJson(after[key]));
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const changed = changedRoot(key);
    if (changed && !TURN_ROOTS.includes(key)) {
      throw new TypeError(`turn-mutated-forbidden-root:${key}`);
    }
  }
  const domains = TURN_ROOTS.filter(changedRoot);
  if (domains.some(root => !Object.hasOwn(after, root) || after[root] === undefined)) {
    throw new TypeError('turn-root-removal-forbidden');
  }
  if (!domains.length) return null;
  return {
    id: turnKey,
    baseRevision: before.stateCustody.revision,
    domains,
    operations: domains.map(root => ({
      op: 'set', path: root, value: structuredClone(after[root]),
    })),
    source: 'v1TurnReconciliation',
    reason: 'Committed source-bound interpretation and story direction.',
  };
}
