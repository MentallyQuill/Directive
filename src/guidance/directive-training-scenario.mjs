const TRAINING_PACKAGE_ID = 'tutorial-training-package-ashes-of-peace';
const TRAINING_CAMPAIGN_ID = 'tutorial-training-campaign-ashes-of-peace';
const TRAINING_SAVE_ID = 'tutorial-training-save-preview';
const TRAINING_MISSION_ID = 'tutorial-training-mission-diplomatic-escort';
const TRAINING_PLAYER_ID = 'tutorial-training-player-commander';

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return '2401-06-25T12:00:00.000Z';
}

const TRAINING_CREW = Object.freeze([
  Object.freeze({
    id: 'mara-whitaker',
    name: 'Mara Whitaker',
    rank: 'Commander',
    billet: 'Executive Officer',
    division: 'command',
    species: 'Human',
    publicBio: [
      'A precise first officer known for turning tense briefings into executable plans.',
      'Currently tracking whether the new command team can keep civilians safe without ceding initiative.'
    ]
  }),
  Object.freeze({
    id: 'talen-var',
    name: 'Talen Var',
    rank: 'Lieutenant Commander',
    billet: 'Chief Engineer',
    division: 'operations',
    species: 'Trill',
    publicBio: [
      'A shakedown engineer carrying a long list of careful caveats.',
      'Trusts command decisions that acknowledge hard limits before demanding miracles.'
    ]
  }),
  Object.freeze({
    id: 'sorell-tav',
    name: 'Sorell Tav',
    rank: 'Lieutenant',
    billet: 'Chief Science Officer',
    division: 'science',
    species: 'Vulcan',
    publicBio: [
      'A survey specialist assigned to separate sensor fact from diplomatic rumor.',
      'Prefers explicit uncertainty over confident guesses.'
    ]
  }),
  Object.freeze({
    id: 'jae-min-oro',
    name: 'Jae-Min Oro',
    rank: 'Lieutenant',
    billet: 'Security Chief',
    division: 'operations',
    species: 'Human',
    publicBio: [
      'A measured security officer who protects negotiations by planning for failure.',
      'Currently watching the escort route for signs of coordinated interference.'
    ]
  })
]);

const TRAINING_PACKAGE = Object.freeze({
  packageId: TRAINING_PACKAGE_ID,
  title: 'Training Scenario: Ashes of Peace',
  selected: true,
  source: 'tutorial-training-scenario',
  simulationModes: Object.freeze(['Exploration', 'Command']),
  actions: Object.freeze({
    startNewCampaign: true,
    loadLatestSave: TRAINING_SAVE_ID
  }),
  counts: Object.freeze({
    saves: 1
  }),
  manifest: Object.freeze({
    id: TRAINING_PACKAGE_ID,
    title: 'Training Scenario: Ashes of Peace',
    version: '0.0.0-training'
  }),
  campaign: Object.freeze({
    id: TRAINING_CAMPAIGN_ID,
    title: 'Training Scenario: Ashes of Peace',
    eraLabel: 'Tutorial Preview',
    openingStardate: '78144.2',
    openingYear: 2401,
    highConcept: 'A newly assigned command officer escorts a fragile peace delegation through a contested debris field.',
    structure: Object.freeze({
      expectedSessions: 2,
      storyArcCount: 2,
      questTemplateCount: 3
    }),
    chapters: Object.freeze([
      Object.freeze({
        id: TRAINING_MISSION_ID,
        title: 'Diplomatic Escort',
        type: 'main',
        question: 'Can the crew preserve the delegation without escalating a border incident?',
        mvpCheckpoint: Object.freeze({
          label: 'Escort Secured',
          chapter2OpenReason: 'The delegation can continue after the convoy reaches the relay station.',
          established: Object.freeze([
            'The convoy route is mapped through the debris field.',
            'Two factions are watching the escort for weakness.'
          ]),
          unresolved: Object.freeze([
            'The source of the spoofed beacon remains unknown.',
            'Engineering still has one shield-grid caveat.'
          ]),
          carryForward: Object.freeze([
            'The player protected civilians before pursuing tactical advantage.'
          ])
        })
      })
    ])
  }),
  playerRole: Object.freeze({
    label: 'Command officer',
    rank: 'Commander',
    billet: 'Mission Commander'
  }),
  ship: Object.freeze({
    id: 'tutorial-training-uss-breckenridge',
    name: 'U.S.S. Breckenridge',
    class: 'Aegean-class light cruiser',
    registry: 'NCC-74211',
    affiliation: 'Starfleet',
    openingCondition: 'Operational with shakedown restrictions after emergency refit.',
    systems: Object.freeze({
      knownTechnicalDebt: Object.freeze([
        Object.freeze({
          id: 'tutorial-training-technical-debt-shield-grid',
          label: 'Shield grid validation gap',
          playerSummary: 'Forward shield harmonics hold under normal load but should not absorb a sustained barrage.',
          status: 'watch',
          severity: 'moderate',
          department: 'Engineering'
        })
      ])
    })
  }),
  crew: Object.freeze({
    senior: TRAINING_CREW
  }),
  locations: Object.freeze([
    Object.freeze({
      id: 'tutorial-training-asterion-relay',
      name: 'Asterion Relay Station'
    })
  ])
});

const TRAINING_SAVE = Object.freeze({
  id: TRAINING_SAVE_ID,
  name: 'Training Preview Save',
  slotType: 'manual',
  current: true,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  metadata: Object.freeze({
    campaignId: TRAINING_CAMPAIGN_ID,
    campaignTitle: 'Training Scenario: Ashes of Peace',
    packageId: TRAINING_PACKAGE_ID,
    shipName: 'U.S.S. Breckenridge',
    activeMissionId: TRAINING_MISSION_ID,
    activePhaseId: 'relay-approach',
    stardate: '78144.7',
    simulationMode: 'Command',
    summary: 'Training preview save with a pending outcome, crew memory, ship readiness, records, and recovery surfaces populated.'
  })
});

const TRAINING_SESSION = Object.freeze({
  key: 'tutorial-training-session',
  campaignId: TRAINING_CAMPAIGN_ID,
  packageId: TRAINING_PACKAGE_ID,
  packageTitle: 'Training Scenario: Ashes of Peace',
  campaignTitle: 'Training Scenario: Ashes of Peace',
  saveId: TRAINING_SAVE_ID,
  saveName: 'Training Preview Save',
  slotType: 'tutorial preview',
  status: 'active',
  current: true,
  hidden: false,
  playerName: 'Commander Vale',
  shipName: 'U.S.S. Breckenridge',
  activeMissionId: TRAINING_MISSION_ID,
  activePhaseId: 'relay-approach',
  stardate: '78144.7',
  simulationMode: 'Command',
  updatedAt: nowIso(),
  summary: 'Tutorial-only preview: the convoy is entering a debris field while the crew tracks a spoofed distress beacon.',
  binding: Object.freeze({
    chatName: 'Training Preview Chat',
    status: 'training-preview'
  })
});

const COMMAND_LOG_ENTRIES = Object.freeze([
  Object.freeze({
    id: 'tutorial-training-log-001',
    type: 'missionStart',
    stardate: '78144.2',
    summaryInputs: Object.freeze(['Accepted escort duty and mounted the Breckenridge command team.']),
    visibleConsequences: Object.freeze(['Convoy route established.']),
    assistedSummary: Object.freeze({
      title: 'Escort Mission Accepted',
      status: 'complete',
      summary: 'The player accepted responsibility for escorting the delegation through the contested debris field.',
      highlights: Object.freeze(['Mission authority established.', 'Crew briefed on diplomatic constraints.'])
    })
  }),
  Object.freeze({
    id: 'tutorial-training-log-002',
    type: 'relationshipBeat',
    stardate: '78144.4',
    summaryInputs: Object.freeze(['Backed engineering caution during route selection.']),
    visibleConsequences: Object.freeze(['Engineering trust improved.']),
    assistedSummary: Object.freeze({
      title: 'Engineering Caveat Honored',
      status: 'complete',
      summary: 'Command accepted the shield-grid caveat and adjusted the escort route.',
      highlights: Object.freeze(['Risk acknowledged.', 'Route adjusted without delaying the convoy.'])
    })
  }),
  Object.freeze({
    id: 'tutorial-training-log-003',
    type: 'openThread',
    stardate: '78144.6',
    summaryInputs: Object.freeze(['Detected a spoofed distress beacon near the relay approach.']),
    visibleConsequences: Object.freeze(['Beacon source remains unresolved.', 'Security began a passive trace.']),
    assistedSummary: Object.freeze({
      title: 'Spoofed Beacon Logged',
      status: 'watch',
      summary: 'The crew identified the distress call as suspicious but has not committed to a response yet.',
      highlights: Object.freeze(['Open question preserved.', 'Security trace active.'])
    })
  }),
  Object.freeze({
    id: 'tutorial-training-log-004',
    type: 'provisionalOutcome',
    stardate: '78144.7',
    summaryInputs: Object.freeze(['Ordered a low-emission probe launch before changing convoy speed.']),
    visibleConsequences: Object.freeze(['Probe launch may reveal the beacon source without exposing the convoy.']),
    assistedSummary: Object.freeze({
      title: 'Probe Launch Previewed',
      status: 'pending',
      summary: 'A cautious probe launch is ready for outcome review before narration commits.',
      highlights: Object.freeze(['Consequence pending.', 'No hidden state revealed.'])
    })
  })
]);

function buildCampaignState() {
  return {
    schemaVersion: 1,
    campaign: {
      id: TRAINING_CAMPAIGN_ID,
      packageId: TRAINING_PACKAGE_ID,
      title: 'Training Scenario: Ashes of Peace',
      status: 'active',
      currentStardate: '78144.7'
    },
    player: {
      id: TRAINING_PLAYER_ID,
      name: 'Commander Vale',
      rank: 'Commander',
      billet: 'Mission Commander',
      role: 'Player command officer',
      species: 'Human',
      pronounsOrAddress: 'Commander',
      dossier: {
        briefBiography: 'A newly assigned mission commander balancing diplomacy, crew confidence, and tactical restraint.',
        publicReputation: 'Known for disciplined risk calls under political pressure.',
        detailLevel: 'training'
      }
    },
    ship: {
      id: 'tutorial-training-uss-breckenridge',
      name: 'U.S.S. Breckenridge',
      class: 'Aegean-class light cruiser',
      registry: 'NCC-74211',
      condition: 'Operational with shakedown restrictions after emergency refit.',
      damage: [
        {
          id: 'tutorial-training-damage-port-array',
          label: 'Port sensor array stress',
          playerSummary: 'Long-range scans have intermittent blind spots during high-power maneuvers.',
          status: 'active',
          severity: 'minor',
          department: 'Science'
        }
      ],
      activeRestrictions: [
        {
          id: 'tutorial-training-restriction-low-emission',
          label: 'Low-emission escort posture',
          playerSummary: 'The ship is limiting emissions to avoid alarming the delegation escort.',
          status: 'active',
          severity: 'mission constraint',
          department: 'Command'
        }
      ],
      technicalDebt: [
        {
          id: 'tutorial-training-technical-debt-shield-grid',
          label: 'Shield grid validation gap',
          playerSummary: 'Forward shield harmonics hold under normal load but should not absorb a sustained barrage.',
          status: 'watch',
          severity: 'moderate',
          department: 'Engineering'
        }
      ]
    },
    mission: {
      activeMissionId: TRAINING_MISSION_ID,
      activePhaseId: 'relay-approach',
      phase: 'relay-approach',
      formalObjectives: [
        'Escort the diplomatic convoy to Asterion Relay.',
        'Investigate the spoofed distress beacon without exposing civilians.',
        'Preserve the ceasefire unless hostile intent is confirmed.'
      ],
      openWorldManaged: false
    },
    directives: {
      active: [
        'Protect the delegation unless doing so would clearly start a wider conflict.',
        'Keep hidden faction intelligence out of player-facing summaries.'
      ]
    },
    settings: {
      simulationMode: 'Command',
      allowedSimulationModes: ['Exploration', 'Command'],
      maxTurnSaveHistory: 8,
      autosaveEveryMessages: 5
    },
    crew: {
      relationshipModel: 'player-safe-qualitative',
      seniorCrewIds: ['mara-whitaker', 'talen-var', 'sorell-tav', 'jae-min-oro'],
      casualties: [],
      reassignments: []
    },
    relationships: {
      seniorCrew: [
        {
          crewId: 'mara-whitaker',
          currentStance: 'supports-with-reservations',
          playerSummary: 'Whitaker supports the cautious probe launch but wants a clear abort condition.'
        },
        {
          crewId: 'talen-var',
          currentStance: 'supports',
          playerSummary: 'Var appreciates that command acknowledged the shield-grid caveat.'
        },
        {
          crewId: 'sorell-tav',
          currentStance: 'undecided',
          playerSummary: 'Tav is waiting for sensor confirmation before endorsing a stronger claim.'
        }
      ],
      memoryLedger: [
        {
          id: 'tutorial-training-memory-var-001',
          crewId: 'talen-var',
          title: 'Engineering caution respected',
          summary: 'Command chose a route that preserved shield margin instead of taking the fastest path.',
          status: 'active',
          visibility: 'player-safe'
        },
        {
          id: 'tutorial-training-memory-whitaker-001',
          crewId: 'mara-whitaker',
          title: 'Abort condition requested',
          summary: 'Whitaker asked command to define the line where probe caution becomes delay.',
          status: 'active',
          visibility: 'player-safe'
        }
      ]
    },
    pressureLedger: {
      records: [
        {
          id: 'tutorial-training-pressure-convoy-clock',
          title: 'Convoy exposure clock',
          playerSummary: 'The convoy cannot linger in the debris field without risking panic and sensor confusion.',
          status: 'active',
          linkedCrewIds: ['mara-whitaker'],
          visibility: 'player-safe'
        },
        {
          id: 'tutorial-training-pressure-shield-grid',
          title: 'Shield-grid caveat',
          playerSummary: 'Engineering advises against sustained forward shield stress until validation completes.',
          status: 'watch',
          linkedCrewIds: ['talen-var'],
          visibility: 'player-safe'
        }
      ]
    },
    questLedger: {
      foregroundQuestId: 'tutorial-training-quest-probe-trace',
      instances: [
        {
          id: 'tutorial-training-quest-probe-trace',
          title: 'Trace the Spoofed Beacon',
          status: 'active',
          summary: 'Use low-emission sensors and a probe relay to find the spoof source.',
          linkedCrewIds: ['sorell-tav', 'jae-min-oro']
        },
        {
          id: 'tutorial-training-quest-engineering-margin',
          title: 'Validate Shield Margin',
          status: 'delegated',
          summary: 'Engineering is validating how much stress the forward grid can absorb.',
          linkedCrewIds: ['talen-var']
        }
      ]
    },
    dynamicQuestCatalog: {
      templates: [
        {
          id: 'tutorial-training-template-civilian-assurance',
          title: 'Civilian Assurance Call',
          summary: 'Optional diplomatic reassurance scene for the convoy.'
        }
      ]
    },
    threadLedger: {
      records: [
        {
          id: 'tutorial-training-thread-spoofed-beacon',
          title: 'Spoofed Distress Beacon',
          status: 'engaged',
          shape: 'Mystery',
          participants: ['sorell-tav', 'jae-min-oro'],
          linkedCrewIds: ['sorell-tav', 'jae-min-oro'],
          playerSummary: 'A distress beacon near the relay appears intentionally spoofed.',
          visibility: 'player-safe'
        },
        {
          id: 'tutorial-training-thread-whitaker-trust',
          title: 'Whitaker Command Confidence',
          status: 'active',
          shape: 'Crew Relationship',
          participants: ['mara-whitaker'],
          linkedCrewIds: ['mara-whitaker'],
          playerSummary: 'Whitaker is measuring whether command can make a timely decision under incomplete information.',
          visibility: 'player-safe'
        }
      ]
    },
    commandLog: {
      entries: clone(COMMAND_LOG_ENTRIES)
    },
    turnLedger: {
      lastCommittedOutcomeId: 'tutorial-training-outcome-003',
      entries: clone(COMMAND_LOG_ENTRIES)
    },
    runtimeTracking: {
      ingressLedger: [
        {
          id: 'tutorial-training-ingress-001',
          status: 'committed',
          responseKind: 'campaign'
        }
      ],
      responseLedger: [
        {
          id: 'tutorial-training-response-001',
          status: 'posted',
          responseKind: 'campaign'
        }
      ],
      recoveryJournal: [
        {
          id: 'tutorial-training-recovery-001',
          type: 'narrationRetry',
          status: 'resolved',
          recordedAt: nowIso()
        }
      ],
      sceneReconciliation: {
        markers: {
          start: {
            textPreview: 'The escort enters the debris field.'
          },
          end: {
            textPreview: 'The spoofed beacon repeats.'
          }
        },
        pending: [],
        lastResult: {
          summary: 'No pending reconciliation in this training preview.'
        }
      }
    },
    campaignChatBinding: {
      chatName: 'Training Preview Chat',
      status: 'training-preview'
    }
  };
}

function buildCommandBearingPlayerView() {
  return {
    schemaVersion: 1,
    reserve: {
      current: 1,
      capacity: 3
    },
    tracks: {
      inspiration: {
        label: 'Inspiration',
        progress: 2,
        threshold: 3
      },
      resolve: {
        label: 'Resolve',
        progress: 1,
        threshold: 3
      }
    },
    readied: null,
    evidence: [
      {
        id: 'tutorial-training-bearing-evidence-001',
        title: 'Honored engineering limits',
        summary: 'Command accepted a slower route to avoid stressing the shield grid.'
      }
    ],
    reviews: [
      {
        id: 'tutorial-training-bearing-review-001',
        title: 'Diplomatic restraint',
        summary: 'Eligible for review if restraint protects the convoy.'
      }
    ],
    spendHistory: [
      {
        id: 'tutorial-training-bearing-spend-001',
        label: 'Hold the line',
        summary: 'Spent during a prior drill to keep the crew focused.'
      }
    ],
    recoveryHistory: []
  };
}

function buildPlayerCharacterView() {
  const commandBearing = buildCommandBearingPlayerView();
  return {
    schemaVersion: 1,
    identity: {
      id: TRAINING_PLAYER_ID,
      name: 'Commander Vale',
      rank: 'Commander',
      billet: 'Mission Commander',
      role: 'Player command officer',
      species: 'Human',
      pronounsOrAddress: 'Commander'
    },
    portrait: null,
    dossier: {
      briefBiography: 'A newly assigned mission commander balancing diplomacy, crew confidence, and tactical restraint.',
      publicReputation: 'Known for disciplined risk calls under political pressure.',
      detailLevel: 'training'
    },
    serviceRecord: [
      {
        title: 'Relay Escort Command',
        summary: 'Assigned to protect a peace delegation during a contested handoff.'
      },
      {
        title: 'Crisis Procedure',
        summary: 'Recognized for cautious command under sensor uncertainty.'
      }
    ],
    commandBearing,
    commandBearingSummary: {
      tracks: commandBearing.tracks,
      reserve: commandBearing.reserve,
      readied: commandBearing.readied
    },
    commandBearingEvidence: clone(commandBearing.evidence),
    commandBearingReviews: clone(commandBearing.reviews),
    commandBearingHistory: clone(commandBearing.spendHistory),
    currentStandingSummary: [
      {
        crewName: 'Mara Whitaker',
        posture: 'Supportive with reservations'
      },
      {
        crewName: 'Talen Var',
        posture: 'Supportive'
      }
    ],
    crewInteractionLog: [
      {
        title: 'Engineering caveat respected',
        summary: 'The player gave engineering a real constraint instead of demanding certainty.',
        meta: 'Recent'
      }
    ],
    relationshipPerceptions: [
      {
        title: 'Whitaker wants decisiveness',
        summary: 'Whitaker supports caution but expects a timely decision when the probe returns.',
        meta: 'Visible posture'
      }
    ],
    guards: {
      rawRelationshipValuesHidden: true,
      hiddenMemoriesHidden: true,
      modelDiagnosticsHidden: true
    }
  };
}

function buildOpenWorldView() {
  return {
    foregroundQuestId: 'tutorial-training-quest-probe-trace',
    quests: [
      {
        id: 'tutorial-training-quest-probe-trace',
        title: 'Trace the Spoofed Beacon',
        status: 'active',
        summary: 'Find the source without broadcasting the convoy position.',
        ownerCrewId: 'sorell-tav'
      },
      {
        id: 'tutorial-training-quest-engineering-margin',
        title: 'Validate Shield Margin',
        status: 'delegated',
        summary: 'Engineering is testing how much shield stress can be accepted.',
        ownerCrewId: 'talen-var'
      }
    ],
    opportunities: [
      {
        id: 'tutorial-training-opportunity-convoy-call',
        title: 'Reassure the Delegation',
        summary: 'A short diplomatic call could reduce convoy anxiety.',
        status: 'available'
      }
    ]
  };
}

function buildPendingDirectorTurn() {
  return {
    id: 'tutorial-training-pending-turn',
    turnId: 'tutorial-training-turn-004',
    competencePacket: {
      commandBrief: {
        routineResponse: [
          {
            summary: 'A low-emission probe launch fits the player order and current mission constraints.'
          }
        ],
        knownFacts: [
          {
            summary: 'The beacon is spoofed, but the source is not yet confirmed.'
          },
          {
            summary: 'The convoy is vulnerable if the Breckenridge emits too strongly.'
          }
        ],
        uncertainty: [
          {
            summary: 'The spoof source may be a trap, a warning, or a test of escort resolve.'
          }
        ],
        operationalPressure: [
          {
            summary: 'The convoy exposure clock is active.'
          }
        ],
        commandQuestion: {
          summary: 'Does command accept a slower, safer probe launch before changing convoy speed?'
        }
      },
      domainReports: [
        {
          summary: 'Science can run a passive trace after the probe reaches the beacon edge.'
        },
        {
          summary: 'Engineering recommends avoiding sustained forward shield load.'
        }
      ]
    },
    provisionalOutcome: {
      id: 'tutorial-training-outcome-004',
      resultBand: 'Success with a cost',
      summary: 'The probe confirms the beacon is spoofed and finds a masked relay, but the convoy must slow briefly to keep emissions low.',
      costs: [
        'Convoy exposure clock advances one step.',
        'Whitaker expects a clear follow-up order after the trace returns.'
      ]
    },
    bearingEligibility: {
      interventionPrompt: {
        reason: 'A Command Bearing point could reduce convoy anxiety before the slowdown becomes visible.'
      }
    }
  };
}

function buildChatNativeView() {
  return {
    binding: {
      chatName: 'Training Preview Chat',
      status: 'training-preview'
    },
    activation: {
      status: 'training-preview',
      summary: 'Tutorial-only chat activation preview. No host chat is bound.'
    },
    prompt: {
      active: false,
      installed: false,
      status: 'training-preview'
    },
    tracking: {
      ingressCount: 4,
      responseCount: 3,
      lastStableRevision: 0,
      revision: 0,
      lastCommittedTurn: {
        outcomeId: 'tutorial-training-outcome-003',
        resultBand: 'Recorded',
        narrationStatus: 'posted',
        responseStatus: 'posted',
        responseKind: 'campaign'
      }
    },
    pendingInteractions: [],
    recovery: [
      {
        id: 'tutorial-training-recovery-001',
        type: 'narrationRetry',
        status: 'resolved',
        recordedAt: nowIso()
      }
    ],
    manualSaveGuard: {
      ok: false,
      reason: 'training-scenario',
      summary: 'Training Scenario is inert. Real save actions are disabled during tutorials.'
    },
    sceneReconciliation: {
      markers: {
        start: {
          textPreview: 'The escort enters the debris field.'
        },
        end: {
          textPreview: 'The spoofed beacon repeats.'
        }
      },
      pending: [],
      lastResult: {
        summary: 'No pending reconciliation in this training preview.'
      }
    }
  };
}

export function isDirectiveTrainingScenarioView(view = null) {
  return view?.trainingScenario?.active === true && view?.trainingScenario?.inert === true;
}

export function buildDirectiveTrainingScenarioView({
  baseView = null,
  activeTab = 'campaign',
  tutorialId = '',
  stepId = ''
} = {}) {
  const campaignState = buildCampaignState();
  const commandBearingPlayerView = buildCommandBearingPlayerView();
  const playerCharacterView = buildPlayerCharacterView();
  const chatNative = buildChatNativeView();
  return {
    kind: 'directive.runtimeView',
    activeTab,
    activeScreen: null,
    activePackageId: TRAINING_PACKAGE_ID,
    activeSaveId: TRAINING_SAVE_ID,
    activePackage: clone(TRAINING_PACKAGE),
    currentChatActivePackage: clone(TRAINING_PACKAGE),
    campaign: {
      activePackageId: TRAINING_PACKAGE_ID,
      activeSaveId: TRAINING_SAVE_ID,
      packages: [clone(TRAINING_PACKAGE)],
      saves: [clone(TRAINING_SAVE)],
      lastImportResult: null
    },
    campaignIndex: {
      sessions: [clone(TRAINING_SESSION)],
      visibleSessions: [clone(TRAINING_SESSION)],
      counts: {
        total: 1,
        visible: 1,
        hidden: 0
      }
    },
    creator: null,
    campaignState: clone(campaignState),
    currentChatCampaignState: clone(campaignState),
    loadedCampaignState: clone(campaignState),
    loadedSave: {
      saveId: TRAINING_SAVE_ID,
      campaignId: TRAINING_CAMPAIGN_ID,
      status: 'training-preview'
    },
    playerSafeCampaign: {
      campaign: {
        id: TRAINING_CAMPAIGN_ID,
        title: 'Training Scenario: Ashes of Peace',
        status: 'active'
      },
      player: {
        name: 'Commander Vale',
        rank: 'Commander'
      },
      ship: {
        name: 'U.S.S. Breckenridge',
        condition: 'Operational with shakedown restrictions'
      }
    },
    loadedPlayerSafeCampaign: null,
    commandBearingPlayerView: clone(commandBearingPlayerView),
    loadedCommandBearingPlayerView: clone(commandBearingPlayerView),
    playerCharacterView: clone(playerCharacterView),
    loadedPlayerCharacterView: clone(playerCharacterView),
    chatNative: clone(chatNative),
    loadedChatNative: clone(chatNative),
    currentChat: {
      status: 'training-scenario',
      chatName: 'Training Preview Chat'
    },
    currentChatCampaignGuard: {
      ok: false,
      reason: 'training-scenario',
      summary: 'Training Scenario is not a real host chat binding.'
    },
    providerConfiguration: {
      providers: [],
      roleRouting: [],
      testResults: []
    },
    directivePreset: {
      status: 'training-preview',
      bundledVersion: '',
      installedVersion: ''
    },
    promptInspection: {
      active: false,
      installed: false,
      status: 'training-preview'
    },
    host: {
      id: 'tutorial-training-host',
      displayName: baseView?.host?.displayName ? `${baseView.host.displayName} Training Preview` : 'Training Preview Host',
      capabilities: {}
    },
    media: {
      playerPortraitImportSupported: false
    },
    storageDiagnostics: {
      status: 'training-preview',
      summary: 'Tutorial data is synthetic and is not stored.'
    },
    lastDirectorTurn: {
      outcomePacket: {
        id: 'tutorial-training-outcome-003',
        resultBand: 'Recorded',
        summary: 'The crew logged the spoofed beacon and preserved the convoy route.'
      },
      finalOutcome: {
        resultBand: 'Recorded',
        summary: 'The crew logged the spoofed beacon and preserved the convoy route.'
      },
      bearingSpend: null,
      sceneSnapshot: {
        playerInput: 'Launch a probe, low emission, and keep the convoy steady.'
      }
    },
    lastNarrationResult: null,
    lastCommandLogSummarySidecarResult: null,
    lastOpenWorldActionResult: null,
    lastDirectiveAssistResult: null,
    lastSceneReconciliationResult: null,
    lastCharacterCreatorSectionDraftResult: null,
    lastStateSafetyResult: null,
    lastActivationResult: null,
    lastConclusionResult: null,
    lastDirectivePresetInstallResult: null,
    pendingDirectorTurn: buildPendingDirectorTurn(),
    pendingOutcomeReplacement: null,
    openWorld: buildOpenWorldView(),
    lastError: null,
    tutorialMode: {
      active: true,
      kind: 'trainingScenario',
      tutorialId,
      stepId
    },
    trainingScenario: {
      active: true,
      label: 'Training Scenario',
      inert: true,
      sideEffectsDisabled: true,
      summary: 'Tutorial-only populated campaign preview. Nothing here writes to real saves, chats, prompts, or providers.'
    }
  };
}
