import { playerSafeQuestSummaries, questTemplateById } from '../quests/quest-ledger.mjs';
import { threadPlayerSummaries } from '../threads/thread-ledger.mjs';
import { assertHostPromptBlockSafeForInjection } from '../generation/prompt-injection-safety.mjs';
import { renderCompactCrewVoiceCueFromCard, voiceCardsByCrewId } from '../generation/crew-voice-capsules.mjs';
import { createCampaignReplyHeaderPromptBlock } from '../time/campaign-time-header.mjs';
import {
  globalScenePacingLines,
  scenePacingGuidance
} from './scene-pacing-guidance.mjs';
import {
  STARFLEET_VOYAGER_UNIFORM_RULE,
  starfleetUniformFactForCrew
} from '../starfleet/uniforms.mjs';
import {
  applyLensPromptRevisionRecord,
  createLensPromptRevisionRecord
} from '../runtime/lens-prompt-revision-record.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compact(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function hashText(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || '').length / 4));
}

function list(items, fallback = '') {
  const values = asArray(items).map((item) => compact(typeof item === 'string'
    ? item
    : item?.playerSafeSummary || item?.playerSummary || item?.summary || item?.label || item?.title || item?.id)).filter(Boolean);
  return values.length ? values.map((value) => `- ${value}`).join('\n') : fallback;
}

function coreRuntimeRevision(state) {
  const projection = state?.directiveRuntimeEvidence?.coreStoreReadProjections;
  if (projection?.runtimeAuthority !== 'coreStoreV2') return null;
  const revision = Number(projection?.revisions?.runtime);
  return Number.isFinite(revision) ? revision : 0;
}

function sourceRevision(state) {
  return Number(coreRuntimeRevision(state) ?? state?.runtimeTracking?.revision ?? state?.turnLedger?.entries?.length ?? 0) || 0;
}

function promptRevisionAuthority(campaignState = {}) {
  return Math.max(
    0,
    Number(campaignState?.directiveRuntimeEvidence?.lensPromptRevisionRecord?.revision) || 0,
    Number(campaignState?.campaignChatBinding?.promptContextRevision) || 0,
    Number(campaignState?.runtimeResume?.promptContextRevision) || 0
  );
}

function locationTemplate(packageData, locationId) {
  return asArray(packageData?.world?.locations).find((location) => location.id === locationId) || null;
}

function locationState(state, locationId) {
  return asArray(state?.worldState?.locations).find((location) => location.id === locationId) || null;
}

function crewById(packageData, crewDataset) {
  const records = new Map();
  for (const record of asArray(crewDataset?.officers)) {
    if (record?.id) records.set(record.id, { ...record });
  }
  for (const record of asArray(packageData?.crew?.senior)) {
    if (!record?.id) continue;
    records.set(record.id, {
      ...(records.get(record.id) || {}),
      ...record
    });
  }
  return records;
}

function crewPublicFacts(officer) {
  const facts = [];
  const age = compact(officer?.ageDescription);
  const appearance = compact(officer?.appearanceSummary);
  const profile = compact(officer?.publicProfile);
  const role = compact(officer?.packageRole);
  const uniform = starfleetUniformFactForCrew(officer);
  const rank = compact(officer?.rank);
  const name = compact(officer?.name || officer?.id);
  const species = compact(officer?.species);
  const billet = compact(officer?.billet || 'crew');
  const defaultProfile = compact(`${rank ? `${rank} ` : ''}${name} is ${species}, ${billet}.`);
  if (age) facts.push(`age: ${age}`);
  if (appearance) facts.push(`appearance: ${appearance}`);
  if (uniform?.summary) facts.push(`uniform: ${uniform.summary}`);
  if (profile && profile !== defaultProfile) facts.push(profile);
  if (role && !/^(senior-staff|senior-enlisted|commanding-officer)$/i.test(role)) {
    facts.push(`role: ${role}`);
  }
  for (const fact of asArray(officer?.publicIdentityFacts).map(compact).filter(Boolean)) {
    if (!facts.includes(fact)) facts.push(fact);
  }
  return facts;
}

function crewIdentityLine(officer = {}, relationship = null) {
  const rank = compact(officer.rank);
  const name = compact(officer.name || officer.id || 'Unknown crew');
  const species = compact(officer.species);
  const billet = compact(officer.billet || 'crew');
  const identity = `${rank ? `${rank} ` : ''}${name}${species ? ` (${species})` : ''}, ${billet}`;
  const details = [
    ...crewPublicFacts(officer),
    relationship?.visibleDescriptor ? compact(relationship.visibleDescriptor) : null
  ].filter(Boolean);
  return details.length ? `- ${identity}; ${details.join('; ')}` : `- ${identity}`;
}

function playerIdentityLine(player = {}) {
  const rank = compact(player.rank);
  const name = compact(player.name || player.characterName || player.id || 'the player character');
  const species = compact(player.species);
  const billet = compact(player.billet || player.role || player.position || 'player character');
  const identity = `${rank ? `${rank} ` : ''}${name}${species ? ` (${species})` : ''}, ${billet}`;
  const publicDetails = [
    player.dossier?.publicReputation ? `public reputation: ${compact(player.dossier.publicReputation)}` : null,
    player.publicProfile,
    player.appearanceSummary,
    player.backgroundSummary,
    player.playerSafeSummary,
    player.summary
  ].map(compact).filter(Boolean);
  return publicDetails.length ? `${identity}; ${publicDetails.join('; ')}` : identity;
}

function promptKeyForCandidateId(id) {
  const safeId = compact(id || 'context').replace(/[^a-zA-Z0-9_.-]/g, '-');
  return `directive.campaign.${safeId || 'context'}`;
}

function knownFacts(state, relevantFactIds = []) {
  const relevant = new Set(asArray(relevantFactIds));
  return asArray(state?.knowledgeLedger?.facts)
    .filter((fact) => typeof fact === 'string' || fact?.visibility !== 'directorOnly')
    .filter((fact) => relevant.size === 0 || relevant.has(typeof fact === 'string' ? fact : fact.id))
    .map((fact) => typeof fact === 'string' ? fact : fact.playerSafeSummary || fact.summary || fact.id)
    .filter(Boolean);
}

function visiblePressures(state, relevantPressureIds = []) {
  const relevant = new Set(asArray(relevantPressureIds));
  return asArray(state?.pressureLedger?.records)
    .filter((record) => record?.status !== 'resolved' && record?.visibility !== 'hidden' && record?.playerVisible !== false)
    .filter((record) => relevant.size === 0 || relevant.has(record.id))
    .map((record) => record.playerSafeSummary || record.summary || record.title || record.id)
    .filter(Boolean);
}

function recentCommandLog(state, limit = 4) {
  return asArray(state?.commandLog?.entries)
    .filter((entry) => entry?.visibility !== 'hidden' && entry?.playerVisible !== false)
    .slice(-limit)
    .map((entry) => compact(entry.assistedSummary?.text || entry.summary || entry.summaryInputs?.join(' ') || entry.type || entry.id))
    .filter(Boolean);
}

function shipStatusLines(state, packageData = null) {
  const ship = state?.ship || {};
  const travelContinuity = {
    ...(packageData?.ship?.travelContinuity || {}),
    ...(ship.travelContinuity || {})
  };
  const damage = asArray(ship.damage).filter((item) => item?.visibility !== 'hidden').map((item) => item.playerSafeSummary || item.summary || item.label || item.id);
  const debt = asArray(ship.technicalDebt).filter((item) => item?.visibility !== 'hidden').map((item) => item.playerSafeSummary || item.summary || item.label || item.id);
  const restrictions = asArray(ship.activeRestrictions).filter((item) => item?.visibility !== 'hidden').map((item) => item.playerSafeSummary || item.summary || item.label || item.id);
  return [
    `Condition: ${compact(ship.condition || 'Operational')}`,
    travelContinuity.openingShuttleApproach ? `Shuttle approach: ${compact(travelContinuity.openingShuttleApproach)}` : null,
    damage.length ? `Damage:\n${list(damage)}` : null,
    restrictions.length ? `Restrictions:\n${list(restrictions)}` : null,
    debt.length ? `Technical debt:\n${list(debt)}` : null
  ].filter(Boolean);
}

function normalizeCandidate(state, candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const text = String(candidate.content || '').trim();
  if (!text) return null;
  return {
    id: candidate.id,
    title: candidate.title,
    audience: candidate.audience || 'narratorSafe',
    mustInclude: candidate.mustInclude === true,
    salienceScore: Math.max(0, Math.min(100, Number(candidate.salienceScore || 0))),
    tokenEstimate: candidate.tokenEstimate || estimateTokens(text),
    lensPromptBudgetLane: candidate.lensPromptBudgetLane || contextCandidateBudgetLane(candidate),
    placement: candidate.placement || 'inChat',
    depth: Number(candidate.depth ?? 4),
    role: candidate.role || 'system',
    ttl: candidate.ttl || 'scene',
    sourceIds: [...new Set(asArray(candidate.sourceIds))],
    reason: candidate.reason || '',
    priority: Number(candidate.priority ?? (1000 - Number(candidate.salienceScore || 0))),
    content: text,
    hash: hashText(text),
    source: {
      kind: 'directive.contextCandidate',
      id: `${state?.campaign?.id || 'campaign'}:${candidate.id}`,
      revision: sourceRevision(state)
    },
    safety: {
      rawHiddenValuesExposed: false,
      directorOnlyDataIncluded: false,
      playerVisible: true
    }
  };
}

function contextCandidateBudgetLane(candidate = {}) {
  const id = compact(candidate.id);
  if (id === 'directive-contract') return 'stableRules';
  if (id === 'reply-header' || id === 'immediate-scene' || id === 'foreground-quest') return 'activeScene';
  if (id === 'relevant-crew') return 'activeCast';
  if (id === 'active-pressures' || id === 'engaged-threads' || id === 'nearby-opportunities' || id === 'main-arc-orientation') return 'missionPressure';
  if (id === 'command-log-continuity') return 'recentTranscript';
  if (id === 'location-context' || id === 'relevant-facts' || id === 'ship-status') return 'protectedContinuity';
  if (Number(candidate.depth) <= 2 || candidate.mustInclude === true) return 'activeScene';
  if (Number(candidate.depth) <= 5) return 'protectedContinuity';
  return 'missionPressure';
}

function buildCandidates({ state, packageData, crewDataset, scene = {}, recentMessageSummary = null }) {
  const policy = packageData?.contextPolicy || {};
  const attention = state?.attentionState || {};
  const questId = scene.foregroundQuestId || attention.foregroundQuestId || state?.questLedger?.foregroundQuestId || null;
  const quest = questId ? asArray(state?.questLedger?.instances).find((instance) => instance.id === questId) : null;
  const template = questId ? questTemplateById(packageData, quest?.templateId || questId, state) : null;
  const locationId = scene.locationId || state?.worldState?.currentLocationId || null;
  const locTemplate = locationTemplate(packageData, locationId);
  const locState = locationState(state, locationId);
  const crewMap = crewById(packageData, crewDataset);
  const voiceMap = voiceCardsByCrewId(crewDataset);
  const relevantCrewIds = [...new Set([
    ...asArray(scene.presentCharacterIds || scene.presentCharacters),
    ...asArray(template?.anchors?.actorIds),
    ...asArray(scene.relevantCrewIds)
  ])].filter((id) => crewMap.has(id) && id !== 'player-commander');
  const activeVoiceCrewIds = [...new Set([
    ...asArray(scene.presentCharacterIds || scene.presentCharacters),
    ...asArray(scene.relevantCrewIds)
  ])].filter((id) => crewMap.has(id) && id !== 'player-commander');
  const orderedVoiceCueCrewIds = (activeVoiceCrewIds.length ? activeVoiceCrewIds : relevantCrewIds).slice(0, 3);
  const voiceCueCrewIds = new Set(orderedVoiceCueCrewIds);
  const lineShapeCrewId = orderedVoiceCueCrewIds[0] || null;
  const relevantFacts = [...new Set([
    ...asArray(scene.relevantFactIds),
    ...asArray(template?.revelationIds),
    ...asArray(template?.facts?.map((fact) => fact.id))
  ])];
  const relevantPressures = [...new Set([
    ...asArray(scene.relevantPressureIds),
    attention.primaryPressureId,
    ...asArray(template?.fronts?.map((front) => front.pressureId))
  ].filter(Boolean))];
  const questSummaries = playerSafeQuestSummaries(state?.questLedger, packageData, { campaignState: state });
  const foregroundSummary = questSummaries.find((entry) => entry.id === questId);
  const availableQuests = questSummaries.filter((entry) => ['available', 'offered', 'accepted'].includes(entry.status) && entry.id !== questId).slice(0, 3);
  const threads = threadPlayerSummaries(state?.threadLedger, { statuses: ['engaged', 'active'], limit: 3 });
  const replyHeaderBlock = createCampaignReplyHeaderPromptBlock(state);
  const pacing = scenePacingGuidance({ campaignState: state, packageData, scene });
  const pacingLines = [
    ...globalScenePacingLines(),
    ...(pacing?.lines || [])
  ];
  const objectiveLabels = foregroundSummary?.currentObjectiveIds?.length
    ? foregroundSummary.currentObjectiveIds.map((objectiveId) => {
      const objective = asArray(template?.objectives).find((entry) => entry?.id === objectiveId);
      return compact(objective?.playerText || objective?.label || objective?.summary || objectiveId);
    }).filter(Boolean)
    : [];

  return [
    normalizeCandidate(state, {
      id: 'directive-contract',
      title: 'Directive Contract',
      mustInclude: true,
      salienceScore: 100,
      placement: 'inPrompt',
      depth: 0,
      ttl: 'campaign',
      priority: 1000,
      reason: 'Stable authority and hidden-information contract.',
      content: asArray(policy.alwaysOnContract).length ? policy.alwaysOnContract.join('\n') : [
        'Treat committed Directive state as authoritative.',
        'Do not expose Director-only facts, concealed values, unrevealed motives, or internal scoring.',
        'Do not reroll or contradict a committed outcome.',
        STARFLEET_VOYAGER_UNIFORM_RULE,
        'For named crew, treat listed rank, billet, species, public profile, age, appearance, uniform/division color, and role facts as fixed. Do not invent or infer identity facts that are not provided.',
        'Write normal in-character roleplay prose; do not narrate mechanics as mechanics.',
        'Routine professional competence is available; the player supplies judgment and command decisions.'
      ].join('\n')
    }),
    normalizeCandidate(state, {
      id: 'player-character',
      title: 'Player Character',
      mustInclude: true,
      salienceScore: 100,
      placement: 'inPrompt',
      depth: 0,
      ttl: 'campaign',
      priority: 999,
      reason: 'The host model must address and frame the user-made player character correctly.',
      sourceIds: [state?.player?.id || 'player-character'].filter(Boolean),
      content: [
        `Player character: ${playerIdentityLine(state?.player || {})}`,
        'Address and refer to the player character using this identity. Do not invent a different name, rank, billet, or callsign.'
      ].join('\n')
    }),
    normalizeCandidate(state, replyHeaderBlock),
    normalizeCandidate(state, {
      id: 'immediate-scene',
      title: 'Immediate Scene',
      mustInclude: true,
      salienceScore: 100,
      placement: 'inChat',
      depth: 1,
      ttl: 'turn',
      reason: 'Foreground location, actors, question, and immediate stakes.',
      sourceIds: [questId, locationId, ...relevantCrewIds].filter(Boolean),
      content: [
        `Location: ${locTemplate?.name || locationId || 'Current location'}`,
        questId ? `Foreground assignment: ${template?.title || questId}` : `Current activity: ${scene.activityLabel || attention.mode || 'open operations'}`,
        scene.phaseLabel || attention.scene?.phaseLabel ? `Scene beat: ${scene.phaseLabel || attention.scene?.phaseLabel}` : null,
        scene.currentQuestion || template?.dramaticQuestion ? `Current question: ${scene.currentQuestion || template?.dramaticQuestion}` : null,
        scene.immediateStakes ? `Immediate stakes: ${compact(scene.immediateStakes)}` : null,
        pacingLines.length ? `Pacing guidance:\n${list(pacingLines)}` : null,
        relevantCrewIds.length ? `Present or directly relevant: ${relevantCrewIds.map((id) => crewMap.get(id)?.name || id).join(', ')}` : null,
        recentMessageSummary ? `Recent continuity: ${compact(recentMessageSummary)}` : null
      ].filter(Boolean).join('\n')
    }),
    normalizeCandidate(state, foregroundSummary ? {
      id: 'foreground-quest',
      title: 'Foreground Assignment',
      mustInclude: true,
      salienceScore: 96,
      placement: 'inChat',
      depth: 2,
      ttl: 'scene',
      reason: 'Current assignment objectives and authored constraints.',
      sourceIds: [questId],
      content: [
        `${foregroundSummary.title} (${foregroundSummary.kind})`,
        foregroundSummary.playerSummary,
        objectiveLabels.length ? `Active objectives:\n${list(objectiveLabels)}` : null,
        template?.playerConstraints?.length ? `Boundaries:\n${list(template.playerConstraints)}` : null
      ].filter(Boolean).join('\n')
    } : null),
    normalizeCandidate(state, {
      id: 'location-context',
      title: 'Local World Context',
      salienceScore: locTemplate ? 84 : 0,
      placement: 'inChat',
      depth: 4,
      ttl: 'location',
      reason: 'The current location should shape available actors, services, and atmosphere.',
      sourceIds: [locationId].filter(Boolean),
      content: locTemplate ? [
        `${locTemplate.name || locTemplate.title || locationId}: ${locTemplate.playerSummary || locTemplate.summary || ''}`,
        locState?.status ? `Current condition: ${locState.status}` : null,
        asArray(locState?.conditions).length ? `Observable conditions:\n${list(locState.conditions)}` : null,
        asArray(locTemplate.services).length ? `Available services: ${locTemplate.services.join(', ')}` : null
      ].filter(Boolean).join('\n') : ''
    }),
    normalizeCandidate(state, {
      id: 'relevant-facts',
      title: 'Relevant Known Facts',
      salienceScore: knownFacts(state, relevantFacts).length ? 82 : 0,
      placement: 'inChat',
      depth: 3,
      ttl: 'scene',
      reason: 'Facts whose omission would create continuity or knowledge errors.',
      sourceIds: relevantFacts,
      content: list(knownFacts(state, relevantFacts))
    }),
    normalizeCandidate(state, {
      id: 'relevant-crew',
      title: 'Relevant Crew Context',
      mustInclude: relevantCrewIds.length > 0,
      salienceScore: relevantCrewIds.length ? 78 : 0,
      placement: 'inChat',
      depth: 4,
      ttl: 'scene',
      reason: 'Only crew who are present or causally involved are injected.',
      sourceIds: relevantCrewIds,
      content: relevantCrewIds.map((id) => {
        const officer = crewMap.get(id) || {};
        const relationship = asArray(state?.relationships?.seniorCrew).find((entry) => entry.crewId === id);
        const voiceCue = voiceCueCrewIds.has(id)
          ? renderCompactCrewVoiceCueFromCard(voiceMap.get(id), {
            lineShapeLimit: id === lineShapeCrewId ? 1 : 0
          })
          : '';
        return [
          crewIdentityLine(officer, relationship),
          voiceCue ? `  Voice cue: ${voiceCue}` : null
        ].filter(Boolean).join('\n');
      }).join('\n')
    }),
    normalizeCandidate(state, {
      id: 'active-pressures',
      title: 'Active Pressures',
      salienceScore: visiblePressures(state, relevantPressures).length ? 76 : 0,
      placement: 'inChat',
      depth: 3,
      ttl: 'scene',
      reason: 'Immediate pressures linked to the current scene.',
      sourceIds: relevantPressures,
      content: list(visiblePressures(state, relevantPressures))
    }),
    normalizeCandidate(state, {
      id: 'engaged-threads',
      title: 'Engaged Personal Threads',
      salienceScore: threads.length ? 66 : 0,
      placement: 'inChat',
      depth: 5,
      ttl: 'scene',
      reason: 'Only player-engaged or active threads may shape narration.',
      sourceIds: threads.map((thread) => thread.id),
      content: threads.map((thread) => `- ${thread.title}: ${thread.summary}`).join('\n')
    }),
    normalizeCandidate(state, {
      id: 'ship-status',
      title: 'Relevant Ship Status',
      mustInclude: shipStatusLines(state, packageData).length > 1,
      salienceScore: shipStatusLines(state, packageData).length > 1 ? 64 : 35,
      placement: 'inChat',
      depth: 5,
      ttl: 'scene',
      reason: 'Ship condition is injected only when it has operative content.',
      content: shipStatusLines(state, packageData).join('\n')
    }),
    normalizeCandidate(state, {
      id: 'command-log-continuity',
      title: 'Recent Committed Continuity',
      salienceScore: recentCommandLog(state).length ? 58 : 0,
      placement: 'inChat',
      depth: 5,
      ttl: 'scene',
      reason: 'A bounded recap prevents contradictions without replaying the full log.',
      content: list(recentCommandLog(state))
    }),
    normalizeCandidate(state, {
      id: 'nearby-opportunities',
      title: 'Nearby Optional Work',
      salienceScore: !questId && availableQuests.length ? 52 : 18,
      placement: 'inChat',
      depth: 7,
      ttl: 'location',
      reason: 'Optional opportunities appear only during open-operation scenes.',
      sourceIds: availableQuests.map((questEntry) => questEntry.id),
      content: !questId ? availableQuests.map((questEntry) => `- ${questEntry.title}: ${questEntry.playerSummary}`).join('\n') : ''
    }),
    normalizeCandidate(state, {
      id: 'main-arc-orientation',
      title: 'Long-Range Campaign Orientation',
      salienceScore: scene.requiresArcOrientation ? 62 : 22,
      placement: 'inChat',
      depth: 8,
      ttl: 'chapter',
      reason: 'Long-range orientation is omitted unless the scene depends on it.',
      content: scene.requiresArcOrientation ? [
        packageData?.storyArcs?.campaign?.playerBrief || packageData?.storyArcs?.campaign?.highConcept || '',
        `Current main-arc stage: ${asArray(state?.storyArcLedger?.arcs).find((arc) => arc.id === 'arc-pale-lantern')?.stageId || 'opening'}`
      ].filter(Boolean).join('\n') : ''
    })
  ].filter(Boolean);
}

function budgetPolicy(packageData) {
  const policy = packageData?.contextPolicy || {};
  return {
    totalTokens: Number(policy.budgets?.narratorTotalTokens ?? 1800),
    immediateTokens: Number(policy.budgets?.immediateTokens ?? 750),
    continuityTokens: Number(policy.budgets?.continuityTokens ?? 700),
    regionalTokens: Number(policy.budgets?.regionalTokens ?? 350),
    maxBlocks: Number(policy.budgets?.maxBlocks ?? 8)
  };
}

function tier(candidate) {
  if (candidate.mustInclude || candidate.depth <= 2) return 'immediate';
  if (candidate.depth <= 5) return 'continuity';
  return 'regional';
}

export function selectContextCandidates(candidates, policy) {
  const selected = [];
  const omitted = [];
  const used = { total: 0, immediate: 0, continuity: 0, regional: 0 };
  const seenHashes = new Set();
  const sorted = [...candidates].sort((a, b) => Number(b.mustInclude) - Number(a.mustInclude)
    || b.salienceScore - a.salienceScore
    || a.tokenEstimate - b.tokenEstimate);

  for (const candidate of sorted) {
    const group = tier(candidate);
    const groupLimit = policy[`${group}Tokens`];
    const wouldOverflow = used.total + candidate.tokenEstimate > policy.totalTokens
      || used[group] + candidate.tokenEstimate > groupLimit
      || selected.length >= policy.maxBlocks;
    if (seenHashes.has(candidate.hash)) {
      omitted.push({ ...candidate, omissionReason: 'duplicate-content' });
      continue;
    }
    if (wouldOverflow && !candidate.mustInclude) {
      omitted.push({ ...candidate, omissionReason: 'token-budget' });
      continue;
    }
    selected.push(candidate);
    seenHashes.add(candidate.hash);
    used.total += candidate.tokenEstimate;
    used[group] += candidate.tokenEstimate;
  }
  return { selected, omitted, used };
}

function toHostBlock(state, candidate) {
  const normalized = assertHostPromptBlockSafeForInjection({
    id: candidate.id,
    title: candidate.title,
    audience: 'narratorSafe',
    source: candidate.source,
    priority: candidate.priority,
    content: candidate.content,
    safety: candidate.safety
  });
  return {
    ...normalized,
    content: normalized.text,
    promptKey: candidate.promptKey || promptKeyForCandidateId(candidate.id),
    mustInclude: candidate.mustInclude === true,
    placement: candidate.placement,
    depth: candidate.depth,
    role: candidate.role,
    ttl: candidate.ttl,
    salienceScore: candidate.salienceScore,
    tokenEstimate: candidate.tokenEstimate,
    lensPromptBudgetLane: candidate.lensPromptBudgetLane,
    sourceIds: cloneJson(candidate.sourceIds),
    reason: candidate.reason,
    hash: candidate.hash,
    contentHash: candidate.hash
  };
}

export function buildContextPlan({
  campaignState,
  packageData,
  crewDataset = null,
  scene = {},
  recentMessageSummary = null,
  createdAt = null
} = {}) {
  if (!campaignState || typeof campaignState !== 'object') throw new Error('campaignState must be an object.');
  const policy = budgetPolicy(packageData);
  const candidates = buildCandidates({
    state: campaignState,
    packageData,
    crewDataset,
    scene,
    recentMessageSummary
  });
  const selection = selectContextCandidates(candidates, policy);
  const blocks = selection.selected.map((candidate) => toHostBlock(campaignState, candidate));
  const text = blocks.map((block) => `[Directive: ${block.title}]\n${block.content}`).join('\n\n');
  const priorRevision = promptRevisionAuthority(campaignState);
  return {
    kind: 'directive.contextPlan',
    audience: 'narratorSafe',
    campaignId: campaignState.campaign?.id || null,
    revision: Math.max(sourceRevision(campaignState), priorRevision) + 1,
    createdAt,
    budget: policy,
    usage: selection.used,
    blocks,
    omitted: selection.omitted.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      salienceScore: candidate.salienceScore,
      tokenEstimate: candidate.tokenEstimate,
      lensPromptBudgetLane: candidate.lensPromptBudgetLane,
      omissionReason: candidate.omissionReason
    })),
    text,
    hash: hashText(text),
    contentHash: hashText(text),
    safety: {
      rawHiddenValuesExposed: false,
      directorOnlyDataIncluded: false
    }
  };
}

export function recordContextPlan(state, plan, { installedAt = null, status = 'active' } = {}) {
  return applyLensPromptRevisionRecord(state, createLensPromptRevisionRecord({
    packet: {
      revision: plan.revision,
      hash: plan.hash,
      blocks: plan.blocks
    },
    status,
    installedAt
  }));
}

export const __contextOrchestratorTestHooks = Object.freeze({
  estimateTokens,
  hashText,
  buildCandidates,
  budgetPolicy,
  tier
});
