export const DEFAULT_CHARACTER_KNOWLEDGE_SETTINGS = Object.freeze({ mode: 'legacy', maxActors: 3, maxRounds: 2, maxCharacterCalls: 4, maxAttempts: 10 });
export const CHARACTER_KNOWLEDGE_LIMITS = Object.freeze({ maxActors: 3, maxRounds: 2, maxCharacterCalls: 4, maxAttempts: 10 });
export function normalizeCharacterKnowledgeSettings(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return { mode: source.mode === 'protected' ? 'protected' : 'legacy', ...Object.fromEntries(Object.entries(CHARACTER_KNOWLEDGE_LIMITS).map(([key, ceiling]) => [key,
    Number.isSafeInteger(source[key]) && source[key] >= 1 && source[key] <= ceiling ? source[key] : DEFAULT_CHARACTER_KNOWLEDGE_SETTINGS[key]])) };
}
export function validateCharacterKnowledgeSettings(value = {}, { narration, ready = false } = {}) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['Character knowledge settings must be an object.'] };
  for (const key of Object.keys(value)) if (!Object.hasOwn(DEFAULT_CHARACTER_KNOWLEDGE_SETTINGS, key)) errors.push('Unknown character knowledge setting.');
  if (value.mode !== undefined && !['legacy', 'protected'].includes(value.mode)) errors.push('Choose Legacy or Protected mode.');
  for (const [key, ceiling] of Object.entries(CHARACTER_KNOWLEDGE_LIMITS)) if (value[key] !== undefined && (!Number.isSafeInteger(value[key]) || value[key] < 1 || value[key] > ceiling)) errors.push(`${key} must be between 1 and ${ceiling}.`);
  const settings = normalizeCharacterKnowledgeSettings(value);
  if (settings.maxCharacterCalls < settings.maxActors || settings.maxAttempts < settings.maxCharacterCalls + 2) errors.push('Allow at least one response per character and two attempts for narration and review.');
  if (settings.mode === 'protected' && (narration?.provider !== 'profile' || !String(narration.profileId || '').trim() || narration.presetMode !== 'isolated' || ready !== true)) errors.push('Select an available isolated Narration connection profile before enabling Protected mode.');
  return { ok: errors.length === 0, settings, errors };
}
