import { hiddenTruthTerm } from '../generation/hidden-truth-safety.mjs';
import {
  directiveNarrationContextSummary,
  directiveNarrationPerspectiveMode,
  normalizeDirectiveNarrationContext
} from '../generation/narration-context.mjs';
import { assertProviderResponseText } from '../providers/provider-response-normalizer.mjs';
import { parseStructuredJsonText } from '../providers/structured-output-parser.mjs';

export const DIRECTIVE_ASSIST_ACTIONS = Object.freeze({
  draftInCharacter: {
    id: 'draftInCharacter',
    label: 'Draft In Character',
    tooltip: 'Turn rough intent into editable player-character wording.'
  },
  briefMe: {
    id: 'briefMe',
    label: 'Brief Me',
    tooltip: 'Summarize player-safe context before you send.'
  },
  frameAsOrder: {
    id: 'frameAsOrder',
    label: 'Frame as Order',
    tooltip: "Rewrite as a clear order within the player officer's authority."
  },
  frameAsReport: {
    id: 'frameAsReport',
    label: 'Frame as Report',
    tooltip: 'Rewrite as a formal report or recommendation.'
  }
});

export const DIRECTIVE_ASSIST_ROLE_ID = 'directiveAssist';

const ACTION_ALIASES = Object.freeze({
  draft: 'draftInCharacter',
  draftInCharacter: 'draftInCharacter',
  'draft-in-character': 'draftInCharacter',
  'Draft In Character': 'draftInCharacter',
  brief: 'briefMe',
  briefMe: 'briefMe',
  'brief-me': 'briefMe',
  'Brief Me': 'briefMe',
  order: 'frameAsOrder',
  frameAsOrder: 'frameAsOrder',
  'frame-as-order': 'frameAsOrder',
  'Frame as Order': 'frameAsOrder',
  report: 'frameAsReport',
  frameAsReport: 'frameAsReport',
  'frame-as-report': 'frameAsReport',
  'Frame as Report': 'frameAsReport'
});

const LOW_LATENCY_ASSIST_PARAMETERS = Object.freeze({
  temperature: 0.35,
  max_tokens: 900
});

const ASSIST_MODEL_PREFERENCES = Object.freeze({
  cost: 'balanced',
  latency: 'medium',
  capability: 'authoring-assist'
});

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function compactText(value, maxLength = 700) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function compactList(values = [], maxItems = 6, maxLength = 220) {
  return asArray(values)
    .map((value) => compactText(typeof value === 'string' ? value : value?.summary || value?.title || value?.id || '', maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function stripQuotedSpeech(value = '') {
  return String(value || '')
    .replace(/"([^"\\]|\\.)*"/g, ' ')
    .replace(/“[^”]*”/g, ' ');
}

function hasUnquotedFirstPerson(value = '') {
  return /\b(?:I|I['’](?:m|ve|d|ll)|me|my|mine|myself)\b/i.test(stripQuotedSpeech(value));
}

function sentenceFrom(value, fallback) {
  const text = compactText(value, 420);
  if (text) return text;
  return fallback;
}

function normalizeStringArray(values = [], maxItems = 6, maxLength = 240) {
  return asArray(values)
    .map((value) => compactText(value, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function similarityTokens(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function tokenOverlap(sourceTokens = [], candidateTokens = []) {
  if (sourceTokens.length === 0 || candidateTokens.length === 0) return 0;
  const candidateSet = new Set(candidateTokens);
  return sourceTokens.filter((token) => candidateSet.has(token)).length / sourceTokens.length;
}

function isNearEchoDraft(source = '', candidate = '') {
  const sourceText = compactText(source, 2200).toLowerCase();
  const candidateText = compactText(candidate, 2200).toLowerCase();
  if (!sourceText || !candidateText) return false;
  if (sourceText === candidateText) return true;
  if (sourceText.length < 18 || candidateText.length < 18) return false;
  const lengthRatio = Math.min(sourceText.length, candidateText.length) / Math.max(sourceText.length, candidateText.length);
  if (lengthRatio < 0.72) return false;
  const sourceTokens = similarityTokens(sourceText);
  const candidateTokens = similarityTokens(candidateText);
  if (sourceTokens.length < 5 || candidateTokens.length < 5) return false;
  return tokenOverlap(sourceTokens, candidateTokens) >= 0.82
    && tokenOverlap(candidateTokens, sourceTokens) >= 0.7;
}

function assertUsefulAssistDraft({ action, rawInput = '', replacementText = '' } = {}) {
  if (normalizeDirectiveAssistAction(action) === 'briefMe') return;
  if (!isNearEchoDraft(rawInput, replacementText)) return;
  const error = new Error('Provider draft was too close to the original input to be useful.');
  error.code = 'provider_echo_draft';
  throw error;
}

function assertPerspectiveCompatibleDraft({
  action,
  rawInput = '',
  replacementText = '',
  narrationContext = null
} = {}) {
  if (normalizeDirectiveAssistAction(action) === 'briefMe') return;
  if (directiveNarrationPerspectiveMode(narrationContext) !== 'third-person') return;
  if (!hasUnquotedFirstPerson(replacementText) || hasUnquotedFirstPerson(rawInput)) return;
  const error = new Error('Provider draft changed a third-person/default-perspective player draft into unquoted first person.');
  error.code = 'provider_pov_shift';
  throw error;
}

function unescapeLooseJsonString(value) {
  return String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim();
}

function looseJsonField(text, field) {
  const source = String(text || '');
  const match = new RegExp(`["']${field}["']\\s*:`).exec(source);
  if (!match) return '';
  let rest = source.slice(match.index + match[0].length).trimStart();
  if (rest.startsWith('"') || rest.startsWith("'")) rest = rest.slice(1);
  const stopMarkers = [
    '\n  "brief"',
    '\n  "notes"',
    '\n  "warnings"',
    '\n  "usedContext"',
    '\n  "action"',
    '\n  "title"',
    '\n  "replacementText"',
    '\n}',
    '\r\n  "brief"',
    '\r\n  "notes"',
    '\r\n  "warnings"',
    '\r\n  "usedContext"',
    '\r\n}'
  ];
  const stops = stopMarkers
    .map((marker) => rest.indexOf(marker))
    .filter((index) => index >= 0);
  const raw = stops.length > 0 ? rest.slice(0, Math.min(...stops)) : rest;
  return unescapeLooseJsonString(raw.replace(/["',}\s]+$/g, ''));
}

function parseLooseDirectiveAssistText(text, { allowPlainText = true } = {}) {
  const source = String(text || '').trim();
  if (!source) return {};
  const replacementText = looseJsonField(source, 'replacementText')
    || looseJsonField(source, 'draft')
    || looseJsonField(source, 'text')
    || (allowPlainText && !source.startsWith('{') ? compactText(source, 1600) : '');
  const summary = looseJsonField(source, 'summary');
  if (!replacementText && !summary) return {};
  return {
    action: looseJsonField(source, 'action'),
    title: looseJsonField(source, 'title'),
    replacementText,
    brief: summary ? { summary } : null,
    notes: ['Recovered a usable provider draft from malformed JSON.'],
    warnings: ['Provider output was not strict JSON; review before applying.'],
    usedContext: ['provider recovered text']
  };
}

export function normalizeDirectiveAssistAction(action) {
  const value = String(action || '').trim();
  const normalized = ACTION_ALIASES[value] || ACTION_ALIASES[value.replace(/\s+/g, '-').toLowerCase()] || value;
  if (!DIRECTIVE_ASSIST_ACTIONS[normalized]) {
    throw new Error(`Unknown Directive Assist action "${value || 'unknown'}".`);
  }
  return normalized;
}

function resolvePlayerProfile({ campaignState = null, packageData = null } = {}) {
  const player = campaignState?.player || {};
  const lockedRole = packageData?.characterCreation?.lockedRole || {};
  const commandStructure = packageData?.ship?.commandStructure || {};
  const name = compactText(player.name || 'the player character', 120);
  const rank = compactText(player.rank || lockedRole.rank || commandStructure.playerRank || '', 80);
  const billet = compactText(player.billet || lockedRole.billet || commandStructure.playerBillet || '', 120);
  const role = compactText(player.role || lockedRole.commandAuthority || commandStructure.playerRole || lockedRole.roleLabel || '', 220);
  const shipName = compactText(player.shipName || lockedRole.shipName || packageData?.ship?.name || campaignState?.ship?.name || '', 120);
  const traits = player.personality?.traits || {};
  const voiceHints = [
    player.firstImpression,
    player.dossier?.identitySummary,
    player.dossier?.publicReputation,
    player.personality?.additionalGenerationNote,
    player.adjudicationProfile?.traits?.join(', '),
    traits.insight?.selectedLabel,
    traits.connection?.selectedLabel,
    traits.execution?.selectedLabel
  ].map((value) => compactText(value, 180)).filter(Boolean).slice(0, 6);

  return {
    id: player.id || 'player-character',
    name,
    rank,
    billet,
    role,
    pronounsOrAddress: compactText(player.pronounsOrAddress || '', 80),
    species: compactText(player.species?.label || player.species || '', 80),
    shipName,
    voiceHints
  };
}

function resolveAuthorityProfile({ campaignState = null, packageData = null } = {}) {
  const lockedRole = packageData?.characterCreation?.lockedRole || {};
  const commandStructure = packageData?.ship?.commandStructure || {};
  const captainId = lockedRole.captainId || commandStructure.commandingOfficer || null;
  const seniorCrew = asArray(packageData?.crew?.senior);
  const captain = seniorCrew.find((crew) => crew.id === captainId)
    || seniorCrew.find((crew) => /commanding officer/i.test(String(crew?.billet || '')))
    || null;
  return {
    roleMode: packageData?.characterCreation?.roleMode || campaignState?.player?.roleMode || null,
    rank: compactText(campaignState?.player?.rank || lockedRole.rank || commandStructure.playerRank || '', 80),
    billet: compactText(campaignState?.player?.billet || lockedRole.billet || commandStructure.playerBillet || '', 120),
    authority: compactText(campaignState?.player?.role || lockedRole.commandAuthority || commandStructure.playerRole || '', 260),
    captainName: compactText(lockedRole.captainName || (captain ? `${captain.rank || ''} ${captain.name || ''}`.trim() : ''), 120),
    captainAuthorityBoundary: compactText(lockedRole.captainAuthorityBoundary || (
      commandStructure.captainRetainsFinalAuthority
        ? 'The commanding officer retains final legal command.'
        : ''
    ), 260)
  };
}

function resolveVisibleStaff({ packageData = null, crewDataset = null } = {}) {
  const fromPackage = asArray(packageData?.crew?.senior)
    .filter((crew) => crew?.id !== 'player-commander')
    .map((crew) => ({
      id: compactText(crew.id, 120),
      name: compactText(crew.name, 120),
      rank: compactText(crew.rank, 80),
      billet: compactText(crew.billet || crew.packageRole, 160)
    }));
  const byId = new Map(fromPackage.map((crew) => [crew.id, crew]));
  for (const officer of asArray(crewDataset?.officers)) {
    if (!officer?.id || byId.has(officer.id) || officer.id === 'player-commander') continue;
    byId.set(officer.id, {
      id: compactText(officer.id, 120),
      name: compactText(officer.name, 120),
      rank: '',
      billet: compactText(officer.billet, 160)
    });
  }
  return [...byId.values()].filter((crew) => crew.id && crew.name).slice(0, 10);
}

function resolveBriefFacts(campaignState = {}) {
  const mission = campaignState.mission || {};
  const knownFacts = asArray(mission.knownFacts).map((fact) => (
    typeof fact === 'string'
      ? fact
      : fact?.summary || fact?.title || fact?.id
  ));
  const objectives = asArray(mission.formalObjectives);
  const pressures = asArray(campaignState.pressureLedger?.records)
    .filter((record) => record?.visibleToPlayer !== false)
    .map((record) => record.playerSummary || record.title || record.id);
  const commandLog = asArray(campaignState.commandLog?.entries)
    .slice(-3)
    .map((entry) => ({
      id: compactText(entry.id || entry.sourceOutcomeId, 120),
      summaryInputs: compactList(entry.summaryInputs || [], 4, 160),
      visibleConsequences: compactList(entry.visibleConsequences || [], 4, 160),
      summary: compactText(entry.summary || entry.assistedSummary?.summary || '', 220)
    }));

  return {
    objectives: compactList(objectives, 4, 180),
    knownFacts: compactList(knownFacts, 6, 180),
    pressures: compactList(pressures, 5, 180),
    recentCommandLog: commandLog
  };
}

export function createDirectiveAssistSnapshot({
  action,
  inputText = '',
  campaignState = null,
  packageData = null,
  crewDataset = null,
  missionGraph = null,
  narrationContext = null
} = {}) {
  const actionId = normalizeDirectiveAssistAction(action);
  const player = resolvePlayerProfile({ campaignState, packageData });
  const authority = resolveAuthorityProfile({ campaignState, packageData });
  const facts = resolveBriefFacts(campaignState || {});
  const narration = normalizeDirectiveNarrationContext(narrationContext, {
    roleId: DIRECTIVE_ASSIST_ROLE_ID
  });
  return {
    kind: 'directive.directiveAssistSnapshot',
    action: actionId,
    label: DIRECTIVE_ASSIST_ACTIONS[actionId].label,
    rawInput: compactText(inputText, 1600),
    narration,
    player,
    authority,
    campaign: {
      title: compactText(
        campaignState?.campaign?.title
          || packageData?.manifest?.title
          || packageData?.storyArcs?.campaign?.title
          || '',
        160
      ),
      stardate: campaignState?.campaign?.currentStardate ?? campaignState?.campaign?.openingStardate ?? packageData?.ship?.openingStardate ?? null,
      simulationMode: compactText(campaignState?.settings?.simulationMode || '', 80)
    },
    ship: {
      name: compactText(campaignState?.ship?.name || packageData?.ship?.name || player.shipName || '', 120),
      class: compactText(campaignState?.ship?.class || packageData?.ship?.class || '', 120)
    },
    mission: {
      activeMissionId: compactText(campaignState?.mission?.activeMissionId || missionGraph?.manifest?.id || '', 160),
      activeMissionGraphId: compactText(campaignState?.mission?.activeMissionGraphId || missionGraph?.manifest?.id || '', 180),
      activePhaseId: compactText(campaignState?.mission?.activePhaseId || campaignState?.mission?.phase || '', 140),
      availableDecisionPointIds: compactList(campaignState?.mission?.availableDecisionPointIds || [], 6, 140),
      formalObjectives: facts.objectives,
      knownFacts: facts.knownFacts
    },
    visiblePressure: facts.pressures,
    recentCommandLog: facts.recentCommandLog,
    visibleStaff: resolveVisibleStaff({ packageData, crewDataset }),
    safety: {
      playerVisibleOnly: true,
      hiddenStateIncluded: false,
      mayProposeState: false,
      mayCommitCommandLog: false,
      missionDirectorStillChecksSentChat: true
    }
  };
}

function createAssistPrompt(snapshot) {
  const actionLabel = DIRECTIVE_ASSIST_ACTIONS[snapshot.action].label;
  const narration = normalizeDirectiveNarrationContext(snapshot.narration, {
    roleId: DIRECTIVE_ASSIST_ROLE_ID
  });
  const styleContract = [
    'Narration perspective contract:',
    narration.instructions,
    '',
    `Resolved perspective: ${narration.perspective}`,
    `Perspective source: ${narration.source}${narration.activePresetName ? ` (${narration.activePresetName})` : ''}`,
    narration.reason ? `Source note: ${narration.reason}` : ''
  ].filter(Boolean).join('\n');
  return [
    'You are Directive Assist, a pre-send chat assistant for a roleplaying player.',
    `Action: ${actionLabel}.`,
    'This model call happens outside normal host preset assembly, so apply the narration perspective contract below explicitly.',
    styleContract,
    'Write in the player-character voice using the player profile, rank, billet, authority, and visible scene context supplied below.',
    'Preserve the player input narrative person when it is more specific than rough notes. Do not convert third-person player drafts into first-person "I" narration unless the resolved perspective explicitly requires first person.',
    'For third-person limited external output, keep any first-person wording inside quoted player-character dialogue that the player intent calls for; do not move the whole draft into unquoted first person.',
    'Preserve the player intent. Do not adjudicate outcomes, predict consequences, award reputation, commit state, or write NPC replies.',
    'The Mission Director will still inspect the final sent chat; this draft is not a command marker or authoritative outcome.',
    'Do not expose hidden truth, Director-only causes, raw relationship values, raw pressure values, raw Command Bearing values, hidden clocks, or uncommitted parser alternatives.',
    'If authority is limited, frame the wording as a report, recommendation, request, or within-role instruction instead of overclaiming command.',
    'Do not echo the raw input with only punctuation, rank, or title edits. For Draft In Character, convert rough notes or rough prose into a revised player-character message with useful voice and scene phrasing.',
    'Return JSON only with this shape:',
    '{"action":"draftInCharacter|briefMe|frameAsOrder|frameAsReport","title":"short label","replacementText":"editable chat draft or empty for Brief Me","brief":{"summary":"short player-safe brief","known":[],"uncertain":[],"routine":[],"pressure":[],"decision":[]},"notes":[],"warnings":[],"usedContext":[]}',
    '',
    JSON.stringify(snapshot, null, 2)
  ].join('\n');
}

export function buildDirectiveAssistRequest({
  action,
  inputText = '',
  campaignState = null,
  packageData = null,
  crewDataset = null,
  missionGraph = null,
  narrationContext = null
} = {}) {
  const snapshot = createDirectiveAssistSnapshot({
    action,
    inputText,
    campaignState,
    packageData,
    crewDataset,
    missionGraph,
    narrationContext
  });
  const prompt = createAssistPrompt(snapshot);
  return {
    snapshot,
    request: {
      prompt,
      messages: [
        {
          role: 'system',
          content: 'Return player-safe JSON for Directive Assist pre-send player-character drafting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      parameters: cloneJson(LOW_LATENCY_ASSIST_PARAMETERS),
      modelPreferences: cloneJson(ASSIST_MODEL_PREFERENCES),
      metadata: {
        narrationContext: directiveNarrationContextSummary(snapshot.narration, {
          roleId: DIRECTIVE_ASSIST_ROLE_ID
        })
      }
    }
  };
}

function playerAddress(player) {
  return [player.rank, player.name].filter(Boolean).join(' ').trim() || player.name || 'the officer';
}

function captainReference(snapshot) {
  return snapshot.authority.captainName || 'the commanding officer';
}

function intentPhrase(snapshot, fallback = 'the next step') {
  return sentenceFrom(snapshot.rawInput, fallback);
}

function quotedDialogue(value = '') {
  const source = String(value || '');
  const match = /"([^"]+)"/.exec(source);
  return compactText(match?.[1] || '', 420);
}

function normalizeDialogueAddress(text = '', snapshot = {}) {
  let normalized = compactText(text, 520);
  const captain = captainReference(snapshot);
  if (/captain/i.test(captain)) {
    normalized = normalized.replace(/\bThank you\s+Commander\b,?/i, 'Thank you, Captain,');
    normalized = normalized.replace(/\bThanks\s+Commander\b,?/i, 'Thanks, Captain,');
  }
  return normalized;
}

function routineSafetyLine(snapshot) {
  const captain = captainReference(snapshot);
  if (/captain/i.test(captain)) {
    return `Keep ${captain} informed of anything that changes mission authority, risk, or timing.`;
  }
  return 'Flag anything that changes authority, risk, or timing.';
}

function perspectiveMode(snapshot) {
  return directiveNarrationPerspectiveMode(snapshot?.narration);
}

function subjectLine(snapshot, thirdPersonText, secondPersonText, firstPersonText) {
  const mode = perspectiveMode(snapshot);
  if (mode === 'second-person') return secondPersonText;
  if (mode === 'first-person') return firstPersonText;
  return thirdPersonText;
}

function defaultDraft(snapshot) {
  const player = playerAddress(snapshot.player);
  const dialogue = normalizeDialogueAddress(quotedDialogue(snapshot.rawInput), snapshot);
  if (dialogue) {
    return subjectLine(
      snapshot,
      `${player} replies with calm professionalism. "${dialogue}"`,
      `You reply with calm professionalism. "${dialogue}"`,
      `I reply with calm professionalism. "${dialogue}"`
    );
  }
  const intent = intentPhrase(snapshot, 'the next step we need to take');
  return subjectLine(
    snapshot,
    `${player} keeps their tone professional. "${intent}. ${routineSafetyLine(snapshot)}"`,
    `You keep your tone professional. "${intent}. ${routineSafetyLine(snapshot)}"`,
    `I keep my tone professional. "${intent}. ${routineSafetyLine(snapshot)}"`
  );
}

function defaultOrder(snapshot) {
  const player = playerAddress(snapshot.player);
  const intent = intentPhrase(snapshot, 'coordinate the next step');
  const authority = `${snapshot.authority.billet} ${snapshot.authority.authority}`.toLowerCase();
  const hasCommandAuthority = /captain|commander|executive officer|xo|command|coordinator/.test(authority);
  if (!hasCommandAuthority) {
    return subjectLine(
      snapshot,
      `${player} frames it within their station. "From my post, I recommend we ${intent}. I can carry out my part and route the rest through the proper lead."`,
      `You frame it within your station. "From my post, I recommend we ${intent}. I can carry out my part and route the rest through the proper lead."`,
      `I frame it within my station. "From my post, I recommend we ${intent}. I can carry out my part and route the rest through the proper lead."`
    );
  }
  return subjectLine(
    snapshot,
    `${player} gives the instruction clearly. "${intent}. Coordinate across your stations, keep the chain of command clean, and ${routineSafetyLine(snapshot)}"`,
    `You give the instruction clearly. "${intent}. Coordinate across your stations, keep the chain of command clean, and ${routineSafetyLine(snapshot)}"`,
    `I give the instruction clearly. "${intent}. Coordinate across your stations, keep the chain of command clean, and ${routineSafetyLine(snapshot)}"`
  );
}

function defaultReport(snapshot) {
  const player = playerAddress(snapshot.player);
  const intent = intentPhrase(snapshot, 'we have a decision point in front of us');
  const captain = captainReference(snapshot);
  return subjectLine(
    snapshot,
    `${player} reports to ${captain}. "${intent}. My recommendation is that we keep the scope clear, identify the responsible station, and confirm any authority boundary before we commit."`,
    `You report to ${captain}. "${intent}. My recommendation is that we keep the scope clear, identify the responsible station, and confirm any authority boundary before we commit."`,
    `I report to ${captain}. "${intent}. My recommendation is that we keep the scope clear, identify the responsible station, and confirm any authority boundary before we commit."`
  );
}

function defaultBrief(snapshot) {
  const objectives = snapshot.mission.formalObjectives.length > 0
    ? snapshot.mission.formalObjectives
    : ['Clarify the next player-character intent before committing to action.'];
  const known = [
    snapshot.campaign.title ? `Campaign: ${snapshot.campaign.title}.` : '',
    snapshot.ship.name ? `Current posting: ${snapshot.ship.name}${snapshot.ship.class ? `, ${snapshot.ship.class}` : ''}.` : '',
    snapshot.player.rank || snapshot.player.billet ? `Role: ${[snapshot.player.rank, snapshot.player.billet].filter(Boolean).join(', ')}.` : '',
    ...snapshot.mission.knownFacts
  ].filter(Boolean).slice(0, 6);
  const pressure = snapshot.visiblePressure.length > 0
    ? snapshot.visiblePressure
    : ['No player-visible open pressure needs to be surfaced by Directive Assist right now.'];
  const decision = snapshot.rawInput
    ? [`Your current draft appears focused on: ${snapshot.rawInput}`]
    : ['Decide whether the next message is color, a routine coordination request, a report, or a command.'];
  return {
    summary: compactText([
      snapshot.player.name ? `${snapshot.player.name} is acting as ${[snapshot.player.rank, snapshot.player.billet].filter(Boolean).join(', ')}.` : '',
      snapshot.mission.activePhaseId ? `Active phase: ${snapshot.mission.activePhaseId}.` : ''
    ].filter(Boolean).join(' '), 260),
    known,
    uncertain: ['Directive Assist is not resolving hidden facts or predicting the Mission Director outcome.'],
    routine: objectives,
    pressure,
    decision
  };
}

function createFallbackResult({ snapshot, warnings = [] }) {
  const action = snapshot.action;
  const brief = defaultBrief(snapshot);
  const replacementText = action === 'briefMe'
    ? ''
    : action === 'frameAsOrder'
      ? defaultOrder(snapshot)
      : action === 'frameAsReport'
        ? defaultReport(snapshot)
        : defaultDraft(snapshot);
  return {
    kind: 'directive.directiveAssistResult',
    ok: true,
    source: 'deterministic-fallback',
    action,
    label: DIRECTIVE_ASSIST_ACTIONS[action].label,
    title: DIRECTIVE_ASSIST_ACTIONS[action].label,
    replacementText,
    brief,
    notes: [
      'Preserved the player input as intent.',
      'Used player-visible campaign, role, and staff context only.'
    ],
    warnings,
    usedContext: [
      'player-character identity',
      'role authority',
      'visible mission state',
      'visible staff roster'
    ],
    policy: cloneJson(snapshot.safety),
    diagnostics: {
      providerUsed: false,
      hiddenLeakBlocked: false
    }
  };
}

function parseDirectiveAssistText(text = '', { action = '' } = {}) {
  const parsed = parseStructuredJsonText(text);
  if (parsed.ok) return parsed.value;
  const allowPlainText = normalizeDirectiveAssistAction(action) !== 'briefMe';
  const loose = parseLooseDirectiveAssistText(text, { allowPlainText });
  if (isObject(loose) && (loose.replacementText || loose.brief?.summary)) return loose;
  const error = new Error('Provider returned invalid structured JSON.');
  error.code = parsed.diagnostic?.code || 'json_invalid';
  error.details = parsed.diagnostic || null;
  throw error;
}

function parseDirectiveAssistResponse(response = {}, { action = '' } = {}) {
  if (isObject(response?.content)) return cloneJson(response.content);
  if (isObject(response?.json)) return cloneJson(response.json);
  if (isObject(response?.data)) return cloneJson(response.data);
  if (isObject(response?.structuredOutput)) return cloneJson(response.structuredOutput);
  if (isObject(response) && (response.replacementText || response.brief || response.title)) return cloneJson(response);
  const text = assertProviderResponseText(response, {
    providerTitle: 'Directive Assist',
    maxTokens: LOW_LATENCY_ASSIST_PARAMETERS.max_tokens
  });
  return parseDirectiveAssistText(text, { action });
}

function createProviderRejectedFallback({ snapshot, generationResult, warning }) {
  const fallback = createFallbackResult({
    snapshot,
    warnings: [compactText(warning || 'Directive Assist provider response was not usable.', 220)]
  });
  return {
    ...fallback,
    diagnostics: {
      ...fallback.diagnostics,
      providerUsed: true,
      providerOutputRejected: true,
      providerId: generationResult?.diagnostics?.providerId || null,
      model: generationResult?.diagnostics?.model || null,
      usage: cloneJson(generationResult?.diagnostics?.usage || null)
    }
  };
}

function hiddenLeakInGeneratedOutput(value, allowedText = '') {
  const term = hiddenTruthTerm(value);
  if (!term) return null;
  const allowed = String(allowedText || '').toLowerCase();
  return allowed.includes(term) ? null : term;
}

function normalizeProviderBrief(value = {}, fallbackBrief) {
  if (!isObject(value)) return cloneJson(fallbackBrief);
  return {
    summary: compactText(value.summary || fallbackBrief.summary || '', 280),
    known: normalizeStringArray(value.known || fallbackBrief.known, 6, 220),
    uncertain: normalizeStringArray(value.uncertain || fallbackBrief.uncertain, 5, 220),
    routine: normalizeStringArray(value.routine || fallbackBrief.routine, 5, 220),
    pressure: normalizeStringArray(value.pressure || fallbackBrief.pressure, 5, 220),
    decision: normalizeStringArray(value.decision || fallbackBrief.decision, 5, 220)
  };
}

function normalizeProviderResult({ payload, snapshot, generationResult }) {
  const fallback = createFallbackResult({ snapshot });
  const action = normalizeDirectiveAssistAction(payload.action || snapshot.action);
  const replacementText = action === 'briefMe'
    ? compactText(payload.replacementText || '', 1600)
    : compactText(payload.replacementText || payload.draft || payload.text || fallback.replacementText, 1600);
  assertUsefulAssistDraft({
    action,
    rawInput: snapshot.rawInput,
    replacementText
  });
  assertPerspectiveCompatibleDraft({
    action,
    rawInput: snapshot.rawInput,
    replacementText,
    narrationContext: snapshot.narration
  });
  const result = {
    ...fallback,
    source: 'provider',
    action,
    label: DIRECTIVE_ASSIST_ACTIONS[action].label,
    title: compactText(payload.title || DIRECTIVE_ASSIST_ACTIONS[action].label, 120),
    replacementText,
    brief: normalizeProviderBrief(payload.brief, fallback.brief),
    notes: normalizeStringArray(payload.notes || fallback.notes, 6, 220),
    warnings: normalizeStringArray(payload.warnings || [], 6, 220),
    usedContext: normalizeStringArray(payload.usedContext || fallback.usedContext, 8, 160),
    diagnostics: {
      providerUsed: true,
      hiddenLeakBlocked: false,
      providerId: generationResult?.diagnostics?.providerId || null,
      model: generationResult?.diagnostics?.model || null,
      usage: cloneJson(generationResult?.diagnostics?.usage || null)
    }
  };
  const leak = hiddenLeakInGeneratedOutput({
    replacementText: result.replacementText,
    brief: result.brief,
    notes: result.notes,
    warnings: result.warnings
  }, snapshot.rawInput);
  if (leak) {
    return {
      ...createFallbackResult({
        snapshot,
        warnings: ['Provider output was replaced because it included hidden or Director-only language.']
      }),
      diagnostics: {
        providerUsed: true,
        hiddenLeakBlocked: true,
        hiddenLeakTerm: leak,
        providerId: generationResult?.diagnostics?.providerId || null,
        model: generationResult?.diagnostics?.model || null
      }
    };
  }
  return result;
}

export async function runDirectiveAssist({
  action,
  inputText = '',
  campaignState = null,
  packageData = null,
  crewDataset = null,
  missionGraph = null,
  narrationContext = null,
  generationRouter = null,
  useProvider = true
} = {}) {
  const { snapshot, request } = buildDirectiveAssistRequest({
    action,
    inputText,
    campaignState,
    packageData,
    crewDataset,
    missionGraph,
    narrationContext
  });
  if (!useProvider || typeof generationRouter?.generate !== 'function') {
    return {
      ...createFallbackResult({ snapshot }),
      requestSnapshot: cloneJson(snapshot)
    };
  }
  const generationResult = await generationRouter.generate(DIRECTIVE_ASSIST_ROLE_ID, request);
  if (!generationResult?.ok) {
    return {
      ...createFallbackResult({
        snapshot,
        warnings: [
          compactText(generationResult?.error?.message || 'Directive Assist provider unavailable; used local fallback.', 220)
        ]
      }),
      requestSnapshot: cloneJson(snapshot)
    };
  }
  try {
    const payload = parseDirectiveAssistResponse(generationResult.response || {}, {
      action: snapshot.action
    });
    return {
      ...normalizeProviderResult({
        payload,
        snapshot,
        generationResult
      }),
      requestSnapshot: cloneJson(snapshot)
    };
  } catch (error) {
    return {
      ...createProviderRejectedFallback({
        snapshot,
        generationResult,
        warning: `Directive Assist provider response was not usable: ${compactText(error?.message || error, 180)}`
      }),
      requestSnapshot: cloneJson(snapshot)
    };
  }
}
