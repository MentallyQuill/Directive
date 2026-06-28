import { extractProviderResponseText } from '../providers/provider-response-normalizer.mjs';
import { parseStructuredJsonText } from '../providers/structured-output-parser.mjs';

export const DEFINE_SELECTION_ROLE_ID = 'defineSelection';

export const DEFINE_SELECTION_CATEGORY_IDS = Object.freeze([
  'character',
  'groupFactionInstitution',
  'speciesCulture',
  'rankTitleProtocol',
  'locationPlace',
  'shipSystemTechnicalTerm',
  'objectItemEvidence',
  'missionQuestThread',
  'eventIncident',
  'procedureRuleLaw',
  'claimRumorUnverified',
  'relationshipSocialDynamic',
  'threatHazardRisk',
  'resourceConstraint',
  'timelineTimeReference',
  'acronymJargonProperNoun',
  'toneSubtext',
  'ambiguousSelection'
]);

const CATEGORY_SET = new Set(DEFINE_SELECTION_CATEGORY_IDS);

export const DEFINE_SELECTION_CATEGORIES = Object.freeze({
  character: {
    id: 'character',
    label: 'Character / Person',
    matchSignals: Object.freeze(['crew-name', 'alias', 'rank-plus-name', 'local-pronoun-reference']),
    requiredSections: Object.freeze(['shortAnswer', 'sceneContext', 'knownInferredUnknown']),
    optionalSections: Object.freeze(['properAddress', 'relationshipContext', 'risks', 'followUpQuestions']),
    relatedIndexes: Object.freeze(['crew', 'mission', 'components', 'commandLog'])
  },
  groupFactionInstitution: {
    id: 'groupFactionInstitution',
    label: 'Group / Faction / Institution',
    matchSignals: Object.freeze(['department', 'faction', 'institution', 'team']),
    requiredSections: Object.freeze(['shortAnswer', 'sceneContext', 'whyItMatters']),
    optionalSections: Object.freeze(['protocol', 'sourceReliability', 'related'])
  },
  speciesCulture: {
    id: 'speciesCulture',
    label: 'Species / Culture',
    matchSignals: Object.freeze(['species', 'culture', 'etiquette']),
    requiredSections: Object.freeze(['shortAnswer', 'sceneContext', 'playerSafeLimits']),
    optionalSections: Object.freeze(['protocol', 'subtext'])
  },
  rankTitleProtocol: {
    id: 'rankTitleProtocol',
    label: 'Rank / Title / Protocol',
    matchSignals: Object.freeze(['rank-token', 'title-token', 'protocol']),
    requiredSections: Object.freeze(['shortAnswer', 'properAddress', 'protocol']),
    optionalSections: Object.freeze(['whyItMatters', 'risks'])
  },
  locationPlace: {
    id: 'locationPlace',
    label: 'Location / Place',
    matchSignals: Object.freeze(['location', 'deck', 'room', 'region']),
    requiredSections: Object.freeze(['shortAnswer', 'sceneContext']),
    optionalSections: Object.freeze(['risks', 'related'])
  },
  shipSystemTechnicalTerm: {
    id: 'shipSystemTechnicalTerm',
    label: 'Ship System / Technical Term',
    matchSignals: Object.freeze(['ship-system', 'technical-term', 'engineering-term']),
    requiredSections: Object.freeze(['shortAnswer', 'operationalMeaning', 'whyItMatters']),
    optionalSections: Object.freeze(['risks', 'followUpQuestions'])
  },
  objectItemEvidence: {
    id: 'objectItemEvidence',
    label: 'Object / Item / Evidence',
    matchSignals: Object.freeze(['item', 'object', 'evidence', 'document']),
    requiredSections: Object.freeze(['shortAnswer', 'sourceReliability', 'whyItMatters']),
    optionalSections: Object.freeze(['risks', 'related'])
  },
  missionQuestThread: {
    id: 'missionQuestThread',
    label: 'Mission / Quest / Thread',
    matchSignals: Object.freeze(['mission', 'quest', 'thread', 'objective', 'assignment']),
    requiredSections: Object.freeze(['shortAnswer', 'sceneContext', 'whyItMatters']),
    optionalSections: Object.freeze(['followUpQuestions', 'timeline'])
  },
  eventIncident: {
    id: 'eventIncident',
    label: 'Event / Incident',
    matchSignals: Object.freeze(['incident', 'event', 'accident', 'inspection']),
    requiredSections: Object.freeze(['shortAnswer', 'timeline', 'whyItMatters']),
    optionalSections: Object.freeze(['unknown', 'risks'])
  },
  procedureRuleLaw: {
    id: 'procedureRuleLaw',
    label: 'Procedure / Rule / Law',
    matchSignals: Object.freeze(['procedure', 'rule', 'law', 'protocol']),
    requiredSections: Object.freeze(['shortAnswer', 'protocol', 'whyItMatters']),
    optionalSections: Object.freeze(['risks', 'followUpQuestions'])
  },
  claimRumorUnverified: {
    id: 'claimRumorUnverified',
    label: 'Claim / Rumor / Unverified Information',
    matchSignals: Object.freeze(['claim', 'rumor', 'reported', 'alleged']),
    requiredSections: Object.freeze(['shortAnswer', 'sourceReliability', 'knownInferredUnknown']),
    optionalSections: Object.freeze(['followUpQuestions'])
  },
  relationshipSocialDynamic: {
    id: 'relationshipSocialDynamic',
    label: 'Relationship / Social Dynamic',
    matchSignals: Object.freeze(['relationship', 'gesture', 'address-choice', 'social-signal']),
    requiredSections: Object.freeze(['shortAnswer', 'subtext', 'knownInferredUnknown']),
    optionalSections: Object.freeze(['relationshipContext', 'risks'])
  },
  threatHazardRisk: {
    id: 'threatHazardRisk',
    label: 'Threat / Hazard / Risk',
    matchSignals: Object.freeze(['threat', 'hazard', 'risk', 'danger']),
    requiredSections: Object.freeze(['shortAnswer', 'risks', 'whyItMatters']),
    optionalSections: Object.freeze(['followUpQuestions'])
  },
  resourceConstraint: {
    id: 'resourceConstraint',
    label: 'Resource / Constraint',
    matchSignals: Object.freeze(['time-limit', 'resource', 'constraint', 'capacity']),
    requiredSections: Object.freeze(['shortAnswer', 'whyItMatters']),
    optionalSections: Object.freeze(['timeline', 'risks', 'followUpQuestions'])
  },
  timelineTimeReference: {
    id: 'timelineTimeReference',
    label: 'Timeline / Time Reference',
    matchSignals: Object.freeze(['stardate', 'shift', 'deadline', 'relative-time']),
    requiredSections: Object.freeze(['shortAnswer', 'timeline', 'sceneContext']),
    optionalSections: Object.freeze(['unknown'])
  },
  acronymJargonProperNoun: {
    id: 'acronymJargonProperNoun',
    label: 'Acronym / Jargon / Proper Noun',
    matchSignals: Object.freeze(['acronym', 'jargon', 'proper-noun']),
    requiredSections: Object.freeze(['shortAnswer', 'terminology']),
    optionalSections: Object.freeze(['whyItMatters', 'related'])
  },
  toneSubtext: {
    id: 'toneSubtext',
    label: 'Tone / Subtext',
    matchSignals: Object.freeze(['tone', 'subtext', 'loaded-phrase', 'formal-address']),
    requiredSections: Object.freeze(['shortAnswer', 'subtext', 'knownInferredUnknown']),
    optionalSections: Object.freeze(['relationshipContext', 'followUpQuestions'])
  },
  ambiguousSelection: {
    id: 'ambiguousSelection',
    label: 'Ambiguous Selection',
    matchSignals: Object.freeze(['low-information', 'pronoun', 'generic-reference']),
    requiredSections: Object.freeze(['shortAnswer', 'possibleMeanings', 'unknown']),
    optionalSections: Object.freeze(['followUpQuestions'])
  }
});

export const DEFINE_SELECTION_SECTION_PROFILES = Object.freeze({
  shortAnswer: 'Two to four sentences defining the selected subject in the current scene.',
  sceneContext: 'What the source and current scene establish about the subject.',
  whyItMatters: 'Operational, social, mission, or continuity relevance.',
  properAddress: 'Rank, billet, address, or protocol wording when applicable.',
  operationalMeaning: 'Plain in-universe operational meaning.',
  sourceReliability: 'Who established the information and how reliable it appears.',
  relationshipContext: 'Player-safe relationship or social context.',
  risks: 'Visible risks, hazards, or caution flags.',
  followUpQuestions: 'Useful in-universe questions the player may ask.',
  timeline: 'Chronology, shift, deadline, or timing context.',
  terminology: 'Acronym, jargon, or proper-noun explanation.',
  subtext: 'Tone or subtext without mind-reading.',
  playerSafeLimits: 'What cannot be stated because it is hidden or unsupported.',
  possibleMeanings: 'Plausible referents when the selection is unclear.',
  knownInferredUnknown: 'Separated known, inferred, and unknown content.',
  related: 'Related crew, systems, missions, components, or log records.'
});

const RANK_TOKENS = Object.freeze([
  'captain',
  'commander',
  'lieutenant',
  'ensign',
  'admiral',
  'chief',
  'doctor',
  'xo',
  'executive officer',
  'acting chief'
]);

const SPECIES_TOKENS = Object.freeze([
  'andorian',
  'bajoran',
  'betazoid',
  'cardassian',
  'ferengi',
  'human',
  'klingon',
  'romulan',
  'tellarite',
  'trill',
  'vulcan'
]);

const TECHNICAL_TOKENS = Object.freeze([
  'eps',
  'lcars',
  'warp',
  'impulse',
  'nacelle',
  'sensor',
  'array',
  'command network',
  'coolant',
  'bio-neural',
  'transporter',
  'shields',
  'phaser',
  'deflector',
  'plasma'
]);

const PROCEDURE_TOKENS = Object.freeze([
  'protocol',
  'procedure',
  'regulation',
  'standing order',
  'chain of command',
  'authorization',
  'quarantine',
  'relief of command',
  'inspection'
]);

const CLAIM_TOKENS = Object.freeze([
  'claims',
  'claim',
  'says',
  'said',
  'reported',
  'according to',
  'alleged',
  'rumor',
  'believes',
  'suspects'
]);

const TONE_TOKENS = Object.freeze([
  'with respect',
  'looked away',
  'did not use',
  'silence',
  'pause',
  'quietly',
  'flatly',
  'one way to describe it'
]);

const RISK_TOKENS = Object.freeze([
  'risk',
  'hazard',
  'danger',
  'radiation',
  'breach',
  'failure',
  'fail',
  'threat',
  'exposure',
  'unsafe'
]);

const RESOURCE_TOKENS = Object.freeze([
  'only',
  'limited',
  'capacity',
  'available',
  'shortage',
  'hours',
  'minutes',
  'deadline',
  'before departure',
  'certified'
]);

const GENERIC_AMBIGUOUS = new Set(['it', 'this', 'that', 'her', 'him', 'they', 'them', 'the issue', 'the problem', 'the thing']);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value = '', maxLength = 2000) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function hashText(value = '') {
  let hash = 0x811c9dc5;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values = []) {
  return [...new Set(values.map((value) => cleanText(value, 180)).filter(Boolean))];
}

function textIncludes(text = '', token = '') {
  return cleanText(text).toLowerCase().includes(cleanText(token).toLowerCase());
}

function addScore(scores, id, amount, signal) {
  const current = scores.get(id) || { id, score: 0, signals: [] };
  current.score += amount;
  if (signal && !current.signals.includes(signal)) current.signals.push(signal);
  scores.set(id, current);
}

function labelFromId(id = '') {
  const text = cleanText(id)
    .replace(/^crew[.:/-]/i, '')
    .replace(/^ship[.:/-]/i, '')
    .replace(/^mission[.:/-]/i, '')
    .replace(/[-_.]+/g, ' ');
  return text ? text.replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Selection';
}

function recordLabel(record = {}) {
  return cleanText(record.name || record.title || record.label || record.billet || record.id, 180);
}

function crewRecords(packageData = null, crewDataset = null, projection = null) {
  const byId = new Map();
  for (const record of asArray(crewDataset?.officers)) {
    if (record?.id) byId.set(record.id, { ...record, source: 'crewDataset' });
  }
  for (const record of asArray(crewDataset?.crew)) {
    if (record?.id && !byId.has(record.id)) byId.set(record.id, { ...record, source: 'crewDataset' });
  }
  for (const record of asArray(packageData?.crew?.senior)) {
    if (!record?.id) continue;
    byId.set(record.id, {
      ...(byId.get(record.id) || {}),
      ...record,
      source: 'package'
    });
  }
  for (const entry of asArray(projection?.crew?.visibleRelationships)) {
    if (!entry?.crewId) continue;
    byId.set(entry.crewId, {
      ...(byId.get(entry.crewId) || {}),
      id: entry.crewId,
      name: entry.crewName || byId.get(entry.crewId)?.name,
      visibleDescriptor: entry.visibleDescriptor || entry.summary || entry.stance
    });
  }
  return [...byId.values()].filter((record) => record.id);
}

function stringTerms(record = {}) {
  return unique([
    record.id,
    record.name,
    record.title,
    record.label,
    record.term,
    record.shortName,
    record.familyName,
    ...(asArray(record.aliases)),
    ...cleanText(record.name || record.title || record.label || record.term).split(/\s+/).filter((part) => part.length >= 3)
  ]);
}

function matchRecordsByTerms(text = '', records = []) {
  const normalized = cleanText(text).toLowerCase();
  if (!normalized) return [];
  return records.filter((record) => stringTerms(record).some((term) => {
    const clean = cleanText(term).toLowerCase();
    if (!clean || clean.length < 2) return false;
    return normalized === clean || normalized.includes(clean) || clean.includes(normalized);
  }));
}

function componentRecords(campaignState = null) {
  return asArray(campaignState?.knowledgeLedger?.components?.records).map((record) => ({
    id: record.id,
    title: record.title,
    summary: record.summary,
    type: record.type,
    status: record.status,
    tags: record.tags || [],
    links: record.links || {}
  })).filter((record) => record.id || record.title);
}

function commandLogRecords(campaignState = null, limit = 8) {
  return asArray(campaignState?.commandLog?.entries)
    .filter((entry) => entry?.visibility !== 'hidden' && entry?.playerVisible !== false)
    .slice(-limit)
    .map((entry) => ({
      id: entry.id || entry.outcomeId || null,
      title: entry.title || entry.type || entry.id,
      summary: entry.assistedSummary?.text || entry.summary || asArray(entry.summaryInputs).join(' '),
      visibleConsequences: asArray(entry.visibleConsequences)
    }))
    .filter((entry) => entry.id || entry.summary);
}

function missionRecords(campaignState = null, projection = null) {
  const mission = campaignState?.mission || {};
  return [
    ...asArray(projection?.mission?.formalObjectives),
    ...asArray(projection?.mission?.openAssignments),
    ...asArray(projection?.mission?.availableQuests),
    ...asArray(mission.formalObjectives),
    ...asArray(mission.openAssignments)
  ].map((entry) => {
    if (typeof entry === 'string') return { id: entry, title: entry };
    return {
      id: entry?.id || entry?.objectiveId || entry?.questId || entry?.title || entry?.label,
      title: entry?.title || entry?.label || entry?.summary || entry?.playerSafeSummary || entry?.id,
      summary: entry?.summary || entry?.playerSafeSummary || entry?.playerSummary || '',
      status: entry?.status || entry?.state || null
    };
  }).filter((entry) => entry.id || entry.title);
}

function shipSystemRecords(campaignState = null, packageData = null, shipDataset = null, projection = null) {
  const systems = [];
  const add = (record = {}, fallbackType = '') => {
    if (!record) return;
    if (typeof record === 'string') {
      systems.push({ id: labelFromId(record).toLowerCase().replace(/\s+/g, '-'), label: record, type: fallbackType });
      return;
    }
    const id = record.id || record.systemId || record.label || record.title || record.name;
    const label = record.label || record.title || record.name || record.summary || record.playerSafeSummary || id;
    if (id || label) systems.push({
      id,
      label,
      summary: record.summary || record.playerSafeSummary || record.detail || '',
      status: record.status || record.state || null,
      type: record.type || fallbackType,
      aliases: record.aliases || []
    });
  };
  for (const record of asArray(shipDataset?.systems)) add(record, 'system');
  for (const record of asArray(packageData?.ship?.systems?.knownTechnicalDebt)) add(record, 'technicalDebt');
  for (const record of asArray(campaignState?.ship?.technicalDebt)) add(record, 'technicalDebt');
  for (const record of asArray(campaignState?.ship?.damage)) add(record, 'damage');
  for (const record of asArray(campaignState?.ship?.activeRestrictions)) add(record, 'restriction');
  for (const record of asArray(projection?.ship?.technicalDebt)) add(record, 'technicalDebt');
  for (const record of asArray(projection?.ship?.damage)) add(record, 'damage');
  for (const record of asArray(projection?.ship?.activeRestrictions)) add(record, 'restriction');
  for (const token of TECHNICAL_TOKENS) add({ id: token, label: token }, 'technicalTerm');
  return systems;
}

function glossaryRecords(packageData = null) {
  return [
    ...asArray(packageData?.glossary),
    ...asArray(packageData?.world?.glossary),
    ...asArray(packageData?.procedures),
    ...asArray(packageData?.world?.procedures)
  ].map((entry) => {
    if (typeof entry === 'string') return { id: entry, label: entry };
    return {
      id: entry?.id || entry?.term || entry?.label || entry?.title,
      label: entry?.term || entry?.label || entry?.title || entry?.id,
      summary: entry?.summary || entry?.definition || entry?.description || '',
      aliases: entry?.aliases || []
    };
  }).filter((entry) => entry.id || entry.label);
}

function sanitizeMessage(message = {}) {
  return {
    id: cleanText(message.id || message.hostMessageId || message.messageId || ''),
    hostMessageId: cleanText(message.hostMessageId || message.id || message.messageId || ''),
    role: cleanText(message.role || (message.isUser ? 'user' : '') || 'assistant', 40),
    name: cleanText(message.name || message.sender || message.messageName || '', 80),
    text: cleanText(message.text || message.mes || message.content || '', 1600),
    textHash: hashText(message.text || message.mes || message.content || '')
  };
}

function sourceWindow(recentMessages = [], hostMessageId = '') {
  const messages = asArray(recentMessages).map(sanitizeMessage).filter((message) => message.text);
  const id = cleanText(hostMessageId);
  const index = messages.findIndex((message) => message.hostMessageId === id || message.id === id);
  if (index < 0) return messages.slice(-8);
  return messages.slice(Math.max(0, index - 5), Math.min(messages.length, index + 4));
}

function selectedTextFromPayload(payload = {}) {
  const selection = isObject(payload?.selection) ? payload.selection : payload;
  return cleanText(selection.selectedText || selection.selectionText || selection.text || selection.verbatim, 1200);
}

export function sourceFromDefineSelection(payload = {}) {
  const selection = isObject(payload?.selection) ? payload.selection : payload;
  const selectedText = selectedTextFromPayload(selection);
  const message = isObject(selection.message) ? selection.message : {};
  const messageText = cleanText(message.text || selection.messageText || selection.fullText || '', 3000);
  return {
    selection: {
      selectedText,
      selectionHash: hashText(selectedText),
      selectionStart: Number.isInteger(selection.selectionStart) ? selection.selectionStart : null,
      selectionEnd: Number.isInteger(selection.selectionEnd) ? selection.selectionEnd : null
    },
    source: {
      host: cleanText(selection.host || 'sillytavern', 80) || 'sillytavern',
      chatId: cleanText(selection.chatId || selection.currentChatId, 180),
      hostMessageId: cleanText(message.hostMessageId || message.id || selection.hostMessageId || selection.messageId, 180),
      messageRole: cleanText(message.role || selection.messageRole || (message.isUser ? 'user' : 'assistant'), 40) || 'assistant',
      messageName: cleanText(message.name || selection.messageName || '', 100),
      messageText,
      messageTextHash: hashText(messageText),
      sourceIntegrity: 'clean'
    }
  };
}

function buildIndexes({
  campaignState = null,
  packageData = null,
  crewDataset = null,
  shipDataset = null,
  playerSafeProjection = null
} = {}) {
  return {
    crew: crewRecords(packageData, crewDataset, playerSafeProjection).map((record) => ({
      id: record.id,
      name: record.name || record.id,
      rank: record.rank || null,
      billet: record.billet || record.role || null,
      species: record.species || null,
      aliases: unique([record.shortName, record.familyName, ...(asArray(record.aliases))]),
      ageDescription: cleanText(record.ageDescription || '', 220),
      publicProfile: cleanText(record.publicProfile || record.profile || record.packageRole || '', 420),
      visibleDescriptor: cleanText(record.visibleDescriptor || '', 220)
    })),
    shipSystems: shipSystemRecords(campaignState, packageData, shipDataset, playerSafeProjection),
    missions: missionRecords(campaignState, playerSafeProjection),
    threads: asArray(campaignState?.threadLedger?.records).map((record) => ({
      id: record.id,
      title: record.title || record.label || record.id,
      summary: record.summary || record.playerSafeSummary || '',
      status: record.status || null
    })).filter((record) => record.id || record.title),
    components: componentRecords(campaignState),
    commandLog: commandLogRecords(campaignState),
    glossary: glossaryRecords(packageData)
  };
}

export function buildDefineContextBundle({
  selection = {},
  campaignState = null,
  packageData = null,
  crewDataset = null,
  shipDataset = null,
  playerSafeProjection = null,
  recentMessages = [],
  currentSceneMessages = [],
  scene = null
} = {}) {
  const source = sourceFromDefineSelection(selection);
  const projection = playerSafeProjection || null;
  const sceneSource = scene || projection?.scene || campaignState?.attentionState?.scene || {};
  return {
    kind: 'directive.defineSelection.context.v1',
    selection: cloneJson(source.selection),
    source: {
      ...cloneJson(source.source),
      messageText: undefined
    },
    sourceMessage: sanitizeMessage({
      hostMessageId: source.source.hostMessageId,
      role: source.source.messageRole,
      name: source.source.messageName,
      text: source.source.messageText
    }),
    sourceWindow: sourceWindow(recentMessages, source.source.hostMessageId),
    currentSceneWindow: asArray(currentSceneMessages).map(sanitizeMessage).filter((message) => message.text).slice(-12),
    scene: {
      missionTitle: cleanText(sceneSource?.missionTitle || campaignState?.campaign?.title || campaignState?.campaign?.packageTitle || '', 180),
      phaseLabel: cleanText(sceneSource?.phaseLabel || sceneSource?.activePhaseId || campaignState?.mission?.activePhaseId || campaignState?.mission?.phase || '', 180),
      location: cleanText(sceneSource?.location || sceneSource?.locationId || campaignState?.worldState?.currentLocationId || campaignState?.mission?.locationId || '', 180),
      currentQuestion: cleanText(sceneSource?.currentQuestion || campaignState?.mission?.currentQuestion || '', 260),
      immediateStakes: cleanText(sceneSource?.immediateStakes || campaignState?.mission?.currentConcern || '', 320),
      presentCharacterIds: unique([
        ...asArray(sceneSource?.presentCharacterIds),
        ...asArray(sceneSource?.presentCharacters),
        ...asArray(sceneSource?.presentActorIds)
      ])
    },
    player: {
      id: cleanText(campaignState?.player?.id || projection?.player?.id || '', 120),
      name: cleanText(campaignState?.player?.name || projection?.player?.name || '', 120),
      rank: cleanText(campaignState?.player?.rank || projection?.player?.rank || '', 80),
      billet: cleanText(campaignState?.player?.billet || projection?.player?.billet || '', 140),
      species: cleanText(campaignState?.player?.species?.label || campaignState?.player?.species || projection?.player?.species || '', 80)
    },
    campaign: {
      id: campaignState?.campaign?.id || null,
      title: campaignState?.campaign?.title || campaignState?.campaign?.packageTitle || null,
      revision: Number(campaignState?.runtimeTracking?.revision || campaignState?.turnLedger?.entries?.length || 0) || 0,
      promptContextRevision: Number(campaignState?.campaignChatBinding?.promptContextRevision || 0) || 0
    },
    indexes: buildIndexes({ campaignState, packageData, crewDataset, shipDataset, playerSafeProjection: projection }),
    guards: {
      wrongChat: false,
      staleSource: false,
      hiddenStateExcluded: true,
      discardedSwipesExcluded: true
    }
  };
}

function categoryConfidence(score = 0) {
  if (score >= 4) return 0.92;
  if (score >= 3) return 0.82;
  if (score >= 2) return 0.68;
  if (score >= 1) return 0.5;
  return 0.2;
}

function matchedRecordsForSelection(bundle = {}) {
  const text = bundle.selection?.selectedText || '';
  return {
    crew: matchRecordsByTerms(text, bundle.indexes?.crew || []),
    shipSystems: matchRecordsByTerms(text, bundle.indexes?.shipSystems || []),
    missions: matchRecordsByTerms(text, bundle.indexes?.missions || []),
    threads: matchRecordsByTerms(text, bundle.indexes?.threads || []),
    components: matchRecordsByTerms(text, bundle.indexes?.components || []),
    commandLog: matchRecordsByTerms(text, bundle.indexes?.commandLog || []),
    glossary: matchRecordsByTerms(text, bundle.indexes?.glossary || [])
  };
}

export function classifyDefineSelectionLocal(bundle = {}) {
  const selected = cleanText(bundle.selection?.selectedText || '');
  const lower = selected.toLowerCase();
  const scores = new Map();
  const matches = matchedRecordsForSelection(bundle);

  if (!selected || selected.length <= 2 || GENERIC_AMBIGUOUS.has(lower)) {
    addScore(scores, 'ambiguousSelection', 4, 'low-information');
  }
  if (matches.crew.length) addScore(scores, 'character', 4, 'crew-name');
  if (RANK_TOKENS.some((token) => textIncludes(selected, token))) {
    addScore(scores, 'rankTitleProtocol', 2, 'rank-token');
    if (matches.crew.length) addScore(scores, 'character', 1, 'rank-plus-name');
  }
  if (SPECIES_TOKENS.some((token) => textIncludes(selected, token))) addScore(scores, 'speciesCulture', 3, 'species');
  if (matches.shipSystems.length || TECHNICAL_TOKENS.some((token) => textIncludes(selected, token))) addScore(scores, 'shipSystemTechnicalTerm', 3, 'technical-term');
  if (matches.missions.length || matches.threads.length) addScore(scores, 'missionQuestThread', 3, 'mission-thread-match');
  if (matches.components.length) addScore(scores, 'objectItemEvidence', 2, 'component-match');
  if (matches.glossary.length) addScore(scores, 'acronymJargonProperNoun', 2, 'glossary-match');
  if (PROCEDURE_TOKENS.some((token) => textIncludes(selected, token))) addScore(scores, 'procedureRuleLaw', 3, 'protocol');
  if (CLAIM_TOKENS.some((token) => textIncludes(selected, token))) addScore(scores, 'claimRumorUnverified', 3, 'claim-marker');
  if (TONE_TOKENS.some((token) => textIncludes(selected, token))) {
    addScore(scores, 'toneSubtext', 3, 'tone-marker');
    addScore(scores, 'relationshipSocialDynamic', 2, 'social-signal');
  }
  if (RISK_TOKENS.some((token) => textIncludes(selected, token))) addScore(scores, 'threatHazardRisk', 3, 'risk-marker');
  if (RESOURCE_TOKENS.some((token) => textIncludes(selected, token))) addScore(scores, 'resourceConstraint', 2, 'resource-marker');
  if (/\b(?:stardate|alpha shift|beta shift|gamma shift|\d+\s*(?:hours?|minutes?|days?)\s+(?:ago|before|after)|before departure)\b/i.test(selected)) {
    addScore(scores, 'timelineTimeReference', 3, 'time-marker');
  }
  if (/^[A-Z0-9-]{2,}$/.test(selected) || /\b[A-Z]{2,}\b/.test(selected)) {
    addScore(scores, 'acronymJargonProperNoun', 2, 'acronym');
  }
  if (/\b(?:incident|accident|inspection|battle|failure|event)\b/i.test(selected)) addScore(scores, 'eventIncident', 2, 'event-marker');
  if (/\b(?:team|department|faction|council|starfleet|operations|engineering|security|medical)\b/i.test(selected)) {
    addScore(scores, 'groupFactionInstitution', 2, 'group-marker');
  }
  if (/\b(?:deck|shuttlebay|sickbay|bridge|ready room|corridor|sector|colony|station|system|reach)\b/i.test(selected)) {
    addScore(scores, 'locationPlace', 2, 'location-marker');
  }

  if (scores.size === 0) addScore(scores, 'ambiguousSelection', 1, 'no-local-match');

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score)
    .map((entry) => ({
      id: entry.id,
      score: Math.round(entry.score * 100) / 100,
      confidence: categoryConfidence(entry.score),
      signals: entry.signals
    }));
  const top = ranked[0] || { id: 'ambiguousSelection', score: 1, confidence: 0.4, signals: ['fallback'] };
  const ambiguous = top.id === 'ambiguousSelection' || top.score < 2 || (ranked[1] && (top.score - ranked[1].score) < 0.75 && top.score < 4);
  const primaryGuess = ambiguous && top.score < 3 ? 'ambiguousSelection' : top.id;
  return {
    kind: 'directive.defineSelection.localClassification.v1',
    primaryGuess,
    candidateTypes: ranked.slice(0, 4),
    matchedRecords: {
      crewIds: matches.crew.map((record) => record.id).filter(Boolean).slice(0, 8),
      shipSystemIds: matches.shipSystems.map((record) => record.id).filter(Boolean).slice(0, 8),
      missionIds: [...matches.missions, ...matches.threads].map((record) => record.id).filter(Boolean).slice(0, 8),
      componentIds: matches.components.map((record) => record.id).filter(Boolean).slice(0, 8),
      commandLogIds: matches.commandLog.map((record) => record.id).filter(Boolean).slice(0, 8),
      glossaryIds: matches.glossary.map((record) => record.id).filter(Boolean).slice(0, 8)
    },
    matchedRecordPreviews: {
      crew: matches.crew.slice(0, 4).map((record) => ({ id: record.id, label: recordLabel(record), rank: record.rank || null, billet: record.billet || null })),
      shipSystems: matches.shipSystems.slice(0, 4).map((record) => ({ id: record.id, label: recordLabel(record), summary: cleanText(record.summary || '', 180) })),
      missions: [...matches.missions, ...matches.threads].slice(0, 4).map((record) => ({ id: record.id, label: recordLabel(record), summary: cleanText(record.summary || '', 180) })),
      components: matches.components.slice(0, 4).map((record) => ({ id: record.id, label: recordLabel(record), type: record.type || null }))
    },
    ambiguous
  };
}

function compactBundleForProvider(bundle = {}) {
  return {
    ...cloneJson(bundle),
    indexes: {
      crew: asArray(bundle.indexes?.crew).slice(0, 24),
      shipSystems: asArray(bundle.indexes?.shipSystems).slice(0, 32),
      missions: asArray(bundle.indexes?.missions).slice(0, 24),
      threads: asArray(bundle.indexes?.threads).slice(0, 24),
      components: asArray(bundle.indexes?.components).slice(-16),
      commandLog: asArray(bundle.indexes?.commandLog).slice(-8),
      glossary: asArray(bundle.indexes?.glossary).slice(0, 24)
    }
  };
}

export function buildDefineSelectionRequest(bundle = {}, classification = {}) {
  const allowed = unique([
    classification.primaryGuess,
    ...asArray(classification.candidateTypes).map((entry) => entry.id),
    'ambiguousSelection'
  ]).filter((id) => CATEGORY_SET.has(id));
  const categoryProfiles = allowed.map((id) => DEFINE_SELECTION_CATEGORIES[id]).filter(Boolean);
  return {
    systemPrompt: [
      'You are Directive Define Selection, a read-only Utility-lane context explainer.',
      'Define the highlighted selection using only the supplied player-safe source, scene, and indexes.',
      'Use sourceWindow for local meaning and currentSceneWindow/scene/projection for current relevance.',
      'Choose primaryType only from allowedPrimaryTypes.',
      'Separate known, inferred, and unknown. Do not reveal hidden state, private motives, future truth, discarded swipes, raw prompts, provider reasoning, or diagnostics.',
      'Return strict JSON only.'
    ].join('\n'),
    prompt: JSON.stringify({
      allowedPrimaryTypes: allowed,
      categoryProfiles,
      sectionProfiles: DEFINE_SELECTION_SECTION_PROFILES,
      localClassification: classification,
      bundle: compactBundleForProvider(bundle)
    }, null, 2),
    messages: [
      {
        role: 'system',
        content: 'Return a compact player-facing Define Selection JSON object. Do not write prose outside JSON.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          allowedPrimaryTypes: allowed,
          localClassification: classification,
          bundle: compactBundleForProvider(bundle)
        }, null, 2)
      }
    ],
    structuredOutput: true,
    metadata: {
      source: 'define-selection',
      sourceMessageId: bundle.source?.hostMessageId || null,
      selectionHash: bundle.selection?.selectionHash || null,
      primaryGuess: classification.primaryGuess || null
    },
    parameters: {
      temperature: 0.1,
      top_p: 0.9,
      max_tokens: 1200
    }
  };
}

function payloadFromProviderResponse(response = {}) {
  if (isObject(response?.content)) return cloneJson(response.content);
  if (isObject(response?.json)) return cloneJson(response.json);
  if (isObject(response?.data)) return cloneJson(response.data);
  if (isObject(response?.structuredOutput)) return cloneJson(response.structuredOutput);
  if (isObject(response) && (response.subject || response.primaryType || response.shortAnswer)) return cloneJson(response);
  const text = extractProviderResponseText(response);
  const parsed = parseStructuredJsonText(text, { requireObject: true });
  return parsed.ok ? parsed.value : null;
}

function normalizeType(value = '', fallback = 'ambiguousSelection') {
  const id = cleanText(value, 80);
  return CATEGORY_SET.has(id) ? id : fallback;
}

function normalizeStringArray(value = [], limit = 8, maxLength = 260) {
  return unique((Array.isArray(value) ? value : [value]).map((item) => {
    if (typeof item === 'string') return cleanText(item, maxLength);
    return cleanText(item?.text || item?.summary || item?.label || item?.title || '', maxLength);
  })).slice(0, limit);
}

function normalizeSections(value = [], primaryType = 'ambiguousSelection') {
  const source = Array.isArray(value) ? value : [];
  const allowedIds = new Set([
    ...Object.keys(DEFINE_SELECTION_SECTION_PROFILES),
    ...(DEFINE_SELECTION_CATEGORIES[primaryType]?.requiredSections || []),
    ...(DEFINE_SELECTION_CATEGORIES[primaryType]?.optionalSections || [])
  ]);
  return source.map((section) => {
    if (!isObject(section)) return null;
    const id = cleanText(section.id || section.key || '', 80);
    const items = normalizeStringArray(section.items || section.content || section.text || section.summary, 6, 280);
    if (!id || !items.length || !allowedIds.has(id)) return null;
    return {
      id,
      title: cleanText(section.title || labelFromId(id), 80),
      items
    };
  }).filter(Boolean).slice(0, 10);
}

function existingIdSet(values = []) {
  return new Set(asArray(values).map((entry) => cleanText(entry.id || entry.hostMessageId || entry.title || entry.label)).filter(Boolean));
}

function restrictIds(values = [], allowed = new Set()) {
  return normalizeStringArray(values, 16, 180).filter((id) => allowed.has(id));
}

function normalizeRelated(value = {}, bundle = {}, classification = {}) {
  const related = isObject(value) ? value : {};
  const matched = classification.matchedRecords || {};
  const crewIds = existingIdSet(bundle.indexes?.crew);
  const shipIds = existingIdSet(bundle.indexes?.shipSystems);
  const missionIds = existingIdSet([...(bundle.indexes?.missions || []), ...(bundle.indexes?.threads || [])]);
  const componentIds = existingIdSet(bundle.indexes?.components);
  const logIds = existingIdSet(bundle.indexes?.commandLog);
  return {
    crewIds: restrictIds(related.crewIds || matched.crewIds || [], crewIds),
    shipSystemIds: restrictIds(related.shipSystemIds || matched.shipSystemIds || [], shipIds),
    missionIds: restrictIds(related.missionIds || matched.missionIds || [], missionIds),
    componentIds: restrictIds(related.componentIds || matched.componentIds || [], componentIds),
    commandLogIds: restrictIds(related.commandLogIds || matched.commandLogIds || [], logIds)
  };
}

function subjectFromClassification(bundle = {}, classification = {}) {
  const previews = classification.matchedRecordPreviews || {};
  const primary = classification.primaryGuess;
  if (primary === 'character' && previews.crew?.[0]?.label) return previews.crew[0].label;
  if (primary === 'shipSystemTechnicalTerm' && previews.shipSystems?.[0]?.label) return previews.shipSystems[0].label;
  if (primary === 'missionQuestThread' && previews.missions?.[0]?.label) return previews.missions[0].label;
  if (previews.components?.[0]?.label) return previews.components[0].label;
  return cleanText(bundle.selection?.selectedText || 'Selection', 120) || 'Selection';
}

function fallbackShortAnswer(bundle = {}, classification = {}) {
  const subject = subjectFromClassification(bundle, classification);
  const primary = classification.primaryGuess || 'ambiguousSelection';
  if (primary === 'character') {
    const crew = classification.matchedRecordPreviews?.crew?.[0];
    const role = [crew?.rank, crew?.billet].filter(Boolean).join(', ');
    return role ? `${subject} appears to be ${role}. Use the current scene and visible relationship context before assuming private motives.` : `${subject} appears to be a person referenced by the current scene.`;
  }
  if (primary === 'shipSystemTechnicalTerm') return `${subject} appears to be a ship system or technical term relevant to the current scene.`;
  if (primary === 'missionQuestThread') return `${subject} appears tied to current mission work or an open thread.`;
  if (primary === 'claimRumorUnverified') return `${subject} appears to be a claim or report that should not be treated as confirmed without supporting evidence.`;
  if (primary === 'toneSubtext' || primary === 'relationshipSocialDynamic') return `${subject} appears to be a social or tonal cue. Treat it as interpretation, not hidden intent.`;
  if (primary === 'ambiguousSelection') return `The selection "${cleanText(bundle.selection?.selectedText, 120)}" is ambiguous without more surrounding text.`;
  return `${subject} is defined from the selected source and current player-safe scene context.`;
}

export function deterministicDefineFallback(bundle = {}, classification = {}) {
  const primaryType = normalizeType(classification.primaryGuess, 'ambiguousSelection');
  const subject = subjectFromClassification(bundle, classification);
  const known = [];
  const inferred = [];
  const unknown = [];
  const sourceText = cleanText(bundle.sourceMessage?.text || '', 260);
  if (sourceText) known.push(`The selection appears in source message ${bundle.source?.hostMessageId || 'unknown'}.`);
  for (const crew of classification.matchedRecordPreviews?.crew || []) {
    known.push(`${crew.label}${crew.rank || crew.billet ? `: ${[crew.rank, crew.billet].filter(Boolean).join(', ')}` : ''}.`);
  }
  for (const system of classification.matchedRecordPreviews?.shipSystems || []) {
    known.push(`${system.label}${system.summary ? `: ${system.summary}` : ''}.`);
  }
  for (const mission of classification.matchedRecordPreviews?.missions || []) {
    inferred.push(`${mission.label}${mission.summary ? `: ${mission.summary}` : ''}.`);
  }
  if (!known.length) known.push(`Selected text: "${cleanText(bundle.selection?.selectedText, 180)}".`);
  if (classification.ambiguous) unknown.push('The exact referent is ambiguous from the selected text alone.');
  if (!unknown.length) unknown.push('No hidden or private information is available to Define.');
  return {
    kind: 'directive.defineSelection.result.v1',
    ok: true,
    source: 'deterministic-fallback',
    subject,
    primaryType,
    primaryTypeLabel: DEFINE_SELECTION_CATEGORIES[primaryType]?.label || 'Ambiguous Selection',
    secondaryTypes: asArray(classification.candidateTypes).map((entry) => entry.id).filter((id) => id !== primaryType && CATEGORY_SET.has(id)).slice(0, 3),
    confidence: classification.ambiguous ? 'low' : 'medium',
    shortAnswer: fallbackShortAnswer(bundle, classification),
    sections: normalizeSections([
      {
        id: primaryType === 'ambiguousSelection' ? 'possibleMeanings' : 'sceneContext',
        title: primaryType === 'ambiguousSelection' ? 'Possible Meanings' : 'Scene Context',
        items: [
          bundle.scene?.missionTitle ? `Mission: ${bundle.scene.missionTitle}` : '',
          bundle.scene?.phaseLabel ? `Phase: ${bundle.scene.phaseLabel}` : '',
          bundle.scene?.location ? `Location: ${bundle.scene.location}` : ''
        ].filter(Boolean)
      }
    ], primaryType),
    known,
    inferred,
    unknown,
    related: normalizeRelated({}, bundle, classification),
    warnings: ['Utility provider was unavailable or unusable; deterministic player-safe matches are shown.'],
    sourceInfo: {
      chatId: bundle.source?.chatId || null,
      hostMessageId: bundle.source?.hostMessageId || null,
      messageRole: bundle.source?.messageRole || null,
      selectionHash: bundle.selection?.selectionHash || null
    }
  };
}

export function normalizeDefineSelectionResult(raw = {}, bundle = {}, classification = {}) {
  const source = isObject(raw) ? raw : {};
  const fallbackType = classification.primaryGuess || 'ambiguousSelection';
  const primaryType = normalizeType(source.primaryType, fallbackType);
  const known = normalizeStringArray(source.known, 8, 280);
  const inferred = normalizeStringArray(source.inferred, 8, 280);
  const unknown = normalizeStringArray(source.unknown, 8, 280);
  const result = {
    kind: 'directive.defineSelection.result.v1',
    ok: true,
    source: source.source || 'utility',
    subject: cleanText(source.subject || subjectFromClassification(bundle, classification), 120),
    primaryType,
    primaryTypeLabel: DEFINE_SELECTION_CATEGORIES[primaryType]?.label || DEFINE_SELECTION_CATEGORIES.ambiguousSelection.label,
    secondaryTypes: normalizeStringArray(source.secondaryTypes, 4, 80).filter((id) => CATEGORY_SET.has(id) && id !== primaryType),
    confidence: ['high', 'medium', 'low'].includes(cleanText(source.confidence).toLowerCase()) ? cleanText(source.confidence).toLowerCase() : (classification.ambiguous ? 'low' : 'medium'),
    shortAnswer: cleanText(source.shortAnswer || fallbackShortAnswer(bundle, { ...classification, primaryGuess: primaryType }), 520),
    sections: normalizeSections(source.sections, primaryType),
    known,
    inferred,
    unknown,
    related: normalizeRelated(source.related, bundle, classification),
    warnings: normalizeStringArray(source.warnings, 6, 220),
    sourceInfo: {
      chatId: bundle.source?.chatId || null,
      hostMessageId: bundle.source?.hostMessageId || null,
      messageRole: bundle.source?.messageRole || null,
      selectionHash: bundle.selection?.selectionHash || null
    }
  };
  if (!result.known.length && !result.inferred.length && !result.unknown.length) {
    result.known = deterministicDefineFallback(bundle, classification).known;
    result.unknown = ['Utility did not separate known, inferred, and unknown; deterministic source limits apply.'];
    result.warnings.push('Utility output omitted Known / Inferred / Unknown separation.');
  }
  return result;
}

export async function prepareDefineSelection({
  selection = {},
  campaignState = null,
  packageData = null,
  crewDataset = null,
  shipDataset = null,
  playerSafeProjection = null,
  recentMessages = [],
  currentSceneMessages = [],
  scene = null,
  generationRouter = null,
  useProvider = true
} = {}) {
  const bundle = buildDefineContextBundle({
    selection,
    campaignState,
    packageData,
    crewDataset,
    shipDataset,
    playerSafeProjection,
    recentMessages,
    currentSceneMessages,
    scene
  });
  const classification = classifyDefineSelectionLocal(bundle);
  let diagnostics = {
    providerUsed: false,
    providerOutputRejected: false,
    providerId: null,
    model: null,
    error: null
  };
  if (useProvider !== false && typeof generationRouter?.generate === 'function') {
    const request = buildDefineSelectionRequest(bundle, classification);
    const generated = await generationRouter.generate(DEFINE_SELECTION_ROLE_ID, request);
    diagnostics = {
      providerUsed: true,
      providerOutputRejected: false,
      providerId: generated?.diagnostics?.providerId || generated?.response?.providerId || null,
      model: generated?.diagnostics?.model || generated?.response?.model || null,
      error: cloneJson(generated?.error || null)
    };
    if (generated?.ok) {
      const payload = payloadFromProviderResponse(generated.response || {});
      if (payload) {
        return {
          kind: 'directive.defineSelection.prepare',
          ok: true,
          selectedText: bundle.selection.selectedText,
          source: cloneJson(bundle.source),
          context: cloneJson({
            scene: bundle.scene,
            localClassification: classification
          }),
          definition: normalizeDefineSelectionResult(payload, bundle, classification),
          diagnostics
        };
      }
      diagnostics.providerOutputRejected = true;
    }
  }
  const fallback = deterministicDefineFallback(bundle, classification);
  return {
    kind: 'directive.defineSelection.prepare',
    ok: true,
    selectedText: bundle.selection.selectedText,
    source: cloneJson(bundle.source),
    context: cloneJson({
      scene: bundle.scene,
      localClassification: classification
    }),
    definition: fallback,
    diagnostics
  };
}

export const __defineSelectionTestHooks = Object.freeze({
  hashText,
  buildIndexes,
  matchedRecordsForSelection,
  payloadFromProviderResponse
});
