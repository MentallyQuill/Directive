import { runCharacterCreatorSectionDraft } from '../creators/character-creator-assist.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function getNestedValue(source, path) {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

function setNestedValue(target, path, value) {
  const keys = String(path || '').split('.').filter(Boolean);
  if (keys.length === 0) return;
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    if (!isObject(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = cloneJson(value);
}

export function flatFieldsToPatch(fields = {}, { baseInput = null, missingOnly = false } = {}) {
  const patch = {};
  for (const [path, value] of Object.entries(fields || {})) {
    if (!path || value === undefined || value === null) continue;
    if (missingOnly) {
      const existing = getNestedValue(baseInput, path);
      if (typeof existing === 'string' && existing.trim()) continue;
    }
    setNestedValue(patch, path, value);
  }
  return patch;
}

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

export function creatorInputReadyForReview(input = {}) {
  const identity = input.identity || {};
  const service = input.service || {};
  const personality = input.personality || {};
  const traits = personality.traits || {};
  return hasText(identity.name)
    && hasText(identity.pronounsOrAddress)
    && hasText(identity.speciesId)
    && hasText(identity.ageBandId)
    && hasText(identity.appearance)
    && hasText(service.careerBackgroundId)
    && hasText(service.formativeExperienceId)
    && hasText(service.assignmentReasonId)
    && hasText(traits.insight)
    && hasText(traits.connection)
    && hasText(traits.execution)
    && hasText(personality.flawId);
}

export function creatorReviewHasGaps(input = {}) {
  const dossier = input.dossier || {};
  return !hasText(dossier.briefBiography) || !hasText(dossier.publicReputation);
}

export function createCreatorRuntimeService({
  getCreatorView = () => null,
  activeCreatorRuntimeAssets,
  setLastSectionDraftResult = () => {},
  sectionDraftRunner = runCharacterCreatorSectionDraft
} = {}) {
  if (typeof activeCreatorRuntimeAssets !== 'function') {
    throw new Error('activeCreatorRuntimeAssets must be a function');
  }
  if (typeof sectionDraftRunner !== 'function') {
    throw new Error('sectionDraftRunner must be a function');
  }

  async function appendReviewFallbackIfNeeded(patch = {}) {
    const normalizedPatch = cloneJson(patch);
    if (normalizedPatch.activeStep !== 'review') {
      return normalizedPatch;
    }
    const creatorView = getCreatorView();
    const mergedInput = mergeObjects(creatorView?.input || {}, normalizedPatch.input || {});
    if (!creatorInputReadyForReview(mergedInput) || !creatorReviewHasGaps(mergedInput)) {
      return normalizedPatch;
    }
    const assets = activeCreatorRuntimeAssets();
    const assistResult = await sectionDraftRunner({
      packageData: assets.packageData,
      creatorView,
      sectionId: 'review',
      input: mergedInput,
      generationRouter: null,
      useProvider: false
    });
    const fallbackPatch = flatFieldsToPatch(assistResult.fields || {}, {
      baseInput: mergedInput,
      missingOnly: true
    });
    if (Object.keys(fallbackPatch).length === 0) {
      return normalizedPatch;
    }
    normalizedPatch.input = mergeObjects(normalizedPatch.input || {}, fallbackPatch);
    setLastSectionDraftResult({
      ...cloneJson(assistResult),
      autoApplied: true
    });
    return normalizedPatch;
  }

  async function generateSectionDraft({
    sectionId,
    input = {},
    generationRouter = null,
    useProvider = true,
    signal = null
  } = {}) {
    const creatorView = getCreatorView();
    const assets = activeCreatorRuntimeAssets();
    const mergedInput = mergeObjects(creatorView?.input || {}, isObject(input) ? input : {});
    const assistResult = await sectionDraftRunner({
      packageData: assets.packageData,
      creatorView,
      sectionId,
      input: mergedInput,
      generationRouter,
      useProvider,
      signal
    });
    setLastSectionDraftResult(cloneJson(assistResult));
    return assistResult;
  }

  return Object.freeze({
    appendReviewFallbackIfNeeded,
    generateSectionDraft
  });
}
