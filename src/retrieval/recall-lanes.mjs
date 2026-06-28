import { normalizePhaseId } from './dataset-index.mjs';

const NARRATOR_HINTS_BY_PHASE_AND_INTENT = Object.freeze({
  'shuttle-rendezvous::establish-arrival-tone': [
    'ship.intrepid.exterior.shuttle-approach',
    'ship.intrepid.location.shuttlebay',
    'crew.whitaker.profile.commanding-officer',
    'crew.priya.profile.operations-coordinator',
    'crew.bronn.profile.tactical-security'
  ],
  'ready-room-handover::complete-ready-room-handover': [
    'crew.whitaker.profile.commanding-officer',
    'crew.whitaker.voice.command-pressure',
    'crew.bronn.profile.tactical-security',
    'crew.bronn.voice.failure-conditions'
  ],
  'hesperus-diversion::resolve-hesperus-with-accountability': [
    'crew.priya.voice.dependencies-access',
    'crew.bronn.voice.failure-conditions',
    'crew.miriam.voice.human-cost',
    'crew.imani.voice.technical-debt'
  ],
  'senior-readiness-conference::set-readiness-priorities': [
    'crew.priya.voice.dependencies-access',
    'crew.bronn.voice.failure-conditions',
    'crew.miriam.voice.human-cost',
    'crew.imani.voice.technical-debt'
  ],
  'fallback-command-drill::set-fallback-command-procedure': [
    'crew.bronn.voice.failure-conditions',
    'crew.priya.voice.dependencies-access',
    'crew.imani.voice.technical-debt'
  ],
  'command-rhythm-scenes::establish-command-rhythm': [
    'crew.priya.voice.dependencies-access',
    'crew.bronn.voice.failure-conditions',
    'crew.miriam.voice.human-cost',
    'crew.imani.voice.technical-debt'
  ],
  'hesperus-aftermath::assign-hesperus-aftermath': [
    'crew.priya.voice.dependencies-access',
    'crew.miriam.voice.human-cost',
    'crew.imani.voice.technical-debt'
  ],
  'combined-load-test::resolve-combined-load-test': [
    'crew.imani.voice.technical-debt',
    'crew.priya.voice.dependencies-access'
  ],
  'final-command-review::complete-final-command-review': [
    'crew.whitaker.voice.command-pressure',
    'crew.priya.voice.dependencies-access'
  ]
});

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function laneAliases(lane) {
  if (lane === 'present_character') return ['present_character', 'present_characters'];
  if (lane === 'present_characters') return ['present_characters', 'present_character'];
  return [lane];
}

function cardLaneIds(card = {}) {
  return new Set(card.retrieval?.lanes || []);
}

function priorityScore(card = {}) {
  const priority = String(card.retrieval?.priority || 'normal').toLowerCase();
  if (priority === 'critical') return 40;
  if (priority === 'high') return 30;
  if (priority === 'normal') return 20;
  if (priority === 'low') return 10;
  return 0;
}

function typeScore(card = {}, audience) {
  if (audience === 'shipDirector' && card.type?.startsWith('ship.')) {
    return 14;
  }
  if (audience === 'narrator' && card.type?.startsWith('ship.')) {
    return 7;
  }
  if (audience === 'narrator') {
    if (card.type === 'crew.voice') return 10;
    if (card.type === 'crew.profile') return 8;
  }
  if (audience === 'commandDirector' && card.type?.startsWith('command.')) {
    return 10;
  }
  if (audience === 'crewDirector' && card.type?.startsWith('crew.')) {
    return 8;
  }
  return 0;
}

function compact(value = '') {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function textReferencesTerm(text = '', term = '') {
  const value = compact(term);
  if (!value || value.length < 3) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(value.toLowerCase())}([^a-z0-9]|$)`, 'i')
    .test(String(text || '').toLowerCase());
}

function recallHaystack(sceneSnapshot = {}, intentParse = {}) {
  const values = [
    sceneSnapshot.playerInput,
    sceneSnapshot.activePhaseId,
    sceneSnapshot.locationId,
    sceneSnapshot.missionId,
    intentParse.summary,
    intentParse.primaryIntent,
    intentParse.declaredMethod,
    ...(Array.isArray(intentParse.targetIds) ? intentParse.targetIds : []),
    ...(Array.isArray(sceneSnapshot.relevantLocationIds) ? sceneSnapshot.relevantLocationIds : []),
    ...(Array.isArray(sceneSnapshot.relevantSystemIds) ? sceneSnapshot.relevantSystemIds : [])
  ];
  return values.map(compact).filter(Boolean).join('\n');
}

function matchingKeywords(card = {}, haystack = '') {
  const matches = [];
  for (const keyword of card.retrieval?.keywords || []) {
    if (textReferencesTerm(haystack, keyword)) {
      matches.push(keyword);
    }
  }
  return matches;
}

export function narratorHintCardIds({ sceneSnapshot = {}, intentParse = {} } = {}) {
  const key = `${normalizePhaseId(sceneSnapshot) || ''}::${intentParse.primaryIntent || ''}`;
  return unique(NARRATOR_HINTS_BY_PHASE_AND_INTENT[key] || []);
}

export function collectRecallCandidates({ index, sceneSnapshot = {}, intentParse = {}, audience }) {
  const hook = index.getHookForScene(sceneSnapshot);
  const phaseId = normalizePhaseId(sceneSnapshot);
  const hookLanes = new Set((hook?.lanes || []).flatMap(laneAliases));
  const requiredCardIds = hook?.requiredCardIds || [];
  const voiceHintAudiences = new Set(['narrator', 'missionDirector', 'crewDirector']);
  const narratorHints = voiceHintAudiences.has(audience)
    ? narratorHintCardIds({ sceneSnapshot, intentParse })
    : [];
  const presentCharacters = new Set(sceneSnapshot.presentCharacters || []);
  const haystack = recallHaystack(sceneSnapshot, intentParse);
  const locationId = sceneSnapshot.locationId || null;
  const candidates = new Map();

  function add(cardId, lane, score = 0) {
    const card = index.getCard(cardId);
    if (!card) {
      return;
    }
    const existing = candidates.get(cardId) || {
      card,
      cardId,
      lanes: new Set(),
      score: priorityScore(card) + typeScore(card, audience)
    };
    existing.lanes.add(lane);
    existing.score += score;
    candidates.set(cardId, existing);
  }

  for (const cardId of requiredCardIds) {
    add(cardId, `phase:${phaseId}:required`, 100);
  }

  for (const cardId of narratorHints) {
    add(cardId, `phase:${phaseId}:${audience === 'narrator' ? 'narrator' : 'director'}-voice-hint`, audience === 'narrator' ? 120 : 70);
  }

  for (const card of index.cards) {
    if (!card.audiences?.includes(audience)) {
      continue;
    }
    const lanes = cardLaneIds(card);
    for (const lane of hookLanes) {
      if (lanes.has(lane)) {
        add(card.id, `lane:${lane}`, 20);
      }
    }
    const keywords = matchingKeywords(card, haystack);
    for (const keyword of keywords) {
      const score = card.type?.startsWith('ship.') ? 85 : 35;
      add(card.id, `keyword:${keyword}`, score);
    }
    if (locationId && (card.scope?.locations || []).includes(locationId)) {
      add(card.id, `scope:location:${locationId}`, card.type?.startsWith('ship.') ? 45 : 25);
    }
    if (
      voiceHintAudiences.has(audience)
      && card.type === 'crew.voice'
      && (card.scope?.characters || []).some((characterId) => presentCharacters.has(characterId))
    ) {
      add(card.id, 'present-character:voice-guidance', 35);
    }
  }

  return [...candidates.values()]
    .map((candidate) => ({
      ...candidate,
      lanes: [...candidate.lanes]
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.cardId.localeCompare(right.cardId);
    });
}
