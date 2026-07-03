import { hashStableJson } from './architecture-redesign-contracts.mjs';
import { buildCorrectAsSwipeLifecycleDecision } from './repair-runtime.mjs';
import { prefixCampaignReplyHeader } from '../time/campaign-time-header.mjs';

export const CORRECT_AS_SWIPE_ACTION_ID = 'correctAsSwipe.propose';
export const CORRECT_AS_SWIPE_SETTLE_ACTION_ID = 'correctAsSwipe.settleCase';
export const CORRECT_AS_SWIPE_CASE_KIND = 'directive.correctAsSwipe.case.v1';
export const CORRECT_AS_SWIPE_PROVENANCE_KIND = 'directive.correctAsSwipe.candidateSwipe.v1';

const VERDICTS = new Set(['supported', 'contradicted', 'unsupported', 'ambiguous', 'external-only']);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact(value = '', maxLength = 1000) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function compactId(value = '') {
  return compact(value, 180);
}

function exactTextHash(value = '') {
  return hashStableJson({ text: String(value ?? '').replace(/\r\n/g, '\n').trim() });
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function evidenceVerdictRef(input = {}) {
  const verdict = compact(input.verdict || input.status || 'ambiguous', 40);
  return {
    verdict: VERDICTS.has(verdict) ? verdict : 'ambiguous',
    source: compact(input.source || input.kind || 'directive.sreEvidenceVerdict.v1', 120),
    evidenceRefIds: asArray(input.evidenceRefIds || input.refs || input.citations)
      .map((entry) => compactId(isObject(entry) ? entry.id || entry.refId || entry.sourceId : entry))
      .filter(Boolean)
      .slice(0, 12),
    evidenceHash: compact(input.evidenceHash, 120) || hashStableJson({
      verdict,
      refs: input.evidenceRefIds || input.refs || input.citations || [],
      source: input.source || input.kind || null
    }),
    checkedAt: compact(input.checkedAt || input.reviewedAt, 80) || null
  };
}

function sourceSelectionRef(input = {}) {
  const selection = isObject(input.selection) ? input.selection : input;
  const selectedText = compact(selection.selectedText || selection.text || selection.preview, 320);
  return {
    chatId: compactId(selection.chatId || selection.currentChatId),
    hostMessageId: compactId(selection.hostMessageId || selection.messageId || selection.id),
    responseId: compactId(selection.responseId),
    outcomeId: compactId(selection.outcomeId),
    turnId: compactId(selection.turnId),
    selectedSwipeIndex: Number.isInteger(Number(selection.selectedSwipeIndex ?? selection.swipeIndex))
      ? Number(selection.selectedSwipeIndex ?? selection.swipeIndex)
      : null,
    selectedTextHash: compact(selection.selectedTextHash || selection.textHash, 120) || (selectedText ? exactTextHash(selectedText) : null),
    selectedTextLength: selectedText.length || null,
    selectedTextPreviewHash: selectedText ? hashStableJson({ preview: selectedText }) : null
  };
}

function responseIdForUpdate(response = {}, sourceRef = {}) {
  return compactId(sourceRef.responseId || response.id || response.responseId || response.idempotencyKey);
}

function selectedSwipeTextHash({ selectedSwipe = null, message = null } = {}) {
  const swipes = Array.isArray(selectedSwipe?.swipes)
    ? selectedSwipe.swipes
    : (Array.isArray(message?.swipes)
      ? message.swipes
      : (Array.isArray(message?.raw?.swipes) ? message.raw.swipes : []));
  const selectedSwipeIndex = Number.isInteger(Number(
    selectedSwipe?.selectedSwipeIndex
    ?? selectedSwipe?.swipeIndex
    ?? selectedSwipe?.swipe_id
    ?? message?.selectedSwipeIndex
    ?? message?.swipeIndex
    ?? message?.swipe_id
    ?? message?.raw?.swipe_id
  ))
    ? Number(
        selectedSwipe?.selectedSwipeIndex
        ?? selectedSwipe?.swipeIndex
        ?? selectedSwipe?.swipe_id
        ?? message?.selectedSwipeIndex
        ?? message?.swipeIndex
        ?? message?.swipe_id
        ?? message?.raw?.swipe_id
      )
    : null;
  const selectedText = selectedSwipe?.selectedText
    || selectedSwipe?.text
    || (selectedSwipeIndex !== null ? swipes[selectedSwipeIndex] : null)
    || null;
  return compact(
    selectedSwipe?.selectedAssistantVariantHash
    || selectedSwipe?.selectedTextHash
    || selectedSwipe?.textHash,
    160
  ) || (selectedText ? exactTextHash(selectedText) : null);
}

function findCorrectAsSwipeCase(response = {}, caseId = '') {
  const currentCorrectAsSwipe = isObject(response?.correctAsSwipe) ? response.correctAsSwipe : {};
  const cases = Array.isArray(currentCorrectAsSwipe.cases) ? currentCorrectAsSwipe.cases : [];
  return cases.find((entry) => compactId(entry?.id) === compactId(caseId)) || null;
}

function findSelectedCorrectAsSwipeCase(response = {}, {
  selectedSwipe = null,
  message = null
} = {}) {
  const selectedSwipeIndex = Number.isInteger(Number(
    selectedSwipe?.selectedSwipeIndex
    ?? selectedSwipe?.swipeIndex
    ?? selectedSwipe?.swipe_id
    ?? message?.selectedSwipeIndex
    ?? message?.swipeIndex
    ?? message?.swipe_id
    ?? message?.raw?.swipe_id
  ))
    ? Number(
        selectedSwipe?.selectedSwipeIndex
        ?? selectedSwipe?.swipeIndex
        ?? selectedSwipe?.swipe_id
        ?? message?.selectedSwipeIndex
        ?? message?.swipeIndex
        ?? message?.swipe_id
        ?? message?.raw?.swipe_id
      )
    : null;
  const selectedTextHash = selectedSwipeTextHash({ selectedSwipe, message });
  if (selectedSwipeIndex === null || !selectedTextHash) {
    return { case: null, selectedSwipeIndex, selectedTextHash, reason: 'selected-swipe-hash-missing' };
  }
  const currentCorrectAsSwipe = isObject(response?.correctAsSwipe) ? response.correctAsSwipe : {};
  const cases = Array.isArray(currentCorrectAsSwipe.cases) ? currentCorrectAsSwipe.cases : [];
  const correctionCase = cases.find((entry) => (
    compactId(entry?.status) === 'candidateAppended'
    && Number(entry?.candidateSwipe?.swipeIndex) === selectedSwipeIndex
    && compact(entry?.candidate?.textHash, 160) === selectedTextHash
  )) || null;
  return {
    case: correctionCase,
    selectedSwipeIndex,
    selectedTextHash,
    reason: correctionCase ? null : 'selected-swipe-not-correct-as-swipe-candidate'
  };
}

function correctionCaseLifecycleEntry(decision = {}) {
  return {
    kind: 'directive.correctAsSwipe.lifecycle.v1',
    action: compactId(decision.action),
    status: compactId(decision.statusAfter || decision.status),
    repairDecisionStatus: compactId(decision.status),
    reasonHash: compactId(decision.reasonHash),
    reasonLength: Number.isFinite(Number(decision.reasonLength)) ? Number(decision.reasonLength) : 0,
    recordedAt: compactId(decision.decidedAt)
  };
}

export function buildCorrectAsSwipeCase({
  campaignState = null,
  response = null,
  selection = {},
  proposedText = '',
  evidenceVerdict = {},
  idFactory = null,
  now = null
} = {}) {
  const sourceRef = sourceSelectionRef({
    ...selection,
    responseId: selection.responseId || response?.id || null,
    outcomeId: selection.outcomeId || response?.outcomeId || null,
    turnId: selection.turnId || response?.turnId || null,
    hostMessageId: selection.hostMessageId || response?.hostMessageId || null
  });
  if (!sourceRef.hostMessageId) {
    return { ok: false, reason: 'source-message-missing', summary: 'Correct-as-Swipe requires a target assistant message.' };
  }
  const candidateText = String(proposedText || '').trim();
  if (!candidateText) {
    return { ok: false, reason: 'candidate-text-missing', summary: 'Correct-as-Swipe requires candidate assistant prose.' };
  }
  const candidateTextHash = exactTextHash(candidateText);
  const verdictRef = evidenceVerdictRef(evidenceVerdict);
  const recordedAt = typeof now === 'function' ? now() : (compact(now, 80) || new Date().toISOString());
  const caseId = typeof idFactory === 'function'
    ? idFactory('correct-as-swipe-case')
    : `correct-as-swipe-case-${hashStableJson({
        campaignId: campaignState?.campaign?.id || null,
        hostMessageId: sourceRef.hostMessageId,
        candidateTextHash,
        evidenceHash: verdictRef.evidenceHash
      }).slice(0, 16)}`;
  return {
    ok: true,
    case: {
      kind: CORRECT_AS_SWIPE_CASE_KIND,
      id: caseId,
      status: 'candidatePrepared',
      campaignId: campaignState?.campaign?.id || null,
      saveId: campaignState?.campaignChatBinding?.saveId || null,
      responseId: response?.id || null,
      source: sourceRef,
      evidenceVerdict: verdictRef,
      candidate: {
        textHash: candidateTextHash,
        textLength: candidateText.length,
        providerOutputHash: compact(evidenceVerdict.providerOutputHash, 120) || null
      },
      allowedActions: ['appendCandidateSwipe', 'rejectCorrectionCase', 'expireCorrectionCase'],
      acceptanceBoundary: 'selectedSwipeChanged',
      continuityMutation: 'none-until-selected',
      createdAt: recordedAt,
      updatedAt: recordedAt
    },
    candidateText
  };
}

export async function settleCorrectAsSwipeCaseLifecycle({
  campaignState = null,
  coreTurnStore = null,
  response = null,
  caseId = null,
  action = null,
  reason = '',
  now = null,
  persist = null,
  updateResponse = null
} = {}) {
  const correctionCase = findCorrectAsSwipeCase(response, caseId);
  const decision = buildCorrectAsSwipeLifecycleDecision({
    correctionCase,
    caseId,
    action,
    reason,
    now
  });
  if (decision.status === 'blocked') {
    return {
      ok: false,
      accepted: false,
      reason: decision.blockedReason,
      repairDecision: cloneJson(decision)
    };
  }
  if (decision.status === 'alreadyApplied') {
    return {
      ok: true,
      accepted: false,
      reason: 'correction-case-lifecycle-already-applied',
      correctionCase: cloneJson(correctionCase),
      repairDecision: cloneJson(decision),
      campaignState: cloneJson(campaignState)
    };
  }
  const lifecycleEntry = correctionCaseLifecycleEntry(decision);
  const nextCase = {
    ...cloneJson(correctionCase),
    status: decision.statusAfter,
    allowedActions: [],
    repairDecision: cloneJson(decision),
    lifecycle: [
      ...(Array.isArray(correctionCase.lifecycle) ? cloneJson(correctionCase.lifecycle) : []),
      lifecycleEntry
    ],
    updatedAt: decision.decidedAt
  };
  let coreDiagnostic = null;
  const transactionId = compactId(response?.coreTransactionId || correctionCase?.coreTransactionId);
  if (transactionId && typeof coreTurnStore?.appendDiagnostics === 'function') {
    coreDiagnostic = await coreTurnStore.appendDiagnostics(transactionId, {
      type: 'correctAsSwipeCaseLifecycle',
      worker: 'repairCorrectAsSwipe',
      status: nextCase.status,
      correctionCaseRef: {
        id: nextCase.id,
        status: nextCase.status,
        responseId: nextCase.responseId || null,
        hostMessageId: nextCase.source?.hostMessageId || null,
        candidateTextHash: nextCase.candidate?.textHash || null,
        evidenceHash: nextCase.evidenceVerdict?.evidenceHash || null
      },
      repairDecision: decision
    });
  }
  if (coreDiagnostic) {
    nextCase.coreLifecycleDiagnostic = {
      id: coreDiagnostic.id || null,
      status: coreDiagnostic.status || null,
      worker: coreDiagnostic.payload?.worker || coreDiagnostic.worker || 'repairCorrectAsSwipe'
    };
  }
  const responseUpdateId = responseIdForUpdate(response, nextCase.source);
  const nextState = typeof updateResponse === 'function' && responseUpdateId
    ? updateResponse(campaignState, responseUpdateId, nextCase)
    : campaignState;
  if (typeof persist === 'function' && nextState) {
    await persist(nextState, `Correct-as-Swipe case ${nextCase.status}.`);
  }
  return {
    ok: true,
    accepted: false,
    reason: 'correction-case-lifecycle-updated',
    correctionCase: cloneJson(nextCase),
    repairDecision: cloneJson(decision),
    coreDiagnostic: cloneJson(coreDiagnostic || null),
    campaignState: cloneJson(nextState || campaignState)
  };
}

export async function acceptCorrectAsSwipeSelection({
  campaignState = null,
  response = null,
  selectedSwipe = null,
  message = null,
  now = null,
  persist = null,
  updateResponse = null
} = {}) {
  const match = findSelectedCorrectAsSwipeCase(response, { selectedSwipe, message });
  if (!match.case) {
    return {
      ok: true,
      matched: false,
      reason: match.reason,
      selectedSwipeIndex: match.selectedSwipeIndex,
      selectedTextHash: match.selectedTextHash || null,
      campaignState: cloneJson(campaignState)
    };
  }
  const acceptedAt = typeof now === 'function' ? now() : (compact(now, 80) || new Date().toISOString());
  const acceptedSelection = {
    kind: 'directive.correctAsSwipe.acceptedSelection.v1',
    selectedSwipeIndex: match.selectedSwipeIndex,
    selectedTextHash: match.selectedTextHash,
    acceptedAt
  };
  const nextCase = {
    ...cloneJson(match.case),
    status: 'accepted',
    allowedActions: [],
    candidateSwipe: {
      ...(match.case.candidateSwipe || {}),
      selected: true,
      selectedAt: acceptedAt
    },
    acceptedSelection,
    updatedAt: acceptedAt
  };
  const responseUpdateId = responseIdForUpdate(response, nextCase.source);
  const nextState = typeof updateResponse === 'function' && responseUpdateId
    ? updateResponse(campaignState, responseUpdateId, nextCase)
    : campaignState;
  if (typeof persist === 'function' && nextState) {
    await persist(nextState, 'Correct-as-Swipe candidate selected.');
  }
  return {
    ok: true,
    matched: true,
    accepted: true,
    action: 'correctAsSwipeCandidateAccepted',
    correctionCase: cloneJson(nextCase),
    selectedSwipeIndex: match.selectedSwipeIndex,
    selectedTextHash: match.selectedTextHash,
    campaignState: cloneJson(nextState || campaignState)
  };
}

export async function proposeCorrectAsSwipe({
  campaignState = null,
  host = null,
  coreTurnStore = null,
  response = null,
  selection = {},
  proposedText = '',
  evidenceVerdict = {},
  idFactory = null,
  now = null,
  persist = null,
  updateResponse = null
} = {}) {
  if (typeof host?.chat?.appendAssistantMessageSwipe !== 'function') {
    return { ok: false, reason: 'assistant-swipes-unavailable', summary: 'This host cannot append assistant swipes.' };
  }
  const built = buildCorrectAsSwipeCase({
    campaignState,
    response,
    selection,
    proposedText,
    evidenceVerdict,
    idFactory,
    now
  });
  if (!built.ok) return built;
  const correctionCase = built.case;
  const responseUpdateId = responseIdForUpdate(response, correctionCase.source);
  const swipe = await host.chat.appendAssistantMessageSwipe({
    hostMessageId: correctionCase.source.hostMessageId,
    text: prefixCampaignReplyHeader(built.candidateText, campaignState || {}),
    campaignId: campaignState?.campaign?.id || null,
    responseKind: response?.responseKind || 'narration',
    select: false,
    allowUnownedAssistant: response?.kind === 'hostContinue'
      || response?.responseKind === 'hostContinue'
      || response?.responseKind === 'hostGeneration'
      || response?.strategy === 'injectAndContinue'
      || /:host$/.test(String(response?.id || response?.responseId || '')),
    extra: {
      runtimeMetadata: {
        correctAsSwipe: {
          caseId: correctionCase.id,
          candidateTextHash: correctionCase.candidate.textHash,
          evidenceHash: correctionCase.evidenceVerdict.evidenceHash
        }
      },
      directive: {
        correctAsSwipeCaseId: correctionCase.id,
        correctAsSwipeCandidateHash: correctionCase.candidate.textHash,
        correctAsSwipeEvidenceHash: correctionCase.evidenceVerdict.evidenceHash
      }
    }
  });
  const candidateSwipe = {
    kind: CORRECT_AS_SWIPE_PROVENANCE_KIND,
    caseId: correctionCase.id,
    hostMessageId: swipe.hostMessageId || correctionCase.source.hostMessageId,
    swipeIndex: Number.isInteger(swipe.swipeIndex) ? swipe.swipeIndex : null,
    swipeCount: Number.isInteger(swipe.swipeCount) ? swipe.swipeCount : null,
    duplicate: swipe.duplicate === true,
    selected: swipe.selected === true,
    textHash: correctionCase.candidate.textHash,
    textLength: correctionCase.candidate.textLength,
    evidenceHash: correctionCase.evidenceVerdict.evidenceHash,
    appendedAt: correctionCase.updatedAt
  };
  let coreDiagnostic = null;
  const transactionId = compactId(response?.coreTransactionId || selection.coreTransactionId);
  if (transactionId && typeof coreTurnStore?.appendDiagnostics === 'function') {
    coreDiagnostic = await coreTurnStore.appendDiagnostics(transactionId, {
      type: 'correctAsSwipeCandidatePrepared',
      worker: 'correctAsSwipe',
      status: 'candidatePrepared',
      correctionCase,
      candidateSwipe
    });
  }
  const nextCase = {
    ...correctionCase,
    status: 'candidateAppended',
    candidateSwipe,
    coreDiagnostic: coreDiagnostic ? {
      id: coreDiagnostic.id || null,
      status: coreDiagnostic.status || null,
      worker: coreDiagnostic.payload?.worker || coreDiagnostic.worker || 'correctAsSwipe'
    } : null
  };
  const nextState = typeof updateResponse === 'function' && responseUpdateId
    ? updateResponse(campaignState, responseUpdateId, nextCase)
    : campaignState;
  if (typeof persist === 'function' && nextState) {
    await persist(nextState, 'Correct-as-Swipe candidate appended.');
  }
  return {
    ok: true,
    accepted: false,
    reason: 'candidate-swipe-appended',
    correctionCase: cloneJson(nextCase),
    candidateSwipe: cloneJson(candidateSwipe),
    swipe: cloneJson(swipe),
    coreDiagnostic: cloneJson(coreDiagnostic || null),
    campaignState: cloneJson(nextState || campaignState)
  };
}
