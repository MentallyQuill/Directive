import { stableSha256Hex } from './v1-stable-hash.mjs';
const PHASES = new Set(['characters', 'narration', 'review', 'repair', 'publication']);
const ROLES = new Set(['characterResponder', 'sceneNarrator', 'characterKnowledgeReviewer']);
const FAILURES = new Set(['DIRECTIVE_CHARACTER_KNOWLEDGE_REJECTED', 'DIRECTIVE_CHARACTER_SCENE_STALE', 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING', 'DIRECTIVE_GENERATION_ABORTED', 'DIRECTIVE_TURN_ATTEMPT_LIMIT', 'provider_empty_content', 'provider_reasoning_only', 'provider_token_limit', 'provider-aborted', 'json_empty', 'json_parse_failed']);
const failure = value => value == null ? null : FAILURES.has(value) ? value : 'generation-failed';
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export function createCharacterSceneDiagnostics({ identity = {}, publicationId = '', clock = () => performance.now(), onUpdate } = {}) {
  const now = () => { try { const value = clock(); return Number.isFinite(value) ? value : 0; } catch { return 0; } };
  const started = now(); let ended = null, phaseStarted = started, currentPhase = null;
  const report = { kind: 'directive.characterSceneDiagnostics.v1', attempts: 0, repairCount: 0, outcome: 'running', failureCode: null,
    custody: { publicationHash: stableSha256Hex(String(publicationId)), bindingHash: stableSha256Hex(String(identity.bindingKey || '')),
      sourceDigest: /^[a-f0-9]{64}$/.test(identity.sourceDigest) ? identity.sourceDigest : null,
      settingsDigest: /^[a-f0-9]{64}$/.test(identity.settingsDigest) ? identity.settingsDigest : null }, phases: [], roleCalls: [] };
  const snapshot = () => structuredClone({ ...report, durationMs: Math.max(0, (ended ?? now()) - started),
    currentPhase, tokenUsageComplete: report.attempts === report.roleCalls.length && report.roleCalls.every(call => call.tokens.total !== null) });
  const emit = () => { try { Promise.resolve(onUpdate?.(snapshot())).catch(() => {}); } catch { /* Diagnostics do not own generation. */ } };
  const closePhase = () => { if (currentPhase) report.phases.push({ phase: currentPhase, durationMs: Math.max(0, now() - phaseStarted) }); };
  return { snapshot,
    phase(value) { if (!PHASES.has(value)) return; closePhase(); currentPhase = value; phaseStarted = now(); if (value === 'repair') report.repairCount++; emit(); },
    attempt(value) { if (Number.isSafeInteger(value) && value > report.attempts) { report.attempts = value; emit(); } },
    response({ roleId, usage, errorCode, durationMs } = {}) {
      if (!ROLES.has(roleId) || report.roleCalls.length >= 10) return;
      report.roleCalls.push({ roleId, durationMs: Number.isFinite(durationMs) ? Math.max(0, durationMs) : null, failureCode: failure(errorCode),
        tokens: { input: count(usage?.input_tokens ?? usage?.prompt_tokens), output: count(usage?.output_tokens ?? usage?.completion_tokens), total: count(usage?.total_tokens) } }); emit();
    },
    finish(outcome, code = null) { closePhase(); currentPhase = null; ended = now(); report.outcome = ['complete', 'failed', 'canceled', 'pending'].includes(outcome) ? outcome : 'failed'; report.failureCode = failure(code); emit(); },
  };
}
