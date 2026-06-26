import { threadSemanticFingerprint } from './thread-ledger.mjs';

function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function compact(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
function unique(values) { return [...new Set(asArray(values).filter(Boolean))]; }
function parseJsonish(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return value;
  try { return JSON.parse(text); } catch { return value; }
}
function modelPayload(response) {
  const raw = response?.data
    ?? response?.parsed
    ?? response?.output
    ?? response?.value
    ?? response?.content
    ?? response?.text
    ?? response;
  return parseJsonish(raw);
}
function hashText(value) {
  let hash = 2166136261;
  for (const ch of String(value)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const SIGNAL_RULES = Object.freeze([
  { kind: 'relationship-strain', type: 'interpersonal_relationship', group: 'relationship', priority: 100, pattern: /\b(girlfriend|boyfriend|partner|spouse|marriage|relationship|breakup|separated|argument|not speaking|haven't spoken|have not spoken|distance between us)\b/i },
  { kind: 'shipboard-maintenance', type: 'shipboard_maintenance', group: 'work-task', priority: 95, pattern: /\b(repair|maintenance|calibration|inventory|overhaul|diagnostic|technical debt|system fault|component)\b/i },
  { kind: 'routine-task-friction', type: 'professional_dilemma', group: 'work-task', priority: 85, pattern: /\b(routine|shift|checks?|reports?|paperwork|maintenance task|inspection|calibration|schedule)\b/i },
  { kind: 'professional-difficulty', type: 'professional_dilemma', group: 'work-task', priority: 75, pattern: /\b(struggl(?:e|ing)|difficult(?:y|ies)|problem with|cannot finish|can't finish|falling behind|overwhelmed|mistake|failed|uncertain|trouble with)\b/i },
  { kind: 'fatigue-or-recovery', type: 'recovery_and_aftermath', group: 'recovery', priority: 90, pattern: /\b(exhausted|fatigue|sleep|nightmares|trauma|recovery|burnout|rest|cannot sleep|can't sleep)\b/i },
  { kind: 'promise-or-obligation', type: 'promise_debt_or_favor', group: 'obligation', priority: 60, pattern: /\b(promis(?:e|ed)|owe|favor|follow up|check in|help me|could you|i will help|we'll help|we will help)\b/i },
  { kind: 'identity-or-belonging', type: 'identity_and_belonging', group: 'identity', priority: 90, pattern: /\b(belong|outsider|home|family|identity|name|heritage|replacement|where i fit)\b/i },
  { kind: 'mentorship', type: 'mentorship', group: 'mentorship', priority: 90, pattern: /\b(mentor|training|prepare for command|career|promotion|teach|coach|review my work)\b/i },
  { kind: 'civilian-concern', type: 'local_civilian_problem', group: 'civilian', priority: 90, pattern: /\b(colony|civilian|family|clinic|school|shelter|missing person|displaced|relief enclave)\b/i },
  { kind: 'science-curiosity', type: 'scientific_curiosity', group: 'science', priority: 90, pattern: /\b(anomaly|experiment|research|signal|sample|survey|discovery|peer review|unexpected result)\b/i },
  { kind: 'ritual-or-hobby', type: 'hobby_ritual_or_domestic_life', group: 'domestic', priority: 80, pattern: /\b(cook|meal|table|music|game|hobby|garden|ritual|letter|correspondence)\b/i }
]);
const CLOSURE_LANGUAGE = Object.freeze([
  /\b(?:thread|issue|gap|matter|drill|assignment|task|record|recommendation)\s+(?:is|are|was|were|has been|have been|stays?|remains?)\s+(?:closed|resolved|complete|completed|finished|signed off)\b/i,
  /\b(?:close|closed|resolve|resolved|complete|completed|finish|finished|sign off|signed off)\s+(?:the\s+)?(?:thread|issue|gap|matter|drill|assignment|task|record|recommendation)\b/i,
  /\b(?:closure|final sign[-\s]?off|signed approval|closure note)\b/i
]);
const OPEN_LANGUAGE = /\b(?:stays?|remains?|keeps?|left|leaves?)\s+open\b|\bseparate\s+open\b|\bnot\s+(?:closed|resolved|complete|completed|finished)\b|\buntil\b/i;
const TOKEN_STOPWORDS = new Set([
  'that', 'this', 'with', 'from', 'have', 'will', 'they', 'them', 'their',
  'under', 'only', 'open', 'closed', 'close', 'thread', 'issue', 'matter',
  'record', 'recommendation', 'signed', 'approval', 'authority', 'separate'
]);

function normalizedMessages(scene) {
  const messages = asArray(scene.messages).map((message, index) => ({
    id: message.id || message.messageId || message.hostMessageId || `message.${index}`,
    role: message.role || message.authorRole || (message.is_user ? 'user' : 'assistant'),
    text: compact(message.text || message.content || message.mes),
    ordinal: Number.isFinite(Number(message.ordinal ?? message.index)) ? Number(message.ordinal ?? message.index) : index,
    textHash: message.textHash || hashText(message.text || message.content || message.mes),
    previousHash: message.previousHash || null,
    nextHash: message.nextHash || null
  })).filter((message) => message.text);

  if (!messages.length) {
    if (compact(scene.playerText)) {
      messages.push({ id: scene.playerMessageId || `player.${scene.turnId || 'turn'}`, role: 'user', text: compact(scene.playerText), ordinal: 0, textHash: hashText(scene.playerText), previousHash: null, nextHash: null });
    }
    if (compact(scene.assistantText)) {
      messages.push({ id: scene.assistantMessageId || `assistant.${scene.outcomePacket?.id || scene.turnId || 'turn'}`, role: 'assistant', text: compact(scene.assistantText), ordinal: 1, textHash: hashText(scene.assistantText), previousHash: messages.at(-1)?.textHash || null, nextHash: null });
    }
  }
  for (let index = 0; index < messages.length; index += 1) {
    messages[index].previousHash = messages[index].previousHash || messages[index - 1]?.textHash || null;
    messages[index].nextHash = messages[index].nextHash || messages[index + 1]?.textHash || null;
  }
  return messages;
}

function anchorRange(scene, messages) {
  if (scene.anchorRange) return cloneJson(scene.anchorRange);
  const start = messages[0];
  const end = messages.at(-1);
  const rangeHash = hashText(messages.map((item) => `${item.id}:${item.textHash}`).join('|'));
  return {
    host: scene.host || 'sillytavern',
    chatId: scene.chatId || null,
    start: { messageId: start?.id || scene.playerMessageId || null, ordinal: start?.ordinal ?? null, textHash: start?.textHash || null, previousHash: start?.previousHash || null, nextHash: start?.nextHash || null },
    end: { messageId: end?.id || scene.assistantMessageId || null, ordinal: end?.ordinal ?? null, textHash: end?.textHash || null, previousHash: end?.previousHash || null, nextHash: end?.nextHash || null },
    messageCount: messages.length,
    rangeHash
  };
}

function sourceText(scene, messages) {
  const costs = asArray(scene?.outcomePacket?.costs).map((cost) => typeof cost === 'string' ? cost : cost?.summary);
  return [
    ...messages.map((item) => item.text),
    scene?.outcomePacket?.summary,
    ...costs,
    ...asArray(scene?.commandLogPacket?.summaryInputs),
    ...asArray(scene?.observableStatements),
    ...asArray(scene?.playerVisibleFacts).map((fact) => typeof fact === 'string' ? fact : fact?.summary || fact?.playerSafeSummary)
  ].map(compact).filter(Boolean).join(' ');
}

function tokenList(value) {
  return compact(value).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter((token) => token.length > 3 && !TOKEN_STOPWORDS.has(token));
}

function tokenOverlapScore(left, right) {
  const leftTokens = new Set(tokenList(left));
  const rightTokens = new Set(tokenList(right));
  if (!leftTokens.size || !rightTokens.size) return { score: 0, shared: [] };
  const shared = [...rightTokens].filter((token) => leftTokens.has(token));
  return {
    score: shared.length / Math.max(1, Math.min(leftTokens.size, rightTokens.size)),
    shared
  };
}

function sentenceList(value) {
  return compact(value).split(/(?<=[.!?])\s+|\n+/).map(compact).filter(Boolean);
}

function playerInterest(scene, messages) {
  const playerText = messages.filter((item) => item.role === 'user').map((item) => item.text).join(' ');
  return Boolean(scene.playerFollowedUp || scene.playerAskedPersonalQuestion || scene.playerOfferedHelp || /\b(i can help|we can help|tell me more|what do you need|i'll help|i will help|let me handle|we should follow up|check in later)\b/i.test(playerText));
}

function directCommitment(scene, messages) {
  const playerText = messages.filter((item) => item.role === 'user').map((item) => item.text).join(' ');
  return Boolean(scene.directCommitment || /\b(i will|we will|i'll|we'll|make it so|i promise|consider it done|i'm assigning|i am assigning)\b/i.test(playerText));
}

function privacyRisk(value) {
  // Uncertainty about a task ("does not know why") is not private evidence.
  // Require language that actually indicates covert access, concealed personal
  // information, or observation without consent.
  return /\b(secretly|private diary|unspoken private|without telling (?:them|him|her)|without (?:their|his|her) knowledge|unbeknownst to|read (?:their|his|her) personal|surveillance of)\b/i.test(value) ? 'review' : 'low';
}

function sentenceFragments(messages, scene) {
  const fragments = [];
  for (const message of messages) {
    const parts = message.text.split(/(?<=[.!?])\s+|\n+/).map(compact).filter(Boolean);
    for (const part of parts) fragments.push({ text: part, role: message.role, messageId: message.id });
  }
  for (const value of [...asArray(scene.observableStatements), ...asArray(scene.playerVisibleFacts)]) {
    const text = compact(typeof value === 'string' ? value : value?.summary || value?.playerSafeSummary);
    if (text) fragments.push({ text, role: 'system-observable', messageId: null });
  }
  return fragments;
}

function signalMatches(scene, messages) {
  const fragments = sentenceFragments(messages, scene);
  const fullText = sourceText(scene, messages);
  const interest = playerInterest(scene, messages);
  const commitment = directCommitment(scene, messages);
  const range = anchorRange(scene, messages);
  const baseSource = {
    id: scene.sceneId || scene.outcomePacket?.id || scene.turnId || scene.messageId || range.rangeHash,
    type: scene.sceneId ? 'scene' : scene.outcomePacket?.id ? 'outcome' : 'turn',
    sceneId: scene.sceneId || null,
    turnId: scene.turnId || null,
    outcomeId: scene.outcomePacket?.id || null,
    messageIds: messages.map((item) => item.id),
    anchorRange: range,
    rangeHash: range.rangeHash
  };
  const participantIds = unique([
    ...asArray(scene.presentCharacterIds),
    ...asArray(scene.actorIds),
    ...asArray(scene.outcomePacket?.actorIds)
  ]);

  const raw = SIGNAL_RULES.flatMap((rule) => {
    const matching = fragments.filter((fragment) => rule.pattern.test(fragment.text));
    if (!matching.length && !rule.pattern.test(fullText)) return [];
    const excerpts = matching.length ? matching : [{ text: fullText, role: 'unknown', messageId: null }];
    const summary = unique(excerpts.map((item) => item.text)).join(' ').slice(0, 800);
    const messageIds = unique(excerpts.map((item) => item.messageId));
    return [{
      id: `signal.${baseSource.id}.${rule.kind}.0`,
      kind: rule.kind,
      group: rule.group,
      priority: rule.priority,
      suggestedThreadType: rule.type,
      source: { ...baseSource, messageIds: messageIds.length ? messageIds : baseSource.messageIds },
      summary,
      participantIds,
      playerInterest: interest,
      directCommitment: commitment,
      privacyRisk: privacyRisk(summary),
      tags: unique([rule.kind, rule.group, ...asArray(scene.tags)]),
      confidence: interest ? 0.82 : 0.65,
      rawValuesHidden: true
    }];
  });

  // Prefer the most specific work/task signal. General difficulty and routine
  // wording become corroborating tags rather than three near-identical threads.
  const workSignals = raw.filter((item) => item.group === 'work-task').sort((a, b) => b.priority - a.priority);
  let filtered = raw.filter((item) => item.group !== 'work-task');
  if (workSignals.length) {
    const primary = workSignals[0];
    primary.tags = unique([...primary.tags, ...workSignals.flatMap((item) => item.tags)]);
    primary.summary = unique(workSignals.map((item) => item.summary)).join(' ').slice(0, 800);
    filtered.push(primary);
  }

  // A promise made in direct response to another concern reinforces that
  // concern. It becomes a standalone obligation only when no substantive
  // concern is present in the same passage.
  const substantive = filtered.filter((item) => item.group !== 'obligation');
  const obligations = filtered.filter((item) => item.group === 'obligation');
  if (substantive.length && obligations.length) {
    for (const item of substantive) item.tags = unique([...item.tags, 'promise-or-obligation']);
    filtered = substantive;
  }

  return { signals: filtered.sort((a, b) => b.priority - a.priority), baseSource, participantIds, fullText, range };
}

function applyKnownActors(signals, knownActorIds) {
  const allowed = new Set(asArray(knownActorIds));
  if (!allowed.size) return signals;
  return signals.map((signal) => ({ ...signal, participantIds: signal.participantIds.filter((id) => allowed.has(id)) }));
}

function knownThreadMap(currentThreads = []) {
  const allowedStatuses = new Set(['watchlisted', 'available', 'engaged', 'active', 'dormant']);
  return new Map(asArray(currentThreads)
    .filter((thread) => thread?.id && allowedStatuses.has(String(thread.status || '').trim()))
    .map((thread) => [thread.id, thread]));
}

function normalizeThreadClosures(rawClosures = [], { currentThreads = [], source = {} } = {}) {
  const threads = knownThreadMap(currentThreads);
  if (!threads.size) return [];
  const closures = [];
  const seen = new Set();
  for (const [index, raw] of asArray(rawClosures).entries()) {
    const threadId = compact(raw?.threadId);
    if (!threadId || !threads.has(threadId) || seen.has(threadId)) continue;
    const summary = compact(raw.summary || raw.observableSummary || raw.reason);
    if (!summary) continue;
    seen.add(threadId);
    closures.push({
      id: compact(raw.id) || `thread-closure.${threadId}.${index + 1}`,
      threadId,
      resolved: raw.resolved === false ? false : true,
      transformed: raw.transformed === true,
      summary: summary.slice(0, 420),
      sourceOutcomeId: compact(raw.sourceOutcomeId || source.outcomeId),
      sourceOutcomeIds: unique([raw.sourceOutcomeId, source.outcomeId, ...asArray(raw.sourceOutcomeIds)]),
      sourceTurnId: compact(raw.sourceTurnId || source.turnId),
      sourceMessageIds: unique([...(asArray(raw.sourceMessageIds)), ...(asArray(source.messageIds))]),
      anchorRange: cloneJson(raw.anchorRange || source.anchorRange || null)
    });
  }
  return closures;
}

function threadText(thread = {}) {
  return compact([
    thread.id,
    thread.title,
    thread.summary,
    thread.playerSummary,
    thread.observableSeed,
    ...asArray(thread.participantIds || thread.participants || thread.linkedCrewIds)
  ].filter(Boolean).join(' '));
}

function threadCoreText(thread = {}) {
  return compact([
    thread.id,
    thread.title,
    thread.summary,
    thread.playerSummary,
    thread.observableSeed
  ].filter(Boolean).join(' '));
}

function mentionedAsOpen(fullText, thread = {}) {
  const threadTokens = new Set(tokenList(threadCoreText(thread)));
  if (!threadTokens.size) return false;
  const openFragments = sentenceList(fullText).flatMap((sentence) =>
    sentence.split(/\b(?:while|but|whereas|although)\b|[;]/i).map(compact).filter((fragment) => OPEN_LANGUAGE.test(fragment))
  );
  return openFragments.some((fragment) => {
    const sentenceTokens = new Set(tokenList(fragment));
    return [...threadTokens].some((token) => sentenceTokens.has(token));
  });
}

function deterministicThreadClosures(scene = {}, { currentThreads = [], source = {}, messages = [] } = {}) {
  const fullText = sourceText(scene, messages);
  if (!CLOSURE_LANGUAGE.some((pattern) => pattern.test(fullText))) return [];
  const threads = [...knownThreadMap(currentThreads).values()];
  if (!threads.length) return [];
  const ranked = threads
    .filter((thread) => !mentionedAsOpen(fullText, thread))
    .map((thread) => {
      const overlap = tokenOverlapScore(fullText, threadText(thread));
      return { thread, ...overlap };
    })
    .filter((item) => item.shared.length >= 2 && item.score >= 0.16)
    .sort((left, right) => right.score - left.score || right.shared.length - left.shared.length);
  if (!ranked.length) return [];
  const selected = ranked[0];
  return [{
    id: `thread-closure.${selected.thread.id}.deterministic`,
    threadId: selected.thread.id,
    resolved: true,
    transformed: false,
    summary: `Visible closure language matched ${selected.thread.title || selected.thread.id}: ${sentenceList(fullText).find((sentence) => CLOSURE_LANGUAGE.some((pattern) => pattern.test(sentence))) || 'the thread reached a stopping point.'}`.slice(0, 420),
    sourceOutcomeId: compact(source.outcomeId),
    sourceOutcomeIds: unique([source.outcomeId]),
    sourceTurnId: compact(source.turnId),
    sourceMessageIds: unique(asArray(source.messageIds)),
    anchorRange: cloneJson(source.anchorRange || null),
    deterministic: true,
    match: {
      score: selected.score,
      sharedTokens: selected.shared.slice(0, 12)
    }
  }];
}

function mergeThreadClosures(...groups) {
  const byThreadId = new Map();
  for (const closure of groups.flatMap((group) => asArray(group))) {
    if (!closure?.threadId || byThreadId.has(closure.threadId)) continue;
    byThreadId.set(closure.threadId, closure);
  }
  return [...byThreadId.values()];
}

export function validateSceneDeltaProposal(proposal, { knownActorIds = [], currentThreads = [], scene = {} } = {}) {
  if (!proposal || typeof proposal !== 'object') return { ok: false, errors: ['proposal-must-be-object'], sceneDelta: null };
  const messages = normalizedMessages(scene);
  const deterministic = signalMatches(scene, messages);
  const source = deterministic.baseSource;
  const allowedActors = new Set(knownActorIds);
  const signals = [];
  const errors = [];
  for (const [index, raw] of asArray(proposal.signals).entries()) {
    const rule = SIGNAL_RULES.find((item) => item.kind === raw.kind || item.type === raw.suggestedThreadType);
    if (!rule) { errors.push(`unsupported-signal:${raw.kind || raw.suggestedThreadType}`); continue; }
    const participants = unique(raw.participantIds).filter((id) => !allowedActors.size || allowedActors.has(id));
    const summary = compact(raw.summary || raw.observableSeed);
    if (!summary) { errors.push(`missing-summary:${index}`); continue; }
    signals.push({
      id: raw.id || `signal.${source.id}.${rule.kind}.${index}`,
      kind: rule.kind,
      group: rule.group,
      priority: rule.priority,
      suggestedThreadType: rule.type,
      source,
      summary: summary.slice(0, 800),
      participantIds: participants,
      playerInterest: Boolean(raw.playerInterest),
      directCommitment: Boolean(raw.directCommitment),
      privacyRisk: raw.privacyRisk === 'review' ? 'review' : 'low',
      tags: unique([rule.kind, rule.group, ...asArray(raw.tags)]),
      confidence: Math.max(0, Math.min(1, Number(raw.confidence || 0.65))),
      rawValuesHidden: true
    });
  }
  const normalized = consolidateModelSignals(signals);
  const threadClosures = mergeThreadClosures(
    normalizeThreadClosures(proposal.threadClosures, { currentThreads, source }),
    deterministicThreadClosures(scene, { currentThreads, source, messages })
  );
  return {
    ok: errors.length === 0,
    errors,
    sceneDelta: {
      kind: 'directive.sceneDelta', version: 2, source, anchorRange: deterministic.range,
      committed: scene.committed !== false,
      participantIds: unique(normalized.flatMap((item) => item.participantIds)),
      observableSummary: compact(proposal.observableSummary || deterministic.fullText),
      signals: normalized,
      threadClosures,
      closureSignals: cloneJson(scene.closureSignals || null),
      facts: asArray(scene.playerVisibleFacts).map(cloneJson),
      playerInterestSignals: normalized.filter((item) => item.playerInterest).map((item) => item.id),
      directCommitmentSignals: normalized.filter((item) => item.directCommitment).map((item) => item.id),
      rejectedHiddenInputs: asArray(scene.hiddenFacts).length + asArray(scene.directorOnlyFacts).length
    }
  };
}

function consolidateModelSignals(signals) {
  const grouped = new Map();
  for (const signal of signals) {
    const key = signal.group === 'work-task' ? 'work-task' : signal.group;
    const previous = grouped.get(key);
    if (!previous || Number(signal.priority || 0) > Number(previous.priority || 0)) {
      grouped.set(key, { ...signal, tags: unique([...(previous?.tags || []), ...signal.tags]) });
    } else {
      previous.tags = unique([...previous.tags, ...signal.tags]);
    }
  }
  let values = [...grouped.values()];
  if (values.some((item) => item.group !== 'obligation')) values = values.filter((item) => item.group !== 'obligation');
  return values;
}

/** Extract only committed, player-observable evidence from a bounded passage. */
export function extractSceneDelta(scene = {}, { knownActorIds = [] } = {}) {
  const messages = normalizedMessages(scene);
  const matched = signalMatches(scene, messages);
  const signals = applyKnownActors(matched.signals, knownActorIds);
  const threadClosures = mergeThreadClosures(
    normalizeThreadClosures(scene.threadClosures, {
      currentThreads: scene.currentThreads,
      source: matched.baseSource
    }),
    deterministicThreadClosures(scene, {
      currentThreads: scene.currentThreads,
      source: matched.baseSource,
      messages
    })
  );
  return {
    kind: 'directive.sceneDelta',
    version: 2,
    source: matched.baseSource,
    anchorRange: matched.range,
    committed: scene.committed !== false,
    participantIds: unique(signals.flatMap((signal) => signal.participantIds)),
    observableSummary: matched.fullText,
    signals,
    threadClosures,
    closureSignals: cloneJson(scene.closureSignals || null),
    facts: asArray(scene.playerVisibleFacts).map(cloneJson),
    playerInterestSignals: signals.filter((signal) => signal.playerInterest).map((signal) => signal.id),
    directCommitmentSignals: signals.filter((signal) => signal.directCommitment).map((signal) => signal.id),
    rejectedHiddenInputs: asArray(scene.hiddenFacts).length + asArray(scene.directorOnlyFacts).length
  };
}

export function sceneDeltaToThreadCandidates(sceneDelta, { maxCandidates = 6, allowPrivacyReview = false } = {}) {
  if (!sceneDelta?.committed) return { candidates: [], rejected: [{ reason: 'scene-not-committed' }] };
  const candidates = [];
  const rejected = [];
  for (const signal of asArray(sceneDelta.signals)) {
    if (signal.privacyRisk === 'review' && !allowPrivacyReview) {
      rejected.push({ signalId: signal.id, reason: 'privacy-review-required' });
      continue;
    }
    const semanticKey = `${signal.group || signal.kind}::${unique(signal.participantIds).sort().join('|') || 'world'}`;
    const candidate = {
      id: `thread.dynamic.${signal.kind}.${hashText(`${semanticKey}|${signal.source?.rangeHash || signal.summary}`)}`,
      type: signal.suggestedThreadType,
      shape: signal.playerInterest ? 'character_thread' : 'vignette',
      status: signal.directCommitment ? 'engaged' : signal.playerInterest ? 'available' : 'watchlisted',
      participantIds: unique(signal.participantIds),
      participants: unique(signal.participantIds),
      source: cloneJson(signal.source),
      title: signal.kind.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' '),
      summary: signal.summary,
      playerSummary: signal.playerInterest ? signal.summary.slice(0, 300) : '',
      observableSeed: signal.summary,
      storyQuestion: 'Will this concern receive attention, and what will that attention change?',
      naturalTrigger: 'During suitable downtime or when a participant naturally raises the concern.',
      tags: unique([signal.group, ...signal.tags]),
      topicKey: signal.group || signal.kind,
      semanticKey,
      playerInterest: signal.playerInterest ? 1 : 0,
      directCommitment: signal.directCommitment,
      confidence: signal.confidence,
      privacyRisk: signal.privacyRisk,
      evidence: [{
        id: `evidence.${signal.id}`,
        type: signal.suggestedThreadType,
        source: cloneJson(signal.source),
        excerpt: signal.summary,
        summary: signal.summary,
        visibility: 'player_safe',
        observable: true,
        actorIds: unique(signal.participantIds),
        sourceMessageIds: unique(signal.source?.messageIds),
        sourceOutcomeId: signal.source?.outcomeId,
        anchorRange: cloneJson(signal.source?.anchorRange),
        tags: unique(signal.tags)
      }]
    };
    candidate.semanticFingerprint = threadSemanticFingerprint(candidate);
    candidates.push(candidate);
    if (candidates.length >= maxCandidates) break;
  }
  return { candidates, rejected };
}

export async function extractSceneDeltaWithModel({ generationRouter, scene, knownActorIds = [], currentThreads = [] } = {}) {
  const deterministic = extractSceneDelta({ ...scene, currentThreads }, { knownActorIds });
  if (!generationRouter?.generate) return { sceneDelta: deterministic, modelCall: null, fallback: false };
  const request = {
    contract: 'directive.sceneDeltaProposal.v2',
    instruction: 'Extract only observable, committed thread signals and explicit thread closures. Do not infer private facts or propose state mutations. Only propose a thread closure when the visible exchange unmistakably resolves, transforms, or sets aside one exact current thread.',
    scene: {
      messages: normalizedMessages(scene).map((item) => ({ id: item.id, role: item.role, text: item.text })),
      outcomeSummary: scene?.outcomePacket?.summary || null,
      playerVisibleFacts: asArray(scene.playerVisibleFacts),
      knownActorIds,
      currentThreads: asArray(currentThreads).map((thread) => ({
        id: thread.id,
        status: thread.status,
        title: thread.title || null,
        summary: thread.summary || thread.playerSummary || thread.observableSeed || null,
        participants: unique(thread.participantIds || thread.participants || thread.linkedCrewIds)
      }))
    },
    allowedSignalKinds: SIGNAL_RULES.map((item) => item.kind),
    threadClosureShape: {
      threadId: 'must be one id from scene.currentThreads',
      resolved: true,
      transformed: false,
      summary: 'player-safe observable reason this exact thread reached a stopping point'
    }
  };
  try {
    const result = await generationRouter.generate('sceneDeltaExtractor', { prompt: JSON.stringify(request), structuredOutput: true, metadata: { anchorRange: deterministic.anchorRange } });
    const response = result?.response ?? result;
    const payload = modelPayload(response);
    const validated = validateSceneDeltaProposal(payload, { knownActorIds, currentThreads, scene });
    if (validated.ok && (validated.sceneDelta?.signals?.length || validated.sceneDelta?.threadClosures?.length)) return { sceneDelta: validated.sceneDelta, modelCall: cloneJson(result), fallback: false };
    return { sceneDelta: deterministic, modelCall: cloneJson(result), fallback: true, validationErrors: validated.errors };
  } catch (error) {
    return { sceneDelta: deterministic, modelCall: { ok: false, error: { message: error?.message || String(error) } }, fallback: true };
  }
}

export const __sceneDeltaExtractorTestHooks = Object.freeze({
  SIGNAL_RULES, normalizedMessages, anchorRange, sourceText, playerInterest,
  directCommitment, hashText, signalMatches, consolidateModelSignals
});
