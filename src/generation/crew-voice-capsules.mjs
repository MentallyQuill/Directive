function compact(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function lineShapeScore(line = {}) {
  const axes = new Set(array(line.bibleAxes));
  let score = 0;
  if (axes.has('warmth')) score += 8;
  if (axes.has('relationship-mode')) score += 6;
  if (axes.has('humor')) score += 4;
  if (axes.has('ordinary-life')) score += 3;
  if (axes.has('flaw')) score += 2;
  if (axes.has('role-pressure')) score -= 1;
  return score;
}

export function selectCrewVoiceLineShapes(capsule = {}, limit = 1) {
  const lines = array(capsule.exampleLineShapes)
    .filter((line) => line && compact(line.shape))
    .map((line, index) => ({ ...line, index }))
    .sort((left, right) => lineShapeScore(right) - lineShapeScore(left) || left.index - right.index);
  return lines.slice(0, Math.max(0, Number(limit) || 0));
}

export function voiceCardsByCrewId(crewDataset = {}) {
  const source = crewDataset || {};
  const map = new Map();
  for (const card of array(source.cards)) {
    if (card?.type !== 'crew.voice' || card?.payload?.narratorSafe !== true) continue;
    for (const crewId of array(card.scope?.characters)) {
      if (crewId && !map.has(crewId)) {
        map.set(crewId, card);
      }
    }
  }
  return map;
}

export function renderCrewVoiceCueFromCard(card = {}, {
  lineShapeLimit = 1,
  includeContradiction = true,
  includeAvoid = true
} = {}) {
  const payload = card.payload || {};
  const capsule = payload.voiceCapsule || null;
  if (!capsule || typeof capsule !== 'object') {
    const fallback = compact(payload.summary);
    const avoid = includeAvoid ? array(payload.constraints).slice(0, 2).map(compact).filter(Boolean) : [];
    return [fallback, avoid.length ? `Avoid: ${avoid.join('; ')}.` : null].filter(Boolean).join(' ');
  }

  const lines = selectCrewVoiceLineShapes(capsule, lineShapeLimit)
    .map((line) => `"${compact(line.shape)}"`);
  const avoid = includeAvoid ? array(capsule.avoid).slice(0, 3).map(compact).filter(Boolean) : [];
  return [
    compact(capsule.coreEngine),
    includeContradiction ? compact(capsule.contradiction) : null,
    array(capsule.pressureShift)[0] ? `Pressure: ${compact(array(capsule.pressureShift)[0])}` : null,
    array(capsule.warmthHumor)[0] ? `Warmth: ${compact(array(capsule.warmthHumor)[0])}` : null,
    array(capsule.physicalTells)[0] ? `Tell: ${compact(array(capsule.physicalTells)[0])}` : null,
    lines.length ? `Line shape: ${lines.join(' / ')}` : null,
    avoid.length ? `Avoid: ${avoid.join('; ')}.` : null
  ].filter(Boolean).join(' ');
}

export function renderCompactCrewVoiceCueFromCard(card = {}, {
  lineShapeLimit = 1
} = {}) {
  const payload = card.payload || {};
  const capsule = payload.voiceCapsule || null;
  if (!capsule || typeof capsule !== 'object') {
    return compact(payload.summary);
  }
  const lines = selectCrewVoiceLineShapes(capsule, lineShapeLimit)
    .map((line) => `"${compact(line.shape)}"`);
  return [
    compact(capsule.coreEngine),
    lines.length ? `Line shape: ${lines.join(' / ')}` : null
  ].filter(Boolean).join(' ');
}

export function renderCrewVoiceCueForCrewId(crewDataset = {}, crewId, options = {}) {
  const card = voiceCardsByCrewId(crewDataset).get(crewId);
  return card ? renderCrewVoiceCueFromCard(card, options) : '';
}

export function renderNarratorVoiceCues({ crewDataset = {}, allowedCardIds = [], options = {} } = {}) {
  const source = crewDataset || {};
  const allowed = new Set(array(allowedCardIds));
  return array(source.cards)
    .filter((card) => card?.type === 'crew.voice')
    .filter((card) => allowed.has(card.id))
    .filter((card) => card?.payload?.narratorSafe === true)
    .map((card) => ({
      cardId: card.id,
      crewIds: unique(array(card.scope?.characters)),
      cue: renderCrewVoiceCueFromCard(card, options)
    }))
    .filter((entry) => compact(entry.cue));
}
