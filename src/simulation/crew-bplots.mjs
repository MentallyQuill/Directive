function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function cardById(crewDataset) {
  return new Map((crewDataset.cards || []).map((card) => [card.id, card]));
}

function officerById(crewDataset) {
  return new Map((crewDataset.officers || []).map((officer) => [officer.id, officer]));
}

function officerIdForCard(card) {
  return (card?.scope?.characters || []).find((id) => id !== 'player-commander') || null;
}

function cardsForOfficer(crewDataset, officerId) {
  const ids = crewDataset.indexes?.byOfficer?.[officerId] || [];
  const cards = cardById(crewDataset);
  return ids.map((id) => cards.get(id)).filter(Boolean);
}

function phaseLinksForCard(missionGraph, cardId) {
  return (missionGraph.retrievalHooks || [])
    .filter((hook) => (hook.requiredCardIds || []).includes(cardId))
    .map((hook) => ({
      phaseId: hook.phaseId,
      audiences: cloneJson(hook.audiences || []),
      lanes: cloneJson(hook.lanes || [])
    }));
}

export function createCrewBPlotHooks({ crewDataset, missionGraph }) {
  const officers = officerById(crewDataset);
  return [...officers.values()].map((officer) => {
    const cards = cardsForOfficer(crewDataset, officer.id);
    const relationshipCard = cards.find((card) => card.type === 'crew.relationship');
    const developmentCard = cards.find((card) => card.type === 'crew.development');
    const commandReactionCard = cards.find((card) => card.type === 'command.styleReaction');
    const linkedCards = [relationshipCard, developmentCard, commandReactionCard].filter(Boolean);
    const linkedPhases = new Map();
    for (const card of linkedCards) {
      for (const link of phaseLinksForCard(missionGraph, card.id)) {
        const existing = linkedPhases.get(link.phaseId) || {
          phaseId: link.phaseId,
          cardIds: [],
          audiences: new Set(),
          lanes: new Set()
        };
        existing.cardIds.push(card.id);
        for (const audience of link.audiences) existing.audiences.add(audience);
        for (const lane of link.lanes) existing.lanes.add(lane);
        linkedPhases.set(link.phaseId, existing);
      }
    }
    return {
      crewId: officer.id,
      name: officer.name,
      billet: officer.billet,
      relationshipCardId: relationshipCard?.id || null,
      developmentCardId: developmentCard?.id || null,
      commandReactionCardId: commandReactionCard?.id || null,
      bPlotSeed: developmentCard?.payload?.summary || relationshipCard?.payload?.summary || '',
      linkedPhases: [...linkedPhases.values()].map((link) => ({
        phaseId: link.phaseId,
        cardIds: [...new Set(link.cardIds)],
        audiences: [...link.audiences],
        lanes: [...link.lanes]
      }))
    };
  });
}

export function createCrewCoalitionRules({ crewDataset, missionGraph, phaseId }) {
  const cards = cardById(crewDataset);
  const hook = (missionGraph.retrievalHooks || []).find((item) => item.phaseId === phaseId);
  if (!hook) {
    return {
      phaseId,
      rules: []
    };
  }
  const rules = (hook.requiredCardIds || [])
    .map((cardId) => cards.get(cardId))
    .filter((card) => card?.type === 'command.styleReaction' || card?.type === 'crew.relationship' || card?.type === 'crew.development')
    .map((card) => ({
      crewId: officerIdForCard(card),
      cardId: card.id,
      cardType: card.type,
      phaseId,
      audiences: cloneJson(hook.audiences || []),
      lanes: cloneJson(hook.lanes || []),
      rule: card.payload?.summary || '',
      constraints: cloneJson(card.payload?.constraints || []),
      possibleEffects: cloneJson(card.payload?.effects || [])
    }));
  return {
    phaseId,
    rules
  };
}

export function appendRelationshipMemory(campaignState, {
  crewId,
  event,
  interpretation,
  weight = 'neutral',
  visibility = 'hidden',
  sourceOutcomeId = null
}) {
  const next = cloneJson(campaignState);
  next.relationships = next.relationships || { rawValuesHidden: true };
  next.relationships.memoryLedger = [
    ...(next.relationships.memoryLedger || []),
    {
      crewId,
      event,
      interpretation,
      weight,
      visibility,
      sourceOutcomeId
    }
  ];
  next.relationships.rawValuesHidden = true;
  return next;
}

export function applyRelationshipMemoryFromTurn(campaignState, turnPacket, {
  crewIds = null,
  weight = 'moderate',
  visibility = 'hidden'
} = {}) {
  const presentCrew = crewIds || (turnPacket.sceneSnapshot?.presentCharacters || []).filter((id) => id !== 'player-commander');
  let next = cloneJson(campaignState);
  for (const crewId of presentCrew) {
    next = appendRelationshipMemory(next, {
      crewId,
      event: turnPacket.outcomePacket?.summary || 'Observed a committed command outcome.',
      interpretation: (turnPacket.stateDelta?.relationships?.descriptiveChanges || []).join(' ') || 'The outcome may affect future professional behavior.',
      weight,
      visibility,
      sourceOutcomeId: turnPacket.outcomePacket?.id || null
    });
  }
  return next;
}
