import { resolveMissionDisplayIdentity } from './mission-display-identity.mjs';

const PLAYER_VISIBLE_RECORD_VISIBILITY = new Set(['player', 'public', 'known', 'visible']);
const HIDDEN_RECORD_VISIBILITY = new Set(['hidden', 'latent', 'watchlisted', 'operator', 'diagnostic']);
const QUEST_STATUS_ORDER = Object.freeze({
  active: 0,
  available: 1,
  paused: 2,
  inactive: 3,
  completed: 4,
  abandoned: 5
});
const QUEST_CATEGORY_ORDER = Object.freeze({ main: 0, side: 1, crew: 2, 'open-world': 3 });

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compact(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstString(...values) {
  for (const value of values) {
    const result = compact(value);
    if (result) return result;
  }
  return '';
}

function firstValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }
  return null;
}

function numeric(value) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function stableValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return value;
  return firstString(value);
}

function recordVisibility(record) {
  const value = compact(record?.visibility || record?.visibilityStatus).toLowerCase();
  if (HIDDEN_RECORD_VISIBILITY.has(value)) return false;
  return !value || PLAYER_VISIBLE_RECORD_VISIBILITY.has(value);
}

function collectRecords({ campaignState = {}, coreProjections = {}, runtimeView = {} } = {}) {
  const candidates = [
    ...asArray(campaignState?.narrativeThreads?.records),
    ...asArray(campaignState?.threadLedger?.records),
    ...asArray(campaignState?.knowledgeLedger?.records),
    ...asArray(campaignState?.evidenceLedger?.records),
    ...asArray(campaignState?.commandLog?.records),
    ...asArray(campaignState?.commandLog?.entries),
    ...asArray(coreProjections?.records),
    ...asArray(coreProjections?.playerSafeCampaign?.records),
    ...asArray(runtimeView?.records)
  ];
  const seen = new Set();
  return candidates.filter((record) => {
    if (!record || typeof record !== 'object' || !recordVisibility(record)) return false;
    const id = firstString(record.id, record.recordId, record.eventId, record.key);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function normalizeStatus(value, fallback = 'inactive') {
  const status = compact(value).toLowerCase().replace(/\s+/g, '-');
  if (status === 'active' || status === 'available' || status === 'paused'
    || status === 'inactive' || status === 'completed' || status === 'abandoned') return status;
  if (status === 'open' || status === 'current' || status === 'in-progress' || status === 'pending') return 'active';
  if (status === 'done' || status === 'complete' || status === 'finished') return 'completed';
  return fallback;
}

function normalizeCategory(value, fallback = 'side') {
  const category = compact(value).toLowerCase().replace(/\s+/g, '-');
  if (category === 'main' || category === 'primary' || category === 'mission') return 'main';
  if (category === 'crew' || category === 'relationship') return 'crew';
  if (category === 'open-world' || category === 'openworld' || category === 'world') return 'open-world';
  if (category === 'side' || category === 'secondary') return 'side';
  return fallback;
}

function projectUrgency(source = {}) {
  const urgency = source?.urgency && typeof source.urgency === 'object' ? source.urgency : {};
  const remainingMinutes = numeric(firstValue(
    urgency.remainingMinutes,
    source.remainingMinutes,
    source.urgencyMinutes,
    source.deadlineMinutes,
    source.countdown?.remainingMinutes
  ));
  const label = firstString(
    urgency.label,
    source.urgencyLabel,
    remainingMinutes === null ? '' : `${remainingMinutes} minutes remaining`
  );
  if (remainingMinutes === null && !label) return null;
  return Object.freeze({
    label: label || null,
    remainingMinutes
  });
}

function projectQuest(source = {}, defaults = {}) {
  source = source || {};
  const id = firstString(source.id, source.questId, source.missionId, source.activeMissionId, defaults.id);
  if (!id) return null;
  const status = normalizeStatus(source.status || source.state, defaults.status || 'inactive');
  const category = normalizeCategory(source.category || source.type, defaults.category || 'side');
  const objective = firstString(
    source.currentObjective,
    source.currentObjective?.text,
    source.objective,
    source.objective?.text,
    source.objectiveText,
    source.formalObjectives?.[0]?.text,
    source.formalObjectives?.[0],
    source.summary,
    source.description,
    defaults.objective
  );
  const tasks = asArray(source.tasks || source.checklist || source.formalObjectives)
    .filter((task) => typeof task !== 'object' || recordVisibility(task))
    .map((task, index) => ({
      id: firstString(task?.id, task?.taskId, `${id}:task:${index + 1}`),
      text: firstString(task?.text, task?.label, task?.title, task?.objective, task),
      status: normalizeStatus(task?.status || task?.state, index === 0 ? 'active' : 'inactive')
    }))
    .filter((task) => task.text)
    .map((task) => ({
      ...task,
      status: task.status === 'active' ? 'current' : task.status
    }));
  return {
    id,
    category,
    status,
    title: firstString(source.title, source.name, source.label, defaults.title, id),
    description: firstString(source.description, source.premise, source.situation, source.playerSummary, source.summary) || null,
    objective: objective || null,
    objectiveDescription: firstString(source.objectiveDescription, source.currentObjective?.description, source.objective?.description) || null,
    tasks,
    context: source.context && typeof source.context === 'object' ? source.context : null,
    urgency: projectUrgency(source),
    knownFacts: [],
    people: [],
    location: null,
    history: [],
    sourceRef: firstString(source.sourceRef, source.sourceId, id)
  };
}

function mainMissionSource(campaignState = {}) {
  return campaignState?.mission
    || campaignState?.activeMission
    || campaignState?.missionState
    || campaignState?.campaign?.mission
    || null;
}

function sideQuestSources(campaignState = {}, coreProjections = {}, runtimeView = {}) {
  return [
    ...asArray(campaignState?.mission?.openAssignments)
      .filter((assignment) => compact(assignment?.assignmentScope).toLowerCase() !== 'delegatedcreworder'),
    ...asArray(campaignState?.openWorld?.quests),
    ...asArray(campaignState?.openWorld?.opportunities),
    ...asArray(campaignState?.questLedger?.records),
    ...asArray(campaignState?.dynamicQuestCatalog?.records),
    ...asArray(coreProjections?.openWorld?.quests),
    ...asArray(runtimeView?.openWorld?.quests)
  ];
}

function sourceIds(record = {}) {
  return new Set([
    record.id,
    record.questId,
    record.missionId,
    record.assignmentId,
    record.characterId,
    record.crewId,
    record.shipId,
    ...asArray(record.questIds),
    ...asArray(record.missionIds),
    ...asArray(record.relatedQuestIds),
    ...asArray(record.relatedMissionIds)
  ].map(compact).filter(Boolean));
}

function recordMatchesQuest(record, quest) {
  const ids = sourceIds(record);
  if (ids.has(quest.id)) return true;
  if (quest.category === 'main' && ids.has('main')) return true;
  return false;
}

function recordSummary(record = {}) {
  return firstString(record.summary, record.text, record.message, record.label, record.description);
}

function recordDate(record = {}) {
  return firstString(record.createdAt, record.updatedAt, record.timestamp, record.occurredAt);
}

function attachQuestRecords(quests, records) {
  return quests.map((quest) => {
    const linked = records.filter((record) => recordMatchesQuest(record, quest));
    const factRecords = linked.filter((record) => {
      const kind = compact(record.kind || record.type).toLowerCase();
      return kind.includes('fact') || kind.includes('discover') || kind.includes('evidence');
    });
    const knownFacts = factRecords.slice(0, 3).map((record) => ({
      id: firstString(record.id, record.recordId),
      text: recordSummary(record)
    })).filter((fact) => fact.id && fact.text);
    const people = linked.flatMap((record) => asArray(record.people || record.characters || record.crew))
      .map((person) => ({
        id: firstString(person?.id, person?.characterId, person?.crewId),
        label: firstString(person?.label, person?.name)
      }))
      .filter((person) => person.id && person.label)
      .filter((person, index, values) => values.findIndex((item) => item.id === person.id) === index)
      .slice(0, 5);
    const history = linked.map((record) => ({
      id: firstString(record.id, record.recordId),
      summary: recordSummary(record),
      occurredAt: recordDate(record)
    })).filter((entry) => entry.id && entry.summary).slice(0, 12);
    const locationSource = linked.find((record) => record.location || record.locationId);
    const locationId = firstString(quest.location?.id, quest.locationId, locationSource?.locationId, locationSource?.location?.id);
    const locationLabel = firstString(quest.location?.label, quest.location?.name, locationSource?.location?.label, locationSource?.location?.name);
    return {
      ...quest,
      knownFacts,
      people,
      location: locationId || locationLabel ? { id: locationId || locationLabel, label: locationLabel || locationId } : null,
      history
    };
  });
}

function orderQuests(quests) {
  return quests.slice().sort((left, right) => {
    const status = (QUEST_STATUS_ORDER[left.status] ?? 99) - (QUEST_STATUS_ORDER[right.status] ?? 99);
    if (status !== 0) return status;
    const leftUrgency = left.urgency?.remainingMinutes ?? Number.POSITIVE_INFINITY;
    const rightUrgency = right.urgency?.remainingMinutes ?? Number.POSITIVE_INFINITY;
    if (leftUrgency !== rightUrgency) return leftUrgency - rightUrgency;
    const category = (QUEST_CATEGORY_ORDER[left.category] ?? 99) - (QUEST_CATEGORY_ORDER[right.category] ?? 99);
    if (category !== 0) return category;
    return left.title.localeCompare(right.title);
  });
}

function mergeDefinedPersonFields(base = {}, source = {}) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(source || {})) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    merged[key] = value;
  }
  const facts = [...asArray(base.knownFacts || base.facts), ...asArray(source.knownFacts || source.facts)];
  if (facts.length) {
    merged.knownFacts = facts.filter((fact, index, values) => {
      const label = firstString(fact?.id, fact?.text, fact?.summary, fact?.label, fact);
      return label && values.findIndex((entry) => firstString(entry?.id, entry?.text, entry?.summary, entry?.label, entry) === label) === index;
    });
  }
  merged.isPlayer = base.isPlayer === true || source.isPlayer === true;
  return merged;
}

function projectCrew(campaignState = {}, records = [], coreProjections = {}, runtimeView = {}) {
  const packageSources = [
    ...asArray(coreProjections?.crewDataset?.officers),
    ...asArray(coreProjections?.crewDataset?.crew),
    ...asArray(coreProjections?.packageData?.crew?.senior),
    ...asArray(runtimeView?.activePackage?.crew?.senior),
    ...asArray(runtimeView?.activePackage?.crew?.officers)
  ];
  const sources = [
    ...packageSources,
    ...asArray(campaignState?.crew?.seniorCrewIds).map((id) => ({ id })),
    ...asArray(campaignState?.characters),
    ...asArray(campaignState?.crew?.characters),
    ...asArray(campaignState?.crew?.members),
    ...asArray(campaignState?.crew?.roster),
    coreProjections?.playerCharacterView?.identity
      ? { ...coreProjections.playerCharacterView.identity, isPlayer: true }
      : null,
    runtimeView?.playerCharacterView?.identity
      ? { ...runtimeView.playerCharacterView.identity, isPlayer: true }
      : null,
    campaignState?.player
      ? { ...campaignState.player, role: 'Player Character', isPlayer: true }
      : null
  ].filter((source) => source && recordVisibility(source));
  const mergedById = new Map();
  for (const source of sources) {
    const id = firstString(source?.id, source?.characterId, source?.crewId);
    if (!id) continue;
    mergedById.set(id, mergeDefinedPersonFields(mergedById.get(id), { ...source, id }));
  }
  return [...mergedById.values()].map((source) => {
    const id = source.id;
    const linked = records.filter((record) => sourceIds(record).has(id));
    return {
      id,
      isPlayer: source.isPlayer === true,
      name: firstString(source?.name, source?.label, source?.displayName, id),
      role: firstString(source?.role, source?.position, source?.billet, 'Crew member'),
      category: firstString(source?.category, source?.group, source?.collection, source?.affiliation, "Ship's Company"),
      affiliation: firstString(source?.affiliation, source?.organization, source?.faction) || null,
      image: source?.image || source?.portrait || source?.portraitAsset || null,
      service: source?.service && typeof source.service === 'object' ? {
        organization: firstString(source.service.organization).toLowerCase(),
        department: firstString(source.service.department).toLowerCase(),
        rankCode: firstString(source.service.rankCode, source.service.rank).toLowerCase(),
        rankLabel: firstString(source.service.rankLabel, source.service.rank) || null
      } : null,
      availability: firstString(source?.availability, source?.status, source?.posture) || null,
      standing: firstString(source?.standing, source?.relationship, source?.relationshipLabel) || null,
      assignment: firstString(source?.assignment, source?.activeAssignment) || null,
      involvement: source?.involvement && typeof source.involvement === 'object' ? source.involvement : null,
      knownFacts: asArray(source?.knownFacts || source?.facts)
        .filter((fact) => typeof fact !== 'object' || recordVisibility(fact))
        .map((fact) => firstString(fact?.text, fact?.summary, fact?.label, fact)).filter(Boolean).slice(0, 8),
      relationship: firstString(source?.relationshipSummary, source?.relationship, source?.standing) || null,
      history: linked.map((record) => ({ id: firstString(record.id, record.recordId), summary: recordSummary(record) }))
        .filter((entry) => entry.id && entry.summary).slice(0, 8)
    };
  }).sort((left, right) => Number(right.isPlayer) - Number(left.isPlayer));
}

function projectShip(campaignState = {}, records = []) {
  const source = campaignState?.ship || campaignState?.shipState || {};
  const shipId = firstString(source.id, source.shipId, campaignState?.shipId, 'ship');
  const linkedHistory = records.filter((record) => sourceIds(record).has(shipId)
    || compact(record.kind || record.type).toLowerCase().includes('technical'))
    .map((record) => ({ id: firstString(record.id, record.recordId), summary: recordSummary(record) }))
    .filter((entry) => entry.id && entry.summary);
  const damageItems = asArray(source.damage).filter(recordVisibility);
  const damageHistory = damageItems.map((item) => ({
    id: firstString(item?.id, item?.key, item?.name),
    summary: firstString(item?.playerSafeSummary, item?.summary, item?.label, item?.name, item)
  })).filter((entry) => entry.id && entry.summary);
  const technicalHistory = asArray(source.technicalDebt).filter(recordVisibility).map((item) => ({
    id: firstString(item?.id, item?.key, item?.name),
    summary: firstString(item?.playerSafeSummary, item?.summary, item?.label, item?.name, item)
  })).filter((entry) => entry.id && entry.summary);
  const history = [...damageHistory, ...technicalHistory, ...linkedHistory]
    .filter((entry, index, values) => values.findIndex((item) => item.id === entry.id) === index)
    .slice(0, 12);
  return {
    id: shipId,
    name: firstString(source.name, source.label, campaignState?.shipName, 'Ship'),
    className: firstString(source.class, source.className, source.shipClass) || null,
    registry: firstString(source.registry, source.registryNumber) || null,
    condition: firstString(source.condition, source.status, source.operationalCondition) || null,
    position: firstString(source.position, source.location, source.currentPosition) || null,
    course: firstString(source.course, source.destination, source.currentCourse) || null,
    flightStatus: firstString(source.flightStatus, source.flightCondition, source.movement) || null,
    image: source.image || source.hero || null,
    capabilities: asArray(source.capabilities || source.systems).map((item) => ({
      id: firstString(item?.id, item?.key, item?.name),
      label: firstString(item?.label, item?.name, item?.key),
      value: stableValue(item?.value ?? item?.status),
      description: firstString(item?.playerSafeSummary, item?.playerSummary, item?.summary, item?.description) || null
    })).filter((item) => item.id && item.label),
    issues: [...damageItems, ...asArray(source.activeRestrictions || source.restrictions), ...asArray(source.technicalDebt)]
      .filter(recordVisibility)
      .map((item) => ({
        id: firstString(item?.id, item?.key, item?.name, item?.label),
        title: firstString(item?.label, item?.name, item?.title, item),
        effect: firstString(item?.playerSafeSummary, item?.playerSummary, item?.summary, item?.description, item?.effect) || null,
        status: firstString(item?.status, 'active'),
        severity: firstString(item?.severity) || null,
        owner: firstString(item?.owner, item?.department) || null,
        linkedAssignment: firstString(item?.linkedAssignmentTitle, item?.assignmentTitle) || null,
        updatedAt: firstString(item?.updatedAt, item?.lastUpdatedAt) || null
      }))
      .filter((item) => item.id && item.title)
      .filter((item, index, values) => values.findIndex((entry) => entry.id === item.id) === index),
    restrictions: asArray(source.restrictions || source.activeRestrictions).filter(recordVisibility).map((item) => firstString(item?.playerSafeSummary, item?.summary, item?.label, item?.name, item)).filter(Boolean),
    damage: damageItems.map((item) => ({
      id: firstString(item?.id, item?.key, item?.name),
      label: firstString(item?.playerSafeSummary, item?.summary, item?.label, item?.name, item)
    })).filter((item) => item.id && item.label),
    history
  };
}

function projectContextualAlerts(runtimeView = {}) {
  const alerts = [];
  if (runtimeView?.pendingOutcomeReplacement || runtimeView?.pendingDirectorTurn) {
    alerts.push({ id: 'pending-decision', kind: 'decision', label: 'A decision needs your attention.' });
  }
  if (runtimeView?.lastError || runtimeView?.recovery?.required || runtimeView?.lastStateSafetyResult?.recoveryRequired) {
    alerts.push({ id: 'recovery', kind: 'recovery', label: 'Recovery is available for the current turn.' });
  }
  return alerts;
}

export function resolveSelectedQuestId({ quests = [], selectedQuestId = '', activeMissionId = '' } = {}) {
  const ids = new Set(asArray(quests).map((quest) => compact(quest?.id)).filter(Boolean));
  const selected = compact(selectedQuestId);
  const active = compact(activeMissionId);
  if (ids.has(selected)) return selected;
  if (ids.has(active)) return active;
  return compact(quests[0]?.id) || null;
}

export function buildPlayerFacingInformation({ campaignState = {}, coreProjections = {}, runtimeView = {} } = {}) {
  const mainSource = mainMissionSource(campaignState);
  const mainIdentity = resolveMissionDisplayIdentity({
    missionId: firstString(mainSource?.id, mainSource?.questId, mainSource?.missionId, mainSource?.activeMissionId),
    explicitTitle: firstString(mainSource?.title, mainSource?.name, mainSource?.label),
    questLedger: campaignState?.questLedger,
    packageData: coreProjections?.packageData || runtimeView?.currentChatActivePackage || runtimeView?.activePackage || null,
    missionGraphs: [
      ...asArray(coreProjections?.missionGraphs),
      ...asArray(runtimeView?.missionGraphs),
      ...asArray(runtimeView?.currentChatActivePackage?.missionGraphs),
      ...asArray(runtimeView?.activePackage?.missionGraphs)
    ]
  });
  const main = projectQuest(mainSource ? { ...mainSource, title: mainIdentity.title } : mainSource, {
    category: 'main',
    status: 'active',
    title: mainIdentity.title
  });
  const knownIds = new Set(main ? [main.id] : []);
  const sideQuests = sideQuestSources(campaignState, coreProjections, runtimeView)
    .filter((source) => recordVisibility(source))
    .map((source) => projectQuest(source, { status: 'active' }))
    .filter((quest) => quest && !knownIds.has(quest.id) && knownIds.add(quest.id));
  const records = collectRecords({ campaignState, coreProjections, runtimeView });
  const quests = attachQuestRecords([main, ...sideQuests].filter(Boolean), records);
  return Object.freeze({
    quests: orderQuests(quests),
    crew: projectCrew(campaignState, records, coreProjections, runtimeView),
    ship: projectShip(campaignState, records),
    contextualAlerts: projectContextualAlerts(runtimeView)
  });
}
