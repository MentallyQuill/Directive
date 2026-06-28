import assert from 'node:assert/strict';

import {
  buildDefineContextBundle,
  buildDefineSelectionRequest,
  classifyDefineSelectionLocal,
  prepareDefineSelection
} from '../../src/runtime/define-selection.mjs';

const campaignState = {
  campaign: {
    id: 'campaign-ashes',
    title: 'Ashes of Peace'
  },
  player: {
    id: 'pc.sam',
    name: 'Sam',
    rank: 'Lieutenant',
    billet: 'Acting Diplomatic Officer'
  },
  attentionState: {
    scene: {
      missionTitle: 'Ashes of Peace',
      phaseLabel: 'Ready-room handoff',
      location: 'Ready Room',
      currentQuestion: 'How should Sam handle Commander Cross and the inspection dispute?',
      immediateStakes: 'The ship must certify the port nacelle before departure.',
      presentCharacterIds: ['crew.cross']
    }
  },
  mission: {
    formalObjectives: [
      {
        id: 'mission.inspect-nacelle',
        title: 'Inspect the port nacelle coolant seal',
        summary: 'Confirm whether junction 7-C is ready before departure.',
        status: 'active'
      }
    ]
  },
  knowledgeLedger: {
    components: {
      records: [
        {
          id: 'component.coolant-seal',
          title: 'Coolant seal, port nacelle',
          type: 'shipIssue',
          status: 'unresolved',
          summary: 'Junction 7-C still needs a certified repair signoff.',
          tags: ['engineering'],
          links: {
            shipSystemIds: ['ship.coolant']
          }
        }
      ]
    }
  },
  commandLog: {
    entries: [
      {
        id: 'log.ready-room-warning',
        title: 'Ready-room warning',
        summary: 'Cross warned that the inspection clock is tight.',
        playerVisible: true,
        visibleConsequences: ['The certification deadline remains visible to Sam.']
      }
    ]
  }
};

const crewDataset = {
  officers: [
    {
      id: 'crew.cross',
      name: 'Commander Cross',
      rank: 'Commander',
      billet: 'Executive Officer',
      aliases: ['Cross'],
      publicProfile: 'A senior officer handling the handoff with Sam.'
    }
  ]
};

const shipDataset = {
  systems: [
    {
      id: 'ship.coolant',
      label: 'Coolant seal',
      summary: 'A pressure seal tied to the port nacelle junction.',
      aliases: ['junction 7-C', 'port nacelle coolant seal']
    }
  ]
};

const packageData = {
  glossary: [
    {
      id: 'glossary.lcars',
      term: 'LCARS',
      definition: 'The shipboard computer interface and operating environment.'
    }
  ]
};

const recentMessages = [
  {
    hostMessageId: '14',
    role: 'assistant',
    name: 'Directive',
    text: 'Commander Cross waited beside the ready-room display.'
  },
  {
    hostMessageId: '15',
    role: 'assistant',
    name: 'Directive',
    text: 'Commander Cross said the coolant seal, port nacelle, junction 7-C still lacked certification.'
  },
  {
    hostMessageId: '16',
    role: 'user',
    name: 'Sam',
    text: 'Sam asks what the certification affects.'
  }
];

const baseSelection = {
  selectedText: 'Commander Cross',
  chatId: 'Directive - Ashes of Peace (57)',
  host: 'sillytavern',
  hostMessageId: '15',
  message: {
    hostMessageId: '15',
    role: 'assistant',
    name: 'Directive',
    text: recentMessages[1].text
  }
};

function baseOptions(selection = baseSelection) {
  return {
    selection,
    campaignState,
    packageData,
    crewDataset,
    shipDataset,
    recentMessages,
    currentSceneMessages: recentMessages.slice(-2),
    scene: campaignState.attentionState.scene
  };
}

const bundle = buildDefineContextBundle(baseOptions());
assert.equal(bundle.source.hostMessageId, '15');
assert.equal(bundle.source.messageText, undefined, 'provider context must not duplicate raw source text in source metadata');
assert.equal(bundle.sourceMessage.text, recentMessages[1].text);
assert.equal(bundle.sourceWindow.some((message) => message.hostMessageId === '15'), true);
assert.equal(bundle.indexes.crew[0].id, 'crew.cross');

const classification = classifyDefineSelectionLocal(bundle);
assert.equal(classification.primaryGuess, 'character');
assert.equal(classification.matchedRecords.crewIds.includes('crew.cross'), true);

const rankCollisionBundle = buildDefineContextBundle({
  ...baseOptions({
    ...baseSelection,
    selectedText: 'Lieutenant Priya',
    message: {
      ...baseSelection.message,
      text: 'Lieutenant Priya reported that the transporter handoff was behind schedule.'
    }
  }),
  crewDataset: {
    officers: [
      {
        id: 'crew.kieran',
        name: 'Kieran Vale',
        rank: 'Lieutenant',
        billet: 'Flight Control Officer'
      },
      {
        id: 'crew.priya',
        name: 'Priya Nayar',
        rank: 'Lieutenant',
        billet: 'Operations Officer'
      }
    ]
  }
});
const rankCollision = classifyDefineSelectionLocal(rankCollisionBundle);
assert.equal(rankCollision.primaryGuess, 'character');
assert.equal(rankCollision.matchedRecords.crewIds.includes('crew.priya'), true);
assert.equal(rankCollision.matchedRecords.crewIds.includes('crew.kieran'), false, 'rank tokens alone must not match every officer with that rank');

const request = buildDefineSelectionRequest(bundle, classification);
assert.equal(request.metadata.primaryGuess, 'character');
assert.equal(request.metadata.sourceMessageId, '15');
assert.equal(request.messages[0].role, 'system');
assert.match(request.prompt, /allowedPrimaryTypes/);
assert.match(request.prompt, /currentSceneWindow/);

const providerCalls = [];
const utilityRouter = {
  async generate(roleId, requestPayload) {
    providerCalls.push({ roleId, request: requestPayload });
    return {
      ok: true,
      response: {
        providerId: 'fake-utility',
        model: 'fake-utility-model',
        content: {
          source: 'utility',
          subject: 'Commander Cross',
          primaryType: 'character',
          secondaryTypes: ['rankTitleProtocol'],
          confidence: 'high',
          shortAnswer: 'Commander Cross is the Executive Officer currently handling Sam through a sensitive certification dispute.',
          sections: [
            {
              id: 'properAddress',
              title: 'Proper Address',
              items: ['Address him as Commander Cross unless the scene establishes a less formal mode.']
            },
            {
              id: 'relationshipContext',
              title: 'Relation To Sam',
              items: ['Sam is receiving mission-critical guidance from him in this scene.']
            }
          ],
          known: ['Cross is visible in the current scene as Commander and Executive Officer.'],
          inferred: ['His warning matters because the certification deadline is tied to departure readiness.'],
          unknown: ['Define does not know his private motives.'],
          related: {
            crewIds: ['crew.cross', 'crew.hidden'],
            shipSystemIds: ['ship.coolant'],
            componentIds: ['component.coolant-seal'],
            commandLogIds: ['log.ready-room-warning']
          },
          warnings: ['Private motives and hidden future truth are excluded.']
        }
      },
      diagnostics: {
        providerId: 'fake-utility',
        model: 'fake-utility-model'
      }
    };
  }
};

const provided = await prepareDefineSelection({
  ...baseOptions(),
  generationRouter: utilityRouter
});
assert.equal(providerCalls.length, 1);
assert.equal(providerCalls[0].roleId, 'defineSelection');
assert.equal(providerCalls[0].request.metadata.primaryGuess, 'character');
assert.equal(provided.ok, true);
assert.equal(provided.diagnostics.providerUsed, true);
assert.equal(provided.definition.primaryType, 'character');
assert.equal(provided.definition.primaryTypeLabel, 'Character / Person');
assert.equal(provided.definition.related.crewIds.includes('crew.cross'), true);
assert.equal(provided.definition.related.crewIds.includes('crew.hidden'), false, 'related ids must be limited to player-safe context indexes');
assert.equal(provided.definition.related.shipSystemIds.includes('ship.coolant'), true);
assert.equal(provided.definition.unknown[0], 'Define does not know his private motives.');

const coolantSelection = {
  ...baseSelection,
  selectedText: 'coolant seal, port nacelle, junction 7-C'
};
const fallback = await prepareDefineSelection({
  ...baseOptions(coolantSelection),
  generationRouter: {
    async generate() {
      return {
        ok: true,
        response: {
          text: 'not json'
        }
      };
    }
  }
});
assert.equal(fallback.diagnostics.providerUsed, true);
assert.equal(fallback.diagnostics.providerOutputRejected, true);
assert.equal(fallback.definition.source, 'deterministic-fallback');
assert.equal(fallback.definition.primaryType, 'shipSystemTechnicalTerm');
assert.equal(fallback.definition.related.shipSystemIds.includes('ship.coolant'), true);
assert.equal(fallback.definition.related.componentIds.includes('component.coolant-seal'), true);
assert.match(fallback.definition.shortAnswer, /ship system|technical term/i);

const claim = await prepareDefineSelection({
  ...baseOptions({
    ...baseSelection,
    selectedText: 'alleged without evidence'
  }),
  useProvider: false
});
assert.equal(claim.diagnostics.providerUsed, false);
assert.equal(claim.definition.primaryType, 'claimRumorUnverified');
assert.match(claim.definition.shortAnswer, /claim|report/i);

const ambiguous = await prepareDefineSelection({
  ...baseOptions({
    ...baseSelection,
    selectedText: 'it'
  }),
  useProvider: false
});
assert.equal(ambiguous.definition.primaryType, 'ambiguousSelection');
assert.equal(ambiguous.definition.confidence, 'low');
assert.equal(ambiguous.definition.unknown.some((item) => /ambiguous/i.test(item)), true);

console.log('test-define-selection: ok');
