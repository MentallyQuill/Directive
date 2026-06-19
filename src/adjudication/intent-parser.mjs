function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

export function parseIntent(sceneSnapshot) {
  const rawInput = String(sceneSnapshot?.playerInput || '');
  const input = rawInput.toLowerCase();
  const activePhaseId = sceneSnapshot?.activePhaseId || sceneSnapshot?.phaseId || '';

  const wantsPassengerTransfer = includesAny(input, ['passenger', 'passengers', 'medical', 'medically vulnerable', 'evacuate', 'transfer']);
  const wantsEvidencePreserved = includesAny(input, ['inspection', 'falsified', 'fraud', 'evidence', 'record', 'records']);
  const wantsOwnerAccountability = includesAny(input, ['owner', 'formal inquiry', 'inquiry', 'accountability', 'accountable', 'obligation']);
  const limitsRepair = includesAny(input, ['impulse', 'stabilization', 'stabilize', 'warp restart', 'limited repair']);
  const acceptsDelay = includesAny(input, ['delay', 'log', 'logged', 'accepting', 'accept responsibility']);
  const missionDeparture = includesAny(input, ['leave the mission area', 'depart the mission area', 'set course away', 'abandon', 'fly out']);
  const impossibleOrUnsupported = includesAny(input, ['without authorization', 'without access', 'no access', 'classified asset', 'override starfleet command', 'order q', 'teleport the ship', 'time travel']);
  const hasCredibleEvidence = includesAny(input, ['evidence', 'sensor', 'verified', 'distress', 'signal', 'proof', 'coordinates']);
  const hasImminentHarm = includesAny(input, ['imminent', 'immediate', 'minutes', 'lives at risk', 'warp core breach', 'attack underway']);
  const hasFeasiblePlan = includesAny(input, ['return', 'leave a team', 'delegate', 'probe', 'buoy', 'relay', 'limited deviation', 'set a time limit']);
  const asksForLimitedAlternative = includesAny(input, ['probe', 'buoy', 'relay', 'sensor sweep', 'remote scan', 'dispatch a shuttle', 'limited alternative']);
  const reportsAboard = includesAny(input, ['report', 'reporting', 'aboard', 'ready room', 'captain', 'whitaker']);
  const respectsWorkingProcess = includesAny(input, ['let the transfer complete', 'allow the transfer', 'do not interrupt', 'without interrupting', 'working process', 'working routine', 'no ceremony', 'no disruption', 'finish docking', 'maintain routine']);
  const asksForHandoff = includesAny(input, ['handoff', 'bronn', 'acting xo', 'status', 'brief', 'standing orders', 'current routine', 'watch bill']);
  const immediateInspection = includesAny(input, ['inspect', 'inspection', 'tour', 'walk the deck', 'surprise inspection', 'review every station']);
  const namesPersonalValue = includesAny(input, ['value', 'principle', 'no life is expendable', 'crew deserves the truth', 'mission comes first', 'truth', 'life is expendable', 'loyalty', 'loyal']);
  const defersPersonalValue = includesAny(input, ['defer', 'later', 'not yet', 'no personal value', 'keep it private']);
  const definesExecutiveAuthority = includesAny(input, ['executive authority', 'authority', 'recommendation', 'disagree privately', 'support publicly', 'delegate', 'responsibility']);
  const setsReadinessPriorities = includesAny(input, ['readiness', 'priority', 'priorities', 'prioritize', 'schedule', 'sequence', 'stagger', 'combine', 'conference']);
  const delegatesReadinessWork = includesAny(input, ['delegate', 'delegated', 'assign', 'assigned', 'own', 'owns', 'ownership', 'owner', 'owners', 'department lead', 'department leads', 'named owner', 'named owners', 'exception routing', 'follow-up']);
  const acceptsReadinessRisk = includesAny(input, ['risk', 'accepted risk', 'accept the risk', 'accepting risk', 'defer', 'deferred', 'delay', 'tradeoff', 'cost', 'limitation', 'remaining concern']);
  const approvesFlightProfile = includesAny(input, ['kieran', 'flight', 'helm', 'pilot', 'flight profile', 'maneuver']);
  const formalizesOpsCoordination = includesAny(input, ['priya', 'ops', 'operations', 'coordination', 'routing', 'schedule', 'channels', 'handoff']);
  const definesScienceThreshold = includesAny(input, ['rowan', 'science', 'sensor', 'sensors', 'anomaly', 'threshold', 'data', 'findings', 'investigation']);
  const protectsMedicalReadiness = includesAny(input, ['miriam', 'medical', 'fatigue', 'rest', 'triage', 'crew health', 'health restriction', 'medical restriction']);
  const protectsEngineeringReadiness = includesAny(input, ['imani', 'engineering', 'repair', 'repairs', 'documentation', 'technical debt', 'workaround', 'workarounds', 'load test', 'combined-load']);
  const setsFallbackProcedure = includesAny(input, ['fallback', 'fallback-command', 'emergency command', 'auxiliary control', 'bridge loss', 'chain of command', 'command survivability']);
  const standardizesFallbackProcedure = includesAny(input, ['standardize', 'standardized', 'single procedure', 'shipwide', 'common procedure', 'unified procedure', 'training pass', 'repeat the drill']);
  const usesBronnFailureConditions = includesAny(input, ['bronn', 'failure condition', 'failure conditions', 'security doctrine', 'security drill', 'safeguard', 'safeguards']);
  const assignsCertificateRemediation = includesAny(input, ['certificate', 'certificates', 'command-network', 'network certificate', 'identity', 'identity token', 'remediate', 'remediation', 'patch', 'fix', 'audit']);
  const setsTemporaryFallbackProtocol = includesAny(input, ['temporary protocol', 'temporary procedure', 'interim protocol', 'temporary policy', 'until repaired', 'until remediation', 'provisional policy']);
  const defersFallbackRemediation = includesAny(input, ['defer remediation', 'defer the fix', 'defer the patch', 'later repair', 'after arrival', 'accept the certificate issue', 'log the limitation']);
  const buildsFallbackConsensus = includesAny(input, ['consensus', 'department signoff', 'department sign-off', 'all departments', 'department heads', 'cross-department', 'walkthrough']);
  const contactsKieran = includesAny(input, ['kieran', 'helm', 'flight']);
  const contactsPriya = includesAny(input, ['priya', 'ops', 'operations']);
  const contactsBronn = includesAny(input, ['bronn', 'security', 'tactical']);
  const contactsRowan = includesAny(input, ['rowan', 'science', 'sensor', 'sensors']);
  const contactsMiriam = includesAny(input, ['miriam', 'medical', 'sickbay', 'fatigue']);
  const contactsImani = includesAny(input, ['imani', 'engineering', 'repair', 'technical']);
  const setsConcernEscalationExpectation = includesAny(input, ['bring concerns', 'raise concerns', 'escalate', 'threshold', 'expectation', 'expectations', 'standing expectation', 'standing expectations']);
  const delegatesCommandRhythm = includesAny(input, ['delegate', 'delegates', 'assign', 'owners', 'ownership', 'follow-up', 'check-in', 'check in', 'debrief']);
  const invitesDissent = includesAny(input, ['dissent', 'objection', 'objections', 'challenge me', 'push back', 'disagree', 'tell me when']);
  const setsCommandBoundaries = includesAny(input, ['boundary', 'boundaries', 'deadline', 'abort', 'limit', 'limits', 'standard', 'standards']);
  const assignsHesperusFollowup = includesAny(input, ['hesperus', 'follow-up', 'followup', 'follow up', 'assign', 'assigned', 'route', 'record', 'log']);
  const assignsHesperusEngineering = includesAny(input, ['imani', 'engineering', 'repair', 'repairs', 'technical', 'injector', 'documentation']);
  const assignsHesperusMedical = includesAny(input, ['miriam', 'medical', 'passenger', 'passengers', 'fatigue', 'displaced']);
  const assignsHesperusLegal = includesAny(input, ['priya', 'legal', 'admin', 'administrative', 'inquiry', 'owner', 'inspection fraud', 'fraud']);
  const assignsHesperusFlight = includesAny(input, ['kieran', 'flight', 'arrival plan', 'schedule', 'course', 'recalculate']);
  const preservesEscapePodData = includesAny(input, ['rowan', 'escape pod', 'escape-pod', 'subspace data', 'scientific data', 'preserve data']);
  const startsCombinedLoadTest = includesAny(input, ['combined-load', 'combined load', 'load test', 'integrated test', 'shakedown test', 'high sensor load']);
  const runsStagedLoadTest = includesAny(input, ['staged', 'sequence', 'sequenced', 'cautious', 'stepwise', 'controlled']);
  const continuesUnderReducedRedundancy = includesAny(input, ['continue', 'press on', 'reduced redundancy', 'under reduced redundancy', 'keep going']);
  const pausesCombinedLoadTest = includesAny(input, ['pause', 'hold', 'stop the test', 'delay the test', 'lose schedule margin', 'stand down']);
  const shiftsCombinedLoadControl = includesAny(input, ['shift control', 'transfer control', 'operations control', 'engineering control', 'another department']);
  const acceptsImaniWorkaround = includesAny(input, ['imani workaround', 'temporary workaround', 'accept the workaround', 'use the workaround']);
  const reportsIncompleteTesting = includesAny(input, ['incomplete', 'report incomplete', 'report the limitation', 'honest report', 'log the limitation', 'readiness limitation']);
  const hidesCombinedLoadRisk = includesAny(input, ['hide', 'conceal', 'do not report', "don't report", 'technically passed', 'quietly pass']);
  const setsKieranAbortCriteria = includesAny(input, ['abort criteria', 'abort condition', 'abort conditions', 'bounded flight', 'flight limit']);
  const reportsFinalReadinessHonestly = includesAny(input, ['report', 'honest', 'honestly', 'caveat', 'limitation', 'uncertainty', 'incomplete', 'tell asterion', 'readiness status']);
  const concealsFinalRisk = includesAny(input, ['hide', 'conceal', 'do not report', "don't report", 'clean report', 'omit the limitation', 'no caveat']);
  const requestsCaptainSupport = includesAny(input, ['support', 'backing', 'when we disagree', 'disagree publicly', 'private disagreement', 'public support', 'captain support', 'clear authority']);
  const affirmsProvisionalRoutine = includesAny(input, ['provisional routine', 'routine should become permanent', 'keep the routine', 'formalize the routine', 'permanent', 'formalize']);
  const closesActingXoService = includesAny(input, ['bronn', 'acting xo', 'acting-xo', 'affirm', 'formally close', 'close the handoff', 'acting service']);
  const addressesCrewBeforeArrival = includesAny(input, ['address the crew', 'crew address', 'brief the crew', 'departmental orders', 'department orders', 'orders to departments', 'shipwide']);
  const namesUnresolvedStrain = includesAny(input, ['strain', 'unresolved', 'hidden strain', 'carrying strain', 'support needed', 'department pressure']);
  const chapter1OpeningPhase = ['initial-reception', 'convoy-approach', 'first-posture-decision'].includes(activePhaseId);
  const requestsChapter1Counsel = includesAny(input, ['recommendation', 'recommendations', 'advice', 'advise', 'counsel', 'options', 'what am i overlooking', 'what are we missing', 'risk?', 'assessment', 'objections', 'protocol']);
  const holdsAtRange = includesAny(input, ['hold range', 'hold position', 'stand off', 'standoff', 'stay at range', 'remain at range', 'keep distance', 'do not close']);
  const closesOnConvoyRaw = includesAny(input, ['take us in', 'close', 'approach', 'move in', 'intercept']);
  const closesOnConvoy = closesOnConvoyRaw && !holdsAtRange;
  const startsRemoteVerification = includesAny(input, ['verify', 'authenticate', 'authentication', 'confirm', 'check', 'scan', 'sensors', 'probe', 'remote', 'reconnaissance']);
  const preparesRescue = includesAny(input, ['rescue', 'survivor', 'survivors', 'help', 'aid', 'medical', 'sickbay', 'triage']);
  const preservesConvoyEvidence = includesAny(input, ['evidence', 'forensic', 'logs', 'records', 'preserve', 'computer core', 'data']);
  const usesQuarantinePosture = includesAny(input, ['quarantine', 'isolation', 'isolate', 'decon', 'biofilter']);
  const usesSecurityPosture = includesAny(input, ['security', 'tactical', 'trap', 'threat', 'shields', 'shield', 'yellow alert', 'red alert', 'security team', 'reconnaissance']);
  const escalatesAuthority = includesAny(input, ['whitaker', 'captain', 'starfleet authority', 'starfleet command', 'jurisdiction', 'lawful authority', 'authority code', 'emergency authority']);
  const coordinatesWithAuthorities = includesAny(input, ['asterion', 'compact', 'local authority', 'local authorities', 'civil authority', 'civil authorities', 'coordinate', 'coordination', 'notify', 'hail', 'contact']);
  const fastApproach = includesAny(input, ['best speed', 'full impulse', 'maximum safe speed', 'immediate approach', 'get there now', 'rush']);
  const cautiousApproach = includesAny(input, ['cautious', 'slow approach', 'minimum safe speed', 'measured approach', 'stand-off', 'standoff', 'hold range']);
  const bypassesQuarantine = includesAny(input, ['waive isolation', 'skip isolation', 'ignore quarantine', 'beam directly', 'beam them directly', 'unrestricted', 'public area', 'public spaces']);
  const escalatesWeapons = includesAny(input, ['open fire', 'fire phasers', 'weapons free', 'destroy', 'disable with weapons']);
  const detainsCompactPersonnel = includesAny(input, ['detain compact', 'arrest compact', 'detain the compact', 'seize compact']);
  const destroysConvoyEvidence = includesAny(input, ['destroy evidence', 'overwrite', 'erase', 'wipe', 'purge', 'shut down the computers', 'shutdown the computers']);
  const rescueFirst = preparesRescue && (closesOnConvoy || fastApproach) && !startsRemoteVerification;
  const remoteVerificationFirst = startsRemoteVerification && (!closesOnConvoy || holdsAtRange);
  const evidenceFirst = preservesConvoyEvidence && (holdsAtRange || cautiousApproach || startsRemoteVerification) && !preparesRescue;
  const diplomacyFirst = coordinatesWithAuthorities && !closesOnConvoy && !preparesRescue;
  const departureStrength = missionDeparture && hasCredibleEvidence && hasImminentHarm && hasFeasiblePlan
    ? 'compelling'
    : missionDeparture && (hasCredibleEvidence || hasImminentHarm || asksForLimitedAlternative)
      ? 'partial'
      : missionDeparture
        ? 'weak'
        : 'none';

  if (impossibleOrUnsupported) {
    return {
      summary: 'Attempt an action that lacks the required authority, access, or physical support in the current scene.',
      primaryIntent: 'unsupported-command',
      targetIds: [],
      declaredMethod: rawInput.trim() || 'unsupported command',
      assumptions: [
        'The player needs lawful authority, access, capability, or evidence before this action can work.'
      ],
      signals: {
        wantsPassengerTransfer,
        wantsEvidencePreserved,
        wantsOwnerAccountability,
        limitsRepair,
        acceptsDelay,
        missionDeparture,
        hasCredibleEvidence,
        hasImminentHarm,
        hasFeasiblePlan,
        asksForLimitedAlternative,
        reportsAboard,
        respectsWorkingProcess,
        asksForHandoff,
        immediateInspection,
        namesPersonalValue,
        defersPersonalValue,
        definesExecutiveAuthority,
        setsReadinessPriorities,
        delegatesReadinessWork,
        acceptsReadinessRisk,
        approvesFlightProfile,
        formalizesOpsCoordination,
        definesScienceThreshold,
        protectsMedicalReadiness,
        protectsEngineeringReadiness,
        setsFallbackProcedure,
        standardizesFallbackProcedure,
        usesBronnFailureConditions,
        assignsCertificateRemediation,
        setsTemporaryFallbackProtocol,
        defersFallbackRemediation,
        buildsFallbackConsensus,
        contactsKieran,
        contactsPriya,
        contactsBronn,
        contactsRowan,
        contactsMiriam,
        contactsImani,
        setsConcernEscalationExpectation,
        delegatesCommandRhythm,
        invitesDissent,
        setsCommandBoundaries,
        assignsHesperusFollowup,
        assignsHesperusEngineering,
        assignsHesperusMedical,
        assignsHesperusLegal,
        assignsHesperusFlight,
        preservesEscapePodData,
        startsCombinedLoadTest,
        runsStagedLoadTest,
        continuesUnderReducedRedundancy,
        pausesCombinedLoadTest,
        shiftsCombinedLoadControl,
        acceptsImaniWorkaround,
        reportsIncompleteTesting,
        hidesCombinedLoadRisk,
        setsKieranAbortCriteria,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (activePhaseId === 'hesperus-diversion' && wantsPassengerTransfer && wantsEvidencePreserved && wantsOwnerAccountability) {
    return {
      summary: 'Prioritize passenger transfer, preserve inspection-fraud evidence, impose formal accountability on the owner, and stabilize the Hesperus only for impulse travel.',
      primaryIntent: 'resolve-hesperus-with-accountability',
      targetIds: ['ss-hesperus', 'hesperus-owner', 'hesperus-passengers'],
      declaredMethod: [
        wantsOwnerAccountability ? 'lawful authority' : null,
        wantsEvidencePreserved ? 'evidence preservation' : null,
        wantsPassengerTransfer ? 'medical evacuation' : null,
        limitsRepair ? 'limited engineering support' : null,
        acceptsDelay ? 'logged command responsibility' : null
      ].filter(Boolean).join(', '),
      assumptions: [
        "The player is acting as XO under Whitaker's command intent.",
        "The Hesperus owner is within the scope of Starfleet safety and inspection authority for the immediate emergency.",
        'Engineering can stabilize impulse travel but cannot certify warp restart.'
      ],
      signals: {
        wantsPassengerTransfer,
        wantsEvidencePreserved,
        wantsOwnerAccountability,
        limitsRepair,
        acceptsDelay,
        missionDeparture,
        hasCredibleEvidence,
        hasImminentHarm,
        hasFeasiblePlan,
        asksForLimitedAlternative,
        reportsAboard,
        respectsWorkingProcess,
        asksForHandoff,
        immediateInspection,
        namesPersonalValue,
        defersPersonalValue,
        definesExecutiveAuthority,
        setsReadinessPriorities,
        delegatesReadinessWork,
        acceptsReadinessRisk,
        approvesFlightProfile,
        formalizesOpsCoordination,
        definesScienceThreshold,
        protectsMedicalReadiness,
        protectsEngineeringReadiness,
        setsFallbackProcedure,
        standardizesFallbackProcedure,
        usesBronnFailureConditions,
        assignsCertificateRemediation,
        setsTemporaryFallbackProtocol,
        defersFallbackRemediation,
        buildsFallbackConsensus,
        contactsKieran,
        contactsPriya,
        contactsBronn,
        contactsRowan,
        contactsMiriam,
        contactsImani,
        setsConcernEscalationExpectation,
        delegatesCommandRhythm,
        invitesDissent,
        setsCommandBoundaries,
        assignsHesperusFollowup,
        assignsHesperusEngineering,
        assignsHesperusMedical,
        assignsHesperusLegal,
        assignsHesperusFlight,
        preservesEscapePodData,
        startsCombinedLoadTest,
        runsStagedLoadTest,
        continuesUnderReducedRedundancy,
        pausesCombinedLoadTest,
        shiftsCombinedLoadControl,
        acceptsImaniWorkaround,
        reportsIncompleteTesting,
        hidesCombinedLoadRisk,
        setsKieranAbortCriteria,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (activePhaseId === 'shuttle-rendezvous' && rawInput.trim()) {
    return {
      summary: 'Establish the new XO arrival tone while boarding a working ship.',
      primaryIntent: 'establish-arrival-tone',
      targetIds: ['mara-whitaker', 'priya-nayar', 'hadrik-bronn'],
      declaredMethod: [
        reportsAboard ? 'formal report aboard' : null,
        respectsWorkingProcess ? 'respect working transfer routines' : null,
        asksForHandoff ? 'ask for operational handoff' : null,
        immediateInspection ? 'immediate inspection posture' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The player is arriving as permanent XO while the Breckinridge remains under working shakedown routines.',
        'Small choices during boarding shape whether existing routines feel respected or overridden.'
      ],
      signals: {
        wantsPassengerTransfer,
        wantsEvidencePreserved,
        wantsOwnerAccountability,
        limitsRepair,
        acceptsDelay,
        missionDeparture,
        hasCredibleEvidence,
        hasImminentHarm,
        hasFeasiblePlan,
        asksForLimitedAlternative,
        reportsAboard,
        respectsWorkingProcess,
        asksForHandoff,
        immediateInspection,
        namesPersonalValue,
        defersPersonalValue,
        definesExecutiveAuthority,
        setsReadinessPriorities,
        delegatesReadinessWork,
        acceptsReadinessRisk,
        approvesFlightProfile,
        formalizesOpsCoordination,
        definesScienceThreshold,
        protectsMedicalReadiness,
        protectsEngineeringReadiness,
        setsFallbackProcedure,
        standardizesFallbackProcedure,
        usesBronnFailureConditions,
        assignsCertificateRemediation,
        setsTemporaryFallbackProtocol,
        defersFallbackRemediation,
        buildsFallbackConsensus,
        contactsKieran,
        contactsPriya,
        contactsBronn,
        contactsRowan,
        contactsMiriam,
        contactsImani,
        setsConcernEscalationExpectation,
        delegatesCommandRhythm,
        invitesDissent,
        setsCommandBoundaries,
        assignsHesperusFollowup,
        assignsHesperusEngineering,
        assignsHesperusMedical,
        assignsHesperusLegal,
        assignsHesperusFlight,
        preservesEscapePodData,
        startsCombinedLoadTest,
        runsStagedLoadTest,
        continuesUnderReducedRedundancy,
        pausesCombinedLoadTest,
        shiftsCombinedLoadControl,
        acceptsImaniWorkaround,
        reportsIncompleteTesting,
        hidesCombinedLoadRisk,
        setsKieranAbortCriteria,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (activePhaseId === 'ready-room-handover' && rawInput.trim()) {
    return {
      summary: 'Complete the ready-room command handover and establish an initial command value.',
      primaryIntent: 'complete-ready-room-handover',
      targetIds: ['mara-whitaker', 'hadrik-bronn'],
      declaredMethod: [
        namesPersonalValue ? 'states a personal command value' : null,
        defersPersonalValue ? 'defers a personal value' : null,
        definesExecutiveAuthority ? 'defines executive authority' : null,
        asksForHandoff ? 'asks for clean handoff details' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'Whitaker retains final command authority while testing whether the XO can make recommendations and own routine execution.',
        'Bronn wants a competent handoff rather than a symbolic replacement scene.'
      ],
      signals: {
        wantsPassengerTransfer,
        wantsEvidencePreserved,
        wantsOwnerAccountability,
        limitsRepair,
        acceptsDelay,
        missionDeparture,
        hasCredibleEvidence,
        hasImminentHarm,
        hasFeasiblePlan,
        asksForLimitedAlternative,
        reportsAboard,
        respectsWorkingProcess,
        asksForHandoff,
        immediateInspection,
        namesPersonalValue,
        defersPersonalValue,
        definesExecutiveAuthority,
        setsReadinessPriorities,
        delegatesReadinessWork,
        acceptsReadinessRisk,
        approvesFlightProfile,
        formalizesOpsCoordination,
        definesScienceThreshold,
        protectsMedicalReadiness,
        protectsEngineeringReadiness,
        setsFallbackProcedure,
        standardizesFallbackProcedure,
        usesBronnFailureConditions,
        assignsCertificateRemediation,
        setsTemporaryFallbackProtocol,
        defersFallbackRemediation,
        buildsFallbackConsensus,
        contactsKieran,
        contactsPriya,
        contactsBronn,
        contactsRowan,
        contactsMiriam,
        contactsImani,
        setsConcernEscalationExpectation,
        delegatesCommandRhythm,
        invitesDissent,
        setsCommandBoundaries,
        assignsHesperusFollowup,
        assignsHesperusEngineering,
        assignsHesperusMedical,
        assignsHesperusLegal,
        assignsHesperusFlight,
        preservesEscapePodData,
        startsCombinedLoadTest,
        runsStagedLoadTest,
        continuesUnderReducedRedundancy,
        pausesCombinedLoadTest,
        shiftsCombinedLoadControl,
        acceptsImaniWorkaround,
        reportsIncompleteTesting,
        hidesCombinedLoadRisk,
        setsKieranAbortCriteria,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (activePhaseId === 'senior-readiness-conference' && rawInput.trim()) {
    return {
      summary: 'Set senior staff readiness priorities, name department ownership, and decide which risk remains accepted for the transit.',
      primaryIntent: 'set-readiness-priorities',
      targetIds: [
        'mara-whitaker',
        'kieran-vale',
        'priya-nayar',
        'hadrik-bronn',
        'rowan-saye',
        'miriam-sato',
        'imani-cross'
      ],
      declaredMethod: [
        setsReadinessPriorities ? 'readiness schedule prioritization' : null,
        delegatesReadinessWork ? 'delegated department ownership' : null,
        acceptsReadinessRisk ? 'explicit accepted risk or deferral' : null,
        approvesFlightProfile ? 'flight profile review' : null,
        formalizesOpsCoordination ? 'operations coordination boundaries' : null,
        definesScienceThreshold ? 'science investigation threshold' : null,
        protectsMedicalReadiness ? 'medical readiness protection' : null,
        protectsEngineeringReadiness ? 'engineering documentation and repair time' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The player is acting as XO while Whitaker observes how they prioritize imperfect readiness.',
        'Every department cannot receive full time before arrival; at least one concern must be combined, delegated, deferred, or accepted as risk.',
        'The readiness conference should create ownership rather than a popularity vote.'
      ],
      signals: {
        wantsPassengerTransfer,
        wantsEvidencePreserved,
        wantsOwnerAccountability,
        limitsRepair,
        acceptsDelay,
        missionDeparture,
        hasCredibleEvidence,
        hasImminentHarm,
        hasFeasiblePlan,
        asksForLimitedAlternative,
        reportsAboard,
        respectsWorkingProcess,
        asksForHandoff,
        immediateInspection,
        namesPersonalValue,
        defersPersonalValue,
        definesExecutiveAuthority,
        setsReadinessPriorities,
        delegatesReadinessWork,
        acceptsReadinessRisk,
        approvesFlightProfile,
        formalizesOpsCoordination,
        definesScienceThreshold,
        protectsMedicalReadiness,
        protectsEngineeringReadiness,
        setsFallbackProcedure,
        standardizesFallbackProcedure,
        usesBronnFailureConditions,
        assignsCertificateRemediation,
        setsTemporaryFallbackProtocol,
        defersFallbackRemediation,
        buildsFallbackConsensus,
        contactsKieran,
        contactsPriya,
        contactsBronn,
        contactsRowan,
        contactsMiriam,
        contactsImani,
        setsConcernEscalationExpectation,
        delegatesCommandRhythm,
        invitesDissent,
        setsCommandBoundaries,
        assignsHesperusFollowup,
        assignsHesperusEngineering,
        assignsHesperusMedical,
        assignsHesperusLegal,
        assignsHesperusFlight,
        preservesEscapePodData,
        startsCombinedLoadTest,
        runsStagedLoadTest,
        continuesUnderReducedRedundancy,
        pausesCombinedLoadTest,
        shiftsCombinedLoadControl,
        acceptsImaniWorkaround,
        reportsIncompleteTesting,
        hidesCombinedLoadRisk,
        setsKieranAbortCriteria,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (activePhaseId === 'fallback-command-drill' && rawInput.trim()) {
    return {
      summary: 'Set a fallback-command procedure, expose command-network certificate risk, and assign or defer remediation.',
      primaryIntent: 'set-fallback-command-procedure',
      targetIds: [
        'mara-whitaker',
        'hadrik-bronn',
        'priya-nayar',
        'imani-cross'
      ],
      declaredMethod: [
        setsFallbackProcedure ? 'fallback-command procedure' : null,
        standardizesFallbackProcedure ? 'standardized shipwide drill' : null,
        usesBronnFailureConditions ? 'Bronn failure-condition review' : null,
        assignsCertificateRemediation ? 'command-network certificate remediation' : null,
        setsTemporaryFallbackProtocol ? 'temporary fallback protocol' : null,
        defersFallbackRemediation ? 'logged deferred remediation' : null,
        buildsFallbackConsensus ? 'cross-department walkthrough' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The player is acting as XO while Bronn tests whether command survivability is real rather than ceremonial.',
        'The drill exposes incompatible emergency habits and a command-network certificate issue that cannot be ignored.',
        'A temporary protocol can work only if the limitation is explicit and owned.'
      ],
      signals: {
        wantsPassengerTransfer,
        wantsEvidencePreserved,
        wantsOwnerAccountability,
        limitsRepair,
        acceptsDelay,
        missionDeparture,
        hasCredibleEvidence,
        hasImminentHarm,
        hasFeasiblePlan,
        asksForLimitedAlternative,
        reportsAboard,
        respectsWorkingProcess,
        asksForHandoff,
        immediateInspection,
        namesPersonalValue,
        defersPersonalValue,
        definesExecutiveAuthority,
        setsReadinessPriorities,
        delegatesReadinessWork,
        acceptsReadinessRisk,
        approvesFlightProfile,
        formalizesOpsCoordination,
        definesScienceThreshold,
        protectsMedicalReadiness,
        protectsEngineeringReadiness,
        setsFallbackProcedure,
        standardizesFallbackProcedure,
        usesBronnFailureConditions,
        assignsCertificateRemediation,
        setsTemporaryFallbackProtocol,
        defersFallbackRemediation,
        buildsFallbackConsensus,
        contactsKieran,
        contactsPriya,
        contactsBronn,
        contactsRowan,
        contactsMiriam,
        contactsImani,
        setsConcernEscalationExpectation,
        delegatesCommandRhythm,
        invitesDissent,
        setsCommandBoundaries,
        assignsHesperusFollowup,
        assignsHesperusEngineering,
        assignsHesperusMedical,
        assignsHesperusLegal,
        assignsHesperusFlight,
        preservesEscapePodData,
        startsCombinedLoadTest,
        runsStagedLoadTest,
        continuesUnderReducedRedundancy,
        pausesCombinedLoadTest,
        shiftsCombinedLoadControl,
        acceptsImaniWorkaround,
        reportsIncompleteTesting,
        hidesCombinedLoadRisk,
        setsKieranAbortCriteria,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (activePhaseId === 'command-rhythm-scenes' && rawInput.trim()) {
    const contactedOfficerIds = [
      contactsKieran ? 'kieran-vale' : null,
      contactsPriya ? 'priya-nayar' : null,
      contactsBronn ? 'hadrik-bronn' : null,
      contactsRowan ? 'rowan-saye' : null,
      contactsMiriam ? 'miriam-sato' : null,
      contactsImani ? 'imani-cross' : null
    ].filter(Boolean);
    return {
      summary: 'Establish command rhythm through focused senior staff contact and clear expectations for how concerns reach the XO.',
      primaryIntent: 'establish-command-rhythm',
      targetIds: contactedOfficerIds.length > 0 ? contactedOfficerIds : ['senior-staff'],
      declaredMethod: [
        contactedOfficerIds.length >= 2 ? 'multiple senior staff contacts' : null,
        setsConcernEscalationExpectation ? 'concern escalation expectations' : null,
        delegatesCommandRhythm ? 'delegated follow-up rhythm' : null,
        invitesDissent ? 'invited professional dissent' : null,
        setsCommandBoundaries ? 'command boundaries and standards' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The player is using routine transit contact to establish command rhythm rather than collecting biographies.',
        'At least two meaningful senior officer contacts are needed before the Director should move the Prelude into the Hesperus diversion.',
        'A command-culture tendency should be recorded from conduct, not from a declared personality label.'
      ],
      signals: {
        wantsPassengerTransfer,
        wantsEvidencePreserved,
        wantsOwnerAccountability,
        limitsRepair,
        acceptsDelay,
        missionDeparture,
        hasCredibleEvidence,
        hasImminentHarm,
        hasFeasiblePlan,
        asksForLimitedAlternative,
        reportsAboard,
        respectsWorkingProcess,
        asksForHandoff,
        immediateInspection,
        namesPersonalValue,
        defersPersonalValue,
        definesExecutiveAuthority,
        setsReadinessPriorities,
        delegatesReadinessWork,
        acceptsReadinessRisk,
        approvesFlightProfile,
        formalizesOpsCoordination,
        definesScienceThreshold,
        protectsMedicalReadiness,
        protectsEngineeringReadiness,
        setsFallbackProcedure,
        standardizesFallbackProcedure,
        usesBronnFailureConditions,
        assignsCertificateRemediation,
        setsTemporaryFallbackProtocol,
        defersFallbackRemediation,
        buildsFallbackConsensus,
        contactsKieran,
        contactsPriya,
        contactsBronn,
        contactsRowan,
        contactsMiriam,
        contactsImani,
        contactedOfficerIds,
        setsConcernEscalationExpectation,
        delegatesCommandRhythm,
        invitesDissent,
        setsCommandBoundaries,
        assignsHesperusFollowup,
        assignsHesperusEngineering,
        assignsHesperusMedical,
        assignsHesperusLegal,
        assignsHesperusFlight,
        preservesEscapePodData,
        startsCombinedLoadTest,
        runsStagedLoadTest,
        continuesUnderReducedRedundancy,
        pausesCombinedLoadTest,
        shiftsCombinedLoadControl,
        acceptsImaniWorkaround,
        reportsIncompleteTesting,
        hidesCombinedLoadRisk,
        setsKieranAbortCriteria,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (activePhaseId === 'hesperus-aftermath' && rawInput.trim()) {
    return {
      summary: 'Assign Hesperus aftermath follow-up work and preserve any earned optional discoveries before the ship resumes shakedown testing.',
      primaryIntent: 'assign-hesperus-aftermath',
      targetIds: [
        assignsHesperusEngineering ? 'imani-cross' : null,
        assignsHesperusMedical ? 'miriam-sato' : null,
        assignsHesperusLegal ? 'priya-nayar' : null,
        assignsHesperusFlight ? 'kieran-vale' : null,
        preservesEscapePodData ? 'rowan-saye' : null
      ].filter(Boolean),
      declaredMethod: [
        assignsHesperusEngineering ? 'engineering repair documentation' : null,
        assignsHesperusMedical ? 'medical passenger or fatigue follow-up' : null,
        assignsHesperusLegal ? 'legal and administrative routing' : null,
        assignsHesperusFlight ? 'arrival plan recalculation' : null,
        preservesEscapePodData ? 'escape-pod subspace data preservation' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The Hesperus aftermath should record obligations caused by the prior rescue decision rather than replaying the rescue.',
        'Optional escape-pod data can be preserved only if the player actually names it or assigns science follow-up.',
        'Follow-up ownership can carry consequences into later Prelude phases.'
      ],
      signals: {
        wantsPassengerTransfer,
        wantsEvidencePreserved,
        wantsOwnerAccountability,
        limitsRepair,
        acceptsDelay,
        missionDeparture,
        hasCredibleEvidence,
        hasImminentHarm,
        hasFeasiblePlan,
        asksForLimitedAlternative,
        reportsAboard,
        respectsWorkingProcess,
        asksForHandoff,
        immediateInspection,
        namesPersonalValue,
        defersPersonalValue,
        definesExecutiveAuthority,
        setsReadinessPriorities,
        delegatesReadinessWork,
        acceptsReadinessRisk,
        approvesFlightProfile,
        formalizesOpsCoordination,
        definesScienceThreshold,
        protectsMedicalReadiness,
        protectsEngineeringReadiness,
        setsFallbackProcedure,
        standardizesFallbackProcedure,
        usesBronnFailureConditions,
        assignsCertificateRemediation,
        setsTemporaryFallbackProtocol,
        defersFallbackRemediation,
        buildsFallbackConsensus,
        contactsKieran,
        contactsPriya,
        contactsBronn,
        contactsRowan,
        contactsMiriam,
        contactsImani,
        setsConcernEscalationExpectation,
        delegatesCommandRhythm,
        invitesDissent,
        setsCommandBoundaries,
        assignsHesperusFollowup,
        assignsHesperusEngineering,
        assignsHesperusMedical,
        assignsHesperusLegal,
        assignsHesperusFlight,
        preservesEscapePodData,
        startsCombinedLoadTest,
        runsStagedLoadTest,
        continuesUnderReducedRedundancy,
        pausesCombinedLoadTest,
        shiftsCombinedLoadControl,
        acceptsImaniWorkaround,
        reportsIncompleteTesting,
        hidesCombinedLoadRisk,
        setsKieranAbortCriteria,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (activePhaseId === 'combined-load-test' && rawInput.trim()) {
    return {
      summary: 'Resolve the combined-load test by deciding whether to continue, pause, shift control, accept a workaround, or report incomplete readiness.',
      primaryIntent: 'resolve-combined-load-test',
      targetIds: [
        'imani-cross',
        'kieran-vale',
        'priya-nayar'
      ],
      declaredMethod: [
        startsCombinedLoadTest ? 'combined-load test execution' : null,
        runsStagedLoadTest ? 'staged controlled test' : null,
        continuesUnderReducedRedundancy ? 'continue under reduced redundancy' : null,
        pausesCombinedLoadTest ? 'pause or stand down test' : null,
        shiftsCombinedLoadControl ? 'shift control authority' : null,
        acceptsImaniWorkaround ? 'Imani temporary workaround' : null,
        reportsIncompleteTesting ? 'honest readiness limitation report' : null,
        hidesCombinedLoadRisk ? 'concealed readiness risk' : null,
        setsKieranAbortCriteria ? 'Kieran flight profile with abort criteria' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The combined-load fault is ordinary technical irregularity, not sabotage.',
        'The player may succeed by proving the test, pausing honestly, or reporting an accepted limitation.',
        'Kieran flight-profile approval should be evaluated inside the operational test, not as detached encouragement.'
      ],
      signals: {
        wantsPassengerTransfer,
        wantsEvidencePreserved,
        wantsOwnerAccountability,
        limitsRepair,
        acceptsDelay,
        missionDeparture,
        hasCredibleEvidence,
        hasImminentHarm,
        hasFeasiblePlan,
        asksForLimitedAlternative,
        reportsAboard,
        respectsWorkingProcess,
        asksForHandoff,
        immediateInspection,
        namesPersonalValue,
        defersPersonalValue,
        definesExecutiveAuthority,
        setsReadinessPriorities,
        delegatesReadinessWork,
        acceptsReadinessRisk,
        approvesFlightProfile,
        formalizesOpsCoordination,
        definesScienceThreshold,
        protectsMedicalReadiness,
        protectsEngineeringReadiness,
        setsFallbackProcedure,
        standardizesFallbackProcedure,
        usesBronnFailureConditions,
        assignsCertificateRemediation,
        setsTemporaryFallbackProtocol,
        defersFallbackRemediation,
        buildsFallbackConsensus,
        contactsKieran,
        contactsPriya,
        contactsBronn,
        contactsRowan,
        contactsMiriam,
        contactsImani,
        setsConcernEscalationExpectation,
        delegatesCommandRhythm,
        invitesDissent,
        setsCommandBoundaries,
        assignsHesperusFollowup,
        assignsHesperusEngineering,
        assignsHesperusMedical,
        assignsHesperusLegal,
        assignsHesperusFlight,
        preservesEscapePodData,
        startsCombinedLoadTest,
        runsStagedLoadTest,
        continuesUnderReducedRedundancy,
        pausesCombinedLoadTest,
        shiftsCombinedLoadControl,
        acceptsImaniWorkaround,
        reportsIncompleteTesting,
        hidesCombinedLoadRisk,
        setsKieranAbortCriteria,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (activePhaseId === 'final-command-review' && rawInput.trim()) {
    return {
      summary: 'Complete the final command review by reporting readiness, naming unresolved support needs, and setting the arrival posture before the Reach.',
      primaryIntent: 'complete-final-command-review',
      targetIds: [
        'mara-whitaker',
        closesActingXoService ? 'hadrik-bronn' : null,
        addressesCrewBeforeArrival ? 'senior-staff' : null
      ].filter(Boolean),
      declaredMethod: [
        reportsFinalReadinessHonestly ? 'honest final readiness report' : null,
        concealsFinalRisk ? 'concealed final readiness risk' : null,
        requestsCaptainSupport ? 'captain support and disagreement boundaries' : null,
        affirmsProvisionalRoutine ? 'formalized useful provisional routine' : null,
        closesActingXoService ? 'acting-XO service affirmed or closed' : null,
        addressesCrewBeforeArrival ? 'crew-facing arrival communication' : null,
        namesUnresolvedStrain ? 'unresolved strain named' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'Whitaker is asking for a truthful executive recommendation, not a perfect self-evaluation.',
        'The final review should summarize committed Prelude state rather than invent new hidden risk.',
        'The Prelude can complete even if the arrival posture includes delay, limitation, or unresolved strain.'
      ],
      signals: {
        reportsFinalReadinessHonestly,
        concealsFinalRisk,
        requestsCaptainSupport,
        affirmsProvisionalRoutine,
        closesActingXoService,
        addressesCrewBeforeArrival,
        namesUnresolvedStrain,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (chapter1OpeningPhase && rawInput.trim() && requestsChapter1Counsel && !closesOnConvoy && !bypassesQuarantine && !escalatesWeapons && !detainsCompactPersonnel && !destroysConvoyEvidence) {
    return {
      summary: 'Ask senior officers for compact counsel before committing the initial convoy response posture.',
      primaryIntent: 'request-chapter-1-counsel',
      targetIds: [
        input.includes('doctor') || input.includes('medical') ? 'miriam-sato' : null,
        input.includes('security') || input.includes('tactical') || input.includes('trap') ? 'hadrik-bronn' : null,
        input.includes('science') || input.includes('sensor') ? 'rowan-saye' : null,
        input.includes('ops') || input.includes('certificate') || input.includes('signal') ? 'priya-nayar' : null
      ].filter(Boolean),
      declaredMethod: rawInput.trim(),
      assumptions: [
        'The player is pausing for professional counsel before committing a response posture.',
        'Counsel should inform the command decision without presenting a single correct answer.'
      ],
      signals: {
        requestsChapter1Counsel,
        closesOnConvoy,
        startsRemoteVerification,
        preparesRescue,
        preservesConvoyEvidence,
        usesQuarantinePosture,
        usesSecurityPosture,
        escalatesAuthority,
        coordinatesWithAuthorities,
        holdsAtRange,
        fastApproach,
        cautiousApproach,
        rescueFirst,
        remoteVerificationFirst,
        evidenceFirst,
        diplomacyFirst,
        bypassesQuarantine,
        escalatesWeapons,
        detainsCompactPersonnel,
        destroysConvoyEvidence,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (chapter1OpeningPhase && rawInput.trim()) {
    return {
      summary: 'Set the initial response posture for Relief Convoy Twelve.',
      primaryIntent: 'set-initial-convoy-posture',
      targetIds: [
        'relief-convoy-twelve',
        startsRemoteVerification ? 'priya-nayar' : null,
        preparesRescue || usesQuarantinePosture || bypassesQuarantine ? 'miriam-sato' : null,
        startsRemoteVerification ? 'rowan-saye' : null,
        escalatesWeapons || detainsCompactPersonnel ? 'hadrik-bronn' : null,
        preservesConvoyEvidence || destroysConvoyEvidence ? 'imani-cross' : null
      ].filter(Boolean),
      declaredMethod: [
        closesOnConvoy ? 'close approach' : null,
        startsRemoteVerification ? 'remote verification' : null,
        preparesRescue ? 'rescue preparation' : null,
        preservesConvoyEvidence ? 'evidence preservation' : null,
        usesQuarantinePosture ? 'quarantine posture' : null,
        usesSecurityPosture ? 'security posture' : null,
        escalatesAuthority ? 'authority escalation' : null,
        coordinatesWithAuthorities ? 'external coordination' : null,
        holdsAtRange ? 'stand-off range' : null,
        fastApproach ? 'fast approach' : null,
        cautiousApproach ? 'cautious approach' : null,
        bypassesQuarantine ? 'quarantine bypass' : null,
        escalatesWeapons ? 'weapons escalation' : null,
        detainsCompactPersonnel ? 'Compact detention' : null,
        destroysConvoyEvidence ? 'computer evidence destruction' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The distress packet is real enough to require response but uncertain enough to require verification.',
        'The XO is organizing the first response while Whitaker retains final command authority for major escalation.',
        'Routine logging, authentication, scan, and readiness actions are handled by Command Competence unless contradicted.'
      ],
      signals: {
        requestsChapter1Counsel,
        closesOnConvoy,
        startsRemoteVerification,
        preparesRescue,
        preservesConvoyEvidence,
        usesQuarantinePosture,
        usesSecurityPosture,
        escalatesAuthority,
        coordinatesWithAuthorities,
        holdsAtRange,
        fastApproach,
        cautiousApproach,
        rescueFirst,
        remoteVerificationFirst,
        evidenceFirst,
        diplomacyFirst,
        bypassesQuarantine,
        escalatesWeapons,
        detainsCompactPersonnel,
        destroysConvoyEvidence,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (missionDeparture) {
    return {
      summary: 'Attempt to leave or redirect away from the active mission frame.',
      primaryIntent: 'leave-mission-area',
      targetIds: [],
      declaredMethod: rawInput.trim() || 'unspecified mission departure',
      assumptions: [
        'Leaving the active mission frame may require Captain approval and a credible Starfleet reason.'
      ],
      signals: {
        wantsPassengerTransfer,
        wantsEvidencePreserved,
        wantsOwnerAccountability,
        limitsRepair,
        acceptsDelay,
        missionDeparture,
        hasCredibleEvidence,
        hasImminentHarm,
        hasFeasiblePlan,
        asksForLimitedAlternative,
        reportsAboard,
        respectsWorkingProcess,
        asksForHandoff,
        immediateInspection,
        namesPersonalValue,
        defersPersonalValue,
        definesExecutiveAuthority,
        setsReadinessPriorities,
        delegatesReadinessWork,
        acceptsReadinessRisk,
        approvesFlightProfile,
        formalizesOpsCoordination,
        definesScienceThreshold,
        protectsMedicalReadiness,
        protectsEngineeringReadiness,
        setsFallbackProcedure,
        standardizesFallbackProcedure,
        usesBronnFailureConditions,
        assignsCertificateRemediation,
        setsTemporaryFallbackProtocol,
        defersFallbackRemediation,
        buildsFallbackConsensus,
        contactsKieran,
        contactsPriya,
        contactsBronn,
        contactsRowan,
        contactsMiriam,
        contactsImani,
        setsConcernEscalationExpectation,
        delegatesCommandRhythm,
        invitesDissent,
        setsCommandBoundaries,
        assignsHesperusFollowup,
        assignsHesperusEngineering,
        assignsHesperusMedical,
        assignsHesperusLegal,
        assignsHesperusFlight,
        preservesEscapePodData,
        startsCombinedLoadTest,
        runsStagedLoadTest,
        continuesUnderReducedRedundancy,
        pausesCombinedLoadTest,
        shiftsCombinedLoadControl,
        acceptsImaniWorkaround,
        reportsIncompleteTesting,
        hidesCombinedLoadRisk,
        setsKieranAbortCriteria,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  return {
    summary: rawInput.trim() || 'No player action supplied.',
    primaryIntent: rawInput.trim() ? 'general-mission-action' : 'no-action',
    targetIds: [],
    declaredMethod: rawInput.trim() || 'unspecified',
    assumptions: [],
    signals: {
      wantsPassengerTransfer,
      wantsEvidencePreserved,
      wantsOwnerAccountability,
      limitsRepair,
      acceptsDelay,
      missionDeparture,
      hasCredibleEvidence,
      hasImminentHarm,
      hasFeasiblePlan,
      asksForLimitedAlternative,
      reportsAboard,
      respectsWorkingProcess,
      asksForHandoff,
      immediateInspection,
      namesPersonalValue,
      defersPersonalValue,
      definesExecutiveAuthority,
      setsReadinessPriorities,
      delegatesReadinessWork,
      acceptsReadinessRisk,
      approvesFlightProfile,
      formalizesOpsCoordination,
      definesScienceThreshold,
      protectsMedicalReadiness,
      protectsEngineeringReadiness,
      setsFallbackProcedure,
      standardizesFallbackProcedure,
      usesBronnFailureConditions,
      assignsCertificateRemediation,
      setsTemporaryFallbackProtocol,
      defersFallbackRemediation,
      buildsFallbackConsensus,
      contactsKieran,
      contactsPriya,
      contactsBronn,
      contactsRowan,
      contactsMiriam,
      contactsImani,
      setsConcernEscalationExpectation,
      delegatesCommandRhythm,
      invitesDissent,
      setsCommandBoundaries,
      assignsHesperusFollowup,
      assignsHesperusEngineering,
      assignsHesperusMedical,
      assignsHesperusLegal,
      assignsHesperusFlight,
      preservesEscapePodData,
      startsCombinedLoadTest,
      runsStagedLoadTest,
      continuesUnderReducedRedundancy,
      pausesCombinedLoadTest,
      shiftsCombinedLoadControl,
      acceptsImaniWorkaround,
      reportsIncompleteTesting,
      hidesCombinedLoadRisk,
      setsKieranAbortCriteria,
      departureStrength,
      impossibleOrUnsupported
    }
  };
}
