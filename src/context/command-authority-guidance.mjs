function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function compact(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

const PLAYER_AUTHORITY_MODES = new Set([
  'xo',
  'delegated-xo',
  'mission-commander',
  'acting-captain',
  'captain',
  'uncertain'
]);

const DELEGATION_SCOPES = new Set([
  'none',
  'recommendation',
  'routine-execution',
  'bounded-decision',
  'conn',
  'acting-command',
  'full-command'
]);

const COMMANDER_PRESENCE_VALUES = new Set([
  'present',
  'offscreen',
  'absent',
  'incapacitated',
  'dead',
  'missing',
  'quarantined',
  'under-inquiry',
  'unknown'
]);

const COMMANDER_STATUS_VALUES = new Set([
  'active',
  'limited-duty',
  'unavailable',
  'relieved',
  'deceased',
  'missing',
  'under-review',
  'unknown'
]);

function enumValue(value, allowed, fallback) {
  const normalized = compact(value);
  return allowed.has(normalized) ? normalized : fallback;
}

function actorLabel(actor = {}, fallback = '') {
  const rank = compact(actor.rank);
  const name = compact(actor.name || actor.characterName || actor.id || fallback);
  if (!name) return fallback;
  if (rank && !name.toLowerCase().startsWith(`${rank.toLowerCase()} `)) return `${rank} ${name}`;
  return name;
}

function playerProfile(campaignState = {}, packageData = {}) {
  campaignState = asObject(campaignState);
  packageData = asObject(packageData);
  const player = campaignState.player || {};
  const lockedRole = packageData.characterCreation?.lockedRole || {};
  const commandStructure = packageData.ship?.commandStructure || {};
  return {
    id: compact(player.id || 'player-commander'),
    name: compact(player.name || player.characterName || 'the player character'),
    rank: compact(player.rank || lockedRole.rank || commandStructure.playerRank || 'Commander'),
    billet: compact(player.billet || lockedRole.billet || commandStructure.playerBillet || 'Executive Officer')
  };
}

function captainProfile(packageData = {}, campaignState = {}) {
  packageData = asObject(packageData);
  campaignState = asObject(campaignState);
  const lockedRole = packageData.characterCreation?.lockedRole || {};
  const commandStructure = packageData.ship?.commandStructure || {};
  const captainId = compact(
    lockedRole.captainId
    || commandStructure.commandingOfficer
    || commandStructure.captainId
    || campaignState.captainState?.crewId
  );
  const seniorCrew = asArray(packageData.crew?.senior);
  const captain = seniorCrew.find((crew) => compact(crew.id) === captainId)
    || seniorCrew.find((crew) => /commanding officer/i.test(compact(crew.billet)))
    || null;
  const rawName = compact(captain?.name || lockedRole.captainName || 'the commanding officer').replace(/^Captain\s+/i, '');
  return {
    id: compact(captain?.id || captainId || 'captain'),
    name: rawName,
    rank: compact(captain?.rank || 'Captain'),
    billet: compact(captain?.billet || 'Commanding Officer')
  };
}

function commandStructureSignals({ campaignState = {}, packageData = {}, scene = {} } = {}) {
  campaignState = asObject(campaignState);
  packageData = asObject(packageData);
  scene = asObject(scene);
  const committed = campaignState.commandAuthority || {};
  const lockedRole = packageData.characterCreation?.lockedRole || {};
  const commandStructure = packageData.ship?.commandStructure || {};
  const packageBoundary = compact(lockedRole.captainAuthorityBoundary);
  const captainStatusText = compact(commandStructure.captainStatus || committed.commanderStatusText || '');
  const openingCondition = compact(packageData.ship?.openingCondition || '');
  const playerRoleRule = compact(packageData.characterCreation?.campaignContext?.playerRoleRule || '');
  const roleLabel = compact(lockedRole.roleLabel || '');
  const commandAuthority = compact(lockedRole.commandAuthority || commandStructure.playerAuthority || commandStructure.playerRole || '');
  const combinedText = `${packageBoundary} ${captainStatusText} ${openingCondition} ${playerRoleRule} ${roleLabel} ${commandAuthority}`.toLowerCase();
  const actingCaptainHint = commandStructure.actingCaptainAfterPrelude === true
    || /acting captain/i.test(roleLabel)
    || /acting command|acting captain|lawful succession/i.test(commandAuthority)
    || /giving the player acting command|player becomes acting captain|confirming the player as acting captain/i.test(playerRoleRule);

  if (committed.playerAuthorityMode) {
    return {
      playerAuthorityMode: enumValue(committed.playerAuthorityMode, PLAYER_AUTHORITY_MODES, 'uncertain'),
      delegationScope: enumValue(committed.delegationScope, DELEGATION_SCOPES, 'none'),
      commanderPresence: enumValue(committed.commanderPresence, COMMANDER_PRESENCE_VALUES, 'unknown'),
      commanderStatus: enumValue(committed.commanderStatus, COMMANDER_STATUS_VALUES, 'unknown')
    };
  }

  if (/dead|death|dies|deceased/.test(combinedText)) {
    return { playerAuthorityMode: 'acting-captain', delegationScope: 'acting-command', commanderPresence: 'dead', commanderStatus: 'deceased' };
  }
  if (/missing|disappear/.test(combinedText)) {
    return { playerAuthorityMode: 'acting-captain', delegationScope: 'acting-command', commanderPresence: 'missing', commanderStatus: 'missing' };
  }
  if (/quarantine|medically unfit|injured|incapacitated|surgery/.test(combinedText)) {
    return { playerAuthorityMode: 'acting-captain', delegationScope: 'acting-command', commanderPresence: 'incapacitated', commanderStatus: 'unavailable' };
  }
  if (/ashore under inquiry|under inquiry|under review/.test(combinedText)) {
    return { playerAuthorityMode: 'acting-captain', delegationScope: 'acting-command', commanderPresence: 'under-inquiry', commanderStatus: 'under-review' };
  }
  if (actingCaptainHint && scene?.captainUnavailable === true) {
    return { playerAuthorityMode: 'acting-captain', delegationScope: 'acting-command', commanderPresence: 'absent', commanderStatus: 'unavailable' };
  }
  if (actingCaptainHint && !/retains final legal command while present/i.test(packageBoundary)) {
    return { playerAuthorityMode: 'acting-captain', delegationScope: 'acting-command', commanderPresence: 'absent', commanderStatus: 'unavailable' };
  }
  return { playerAuthorityMode: 'xo', delegationScope: 'recommendation', commanderPresence: 'present', commanderStatus: 'active' };
}

export function commandAuthorityProfile({ campaignState = {}, packageData = {}, scene = {} } = {}) {
  campaignState = asObject(campaignState);
  packageData = asObject(packageData);
  scene = asObject(scene);
  const player = playerProfile(campaignState, packageData);
  const captain = captainProfile(packageData, campaignState);
  const committed = campaignState.commandAuthority || {};
  const signals = commandStructureSignals({ campaignState, packageData, scene });
  const playerLabel = actorLabel(player, 'the player character');
  const captainLabel = actorLabel(captain, 'the commanding officer');
  const captainActive = signals.commanderStatus === 'active'
    && ['present', 'offscreen'].includes(signals.commanderPresence)
    && !['acting-captain', 'captain'].includes(signals.playerAuthorityMode);
  const commandRecipientId = compact(committed.commandRecipientId)
    || (captainActive ? captain.id : player.id);
  const majorDecisionAuthorityId = compact(committed.majorDecisionAuthorityId)
    || (captainActive ? captain.id : player.id);
  const connHolderId = compact(committed.connHolderId)
    || (captainActive ? captain.id : player.id);
  const commandRecipientLabel = commandRecipientId === player.id ? playerLabel : captainLabel;
  const majorDecisionAuthorityLabel = majorDecisionAuthorityId === player.id ? playerLabel : captainLabel;

  return {
    version: 1,
    player,
    captain,
    playerAgencyTargetId: player.id,
    playerAgencyTargetLabel: playerLabel,
    commandRecipientId,
    commandRecipientLabel,
    majorDecisionAuthorityId,
    majorDecisionAuthorityLabel,
    connHolderId,
    legalCommanderId: compact(committed.legalCommanderId || captain.id),
    operationalCommanderId: compact(committed.operationalCommanderId || commandRecipientId),
    delegationSourceId: compact(committed.delegationSourceId || '') || null,
    delegationScope: enumValue(committed.delegationScope || signals.delegationScope, DELEGATION_SCOPES, 'none'),
    playerAuthorityMode: enumValue(committed.playerAuthorityMode || signals.playerAuthorityMode, PLAYER_AUTHORITY_MODES, 'uncertain'),
    commanderPresence: enumValue(committed.commanderPresence || signals.commanderPresence, COMMANDER_PRESENCE_VALUES, 'unknown'),
    commanderStatus: enumValue(committed.commanderStatus || signals.commanderStatus, COMMANDER_STATUS_VALUES, 'unknown'),
    captainAuthorityBoundary: compact(
      committed.captainAuthorityBoundary
      || packageData.characterCreation?.lockedRole?.captainAuthorityBoundary
      || (packageData.ship?.commandStructure?.captainRetainsFinalAuthority ? 'The commanding officer retains final legal command.' : '')
    ),
    playerAuthoritySummary: compact(
      committed.playerAuthoritySummary
      || campaignState.player?.role
      || packageData.characterCreation?.lockedRole?.commandAuthority
      || packageData.ship?.commandStructure?.playerAuthority
      || packageData.ship?.commandStructure?.playerRole
      || ''
    )
  };
}

export function commandAuthorityPromptLines(input = {}) {
  const profile = commandAuthorityProfile(input);
  const playerIsRecipient = profile.commandRecipientId === profile.playerAgencyTargetId;
  return [
    `Player agency target: ${profile.playerAgencyTargetLabel}, ${profile.player.billet}.`,
    `Command recipient: ${profile.commandRecipientLabel}.`,
    `Major decision authority: ${profile.majorDecisionAuthorityLabel}.`,
    `Player authority mode: ${profile.playerAuthorityMode}; delegation scope: ${profile.delegationScope}.`,
    profile.captainAuthorityBoundary ? `Captain authority boundary: ${profile.captainAuthorityBoundary}` : null,
    playerIsRecipient
      ? 'Crew may route formal status reports and command options to the player unless committed state establishes a temporary substitute.'
      : 'Crew may answer the player character\'s direct questions, but formal bridge reports and major options go to the command recipient.',
    'A captain or lawful commander may delegate a bounded decision, the conn, or acting command; make the delegation explicit in prose.',
    'Do not treat player agency as automatic command authority.'
  ].filter(Boolean);
}

export function commandAuthorityPromptBlock(input = {}) {
  const lines = commandAuthorityPromptLines(input);
  return {
    id: 'command-authority',
    title: 'Command Authority',
    mustInclude: true,
    salienceScore: 100,
    placement: 'inPrompt',
    depth: 0,
    ttl: 'turn',
    priority: 997,
    lensPromptBudgetLane: 'activeScene',
    reason: 'Separates player agency from in-universe command recipient and decision authority.',
    sourceIds: ['command-authority', input.campaignState?.player?.id].filter(Boolean),
    content: lines.map((line) => `- ${line}`).join('\n')
  };
}

export const __commandAuthorityGuidanceTestHooks = Object.freeze({
  PLAYER_AUTHORITY_MODES,
  DELEGATION_SCOPES,
  COMMANDER_PRESENCE_VALUES,
  COMMANDER_STATUS_VALUES,
  commandStructureSignals
});
