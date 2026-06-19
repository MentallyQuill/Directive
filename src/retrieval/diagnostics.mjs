export function incrementCount(object, key, amount = 1) {
  object[key] = (object[key] || 0) + amount;
  return object;
}

export function countBlockedReasons(blocked = []) {
  const counts = {};
  for (const item of blocked || []) {
    incrementCount(counts, item.reason || 'unknown');
  }
  return counts;
}

export function countByAudience(valuesByAudience = {}) {
  const counts = {};
  for (const [audience, values] of Object.entries(valuesByAudience || {})) {
    counts[audience] = Array.isArray(values) ? values.length : 0;
  }
  return counts;
}
