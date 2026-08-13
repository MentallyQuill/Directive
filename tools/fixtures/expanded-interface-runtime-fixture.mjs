import { createDirectiveExpandedShell } from '/src/ui/directive-expanded-shell.js';
import { DIRECTIVE_PRIMARY_ROUTES } from '/src/ui/directive-routes.mjs';
import { V1_CAMPAIGN_LIBRARY_TEASERS } from '/src/packages/bundled-package-registry.mjs';
import { renderCampaignPanel, resetCampaignPanelState } from '/src/ui/campaign-panel.js';
import { renderMissionPanel } from '/src/ui/mission-panel.js';
import { renderCrewPanel, resetCrewPanelState } from '/src/ui/crew-panel.js';
import { renderShipPanel } from '/src/ui/ship-panel.js';
import { renderSettingsPanel, resetSettingsPanelState } from '/src/ui/settings-panel.js';
import { createCharacterCreatorAssistDialog } from '/src/ui/character-creator-assist-dialog.js';
import { createGenerationRoleRegistry } from '/src/generation/generation-roles.mjs';

const bundledPackageData = await fetch('/packages/bundled/breckenridge/ashes-of-peace.campaign-package.json').then((response) => response.json());

const requestedRoute = new URL(globalThis.location.href).searchParams.get('route');
let activeRouteId = DIRECTIVE_PRIMARY_ROUTES.some((route) => route.id === requestedRoute) ? requestedRoute : 'campaign';
globalThis.__directiveFixtureActions = [];

const projection = {
  kind: 'directive.playerProjection.v1',
  player: {
    kind: 'directive.playerIdentityProjection.v1',
    playerId: 'player.sam-vickers',
    id: 'player.sam-vickers',
    name: 'Sam Vickers',
    rank: 'Commander',
    billet: 'Executive Officer',
    role: 'Principal mission commander and coordinator of shipboard operations.',
    categoryId: 'ships-company',
    service: { organization: 'starfleet', department: 'command', rankCode: 'commander', rankLabel: 'Commander' },
    species: { id: 'human', label: 'Human', summary: 'A Human Starfleet officer.' },
    appearance: 'Attentive and deliberate, with a practical command presence.',
    firstImpression: 'Measured until action is required.',
    dossier: { briefBiography: 'Sam Vickers was shaped by wartime service and the work of rebuilding afterward.' },
    portrait: { asset: { path: 'assets/packages/breckenridge/images/crew/mara-whitaker.card.webp', alt: 'Sam Vickers' } }
  },
  mission: {
    kind: 'directive.missionPlayerProjection.v1',
    missionId: 'mission.prelude-a-ship-underway',
    title: 'Prelude: A Ship Underway',
    summary: 'Complete the command handover, establish a working command rhythm, and answer the Hesperus distress call.',
    status: 'active',
    objectives: [
      { id: 'objective.handover', class: 'required', status: 'active', disposition: null, title: 'Complete the command handover', summary: 'Establish authority, expectations, and working boundaries with Captain Whitaker.', terminalText: null },
      { id: 'objective.readiness', class: 'required', status: 'available', disposition: null, title: 'Establish senior-staff delegation and readiness', summary: 'Set workable responsibilities and readiness procedures with the senior staff.', terminalText: null },
      { id: 'objective.hesperus', class: 'optional', status: 'terminal', disposition: 'completed', title: 'Aid the Hesperus', summary: 'Protect the transport and its passengers.', terminalText: 'The passengers are safe.' }
    ],
    progress: { requiredCompleted: 0, requiredTotal: 2, optionalCompleted: 1, optionalTotal: 1 },
    capabilities: [{ id: 'support.senior-staff', label: 'Senior staff', summary: 'Delegate specialized shipboard work.' }],
    facts: [{ id: 'fact.poker', summary: 'Lieutenant Kieran Vale invited the new XO to a junior-officer poker game after first watch.' }],
    clocks: [],
    outcomeDimensions: [],
    terminal: null
  },
  people: {
    kind: 'directive.peoplePlayerProjection.v1',
    missionId: 'mission.prelude-a-ship-underway',
    people: [
      { id: 'mara-whitaker', name: 'Mara Whitaker', billet: 'Commanding Officer', categoryId: 'ships-company', portrait: { kind: 'crew.portrait.formal', subjectId: 'mara-whitaker' }, service: { organization: 'starfleet', department: 'command', rankCode: 'captain', rankLabel: 'Captain' }, species: 'Human', publicRecord: { age: '47', birthplace: 'Kingston, Ontario, Earth', serviceBackground: 'Science operations, diplomacy, executive command', assignmentHistory: "Commanding officer since the Breckenridge's 2372 commission" }, profileSummary: 'The Breckenridge commanding officer is deliberate, principled, and politically sensitive.', relationshipPosture: 'Encouraging, but watchful', moments: [{ id: 'moment.handover', summary: 'She entrusted the incoming XO with the command handover.' }] },
      { id: 'kieran-vale', name: 'Kieran Vale', billet: 'Flight Control Officer', categoryId: 'ships-company', portrait: { kind: 'crew.portrait.formal', subjectId: 'kieran-vale' }, service: { organization: 'starfleet', department: 'flight', rankCode: 'lieutenant', rankLabel: 'Lieutenant' }, species: 'Human', publicRecord: { age: '29', birthplace: 'Tycho City, Luna', serviceBackground: 'Shuttle operations, tactical flight, high-stress navigation', assignmentHistory: 'Previous posting: U.S.S. Valorous' }, profileSummary: 'An exceptional flight-control officer known for high-stress navigation and visible ambition.', relationshipPosture: 'Friendly and testing boundaries', moments: [] },
      { id: 'priya-nayar', name: 'Priya Nayar', billet: 'Operations Officer', categoryId: 'ships-company', portrait: { kind: 'crew.portrait.formal', subjectId: 'priya-nayar' }, service: { organization: 'starfleet', department: 'operations', rankCode: 'lieutenant', rankLabel: 'Lieutenant' }, species: 'Human', publicRecord: { age: '36', birthplace: 'Starbase 12', serviceBackground: 'Logistics, communications, personnel coordination, operations management', assignmentHistory: 'Previous posting: U.S.S. Valorous' }, profileSummary: 'A resourceful operations officer with an informal communications network.', relationshipPosture: 'Curious', moments: [] },
      { id: 'hadrik-bronn', name: 'Hadrik Bronn', billet: 'Chief Tactical and Security Officer', categoryId: 'ships-company', portrait: { kind: 'crew.portrait.formal', subjectId: 'hadrik-bronn' }, service: { organization: 'starfleet', department: 'tactical', rankCode: 'lieutenant_commander', rankLabel: 'Lieutenant Commander' }, species: 'Tellarite', publicRecord: { age: 'Late fifties by human comparison', birthplace: 'Drekon Cooperative District, Tellar Prime', serviceBackground: 'Border security, convoy protection, shipboard defense, crisis containment', assignmentHistory: 'Original Breckenridge senior officer; acting XO during post-refit transit' }, profileSummary: 'A disciplined officer who served as acting executive officer before the transfer.', relationshipPosture: 'Professional but watchful', moments: [] },
      { id: 'rowan-saye', name: 'Rowan Saye', billet: 'Chief Science Officer', categoryId: 'ships-company', portrait: { kind: 'crew.portrait.formal', subjectId: 'rowan-saye' }, service: { organization: 'starfleet', department: 'science', rankCode: 'lieutenant_commander', rankLabel: 'Lieutenant Commander' }, species: 'Human', publicRecord: { age: '41', birthplace: 'Utopia Colony, Mars', serviceBackground: 'Astrophysics, subspace phenomena, scientific intelligence, anomaly analysis', assignmentHistory: 'Previous posting: U.S.S. Huxley' }, profileSummary: 'A cautious science officer who treats evidence custody as a command concern.', relationshipPosture: 'Professional and cautious', moments: [] }
    ]
  },
  ship: {
    kind: 'directive.shipPlayerProjection.v1',
    shipId: 'uss-breckenridge',
    name: 'U.S.S. Breckenridge',
    class: 'Intrepid-class',
    registry: 'NCC-74638',
    capabilitySummary: 'A compact, advanced long-range explorer returned to service after modernization.',
    operationalStatus: {
      status: 'serviceable',
      summary: 'Certified for service with upgraded systems still requiring integrated validation under sustained deployment conditions.',
      readiness: null,
      materialLimitations: [
        { id: 'limit.warp', summary: 'Sustained maximum warp remains restricted pending integrated validation.' },
        { id: 'limit.command-network', summary: 'Secure command handoffs require additional verification.' }
      ],
      readinessObjectiveLink: null
    },
    capabilities: [
      { id: 'cap.sensors', label: 'Long-range sensor processing', summary: 'Upgraded analysis for extended-range detection and survey work.' },
      { id: 'cap.power', label: 'Segmented emergency power', summary: 'Revised isolation paths protect critical systems during failures.' }
    ]
  },
  commandBearing: {
    kind: 'directive.commandBearingPlayerProjection.v1',
    balance: 1,
    capacity: 3,
    latestAwardReason: 'Protected the Hesperus passengers.',
    pendingEdge: null,
    latestSpend: null
  }
};

function fixtureView() {
  const activePackage = V1_CAMPAIGN_LIBRARY_TEASERS[0];
  return {
    activeTab: activeRouteId,
    activePackage,
    currentChatActivePackage: bundledPackageData,
    campaignState: { campaign: { id: 'campaign.ashes', title: 'Ashes of Peace' } },
    v1PlayerProjection: projection,
    campaign: { packages: V1_CAMPAIGN_LIBRARY_TEASERS },
    campaignIndex: {
      selectedCampaignId: 'campaign.ashes',
      campaigns: [{
        id: 'campaign.ashes', packageId: activePackage.packageId, title: 'Ashes of Peace', active: true,
        characterName: 'Sam Vickers - Ashes of Peace',
        playerName: 'Sam Vickers', playerRole: 'Executive Officer', setting: 'U.S.S. Breckenridge', chapter: 'Prelude: A Ship Underway',
        premise: 'Take command aboard a newly refitted starship entering a politically unstable frontier.',
        status: 'active', lastPlayedAt: '2026-08-10T14:30:00Z', canOpenChat: true, canSaveGame: true,
        activeTimeline: { saveId: 'save.current', chatBindingAvailable: true },
        checkpoints: [
          { id: 'save.current', name: 'Ready Room Handover', chapter: 'Prelude: A Ship Underway', createdAt: '2026-08-10T14:30:00Z', current: true, loadable: true },
          { id: 'save.arrival', name: 'Arrival Aboard', chapter: 'Prelude: A Ship Underway', createdAt: '2026-08-10T13:15:00Z', loadable: true }
        ]
      }]
    },
    activeSaveId: 'save.current',
    providerConfiguration: {
      profiles: [
        { id: 'profile.utility', label: 'Utility profile', model: 'utility-model' },
        ...Array.from({ length: 30 }, (_, index) => ({
          id: index === 29
            ? 'ea043183-0eee-43bd-aa1a-532c1b2f1ddb-very-long-connection-profile-identifier'
            : `profile.fixture.${index + 1}`,
          label: index === 29
            ? 'DeepSeek reasoner profile with an intentionally long descriptive connection name'
            : `Fixture profile ${index + 1}`,
          model: index === 29 ? 'deepseek/deepseek-reasoner-celia-v4.9a' : `fixture-model-${index + 1}`
        }))
      ],
      settings: {
        utility: {
          provider: 'profile', profileId: 'profile.utility', presetMode: 'isolated', instructMode: 'auto',
          samplerMode: 'profile', structuredOutputMode: 'auto', temperature: .1, topP: .95, maxTokens: 8192,
          certification: { status: 'not-run' }
        },
        reasoning: {
          provider: 'st', profileId: '', presetMode: 'isolated', instructMode: 'auto',
          samplerMode: 'directive', structuredOutputMode: 'auto', temperature: .4, topP: .95, maxTokens: 16384,
          certification: { status: 'not-run' }
        }
      },
      status: { utility: { ready: true, label: 'Utility profile' }, reasoning: { ready: true, label: 'Current SillyTavern model' } }
    },
    directivePreset: {
      status: { state: 'current', pill: 'Current', installedVersion: '1.0.0', bundledVersion: '1.0.0', canInstall: true },
      autoCheck: { enabled: true }
    },
    generationRouting: createGenerationRoleRegistry().list(),
    diagnostics: { transcriptAvailable: true }
  };
}

const actions = new Proxy({
  setActiveTab(routeId) { activeRouteId = routeId; mount(); },
  async refresh() { mount(); }
}, {
  get(target, key) {
    if (key in target) return target[key];
    return async (...args) => {
      globalThis.__directiveFixtureActions.push({ action: String(key), args });
      if (key === 'exportSupportDiagnostics') return { ok: true, fileName: 'directive-support.json', jsonText: '{"kind":"directive.supportDiagnostics"}' };
      return { ok: true };
    };
  }
});

function renderRoute(body, view) {
  if (activeRouteId === 'campaign') { resetCampaignPanelState(); renderCampaignPanel(body, view, actions); }
  else if (activeRouteId === 'mission') renderMissionPanel(body, view, actions);
  else if (activeRouteId === 'people') { resetCrewPanelState(); renderCrewPanel(body, view, actions); }
  else if (activeRouteId === 'ship') renderShipPanel(body, view, actions);
  else if (activeRouteId === 'settings') { resetSettingsPanelState(); renderSettingsPanel(body, view, actions); }
}

function mount() {
  document.querySelector('.directive-expanded-shell')?.remove();
  const shell = createDirectiveExpandedShell({
    id: 'directive-runtime-panel',
    routes: DIRECTIVE_PRIMARY_ROUTES,
    activeRouteId,
    onSelectRoute: (routeId) => { activeRouteId = routeId; mount(); }
  });
  shell.classList.add('directive-screen');
  const body = shell.querySelector('[data-directive-runtime-body="true"]');
  renderRoute(body, fixtureView());
  document.body.appendChild(shell);
}

globalThis.__directiveFixtureOpenAssist = () => createCharacterCreatorAssistDialog({
  sectionId: 'identity', sectionLabel: 'Identity', mode: 'refine', opener: document.querySelector('.directive-route-control.active')
});
globalThis.__directiveFixtureSetRoute = (routeId) => { activeRouteId = routeId; mount(); };

mount();
globalThis.__directiveFixtureReady = true;
