// src/runtime/parallel-turn-analysis.mjs
export function createParallelTurnAnalysis({ interpret, direct }) {
  const cache = new Map();
  const flights = new Map();
  async function runRole(entry, role, task, request, signal) {
    if (entry[role]?.ok === true) return;
    try {
      entry[role] = await task({ request: structuredClone(request), signal });
    } catch (error) {
      entry[role] = { ok: false, reasonCode: error?.code || `${role}-failed` };
    }
  }
  function run({ key, interpreterRequest, directorRequest, signal }) {
    if (flights.has(key)) return flights.get(key);
    if (signal?.aborted) return Promise.resolve({ ok: false, reasonCode: 'aborted' });
    const entry = cache.get(key) || {};
    cache.set(key, entry);
    const flight = Promise.all([
      runRole(entry, 'interpreter', interpret, interpreterRequest, signal),
      runRole(entry, 'director', direct, directorRequest, signal),
    ]).then(() => {
      if (signal?.aborted) {
        cache.delete(key);
        return { ok: false, reasonCode: 'aborted' };
      }
      return {
        ok: entry.interpreter?.ok === true && entry.director?.ok === true,
        blockedRoles: ['interpreter', 'director'].filter(role => entry[role]?.ok !== true),
        interpreter: structuredClone(entry.interpreter),
        director: structuredClone(entry.director),
      };
    }).finally(() => flights.delete(key));
    flights.set(key, flight);
    return flight;
  }
  return {
    run,
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
