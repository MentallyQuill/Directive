import {
  directiveNarrationContextSummary,
  normalizeDirectiveNarrationContext,
} from './narration-context.mjs';
import { renderNarratorVoiceCues } from './crew-voice-capsules.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function compact(value, maxLength = 360) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : text.slice(0, maxLength).trim();
}

function playerIdentity(campaignState = {}) {
  const player = campaignState.player || {};
  return {
    id: compact(player.id || 'player-commander', 120),
    name: compact(player.name || 'the player character', 160),
    rank: compact(player.rank || 'Commander', 80),
    billet: compact(player.billet || 'Executive Officer', 120),
    shipName: compact(campaignState.ship?.name || '', 160),
  };
}

function knownCrew(campaignState = {}, crewDataset = {}) {
  const allowed = new Set([
    ...(campaignState.crew?.seniorCrewIds || []),
    ...(campaignState.captainState?.crewId ? [campaignState.captainState.crewId] : []),
  ]);
  return (crewDataset.officers || [])
    .filter((officer) => allowed.has(officer.id))
    .map((officer) => ({
      id: officer.id,
      name: officer.name,
      rank: officer.rank || null,
      billet: officer.billet || null,
    }));
}

function normalizeNarrationText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value?.text === 'string') return value.text.trim();
  if (typeof value?.content === 'string') return value.content.trim();
  if (typeof value?.message === 'string') return value.message.trim();
  if (typeof value?.choices?.[0]?.message?.content === 'string') return value.choices[0].message.content.trim();
  return '';
}

export function composeNarrationPrompt({
  campaignState,
  turnPacket,
  crewDataset = null,
  playerProjection = null,
  storyPromptProjection = null,
} = {}) {
  requireObject(campaignState, 'campaignState');
  requireObject(turnPacket, 'turnPacket');
  if (turnPacket.kind !== 'directive.v1NarrationTurn') {
    throw new TypeError('turnPacket must be a directive.v1NarrationTurn');
  }
  const narratorPacket = turnPacket.narratorPacket || {};
  if (narratorPacket.sourceTurnId !== turnPacket.turnId) {
    throw new TypeError('narratorPacket.sourceTurnId must match turnPacket.turnId');
  }
  const narrationContext = normalizeDirectiveNarrationContext(turnPacket.narrationContext || null, {
    roleId: 'narration',
  });
  const narrationContextMeta = directiveNarrationContextSummary(narrationContext, { roleId: 'narration' });
  const voiceCues = renderNarratorVoiceCues({
    crewDataset,
    allowedCardIds: narratorPacket.allowedCardIds,
    options: { includeContradiction: true, includeAvoid: true, lineShapeLimit: 1 },
  });
  const systemPrompt = [
    'You are the Directive narrator for a story-first command RPG.',
    'Write only the next provisional roleplay response to the player input.',
    'Only the supplied accepted V1 state is canon. Do not invent completed objectives, hidden discoveries, rewards, relationship changes, ship issues, clocks, or other tracked state.',
    'This response becomes accepted source material only if the player sends their next message without replacing it by a swipe.',
    'Respect the exact player and crew identities. Do not rename, merge, or invent named officers.',
    narrationContext.instructions,
  ].filter(Boolean).join('\n');
  const userPayload = {
    playerIdentity: playerIdentity(campaignState),
    knownCrew: knownCrew(campaignState, crewDataset || {}),
    narratorSafeVoiceCues: voiceCues,
    acceptedPlayerProjection: cloneJson(playerProjection),
    acceptedStoryContext: cloneJson(storyPromptProjection),
    scene: cloneJson(turnPacket.sceneSnapshot),
    arbiterContinuity: cloneJson(turnPacket.arbiterPlan?.sceneContinuity || null),
    narrationGuidance: cloneJson(narratorPacket.guidance || []),
  };
  const user = `Continue the scene from this V1 narration packet:\n${JSON.stringify(userPayload, null, 2)}`;
  return {
    kind: 'directive.v1NarrationPrompt',
    sourceTurnId: turnPacket.turnId,
    prompt: `${systemPrompt}\n\n${user}`,
    systemPrompt,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: user },
    ],
    narrationContext: narrationContextMeta,
  };
}

export async function generateNarrationFromTurn({
  campaignState,
  turnPacket,
  provider,
  narrationContext = null,
  crewDataset = null,
  playerProjection = null,
  storyPromptProjection = null,
  now = null,
  onGenerationStart = null,
} = {}) {
  requireObject(provider, 'provider');
  if (typeof provider.generateNarration !== 'function') {
    throw new TypeError('provider must provide generateNarration(request)');
  }
  const packet = {
    ...turnPacket,
    narrationContext: narrationContext || turnPacket.narrationContext || null,
  };
  const prompt = composeNarrationPrompt({
    campaignState,
    turnPacket: packet,
    crewDataset,
    playerProjection,
    storyPromptProjection,
  });
  const generatedAt = typeof now === 'function' ? now() : (now || new Date().toISOString());
  if (typeof onGenerationStart === 'function') {
    onGenerationStart({
      generatedAt,
      directiveGenerationStartedAt: generatedAt,
      sourceTurnId: prompt.sourceTurnId,
      providerId: provider.id || 'unknown',
    });
  }
  const response = await provider.generateNarration({
    prompt: prompt.prompt,
    systemPrompt: prompt.systemPrompt,
    messages: cloneJson(prompt.messages),
    sourceTurnId: prompt.sourceTurnId,
    narrationContext: cloneJson(prompt.narrationContext),
    narratorPacket: cloneJson(packet.narratorPacket),
  });
  const text = normalizeNarrationText(response);
  if (!text) throw new Error('Narration provider returned empty text.');
  return {
    kind: 'directive.v1NarrationResult',
    sourceTurnId: prompt.sourceTurnId,
    generatedAt,
    directiveGenerationStartedAt: generatedAt,
    providerId: response?.providerId || provider.id || 'unknown',
    text,
  };
}
