import { createDirectiveExpandedShell } from '/src/ui/directive-expanded-shell.js';
import { DIRECTIVE_PRIMARY_ROUTES } from '/src/ui/directive-routes.mjs';
import { buildDirectiveTrainingScenarioView } from '/src/guidance/directive-training-scenario.mjs';
import { renderCampaignPanel, resetCampaignPanelState } from '/src/ui/campaign-panel.js';
import { renderMissionPanel } from '/src/ui/mission-panel.js';
import { renderCrewPanel, resetCrewPanelState } from '/src/ui/crew-panel.js';
import { renderShipPanel } from '/src/ui/ship-panel.js';
import { renderSettingsPanel, resetSettingsPanelState } from '/src/ui/settings-panel.js';
import { buildPlayerFacingInformation } from '/src/ui/player-facing-information.mjs';

let activeRouteId = 'campaign';
localStorage.setItem('directive.guidance.tipsDisabled.v1', 'true');
globalThis.__directiveFixtureActions = [];

const BRECKENRIDGE_IMAGES = Object.freeze([
  { id: 'ship-uss-breckenridge', kind: 'ship.hero', subjectId: 'uss-breckenridge', alt: 'U.S.S. Breckenridge', focalPoint: { x: 0.5, y: 0.5 }, variants: {
    hero: 'assets/packages/breckenridge/images/ship/uss-breckenridge.hero.webp',
    card: 'assets/packages/breckenridge/images/ship/uss-breckenridge.card.webp',
    thumb: 'assets/packages/breckenridge/images/ship/uss-breckenridge.thumb.webp'
  } },
  ...['mara-whitaker', 'miriam-sato', 'hadrik-bronn', 'imani-cross', 'rowan-saye', 'priya-nayar', 'kieran-vale'].map((id) => ({
    id: `crew-${id}`, kind: 'crew.portrait', subjectId: id, alt: id.split('-').map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(' '), focalPoint: { x: 0.5, y: 0.22 }, variants: {
      detail: `assets/packages/breckenridge/images/crew/${id}.detail.webp`,
      card: `assets/packages/breckenridge/images/crew/${id}.card.webp`,
      thumb: `assets/packages/breckenridge/images/crew/${id}.thumb.webp`
    }
  }))
]);

const actions = new Proxy({
  setActiveTab(routeId) {
    activeRouteId = routeId;
    mount();
  },
  async refresh() {}
}, {
  get(target, key) {
    if (key in target) return target[key];
    return async (...args) => {
      globalThis.__directiveFixtureActions.push({ action: String(key), args });
      if (key === 'exportSupportDiagnostics') return { ok: true, fixture: true, fileName: 'directive-support-diagnostics.json', jsonText: '{"kind":"directive.supportDiagnostics"}' };
      return { ok: true, fixture: true };
    };
  }
});

function fixtureView() {
  const view = buildDirectiveTrainingScenarioView({ activeTab: activeRouteId });
  view.pendingDirectorTurn = null;
  view.pendingOutcomeReplacement = null;
  view.lastNarrationResult = null;
  view.openWorld = { ...view.openWorld, quests: [], opportunities: [] };
  if (view.activePackage?.ship) view.activePackage.ship.id = 'uss-breckenridge';
  if (view.currentChatActivePackage?.ship) view.currentChatActivePackage.ship.id = 'uss-breckenridge';
  view.activePackage.assets = { ...(view.activePackage.assets || {}), images: BRECKENRIDGE_IMAGES };
  view.currentChatActivePackage.assets = { ...(view.currentChatActivePackage.assets || {}), images: BRECKENRIDGE_IMAGES };
  view.campaignState.mission = {
    id: 'a-ship-underway',
    activeMissionId: 'a-ship-underway',
    title: 'A Ship Underway',
    category: 'main',
    status: 'active',
    description: 'Join the U.S.S. Breckenridge during its final ten days of transit, establish command rhythm, and respond to an ordinary civilian rescue without turning the event into a conspiracy.',
    currentObjective: 'Complete the command handover',
    objectiveDescription: 'Meet privately with Captain Whitaker, confirm the boundaries of executive authority, and establish how you will handle disagreement and delegated responsibility.',
    formalObjectives: [
      { id: 'transfer', text: 'Transfer aboard the U.S.S. Breckenridge', status: 'completed' },
      { id: 'handover', text: 'Complete the ready-room handover with Captain Whitaker', status: 'current' },
      { id: 'readiness', text: 'Review current readiness with the senior staff', status: 'inactive' }
    ],
    openAssignments: []
  };
  const projected = buildPlayerFacingInformation({ campaignState: view.campaignState, runtimeView: view });
  view.playerFacingInformation = {
    ...projected,
    quests: [
      {
        id: 'a-ship-underway', category: 'main', status: 'active', title: 'A Ship Underway',
        description: 'Join the Breckenridge as its permanent executive officer and establish a working command relationship before the ship reaches the Asterion Reach.',
        mobileDescription: 'Join the U.S.S. Breckenridge during its final ten days of transit, establish command rhythm, and respond to an ordinary civilian rescue without turning the event into a conspiracy.',
        objective: 'Complete the command handover',
        objectiveDescription: 'Meet privately with Captain Whitaker, confirm the boundaries of executive authority, and establish how you will handle disagreement and delegated responsibility.',
        tasks: [
          { id: 'transfer', text: 'Transfer aboard the U.S.S. Breckenridge', status: 'completed' },
          { id: 'handover', text: 'Complete the ready-room handover with Captain Whitaker', status: 'current' },
          { id: 'readiness', text: 'Review current readiness with the senior staff', status: 'inactive' }
        ],
        location: { id: 'ready-room', label: "Captain's Ready Room" }, people: [{ id: 'mara-whitaker', label: 'Captain Mara Whitaker' }], knownFacts: [], history: []
      },
      { id: 'long-repair', category: 'side', status: 'available', title: 'The Long Repair', description: 'Turn accumulated Breckenridge technical debt into an accountable stabilization plan with Helix Yard support.', objective: 'Breckenridge technical debt', location: { label: 'Engineering' }, people: [{ label: 'Imani Cross' }], tasks: [], knownFacts: [], history: [] },
      { id: 'quiet-channels', category: 'side', status: 'available', title: 'Quiet Channels', description: "Formalize Priya's informal communications network while deciding which favors and commitments may bind the ship.", objective: 'Informal communications network', location: { label: 'Operations' }, people: [{ label: 'Priya Nayar' }], tasks: [], knownFacts: [], history: [] }
    ],
    selectedQuestId: 'a-ship-underway',
    crew: [
      {
        id: 'mara-whitaker', name: 'Mara Whitaker', role: 'Commanding Officer / U.S.S. Breckenridge',
        category: "Ship's Company", affiliation: 'Command',
        service: { organization: 'starfleet', department: 'command', rankCode: 'captain', rankLabel: 'Captain' },
        involvement: { quest: 'A Ship Underway', objective: 'Complete the command handover', role: 'Whitaker is the command counterpart whose agreement completes the handover.' },
        knownFacts: ['Retains final legal command of the Breckenridge.', 'Requested a private handover before the senior staff readiness review.', "Can authorize changes to the ship's command structure and operating posture."],
        relationship: 'Professional. She is evaluating how you exercise authority.',
        history: [{ id: 'arrival', summary: 'Whitaker received the incoming executive officer and moved the command handover to the ready room.' }]
      },
      {
        id: 'hadrik-bronn', name: 'Hadrik Bronn', role: 'Chief Tactical and Security Officer', category: "Ship's Company", affiliation: 'Security',
        service: { organization: 'starfleet', department: 'security', rankCode: 'lieutenant_commander', rankLabel: 'Lieutenant Commander' },
        knownFacts: ['Served as acting executive officer before the player arrived.'], relationship: 'Professional but watchful.', history: []
      },
      {
        id: 'imani-cross', name: 'Imani Cross', role: 'Chief Engineer / U.S.S. Breckenridge', category: "Ship's Company", affiliation: 'Engineering',
        service: { organization: 'starfleet', department: 'engineering', rankCode: 'lieutenant_commander', rankLabel: 'Lieutenant Commander' },
        knownFacts: ['Owns the ship\'s integrated post-refit validation work.'], relationship: 'Professional and direct.', history: []
      },
      { id: 'miriam-sato', name: 'Miriam Sato', role: 'Chief Medical Officer', category: "Ship's Company", affiliation: 'Medical', service: { organization: 'starfleet', department: 'science', rankCode: 'lieutenant_commander', rankLabel: 'Lieutenant Commander' }, knownFacts: [], history: [] },
      { id: 'rowan-saye', name: 'Rowan Saye', role: 'Chief Science Officer', category: "Ship's Company", affiliation: 'Science', service: { organization: 'starfleet', department: 'science', rankCode: 'lieutenant_commander', rankLabel: 'Lieutenant Commander' }, knownFacts: [], history: [] },
      { id: 'priya-nayar', name: 'Priya Nayar', role: 'Operations Officer', category: "Ship's Company", affiliation: 'Operations', service: { organization: 'starfleet', department: 'operations', rankCode: 'lieutenant', rankLabel: 'Lieutenant' }, knownFacts: [], history: [] },
      { id: 'kieran-vale', name: 'Kieran Vale', role: 'Flight Control Officer', category: "Ship's Company", affiliation: 'Command', service: { organization: 'starfleet', department: 'command', rankCode: 'lieutenant', rankLabel: 'Lieutenant' }, knownFacts: [], history: [] }
    ],
    ship: {
      id: 'uss-breckenridge', name: 'U.S.S. Breckenridge', className: 'Intrepid-class', registry: 'NCC-74638', condition: 'Post-refit shakedown',
      position: 'Personnel transfer waypoint', course: 'Asterion Reach', flightStatus: 'Impulse / Station-keeping',
      issues: [
        { id: 'certificate', title: 'Command-network certificate mismatch', effect: 'Secure command handoffs require additional verification.', owner: 'Operations', status: 'Active' },
        { id: 'load', title: 'Combined refit load untested', effect: 'Simultaneous high-load operation may expose interactions missed by routine checks.', owner: 'Engineering', status: 'Active' },
        { id: 'validation', title: 'Integrated validation pending', effect: 'Upgraded systems remain unproven under sustained deployment conditions.', owner: 'Engineering', status: 'Active' }
      ],
      capabilities: [
        { id: 'sensors', label: 'Long-range sensor processing', description: 'Upgraded analysis for extended-range detection and survey work.', value: 'Available' },
        { id: 'power', label: 'Segmented emergency power', description: 'Revised isolation paths protect critical systems during failures.', value: 'Available' }
      ]
    }
  };
  const packageId = view.activePackage?.packageId || view.activePackage?.package?.id || 'package:ashes';
  view.campaignIndex = {
    selectedCampaignId: 'ashes-arden',
    campaigns: [
      {
        id: 'ashes-arden', title: 'Ashes of Peace', playerName: 'Commander Rhea Arden', playerRole: 'Executive Officer',
        setting: 'U.S.S. Breckenridge', chapter: 'A Ship Underway', premise: 'Take command aboard a newly refitted starship entering a politically unstable frontier.',
        status: 'active', active: true, lastPlayedAt: '2026-07-21T10:42:00Z', packageId,
        image: { kind: 'ship.hero', subjectId: 'uss-breckenridge' }, mediaPackage: view.activePackage,
        canOpenChat: true, canSaveGame: true, activeTimeline: { saveId: 'save-current', chatBindingAvailable: true },
        checkpoints: [
          { id: 'save-current', name: 'Ready Room Handover', chapter: 'A Ship Underway', createdAt: '2026-07-21T10:42:00Z', current: true, loadable: true },
          { id: 'save-arrival', name: 'Arrival Aboard', chapter: 'A Ship Underway', createdAt: '2026-07-21T09:18:00Z', loadable: true }
        ]
      },
      {
        id: 'ashes-vale', title: 'Ashes of Peace', playerName: 'Commander Tomas Vale', playerRole: 'Executive Officer',
        setting: 'U.S.S. Breckenridge', chapter: 'False Colors', premise: 'A completed Breckenridge command whose diplomatic crisis remains available to load and revisit.',
        status: 'complete', active: false, lastPlayedAt: '2026-06-12T18:20:00Z', packageId,
        image: { kind: 'ship.hero', subjectId: 'uss-breckenridge' }, mediaPackage: view.activePackage,
        canOpenChat: false, canSaveGame: false, activeTimeline: { saveId: 'save-conclusion', chatBindingAvailable: true }, checkpoints: []
      }
    ]
  };
  return view;
}

function renderRoute(body) {
  const view = fixtureView();
  body.dataset.directiveFixtureRoute = activeRouteId;
  if (activeRouteId === 'campaign') {
    resetCampaignPanelState();
    renderCampaignPanel(body, view, actions);
  } else if (activeRouteId === 'mission') {
    renderMissionPanel(body, view, actions);
  } else if (activeRouteId === 'people') {
    resetCrewPanelState();
    renderCrewPanel(body, view, actions);
  } else if (activeRouteId === 'ship') {
    renderShipPanel(body, view, actions);
  } else if (activeRouteId === 'settings') {
    resetSettingsPanelState();
    renderSettingsPanel(body, view, actions);
  }
}

function mount() {
  document.querySelector('.directive-screen')?.remove();
  const shell = createDirectiveExpandedShell({
    id: 'directive-runtime-panel',
    routes: DIRECTIVE_PRIMARY_ROUTES,
    activeRouteId,
    onSelectRoute: (routeId) => {
      activeRouteId = routeId;
      mount();
    }
  });
  shell.classList.add('directive-screen');
  const body = shell.querySelector('[data-directive-runtime-body="true"]');
  renderRoute(body);
  document.body.appendChild(shell);
}

mount();
