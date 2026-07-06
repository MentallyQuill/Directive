export const SOURCE_SETTLEMENT_LATEST_PAIR_ROLE_ID = 'sourceSettlementLatestPair';
export const SOURCE_SETTLEMENT_LATEST_PAIR_MODE = 'latestPair';
export const SOURCE_SETTLEMENT_LATEST_PAIR_OWNER = 'sre';
export const SOURCE_SETTLEMENT_LATEST_PAIR_PROJECTION_SOURCE = 'sourceSettlementLatestPair';
export const SOURCE_SETTLEMENT_LATEST_PAIR_AUTHORITY = 'sreSceneHandshakeProjection';
export const SOURCE_SETTLEMENT_LATEST_PAIR_MIRROR_KIND = 'directive.sceneHandshakeLedgerProjectionRef.v1';

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function latestPairSourceSettlementMetadata(metadata = {}) {
  return {
    ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}),
    sourceOwner: SOURCE_SETTLEMENT_LATEST_PAIR_OWNER,
    sourceSettlementMode: SOURCE_SETTLEMENT_LATEST_PAIR_MODE
  };
}

export function isLatestPairSourceSettlementAuthority(value = {}) {
  return compact(value?.sourceOwner) === SOURCE_SETTLEMENT_LATEST_PAIR_OWNER
    && compact(value?.sourceSettlementMode) === SOURCE_SETTLEMENT_LATEST_PAIR_MODE;
}

export function latestPairSourceSettlementAuthority(record = {}) {
  return {
    authority: SOURCE_SETTLEMENT_LATEST_PAIR_AUTHORITY,
    projectionSource: SOURCE_SETTLEMENT_LATEST_PAIR_PROJECTION_SOURCE,
    compatibilityMirror: {
      kind: SOURCE_SETTLEMENT_LATEST_PAIR_MIRROR_KIND,
      settlementId: compact(record?.settlementId || record?.id) || null,
      campaignId: compact(record?.campaignId) || null,
      saveId: compact(record?.saveId) || null,
      chatId: compact(record?.chatId) || null,
      previousAssistantHostMessageId: compact(record?.previousAssistantHostMessageId) || null,
      currentPlayerHostMessageId: compact(record?.currentPlayerHostMessageId) || null,
      sourceRangeHash: compact(record?.sourceRangeHash) || null,
      status: compact(record?.status) || null,
      disposition: compact(record?.disposition) || null,
      operationCount: Math.max(0, Number(record?.operationCount) || 0)
    }
  };
}
