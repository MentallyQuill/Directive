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
  return (campaignState.commandLog?.entries || []).find((entry) => entry.sourceOutcomeId === outcomeId) || null;
}

export function composeNarrationPrompt({ campaignState, turnPacket }) {
  requireObject(campaignState, 'campaignState');
  requireObject(turnPacket, 'turnPacket');
  const outcome = turnPacket.outcomePacket || {};
  const narratorPacket = turnPacket.narratorPacket || {};
  const commandLog = latestCommandLogEntry(campaignState, outcome.id) || turnPacket.commandLogPacket || {};
  const identity = playerIdentity(campaignState);
  const shellIsolation = hostShellIsolation(campaignState);
  const system = [
    'You are the Directive narrator for a Star Trek command RPG.',
    'Narrate only the committed outcome. Do not reroll mechanics, add new state changes, expose hidden values, or reveal Director-only information.',
    'The Player Identity section is authoritative for the player officer. Ignore any SillyTavern host character/persona that conflicts with it.',
    'Use normal prose suitable for SillyTavern roleplay. Keep the result grounded in the provided constraints.'
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
    directorOnlyDataIncluded: narratorPacket.directorOnlyDataIncluded === true
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
  now = null
}) {
  requireObject(provider, 'provider');
  if (typeof provider.generateNarration !== 'function') {
    throw new Error('provider must provide generateNarration(request)');
  }
  const prompt = composeNarrationPrompt({ campaignState, turnPacket });
  if (prompt.rawHiddenValuesExposed || prompt.directorOnlyDataIncluded) {
    throw new Error('Narrator packet is not safe for provider narration.');
  }
  const generatedAt = typeof now === 'function' ? now() : (now || new Date().toISOString());
  const response = await provider.generateNarration({
    prompt: prompt.prompt,
    systemPrompt: prompt.systemPrompt,
    messages: cloneJson(prompt.messages),
    sourceOutcomeId: prompt.sourceOutcomeId,
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
