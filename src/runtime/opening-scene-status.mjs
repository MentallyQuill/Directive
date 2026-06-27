function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compactString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stepRecord(journal = null, step = '') {
  return journal?.steps && typeof journal.steps === 'object'
    ? journal.steps[step] || null
    : null;
}

function stepComplete(journal = null, step = '') {
  return stepRecord(journal, step)?.status === 'complete';
}

function introHostMessageId(state = null, journal = null) {
  return compactString(
    state?.campaignChatBinding?.introMessageId
    || stepRecord(journal, 'introPosted')?.details?.hostMessageId
    || ''
  );
}

function introTextLength(journal = null) {
  return compactString(journal?.introPacket?.text || '').length;
}

function statusSummary(reason) {
  switch (reason) {
    case 'ready':
      return 'Opening scene posted.';
    case 'no-campaign-state':
      return 'Load a campaign before building the opening scene.';
    case 'campaign-chat-unbound':
      return 'Bind the campaign chat before building the opening scene.';
    case 'opening-scene-generation-failed':
      return 'The campaign opening scene did not generate. Build the opening scene before play can continue.';
    case 'opening-scene-post-failed':
      return 'The campaign opening scene was generated but not posted. Build the opening scene before play can continue.';
    case 'opening-scene-required':
      return 'The campaign needs its opening scene before play can continue.';
    case 'activation-incomplete':
      return 'Campaign setup is still finishing. Finish setup before saving, branching, or playing.';
    default:
      return 'Build the campaign opening scene before play can continue.';
  }
}

export function campaignOpeningSceneStatus(state = null) {
  if (!state) {
    return {
      required: true,
      ready: false,
      blocked: true,
      reason: 'no-campaign-state',
      summary: statusSummary('no-campaign-state'),
      actionLabel: 'Build Opening Scene',
      recoveryActions: []
    };
  }

  const journal = state.activationJournal || {};
  const campaignStatus = compactString(state.campaign?.status);
  const journalStatus = compactString(journal.status);
  const binding = state.campaignChatBinding || null;
  const hasChatBinding = Boolean(compactString(binding?.chatId));
  const generated = stepComplete(journal, 'introGenerated') && introTextLength(journal) > 0;
  const postedMessageId = introHostMessageId(state, journal);
  const posted = Boolean(postedMessageId) && (
    stepComplete(journal, 'introPosted')
    || journalStatus === 'complete'
    || campaignStatus === 'active'
  );
  const activated = campaignStatus === 'active'
    && journalStatus === 'complete'
    && stepComplete(journal, 'activated');

  let reason = 'ready';
  if (!hasChatBinding) {
    reason = 'campaign-chat-unbound';
  } else if (!posted) {
    if (journalStatus === 'failed' || campaignStatus === 'activationFailed') {
      reason = generated ? 'opening-scene-post-failed' : 'opening-scene-generation-failed';
    } else {
      reason = 'opening-scene-required';
    }
  } else if (!activated && (campaignStatus === 'activating' || campaignStatus === 'activationFailed' || journalStatus === 'failed')) {
    reason = 'activation-incomplete';
  }

  return {
    required: true,
    ready: posted,
    blocked: reason !== 'ready',
    reason,
    summary: statusSummary(reason),
    actionLabel: reason === 'activation-incomplete' ? 'Finish Chat Setup' : 'Build Opening Scene',
    canBuild: hasChatBinding,
    recoveryActions: reason === 'ready' ? [] : ['buildOpeningScene'],
    hostMessageId: postedMessageId || null,
    activationStatus: journalStatus || null,
    campaignStatus: campaignStatus || null,
    failedStep: journal?.error?.failedStep || null,
    error: cloneJson(journal?.error || null)
  };
}
