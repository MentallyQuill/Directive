export const MISSION_COMPONENT_SCHEMA_VERSION = 1;

export const MISSION_COMPONENT_TYPES = Object.freeze([
  'note',
  'item',
  'itemStat',
  'shipIssue',
  'lead',
  'claim',
  'memory',
  'question',
  'quote',
  'procedure',
  'sourceDocument'
]);

export const MISSION_COMPONENT_STATUSES = Object.freeze([
  'active',
  'unresolved',
  'confirmed',
  'disputed',
  'superseded',
  'archived'
]);

export const MISSION_COMPONENT_SOURCE_AUTHORITIES = Object.freeze([
  'officialPacket',
  'personalAssessment',
  'dialogue',
  'playerObservation',
  'narration',
  'systemStatus',
  'unknown'
]);

const COMPONENT_TYPES = new Set(MISSION_COMPONENT_TYPES);
const COMPONENT_STATUSES = new Set(MISSION_COMPONENT_STATUSES);
const COMPONENT_SOURCE_AUTHORITIES = new Set(MISSION_COMPONENT_SOURCE_AUTHORITIES);
const COMMON_SUMMARY_TOKENS = new Set([
  'about',
  'after',
  'also',
  'before',
  'being',
  'from',
  'have',
  'into',
  'that',
  'their',
  'there',
  'this',
  'with',
  'would'
]);

const DEFAULT_LINKS = Object.freeze({
  crewIds: [],
  shipSystemIds: [],
  missionIds: [],
  componentIds: []
});

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function boundedText(value = '', maxLength = 240) {
  const text = cleanText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function stringArray(value = [], limit = 12, maxLength = 80) {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values
    .map((item) => cleanText(item))
    .filter(Boolean)
    .map((item) => boundedText(item, maxLength)))]
    .slice(0, limit);
}

function timestamp(now = null) {
  if (typeof now === 'function') return now();
  if (typeof now === 'string' && now.trim()) return now;
  return new Date().toISOString();
}

function fnv1a(text = '') {
  return stableTextHash(text);
}

function normalizeEnum(value, allowed, fallback) {
  const text = cleanText(value);
  return allowed.has(text) ? text : fallback;
}

function normalizeLinks(value = {}) {
  const source = isObject(value) ? value : {};
  return {
    crewIds: stringArray(source.crewIds, 16, 120),
    shipSystemIds: stringArray(source.shipSystemIds, 16, 160),
    missionIds: stringArray(source.missionIds, 16, 180),
    componentIds: stringArray(source.componentIds, 24, 180)
  };
}

function restrictLinksToKnown(value = {}, known = {}) {
  const source = normalizeLinks(value);
  const allowed = normalizeLinks(known);
  const filterKnown = (items = [], knownItems = []) => {
    const allowedSet = new Set(knownItems);
    return items.filter((item) => allowedSet.has(item));
  };
  return {
    crewIds: filterKnown(source.crewIds, allowed.crewIds),
    shipSystemIds: filterKnown(source.shipSystemIds, allowed.shipSystemIds),
    missionIds: filterKnown(source.missionIds, allowed.missionIds),
    componentIds: filterKnown(source.componentIds, allowed.componentIds)
  };
}

function normalizeSource(value = {}, {
  selectedText = '',
  messageText = '',
  now = null
} = {}) {
  const source = isObject(value) ? value : {};
  const selectionText = String(selectedText || source.selectedText || source.verbatim || source.text || '').trim();
  const fullMessageText = String(messageText || source.messageText || source.fullText || '');
  const offset = findSelectionOffsets(fullMessageText, selectionText);
  return {
    host: cleanText(source.host) || 'sillytavern',
    chatId: cleanText(source.chatId || source.chat_id || source.currentChatId),
    hostMessageId: cleanText(source.hostMessageId || source.messageId || source.id),
    messageRole: normalizeMessageRole(source.messageRole || source.role || source.senderRole, source),
    messageName: cleanText(source.messageName || source.name || source.senderName),
    textHash: cleanText(source.textHash) || fnv1a(fullMessageText),
    selectionHash: cleanText(source.selectionHash) || fnv1a(selectionText),
    selectionStart: Number.isInteger(source.selectionStart) ? source.selectionStart : offset.selectionStart,
    selectionEnd: Number.isInteger(source.selectionEnd) ? source.selectionEnd : offset.selectionEnd,
    capturedAt: cleanText(source.capturedAt) || timestamp(now),
    outcomeId: cleanText(source.outcomeId),
    ingressId: cleanText(source.ingressId),
    sourceStatus: cleanText(source.sourceStatus) || 'active'
  };
}

function normalizeMessageRole(value = '', source = {}) {
  const role = cleanText(value).toLowerCase();
  if (['assistant', 'user', 'system'].includes(role)) return role;
  if (source.isUser === true || source.is_user === true) return 'user';
  if (source.isSystem === true || source.is_system === true) return 'system';
  return 'assistant';
}

function findSelectionOffsets(messageText = '', selectionText = '') {
  const haystack = String(messageText || '');
  const needle = String(selectionText || '');
  if (!haystack || !needle) return { selectionStart: null, selectionEnd: null };
  const index = haystack.indexOf(needle);
  if (index >= 0) return { selectionStart: index, selectionEnd: index + needle.length };
  const compactNeedle = cleanText(needle);
  if (!compactNeedle) return { selectionStart: null, selectionEnd: null };
  const compactHaystack = cleanText(haystack);
  const compactIndex = compactHaystack.indexOf(compactNeedle);
  if (compactIndex < 0) return { selectionStart: null, selectionEnd: null };
  return { selectionStart: null, selectionEnd: null };
}

export function normalizeMissionComponentSourceText(value = '') {
  return cleanText(String(value || '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/^[ \t]*(?:[-+*]\s+|\d+[.)]\s+)/gm, '')
    .replace(/[*_~]/g, ''));
}

export function matchMissionComponentSourceText(selectedText = '', candidates = []) {
  const selected = String(selectedText || '').trim();
  if (!selected) return { ok: false, text: '', match: 'missing-selection' };
  const sourceTexts = [...new Set((Array.isArray(candidates) ? candidates : [candidates])
    .map((candidate) => String(candidate || ''))
    .filter(Boolean))];
  const normalizedSelected = cleanText(selected);
  const renderedSelected = normalizeMissionComponentSourceText(selected);

  for (const text of sourceTexts) {
    if (text.includes(selected)) return { ok: true, text, match: 'exact' };
  }
  for (const text of sourceTexts) {
    if (cleanText(text).includes(normalizedSelected)) return { ok: true, text, match: 'whitespace' };
  }
  for (const text of sourceTexts) {
    if (renderedSelected && normalizeMissionComponentSourceText(text).includes(renderedSelected)) {
      return { ok: true, text, match: 'rendered-markdown' };
    }
  }
  return { ok: false, text: '', match: 'stale' };
}

function normalizeDerived(value = {}) {
  const source = isObject(value) ? value : {};
  return {
    utilityModelCallId: cleanText(source.utilityModelCallId),
    warnings: stringArray(source.warnings, 8, 220),
    summaryTextHash: cleanText(source.summaryTextHash)
  };
}

function normalizeLifecycle(value = {}, { now = null, existing = null } = {}) {
  const source = isObject(value) ? value : {};
  const createdAt = cleanText(source.createdAt || existing?.createdAt) || timestamp(now);
  const lifecycle = {
    createdAt,
    updatedAt: cleanText(source.updatedAt) || timestamp(now),
    createdBy: cleanText(source.createdBy || existing?.createdBy) || 'player',
    reviewed: source.reviewed !== false
  };
  const archivedAt = cleanText(source.archivedAt || existing?.archivedAt);
  if (archivedAt) lifecycle.archivedAt = archivedAt;
  return lifecycle;
}

export function normalizeMissionComponentRecord(value = {}, {
  now = null,
  existing = null
} = {}) {
  const source = isObject(value) ? value : {};
  const verbatim = String(source.verbatim || source.selectedText || source.sourceText || '').trim();
  const title = boundedText(source.title || deriveTitle(verbatim), 120);
  const summary = boundedText(source.summary || verbatim, 520);
  const normalizedSource = normalizeSource(source.source, {
    selectedText: verbatim,
    messageText: source.source?.messageText || source.message?.text || '',
    now
  });
  return {
    id: cleanText(source.id || existing?.id),
    title,
    type: normalizeEnum(source.type, COMPONENT_TYPES, 'note'),
    status: normalizeEnum(source.status, COMPONENT_STATUSES, 'active'),
    summary,
    verbatim,
    sourceAuthority: normalizeEnum(source.sourceAuthority, COMPONENT_SOURCE_AUTHORITIES, 'unknown'),
    tags: stringArray(source.tags, 12, 48),
    links: normalizeLinks(source.links || DEFAULT_LINKS),
    source: normalizedSource,
    derived: {
      ...normalizeDerived(source.derived),
      summaryTextHash: cleanText(source.derived?.summaryTextHash) || fnv1a(summary)
    },
    lifecycle: normalizeLifecycle(source.lifecycle, { now, existing: existing?.lifecycle || null })
  };
}

export function normalizeMissionComponentsState(value = {}) {
  const source = isObject(value) ? value : {};
  const records = Array.isArray(source.records)
    ? source.records.map((record) => normalizeMissionComponentRecord(record)).filter((record) => record.id && record.verbatim)
    : [];
  return {
    schemaVersion: MISSION_COMPONENT_SCHEMA_VERSION,
    records
  };
}

export function missionComponentsState(campaignState = {}) {
  return normalizeMissionComponentsState(campaignState?.knowledgeLedger?.components || {});
}

function assertSelectedText(value) {
  const text = String(value || '').trim();
  if (!text) {
    const error = new Error('Selected text is required to create a Mission Component.');
    error.code = 'DIRECTIVE_MISSION_COMPONENT_SELECTION_REQUIRED';
    throw error;
  }
  return text;
}

function sourceFromSelection(payload = {}) {
  const selection = isObject(payload?.selection) ? payload.selection : payload;
  const message = isObject(selection.message) ? selection.message : {};
  const selectedText = assertSelectedText(
    selection.selectedText
    || selection.selectionText
    || selection.text
    || selection.verbatim
  );
  const messageText = String(
    message.text
    || selection.messageText
    || selection.fullText
    || ''
  );
  return {
    selectedText,
    source: normalizeSource({
      host: selection.host || selection.hostId || 'sillytavern',
      chatId: selection.chatId || selection.currentChatId,
      hostMessageId: message.hostMessageId || message.id || selection.hostMessageId || selection.messageId,
      messageRole: message.messageRole || message.role || selection.messageRole,
      messageName: message.name || message.messageName || selection.messageName,
      isUser: message.isUser === true || message.is_user === true || selection.isUser === true || selection.is_user === true,
      is_user: message.isUser === true || message.is_user === true || selection.isUser === true || selection.is_user === true,
      isSystem: message.isSystem === true || message.is_system === true || selection.isSystem === true || selection.is_system === true,
      is_system: message.isSystem === true || message.is_system === true || selection.isSystem === true || selection.is_system === true,
      messageText,
      selectionStart: Number.isInteger(selection.selectionStart) ? selection.selectionStart : null,
      selectionEnd: Number.isInteger(selection.selectionEnd) ? selection.selectionEnd : null,
      outcomeId: message.outcomeId || selection.outcomeId,
      ingressId: message.ingressId || selection.ingressId
    }, {
      selectedText,
      messageText,
      now: selection.capturedAt || null
    }),
    message: {
      hostMessageId: cleanText(message.hostMessageId || message.id || selection.hostMessageId || selection.messageId),
      index: Number.isInteger(message.index) ? message.index : (Number.isInteger(selection.index) ? selection.index : null),
      text: messageText,
      role: normalizeMessageRole(message.messageRole || message.role || selection.messageRole, message),
      name: cleanText(message.name || message.messageName || selection.messageName),
      isUser: message.isUser === true || message.is_user === true || selection.isUser === true || selection.is_user === true || selection.messageRole === 'user',
      isSystem: message.isSystem === true || message.is_system === true || selection.isSystem === true || selection.is_system === true || selection.messageRole === 'system'
    }
  };
}

function packageCrewRecords(packageData = null, crewDataset = null) {
  return [
    ...(Array.isArray(packageData?.crew?.senior) ? packageData.crew.senior : []),
    ...(Array.isArray(crewDataset?.officers) ? crewDataset.officers : []),
    ...(Array.isArray(crewDataset?.crew) ? crewDataset.crew : [])
  ].filter((entry) => entry?.id);
}

function linkCrewIds(text = '', packageData = null, crewDataset = null) {
  const normalized = cleanText(text).toLowerCase();
  const ids = [];
  for (const crew of packageCrewRecords(packageData, crewDataset)) {
    const names = [
      crew.name,
      crew.shortName,
      crew.familyName,
      ...(Array.isArray(crew.aliases) ? crew.aliases : [])
    ].map((item) => cleanText(item)).filter(Boolean);
    if (names.some((name) => normalized.includes(name.toLowerCase()))) {
      ids.push(crew.id);
    }
  }
  return stringArray(ids, 12, 120);
}

function linkShipSystemIds(text = '') {
  const normalized = cleanText(text).toLowerCase();
  const matches = [];
  const systems = [
    ['ship.port-nacelle', ['port nacelle', 'nacelle']],
    ['ship.coolant-system', ['coolant', 'coolant seal']],
    ['ship.sensor-array', ['sensor', 'lateral array', 'array variance']],
    ['ship.command-network', ['command network', 'command-network', 'command codes', 'handoff']],
    ['ship.medical', ['sickbay', 'medical', 'physicals', 'doctor']],
    ['ship.engineering', ['engineering', 'warp', 'impulse', 'refit']]
  ];
  for (const [id, aliases] of systems) {
    if (aliases.some((alias) => normalized.includes(alias))) matches.push(id);
  }
  return stringArray(matches, 12, 160);
}

function inferType(text = '', { messageRole = 'assistant' } = {}) {
  const normalized = cleanText(text).toLowerCase();
  if (/\?/.test(normalized)) return 'question';
  if (/^["']|["']$/.test(cleanText(text)) || /\b(?:said|asked|replied|murmured|told)\b/.test(normalized)) return 'quote';
  if (messageRole === 'user') {
    if (/\b(?:i will|i'll|start with|follow up|ask|meet|check|inspect|review)\b/.test(normalized)) return 'lead';
    if (/\b(?:might|maybe|i think|could be|seems|suspect)\b/.test(normalized)) return 'question';
    return 'claim';
  }
  if (/\b(?:protocol|procedure|standing order|access|authorization|command code|method)\b/.test(normalized)) return 'procedure';
  if (/\b(?:seal|fracture|repair|replacement|install|pending|failure|fail|variance|handoff|refit|warp|nacelle|sensor|medical|physical|yard)\b/.test(normalized)) return 'shipIssue';
  if (/\b(?:packet|briefing|report|memo|manifest|log|file|record)\b/.test(normalized)) return 'sourceDocument';
  if (/\b(?:device|part|sample|artifact|tool|item|component)\b/.test(normalized)) return 'item';
  if (/\b(?:owner|location|condition|range|charge|capability|limitation|property|stat)\b/.test(normalized)) return 'itemStat';
  if (/\b(?:remember|memory|recalled|last time|previously)\b/.test(normalized)) return 'memory';
  if (/\b(?:ask|inspect|review|follow up|lead|route|next)\b/.test(normalized)) return 'lead';
  if (/\b(?:assessment|believes|thinks|claims|says|advice|read)\b/.test(normalized)) return 'claim';
  return 'note';
}

function inferStatus(type = 'note', text = '') {
  const normalized = cleanText(text).toLowerCase();
  if (/\b(?:pending|unresolved|unknown|question|follow up|needs|need to|will fail|not yet|disputed|investigate)\b/.test(normalized)) return 'unresolved';
  if (/\b(?:confirmed|complete|installed|resolved|verified)\b/.test(normalized)) return 'confirmed';
  if (type === 'shipIssue' || type === 'question' || type === 'lead') return 'unresolved';
  return 'active';
}

function inferSourceAuthority(text = '', { messageRole = 'assistant' } = {}) {
  if (messageRole === 'user') return 'playerObservation';
  const normalized = cleanText(text).toLowerCase();
  if (/\b(?:status\s*:|official|packet|briefing|report|memo|manifest|log|record|yard report)\b/.test(normalized)) return 'officialPacket';
  if (/\b(?:assessment|advice|my read|i think|believes|personal note)\b/.test(normalized)) return 'personalAssessment';
  if (/\b(?:sensor|display|system status|ship status|readout|scan)\b/.test(normalized)) return 'systemStatus';
  if (/^["']|["']$/.test(cleanText(text))) return 'dialogue';
  return 'narration';
}

function inferTags(text = '', type = 'note') {
  const normalized = cleanText(text).toLowerCase();
  const tags = [type];
  const candidates = [
    ['post-refit', ['refit', 'yard']],
    ['engineering', ['engineering', 'cross', 'warp', 'nacelle', 'coolant']],
    ['medical', ['medical', 'sato', 'physical', 'sickbay']],
    ['operations', ['operations', 'nayar', 'handoff', 'command network']],
    ['tactical', ['tactical', 'security', 'bronn']],
    ['source', ['packet', 'briefing', 'report', 'memo']],
    ['follow-up', ['pending', 'follow up', 'ask', 'review', 'inspect']]
  ];
  for (const [tag, needles] of candidates) {
    if (needles.some((needle) => normalized.includes(needle))) tags.push(tag);
  }
  return stringArray(tags, 10, 48);
}

function deriveTitle(text = '') {
  const normalized = cleanText(text);
  if (!normalized) return 'Mission Component';
  const statusMatch = normalized.match(/\b(?:coolant seal|command-network handoff|lateral-array variance|post-refit physicals?|briefing packet|replacement part|command codes?)\b/i);
  if (statusMatch) return sentenceTitle(statusMatch[0]);
  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] || normalized;
  return sentenceTitle(firstSentence.replace(/^status:\s*/i, '').slice(0, 90));
}

function sentenceTitle(text = '') {
  const words = cleanText(text)
    .replace(/^[#*\-\s]+/, '')
    .split(/\s+/)
    .slice(0, 9);
  const joined = words.join(' ');
  return joined ? joined[0].toUpperCase() + joined.slice(1) : 'Mission Component';
}

function parseJsonText(text = '') {
  const raw = String(text || '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  if (!raw || !/^[{[]/.test(raw)) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function providerPayloadFromResponse(response = {}) {
  if (isObject(response?.content)) return cloneJson(response.content);
  if (isObject(response?.json)) return cloneJson(response.json);
  if (isObject(response?.data)) return cloneJson(response.data);
  if (isObject(response?.structuredOutput)) return cloneJson(response.structuredOutput);
  if (isObject(response) && (response.title || response.type || response.summary)) return cloneJson(response);
  const text = response?.text || response?.content || response?.raw?.text || '';
  return parseJsonText(text);
}

function titleIdPart(title = '') {
  return cleanText(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'component';
}

function proposalFromSelectedText({
  selectedText,
  source,
  message,
  campaignState = null,
  packageData = null,
  crewDataset = null
} = {}) {
  const messageRole = message?.role || source?.messageRole;
  const type = inferType(selectedText, { messageRole });
  const sourceAuthority = inferSourceAuthority(selectedText, { messageRole });
  const links = normalizeLinks({
    crewIds: linkCrewIds(selectedText, packageData, crewDataset),
    shipSystemIds: linkShipSystemIds(selectedText),
    missionIds: [campaignState?.mission?.activeMissionId || campaignState?.mission?.activeMissionGraphId].filter(Boolean),
    componentIds: []
  });
  return {
    title: deriveTitle(selectedText),
    type,
    status: inferStatus(type, selectedText),
    summary: boundedText(selectedText, 420),
    sourceAuthority,
    tags: inferTags(selectedText, type),
    links,
    warnings: []
  };
}

function summaryFaithfulToSource(summary = '', sourceText = '') {
  const summaryText = cleanText(summary).toLowerCase();
  const source = cleanText(sourceText).toLowerCase();
  if (!summaryText || !source) return false;
  if (source.includes(summaryText)) return true;
  const tokens = summaryText
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !COMMON_SUMMARY_TOKENS.has(token));
  if (!tokens.length) return true;
  const matched = tokens.filter((token) => source.includes(token)).length;
  return matched / tokens.length >= 0.55;
}

function normalizeProviderProposal(payload = {}, fallback = {}) {
  const source = isObject(payload) ? payload : {};
  const type = normalizeEnum(source.type, COMPONENT_TYPES, fallback.type || 'note');
  let status = normalizeEnum(source.status, COMPONENT_STATUSES, fallback.status || inferStatus(type, fallback.summary || ''));
  let authority = normalizeEnum(source.sourceAuthority, COMPONENT_SOURCE_AUTHORITIES, fallback.sourceAuthority || 'unknown');
  if (fallback.status === 'unresolved' && status === 'active') status = 'unresolved';
  if (
    fallback.sourceAuthority === 'officialPacket'
    && ['personalAssessment', 'systemStatus', 'narration', 'unknown'].includes(authority)
  ) {
    authority = 'officialPacket';
  }
  let summary = boundedText(source.summary || fallback.summary || '', 520);
  const warnings = [
    ...(fallback.warnings || []),
    ...(Array.isArray(source.warnings) ? source.warnings : [])
  ];
  if (source.summary && !summaryFaithfulToSource(source.summary, fallback.summary || '')) {
    summary = boundedText(fallback.summary || '', 520);
    warnings.push('Utility summary introduced details outside the selected text; source excerpt used instead.');
  }
  return {
    title: boundedText(source.title || fallback.title || 'Mission Component', 120),
    type,
    status,
    summary,
    sourceAuthority: authority,
    tags: stringArray(source.tags?.length ? source.tags : fallback.tags, 12, 48),
    links: source.links ? restrictLinksToKnown(source.links, fallback.links) : normalizeLinks(fallback.links),
    warnings: stringArray(warnings, 8, 220)
  };
}

function missionComponentRequest({
  selectedText,
  source,
  campaignState = null,
  packageData = null,
  crewDataset = null,
  existingComponents = []
} = {}) {
  return {
    systemPrompt: [
      'You classify one highlighted chat passage into a reviewed Mission Component proposal.',
      'Use only the selected text and player-safe context provided.',
      'Do not promote the selected text into settled world truth.',
      'Return strict JSON with title, type, status, summary, sourceAuthority, tags, links, and warnings.'
    ].join('\n'),
    prompt: JSON.stringify({
      selectedText,
      source,
      allowedTypes: MISSION_COMPONENT_TYPES,
      allowedStatuses: MISSION_COMPONENT_STATUSES,
      allowedSourceAuthorities: MISSION_COMPONENT_SOURCE_AUTHORITIES,
      campaign: {
        id: campaignState?.campaign?.id || null,
        title: campaignState?.campaign?.title || null
      },
      mission: {
        activeMissionId: campaignState?.mission?.activeMissionId || null,
        activeMissionGraphId: campaignState?.mission?.activeMissionGraphId || null,
        phase: campaignState?.mission?.phase || campaignState?.mission?.activePhaseId || null
      },
      crew: packageCrewRecords(packageData, crewDataset).map((crew) => ({
        id: crew.id,
        name: crew.name || crew.id,
        billet: crew.billet || crew.role || ''
      })).slice(0, 24),
      existingComponents: existingComponents.slice(-8).map((record) => ({
        id: record.id,
        title: record.title,
        type: record.type,
        status: record.status
      }))
    }, null, 2),
    messages: [
      {
        role: 'system',
        content: 'Classify highlighted chat text into a player-reviewed Mission Component proposal. Return only JSON.'
      },
      {
        role: 'user',
        content: JSON.stringify({ selectedText, source }, null, 2)
      }
    ],
    structuredOutput: true,
    metadata: {
      source: 'mission-components',
      sourceMessageId: source?.hostMessageId || null,
      selectionHash: source?.selectionHash || fnv1a(selectedText)
    },
    parameters: {
      temperature: 0.1,
      top_p: 0.9,
      max_tokens: 900
    }
  };
}

export async function prepareMissionComponentSelection({
  selection = {},
  campaignState = null,
  packageData = null,
  crewDataset = null,
  generationRouter = null,
  useProvider = true
} = {}) {
  const normalized = sourceFromSelection(selection);
  const existingComponents = missionComponentsState(campaignState).records;
  const fallback = proposalFromSelectedText({
    selectedText: normalized.selectedText,
    source: normalized.source,
    message: normalized.message,
    campaignState,
    packageData,
    crewDataset
  });
  let proposal = fallback;
  let diagnostics = {
    providerUsed: false,
    providerOutputRejected: false,
    providerId: null,
    model: null,
    error: null
  };

  if (useProvider !== false && typeof generationRouter?.generate === 'function') {
    const request = missionComponentRequest({
      selectedText: normalized.selectedText,
      source: normalized.source,
      campaignState,
      packageData,
      crewDataset,
      existingComponents
    });
    const generated = await generationRouter.generate('utilityJson', request);
    diagnostics = {
      providerUsed: true,
      providerOutputRejected: false,
      providerId: generated?.diagnostics?.providerId || generated?.response?.providerId || null,
      model: generated?.diagnostics?.model || generated?.response?.model || null,
      error: cloneJson(generated?.error || null)
    };
    if (generated?.ok) {
      const payload = providerPayloadFromResponse(generated.response || {});
      if (payload) {
        proposal = normalizeProviderProposal(payload, fallback);
      } else {
        diagnostics.providerOutputRejected = true;
        proposal = {
          ...fallback,
          warnings: [
            ...(fallback.warnings || []),
            'Utility provider response could not be parsed; local proposal used.'
          ]
        };
      }
    } else {
      proposal = {
        ...fallback,
        warnings: [
          ...(fallback.warnings || []),
          boundedText(generated?.error?.message || 'Utility provider unavailable; local proposal used.', 220)
        ]
      };
    }
  }

  return {
    kind: 'directive.missionComponents.prepare',
    ok: true,
    selectedText: normalized.selectedText,
    source: cloneJson(normalized.source),
    message: cloneJson(normalized.message),
    proposal: normalizeProviderProposal(proposal, fallback),
    diagnostics
  };
}

function assertComponentInput(input = {}) {
  const title = cleanText(input.title);
  const type = normalizeEnum(input.type, COMPONENT_TYPES, '');
  const status = normalizeEnum(input.status, COMPONENT_STATUSES, '');
  const sourceAuthority = normalizeEnum(input.sourceAuthority, COMPONENT_SOURCE_AUTHORITIES, '');
  const verbatim = String(input.verbatim || input.selectedText || input.sourceText || '').trim();
  if (!title) throw new Error('Mission Component title is required.');
  if (!type) throw new Error('Mission Component type is invalid.');
  if (!status) throw new Error('Mission Component status is invalid.');
  if (!sourceAuthority) throw new Error('Mission Component source authority is invalid.');
  if (!verbatim) throw new Error('Mission Component source text is required.');
}

export function addMissionComponent(campaignState = {}, componentInput = {}, {
  idFactory = null,
  now = null
} = {}) {
  assertComponentInput(componentInput);
  const components = missionComponentsState(campaignState);
  const createdAt = timestamp(now);
  const id = cleanText(componentInput.id)
    || (typeof idFactory === 'function'
      ? idFactory(`component-${titleIdPart(componentInput.title)}`)
      : `component:${titleIdPart(componentInput.title)}:${fnv1a(`${componentInput.verbatim || componentInput.selectedText || ''}:${createdAt}`).slice(1)}`);
  const record = normalizeMissionComponentRecord({
    ...cloneJson(componentInput),
    id,
    lifecycle: {
      ...(componentInput.lifecycle || {}),
      createdAt,
      updatedAt: createdAt,
      createdBy: componentInput.lifecycle?.createdBy || 'player',
      reviewed: true
    }
  }, { now: createdAt });
  const nextState = cloneJson(campaignState || {});
  nextState.knowledgeLedger = isObject(nextState.knowledgeLedger) ? nextState.knowledgeLedger : {
    schemaVersion: 2,
    facts: [],
    rumors: [],
    contradictions: []
  };
  nextState.knowledgeLedger.components = {
    schemaVersion: MISSION_COMPONENT_SCHEMA_VERSION,
    records: [
      ...components.records.filter((entry) => entry.id !== id),
      record
    ]
  };
  return { campaignState: nextState, component: record };
}

export function updateMissionComponent(campaignState = {}, componentId = '', patch = {}, {
  now = null
} = {}) {
  const id = cleanText(componentId || patch.id);
  if (!id) throw new Error('Mission Component id is required.');
  const components = missionComponentsState(campaignState);
  const existing = components.records.find((record) => record.id === id);
  if (!existing) {
    const error = new Error(`Mission Component "${id}" was not found.`);
    error.code = 'DIRECTIVE_MISSION_COMPONENT_NOT_FOUND';
    throw error;
  }
  const updated = normalizeMissionComponentRecord({
    ...existing,
    ...cloneJson(patch),
    id,
    verbatim: existing.verbatim,
    source: {
      ...(existing.source || {}),
      selectionHash: existing.source?.selectionHash,
      textHash: patch.source?.textHash || existing.source?.textHash,
      sourceStatus: patch.source?.sourceStatus || existing.source?.sourceStatus
    },
    lifecycle: {
      ...(existing.lifecycle || {}),
      ...(patch.lifecycle || {}),
      updatedAt: timestamp(now)
    }
  }, { now, existing });
  const nextState = cloneJson(campaignState || {});
  nextState.knowledgeLedger = isObject(nextState.knowledgeLedger) ? nextState.knowledgeLedger : {
    schemaVersion: 2,
    facts: [],
    rumors: [],
    contradictions: []
  };
  nextState.knowledgeLedger.components = {
    schemaVersion: MISSION_COMPONENT_SCHEMA_VERSION,
    records: components.records.map((record) => (record.id === id ? updated : record))
  };
  return { campaignState: nextState, component: updated };
}

export function archiveMissionComponent(campaignState = {}, componentId = '', {
  now = null
} = {}) {
  const archivedAt = timestamp(now);
  return updateMissionComponent(campaignState, componentId, {
    status: 'archived',
    lifecycle: {
      archivedAt
    }
  }, { now: archivedAt });
}

export function findMissionComponent(campaignState = {}, componentId = '') {
  const id = cleanText(componentId);
  if (!id) return null;
  return missionComponentsState(campaignState).records.find((record) => record.id === id) || null;
}

export function markMissionComponentsSourceStatus(campaignState = {}, hostMessageId = '', {
  sourceStatus = 'stale',
  now = null
} = {}) {
  const id = cleanText(hostMessageId);
  if (!id) return { campaignState, markedCount: 0 };
  const components = missionComponentsState(campaignState);
  let markedCount = 0;
  const nextRecords = components.records.map((record) => {
    if (record.source?.hostMessageId !== id) return record;
    const status = cleanText(sourceStatus) || 'stale';
    if (record.source?.sourceStatus === status) return record;
    markedCount += 1;
    return {
      ...record,
      source: {
        ...(record.source || {}),
        sourceStatus: status
      },
      lifecycle: {
        ...(record.lifecycle || {}),
        updatedAt: timestamp(now)
      }
    };
  });
  if (!markedCount) return { campaignState, markedCount: 0 };
  const nextState = cloneJson(campaignState || {});
  nextState.knowledgeLedger = isObject(nextState.knowledgeLedger) ? nextState.knowledgeLedger : {
    schemaVersion: 2,
    facts: [],
    rumors: [],
    contradictions: []
  };
  nextState.knowledgeLedger.components = {
    schemaVersion: MISSION_COMPONENT_SCHEMA_VERSION,
    records: nextRecords
  };
  return { campaignState: nextState, markedCount };
}

export const __missionComponentsTestHooks = Object.freeze({
  fnv1a,
  inferType,
  inferStatus,
  inferSourceAuthority,
  sourceFromSelection,
  proposalFromSelectedText,
  providerPayloadFromResponse,
  normalizeProviderProposal,
  restrictLinksToKnown,
  summaryFaithfulToSource
});
import { stableTextHash } from './scene-reconciliation.mjs';
