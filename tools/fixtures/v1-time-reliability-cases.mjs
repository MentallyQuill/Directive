export const explicitWait = {
  previousAssistant: { text: 'The room is quiet.' },
  currentPlayer: { text: 'I wait exactly ten minutes.' },
};

export function timeState() {
  return {
    campaign: { openingStardate: 53049.2, currentStardate: 53049.2 },
    worldState: { kind: 'directive.worldState.v1', currentStardate: 53049.2, elapsedSeconds: 0 },
    timeLedger: { kind: 'directive.timeLedger.v1', openingMinuteOfDay: 510, elapsedSeconds: 0, entries: [], decisions: [] },
  };
}
export const timePackage = { world: { layout: { stardatePerDay: 1 } } };
export function timeSnapshot(playerText, { opening = false, assistantText = 'The room is quiet.', id = '1' } = {}) {
  return { source: {
    sourceRangeHash: `range.${id}`,
    previousAssistant: { hostMessageId: `a.${id}`, text: assistantText, selectedVariant: opening ? { outcomeId: 'opening' } : {} },
    currentPlayer: { hostMessageId: `p.${id}`, text: playerText },
  } };
}

export function interpretation(time, assistantAcceptance = 'accepted') {
  return {
    kind: 'directive.missionEvidenceInterpretation.v1',
    assistantAcceptance, claims: [], peopleEvents: [], abstained: false,
    time: { reason: 'visible passage', confidence: 0.9,
      basis: time.decision === 'unchanged' ? 'noPassage' : time.decision === 'indeterminate' ? 'unresolved'
        : time.durationSeconds ? 'explicitDuration' : 'implicitAction', ...time },
  };
}

export const openingDurationCases = [
  ['calendar scene cut', 'The next morning, I report to the bridge and take the conn.', {
    decision: 'advance', elapsedSeconds: 86400, reason: 'next-morning-scene-cut', confidence: 0.95,
    durationSeconds: 86400, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'The next morning, I report to the bridge and take the conn.'
  }, 86400],
  ['mismatched duration', 'I wait exactly ten minutes before entering.', {
    decision: 'advance', elapsedSeconds: 86400, reason: 'mismatched-player-wait', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I wait exactly ten minutes before entering.'
  }, 0],
  ['negated duration', 'I refuse to wait twenty minutes before entering.', {
    decision: 'advance', elapsedSeconds: 1200, reason: 'negated-player-wait', confidence: 0.4,
    durationSeconds: 1200, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I refuse to wait twenty minutes before entering.'
  }, 0],
  ['trimmed negated duration', 'I refuse to wait twenty minutes before entering.', {
    decision: 'advance', elapsedSeconds: 1200, reason: 'trimmed-negated-player-wait', confidence: 0.4,
    durationSeconds: 1200, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'wait twenty minutes before entering'
  }, 0],
  ['cannot duration', 'I cannot wait twenty minutes before entering.', {
    decision: 'advance', elapsedSeconds: 1200, reason: 'cannot-player-wait', confidence: 0.4,
    durationSeconds: 1200, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'wait twenty minutes before entering'
  }, 0],
  ['curly negation duration', 'I won’t wait twenty minutes before entering.', {
    decision: 'advance', elapsedSeconds: 1200, reason: 'curly-negated-player-wait', confidence: 0.4,
    durationSeconds: 1200, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'wait twenty minutes before entering'
  }, 0],
  ['questioned duration', 'Do we spend two hours waiting before entering?', {
    decision: 'advance', elapsedSeconds: 7200, reason: 'questioned-player-wait', confidence: 0.4,
    durationSeconds: 7200, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'Do we spend two hours waiting before entering?'
  }, 0],
  ['conditional duration', 'If we wait ten minutes, we might miss launch.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'conditional-player-wait', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'wait ten minutes, we might miss launch'
  }, 0],
  ['scheduled duration', 'We are scheduled to wait ten minutes before launch.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'scheduled-player-wait', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'wait ten minutes before launch'
  }, 0],
  ['past duration', 'Yesterday I waited ten minutes before launch.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'past-player-wait', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'waited ten minutes before launch'
  }, 0],
  ['later negation outside duration clause', 'I wait twenty minutes, not taking my eyes off the screen.', {
    decision: 'advance', elapsedSeconds: 1200, reason: 'enacted-player-wait', confidence: 0.99,
    durationSeconds: 1200, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I wait twenty minutes'
  }, 1200],
  ['unrelated quoted clause', 'I wait ten minutes, then I enter the ready room.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'unrelated-evidence', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'then I enter the ready room'
  }, 0],
  ['last-night duration', 'Last night I waited ten minutes.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'past-player-wait', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'waited ten minutes'
  }, 0],
  ['estimated duration', 'The repair estimate is ten minutes.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'estimated-repair', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'repair estimate is ten minutes'
  }, 0],
  ['prior-clause negation', 'I cannot enter yet, so I wait twenty minutes.', {
    decision: 'advance', elapsedSeconds: 1200, reason: 'enacted-after-delay', confidence: 0.99,
    durationSeconds: 1200, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I wait twenty minutes'
  }, 1200],
  ['later-clause question', 'I wait twenty minutes, then ask, Are we ready?', {
    decision: 'advance', elapsedSeconds: 1200, reason: 'enacted-before-question', confidence: 0.99,
    durationSeconds: 1200, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I wait twenty minutes'
  }, 1200],
  ['conditional leading clause', 'If the captain agrees, I wait ten minutes.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'conditional-leading-player-wait', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I wait ten minutes'
  }, 0],
  ['past leading clause', 'Last night, I waited ten minutes.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'past-leading-player-wait', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'waited ten minutes'
  }, 0],
  ['question after comma', 'Do we wait ten minutes, or leave now?', {
    decision: 'advance', elapsedSeconds: 600, reason: 'question-before-comma', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'wait ten minutes'
  }, 0],
  ['planned conjunction', 'I plan to leave and then wait ten minutes.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'planned-conjunction', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'wait ten minutes'
  }, 0],
  ['future comma conjunction', 'I will finish this, then wait ten minutes.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'future-comma-conjunction', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'wait ten minutes'
  }, 0],
  ['trailing future duration', 'I wait ten minutes tomorrow.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'trailing-future', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I wait ten minutes tomorrow'
  }, 0],
  ['trailing conditional duration', 'I wait ten minutes if the captain agrees.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'trailing-conditional', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I wait ten minutes if the captain agrees'
  }, 0],
  ['clock future duration', 'At 0900 tomorrow, I will depart.', {
    decision: 'advance', elapsedSeconds: 1800, reason: 'future-clock', confidence: 0.4,
    durationSeconds: 1800, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'At 0900 tomorrow'
  }, 0],
  ['markdown enacted wait', '*I wait ten minutes before leaving.*', {
    decision: 'advance', elapsedSeconds: 600, reason: 'markdown-wait', confidence: 0.99,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I wait ten minutes before leaving.'
  }, 600],
  ['markdown scene cut', '*Ten minutes later, I enter the bridge.*', {
    decision: 'advance', elapsedSeconds: 600, reason: 'markdown-scene-cut', confidence: 0.99,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'Ten minutes later, I enter the bridge.'
  }, 600],
  ['wrapped conditional', '*If the captain agrees, I wait ten minutes.*', {
    decision: 'advance', elapsedSeconds: 600, reason: 'wrapped-conditional', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I wait ten minutes.'
  }, 0],
  ['quoted past condition', '“Last night, I waited ten minutes.”', {
    decision: 'advance', elapsedSeconds: 600, reason: 'quoted-past', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'waited ten minutes.'
  }, 0],
  ['later unrelated modal', 'I wait ten minutes and then ask what we should do.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'wait-before-modal', confidence: 0.99,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I wait ten minutes'
  }, 600],
  ['concurrent unrelated modal', 'I wait ten minutes while deciding what I might say.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'wait-with-reflection', confidence: 0.99,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I wait ten minutes'
  }, 600],
  ['only-if duration', 'I wait ten minutes only if the captain agrees.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'only-if-wait', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I wait ten minutes only if the captain agrees'
  }, 0],
  ['comma conditional duration', 'I wait ten minutes, if the captain agrees.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'comma-if-wait', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I wait ten minutes'
  }, 0],
  ['parenthetical conditional duration', 'I wait ten minutes (if the captain agrees).', {
    decision: 'advance', elapsedSeconds: 600, reason: 'parenthetical-if-wait', confidence: 0.4,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I wait ten minutes'
  }, 0],
  ['conditional clock anchor', 'At 0900, if cleared, I depart.', {
    decision: 'advance', elapsedSeconds: 1800, reason: 'conditional-clock', confidence: 0.4,
    durationSeconds: 1800, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'At 0900'
  }, 0],
  ['additional-duration compatibility', 'I wait ten more minutes before leaving.', {
    decision: 'advance', elapsedSeconds: 600, reason: 'additional-wait', confidence: 0.99,
    durationSeconds: 600, durationSourceSlot: 'currentPlayer',
    durationEvidenceQuote: 'I wait ten more minutes before leaving.'
  }, 600]
];
