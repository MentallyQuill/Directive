import { selectCrewVoiceLineShapes } from '../generation/crew-voice-capsules.mjs';

const HYDRATED_CARD_LIMITS = Object.freeze({
  missionDirector: 8,
  crewDirector: 8,
  shipDirector: 6,
  commandDirector: 6,
  narrator: 8,
  commandLog: 4
});

const VOICE_LINE_SHAPE_LIMITS = Object.freeze({
  missionDirector: 1,
  crewDirector: 1,
  shipDirector: 0,
  commandDirector: 0,
  narrator: 1,
  commandLog: 0
});

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function compactText(value = '', maxLength = 260) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function compactArray(values = [], limit = 3, maxLength = 180) {
  const seen = new Set();
  const output = [];
  for (const value of array(values)) {
    const text = compactText(value, maxLength);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function cardCharacters(card = {}) {
  return array(card.scope?.characters).filter(Boolean);
}

function compactEffects(card = {}) {
  return compactArray(card.payload?.effects, 4, 140);
}

function compactStateRefs(card = {}) {
  return compactArray(card.payload?.stateRefs, 4, 140);
}

function shipGuidanceFields(card = {}) {
  if (!card.type?.startsWith('ship.')) return {};
  const payload = card.payload || {};
  return {
    hardAnchors: compactArray(payload.hardAnchors, 4, 180),
    textures: compactArray(payload.textures, 5, 140),
    sceneUses: compactArray(payload.sceneUses, 4, 140),
    avoid: compactArray(payload.avoid, 4, 160)
  };
}

function hydrateVoiceCapsule(card = {}, audience = 'crewDirector') {
  const capsule = card.payload?.voiceCapsule || null;
  if (!capsule || typeof capsule !== 'object') return null;
  const lineShapeLimit = VOICE_LINE_SHAPE_LIMITS[audience] ?? 0;
  const lineShapes = selectCrewVoiceLineShapes(capsule, lineShapeLimit)
    .map((line) => ({
      id: compactText(line.id, 80) || null,
      shape: compactText(line.shape, 220),
      bibleAxes: compactArray(line.bibleAxes, 8, 60)
    }))
    .filter((line) => line.shape);
  return {
    coreEngine: compactText(capsule.coreEngine, 240),
    contradiction: compactText(capsule.contradiction, 220),
    speechMechanics: compactArray(capsule.speechMechanics, 2, 160),
    pressureShift: compactArray(capsule.pressureShift, 2, 180),
    warmthHumor: compactArray(capsule.warmthHumor, 2, 180),
    physicalTells: compactArray(capsule.physicalTells, 2, 160),
    exampleLineShapes: lineShapes,
    avoid: compactArray(capsule.avoid, 3, 180)
  };
}

function hydratedGuidance(card = {}, audience = 'crewDirector') {
  const payload = card.payload || {};
  const includeInternalRefs = !['narrator', 'commandLog'].includes(audience);
  const guidance = {
    summary: compactText(payload.summary, 280),
    constraints: compactArray(payload.constraints, 3, 180),
    ...shipGuidanceFields(card),
    ...(includeInternalRefs ? {
      effects: compactEffects(card),
      stateRefs: compactStateRefs(card)
    } : {})
  };
  if (card.type === 'crew.voice') {
    const voiceCapsule = hydrateVoiceCapsule(card, audience);
    if (voiceCapsule) {
      guidance.voiceCapsule = voiceCapsule;
    }
  }
  return Object.fromEntries(Object.entries(guidance).filter(([, value]) => (
    Array.isArray(value) ? value.length > 0 : Boolean(value)
  )));
}

function hydrateCard(card = {}, audience = 'crewDirector') {
  const guidance = hydratedGuidance(card, audience);
  if (!Object.keys(guidance).length) return null;
  return {
    id: card.id,
    type: card.type || null,
    visibility: card.visibility || null,
    narratorSafe: card.payload?.narratorSafe === true,
    characters: cardCharacters(card),
    guidance
  };
}

export function hydrateDirectorCards({
  index,
  cardIds = [],
  audience = 'crewDirector',
  maxCards = HYDRATED_CARD_LIMITS[audience] || 6
} = {}) {
  const cards = [];
  const omittedCardIds = [];
  for (const cardId of array(cardIds)) {
    const card = index?.getCard ? index.getCard(cardId) : null;
    if (!card) {
      omittedCardIds.push(cardId);
      continue;
    }
    if (cards.length >= maxCards) {
      omittedCardIds.push(cardId);
      continue;
    }
    const hydrated = hydrateCard(card, audience);
    if (hydrated) {
      cards.push(hydrated);
    } else {
      omittedCardIds.push(cardId);
    }
  }
  return {
    kind: 'directive.directorCardHydration.v1',
    audience,
    cards: cloneJson(cards),
    omittedCardIds
  };
}
