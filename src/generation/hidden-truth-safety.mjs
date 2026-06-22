export const HIDDEN_TRUTH_TERMS = Object.freeze([
  'pale lantern',
  'lantern escalation',
  'compact recovery team',
  'no pathogen',
  'forged starfleet signals',
  'stolen transponder',
  'transponder modules',
  'cargo tug',
  'hull projection',
  'local patrol schedules',
  'nightfall',
  'bioweapon',
  'kestrel'
]);

function collectText(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function hiddenTruthTerm(value) {
  const text = collectText(value).toLowerCase();
  return HIDDEN_TRUTH_TERMS.find((term) => text.includes(term)) || null;
}

export function assertPlayerSafeContent(value, label = 'player-facing content') {
  const term = hiddenTruthTerm(value);
  if (term) throw new Error(`${label} contains unrevealed director-only truth: ${term}`);
  return true;
}
