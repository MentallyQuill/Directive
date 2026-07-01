import {
  hashStableJson
} from './architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function asString(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function uniqueStrings(items = []) {
  return [...new Set(items.map((item) => asString(item)).filter(Boolean))];
}

function textHashFor(value = {}) {
  if (value.textHash) return value.textHash;
  if (value.selectedTextHash) return value.selectedTextHash;
  const text = value.text ?? value.mes ?? value.messageText;
  if (text === undefined) return null;
  return hashStableJson({ text: String(text) });
}

function messageId(value = {}) {
  return asString(value.hostMessageId || value.id || value.mesid);
}

function roleFor(value = {}) {
  if (value.role) return String(value.role);
  if (value.is_user === true) return 'player';
  if (value.is_system === true) return 'system';
  return 'assistant';
}

function sourceRefFor(message = {}) {
  return compact({
    hostMessageId: messageId(message),
    chatId: asString(message.chatId),
    role: roleFor(message),
    ordinal: Number.isInteger(message.ordinal) ? message.ordinal : (Number.isInteger(message.index) ? message.index : null),
    textHash: textHashFor(message),
    selectedAssistantVariantHash: message.selectedAssistantVariantHash || message.selectedTextHash || null
  });
}

function selectedVariantRef(previousAssistant = {}) {
  const variant = previousAssistant.selectedAssistantVariant || previousAssistant.selectedVariant || {};
  const selectedTextHash = previousAssistant.selectedTextHash
    || variant.selectedTextHash
    || variant.textHash
    || textHashFor(variant)
    || textHashFor(previousAssistant);
  const visibleTextHash = previousAssistant.visibleTextHash
    || variant.visibleTextHash
    || textHashFor(previousAssistant);
  return compact({
    kind: 'directive.selectedAssistantVariant.v1',
    hostMessageId: messageId(previousAssistant),
    selectedVariantId: asString(previousAssistant.selectedVariantId || variant.selectedVariantId || variant.id),
    selectedSwipeIndex: Number.isInteger(previousAssistant.selectedSwipeIndex)
      ? previousAssistant.selectedSwipeIndex
      : (Number.isInteger(variant.selectedSwipeIndex) ? variant.selectedSwipeIndex : null),
    swipeCount: Number.isInteger(previousAssistant.swipeCount)
      ? previousAssistant.swipeCount
      : (Number.isInteger(variant.swipeCount) ? variant.swipeCount : null),
    selectedTextHash,
    visibleTextHash,
    sourceIntegrity: asString(previousAssistant.sourceIntegrity || variant.sourceIntegrity, 'clean'),
    directiveOwned: previousAssistant.directiveOwned === true || previousAssistant.isDirectiveOwned === true || variant.directiveOwned === true,
    responseId: asString(previousAssistant.responseId || variant.responseId),
    outcomeId: asString(previousAssistant.outcomeId || variant.outcomeId)
  });
}

function rangeFrameFor(messages = [], {
  id = null,
  campaignId = null,
  saveId = null,
  chatId = null,
  mode = 'explicitRange'
} = {}) {
  const refs = (Array.isArray(messages) ? messages : []).map(sourceRefFor).filter((item) => item.hostMessageId || item.textHash);
  const rangeHash = hashStableJson(refs.map((item) => [
    item.chatId || chatId || null,
    item.hostMessageId || null,
    item.ordinal ?? null,
    item.role || null,
    item.textHash || null
  ]));
  return {
    kind: 'directive.rangeFrame.v1',
    schemaVersion: 1,
    id: id || `range:${rangeHash.slice(0, 16)}`,
    mode,
    campaignId,
    saveId,
    chatId: chatId || refs.find((item) => item.chatId)?.chatId || null,
    start: refs[0] || null,
    end: refs.at(-1) || null,
    messageCount: refs.length,
    rangeHash,
    messageRefs: refs
  };
}

function sourceExpected(input = {}) {
  return input.expected || {};
}

function sourceIdentityReasons(input = {}) {
  const expected = sourceExpected(input);
  const frame = input.sourceFrame || input.rangeFrame || {};
  return uniqueStrings([
    expected.campaignId && frame.campaignId && expected.campaignId !== frame.campaignId ? 'wrong-campaign' : null,
    expected.saveId && frame.saveId && expected.saveId !== frame.saveId ? 'wrong-save' : null,
    expected.chatId && frame.chatId && expected.chatId !== frame.chatId ? 'wrong-chat' : null,
    frame.visibility?.sourceMutation ? 'source-mutation-owned-by-repair' : null
  ]);
}

function selectedVariantReasons(input = {}) {
  if (input.mode !== 'latestPair') return [];
  const selected = selectedVariantRef(input.previousAssistant || {});
  const expected = sourceExpected(input);
  return uniqueStrings([
    selected.directiveOwned ? 'previous-assistant-directive-owned' : null,
    selected.sourceIntegrity && selected.sourceIntegrity !== 'clean' ? selected.sourceIntegrity : null,
    expected.selectedAssistantVariantHash && selected.selectedTextHash && expected.selectedAssistantVariantHash !== selected.selectedTextHash
      ? 'selected-variant-hash-mismatch'
      : null
  ]);
}

function rangeReasons(input = {}) {
  if (input.mode !== 'explicitRange') return [];
  const rangeFrame = input.rangeFrame || rangeFrameFor(input.messages || [], {
    campaignId: input.sourceFrame?.campaignId || input.expected?.campaignId || null,
    saveId: input.sourceFrame?.saveId || input.expected?.saveId || null,
    chatId: input.sourceFrame?.chatId || input.expected?.chatId || null
  });
  const anchor = input.anchorRange || {};
  return uniqueStrings([
    !rangeFrame.messageCount ? 'empty-range' : null,
    anchor.chatId && rangeFrame.chatId && anchor.chatId !== rangeFrame.chatId ? 'wrong-chat' : null,
    anchor.rangeHash && anchor.rangeHash !== rangeFrame.rangeHash ? 'range-hash-changed' : null
  ]);
}

function hardSkipResult({ input = {}, reasons = [], observedAt = null, diagnostic = null } = {}) {
  return {
    mode: input.mode || 'latestPair',
    status: reasons.includes('source-mutation-owned-by-repair') ? 'repairRequired' : 'hardSkipped',
    hardSkipped: true,
    providerCalled: false,
    applied: false,
    reasons,
    diagnostic,
    observedAt
  };
}

function settlementOperations(providerResult = {}) {
  const operations = Array.isArray(providerResult.operations)
    ? providerResult.operations
    : (Array.isArray(providerResult.settlement?.operations) ? providerResult.settlement.operations : []);
  return operations.slice(0, 12).map((operation) => compact({
    domain: operation.domain || operation.root || null,
    op: operation.op || operation.operation || null,
    summary: operation.summary || null,
    path: operation.path || null,
    valueHash: operation.value === undefined ? operation.valueHash || null : hashStableJson(operation.value)
  })).filter((operation) => operation.domain && operation.op);
}

function settlementDiagnostic({
  input = {},
  status,
  reasons = [],
  source = {},
  operations = [],
  promptDirtyDomains = [],
  providerResult = null,
  observedAt = null
} = {}) {
  return compact({
    type: 'sourceSettlement',
    status,
    severity: status === 'accepted' ? 'info' : 'warning',
    mode: input.mode || 'latestPair',
    observedAt,
    reasons,
    settlementId: input.settlementId || null,
    source,
    operationCount: operations.length,
    operations,
    operationBundleHash: hashStableJson(operations),
    promptDirtyDomains: uniqueStrings(promptDirtyDomains),
    provider: providerResult?.provider || providerResult?.providerId || null,
    rawPrompt: providerResult?.rawPrompt,
    rawResponse: providerResult?.rawResponse
  });
}

export function createSyntheticSourceReconciliationEngine({
  coreStore,
  clock = () => new Date().toISOString(),
  runLatestPairProvider = async () => ({ operations: [] }),
  runRangeProvider = async () => ({ operations: [] }),
  validateBeforeApply = async () => ({ ok: true }),
  applySettlement = async () => ({ ok: true })
} = {}) {
  if (!coreStore?.appendDiagnostics) {
    throw new Error('createSyntheticSourceReconciliationEngine requires a CORE Store instance');
  }

  const handled = new Map();

  async function recordDiagnostic(transactionId, payload) {
    return coreStore.appendDiagnostics(transactionId, payload);
  }

  async function evaluate(input = {}) {
    const mode = input.mode || 'latestPair';
    const idempotencyKey = input.idempotencyKey || `sre:${input.transactionId}:${mode}:${input.settlementId || input.rangeFrame?.rangeHash || input.sourceFrame?.id || 'source'}`;
    if (handled.has(idempotencyKey)) return cloneJson(handled.get(idempotencyKey));
    const observedAt = input.observedAt || clock();
    const rangeFrame = input.rangeFrame || (mode === 'explicitRange'
      ? rangeFrameFor(input.messages || [], {
        id: input.rangeFrameId,
        campaignId: input.sourceFrame?.campaignId || input.expected?.campaignId || null,
        saveId: input.sourceFrame?.saveId || input.expected?.saveId || null,
        chatId: input.sourceFrame?.chatId || input.expected?.chatId || null,
        mode
      })
      : null);
    const normalizedInput = { ...input, mode, rangeFrame };
    const reasons = uniqueStrings([
      ...sourceIdentityReasons(normalizedInput),
      ...selectedVariantReasons(normalizedInput),
      ...rangeReasons(normalizedInput)
    ]);

    if (reasons.length) {
      const diagnosticPayload = settlementDiagnostic({
        input: normalizedInput,
        status: reasons.includes('source-mutation-owned-by-repair') ? 'repairRequired' : 'hardSkipped',
        reasons,
        source: compact({
          sourceFrameId: input.sourceFrame?.id || null,
          rangeFrameId: rangeFrame?.id || null,
          rangeHash: rangeFrame?.rangeHash || null,
          selectedAssistantVariant: mode === 'latestPair' ? selectedVariantRef(input.previousAssistant || {}) : null
        }),
        observedAt
      });
      const diagnostic = input.transactionId ? await recordDiagnostic(input.transactionId, diagnosticPayload) : null;
      const result = hardSkipResult({ input: normalizedInput, reasons, observedAt, diagnostic });
      handled.set(idempotencyKey, result);
      return cloneJson(result);
    }

    const source = mode === 'latestPair'
      ? {
        sourceFrameId: input.sourceFrame?.id || null,
        previousAssistant: {
          ...sourceRefFor(input.previousAssistant || {}),
          selectedAssistantVariant: selectedVariantRef(input.previousAssistant || {})
        },
        currentPlayer: sourceRefFor(input.currentPlayer || {}),
        selectedAssistantVariantHash: selectedVariantRef(input.previousAssistant || {}).selectedTextHash || null
      }
      : {
        sourceFrameId: input.sourceFrame?.id || null,
        rangeFrameId: rangeFrame?.id || null,
        rangeHash: rangeFrame?.rangeHash || null,
        messageCount: rangeFrame?.messageCount || 0,
        start: rangeFrame?.start || null,
        end: rangeFrame?.end || null
      };
    const provider = mode === 'explicitRange' ? runRangeProvider : runLatestPairProvider;
    const providerResult = await provider({
      mode,
      source: cloneJson(source),
      sourceFrame: cloneJson(input.sourceFrame || null),
      rangeFrame: cloneJson(rangeFrame),
      previousAssistant: cloneJson(input.previousAssistant || null),
      currentPlayer: cloneJson(input.currentPlayer || null),
      messages: cloneJson(input.messages || [])
    });
    const operations = settlementOperations(providerResult);
    const beforeApply = await validateBeforeApply({
      mode,
      source: cloneJson(source),
      rangeFrame: cloneJson(rangeFrame),
      providerResult: cloneJson(providerResult),
      operations: cloneJson(operations)
    });
    if (beforeApply?.ok === false) {
      const staleReasons = uniqueStrings(beforeApply.reasons || [beforeApply.reason || 'stale-before-apply']);
      const diagnosticPayload = settlementDiagnostic({
        input: normalizedInput,
        status: 'staleBeforeApply',
        reasons: staleReasons,
        source,
        operations,
        providerResult,
        observedAt
      });
      const diagnostic = await recordDiagnostic(input.transactionId, diagnosticPayload);
      const result = {
        mode,
        status: 'staleBeforeApply',
        hardSkipped: true,
        providerCalled: true,
        applied: false,
        reasons: staleReasons,
        diagnostic,
        observedAt
      };
      handled.set(idempotencyKey, result);
      return cloneJson(result);
    }

    const promptDirtyDomains = uniqueStrings([
      ...(providerResult.promptDirtyDomains || []),
      ...operations.map((operation) => operation.domain)
    ]);
    const applyResult = await applySettlement({
      mode,
      source: cloneJson(source),
      operations: cloneJson(operations),
      promptDirtyDomains,
      providerResult: cloneJson(providerResult)
    });
    if (applyResult?.ok === false) {
      const repairReasons = uniqueStrings(applyResult.reasons || [applyResult.reason || 'source-settlement-apply-failed']);
      const diagnosticPayload = settlementDiagnostic({
        input: normalizedInput,
        status: 'repairRequired',
        reasons: repairReasons,
        source,
        operations,
        promptDirtyDomains,
        providerResult,
        observedAt
      });
      const diagnostic = await recordDiagnostic(input.transactionId, diagnosticPayload);
      const result = {
        mode,
        status: 'repairRequired',
        hardSkipped: true,
        providerCalled: true,
        applied: false,
        reasons: repairReasons,
        source,
        operations,
        promptDirtyDomains,
        applyResult,
        diagnostic,
        observedAt
      };
      handled.set(idempotencyKey, result);
      return cloneJson(result);
    }
    const diagnosticPayload = settlementDiagnostic({
      input: normalizedInput,
      status: operations.length ? 'accepted' : 'noChange',
      source,
      operations,
      promptDirtyDomains,
      providerResult,
      observedAt
    });
    const diagnostic = await recordDiagnostic(input.transactionId, diagnosticPayload);
    const result = {
      mode,
      status: operations.length ? 'accepted' : 'noChange',
      hardSkipped: false,
      providerCalled: true,
      applied: operations.length > 0,
      source,
      operations,
      promptDirtyDomains,
      applyResult,
      diagnostic,
      observedAt
    };
    handled.set(idempotencyKey, result);
    return cloneJson(result);
  }

  return {
    evaluate,
    settleLatestPair(input = {}) {
      return evaluate({ ...input, mode: 'latestPair' });
    },
    reconcileRange(input = {}) {
      return evaluate({ ...input, mode: 'explicitRange' });
    },
    repairSettlement(input = {}) {
      return evaluate({ ...input, mode: 'recoveryRepair' });
    },
    composeRangeFrame: rangeFrameFor
  };
}
