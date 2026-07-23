function compactString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function timestampFromNow(now) {
  if (typeof now === 'function') return now();
  if (typeof now === 'string' && now.trim()) return now;
  return new Date().toISOString();
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(compactString).filter(Boolean))];
}

function campaignQuestScope(value) {
  const scope = compactString(value);
  const match = /^(campaign:[^:]+)(?:::chat:.*)?$/.exec(scope);
  return match?.[1] || scope;
}

function stringMap(value = {}, { normalizeKey = compactString } = {}) {
  return new Map(Object.entries(value && typeof value === 'object' ? value : {})
    .map(([key, item]) => [normalizeKey(key), compactString(item)])
    .filter(([key, item]) => key && item));
}

function listMap(value = {}) {
  return new Map(Object.entries(value && typeof value === 'object' ? value : {})
    .map(([key, items]) => [compactString(key), uniqueStrings(items)])
    .filter(([key]) => key));
}

function mapOfListsObject(map) {
  return Object.fromEntries([...map].map(([key, values]) => [key, values.slice()]));
}

export function createRuntimeUiPreferences({
  storageAdapter,
  loadPreferences,
  savePreferences,
  now = null
} = {}) {
  if (typeof loadPreferences !== 'function') throw new Error('loadPreferences must be a function');
  if (typeof savePreferences !== 'function') throw new Error('savePreferences must be a function');

  let hiddenCampaignSessionKeys = new Set();
  let selectedQuestIdsByScope = new Map();
  let selectedCampaignIdValue = '';
  let selectedPersonIdsByCampaign = new Map();
  let categoryOrderByCampaign = new Map();
  let recordOrderByScope = new Map();
  let collapsedCategoryIdsByCampaign = new Map();
  let questOrderByCampaign = new Map();
  let openQuestIdsByCampaign = new Map();
  let shipCollectionOrderByScope = new Map();
  let openShipIssueIdsByScope = new Map();

  async function load() {
    const preferences = await loadPreferences(storageAdapter, { now: timestampFromNow(now) });
    hiddenCampaignSessionKeys = new Set(uniqueStrings(preferences.hiddenCampaignSessionKeys));
    selectedQuestIdsByScope = stringMap(preferences.selectedQuestIdsByScope, { normalizeKey: campaignQuestScope });
    selectedCampaignIdValue = compactString(preferences.selectedCampaignId);
    selectedPersonIdsByCampaign = stringMap(preferences.selectedPersonIdsByCampaign);
    categoryOrderByCampaign = listMap(preferences.categoryOrderByCampaign);
    recordOrderByScope = listMap(preferences.recordOrderByScope);
    collapsedCategoryIdsByCampaign = listMap(preferences.collapsedCategoryIdsByCampaign);
    questOrderByCampaign = listMap(preferences.questOrderByCampaign);
    openQuestIdsByCampaign = stringMap(preferences.openQuestIdsByCampaign);
    openShipIssueIdsByScope = stringMap(preferences.openShipIssueIdsByScope);
    shipCollectionOrderByScope = new Map(Object.entries(preferences.shipCollectionOrderByScope || {})
      .map(([scope, collections]) => [compactString(scope), {
        issues: uniqueStrings(collections?.issues),
        capabilities: uniqueStrings(collections?.capabilities)
      }])
      .filter(([scope]) => scope));
    return preferences;
  }

  async function persist() {
    return savePreferences(storageAdapter, {
      schemaVersion: 2,
      hiddenCampaignSessionKeys: [...hiddenCampaignSessionKeys],
      selectedCampaignId: selectedCampaignIdValue || null,
      selectedQuestIdsByScope: Object.fromEntries(selectedQuestIdsByScope),
      selectedPersonIdsByCampaign: Object.fromEntries(selectedPersonIdsByCampaign),
      categoryOrderByCampaign: mapOfListsObject(categoryOrderByCampaign),
      recordOrderByScope: mapOfListsObject(recordOrderByScope),
      collapsedCategoryIdsByCampaign: mapOfListsObject(collapsedCategoryIdsByCampaign),
      questOrderByCampaign: mapOfListsObject(questOrderByCampaign),
      openQuestIdsByCampaign: Object.fromEntries(openQuestIdsByCampaign),
      shipCollectionOrderByScope: Object.fromEntries([...shipCollectionOrderByScope].map(([scope, collections]) => [scope, {
        issues: collections.issues.slice(),
        capabilities: collections.capabilities.slice()
      }])),
      openShipIssueIdsByScope: Object.fromEntries(openShipIssueIdsByScope)
    }, { now: timestampFromNow(now) });
  }

  function setList(map, scopeKey, values) {
    const scope = compactString(scopeKey);
    if (!scope) return false;
    map.set(scope, uniqueStrings(values));
    return true;
  }

  function setScopedString(map, scopeKey, value) {
    const scope = compactString(scopeKey);
    const item = compactString(value);
    if (!scope || !item) return false;
    map.set(scope, item);
    return true;
  }

  return Object.freeze({
    async load() { return load(); },
    async persist() { return persist(); },
    hiddenSessionKeys: () => [...hiddenCampaignSessionKeys],
    hasHiddenSessionKey: (key) => hiddenCampaignSessionKeys.has(compactString(key)),
    hideSessionKey(key) {
      const value = compactString(key);
      if (!value) return false;
      hiddenCampaignSessionKeys.add(value);
      return true;
    },
    showSessionKey(key) {
      const value = compactString(key);
      if (!value) return false;
      return hiddenCampaignSessionKeys.delete(value);
    },
    selectedCampaignId: () => selectedCampaignIdValue || null,
    selectCampaign(campaignId) {
      const value = compactString(campaignId);
      if (!value) return false;
      selectedCampaignIdValue = value;
      return true;
    },
    selectedQuestId: (scopeKey) => selectedQuestIdsByScope.get(campaignQuestScope(scopeKey)) || null,
    selectQuest(scopeKey, questId) {
      return setScopedString(selectedQuestIdsByScope, campaignQuestScope(scopeKey), questId);
    },
    clearSelectedQuest(scopeKey) {
      const scope = campaignQuestScope(scopeKey);
      return scope ? selectedQuestIdsByScope.delete(scope) : false;
    },
    selectedPersonId: (campaignId) => selectedPersonIdsByCampaign.get(compactString(campaignId)) || null,
    selectPerson: (campaignId, personId) => setScopedString(selectedPersonIdsByCampaign, campaignId, personId),
    categoryOrder: (campaignId) => (categoryOrderByCampaign.get(compactString(campaignId)) || []).slice(),
    setCategoryOrder: (campaignId, ids) => setList(categoryOrderByCampaign, campaignId, ids),
    recordOrder: (scopeKey) => (recordOrderByScope.get(compactString(scopeKey)) || []).slice(),
    setRecordOrder: (scopeKey, ids) => setList(recordOrderByScope, scopeKey, ids),
    collapsedCategoryIds: (campaignId) => (collapsedCategoryIdsByCampaign.get(compactString(campaignId)) || []).slice(),
    setCategoryCollapsed(campaignId, categoryId, collapsed = true) {
      const campaign = compactString(campaignId);
      const category = compactString(categoryId);
      if (!campaign || !category) return false;
      const values = new Set(collapsedCategoryIdsByCampaign.get(campaign) || []);
      if (collapsed) values.add(category);
      else values.delete(category);
      collapsedCategoryIdsByCampaign.set(campaign, [...values]);
      return true;
    },
    questOrder: (campaignId) => (questOrderByCampaign.get(compactString(campaignId)) || []).slice(),
    setQuestOrder: (campaignId, ids) => setList(questOrderByCampaign, campaignId, ids),
    openQuestId: (campaignId) => openQuestIdsByCampaign.get(compactString(campaignId)) || null,
    setOpenQuest: (campaignId, questId) => setScopedString(openQuestIdsByCampaign, campaignId, questId),
    shipCollectionOrder(scopeKey, collection) {
      const item = shipCollectionOrderByScope.get(compactString(scopeKey));
      return (item?.[compactString(collection)] || []).slice();
    },
    setShipCollectionOrder(scopeKey, collection, ids) {
      const scope = compactString(scopeKey);
      const key = compactString(collection);
      if (!scope || !['issues', 'capabilities'].includes(key)) return false;
      const current = shipCollectionOrderByScope.get(scope) || { issues: [], capabilities: [] };
      shipCollectionOrderByScope.set(scope, { ...current, [key]: uniqueStrings(ids) });
      return true;
    },
    openShipIssueId: (scopeKey) => openShipIssueIdsByScope.get(compactString(scopeKey)) || null,
    setOpenShipIssue: (scopeKey, issueId) => setScopedString(openShipIssueIdsByScope, scopeKey, issueId)
  });
}
