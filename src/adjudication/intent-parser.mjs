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
  const chapter1BoardingThresholdPhase = ['convoy-approach', 'first-posture-decision'].includes(activePhaseId);
  const chapter1FirstContactExecutionPhase = activePhaseId === 'first-committed-response';
  const chapter1OffsiteDiscoveryPhase = activePhaseId === 'convoy-contact-execution';
  const chapter1PellContactPhase = activePhaseId === 'offsite-custody-cargo-leads';
  const chapter1JointInspectionPhase = activePhaseId === 'pell-contact-terms';
  const chapter1CargoPulsePhase = activePhaseId === 'joint-inspection-release-cargo';
  const chapter1HardwareRecoveryPhase = activePhaseId === 'cargo-diagnostic-pulse';
  const chapter1ResolutionTermsPhase = activePhaseId === 'hardware-recovery-under-seal';
  const chapter1FalseColorsTransitionPhase = activePhaseId === 'chapter-1-resolution-terms';
  const chapter2TransparencyTermsPhase = activePhaseId === 'false-colors-arrival-briefing';
  const chapter2EvidenceBaselinePhase = activePhaseId === 'transparency-terms-set';
  const chapter2MedicalTrustPhase = activePhaseId === 'orison-evidence-baseline';
  const chapter2SecurityAccessPhase = activePhaseId === 'aegis-medical-trust';
  const chapter2JointCharterPhase = activePhaseId === 'security-access-demonstration';
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
  const ordersShipSelfDestruct = includesAny(input, ['self-destruct', 'self destruct', 'auto-destruct', 'auto destruct', 'eject the warp core', 'eject warp core', 'warp core breach']);
  const ordersShipRamming = includesAny(input, ['ramming speed', 'ram the ship', 'ramming the ship', 'collision course', 'warp ram']);
  const ordersEvacuation = includesAny(input, ['evacuate', 'escape pod', 'escape pods', 'abandon ship', 'lifeboat', 'lifeboats']);
  const atrocityCommand = includesAny(input, ['execute civilians', 'kill civilians', 'vent civilians', 'vent the civilians', 'fire on civilians', 'destroy the civilian convoy', 'murder civilians', 'execute prisoners', 'kill prisoners', 'massacre']);
  const catastrophicShipLoss = ordersShipSelfDestruct || ordersShipRamming;
  const playerDeathLikely = catastrophicShipLoss && !ordersEvacuation;
  const permanentCommandRemoval = atrocityCommand || includesAny(input, ['court martial me', 'court-martial me', 'put me in the brig', 'relieve me permanently']);
  const usesBoardingTeam = includesAny(input, ['board', 'boarding', 'away team', 'away-team', 'beam over', 'transport over', 'send a team', 'teams aboard']);
  const targetsFaradayRecords = includesAny(input, ['faraday', 'lead ship', 'bridge log', 'ship log', 'logs', 'records', 'annotation', 'ivers', 'computer core', 'quarantine order']);
  const targetsParnellRescue = includesAny(input, ['parnell', 'plasma leak', 'plasma leakage', 'trapped', 'worker', 'medication', 'rescue team', 'damage control']);
  const tracksEvacuees = includesAny(input, ['ilyon', 'shelter', 'evacuee', 'evacuees', 'personnel', 'missing crew', 'survivors', 'escape craft', 'life signs']);
  const addressesCustodyClaim = includesAny(input, ['pell', 'ivers', 'captain ivers', 'custody', 'detained', 'detainee', 'detainees', 'jurisdiction', 'release', 'questioning', 'compact']);
  const tracksMissingCargo = includesAny(input, ['cargo', 'module', 'secured hold', 'recycling hold', 'inventory', 'manifest', 'missing module', 'missing cargo']);
  const keepsJointInspectionTone = includesAny(input, ['joint', 'inspection', 'lawful exit', 'lawful channel', 'vouch', 'coordinate', 'coordination', 'share evidence', 'shared record', 'formal channel']);
  const contactsPell = includesAny(input, ['pell', 'compact channel', 'custody channel', 'open a channel', 'channel to pell', 'hail pell', 'contact pell']);
  const acknowledgesCompactConcern = includesAny(input, ['acknowledge', 'legitimate concern', 'wartime experience', 'lawful concern', 'face-saving', 'face saving', 'emergency concern']);
  const demandsIversRelease = includesAny(input, ['release ivers', "ivers' release", 'release captain ivers', 'release the officers', 'release detainees', 'release the detainees', 'be released', 'released for supervised', 'turn over ivers']);
  const offersJointInspection = includesAny(input, ['joint inspection', 'joint medical', 'joint technical', 'joint cargo', 'supervised inspection', 'shared inspection']);
  const setsLegalCargoUndertaking = includesAny(input, ['legal undertaking', 'recovery undertaking', 'lawful recovery', 'cargo undertaking', 'preserve the cargo', 'recover the cargo', 'recover the module', 'return the module']);
  const sharesEvidence = includesAny(input, ['share evidence', 'show the logs', 'show logs', 'share records', 'shared record', 'provide the manifest', 'provide manifest']);
  const executesJointInspection = includesAny(input, ['execute the joint inspection', 'begin the joint inspection', 'start the joint inspection', 'joint inspection team', 'inspection team', 'shared inspection team', 'inspect the cargo', 'inspect the manifest']);
  const securesSupervisedRelease = includesAny(input, ['supervised release', 'release ivers', "ivers' release", 'release captain ivers', 'release the officers', 'release detainees', 'released under supervision', 'supervised questioning']);
  const opensSharedInspectionRecord = includesAny(input, ['joint incident record', 'shared inspection record', 'shared record', 'joint record', 'chain of custody', 'custody chain', 'common record']);
  const protectsCargoEvidenceChain = includesAny(input, ['cargo chain', 'cargo evidence', 'evidence seal', 'inspection seal', 'seal the cargo', 'seal hardware', 'secure hardware', 'preserve hardware', 'manifest chain']);
  const givesPellLawfulExit = includesAny(input, ['lawful exit', 'vouch for pell', 'vouch for him', 'compact official', 'face-saving', 'face saving', 'safe exit', 'lawful cover']);
  const tracesDiagnosticPulse = includesAny(input, ['diagnostic pulse', 'weak pulse', 'trace the pulse', 'trace the signal', 'cargo signal', 'hardware signal', 'emergency hardware signal', 'signal locus', 'recovery locus']);
  const preservesJointCargoSeal = includesAny(input, ['joint seal', 'joint custody', 'under seal', 'shared custody', 'inspection seal', 'joint recovery', 'recovery locus', 'hold under joint']);
  const preparesNonHostileInterception = includesAny(input, ['non-hostile intercept', 'non hostile intercept', 'intercept without weapons', 'shadow without locking weapons', 'hold position', 'do not fire', 'no weapons lock', 'keep shields defensive']);
  const attemptsImmediateCargoSeizure = includesAny(input, ['seize the cargo', 'beam the cargo', 'take the cargo', 'storm the cutter', 'force the hatch', 'forced recovery']);
  const recoversEmergencyHardware = includesAny(input, ['recover the emergency hardware', 'recover emergency hardware', 'retrieve the hardware', 'recover the hardware', 'secure the hardware', 'bring the hardware', 'recover the cargo', 'retrieve the cargo', 'physical recovery', 'recovery team']);
  const preservesRecoveryTelemetry = includesAny(input, ['recovery telemetry', 'timing trace', 'diagnostic trace', 'signal telemetry', 'preserve the trace', 'preserve telemetry', 'trace comparison', 'compare against the warning', 'compare the warning']);
  const defersFinalCustody = includesAny(input, ['final custody later', 'defer final custody', 'without deciding custody', 'under seal pending', 'pending review', 'joint evidence seal', 'evidence seal']);
  const createsJointIncidentRecord = includesAny(input, ['joint incident record', 'shared incident record', 'final incident record', 'resolution record', 'incident record', 'joint crisis record']);
  const securesIversTrust = includesAny(input, ['ivers trusts', 'ivers trust', 'captain ivers trusts', 'ivers signs', 'ivers statement', 'ivers testimony', 'ivers remains a witness', 'ivers remain a witness', 'ivers remains witness', 'captain ivers remains a witness', 'trusts the record', 'witness trust']);
  const recruitsPellWitness = includesAny(input, ['pell as a witness', 'pell witness', 'recruit pell', 'pell cooperates', 'pell cooperation', 'pell signs', 'pell statement', 'lawful witness']);
  const grantsCompactInvestigationAccess = includesAny(input, ['compact access', 'compact receives access', 'compact investigation access', 'access to the investigation', 'joint access', 'shared investigation', 'share the investigation', 'shared access']);
  const acknowledgesAuthenticationFailure = includesAny(input, ['authentication failure', 'starfleet authentication failure', 'publicly acknowledge', 'public acknowledgment', 'acknowledge the authentication', 'acknowledge starfleet', 'own the authentication', 'authentication accountability']);
  const documentsParnellTechnicalDebt = includesAny(input, ['parnell technical debt', 'technical debt', 'repair debt', 'parnell bypass', 'document the workaround', 'document the debt', 'rescue follow-up', 'engineering follow-up']);
  const finalizesJointCustody = includesAny(input, ['final custody terms', 'custody terms', 'joint custody terms', 'custody disposition', 'joint record custody', 'custody remains joint']);
  const usesSuperiorAuthority = includesAny(input, ['superior force', 'legal authority', 'compel compliance', 'force compliance', 'starfleet authority only', 'authority-only', 'authority record']);
  const costlyResolutionIncident = includesAny(input, ['plasma accident', 'armed confrontation', 'medical error', 'injuries', 'injury', 'casualties']);
  const fragmentedResolution = includesAny(input, ['pell escapes', 'pell escape', 'hardware destroyed', 'module destroyed', 'fragmented record', 'partial record', 'record fragments']);
  const reachesAsterion = includesAny(input, ['asterion station', 'reach asterion', 'arrive at asterion', 'arrival at asterion', 'formal briefing', 'station arrival']);
  const receivesCompactPatrolReport = includesAny(input, ['compact patrol', 'patrol report', 'fired upon', 'fired on', 'identifying itself as the u.s.s. breckenridge', 'identifying itself as the uss breckenridge', 'identifying as the breckenridge', 'false colors', 'counterfeit breckenridge', 'vessel identifying itself']);
  const carriesJointRecordForward = includesAny(input, ['carry the joint record', 'carry forward the joint record', 'preserve the joint record', 'bring the incident record', 'carry the incident record', 'resolution record', 'joint incident record']);
  const alertsAsterionAuthorities = includesAny(input, ['notify asterion', 'alert asterion', 'alert starfleet', 'alert compact', 'notify starfleet', 'notify compact', 'share the report', 'brief asterion', 'formal briefing']);
  const maintainsNonHostileTransition = includesAny(input, ['non-hostile', 'non hostile', 'do not chase', 'hold position', 'no weapons', 'no weapons lock', 'defensive posture', 'do not fire', 'stand down weapons']);
  const permitsJointAudit = includesAny(input, ['joint audit', 'shared audit', 'joint verification', 'shared verification', 'joint review', 'shared review', 'independent verification', 'independent audit']);
  const invitesNeutralSpecialist = includesAny(input, ['neutral specialist', 'third-party', 'third party', 'independent specialist', 'outside specialist', 'neutral auditor']);
  const allowsCompactObservers = includesAny(input, ['compact observers', 'observer access', 'compact observer', 'temporary access', 'supervised access', 'limited access']);
  const offersAegisMedicalHelp = includesAny(input, ['aegis two', 'aegis 2', 'medical help', 'medical aid', 'medical assistance', 'injured patrol', 'critical officer', 'critical patient', 'treatment', 'treat the injured']);
  const separatesMedicalFromPolitics = includesAny(input, ['separate medical', 'not a bargaining chip', 'not leverage', 'without concession', 'without conceding', 'care first', 'medical first']);
  const verifiesBreckenridgeAlibi = includesAny(input, ['alibi', 'verify our location', 'prove our location', 'convoy site', 'independent alibi', 'telemetry comparison', 'ship telemetry']);
  const usesCryptographicChallenge = includesAny(input, ['cryptographic challenge', 'challenge code', 'challenge-response', 'challenge response', 'command challenge', 'identity proof']);
  const establishesIndependentSensorBaseline = includesAny(input, ['orison sensor', 'sensor baseline', 'independent sensor', 'asterion sensor', 'external sensor', 'sensor net']);
  const protectsTacticalSecrets = includesAny(input, ['protect tactical', 'tactical architecture', 'command authentication', 'authentication system', 'defensive systems', 'classified system', 'classified systems', 'safe disclosure']);
  const createsClassifiedAnnex = includesAny(input, ['classified annex', 'controlled annex', 'sealed annex', 'restricted annex', 'limited disclosure', 'controlled disclosure']);
  const refusesUnrestrictedAuthAccess = includesAny(input, ['refuse full access', 'refuse unrestricted', 'deny unrestricted', 'no unrestricted', 'not full access', 'controlled alternative', 'unrestricted command-auth', 'unrestricted command auth']);
  const overexposesTacticalSystems = includesAny(input, ['full tactical logs', 'full access to tactical', 'full command authentication', 'unrestricted access', 'unrestricted command authentication', 'expose command authentication', 'open command authentication']);
  const deniesCompactAccess = includesAny(input, ['deny compact access', 'deny access', 'refuse audit', 'no audit', 'starfleet only', 'starfleet-only', 'no compact access']);
  const authorityOnlyAlibiClaim = includesAny(input, ['starfleet records are enough', 'starfleet proof only', 'our records are enough', 'take starfleet word', 'take our word']);
  const securesOrisonBaseline = includesAny(input, ['orison', 'civilian sensor', 'civilian sensors', 'station sensor', 'station sensors', 'sensor baseline', 'sensor baselines', 'traffic records', 'traffic record']);
  const preservesAuditChain = includesAny(input, ['audit chain', 'chain of custody', 'custody chain', 'joint audit record', 'preserve the audit', 'preserve baseline', 'preserve baselines', 'lock the baseline', 'lock baselines']);
  const usesImaniCalibration = includesAny(input, ['imani', 'calibration', 'post-refit', 'post refit', 'warp-field artifact', 'warp field artifact', 'physical impossibility', 'physically inconsistent']);
  const reconstructsAttackerRoute = includesAny(input, ['reconstruct', 'reconstruction', 'attacker route', 'attack route', 'track reconstruction', 'traffic reconstruction', 'route reconstruction']);
  const releasesSelectedLogs = includesAny(input, ['selected logs', 'nonclassified logs', 'non-classified logs', 'public timing logs', 'release selected', 'publish selected', 'selected timing']);
  const preservesDirectorateAccessLogs = includesAny(input, ['directorate access logs', 'access logs', 'preserve access logs', 'record preservation', 'preserve the logs']);
  const makesUnsupportedHoltAccusation = includesAny(input, ['accuse holt', 'publicly accuse holt', 'arrest holt', 'charge holt', 'holt is responsible', 'holt staged']);
  const covertHoltInquiry = includesAny(input, ['quiet inquiry', 'quietly investigate', 'covert inquiry', 'covertly investigate', 'private audit', 'preserve directorate', 'without public accusation']);
  const stabilizesCriticalOfficer = includesAny(input, ['stabilize', 'stabilise', 'critical officer', 'critical patient', 'life support', 'triage', 'emergency treatment', 'treat the critical']);
  const opensJointMedicalChannel = includesAny(input, ['joint medical', 'medical channel', 'compact medic', 'compact medical', 'compact observer', 'observer in sickbay', 'shared care', 'medical observer']);
  const protectsMedicalConsent = includesAny(input, ['consent', 'patient consent', 'medical privacy', 'privacy', 'voluntary', 'not under sedation', 'when cleared']);
  const preservesPatrolTestimony = includesAny(input, ['testimony', 'statement', 'witness statement', 'patrol officer', 'what they saw', 'recollection', 'voluntary statement']);
  const recordsMedicalNeutrality = includesAny(input, ['medical neutrality', 'public record', 'record care', 'neutrality record', 'not an admission', 'no admission', 'without conceding culpability', 'without concession']);
  const usesCareAsLeverage = includesAny(input, ['withhold treatment', 'condition treatment', 'only if they cooperate', 'trade treatment', 'bargain care', 'care as leverage', 'treatment as leverage']);
  const forcesMedicalQuestioning = includesAny(input, ['interrogate', 'force statement', 'force testimony', 'question under sedation', 'before treatment', 'question before treatment']);
  const definesControlledSecurityAnnex = includesAny(input, ['controlled command-authentication annex', 'controlled command auth annex', 'security annex', 'controlled security annex', 'classified annex', 'redacted annex', 'sealed annex', 'access boundary', 'controlled access boundary']);
  const runsCommandAuthDemonstration = includesAny(input, ['command-authentication demonstration', 'command auth demonstration', 'challenge-response demonstration', 'challenge response demonstration', 'transponder inspection', 'integrity demonstration', 'identity demonstration', 'cryptographic demonstration', 'command challenge demonstration']);
  const defendsBronnSecurityRole = includesAny(input, ['bronn', 'security chief', 'tactical security', 'professional demonstration', 'let bronn demonstrate', 'bronn demonstrates', 'bronn records', 'not scapegoat', 'do not scapegoat']);
  const givesKesslerDefensibleAlternative = includesAny(input, ['kessler', 'face-saving', 'face saving', 'defensible alternative', 'credible alternative', 'observer summary', 'compact-facing summary', 'compact facing summary', 'access alternative', 'public alternative']);
  const honorsTollandDisclosureLimit = includesAny(input, ['tolland', 'disclosure limit', 'limit disclosure', 'admiral', 'classified limit', 'do not expose classified', 'honor disclosure', 'honour disclosure']);
  const scapegoatsBronn = includesAny(input, ['blame bronn', 'remove bronn', 'sideline bronn', 'scapegoat bronn', 'bronn manipulated', 'bronn is manipulating', 'accuse bronn', 'accuses bronn']);
  const acceptsUnrestrictedCommandInspectionRaw = includesAny(input, ['full command-system access', 'full command system access', 'unrestricted inspection', 'unrestricted command-system', 'unrestricted command system', 'open command systems', 'give full access']);
  const acceptsUnrestrictedCommandInspection = acceptsUnrestrictedCommandInspectionRaw && !refusesUnrestrictedAuthAccess;
  const framesJointInvestigationCharter = includesAny(input, ['joint investigation charter', 'joint investigative framework', 'joint investigation framework', 'joint charter', 'shared investigation', 'joint investigative charter']);
  const givesKesslerFaceSavingStatement = includesAny(input, ['kessler', 'face-saving', 'face saving', 'acknowledge innocence', 'breckenridge innocence', 'without weakening', 'public statement', 'legitimacy statement']);
  const restrictsHoltInterference = includesAny(input, ['restrict holt', 'limit holt', 'restrict marshal', 'audit firewall', 'no unilateral changes', 'preserve directorate access logs', 'access logs preserved', 'restrict interference', 'record preservation order']);
  const preservesWeakHecateTrace = includesAny(input, ['hecate', 'weak trace', 'relay trace', 'control trace', 'correlate relay', 'correlate the trace', 'too weak to pursue', 'preserve the trace']);
  const authorizesOpenOrders = includesAny(input, ['open orders', 'remain available', 'stay in the reach', 'forensic specialists', 'several weeks', 'responding to local needs', 'available for the investigation']);
  const overclaimsHecateTraceRaw = includesAny(input, ['pursue immediately', 'chase the trace', 'declare hecate source', 'hecate is the source', 'immediate pursuit']);
  const overclaimsHecateTrace = overclaimsHecateTraceRaw && !preservesWeakHecateTrace;
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

  if (rawInput.trim() && (catastrophicShipLoss || permanentCommandRemoval)) {
    return {
      summary: catastrophicShipLoss
        ? 'Commit a catastrophic ship-loss command that may end the campaign branch.'
        : 'Commit an atrocity-level or command-removal order that may end the campaign branch.',
      primaryIntent: 'terminal-catastrophic-command',
      targetIds: [
        catastrophicShipLoss ? 'uss-breckenridge' : null,
        permanentCommandRemoval ? 'player-commander' : null
      ].filter(Boolean),
      declaredMethod: rawInput.trim(),
      assumptions: [
        'The player is choosing a catastrophic command path rather than asking for counsel.',
        'Directive should commit the consequence and then offer checkpoint choices instead of silently refusing all terminal play.'
      ],
      signals: {
        ordersShipSelfDestruct,
        ordersShipRamming,
        ordersEvacuation,
        catastrophicShipLoss,
        playerDeathLikely,
        atrocityCommand,
        permanentCommandRemoval,
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
        'The player is arriving as permanent XO while the Breckenridge remains under working shakedown routines.',
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

  if (chapter1FirstContactExecutionPhase && rawInput.trim()) {
    return {
      summary: 'Execute the first Relief Convoy Twelve contact route after the boarding threshold has been committed.',
      primaryIntent: 'execute-first-contact-response',
      targetIds: [
        'relief-convoy-twelve',
        targetsFaradayRecords || startsRemoteVerification ? 'priya-nayar' : null,
        startsRemoteVerification ? 'rowan-saye' : null,
        targetsParnellRescue || preparesRescue || usesQuarantinePosture || bypassesQuarantine ? 'miriam-sato' : null,
        usesSecurityPosture || escalatesWeapons || detainsCompactPersonnel ? 'hadrik-bronn' : null,
        targetsParnellRescue || preservesConvoyEvidence || destroysConvoyEvidence ? 'imani-cross' : null
      ].filter(Boolean),
      declaredMethod: [
        usesBoardingTeam ? 'boarding team' : null,
        startsRemoteVerification ? 'remote access and verification' : null,
        targetsFaradayRecords ? 'Faraday Bell record access' : null,
        targetsParnellRescue ? 'Parnell rescue' : null,
        preparesRescue ? 'rescue execution' : null,
        preservesConvoyEvidence ? 'evidence custody' : null,
        usesQuarantinePosture ? 'quarantine discipline' : null,
        usesSecurityPosture ? 'security coverage' : null,
        bypassesQuarantine ? 'quarantine bypass' : null,
        escalatesWeapons ? 'weapons escalation' : null,
        destroysConvoyEvidence ? 'computer evidence destruction' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The first contact threshold has already been committed; this decision chooses how the first operational contact starts.',
        'The XO can direct rescue, remote access, boarding, quarantine, and evidence work while Whitaker retains final authority for major escalation.',
        'The scene may reveal only player-safe contact evidence until hidden actors are discovered through play.'
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
        usesBoardingTeam,
        targetsFaradayRecords,
        targetsParnellRescue,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (chapter1OffsiteDiscoveryPhase && rawInput.trim()) {
    return {
      summary: 'Frame the offsite shelter, custody, and missing-cargo leads produced by first contact with Relief Convoy Twelve.',
      primaryIntent: 'frame-offsite-custody-cargo-leads',
      targetIds: [
        'relief-convoy-twelve',
        tracksEvacuees || preparesRescue || usesQuarantinePosture ? 'miriam-sato' : null,
        tracksEvacuees ? 'rowan-saye' : null,
        addressesCustodyClaim || coordinatesWithAuthorities || keepsJointInspectionTone ? 'priya-nayar' : null,
        addressesCustodyClaim || usesSecurityPosture || escalatesWeapons || detainsCompactPersonnel ? 'hadrik-bronn' : null,
        tracksMissingCargo || preservesConvoyEvidence || destroysConvoyEvidence ? 'imani-cross' : null
      ].filter(Boolean),
      declaredMethod: [
        tracksEvacuees ? 'evacuee location' : null,
        addressesCustodyClaim ? 'custody and jurisdiction framing' : null,
        tracksMissingCargo ? 'missing cargo lead' : null,
        preparesRescue ? 'medical triage' : null,
        preservesConvoyEvidence ? 'evidence custody' : null,
        usesQuarantinePosture ? 'quarantine discipline' : null,
        usesSecurityPosture ? 'security posture' : null,
        keepsJointInspectionTone ? 'joint inspection posture' : null,
        coordinatesWithAuthorities ? 'external coordination' : null,
        escalatesWeapons ? 'weapons escalation' : null,
        detainsCompactPersonnel ? 'detention order' : null,
        destroysConvoyEvidence ? 'computer evidence destruction' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'First operational contact has produced enough player-facing evidence to frame the next Chapter 1 leads.',
        'The XO can direct shelter triage, custody framing, and cargo inventory work without resolving the full negotiation or cargo recovery yet.',
        'The scene may reveal offsite, custody, and cargo facts while keeping hidden signal-source and medical truth sealed.'
      ],
      signals: {
        requestsChapter1Counsel,
        startsRemoteVerification,
        preparesRescue,
        preservesConvoyEvidence,
        usesQuarantinePosture,
        usesSecurityPosture,
        escalatesAuthority,
        coordinatesWithAuthorities,
        bypassesQuarantine,
        escalatesWeapons,
        detainsCompactPersonnel,
        destroysConvoyEvidence,
        tracksEvacuees,
        addressesCustodyClaim,
        tracksMissingCargo,
        keepsJointInspectionTone,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (chapter1PellContactPhase && rawInput.trim()) {
    return {
      summary: 'Set the first Pell contact terms for custody, Ivers, and the missing secured cargo.',
      primaryIntent: 'set-pell-contact-terms',
      targetIds: [
        'relief-convoy-twelve',
        contactsPell || coordinatesWithAuthorities || keepsJointInspectionTone ? 'priya-nayar' : null,
        demandsIversRelease || usesSecurityPosture || escalatesWeapons || detainsCompactPersonnel ? 'hadrik-bronn' : null,
        preparesRescue || usesQuarantinePosture ? 'miriam-sato' : null,
        tracksMissingCargo || setsLegalCargoUndertaking || preservesConvoyEvidence || destroysConvoyEvidence ? 'imani-cross' : null,
        tracksMissingCargo || startsRemoteVerification ? 'rowan-saye' : null
      ].filter(Boolean),
      declaredMethod: [
        contactsPell ? 'Pell contact' : null,
        acknowledgesCompactConcern ? 'acknowledged Compact concern' : null,
        offersJointInspection ? 'joint inspection offer' : null,
        demandsIversRelease ? 'Ivers release route' : null,
        setsLegalCargoUndertaking ? 'cargo recovery undertaking' : null,
        sharesEvidence ? 'evidence sharing' : null,
        preservesConvoyEvidence ? 'evidence custody' : null,
        usesSecurityPosture ? 'security posture' : null,
        escalatesWeapons ? 'weapons escalation' : null,
        detainsCompactPersonnel ? 'detention order' : null,
        destroysConvoyEvidence ? 'computer evidence destruction' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'Shelter, custody, and missing-cargo leads are already framed; this decision sets the first contact terms with Pell.',
        'The XO can propose release terms, joint inspection, evidence sharing, and cargo recovery routes without resolving the full negotiation yet.',
        'The scene may reveal player-facing warning and manifest facts while deeper causes remain unrevealed.'
      ],
      signals: {
        requestsChapter1Counsel,
        startsRemoteVerification,
        preparesRescue,
        preservesConvoyEvidence,
        usesQuarantinePosture,
        usesSecurityPosture,
        escalatesAuthority,
        coordinatesWithAuthorities,
        bypassesQuarantine,
        escalatesWeapons,
        detainsCompactPersonnel,
        destroysConvoyEvidence,
        tracksMissingCargo,
        keepsJointInspectionTone,
        contactsPell,
        acknowledgesCompactConcern,
        demandsIversRelease,
        offersJointInspection,
        setsLegalCargoUndertaking,
        sharesEvidence,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (chapter1JointInspectionPhase && rawInput.trim()) {
    return {
      summary: 'Execute the opened joint inspection route for Ivers release and the missing secured cargo.',
      primaryIntent: 'execute-joint-inspection-release',
      targetIds: [
        'relief-convoy-twelve',
        contactsPell || coordinatesWithAuthorities || givesPellLawfulExit || opensSharedInspectionRecord ? 'priya-nayar' : null,
        securesSupervisedRelease || demandsIversRelease || usesSecurityPosture || escalatesWeapons || detainsCompactPersonnel ? 'hadrik-bronn' : null,
        preparesRescue || usesQuarantinePosture ? 'miriam-sato' : null,
        tracksMissingCargo || setsLegalCargoUndertaking || protectsCargoEvidenceChain || preservesConvoyEvidence || destroysConvoyEvidence ? 'imani-cross' : null,
        tracksMissingCargo || startsRemoteVerification || executesJointInspection ? 'rowan-saye' : null
      ].filter(Boolean),
      declaredMethod: [
        executesJointInspection || offersJointInspection ? 'joint inspection execution' : null,
        securesSupervisedRelease || demandsIversRelease ? 'Ivers supervised release' : null,
        opensSharedInspectionRecord || sharesEvidence ? 'shared inspection record' : null,
        protectsCargoEvidenceChain || setsLegalCargoUndertaking ? 'cargo evidence chain' : null,
        givesPellLawfulExit || acknowledgesCompactConcern ? 'Pell lawful exit' : null,
        preservesConvoyEvidence ? 'evidence custody' : null,
        usesSecurityPosture ? 'security posture' : null,
        escalatesWeapons ? 'weapons escalation' : null,
        detainsCompactPersonnel ? 'detention order' : null,
        destroysConvoyEvidence ? 'computer evidence destruction' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'Pell contact terms are already open; this decision executes the first shared inspection and supervised release route.',
        'The XO can protect Ivers as a supervised witness and create a shared record without resolving final cargo recovery yet.',
        'The scene may reveal player-facing Ivers and shared-record facts while deeper causes remain unrevealed.'
      ],
      signals: {
        requestsChapter1Counsel,
        startsRemoteVerification,
        preparesRescue,
        preservesConvoyEvidence,
        usesQuarantinePosture,
        usesSecurityPosture,
        escalatesAuthority,
        coordinatesWithAuthorities,
        bypassesQuarantine,
        escalatesWeapons,
        detainsCompactPersonnel,
        destroysConvoyEvidence,
        tracksMissingCargo,
        keepsJointInspectionTone,
        contactsPell,
        acknowledgesCompactConcern,
        demandsIversRelease,
        offersJointInspection,
        setsLegalCargoUndertaking,
        sharesEvidence,
        executesJointInspection,
        securesSupervisedRelease,
        opensSharedInspectionRecord,
        protectsCargoEvidenceChain,
        givesPellLawfulExit,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (chapter1CargoPulsePhase && rawInput.trim()) {
    return {
      summary: 'Trace and preserve the missing cargo diagnostic pulse under the active joint inspection route.',
      primaryIntent: 'trace-cargo-diagnostic-pulse',
      targetIds: [
        'relief-convoy-twelve',
        contactsPell || coordinatesWithAuthorities || givesPellLawfulExit || preservesJointCargoSeal ? 'priya-nayar' : null,
        usesSecurityPosture || preparesNonHostileInterception || escalatesWeapons || detainsCompactPersonnel || attemptsImmediateCargoSeizure ? 'hadrik-bronn' : null,
        tracksMissingCargo || setsLegalCargoUndertaking || protectsCargoEvidenceChain || tracesDiagnosticPulse || preservesConvoyEvidence || destroysConvoyEvidence ? 'imani-cross' : null,
        tracksMissingCargo || startsRemoteVerification || tracesDiagnosticPulse ? 'rowan-saye' : null
      ].filter(Boolean),
      declaredMethod: [
        tracesDiagnosticPulse ? 'diagnostic pulse trace' : null,
        preservesJointCargoSeal ? 'joint cargo seal' : null,
        protectsCargoEvidenceChain || setsLegalCargoUndertaking ? 'cargo evidence chain' : null,
        givesPellLawfulExit || acknowledgesCompactConcern ? 'Pell lawful exit' : null,
        preparesNonHostileInterception ? 'non-hostile interception' : null,
        usesSecurityPosture ? 'security posture' : null,
        attemptsImmediateCargoSeizure ? 'immediate cargo seizure' : null,
        escalatesWeapons ? 'weapons escalation' : null,
        destroysConvoyEvidence ? 'computer evidence destruction' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The joint inspection record is open and Ivers is available; this decision traces the first recoverable cargo signal.',
        'The XO can preserve a shared recovery locus without completing final hardware recovery yet.',
        'The scene may reveal player-facing cargo-signal facts while later hardware use and deeper causes remain unrevealed.'
      ],
      signals: {
        requestsChapter1Counsel,
        startsRemoteVerification,
        preservesConvoyEvidence,
        usesSecurityPosture,
        escalatesAuthority,
        coordinatesWithAuthorities,
        escalatesWeapons,
        detainsCompactPersonnel,
        destroysConvoyEvidence,
        tracksMissingCargo,
        keepsJointInspectionTone,
        contactsPell,
        acknowledgesCompactConcern,
        setsLegalCargoUndertaking,
        sharesEvidence,
        opensSharedInspectionRecord,
        protectsCargoEvidenceChain,
        givesPellLawfulExit,
        tracesDiagnosticPulse,
        preservesJointCargoSeal,
        preparesNonHostileInterception,
        attemptsImmediateCargoSeizure,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (chapter1HardwareRecoveryPhase && rawInput.trim()) {
    return {
      summary: 'Recover the missing emergency hardware under seal while preserving the diagnostic trace.',
      primaryIntent: 'recover-hardware-under-seal',
      targetIds: [
        'relief-convoy-twelve',
        coordinatesWithAuthorities || givesPellLawfulExit || preservesJointCargoSeal || defersFinalCustody ? 'priya-nayar' : null,
        usesSecurityPosture || preparesNonHostileInterception || escalatesWeapons || detainsCompactPersonnel || attemptsImmediateCargoSeizure ? 'hadrik-bronn' : null,
        tracksMissingCargo || recoversEmergencyHardware || protectsCargoEvidenceChain || preservesRecoveryTelemetry || preservesConvoyEvidence || destroysConvoyEvidence ? 'imani-cross' : null,
        tracksMissingCargo || startsRemoteVerification || tracesDiagnosticPulse || preservesRecoveryTelemetry ? 'rowan-saye' : null
      ].filter(Boolean),
      declaredMethod: [
        recoversEmergencyHardware ? 'emergency hardware recovery' : null,
        preservesJointCargoSeal || defersFinalCustody ? 'joint evidence seal' : null,
        preservesRecoveryTelemetry ? 'recovery telemetry preservation' : null,
        protectsCargoEvidenceChain || setsLegalCargoUndertaking ? 'cargo evidence chain' : null,
        givesPellLawfulExit || acknowledgesCompactConcern ? 'Pell lawful exit' : null,
        preparesNonHostileInterception ? 'non-hostile interception' : null,
        usesSecurityPosture ? 'security posture' : null,
        attemptsImmediateCargoSeizure ? 'immediate cargo seizure' : null,
        escalatesWeapons ? 'weapons escalation' : null,
        destroysConvoyEvidence ? 'computer evidence destruction' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The cargo signal has been traced; this decision recovers or contests the missing emergency hardware.',
        'The XO can recover the hardware under joint evidence seal without settling final custody yet.',
        'The scene may reveal player-facing recovery and timing-trace facts while later hardware use and deeper causes remain unrevealed.'
      ],
      signals: {
        requestsChapter1Counsel,
        startsRemoteVerification,
        preservesConvoyEvidence,
        usesSecurityPosture,
        escalatesAuthority,
        coordinatesWithAuthorities,
        escalatesWeapons,
        detainsCompactPersonnel,
        destroysConvoyEvidence,
        tracksMissingCargo,
        keepsJointInspectionTone,
        contactsPell,
        acknowledgesCompactConcern,
        setsLegalCargoUndertaking,
        sharesEvidence,
        opensSharedInspectionRecord,
        protectsCargoEvidenceChain,
        givesPellLawfulExit,
        tracesDiagnosticPulse,
        preservesJointCargoSeal,
        preparesNonHostileInterception,
        attemptsImmediateCargoSeizure,
        recoversEmergencyHardware,
        preservesRecoveryTelemetry,
        defersFinalCustody,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (chapter1ResolutionTermsPhase && rawInput.trim()) {
    return {
      summary: 'Set the Chapter 1 convoy-crisis resolution terms and durable consequences.',
      primaryIntent: 'set-chapter1-resolution-terms',
      targetIds: [
        'relief-convoy-twelve',
        createsJointIncidentRecord || grantsCompactInvestigationAccess || acknowledgesAuthenticationFailure || recruitsPellWitness ? 'priya-nayar' : null,
        usesSecurityPosture || escalatesWeapons || detainsCompactPersonnel || usesSuperiorAuthority || costlyResolutionIncident ? 'hadrik-bronn' : null,
        preparesRescue || usesQuarantinePosture || costlyResolutionIncident ? 'miriam-sato' : null,
        recoversEmergencyHardware || protectsCargoEvidenceChain || documentsParnellTechnicalDebt || finalizesJointCustody ? 'imani-cross' : null,
        preservesRecoveryTelemetry || acknowledgesAuthenticationFailure || startsRemoteVerification || securesIversTrust || securesSupervisedRelease || demandsIversRelease ? 'rowan-saye' : null
      ].filter(Boolean),
      declaredMethod: [
        createsJointIncidentRecord || opensSharedInspectionRecord ? 'joint incident record' : null,
        securesIversTrust || securesSupervisedRelease || demandsIversRelease ? 'Ivers witness trust' : null,
        recruitsPellWitness || givesPellLawfulExit ? 'Pell witness terms' : null,
        grantsCompactInvestigationAccess || sharesEvidence ? 'Compact investigation access' : null,
        acknowledgesAuthenticationFailure ? 'authentication accountability' : null,
        documentsParnellTechnicalDebt ? 'Parnell rescue follow-up' : null,
        finalizesJointCustody || preservesJointCargoSeal ? 'joint custody terms' : null,
        usesSuperiorAuthority || escalatesAuthority ? 'authority-driven closure' : null,
        costlyResolutionIncident ? 'costly incident' : null,
        fragmentedResolution ? 'fragmented record' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The missing emergency hardware has been recovered or contested; this decision records the immediate Chapter 1 resolution terms.',
        'The XO can shape the joint incident record, witness status, investigation access, authentication accountability, and rescue follow-up obligations.',
        'The scene may reveal player-facing resolution facts while the deeper false-order source remains unrevealed.'
      ],
      signals: {
        requestsChapter1Counsel,
        startsRemoteVerification,
        preparesRescue,
        preservesConvoyEvidence,
        usesQuarantinePosture,
        usesSecurityPosture,
        escalatesAuthority,
        coordinatesWithAuthorities,
        escalatesWeapons,
        detainsCompactPersonnel,
        destroysConvoyEvidence,
        tracksMissingCargo,
        keepsJointInspectionTone,
        contactsPell,
        acknowledgesCompactConcern,
        setsLegalCargoUndertaking,
        sharesEvidence,
        opensSharedInspectionRecord,
        protectsCargoEvidenceChain,
        givesPellLawfulExit,
        demandsIversRelease,
        securesSupervisedRelease,
        tracesDiagnosticPulse,
        preservesJointCargoSeal,
        preparesNonHostileInterception,
        recoversEmergencyHardware,
        preservesRecoveryTelemetry,
        defersFinalCustody,
        createsJointIncidentRecord,
        securesIversTrust,
        recruitsPellWitness,
        grantsCompactInvestigationAccess,
        acknowledgesAuthenticationFailure,
        documentsParnellTechnicalDebt,
        finalizesJointCustody,
        usesSuperiorAuthority,
        costlyResolutionIncident,
        fragmentedResolution,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (chapter1FalseColorsTransitionPhase && rawInput.trim()) {
    return {
      summary: 'Carry the Chapter 1 record into Asterion arrival and receive the False Colors crisis report.',
      primaryIntent: 'transition-chapter1-to-false-colors',
      targetIds: [
        'relief-convoy-twelve',
        reachesAsterion || alertsAsterionAuthorities || carriesJointRecordForward ? 'priya-nayar' : null,
        receivesCompactPatrolReport || maintainsNonHostileTransition || usesSecurityPosture || escalatesWeapons ? 'hadrik-bronn' : null,
        receivesCompactPatrolReport || startsRemoteVerification ? 'rowan-saye' : null,
        carriesJointRecordForward || preservesConvoyEvidence ? 'imani-cross' : null
      ].filter(Boolean),
      declaredMethod: [
        reachesAsterion ? 'Asterion arrival' : null,
        carriesJointRecordForward ? 'joint record handoff' : null,
        receivesCompactPatrolReport ? 'Compact patrol report' : null,
        alertsAsterionAuthorities ? 'authority notification' : null,
        maintainsNonHostileTransition ? 'non-hostile transition posture' : null,
        escalatesWeapons ? 'weapons escalation' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The immediate convoy crisis has closing terms; this decision moves the campaign into the next crisis report.',
        'The XO can carry the joint record into the Asterion briefing and shape the first response posture to the false-colors report.',
        'The scene may reveal only Asterion arrival and the patrol report, not the source or purpose of the impersonating vessel.'
      ],
      signals: {
        requestsChapter1Counsel,
        startsRemoteVerification,
        preservesConvoyEvidence,
        usesSecurityPosture,
        escalatesAuthority,
        coordinatesWithAuthorities,
        escalatesWeapons,
        detainsCompactPersonnel,
        destroysConvoyEvidence,
        sharesEvidence,
        opensSharedInspectionRecord,
        preservesJointCargoSeal,
        createsJointIncidentRecord,
        acknowledgesAuthenticationFailure,
        reachesAsterion,
        receivesCompactPatrolReport,
        carriesJointRecordForward,
        alertsAsterionAuthorities,
        maintainsNonHostileTransition,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (chapter2TransparencyTermsPhase && rawInput.trim()) {
    return {
      summary: 'Set the first False Colors transparency terms for medical help, independent verification, Compact access, alibi proof, and tactical secrecy.',
      primaryIntent: 'set-false-colors-transparency-terms',
      targetIds: [
        'aegis-two',
        permitsJointAudit || allowsCompactObservers || createsClassifiedAnnex || coordinatesWithAuthorities || deniesCompactAccess ? 'priya-nayar' : null,
        permitsJointAudit || invitesNeutralSpecialist || verifiesBreckenridgeAlibi || usesCryptographicChallenge || establishesIndependentSensorBaseline || startsRemoteVerification ? 'rowan-saye' : null,
        offersAegisMedicalHelp || separatesMedicalFromPolitics || preparesRescue ? 'miriam-sato' : null,
        protectsTacticalSecrets || refusesUnrestrictedAuthAccess || overexposesTacticalSystems || usesSecurityPosture ? 'hadrik-bronn' : null,
        reachesAsterion || alertsAsterionAuthorities || escalatesAuthority ? 'mara-whitaker' : null
      ].filter(Boolean),
      declaredMethod: [
        permitsJointAudit ? 'joint audit' : null,
        invitesNeutralSpecialist ? 'neutral specialist' : null,
        allowsCompactObservers ? 'Compact observer access' : null,
        offersAegisMedicalHelp ? 'Aegis Two medical help' : null,
        separatesMedicalFromPolitics ? 'medical care separated from politics' : null,
        verifiesBreckenridgeAlibi || usesCryptographicChallenge || establishesIndependentSensorBaseline ? 'independent alibi verification' : null,
        createsClassifiedAnnex || protectsTacticalSecrets ? 'classified tactical annex' : null,
        refusesUnrestrictedAuthAccess ? 'refused unrestricted command-authentication access' : null,
        overexposesTacticalSystems ? 'overexposed tactical systems' : null,
        deniesCompactAccess || authorityOnlyAlibiClaim ? 'authority-only denial' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The Aegis Two report is public enough to require independent verification, not merely Starfleet self-certification.',
        'The XO can offer medical help and verifiable proof without conceding culpability.',
        'The scene may reveal attack, signature, alibi, casualty, and transparency facts while the source of the impersonation remains unrevealed.'
      ],
      signals: {
        startsRemoteVerification,
        preparesRescue,
        usesSecurityPosture,
        escalatesAuthority,
        coordinatesWithAuthorities,
        escalatesWeapons,
        detainsCompactPersonnel,
        receivesCompactPatrolReport,
        alertsAsterionAuthorities,
        permitsJointAudit,
        invitesNeutralSpecialist,
        allowsCompactObservers,
        offersAegisMedicalHelp,
        separatesMedicalFromPolitics,
        verifiesBreckenridgeAlibi,
        usesCryptographicChallenge,
        establishesIndependentSensorBaseline,
        protectsTacticalSecrets,
        createsClassifiedAnnex,
        refusesUnrestrictedAuthAccess,
        overexposesTacticalSystems,
        deniesCompactAccess,
        authorityOnlyAlibiClaim,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (chapter2EvidenceBaselinePhase && rawInput.trim()) {
    return {
      summary: 'Preserve the Orison evidence baseline and turn transparency terms into an independent alibi route.',
      primaryIntent: 'establish-orison-evidence-baseline',
      targetIds: [
        'aegis-two',
        securesOrisonBaseline || preservesAuditChain || releasesSelectedLogs || allowsCompactObservers || permitsJointAudit ? 'priya-nayar' : null,
        securesOrisonBaseline || reconstructsAttackerRoute || startsRemoteVerification ? 'rowan-saye' : null,
        usesImaniCalibration ? 'imani-cross' : null,
        protectsTacticalSecrets || createsClassifiedAnnex || refusesUnrestrictedAuthAccess || overexposesTacticalSystems ? 'hadrik-bronn' : null,
        makesUnsupportedHoltAccusation || covertHoltInquiry || preservesDirectorateAccessLogs ? 'mara-whitaker' : null
      ].filter(Boolean),
      declaredMethod: [
        securesOrisonBaseline ? 'Orison sensor baseline preservation' : null,
        preservesAuditChain ? 'joint audit chain' : null,
        allowsCompactObservers || permitsJointAudit ? 'Compact observer participation' : null,
        usesImaniCalibration ? 'Breckenridge post-refit calibration comparison' : null,
        reconstructsAttackerRoute ? 'attacker route reconstruction' : null,
        releasesSelectedLogs ? 'selected nonclassified log release' : null,
        protectsTacticalSecrets || createsClassifiedAnnex ? 'protected tactical disclosure boundary' : null,
        preservesDirectorateAccessLogs || covertHoltInquiry ? 'quiet access-log preservation' : null,
        makesUnsupportedHoltAccusation ? 'unsupported public accusation' : null,
        overexposesTacticalSystems ? 'overexposed tactical systems' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'Transparency terms are already framed; this decision must preserve independent evidence before later edits or public certainty harden.',
        'The XO can involve Compact observers and selected nonclassified logs without exposing command authentication systems.',
        'The scene may reveal Orison baseline, calibration mismatch, and reconstruction-route facts while the attacking craft and deeper source remain unrevealed.'
      ],
      signals: {
        startsRemoteVerification,
        preservesConvoyEvidence,
        usesSecurityPosture,
        escalatesAuthority,
        coordinatesWithAuthorities,
        escalatesWeapons,
        detainsCompactPersonnel,
        permitsJointAudit,
        invitesNeutralSpecialist,
        allowsCompactObservers,
        verifiesBreckenridgeAlibi,
        usesCryptographicChallenge,
        establishesIndependentSensorBaseline,
        protectsTacticalSecrets,
        createsClassifiedAnnex,
        refusesUnrestrictedAuthAccess,
        overexposesTacticalSystems,
        deniesCompactAccess,
        authorityOnlyAlibiClaim,
        securesOrisonBaseline,
        preservesAuditChain,
        usesImaniCalibration,
        reconstructsAttackerRoute,
        releasesSelectedLogs,
        preservesDirectorateAccessLogs,
        makesUnsupportedHoltAccusation,
        covertHoltInquiry,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (chapter2MedicalTrustPhase && rawInput.trim()) {
    return {
      summary: 'Stabilize Aegis Two casualties and preserve voluntary patrol testimony without turning care into leverage.',
      primaryIntent: 'stabilize-aegis-medical-trust',
      targetIds: [
        'aegis-two',
        stabilizesCriticalOfficer || opensJointMedicalChannel || protectsMedicalConsent || usesCareAsLeverage || forcesMedicalQuestioning ? 'miriam-sato' : null,
        opensJointMedicalChannel || recordsMedicalNeutrality || preservesPatrolTestimony ? 'priya-nayar' : null,
        preservesPatrolTestimony ? 'rowan-saye' : null,
        escalatesAuthority || usesCareAsLeverage || forcesMedicalQuestioning ? 'mara-whitaker' : null
      ].filter(Boolean),
      declaredMethod: [
        stabilizesCriticalOfficer ? 'critical officer stabilization' : null,
        opensJointMedicalChannel ? 'joint medical channel' : null,
        separatesMedicalFromPolitics || recordsMedicalNeutrality ? 'care separated from politics' : null,
        protectsMedicalConsent ? 'patient consent and privacy' : null,
        preservesPatrolTestimony ? 'voluntary patrol testimony' : null,
        usesCareAsLeverage ? 'care used as leverage' : null,
        forcesMedicalQuestioning ? 'forced medical questioning' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The evidence baseline is preserved enough that medical trust and testimony can support legitimacy without becoming coercion.',
        'Miriam can treat Aegis Two personnel while Priya separates medical neutrality from culpability or access concessions.',
        'The scene may reveal care, stabilization, and voluntary testimony facts while attacker-source truth remains unrevealed.'
      ],
      signals: {
        startsRemoteVerification,
        preparesRescue,
        usesSecurityPosture,
        escalatesAuthority,
        coordinatesWithAuthorities,
        escalatesWeapons,
        detainsCompactPersonnel,
        offersAegisMedicalHelp,
        separatesMedicalFromPolitics,
        stabilizesCriticalOfficer,
        opensJointMedicalChannel,
        protectsMedicalConsent,
        preservesPatrolTestimony,
        recordsMedicalNeutrality,
        usesCareAsLeverage,
        forcesMedicalQuestioning,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (chapter1BoardingThresholdPhase && rawInput.trim()) {
    return {
      summary: 'Set the first boarding, rescue contact, quarantine, or evidence threshold for Relief Convoy Twelve.',
      primaryIntent: 'set-first-boarding-threshold',
      targetIds: [
        'relief-convoy-twelve',
        startsRemoteVerification ? 'priya-nayar' : null,
        startsRemoteVerification ? 'rowan-saye' : null,
        preparesRescue || usesQuarantinePosture || bypassesQuarantine ? 'miriam-sato' : null,
        usesSecurityPosture || escalatesWeapons || detainsCompactPersonnel ? 'hadrik-bronn' : null,
        preservesConvoyEvidence || destroysConvoyEvidence ? 'imani-cross' : null
      ].filter(Boolean),
      declaredMethod: [
        closesOnConvoy ? 'close approach' : null,
        startsRemoteVerification ? 'verification threshold' : null,
        preparesRescue ? 'rescue contact' : null,
        preservesConvoyEvidence ? 'evidence custody' : null,
        usesQuarantinePosture ? 'quarantine threshold' : null,
        usesSecurityPosture ? 'security threshold' : null,
        holdsAtRange ? 'stand-off threshold' : null,
        bypassesQuarantine ? 'quarantine bypass' : null,
        escalatesWeapons ? 'weapons escalation' : null,
        detainsCompactPersonnel ? 'Compact detention' : null,
        destroysConvoyEvidence ? 'computer evidence destruction' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The opening response is already underway; this decision defines the first irreversible contact threshold.',
        'The XO can set boarding, quarantine, security, and evidence custody conditions while Whitaker retains final authority for major escalation.',
        'Hidden causes remain unrevealed unless player-facing evidence supports discovery.'
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

  if (chapter2JointCharterPhase && rawInput.trim()) {
    return {
      summary: 'Frame the joint investigation charter, preserve the weak Hecate lead, and authorize the Open Orders transition.',
      primaryIntent: 'frame-joint-investigation-charter',
      targetIds: [
        'director-nia-kessler',
        framesJointInvestigationCharter || restrictsHoltInterference || preservesDirectorateAccessLogs ? 'priya-nayar' : null,
        preservesWeakHecateTrace || startsRemoteVerification ? 'rowan-saye' : null,
        authorizesOpenOrders || escalatesAuthority ? 'mara-whitaker' : null,
        restrictsHoltInterference || makesUnsupportedHoltAccusation ? 'hadrik-bronn' : null
      ].filter(Boolean),
      declaredMethod: [
        framesJointInvestigationCharter || permitsJointAudit || allowsCompactObservers ? 'joint investigation charter' : null,
        givesKesslerFaceSavingStatement || givesKesslerDefensibleAlternative ? 'Kessler legitimacy statement' : null,
        restrictsHoltInterference || preservesDirectorateAccessLogs || covertHoltInquiry ? 'Holt interference restriction' : null,
        preservesWeakHecateTrace ? 'weak Hecate trace preserved for correlation' : null,
        authorizesOpenOrders ? 'Open Orders Reach presence' : null,
        overclaimsHecateTrace ? 'weak trace overclaimed' : null,
        makesUnsupportedHoltAccusation ? 'unsupported public accusation' : null,
        escalatesWeapons || detainsCompactPersonnel ? 'coercive escalation' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The evidence, medical trust, and security-access records are strong enough to close the first False Colors crisis into a joint framework.',
        'The player can frame the charter and Open Orders pause without declaring final attribution.',
        'The scene may reveal the weak Hecate lead, but not the attacker craft, hidden faction, or local insider source.'
      ],
      signals: {
        startsRemoteVerification,
        usesSecurityPosture,
        escalatesAuthority,
        coordinatesWithAuthorities,
        escalatesWeapons,
        detainsCompactPersonnel,
        permitsJointAudit,
        allowsCompactObservers,
        preservesDirectorateAccessLogs,
        makesUnsupportedHoltAccusation,
        covertHoltInquiry,
        givesKesslerDefensibleAlternative,
        framesJointInvestigationCharter,
        givesKesslerFaceSavingStatement,
        restrictsHoltInterference,
        preservesWeakHecateTrace,
        authorizesOpenOrders,
        overclaimsHecateTrace,
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

  if (chapter2SecurityAccessPhase && rawInput.trim()) {
    return {
      summary: 'Resolve the security-access challenge by proving command-system integrity without surrendering command-authentication architecture.',
      primaryIntent: 'set-security-access-demonstration',
      targetIds: [
        'uss-breckenridge',
        definesControlledSecurityAnnex || runsCommandAuthDemonstration || defendsBronnSecurityRole || scapegoatsBronn ? 'hadrik-bronn' : null,
        definesControlledSecurityAnnex || runsCommandAuthDemonstration || givesKesslerDefensibleAlternative ? 'priya-nayar' : null,
        runsCommandAuthDemonstration || startsRemoteVerification || usesCryptographicChallenge ? 'rowan-saye' : null,
        givesKesslerDefensibleAlternative || deniesCompactAccess || acceptsUnrestrictedCommandInspection ? 'director-nia-kessler' : null,
        honorsTollandDisclosureLimit || escalatesAuthority || acceptsUnrestrictedCommandInspection ? 'mara-whitaker' : null
      ].filter(Boolean),
      declaredMethod: [
        definesControlledSecurityAnnex || createsClassifiedAnnex || protectsTacticalSecrets ? 'controlled security annex' : null,
        runsCommandAuthDemonstration || usesCryptographicChallenge ? 'command-authentication demonstration' : null,
        defendsBronnSecurityRole ? 'Bronn professional security demonstration' : null,
        givesKesslerDefensibleAlternative ? 'Kessler defensible access alternative' : null,
        honorsTollandDisclosureLimit ? 'Tolland disclosure limit honored' : null,
        refusesUnrestrictedAuthAccess ? 'refused unrestricted command-system access' : null,
        acceptsUnrestrictedCommandInspection || overexposesTacticalSystems ? 'unrestricted command-system exposure' : null,
        deniesCompactAccess || authorityOnlyAlibiClaim ? 'authority-only refusal' : null,
        scapegoatsBronn ? 'Bronn scapegoated' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'Medical trust is stable enough for the next dispute to center on command-system access rather than casualty care.',
        'The XO can offer a controlled identity proof without granting unrestricted command-authentication access.',
        'The scene may reveal access-boundary and command-authentication demonstration facts while attacker-source truth remains unrevealed.'
      ],
      signals: {
        startsRemoteVerification,
        usesSecurityPosture,
        escalatesAuthority,
        coordinatesWithAuthorities,
        escalatesWeapons,
        detainsCompactPersonnel,
        permitsJointAudit,
        invitesNeutralSpecialist,
        allowsCompactObservers,
        verifiesBreckenridgeAlibi,
        usesCryptographicChallenge,
        protectsTacticalSecrets,
        createsClassifiedAnnex,
        refusesUnrestrictedAuthAccess,
        overexposesTacticalSystems,
        deniesCompactAccess,
        authorityOnlyAlibiClaim,
        releasesSelectedLogs,
        definesControlledSecurityAnnex,
        runsCommandAuthDemonstration,
        defendsBronnSecurityRole,
        givesKesslerDefensibleAlternative,
        honorsTollandDisclosureLimit,
        scapegoatsBronn,
        acceptsUnrestrictedCommandInspection,
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
