import {
  normalizeThreadRecord,
  threadSemanticFingerprint,
  THREAD_TYPES
} from '../threads/thread-ledger.mjs';
import { LATEST_PAIR_SOURCE_SETTLEMENT_PROVIDER_KIND } from './source-settlement-latest-pair-provider.mjs';

const ACCEPTED_RELATIONS = new Set(['acknowledges', 'continues', 'acts-on', 'asks-followup']);
const REJECTING_RELATIONS = new Set(['rejects', 'corrects']);
const DISPOSITIONS = new Set(['autoCommit', 'internalReview', 'defer', 'operatorRecovery']);
const MAX_LIST_ITEMS = 12;
const MAX_ASSIGNMENT_PROPOSALS = 5;
const MAX_COMMAND_LOG_PROPOSALS = 3;
const MAX_SHIP_READINESS_PROPOSALS = 5;
const MAX_THREAD_SIGNALS = 6;
const MAX_ASSIGNMENT_SUMMARY_LENGTH = 220;
const PLAYER_CURRENT_ORDER_SCOPE = 'playerCurrentOrder';
const LOW_RISK_SHIP_KINDS = new Set(['technicalDebt', 'readinessNote', 'systemNote']);
const OPEN_THREAD_STATUSES = new Set(['available', 'engaged', 'active']);
const CLOSED_THREAD_STATUSES = new Set(['resolved', 'transformed', 'dormant', 'expired', 'echo']);

function compact(value, maxLength = 1000) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function compactList(values = [], maxItems = MAX_LIST_ITEMS, maxLength = 220) {
  return (Array.isArray(values) ? values : [])
    .map((value) => compact(typeof value === 'string' ? value : (
      value?.summary || value?.label || value?.title || value?.name || value?.id || ''
    ), maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanList(values = [], maxItems = MAX_LIST_ITEMS) {
  return (Array.isArray(values) ? values : [])
    .map((value) => compact(typeof value === 'string' ? value : (
      value?.summary || value?.label || value?.title || value?.name || value?.id || ''
    ), Number.POSITIVE_INFINITY))
    .filter(Boolean)
    .slice(0, maxItems);
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => item !== undefined && item !== null) : [];
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function settlementHash(text = '') {
  let hash = 0x811c9dc5;
  for (const char of String(text || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function slug(value = '', fallback = 'item') {
  const text = compact(value, 120).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return text || fallback;
}

function normalizeRelation(value) {
  const text = compact(value).toLowerCase();
  if (text === 'acts on' || text === 'actson') return 'acts-on';
  if (ACCEPTED_RELATIONS.has(text) || REJECTING_RELATIONS.has(text) || ['ambiguous', 'unrelated'].includes(text)) return text;
  return 'ambiguous';
}

function normalizeDisposition(value, fallback = 'defer') {
  const text = compact(value) || fallback;
  return DISPOSITIONS.has(text) ? text : fallback;
}

function normalizeSettlement(raw = {}) {
  const playerReplyRelation = normalizeRelation(raw.playerReplyRelation);
  const acceptedPreviousResponse = raw.acceptedPreviousResponse === true
    && ACCEPTED_RELATIONS.has(playerReplyRelation)
    && !REJECTING_RELATIONS.has(playerReplyRelation);
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence ?? (acceptedPreviousResponse ? 0.7 : 0.4)) || 0));
  const disposition = normalizeDisposition(raw.disposition, acceptedPreviousResponse ? 'autoCommit' : 'defer');
  return {
    kind: raw.kind || LATEST_PAIR_SOURCE_SETTLEMENT_PROVIDER_KIND,
    acceptedPreviousResponse,
    playerReplyRelation,
    confidence,
    disposition,
    needsInternalReview: raw.needsInternalReview === true || disposition === 'internalReview',
    internalReviewReasons: compactList(raw.internalReviewReasons || raw.reviewReasons || [], 8, 240),
    deferReason: compact(raw.deferReason || '', 240) || null,
    operatorRecoveryOnly: raw.operatorRecoveryOnly === true || disposition === 'operatorRecovery',
    openAssignmentProposals: asArray(raw.openAssignmentProposals).slice(0, MAX_ASSIGNMENT_PROPOSALS),
    commandLogProposals: asArray(raw.commandLogProposals).slice(0, MAX_COMMAND_LOG_PROPOSALS),
    shipReadinessProposals: asArray(raw.shipReadinessProposals).slice(0, MAX_SHIP_READINESS_PROPOSALS),
    threadSignals: asArray(raw.threadSignals).slice(0, MAX_THREAD_SIGNALS)
  };
}

function normalizedText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function taskCueText(snapshot = {}) {
  return normalizedText(snapshot.source?.previousAssistant?.text || '');
}

function playerActorIds(snapshot = {}) {
  const player = snapshot.referenceResolver?.player || {};
  return new Set([
    player.id,
    player.name,
    'player-commander'
  ].map((value) => compact(value, 180).toLowerCase()).filter(Boolean));
}

function actorValueMatchesPlayer(value = '', snapshot = {}) {
  const actor = compact(value, 180).toLowerCase();
  return Boolean(actor && playerActorIds(snapshot).has(actor));
}

function sourceLooksLikePlayerIssuedOrders(snapshot = {}) {
  const text = taskCueText(snapshot);
  if (!text) return false;
  if (/\b(whitaker|captain|starfleet command|admiral)\b/i.test(text)) return false;
  if (/\b(?:aye|understood|yes|copy),?\s+(?:sir|commander)\b/i.test(text)) return true;
  if (/\b(?:draft by|completed within|i'll|i will|we'll|report exceptions|diagnostic|audit|inspection)\b/i.test(text)
    && /\b(?:sir|commander)\b/i.test(text)) {
    return true;
  }
  return false;
}

function sourceHasPlayerAssignmentAuthority(snapshot = {}) {
  const text = taskCueText(snapshot);
  if (!text || sourceLooksLikePlayerIssuedOrders(snapshot)) return false;
  return /\b(whitaker|captain|starfleet command|admiral)\b/i.test(text)
    && /\b(i want|i need|you need|your assignment|your orders|your assessment|use it|walk the ship|meet your|if they ask|get down to|report back|provide|prepare)\b/i.test(text);
}

function cleanTaskSegment(value = '') {
  return normalizedText(value)
    .replace(/^[\s"'`]+|[\s"'`.]+$/g, '')
    .replace(/^[,:;.\-\u2013\u2014]+/, '')
    .trim();
}

function splitTaskSentences(value = '') {
  return cleanTaskSegment(value)
    .split(/(?:[.!?]\s+|;\s+)/)
    .map(cleanTaskSegment)
    .filter(Boolean);
}

function directSpeechSegments(text = '') {
  const quoted = [...String(text || '').matchAll(/"([^"]{2,1400})"/g)]
    .map((match) => cleanTaskSegment(match[1]))
    .filter(Boolean);
  if (quoted.length) return quoted;
  return String(text || '')
    .split(/\n{2,}|\r?\n/)
    .map(cleanTaskSegment)
    .filter(Boolean);
}

function splitOrdinalSegments(paragraph = '') {
  const text = cleanTaskSegment(paragraph);
  const ordinal = /(?:^|[\s"'(])((?:first|second|third|fourth|fifth)\s*[,;:.\-\u2013\u2014]+|[1-5][.)]\s*)/gi;
  const matches = [...text.matchAll(ordinal)];
  if (!matches.length) return [];
  return matches.map((match, index) => cleanTaskSegment(
    text.slice(match.index + match[0].length, matches[index + 1]?.index ?? text.length)
  )).filter(Boolean);
}

function playerOrderCue(segment = '') {
  const text = cleanTaskSegment(segment);
  if (!text) return false;
  if (text.length < 12 && !/\b(walk|meet|report)\b/i.test(text)) return false;
  return /\b(i want|i need|you need|your assignment|your orders|your priority|your assessment|get down to|walk the ship|meet your|meet bronn|talk to|find out|check with|follow up|look into|take point|give me|bring me|prepare|provide|report back|if they ask|tell them)\b/i.test(text);
}

function explicitTaskSegments(snapshot = {}) {
  const text = taskCueText(snapshot);
  if (!text) return [];
  if (sourceLooksLikePlayerIssuedOrders(snapshot)) return [];
  const paragraphs = directSpeechSegments(text);
  const ordinalSegments = [];
  for (const paragraph of paragraphs) {
    ordinalSegments.push(...splitOrdinalSegments(paragraph));
  }
  if (ordinalSegments.length) {
    return ordinalSegments
      .filter(playerOrderCue)
      .slice(0, MAX_ASSIGNMENT_PROPOSALS);
  }

  return paragraphs
    .flatMap(splitTaskSentences)
    .filter(playerOrderCue)
    .slice(0, MAX_ASSIGNMENT_PROPOSALS);
}

function resolverCrewId(snapshot = {}, pattern) {
  const records = asArray(snapshot.referenceResolver?.crew);
  const match = records.find((entry) => pattern.test(`${entry?.id || ''} ${entry?.displayName || ''} ${entry?.billet || ''}`));
  return match?.id || null;
}

function fallbackCrewIdsForSegment(segment = '', snapshot = {}) {
  const checks = [
    [/whitaker/i, 'mara-whitaker'],
    [/\bbronn\b/i, 'hadrik-bronn'],
    [/\bcross\b/i, 'imani-cross'],
    [/\bsato\b/i, 'miriam-sato'],
    [/\bsaye\b/i, 'rowan-saye']
  ];
  const ids = [];
  for (const [pattern, fallbackId] of checks) {
    if (!pattern.test(segment)) continue;
    ids.push(resolverCrewId(snapshot, pattern) || fallbackId);
  }
  return [...new Set(ids)].slice(0, 8);
}

function assignedByActorId(snapshot = {}) {
  const text = taskCueText(snapshot);
  if (!/\b(whitaker|captain)\b/i.test(text)) return null;
  return resolverCrewId(snapshot, /whitaker|captain/i) || 'mara-whitaker';
}

function dueWindowForSegment(segment = '', snapshot = {}) {
  const source = `${taskCueText(snapshot)} ${segment}`;
  if (/\btoday\b/i.test(segment) && /\balpha shift\b/i.test(segment)) return 'Today during alpha shift.';
  if (/\bsenior[-\s]?staff\b/i.test(source) || /\bbriefing\b/i.test(segment)) return 'Before the senior-staff briefing.';
  if (/\bneed-to-know\b/i.test(segment)) return 'Until Captain Whitaker briefs the senior staff.';
  if (/\btwelve hours?\b/i.test(source)) return 'Within the current twelve-hour command window.';
  if (/\bbefore\b.+\bReach\b/i.test(source) || /\bten days out\b/i.test(source)) return 'Before arrival at the Reach.';
  if (/\balpha shift\b/i.test(segment)) return 'During alpha shift.';
  return null;
}

function assignmentTitleForSegment(segment = '') {
  if (/\bassessment\b/i.test(segment) && /\b(senior staff|desk|tools|readiness)\b/i.test(segment)) {
    return 'Prepare XO readiness assessment';
  }
  if (/\bneed-to-know\b/i.test(segment)) return 'Keep mission details need-to-know';
  if (/\bcommand-network\b/i.test(segment) || (/\bcross\b/i.test(segment) && /\bhandoff\b/i.test(segment))) {
    return 'Review the command-network handoff';
  }
  if (/\bmeet\b.+\bbronn\b/i.test(segment) || /\bbronn\b/i.test(segment)) {
    return /\balpha shift\b/i.test(segment) ? 'Meet Bronn on alpha shift' : 'Meet Bronn';
  }
  if (/\bwalk the ship\b/i.test(segment) || /\bdepartment heads?\b/i.test(segment)) return 'Walk the ship';
  if (/\bengineering\b/i.test(segment)) return 'Follow up in Engineering';
  if (/\bmedical\b/i.test(segment)) return 'Follow up with Medical';
  if (/\bscience\b/i.test(segment)) return 'Follow up with Science';
  const firstSentence = cleanTaskSegment(segment.split(/[.!?]/)[0] || segment);
  return compact(firstSentence, 90) || 'Follow up on accepted order';
}

function assignmentSummaryForSegment(segment = '', title = '') {
  if (/Prepare XO readiness assessment/i.test(title)) {
    return 'Assess actual post-refit ship readiness before the senior-staff briefing.';
  }
  if (/Keep mission details need-to-know/i.test(title)) {
    return 'Tell crew the Reach mission remains need-to-know until Captain Whitaker briefs them.';
  }
  if (/Review the command-network handoff/i.test(title)) {
    return 'Meet Commander Cross in Engineering and review the command-network handoff risk.';
  }
  if (/Meet Bronn/i.test(title)) {
    return 'Introduce yourself to Bronn professionally while he is on duty.';
  }
  if (/Walk the ship/i.test(title)) {
    return 'Meet department heads and identify post-refit issues before arrival.';
  }
  return compact(cleanTaskSegment(segment), MAX_ASSIGNMENT_SUMMARY_LENGTH);
}

function linkedShipSystemIdsForSegment(segment = '', campaignState = {}) {
  const existing = asArray(campaignState.ship?.technicalDebt);
  const ids = [];
  if (/\bcommand-network\b/i.test(segment)) {
    const match = existing.find((entry) => /\bcommand-network\b/i.test(`${entry?.id || ''} ${entry?.label || ''} ${entry?.playerSafeSummary || ''}`));
    ids.push(match?.id || 'ship.command-network-certificate-compatibility');
  }
  if (/\bsensor\b/i.test(segment)) ids.push('ship.sensor-array-calibration');
  if (/\bpower feeds?\b|\bsurgical bay\b/i.test(segment)) ids.push('ship.medical-power-feed-mismatch');
  return [...new Set(ids)].slice(0, 5);
}

function shipReadinessFromSegment(segment = '', snapshot = {}, campaignState = {}) {
  if (!/\b(command-network|handoff issue|operational risk|power feeds?|sensor array|calibration|refit broke|yard did not catch|not quite right)\b/i.test(segment)) {
    return null;
  }
  const existingDebt = asArray(campaignState.ship?.technicalDebt);
  if (/\bcommand-network\b/i.test(segment)) {
    const match = existingDebt.find((entry) => /\bcommand-network\b/i.test(`${entry?.id || ''} ${entry?.label || ''} ${entry?.playerSafeSummary || ''}`));
    return {
      id: match?.id || 'ship.command-network-certificate-compatibility',
      kind: 'technicalDebt',
      label: match?.label || 'Command-network handoff issue',
      detail: segment,
      owner: /\bcross\b/i.test(segment) ? 'Commander Cross' : null,
      status: 'under-review'
    };
  }
  if (/\bsensor array|calibration\b/i.test(segment)) {
    return {
      kind: 'technicalDebt',
      label: 'Sensor array calibration concern',
      detail: segment,
      owner: /\bsaye\b/i.test(segment) ? 'Saye in Science' : null,
      status: 'under-review'
    };
  }
  if (/\bpower feeds?|surgical bay|Medical\b/i.test(segment)) {
    return {
      kind: 'technicalDebt',
      label: 'Medical bay power-feed mismatch',
      detail: segment,
      owner: /\bsato\b/i.test(segment) ? 'Sato in Medical' : null,
      status: 'under-review'
    };
  }
  return {
    kind: 'technicalDebt',
    label: assignmentTitleForSegment(segment),
    detail: segment,
    status: 'under-review'
  };
}

function sourceShipReadinessSegments(snapshot = {}) {
  const text = taskCueText(snapshot);
  if (!text) return [];
  const segments = [];
  if (/\bcommand-network\b|\bhandoff issue\b|\boperational risk\b/i.test(text)) {
    segments.push('Commander Cross has a command-network handoff issue that may hide an operational risk.');
  }
  if (/\bsato\b|\bsurgical bay\b|\bpower feeds?\b/i.test(text)) {
    segments.push('Sato in Medical had surgical bay power-feed refit problems that may still need review.');
  }
  if (/\bsaye\b|\bsensor array\b|\bcalibration\b/i.test(text)) {
    segments.push('Saye in Science has been quiet about sensor array calibration after the refit.');
  }
  return segments.slice(0, MAX_SHIP_READINESS_PROPOSALS);
}

function proposalKey(value = {}) {
  return slug(value.id || value.title || value.label || value.summary || value.detail || JSON.stringify(value));
}

function mergeProposals(primary = [], fallback = [], limit = MAX_LIST_ITEMS) {
  const merged = [];
  const seen = new Set();
  for (const item of [...asArray(primary), ...asArray(fallback)]) {
    const key = proposalKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}

function deterministicAcceptedProposals({ settlement, snapshot, campaignState } = {}) {
  if (!settlement?.acceptedPreviousResponse || settlement.disposition !== 'autoCommit') {
    return {
      explicitTaskCount: 0,
      openAssignmentProposals: [],
      commandLogProposals: [],
      shipReadinessProposals: [],
      threadSignals: []
    };
  }
  const sourceSegments = explicitTaskSegments(snapshot);
  const assignmentSegments = asArray(settlement.openAssignmentProposals)
    .map((proposal) => compact(`${proposal?.title || ''}. ${proposal?.summary || ''}`, 1000))
    .filter(Boolean);
  const segments = sourceSegments.length ? sourceSegments : assignmentSegments;
  const readinessSegments = sourceShipReadinessSegments(snapshot);
  if (!segments.length && !readinessSegments.length) {
    return {
      explicitTaskCount: 0,
      openAssignmentProposals: [],
      commandLogProposals: [],
      shipReadinessProposals: [],
      threadSignals: []
    };
  }

  const assigner = assignedByActorId(snapshot);
  const playerId = snapshot.referenceResolver?.player?.id || 'player-commander';
  const openAssignmentProposals = sourceSegments.length ? segments.map((segment) => {
    const title = assignmentTitleForSegment(segment);
    return {
      title,
      summary: assignmentSummaryForSegment(segment, title),
      assignmentScope: PLAYER_CURRENT_ORDER_SCOPE,
      assignedByActorId: assigner,
      assignedActorIds: [playerId],
      linkedCrewIds: fallbackCrewIdsForSegment(segment, snapshot),
      linkedShipSystemIds: linkedShipSystemIdsForSegment(segment, campaignState),
      dueWindow: dueWindowForSegment(segment, snapshot)
    };
  }) : [];
  const assignmentBasis = sourceSegments.length
    ? openAssignmentProposals
    : asArray(settlement.openAssignmentProposals).map((proposal, index) => {
      const segment = segments[index] || `${proposal?.title || ''}. ${proposal?.summary || ''}`;
      return {
        title: proposal?.title || assignmentTitleForSegment(segment),
        summary: proposal?.summary || assignmentSummaryForSegment(segment, proposal?.title || assignmentTitleForSegment(segment)),
        assignmentScope: proposal?.assignmentScope || PLAYER_CURRENT_ORDER_SCOPE,
        assignedByActorId: proposal?.assignedByActorId || assigner,
        assignedActorIds: asArray(proposal?.assignedActorIds || proposal?.assignees).length
          ? asArray(proposal.assignedActorIds || proposal.assignees)
          : [playerId],
        linkedCrewIds: asArray(proposal?.linkedCrewIds).length
          ? asArray(proposal.linkedCrewIds)
          : fallbackCrewIdsForSegment(segment, snapshot),
        linkedShipSystemIds: asArray(proposal?.linkedShipSystemIds).length
          ? asArray(proposal.linkedShipSystemIds)
          : linkedShipSystemIdsForSegment(segment, campaignState),
        dueWindow: proposal?.dueWindow || dueWindowForSegment(segment, snapshot)
      };
    });
  const shipReadinessProposals = mergeProposals(
    segments
      .map((segment) => shipReadinessFromSegment(segment, snapshot, campaignState))
      .filter(Boolean),
    readinessSegments
      .map((segment) => shipReadinessFromSegment(segment, snapshot, campaignState))
      .filter(Boolean),
    MAX_SHIP_READINESS_PROPOSALS
  );
  const threadSignals = assignmentBasis.map((assignment) => ({
    title: assignment.title,
    summary: assignment.summary,
    type: assignment.linkedShipSystemIds?.length ? 'shipboard_maintenance' : 'professional_dilemma',
    linkedCrewIds: assignment.linkedCrewIds,
    directCommitment: true
  }));
  const sourceActor = assigner === 'mara-whitaker' ? 'Whitaker' : 'The previous assistant response';
  const commandLogProposals = [{
    summaryInputs: [
      `${sourceActor} gave ${snapshot.referenceResolver?.player?.name || 'the player'} accepted current orders: ${assignmentBasis.map((entry) => entry.title).join('; ')}.`
    ],
    visibleConsequences: [
      `${snapshot.referenceResolver?.player?.name || 'The player'} accepted the assignments in the next reply.`
    ]
  }];
  return {
    explicitTaskCount: Math.max(sourceSegments.length, assignmentBasis.length),
    openAssignmentProposals,
    commandLogProposals,
    shipReadinessProposals,
    threadSignals
  };
}

function shipReadinessProposalLooksValid(raw = {}) {
  const kind = compact(raw.kind || raw.type || 'technicalDebt', 80);
  if (!LOW_RISK_SHIP_KINDS.has(kind)) return false;
  const label = compact(raw.label || raw.title || raw.summary, 180);
  const detail = compact(raw.detail || raw.summary || raw.description || label, 500);
  return Boolean(label && detail);
}

function menuOfframpText(value = '') {
  const text = compact(value, 500);
  if (!text) return false;
  const lower = text.toLowerCase();
  if (/^or\b/.test(lower)) return true;
  if (/\bor something else entirely\b/.test(lower)) return true;
  if (/\bor straight to\b/.test(lower)) return true;
  if (/\bstraight to\b[\s\S]{0,80}\bor\b/.test(lower)) return true;
  if (/\b(?:could|can|may)\s+(?:go|head|continue|proceed|choose|take|start)\b[\s\S]{0,120}\bor\b/.test(lower)) return true;
  if (/\b(?:either|whether)\b[\s\S]{0,120}\bor\b/.test(lower)) return true;
  if (/\b(?:if you prefer|alternatively|otherwise)\b[\s\S]{0,120}\b(?:go|head|continue|proceed|choose|take|start)\b/.test(lower)) return true;
  return false;
}

function proposalLooksLikeMenuOfframp(...values) {
  return values.map((value) => compact(value, 500)).filter(Boolean).some(menuOfframpText);
}

function threadSignalLooksValid(raw = {}) {
  const title = compact(raw.title || raw.label || raw.summary, 180);
  const summary = compact(raw.summary || raw.observableSeed || raw.detail || title, 500);
  return Boolean(title && summary && !proposalLooksLikeMenuOfframp(title, summary));
}

function knownCrewIdsForSnapshot(snapshot = {}, fallbackIds = []) {
  return new Set([
    ...asArray(snapshot.referenceResolver?.crew).map((entry) => compact(entry?.id, 160)).filter(Boolean),
    ...asArray(fallbackIds).map((entry) => compact(entry, 160)).filter(Boolean),
    'mara-whitaker',
    'hadrik-bronn',
    'imani-cross',
    'miriam-sato',
    'rowan-saye',
    'priya-nayar',
    'kieran-vale'
  ]);
}

function canonicalLinkedCrewIds(proposalIds = [], fallbackIds = [], snapshot = {}) {
  const known = knownCrewIdsForSnapshot(snapshot, fallbackIds);
  const result = [];
  for (const id of asArray(fallbackIds)) {
    const clean = compact(id, 160);
    if (clean && !result.includes(clean)) result.push(clean);
  }
  for (const id of asArray(proposalIds)) {
    const clean = compact(id, 160);
    if (!clean || result.includes(clean)) continue;
    if (known.has(clean)) result.push(clean);
  }
  return result.slice(0, 8);
}

function enrichAssignmentProposalWithFallback(proposal = {}, fallback = {}, snapshot = {}) {
  if (!fallback || !Object.keys(fallback).length) return proposal;
  const fallbackCrewIds = asArray(fallback.linkedCrewIds);
  const proposalCrewIds = asArray(proposal.linkedCrewIds);
  return {
    ...fallback,
    ...proposal,
    assignmentScope: proposal.assignmentScope || fallback.assignmentScope || PLAYER_CURRENT_ORDER_SCOPE,
    assignedByActorId: proposal.assignedByActorId || proposal.assignedBy || fallback.assignedByActorId || null,
    assignedActorIds: asArray(proposal.assignedActorIds || proposal.assignees).length
      ? asArray(proposal.assignedActorIds || proposal.assignees)
      : asArray(fallback.assignedActorIds),
    linkedCrewIds: canonicalLinkedCrewIds(proposalCrewIds, fallbackCrewIds, snapshot),
    linkedShipSystemIds: asArray(proposal.linkedShipSystemIds || proposal.linkedSystemIds).length
      ? (proposal.linkedShipSystemIds || proposal.linkedSystemIds)
      : asArray(fallback.linkedShipSystemIds),
    dueWindow: proposal.dueWindow || proposal.deadline || proposal.timeWindow || fallback.dueWindow || null
  };
}

function enrichSettlementWithDeterministicProposals(settlement, {
  snapshot,
  campaignState
} = {}) {
  const deterministic = deterministicAcceptedProposals({ settlement, snapshot, campaignState });
  if (!deterministic.explicitTaskCount) {
    return { settlement, explicitTaskCount: 0 };
  }
  const validShipReadinessCount = settlement.shipReadinessProposals.filter(shipReadinessProposalLooksValid).length;
  const validThreadSignalCount = settlement.threadSignals.filter(threadSignalLooksValid).length;
  const openAssignmentProposals = settlement.openAssignmentProposals.length >= deterministic.explicitTaskCount
    ? settlement.openAssignmentProposals
      .slice(0, MAX_ASSIGNMENT_PROPOSALS)
      .map((proposal, index) => enrichAssignmentProposalWithFallback(
        proposal,
        deterministic.openAssignmentProposals[index],
        snapshot
      ))
    : mergeProposals(settlement.openAssignmentProposals, deterministic.openAssignmentProposals, MAX_ASSIGNMENT_PROPOSALS);
  return {
    settlement: {
      ...settlement,
      openAssignmentProposals,
      commandLogProposals: settlement.commandLogProposals.length
        ? settlement.commandLogProposals
        : deterministic.commandLogProposals.slice(0, MAX_COMMAND_LOG_PROPOSALS),
      shipReadinessProposals: validShipReadinessCount >= deterministic.shipReadinessProposals.length
        ? settlement.shipReadinessProposals
        : mergeProposals(
          settlement.shipReadinessProposals,
          deterministic.shipReadinessProposals,
          MAX_SHIP_READINESS_PROPOSALS
        ),
      threadSignals: validThreadSignalCount >= deterministic.threadSignals.length
        ? settlement.threadSignals
        : mergeProposals(
          settlement.threadSignals,
          deterministic.threadSignals,
          MAX_THREAD_SIGNALS
        )
    },
    explicitTaskCount: deterministic.explicitTaskCount
  };
}

function sourceBundle(context) {
  const snapshot = context.snapshot;
  return {
    settlementId: context.settlementId,
    previousAssistantHostMessageId: snapshot.source.previousAssistant.hostMessageId,
    currentPlayerHostMessageId: snapshot.source.currentPlayer.hostMessageId,
    sourceMessageIds: [
      snapshot.source.previousAssistant.hostMessageId,
      snapshot.source.currentPlayer.hostMessageId
    ].filter(Boolean),
    sourceTextHashes: {
      previousAssistant: snapshot.source.previousAssistant.textHash,
      currentPlayer: snapshot.source.currentPlayer.textHash,
      range: snapshot.source.sourceRangeHash
    },
    sourceAnchorRange: {
      kind: 'sceneHandshakePair',
      previousAssistantHostMessageId: snapshot.source.previousAssistant.hostMessageId,
      currentPlayerHostMessageId: snapshot.source.currentPlayer.hostMessageId,
      rangeHash: snapshot.source.sourceRangeHash
    },
    createdAt: context.recordedAt
  };
}

function assignmentFingerprint(input = {}) {
  return settlementHash([
    input.title,
    input.summary,
    input.dueWindow,
    ...(input.linkedCrewIds || []),
    ...(input.linkedShipSystemIds || [])
  ].join('\n'));
}

function uniqueStrings(values = []) {
  return [...new Set(asArray(values).map((item) => compact(item, 180)).filter(Boolean))];
}

function proposalTargetIds(raw = {}) {
  const values = [];
  for (const key of ['assignedActorIds', 'assignedToActorIds', 'assignedToIds', 'assignees', 'assignedTo']) {
    const value = raw[key];
    if (Array.isArray(value)) values.push(...value);
    else if (value !== undefined && value !== null) values.push(value);
  }
  return uniqueStrings([
    ...values
  ]);
}

function assignmentProposalTargetsPlayer(raw = {}, context = {}) {
  const snapshot = context.snapshot || {};
  if (sourceLooksLikePlayerIssuedOrders(snapshot)) return false;
  const scope = compact(raw.assignmentScope || raw.scope || '', 120);
  if (actorValueMatchesPlayer(raw.assignedByActorId || raw.assignedBy || '', snapshot)) return false;
  if (/\b(delegated|crew|subordinate|department)\b/i.test(scope)) return false;
  if (scope === PLAYER_CURRENT_ORDER_SCOPE) return true;
  const targets = proposalTargetIds(raw);
  if (targets.length) {
    return targets.some((target) => actorValueMatchesPlayer(target, snapshot));
  }
  return sourceHasPlayerAssignmentAuthority(snapshot);
}

function conciseAssignmentSummary(raw = {}, title = '') {
  const source = cleanTaskSegment(raw.playerSafeSummary || raw.summary || raw.detail || raw.description || title);
  if (!source) return title;
  if (source.length <= MAX_ASSIGNMENT_SUMMARY_LENGTH) return source;
  const cueSentence = splitTaskSentences(source).find(playerOrderCue);
  return compact(cueSentence || splitTaskSentences(source)[0] || source, MAX_ASSIGNMENT_SUMMARY_LENGTH);
}

function normalizeAssignmentProposal(raw = {}, context) {
  const title = compact(raw.title || raw.label || raw.summary, 180);
  const summary = conciseAssignmentSummary(raw, title);
  if (!title || !summary) return null;
  if (proposalLooksLikeMenuOfframp(title, summary)) return null;
  if (!assignmentProposalTargetsPlayer(raw, context)) return null;
  const assignedActorIds = proposalTargetIds(raw).length
    ? proposalTargetIds(raw)
    : [context.snapshot?.referenceResolver?.player?.id || 'player-commander'];
  const fingerprint = assignmentFingerprint({
    title,
    summary,
    dueWindow: raw.dueWindow || raw.deadline,
    linkedCrewIds: raw.linkedCrewIds,
    linkedShipSystemIds: raw.linkedShipSystemIds
  });
  const source = sourceBundle(context);
  return {
    id: raw.id || `open-assignment:${slug(title)}:${fingerprint.slice(0, 8)}`,
    title,
    summary,
    assignmentScope: PLAYER_CURRENT_ORDER_SCOPE,
    status: compact(raw.status || 'open', 80) || 'open',
    priority: compact(raw.priority || 'current', 80) || 'current',
    assignedByActorId: compact(raw.assignedByActorId || raw.assignedBy || '', 160) || null,
    assignedActorIds: assignedActorIds.map((item) => compact(item, 160)).filter(Boolean).slice(0, 8),
    dueWindow: compact(raw.dueWindow || raw.deadline || raw.timeWindow || '', 160) || null,
    linkedCrewIds: asArray(raw.linkedCrewIds).map((item) => compact(item, 160)).filter(Boolean).slice(0, 8),
    linkedShipSystemIds: asArray(raw.linkedShipSystemIds || raw.linkedSystemIds).map((item) => compact(item, 160)).filter(Boolean).slice(0, 8),
    linkedThreadIds: asArray(raw.linkedThreadIds).map((item) => compact(item, 160)).filter(Boolean).slice(0, 8),
    linkedQuestIds: asArray(raw.linkedQuestIds).map((item) => compact(item, 160)).filter(Boolean).slice(0, 8),
    sourceMessageIds: source.sourceMessageIds,
    sourceTextHashes: source.sourceTextHashes,
    sourceAnchorRange: source.sourceAnchorRange,
    sourceSettlementId: source.settlementId,
    fingerprint,
    lastUpdatedAt: source.createdAt
  };
}

function normalizeCommandLogProposal(raw = {}, context, assignments = []) {
  const summaryInputs = cleanList(raw.summaryInputs || raw.summaries || [raw.summary || raw.title], 6);
  const visibleConsequences = cleanList(raw.visibleConsequences || raw.consequences || [], 6);
  if (!assignments.length && [...summaryInputs, ...visibleConsequences].some(menuOfframpText)) return null;
  if (!summaryInputs.length && !visibleConsequences.length && !assignments.length) return null;
  const source = sourceBundle(context);
  const assignmentSummaries = assignments
    .map((item) => compact(item.summary || item.title, 260))
    .filter(Boolean);
  const finalSummaryInputs = uniqueStrings([
    ...(summaryInputs.length ? summaryInputs : []),
    ...assignmentSummaries
  ]).slice(0, 6);
  const finalVisibleConsequences = uniqueStrings([
    ...visibleConsequences,
    ...assignmentSummaries
  ]).slice(0, 6);
  return {
    id: raw.id || `command-log:${context.settlementId}`,
    type: compact(raw.type || 'sceneHandshake', 80) || 'sceneHandshake',
    stardate: context.snapshot.timeAndLocation.currentStardate ?? null,
    sourceSettlementId: source.settlementId,
    sourceMessageIds: source.sourceMessageIds,
    sourceTextHashes: source.sourceTextHashes,
    sourceAnchorRange: source.sourceAnchorRange,
    summaryInputs: finalSummaryInputs.length ? finalSummaryInputs : assignments.map((item) => item.summary).slice(0, 4),
    visibleConsequences: finalVisibleConsequences,
    linkedAssignmentIds: assignments.map((item) => item.id),
    linkedAssignmentTitles: assignments.map((item) => item.title),
    createdAt: source.createdAt
  };
}

function normalizeShipReadinessProposal(raw = {}, context) {
  const kind = compact(raw.kind || raw.type || 'technicalDebt', 80);
  if (!LOW_RISK_SHIP_KINDS.has(kind)) return null;
  const label = compact(raw.label || raw.title || raw.summary, 180);
  const detail = compact(raw.detail || raw.summary || raw.description || label, 500);
  if (!label || !detail) return null;
  const source = sourceBundle(context);
  const fingerprint = settlementHash(`${kind}\n${label}\n${detail}\n${raw.owner || ''}`);
  return {
    id: raw.id || `technical-debt:${slug(label)}:${fingerprint.slice(0, 8)}`,
    kind: 'technicalDebt',
    label,
    title: label,
    detail,
    summary: detail,
    status: compact(raw.status || 'under-review', 80) || 'under-review',
    severity: compact(raw.severity || 'watch', 80) || 'watch',
    owner: compact(raw.owner || raw.ownerName || '', 180) || null,
    linkedAssignmentTitle: compact(raw.linkedAssignmentTitle || '', 180) || null,
    sourceSettlementId: source.settlementId,
    sourceMessageIds: source.sourceMessageIds,
    sourceTextHashes: source.sourceTextHashes,
    sourceAnchorRange: source.sourceAnchorRange,
    fingerprint,
    lastUpdatedAt: source.createdAt,
    playerVisible: true
  };
}

function threadType(value = '') {
  const normalized = compact(value, 100).replace(/-/g, '_');
  return THREAD_TYPES.includes(normalized) ? normalized : 'professional_dilemma';
}

function normalizeThreadSignal(raw = {}, context) {
  const title = compact(raw.title || raw.label || raw.summary, 180);
  const summary = compact(raw.summary || raw.observableSeed || raw.detail || title, 500);
  if (!title || !summary) return null;
  if (proposalLooksLikeMenuOfframp(title, summary)) return null;
  const source = sourceBundle(context);
  const participantIds = asArray(raw.participantIds || raw.participants || raw.linkedCrewIds)
    .map((item) => compact(item, 160))
    .filter(Boolean)
    .slice(0, 8);
  const recordInput = {
    id: raw.id || `thread:${slug(title)}:${settlementHash(`${title}\n${summary}\n${participantIds.join('|')}`).slice(0, 8)}`,
    status: raw.directCommitment === true ? 'active' : (raw.status || 'engaged'),
    shape: raw.shape || 'side_assignment',
    type: threadType(raw.type || raw.kind),
    episodeFunction: 'setup',
    source: {
      id: source.settlementId,
      type: 'sceneHandshake',
      messageIds: source.sourceMessageIds,
      textHash: source.sourceTextHashes.range,
      rangeHash: source.sourceTextHashes.range,
      anchorRange: source.sourceAnchorRange
    },
    participantIds,
    linkedCrewIds: participantIds,
    title,
    playerSummary: compact(raw.playerSummary || summary, 320),
    summary,
    observableSeed: summary,
    storyQuestion: compact(raw.storyQuestion || 'Will this accepted obligation or concern receive attention, and what will that attention change?', 260),
    naturalTrigger: compact(raw.naturalTrigger || 'When the player follows up on the accepted assignment or concern.', 260),
    tags: asArray(raw.tags || ['scene-handshake']).map((item) => compact(item, 80)).filter(Boolean).slice(0, 8),
    supportingEvidence: [{
      id: `evidence:${source.settlementId}:${slug(title, 'thread')}`,
      type: threadType(raw.type || raw.kind),
      source: {
        id: source.settlementId,
        type: 'sceneHandshake',
        messageIds: source.sourceMessageIds,
        textHash: source.sourceTextHashes.range,
        rangeHash: source.sourceTextHashes.range,
        anchorRange: source.sourceAnchorRange
      },
      excerpt: compact(raw.excerpt || summary, 500),
      summary,
      visibility: 'player_safe',
      observable: true,
      actorIds: participantIds,
      sourceMessageIds: source.sourceMessageIds,
      anchorRange: source.sourceAnchorRange,
      tags: ['scene-handshake'],
      recordedAt: source.createdAt
    }],
    reinforcementCount: 1,
    playerInterest: raw.playerInterest ?? 1,
    salience: Math.max(0.4, Math.min(1, Number(raw.confidence || context.settlement.confidence || 0.65))),
    firstObservedAt: source.createdAt,
    lastReinforcedAt: source.createdAt,
    semanticFingerprint: raw.semanticFingerprint || threadSemanticFingerprint({ type: threadType(raw.type || raw.kind), title, summary, participantIds }),
    metadata: {
      sourceSettlementId: source.settlementId,
      topicKey: raw.topicKey || null,
      semanticKey: raw.semanticKey || null,
      stale: false
    }
  };
  try {
    return normalizeThreadRecord(recordInput);
  } catch {
    return null;
  }
}

function existingFingerprintSet(values = []) {
  return new Set(asArray(values).map((item) => item?.fingerprint || settlementHash(`${item?.title || item?.label || ''}\n${item?.summary || item?.detail || ''}`)));
}

function matchingShipReadinessRecord(record = {}, campaignState = {}) {
  const records = asArray(campaignState?.ship?.technicalDebt);
  const id = compact(record.id || '');
  if (id) {
    const byId = records.find((entry) => compact(entry?.id || '') === id);
    if (byId) return byId;
  }
  const text = `${record.label || ''} ${record.title || ''} ${record.detail || ''} ${record.summary || ''}`;
  const wantsCommandNetwork = /\bcommand-network\b|\bhandoff\b/i.test(text);
  const wantsSensor = /\bsensor\b|\bcalibration\b/i.test(text);
  const wantsMedicalPower = /\bmedical\b|\bsurgical bay\b|\bpower feeds?\b/i.test(text);
  return records.find((entry) => {
    const existing = `${entry?.id || ''} ${entry?.label || ''} ${entry?.title || ''} ${entry?.playerSafeSummary || ''} ${entry?.summary || ''} ${entry?.detail || ''}`;
    if (wantsCommandNetwork && /\bcommand-network\b|\bcertificate\b|\bhandoff\b/i.test(existing)) return true;
    if (wantsSensor && /\bsensor\b|\bcalibration\b/i.test(existing)) return true;
    if (wantsMedicalPower && /\bmedical\b|\bsurgical bay\b|\bpower feeds?\b/i.test(existing)) return true;
    return false;
  }) || null;
}

function reinforceExistingShipReadinessRecord(record = null, campaignState = {}) {
  if (!record) return null;
  const existing = matchingShipReadinessRecord(record, campaignState);
  if (!existing) return record;
  const sourceSettlementIds = uniqueStrings([
    existing.sourceSettlementId,
    ...(existing.sourceSettlementIds || []),
    record.sourceSettlementId
  ]);
  const sourceMessageIds = uniqueStrings([
    ...(existing.sourceMessageIds || []),
    ...(record.sourceMessageIds || [])
  ]);
  return {
    ...record,
    id: existing.id || record.id,
    label: existing.label || record.label,
    title: existing.title || existing.label || record.title,
    playerSafeSummary: existing.playerSafeSummary || record.summary || record.detail,
    status: existing.status || record.status,
    department: existing.department || record.department || null,
    sourceSettlementIds,
    sourceMessageIds,
    sourceSettlementId: record.sourceSettlementId,
    sourceReinforcedAt: record.lastUpdatedAt,
    handshakeReinforced: true
  };
}

function threadTitleKey(record = {}) {
  return slug(record.title || record.playerSummary || record.observableSeed || record.summary || '', 'thread');
}

function threadParticipantIds(record = {}) {
  return uniqueStrings([
    ...(record.participantIds || []),
    ...(record.participants || []),
    ...(record.linkedCrewIds || [])
  ]).sort();
}

function setsOverlap(left = [], right = []) {
  if (!left.length && !right.length) return true;
  const rightSet = new Set(right);
  return left.some((item) => rightSet.has(item));
}

function matchingThreadRecord(record = {}, campaignState = {}) {
  const records = asArray(campaignState?.threadLedger?.records);
  const id = compact(record.id || '', 180);
  if (id) {
    const byId = records.find((entry) => compact(entry?.id || '', 180) === id);
    if (byId) return byId;
  }

  const titleKey = threadTitleKey(record);
  const participants = threadParticipantIds(record);
  const semanticKey = compact(record.metadata?.semanticKey || record.metadata?.topicKey || '', 180);
  const fingerprint = compact(record.semanticFingerprint || '', 500);
  return records.find((entry) => {
    const status = compact(entry?.status || '', 80).toLowerCase();
    if (entry?.metadata?.stale === true || CLOSED_THREAD_STATUSES.has(status)) return false;
    const entrySemanticKey = compact(entry?.metadata?.semanticKey || entry?.metadata?.topicKey || '', 180);
    if (semanticKey && entrySemanticKey && semanticKey === entrySemanticKey) return true;
    if (fingerprint && entry?.semanticFingerprint === fingerprint) return true;
    if (threadTitleKey(entry) !== titleKey) return false;
    return setsOverlap(participants, threadParticipantIds(entry));
  }) || null;
}

function reinforceExistingThreadRecord(record = null, campaignState = {}) {
  if (!record) return null;
  const existing = matchingThreadRecord(record, campaignState);
  if (!existing) return record;

  const existingEvidence = asArray(existing.supportingEvidence || existing.evidence);
  const incomingEvidence = asArray(record.supportingEvidence || record.evidence);
  const evidenceById = new Map(existingEvidence.map((item) => [item.id, item]));
  for (const item of incomingEvidence) {
    if (item?.id) evidenceById.set(item.id, item);
  }
  const newEvidenceCount = [...evidenceById.keys()]
    .filter((id) => !existingEvidence.some((item) => item.id === id))
    .length;
  const participantIds = uniqueStrings([
    ...threadParticipantIds(existing),
    ...threadParticipantIds(record)
  ]);
  const sourceSettlementIds = uniqueStrings([
    existing.metadata?.sourceSettlementId,
    ...(existing.metadata?.sourceSettlementIds || []),
    record.metadata?.sourceSettlementId,
    ...(record.metadata?.sourceSettlementIds || [])
  ]);
  const lastReinforcedAt = record.lastReinforcedAt || timestamp();
  return normalizeThreadRecord({
    ...existing,
    id: existing.id || record.id,
    status: OPEN_THREAD_STATUSES.has(compact(existing.status || '', 80).toLowerCase())
      ? existing.status
      : (record.status || existing.status),
    participantIds,
    participants: participantIds,
    linkedCrewIds: participantIds,
    supportingEvidence: [...evidenceById.values()],
    evidence: [...evidenceById.values()],
    reinforcementCount: Math.max(
      Number(existing.reinforcementCount || 0) + newEvidenceCount,
      [...evidenceById.values()].length,
      Number(record.reinforcementCount || 0)
    ),
    playerInterest: Math.max(Number(existing.playerInterest || 0), Number(record.playerInterest || 0)),
    salience: Math.max(Number(existing.salience || 0), Number(record.salience || 0)),
    firstObservedAt: existing.firstObservedAt || record.firstObservedAt || null,
    lastReinforcedAt,
    metadata: {
      ...(existing.metadata || {}),
      sourceSettlementIds,
      latestSourceSettlementId: record.metadata?.sourceSettlementId || null,
      lastReinforcedBy: 'sceneHandshake',
      handshakeReinforced: true,
      stale: false
    },
    history: [
      ...asArray(existing.history),
      {
        at: lastReinforcedAt,
        type: 'scene-handshake-reinforcement',
        sourceSettlementId: record.metadata?.sourceSettlementId || null,
        sourceThreadId: record.id || null
      }
    ]
  });
}

export function validateLatestPairSettlement(rawSettlement, {
  campaignState,
  snapshot,
  settlementId,
  recordedAt = null
} = {}) {
  const normalizedSettlement = normalizeSettlement(rawSettlement);
  const reasons = [];
  if (normalizedSettlement.kind !== LATEST_PAIR_SOURCE_SETTLEMENT_PROVIDER_KIND) reasons.push('kind-mismatch');
  if (!normalizedSettlement.acceptedPreviousResponse) {
    return {
      ok: true,
      settlement: normalizedSettlement,
      disposition: normalizedSettlement.playerReplyRelation === 'corrects' ? 'internalReview' : 'defer',
      reasons: reasons.length ? reasons : [normalizedSettlement.playerReplyRelation || 'not-accepted'],
      operations: [],
      committedRoots: [],
      promptDirty: false
    };
  }
  const {
    settlement,
    explicitTaskCount
  } = enrichSettlementWithDeterministicProposals(normalizedSettlement, {
    snapshot,
    campaignState
  });
  if (!ACCEPTED_RELATIONS.has(settlement.playerReplyRelation)) reasons.push('relation-not-accepted');
  if (settlement.confidence < 0.62) reasons.push('confidence-below-threshold');
  if (settlement.disposition !== 'autoCommit') reasons.push(`disposition:${settlement.disposition}`);
  if (settlement.needsInternalReview) reasons.push('needs-internal-review');
  if (explicitTaskCount > 0 && !settlement.openAssignmentProposals.length) {
    reasons.push('explicit-accepted-source-produced-no-assignments');
  }

  const context = {
    settlement,
    snapshot,
    settlementId,
    recordedAt: recordedAt || timestamp()
  };
  const existingAssignments = existingFingerprintSet(campaignState?.mission?.openAssignments || []);
  const assignments = settlement.openAssignmentProposals
    .map((proposal) => normalizeAssignmentProposal(proposal, context))
    .filter((record) => record && !existingAssignments.has(record.fingerprint));
  const commandLogs = settlement.commandLogProposals
    .map((proposal) => normalizeCommandLogProposal(proposal, context, assignments))
    .filter(Boolean);
  const shipReadiness = settlement.shipReadinessProposals
    .map((proposal) => normalizeShipReadinessProposal(proposal, context))
    .map((record) => reinforceExistingShipReadinessRecord(record, campaignState))
    .filter(Boolean);
  const threads = settlement.threadSignals
    .map((proposal) => normalizeThreadSignal(proposal, context))
    .map((record) => reinforceExistingThreadRecord(record, campaignState))
    .filter(Boolean);

  if (reasons.length) {
    return {
      ok: true,
      settlement,
      disposition: settlement.disposition === 'operatorRecovery' ? 'operatorRecovery' : 'internalReview',
      reasons,
      operations: [],
      committedRoots: [],
      promptDirty: false
    };
  }

  const operations = [];
  if (assignments.length) {
    for (const assignment of assignments) {
      operations.push({ op: 'upsert', path: 'mission.openAssignments', identityKey: 'id', value: assignment });
    }
  }
  if (commandLogs.length) {
    for (const entry of commandLogs) {
      operations.push({ op: 'upsert', path: 'commandLog.entries', identityKey: 'id', value: entry });
    }
  }
  if (shipReadiness.length) {
    for (const note of shipReadiness) {
      operations.push({ op: 'upsert', path: 'ship.technicalDebt', identityKey: 'id', value: note });
    }
  }
  if (threads.length) {
    for (const thread of threads) {
      operations.push({ op: 'upsert', path: 'threadLedger.records', identityKey: 'id', value: thread });
    }
  }

  return {
    ok: true,
    settlement,
    disposition: 'autoCommit',
    reasons: [],
    operations,
    committedRoots: [...new Set(operations.map((operation) => operation.path.split('.')[0]))],
    promptDirty: operations.some((operation) => !['runtimeTracking', 'sceneHandshake'].includes(operation.path.split('.')[0]))
  };
}

export { validateLatestPairSettlement as validateSceneHandshakeSettlement };
