export function makeSourcePair() {
  return {
    previousAssistant: {
      messageId: 'assistant.7',
      selectedSwipeId: '0',
      textHash: 'hash.assistant.7',
      text: 'Rendezvous at 1400. The tender awaits your response.',
    },
    currentPlayer: {
      messageId: 'player.8',
      selectedSwipeId: null,
      textHash: 'hash.player.8',
      text: 'I will ask the tender captain what flexibility remains.',
    },
  };
}

export function makeDirectorRequest(overrides = {}) {
  const sourcePair = makeSourcePair();
  return {
    kind: 'directive.storyDirectorRequest.v1',
    envelope: {
      campaignId: 'campaign.example',
      saveId: 'save.example',
      chatId: 'chat.example',
      packageId: 'package.example',
      packageVersion: '1',
      branchId: 'save.example',
      baseRevision: 12,
      missionId: 'mission.example',
      sourceRangeHash: 'pair.example',
      generationType: 'normal',
    },
    pendingPair: sourcePair,
    authoredContext: {
      constraints: [{
        id: 'condition.handover-complete',
        kind: 'runtime-condition',
        text: 'A handover must be complete before this opportunity can be surfaced.',
      }],
      opportunities: [{
        id: 'opportunity.assignment',
        kind: 'objective',
        playerSafeText: 'Discuss the outstanding assignment.',
        conditionIds: ['condition.handover-complete'],
      }],
      coverage: 'partial',
    },
    continuity: { index: [], records: [] },
    currentScene: null,
    episodeReview: null,
    ...structuredClone(overrides),
  };
}

export function makeDirectorOutput(request = makeDirectorRequest(), overrides = {}) {
  return {
    kind: 'directive.storyDirectorProposal.v1',
    envelope: structuredClone(request.envelope),
    coverage: 'complete',
    threadChanges: [{
      operation: 'open',
      sourceSlot: 'previousAssistant',
      evidenceQuote: 'Rendezvous at 1400.',
      localRef: 'rendezvous',
      title: 'Tender rendezvous',
      category: 'schedule',
    }, {
      operation: 'addFact',
      sourceSlot: 'previousAssistant',
      evidenceQuote: 'Rendezvous at 1400.',
      threadRef: 'rendezvous',
      text: 'The rendezvous is scheduled for 1400.',
      claimType: 'narrated-fact',
      authoredRef: null,
      supersedesFactId: null,
    }],
    direction: {
      move: 'respond-to-player',
      targetRef: null,
      newComplications: 'avoid',
      requires: [],
    },
    episodeReview: null,
    ...structuredClone(overrides),
  };
}

export function makeEpisodeReviewRequest() {
  return {
    kind: 'directive.episodeEvaluationRequest.v1',
    envelope: {
      branchId: 'save.example',
      episodeId: 'episode.example',
      baseRevision: 7,
      checkpointSequence: 2,
    },
    pendingSourceContributionIds: [],
    workingCapsule: {
      kind: 'directive.storyWorkingCapsule.v1',
      summary: '',
      foregroundQuestion: null,
      sourceContributionIds: [],
      effectIds: [],
      needsReview: true,
      lastEvaluatedCheckpointSequence: 1,
      updatedAtRevision: 6,
    },
    recentEvidence: [],
    visibleEffects: [],
    references: { missionIds: [], questIds: [], participantIds: [], locationIds: [] },
    recentSealedSummaries: [],
    peopleEvents: [],
    currentRelationships: [],
  };
}
