import {
  createLatestPairSreSettlementProvider,
  runSceneHandshakeSettlement
} from './scene-handshake-settler.mjs';

export function createLatestPairSourceSettlementProvider(options = {}) {
  return createLatestPairSreSettlementProvider(options);
}

export async function settleLatestPairSource(options = {}) {
  return runSceneHandshakeSettlement(options);
}
