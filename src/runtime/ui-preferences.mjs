function compactString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function timestampFromNow(now) {
  if (typeof now === 'function') return now();
  if (typeof now === 'string' && now.trim()) return now;
  return new Date().toISOString();
}

export function createRuntimeUiPreferences({
  storageAdapter,
  loadPreferences,
  savePreferences,
  now = null
} = {}) {
  if (typeof loadPreferences !== 'function') {
    throw new Error('loadPreferences must be a function');
  }
  if (typeof savePreferences !== 'function') {
    throw new Error('savePreferences must be a function');
  }
  let hiddenCampaignSessionKeys = new Set();

  async function load() {
    const preferences = await loadPreferences(storageAdapter, {
      now: timestampFromNow(now)
    });
    hiddenCampaignSessionKeys = new Set(
      (preferences.hiddenCampaignSessionKeys || [])
        .map((key) => compactString(key))
        .filter(Boolean)
    );
    return preferences;
  }

  async function persist() {
    return savePreferences(storageAdapter, {
      hiddenCampaignSessionKeys: [...hiddenCampaignSessionKeys]
    }, {
      now: timestampFromNow(now)
    });
  }

  function hiddenSessionKeys() {
    return [...hiddenCampaignSessionKeys];
  }

  function hasHiddenSessionKey(key) {
    return hiddenCampaignSessionKeys.has(compactString(key));
  }

  function hideSessionKey(key) {
    const sessionKey = compactString(key);
    if (!sessionKey) return false;
    hiddenCampaignSessionKeys.add(sessionKey);
    return true;
  }

  function showSessionKey(key) {
    const sessionKey = compactString(key);
    if (!sessionKey) return false;
    hiddenCampaignSessionKeys.delete(sessionKey);
    return true;
  }

  return Object.freeze({
    hiddenSessionKeys,
    hasHiddenSessionKey,
    hideSessionKey,
    load,
    persist,
    showSessionKey
  });
}
