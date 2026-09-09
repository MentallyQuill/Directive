// src/runtime/parallel-turn-analysis.mjs
export function createParallelTurnAnalysis({ interpret, direct, continuity, review, maxAttempts = 1 }) {
  const cache = new Map();
  const flights = new Map();
  async function runRole(entry, role, task, request, signal) {
    if (entry[role]?.ok === true) return;
    const configured = Number(typeof maxAttempts === 'function' ? maxAttempts(role) : maxAttempts);
    const attemptLimit = Number.isSafeInteger(configured) && configured > 0 ? configured : 1;
    for (let attempt = 0; attempt < attemptLimit; attempt++) {
      if (signal?.aborted) return;
      try {
        entry[role] = await task({ request: structuredClone(request), signal });
      } catch (error) {
        entry[role] = { ok: false, reasonCode: error?.code || `${role}-failed` };
      }
      if (entry[role]?.ok === true || entry[role]?.reasonCode === 'aborted') return;
    }
  }
  function run({ key, interpreterRequest, directorRequest, continuityRequest, episodeRequest, signal }) {
    if (flights.has(key)) return flights.get(key);
    if (signal?.aborted) return Promise.resolve({ ok: false, reasonCode: 'aborted' });
    const entry = cache.get(key) || {};
    cache.set(key, entry);
    const roles = [['interpreter', interpret, interpreterRequest], ['director', direct, directorRequest]];
    if (typeof continuity === 'function') roles.push(['continuity', continuity, continuityRequest ?? directorRequest]);
    if (episodeRequest != null && typeof review === 'function') roles.push(['episode', review, episodeRequest]);
    const flight = Promise.all(roles.map(([role, task, request]) => runRole(entry, role, task, request, signal))).then(() => {
      if (signal?.aborted) {
        cache.delete(key);
        return { ok: false, reasonCode: 'aborted' };
      }
      return {
        ok: roles.every(([role]) => entry[role]?.ok === true),
        blockedRoles: roles.filter(([role]) => entry[role]?.ok !== true).map(([role]) => role),
        ...Object.fromEntries(roles.map(([role]) => [role, structuredClone(entry[role])])),
      };
    }).finally(() => flights.delete(key));
    flights.set(key, flight);
    return flight;
  }
  return {
    run,
    invalidateRole(key, role) {
      if (flights.has(key)) throw new TypeError('turn-analysis-flight-active');
      if (cache.has(key)) delete cache.get(key)[role];
    },
    forget(key) {
      if (flights.has(key)) throw new TypeError('turn-analysis-flight-active');
      cache.delete(key);
    },
    clear() {
      if (flights.size) throw new TypeError('turn-analysis-flight-active');
      cache.clear();
    },
  };
}
