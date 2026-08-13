import assert from 'node:assert/strict';

import {
  ASHES_V1_PACKAGE_ID,
  createV1CampaignPanelModel,
  createV1CrewPanelModel,
  createV1MissionPanelModel,
  createV1ShipPanelModel,
  requireV1PlayerProjection
} from '../../src/ui/v1-player-facing-panel-model.mjs';

const projection = {
  kind: 'directive.playerProjection.v1',
  player: {
    kind: 'directive.playerIdentityProjection.v1',
    id: 'player-commander',
    name: 'Ren Okada',
    pronounsOrAddress: 'he/him',
    rank: 'Commander',
    billet: 'Executive Officer',
    role: 'Second-in-command',
    species: { id: 'human', label: 'Human', summary: 'A Human Starfleet officer.' },
    appearance: 'Attentive and deliberate.',
    firstImpression: 'Measured until action is required.',
    dossier: { briefBiography: 'Ren Okada was shaped by wartime service.' },
    portrait: null
  },
  mission: {
    kind: 'directive.missionPlayerProjection.v1',
    missionId: 'mission.prelude-a-ship-underway',
    title: 'Prelude: A Ship Underway',
    summary: 'Complete the handover and bring the ship to the Reach.',
    status: 'active',
    objectives: [
      {
        id: 'objective.handover',
        class: 'required',
        status: 'active',
        disposition: null,
        title: 'Complete the command handover',
        summary: 'Establish working boundaries with Captain Whitaker.',
        terminalText: null
      },
      {
        id: 'objective.hesperus-rescue',
        class: 'optional',
        status: 'terminal',
        disposition: 'completed',
        title: 'Aid the Hesperus',
        summary: 'Protect the transport and its passengers.',
        terminalText: 'The passengers are safe.'
      }
    ],
    progress: {
      requiredCompleted: 0,
      requiredTotal: 1,
      optionalCompleted: 1,
      optionalTotal: 1
    },
    capabilities: [],
    facts: [{ id: 'fact.hesperus.distress', summary: 'Hesperus sent a distress call.' }],
    clocks: [],
    outcomeDimensions: [],
    terminal: null
  },
  people: {
    kind: 'directive.peoplePlayerProjection.v1',
    missionId: 'mission.prelude-a-ship-underway',
    people: [{
      id: 'captain-whitaker',
      name: 'Captain Whitaker',
      billet: 'Commanding Officer',
      profileSummary: 'An experienced captain who gives the new XO room to grow.',
      relationshipPosture: 'Encouraging, but watchful',
      moments: [{ id: 'moment.one', summary: 'She trusted the XO to lead the rescue.' }]
    }]
  },
  ship: {
    kind: 'directive.shipPlayerProjection.v1',
    shipId: 'uss-breckenridge',
    name: 'U.S.S. Breckenridge',
    class: 'Intrepid-class',
    registry: 'NCC-74656',
    capabilitySummary: 'A long-range explorer returned to service after modernization.',
    operationalStatus: {
      status: 'serviceable',
      summary: 'Certified for service; integrated validation continues under deployment conditions.',
      readiness: null,
      materialLimitations: [{ id: 'limit.warp', summary: 'Sustained maximum warp remains restricted.' }],
      readinessObjectiveLink: null
    }
  },
  commandBearing: {
    kind: 'directive.commandBearingPlayerProjection.v1',
    balance: 1,
    capacity: 3,
    latestAwardReason: 'Protected the Hesperus passengers.',
    pendingEdge: {
      id: 'command-bearing-edge.1',
      status: 'reserved',
      reason: 'Create one credible favorable edge without erasing established costs.'
    },
    latestSpend: null
  }
};

assert.equal(requireV1PlayerProjection({ v1PlayerProjection: projection }), projection);
assert.equal(requireV1PlayerProjection({ campaignState: null, v1PlayerProjection: null }), null);
assert.throws(
  () => requireV1PlayerProjection({ campaignState: { campaign: {} }, v1PlayerProjection: null }),
  (error) => error?.code === 'DIRECTIVE_V1_PLAYER_PROJECTION_REQUIRED'
);
assert.throws(
  () => requireV1PlayerProjection({
    campaignState: { campaign: {} },
    v1PlayerProjection: { ...projection, player: undefined }
  }),
  (error) => error?.code === 'DIRECTIVE_V1_PLAYER_PROJECTION_REQUIRED'
);

const mission = createV1MissionPanelModel(projection);
assert.equal(mission.primaryObjectives.length, 1);
assert.equal(mission.optionalObjectives.length, 1);
assert.equal(mission.clocks.length, 0, 'no visible clock means no urgency presentation');
assert.deepEqual(mission.knownFacts.map((fact) => fact.summary), ['Hesperus sent a distress call.']);
assert.equal(JSON.stringify(mission).includes('fraud'), false, 'the panel model cannot invent hidden plot text');
assert.equal(Object.hasOwn(mission, 'percentage'), false, 'V1 mission progress is objective-based, not fake percentage');

const crew = createV1CrewPanelModel(projection);
assert.equal(crew.people.length, 1);
assert.deepEqual(crew.player, projection.player);
assert.throws(
  () => createV1CrewPanelModel({ ...projection, player: undefined }),
  (error) => error?.code === 'DIRECTIVE_V1_PLAYER_PROJECTION_REQUIRED'
);
assert.deepEqual(crew.commandBearing, {
  balance: 1,
  capacity: 3,
  latestAwardReason: 'Protected the Hesperus passengers.',
  pendingEdge: {
    id: 'command-bearing-edge.1',
    status: 'reserved',
    reason: 'Create one credible favorable edge without erasing established costs.'
  },
  latestSpend: null
});
assert.equal(Object.hasOwn(crew.people[0], 'history'), false);

const ship = createV1ShipPanelModel(projection);
assert.equal(ship.operationalStatus.summary, projection.ship.operationalStatus.summary);
assert.deepEqual(ship.operationalStatus.materialLimitations, [
  { id: 'limit.warp', summary: 'Sustained maximum warp remains restricted.' }
]);
assert.equal(Object.hasOwn(ship, 'issues'), false);
assert.equal(Object.hasOwn(ship, 'damage'), false);
assert.equal(Object.hasOwn(ship, 'technicalDebt'), false);

const campaign = createV1CampaignPanelModel({
  campaign: {
    packages: [
      { packageId: ASHES_V1_PACKAGE_ID, title: 'Ashes of Peace', actions: { startNewCampaign: true } },
      { packageId: 'directive:campaign-package:serein-black-current', title: 'Black Current' }
    ]
  },
  campaignIndex: {
    campaigns: [
      { id: 'campaign.ashes', packageId: ASHES_V1_PACKAGE_ID, title: 'Ashes of Peace', active: true },
      { id: 'campaign.old', packageId: 'directive:campaign-package:serein-black-current', title: 'Black Current' }
    ]
  }
});
assert.deepEqual(campaign.packages.map((item) => [item.packageId, item.available]), [
  [ASHES_V1_PACKAGE_ID, true],
  ['directive:campaign-package:serein-black-current', false]
]);
assert.deepEqual(campaign.campaigns.map((item) => item.id), ['campaign.ashes']);

console.log('PASS V1 player-facing panel model');
