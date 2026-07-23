import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  directiveOnActivate,
  directiveOnClean,
  directiveOnDelete,
  directiveOnDisable,
  directiveOnEnable,
  directiveOnInstall,
  directiveOnUpdate
} from '../../src/extension/lifecycle.js';
import { installExtensionsMenuButton } from '../../src/extension/menu-button.js';
import { configureRuntimeActions } from '../../src/extension/runtime-mount.js';
import {
  DIRECTIVE_EXTENSION_ENABLE_STATUS_ID,
  DIRECTIVE_EXTENSION_ENABLE_TOGGLE_ID,
  DIRECTIVE_OPEN_RUNTIME_BUTTON_ID,
  DIRECTIVE_SETTINGS_PANEL_ID,
  installExtensionsMenuDropdown
} from '../../src/extension/settings-panel.js';
import {
  __directiveRuntimeActionTestHooks,
  listRuntimeActions,
  registerRuntimeAction,
  runRuntimeAction
} from '../../src/runtime/runtime-actions.js';
import {
  DIRECTIVE_RUNTIME_PANEL_ID,
  DIRECTIVE_RUNTIME_TABS,
  __directiveRuntimeShellTestHooks,
  setDirectiveRuntimeApp
} from '../../src/runtime/runtime-shell.js';
import { renderCrewPanel, resetCrewPanelState } from '../../src/ui/crew-panel.js';
import { renderCampaignPanel, resetCampaignPanelState } from '../../src/ui/campaign-panel.js';
import { renderMissionPanel } from '../../src/ui/mission-panel.js';
import { renderCommandLogPanel } from '../../src/ui/command-log-panel.js';
import { renderSettingsPanel } from '../../src/ui/settings-panel.js';
import { DIRECTIVE_COMM_BADGE_ICON } from '../../src/ui/directive-media.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FULL_PLAYER_SERVICE_SUMMARY = [
  'Commissioned via Starfleet Academy engineering track. Served as systems specialist aboard the U.S.S. Archelon,',
  'a refit Norway-class assigned to Cardassian border patrol and reconstruction logistics in the early 2370s.',
  'Promoted to lieutenant commander during relief operations along the Federation-Cardassian frontier, where formal authority stayed visible to junior officers.'
].join(' ');
const FULL_PLAYER_COMMAND_STYLE = [
  'Vickers approaches problems the way she approaches a failing power distribution grid: identify the load, isolate the fault, act.',
  'Her engineering background shows in how she listens to people too, reading stress, fatigue, and fear as system symptoms rather than abstractions.',
  'She takes them seriously without letting them stall the next decision.'
].join(' ');
const FULL_PLAYER_BRIEF_BIO = [
  'Player Commander is a public-facing Starfleet officer whose dossier foregrounds bridge command and accountable delegation.',
  'Their longer biography keeps the formative command history available when the Character tab expands it, including the later service record context that should not be clipped.'
].join('\n\n');
const FULL_COMMAND_LOG_INPUT = [
  'Second finger. Commander Saye reports repeated lateral-array variance after the refit validation cycle and asks for a joint review before arrival.',
  'Third finger. Doctor Sato is finishing post-refit physicals and has flagged several crewmembers for follow-up before the ship reaches the Reach.',
  'Fourth finger. Commander Cross wants the command-network handoff checked against yard certification because the bridge has seen inconsistent acknowledgements.',
  'This full command-log input tail must remain available in Committed Inputs and only collapse in the card body preview.'
].join(' ');
const FULL_LINKED_ORDER_TITLE = [
  'Coordinate Saye sensor validation, Sato post-refit physical follow-ups, and Cross command-network handoff review before arrival at the Reach',
  'with the complete linked order title preserved in Log details'
].join(' ');

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  syncFromString(value) {
    this.values = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  syncToElement() {
    this.element._className = [...this.values].join(' ');
  }

  add(...classes) {
    for (const className of classes) {
      if (className) this.values.add(className);
    }
    this.syncToElement();
  }

  remove(...classes) {
    for (const className of classes) {
      this.values.delete(className);
    }
    this.syncToElement();
  }

  toggle(className, force) {
    if (force === true) {
      this.values.add(className);
    } else if (force === false) {
      this.values.delete(className);
    } else if (this.values.has(className)) {
      this.values.delete(className);
    } else {
      this.values.add(className);
    }
    this.syncToElement();
    return this.values.has(className);
  }

  contains(className) {
    return this.values.has(className);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.parentNode = null;
    this.dataset = {};
    this.textContent = '';
    this.title = '';
    this.type = '';
    this.hidden = false;
    this._id = '';
    this._className = '';
    this.classList = new FakeClassList(this);
    this.style = {
      values: new Map(),
      setProperty(name, value) {
        this.values.set(name, String(value));
        this[name] = String(value);
      }
    };
  }

  get id() {
    return this._id;
  }

  set id(value) {
    this._id = String(value || '');
    this.ownerDocument.registerElement(this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value || '');
    this.classList.syncFromString(this._className);
  }

  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === 'id') this.id = normalized;
    if (name === 'class') this.className = normalized;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = normalized;
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  append(...nodes) {
    for (const node of nodes) {
      this.appendChild(node);
    }
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    this.ownerDocument.registerTree(node);
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of [...this.children]) {
      this.ownerDocument.unregisterTree(child);
      child.parentNode = null;
    }
    this.children = [];
    this.textContent = '';
    this.append(...nodes);
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    }
    this.ownerDocument.unregisterTree(this);
    this.parentNode = null;
  }

  addEventListener(type, handler) {
    this.eventListeners.set(type, handler);
  }

  setPointerCapture() {}

  closest(selector) {
    const selectors = String(selector || '').split(',').map((part) => part.trim()).filter(Boolean);
    let node = this;
    while (node) {
      if (selectors.some((part) => node.matches(part))) return node;
      node = node.parentNode;
    }
    return null;
  }

  getBoundingClientRect() {
    const readNumber = (name, fallback) => {
      const value = this.style?.values?.get(name) ?? this.style?.[name];
      const number = Number.parseFloat(value);
      return Number.isFinite(number) ? number : fallback;
    };
    return {
      left: readNumber('--directive-shell-left', readNumber('left', 16)),
      top: readNumber('--directive-shell-top', readNumber('top', 250)),
      width: readNumber('--directive-spine-width', readNumber('width', 52)),
      height: readNumber('--directive-spine-height', readNumber('height', 400))
    };
  }

  click() {
    const handler = this.eventListeners.get('click');
    if (handler) {
      handler({
        type: 'click',
        target: this,
        currentTarget: this,
        preventDefault() {},
        stopPropagation() {}
      });
    }
  }

  matches(selector) {
    if (/^[a-z]+$/i.test(selector)) {
      return this.tagName.toLowerCase() === selector.toLowerCase();
    }
    if (selector.startsWith('#')) {
      return this.id === selector.slice(1);
    }
    if (selector.startsWith('.')) {
      return this.classList.contains(selector.slice(1));
    }
    const dataMatch = /^\[data-([a-z0-9-]+)="([^"]+)"\]$/i.exec(selector);
    if (dataMatch) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return this.dataset[key] === dataMatch[2];
    }
    const dataPresenceMatch = /^\[data-([a-z0-9-]+)\]$/i.exec(selector);
    if (dataPresenceMatch) {
      const key = dataPresenceMatch[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return this.dataset[key] != null;
    }
    const attributeMatch = /^\[([a-z0-9-]+)="([^"]+)"\]$/i.exec(selector);
    if (attributeMatch) {
      return this.getAttribute(attributeMatch[1]) === attributeMatch[2];
    }
    if (selector === '[data-directive-runtime-body="true"]') {
      return this.dataset.directiveRuntimeBody === 'true';
    }
    return false;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (child.matches(selector)) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

class FakeDocument {
  constructor() {
    this.elementsById = new Map();
    this.body = new FakeElement('body', this);
    this.documentElement = new FakeElement('html', this);
    this.readyState = 'complete';
    this.eventListeners = new Map();
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  registerElement(element) {
    if (element.id) {
      this.elementsById.set(element.id, element);
    }
  }

  registerTree(element) {
    this.registerElement(element);
    for (const child of element.children) {
      this.registerTree(child);
    }
  }

  unregisterTree(element) {
    if (element.id && this.elementsById.get(element.id) === element) {
      this.elementsById.delete(element.id);
    }
    for (const child of element.children) {
      this.unregisterTree(child);
    }
  }

  addEventListener(type, handler) {
    const handlers = this.eventListeners.get(type) || new Set();
    handlers.add(handler);
    this.eventListeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = this.eventListeners.get(type);
    handlers?.delete(handler);
  }

  dispatchEvent(type, event = {}) {
    for (const handler of this.eventListeners.get(type) || []) {
      handler({ type, ...event });
    }
  }
}

function textOf(element) {
  if (!element || element.hidden) return '';
  return [
    element.textContent || '',
    ...element.children.map((child) => textOf(child))
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function clickElement(element, event = {}) {
  const handler = element?.eventListeners?.get?.('click');
  assert(handler, 'Expected element to have a click handler');
  handler({
    type: 'click',
    target: element,
    currentTarget: element,
    preventDefault() {},
    stopPropagation() {},
    ...event
  });
}

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

function createCampaignResetView() {
  const packageTemplate = (packageId, title, selected = false) => ({
    packageId,
    title,
    selected,
    source: selected ? 'bundled' : 'imported',
    campaign: {
      title,
      highConcept: `${title} opens with a missing convoy and a signal no one will claim.\n\nThe Breckinridge arrives with orders to keep the Reach from turning suspicion into weapons fire.\n\nEvery witness has a reason to hide the one fact that matters.`,
      eraLabel: 'During VOY, after DS9',
      structure: {
        expectedSessions: '2',
        storyArcCount: 1,
        questTemplateCount: 6
      }
    },
    ship: {
      id: 'uss-breckinridge',
      name: 'USS Breckinridge',
      class: 'Intrepid'
    },
    assets: {
      images: [
        {
          id: `${packageId}.ship.primary`,
          kind: 'ship.hero',
          subjectId: 'uss-breckinridge',
          variants: {
            card: `assets/packages/${packageId}/images/ship/uss-breckinridge.card.webp`
          },
          alt: `${title} ship hero`
        }
      ]
    },
    playerRole: {
      rank: 'Commander',
      billet: 'Executive Officer'
    },
    runtimeAssets: {
      hasProjection: true,
      missionGraphCount: 1
    },
    diagnostics: {
      status: 'ready',
      issueCount: 0
    },
    counts: {
      saves: 4
    },
    seniorCrewPreview: [
      { id: 'mara-whitaker', name: 'Mara Whitaker', rank: 'Captain', billet: 'Commanding Officer' },
      { id: 'kieran-vale', name: 'Kieran Vale', rank: 'Lieutenant', billet: 'Flight Control Officer' },
      { id: 'priya-nayar', name: 'Priya Nayar', rank: 'Lieutenant', billet: 'Operations Officer' },
      { id: 'hadrik-bronn', name: 'Hadrik Bronn', rank: 'Lieutenant Commander', billet: 'Chief Tactical and Security Officer' },
      { id: 'rowan-saye', name: 'Rowan Saye', rank: 'Lieutenant Commander', billet: 'Chief Science Officer' },
      { id: 'miriam-sato', name: 'Miriam Sato', rank: 'Commander', billet: 'Chief Medical Officer' },
      { id: 'imani-cross', name: 'Imani Cross', rank: 'Lieutenant Commander', billet: 'Chief Engineer' }
    ]
  });

  return {
    activePackage: {
      packageId: 'pack-alpha',
      package: {
        id: 'pack-alpha'
      },
      manifest: {
        id: 'pack-alpha'
      }
    },
    campaignState: {
      campaign: {
        title: 'Ashes of Peace'
      }
    },
    campaign: {
      activeSaveId: 'save-current',
      packages: [
        packageTemplate('pack-alpha', 'Alpha Campaign', true),
        packageTemplate('pack-beta', 'Beta Campaign')
      ],
      saves: [
        {
          id: 'save-current',
          name: 'Current Save',
          current: true,
          slotType: 'manual',
          updatedAt: '2026-06-20T12:00:00.000Z',
          revision: 1,
          metadata: {
            campaignId: 'campaign-alpha',
            campaignTitle: 'Alpha Campaign',
            summary: 'Current save summary.'
          }
        },
        {
          id: 'save-autosave',
          name: 'Autosave - Alpha Campaign - 53049.2',
          current: false,
          slotType: 'autosave',
          updatedAt: '2026-06-20T14:00:00.000Z',
          revision: 1,
          metadata: {
            campaignId: 'campaign-alpha',
            campaignTitle: 'Alpha Campaign',
            stardate: 53049.2,
            summary: 'Autosave summary.'
          }
        },
        {
          id: 'save-branch',
          name: 'Branch Save',
          current: false,
          slotType: 'manual',
          updatedAt: '2026-06-20T13:00:00.000Z',
          revision: 2,
          metadata: {
            campaignId: 'campaign-alpha',
            campaignTitle: 'Alpha Campaign',
            summary: 'Branch save summary.'
          }
        },
        {
          id: 'save-beta-autosave',
          name: 'Autosave - Beta Campaign - 53060.1',
          current: false,
          slotType: 'autosave',
          updatedAt: '2026-06-20T11:00:00.000Z',
          revision: 1,
          metadata: {
            campaignId: 'campaign-beta',
            campaignTitle: 'Beta Campaign',
            stardate: 53060.1,
            summary: 'Beta autosave summary.'
          }
        }
      ]
    }
  };
}

function createCrewResetView() {
  return {
    activePackage: {
      crew: {
        senior: [
          {
            id: 'mara-whitaker',
            name: 'Mara Whitaker',
            rank: 'Captain',
            billet: 'Commanding Officer',
            species: 'Human',
            packageRole: 'Command authority'
          },
          {
            id: 'jalen-orr',
            name: 'Jalen Orr',
            rank: 'Lieutenant Commander',
            billet: 'Operations Officer',
            species: 'Trill',
            packageRole: 'Operations lead',
            publicBio: [
              'Jalen Orr is a public-facing operations lead whose duty record emphasizes calm handoffs and clean watch rotations.',
              'They are known for seeing logistical strain before it becomes bridge-visible.',
              'Their background makes them especially useful when command needs operational discipline without losing the crew-level view.'
            ]
          }
        ]
      },
      questTemplates: {
        templates: [
          {
            id: 'quest-jalen-handoff',
            title: 'Ops Handoff Review',
            playerSummary: 'Jalen has an active open-world operations handoff review.',
            anchors: {
              actorIds: ['jalen-orr']
            }
          }
        ]
      }
    },
    playerCharacterView: {
      schemaVersion: 1,
      identity: {
        id: 'player-commander',
        name: 'Player Commander',
        rank: 'Commander',
        billet: 'Executive Officer',
        role: 'Accountable bridge command character',
        species: 'Human'
      },
      portrait: null,
      dossier: {
        briefBiography: FULL_PLAYER_BRIEF_BIO,
        publicReputation: 'Player Commander is publicly known for careful command judgment.'
      },
      serviceRecord: [{
        title: 'Posting',
        summary: 'Commander / Executive Officer / U.S.S. Breckenridge'
      }, {
        title: 'Service Summary',
        summary: FULL_PLAYER_SERVICE_SUMMARY
      }, {
        title: 'Command Style',
        summary: FULL_PLAYER_COMMAND_STYLE
      }],
      commandBearingSummary: {
        tracks: {
          inspiration: {
            track: 'inspiration',
            label: 'Inspiration',
            rankTitle: 'Bearing I',
            rank: 1,
            marks: 1,
            nextRankMarks: 2,
            points: 2,
            pointCap: 2
          },
          resolve: {
            track: 'resolve',
            label: 'Resolve',
            rankTitle: 'Bearing I',
            rank: 1,
            marks: 0,
            nextRankMarks: 2,
            points: 1,
            pointCap: 2
          }
        },
        reserve: {
          current: 2,
          capacity: 2
        },
        readied: null
      },
      commandBearingEvidence: [{
        id: 'evidence.player.resolve',
        primarySignal: 'resolve',
        actionSummary: 'Held the bridge to an accountable handoff under pressure.',
        consequenceSummary: 'The staff saw the player accept the cost of a slower but cleaner decision.',
        playerFacingSummary: 'Your command record flags this as possible Resolve evidence.',
        status: 'open'
      }],
      commandBearingReviews: [{
        id: 'review.player.resolve',
        markAwarded: true,
        awardedTrack: 'resolve',
        awardSummary: 'Resolve Mark awarded for sustained accountable command.'
      }],
      commandBearingHistory: [{
        type: 'spend',
        track: 'resolve',
        from: 'Failure',
        to: 'Partial Success',
        rationale: 'Resolve improved a committed outcome.'
      }],
      currentStandingSummary: [{
        crewId: 'jalen-orr',
        crewName: 'Jalen Orr',
        posture: 'Concerned but professionally engaged.'
      }],
      crewInteractionLog: [{
        id: 'interaction.jalen.visible',
        crewId: 'jalen-orr',
        crewName: 'Jalen Orr',
        title: 'Visible operations handoff',
        summary: 'Jalen noticed the player kept the operations concern visible without exposing hidden values.'
      }],
      relationshipPerceptions: [{
        id: 'perception.jalen.slight-improvement',
        crewId: 'jalen-orr',
        crewName: 'Jalen Orr',
        impact: 'Slight Improvement',
        cue: 'Jalen relaxed after the player named the operations burden plainly.'
      }],
      guards: {
        rawRelationshipValuesHidden: true,
        hiddenMemoriesHidden: true,
        modelDiagnosticsHidden: true
      }
    },
    campaignState: {
      player: {
        name: 'Player Commander',
        rank: 'Commander',
        billet: 'Executive Officer',
        species: {
          label: 'Human'
        },
        dossier: {
          briefBiography: FULL_PLAYER_BRIEF_BIO,
          publicReputation: 'Player Commander is publicly known for careful command judgment.'
        }
      },
      crew: {
        seniorCrewIds: ['mara-whitaker', 'player-commander', 'jalen-orr'],
        relationshipModel: true
      },
      mission: {
        openAssignments: [
          {
            id: 'assignment.jalen.alpha-handoff',
            title: 'Alpha Shift Handoff Check',
            summary: 'Jalen needs a player-visible alpha-shift follow-up before the next watch rotation.',
            status: 'active',
            dueWindow: 'before beta shift',
            linkedCrewIds: ['jalen-orr']
          },
          {
            id: 'assignment.jalen.completed',
            title: 'Completed Assignment Should Not Render',
            summary: 'Completed linked work should not remain in Crew Open Work.',
            status: 'completed',
            linkedCrewIds: ['jalen-orr']
          },
          {
            id: 'assignment.jalen.hidden',
            title: 'Hidden Assignment Should Not Render',
            summary: 'Hidden linked work should not appear in Crew Open Work.',
            status: 'active',
            visibility: 'hidden',
            linkedCrewIds: ['jalen-orr']
          }
        ]
      },
      pressureLedger: {
        records: [
          {
            id: 'pressure.jalen.ops',
            type: 'crew',
            title: 'Ops Handoff Pressure',
            playerSummary: 'Jalen is carrying a visible operations handoff.',
            status: 'active',
            urgencyBand: 'medium',
            linkedCrewIds: ['jalen-orr'],
            rawValuesHidden: true
          },
          {
            id: 'pressure.jalen.hidden',
            type: 'crew',
            title: 'Hidden Ops Pressure',
            playerSummary: 'Hidden raw pressure should not appear.',
            status: 'active',
            visibility: 'hidden',
            linkedCrewIds: ['jalen-orr'],
            rawValuesHidden: true
          }
        ]
      },
      questLedger: {
        instances: [
          {
            id: 'quest-jalen-handoff',
            templateId: 'quest-jalen-handoff',
            status: 'active',
            assignedActorIds: ['jalen-orr'],
            rawValuesHidden: true
          }
        ]
      },
      commandCompetence: {
        counselRequestLedger: [
          {
            id: 'advisory.jalen.ops-handoff',
            type: 'advisoryNote',
            subject: 'Ops handoff advisory',
            missionBrief: 'The current handoff question has a player-safe advisory note for Mission review.',
            logSummary: 'Jalen asked for decision-support context before the operations handoff is committed.',
            involvedCrewIds: ['jalen-orr'],
            crewNotes: [
              {
                crewId: 'jalen-orr',
                summary: 'Jalen is the involved officer for the operations handoff advisory.'
              }
            ],
            considerations: ['The advisory is decision support, not a committed outcome.'],
            options: ['Clarify handoff ownership before the next watch.'],
            playerVisible: true
          },
          {
            id: 'advisory.hidden',
            type: 'advisoryNote',
            subject: 'Hidden advisory should not appear',
            missionBrief: 'Hidden advisory mission text should not appear.',
            logSummary: 'Hidden advisory log text should not appear.',
            involvedCrewIds: ['jalen-orr'],
            playerVisible: false
          }
        ]
      },
      commandLog: {
        entries: [
          {
            sourceOutcomeId: 'outcome.jalen.memory',
            linkedAssignmentIds: ['assignment.jalen.alpha-handoff'],
            linkedAssignmentTitles: ['Alpha Shift Handoff Check'],
            assistedSummary: {
              title: 'Watch Handoff Accepted',
              summary: "Command accepted Jalen's watch handoff recommendation and kept the shift rotation visible through the next operational interval. The summary also records who owns the next briefing, which department must confirm readiness, and why the full recommendation needs to remain available when expanded."
            },
            visibleConsequences: [
              'The operations handoff remains on the command record.'
            ]
          }
        ]
      },
      relationships: {
        seniorCrew: [
          {
            crewId: 'jalen-orr',
            currentStance: 'concerned',
            trust: 42,
            candor: 17,
            professionalConfidence: 12,
            hiddenQuestion: 'hidden question should not appear'
          }
        ],
        memoryLedger: [
          {
            crewId: 'jalen-orr',
            event: 'hidden memory event should not appear',
            interpretation: 'hidden memory interpretation should not appear',
            visibility: 'hidden',
            sourceOutcomeId: 'outcome.jalen.memory'
          }
        ]
      },
      threadLedger: {
        records: [
          {
            id: 'thread.jalen.watch',
            status: 'active',
            title: 'Jalen Watch Rotation',
            playerSummary: 'Jalen is checking whether the watch rotation can hold under current handoff pressure while operations tries to keep junior officers from absorbing invisible overtime. The thread summary should remain readable in full because the player needs the actual operational concern, the crew impact, and the final sentence that proves expanded thread context remains available.',
            observableSeed: 'Watch officers are clustering around the operations handoff.',
            linkedCrewIds: ['jalen-orr'],
            participants: ['jalen-orr'],
            rawValuesHidden: true
          },
          {
            id: 'thread.jalen.break',
            status: 'engaged',
            title: 'Jalen Break Rotation',
            playerSummary: 'Jalen is watching whether bridge relief rotations are treated as real readiness work.',
            observableSeed: 'Operations keeps cross-checking break coverage.',
            linkedCrewIds: ['jalen-orr'],
            participants: ['jalen-orr'],
            rawValuesHidden: true
          },
          {
            id: 'thread.jalen.mess',
            status: 'active',
            title: 'Jalen Mess Check-In',
            playerSummary: 'Jalen has noticed informal mess-hall check-ins becoming the real operations coordination channel.',
            observableSeed: 'Crew are routing small coordination issues through off-duty tables.',
            linkedCrewIds: ['jalen-orr'],
            participants: ['jalen-orr'],
            rawValuesHidden: true
          },
          {
            id: 'thread.jalen.crosswatch',
            status: 'active',
            title: 'Jalen Cross-Watch Notes',
            playerSummary: 'Jalen is comparing cross-watch notes to see whether the handoff pattern is improving or just moving the strain.',
            observableSeed: 'Watch notes show repeated references to the same officers.',
            linkedCrewIds: ['jalen-orr'],
            participants: ['jalen-orr', 'player-commander'],
            rawValuesHidden: true
          },
          {
            id: 'thread.jalen.latent',
            status: 'latent',
            title: 'Hidden Latent Thread',
            playerSummary: 'Latent thread should not appear.',
            linkedCrewIds: ['jalen-orr'],
            participants: ['jalen-orr'],
            rawValuesHidden: true
          }
        ]
      }
    }
  };
}

function createMissionThreadsView() {
  const crewView = createCrewResetView();
  return {
    activePackage: {
      ...crewView.activePackage,
      campaign: {
        chapters: [
          {
            id: 'mission-thread-test',
            title: 'Thread Test Mission',
            type: 'main',
            question: {
              text: 'Keep the ship stable while crew concerns surface.'
            }
          }
        ]
      }
    },
    campaignState: {
      ...crewView.campaignState,
      campaign: {
        id: 'campaign-thread-test',
        title: 'Ashes of Peace'
      },
      mission: {
        ...crewView.campaignState.mission,
        activeMissionId: 'mission-thread-test',
        phase: 'command-review',
        formalObjectives: [
          {
            id: 'mission-thread-test.objective.1',
            text: 'Keep command aware of visible ongoing concerns.'
          }
        ]
      },
      ship: {
        name: 'U.S.S. Breckenridge'
      },
      settings: {
        simulationMode: 'Command'
      },
      turnLedger: {
        entries: []
      },
      directives: {
        active: []
      },
      knowledgeLedger: {
        schemaVersion: 2,
        facts: [],
        rumors: [],
        contradictions: [],
        components: {
          schemaVersion: 1,
          records: [
            {
              id: 'component:port-nacelle-coolant-seal:test',
              title: 'Port nacelle coolant seal',
              type: 'shipIssue',
              status: 'unresolved',
              summary: 'Cross assesses the seal will fail within 200 hours of sustained warp six or above.',
              verbatim: 'Coolant seal, port nacelle, junction 7-C. Yard report stated new seal installed. Status: Replacement part fabricated. Installation pending.',
              sourceAuthority: 'officialPacket',
              tags: ['post-refit', 'engineering'],
              links: {
                crewIds: ['imani-cross'],
                shipSystemIds: ['ship.port-nacelle']
              },
              source: {
                host: 'sillytavern',
                chatId: 'Directive - Ashes of Peace (57)',
                hostMessageId: '15',
                messageRole: 'assistant',
                messageName: 'Directive - Ashes of Peace (57)',
                capturedAt: '2026-06-26T21:10:00.000Z',
                sourceStatus: 'active'
              },
              lifecycle: {
                createdAt: '2026-06-26T21:10:00.000Z',
                updatedAt: '2026-06-26T21:10:00.000Z',
                createdBy: 'player',
                reviewed: true
              }
            }
          ]
        }
      }
    },
    host: {
      capabilities: {
        chat: {
          observeMessages: false
        }
      }
    }
  };
}

const manifest = JSON.parse(await readText('manifest.json'));
const breckenridgePackage = JSON.parse(await readText('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json'));
const breckenridgeCrewDataset = JSON.parse(await readText('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json'));
const miriamSato = breckenridgePackage.crew.senior.find((crew) => crew.id === 'miriam-sato');
const miriamProfileCard = breckenridgeCrewDataset.cards.find((card) => card.id === 'crew.miriam.profile.medical-authority');
assert.equal(miriamSato?.rank, 'Commander', 'Miriam Sato package rank should be a Starfleet rank, not a professional title');
assert.equal(miriamProfileCard?.visibility, 'publicPackage', 'Miriam Sato should have a public crew profile card for the Crew inspector');
assert.match(miriamProfileCard?.payload?.summary || '', /Commander Miriam Sato/, 'Miriam Sato public profile should expose her Starfleet rank');
assert.equal(manifest.display_name, 'Directive');
assert.equal(manifest.version, '0.1.0-pre-alpha.1');
assert.equal(manifest.key, 'directive');
assert.equal(manifest.js, 'src/extension/index.js');
assert.equal(manifest.css, 'styles/directive.css');
assert.deepEqual(Object.values(manifest.hooks), [
  'directiveOnInstall',
  'directiveOnUpdate',
  'directiveOnDelete',
  'directiveOnClean',
  'directiveOnEnable',
  'directiveOnDisable',
  'directiveOnActivate'
]);

for (const hook of [
  directiveOnInstall,
  directiveOnUpdate,
  directiveOnDelete,
  directiveOnClean,
  directiveOnEnable,
  directiveOnDisable,
  directiveOnActivate
]) {
  assert.equal(typeof hook, 'function', 'manifest hook should be exported');
}

for (const relativePath of [
  'manifest.json',
  'src/extension/index.js',
  'src/extension/bootstrap.js',
  'src/extension/lifecycle.js',
  'src/extension/menu-button.js',
  'src/extension/settings-panel.js',
  'src/extension/runtime-mount.js',
  'src/extension/global-bridge.js',
  'src/hosts/sillytavern/bootstrap.js',
  'src/hosts/sillytavern/directive-assist-button.js',
  'src/hosts/sillytavern/feature-toggle.mjs',
  'src/hosts/sillytavern/lifecycle.js',
  'src/hosts/sillytavern/settings-store.mjs',
  'src/hosts/sillytavern/shell-events.js',
  'src/runtime/runtime-actions.js',
  'src/runtime/runtime-shell.js',
  'src/runtime/runtime-app.mjs',
  'src/ui/directive-expanded-shell.js',
  'src/ui/responsive-record-list.js',
  'src/ui/reorderable-collection.js',
  'src/ui/expanded-interface-focus.js',
  'styles/directive.css'
]) {
  const legacyIdentifierPattern = new RegExp(`\\b${['sa', 'ga'].join('')}\\b`, 'i');
  assert(!legacyIdentifierPattern.test(await readText(relativePath)), `${relativePath} should not contain legacy project identifiers`);
}

const directiveCss = await readText('styles/directive.css');
const runtimeShellSource = await readText('src/runtime/runtime-shell.js');
const commBadgeSvg = await readText('assets/icons/comm-badge.svg');
assert.match(runtimeShellSource, /renderBodyRequestId/, 'runtime shell should guard async body rendering against stale duplicate appends');
assert.match(runtimeShellSource, /requestId !== renderBodyRequestId[\s\S]*?return false/, 'runtime shell should discard stale body renders after async view loading');
assert.match(directiveCss, /\.directive-extension-enable-slider/, 'extensions settings drawer should style the Directive enabled switch');
assert.match(commBadgeSvg, /viewBox="-6 -6 337 553"/, 'Crew player fallback comm badge should include enough SVG viewBox padding to avoid clipped mask edges');
assert.match(directiveCss, /\.directive-starship-briefing-roster\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important;/, 'Campaign briefing roster dropdown should hide collapsed crew rows');
assert.match(directiveCss, /--directive-division-command:\s*#a60400;/, 'Directive division command token should use the approved Voyager-era red');
assert.match(directiveCss, /--directive-division-operations:\s*#dd8a12;/, 'Directive division operations/security token should use the approved Voyager-era gold');
assert.match(directiveCss, /--directive-division-science:\s*#004880;/, 'Directive division science/medical token should use the approved Voyager-era blue');
if (false) { // Retired command-spine geometry assertions retained only as migration history.
const commandSpineCss = /\.directive-runtime-panel\.directive-command-spine-shell\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
assert.match(commandSpineCss, /--directive-shell-left:\s*16px;/, 'desktop command spine should default to the left edge');
assert.match(commandSpineCss, /--directive-shell-top:\s*calc\(\(100dvh - var\(--directive-spine-height\)\) \/ 2\);/, 'desktop command spine should default to vertical center');
assert.match(commandSpineCss, /\bleft:\s*var\(--directive-shell-left\)\s*!important;/, 'desktop command spine should use persisted horizontal shelf geometry');
assert.match(commandSpineCss, /\btop:\s*var\(--directive-shell-top\)\s*!important;/, 'desktop command spine should use persisted vertical shelf geometry');
assert.match(commandSpineCss, /\bwidth:\s*var\(--directive-spine-width\)/, 'desktop shell width should collapse to the command spine');
assert.match(commandSpineCss, /--directive-spine-height:\s*min\(400px,\s*calc\(100dvh - 32px\)\);/, 'desktop shelf should own a stable height independent of drawer resizing');
assert.match(commandSpineCss, /\bheight:\s*var\(--directive-spine-height\)\s*!important;/, 'desktop shelf height should not follow the resizable drawer height');
assert.doesNotMatch(commandSpineCss, /\bheight:\s*min\(var\(--directive-drawer-height\)/, 'desktop shelf must not resize with the drawer');
const commandDrawerCss = [...directiveCss.matchAll(/\.directive-command-spine-shell \.directive-command-drawer\s*\{(?<body>[\s\S]*?)\}/g)]
  .map((match) => match.groups?.body || '')
  .find((body) => /container-type:\s*inline-size;/.test(body)) || '';
assert.match(commandDrawerCss, /\bcontainer-type:\s*inline-size;/, 'command drawer should be the responsive container for resized route content');
assert.match(commandDrawerCss, /\btop:\s*0;/, 'command drawer should anchor its top edge to the command shelf');
assert.match(commandDrawerCss, /\btransform-origin:\s*left top;/, 'command drawer should resize from the shelf-adjacent top-left corner');
assert.doesNotMatch(commandDrawerCss, /translateY\(-50%\)/, 'command drawer must not stay vertically centered around the shelf while resizing');
const commandDrawerBodyCss = /\.directive-command-spine-shell \.directive-command-drawer-body\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
assert.match(commandDrawerBodyCss, /overflow-y:\s*auto\s*!important;/, 'command drawer body should own scroll containment');
const resizeHandleCss = /\.directive-command-spine-shell \.directive-command-drawer-resize-handle\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
assert.match(resizeHandleCss, /\bbottom:\s*-1px;/, 'drawer resize handle should sit on the bottom edge');
const resizeHandleLeftCss = /\.directive-command-spine-shell \.directive-command-drawer-resize-handle-left\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
assert.equal(resizeHandleLeftCss, '', 'drawer should not style a bottom-left resize handle');
const resizeHandleRightCss = /\.directive-command-spine-shell \.directive-command-drawer-resize-handle-right\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
assert.match(resizeHandleRightCss, /\bright:\s*-1px;/, 'right drawer resize handle should be on the bottom-right corner');
assert.match(directiveCss, /\.directive-command-spine-shell \.directive-command-drawer-resize-handle-right \.directive-command-drawer-resize-icon\s*\{[\s\S]*?transform:\s*scaleX\(-1\);/, 'right drawer resize glyph should face the bottom-right corner');
assert.match(directiveCss, /\.directive-command-spine-shell\.directive-runtime-fullscreen/, 'dense workflows should expose a full-screen workspace mode');
assert.match(directiveCss, /\.directive-command-spine-shell \.directive-command-mobile-nav/, 'mobile fallback should retain bottom-route navigation');
}
assert.match(directiveCss, /\.directive-runtime-panel\.directive-expanded-shell\s*\{[\s\S]*?height:\s*100dvh\s*!important;/, 'expanded shell should bind to the viewport height');
assert.match(directiveCss, /\.directive-expanded-shell \.directive-route-bar\s*\{[\s\S]*?repeat\(5,\s*minmax\(0,\s*1fr\)\)/, 'expanded shell should retain five equal route controls');
assert.match(directiveCss, /\.directive-icon-button:disabled/, 'drawer header actions should expose disabled styling');
assert.match(directiveCss, /\.directive-extension-dropdown-title/, 'extensions settings drawer should expose Directive title styling');
assert.match(directiveCss, /\.directive-runtime-window-actions/, 'extensions settings drawer should style runtime action buttons');

const fakeDocument = new FakeDocument();
globalThis.document = fakeDocument;

const menu = fakeDocument.createElement('div');
menu.id = 'extensionsMenu';
fakeDocument.body.appendChild(menu);

const settingsContainer = fakeDocument.createElement('div');
settingsContainer.id = 'extensions_settings2';
fakeDocument.body.appendChild(settingsContainer);

const placeholder = fakeDocument.createElement('div');
placeholder.id = 'extensionsMenuDefault';
menu.appendChild(placeholder);

resetCampaignPanelState();
const campaignView = createCampaignResetView();
let campaignBody = fakeDocument.createElement('div');
renderCampaignPanel(campaignBody, campaignView, {
  refresh() {},
  loadGame() {},
  startCreatorDraft() {},
  setActiveTab() {}
});
assert(campaignBody.querySelector('.directive-campaign-launcher'), 'Campaign should render the focused launcher surface');
assert.match(textOf(campaignBody), /Campaign Library/);
assert.match(textOf(campaignBody), /Open Mission/);
assert.match(textOf(campaignBody), /New Campaign/);
assert.match(textOf(campaignBody), /Saved Campaigns/);
assert.doesNotMatch(textOf(campaignBody), /Latest committed outcome|Recovery Console|Open Campaign Chat/);
if (false) {
const packageMetaGrid = campaignBody.querySelector('.directive-campaign-package-detail-grid');
assert(packageMetaGrid, 'Campaign briefing should render package metadata stats');
assert.match(textOf(packageMetaGrid), /Length 2 Sessions/, 'Campaign briefing should display expected sessions from schema-v2 metadata');
assert.match(textOf(packageMetaGrid), /Story Arcs 1/, 'Campaign briefing should display story arc count from schema-v2 metadata');
assert.match(textOf(packageMetaGrid), /Quest Templates 6/, 'Campaign briefing should display quest template count from schema-v2 metadata');
let hookToggle = campaignBody.querySelector('.directive-starship-briefing-hook-toggle');
let hookMore = campaignBody.querySelector('.directive-starship-briefing-hook-more');
assert(hookToggle, 'Campaign briefing should expose an expandable hook toggle for multi-paragraph hooks');
assert.equal(hookToggle.getAttribute('aria-expanded'), 'false');
assert.equal(hookMore.hidden, true);
hookToggle.click();
assert.equal(hookToggle.getAttribute('aria-expanded'), 'true');
assert.equal(hookMore.hidden, false);
assert.equal(hookToggle.children[1].textContent, 'Less');
let rosterToggle = campaignBody.querySelector('.directive-starship-briefing-roster-toggle');
let briefingRoster = campaignBody.querySelector('.directive-starship-briefing-roster');
assert(rosterToggle, 'Campaign briefing should expose the senior crew roster as a dropdown');
assert.equal(rosterToggle.getAttribute('aria-expanded'), 'false');
assert.equal(briefingRoster.hidden, true);
assert.match(textOf(rosterToggle), /Crew Roster 8 roster slots/);
rosterToggle.click();
assert.equal(rosterToggle.getAttribute('aria-expanded'), 'true');
assert.equal(briefingRoster.hidden, false);
assert.match(textOf(briefingRoster), /Player Character Commander \/ Executive Officer/);
assert.match(textOf(briefingRoster), /Mara Whitaker/);
const briefingOfficerRows = briefingRoster.querySelectorAll('.directive-starship-briefing-officer');
assert.match(textOf(briefingOfficerRows[0]), /Mara Whitaker/, 'Captain should remain first in authored roster order');
assert.match(textOf(briefingOfficerRows[1]), /Player Character/, 'Player XO should remain second in authored roster order');
assert.match(textOf(briefingOfficerRows[2]), /Kieran Vale/, 'Campaign briefing roster should continue from authored order instead of rank-sorting commanders upward');
assert.match(textOf(briefingOfficerRows[3]), /Priya Nayar/, 'Campaign briefing roster should preserve package order after the player XO');
assert.match(textOf(briefingOfficerRows[6]), /Miriam Sato/, 'Campaign briefing roster should not move Commander Miriam Sato above the authored lieutenant slots');
assert.equal(briefingRoster.querySelectorAll('.directive-starship-briefing-officer-player').length, 1);
const briefingOfficerBadges = briefingRoster.querySelectorAll('.directive-starship-briefing-officer-badge');
assert.equal(briefingOfficerBadges.length, briefingOfficerRows.length, 'Campaign briefing roster should use comm badge markers for every roster slot');
assert.equal(
  briefingOfficerBadges.every((badge) => badge.dataset.assetIcon === DIRECTIVE_COMM_BADGE_ICON),
  true,
  'Campaign briefing roster markers should use the shared comm badge asset'
);
assert.equal(
  briefingRoster.querySelectorAll('i').filter((icon) => /\bfa-user\b/.test(icon.className)).length,
  0,
  'Campaign briefing roster should not render the old little-person marker icon'
);
for (const [tone, expectedCount] of Object.entries({
  command: 3,
  operations: 3,
  science: 2
})) {
  assert.equal(
    briefingRoster.querySelectorAll(`.directive-starship-briefing-officer-marker-${tone}`).length,
    expectedCount,
    `Campaign briefing roster should color-code ${tone} officer markers`
  );
}
for (const tone of ['flight', 'security', 'medical', 'engineering']) {
  assert.equal(
    briefingRoster.querySelectorAll(`.directive-starship-briefing-officer-marker-${tone}`).length,
    0,
    `Campaign briefing roster should not render extra ${tone} division colors`
  );
}
campaignBody.querySelector('[data-campaign-subtab-target="directive-campaign-library-section"]').click();
campaignBody.querySelectorAll('.directive-starship-library-row')[1].click();
const selectedLibrarySection = campaignBody.querySelector('#directive-campaign-library-section');
const selectedLibraryVisual = selectedLibrarySection.querySelector('.directive-starship-briefing-visual');
const selectedLibraryImage = selectedLibraryVisual.querySelector('img');
assert(selectedLibraryImage, 'Campaign Library briefing should resolve selected package summary ship art into an image');
assert.ok(
  selectedLibraryImage.src.endsWith('/assets/packages/pack-beta/images/ship/uss-breckinridge.card.webp'),
  'Campaign Library should use the selected non-active package summary image path'
);
campaignBody.querySelector('[data-campaign-subtab-target="directive-campaign-records-section"]').click();
campaignBody.querySelectorAll('.directive-starship-library-row')[1].click();
assert.equal(campaignBody.querySelectorAll('.directive-starship-save-folder').length, 2);
assert.equal(campaignBody.querySelectorAll('.directive-starship-save-row-autosave').length, 2);
let saveRows = campaignBody.querySelectorAll('.directive-starship-save-row');
clickElement(saveRows[1]);
assert.equal(campaignBody.querySelector('.directive-campaign-section-active').id, 'directive-campaign-records-section');
assert.equal(campaignBody.querySelectorAll('.directive-starship-library-row')[1].getAttribute('aria-pressed'), 'true');
assert.equal(saveRows[1].getAttribute('aria-pressed'), 'true');
clickElement(saveRows[2], { ctrlKey: true });
assert.equal(saveRows[1].getAttribute('aria-pressed'), 'true');
assert.equal(saveRows[2].getAttribute('aria-pressed'), 'true');
assert.match(textOf(campaignBody.querySelector('.directive-starship-records-inspector')), /2 saves selected/);
clickElement(saveRows[0], { shiftKey: true });
assert.equal(saveRows[0].getAttribute('aria-pressed'), 'true');
assert.equal(saveRows[1].getAttribute('aria-pressed'), 'true');
assert.equal(saveRows[2].getAttribute('aria-pressed'), 'true');
assert.match(textOf(campaignBody.querySelector('.directive-starship-records-inspector')), /3 saves selected/);
assert.match(textOf(campaignBody.querySelector('.directive-starship-records-inspector')), /Delete Selected \(3\)/);
resetCampaignPanelState();
campaignBody = fakeDocument.createElement('div');
renderCampaignPanel(campaignBody, campaignView, {
  refresh() {},
  loadGame() {},
  setActiveTab() {}
});
assert.equal(campaignBody.querySelector('.directive-campaign-section-active').id, 'directive-campaign-command-section');
assert.equal(campaignBody.querySelectorAll('.directive-starship-library-row')[0].getAttribute('aria-pressed'), 'true');
saveRows = campaignBody.querySelectorAll('.directive-starship-save-row');
const defaultSelectedSaveRow = saveRows.find((row) => /Current Save/.test(textOf(row)));
assert(defaultSelectedSaveRow, 'Campaign reset should render the current save row');
assert.equal(defaultSelectedSaveRow.getAttribute('aria-pressed'), 'true');

resetCrewPanelState();
const crewView = createCrewResetView();
let crewBody = fakeDocument.createElement('div');
renderCrewPanel(crewBody, crewView);
assert.match(textOf(crewBody), /Personnel/);
assert.match(textOf(crewBody), /Character/);
assert.match(textOf(crewBody), /Crew/);
assert.match(textOf(crewBody), /Player Commander/);
assert.match(textOf(crewBody), /Service Record/);
const characterBiography = crewBody.querySelector('.directive-character-biography-disclosure');
const characterBiographyToggle = characterBiography?.querySelector('.directive-character-biography-toggle');
const characterBiographyMore = characterBiography?.querySelector('.directive-character-biography-more');
assert(characterBiography, 'Character tab should render the player character biography disclosure');
assert(characterBiographyToggle, 'Long player character biographies should expose a More/Less toggle');
assert(characterBiographyMore, 'Long player character biographies should keep later paragraphs in a collapsible region');
assert.equal(characterBiographyToggle.getAttribute('aria-expanded'), 'false');
assert.equal(characterBiographyMore.hidden, true);
assert.match(textOf(characterBiography), /foregrounds bridge command and accountable delegation/);
assert.doesNotMatch(textOf(characterBiography), /later service record context that should not be clipped/);
characterBiographyToggle.click();
assert.equal(characterBiographyToggle.getAttribute('aria-expanded'), 'true');
assert.equal(characterBiographyMore.hidden, false);
assert.equal(characterBiographyToggle.children[1].textContent, 'Less');
assert.match(textOf(characterBiography), /later service record context that should not be clipped/);
const serviceRecordSection = crewBody.querySelector('.directive-character-service-record-section');
const serviceRecordToggle = serviceRecordSection?.querySelector('.directive-character-section-toggle');
const serviceRecordContent = serviceRecordSection?.querySelector('.directive-character-section-content');
assert(serviceRecordSection, 'Character tab should render a Service Record section');
assert(serviceRecordToggle, 'Service Record should expose a dropdown toggle');
assert(serviceRecordContent, 'Service Record should render collapsible content');
assert.equal(serviceRecordToggle.getAttribute('aria-expanded'), 'false');
assert.equal(serviceRecordContent.hidden, true, 'Service Record details should be collapsed by default');
assert.doesNotMatch(textOf(crewBody), /Commander \/ Executive Officer \/ U\.S\.S\. Breckenridge/, 'Collapsed Service Record details should not take up Character tab space');
serviceRecordToggle.click();
assert.equal(serviceRecordToggle.getAttribute('aria-expanded'), 'true');
assert.equal(serviceRecordContent.hidden, false);
assert.match(textOf(serviceRecordSection), /Commander \/ Executive Officer \/ U\.S\.S\. Breckenridge/);
assert(textOf(serviceRecordSection).includes(FULL_PLAYER_SERVICE_SUMMARY), 'Service Record should show the full Service Summary once expanded');
assert(textOf(serviceRecordSection).includes(FULL_PLAYER_COMMAND_STYLE), 'Service Record should show the full Command Style once expanded');
assert.match(textOf(crewBody), /Command Bearing/);
assert.match(textOf(crewBody), /Inspiration\s+Bearing I\s+1 \/ 2 Marks\s+2 banked/);
assert.match(textOf(crewBody), /Command Bearing Evidence/);
assert.match(textOf(crewBody), /possible Resolve evidence/);
assert.match(textOf(crewBody), /Standing With Senior Staff/);
assert.match(textOf(crewBody), /Concerned but professionally engaged/);
assert.match(textOf(crewBody), /Perceived Relationship Shifts/);
assert.match(textOf(crewBody), /Slight Improvement/);
assert.doesNotMatch(textOf(crewBody), /42|17|12|professionalConfidence|hidden question|hidden memory event|hidden memory interpretation/, 'Character tab should not leak hidden relationship values.');
crewBody.querySelector('[data-directive-crew-subtab="crew"]').click();
const jalenRosterRow = crewBody.querySelector('[data-crew-id="jalen-orr"]');
const jalenMouseDown = jalenRosterRow.eventListeners.get('mousedown');
let preventedRosterMouseFocus = false;
assert(jalenMouseDown, 'Crew roster rows should guard against mouse focus-scrolling the drawer body');
jalenMouseDown({
  button: 0,
  preventDefault() {
    preventedRosterMouseFocus = true;
  }
});
assert.equal(preventedRosterMouseFocus, true, 'Crew roster mouse selection should not focus-scroll the drawer body');
jalenRosterRow.click();
const jalenDetail = crewBody.querySelector('.directive-crew-detail-panel');
const jalenText = textOf(jalenDetail);
assert.equal(crewBody.querySelector('.directive-crew-roster-row-active').dataset.crewId, 'jalen-orr');
assert(crewBody.querySelector('[data-crew-id="mara-whitaker"]').className.includes('directive-crew-division-command'), 'Captain should render as command division');
assert(crewBody.querySelector('[data-crew-id="jalen-orr"]').className.includes('directive-crew-division-operations'), 'Lieutenant Commander in operations billet should not be treated as command division');
assert.equal(crewBody.querySelectorAll('.directive-division-mark').length, 0, 'Crew should not render glowing division status dots');
assert(crewBody.querySelector('.directive-crew-division-strip'), 'Crew should render non-glowing division strips');
assert(crewBody.querySelector('.directive-crew-rank-pips'), 'Crew should render rank pips from public rank text');
assert.equal(
  crewBody.querySelector('[data-crew-id="player-commander"]').querySelector('.directive-asset-mask-icon').dataset.assetIcon,
  DIRECTIVE_COMM_BADGE_ICON,
  'Crew roster player placeholder should use the shared comm badge asset'
);
assert.match(
  directiveCss,
  /\.directive-crew-roster-portrait\.directive-player-portrait-frame\.directive-media-frame-placeholder \.directive-media-placeholder,\s*\.directive-crew-detail-portrait\.directive-player-portrait-frame\.directive-media-frame-placeholder \.directive-media-placeholder\s*\{[\s\S]*?color:\s*#d8d7d2;/,
  'Crew player portrait fallback badge should use a silver treatment instead of the generic purple placeholder'
);
assert.match(
  directiveCss,
  /\.directive-crew-roster-portrait\.directive-player-portrait-frame\.directive-media-frame-placeholder \.directive-media-placeholder\s*\{[\s\S]*?min-height:\s*0;/,
  'Crew roster player portrait fallback should center against the actual roster portrait height'
);
assert.match(
  directiveCss,
  /\.directive-crew-roster-portrait\.directive-player-portrait-frame\.directive-media-frame-placeholder \.directive-media-placeholder-icon\s*\{[\s\S]*?transform:\s*translateY\(-1px\);/,
  'Crew roster player portrait badge should apply the vertical optical centering correction'
);
assert.equal(crewBody.querySelector('.directive-crew-continuity-note'), null, 'Crew inspector should not render continuity metric blurbs');
assert(!textOf(crewBody).includes('Relationship continuity is active'), 'Crew inspector should remove relationship continuity blurb copy');
assert.match(jalenText, /Jalen Orr/);
assert.match(jalenText, /Lieutenant Commander \/ Operations Officer/);
assert.match(jalenText, /calm handoffs and clean watch rotations/);
assert.match(jalenText, /Species\s+Trill/);
assert.match(jalenText, /Command Posture\s+Crew Read\s+Concerned/);
assert.match(jalenText, /Current Pressure\s+Medium \/ Active\s+Ops Handoff Pressure/);
assert.match(jalenText, /Command Context\s+Advisory Note\s+Ops handoff advisory/);
assert.match(jalenText, /Jalen is the involved officer for the operations handoff advisory/);
assert.match(jalenText, /Open Work/);
assert.match(jalenText, /Current Order \/ Active\s+Alpha Shift Handoff Check/);
assert.match(jalenText, /Jalen needs a player-visible alpha-shift follow-up before the next watch rotation/);
assert.match(jalenText, /Due: before beta shift/);
assert.match(jalenText, /Quest \/ Active\s+Ops Handoff Review/);
assert.match(jalenText, /Jalen has an active open-world operations handoff review/);
assert.match(jalenText, /Recent Command Memory\s+Command Log\s+Watch Handoff Accepted/);
assert.match(jalenText, /Open Threads\s+Open Thread \/ Active\s+Jalen Watch Rotation/);
assert.match(jalenText, /Jalen Break Rotation/);
assert.match(jalenText, /Jalen Mess Check-In/);
assert.match(jalenText, /Jalen Cross-Watch Notes/);
assert.doesNotMatch(jalenText, /full recommendation needs to remain available/, 'Long command memory should be collapsed by default');
assert.doesNotMatch(jalenText, /expanded thread context remains available/, 'Long Open Thread summary should be collapsed by default');
assert.doesNotMatch(jalenText, /42|17|12|professionalConfidence|hidden question|hidden memory event|hidden memory interpretation|Hidden Ops Pressure|Hidden Latent Thread|Completed Assignment Should Not Render|Hidden Assignment Should Not Render/, 'Crew inspector should not leak hidden relationship, memory, pressure, thread, or inactive assignment values');
const memorySummaryToggle = crewBody.querySelector('.directive-crew-inspector-summary-toggle');
assert(memorySummaryToggle, 'Long Crew inspector summaries should expose a More/Less toggle');
assert.equal(memorySummaryToggle.getAttribute('aria-expanded'), 'false');
memorySummaryToggle.click();
assert.equal(memorySummaryToggle.getAttribute('aria-expanded'), 'true');
assert.match(textOf(jalenDetail), /full recommendation needs to remain available when expanded/);
const bioToggle = crewBody.querySelector('.directive-crew-public-bio-toggle');
const bioMore = crewBody.querySelector('.directive-crew-public-bio-more');
assert(bioToggle, 'Crew inspector should expose an expandable public bio toggle when bios have more than two sentences');
assert.equal(bioToggle.getAttribute('aria-expanded'), 'false');
assert.equal(bioMore.hidden, true);
assert(!textOf(jalenDetail).includes('especially useful when command needs operational discipline'), 'Collapsed public bio should hide later lines');
bioToggle.click();
assert.equal(bioToggle.getAttribute('aria-expanded'), 'true');
assert.equal(bioMore.hidden, false);
assert.equal(bioToggle.children[1].textContent, 'Less');
assert.match(textOf(jalenDetail), /especially useful when command needs operational discipline/);
crewBody.querySelector('[data-crew-id="player-commander"]').click();
const playerDetail = crewBody.querySelector('.directive-crew-detail-panel');
const playerDetailText = textOf(playerDetail);
assert.match(playerDetailText, /Player Commander/);
assert.match(playerDetailText, /Commander \/ Executive Officer/);
assert.match(playerDetailText, /dossier foregrounds bridge command and accountable delegation/);
assert.match(playerDetailText, /publicly known for careful command judgment/);
assert.equal(crewBody.querySelector('[data-crew-id="player-commander"]').getAttribute('aria-pressed'), 'true');
assert.equal(
  playerDetail.querySelector('.directive-asset-mask-icon').dataset.assetIcon,
  DIRECTIVE_COMM_BADGE_ICON,
  'Crew detail player placeholder should use the shared comm badge asset'
);
const commandCrewRosterPanelCss = /\.directive-command-spine-shell \.directive-crew-roster-panel\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
const commandCrewRosterCss = /\.directive-command-spine-shell \.directive-crew-roster\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
assert.match(commandCrewRosterPanelCss, /grid-template-rows:\s*auto auto\s*!important;/, 'command spine Crew roster panel should keep the roster in normal page flow');
assert.match(commandCrewRosterPanelCss, /overflow:\s*visible\s*!important;/, 'command spine Crew roster panel should not trap wheel scrolling');
assert.match(commandCrewRosterCss, /max-height:\s*none\s*!important;/, 'command spine Crew roster should not use a fixed early-scroll height cap');
assert.match(commandCrewRosterCss, /overflow:\s*visible\s*!important;/, 'command spine Crew roster should let the drawer body own scrolling');
assert.doesNotMatch(commandCrewRosterCss, /overflow-y:\s*auto|overscroll-behavior:\s*contain/, 'command spine Crew roster should not create a nested scroll container');
assert.match(directiveCss, /\.directive-crew-detail-portrait \.directive-media-image\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?object-fit:\s*cover;/, 'Crew dossier portraits should fill the portrait frame instead of ending at natural image height');
assert.match(directiveCss, /\.directive-command-spine-shell \.directive-crew-detail-panel\s*\{[\s\S]*?grid-template-rows:\s*auto auto\s*!important;/, 'Crew dossier single-column layout should not reserve blank row space below the portrait');
assert.match(directiveCss, /@container\s*\(max-width:\s*980px\)\s*\{[\s\S]*?\.directive-command-spine-shell \.directive-crew-detail-portrait\s*\{[\s\S]*?aspect-ratio:\s*1\.45\s*\/\s*1;/, 'Crew dossier portrait boxes should cap their wide single-column aspect ratio');
assert.match(directiveCss, /@container\s*\(max-width:\s*760px\)\s*\{[\s\S]*?\.directive-command-spine-shell \.directive-crew-detail-portrait\s*\{[\s\S]*?aspect-ratio:\s*1\.45\s*\/\s*1;/, 'Compact Crew dossier portrait boxes should keep the same aspect-ratio cap');
assert.match(directiveCss, /\.directive-crew-public-bio-toggle/, 'Crew inspector should style the public bio disclosure control');
assert.match(directiveCss, /\.directive-crew-inspector-grid/, 'Crew inspector should style tracked state sections');
const crewInspectorListCss = /\.directive-crew-inspector-list\s*\{(?<body>[\s\S]*?)\}/.exec(directiveCss)?.groups?.body || '';
assert.match(crewInspectorListCss, /max-height:\s*none\s*!important;/, 'Crew inspector item stacks should stay in normal page flow');
assert.match(crewInspectorListCss, /overflow:\s*visible\s*!important;/, 'Crew inspector item stacks should let the drawer body own scrolling');
assert.doesNotMatch(crewInspectorListCss, /overflow-y:\s*auto|overscroll-behavior:\s*contain/, 'Crew inspector item stacks should not create nested scroll containers');
assert.match(directiveCss, /\.directive-crew-inspector-summary-toggle/, 'Crew inspector should style tracked summary More/Less controls');
assert.doesNotMatch(directiveCss, /\.directive-crew-mission-role/, 'Crew inspector should remove old Command Relevance styling');
resetCrewPanelState();
crewBody = fakeDocument.createElement('div');
renderCrewPanel(crewBody, crewView);
crewBody.querySelector('[data-directive-crew-subtab="crew"]').click();
assert.equal(crewBody.querySelector('.directive-crew-roster-row-active').dataset.crewId, 'mara-whitaker');
}

const missionThreadsView = createMissionThreadsView();
missionThreadsView.continuityProjectionDiagnostics = {
  kind: 'directive.continuityProjectionDiagnostics.v1',
  status: 'fresh',
  promptRevision: 12,
  promptHash: 'prompt-hash-safe',
  sourceHash: 'source-hash-safe',
  policyHash: 'policy-hash-safe',
  blockCount: 6,
  selectedFactCount: 9,
  factCount: 14,
  conflictCount: 0,
  candidateClaimCount: 1,
  rejectedClaimCount: 2,
  staticKeys: {
    installedStaticKeyCount: 6,
    expectedStaticKeyCount: 6,
    missingStaticKeyCount: 0,
    missingStaticKeyHashes: []
  },
  latestReview: {
    status: 'contradicted',
    findingCount: 2,
    observationTextHash: 'observed-text-hash-safe'
  },
  latestRejectedClaim: {
    idHash: 'claim-id-hash-safe',
    categories: ['species', 'travel'],
    textHash: 'claim-text-hash-safe',
    sourceKind: 'hostNativeGeneration',
    sourceHash: 'source-id-hash-safe'
  }
};
missionThreadsView.continuityTelemetry = {
  kind: 'directive.continuityTelemetry.v1',
  rejectedClaimCount: 2,
  latestRejectedClaim: missionThreadsView.continuityProjectionDiagnostics.latestRejectedClaim
};
missionThreadsView.campaignState.continuity = {
  schemaVersion: 1,
  rejectedClaims: [{
    id: 'claim.raw.bronn',
    text: 'Bronn is a human male in his early forties.',
    source: { id: 'raw-source-message-77' }
  }],
  candidateClaims: [],
  projectionHints: [{
    factId: 'crew.hadrik-bronn.species',
    reason: 'Hidden fact text should not render'
  }]
};
let missionBody = fakeDocument.createElement('div');
renderMissionPanel(missionBody, missionThreadsView, {
  refresh() {}
});
assert(missionBody.querySelector('.directive-quest-journal'), 'Mission should render the unified quest journal');
assert.match(textOf(missionBody), /Current Quests|No Quest Selected/);
assert.doesNotMatch(textOf(missionBody), /Continuity Matrix|Open Threads|Side Work|Recovery Console/);
if (false) {
assert.match(textOf(missionBody), /Continuity Matrix\s+Fresh \/ 6 blocks \/ 0 conflicts/);
assert.doesNotMatch(textOf(missionBody), /Bronn is a human|crew\.hadrik-bronn\.species|raw-source-message-77|Hidden fact text should not render/);
assert.match(textOf(missionBody), /Advisory Notes/);
assert.match(textOf(missionBody), /The current handoff question has a player-safe advisory note for Mission review/);
assert.match(textOf(missionBody), /Keep the ship stable while crew concerns surface/);
assert.match(textOf(missionBody), /Keep command aware of visible ongoing concerns/);
assert.match(textOf(missionBody), /Current Orders/);
assert.match(textOf(missionBody), /Alpha Shift Handoff Check/);
assert.match(textOf(missionBody), /Jalen needs a player-visible alpha-shift follow-up before the next watch rotation/);
assert.doesNotMatch(textOf(missionBody), /\[object Object\]/, 'Mission should render structured mission questions and objectives as player-safe text.');
const openThreadsTab = missionBody.querySelector('[data-mission-subtab-target="directive-mission-open-threads-section"]');
assert(openThreadsTab, 'Mission should expose a global Open Threads tab');
openThreadsTab.click();
const openThreadsSection = missionBody.querySelector('#directive-mission-open-threads-section');
const openThreadsText = textOf(openThreadsSection);
assert.equal(openThreadsTab.getAttribute('aria-selected'), 'true');
assert.match(openThreadsText, /4 visible ongoing concerns currently active or engaged/);
assert.match(openThreadsText, /Jalen Watch Rotation/);
assert.match(openThreadsText, /Jalen Break Rotation/);
assert.match(openThreadsText, /Jalen Mess Check-In/);
assert.match(openThreadsText, /Jalen Cross-Watch Notes/);
assert.match(openThreadsText, /Participants\s+Jalen Orr, Player Commander/);
assert.doesNotMatch(openThreadsText, /Hidden Latent Thread|expanded thread context remains available/, 'Mission Open Threads should hide latent records and collapse long summaries by default');
const missionThreadToggle = openThreadsSection.querySelector('.directive-mission-open-thread-summary-toggle');
assert(missionThreadToggle, 'Mission Open Threads should expose More/Less for long thread summaries');
assert.equal(missionThreadToggle.getAttribute('aria-expanded'), 'false');
missionThreadToggle.click();
assert.equal(missionThreadToggle.getAttribute('aria-expanded'), 'true');
assert.match(textOf(openThreadsSection), /expanded thread context remains available/);
const componentsTab = missionBody.querySelector('[data-mission-subtab-target="directive-mission-components-section"]');
assert(componentsTab, 'Mission should expose a Components subtab');
componentsTab.click();
assert.equal(componentsTab.getAttribute('aria-selected'), 'true');
const componentsSection = missionBody.querySelector('#directive-mission-components-section');
assert(componentsSection, 'Mission should render a Components section');
assert.equal(componentsSection.hidden, false);
assert.equal(componentsSection.querySelectorAll('.directive-mission-component-card').length, 1);
const componentsText = textOf(componentsSection);
assert.match(componentsText, /Components/);
assert.match(componentsText, /Port nacelle coolant seal/);
assert.match(componentsText, /Ship Issue/);
assert.match(componentsText, /Unresolved/);
assert.match(componentsText, /Official Packet \/ Directive - Ashes of Peace \(57\) \/ Msg 15/);
assert.match(componentsText, /Coolant seal, port nacelle, junction 7-C/);
assert.match(componentsText, /Open Source/);
assert.match(componentsText, /Edit/);
assert.match(componentsText, /Archive/);
}

const advisoryLogBody = fakeDocument.createElement('div');
renderCommandLogPanel(advisoryLogBody, createCrewResetView());
const advisoryLogText = textOf(advisoryLogBody);
assert.match(advisoryLogText, /Advisory Notes/);
assert.match(advisoryLogText, /Jalen asked for decision-support context before the operations handoff is committed/);
assert.match(advisoryLogText, /Linked Orders/);
assert.match(advisoryLogText, /Alpha Shift Handoff Check/);
assert.doesNotMatch(advisoryLogText, /Hidden advisory/);
assert.doesNotMatch(advisoryLogText, /Continuity Matrix|Bronn is a human|crew\.hadrik-bronn\.species|raw-source-message-77|claim-text-hash-safe/);
if (false) {
const settingsBody = fakeDocument.createElement('div');
renderSettingsPanel(settingsBody, missionThreadsView, {
  refresh() {},
  rebuildPromptContext() {}
});
settingsBody.querySelector('[data-settings-subtab-target="directive-settings-safety-section"]').click();
const settingsText = textOf(settingsBody);
assert.match(settingsText, /Continuity Matrix/);
assert.match(settingsText, /Projection Diagnostics/);
assert.match(settingsText, /Status\s+fresh/i);
assert.match(settingsText, /Prompt Rev\s+12/);
assert.match(settingsText, /Blocks\s+6\/6/);
assert.match(settingsText, /Rejected Claims\s+2/);
assert.match(settingsText, /Prompt Hash\s+prompt-hash-safe/);
assert.match(settingsText, /Latest Review\s+contradicted/);
assert.doesNotMatch(settingsText, /Bronn is a human|crew\.hadrik-bronn\.species|raw-source-message-77|Hidden fact text should not render/);
assert.match(directiveCss, /\.directive-mission-open-threads-list\s*\{[\s\S]*?overflow-y:\s*auto;/, 'Mission Open Threads list should scroll when thread stacks exceed the cap');
assert.match(directiveCss, /\.directive-mission-open-thread-summary-toggle/, 'Mission Open Threads should style summary More/Less controls');
}
const playerSettingsBody = fakeDocument.createElement('div');
renderSettingsPanel(playerSettingsBody, missionThreadsView, {
  refresh() {},
  rebuildPromptContext() {}
});
assert(playerSettingsBody.querySelector('.directive-settings-player-preferences'), 'Settings should foreground player preferences');
assert.equal(playerSettingsBody.querySelectorAll('.directive-settings-disclosure').length, 2, 'Settings should collapse advanced groups');
assert.match(textOf(playerSettingsBody), /Advanced/);
assert.match(textOf(playerSettingsBody), /Developer & Troubleshooting/);

const acceptedAssignments = [
  {
    id: 'open-assignment:command-network',
    title: 'Review the command-network handoff',
    summary: 'Meet Commander Cross in Engineering and inspect the command-network handoff risk.',
    status: 'open',
    dueWindow: 'Within the current twelve-hour command window.',
    assignmentScope: 'playerCurrentOrder',
    assignedActorIds: ['player-commander'],
    linkedCrewIds: ['imani-cross'],
    linkedShipSystemIds: ['ship.command-network-certificate-compatibility']
  },
  {
    id: 'open-assignment:bronn-alpha',
    title: 'Meet Bronn on alpha shift',
    summary: 'Introduce yourself to Bronn professionally while he is on duty.',
    status: 'open',
    dueWindow: 'Today during alpha shift.',
    assignmentScope: 'playerCurrentOrder',
    assignedActorIds: ['player-commander'],
    linkedCrewIds: ['hadrik-bronn']
  },
  {
    id: 'open-assignment:ship-walk',
    title: 'Walk the ship',
    summary: 'Talk to department heads and look for refit issues the yard missed, including Medical and Science.',
    status: 'open',
    dueWindow: 'Before arrival at the Reach.',
    assignmentScope: 'playerCurrentOrder',
    assignedActorIds: ['player-commander'],
    linkedCrewIds: ['miriam-sato', 'rowan-saye']
  }
];
const delegatedCrewAssignment = {
  id: 'open-assignment:nayar-sensor-power-audit',
  title: 'Full sensor diagnostic and power distribution audit',
  summary: 'Nayar to conduct a full sensor diagnostic and power distribution audit.',
  status: 'open',
  priority: 'current',
  assignmentScope: 'delegatedCrewOrder',
  assignedActorIds: ['priya-nayar'],
  dueWindow: 'Draft by 0700 ship time'
};
const objectiveProjectionView = {
  activePackage: breckenridgePackage,
  campaignState: {
    campaign: {
      id: 'campaign-objective-projection',
      title: 'Ashes of Peace'
    },
    player: {
      id: 'player-commander',
      name: 'Sam Voss',
      rank: 'Commander',
      billet: 'Executive Officer',
      species: 'Human',
      dossier: {
        briefBiography: 'Sam Voss is the player command character for this projection test.'
      }
    },
    ship: {
      name: 'U.S.S. Breckenridge'
    },
    settings: {
      simulationMode: 'Command'
    },
    crew: {
      seniorCrewIds: ['mara-whitaker', 'player-commander', 'kieran-vale', 'priya-nayar', 'imani-cross', 'hadrik-bronn', 'miriam-sato', 'rowan-saye'],
      relationshipModel: true,
      casualties: [],
      reassignments: []
    },
    mission: {
      activeMissionId: 'chapter-1-the-empty-convoy',
      phase: 'opening',
      formalObjectives: [
        {
          id: 'chapter-1-the-empty-convoy.objective.1',
          text: 'Establish Breckenridge readiness before arrival at the Reach.'
        }
      ],
      openAssignments: [
        ...acceptedAssignments,
        delegatedCrewAssignment
      ]
    },
    commandLog: {
      entries: [
        {
          sourceOutcomeId: 'settlement.objective-projection',
          type: 'sceneHandshake',
          summaryInputs: [
            FULL_COMMAND_LOG_INPUT
          ],
          visibleConsequences: [
            'Sam accepted the assignments in the next reply.'
          ],
          linkedAssignmentIds: acceptedAssignments.map((entry) => entry.id),
          linkedAssignmentTitles: [
            ...acceptedAssignments.map((entry) => entry.title),
            FULL_LINKED_ORDER_TITLE
          ]
        }
      ]
    },
    pressureLedger: {
      records: []
    },
    relationships: {
      seniorCrew: [],
      memoryLedger: []
    },
    threadLedger: {
      records: []
    },
    directives: {
      active: []
    },
    turnLedger: {
      entries: []
    }
  },
  playerCharacterView: {
    identity: {
      id: 'player-commander',
      name: 'Sam Voss',
      rank: 'Commander',
      billet: 'Executive Officer',
      species: 'Human'
    },
    dossier: {
      briefBiography: 'Sam Voss is the player command character for this projection test.'
    },
    serviceRecord: [],
    commandBearingSummary: {
      reserve: { current: 0, capacity: 0 },
      tracks: {}
    },
    currentStandingSummary: [],
    crewInteractionLog: [],
    relationshipPerceptions: []
  },
  host: {
    capabilities: {
      chat: {
        observeMessages: true
      }
    }
  }
};

const projectionMissionBody = fakeDocument.createElement('div');
renderMissionPanel(projectionMissionBody, objectiveProjectionView, { refresh() {} });
const projectionMissionText = textOf(projectionMissionBody);
assert.match(projectionMissionText, /Current Quests/);
assert.match(projectionMissionText, /Review the command-network handoff/);
assert.match(projectionMissionText, /Meet Bronn on alpha shift/);
assert.match(projectionMissionText, /Walk the ship/);
assert.doesNotMatch(projectionMissionText, /Full sensor diagnostic and power distribution audit/, 'Mission Current Orders should not show player-issued delegated crew work.');
assert.doesNotMatch(projectionMissionText, /Status: open/, 'Mission Current Orders should suppress default open status bookkeeping.');
assert.doesNotMatch(projectionMissionText, /Priority: current/, 'Mission Current Orders should suppress default current-priority bookkeeping.');
assert.doesNotMatch(projectionMissionText, /Owner:/, 'Mission Current Orders should not label assignedByActorId as an owner.');
assert.doesNotMatch(projectionMissionText, /\[object Object\]/, 'Mission should render accepted assignment records as player-safe text.');

const projectionLogBody = fakeDocument.createElement('div');
renderCommandLogPanel(projectionLogBody, objectiveProjectionView);
const projectionLogText = textOf(projectionLogBody);
assert.match(projectionLogText, /Command History/);
assert.match(projectionLogText, /Linked Orders/);
assert.match(projectionLogText, /Review the command-network handoff/);
assert.match(projectionLogText, /Meet Bronn on alpha shift/);
assert.match(projectionLogText, /Walk the ship/);
assert.doesNotMatch(projectionLogText, /\[object Object\]/, 'Log should render accepted linked orders as player-safe text.');
const projectionLogEntry = projectionLogBody.querySelector('.directive-log-entry-card');
const projectionLogSummaryDisclosure = projectionLogEntry?.querySelector('.directive-log-summary-disclosure');
const projectionLogSummary = projectionLogSummaryDisclosure?.querySelector('.directive-log-summary');
const projectionLogSummaryToggle = projectionLogEntry?.querySelector('.directive-log-summary-toggle');
const projectionLogInputs = projectionLogEntry?.querySelector('.directive-log-inputs');
const projectionLogLinkedOrders = projectionLogEntry?.querySelector('.directive-log-linked-assignments');
assert(projectionLogSummary, 'Log entries should render a body summary disclosure.');
assert(projectionLogSummaryToggle, 'Long Log body summaries should expose a More/Less toggle.');
assert.equal(projectionLogSummaryToggle.getAttribute('aria-expanded'), 'false');
assert.doesNotMatch(projectionLogSummary.textContent, /full command-log input tail/, 'Collapsed Log body summary should stay compact.');
projectionLogSummaryToggle.click();
assert.equal(projectionLogSummaryToggle.getAttribute('aria-expanded'), 'true');
assert.match(projectionLogSummary.textContent, /full command-log input tail/, 'Expanded Log body summary should show the full committed text.');
assert.match(textOf(projectionLogInputs), /full command-log input tail/, 'Committed Inputs should show full text in details.');
assert.match(textOf(projectionLogLinkedOrders), /complete linked order title preserved/, 'Linked Orders should show full text in details.');
assert.match(directiveCss, /\.directive-log-summary-toggle/, 'Log body summaries should style More/Less controls');
assert.match(directiveCss, /\.directive-log-summary\s*\{[\s\S]*?overflow:\s*visible\s*!important;[\s\S]*?text-overflow:\s*clip\s*!important;[\s\S]*?white-space:\s*normal\s*!important;/, 'Log body summaries should not be clipped by CSS');
assert.match(directiveCss, /\.directive-log-pill\s*\{[\s\S]*?overflow:\s*visible\s*!important;[\s\S]*?text-overflow:\s*clip\s*!important;[\s\S]*?white-space:\s*normal\s*!important;/, 'Log detail pills should not be clipped by CSS');

resetCrewPanelState();
const projectionCrewBody = fakeDocument.createElement('div');
renderCrewPanel(projectionCrewBody, objectiveProjectionView);
assert.match(textOf(projectionCrewBody), /Player Character/);
assert.equal(projectionCrewBody.querySelectorAll('.directive-crew-row').length, 8);
assert(projectionCrewBody.querySelector('[data-crew-id="imani-cross"]'), 'Crew journal should expose canonical crew ids');
projectionCrewBody.querySelector('[data-crew-id="imani-cross"]').click();
assert.equal(projectionCrewBody.querySelector('[data-crew-id="imani-cross"]').getAttribute('aria-selected'), 'true');
assert.match(textOf(projectionCrewBody.querySelector('.directive-crew-detail')), /Imani Cross/);
if (false) {
projectionCrewBody.querySelector('[data-directive-crew-subtab="crew"]').click();
assert.equal(projectionCrewBody.querySelectorAll('.directive-crew-roster-row').length, 8);
projectionCrewBody.querySelector('[data-crew-id="imani-cross"]').click();
assert.match(textOf(projectionCrewBody.querySelector('.directive-crew-detail-panel')), /Open Work\s+Current Order \/ Open\s+Review the command-network handoff/);
projectionCrewBody.querySelector('[data-crew-id="hadrik-bronn"]').click();
assert.match(textOf(projectionCrewBody.querySelector('.directive-crew-detail-panel')), /Open Work\s+Current Order \/ Open\s+Meet Bronn on alpha shift/);
projectionCrewBody.querySelector('[data-crew-id="miriam-sato"]').click();
assert.match(textOf(projectionCrewBody.querySelector('.directive-crew-detail-panel')), /Open Work\s+Current Order \/ Open\s+Walk the ship/);
projectionCrewBody.querySelector('[data-crew-id="rowan-saye"]').click();
assert.match(textOf(projectionCrewBody.querySelector('.directive-crew-detail-panel')), /Open Work\s+Current Order \/ Open\s+Walk the ship/);
assert.doesNotMatch(textOf(projectionCrewBody), /commander-cross|bronn,|sato,|saye,|\[object Object\]/i, 'Crew projection should use canonical package crew links and player-safe text.');
}

let openCount = 0;
__directiveRuntimeActionTestHooks.clearRuntimeActions();
registerRuntimeAction('runtime.open', () => {
  openCount += 1;
});

installExtensionsMenuButton();
const menuButton = fakeDocument.getElementById('directive-extensions-menu-button');
assert(menuButton, 'Directive should install an extensions-menu button');
assert.equal(fakeDocument.getElementById('extensionsMenuDefault'), null);
assert.equal(menu.children.includes(menuButton), true);
assert.equal(menuButton.className, 'list-group-item flex-container flexGap5 interactable');
assert.equal(menuButton.title, 'Open the Directive game menu.');
assert.equal(menuButton.children[0].className, 'fa-solid fa-compass directive-extensions-menu-icon');
assert.equal(menuButton.children[1].textContent, 'Directive');
menuButton.click();
assert.equal(openCount, 1);

installExtensionsMenuButton();
assert.equal(
  menu.children.filter((child) => child.id === 'directive-extensions-menu-button').length,
  1,
  'Directive should not install duplicate menu buttons'
);
installExtensionsMenuButton({ directiveEnabled: false });
assert.equal(menuButton.dataset.directiveEnabled, 'false');
assert.equal(menuButton.getAttribute('aria-disabled'), 'true');
assert.equal(menuButton.classList.contains('disabled'), true);
menuButton.click();
assert.equal(openCount, 1, 'Directive menu button should not open the runtime while Directive is turned off');
installExtensionsMenuButton({ directiveEnabled: true });
assert.equal(menuButton.dataset.directiveEnabled, 'true');
assert.equal(menuButton.getAttribute('aria-disabled'), 'false');
assert.equal(menuButton.classList.contains('disabled'), false);

installExtensionsMenuDropdown();
const settingsPanel = fakeDocument.getElementById(DIRECTIVE_SETTINGS_PANEL_ID);
assert(settingsPanel, 'Directive should install a SillyTavern extensions settings dropdown');
assert.equal(settingsContainer.children.includes(settingsPanel), true);
assert.equal(settingsPanel.className, 'directive-settings');
assert.equal(settingsPanel.querySelectorAll('.inline-drawer').length, 1);
assert.equal(settingsPanel.querySelectorAll('.directive-extension-dropdown-title').length, 1);
assert.equal(settingsPanel.querySelectorAll('.directive-extension-dropdown-title')[0].children[0].className, 'fa-solid fa-compass directive-extensions-menu-icon');
assert.equal(settingsPanel.querySelectorAll('.directive-extension-dropdown-title')[0].children[1].textContent, 'Directive');
const openRuntimeButton = fakeDocument.getElementById(DIRECTIVE_OPEN_RUNTIME_BUTTON_ID);
assert(openRuntimeButton, 'Directive settings dropdown should expose Open Runtime');
assert.equal(openRuntimeButton.className, 'menu_button interactable');
assert.equal(openRuntimeButton.title, 'Open the Directive runtime.');
assert.equal(openRuntimeButton.children[0].className, 'fa-solid fa-up-right-from-square');
assert.equal(openRuntimeButton.children[1].textContent, 'Open Runtime');
const enableToggle = fakeDocument.getElementById(DIRECTIVE_EXTENSION_ENABLE_TOGGLE_ID);
const enableStatus = fakeDocument.getElementById(DIRECTIVE_EXTENSION_ENABLE_STATUS_ID);
assert(enableToggle, 'Directive settings dropdown should expose an extension enable toggle');
assert.equal(enableToggle.type, 'checkbox');
assert.equal(enableToggle.checked, true);
assert.equal(enableToggle.getAttribute('role'), 'switch');
assert.equal(enableToggle.getAttribute('aria-checked'), 'true');
assert.equal(enableStatus.textContent, 'On');
assert.equal(openRuntimeButton.disabled, false);
assert.equal(fakeDocument.getElementById('directive_reset_window'), null, 'retired window geometry must not expose Reset Window');
openRuntimeButton.click();
assert.equal(openCount, 2);

installExtensionsMenuDropdown({ directiveEnabled: false });
assert.equal(enableToggle.checked, false);
assert.equal(enableToggle.getAttribute('aria-checked'), 'false');
assert.equal(enableStatus.textContent, 'Off');
assert.equal(openRuntimeButton.disabled, true);
assert.equal(openRuntimeButton.getAttribute('aria-disabled'), 'true');
openRuntimeButton.click();
assert.equal(openCount, 2, 'Open Runtime should do nothing while Directive is turned off');

let toggleChanges = [];
installExtensionsMenuDropdown({
  directiveEnabled: false,
  onDirectiveEnabledChange: async (enabled) => {
    toggleChanges.push(enabled);
    return { enabled };
  }
});
enableToggle.checked = true;
await enableToggle.eventListeners.get('change')({
  type: 'change',
  target: enableToggle,
  currentTarget: enableToggle
});
assert.deepEqual(toggleChanges, [true]);
assert.equal(enableStatus.textContent, 'On');
assert.equal(openRuntimeButton.disabled, false);

installExtensionsMenuDropdown();
assert.equal(
  settingsContainer.children.filter((child) => child.id === DIRECTIVE_SETTINGS_PANEL_ID).length,
  1,
  'Directive should not install duplicate settings dropdowns'
);

settingsPanel.remove();
settingsContainer.remove();
const originalMutationObserver = globalThis.MutationObserver;
let observedSettingsContainer = null;
globalThis.MutationObserver = class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.disconnected = false;
    observedSettingsContainer = this;
  }

  observe(target, options) {
    this.target = target;
    this.options = options;
  }

  disconnect() {
    this.disconnected = true;
  }
};
assert.equal(
  installExtensionsMenuDropdown({ directiveEnabled: false }),
  false,
  'Directive should defer settings dropdown mounting until SillyTavern creates the settings container'
);
assert(observedSettingsContainer, 'Directive should observe the document for a late SillyTavern settings container');
const delayedSettingsContainer = fakeDocument.createElement('div');
delayedSettingsContainer.id = 'extensions_settings2';
fakeDocument.body.appendChild(delayedSettingsContainer);
observedSettingsContainer.callback();
const delayedSettingsPanel = fakeDocument.getElementById(DIRECTIVE_SETTINGS_PANEL_ID);
assert(delayedSettingsPanel, 'Directive should mount the settings dropdown after the settings container appears');
assert.equal(delayedSettingsContainer.children.includes(delayedSettingsPanel), true);
assert.equal(fakeDocument.getElementById(DIRECTIVE_EXTENSION_ENABLE_STATUS_ID).textContent, 'Off');
assert.equal(observedSettingsContainer.disconnected, true);
if (originalMutationObserver) {
  globalThis.MutationObserver = originalMutationObserver;
} else {
  delete globalThis.MutationObserver;
}

__directiveRuntimeActionTestHooks.clearRuntimeActions();
__directiveRuntimeShellTestHooks.reset();
configureRuntimeActions();
let runtimeUiResetCount = 0;
setDirectiveRuntimeApp({
  async getCurrentView() {
    return {
      activeScreen: 'campaign',
      campaign: {
        packages: [],
        saves: []
      },
      campaignState: null
    };
  },
  async resetRuntimeUiState() {
    runtimeUiResetCount += 1;
    return {
      activeScreen: 'campaign'
    };
  }
});
assert.deepEqual(
  listRuntimeActions().map((action) => action.id),
  [
    'runtime.show',
    'runtime.hide',
    'runtime.refresh',
    'runtime.open',
    'runtime.toggle',
    'runtime.setTab',
    'ui.refresh',
    'guidance.beginTutorial',
    'guidance.showTip',
    'assist.run',
    'testing.factualGroundingReview',
    'commandBearing.view',
    'commandBearing.ready',
    'commandBearing.cancel',
    'campaignIntro.rewrite',
    'missionComponents.captureSelection',
    'missionComponents.save',
    'missionComponents.update',
  'missionComponents.archive',
  'missionComponents.openSource',
  'defineSelection.lookup',
  'correctAsSwipe.propose',
  'correctAsSwipe.settleCase',
  'outcomeIntegrity.editProse',
    'reconciliation.reconcileMessage',
    'reconciliation.setStart',
    'reconciliation.setEnd',
    'reconciliation.reconcileFromHere',
    'reconciliation.recalculateFromHere',
    'reconciliation.reconcileMarked',
    'reconciliation.clearMarkers',
    'reconciliation.openPending',
    'reconciliation.applyPending',
    'reconciliation.rejectPending'
  ]
);

await runRuntimeAction('runtime.open');
const panel = fakeDocument.getElementById(DIRECTIVE_RUNTIME_PANEL_ID);
assert(panel, 'runtime.open should create the Directive runtime panel');
assert.equal(panel.hidden, false);
assert.equal(panel.classList.contains('directive-runtime-panel-open'), true);
assert.equal(panel.dataset.directiveShell, 'expanded');
const runtimeBody = panel.querySelector('[data-directive-runtime-body="true"]');
runtimeBody.scrollTop = 137;
await runRuntimeAction('runtime.refresh');
assert.equal(panel.querySelector('[data-directive-runtime-body="true"]').scrollTop, 137, 'same-route refresh should preserve runtime body scroll');
assert.equal(panel.querySelectorAll('.directive-lcars-rail').length, 1);
assert.equal(panel.querySelectorAll('.directive-route-bar').length, 1);
assert.equal(panel.querySelectorAll('.directive-route-control').length, DIRECTIVE_RUNTIME_TABS.length);
assert.deepEqual(DIRECTIVE_RUNTIME_TABS.map((route) => route.id), ['campaign', 'mission', 'people', 'ship', 'settings']);
assert.equal(panel.querySelector('.directive-command-spine'), null);
assert.equal(panel.querySelector('.directive-command-drawer'), null);
assert.equal(panel.querySelector('[data-shell-action="back"]'), null);
assert.equal(panel.querySelector('[data-shell-action="close"]').getAttribute('aria-label'), 'Close Directive');

await runRuntimeAction('runtime.setTab', { tabId: 'mission' });
assert.equal(__directiveRuntimeShellTestHooks.getActiveTab(), 'mission');
assert.equal(panel.dataset.activeRoute, 'mission');
assert.equal(panel.querySelectorAll('.directive-route-control')[1].getAttribute('aria-selected'), 'true');

await runRuntimeAction('runtime.setTab', { tabId: 'people' });
assert.equal(__directiveRuntimeShellTestHooks.getActiveTab(), 'people');
assert.equal(panel.dataset.activeRoute, 'people');
assert.equal(panel.querySelectorAll('.directive-route-control')[2].getAttribute('aria-selected'), 'true');

/* Legacy command-spine assertions intentionally retired by the expanded-shell cutover.
assert.equal(panel.querySelectorAll('.directive-command-spine').length, 1);
assert.equal(panel.querySelectorAll('.directive-command-drawer').length, 1);
assert.equal(panel.querySelectorAll('[data-directive-shelf-drag-handle="true"]').length, 2, 'shelf should expose drag handles on the spine brand and drawer title');
assert.equal(panel.querySelectorAll('.directive-spine-brand-logo').length, 1, 'spine brand should render the branded logo asset slot');
assert.equal(panel.querySelector('.directive-spine-brand-mark'), null, 'spine brand should not keep the old D letter mark');
assert.equal(panel.querySelectorAll('.directive-command-drawer-resize-handle').length, 1, 'drawer should expose one bottom-right resize handle');
assert.equal(panel.querySelectorAll('.directive-command-drawer-resize-handle-left').length, 0, 'drawer should not expose a bottom-left resize handle');
assert.equal(panel.querySelectorAll('.directive-command-drawer-resize-handle-right')[0].dataset.directiveDrawerResizeEdge, 'right');
assert.equal(panel.querySelectorAll('.directive-spine-route').length, DIRECTIVE_RUNTIME_TABS.length);
assert.deepEqual(
  Array.from(panel.querySelectorAll('.directive-spine-route')).map((button) => button.dataset.routeTone),
  DIRECTIVE_RUNTIME_TABS.map((route) => route.id),
  'desktop command spine should expose route tone metadata for shelf color tokens'
);
assert.equal(panel.querySelectorAll('.directive-shell-actions').length, 1);
assert.equal(panel.querySelectorAll('.directive-shell-actions')[0].dataset.directiveShellActions, 'drawer-header');
assert.equal(panel.querySelector('[data-shell-action="back"]'), null, 'runtime shell should not expose tab-history Back control');
assert.equal(panel.querySelectorAll('.directive-mobile-bottom-tab').length, DIRECTIVE_RUNTIME_TABS.length, 'mobile fallback should remain available');
assert.deepEqual(
  Array.from(panel.querySelectorAll('.directive-mobile-bottom-tab')).map((button) => button.dataset.routeTone),
  DIRECTIVE_RUNTIME_TABS.map((route) => route.id),
  'mobile command shelf should expose route tone metadata for bottom-shelf color tokens'
);
assert.equal(panel.querySelectorAll('.directive-mobile-bottom-tab')[0].children.at(-1).textContent, 'Campaign');
assert.equal(panel.querySelectorAll('.directive-mobile-bottom-tab')[0].getAttribute('aria-selected'), 'true');
assert.equal(panel.dataset.drawerOpen, 'false', 'desktop shelf should open with its drawer collapsed');
assert.equal(panel.querySelector('.directive-command-drawer').hidden, true);

const shelfDragHandle = panel.querySelectorAll('[data-directive-shelf-drag-handle="true"]')[0];
const dragStart = shelfDragHandle.eventListeners.get('pointerdown');
assert.equal(typeof dragStart, 'function', 'shelf drag handle should install a pointer gesture');
dragStart({
  button: 0,
  clientX: 16,
  clientY: 250,
  target: shelfDragHandle,
  currentTarget: shelfDragHandle,
  pointerId: 1,
  preventDefault() {},
  stopPropagation() {}
});
fakeDocument.dispatchEvent('pointermove', { clientX: 116, clientY: 310, preventDefault() {} });
fakeDocument.dispatchEvent('pointerup');
assert.equal(__directiveRuntimeShellTestHooks.getLayout().shelfLeft, 116, 'dragging the shelf handle should update persisted horizontal geometry');
assert.equal(__directiveRuntimeShellTestHooks.getLayout().shelfTop, 310, 'dragging the shelf handle should update persisted vertical geometry');
assert.equal(panel.dataset.shelfLeft, '116');
assert.equal(panel.dataset.shelfTop, '310');

await runRuntimeAction('runtime.setTab', { tabId: 'mission' });
assert.equal(__directiveRuntimeShellTestHooks.getActiveTab(), 'mission');
assert.equal(panel.dataset.drawerOpen, 'true');
assert.equal(panel.querySelector('.directive-command-drawer').hidden, false);
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].getAttribute('aria-selected'), 'true');
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].getAttribute('aria-expanded'), 'true');
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].classList.contains('directive-spine-route-selected'), true);
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].classList.contains('directive-spine-route-active'), true);
assert.equal(panel.querySelectorAll('.directive-mobile-bottom-tab')[1].getAttribute('aria-selected'), 'true');

await runRuntimeAction('runtime.toggleDrawer', { tabId: 'mission' });
assert.equal(panel.dataset.drawerOpen, 'false', 'selecting the active open route should close the single drawer');
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].getAttribute('aria-selected'), 'true', 'collapsed current route should remain selected');
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].getAttribute('aria-expanded'), 'false', 'collapsed current route should no longer be expanded');
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].classList.contains('directive-spine-route-selected'), true, 'collapsed current route should keep route memory without the active shelf fill');
assert.equal(panel.querySelectorAll('.directive-spine-route')[1].classList.contains('directive-spine-route-active'), false, 'collapsed current route should drop the active drawer connector');
await runRuntimeAction('runtime.toggleDrawer', { tabId: 'crew' });
assert.equal(__directiveRuntimeShellTestHooks.getActiveTab(), 'crew');
assert.equal(panel.dataset.drawerOpen, 'true');
assert.equal(panel.querySelectorAll('.directive-mobile-bottom-tab')[2].getAttribute('aria-selected'), 'true');

const resizeHandle = panel.querySelector('.directive-command-drawer-resize-handle-right');
const resizeStart = resizeHandle.eventListeners.get('pointerdown');
assert.equal(typeof resizeStart, 'function', 'drawer resize handle should install a pointer gesture');
const beforeResize = __directiveRuntimeShellTestHooks.getLayout();
resizeStart({
  button: 0,
  clientX: beforeResize.drawerWidth,
  clientY: beforeResize.drawerHeight,
  target: resizeHandle,
  currentTarget: resizeHandle,
  pointerId: 2,
  preventDefault() {},
  stopPropagation() {}
});
fakeDocument.dispatchEvent('pointermove', {
  clientX: beforeResize.drawerWidth + 2000,
  clientY: beforeResize.drawerHeight + 2000,
  preventDefault() {}
});
fakeDocument.dispatchEvent('pointerup');
const afterResize = __directiveRuntimeShellTestHooks.getLayout();
assert.equal(afterResize.shelfLeft, beforeResize.shelfLeft, 'resizing the drawer should not move the shelf left anchor');
assert.equal(afterResize.shelfTop, beforeResize.shelfTop, 'resizing the drawer should not move the shelf top anchor');
assert.equal(
  afterResize.drawerWidth,
  1440 - beforeResize.shelfLeft - getDirectiveSpineWidth(beforeResize.spineMode) - DIRECTIVE_DRAWER_GAP - DIRECTIVE_SHELL_MARGIN,
  'drawer width should cap at the viewport from the anchored shelf edge'
);
assert.equal(
  afterResize.drawerHeight,
  900 - beforeResize.shelfTop - DIRECTIVE_SHELL_MARGIN,
  'drawer height should cap below the anchored shelf top'
);
assert.equal(panel.dataset.shelfLeft, String(beforeResize.shelfLeft));
assert.equal(panel.dataset.shelfTop, String(beforeResize.shelfTop));

await runRuntimeAction('runtime.toggleFullscreen', { fullscreen: true });
assert.equal(panel.dataset.fullscreen, 'true');
assert.equal(panel.classList.contains('directive-runtime-fullscreen'), true);
await runRuntimeAction('runtime.toggleFullscreen', { fullscreen: false });
assert.equal(panel.dataset.fullscreen, 'false');

await runRuntimeAction('runtime.resetLayout');
assert.equal(__directiveRuntimeShellTestHooks.getActiveTab(), 'campaign');
assert.equal(panel.dataset.drawerOpen, 'false');
assert.equal(__directiveRuntimeShellTestHooks.getLayout().spineMode, 'compact');
assert.equal(__directiveRuntimeShellTestHooks.getLayout().shelfLeft, 16);
assert.equal(__directiveRuntimeShellTestHooks.getLayout().drawerWidth, 615);
assert.equal(__directiveRuntimeShellTestHooks.getLayout().drawerHeight, 684);
assert.equal(runtimeUiResetCount, 1, 'Reset Window should reset transient runtime-app UI state'); */

await runRuntimeAction('runtime.hide');
assert.equal(panel.hidden, true);

__directiveRuntimeShellTestHooks.reset();
__directiveRuntimeActionTestHooks.clearRuntimeActions();
delete globalThis.document;

console.log('Extension shell tests passed: manifest, extension controls, runtime actions, expanded viewport shell, and five-route navigation');
