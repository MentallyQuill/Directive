import assert from 'node:assert/strict';

import { hashStableJson } from '../../src/runtime/architecture-redesign-contracts.mjs';
import { createTurnCommitCoordinator } from '../../src/runtime/turn-commit-coordinator.mjs';
import { initializeCampaignRuntimeTracking } from '../../src/runtime/state-delta-gateway.mjs';
import { createCoreStoreV2 } from '../../src/storage/core-store-v2.mjs';
import { createLogicalStorageAdapter } from '../../src/storage/logical-storage-adapter.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createMemoryStorage() {
  const files = new Map();
  return {
    async readJson(filePath) {
      if (!files.has(filePath)) {
        const error = new Error(`not found: ${filePath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return cloneJson(files.get(filePath));
    },
    async writeJson(filePath, value) {
      files.set(filePath, cloneJson(value));
      return { ok: true, path: filePath };
    },
    async verifyJsonFiles(paths) {
      return Object.fromEntries(paths.map((filePath) => [filePath, files.has(filePath)]));
    }
  };
}

function baseState() {
  const state = initializeCampaignRuntimeTracking({
    campaign: { id: 'campaign-core-mechanics-order', status: 'active' },
    campaignChatBinding: {
      hostId: 'fake',
      chatId: 'ashes-chat',
      campaignId: 'campaign-core-mechanics-order',
      saveId: 'save-core-mechanics-order'
    },
    mission: { activePhaseId: 'before-commit' },
    commandCulture: { tendencies: [], rawValuesHidden: true },
    pressureLedger: { records: [], candidateReviews: [], rawValuesHidden: true },
    commandBearing: {
      tracks: {
        inspiration: { marks: 0, earnedRecords: [] },
        resolve: { marks: 0, earnedRecords: [] }
      },
      awardedSources: {},
      evidenceLedger: { records: [] },
      reviewLedger: { records: [], reviewedClosureIds: {} },
      rawValuesHidden: true
    },
    commandCompetence: {
      standingOrders: [],
      assumedActionsLedger: [],
      warningLedger: [],
      acceptedRiskLedger: [],
      authorityNotesLedger: [],
      counselRequestLedger: [],
      retroactiveCompetenceLedger: []
    },
    relationships: { descriptiveLog: [] },
    worldState: { currentLocationId: 'before-location' },
    ship: { status: 'operational' },
    player: { status: 'alive', commandStatus: 'active' },
    flags: {},
    commandLog: { entries: [] },
    turnLedger: { entries: [] },
    runtimeTracking: {
      ingressLedger: [{
        id: 'ingress-core-mechanics-order',
        coreTransactionId: 'txn-core-mechanics-order',
        status: 'classified',
        authority: 'coreIngressProjection',
        projectionSource: 'coreStoreV2',
        compatibilityMirror: {
          kind: 'directive.coreIngressCompatibilityMirror.v1',
          status: 'sourceObserved'
        }
      }]
    }
  });
  setCoreIngressProjection(state, 'txn-core-mechanics-order');
  return state;
}

function setCoreIngressProjection(state, coreTransactionId, {
  ingressId = 'ingress-core-mechanics-order',
  status = 'sourceObserved'
} = {}) {
  state.directiveRuntimeEvidence = {
    ...(state.directiveRuntimeEvidence || {}),
    coreStoreReadProjections: {
      kind: 'directive.coreStoreReadProjections.v1',
      runtimeAuthority: 'coreStoreV2',
      ingressLedger: [{
        id: ingressId,
        ingressId,
        coreTransactionId,
        transactionId: coreTransactionId,
        status,
        authority: 'coreIngressProjection',
        projectionSource: 'coreStoreV2',
        compatibilityMirror: {
          kind: 'directive.coreIngressCompatibilityMirror.v1',
          status
        }
      }],
      responseLedger: [],
      recoveryJournal: []
    }
  };
  return state;
}

function committedState() {
  return {
    ...baseState(),
    mission: { activePhaseId: 'after-commit' },
    commandCulture: {
      tendencies: [{
        id: 'culture-core-mechanics-order',
        tendency: 'deliberate-bridge-discipline'
      }],
      rawValuesHidden: true
    },
    pressureLedger: {
      records: [{
        id: 'pressure-core-mechanics-order',
        type: 'crew',
        title: 'Bridge rhythm pressure',
        playerSummary: 'RAW_PRESSURE_LEDGER_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS',
        directorSummary: 'RAW_PRESSURE_LEDGER_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS',
        status: 'active',
        urgencyBand: 'medium',
        escalationBand: 'signal',
        rawValuesHidden: true
      }],
      candidateReviews: [],
      rawValuesHidden: true
    },
    commandBearing: {
      tracks: {
        inspiration: {
          marks: 1,
          earnedRecords: [{
            id: 'bearing-core-mechanics-order',
            track: 'inspiration',
            sourceId: 'bearing-core-mechanics-order',
            decisionId: 'bearing-core-mechanics-order',
            summary: 'RAW_COMMAND_BEARING_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
          }]
        },
        resolve: { marks: 0, earnedRecords: [] }
      },
      awardedSources: {
        'bearing-core-mechanics-order:inspiration': {
          sourceId: 'bearing-core-mechanics-order',
          track: 'inspiration',
          awardedAtOutcomeId: 'outcome-core-mechanics-order',
          summary: 'RAW_COMMAND_BEARING_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
        }
      },
      evidenceLedger: { records: [] },
      reviewLedger: { records: [], reviewedClosureIds: {} },
      rawValuesHidden: true
    },
    commandCompetence: {
      standingOrders: [],
      assumedActionsLedger: [{
        type: 'routineAction',
        id: 'competence-core-mechanics-order',
        sourceTurnId: 'turn-core-mechanics-order',
        sourceOutcomeId: 'outcome-core-mechanics-order',
        activeMissionId: null,
        activePhaseId: null,
        summary: 'RAW_COMMAND_COMPETENCE_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS',
        playerVisible: true
      }],
      warningLedger: [],
      acceptedRiskLedger: [],
      authorityNotesLedger: [],
      counselRequestLedger: [],
      retroactiveCompetenceLedger: []
    },
    relationships: {
      descriptiveLog: [{
        id: 'relationship-core-mechanics-order',
        summary: 'RAW_RELATIONSHIP_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
      }],
      memoryLedger: [{
        crewId: 'crew-core-mechanics-order',
        event: 'RAW_RELATIONSHIP_MEMORY_EVENT_SHOULD_NOT_ENTER_CORE_MECHANICS',
        interpretation: 'RAW_RELATIONSHIP_MEMORY_INTERPRETATION_SHOULD_NOT_ENTER_CORE_MECHANICS',
        weight: 'moderate',
        visibility: 'hidden',
        sourceOutcomeId: 'outcome-core-mechanics-order'
      }],
      rawValuesHidden: true
    },
    worldState: {
      currentLocationId: 'after-location',
      actors: [{
        id: 'actor-core-mechanics-order',
        posture: 'RAW_ACTOR_POSTURE_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS',
        history: []
      }],
      fronts: [{
        id: 'front-core-mechanics-order',
        status: 'active',
        summary: 'RAW_FRONT_RECORD_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS',
        history: []
      }],
      clocks: [{
        id: 'clock-core-mechanics-order',
        value: 2,
        lastReason: 'RAW_CLOCK_REASON_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS',
        history: [{
          from: 1,
          to: 2,
          reason: 'RAW_CLOCK_REASON_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
        }]
      }]
    },
    ship: { status: 'RAW_TERMINAL_SHIP_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS' },
    player: {
      status: 'alive',
      commandStatus: 'RAW_TERMINAL_PLAYER_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
    },
    flags: {
      'terminal-core-mechanics-order': 'RAW_TERMINAL_FLAG_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
    },
    commandLog: {
      entries: [{
        sourceOutcomeId: 'outcome-core-mechanics-order',
        summaryInputs: ['RAW_COMMAND_LOG_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'],
        visibleConsequences: ['RAW_COMMAND_LOG_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS']
      }]
    },
    turnLedger: {
      entries: [{
        turnId: 'turn-core-mechanics-order',
        outcomeId: 'outcome-core-mechanics-order',
        resultBand: 'Success',
        stateDelta: { commandBearing: { earnedCount: 1 } },
        competencePacket: {
          kind: 'directive.competencePacket',
          routineActions: [{
            id: 'competence-core-mechanics-order',
            summary: 'RAW_TURN_LEDGER_PACKET_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
          }]
        },
        continuityProjection: { source: 'fixture' },
        narratorSourceOutcomeId: 'outcome-core-mechanics-order',
        commandLogSourceOutcomeId: 'outcome-core-mechanics-order',
        snapshotBeforeRetained: false,
        narrationStatus: 'pending',
        narration: null,
        narrationFailures: [],
        narrationRevisions: []
      }],
      lastCommittedOutcomeId: 'outcome-core-mechanics-order',
      swipeRerollForbidden: true
    }
  };
}

const turnPacket = {
  turnId: 'turn-core-mechanics-order',
  outcomePacket: {
    id: 'outcome-core-mechanics-order',
    resultBand: 'Success'
  },
  narratorPacket: {
    sourceOutcomeId: 'outcome-core-mechanics-order'
  },
  commandLogPacket: {
    kind: 'directive.commandLogPacket',
    sourceOutcomeId: 'outcome-core-mechanics-order',
    summaryInputs: ['RAW_COMMAND_LOG_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'],
    visibleConsequences: ['RAW_COMMAND_LOG_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS']
  },
  competencePacket: {
    kind: 'directive.competencePacket',
    sourceTurnId: 'turn-core-mechanics-order',
    sourceOutcomeId: 'outcome-core-mechanics-order',
    routineActions: [{
      id: 'competence-core-mechanics-order',
      summary: 'RAW_COMMAND_COMPETENCE_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
    }],
    proceduralWarnings: [],
    authorityNotes: [],
    noGotchaPolicyApplied: true
  },
  stateDelta: {
    mission: {
      activePhaseIdSet: 'after-commit'
    },
    commandCulture: {
      tendenciesAdd: [{
        id: 'culture-core-mechanics-order',
        tendency: 'deliberate-bridge-discipline'
      }]
    },
    pressureLedger: {
      upsertRecords: [{
        id: 'pressure-core-mechanics-order',
        type: 'crew',
        title: 'Bridge rhythm pressure',
        playerSummary: 'RAW_PRESSURE_LEDGER_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS',
        directorSummary: 'RAW_PRESSURE_LEDGER_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS',
        status: 'active',
        urgencyBand: 'medium',
        escalationBand: 'signal'
      }]
    },
    commandBearing: {
      earnedRecordsAdd: [{
        id: 'bearing-core-mechanics-order',
        track: 'inspiration',
        sourceId: 'bearing-core-mechanics-order',
        decisionId: 'bearing-core-mechanics-order',
        outcomeId: 'outcome-core-mechanics-order',
        summary: 'RAW_COMMAND_BEARING_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
      }]
    },
    relationships: {
      affectedCrewIds: ['crew-core-mechanics-order'],
      descriptiveChanges: [{
        id: 'relationship-core-mechanics-order',
        summary: 'RAW_RELATIONSHIP_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
      }]
    },
    actors: {
      rawValuesHidden: true,
      upsertPostures: [{
        actorId: 'actor-core-mechanics-order',
        posture: 'RAW_ACTOR_POSTURE_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
      }]
    },
    fronts: {
      rawValuesHidden: true,
      upsertRecords: [{
        id: 'front-core-mechanics-order',
        status: 'active',
        summary: 'RAW_FRONT_RECORD_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
      }]
    },
    clocks: [{
      id: 'clock-core-mechanics-order',
      from: 1,
      to: 2,
      reason: 'RAW_CLOCK_REASON_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
    }],
    terminalState: {
      shipPatch: {
        status: 'RAW_TERMINAL_SHIP_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
      },
      playerPatch: {
        commandStatus: 'RAW_TERMINAL_PLAYER_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
      },
      flagsSet: [{
        id: 'terminal-core-mechanics-order',
        value: 'RAW_TERMINAL_FLAG_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
      }]
    },
    openWorld: {
      reducerBundle: {
        kind: 'directive.openWorldReducerBundle.v1',
        sourceOutcomeId: 'outcome-core-mechanics-order',
        sourceEventIds: ['event-core-mechanics-order'],
        sourceAnchorRange: {
          rangeHash: 'range-core-mechanics-order',
          hostMessageIds: ['player-core-mechanics-order']
        },
        operations: [{
          type: 'value.set',
          path: ['worldState', 'currentLocationId'],
          value: 'RAW_OPEN_WORLD_REDUCER_VALUE'
        }],
        diagnostics: {
          operationCount: 1,
          changedRoots: ['worldState'],
          boundaryType: 'turn',
          eventCount: 1,
          reactionCount: 0
        }
      }
    }
  },
  provenance: {
    continuityProjection: { source: 'fixture' }
  },
  sceneSnapshot: {
    presentCharacters: ['player-commander', 'crew-core-mechanics-order']
  }
};

const callOrder = [];
const persisted = [];
const coordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:00:00.000Z',
  persist: async (next, summary) => {
    callOrder.push('persist');
    persisted.push({ state: cloneJson(next), summary });
    return { id: `save-${persisted.length}` };
  },
  coreTurnStore: {
    async getTransaction(transactionId) {
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn(transactionId, patch) {
      callOrder.push('core-advance');
      assert.equal(transactionId, 'txn-core-mechanics-order');
      assert.equal(patch.phase, 'routePending');
      return { id: transactionId, phase: patch.phase };
    },
    async commitMechanics(transactionId, bundle) {
      callOrder.push('core-mechanics');
      assert.equal(transactionId, 'txn-core-mechanics-order');
      assert.equal(bundle.outcomeId, 'outcome-core-mechanics-order');
      assert.equal(bundle.phaseAfter, 'mechanicsPending');
      assert.equal(bundle.baseMechanicsRevision, 0);
      assert.equal(bundle.checkpointBefore.checkpointId, 'core-mechanics-outcome-core-mechanics-order');
      assert.equal(bundle.checkpointBefore.sourceKind, 'coreStoreV2.checkpoint');
      assert.equal(bundle.checkpointBefore.checkpointProducer, 'turnCommitCoordinator.beforeCampaignState');
      assert.equal(bundle.checkpointBefore.campaignState.mission.activePhaseId, 'before-commit');
      assert.equal(bundle.checkpointBefore.campaignState.worldState.currentLocationId, 'before-location');
      assert.equal(bundle.checkpointBefore.campaignState.turnLedger.entries.length, 0);
      assert.equal(bundle.checkpointBefore.campaignState.runtimeTracking, undefined);
      assert.equal(
        bundle.operations.some((operation) => operation.domain === 'mission'),
        true,
        'CORE mechanics bundle should record the changed mechanics domain'
      );
      const missionOperation = bundle.operations.find((operation) => operation.domain === 'mission');
      assert.equal(missionOperation.op, 'stateDeltaCommitted');
      assert.equal(missionOperation.sourceKind, 'directive.turnPacketStateDelta.v1');
      assert.equal(missionOperation.path, 'stateDelta.mission');
      assert.ok(missionOperation.sourceHash, 'explicit mission delta should carry a bounded source hash');
      assert.ok(missionOperation.valueHash, 'explicit mission delta should carry committed root hash');
      assert.equal(
        bundle.operations.some((operation) => operation.domain === 'mission' && operation.op === 'domainCommitted'),
        false,
        'explicit mission stateDelta should replace broad domainCommitted mechanics source'
      );
      const commandCultureOperation = bundle.operations.find((operation) => operation.domain === 'commandCulture');
      assert.ok(commandCultureOperation, 'CORE mechanics bundle should record commandCulture change');
      assert.equal(commandCultureOperation.op, 'stateDeltaCommitted');
      assert.equal(commandCultureOperation.sourceKind, 'directive.turnPacketStateDelta.v1');
      assert.equal(commandCultureOperation.path, 'stateDelta.commandCulture');
      assert.ok(commandCultureOperation.sourceHash, 'explicit commandCulture delta should carry a bounded source hash');
      assert.equal(
        bundle.operations.some((operation) => operation.domain === 'commandCulture' && operation.op === 'domainCommitted'),
        false,
        'explicit commandCulture stateDelta should replace broad domainCommitted mechanics source'
      );
      const pressureOperation = bundle.operations.find((operation) => operation.domain === 'pressureLedger');
      assert.ok(pressureOperation, 'CORE mechanics bundle should record pressureLedger change');
      assert.equal(pressureOperation.op, 'stateDeltaCommitted');
      assert.equal(pressureOperation.sourceKind, 'directive.turnPacketStateDelta.v1');
      assert.equal(pressureOperation.path, 'stateDelta.pressureLedger');
      assert.ok(pressureOperation.sourceHash, 'explicit pressureLedger delta should carry a bounded source hash');
      assert.equal(
        bundle.operations.some((operation) => operation.domain === 'pressureLedger' && operation.op === 'domainCommitted'),
        false,
        'explicit pressureLedger stateDelta should replace broad domainCommitted mechanics source'
      );
      const commandBearingOperation = bundle.operations.find((operation) => operation.domain === 'commandBearing');
      assert.ok(commandBearingOperation, 'CORE mechanics bundle should record commandBearing change');
      assert.equal(commandBearingOperation.op, 'stateDeltaCommitted');
      assert.equal(commandBearingOperation.sourceKind, 'directive.turnPacketStateDelta.v1');
      assert.equal(commandBearingOperation.path, 'stateDelta.commandBearing');
      assert.ok(commandBearingOperation.sourceHash, 'explicit commandBearing delta should carry a bounded source hash');
      assert.equal(
        bundle.operations.some((operation) => operation.domain === 'commandBearing' && operation.op === 'domainCommitted'),
        false,
        'explicit commandBearing stateDelta should replace broad domainCommitted mechanics source'
      );
      const commandCompetenceOperation = bundle.operations.find((operation) => operation.domain === 'commandCompetence');
      assert.ok(commandCompetenceOperation, 'CORE mechanics bundle should record commandCompetence change');
      assert.equal(commandCompetenceOperation.op, 'competencePacketCommitted');
      assert.equal(commandCompetenceOperation.sourceKind, 'directive.competencePacket');
      assert.equal(commandCompetenceOperation.path, 'competencePacket');
      assert.ok(commandCompetenceOperation.sourceHash, 'explicit competence packet should carry a bounded source hash');
      assert.equal(
        bundle.operations.some((operation) => operation.domain === 'commandCompetence' && operation.op === 'domainCommitted'),
        false,
        'explicit competencePacket should replace broad commandCompetence domainCommitted mechanics source'
      );
      const commandLogOperation = bundle.operations.find((operation) => operation.domain === 'commandLog');
      assert.ok(commandLogOperation, 'CORE mechanics bundle should record commandLog change');
      assert.equal(commandLogOperation.op, 'commandLogPacketCommitted');
      assert.equal(commandLogOperation.sourceKind, 'directive.commandLogPacket');
      assert.equal(commandLogOperation.path, 'commandLogPacket');
      assert.ok(commandLogOperation.sourceHash, 'explicit commandLog packet should carry a bounded source hash');
      assert.equal(
        bundle.operations.some((operation) => operation.domain === 'commandLog' && operation.op === 'domainCommitted'),
        false,
        'explicit commandLogPacket should replace broad commandLog domainCommitted mechanics source'
      );
      const turnLedgerOperation = bundle.operations.find((operation) => operation.domain === 'turnLedger');
      assert.ok(turnLedgerOperation, 'CORE mechanics bundle should record turnLedger change');
      assert.equal(turnLedgerOperation.op, 'turnLedgerEntryCommitted');
      assert.equal(turnLedgerOperation.sourceKind, 'directive.turnLedgerEntryPacket.v1');
      assert.equal(turnLedgerOperation.path, 'turnPacket');
      assert.ok(turnLedgerOperation.sourceHash, 'explicit turn packet ledger source should carry a bounded source hash');
      assert.equal(
        bundle.operations.some((operation) => operation.domain === 'turnLedger' && operation.op === 'domainCommitted'),
        false,
        'explicit turnLedger packet should replace broad turnLedger domainCommitted mechanics source'
      );
      const actorOperation = bundle.operations.find((operation) => operation.op === 'actorPosturesCommitted');
      assert.ok(actorOperation, 'CORE mechanics bundle should record actor posture worldState source');
      assert.equal(actorOperation.domain, 'worldState');
      assert.equal(actorOperation.sourceKind, 'directive.turnPacketStateDelta.actors.v1');
      assert.equal(actorOperation.path, 'stateDelta.actors');
      assert.equal(actorOperation.operationCount, 1);
      assert.ok(actorOperation.sourceHash, 'explicit actor delta should carry a bounded source hash');
      const frontOperation = bundle.operations.find((operation) => operation.op === 'frontRecordsCommitted');
      assert.ok(frontOperation, 'CORE mechanics bundle should record front worldState source');
      assert.equal(frontOperation.domain, 'worldState');
      assert.equal(frontOperation.sourceKind, 'directive.turnPacketStateDelta.fronts.v1');
      assert.equal(frontOperation.path, 'stateDelta.fronts');
      assert.equal(frontOperation.operationCount, 1);
      assert.ok(frontOperation.sourceHash, 'explicit front delta should carry a bounded source hash');
      const clockOperation = bundle.operations.find((operation) => operation.op === 'clockDeltasCommitted');
      assert.ok(clockOperation, 'CORE mechanics bundle should record clock worldState source');
      assert.equal(clockOperation.domain, 'worldState');
      assert.equal(clockOperation.sourceKind, 'directive.turnPacketStateDelta.clocks.v1');
      assert.equal(clockOperation.path, 'stateDelta.clocks');
      assert.equal(clockOperation.operationCount, 1);
      assert.ok(clockOperation.sourceHash, 'explicit clock delta should carry a bounded source hash');
      const shipTerminalOperation = bundle.operations.find((operation) => operation.op === 'shipTerminalStateCommitted');
      assert.ok(shipTerminalOperation, 'CORE mechanics bundle should record ship terminal-state source');
      assert.equal(shipTerminalOperation.domain, 'ship');
      assert.equal(shipTerminalOperation.sourceKind, 'directive.turnPacketStateDelta.terminalState.ship.v1');
      assert.equal(shipTerminalOperation.path, 'stateDelta.terminalState.shipPatch');
      assert.ok(shipTerminalOperation.sourceHash, 'explicit ship terminal delta should carry a bounded source hash');
      assert.equal(
        bundle.operations.some((operation) => operation.domain === 'ship' && operation.op === 'domainCommitted'),
        false,
        'explicit terminal ship source should replace broad ship domainCommitted mechanics source'
      );
      const playerTerminalOperation = bundle.operations.find((operation) => operation.op === 'playerTerminalStateCommitted');
      assert.ok(playerTerminalOperation, 'CORE mechanics bundle should record player terminal-state source');
      assert.equal(playerTerminalOperation.domain, 'player');
      assert.equal(playerTerminalOperation.sourceKind, 'directive.turnPacketStateDelta.terminalState.player.v1');
      assert.equal(playerTerminalOperation.path, 'stateDelta.terminalState.playerPatch');
      assert.ok(playerTerminalOperation.sourceHash, 'explicit player terminal delta should carry a bounded source hash');
      const flagsTerminalOperation = bundle.operations.find((operation) => operation.op === 'flagsTerminalStateCommitted');
      assert.ok(flagsTerminalOperation, 'CORE mechanics bundle should record flags terminal-state source');
      assert.equal(flagsTerminalOperation.domain, 'flags');
      assert.equal(flagsTerminalOperation.sourceKind, 'directive.turnPacketStateDelta.terminalState.flags.v1');
      assert.equal(flagsTerminalOperation.path, 'stateDelta.terminalState.flagsSet');
      assert.equal(flagsTerminalOperation.operationCount, 1);
      assert.ok(flagsTerminalOperation.sourceHash, 'explicit flags terminal delta should carry a bounded source hash');
      const relationshipOperation = bundle.operations.find((operation) => operation.op === 'relationshipStateDeltaCommitted');
      assert.ok(relationshipOperation, 'CORE mechanics bundle should record explicit relationship state delta source');
      assert.equal(relationshipOperation.domain, 'relationships');
      assert.equal(relationshipOperation.sourceKind, 'directive.turnPacketStateDelta.relationships.v1');
      assert.equal(relationshipOperation.path, 'stateDelta.relationships');
      assert.ok(relationshipOperation.sourceHash, 'explicit relationship delta should carry a bounded source hash');
      const relationshipMemoryOperation = bundle.operations.find((operation) => operation.op === 'relationshipMemoryDerivedCommitted');
      assert.ok(relationshipMemoryOperation, 'CORE mechanics bundle should record derived relationship memory source');
      assert.equal(relationshipMemoryOperation.domain, 'relationships');
      assert.equal(relationshipMemoryOperation.sourceKind, 'directive.relationshipMemoryFromTurn.v1');
      assert.equal(relationshipMemoryOperation.path, 'relationshipMemoryFromTurn');
      assert.equal(relationshipMemoryOperation.operationCount, 1);
      assert.ok(relationshipMemoryOperation.sourceHash, 'derived relationship memory should carry a bounded source hash');
      assert.equal(
        bundle.operations.some((operation) => operation.domain === 'relationships' && operation.op === 'domainCommitted'),
        false,
        'explicit relationship operations should replace broad relationship domainCommitted mechanics source'
      );
      assert.equal(
        bundle.operations.some((operation) => operation.domain === 'worldState' && operation.op === 'domainCommitted'),
        false,
        'reducer-owned roots should not also be recorded as broad domain commits'
      );
      assert.equal(
        bundle.operations.some((operation) => operation.op === 'domainCommitted'),
        false,
        'fully sourced turn fixture should not need compatibility domain fallback operations'
      );
      const reducerOperation = bundle.operations.find((operation) => operation.op === 'reducerBundleCommitted');
      assert.ok(reducerOperation, 'CORE mechanics bundle should include open-world reducer source evidence');
      assert.equal(reducerOperation.domain, 'openWorld');
      assert.equal(reducerOperation.sourceKind, 'directive.openWorldReducerBundle.v1');
      assert.equal(reducerOperation.operationCount, 1);
      assert.deepEqual(reducerOperation.changedRoots, ['worldState']);
      assert.ok(reducerOperation.sourceHash, 'reducer source evidence should include a stable source hash');
      assert.ok(reducerOperation.valueHash, 'reducer source evidence should include an operation hash');
      assert.equal(JSON.stringify(bundle).includes('RAW_OPEN_WORLD_REDUCER_VALUE'), false);
      assert.equal(JSON.stringify(bundle).includes('RAW_PRESSURE_LEDGER_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'), false);
      assert.equal(JSON.stringify(bundle).includes('RAW_COMMAND_BEARING_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'), false);
      assert.equal(JSON.stringify(bundle).includes('RAW_COMMAND_COMPETENCE_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'), false);
      assert.equal(JSON.stringify(bundle).includes('RAW_COMMAND_LOG_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'), false);
      assert.equal(JSON.stringify(bundle).includes('RAW_TURN_LEDGER_PACKET_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'), false);
      assert.equal(JSON.stringify(bundle).includes('RAW_ACTOR_POSTURE_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'), false);
      assert.equal(JSON.stringify(bundle).includes('RAW_FRONT_RECORD_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'), false);
      assert.equal(JSON.stringify(bundle).includes('RAW_CLOCK_REASON_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'), false);
      assert.equal(JSON.stringify(bundle).includes('RAW_TERMINAL_SHIP_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'), false);
      assert.equal(JSON.stringify(bundle).includes('RAW_TERMINAL_PLAYER_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'), false);
      assert.equal(JSON.stringify(bundle).includes('RAW_TERMINAL_FLAG_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'), false);
      assert.equal(JSON.stringify(bundle).includes('RAW_RELATIONSHIP_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'), false);
      assert.equal(JSON.stringify(bundle).includes('RAW_RELATIONSHIP_MEMORY_EVENT_SHOULD_NOT_ENTER_CORE_MECHANICS'), false);
      assert.equal(JSON.stringify(bundle).includes('RAW_RELATIONSHIP_MEMORY_INTERPRETATION_SHOULD_NOT_ENTER_CORE_MECHANICS'), false);
      return {
        turnId: 'core-turn-1',
        outcomeId: bundle.outcomeId,
        operationHash: 'core-operation-hash',
        coreCheckpointRef: {
          kind: 'directive.coreMechanicsCheckpointRef.v1',
          checkpointId: bundle.checkpointBefore.checkpointId,
          layout: 'core'
        }
      };
    },
    async recordOutcomeReplacement(transactionId, replacement) {
      callOrder.push('core-replacement');
      assert.equal(transactionId, 'txn-core-mechanics-order');
      assert.equal(replacement.type, 'rerunOutcome');
      assert.equal(replacement.replacedOutcomeId, 'outcome-old-core-mechanics-order');
      assert.equal(replacement.replacementOutcomeId, 'outcome-core-mechanics-order');
      assert.equal(replacement.replacedTurnId, 'turn-old-core-mechanics-order');
      assert.equal(replacement.replacementTurnId, 'turn-core-mechanics-order');
      assert.equal(replacement.repairDecision?.kind, 'directive.repairOutcomeRerunActuationDecision.v1');
      assert.equal(replacement.repairDecision?.action, 'createRerunBranchCandidate');
      return {
        kind: 'directive.coreOutcomeReplacementRef.v1',
        transactionId,
        replacedOutcomeId: replacement.replacedOutcomeId,
        replacementOutcomeId: replacement.replacementOutcomeId
      };
    }
  }
});

const success = await coordinator.checkpointMechanics({
  beforeCampaignState: baseState(),
  campaignState: committedState(),
  turnPacket,
  ingressId: 'ingress-core-mechanics-order',
  outcomeReplacement: {
    transactionId: 'txn-core-mechanics-order',
    idempotencyKey: 'outcome-replacement:txn-core-mechanics-order:outcome-old-core-mechanics-order:outcome-core-mechanics-order',
    type: 'rerunOutcome',
    replacedOutcomeId: 'outcome-old-core-mechanics-order',
    replacementOutcomeId: 'outcome-core-mechanics-order',
    replacedTurnId: 'turn-old-core-mechanics-order',
    replacementTurnId: 'turn-core-mechanics-order',
    repairDecision: {
      kind: 'directive.repairOutcomeRerunActuationDecision.v1',
      authorized: true,
      action: 'createRerunBranchCandidate',
      outcomeId: 'outcome-old-core-mechanics-order'
    }
  }
});

assert.deepEqual(callOrder, ['core-advance', 'core-mechanics', 'core-replacement', 'persist']);
assert.equal(success.coreMechanics.status, 'committed');
assert.equal(success.coreMechanics.operationHash, 'core-operation-hash');
assert.equal(success.coreMechanics.coreCheckpointRef.checkpointId, 'core-mechanics-outcome-core-mechanics-order');
assert.equal(success.coreOutcomeReplacement.kind, 'directive.coreOutcomeReplacementRef.v1');
assert.equal(success.coreOutcomeReplacement.replacedOutcomeId, 'outcome-old-core-mechanics-order');
assert.equal(success.coreOutcomeReplacement.replacementOutcomeId, 'outcome-core-mechanics-order');
assert.equal(persisted.length, 1);
assert.equal(persisted[0].state.runtimeTracking.lastCommittedTurn.outcomeId, 'outcome-core-mechanics-order');
assert.equal(persisted[0].state.runtimeTracking.lastCommittedTurn.authority, 'compatibilityProjection');
assert.equal(persisted[0].state.runtimeTracking.lastCommittedTurn.projectionSource, 'coreStoreV2');
assert.equal(
  persisted[0].state.runtimeTracking.lastCommittedTurn.compatibilityMirror.kind,
  'directive.lastCommittedTurnCompatibilityMirror.v1'
);
assert.equal(
  persisted[0].state.runtimeTracking.lastCommittedTurn.coreProjection.kind,
  'directive.coreLastCommittedTurnProjectionRef.v1'
);
assert.equal(persisted[0].state.runtimeTracking.lastCommittedTurn.coreTransactionId, 'txn-core-mechanics-order');
assert.equal(persisted[0].state.turnLedger.entries.at(-1).coreTransactionId, 'txn-core-mechanics-order');
assert.equal(persisted[0].state.turnLedger.entries.at(-1).coreOperationHash, 'core-operation-hash');
assert.equal(persisted[0].state.turnLedger.entries.at(-1).coreCheckpointRef.checkpointId, 'core-mechanics-outcome-core-mechanics-order');
assert.equal(
  Object.prototype.hasOwnProperty.call(persisted[0].state.runtimeTracking.lastCommittedTurn, 'coreCheckpointRef'),
  false,
  'lastCommittedTurn mirror must not carry CORE checkpoint authority.'
);
assert.equal(
  Object.prototype.hasOwnProperty.call(persisted[0].state.runtimeTracking.lastCommittedTurn, 'snapshotBeforeRetained'),
  false,
  'lastCommittedTurn mirror must not carry snapshot retention authority.'
);

let longCheckpointId = null;
const longOutcomeId = [
  'outcome.chat-turn-ingress',
  'campaign-1783164825307-2-ff0d280c',
  'directive-ashes-of-peace-139-2026-07-04-05h33m46s074ms',
  '3-f2420ac6'
].join('-');
const longTurnPacket = cloneJson(turnPacket);
longTurnPacket.outcomePacket.id = longOutcomeId;
if (longTurnPacket.finalOutcome) longTurnPacket.finalOutcome.id = longOutcomeId;
const longCheckpointCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:00:05.000Z',
  persist: async () => ({ id: 'save-long-checkpoint' }),
  coreTurnStore: {
    async getTransaction(transactionId) {
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn(transactionId) {
      return { id: transactionId, phase: 'routePending' };
    },
    async commitMechanics(transactionId, bundle) {
      longCheckpointId = bundle.checkpointBefore.checkpointId;
      assert.equal(bundle.outcomeId, longOutcomeId);
      assert.ok(
        longCheckpointId.startsWith('core-mechanics-outcome.chat-turn-ingress-campaign-178316482'),
        'long checkpoint id should keep a useful readable prefix'
      );
      assert.ok(
        longCheckpointId.length <= 72,
        `long checkpoint id should stay path-safe, got ${longCheckpointId.length}`
      );
      assert.match(longCheckpointId, /-[0-9a-f]{12}$/);
      return {
        turnId: 'core-turn-long-checkpoint',
        outcomeId: bundle.outcomeId,
        operationHash: 'core-operation-hash-long',
        coreCheckpointRef: {
          kind: 'directive.coreMechanicsCheckpointRef.v1',
          checkpointId: longCheckpointId,
          layout: 'core'
        }
      };
    }
  }
});
await longCheckpointCoordinator.checkpointMechanics({
  beforeCampaignState: baseState(),
  campaignState: committedState(),
  turnPacket: longTurnPacket,
  ingressId: 'ingress-core-mechanics-order'
});
assert.ok(longCheckpointId, 'long checkpoint fixture should commit CORE mechanics');
const longCheckpointFileName = `directive-campaigns-campaign-1783164825307-2-ff0d280c-saves-save-1783164825307-3-ed54453b-core-checkpoints-${longCheckpointId}.v2.json`;
assert.ok(
  longCheckpointFileName.length < 255,
  `checkpoint filename must stay below Windows file-name limit, got ${longCheckpointFileName.length}`
);

let fallbackMechanicsBundle = null;
const fallbackBeforeState = baseState();
fallbackBeforeState.values = { standingPrinciples: [] };
setCoreIngressProjection(fallbackBeforeState, 'txn-core-mechanics-fallback');
const fallbackAfterState = cloneJson(fallbackBeforeState);
fallbackAfterState.values = {
  standingPrinciples: [{
    id: 'values-core-mechanics-fallback',
    summary: 'RAW_VALUES_FALLBACK_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'
  }]
};
const fallbackTurnPacket = {
  turnId: 'turn-core-mechanics-fallback',
  outcomePacket: {
    id: 'outcome-core-mechanics-fallback',
    resultBand: 'Mixed'
  },
  stateDelta: {},
  provenance: {}
};
const fallbackCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:00:30.000Z',
  persist: async () => ({ id: 'save-fallback-mechanics' }),
  coreTurnStore: {
    async getTransaction(transactionId) {
      assert.equal(transactionId, 'txn-core-mechanics-fallback');
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn(transactionId, patch) {
      assert.equal(transactionId, 'txn-core-mechanics-fallback');
      assert.equal(patch.phase, 'routePending');
      return { id: transactionId, phase: patch.phase };
    },
    async commitMechanics(transactionId, bundle) {
      assert.equal(transactionId, 'txn-core-mechanics-fallback');
      fallbackMechanicsBundle = cloneJson(bundle);
      return {
        turnId: 'core-turn-fallback',
        outcomeId: bundle.outcomeId,
        operationHash: 'fallback-operation-hash'
      };
    }
  }
});
await fallbackCoordinator.checkpointMechanics({
  beforeCampaignState: fallbackBeforeState,
  campaignState: fallbackAfterState,
  turnPacket: fallbackTurnPacket,
  ingressId: 'ingress-core-mechanics-order'
});
const fallbackOperation = fallbackMechanicsBundle.operations.find((operation) => operation.domain === 'values');
assert.ok(fallbackOperation, 'source-less value root should retain compatibility fallback evidence');
assert.equal(fallbackOperation.op, 'domainCommitted');
assert.equal(fallbackOperation.sourceKind, 'directive.compatibilityMechanicsDomainFallback.v1');
assert.equal(fallbackOperation.sourceOutcomeId, 'outcome-core-mechanics-fallback');
assert.ok(fallbackOperation.sourceHash, 'compatibility fallback should carry a bounded source hash');
assert.ok(fallbackOperation.valueHash, 'compatibility fallback should carry committed root hash');
assert.equal(JSON.stringify(fallbackMechanicsBundle).includes('RAW_VALUES_FALLBACK_TEXT_SHOULD_NOT_ENTER_CORE_MECHANICS'), false);

const failedPersisted = [];
const failingCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:01:00.000Z',
  persist: async (next, summary) => {
    failedPersisted.push({ state: cloneJson(next), summary });
    return { id: `save-failed-${failedPersisted.length}` };
  },
  coreTurnStore: {
    async getTransaction(transactionId) {
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn() {
      return { id: 'txn-core-mechanics-order', phase: 'routePending' };
    },
    async commitMechanics() {
      const error = new Error('simulated CORE mechanics failure');
      error.code = 'DIRECTIVE_CORE_MECHANICS_COMMIT_FAILED';
      throw error;
    }
  }
});

await assert.rejects(
  () => failingCoordinator.checkpointMechanics({
    beforeCampaignState: baseState(),
    campaignState: committedState(),
    turnPacket,
    ingressId: 'ingress-core-mechanics-order'
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_CORE_MECHANICS_COMMIT_FAILED');
    assert.equal(error.details?.status, 'error');
    return true;
  }
);
assert.equal(failedPersisted.length, 0, 'v1 checkpoint must not persist when CORE mechanics fails first');

const postMechanicsPersistFailureCalls = [];
const postMechanicsPersistFailureCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:01:20.000Z',
  persist: async () => {
    postMechanicsPersistFailureCalls.push('persist');
    const error = new Error('simulated active-save persist failure after mechanics');
    error.code = 'DIRECTIVE_ACTIVE_SAVE_PERSIST_FAILED';
    throw error;
  },
  coreTurnStore: {
    async getTransaction(transactionId) {
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn() {
      postMechanicsPersistFailureCalls.push('core-advance');
      return { id: 'txn-core-mechanics-order', phase: 'routePending' };
    },
    async commitMechanics() {
      postMechanicsPersistFailureCalls.push('core-mechanics');
      return {
        turnId: 'core-turn-post-mechanics-persist-failure',
        outcomeId: 'outcome-core-mechanics-order',
        operationHash: 'core-operation-hash'
      };
    }
  }
});

const postMechanicsPersistFailure = await postMechanicsPersistFailureCoordinator.checkpointMechanics({
  beforeCampaignState: baseState(),
  campaignState: committedState(),
  turnPacket,
  ingressId: 'ingress-core-mechanics-order'
});
assert.deepEqual(postMechanicsPersistFailureCalls, ['core-advance', 'core-mechanics', 'persist']);
assert.equal(postMechanicsPersistFailure.persistStatus, 'failedAfterCoreMechanics');
assert.equal(postMechanicsPersistFailure.persistError.code, 'DIRECTIVE_ACTIVE_SAVE_PERSIST_FAILED');
assert.equal(postMechanicsPersistFailure.save, null);
assert.equal(postMechanicsPersistFailure.coreMechanics.outcomeId, 'outcome-core-mechanics-order');
assert.equal(
  postMechanicsPersistFailure.campaignState.runtimeTracking.lastCommittedTurn.outcomeId,
  'outcome-core-mechanics-order',
  'CORE mechanics success must still return the committed campaign state when active-save persistence fails.'
);
const postMechanicsNarrationMark = await postMechanicsPersistFailureCoordinator.markNarration({
  campaignState: postMechanicsPersistFailure.campaignState,
  outcomeId: 'outcome-core-mechanics-order',
  status: 'complete',
  directiveGenerationStartedAt: '2026-06-29T01:01:21.000Z'
});
assert.equal(postMechanicsNarrationMark.persistStatus, 'failedAfterNarration');
assert.equal(postMechanicsNarrationMark.persistError.code, 'DIRECTIVE_ACTIVE_SAVE_PERSIST_FAILED');
assert.equal(postMechanicsNarrationMark.campaignState.runtimeTracking.lastCommittedTurn.narrationStatus, 'complete');
assert.equal(postMechanicsNarrationMark.campaignState.runtimeTracking.lastCommittedTurn.compatibilityMirror.status, 'narration:complete');
const postMechanicsResponseMark = await postMechanicsPersistFailureCoordinator.markResponse({
  campaignState: postMechanicsNarrationMark.campaignState,
  outcomeId: 'outcome-core-mechanics-order',
  status: 'posted',
  hostMessageId: 'assistant-post-mechanics-persist-failure'
});
assert.equal(postMechanicsResponseMark.persistStatus, 'failedAfterResponse');
assert.equal(postMechanicsResponseMark.persistError.code, 'DIRECTIVE_ACTIVE_SAVE_PERSIST_FAILED');
assert.equal(postMechanicsResponseMark.campaignState.runtimeTracking.lastCommittedTurn.responseStatus, 'posted');
assert.equal(postMechanicsResponseMark.campaignState.runtimeTracking.lastCommittedTurn.compatibilityMirror.status, 'response:posted');

const failedReplacementCalls = [];
const failedReplacementPersisted = [];
const failedReplacementCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:01:30.000Z',
  persist: async (next, summary) => {
    failedReplacementCalls.push('persist');
    failedReplacementPersisted.push({ state: cloneJson(next), summary });
    return { id: `save-failed-replacement-${failedReplacementPersisted.length}` };
  },
  coreTurnStore: {
    async getTransaction(transactionId) {
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn() {
      failedReplacementCalls.push('core-advance');
      return { id: 'txn-core-mechanics-order', phase: 'routePending' };
    },
    async commitMechanics() {
      failedReplacementCalls.push('core-mechanics');
      return {
        turnId: 'core-turn-failed-replacement',
        outcomeId: 'outcome-core-mechanics-order',
        operationHash: 'core-operation-hash'
      };
    },
    async recordOutcomeReplacement() {
      failedReplacementCalls.push('core-replacement');
      const error = new Error('simulated CORE outcome replacement failure');
      error.code = 'DIRECTIVE_CORE_OUTCOME_REPLACEMENT_RECORD_FAILED';
      throw error;
    }
  }
});

await assert.rejects(
  () => failedReplacementCoordinator.checkpointMechanics({
    beforeCampaignState: baseState(),
    campaignState: committedState(),
    turnPacket,
    ingressId: 'ingress-core-mechanics-order',
    outcomeReplacement: {
      transactionId: 'txn-core-mechanics-order',
      idempotencyKey: 'outcome-replacement:txn-core-mechanics-order:outcome-old-core-mechanics-order:outcome-core-mechanics-order',
      type: 'rerunOutcome',
      replacedOutcomeId: 'outcome-old-core-mechanics-order',
      replacementOutcomeId: 'outcome-core-mechanics-order'
    }
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_CORE_OUTCOME_REPLACEMENT_RECORD_FAILED');
    return true;
  }
);
assert.deepEqual(failedReplacementCalls, ['core-advance', 'core-mechanics', 'core-replacement']);
assert.equal(failedReplacementPersisted.length, 0, 'v1 checkpoint must not persist when CORE replacement record fails');

const replacementPersistFailureCalls = [];
const replacementPersistFailureRecoveries = [];
const replacementPersistFailureCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:01:40.000Z',
  persist: async () => {
    replacementPersistFailureCalls.push('persist');
    const error = new Error('simulated active-save persist failure after replacement record');
    error.code = 'DIRECTIVE_ACTIVE_SAVE_PERSIST_FAILED';
    throw error;
  },
  coreTurnStore: {
    async getTransaction(transactionId) {
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn() {
      replacementPersistFailureCalls.push('core-advance');
      return { id: 'txn-core-mechanics-order', phase: 'routePending' };
    },
    async commitMechanics() {
      replacementPersistFailureCalls.push('core-mechanics');
      return {
        turnId: 'core-turn-replacement-persist-failure',
        outcomeId: 'outcome-core-mechanics-order',
        operationHash: 'core-operation-hash'
      };
    },
    async recordOutcomeReplacement(transactionId, replacement) {
      replacementPersistFailureCalls.push('core-replacement');
      assert.equal(transactionId, 'txn-core-mechanics-order');
      return {
        kind: 'directive.coreOutcomeReplacementRef.v1',
        transactionId,
        replacedOutcomeId: replacement.replacedOutcomeId,
        replacementOutcomeId: replacement.replacementOutcomeId
      };
    },
    async markRecoveryRequired(transactionId, recoveryBundle) {
      replacementPersistFailureCalls.push('core-recovery');
      replacementPersistFailureRecoveries.push({ transactionId, recoveryBundle: cloneJson(recoveryBundle) });
      return {
        id: recoveryBundle.id,
        status: 'required',
        reason: recoveryBundle.reason
      };
    }
  }
});

await assert.rejects(
  () => replacementPersistFailureCoordinator.checkpointMechanics({
    beforeCampaignState: baseState(),
    campaignState: committedState(),
    turnPacket,
    ingressId: 'ingress-core-mechanics-order',
    outcomeReplacement: {
      transactionId: 'txn-core-mechanics-order',
      idempotencyKey: 'outcome-replacement:txn-core-mechanics-order:persist-failure',
      type: 'rerunOutcome',
      replacedOutcomeId: 'outcome-old-core-mechanics-order',
      replacementOutcomeId: 'outcome-core-mechanics-order'
    }
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_ACTIVE_SAVE_PERSIST_FAILED');
    return true;
  }
);
assert.deepEqual(replacementPersistFailureCalls, ['core-advance', 'core-mechanics', 'core-replacement', 'persist', 'core-recovery']);
assert.equal(replacementPersistFailureRecoveries.length, 1, 'CORE replacement persist failure should be durably recoverable');
assert.equal(replacementPersistFailureRecoveries[0].transactionId, 'txn-core-mechanics-order');
assert.equal(replacementPersistFailureRecoveries[0].recoveryBundle.reason, 'outcome-replacement-active-save-persist-failed');
assert.equal(replacementPersistFailureRecoveries[0].recoveryBundle.dependentOutcomeId, 'outcome-core-mechanics-order');
assert.equal(replacementPersistFailureRecoveries[0].recoveryBundle.repairDecision.action, 'reviewOutcomeReplacementPersistFailure');

const missingReplacementTransactionCalls = [];
const missingReplacementTransactionPersisted = [];
const missingReplacementTransactionCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:01:45.000Z',
  persist: async (next, summary) => {
    missingReplacementTransactionCalls.push('persist');
    missingReplacementTransactionPersisted.push({ state: cloneJson(next), summary });
    return { id: `save-missing-replacement-transaction-${missingReplacementTransactionPersisted.length}` };
  },
  coreTurnStore: {
    async getTransaction(transactionId) {
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 1, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn() {
      missingReplacementTransactionCalls.push('core-advance');
      return { id: 'txn-core-mechanics-order', phase: 'routePending' };
    },
    async commitMechanics() {
      missingReplacementTransactionCalls.push('core-mechanics');
      return {
        turnId: 'core-turn-missing-replacement-transaction',
        outcomeId: 'outcome-core-mechanics-order',
        operationHash: 'core-operation-hash'
      };
    },
    async recordOutcomeReplacement() {
      missingReplacementTransactionCalls.push('core-replacement');
      return { kind: 'directive.coreOutcomeReplacementRef.v1' };
    }
  }
});

await assert.rejects(
  () => missingReplacementTransactionCoordinator.checkpointMechanics({
    beforeCampaignState: baseState(),
    campaignState: committedState(),
    turnPacket,
    ingressId: 'ingress-core-mechanics-order',
    outcomeReplacement: {
      idempotencyKey: 'outcome-replacement:missing-transaction',
      type: 'rerunOutcome',
      replacedOutcomeId: 'outcome-old-core-mechanics-order',
      replacementOutcomeId: 'outcome-core-mechanics-order'
    }
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_CORE_OUTCOME_REPLACEMENT_TRANSACTION_REQUIRED');
    return true;
  }
);
assert.deepEqual(missingReplacementTransactionCalls, ['core-advance', 'core-mechanics']);
assert.equal(missingReplacementTransactionPersisted.length, 0, 'v1 checkpoint must not persist replacement records without explicit CORE replacement transaction');

const missingCoreMechanicsPersisted = [];
const missingCoreMechanicsCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:01:45.000Z',
  persist: async (next, summary) => {
    missingCoreMechanicsPersisted.push({ state: cloneJson(next), summary });
    return { id: `save-missing-core-mechanics-${missingCoreMechanicsPersisted.length}` };
  }
});
await assert.rejects(
  () => missingCoreMechanicsCoordinator.checkpointMechanics({
    beforeCampaignState: baseState(),
    campaignState: committedState(),
    turnPacket,
    ingressId: null
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_CORE_MECHANICS_REQUIRED');
    assert.equal(error.details?.reason, 'core-store-unavailable');
    return true;
  }
);
assert.equal(missingCoreMechanicsPersisted.length, 0, 'active-save mechanics checkpoint must not persist without committed CORE mechanics');

const skippedMechanicsReplacementPersisted = [];
const skippedMechanicsReplacementCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:01:50.000Z',
  persist: async (next, summary) => {
    skippedMechanicsReplacementPersisted.push({ state: cloneJson(next), summary });
    return { id: `save-skipped-mechanics-replacement-${skippedMechanicsReplacementPersisted.length}` };
  },
  coreTurnStore: {
    async recordOutcomeReplacement() {
      return { kind: 'directive.coreOutcomeReplacementRef.v1' };
    }
  }
});

await assert.rejects(
  () => skippedMechanicsReplacementCoordinator.checkpointMechanics({
    beforeCampaignState: baseState(),
    campaignState: committedState(),
    turnPacket,
    ingressId: null,
    outcomeReplacement: {
      transactionId: 'txn-core-mechanics-order',
      idempotencyKey: 'outcome-replacement:skipped-mechanics',
      type: 'rerunOutcome',
      replacedOutcomeId: 'outcome-old-core-mechanics-order',
      replacementOutcomeId: 'outcome-core-mechanics-order'
    }
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_CORE_OUTCOME_REPLACEMENT_MECHANICS_REQUIRED');
    return true;
  }
);
assert.equal(skippedMechanicsReplacementPersisted.length, 0, 'v1 checkpoint must not persist replacement records when CORE mechanics is skipped');

const replacementMechanicsCalls = [];
const replacementMechanicsPersisted = [];
const replacementMechanicsState = baseState();
setCoreIngressProjection(replacementMechanicsState, 'txn-original-committed-outcome');
const replacementMechanicsCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:01:55.000Z',
  persist: async (next, summary) => {
    replacementMechanicsCalls.push('persist');
    replacementMechanicsPersisted.push({ state: cloneJson(next), summary });
    return { id: `save-replacement-mechanics-${replacementMechanicsPersisted.length}` };
  },
  coreTurnStore: {
    async getTransaction(transactionId) {
      replacementMechanicsCalls.push(['getTransaction', transactionId]);
      assert.equal(transactionId, 'txn-fresh-replacement-branch');
      return {
        id: transactionId,
        revisions: { mechanics: 0, runtime: 2, diagnostic: 0, prompt: 0 }
      };
    },
    async getRevisions() {
      return { mechanics: 0, runtime: 2, diagnostic: 0, prompt: 0 };
    },
    async advanceTurn(transactionId, patch) {
      replacementMechanicsCalls.push(['core-advance', transactionId]);
      assert.equal(transactionId, 'txn-fresh-replacement-branch');
      assert.equal(patch.phase, 'routePending');
      return { id: transactionId, phase: patch.phase };
    },
    async commitMechanics(transactionId, bundle) {
      replacementMechanicsCalls.push(['core-mechanics', transactionId]);
      assert.equal(transactionId, 'txn-fresh-replacement-branch');
      assert.equal(bundle.outcomeId, 'outcome-core-mechanics-order');
      return {
        turnId: 'core-turn-fresh-replacement',
        outcomeId: bundle.outcomeId,
        operationHash: 'fresh-replacement-operation-hash'
      };
    },
    async recordOutcomeReplacement(transactionId, replacement) {
      replacementMechanicsCalls.push(['core-replacement', transactionId]);
      assert.equal(transactionId, 'txn-fresh-replacement-branch');
      assert.equal(replacement.replacedTransactionId, 'txn-original-committed-outcome');
      assert.equal(replacement.replacementTransactionId, 'txn-fresh-replacement-branch');
      return {
        kind: 'directive.coreOutcomeReplacementRef.v1',
        transactionId,
        replacedTransactionId: replacement.replacedTransactionId,
        replacementTransactionId: replacement.replacementTransactionId,
        replacedOutcomeId: replacement.replacedOutcomeId,
        replacementOutcomeId: replacement.replacementOutcomeId
      };
    }
  }
});

const replacementMechanicsResult = await replacementMechanicsCoordinator.checkpointMechanics({
  beforeCampaignState: replacementMechanicsState,
  campaignState: {
    ...committedState(),
    runtimeTracking: replacementMechanicsState.runtimeTracking
  },
  turnPacket,
  ingressId: 'ingress-core-mechanics-order',
  outcomeReplacement: {
    transactionId: 'txn-fresh-replacement-branch',
    replacedTransactionId: 'txn-original-committed-outcome',
    replacementTransactionId: 'txn-fresh-replacement-branch',
    idempotencyKey: 'outcome-replacement:fresh-branch',
    type: 'rerunOutcome',
    replacedOutcomeId: 'outcome-old-core-mechanics-order',
    replacementOutcomeId: 'outcome-core-mechanics-order'
  }
});
assert.equal(replacementMechanicsResult.coreMechanics.transactionId, 'txn-fresh-replacement-branch');
assert.equal(replacementMechanicsResult.coreOutcomeReplacement.transactionId, 'txn-fresh-replacement-branch');
assert.equal(replacementMechanicsPersisted[0].state.turnLedger.entries.at(-1).coreTransactionId, 'txn-fresh-replacement-branch');

const malformedReducerPacket = cloneJson(turnPacket);
malformedReducerPacket.stateDelta.openWorld.reducerBundle.diagnostics.operationCount = 2;
const malformedCalls = [];
const malformedPersisted = [];
const malformedCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:02:00.000Z',
  persist: async (next, summary) => {
    malformedCalls.push('persist');
    malformedPersisted.push({ state: cloneJson(next), summary });
    return { id: `save-malformed-${malformedPersisted.length}` };
  },
  coreTurnStore: {
    async advanceTurn() {
      malformedCalls.push('core-advance');
      return { id: 'txn-core-mechanics-order', phase: 'routePending' };
    },
    async commitMechanics() {
      malformedCalls.push('core-mechanics');
      return { turnId: 'should-not-commit' };
    }
  }
});

await assert.rejects(
  () => malformedCoordinator.checkpointMechanics({
    beforeCampaignState: baseState(),
    campaignState: committedState(),
    turnPacket: malformedReducerPacket,
    ingressId: 'ingress-core-mechanics-order'
  }),
  /operationCount mismatch/
);
assert.deepEqual(malformedCalls, [], 'malformed reducer bundles must fail before CORE writes or v1 persistence');
assert.equal(malformedPersisted.length, 0);

const storage = createMemoryStorage();
const adapter = createLogicalStorageAdapter({ storage, hostId: 'fake' });
const staleCoreStore = createCoreStoreV2({
  adapter,
  campaignId: 'campaign-core-mechanics-order',
  saveId: 'save-core-mechanics-order',
  now: () => '2026-06-29T01:03:00.000Z'
});
const staleSourceFrame = {
  id: 'frame-stale-core-mechanics',
  campaignId: 'campaign-core-mechanics-order',
  saveId: 'save-core-mechanics-order',
  chatId: 'ashes-chat',
  hostMessageId: 'player-stale-core-mechanics',
  textHash: hashStableJson({ text: 'stale mechanics source' }),
  sourceRevision: 0
};
await staleCoreStore.beginTurn(staleSourceFrame, {
  transactionId: 'txn-stale-core-mechanics',
  ingressId: 'ingress-core-mechanics-order',
  idempotencyKey: 'begin-stale-core-mechanics'
});
const concurrentSourceFrame = {
  ...staleSourceFrame,
  id: 'frame-concurrent-core-mechanics',
  hostMessageId: 'player-concurrent-core-mechanics',
  textHash: hashStableJson({ text: 'concurrent mechanics source' })
};
await staleCoreStore.beginTurn(concurrentSourceFrame, {
  transactionId: 'txn-concurrent-core-mechanics',
  ingressId: 'ingress-concurrent-core-mechanics',
  idempotencyKey: 'begin-concurrent-core-mechanics'
});
await staleCoreStore.advanceTurn('txn-concurrent-core-mechanics', {
  phase: 'routePending',
  route: 'directivePosted',
  idempotencyKey: 'route-concurrent-core-mechanics'
});
await staleCoreStore.commitMechanics('txn-concurrent-core-mechanics', {
  baseMechanicsRevision: 0,
  idempotencyKey: 'mechanics-concurrent-core-mechanics',
  turnId: 'turn-concurrent-core-mechanics',
  outcomeId: 'outcome-concurrent-core-mechanics',
  summary: 'Concurrent mechanics commit.',
  operations: [{ domain: 'mission', op: 'domainCommitted', valueHash: 'concurrent' }],
  committedRoots: ['mission'],
  phaseAfter: 'mechanicsPending'
});
const staleState = baseState();
setCoreIngressProjection(staleState, 'txn-stale-core-mechanics');
const stalePersisted = [];
const staleCoordinator = createTurnCommitCoordinator({
  now: () => '2026-06-29T01:04:00.000Z',
  persist: async (next, summary) => {
    stalePersisted.push({ state: cloneJson(next), summary });
    return { id: `save-stale-${stalePersisted.length}` };
  },
  coreTurnStore: staleCoreStore
});
const staleEventsBefore = staleCoreStore.state.events.length;
await assert.rejects(
  () => staleCoordinator.checkpointMechanics({
    beforeCampaignState: staleState,
    campaignState: {
      ...committedState(),
      runtimeTracking: staleState.runtimeTracking
    },
    turnPacket,
    ingressId: 'ingress-core-mechanics-order'
  }),
  (error) => {
    assert.equal(error.code, 'DIRECTIVE_CORE_STALE_MECHANICS_REVISION');
    assert.equal(error.details?.status, 'error');
    return true;
  }
);
assert.equal(stalePersisted.length, 0, 'stale CORE mechanics must not persist the v1 checkpoint');
assert.equal(staleCoreStore.state.events.length, staleEventsBefore, 'stale CORE mechanics must fail before route advance');
assert.equal(staleCoreStore.state.transactions['txn-stale-core-mechanics'].phase, 'observed');

console.log('Turn commit coordinator CORE mechanics ordering tests passed.');
