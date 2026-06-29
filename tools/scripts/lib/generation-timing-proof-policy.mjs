export const DIRECTIVE_GENERATED_TIMING_RESPONSE_KINDS = new Set([
  'committedOutcome',
  'campaignConclusion'
]);

export const DIRECTIVE_NON_GENERATED_TIMING_RESPONSE_KINDS = new Set([
  'campaignIntro',
  'clarificationNeeded',
  'commandBearing',
  'locationTransition',
  'riskConfirmationNeeded',
  'routineCommand',
  'terminalOutcomeCheckpoint'
]);

export function generationTimingEntryStatus(entry = {}) {
  const latency = entry.turnLatency || {};
  const generationStartLatencyMs = Number(latency.generationStartLatencyMs);
  const overBudget = Number.isFinite(generationStartLatencyMs) && generationStartLatencyMs > 60000;
  if (entry.route === 'hostContinue' && !entry.hostGenerationReleasedAt && !latency.hostGenerationReleasedAt) return 'missing-host-release';
  if ((entry.route === 'directiveCommit' || entry.route === 'directivePosted') && !entry.directiveGenerationStartedAt && !latency.directiveGenerationStartedAt) return 'missing-directive-start';
  if (!Number.isFinite(generationStartLatencyMs)) return 'missing-latency';
  if (latency.architectureWithin60s !== true || overBudget) return 'over-budget';
  return 'pass';
}

export function timingProofEntryHasDirectiveGenerationStart(entry = {}) {
  const latency = entry.turnLatency || {};
  return Boolean(entry.directiveGenerationStartedAt || latency.directiveGenerationStartedAt);
}

export function timingProofEntryRequiresGenerationStart(entry = {}) {
  const route = entry.route || null;
  if (route === 'hostContinue') return true;
  if (route !== 'directiveCommit' && route !== 'directivePosted') return false;
  const responseKind = entry.responseKind || null;
  if (DIRECTIVE_GENERATED_TIMING_RESPONSE_KINDS.has(responseKind)) return true;
  if (timingProofEntryHasDirectiveGenerationStart(entry)) return true;
  return false;
}

export function timingProofEntryIsNonGenerated(entry = {}) {
  const route = entry.route || null;
  const responseKind = entry.responseKind || null;
  return (route === 'directiveCommit' || route === 'directivePosted' || route === 'pause')
    && DIRECTIVE_NON_GENERATED_TIMING_RESPONSE_KINDS.has(responseKind)
    && !timingProofEntryRequiresGenerationStart(entry);
}

export function generationTimingProofStatus({ checked = [], statuses = [], entries = [] } = {}) {
  if (checked.length > 0) return statuses.every((entry) => entry === 'pass') ? 'pass' : 'fail';
  if (entries.length > 0 && entries.every((entry) => timingProofEntryIsNonGenerated(entry))) return 'skipped';
  return 'warning';
}
