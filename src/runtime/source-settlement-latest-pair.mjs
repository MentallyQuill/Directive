import { settleLatestPairSceneHandshakeSource } from './source-settlement-latest-pair-owner.mjs';
import {
  createLatestPairSourceSettlementProvider as createLatestPairSourceSettlementProviderRuntime
} from './source-settlement-latest-pair-provider.mjs';
import { runLatestPairSceneHandshakeSettlement } from './source-settlement-latest-pair-scene-adapter.mjs';
import { validateLatestPairSettlement } from './source-settlement-latest-pair-validation.mjs';

export function createLatestPairSourceSettlementProvider(options = {}) {
  const adapter = options.sceneHandshakeAdapter || null;
  if (typeof options.validateLatestPairSettlement === 'function') {
    return createLatestPairSourceSettlementProviderRuntime(options);
  }
  if (typeof adapter?.validateLatestPairSettlement === 'function') {
    return createLatestPairSourceSettlementProviderRuntime({
      ...options,
      validateLatestPairSettlement: adapter.validateLatestPairSettlement
    });
  }
  if (typeof adapter?.validateSceneHandshakeSettlement === 'function') {
    return createLatestPairSourceSettlementProviderRuntime({
      ...options,
      validateLatestPairSettlement: adapter.validateSceneHandshakeSettlement
    });
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
  if (typeof options.sceneHandshakeAdapter?.settleLatestPairSource === 'function') {
    return options.sceneHandshakeAdapter.settleLatestPairSource(options);
  }
  return runLatestPairSceneHandshakeSettlement(options);
}
