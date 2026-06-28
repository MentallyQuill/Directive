import {
  buildPlayerSafePromptContextWithContinuityPlanner,
  createPlayerSafeCampaignProjection,
  recordPromptContextRevision
} from '../generation/player-safe-prompt-context-builder.mjs';
import {
  globalScenePacingLines,
  scenePacingGuidance
} from '../context/scene-pacing-guidance.mjs';
import {
  directiveNarrationContextSummary,
  directiveNarrationPerspectiveMode,
  normalizeDirectiveNarrationContext,
  resolveDirectiveNarrationContext
} from '../generation/narration-context.mjs';
import { prefixCampaignReplyHeader } from '../time/campaign-time-header.mjs';
import {
  STARFLEET_VOYAGER_UNIFORM_RULE,
  starfleetUniformFactForCrew
} from '../starfleet/uniforms.mjs';
import {
  commitTrackedCampaignState,
  initializeCampaignRuntimeTracking
} from './state-delta-gateway.mjs';

const ACTIVATION_STEPS = Object.freeze([
  'prepared',
  'chatBound',
  'introGenerated',
  'introPosted',
  'promptInstalled',
  'chatOpened',
  'activated'
]);
const CAMPAIGN_CHAT_FALLBACK_NAME = 'Directive';
const MAX_CAMPAIGN_CHAT_NAME_LENGTH = 80;

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function createJournal(campaignState, now) {
  const existing = campaignState.activationJournal || {};
  const steps = existing.steps && typeof existing.steps === 'object' ? existing.steps : {};
  return {
    kind: 'directive.campaignActivationJournal',
    version: 1,
    activationId: existing.activationId || `activation:${campaignState.campaign?.id || 'campaign'}`,
    status: existing.status || 'pending',
    startedAt: existing.startedAt || timestamp(now),
    updatedAt: timestamp(now),
    completedAt: existing.completedAt || null,
    error: cloneJson(existing.error || null),
    steps: Object.fromEntries(ACTIVATION_STEPS.map((step) => [step, cloneJson(steps[step] || {
      status: 'pending',
      completedAt: null,
      details: null
    })])),
    introPacket: cloneJson(existing.introPacket || null),
    introRevisions: Array.isArray(existing.introRevisions) ? cloneJson(existing.introRevisions) : []
  };
}

function setStep(journal, step, status, details, now) {
  return {
    ...cloneJson(journal),
    status: status === 'failed' ? 'failed' : journal.status,
    updatedAt: timestamp(now),
    error: status === 'failed' ? cloneJson(details?.error || details || null) : journal.error,
    steps: {
      ...cloneJson(journal.steps),
      [step]: {
        status,
        completedAt: status === 'complete' ? timestamp(now) : null,
        details: cloneJson(details || null)
      }
    }
  };
}

function completed(journal, step) {
  return journal?.steps?.[step]?.status === 'complete';
}

function resetStep(journal, step, details, now) {
  return {
    ...cloneJson(journal),
    updatedAt: timestamp(now),
    steps: {
      ...cloneJson(journal.steps),
      [step]: {
        status: 'pending',
        completedAt: null,
        details: cloneJson(details || null)
      }
    }
  };
}

function campaignChatName(campaignState, packageData) {
  const campaignTitle = compact(
    campaignState.campaign?.title
    || campaignState.campaign?.packageTitle
    || packageData?.manifest?.title
    || packageData?.storyArcs?.campaign?.title
    || packageData?.characterCreation?.campaignContext?.campaignTitle
    || 'Campaign'
  ).replace(/^U\.S\.S\.\s+[^:]+:\s*/i, '');
  const name = `Directive - ${campaignTitle || 'Campaign'}`;
  return name.length <= MAX_CAMPAIGN_CHAT_NAME_LENGTH ? name : CAMPAIGN_CHAT_FALLBACK_NAME;
}

function normalizeIntroNarrationContext(value = null) {
  return normalizeDirectiveNarrationContext(value, { roleId: 'campaignIntro' });
}

function introNarrationContextSummary(context) {
  return directiveNarrationContextSummary(context, { roleId: 'campaignIntro' });
}

async function resolveIntroNarrationContext(host) {
  return resolveDirectiveNarrationContext(host, { roleId: 'campaignIntro' });
}

function introPerspectiveMode(narrationContext) {
  return directiveNarrationPerspectiveMode(narrationContext);
}

function playerLabel(player = {}) {
  return compact([player.rank || 'Commander', player.name || ''].filter(Boolean).join(' ')) || 'the incoming commander';
}

function packageCrewById(packageData) {
  return new Map((packageData?.crew?.senior || [])
    .filter((officer) => officer?.id)
    .map((officer) => [officer.id, officer]));
}

function officerLabel(officer = null) {
  if (!officer) return null;
  return compact([officer.rank, officer.name].filter(Boolean).join(' ')) || compact(officer.name || officer.id);
}

function introSeniorCrewFacts(safe, packageData) {
  const packageCrew = packageCrewById(packageData);
  const safeCrew = Array.isArray(safe?.crew) && safe.crew.length > 0
    ? safe.crew
    : Array.from(packageCrew.values());
  return safeCrew
    .filter((officer) => officer?.id && officer.id !== 'player-commander')
    .map((officer) => {
      const source = packageCrew.get(officer.id) || {};
      const mergedOfficer = {
        ...source,
        ...officer
      };
      const uniform = starfleetUniformFactForCrew(mergedOfficer);
      return {
        id: officer.id,
        name: officer.name || source.name || null,
        rank: officer.rank || source.rank || null,
        billet: officer.billet || source.billet || null,
        species: officer.species || source.species || null,
        ageDescription: officer.age || officer.ageDescription || source.ageDescription || null,
        appearanceSummary: officer.appearance || officer.appearanceSummary || source.appearanceSummary || null,
        publicProfile: officer.profile || officer.publicProfile || source.publicProfile || null,
        publicIdentityFacts: Array.isArray(officer.publicIdentityFacts)
          ? officer.publicIdentityFacts
          : Array.isArray(source.publicIdentityFacts)
            ? source.publicIdentityFacts
            : [],
        uniformDivision: uniform
          ? {
            division: uniform.division,
            color: uniform.color,
            summary: uniform.summary
          }
          : null,
        packageRole: officer.packageRole || source.packageRole || null
      };
    });
}

function introShuttlebayAnchor(shipDataset = null) {
  const area = array(shipDataset?.areas).find((entry) => entry?.id === 'intrepid.shuttlebay-complex'
    || array(entry?.keywords).some((keyword) => /shuttle\s*bay|shuttlebay/i.test(keyword)));
  if (!area) return null;
  return {
    id: area.id,
    name: area.name || null,
    decks: cloneJson(array(area.decks)),
    zone: compact(area.zone) || null,
    exteriorPlacement: compact(area.exteriorPlacement) || null,
    hardFacts: array(area.hardFacts).map(compact).filter(Boolean).slice(0, 4),
    textures: array(area.textures).map(compact).filter(Boolean).slice(0, 5),
    constraints: array(area.constraints).map(compact).filter(Boolean).slice(0, 4)
  };
}

function introShipLayoutContract(shipDataset = null) {
  const shuttlebay = introShuttlebayAnchor(shipDataset);
  if (!shuttlebay) return '';
  const facts = [
    ...array(shuttlebay.hardFacts),
    shuttlebay.exteriorPlacement ? `Exterior placement: ${shuttlebay.exteriorPlacement}.` : null,
    ...array(shuttlebay.constraints)
  ].map(compact).filter(Boolean);
  return [
    'Ship layout contract:',
    ...facts.map((fact) => `- ${fact}`),
    '- If a shuttle arrival, launch, docking, hangar, or shuttlebay appears in the intro, use the Deck 10 aft shuttlebay complex and an astern approach. Do not place the bay in the underside of the saucer or ventral primary hull.'
  ].join('\n');
}

function introOpeningFacts({ campaignState, packageData, safe, shipDataset = null }) {
  const packageCrew = packageCrewById(packageData);
  const currentLocationId = safe?.campaign?.locationId
    || campaignState?.worldState?.currentLocationId
    || packageData?.world?.openingLocationId
    || null;
  const location = (packageData?.world?.locations || []).find((entry) => entry?.id === currentLocationId) || null;
  const activeMissionId = safe?.mission?.activeMissionId || campaignState?.mission?.activeMissionId || null;
  const activeQuest = (packageData?.questTemplates?.templates || []).find((entry) => (
    entry?.id === activeMissionId || entry?.templateId === activeMissionId
  )) || null;
  const command = packageData?.ship?.commandStructure || {};
  const captain = packageCrew.get(command.commandingOfficer || command.captainId);
  const actingXo = packageCrew.get(command.actingXoBeforePlayer);
  const pacing = scenePacingGuidance({ campaignState, packageData });
  return {
    crewStartingFrame: packageData?.crew?.relationshipModel?.startingFrame || null,
    currentLocationId,
    currentLocationSummary: location?.playerSafeSummary || location?.playerSummary || location?.summary || null,
    activeMissionId,
    activeMissionSummary: activeQuest?.playerSummary || activeQuest?.playerSafeSummary || activeQuest?.summary || null,
    shuttleApproach: safe?.ship?.travelContinuity?.openingShuttleApproach || packageData?.ship?.travelContinuity?.openingShuttleApproach || null,
    shuttlebayLayout: introShuttlebayAnchor(shipDataset),
    commandHandoff: {
      playerRank: safe?.player?.rank || campaignState?.player?.rank || packageData?.characterCreation?.lockedRole?.rank || 'Commander',
      playerBillet: safe?.player?.billet || campaignState?.player?.billet || packageData?.characterCreation?.lockedRole?.billet || 'Executive Officer',
      commandingOfficer: officerLabel(captain),
      actingXoBeforePlayer: officerLabel(actingXo),
      actingXoPublicProfile: actingXo?.publicProfile || null
    },
    openingPacing: pacing ? {
      id: pacing.id,
      title: pacing.title,
      lines: cloneJson(pacing.lines)
    } : null
  };
}

function campaignIntroTitle(campaignState, packageData) {
  return compact(
    campaignState?.campaign?.title
    || packageData?.storyArcs?.campaign?.title
    || packageData?.characterCreation?.campaignContext?.campaignTitle
    || packageData?.manifest?.title
    || ''
  ).replace(/^U\.S\.S\.\s+[^:]+:\s*/i, '').replace(/\s+-\s+Open World$/i, '');
}

function ensureCampaignIntroTitle(text, { campaignState, packageData } = {}) {
  const body = String(text || '').trim();
  const title = campaignIntroTitle(campaignState, packageData);
  if (!body || !title) return body;
  const headingPattern = new RegExp(`(^|\\n)#{1,3}\\s*${escapeRegExp(title)}(?:\\s|$)`, 'i');
  if (headingPattern.test(body.slice(0, 800))) return body;
  return `# ${title}\n\n${body}`.trim();
}

function looksLikeInternalObjectiveId(value) {
  return /^[a-z0-9][a-z0-9._-]*\.objective\.[a-z0-9._-]+$/i.test(compact(value));
}

function playerFacingObjectiveText(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return compact(
    entry.playerText
    || entry.playerSafeSummary
    || entry.summary
    || entry.label
    || entry.title
    || entry.name
    || ''
  );
}

function collectObjectiveLabelLookup(source, lookup = new Map(), visited = new WeakSet()) {
  if (!source || typeof source !== 'object') return lookup;
  if (visited.has(source)) return lookup;
  visited.add(source);
  if (!Array.isArray(source)) {
    const id = compact(source.id);
    if (looksLikeInternalObjectiveId(id) && !lookup.has(id)) {
      const label = playerFacingObjectiveText(source);
      if (label && !looksLikeInternalObjectiveId(label)) lookup.set(id, label);
    }
  }
  const values = Array.isArray(source) ? source : Object.values(source);
  for (const value of values) collectObjectiveLabelLookup(value, lookup, visited);
  return lookup;
}

function resolvedObjectiveText(entry, objectiveLookup) {
  if (typeof entry === 'string') {
    const text = compact(entry);
    if (!looksLikeInternalObjectiveId(text)) return text;
    return objectiveLookup.get(text) || '';
  }
  if (!entry || typeof entry !== 'object') return '';
  const id = compact(entry.id);
  const label = playerFacingObjectiveText(entry);
  if (label && !looksLikeInternalObjectiveId(label)) return label;
  if (id && looksLikeInternalObjectiveId(id)) return objectiveLookup.get(id) || '';
  return '';
}

function isAbortLikeError(error) {
  return error?.code === 'DIRECTIVE_GENERATION_ABORTED'
    || error?.name === 'AbortError'
    || error?.code === 'ABORT_ERR';
}

function canceledIntroPacket({
  campaignState,
  packageData,
  narrationContext = null,
  error = null
} = {}) {
  return {
    kind: 'directive.campaignIntroPacket',
    source: 'canceled',
    canceled: true,
    aborted: true,
    reason: 'generation-canceled',
    error: {
      code: error?.code || 'DIRECTIVE_GENERATION_ABORTED',
      message: error?.message || 'Campaign intro generation was canceled.'
    },
    narratorSafe: true,
    narrationContext: introNarrationContextSummary(normalizeIntroNarrationContext(narrationContext)),
    campaignId: campaignState?.campaign?.id || null,
    title: campaignIntroTitle(campaignState, packageData) || null
  };
}

function localIntroPacket({ campaignState, packageData, shipDataset = null, narrationContext = null }) {
  const resolvedNarrationContext = normalizeIntroNarrationContext(narrationContext);
  const safe = createPlayerSafeCampaignProjection({ campaignState, packageData, shipDataset }) || {};
  const player = safe.player || {};
  const ship = { ...(packageData?.ship || {}), ...(safe.ship || {}) };
  const captain = (packageData?.crew?.senior || []).find((officer) => officer.id === packageData?.ship?.commandStructure?.commandingOfficer)
    || (packageData?.crew?.senior || []).find((officer) => officer.billet === 'Commanding Officer');
  const objectives = safe.mission?.formalObjectives || [];
  const firstDecision = safe.mission?.availableDecisionPointIds?.[0] || null;
  const theater = packageData?.storyArcs?.campaign?.theater || campaignState.campaign?.theater || 'the assigned region';
  const missionProfile = packageData?.characterCreation?.campaignContext?.missionProfile
    || packageData?.storyArcs?.campaign?.thesis
    || 'a politically sensitive Starfleet assignment';
  const assignment = `${theater === 'the assigned region' ? theater : `the ${theater}`} assignment: ${compact(missionProfile)}`;
  const shipDescription = `The ${ship.class || 'Starfleet'} starship ${ship.name || 'assigned vessel'}`;
  const captainLabel = compact(`${captain?.rank || 'Captain'} ${captain?.name || 'Whitaker'}`);
  const billet = player.billet || 'Executive Officer';
  const objectiveLookup = collectObjectiveLabelLookup(packageData);
  const priorities = objectives.slice(0, 3)
    .map((entry) => resolvedObjectiveText(entry, objectiveLookup))
    .filter(Boolean)
    .join(' ');
  const mode = introPerspectiveMode(resolvedNarrationContext);
  const text = (mode === 'second-person' ? [
    `${shipDescription} holds steady as the last transfer shuttle completes its approach. Beyond the viewports, the work ahead is already waiting: ${compact(assignment)}`,
    '',
    `You arrive as ${playerLabel(player)}, newly assigned as ${billet}. ${captainLabel} retains final authority, but immediate coordination of shipboard operations is now your assigned responsibility.`,
    '',
    priorities ? `Your standing priorities are clear: ${priorities}` : '',
    '',
    firstDecision
      ? `${captain?.name || 'The Captain'} opens the first operational choice. The crew waits for your order.`
      : `${captain?.name || 'The Captain'} leaves the next move with you.`
  ] : mode === 'first-person' ? [
    `${captainLabel}'s log: ${shipDescription} holds steady as the last transfer shuttle completes its approach. Beyond the viewports, the work ahead is already waiting: ${compact(assignment)}`,
    '',
    `${playerLabel(player)}, newly assigned as ${billet}, enters a command team that has already begun forming its own habits. I retain final authority, while immediate coordination of shipboard operations belongs to the XO's assigned responsibility.`,
    '',
    priorities ? `The standing priorities are clear: ${priorities}` : '',
    '',
    firstDecision
      ? `I open the first operational choice. The crew waits for the commander's first order.`
      : `I leave the next move with the incoming XO.`
  ] : [
    `${shipDescription} holds steady as the last transfer shuttle completes its approach. Beyond the viewports, the work ahead is already waiting: ${compact(assignment)}`,
    '',
    `${playerLabel(player)}, newly assigned as ${billet}, enters a command team that has already begun forming its own habits. ${captainLabel} retains final authority, while immediate coordination of shipboard operations belongs to the XO's assigned responsibility.`,
    '',
    priorities ? `The standing priorities are clear: ${priorities}` : '',
    '',
    firstDecision
      ? `${captain?.name || 'The Captain'} opens the first operational choice. The crew waits for the commander's first order.`
      : `${captain?.name || 'The Captain'} leaves the next move with the incoming XO.`
  ]).filter((line, index, array) => line || (index > 0 && array[index - 1])).join('\n').trim();
  return {
    kind: 'directive.campaignIntroPacket',
    source: 'local-fallback',
    text: ensureCampaignIntroTitle(text, { campaignState, packageData }),
    narratorSafe: true,
    narrationContext: introNarrationContextSummary(resolvedNarrationContext),
    campaignId: campaignState.campaign?.id || null
  };
}

async function generateIntro({
  campaignState,
  packageData,
  shipDataset = null,
  generationRouter,
  narrationContext = null,
  variantSeed = null,
  variantReason = null,
  signal = null
}) {
  const resolvedNarrationContext = normalizeIntroNarrationContext(narrationContext);
  const fallback = localIntroPacket({ campaignState, packageData, shipDataset, narrationContext: resolvedNarrationContext });
  if (!generationRouter?.generate) return fallback;
  const safe = createPlayerSafeCampaignProjection({ campaignState, packageData, shipDataset }) || {};
  const introVariantSeed = compact(variantSeed);
  const pacing = scenePacingGuidance({ campaignState, packageData });
  const pacingLines = [
    ...globalScenePacingLines(),
    ...(pacing?.lines || [])
  ];
  const styleContract = [
    'Narration perspective contract:',
    resolvedNarrationContext.instructions,
    '',
    `Resolved perspective: ${resolvedNarrationContext.perspective}`,
    `Perspective source: ${resolvedNarrationContext.source}${resolvedNarrationContext.activePresetName ? ` (${resolvedNarrationContext.activePresetName})` : ''}`,
    resolvedNarrationContext.reason ? `Source note: ${resolvedNarrationContext.reason}` : ''
  ].filter(Boolean).join('\n');
  const variantContract = introVariantSeed ? [
    'Variant seed:',
    introVariantSeed,
    'Use the seed only to vary prose choices and scene texture. Keep the same campaign facts, active mission frame, immediate situation, and playable prompt.'
  ].join('\n') : '';
  const prompt = [
    'Write the opening message for a chat-native Starfleet command campaign.',
    'This model call happens outside normal host preset assembly, so apply the narration perspective contract below explicitly.',
    '',
    styleContract,
    '',
    'Use only the player-safe facts below. Establish the ship, assignment, player post, immediate scene, senior handoff, and one playable prompt.',
    STARFLEET_VOYAGER_UNIFORM_RULE,
    'When a named senior officer appears, preserve their listed rank, billet, species, public profile, age, appearance, uniform/division color, and role facts. Do not omit or rewrite public identity facts for first appearances.',
    'Do not infer command-red uniforms from temporary command duties. Temporary acting-XO duty does not change an officer\'s division color.',
    'The player is the incoming command character. Do not replace the player arrival or handoff with the captain arriving, and do not move the opening out of the active mission phase.',
    introShipLayoutContract(shipDataset),
    pacingLines.length ? `Opening pacing guidance:\n${pacingLines.map((line) => `- ${line}`).join('\n')}` : '',
    'Stay inside the active mission and phase in the player-safe mission context. Do not invent a distress call, beacon, anomaly, attack, or new external mission hook unless that exact hook appears in the active mission context.',
    'Write normal roleplay prose. Do not include setup instructions, mechanics, hidden values, or JSON.',
    variantContract ? `\n${variantContract}` : '',
    '',
    JSON.stringify({
      campaign: safe.campaign || null,
      player: safe.player || null,
      ship: safe.ship || null,
      mission: safe.mission || null,
      openingFrame: introOpeningFacts({ campaignState, packageData, safe, shipDataset }),
      seniorCrew: introSeniorCrewFacts(safe, packageData)
    }, null, 2)
  ].join('\n');
  let generated = null;
  try {
    generated = await generationRouter.generate('campaignIntro', {
      prompt,
      messages: [
        { role: 'system', content: `You write concise, grounded opening prose for Directive campaigns.\n\n${styleContract}` },
        { role: 'user', content: prompt }
      ],
      metadata: {
        narrationContext: introNarrationContextSummary(resolvedNarrationContext),
        introVariantSeed: introVariantSeed || null,
        introVariantReason: compact(variantReason) || null
      },
      parameters: {
        max_tokens: 1200,
        temperature: 0.7
      }
    }, { signal });
  } catch (error) {
    if (isAbortLikeError(error) || signal?.aborted) {
      return canceledIntroPacket({
        campaignState,
        packageData,
        narrationContext: resolvedNarrationContext,
        error
      });
    }
    throw error;
  }
  if (generated?.error?.code === 'DIRECTIVE_GENERATION_ABORTED') {
    return canceledIntroPacket({
      campaignState,
      packageData,
      narrationContext: resolvedNarrationContext,
      error: generated.error
    });
  }
  const responseText = String(generated?.response?.text || generated?.response?.content || generated?.text || generated?.content || '').trim();
  const text = compact(responseText);
  if (!generated?.ok || !text) {
    return {
      ...fallback,
      fallbackReason: generated?.error?.message || 'Intro provider returned empty text.'
    };
  }
  return {
    kind: 'directive.campaignIntroPacket',
    source: 'reasoning-provider',
    providerId: generated.diagnostics?.providerId || generated.response?.providerId || null,
    text: ensureCampaignIntroTitle(responseText, { campaignState, packageData }),
    narratorSafe: true,
    narrationContext: introNarrationContextSummary(resolvedNarrationContext),
    campaignId: campaignState.campaign?.id || null
  };
}

async function persistStep(persist, campaignState, summary) {
  if (typeof persist === 'function') {
    await persist(campaignState, summary);
  }
}

function reportActivationActivity(host, payload = {}) {
  try {
    host?.ui?.reportProgress?.({
      kind: 'directive.activationActivity',
      ...cloneJson(payload)
    });
  } catch {
    // Progress UI must never make activation less recoverable.
  }
}

function isPlayerMessage(message = null) {
  const user = message?.isUser === true || message?.is_user === true || message?.role === 'user';
  const directiveOwned = message?.isDirectiveOwned === true || message?.directiveOwned === true;
  return Boolean(user && !directiveOwned);
}

async function currentChatHasPlayerMessage(host) {
  const latest = await host?.chat?.getLatestPlayerMessage?.();
  if (isPlayerMessage(latest)) return true;
  const recent = await host?.chat?.getRecentMessages?.({ limit: 500, playerSafeOnly: true });
  return Array.isArray(recent) && recent.some(isPlayerMessage);
}

function seedIntroRevisions({ journal, campaignState, hostMessageId = null, now = null } = {}) {
  if (Array.isArray(journal?.introRevisions) && journal.introRevisions.length > 0) {
    return cloneJson(journal.introRevisions);
  }
  const introPacket = journal?.introPacket || null;
  if (!introPacket?.text) return [];
  return [{
    id: `${journal?.activationId || `activation:${campaignState?.campaign?.id || 'campaign'}`}:intro:0`,
    generatedAt: journal?.steps?.introGenerated?.completedAt || journal?.startedAt || timestamp(now),
    source: introPacket.source || 'unknown',
    providerId: introPacket.providerId || null,
    text: introPacket.text,
    narrationContext: cloneJson(introPacket.narrationContext || null),
    hostMessageId: hostMessageId || campaignState?.campaignChatBinding?.introMessageId || null,
    swipeIndex: 0,
    swipeCount: 1,
    reason: 'initial-campaign-intro'
  }];
}

export function createCampaignActivationCoordinator({
  host,
  generationRouter = null,
  persist = null,
  now = null
} = {}) {
  if (!host?.chat?.createOrBindCampaignChat) {
    throw new Error('Campaign activation requires a host chat adapter.');
  }
  if (!host?.prompt?.install) {
    throw new Error('Campaign activation requires a host prompt adapter.');
  }

  async function activate({
    campaignState,
    packageData,
    crewDataset = null,
    shipDataset = null,
    campaignProjection = null,
    saveId = null,
    existingChatId = null,
    createNewChat = true,
    signal = null
  } = {}) {
    let state = initializeCampaignRuntimeTracking(campaignState);
    let journal = createJournal(state, now);
    let promptInstalledThisAttempt = false;
    let currentStep = ACTIVATION_STEPS.find((step) => !completed(journal, step)) || 'prepared';
    if (journal.status === 'failed') {
      journal = {
        ...journal,
        status: 'pending',
        error: null,
        updatedAt: timestamp(now)
      };
    }

    function emitActivity(event = {}) {
      reportActivationActivity(host, {
        jobId: `campaignActivation:${journal.activationId}`,
        activationId: journal.activationId,
        campaignId: state.campaign?.id || campaignState?.campaign?.id || null,
        saveId,
        ...event
      });
    }

    async function checkpoint(step, details, domains = ['activationJournal']) {
      journal = setStep(journal, step, 'complete', details, now);
      const next = {
        ...cloneJson(state),
        activationJournal: cloneJson(journal)
      };
      state = commitTrackedCampaignState({
        campaignState: state,
        nextCampaignState: next,
        delta: {
          source: 'campaignActivation',
          reason: `Campaign activation step completed: ${step}.`,
          summary: `Activation: ${step}`,
          domains,
          stable: true
        },
        now
      });
      await persistStep(persist, state, `Campaign activation: ${step}.`);
    }

    try {
      emitActivity({ phase: 'activationStarting', status: 'running', step: currentStep });
      if (!completed(journal, 'prepared')) {
        currentStep = 'prepared';
        emitActivity({ phase: 'activationPreparing', status: 'running', step: 'prepared' });
        state = {
          ...state,
          campaign: {
            ...state.campaign,
            status: 'activating'
          },
          activationJournal: journal
        };
        await checkpoint('prepared', {
          campaignId: state.campaign?.id,
          saveId
        }, ['campaign', 'activationJournal']);
        emitActivity({ phase: 'activationPrepared', status: 'complete', step: 'prepared' });
      }

      if (!completed(journal, 'chatBound')) {
        currentStep = 'chatBound';
        emitActivity({ phase: 'activationChatCreating', status: 'running', step: 'chatBound' });
        const binding = await host.chat.createOrBindCampaignChat({
          name: campaignChatName(state, packageData),
          fallbackName: CAMPAIGN_CHAT_FALLBACK_NAME,
          campaignId: state.campaign?.id,
          saveId,
          existingChatId,
          createNew: createNewChat
        });
        state = {
          ...state,
          campaignChatBinding: {
            ...cloneJson(binding),
            status: 'bound',
            introMessageId: state.campaignChatBinding?.introMessageId || null,
            promptContextRevision: state.campaignChatBinding?.promptContextRevision || 0,
            boundStateRevision: state.runtimeTracking?.revision || 0
          }
        };
        await checkpoint('chatBound', {
          chatId: binding.chatId,
          createdByDirective: binding.createdByDirective,
          creationMethod: binding.creationMethod
        }, ['campaignChatBinding', 'activationJournal']);
        emitActivity({
          phase: 'activationChatBound',
          status: 'complete',
          step: 'chatBound',
          chatId: binding.chatId
        });
      }

      if (!completed(journal, 'introGenerated')) {
        currentStep = 'introGenerated';
        emitActivity({ phase: 'activationIntroGenerating', status: 'running', step: 'introGenerated' });
        const narrationContext = await resolveIntroNarrationContext(host);
        const introPacket = await generateIntro({
          campaignState: state,
          packageData,
          shipDataset,
          generationRouter,
          narrationContext,
          signal
        });
        if (introPacket?.canceled === true) {
          emitActivity({
            phase: 'activationCanceled',
            status: 'canceled',
            step: 'introGenerated',
            error: introPacket.error || null
          });
          return {
            ok: false,
            canceled: true,
            reason: 'generation-canceled',
            summary: 'Campaign activation canceled.',
            campaignState: cloneJson(state),
            activationJournal: cloneJson(journal),
            introPacket: cloneJson(introPacket)
          };
        }
        journal = {
          ...journal,
          introPacket: cloneJson(introPacket)
        };
        await checkpoint('introGenerated', {
          source: introPacket.source,
          providerId: introPacket.providerId || null,
          narrationContext: introPacket.narrationContext || introNarrationContextSummary(narrationContext)
        }, ['activationJournal']);
        emitActivity({
          phase: 'activationIntroGenerated',
          status: 'complete',
          step: 'introGenerated',
          source: introPacket.source,
          providerId: introPacket.providerId || null
        });
      }

      if (!completed(journal, 'introPosted')) {
        currentStep = 'introPosted';
        emitActivity({ phase: 'activationIntroPosting', status: 'running', step: 'introPosted' });
        const introPacket = journal.introPacket || localIntroPacket({ campaignState: state, packageData, shipDataset });
        const posted = await host.chat.postAssistantMessage({
          text: prefixCampaignReplyHeader(introPacket.text, state),
          campaignId: state.campaign?.id,
          responseKind: 'campaignIntro',
          idempotencyKey: `${journal.activationId}:intro`
        });
        state = {
          ...state,
          campaignChatBinding: {
            ...state.campaignChatBinding,
            introMessageId: posted.hostMessageId || state.campaignChatBinding?.introMessageId || null
          }
        };
        await checkpoint('introPosted', {
          hostMessageId: posted.hostMessageId || null,
          duplicate: posted.duplicate === true
        }, ['campaignChatBinding', 'activationJournal']);
        emitActivity({
          phase: 'activationIntroPosted',
          status: 'complete',
          step: 'introPosted',
          hostMessageId: posted.hostMessageId || null
        });
      }

      if (!completed(journal, 'promptInstalled')) {
        currentStep = 'promptInstalled';
        emitActivity({ phase: 'activationPromptInstalling', status: 'running', step: 'promptInstalled' });
        const promptContext = await buildPlayerSafePromptContextWithContinuityPlanner({
          campaignState: state,
          packageData,
          crewDataset,
          shipDataset,
          campaignProjection,
          createdAt: timestamp(now)
        }, {
          generationRouter
        });
        const promptResult = await host.prompt.install({
          binding: state.campaignChatBinding,
          packet: promptContext
        });
        if (!promptResult?.ok) {
          const error = new Error(promptResult?.error?.message || 'Campaign prompt installation failed.');
          error.code = promptResult?.error?.code || 'DIRECTIVE_PROMPT_INSTALL_FAILED';
          throw error;
        }
        promptInstalledThisAttempt = true;
        state = recordPromptContextRevision(state, promptContext, {
          installedAt: timestamp(now),
          status: 'active'
        });
        state.campaignChatBinding = {
          ...state.campaignChatBinding,
          promptInstalledAt: timestamp(now)
        };
        await host.chat.updateBindingMetadata?.(state.campaignChatBinding);
        await checkpoint('promptInstalled', {
          revision: promptContext.revision,
          blockCount: promptContext.blocks.length,
          contentHash: promptContext.contentHash
        }, ['campaignChatBinding', 'activationJournal']);
        emitActivity({
          phase: 'activationPromptInstalled',
          status: 'complete',
          step: 'promptInstalled',
          revision: promptContext.revision
        });
      }

      if (!completed(journal, 'chatOpened')) {
        currentStep = 'chatOpened';
        emitActivity({ phase: 'activationChatOpening', status: 'running', step: 'chatOpened' });
        const opened = await host.chat.open?.(state.campaignChatBinding);
        if (opened === false) {
          const error = new Error('Directive created the campaign chat but the host could not open it.');
          error.code = 'DIRECTIVE_CAMPAIGN_CHAT_OPEN_FAILED';
          throw error;
        }
        await checkpoint('chatOpened', {
          opened: true
        }, ['activationJournal']);
        emitActivity({ phase: 'activationChatOpened', status: 'complete', step: 'chatOpened' });
      }

      if (!completed(journal, 'activated')) {
        currentStep = 'activated';
        state = {
          ...state,
          campaign: {
            ...state.campaign,
            status: 'active',
            activatedAt: state.campaign?.activatedAt || timestamp(now)
          },
          activationJournal: journal
        };
        await checkpoint('activated', {
          campaignId: state.campaign?.id,
          chatId: state.campaignChatBinding?.chatId
        }, ['campaign', 'activationJournal']);
      }

      if (journal.status !== 'complete' || state.campaign?.status !== 'active') {
        journal = {
          ...journal,
          status: 'complete',
          completedAt: journal.completedAt || timestamp(now),
          updatedAt: timestamp(now),
          error: null
        };
        const finalized = {
          ...cloneJson(state),
          campaign: {
            ...state.campaign,
            status: 'active',
            activatedAt: state.campaign?.activatedAt || timestamp(now)
          },
          activationJournal: cloneJson(journal)
        };
        state = commitTrackedCampaignState({
          campaignState: state,
          nextCampaignState: finalized,
          delta: {
            source: 'campaignActivation',
            reason: 'Campaign activation completed.',
            summary: 'Campaign chat, intro, prompt context, and active state are ready.',
            domains: ['campaign', 'activationJournal'],
            stable: true
          },
          now
        });
        await persistStep(persist, state, 'Campaign activation completed.');
      }

      emitActivity({ phase: 'activationComplete', status: 'complete', step: 'activated' });
      return {
        ok: true,
        campaignState: cloneJson(state),
        binding: cloneJson(state.campaignChatBinding),
        introPacket: cloneJson(journal.introPacket),
        activationJournal: cloneJson(journal)
      };
    } catch (error) {
      const failedStep = currentStep || ACTIVATION_STEPS.find((step) => !completed(journal, step)) || 'prepared';
      const primaryError = {
        code: error?.code || 'DIRECTIVE_CAMPAIGN_ACTIVATION_FAILED',
        message: error?.message || String(error)
      };
      journal = {
        ...setStep(journal, failedStep, 'failed', { error: primaryError }, now),
        status: 'failed'
      };

      let promptCleanup = null;
      if (promptInstalledThisAttempt || completed(journal, 'promptInstalled')) {
        try {
          const cleared = await host.prompt.clear?.({
            binding: state.campaignChatBinding,
            reason: 'activation-failed',
            preservePacket: true
          });
          promptCleanup = {
            attempted: true,
            ok: cleared?.ok !== false,
            status: cleared?.status || 'cleared'
          };
        } catch (cleanupError) {
          promptCleanup = {
            attempted: true,
            ok: false,
            error: {
              code: cleanupError?.code || 'DIRECTIVE_PROMPT_CLEANUP_FAILED',
              message: cleanupError?.message || String(cleanupError)
            }
          };
        }
        journal = resetStep(journal, 'promptInstalled', {
          reason: 'Activation did not complete; prompt context must be reinstalled on retry.',
          cleanup: promptCleanup
        }, now);
        if (completed(journal, 'activated')) {
          journal = resetStep(journal, 'activated', {
            reason: 'Activation did not complete.'
          }, now);
        }
      }

      state = {
        ...state,
        campaign: {
          ...state.campaign,
          status: 'activationFailed'
        },
        campaignChatBinding: state.campaignChatBinding ? {
          ...state.campaignChatBinding,
          status: 'bound',
          promptInstalledAt: null,
          promptSuspendedAt: timestamp(now)
        } : state.campaignChatBinding,
        runtimeTracking: {
          ...state.runtimeTracking,
          promptContext: state.runtimeTracking?.promptContext ? {
            ...state.runtimeTracking.promptContext,
            status: promptCleanup?.ok === false ? 'cleanupFailed' : 'suspended'
          } : state.runtimeTracking?.promptContext
        },
        activationJournal: {
          ...journal,
          error: {
            ...primaryError,
            failedStep,
            promptCleanup: cloneJson(promptCleanup)
          }
        }
      };
      journal = cloneJson(state.activationJournal);
      try {
        await host.chat.updateBindingMetadata?.(state.campaignChatBinding);
      } catch {
        // The recovery journal remains authoritative when host metadata cannot be updated.
      }
      await persistStep(persist, state, 'Campaign activation failed; recovery journal saved.');
      emitActivity({
        phase: 'activationFailed',
        status: 'failed',
        step: failedStep,
        failedStep,
        error: primaryError
      });
      return {
        ok: false,
        error: cloneJson(journal.error),
        campaignState: cloneJson(state),
        activationJournal: cloneJson(journal)
      };
    }
  }

  async function rewriteIntro({
    campaignState,
    packageData,
    shipDataset = null,
    saveId = null,
    hostMessageId = null,
    reason = 'player-intro-reroll',
    signal = null
  } = {}) {
    let state = initializeCampaignRuntimeTracking(campaignState);
    let journal = createJournal(state, now);
    const recordedIntroMessageId = String(state.campaignChatBinding?.introMessageId || '').trim();
    const requestedIntroMessageId = String(hostMessageId || '').trim();
    const targetHostMessageId = requestedIntroMessageId || recordedIntroMessageId;

    if (!targetHostMessageId) {
      return {
        ok: false,
        reason: 'intro-message-unavailable',
        summary: 'Campaign intro cannot be rewritten because the intro message is not recorded.',
        campaignState: cloneJson(state),
        activationJournal: cloneJson(journal)
      };
    }
    if (recordedIntroMessageId && requestedIntroMessageId && recordedIntroMessageId !== requestedIntroMessageId) {
      return {
        ok: false,
        reason: 'not-campaign-intro-message',
        summary: 'Rewrite Intro only applies to the recorded campaign intro message.',
        campaignState: cloneJson(state),
        activationJournal: cloneJson(journal)
      };
    }
    if (typeof host.chat.appendAssistantMessageSwipe !== 'function') {
      return {
        ok: false,
        reason: 'assistant-swipes-unavailable',
        summary: 'This host does not expose assistant swipe updates.',
        campaignState: cloneJson(state),
        activationJournal: cloneJson(journal)
      };
    }
    if (await currentChatHasPlayerMessage(host)) {
      return {
        ok: false,
        reason: 'player-message-exists',
        summary: 'Campaign intro swipes are locked after the first player message.',
        campaignState: cloneJson(state),
        activationJournal: cloneJson(journal)
      };
    }

    function emitRewriteActivity(event = {}) {
      reportActivationActivity(host, {
        jobId: `campaignIntroRewrite:${journal.activationId}:${targetHostMessageId}`,
        activationId: journal.activationId,
        campaignId: state.campaign?.id || campaignState?.campaign?.id || null,
        saveId,
        hostMessageId: targetHostMessageId,
        ...event
      });
    }

    try {
      emitRewriteActivity({ phase: 'introRewriteGenerating', status: 'running' });
      const narrationContext = await resolveIntroNarrationContext(host);
      const generatedAt = timestamp(now);
      const existingRevisions = seedIntroRevisions({
        journal,
        campaignState: state,
        hostMessageId: targetHostMessageId,
        now
      });
      const revisionId = `${journal.activationId}:intro:${existingRevisions.length}`;
      const introVariantSeed = `${revisionId}:${generatedAt}`;
      const introPacket = await generateIntro({
        campaignState: state,
        packageData,
        shipDataset,
        generationRouter,
        narrationContext,
        variantSeed: introVariantSeed,
        variantReason: reason,
        signal
      });
      if (introPacket?.canceled === true) {
        emitRewriteActivity({
          phase: 'introRewriteCanceled',
          status: 'canceled',
          revisionId,
          error: introPacket.error || null
        });
        return {
          ok: false,
          canceled: true,
          reason: 'generation-canceled',
          summary: 'Campaign intro rewrite canceled.',
          campaignState: cloneJson(state),
          activationJournal: cloneJson(journal),
          introPacket: cloneJson(introPacket)
        };
      }
      emitRewriteActivity({ phase: 'introRewritePosting', status: 'running', revisionId });
      const swipe = await host.chat.appendAssistantMessageSwipe({
        hostMessageId: targetHostMessageId,
        text: prefixCampaignReplyHeader(introPacket.text, state),
        campaignId: state.campaign?.id || null,
        responseKind: 'campaignIntro',
        extra: {
          directive: {
            campaignId: state.campaign?.id || null,
            responseKind: 'campaignIntro',
            introRevisionId: revisionId,
            selectedIntroRevisionId: revisionId,
            introRevisionReason: reason
          }
        }
      });
      const revision = {
        id: revisionId,
        generatedAt,
        source: introPacket.source || 'unknown',
        providerId: introPacket.providerId || null,
        text: introPacket.text,
        narrationContext: cloneJson(introPacket.narrationContext || introNarrationContextSummary(narrationContext)),
        hostMessageId: swipe.hostMessageId || targetHostMessageId,
        swipeIndex: Number.isInteger(swipe.swipeIndex) ? swipe.swipeIndex : null,
        swipeCount: Number.isInteger(swipe.swipeCount) ? swipe.swipeCount : null,
        duplicate: swipe.duplicate === true,
        reason,
        variantSeed: introVariantSeed
      };
      journal = {
        ...cloneJson(journal),
        updatedAt: generatedAt,
        introPacket: {
          ...cloneJson(introPacket),
          generatedAt,
          revisionId,
          hostMessageId: revision.hostMessageId,
          swipeIndex: revision.swipeIndex,
          swipeCount: revision.swipeCount,
          variantSeed: introVariantSeed,
          selectedIntroRevisionId: revisionId
        },
        introRevisions: [
          ...existingRevisions,
          cloneJson(revision)
        ]
      };
      const next = {
        ...cloneJson(state),
        campaignChatBinding: {
          ...cloneJson(state.campaignChatBinding || {}),
          introMessageId: revision.hostMessageId || recordedIntroMessageId || targetHostMessageId
        },
        activationJournal: cloneJson(journal)
      };
      state = commitTrackedCampaignState({
        campaignState: state,
        nextCampaignState: next,
        delta: {
          source: 'campaignActivation',
          reason: 'Campaign intro rewritten as a selected assistant swipe.',
          summary: 'Campaign intro rewritten.',
          domains: ['activationJournal', 'campaignChatBinding'],
          stable: true
        },
        now
      });
      await host.chat.updateBindingMetadata?.(state.campaignChatBinding);
      await persistStep(persist, state, 'Campaign intro rewritten as a selected assistant swipe.');
      emitRewriteActivity({
        phase: 'introRewriteComplete',
        status: 'complete',
        revisionId,
        hostMessageId: revision.hostMessageId,
        swipeIndex: revision.swipeIndex
      });
      return {
        ok: true,
        summary: 'Campaign intro rewritten.',
        campaignState: cloneJson(state),
        introPacket: cloneJson(journal.introPacket),
        introRevision: cloneJson(revision),
        activationJournal: cloneJson(journal),
        swipe: cloneJson(swipe),
        saveId
      };
    } catch (error) {
      emitRewriteActivity({
        phase: 'introRewriteFailed',
        status: 'failed',
        error: {
          code: error?.code || 'DIRECTIVE_CAMPAIGN_INTRO_REWRITE_FAILED',
          message: error?.message || String(error)
        }
      });
      throw error;
    }
  }

  return {
    activate,
    rewriteIntro
  };
}

export const __campaignActivationCoordinatorTestHooks = Object.freeze({
  ACTIVATION_STEPS,
  CAMPAIGN_CHAT_FALLBACK_NAME,
  MAX_CAMPAIGN_CHAT_NAME_LENGTH,
  createJournal,
  setStep,
  resetStep,
  campaignChatName,
  currentChatHasPlayerMessage,
  seedIntroRevisions,
  normalizeIntroNarrationContext,
  introNarrationContextSummary,
  localIntroPacket
});
