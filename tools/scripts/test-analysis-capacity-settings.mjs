import assert from 'node:assert/strict';
import { ANALYSIS_LIMIT_DESCRIPTORS, DEFAULT_ANALYSIS_LIMITS, normalizeAnalysisCapacity, resolveAnalysisLimits, resolveProviderMaxTokens } from '../../src/generation/analysis-limits.mjs';
import { createSillyTavernProviderSettingsStore, normalizeDirectiveProviderSettings } from '../../src/providers/directive-provider-settings.mjs';

assert.equal(normalizeAnalysisCapacity(), 1);
assert.equal(normalizeAnalysisCapacity(0), 0.5);
assert.equal(normalizeAnalysisCapacity(99), 5);
assert.equal(normalizeAnalysisCapacity(Infinity), 1);
for (const malformed of [null, false, 123, 'invalid', []]) {
  assert.deepEqual(resolveAnalysisLimits(malformed), DEFAULT_ANALYSIS_LIMITS);
  assert.equal(resolveProviderMaxTokens(malformed), 8192);
  assert.equal(resolveProviderMaxTokens({ utility: malformed, reasoning: malformed }, 'reasoning'), 8192);
}
for (const capacity of [0.5, 1, 2.3, 5]) {
  let config = normalizeDirectiveProviderSettings({ utility: { analysisCapacity: capacity } });
  const effective = resolveAnalysisLimits(config.utility);
  for (let pass = 0; pass < 5; pass++) {
    config = normalizeDirectiveProviderSettings(config);
    assert.deepEqual(resolveAnalysisLimits(config.utility), effective, 'normalizing stored settings cannot compound scaling');
  }
  for (const descriptor of ANALYSIS_LIMIT_DESCRIPTORS) {
    assert.equal(effective[descriptor.key], descriptor.scalable ? Math.max(descriptor.min, Math.round(descriptor.defaultValue * capacity)) : descriptor.defaultValue);
  }
  assert.equal(resolveProviderMaxTokens(config, 'reasoning', 'storyDirectionAnalyst'), Math.round(8192 * capacity));
  assert.equal(config.reasoning.maxTokens, 8192, 'compatibility lane value is not pre-scaled');
}
const migrated = normalizeDirectiveProviderSettings({ utility: { analysisCapacity: 2, analysisLimits: { ...DEFAULT_ANALYSIS_LIMITS, continuityFactCharacters: 3000 } }, reasoning: { maxTokens: 16000 } });
assert.deepEqual(migrated.utility.analysisOverrides, { continuityFactCharacters: 3000 });
assert.equal(resolveAnalysisLimits(migrated.utility).continuityFactCharacters, 3000);
assert.equal(resolveAnalysisLimits(migrated.utility).threadMaxRecords, 24);
assert.equal(resolveProviderMaxTokens(migrated, 'reasoning'), 16000);
assert.equal(migrated.reasoning.outputTokenOverride, 16000);
assert.equal(resolveProviderMaxTokens({ utility: { analysisCapacity: 5 }, reasoning: { outputTokenOverride: 8192 } }, 'reasoning'), 8192, 'explicit default-sized absolute override remains exact');
assert.equal(resolveProviderMaxTokens({ utility: { analysisCapacity: 5 }, reasoning: { maxTokens: 16000, roleLimits: { episodeEvaluator: { maxTokens: 9000 } } } }, 'reasoning', 'episodeEvaluator'), 9000);

const context = { extensionSettings: {}, saveSettingsDebounced() {} };
const store = createSillyTavernProviderSettingsStore({ context });
store.update('utility', { analysisCapacity: 5, analysisOverrides: { continuityFactCharacters: 512, hostNarrationTimeoutSeconds: 900 } });
assert.equal(resolveAnalysisLimits(store.get('utility')).continuityFactCharacters, 512, 'explicit default-valued override is preserved');
store.update('utility', { analysisOverrides: { continuityFactCharacters: null } });
assert.equal(resolveAnalysisLimits(store.get('utility')).continuityFactCharacters, 2560);
assert.equal(resolveAnalysisLimits(store.get('utility')).hostNarrationTimeoutSeconds, 900);
store.update('utility', { analysisLimits: { continuityMaxChanges: 30 } });
assert.equal(resolveAnalysisLimits(store.get('utility')).continuityMaxChanges, 30, 'legacy patch becomes an exact override');
store.update('reasoning', { timeoutSeconds: 700, maxTokens: 8192, roleLimits: { episodeEvaluator: { maxTokens: 6000, maxAttempts: 4 } } });
assert.equal(resolveProviderMaxTokens(store.getAll(), 'reasoning', 'storyDirectionAnalyst'), 8192);
store.update('reasoning', { outputTokenOverride: null, roleLimits: null });
store.update('utility', { analysisOverrides: null });
assert.equal(resolveProviderMaxTokens(store.getAll(), 'reasoning', 'episodeEvaluator'), 40960);
assert.equal(store.get('reasoning').timeoutSeconds, 700);
assert.equal(store.get('utility').analysisCapacity, 5);
assert.deepEqual(store.get('utility').analysisOverrides, {});
assert.equal(resolveAnalysisLimits(store.get('utility')).hostNarrationTimeoutSeconds, 240);
const reload = createSillyTavernProviderSettingsStore({ context });
assert.deepEqual(reload.getAll(), store.getAll());
console.log('Analysis capacity migration and resolution tests passed.');
