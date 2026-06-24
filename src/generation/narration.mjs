import {
  directiveNarrationContextSummary,
  normalizeDirectiveNarrationContext
} from './narration-context.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function compactJson(value) {
  return JSON.stringify(value ?? null, null, 2);
}

function compactText(value, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function playerIdentity(campaignState) {
  const player = campaignState.player || {};
  return {
    id: compactText(player.id || 'player-character'),
    name: compactText(player.name || 'the player character'),
    rank: compactText(player.rank || 'Commander'),
    billet: compactText(player.billet || player.role || 'Executive Officer'),
    shipName: compactText(player.shipName || campaignState.ship?.name || '')
  };
}

function crewRecordIdentity(record) {
  const id = compactText(record?.id || record?.crewId || '', 120);
  const name = compactText(record?.name || '', 160);
  if (!id && !name) return null;
  return {
    id: id || name,
    name: name || id,
    rank: compactText(record?.rank || '', 80) || null,
    billet: compactText(record?.billet || record?.role || '', 120) || null,
    packageRole: compactText(record?.packageRole || '', 180) || null
  };
}

function crewIdentityMap({ packageData = null, crewDataset = null } = {}) {
  const map = new Map();
  for (const record of array(packageData?.crew?.senior)) {
    const identity = crewRecordIdentity(record);
    if (identity) map.set(identity.id, identity);
  }
  for (const record of array(crewDataset?.officers)) {
    const identity = crewRecordIdentity(record);
    if (identity && !map.has(identity.id)) map.set(identity.id, identity);
  }
  return map;
}

function knownCrewIdentity({ campaignState, turnPacket, packageData = null, crewDataset = null } = {}) {
  const identities = crewIdentityMap({ packageData, crewDataset });
  const player = playerIdentity(campaignState || {});
  if (player.id) {
    identities.set(player.id, {
      id: player.id,
      name: player.name,
      rank: player.rank,
      billet: player.billet,
      packageRole: 'Player command character'
    });
  }

  const presentIds = array(turnPacket?.sceneSnapshot?.presentCharacters).filter(Boolean);
  const seniorIds = array(campaignState?.crew?.seniorCrewIds).filter(Boolean);
  const preferredIds = [...new Set([...presentIds, ...seniorIds])];
  const records = (preferredIds.length ? preferredIds : [...identities.keys()])
    .map((id) => identities.get(id))
    .filter(Boolean);
  return records.slice(0, 16);
}

const GENERIC_HOST_ENTITY_NAMES = new Set([
  'assistant',
  'character',
  'group',
  'narrator',
  'user'
]);

function forbiddenHostPersonaTerms(campaignState) {
  const hostName = compactText(campaignState.campaignChatBinding?.entityName || '', 160);
  if (!hostName || GENERIC_HOST_ENTITY_NAMES.has(hostName.toLowerCase())) return [];
  const player = playerIdentity(campaignState);
  const playerName = player.name.toLowerCase();
  const terms = new Set([hostName]);
  const parts = hostName.split(/\s+/).filter((part) => part.length > 2);
  if (parts.length > 1) terms.add(parts.at(-1));
  return [...terms]
    .map((term) => compactText(term, 80))
    .filter((term) => term && !playerName.includes(term.toLowerCase()));
}

function hostShellIsolation(campaignState) {
  const terms = forbiddenHostPersonaTerms(campaignState);
  return {
    active: terms.length > 0,
    rule: 'The SillyTavern host character/persona is a transport shell only. It is not the player officer, narrator, captain, or campaign actor unless named in campaign state.',
    playerReference: 'Use Player Identity for the player officer. Do not infer identity from the host chat character.',
    forbiddenPlayerNames: terms
  };
}

function latestCommandLogEntry(campaignState, outcomeId) {
  return array(campaignState.commandLog?.entries).find((entry) => entry.sourceOutcomeId === outcomeId) || null;
}

export function composeNarrationPrompt({ campaignState, turnPacket, packageData = null, crewDataset = null }) {
  requireObject(campaignState, 'campaignState');
  requireObject(turnPacket, 'turnPacket');
  const outcome = turnPacket.outcomePacket || {};
  const narratorPacket = turnPacket.narratorPacket || {};
  const commandLog = latestCommandLogEntry(campaignState, outcome.id) || turnPacket.commandLogPacket || {};
  const identity = playerIdentity(campaignState);
  const crewIdentity = knownCrewIdentity({ campaignState, turnPacket, packageData, crewDataset });
  const shellIsolation = hostShellIsolation(campaignState);
  const narrationContext = normalizeDirectiveNarrationContext(turnPacket.narrationContext || null, {
    roleId: 'narration'
  });
  const narrationContextMeta = directiveNarrationContextSummary(narrationContext, { roleId: 'narration' });
  const styleContract = [
    'Narration perspective contract:',
    narrationContext.instructions,
    '',
    `Resolved perspective: ${narrationContext.perspective}`,
    `Perspective source: ${narrationContext.source}${narrationContext.activePresetName ? ` (${narrationContext.activePresetName})` : ''}`,
    narrationContext.reason ? `Source note: ${narrationContext.reason}` : ''
  ].filter(Boolean).join('\n');
  const system = [
    'You are the Directive narrator for a Star Trek command RPG.',
    'Narrate only the committed outcome. Do not reroll mechanics, add new state changes, expose hidden values, or reveal Director-only information.',
    'The Player Identity section is authoritative for the player officer. Ignore any SillyTavern host character/persona that conflicts with it.',
    'Use exact names and billets from Known Crew Identity. Do not invent surnames, rename crew, or merge two officers. If a referenced officer is not listed, describe that person by billet or station instead of inventing a name.',
    'Use normal prose suitable for SillyTavern roleplay. Keep the result grounded in the provided constraints.',
    '',
    'This model call happens outside normal host preset assembly, so apply the narration perspective contract below explicitly.',
    styleContract
  ].join('\n');
  const user = [
    `Outcome: ${outcome.id}`,
    `Result Band: ${outcome.resultBand || 'Unknown'}`,
    `Committed Summary: ${outcome.summary || 'No summary provided.'}`,
    '',
    'Player Identity:',
    compactJson(identity),
    '',
    'Host Shell Isolation:',
    compactJson(shellIsolation),
    '',
    'Known Crew Identity:',
    compactJson(crewIdentity),
    '',
    'Narrator Packet:',
    compactJson(narratorPacket),
    '',
    'Visible Command Log Continuity:',
    compactJson({
      summaryInputs: commandLog.summaryInputs || [],
      visibleConsequences: commandLog.visibleConsequences || []
    }),
    '',
    'Scene Snapshot:',
    compactJson(turnPacket.sceneSnapshot || {}),
    '',
    'Write the next narration response now.'
  ].join('\n');
  return {
    kind: 'directive.narrationPrompt',
    sourceOutcomeId: requireNonEmptyString(narratorPacket.sourceOutcomeId || outcome.id, 'sourceOutcomeId'),
    prompt: `${system}\n\n${user}`,
    systemPrompt: system,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    rawHiddenValuesExposed: narratorPacket.rawHiddenValuesExposed === true,
    directorOnlyDataIncluded: narratorPacket.directorOnlyDataIncluded === true,
    narrationContext: narrationContextMeta
  };
}

function normalizeNarrationText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value?.text === 'string') return value.text.trim();
  if (typeof value?.content === 'string') return value.content.trim();
  if (typeof value?.message === 'string') return value.message.trim();
  if (typeof value?.choices?.[0]?.message?.content === 'string') return value.choices[0].message.content.trim();
  if (typeof value?.choices?.[0]?.text === 'string') return value.choices[0].text.trim();
  return '';
}

export async function generateNarrationFromTurn({
  campaignState,
  turnPacket,
  provider,
  narrationContext = null,
  packageData = null,
  crewDataset = null,
  now = null
}) {
  requireObject(provider, 'provider');
  if (typeof provider.generateNarration !== 'function') {
    throw new Error('provider must provide generateNarration(request)');
  }
  const prompt = composeNarrationPrompt({
    campaignState,
    turnPacket: {
      ...turnPacket,
      narrationContext: narrationContext || turnPacket.narrationContext || null
    },
    packageData,
    crewDataset
  });
  if (prompt.rawHiddenValuesExposed || prompt.directorOnlyDataIncluded) {
    throw new Error('Narrator packet is not safe for provider narration.');
  }
  const generatedAt = typeof now === 'function' ? now() : (now || new Date().toISOString());
  const response = await provider.generateNarration({
    prompt: prompt.prompt,
    systemPrompt: prompt.systemPrompt,
    messages: cloneJson(prompt.messages),
    sourceOutcomeId: prompt.sourceOutcomeId,
    narrationContext: cloneJson(prompt.narrationContext),
    narratorPacket: cloneJson(turnPacket.narratorPacket),
    outcomePacket: cloneJson(turnPacket.outcomePacket)
  });
  const text = normalizeNarrationText(response);
  if (!text) {
    throw new Error('Narration provider returned empty text.');
  }
  return {
    kind: 'directive.narrationResult',
    sourceOutcomeId: prompt.sourceOutcomeId,
    generatedAt,
    providerId: response?.providerId || provider.id || 'unknown',
    text
  };
}
