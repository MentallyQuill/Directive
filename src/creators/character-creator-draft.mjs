import { createCharacterCreationContext } from '../packages/starship-package-context.mjs';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function mergeObjects(base, patch) {
  if (!isObject(patch)) {
    return cloneJson(base || {});
  }

  const next = cloneJson(base || {});
  for (const [key, value] of Object.entries(patch)) {
    if (isObject(value) && isObject(next[key])) {
      next[key] = mergeObjects(next[key], value);
    } else {
      next[key] = cloneJson(value);
    }
  }
  return next;
}

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function stepComplete(input, step) {
  const identity = input.identity || {};
  const service = input.service || {};
  const personality = input.personality || {};
  const traits = personality.traits || {};
  const dossier = input.dossier || {};

  if (step === 'identity') {
    return hasText(identity.name)
      && hasText(identity.pronounsOrAddress)
      && hasText(identity.speciesId)
      && hasText(identity.ageBandId)
      && hasText(identity.appearance);
  }

  if (step === 'service') {
    return hasText(service.careerBackgroundId)
      && hasText(service.formativeExperienceId)
      && hasText(service.assignmentReasonId);
  }

  if (step === 'personality') {
    return hasText(traits.insight)
      && hasText(traits.connection)
      && hasText(traits.execution)
      && hasText(personality.flawId);
  }

  if (step === 'review') {
    return hasText(dossier.briefBiography)
      && hasText(dossier.publicReputation);
  }

  return false;
}

function computeCompletedSteps(input) {
  return ['identity', 'service', 'personality', 'review'].filter((step) => stepComplete(input, step));
}

function createDraftProgress(input) {
  const completedSteps = computeCompletedSteps(input);
  return {
    completedSteps,
    identityComplete: completedSteps.includes('identity'),
    serviceComplete: completedSteps.includes('service'),
    personalityComplete: completedSteps.includes('personality'),
    reviewReady: completedSteps.includes('identity')
      && completedSteps.includes('service')
      && completedSteps.includes('personality'),
    readyForCampaignStart: completedSteps.length === 4
  };
}

function appendAutosaveHistory(record, savedAt, reason) {
  const history = [
    ...(record.autosave?.history || []),
    {
      revision: record.revision,
      savedAt,
      reason,
      activeStep: record.activeStep,
      completedSteps: cloneJson(record.progress.completedSteps)
    }
  ];
  return history.slice(-10);
}

export function createCharacterCreatorDraftRecord({
  packageData,
  draftId,
  createdAt,
  activeStep = 'identity'
}) {
  const context = createCharacterCreationContext(packageData);
  const id = requireNonEmptyString(draftId, 'draftId');
  const timestamp = requireNonEmptyString(createdAt, 'createdAt');
  const input = {
    identity: {},
    service: {},
    personality: {
      traits: {}
    },
    dossier: {}
  };
  const progress = createDraftProgress(input);

  return {
    kind: 'directive.characterCreatorDraft',
    schemaVersion: 1,
    id,
    status: 'inProgress',
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    package: cloneJson(context.package),
    campaign: cloneJson(context.campaign),
    ship: cloneJson(context.ship),
    roleMode: context.roleMode,
    lockedRole: cloneJson(context.lockedRole),
    contextSnapshot: cloneJson(context),
    activeStep,
    input,
    progress,
    autosave: {
      enabled: true,
      lastReason: 'created',
      history: [
        {
          revision: 1,
          savedAt: timestamp,
          reason: 'created',
          activeStep,
          completedSteps: []
        }
      ]
    }
  };
}

export function saveCharacterCreatorDraftRecord(draftRecord, patch = {}, {
  savedAt,
  reason = 'manualSave'
} = {}) {
  requireObject(draftRecord, 'draftRecord');
  if (draftRecord.kind !== 'directive.characterCreatorDraft') {
    throw new Error('draftRecord must be a directive.characterCreatorDraft record');
  }
  if (draftRecord.status === 'accepted') {
    throw new Error('Cannot save changes to an accepted Character Creator draft');
  }

  const timestamp = requireNonEmptyString(savedAt, 'savedAt');
  const next = cloneJson(draftRecord);
  next.revision += 1;
  next.updatedAt = timestamp;
  next.status = patch.status || 'inProgress';
  next.activeStep = patch.activeStep || next.activeStep;
  next.input = mergeObjects(next.input, patch.input || {});
  next.progress = createDraftProgress(next.input);
  next.autosave = {
    enabled: true,
    lastReason: reason,
    history: appendAutosaveHistory(next, timestamp, reason)
  };
  return next;
}

export function loadCharacterCreatorDraftRecord(draftRecord) {
  requireObject(draftRecord, 'draftRecord');
  if (draftRecord.kind !== 'directive.characterCreatorDraft') {
    throw new Error('draftRecord must be a directive.characterCreatorDraft record');
  }
  return cloneJson(draftRecord);
}

export function getCharacterCreatorDraftProgress(draftRecord) {
  requireObject(draftRecord, 'draftRecord');
  return createDraftProgress(draftRecord.input || {});
}

export function createCreatorReviewFromDraft(draftRecord) {
  requireObject(draftRecord, 'draftRecord');
  const progress = getCharacterCreatorDraftProgress(draftRecord);
  if (!progress.readyForCampaignStart) {
    throw new Error('Character Creator draft is not ready for campaign start');
  }
  return cloneJson(draftRecord.input);
}

export function acceptCharacterCreatorDraftRecord(draftRecord, {
  acceptedAt,
  review = null
} = {}) {
  requireObject(draftRecord, 'draftRecord');
  if (draftRecord.kind !== 'directive.characterCreatorDraft') {
    throw new Error('draftRecord must be a directive.characterCreatorDraft record');
  }

  const timestamp = requireNonEmptyString(acceptedAt, 'acceptedAt');
  const acceptedReview = review ? cloneJson(review) : createCreatorReviewFromDraft(draftRecord);
  const progress = createDraftProgress(acceptedReview);
  if (!progress.readyForCampaignStart) {
    throw new Error('Character Creator review is not ready for campaign start');
  }
  const next = cloneJson(draftRecord);
  next.status = 'accepted';
  next.revision += 1;
  next.updatedAt = timestamp;
  next.acceptedAt = timestamp;
  next.acceptedReview = acceptedReview;
  next.progress = progress;
  next.autosave = {
    enabled: true,
    lastReason: 'accepted',
    history: appendAutosaveHistory(next, timestamp, 'accepted')
  };
  return next;
}
