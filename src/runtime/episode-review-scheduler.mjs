export function episodeReviewFlightKey(token) {
  if (!token) return null;
  const branchId = String(token.branchId ?? '').trim();
  const episodeId = String(token.episodeId ?? '').trim();
  const checkpointSequence = token.checkpointSequence;
  if (!branchId || !episodeId || !Number.isInteger(checkpointSequence) || checkpointSequence < 1) return null;
  return `${branchId}:${episodeId}:${checkpointSequence}`;
}

export function createEpisodeReviewScheduler({ getToken, review } = {}) {
  if (typeof getToken !== 'function') throw new TypeError('episode review scheduler requires getToken');
  if (typeof review !== 'function') throw new TypeError('episode review scheduler requires review');
  const flights = new Map();
  let queuedRequest = null;
  let queuedFlight = null;
  function noPending() {
    return {
      ok: true,
      attempted: false,
      status: 'no-pending-review',
      reasonCode: null,
      reviewToken: null,
    };
  }
  function schedule(options = {}) {
    const { automatic = true, signal = null } = options;
    const token = getToken();
    const key = episodeReviewFlightKey(token);
    if (!key) return Promise.resolve(noPending());
    if (flights.has(key)) return flights.get(key);
    if (flights.size > 0) {
      queuedRequest = { automatic, signal };
      if (!queuedFlight) {
        const active = [...flights.values()][0];
        queuedFlight = active.catch(() => null).then(() => {
          const request = queuedRequest;
          queuedRequest = null;
          queuedFlight = null;
          return request ? schedule(request) : noPending();
        });
      }
      return queuedFlight;
    }
    const flight = Promise.resolve()
      .then(() => review({ token: structuredClone(token), automatic, signal }))
      .finally(() => {
        if (flights.get(key) === flight) flights.delete(key);
      });
    flights.set(key, flight);
    return flight;
  }
  return Object.freeze({
    schedule,
    inFlightCount: () => flights.size,
  });
}
