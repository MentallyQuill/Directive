import { evaluatePredicate } from '../world/predicate-evaluator.mjs';

export const QUEST_STATUSES = Object.freeze([
  'latent', 'available', 'offered', 'accepted', 'active', 'delegated',
  'resolved', 'failed', 'abandoned', 'expired', 'transformed'
]);
export const TERMINAL_QUEST_STATUSES = Object.freeze(['resolved', 'failed', 'abandoned', 'expired', 'transformed']);
const TERMINAL = new Set(TERMINAL_QUEST_STATUSES);
const VALID_TRANSITIONS = Object.freeze({
  latent: ['available', 'expired', 'transformed'],
  available: ['latent', 'offered', 'accepted', 'active', 'delegated', 'expired', 'transformed'],
  offered: ['latent', 'available', 'accepted', 'active', 'delegated', 'abandoned', 'expired', 'transformed'],
  accepted: ['available', 'active', 'delegated', 'abandoned', 'expired', 'transformed'],
  active: ['accepted', 'delegated', 'resolved', 'failed', 'abandoned', 'expired', 'transformed'],
  delegated: ['accepted', 'active', 'resolved', 'failed', 'abandoned', 'expired', 'transformed'],
  resolved: [], failed: [], abandoned: [], expired: [], transformed: []
});

function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function timestamp(now) { return typeof now === 'function' ? now() : (now || new Date().toISOString()); }
function compact(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
function templatesArray(source = {}) {
  if (Array.isArray(source)) return source;
  if (Array.isArray(source?.templates)) return source.templates;
  if (Array.isArray(source?.questTemplates)) return source.questTemplates;
  if (Array.isArray(source?.questTemplates?.templates)) return source.questTemplates.templates;
  return [];
}

export function normalizeDynamicQuestCatalog(catalog = {}) {
  return {
    schemaVersion: 2,
    templates: asArray(catalog.templates).map(cloneJson),
    proposalJournal: asArray(catalog.proposalJournal).map(cloneJson),
    archivedTemplateIds: [...new Set(asArray(catalog.archivedTemplateIds))],
    semanticIndex: asArray(catalog.semanticIndex).map(cloneJson)
  };
}

export function questSemanticFingerprint(template = {}) {
  const actor = asArray(template?.anchors?.actorIds).sort().join('|');
  const locations = asArray(template?.anchors?.locationIds).sort().join('|');
  const tokens = [template.kind, template.title, template.summary, template.dramaticQuestion, ...asArray(template.tags)]
    .join(' ').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter((item) => item.length > 3 && !['with', 'from', 'that', 'this', 'their', 'about'].includes(item));
  return `${actor}::${locations}::${[...new Set(tokens)].sort().slice(0, 24).join('-')}`;
}

export function questCatalogTemplates(packageOrTemplates = {}, campaignState = null) {
  const staticTemplates = templatesArray(packageOrTemplates?.questTemplates || packageOrTemplates);
  const dynamic = normalizeDynamicQuestCatalog(campaignState?.dynamicQuestCatalog).templates;
  const byId = new Map();
  for (const item of [...staticTemplates, ...dynamic]) if (item?.id) byId.set(item.id, item);
  return [...byId.values()];
}

export function questTemplateById(packageOrTemplates, id, campaignState = null) {
  return questCatalogTemplates(packageOrTemplates, campaignState).find((item) => item.id === id) || null;
}

export function registerDynamicQuestTemplate(campaignState, template, {
  proposal = null,
  now = null,
  replace = false
} = {}) {
  if (!campaignState || !template?.id) throw new Error('Dynamic quest registration requires campaign state and a template id.');
  const next = cloneJson(campaignState);
  const catalog = normalizeDynamicQuestCatalog(next.dynamicQuestCatalog);
  const existingIndex = catalog.templates.findIndex((item) => item.id === template.id);
  if (existingIndex >= 0 && !replace) throw new Error(`Dynamic quest template "${template.id}" already exists.`);
  const fingerprint = template.semanticFingerprint || questSemanticFingerprint(template);
  const duplicate = catalog.semanticIndex.find((entry) => entry.fingerprint === fingerprint && entry.templateId !== template.id);
  if (duplicate && !replace) {
    const error = new Error(`Dynamic quest duplicates existing template "${duplicate.templateId}".`);
    error.code = 'DIRECTIVE_DYNAMIC_QUEST_DUPLICATE';
    error.details = { duplicateTemplateId: duplicate.templateId, fingerprint };
    throw error;
  }
  const stored = {
    ...cloneJson(template),
    semanticFingerprint: fingerprint,
    dynamic: true,
    registeredAt: timestamp(now)
  };
  if (existingIndex >= 0) catalog.templates[existingIndex] = stored; else catalog.templates.push(stored);
  catalog.semanticIndex = catalog.semanticIndex.filter((entry) => entry.templateId !== stored.id);
  catalog.semanticIndex.push({ templateId: stored.id, fingerprint, registeredAt: stored.registeredAt });
  if (proposal) catalog.proposalJournal.push({ ...cloneJson(proposal), templateId: stored.id, acceptedAt: stored.registeredAt, status: 'accepted' });
  next.dynamicQuestCatalog = catalog;
  return next;
}

export function normalizeQuestInstance(instance = {}) {
  if (!instance?.id || !instance?.templateId) throw new Error('Quest instance requires id and templateId.');
  if (!QUEST_STATUSES.includes(instance.status)) throw new Error(`Unknown quest status "${instance.status}".`);
  return {
    id: instance.id,
    templateId: instance.templateId,
    kind: instance.kind || 'side',
    title: instance.title || instance.templateId,
    status: instance.status,
    foreground: instance.foreground === true,
    offeredAt: instance.offeredAt ?? null,
    acceptedAt: instance.acceptedAt ?? null,
    activatedAt: instance.activatedAt ?? null,
    delegatedAt: instance.delegatedAt ?? null,
    resolvedAt: instance.resolvedAt ?? null,
    failedAt: instance.failedAt ?? null,
    expiredAt: instance.expiredAt ?? null,
    abandonedAt: instance.abandonedAt ?? null,
    transformedAt: instance.transformedAt ?? null,
    assignedActorIds: [...new Set(asArray(instance.assignedActorIds))],
    delegation: cloneJson(instance.delegation || null),
    objectiveStates: asArray(instance.objectiveStates).map((objective) => ({ ...cloneJson(objective) })),
    discoveredLeadIds: [...new Set(asArray(instance.discoveredLeadIds))],
    outcomeId: instance.outcomeId ?? null,
    outcomeKey: instance.outcomeKey ?? null,
    availabilityReasons: asArray(instance.availabilityReasons),
    expiryReasons: asArray(instance.expiryReasons),
    sourceThreadId: instance.sourceThreadId ?? null,
    sourceEventIds: [...new Set(asArray(instance.sourceEventIds))],
    sourceAnchorRange: cloneJson(instance.sourceAnchorRange || null),
    flags: asArray(instance.flags).map(cloneJson),
    history: asArray(instance.history).map(cloneJson),
    metadata: cloneJson(instance.metadata || {})
  };
}

export function createQuestInstance(template, { status = null, now = null, instanceId = null, sourceThreadId = null, sourceAnchorRange = null } = {}) {
  if (!template?.id) throw new Error('Quest template requires an id.');
  const initialStatus = status || template.initialStatus || 'latent';
  const at = timestamp(now);
  return normalizeQuestInstance({
    id: instanceId || template.id,
    templateId: template.id,
    kind: template.kind,
    title: template.title,
    status: initialStatus,
    foreground: initialStatus === 'active' && template.initialForeground === true,
    offeredAt: initialStatus === 'offered' ? at : null,
    acceptedAt: ['accepted', 'active', 'delegated'].includes(initialStatus) ? at : null,
    activatedAt: initialStatus === 'active' ? at : null,
    delegatedAt: initialStatus === 'delegated' ? at : null,
    sourceThreadId,
    sourceAnchorRange,
    objectiveStates: asArray(template.objectives).map((objective) => ({
      id: objective.id,
      status: objective.initialStatus || 'pending',
      progress: Number(objective.initialProgress || 0),
      optional: objective.optional === true,
      evidenceIds: []
    })),
    history: [{ at, from: null, to: initialStatus, reason: template.dynamic ? 'dynamic-quest-registered' : 'campaign-initialization' }],
    metadata: { dynamic: template.dynamic === true, stale: false }
  });
}

export function createQuestLedger({ questTemplates, campaignState = {}, now = null, statusOverrides = {} } = {}) {
  const instances = questCatalogTemplates(questTemplates, campaignState).map((template) => {
    const override = statusOverrides[template.id];
    let status = override || template.initialStatus || 'latent';
    if (!override && !template.initialStatus && evaluatePredicate(template.availability, campaignState).pass) status = 'available';
    return createQuestInstance(template, { status, now });
  });
  const foreground = instances.find((item) => item.foreground)
    || instances.find((item) => item.status === 'active' && item.kind === 'onboarding') || null;
  if (foreground) foreground.foreground = true;
  return { schemaVersion: 2, instances, foregroundQuestId: foreground?.id || null, availabilityRevision: 0, flags: [], history: [{ at: timestamp(now), type: 'ledger-created', questCount: instances.length }] };
}

export function questInstanceById(ledger, idOrTemplateId) {
  return asArray(ledger?.instances).find((record) => record.id === idOrTemplateId || record.templateId === idOrTemplateId) || null;
}

function transitionRecord(record, toStatus, { now = null, reason = 'quest-transition', metadata = {}, assignedActorIds = null, delegation = null } = {}) {
  const normalized = normalizeQuestInstance(record);
  if (!QUEST_STATUSES.includes(toStatus)) throw new Error(`Unknown quest status "${toStatus}".`);
  if (normalized.status !== toStatus && !asArray(VALID_TRANSITIONS[normalized.status]).includes(toStatus)) throw new Error(`Invalid quest transition ${normalized.status} -> ${toStatus} for "${normalized.id}".`);
  if (normalized.status === toStatus) return normalized;
  const at = timestamp(now);
  const next = { ...normalized, status: toStatus, foreground: toStatus === 'active' ? normalized.foreground : false, history: [...normalized.history, { at, from: normalized.status, to: toStatus, reason, metadata: cloneJson(metadata) }] };
  const fields = { offered: 'offeredAt', accepted: 'acceptedAt', active: 'activatedAt', delegated: 'delegatedAt', resolved: 'resolvedAt', failed: 'failedAt', expired: 'expiredAt', abandoned: 'abandonedAt', transformed: 'transformedAt' };
  if (fields[toStatus]) next[fields[toStatus]] = at;
  if (assignedActorIds) next.assignedActorIds = [...new Set(asArray(assignedActorIds))];
  if (delegation) next.delegation = cloneJson(delegation);
  return normalizeQuestInstance(next);
}

export function transitionQuest(ledger, idOrTemplateId, toStatus, options = {}) {
  const next = cloneJson(ledger);
  const index = asArray(next.instances).findIndex((record) => record.id === idOrTemplateId || record.templateId === idOrTemplateId);
  if (index < 0) throw new Error(`Unknown quest "${idOrTemplateId}".`);
  const before = normalizeQuestInstance(next.instances[index]);
  next.instances[index] = transitionRecord(before, toStatus, options);
  if (before.foreground && toStatus !== 'active') next.foregroundQuestId = null;
  next.history = [...asArray(next.history), { at: timestamp(options.now), type: 'quest-transition', questId: before.id, from: before.status, to: toStatus, reason: options.reason || 'quest-transition' }];
  return next;
}

export function setForegroundQuest(ledger, idOrTemplateId, { now = null, reason = 'player-selected-foreground', autoActivate = true } = {}) {
  let next = cloneJson(ledger);
  const target = questInstanceById(next, idOrTemplateId);
  if (!target) throw new Error(`Unknown quest "${idOrTemplateId}".`);
  if (TERMINAL.has(target.status) || target.status === 'latent') throw new Error(`Quest "${idOrTemplateId}" cannot become foreground while ${target.status}.`);
  if (autoActivate && target.status !== 'active') next = transitionQuest(next, target.id, 'active', { now, reason });
  next.instances = asArray(next.instances).map((record) => normalizeQuestInstance({ ...record, foreground: record.id === target.id }));
  next.foregroundQuestId = target.id;
  next.history = [...asArray(next.history), { at: timestamp(now), type: 'foreground-selected', questId: target.id, reason }];
  return next;
}

export function clearForegroundQuest(ledger, { now = null, reason = 'foreground-cleared' } = {}) {
  const next = cloneJson(ledger);
  next.instances = asArray(next.instances).map((record) => normalizeQuestInstance({ ...record, foreground: false }));
  next.foregroundQuestId = null;
  next.history = [...asArray(next.history), { at: timestamp(now), type: 'foreground-cleared', reason }];
  return next;
}

function ensureDynamicInstances(ledger, templates, now) {
  const next = cloneJson(ledger);
  const existing = new Set(asArray(next.instances).map((item) => item.templateId));
  for (const template of templates) {
    if (existing.has(template.id)) continue;
    next.instances.push(createQuestInstance(template, { status: template.initialStatus || 'available', now, sourceThreadId: template.sourceThreadId, sourceAnchorRange: template.provenance?.anchorRange || null }));
    existing.add(template.id);
  }
  return next;
}

export function reconcileQuestAvailability(ledger, packageOrTemplates, campaignState, { now = null } = {}) {
  const allTemplates = questCatalogTemplates(packageOrTemplates, campaignState);
  const templates = new Map(allTemplates.map((item) => [item.id, item]));
  const next = ensureDynamicInstances(ledger, allTemplates.filter((item) => item.dynamic), now);
  const changes = [];
  next.instances = asArray(next.instances).map((rawRecord) => {
    const record = normalizeQuestInstance(rawRecord);
    const template = templates.get(record.templateId);
    if (!template || TERMINAL.has(record.status)) return record;
    const expired = template.expiryConditions && Object.keys(template.expiryConditions).length
      ? evaluatePredicate(template.expiryConditions, campaignState) : { pass: false, reasons: [] };
    if (expired.pass && record.status !== 'expired') {
      changes.push({ questId: record.id, from: record.status, to: 'expired', reasons: expired.reasons });
      return transitionRecord({ ...record, expiryReasons: expired.reasons }, 'expired', { now, reason: 'expiry-conditions-satisfied' });
    }
    const available = evaluatePredicate(template.availability, campaignState);
    if (available.pass && record.status === 'latent') {
      changes.push({ questId: record.id, from: 'latent', to: 'available', reasons: [] });
      return transitionRecord({ ...record, availabilityReasons: [] }, 'available', { now, reason: 'availability-conditions-satisfied' });
    }
    if (!available.pass && ['available', 'offered'].includes(record.status) && template.offerPolicy?.retractWhenUnavailable === true) {
      changes.push({ questId: record.id, from: record.status, to: 'latent', reasons: available.reasons });
      return transitionRecord({ ...record, availabilityReasons: available.reasons }, 'latent', { now, reason: 'availability-withdrawn' });
    }
    return normalizeQuestInstance({ ...record, availabilityReasons: available.reasons });
  });
  next.availabilityRevision = Number(next.availabilityRevision || 0) + 1;
  if (changes.length) next.history = [...asArray(next.history), { at: timestamp(now), type: 'availability-reconciled', changes: cloneJson(changes) }];
  return { ledger: next, changes };
}

export function updateQuestObjectives(ledger, idOrTemplateId, updates = [], { now = null, reason = 'objective-progress' } = {}) {
  const next = cloneJson(ledger);
  const index = asArray(next.instances).findIndex((record) => record.id === idOrTemplateId || record.templateId === idOrTemplateId);
  if (index < 0) throw new Error(`Unknown quest "${idOrTemplateId}".`);
  const record = normalizeQuestInstance(next.instances[index]);
  const byObjectiveId = new Map(record.objectiveStates.map((item) => [item.id, item]));
  for (const update of asArray(updates)) {
    if (!update?.id) continue;
    const previous = byObjectiveId.get(update.id) || { id: update.id, status: 'pending', progress: 0, optional: false, evidenceIds: [] };
    const merged = { ...previous, ...cloneJson(update) };
    merged.progress = Math.max(0, Math.min(100, Number(merged.progress || 0)));
    if (merged.progress >= 100 && !['failed', 'waived'].includes(merged.status)) merged.status = 'complete';
    merged.evidenceIds = [...new Set([...asArray(previous.evidenceIds), ...asArray(update.evidenceIds)])];
    byObjectiveId.set(update.id, merged);
  }
  next.instances[index] = normalizeQuestInstance({ ...record, objectiveStates: [...byObjectiveId.values()], history: [...record.history, { at: timestamp(now), from: record.status, to: record.status, reason, objectiveIds: asArray(updates).map((item) => item.id) }] });
  return next;
}

export function resolveQuest(ledger, idOrTemplateId, { outcomeId = null, outcomeKey = null, now = null, reason = 'quest-resolved' } = {}) {
  let next = transitionQuest(ledger, idOrTemplateId, 'resolved', { now, reason, metadata: { outcomeId, outcomeKey } });
  const index = next.instances.findIndex((record) => record.id === idOrTemplateId || record.templateId === idOrTemplateId);
  next.instances[index] = normalizeQuestInstance({ ...next.instances[index], outcomeId, outcomeKey, foreground: false });
  if (next.foregroundQuestId === next.instances[index].id) next.foregroundQuestId = null;
  return next;
}

export function applyQuestLedgerDelta(ledger = {}, delta = {}, { now = null } = {}) {
  let next = cloneJson(ledger);
  if (!Array.isArray(next.instances)) next = { schemaVersion: 2, instances: [], foregroundQuestId: null, availabilityRevision: 0, flags: [], history: [] };
  for (const record of asArray(delta.upsertInstances || delta.instances)) {
    const normalized = normalizeQuestInstance(record);
    const index = next.instances.findIndex((entry) => entry.id === normalized.id);
    if (index < 0) next.instances.push(normalized); else next.instances[index] = normalized;
  }
  for (const transition of asArray(delta.transitions)) next = transitionQuest(next, transition.id || transition.questId, transition.status || transition.toStatus, { now: transition.at || now, reason: transition.reason, metadata: transition.metadata, assignedActorIds: transition.assignedActorIds, delegation: transition.delegation });
  for (const objectiveUpdate of asArray(delta.objectiveUpdates)) next = updateQuestObjectives(next, objectiveUpdate.id || objectiveUpdate.questId, objectiveUpdate.updates || objectiveUpdate.objectives, { now: objectiveUpdate.at || now, reason: objectiveUpdate.reason });
  if (delta.foregroundQuestId !== undefined) next = delta.foregroundQuestId === null ? clearForegroundQuest(next, { now, reason: delta.reason || 'delta-cleared-foreground' }) : setForegroundQuest(next, delta.foregroundQuestId, { now, reason: delta.reason || 'delta-selected-foreground' });
  if (Array.isArray(delta.flagsAdd)) {
    const byId = new Map(asArray(next.flags).map((flag) => [typeof flag === 'string' ? flag : flag.id, flag]));
    for (const flag of delta.flagsAdd) byId.set(typeof flag === 'string' ? flag : flag.id, cloneJson(flag));
    next.flags = [...byId.values()];
  }
  return next;
}

export function playerSafeQuestSummaries(ledger, packageOrTemplates, { statuses = null, campaignState = null } = {}) {
  const allowed = statuses ? new Set(statuses) : null;
  return asArray(ledger?.instances).map(normalizeQuestInstance)
    .filter((instance) => !allowed || allowed.has(instance.status))
    .filter((instance) => instance.status !== 'latent' && instance.metadata?.stale !== true)
    .map((instance) => {
      const template = questTemplateById(packageOrTemplates, instance.templateId, campaignState) || {};
      if (template.visibility === 'hidden' || template.playerVisible === false || instance.metadata?.playerVisible === false) return null;
      return { id: instance.id, templateId: instance.templateId, title: template.title || instance.title, kind: template.kind || instance.kind, status: instance.status, foreground: instance.foreground, playerSummary: template.playerSummary || template.summary || '', dramaticQuestion: template.dramaticQuestion || '', locationIds: cloneJson(template.anchors?.locationIds || []), currentObjectiveIds: instance.objectiveStates.filter((objective) => !['complete', 'failed', 'waived'].includes(objective.status)).map((objective) => objective.id), assignedActorIds: cloneJson(instance.assignedActorIds), outcomeKey: instance.outcomeKey, dynamic: template.dynamic === true };
    })
    .filter(Boolean);
}

export const __questLedgerTestHooks = Object.freeze({ VALID_TRANSITIONS, TERMINAL, transitionRecord, templatesArray, questSemanticFingerprint });
