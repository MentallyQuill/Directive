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

function latestCommandLogEntry(campaignState, outcomeId) {
  return (campaignState.commandLog?.entries || []).find((entry) => entry.sourceOutcomeId === outcomeId) || null;
}

export function composeNarrationPrompt({ campaignState, turnPacket }) {
  requireObject(campaignState, 'campaignState');
  requireObject(turnPacket, 'turnPacket');
  const outcome = turnPacket.outcomePacket || {};
  const narratorPacket = turnPacket.narratorPacket || {};
  const commandLog = latestCommandLogEntry(campaignState, outcome.id) || turnPacket.commandLogPacket || {};
  const system = [
    'You are the Directive narrator for a Star Trek command RPG.',
    'Narrate only the committed outcome. Do not reroll mechanics, add new state changes, expose hidden values, or reveal Director-only information.',
    'Use normal prose suitable for SillyTavern roleplay. Keep the result grounded in the provided constraints.'
  ].join('\n');
  const user = [
    `Outcome: ${outcome.id}`,
    `Result Band: ${outcome.resultBand || 'Unknown'}`,
    `Committed Summary: ${outcome.summary || 'No summary provided.'}`,
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
