import { settleLatestPairSceneHandshakeSource } from './source-settlement-latest-pair-owner.mjs';
import {
  createLatestPairSourceSettlementProvider as createLatestPairSourceSettlementProviderRuntime
} from './source-settlement-latest-pair-provider.mjs';
import { runLatestPairSceneHandshakeSettlement } from './source-settlement-latest-pair-scene-adapter.mjs';
import { validateLatestPairSettlement } from './source-settlement-latest-pair-validation.mjs';

export function createLatestPairSourceSettlementProvider(options = {}) {
  if (typeof options.validateLatestPairSettlement === 'function') {
    return createLatestPairSourceSettlementProviderRuntime(options);
  }
  return createLatestPairSourceSettlementProviderRuntime({
    ...options,
    validateLatestPairSettlement
  });
}

export async function settleLatestPairSource(options = {}) {
  if (options.snapshot && typeof options.createSceneHandshakeLedgerRecord === 'function') {
    return settleLatestPairSceneHandshakeSource(options);
  }
  return runLatestPairSceneHandshakeSettlement(options);
}
