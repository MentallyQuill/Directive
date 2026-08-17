import { formatShipClock, formatStardate } from '../../time/ship-time.mjs';

export const V1_TIME_PLAYER_PROJECTION_KIND = 'directive.timePlayerProjection.v1';

function invalidTimeProjection() {
  const error = new Error('The V1 time projection requires accepted campaign time.');
  error.code = 'DIRECTIVE_V1_TIME_PROJECTION_INVALID';
  return error;
}

export function createTimePlayerProjection({ campaignState = {} } = {}) {
  const ledger = campaignState.timeLedger;
  const stardate = Number(ledger?.stardate);
  const secondOfDay = Number(ledger?.shipClock?.secondOfDay);
  if (ledger?.kind !== 'directive.timeLedger.v1'
    || !Number.isFinite(stardate)
    || !Number.isInteger(secondOfDay)
    || secondOfDay < 0
    || secondOfDay >= 86400) {
    throw invalidTimeProjection();
  }
  return {
    kind: V1_TIME_PLAYER_PROJECTION_KIND,
    stardate,
    secondOfDay,
    clockDisplay: formatShipClock({ secondOfDay }),
    stardateDisplay: formatStardate(stardate),
  };
}
