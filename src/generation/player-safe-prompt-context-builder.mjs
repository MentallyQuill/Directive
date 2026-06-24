import { assertHostPromptBlockSafeForInjection } from './prompt-injection-safety.mjs';
import { buildContextPlan } from '../context/context-orchestrator.mjs';
import { playerSafeQuestSummaries } from '../quests/quest-ledger.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function list(values, fallback = 'None recorded.') {
  const items = array(values)
    .map((value) => typeof value === 'string' ? compact(value) : compact(value?.summary || value?.label || value?.id))
    .filter(Boolean);
  return items.length ? items.map((item) => `- ${item}`).join('\n') : fallback;
}

function hashText(value) {
  const text = String(value || '');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stateRevision(campaignState) {
  return Number(
    campaignState?.runtimeTracking?.revision
    ?? campaignState?.directiveRuntime?.revision
    ?? campaignState?.tracking?.revision
    ?? campaignState?.turnLedger?.entries?.length
    ?? 0
  ) || 0;
}

function source(campaignState, id) {
  return {
    kind: 'directive.campaignState',
    id: `${campaignState?.campaign?.id || 'campaign'}:${id}`,
    revision: stateRevision(campaignState)
  };
}

function makeBlock(campaignState, {
  id,
  title,
  content,
  priority,
  placement = 'inChat',
  depth = 4,
  role = 'system'
}) {
  const normalized = assertHostPromptBlockSafeForInjection({
    id,
    title,
    audience: 'narratorSafe',
    source: source(campaignState, id),
    priority,
    content: String(content ?? '').trim(),
    safety: {
      rawHiddenValuesExposed: false,
      directorOnlyDataIncluded: false,
      playerVisible: true
    }
  });
  return {
    ...normalized,
    content: normalized.text,
    placement,
    depth,
    role,
    contentHash: hashText(normalized.text),
    hash: hashText(normalized.text)
  };
}

function visibleKnownFacts(campaignState) {
  return (campaignState?.mission?.knownFacts || []).filter((fact) => {
    if (typeof fact === 'string') return true;
    return fact?.visibility !== 'hidden' && fact?.playerVisible !== false;
  }).map((fact) => {
    if (typeof fact === 'string') return compact(fact);
    return {
      id: fact?.id || null,
      label: compact(fact?.playerSafeSummary || fact?.summary || fact?.label || fact?.id),
      status: compact(fact?.status || fact?.state) || null
    };
  }).filter((fact) => typeof fact === 'string' ? Boolean(fact) : Boolean(fact.label));
}

function visibleRelationshipStances(campaignState, packageData) {
  const crewById = new Map((packageData?.crew?.senior || []).map((officer) => [officer.id, officer]));
  return (campaignState?.relationships?.seniorCrew || []).filter((entry) => {
    return entry?.playerVisible === true || Boolean(compact(entry?.visibleDescriptor));
  }).map((entry) => {
    const officer = crewById.get(entry.crewId);
    const name = officer?.name || entry.crewId;
    const billet = officer?.billet ? `, ${officer.billet}` : '';
    const stance = compact(entry.visibleDescriptor || 'professional posture not yet established');
    return `${name}${billet}: ${stance}`;
  });
}

function visibleCrewContext(campaignState, packageData, crewDataset, relevantCrewIds = []) {
  const relevant = new Set((Array.isArray(relevantCrewIds) ? relevantCrewIds : []).filter(Boolean));
  const sourceCrew = packageData?.crew?.senior || crewDataset?.officers || [];
  const relationshipStances = new Map((campaignState?.relationships?.seniorCrew || [])
    .filter((entry) => entry?.playerVisible === true || Boolean(compact(entry?.visibleDescriptor)))
    .map((entry) => [entry.crewId, entry.visibleDescriptor]));
  const selected = sourceCrew.filter((officer) => {
    if (officer.id === 'player-commander') return false;
    return relevant.size === 0 || relevant.has(officer.id);
  });
  return selected.slice(0, relevant.size ? 12 : 8).map((officer) => {
    const rank = officer.rank ? `${officer.rank} ` : '';
    const stance = compact(relationshipStances.get(officer.id));
    return `${rank}${officer.name || officer.id} - ${officer.billet || 'Senior officer'}${stance ? `; visible posture: ${stance}` : ''}`;
  });
}

function visiblePressures(campaignState) {
  return (campaignState?.pressureLedger?.records || [])
    .filter((record) => record?.visibility !== 'hidden' && record?.playerVisible !== false && record?.status !== 'resolved')
    .map((record) => compact(record.playerSafeSummary || record.summary || record.label || record.id))
    .filter(Boolean);
}

function openQuestWork(campaignState, packageData = null) {
  if (!packageData) return [];
  return playerSafeQuestSummaries(campaignState?.questLedger, packageData, {
    campaignState,
    statuses: ['available', 'offered', 'accepted', 'active', 'delegated']
  }).map((entry) => compact(entry.playerSummary || entry.title || entry.id)).filter(Boolean);
}

function recentCommandLog(campaignState, limit = 6) {
  return array(campaignState?.commandLog?.entries)
    .filter((entry) => entry?.visibility !== 'hidden' && entry?.playerVisible !== false)
    .slice(-limit)
    .map((entry) => {
      const summary = compact(entry.assistedSummary?.text || entry.summary || entry.summaryInputs?.join(' ') || entry.type || entry.id);
      const consequences = array(entry.visibleConsequences).map(compact).filter(Boolean);
      return consequences.length ? `${summary} Consequences: ${consequences.join('; ')}` : summary;
    })
    .filter(Boolean);
}

function visibleStateRecords(values, {
  includeSeverity = true,
  includeStatus = true,
  includeOwner = false
} = {}) {
  return (Array.isArray(values) ? values : [])
    .filter((entry) => {
      if (typeof entry === 'string') return true;
      return entry?.visibility !== 'hidden' && entry?.playerVisible !== false;
    })
    .map((entry) => {
      if (typeof entry === 'string') return compact(entry);
      const label = compact(
        entry?.playerSafeSummary
        || entry?.summary
        || entry?.label
        || entry?.title
        || entry?.name
        || entry?.id
      );
      if (!label) return null;
      const projected = {
        id: entry?.id || null,
        label
      };
      if (includeStatus) projected.status = compact(entry?.status || entry?.state) || null;
      if (includeSeverity) projected.severity = compact(entry?.severity || entry?.condition) || null;
      if (includeOwner) projected.owner = compact(entry?.ownerName || entry?.department || entry?.assignee) || null;
      return projected;
    })
    .filter(Boolean);
}

function visibleCrewCasualties(campaignState, crewNames) {
  return (campaignState?.crew?.casualties || [])
    .filter((entry) => entry?.visibility !== 'hidden' && entry?.playerVisible !== false)
    .map((entry) => {
      const crewId = entry?.crewId || entry?.personId || entry?.id || null;
      const summary = compact(
        entry?.playerSafeSummary
        || entry?.summary
        || entry?.injury
        || entry?.condition
        || entry?.status
      );
      return {
        crewId,
        crewName: crewNames.get(crewId) || compact(entry?.crewName || entry?.name) || crewId,
        status: compact(entry?.status || entry?.condition) || null,
        summary: summary || null
      };
    });
}

function visibleCrewReassignments(campaignState, crewNames) {
  return (campaignState?.crew?.reassignments || [])
    .filter((entry) => entry?.visibility !== 'hidden' && entry?.playerVisible !== false)
    .map((entry) => {
      const crewId = entry?.crewId || entry?.personId || entry?.id || null;
      return {
        crewId,
        crewName: crewNames.get(crewId) || compact(entry?.crewName || entry?.name) || crewId,
        from: compact(entry?.from || entry?.previousAssignment || entry?.previousBillet) || null,
        to: compact(entry?.to || entry?.assignment || entry?.newBillet) || null,
        status: compact(entry?.status) || null,
        summary: compact(entry?.playerSafeSummary || entry?.summary || entry?.reason) || null
      };
    });
}

function visibleDirectives(campaignState) {
  return visibleStateRecords(campaignState?.directives?.active || [], {
    includeSeverity: false,
    includeStatus: true,
    includeOwner: true
  });
}

function activeSceneLines(campaignState, scene = {}) {
  const mission = campaignState?.mission || {};
  const lines = [
    `Mission: ${compact(scene.missionTitle || mission.activeMissionId || mission.activeMissionGraphId || 'Active assignment')}`,
    `Phase: ${compact(scene.phaseLabel || scene.activePhaseId || mission.activePhaseId || mission.phase || 'Current scene')}`,
    scene.location ? `Location: ${compact(scene.location)}` : null,
    scene.currentQuestion ? `Current question: ${compact(scene.currentQuestion)}` : null,
    scene.immediateStakes ? `Immediate stakes: ${compact(scene.immediateStakes)}` : null,
    `Available decision points: ${(scene.availableDecisionPointIds || mission.availableDecisionPointIds || []).join(', ') || 'None explicitly listed'}`
  ];
  const present = scene.presentCharacterIds || scene.presentCharacters || [];
  if (present.length) lines.push(`Present: ${present.join(', ')}`);
  return lines.filter(Boolean);
}

export function createPlayerSafeCampaignProjection({
  campaignState,
  packageData = null,
  crewDataset = null,
  scene = null
} = {}) {
  if (!campaignState || typeof campaignState !== 'object') return null;
  const packageCrew = packageData?.crew?.senior || crewDataset?.officers || [];
  const crewNames = new Map(packageCrew.map((officer) => [officer.id, officer.name || officer.id]));
  return {
    kind: 'directive.playerSafeCampaignProjection',
    revision: stateRevision(campaignState),
    campaign: {
      id: campaignState.campaign?.id || null,
      title: campaignState.campaign?.title || campaignState.campaign?.packageTitle || null,
      status: campaignState.campaign?.status || null,
      currentStardate: campaignState.worldState?.currentStardate || campaignState.campaign?.currentStardate || null,
      locationId: campaignState.worldState?.currentLocationId || null,
      foregroundQuestId: campaignState.questLedger?.foregroundQuestId || null,
      theater: campaignState.campaign?.theater || null
    },
    player: {
      id: campaignState.player?.id || null,
      name: campaignState.player?.name || null,
      rank: campaignState.player?.rank || null,
      billet: campaignState.player?.billet || null,
      species: campaignState.player?.species?.label || campaignState.player?.species || null,
      publicReputation: campaignState.player?.dossier?.publicReputation || null,
      commandBearing: {
        inspiration: {
          rank: campaignState.commandStyle?.inspiration?.rank || 1,
          rankTitle: campaignState.commandStyle?.inspiration?.rankTitle || null,
          marks: campaignState.commandStyle?.inspiration?.marks || 0,
          points: campaignState.commandStyle?.inspiration?.points || 0
        },
        resolve: {
          rank: campaignState.commandStyle?.resolve?.rank || 1,
          rankTitle: campaignState.commandStyle?.resolve?.rankTitle || null,
          marks: campaignState.commandStyle?.resolve?.marks || 0,
          points: campaignState.commandStyle?.resolve?.points || 0
        }
      }
    },
    mission: {
      activeMissionId: campaignState.mission?.activeMissionId || null,
      activePhaseId: campaignState.mission?.activePhaseId || campaignState.mission?.phase || null,
      availableDecisionPointIds: cloneJson(campaignState.mission?.availableDecisionPointIds || []),
      formalObjectives: visibleStateRecords(campaignState.mission?.formalObjectives || [], {
        includeSeverity: false,
        includeStatus: true
      }),
      knownFacts: visibleKnownFacts(campaignState),
      availableQuests: (campaignState.questLedger?.instances || []).filter((quest) => ['available', 'offered', 'accepted', 'active'].includes(quest.status)).map((quest) => ({ id: quest.id, status: quest.status, foreground: quest.foreground === true }))
    },
    scene: scene ? {
      missionTitle: compact(scene.missionTitle) || null,
      phaseLabel: compact(scene.phaseLabel) || null,
      location: compact(scene.location) || null,
      currentQuestion: compact(scene.currentQuestion) || null,
      immediateStakes: compact(scene.immediateStakes) || null,
      presentCharacterIds: cloneJson(scene.presentCharacterIds || scene.presentCharacters || []),
      availableDecisionPointIds: cloneJson(scene.availableDecisionPointIds || [])
    } : null,
    ship: {
      id: campaignState.ship?.id || null,
      name: campaignState.ship?.name || null,
      class: campaignState.ship?.class || null,
      condition: campaignState.ship?.condition || null,
      damage: visibleStateRecords(campaignState.ship?.damage || []),
      technicalDebt: visibleStateRecords(campaignState.ship?.technicalDebt || [], {
        includeSeverity: false
      }),
      activeRestrictions: visibleStateRecords(campaignState.ship?.activeRestrictions || [], {
        includeSeverity: false
      })
    },
    crew: {
      casualties: visibleCrewCasualties(campaignState, crewNames),
      reassignments: visibleCrewReassignments(campaignState, crewNames),
      visibleRelationships: visibleRelationshipStances(campaignState, packageData)
    },
    pressures: visiblePressures(campaignState),
    sideWork: openQuestWork(campaignState, packageData),
    commandLog: recentCommandLog(campaignState, 12),
    directives: visibleDirectives(campaignState),
    chatBinding: campaignState.campaignChatBinding ? {
      hostId: campaignState.campaignChatBinding.hostId || null,
      chatId: campaignState.campaignChatBinding.chatId || null,
      chatName: campaignState.campaignChatBinding.chatName || null,
      status: campaignState.campaignChatBinding.status || 'bound',
      promptContextRevision: campaignState.campaignChatBinding.promptContextRevision || 0
    } : null
  };
}

export function buildPlayerSafePromptContext(input = {}, options = {}) {
  const normalizedInput = input?.campaignState
    ? input
    : { campaignState: input, ...options };
  const {
    campaignState,
    packageData = null,
    crewDataset = null,
    scene = null,
    relevantCrewIds = [],
    recentMessageSummary = null,
    createdAt = null
  } = normalizedInput;
  if (!campaignState || typeof campaignState !== 'object') {
    throw new Error('campaignState must be an object');
  }
  const plan = buildContextPlan({
    campaignState,
    packageData,
    crewDataset,
    scene: scene || {},
    recentMessageSummary,
    createdAt,
    relevantCrewIds
  });
  return { ...plan, kind: 'directive.playerSafePromptContext' };
}


export function recordPromptContextRevision(campaignState, packet, {
  installedAt = null,
  status = 'active'
} = {}) {
  if (!campaignState || typeof campaignState !== 'object') {
    throw new Error('campaignState must be an object');
  }
  if (!packet || !Array.isArray(packet.blocks)) {
    throw new Error('prompt packet must contain blocks');
  }
  const next = cloneJson(campaignState);
  if (!next.runtimeTracking || typeof next.runtimeTracking !== 'object') next.runtimeTracking = { revision: 0 };
  next.runtimeTracking.promptContext = {
    ...(next.runtimeTracking.promptContext || {}),
    status,
    revision: Number(packet.revision || 0),
    hash: packet.hash || packet.contentHash || null,
    blockCount: packet.blocks.length,
    blocks: packet.blocks.map((block) => ({
      id: block.id,
      title: block.title,
      priority: block.priority,
      placement: block.placement,
      depth: block.depth,
      hash: block.hash || block.contentHash || null,
      sourceRevision: block.source?.revision ?? null
    })),
    installedAt
  };
  if (next.campaignChatBinding) {
    next.campaignChatBinding.promptContextRevision = Number(packet.revision || 0);
    next.campaignChatBinding.promptContextHash = packet.hash || packet.contentHash || null;
  }
  return next;
}

export const __playerSafePromptContextBuilderTestHooks = Object.freeze({
  hashText,
  visibleKnownFacts,
  visibleRelationshipStances,
  visibleCrewContext,
  visiblePressures,
  recentCommandLog
});
