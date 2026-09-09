// User-controlled request and response budgets. Values remain integers so array,
// schema and timer consumers receive the same effective configuration.
export const MAX_TIMER_TIMEOUT_SECONDS = Math.floor(2147483647 / 1000);
const definitions = [
  ['hostNarrationTimeoutSeconds', 'Narration completion wait (seconds)', 240],
  ['episodeMaxFallbackSummaries', 'Source summaries in a fallback episode summary', 8],
  ['providerVisibleOutputAttempts', 'Visible-output recovery attempts', 2],
  ['providerTestMaxTokens', 'Provider test output tokens', 512],
  ['openingMaxSceneReferences', 'Opening scene reference selections', 3],
  ['openingMaxBackgroundReferences', 'Opening background reference selections', 2],
  ['openingNarrationMaxTokens', 'Opening narration output tokens', 2200],
  ['timeReasonCharacters', 'Time interpretation reason characters', 180],
  ['timeEvidenceQuoteCharacters', 'Time evidence quote characters', 240, 12],
  ['scenePacingTextCharacters', 'Scene pacing text characters', 240],
  ['scenePacingQuoteCharacters', 'Scene pacing evidence quote characters', 240],
  ['interpreterMaxDurableSelections', 'Interpreter durable selections', 4],
  ['interpreterMaxClaims', 'Interpreter claims', 4],
  ['interpreterMaxPeopleEvents', 'Interpreter people events', 24],
  ['interpreterEvidenceQuoteCharacters', 'Interpreter evidence quote characters', 240, 12],
  ['interpreterPeopleNameCharacters', 'Introduced person name characters', 120],
  ['interpreterPeopleSummaryCharacters', 'People event summary characters', 512],
  ['interpreterPeopleFactCharacters', 'People public fact characters', 240],
  ['interpreterPeopleProfileCharacters', 'People profile characters', 512],
  ['interpreterPeopleLocalRefCharacters', 'Introduced person local reference characters', 80],
  ['interpreterPeopleRefCharacters', 'People reference characters', 120],
  ['dossierMaxIntroductions', 'People per dossier request', 8],
  ['dossierShipSummaryCharacters', 'Dossier ship context characters', 800],
  ['dossierIntroductionSummaryCharacters', 'Dossier introduction context characters', 512],
  ['dossierFieldCharacters', 'Dossier public field characters', 240],
  ['dossierProfileCharacters', 'Dossier profile summary characters', 512],
  ['requestContextCharacters', 'Request context characters', 48000],
  ['threadContextCharacters', 'Thread context characters', 12000],
  ['threadMaxRecords', 'Threads per request', 12],
  ['threadMaxFactsPerRecord', 'Facts per thread', 6],
  ['threadLookupMaxRecords', 'Threads per follow-up lookup', 6],
  ['threadInactivityRevisions', 'Revisions before an inactive thread leaves routine context', 12, 0],
  ['threadDeadlineLeadSeconds', 'Deadline attention lead (seconds)', 1800, 0],
  ['continuityMaxChanges', 'Continuity changes per response', 16],
  ['continuityTitleCharacters', 'Thread title characters', 120],
  ['continuityFactCharacters', 'Fact text characters', 512],
  ['continuityEvidenceQuoteCharacters', 'Evidence quote characters', 240, 12],
  ['continuityMaxLinkedIds', 'Links per fact', 16],
  ['continuityDeadlineHorizonSeconds', 'Deadline hint horizon (seconds)', 604800, 0],
  ['continuityLookupRequests', 'Lookup requests per response', 3],
  ['continuityLookupPasses', 'Continuity passes including the initial request', 2],
  ['continuityMaxLocalRefCharacters', 'New thread reference characters', 80],
  ['storyMaxTargetIdCharacters', 'Direction target ID characters', 300],
  ['continuityLookupIds', 'IDs per lookup request', 8],
  ['continuityLookupQueryCharacters', 'Lookup query characters', 160],
  ['directionMaxRequires', 'Conditions per direction', 8],
  ['storyReferenceCount', 'Known entity references per request', 64],
  ['storyReferenceNameCharacters', 'Entity reference name characters', 160],
  ['episodeMaxVisibleEffects', 'Episode effects per request', 24],
  ['episodeMaxSourceIds', 'Episode source IDs', 128],
  ['episodeMaxEntrySourceIds', 'Source IDs per relationship or moment', 16],
  ['episodeMaxRecentEvidence', 'Recent episode evidence entries', 6],
  ['episodeMaxEvidenceExcerptCharacters', 'Episode evidence excerpt characters', 240],
  ['episodeMaxEvidenceCharacters', 'Episode evidence total characters', 1200],
  ['episodeMaxReferenceIds', 'Episode references per category', 32],
  ['episodeMaxRecentSummaries', 'Recent episode summaries', 2],
  ['episodeMaxContinueSummaryCharacters', 'Current episode summary characters', 768],
  ['episodeMaxSealedSummaryCharacters', 'Sealed episode summary characters', 1024],
  ['episodeMaxQuestionCharacters', 'Episode question characters', 240],
  ['episodeMaxPeopleEvents', 'People events per episode request', 24],
  ['episodeMaxRelationships', 'Relationships per episode response', 32],
  ['episodeMaxRelationshipTextCharacters', 'Relationship text characters', 240],
  ['episodeMaxMomentTitleCharacters', 'Moment title characters', 120],
  ['episodeMaxMomentSummaryCharacters', 'Moment summary characters', 512],
];
const independentLimits = new Set([
  'hostNarrationTimeoutSeconds', 'providerVisibleOutputAttempts', 'continuityLookupPasses',
  'threadInactivityRevisions', 'threadDeadlineLeadSeconds', 'continuityDeadlineHorizonSeconds',
  'interpreterPeopleRefCharacters', 'interpreterPeopleLocalRefCharacters', 'continuityMaxLocalRefCharacters', 'storyMaxTargetIdCharacters',
]);
export const ANALYSIS_LIMIT_DESCRIPTORS = Object.freeze(definitions.map(([key, label, defaultValue, min = 1]) => Object.freeze({ key, label, defaultValue, min, scalable: !independentLimits.has(key) })));
export const DEFAULT_ANALYSIS_LIMITS = Object.freeze(Object.fromEntries(ANALYSIS_LIMIT_DESCRIPTORS.map(item => [item.key, item.defaultValue])));

export function normalizeAnalysisLimits(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(ANALYSIS_LIMIT_DESCRIPTORS.map(({ key, defaultValue, min }) => {
    const raw = source[key];
    const number = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
    const maximum = key === 'hostNarrationTimeoutSeconds' ? MAX_TIMER_TIMEOUT_SECONDS : Number.MAX_SAFE_INTEGER;
    return [key, Number.isFinite(number) ? Math.min(maximum, Math.max(min, Math.round(number))) : defaultValue];
  }));
}

export function normalizeAnalysisCapacity(value) {
  const number = value == null || value === '' ? NaN : Number(value);
  return Number.isFinite(number) ? Math.min(5, Math.max(0.5, number)) : 1;
}

export function normalizeAnalysisOverrides(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const normalized = normalizeAnalysisLimits(value);
  return Object.fromEntries(ANALYSIS_LIMIT_DESCRIPTORS.filter(({ key }) => Object.hasOwn(value, key)
    && value[key] != null && value[key] !== '' && Number.isFinite(Number(value[key])))
    .map(({ key }) => [key, normalized[key]]));
}

export function readAnalysisOverrides(utilitySettings = {}) {
  if (!utilitySettings || typeof utilitySettings !== 'object' || Array.isArray(utilitySettings)) utilitySettings = {};
  if (Object.hasOwn(utilitySettings, 'analysisOverrides')) return normalizeAnalysisOverrides(utilitySettings.analysisOverrides);
  const previous = normalizeAnalysisLimits(utilitySettings.analysisLimits);
  return Object.fromEntries(Object.entries(previous).filter(([key, value]) => value !== DEFAULT_ANALYSIS_LIMITS[key]));
}

export function resolveAnalysisLimits(utilitySettings = {}) {
  if (!utilitySettings || typeof utilitySettings !== 'object' || Array.isArray(utilitySettings)) utilitySettings = {};
  const capacity = normalizeAnalysisCapacity(utilitySettings.analysisCapacity);
  const scaled = Object.fromEntries(ANALYSIS_LIMIT_DESCRIPTORS.map(({ key, defaultValue, min, scalable }) => [key,
    scalable ? Math.max(min, Math.round(defaultValue * capacity)) : defaultValue]));
  return normalizeAnalysisLimits({ ...scaled, ...readAnalysisOverrides(utilitySettings) });
}

export function normalizeOutputTokenOverride(lane = {}) {
  if (!lane || typeof lane !== 'object' || Array.isArray(lane)) lane = {};
  const raw = Object.hasOwn(lane, 'outputTokenOverride') ? lane.outputTokenOverride
    : lane.maxTokens != null && Number(lane.maxTokens) !== 8192 ? lane.maxTokens : null;
  if (raw == null || raw === '' || !Number.isFinite(Number(raw))) return null;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.round(Number(raw))));
}

export function resolveProviderMaxTokens(settings = {}, lane = 'utility', roleId = null) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) settings = {};
  const config = settings[lane] || {};
  const roleOverride = config.roleLimits?.[roleId]?.maxTokens;
  if (roleOverride != null && roleOverride !== '' && Number.isFinite(Number(roleOverride))) {
    return Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Math.round(Number(roleOverride))));
  }
  return normalizeOutputTokenOverride(config) ?? Math.round(8192 * normalizeAnalysisCapacity(settings.utility?.analysisCapacity));
}
