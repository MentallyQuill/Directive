import {
  createQuestInstance,
  questCatalogTemplates,
  questSemanticFingerprint,
  registerDynamicQuestTemplate
} from './quest-ledger.mjs';
import { transitionThread } from '../threads/thread-ledger.mjs';

function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function compact(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
function slug(value) { return compact(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'thread'; }
function unique(values) { return [...new Set(asArray(values).filter(Boolean))]; }
function nowValue(now) { return typeof now === 'function' ? now() : (now || new Date().toISOString()); }

function threadEvidence(thread) {
  return asArray(thread?.evidence).filter((item) => item?.observable !== false).map((item) => ({
    id: item.id,
    type: item.type || thread.type,
    excerpt: compact(item.excerpt || item.summary || item.text).slice(0, 600),
    actorIds: unique(item.actorIds || thread.participantIds),
    sourceMessageIds: unique(item.sourceMessageIds || [item.sourceMessageId]),
    sourceOutcomeId: item.sourceOutcomeId || null,
    anchorRange: cloneJson(item.anchorRange || null)
  }));
}

export function buildQuestArchitectRequest({ thread, state, packageData } = {}) {
  if (!thread?.id) throw new Error('Quest Architect requires a narrative thread.');
  const allowedActorIds = new Set([
    ...asArray(packageData?.world?.actors).map((item) => item.id),
    ...asArray(packageData?.crew?.senior || packageData?.crew?.members || packageData?.crew).map((item) => item.id),
    state?.player?.id
  ].filter(Boolean));
  const allowedLocationIds = asArray(packageData?.world?.locations).map((item) => item.id);
  const allowedFactionIds = asArray(packageData?.world?.factions).map((item) => item.id);
  return {
    contract: 'directive.questArchitectureProposal.v2',
    instruction: [
      'Propose a bounded optional quest grounded only in the supplied observable evidence.',
      'Do not invent private history, relationships, actors, locations, factions, assets, facts, or hidden campaign truth.',
      'Provide two to four objectives, at least two viable approaches, failure-forward consequences, delegation/expiry rules, and persistent but bounded world effects.',
      'Return a proposal only. Directive code validates and commits it.'
    ],
    thread: {
      id: thread.id,
      type: thread.type,
      title: thread.title,
      summary: thread.summary,
      participantIds: unique(thread.participantIds),
      evidence: threadEvidence(thread),
      reinforcementCount: Number(thread.reinforcementCount || 0),
      playerInterest: Number(thread.playerInterest || 0)
    },
    constraints: {
      allowedActorIds: [...allowedActorIds],
      allowedLocationIds,
      allowedFactionIds,
      currentLocationId: state?.worldState?.currentLocationId || null,
      maximumObjectives: 4,
      maximumEffects: 3,
      noMainArcReveal: true,
      noSeniorCrewFatality: true,
      failureForwardRequired: true
    }
  };
}

function deterministicTemplate({ thread, state, packageData, now = null } = {}) {
  const evidence = threadEvidence(thread);
  const participantIds = unique(thread.participantIds || evidence.flatMap((item) => item.actorIds));
  const locationId = state?.worldState?.currentLocationId || packageData?.world?.openingLocationId;
  const base = slug(thread.title || thread.summary || thread.type);
  const id = `quest.emergent.${base}.${String(thread.id).replace(/[^a-zA-Z0-9]+/g, '-').slice(-20)}`;
  const person = participantIds.length ? 'the people involved' : 'the affected crew';
  const summary = compact(thread.summary || evidence[0]?.excerpt || `An unresolved ${thread.type || 'personal'} concern requires attention.`);
  const isTechnical = /task|maintenance|repair|professional|routine|shipboard/i.test(`${thread.type} ${summary}`);
  const objectives = isTechnical ? [
    { id: `${id}.objective.understand`, label: 'Establish the actual problem', playerText: `Confirm the practical cause and constraints affecting ${person}.`, optional: false },
    { id: `${id}.objective.support`, label: 'Develop a workable response', playerText: 'Choose a proportionate response without overriding privacy or professional responsibility.', optional: false },
    { id: `${id}.objective.followup`, label: 'Verify the result', playerText: 'Follow up after the response has had time to take effect.', optional: false }
  ] : [
    { id: `${id}.objective.listen`, label: 'Understand the concern', playerText: `Give ${person} a fair opportunity to state what is wrong and what help is actually wanted.`, optional: false },
    { id: `${id}.objective.choice`, label: 'Support an appropriate choice', playerText: 'Offer bounded help while preserving agency, privacy, and professional boundaries.', optional: false },
    { id: `${id}.objective.followup`, label: 'Follow through', playerText: 'Return to the concern later and account for the consequences of the chosen support.', optional: false }
  ];
  for (const objective of objectives) {
    objective.initialStatus = 'pending'; objective.initialProgress = 0;
    objective.progressModel = { mode: 'incremental', completionThreshold: 100, defaultProgress: 40, strongMatchProgress: 60, setbackProgress: 20 };
  }
  const template = {
    id,
    kind: 'emergent',
    dynamic: true,
    title: thread.title || `A Matter Concerning ${person}`,
    summary,
    playerSummary: summary,
    directorSummary: `Grounded emergent quest promoted from thread ${thread.id}. Do not invent facts beyond its evidence.`,
    dramaticQuestion: isTechnical ? 'Can a routine difficulty be addressed before it becomes a larger command problem?' : 'Can command offer useful support without taking ownership of another person’s life?',
    anchors: { locationIds: [locationId].filter(Boolean), actorIds: participantIds, factionIds: [] },
    availability: {}, initialStatus: 'available', activation: { mode: 'player-selection' },
    offerPolicy: { retractWhenUnavailable: false, urgent: false },
    objectives,
    pressures: [{ id: `${id}.pressure.boundaries`, summary: isTechnical ? 'Time, workload, and incomplete information complicate a proportionate solution.' : 'Privacy, trust, and the risk of overreach constrain what command should do.', severity: 2, tags: ['bounded-support'] }],
    revelations: [],
    approaches: isTechnical ? ['Observe the routine directly.', 'Ask the responsible specialist for an assessment.', 'Reallocate time or resources.', 'Delegate a bounded follow-up.'] : ['Listen without prescribing a solution.', 'Offer practical assistance.', 'Create time or privacy for the person involved.', 'Delegate only with explicit consent.'],
    outcomes: [
      { id: 'supported-with-agency', summary: 'The concern improves while the people involved retain agency.', effects: [{ type: 'addAttentionFlag', flag: { id: `thread-echo.${thread.id}`, value: 'constructive' } }] },
      { id: 'workable-but-incomplete', summary: 'The immediate problem is contained, but a later follow-up remains important.', effects: [{ type: 'addAttentionFlag', flag: { id: `thread-echo.${thread.id}`, value: 'follow-up' } }] }
    ],
    completionConditions: {}, failureConditions: {}, expiryConditions: {}, transformsTo: [],
    delegation: { allowed: isTechnical, minimumHours: 4, progressPerCheck: 35, checkEveryHours: 4, failureForward: true, risk: 'Delegation may solve the task without resolving the underlying personal concern.' },
    systemicResolution: { enabled: true, minimumApproachDiversity: 2, failureForward: true, maxObjectiveProgressPerTurn: 65, completionRequiresAllRequiredObjectives: true },
    emittedEvents: [{ id: `event-template.${id}.resolved`, type: 'quest.emergent.resolved', payload: { sourceThreadId: thread.id } }],
    contextHints: { actorIds: participantIds, locationIds: [locationId].filter(Boolean), factionIds: [], factIds: [], frontIds: [], pressureIds: [] },
    tags: unique(['emergent', thread.type, ...asArray(thread.tags)]),
    sourceThreadId: thread.id,
    provenance: { evidenceIds: evidence.map((item) => item.id), sourceMessageIds: unique(evidence.flatMap((item) => item.sourceMessageIds)), sourceOutcomeIds: unique(evidence.map((item) => item.sourceOutcomeId)), anchorRange: cloneJson(evidence.find((item) => item.anchorRange)?.anchorRange || null), createdAt: nowValue(now), method: 'deterministic-fallback' }
  };
  template.semanticFingerprint = questSemanticFingerprint(template);
  return template;
}

function allowedIds(packageData, state) {
  return {
    actors: new Set([...asArray(packageData?.world?.actors).map((item) => item.id), ...asArray(packageData?.crew?.senior || packageData?.crew?.members || packageData?.crew).map((item) => item.id), state?.player?.id].filter(Boolean)),
    locations: new Set(asArray(packageData?.world?.locations).map((item) => item.id)),
    factions: new Set(asArray(packageData?.world?.factions).map((item) => item.id))
  };
}

export function validateQuestArchitectureProposal(proposal, { thread, state, packageData, now = null } = {}) {
  const fallback = deterministicTemplate({ thread, state, packageData, now });
  if (!proposal || typeof proposal !== 'object') return { ok: true, template: fallback, diagnostics: [{ severity: 'warning', code: 'fallback-used', message: 'No usable model proposal was supplied.' }] };
  const diagnostics = [];
  const ids = allowedIds(packageData, state);
  const template = { ...fallback, ...cloneJson(proposal), dynamic: true, kind: 'emergent', sourceThreadId: thread.id };
  template.id = compact(template.id).startsWith('quest.emergent.') ? compact(template.id) : fallback.id;
  template.title = compact(template.title).slice(0, 120) || fallback.title;
  template.summary = compact(template.summary || template.playerSummary).slice(0, 800) || fallback.summary;
  template.playerSummary = template.summary;
  template.directorSummary = compact(template.directorSummary).slice(0, 1000) || fallback.directorSummary;
  template.dramaticQuestion = compact(template.dramaticQuestion).slice(0, 300) || fallback.dramaticQuestion;
  const proposedAnchors = {
    actorIds: unique(template.anchors?.actorIds),
    locationIds: unique(template.anchors?.locationIds),
    factionIds: unique(template.anchors?.factionIds)
  };
  const unauthorized = {
    actorIds: proposedAnchors.actorIds.filter((id) => !ids.actors.has(id)),
    locationIds: proposedAnchors.locationIds.filter((id) => !ids.locations.has(id)),
    factionIds: proposedAnchors.factionIds.filter((id) => !ids.factions.has(id))
  };
  const groundedActors = new Set(unique([...asArray(thread.participantIds), ...threadEvidence(thread).flatMap((item) => item.actorIds)]));
  const ungroundedActorIds = proposedAnchors.actorIds.filter((id) => ids.actors.has(id) && !groundedActors.has(id));
  if (unauthorized.actorIds.length || unauthorized.locationIds.length || unauthorized.factionIds.length || ungroundedActorIds.length) {
    return {
      ok: false,
      template: null,
      diagnostics: [{
        severity: 'error',
        code: 'unauthorized-anchor-reference',
        message: 'Quest Architect proposal referenced an unauthorized or ungrounded actor, location, or faction.',
        details: { ...unauthorized, ungroundedActorIds }
      }]
    };
  }
  template.anchors = proposedAnchors;
  if (!template.anchors.locationIds.length) template.anchors.locationIds = fallback.anchors.locationIds;
  const proposedObjectives = asArray(template.objectives).slice(0, 4);
  if (proposedObjectives.length < 2) { diagnostics.push({ severity: 'warning', code: 'objective-count', message: 'Proposal lacked two grounded objectives; deterministic objectives were used.' }); template.objectives = fallback.objectives; }
  else template.objectives = proposedObjectives.map((item, index) => ({ id: compact(item.id).startsWith(`${template.id}.objective.`) ? compact(item.id) : `${template.id}.objective.${index + 1}`, label: compact(item.label || item.summary || item.playerText).slice(0, 220), playerText: compact(item.playerText || item.summary || item.label).slice(0, 320), optional: item.optional === true, initialStatus: 'pending', initialProgress: 0, progressModel: { mode: 'incremental', completionThreshold: 100, defaultProgress: 40, strongMatchProgress: 60, setbackProgress: 20 } }));
  template.approaches = unique(template.approaches).map(compact).filter(Boolean).slice(0, 6);
  if (template.approaches.length < 2) { template.approaches = fallback.approaches; diagnostics.push({ severity: 'warning', code: 'approach-diversity', message: 'Proposal lacked multiple viable approaches; deterministic approaches were used.' }); }
  let unauthorizedEffect = null;
  template.outcomes = asArray(template.outcomes).slice(0, 3).map((item, index) => ({
    id: compact(item.id) || `outcome-${index + 1}`,
    summary: compact(item.summary).slice(0, 400),
    effects: asArray(item.effects).filter((effect) => {
      if (!['addAttentionFlag', 'setActorState', 'setLocationState'].includes(effect?.type)) {
        unauthorizedEffect ||= effect?.type || 'unknown';
        return false;
      }
      if (effect.type === 'setActorState' && (!ids.actors.has(effect.actorId) || !groundedActors.has(effect.actorId))) {
        unauthorizedEffect ||= `setActorState:${effect.actorId || 'missing'}`;
        return false;
      }
      if (effect.type === 'setLocationState' && !template.anchors.locationIds.includes(effect.locationId)) {
        unauthorizedEffect ||= `setLocationState:${effect.locationId || 'missing'}`;
        return false;
      }
      return true;
    }).slice(0, 2)
  }));
  if (unauthorizedEffect) {
    return { ok: false, template: null, diagnostics: [...diagnostics, { severity: 'error', code: 'unauthorized-world-effect', message: `Quest Architect proposal requested unauthorized effect ${unauthorizedEffect}.` }] };
  }
  if (!template.outcomes.length) template.outcomes = fallback.outcomes;
  template.pressures = asArray(template.pressures).slice(0, 3).map((item, index) => ({ id: compact(item.id) || `${template.id}.pressure.${index + 1}`, summary: compact(item.summary).slice(0, 400), severity: Math.max(1, Math.min(4, Number(item.severity || 2))), tags: unique(item.tags).slice(0, 6) }));
  if (!template.pressures.length) template.pressures = fallback.pressures;
  template.delegation = { ...fallback.delegation, ...(template.delegation || {}), allowed: template.delegation?.allowed === true };
  template.systemicResolution = fallback.systemicResolution;
  template.availability = {}; template.initialStatus = 'available'; template.completionConditions = {}; template.failureConditions = {}; template.expiryConditions = template.expiryConditions || {}; template.transformsTo = asArray(template.transformsTo).slice(0, 2);
  template.emittedEvents = [{ id: `event-template.${template.id}.resolved`, type: 'quest.emergent.resolved', payload: { sourceThreadId: thread.id, worldEffects: template.outcomes.flatMap((item) => item.effects).slice(0, 3) } }];
  template.contextHints = { ...fallback.contextHints, ...(template.contextHints || {}), actorIds: template.anchors.actorIds, locationIds: template.anchors.locationIds, factionIds: template.anchors.factionIds };
  const evidence = threadEvidence(thread);
  template.provenance = { evidenceIds: evidence.map((item) => item.id), sourceMessageIds: unique(evidence.flatMap((item) => item.sourceMessageIds)), sourceOutcomeIds: unique(evidence.map((item) => item.sourceOutcomeId)), anchorRange: cloneJson(evidence.find((item) => item.anchorRange)?.anchorRange || null), createdAt: nowValue(now), method: 'model-validated' };
  template.semanticFingerprint = questSemanticFingerprint(template);
  const existing = questCatalogTemplates(packageData, state).find((item) => questSemanticFingerprint(item) === template.semanticFingerprint && item.id !== template.id);
  if (existing) return { ok: false, template: null, diagnostics: [...diagnostics, { severity: 'error', code: 'semantic-duplicate', message: `Quest duplicates ${existing.id}.` }] };
  return { ok: true, template, diagnostics };
}

export async function architectQuestFromThread({ thread, state, packageData, generationRouter = null, proposal = null, now = null } = {}) {
  let modelProposal = proposal;
  let modelCall = null;
  if (!modelProposal && generationRouter?.generate) {
    try {
      const request = buildQuestArchitectRequest({ thread, state, packageData });
      modelCall = await generationRouter.generate('questArchitect', { prompt: JSON.stringify(request), structuredOutput: true, metadata: { threadId: thread.id } });
      const response = modelCall?.response ?? modelCall;
      modelProposal = response?.data ?? response?.parsed ?? response?.output ?? response?.value ?? response?.content ?? response;
    } catch (error) {
      modelCall = { ok: false, error: { message: error?.message || String(error) } };
    }
  }
  const validation = validateQuestArchitectureProposal(modelProposal, { thread, state, packageData, now });
  return { ...validation, modelCall: cloneJson(modelCall), request: buildQuestArchitectRequest({ thread, state, packageData }) };
}

export function registerArchitectedQuest({ state, threadId, architecture, now = null } = {}) {
  if (!architecture?.ok || !architecture.template) throw new Error('Only a validated Quest Architect proposal may be registered.');
  let next = registerDynamicQuestTemplate(state, architecture.template, { proposal: { sourceThreadId: threadId, diagnostics: architecture.diagnostics }, now });
  const instance = createQuestInstance(architecture.template, { status: 'available', now, sourceThreadId: threadId, sourceAnchorRange: architecture.template.provenance?.anchorRange || null });
  next.questLedger.instances = asArray(next.questLedger.instances).filter((item) => item.id !== instance.id);
  next.questLedger.instances.push(instance);
  const thread = asArray(next.threadLedger?.records).find((item) => item.id === threadId);
  if (thread) {
    next.threadLedger = transitionThread(next.threadLedger, threadId, 'transformed', { now, reason: 'promoted-to-dynamic-quest', metadata: { questId: instance.id } });
    const record = next.threadLedger.records.find((item) => item.id === threadId);
    record.promotedQuestId = instance.id;
    record.metadata = { ...(record.metadata || {}), promotedQuestId: instance.id };
  }
  next.threadLedger.promotionReviews = [...asArray(next.threadLedger.promotionReviews), { id: `promotion.${threadId}.${instance.id}`, threadId, questId: instance.id, status: 'accepted', at: nowValue(now), diagnostics: cloneJson(architecture.diagnostics || []) }];
  return { state: next, template: architecture.template, instance };
}
