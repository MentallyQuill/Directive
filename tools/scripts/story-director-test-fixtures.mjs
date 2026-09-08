export function makeSourcePair() {
  return {
    previousAssistant: {
      messageId: 'a7',
      selectedSwipeId: '0',
      textHash: 'abcd1234',
      text: 'Rendezvous 1400. The tender awaits your response.',
    },
    currentPlayer: {
      messageId: 'u8',
      selectedSwipeId: null,
      textHash: 'abcd5678',
      text: 'What flexibility do we have?',
    },
  };
}

export function makeChanges() {
  return [
    {
      operation: 'open',
      localRef: 'ravenna',
      title: 'Ravenna transfer',
      category: 'schedule',
      sourceSlot: 'previousAssistant',
      evidenceQuote: 'Rendezvous 1400.',
    },
    {
      operation: 'addFact',
      threadRef: 'ravenna',
      text: 'The rendezvous is scheduled for 1400.',
      claimType: 'narrated-fact',
      authoredRef: null,
      supersedesFactId: null,
      sourceSlot: 'previousAssistant',
      evidenceQuote: 'Rendezvous 1400.',
    },
  ];
}

export function makeMaterializeInput(overrides = {}) {
  return {
    changes: makeChanges(),
    sourcePair: makeSourcePair(),
    assistantAccepted: true,
    contributionIds: {
      previousAssistant: 'contribution.a7',
      currentPlayer: 'contribution.u8',
    },
    branchId: 'save.test',
    sourceRangeHash: 'pair.test',
    existingEvents: [],
    settledAtRevision: 1,
    ...overrides,
  };
}
