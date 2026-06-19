import { runHostSidecarJobs } from '../../jobs/host-sidecar-orchestrator.mjs';

export const LUMIVERSE_RUNTIME_REQUEST_TYPE = 'directive.runtime.request';
export const LUMIVERSE_RUNTIME_RESPONSE_TYPE = 'directive.runtime.response';

const DEFAULT_PLAYER_INPUT = [
  'Take the prudent Starfleet course: protect civilians first, preserve evidence,',
  'keep the crew coordinated, and accept a modest delay when safety requires it.'
].join(' ');

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

function nowIso() {
  return new Date().toISOString();
}

function compactText(value, maxLength = 360) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function latestEntry(entries = []) {
  return Array.isArray(entries) && entries.length > 0 ? entries[entries.length - 1] : null;
}

function summarizeCommandLog(commandLog = {}) {
  const entries = Array.isArray(commandLog.entries) ? commandLog.entries : [];
  const summarizedEntries = entries.map((entry) => ({
    id: entry.id || null,
    type: entry.type || null,
    stardate: entry.stardate || null,
    sourceOutcomeId: entry.sourceOutcomeId || null,
    summary: compactText(entry.assistedSummary?.status === 'complete'
      ? entry.assistedSummary.summary
      : (entry.summaryInputs || []).join(' ')),
    assistedSummary: entry.assistedSummary?.status === 'complete'
      ? {
          title: entry.assistedSummary.title || null,
          summary: compactText(entry.assistedSummary.summary),
          highlights: (entry.assistedSummary.highlights || []).map((item) => compactText(item, 180)).slice(0, 4),
          providerId: entry.assistedSummary.providerId || null,
          model: entry.assistedSummary.model || null
        }
      : null,
    visibleConsequences: (entry.visibleConsequences || []).map((item) => compactText(item, 180)).slice(0, 4)
  }));
  const entry = latestEntry(summarizedEntries);
  return {
    count: summarizedEntries.length,
    entries: summarizedEntries,
    latest: entry || null
  };
}

function playerCrewRecord(campaignState, crewId) {
  if (crewId !== 'player-commander') {
    return null;
  }
  return {
    id: 'player-commander',
    name: campaignState.player?.name || 'Player Commander',
    rank: campaignState.player?.rank || null,
    billet: campaignState.player?.billet || null,
    species: campaignState.player?.species?.label || campaignState.player?.species || null,
    packageRole: campaignState.player?.role || null
  };
}

function summarizeCrew(campaignState = {}, activePackage = {}) {
  const packageCrew = new Map((activePackage.crew?.senior || []).map((crew) => [crew.id, crew]));
  const relationships = new Map((campaignState.relationships?.seniorCrew || []).map((entry) => [entry.crewId, entry]));
  const seniorCrewIds = Array.isArray(campaignState.crew?.seniorCrewIds) ? campaignState.crew.seniorCrewIds : [];
  const seniorCrew = seniorCrewIds.map((crewId) => {
    const crew = playerCrewRecord(campaignState, crewId) || packageCrew.get(crewId) || { id: crewId, name: crewId };
    return {
      id: crew.id || crewId,
      name: crew.name || crew.id || crewId,
      rank: crew.rank || null,
      billet: crew.billet || null,
      species: crew.species || null,
      role: crew.packageRole || crew.role || null,
      continuity: relationships.has(crewId)
        ? 'Tracked behind the scenes'
        : crewId === 'player-commander'
          ? 'Player character'
          : 'Initialized'
    };
  });
  return {
    seniorCount: seniorCrew.length,
    seniorCrew,
    relationshipDimensions: Array.isArray(campaignState.crew?.relationshipModel?.dimensions)
      ? [...campaignState.crew.relationshipModel.dimensions]
      : [],
    rawValuesHidden: campaignState.crew?.relationshipModel?.rawValuesHidden !== false,
    casualties: Array.isArray(campaignState.crew?.casualties) ? [...campaignState.crew.casualties] : [],
    reassignments: Array.isArray(campaignState.crew?.reassignments) ? [...campaignState.crew.reassignments] : []
  };
}

function summarizeShip(campaignState = {}, activePackage = {}) {
  const ship = campaignState.ship || {};
  const packageShip = activePackage.ship || {};
  return {
    id: ship.id || packageShip.id || null,
    name: ship.name || packageShip.name || null,
    class: ship.class || packageShip.class || null,
    registry: ship.registry || packageShip.registry || null,
    affiliation: packageShip.affiliation || null,
    commandStructure: {
      commandingOfficer: packageShip.commandStructure?.commandingOfficer || null,
      playerBillet: packageShip.commandStructure?.playerBillet || null,
      actingXoBeforePlayer: packageShip.commandStructure?.actingXoBeforePlayer || null
    },
    condition: ship.condition || packageShip.openingCondition || null,
    damage: Array.isArray(ship.damage) ? [...ship.damage] : [],
    activeRestrictions: Array.isArray(ship.activeRestrictions) ? [...ship.activeRestrictions] : [],
    technicalDebt: Array.isArray(ship.technicalDebt)
      ? [...ship.technicalDebt]
      : Array.isArray(packageShip.systems?.knownTechnicalDebt)
        ? [...packageShip.systems.knownTechnicalDebt]
        : []
  };
}

function summarizeCampaign(campaignState) {
  if (!isObject(campaignState)) {
    return null;
  }
  return {
    id: campaignState.campaign?.id || null,
    title: campaignState.campaign?.title || null,
    playerName: campaignState.player?.name || null,
    shipName: campaignState.ship?.name || null,
    stardate: campaignState.campaign?.currentStardate ?? campaignState.campaign?.openingStardate ?? null,
    activeMissionId: campaignState.mission?.activeMissionId || null,
    activeMissionGraphId: campaignState.mission?.activeMissionGraphId || null,
    activePhaseId: campaignState.mission?.activePhaseId || null,
    simulationMode: campaignState.settings?.simulationMode || null,
    commandLog: summarizeCommandLog(campaignState.commandLog || {}),
    openOrders: {
      activeAssignmentId: campaignState.sideMissions?.activeAssignmentId || null,
      intervals: (campaignState.sideMissions?.openOrdersIntervals || []).map((interval) => ({
        id: interval.id || null,
        title: interval.title || null,
        status: interval.status || null,
        requiredCompletionCount: Number(interval.requiredCompletionCount || 0),
        totalAssignmentCount: Number(interval.totalAssignmentCount || 0),
        completedAssignmentIds: Array.isArray(interval.completedAssignmentIds)
          ? [...interval.completedAssignmentIds]
          : [],
        directCompletionCount: Number(interval.directCompletionCount || 0),
        delegatedCompletionCount: Number(interval.delegatedCompletionCount || 0),
        allAssignmentsCompleted: interval.allAssignmentsCompleted === true,
        overextended: interval.overextended === true,
        playerSummary: compactText(interval.playerSummary || '', 240)
      })),
      availableAssignments: (campaignState.sideMissions?.availableAssignments || []).map((assignment) => ({
        id: assignment.id || null,
        title: assignment.title || null,
        status: assignment.status || null,
        sceneStatus: assignment.sceneStatus || null,
        sceneBeatCount: Array.isArray(assignment.sceneBeats) ? assignment.sceneBeats.length : 0,
        latestSceneBeat: Array.isArray(assignment.sceneBeats) && assignment.sceneBeats.length > 0
          ? compactText(assignment.sceneBeats.at(-1)?.playerSummary || '', 240)
          : null,
        playerSummary: compactText(assignment.playerSummary || '', 240),
        sceneBrief: assignment.sceneBrief ? {
          title: assignment.sceneBrief.title || null,
          sceneStatus: assignment.sceneBrief.sceneStatus || null,
          sceneQuestion: compactText(assignment.sceneBrief.sceneQuestion || '', 240),
          supportingContext: (assignment.sceneBrief.supportingContext || []).map((item) => compactText(item, 180)).slice(0, 3),
          expectedOutputs: (assignment.sceneBrief.expectedOutputs || []).map((item) => compactText(item, 180)).slice(0, 4)
        } : null
      })),
      completedAssignments: (campaignState.sideMissions?.completedAssignments || []).map((assignment) => ({
        id: assignment.id || null,
        title: assignment.title || null,
        status: assignment.status || null,
        playerSummary: compactText(assignment.playerSummary || '', 240)
      })).slice(-4)
    },
    visiblePressureCount: Array.isArray(campaignState.pressureLedger?.records)
      ? campaignState.pressureLedger.records.filter((record) => record?.visibleToPlayer !== false).length
      : 0
  };
}

function summarizeOpenOrdersReview(review) {
  if (!isObject(review)) {
    return null;
  }
  return {
    intervalId: review.intervalId || null,
    intervalTitle: review.intervalTitle || null,
    candidates: (review.candidates || []).map((candidate) => ({
      id: candidate.id || null,
      pressureId: candidate.pressureId || null,
      pressureTitle: candidate.pressureTitle || null,
      sideAssignmentId: candidate.sideAssignmentId || null,
      sideAssignmentTitle: candidate.sideAssignmentTitle || null,
      intervalId: candidate.intervalId || null,
      intervalTitle: candidate.intervalTitle || null,
      reason: compactText(candidate.reason || '', 240)
    })).slice(0, 3),
    waiting: (review.waiting || []).map((entry) => ({
      pressureId: entry.pressureId || null,
      pressureTitle: entry.pressureTitle || null,
      reason: compactText(entry.reason || '', 180)
    })).slice(0, 3),
    suppressed: (review.suppressed || []).map((entry) => ({
      pressureId: entry.pressureId || null,
      pressureTitle: entry.pressureTitle || null,
      reason: compactText(entry.reason || '', 180)
    })).slice(0, 3)
  };
}

function summarizeStarships(starships) {
  if (!isObject(starships)) {
    return null;
  }
  const packages = Array.isArray(starships.packages) ? starships.packages : [];
  const packageRows = packages.map((entry) => ({
    packageId: entry.packageId || null,
    title: entry.title || null,
    draftCount: Number(entry.counts?.drafts || 0),
    saveCount: Number(entry.counts?.saves || 0),
    loadLatestSave: entry.actions?.loadLatestSave || null,
    resumeDraft: entry.actions?.resumeDraft || null
  }));
  return {
    activePackageId: starships.activePackageId || null,
    activeSaveId: starships.activeSaveId || null,
    packageCount: packageRows.length,
    draftCount: packageRows.reduce((sum, entry) => sum + entry.draftCount, 0),
    saveCount: packageRows.reduce((sum, entry) => sum + entry.saveCount, 0),
    packages: packageRows
  };
}

function summarizeOutcome(turnPacket) {
  const outcome = turnPacket?.outcomePacket || turnPacket?.provisionalOutcome || null;
  if (!isObject(outcome)) {
    return null;
  }
  return {
    id: outcome.id || null,
    resultBand: outcome.resultBand || null,
    summary: compactText(outcome.summary || ''),
    warningCount: Array.isArray(outcome.warnings) ? outcome.warnings.length : 0
  };
}

function summarizeNarration(value) {
  if (!isObject(value)) {
    return null;
  }
  if (value.ok === false || value.error) {
    return {
      ok: false,
      sourceOutcomeId: value.error?.sourceOutcomeId || null,
      providerId: value.error?.providerId || null,
      error: value.error?.message || 'Narration failed'
    };
  }
  const narration = value.narration || value;
  if (!isObject(narration)) {
    return null;
  }
  return {
    ok: true,
    sourceOutcomeId: narration.sourceOutcomeId || null,
    providerId: narration.providerId || null,
    text: compactText(narration.text || '', 900)
  };
}

function summarizeActionResult(result = {}) {
  const view = result.view || (result.kind === 'directive.runtimeView' ? result : null);
  const turnPacket = result.turnPacket || result.pendingDirectorTurn || null;
  return {
    save: result.save ? {
      id: result.save.id || null,
      name: result.save.name || null,
      slotType: result.save.slotType || null,
      current: result.save.current === true
    } : null,
    outcome: summarizeOutcome(turnPacket),
    provisionalOutcome: summarizeOutcome(result.provisionalOutcome ? { provisionalOutcome: result.provisionalOutcome } : null),
    narration: summarizeNarration(result.narrationResult || result),
    commandLogSummary: result.commandLogSummaryResult ? {
      ok: result.commandLogSummaryResult.ok === true,
      status: result.commandLogSummaryResult.sidecarResult?.status || null,
      strategy: result.commandLogSummaryResult.batchResult?.strategy || null,
      summary: compactText(result.commandLogSummaryResult.assistedSummary?.summary || '', 360),
      error: result.commandLogSummaryResult.error
        ? {
            code: result.commandLogSummaryResult.error.code || null,
            message: result.commandLogSummaryResult.error.message || String(result.commandLogSummaryResult.error)
          }
        : null
    } : null,
    autosave: result.autosave ? {
      ok: result.autosave.ok === true,
      saveId: result.autosave.save?.id || null
    } : null,
    sceneBeat: result.sceneBeat ? {
      id: result.sceneBeat.id || null,
      assignmentId: result.sceneBeat.assignmentId || null,
      sequence: Number(result.sceneBeat.sequence || 0),
      approach: result.sceneBeat.approach || null,
      playerSummary: compactText(result.sceneBeat.playerSummary || '', 240)
    } : null,
    sidecars: result.kind === 'directive.sidecarBatchResult' ? {
      hostId: result.hostId || null,
      strategy: result.strategy || (result.concurrent ? 'concurrent' : 'sequential'),
      concurrent: result.concurrent === true,
      results: (result.results || []).map((entry) => ({
        jobId: entry.jobId || null,
        type: entry.type || null,
        status: entry.status || null,
        playerVisibleSummary: entry.playerVisibleSummary || null,
        packet: typeof entry.packet === 'string'
          ? compactText(entry.packet, 360)
          : cloneJson(entry.packet),
        error: entry.error ? {
          code: entry.error.code || null,
          message: entry.error.message || String(entry.error)
        } : null
      }))
    } : null,
    activeSaveId: view?.activeSaveId || null,
    activeScreen: view?.activeScreen || null
  };
}

export function summarizeLumiverseRuntimeView(view) {
  if (!isObject(view)) {
    return {
      kind: 'directive.lumiverseRuntimeSummary',
      initialized: false
    };
  }
  return {
    kind: 'directive.lumiverseRuntimeSummary',
    initialized: true,
    activeTab: view.activeTab || null,
    activeScreen: view.activeScreen || null,
    activePackageId: view.activePackageId || null,
    activeSaveId: view.activeSaveId || null,
    host: view.host ? {
      id: view.host.id || null,
      displayName: view.host.displayName || null
    } : null,
    starships: summarizeStarships(view.starships),
    campaign: summarizeCampaign(view.campaignState),
    openOrdersReview: summarizeOpenOrdersReview(view.openOrdersReview),
    crew: summarizeCrew(view.campaignState || {}, view.activePackage || {}),
    ship: summarizeShip(view.campaignState || {}, view.activePackage || {}),
    pendingOutcome: summarizeOutcome(view.pendingDirectorTurn),
    lastOutcome: summarizeOutcome(view.lastDirectorTurn),
    lastNarration: summarizeNarration(view.lastNarrationResult),
    storageDiagnostics: view.storageDiagnostics ? {
      status: view.storageDiagnostics.status || null,
      ok: view.storageDiagnostics.ok !== false,
      counts: cloneJson(view.storageDiagnostics.counts || null)
    } : null,
    lastError: view.lastError ? {
      message: view.lastError.message || String(view.lastError)
    } : null
  };
}

function createQuickStartPatch(options = {}) {
  const name = options.name?.trim() || 'Talia Serrin';
  return {
    activeStep: 'review',
    input: {
      identity: {
        name,
        pronounsOrAddress: options.pronounsOrAddress?.trim() || 'she/her',
        speciesId: options.speciesId?.trim() || 'human',
        ageBandId: options.ageBandId?.trim() || 'mid-career',
        appearance: options.appearance?.trim()
          || 'A composed Starfleet officer with a quiet voice and a habit of watching the room before speaking.'
      },
      service: {
        careerBackgroundId: options.careerBackgroundId?.trim() || 'tactical-security',
        formativeExperienceId: options.formativeExperienceId?.trim() || 'dominion-war-fleet-service',
        assignmentReasonId: options.assignmentReasonId?.trim() || 'experienced-outsider-transfer'
      },
      personality: {
        traits: {
          insight: options.insightTraitId?.trim() || 'perceptive',
          connection: options.connectionTraitId?.trim() || 'candid',
          execution: options.executionTraitId?.trim() || 'decisive'
        },
        flawId: options.flawId?.trim() || 'impatient'
      },
      dossier: {
        detailLevel: options.detailLevel?.trim() || 'Standard',
        briefBiography: options.briefBiography?.trim()
          || `${name} is a tactical-minded Starfleet Commander whose wartime service taught her to make quick decisions without treating lives as expendable.`,
        publicReputation: options.publicReputation?.trim()
          || `${name} is known as a decisive and observant officer whose restraint has improved since the war.`
      }
    }
  };
}

function createSidecarSource(summary, actionCount) {
  const campaign = summary?.campaign || {};
  return {
    hostId: summary?.host?.id || 'lumiverse',
    campaignId: campaign.id || summary?.activePackageId || 'directive-campaign',
    saveId: summary?.activeSaveId || null,
    turnId: summary?.lastOutcome?.id || summary?.pendingOutcome?.id || `runtime-action-${actionCount || 0}`,
    revision: actionCount || 0
  };
}

function createDefaultSidecarJobs(summary, actionCount) {
  const source = createSidecarSource(summary, actionCount);
  const snapshot = {
    runtimeSummary: cloneJson(summary)
  };
  return [
    {
      id: `sidecar-continuity-${source.revision}`,
      type: 'continuityTracker',
      source,
      snapshot,
      request: {
        prompt: 'Review the latest player-visible Directive runtime summary for continuity risks. Return concise player-safe observations only.'
      },
      policy: {
        timeoutMs: 30000,
        mayProposeState: false
      }
    },
    {
      id: `sidecar-crew-${source.revision}`,
      type: 'crewDirector',
      source,
      snapshot,
      request: {
        prompt: 'Review the latest player-visible Directive runtime summary for crew-context opportunities. Return concise player-safe observations only.'
      },
      policy: {
        timeoutMs: 30000,
        mayProposeState: false
      }
    }
  ];
}

function viewFromResult(result) {
  if (result?.kind === 'directive.runtimeView') return result;
  return result?.view || null;
}

async function runRuntimeAction({ runtimeApp, host, state }, action, params = {}) {
  switch (action) {
    case 'initialize':
      return runtimeApp.initialize();
    case 'getView':
      return runtimeApp.getCurrentView({
        tabId: params.tabId || 'starships'
      });
    case 'startCreatorDraft':
      return runtimeApp.startCreatorDraft({
        packageId: params.packageId || null
      });
    case 'saveCreatorDraft':
      return runtimeApp.saveCreatorDraft({
        patch: params.patch,
        reason: params.reason || 'manualSave'
      });
    case 'acceptCreatorDraftAndStartCampaign':
      return runtimeApp.acceptCreatorDraftAndStartCampaign({
        simulationMode: params.simulationMode || 'Command'
      });
    case 'startQuickCampaign':
      await runtimeApp.startCreatorDraft({
        packageId: params.packageId || null
      });
      await runtimeApp.saveCreatorDraft({
        patch: createQuickStartPatch(params.character || {}),
        reason: 'lumiverseQuickStart'
      });
      return runtimeApp.acceptCreatorDraftAndStartCampaign({
        simulationMode: params.simulationMode || 'Command'
      });
    case 'loadGame':
      return runtimeApp.loadGame({
        saveId: requireNonEmptyString(params.saveId, 'saveId')
      });
    case 'saveCurrentGame':
      return runtimeApp.saveCurrentGame({
        summary: params.summary || 'Lumiverse manual save.'
      });
    case 'saveCurrentGameAs':
      return runtimeApp.saveCurrentGameAs({
        name: params.name || null,
        branchFrom: params.branchFrom || null
      });
    case 'previewDirectorTurn':
      return runtimeApp.previewDirectorTurn({
        playerInput: requireNonEmptyString(params.playerInput || DEFAULT_PLAYER_INPUT, 'playerInput'),
        sceneSnapshotOverrides: isObject(params.sceneSnapshotOverrides) ? params.sceneSnapshotOverrides : {},
        turnId: params.turnId || null
      });
    case 'commitProvisionalDirectorTurn':
      return runtimeApp.commitProvisionalDirectorTurn({
        spendTrack: params.spendTrack || null,
        confirmWarnings: params.confirmWarnings === true,
        confirmedWarningIds: Array.isArray(params.confirmedWarningIds) ? params.confirmedWarningIds : [],
        generateNarration: params.generateNarration !== false,
        generateCommandLogSummary: params.generateCommandLogSummary !== false
      });
    case 'runDirectorTurn': {
      const turn = await runtimeApp.runDirectorTurn({
        playerInput: requireNonEmptyString(params.playerInput || DEFAULT_PLAYER_INPUT, 'playerInput'),
        sceneSnapshotOverrides: isObject(params.sceneSnapshotOverrides) ? params.sceneSnapshotOverrides : {},
        turnId: params.turnId || null
      });
      if (params.generateNarration === false) {
        return turn;
      }
      const narration = await runtimeApp.generateNarrationForLastTurn();
      return {
        ...turn,
        narrationResult: narration,
        view: narration.view || turn.view
      };
    }
    case 'generateNarrationForLastTurn':
      return runtimeApp.generateNarrationForLastTurn();
    case 'retryNarrationForLastTurn':
      return runtimeApp.retryNarrationForLastTurn();
    case 'commitOpenOrdersCandidateReview':
      return runtimeApp.commitOpenOrdersCandidateReview({
        candidateId: params.candidateId || null,
        sideAssignmentId: params.sideAssignmentId || null,
        decision: params.decision || 'start',
        reason: params.reason || null,
        maxCandidates: Number.isFinite(Number(params.maxCandidates)) ? Number(params.maxCandidates) : 3
      });
    case 'runSideMissionProviderAssistance':
      return runtimeApp.runSideMissionProviderAssistance({
        roleId: params.roleId || undefined,
        candidateId: params.candidateId || null,
        opportunityId: params.opportunityId || null,
        requestId: params.requestId || null,
        maxCandidates: Number.isFinite(Number(params.maxCandidates)) ? Number(params.maxCandidates) : 2
      });
    case 'runSidecars': {
      if (!host) {
        throw new Error('Lumiverse sidecars require a host.');
      }
      const runtime = ensureRuntimeState(state);
      const summary = runtime.lastView;
      if (!summary?.initialized) {
        throw new Error('Initialize Directive runtime before running sidecars.');
      }
      const jobs = Array.isArray(params.jobs) && params.jobs.length > 0
        ? params.jobs
        : createDefaultSidecarJobs(summary, runtime.actionCount);
      const current = createSidecarSource(summary, runtime.actionCount);
      return runHostSidecarJobs({
        host,
        jobs,
        current,
        now: params.now || null,
        forceConcurrent: params.forceConcurrent ?? null
      });
    }
    case 'commitOpenOrdersAssignmentResolution':
      return runtimeApp.commitOpenOrdersAssignmentResolution({
        assignmentId: params.assignmentId || null,
        outcomeBand: params.outcomeBand || 'Success',
        summary: params.summary || null,
        reason: params.reason || 'Player resolved this Open Orders assignment from Lumiverse.',
        assignmentMode: params.assignmentMode || 'direct',
        delegatedTo: params.delegatedTo || null
      });
    case 'startOpenOrdersAssignmentScene':
      return runtimeApp.startOpenOrdersAssignmentScene({
        assignmentId: params.assignmentId || null,
        reason: params.reason || 'Player opened this Open Orders assignment from Lumiverse.'
      });
    case 'commitOpenOrdersAssignmentSceneBeat':
      return runtimeApp.commitOpenOrdersAssignmentSceneBeat({
        assignmentId: params.assignmentId || null,
        playerIntent: params.playerIntent || null,
        approach: params.approach || 'coordination',
        reason: params.reason || 'Player advanced this Open Orders assignment scene from Lumiverse.'
      });
    default:
      throw new Error(`Unknown Directive runtime action "${action || 'unknown'}"`);
  }
}

function ensureRuntimeState(state) {
  state.runtime = state.runtime || {
    initialized: false,
    busy: false,
    actionCount: 0,
    lastAction: null,
    lastActionAt: null,
    lastResult: null,
    lastView: null,
    lastError: null
  };
  return state.runtime;
}

function updateRuntimeSuccess(state, action, result) {
  const runtime = ensureRuntimeState(state);
  const view = viewFromResult(result);
  const summary = view
    ? summarizeLumiverseRuntimeView(view)
    : cloneJson(runtime.lastView || summarizeLumiverseRuntimeView(null));
  runtime.initialized = runtime.initialized || summary.initialized === true;
  runtime.actionCount += 1;
  runtime.lastAction = action;
  runtime.lastActionAt = nowIso();
  runtime.lastResult = summarizeActionResult(result);
  runtime.lastView = summary;
  runtime.lastError = null;
  return {
    result: cloneJson(runtime.lastResult),
    summary: cloneJson(summary)
  };
}

function updateRuntimeError(state, action, error) {
  const runtime = ensureRuntimeState(state);
  runtime.actionCount += 1;
  runtime.lastAction = action;
  runtime.lastActionAt = nowIso();
  runtime.lastError = {
    message: error?.message || String(error)
  };
  return cloneJson(runtime.lastError);
}

export function createLumiverseRuntimeBridge({
  host = null,
  runtimeApp,
  state,
  sendToFrontend,
  logger = null
} = {}) {
  requireObject(runtimeApp, 'runtimeApp');
  requireObject(state, 'state');
  if (typeof sendToFrontend !== 'function') {
    throw new Error('sendToFrontend must be a function');
  }
  ensureRuntimeState(state);

  async function handleRuntimeRequest(payload, userId) {
    if (!payload || typeof payload !== 'object' || payload.type !== LUMIVERSE_RUNTIME_REQUEST_TYPE) {
      return false;
    }
    if (!userId) {
      logger?.warn?.('[Directive] Ignored Lumiverse runtime request without a user id.');
      return true;
    }

    const requestId = payload.requestId || null;
    const action = requireNonEmptyString(payload.action, 'runtime action');
    const params = isObject(payload.params) ? payload.params : {};
    const runtime = ensureRuntimeState(state);
    runtime.busy = true;
    try {
      const actionResult = await runRuntimeAction({
        runtimeApp,
        host,
        state
      }, action, params);
      const { result, summary } = updateRuntimeSuccess(state, action, actionResult);
      sendToFrontend({
        type: LUMIVERSE_RUNTIME_RESPONSE_TYPE,
        payload: {
          requestId,
          action,
          ok: true,
          result,
          summary
        }
      }, userId);
    } catch (error) {
      const runtimeError = updateRuntimeError(state, action, error);
      logger?.warn?.('[Directive] Lumiverse runtime action failed.', {
        action,
        message: runtimeError.message
      });
      sendToFrontend({
        type: LUMIVERSE_RUNTIME_RESPONSE_TYPE,
        payload: {
          requestId,
          action,
          ok: false,
          error: runtimeError,
          summary: cloneJson(ensureRuntimeState(state).lastView)
        }
      }, userId);
    } finally {
      runtime.busy = false;
    }
    return true;
  }

  return {
    handleRuntimeRequest,
    getSummary() {
      return cloneJson(ensureRuntimeState(state).lastView || summarizeLumiverseRuntimeView(null));
    }
  };
}
