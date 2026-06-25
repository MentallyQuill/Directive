import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildDirectiveAssistRequest,
  runDirectiveAssist
} from '../../src/assist/directive-assist.mjs';
import { createFakeDirectiveHost } from '../../src/hosts/fake/fake-host.mjs';
import {
  DIRECTIVE_ASSIST_BUTTON_ID,
  DIRECTIVE_ASSIST_MENU_ID,
  DIRECTIVE_ASSIST_PREVIEW_ID,
  __directiveAssistButtonTestHooks,
  installDirectiveAssistButton
} from '../../src/hosts/sillytavern/directive-assist-button.js';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function gameplayStateJson(value) {
  const state = cloneJson(value);
  if (state?.runtimeTracking) {
    delete state.runtimeTracking.modelCallJournal;
  }
  return JSON.stringify(state);
}

function createSequence(values) {
  let index = 0;
  return () => values[index++] || values.at(-1);
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json');
const missionGraph = readJson('packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json');
const activeAssistNarrationContext = {
  kind: 'directive.narrationPresetContext',
  roleId: 'directiveAssist',
  activePresetName: 'Directive',
  compatible: true,
  source: 'active-directive-preset',
  perspective: 'second person external - address the player command character as "you" only for observable situation, reports, direct sensory facts, and consequences.',
  instructions: '# Player Agency And Perspective\nDefault perspective: second person external - address the player command character as "you" only for observable situation, reports, direct sensory facts, and consequences.\n\nOnly the user speaks, acts, decides, and thinks for the player command character.',
  perspectivePromptId: 'directive-pov-second-external',
  promptIdentifiers: ['directive-pov-second-external', 'directive-player-agency-perspective']
};

async function loadRuntimeAssets() {
  return {
    packages: [packageData],
    projections: [{
      path: 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
      projection
    }],
    crewDatasets: [{
      path: 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
      dataset: crewDataset
    }],
    missionGraphs: [{
      path: 'packages/bundled/breckenridge/prelude-a-ship-underway.mission-graph.json',
      graph: missionGraph
    }]
  };
}

async function startTestCampaign(app) {
  await app.initialize();
  await app.startCreatorDraft({ packageId: packageData.manifest.id });
  await app.saveCreatorDraft({
    reason: 'manualSave',
    patch: {
      activeStep: 'review',
      input: {
        identity: {
          name: 'Talia Serrin',
          pronounsOrAddress: 'she/her',
          speciesId: 'human',
          ageBandId: 'mid-career',
          appearance: 'A composed officer with a quiet voice and a habit of watching the room before speaking.'
        },
        service: {
          careerBackgroundId: 'tactical-security',
          formativeExperienceId: 'dominion-war-fleet-service',
          assignmentReasonId: 'experienced-outsider-transfer'
        },
        personality: {
          traits: {
            insight: 'perceptive',
            connection: 'candid',
            execution: 'decisive'
          },
          flawId: 'impatient'
        },
        dossier: {
          detailLevel: 'Standard',
          briefBiography: 'Talia Serrin is a tactical-minded Starfleet Commander whose Dominion War service taught her to move quickly without treating lives as expendable.',
          publicReputation: 'Talia Serrin is known as a decisive and observant officer whose restraint has improved since the war.'
        }
      }
    }
  });
  return app.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });
}

const host = createFakeDirectiveHost({
  chatNative: true,
  chatOptions: {
    chatId: 'directive-assist-pre-campaign-chat',
    entityName: 'Captain Whitaker'
  },
  generationOptions: {
    responses: {
      campaignIntro: {
        providerId: 'fake-reasoning',
        text: 'The U.S.S. Breckenridge waits at readiness while Captain Whitaker turns the first operational handoff toward Commander Serrin.'
      },
      directiveAssist: {
        providerId: 'fake-directive-assist',
        model: 'fake-low-latency',
        text: JSON.stringify({
          action: 'draftInCharacter',
          title: 'Draft In Character',
          replacementText: 'Commander Talia Serrin keeps her voice even. "Priya, coordinate with Bronn and give me a clean status picture before we commit. Keep Captain Whitaker informed if this changes our authority or risk."',
          notes: ['Preserved player intent.'],
          warnings: [],
          usedContext: ['player-character identity', 'role authority', 'visible staff roster']
        }),
        usage: {
          total_tokens: 91
        }
      }
    }
  }
});

let idSequence = 0;
const app = createDirectiveRuntimeApp({
  host,
  packageLoader: loadRuntimeAssets,
  idFactory(prefix) {
    idSequence += 1;
    return `${prefix}-directive-assist-${idSequence}`;
  },
  now: createSequence([
    '2026-06-20T18:00:00.000Z',
    '2026-06-20T18:01:00.000Z',
    '2026-06-20T18:02:00.000Z'
  ])
});

const started = await startTestCampaign(app);
const beforeState = gameplayStateJson(started.campaignState);
const beforeLogCount = started.campaignState.commandLog.entries.length;
const draft = await app.runDirectiveAssist({
  action: 'draftInCharacter',
  inputText: 'ask Priya to coordinate with Bronn before we commit'
});
assert.equal(draft.assistResult.ok, true);
assert.equal(draft.assistResult.action, 'draftInCharacter');
assert.equal(draft.assistResult.diagnostics.providerUsed, true);
assert.match(draft.assistResult.replacementText, /Commander Talia Serrin/);
assert.match(draft.assistResult.replacementText, /Captain Whitaker/);
assert.equal(draft.campaignStateMutated, false);
assert.equal(gameplayStateJson(draft.campaignState), beforeState);
assert.equal(draft.campaignState.runtimeTracking.modelCallJournal.some((entry) => entry.roleId === 'directiveAssist'), true);
assert.equal(draft.campaignState.commandLog.entries.length, beforeLogCount);
const assistCall = host.generation.calls().find((entry) => entry.role === 'directiveAssist');
assert(assistCall, 'Directive Assist generation call should be recorded.');
assert.equal(assistCall.request.role.id, 'directiveAssist');
assert.equal(assistCall.request.modelPreferences.cost, 'balanced');
assert.equal(assistCall.request.modelPreferences.latency, 'medium');
assert.equal(assistCall.request.modelPreferences.capability, 'authoring-assist');
assert.equal(assistCall.request.prompt.includes('hiddenFacts'), false);
assert.equal(assistCall.request.prompt.includes('relationships'), false);
assert.match(assistCall.request.prompt, /Mission Director/);
assert.match(assistCall.request.prompt, /Narration perspective contract:/);
assert.match(assistCall.request.prompt, /third person limited external/);
assert.match(assistCall.request.prompt, /Do not convert third-person player drafts into first-person "I" narration/);
assert.equal(assistCall.request.metadata.narrationContext.source, 'preset-adapter-unavailable');

const order = await app.runDirectiveAssist({
  action: 'frameAsOrder',
  inputText: 'have Priya and Bronn verify the readiness reports',
  useProvider: false
});
assert.equal(order.assistResult.source, 'deterministic-fallback');
assert.match(order.assistResult.replacementText, /Commander Talia Serrin/);
assert.match(order.assistResult.replacementText, /Captain Mara Whitaker/);
assert.match(order.assistResult.replacementText, /Coordinate across your stations/);
assert.equal(order.campaignStateMutated, false);

const brief = await app.runDirectiveAssist({
  action: 'briefMe',
  inputText: '',
  useProvider: false
});
assert.equal(brief.assistResult.replacementText, '');
assert.match(brief.assistResult.brief.summary, /Talia Serrin/);
assert(brief.assistResult.brief.known.some((line) => /U\.S\.S\. Breckenridge/.test(line)));
assert(brief.assistResult.brief.uncertain.some((line) => /hidden facts/.test(line)));
assert.equal(brief.campaignState.commandLog.entries.length, beforeLogCount);

const resolveFit = await app.runDirectiveAssist({
  action: 'checkResolve',
  inputText: 'I order Priya to preserve the transfer logs, set a deadline, and accept the delay if the evidence chain requires it.'
});
assert.equal(resolveFit.assistResult.kind, 'directive.commandBearingFitCheck');
assert.equal(resolveFit.assistResult.track, 'resolve');
assert.equal(resolveFit.assistResult.fit, 'strong');
assert.equal(resolveFit.assistResult.replacementText, '');
assert(resolveFit.assistResult.suggestions.some((line) => /authority boundary|deadline|responsibility/i.test(line)));
assert.equal(resolveFit.campaignStateMutated, false);
const commandBearingFitCall = host.generation.calls().find((entry) => entry.role === 'commandBearingFitChecker');
assert(commandBearingFitCall, 'Command Bearing Assist fit checks should use the provider-routable fit checker role.');
assert.equal(commandBearingFitCall.request.role.id, 'commandBearingFitChecker');
assert.equal(commandBearingFitCall.request.metadata.commandBearingTrack, 'resolve');

const inspirationFit = await app.runDirectiveAssist({
  action: 'checkInspiration',
  inputText: 'I invite Cross to explain the risk openly, name our shared purpose, and give the staff a voluntary path to cooperate.'
});
assert.equal(inspirationFit.assistResult.kind, 'directive.commandBearingFitCheck');
assert.equal(inspirationFit.assistResult.track, 'inspiration');
assert.equal(inspirationFit.assistResult.fit, 'strong');
assert.equal(inspirationFit.assistResult.replacementText, '');
assert(inspirationFit.assistResult.suggestions.some((line) => /shared purpose|transparent|voluntary/i.test(line)));

const mismatchFit = await app.runDirectiveAssist({
  action: 'checkInspiration',
  inputText: 'I order the bridge to secure the evidence locker before the deadline.'
});
assert.equal(mismatchFit.assistResult.track, 'inspiration');
assert.equal(mismatchFit.assistResult.fit, 'mismatch');
assert.equal(mismatchFit.assistResult.replacementText, '');

const recoveredResolve = await app.recoverCommandBearingPoint({
  recoveryId: 'assist-runtime-recover-resolve',
  track: 'resolve'
});
assert.equal(recoveredResolve.applied, true);
assert.equal(recoveredResolve.commandBearing.tracks.resolve.points, 1);
const readiedResolve = await app.readyCommandBearingPoint({
  readiedId: 'assist-runtime-readied-resolve',
  track: 'resolve'
});
assert.equal(readiedResolve.applied, true);
assert.equal(readiedResolve.commandBearing.readied.track, 'resolve');
assert.equal(readiedResolve.view.commandBearingPlayerView.readied.track, 'resolve');
assert.equal(readiedResolve.view.commandBearingPlayerView.tracks.resolve.points, 1, 'Readied points remain banked until committed spend.');
const canceledReadied = await app.cancelReadiedCommandBearingPoint({
  readiedId: 'assist-runtime-readied-resolve'
});
assert.equal(canceledReadied.applied, true);
assert.equal(canceledReadied.commandBearing.readied, null);
assert.equal(canceledReadied.view.commandBearingPlayerView.readied, null);

const activePresetHost = createFakeDirectiveHost({
  chatNative: true,
  chatOptions: {
    chatId: 'directive-assist-active-preset-chat',
    entityName: 'Captain Whitaker'
  },
  presets: {
    getNarrationContext(options = {}) {
      return {
        ...cloneJson(activeAssistNarrationContext),
        roleId: options.roleId || 'directiveAssist'
      };
    }
  },
  generationOptions: {
    responses: {
      campaignIntro: {
        providerId: 'fake-reasoning',
        text: 'The U.S.S. Breckenridge waits at readiness while Captain Whitaker turns the first operational handoff toward Commander Serrin.'
      },
      directiveAssist: {
        providerId: 'fake-directive-assist',
        model: 'fake-low-latency',
        text: JSON.stringify({
          action: 'draftInCharacter',
          title: 'Second Person Draft',
          replacementText: 'You keep your voice even. "Priya, coordinate with Bronn and give me a clean status picture before we commit."',
          notes: ['Preserved player intent.'],
          warnings: [],
          usedContext: ['active narration preset']
        }),
        usage: {
          total_tokens: 61
        }
      }
    }
  }
});
let activePresetIdSequence = 0;
const activePresetApp = createDirectiveRuntimeApp({
  host: activePresetHost,
  packageLoader: loadRuntimeAssets,
  idFactory(prefix) {
    activePresetIdSequence += 1;
    return `${prefix}-directive-assist-active-preset-${activePresetIdSequence}`;
  },
  now: createSequence([
    '2026-06-20T18:10:00.000Z',
    '2026-06-20T18:11:00.000Z',
    '2026-06-20T18:12:00.000Z'
  ])
});
await startTestCampaign(activePresetApp);
const activePresetDraft = await activePresetApp.runDirectiveAssist({
  action: 'draftInCharacter',
  inputText: 'tell Priya to coordinate with Bronn before we commit'
});
assert.equal(activePresetDraft.assistResult.source, 'provider');
assert.match(activePresetDraft.assistResult.replacementText, /^You keep/);
const activePresetAssistCall = activePresetHost.generation.calls().find((entry) => entry.role === 'directiveAssist');
assert(activePresetAssistCall, 'Directive Assist generation call should use active preset context.');
assert.equal(activePresetAssistCall.request.metadata.narrationContext.source, 'active-directive-preset');
assert.equal(activePresetAssistCall.request.metadata.narrationContext.perspectivePromptId, 'directive-pov-second-external');
assert.match(activePresetAssistCall.request.prompt, /Resolved perspective: second person external/);

const lowerAuthorityPackage = {
  manifest: {
    id: 'fixture:lower-authority',
    title: 'Lower Authority Fixture'
  },
  ship: {
    name: 'U.S.S. Testbed',
    class: 'California-class',
    commandStructure: {
      playerRank: 'Ensign',
      playerBillet: 'Operations Watch Officer',
      playerRole: 'Junior operations officer',
      captainRetainsFinalAuthority: true
    }
  },
  crew: {
    senior: [
      {
        id: 'captain-rae',
        name: 'Amara Rae',
        rank: 'Captain',
        billet: 'Commanding Officer'
      }
    ]
  },
  characterCreation: {
    roleMode: 'selectableRole'
  },
  storyArcs: {
    campaign: {
      title: 'Lower Authority Campaign'
    }
  }
};
const lowerAuthorityState = {
  campaign: {
    title: 'Lower Authority Campaign',
    currentStardate: 53100.1
  },
  player: {
    id: 'player-ensign',
    name: 'Lira Venn',
    rank: 'Ensign',
    billet: 'Operations Watch Officer',
    role: 'Junior operations officer'
  },
  ship: {
    name: 'U.S.S. Testbed',
    class: 'California-class'
  },
  mission: {
    activePhaseId: 'watch-handoff',
    formalObjectives: ['Keep the watch clean and route concerns through the bridge chain.'],
    knownFacts: []
  },
  commandLog: {
    entries: []
  },
  settings: {
    simulationMode: 'Command'
  }
};
const report = await runDirectiveAssist({
  action: 'frameAsReport',
  inputText: 'hold position until sensors are clean',
  campaignState: lowerAuthorityState,
  packageData: lowerAuthorityPackage,
  useProvider: false
});
assert.match(report.replacementText, /Ensign Lira Venn reports/);
assert.match(report.replacementText, /recommendation/i);
assert.doesNotMatch(report.replacementText, /gives the instruction clearly/i);

const looseProvider = await runDirectiveAssist({
  action: 'draftInCharacter',
  inputText: 'ask the captain for a clean status readout',
  campaignState: lowerAuthorityState,
  packageData: lowerAuthorityPackage,
  generationRouter: {
    async generate() {
      return {
        ok: true,
        response: {
          text: '{\n  "replacementText": "Ensign Lira Venn reports, \\"Captain, I recommend holding until sensors are clean.\\"\\n  "notes": []'
        },
        diagnostics: {
          providerId: 'loose-json-provider',
          model: 'loose-json-model'
        }
      };
    }
  }
});
assert.equal(looseProvider.diagnostics.providerUsed, true);
assert.match(looseProvider.replacementText, /Ensign Lira Venn reports/);
assert.equal(looseProvider.replacementText.endsWith('\\'), false);
assert.match(looseProvider.replacementText, /clean\."$/);
assert(looseProvider.warnings.some((warning) => /strict JSON/.test(warning)));

const fencedProvider = await runDirectiveAssist({
  action: 'frameAsOrder',
  inputText: 'tell Nayar to hold until the readings stabilize',
  campaignState: lowerAuthorityState,
  packageData: lowerAuthorityPackage,
  generationRouter: {
    async generate() {
      return {
        ok: true,
        response: {
          choices: [{
            message: {
              content: `Here is the JSON:
\`\`\`json
{
  "action": "frameAsOrder",
  "title": "Frame as Order",
  "replacementText": "Ensign Lira Venn keeps it concise: \\"Nayar, hold position until the readings stabilize. Route anything uncertain through the bridge before we move.\\"",
  "notes": ["Recovered from fenced provider JSON."],
  "warnings": [],
}
\`\`\``
            },
            finish_reason: 'stop'
          }]
        },
        diagnostics: {
          providerId: 'fenced-json-provider',
          model: 'fenced-json-model'
        }
      };
    }
  }
});
assert.equal(fencedProvider.source, 'provider');
assert.equal(fencedProvider.diagnostics.providerUsed, true);
assert.match(fencedProvider.replacementText, /hold position/);
assert.equal(fencedProvider.warnings.length, 0);

const plainDraftProvider = await runDirectiveAssist({
  action: 'draftInCharacter',
  inputText: 'recommend waiting for the sensor pass',
  campaignState: lowerAuthorityState,
  packageData: lowerAuthorityPackage,
  generationRouter: {
    async generate() {
      return {
        ok: true,
        response: {
          text: 'Ensign Lira Venn says, "Captain, I recommend waiting for the sensor pass before we advance."'
        },
        diagnostics: {
          providerId: 'plain-draft-provider',
          model: 'plain-draft-model'
        }
      };
    }
  }
});
assert.equal(plainDraftProvider.source, 'provider');
assert.match(plainDraftProvider.replacementText, /recommend waiting/);
assert(plainDraftProvider.warnings.some((warning) => /strict JSON/.test(warning)));

const plainBriefProvider = await runDirectiveAssist({
  action: 'briefMe',
  inputText: '',
  campaignState: lowerAuthorityState,
  packageData: lowerAuthorityPackage,
  generationRouter: {
    async generate() {
      return {
        ok: true,
        response: {
          text: 'You should know the ship is holding and the sensors are unsettled.'
        },
        diagnostics: {
          providerId: 'plain-brief-provider',
          model: 'plain-brief-model'
        }
      };
    }
  }
});
assert.equal(plainBriefProvider.source, 'deterministic-fallback');
assert.equal(plainBriefProvider.diagnostics.providerUsed, true);
assert.equal(plainBriefProvider.diagnostics.providerOutputRejected, true);
assert(plainBriefProvider.warnings.some((warning) => /invalid structured JSON/.test(warning)));

const tokenLimitedProvider = await runDirectiveAssist({
  action: 'draftInCharacter',
  inputText: 'tell Nayar to hold',
  campaignState: lowerAuthorityState,
  packageData: lowerAuthorityPackage,
  generationRouter: {
    async generate() {
      return {
        ok: true,
        response: {
          choices: [{
            message: { content: '{"replacementText":"Nayar, hold' },
            finish_reason: 'length'
          }]
        },
        diagnostics: {
          providerId: 'token-limited-provider',
          model: 'token-limited-model'
        }
      };
    }
  }
});
assert.equal(tokenLimitedProvider.source, 'deterministic-fallback');
assert.equal(tokenLimitedProvider.diagnostics.providerUsed, true);
assert.equal(tokenLimitedProvider.diagnostics.providerOutputRejected, true);
assert(tokenLimitedProvider.warnings.some((warning) => /token limit/.test(warning)));

const echoState = {
  campaign: {
    title: 'Ashes of Peace',
    currentStardate: 53319.4
  },
  player: {
    id: 'player-commander',
    name: 'Sam Vickers',
    rank: 'Commander',
    billet: 'Executive Officer',
    role: 'Executive Officer aboard U.S.S. Breckenridge'
  },
  ship: {
    name: 'U.S.S. Breckenridge',
    class: 'Intrepid-class'
  },
  mission: {
    activePhaseId: 'arrival',
    formalObjectives: ['Settle aboard and establish the executive officer handoff.'],
    knownFacts: ['Captain Mara Whitaker is Commanding Officer.']
  },
  commandLog: {
    entries: []
  },
  settings: {
    simulationMode: 'Command'
  }
};
const roughArrivalReply = 'Sam tapped the comm button on the console to reply. "Thank you Commander, I\'ll reach out as soon as I\'m settled. Vickers out."';
const nearEchoProvider = await runDirectiveAssist({
  action: 'draftInCharacter',
  inputText: roughArrivalReply,
  campaignState: echoState,
  packageData,
  generationRouter: {
    async generate() {
      return {
        ok: true,
        response: {
          choices: [{
            message: {
              content: JSON.stringify({
                action: 'draftInCharacter',
                title: 'XO arrival acknowledgement',
                replacementText: 'Sam tapped the comm button on the console. "Thank you, Captain. I\'ll reach out as soon as I\'m settled. Vickers out."',
                notes: ['Echoed the rough input.'],
                warnings: [],
                usedContext: ['player profile']
              })
            },
            finish_reason: 'stop'
          }]
        },
        diagnostics: {
          providerId: 'echoing-utility-provider',
          model: 'weak-utility-model'
        }
      };
    }
  }
});
assert.equal(nearEchoProvider.source, 'deterministic-fallback');
assert.equal(nearEchoProvider.diagnostics.providerUsed, true);
assert.equal(nearEchoProvider.diagnostics.providerOutputRejected, true);
assert(nearEchoProvider.warnings.some((warning) => /too close to the original input/i.test(warning)));
assert.match(nearEchoProvider.replacementText, /Commander Sam Vickers replies/);
assert.match(nearEchoProvider.replacementText, /Thank you, Captain/);
assert.doesNotMatch(nearEchoProvider.replacementText, /^Sam tapped the comm button/);

const povShiftProvider = await runDirectiveAssist({
  action: 'draftInCharacter',
  inputText: roughArrivalReply,
  campaignState: echoState,
  packageData,
  generationRouter: {
    async generate() {
      return {
        ok: true,
        response: {
          choices: [{
            message: {
              content: JSON.stringify({
                action: 'draftInCharacter',
                title: 'First Person Drift',
                replacementText: 'I tap the comm button on the console. "Thank you, Captain. I will reach out as soon as I am settled. Vickers out."',
                notes: ['Changed narrative person.'],
                warnings: [],
                usedContext: ['player profile']
              })
            },
            finish_reason: 'stop'
          }]
        },
        diagnostics: {
          providerId: 'pov-shifting-provider',
          model: 'weak-utility-model'
        }
      };
    }
  }
});
assert.equal(povShiftProvider.source, 'deterministic-fallback');
assert.equal(povShiftProvider.diagnostics.providerUsed, true);
assert.equal(povShiftProvider.diagnostics.providerOutputRejected, true);
assert(povShiftProvider.warnings.some((warning) => /third-person\/default-perspective/i.test(warning)));
assert.doesNotMatch(povShiftProvider.replacementText, /^I tap\b/);
assert.match(povShiftProvider.replacementText, /^Commander Sam Vickers replies/);

const hiddenState = cloneJson(lowerAuthorityState);
hiddenState.mission.hiddenFacts = [{
  id: 'director-only',
  summary: 'pale lantern'
}];
hiddenState.relationships = {
  seniorCrew: [
    {
      id: 'captain-rae',
      rawValues: {
        professionalConfidence: -2
      }
    }
  ]
};
const assistRequest = buildDirectiveAssistRequest({
  action: 'draftInCharacter',
  inputText: 'ask the captain for a clean status readout',
  campaignState: hiddenState,
  packageData: lowerAuthorityPackage
});
assert.equal(assistRequest.snapshot.safety.hiddenStateIncluded, false);
assert.equal(assistRequest.request.prompt.includes('pale lantern'), false);
assert.equal(assistRequest.request.prompt.includes('rawValues'), false);
assert.equal(assistRequest.request.prompt.includes('relationships'), false);

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  sync(value) {
    this.values = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.eventListeners = new Map();
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
    this.value = '';
    this.title = '';
    this.type = '';
    this.hidden = false;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this._id = '';
    this._className = '';
    this.classList = new FakeClassList(this);
  }

  get id() {
    return this._id;
  }

  set id(value) {
    this._id = String(value || '');
    this.ownerDocument.registerTree(this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value || '');
    this.classList.sync(this._className);
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.children.indexOf(this);
    return index >= 0 ? this.parentNode.children[index + 1] || null : null;
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    this.ownerDocument.registerTree(node);
    return node;
  }

  insertBefore(node, before = null) {
    node.parentNode = this;
    const index = before ? this.children.indexOf(before) : -1;
    if (index >= 0) this.children.splice(index, 0, node);
    else this.children.push(node);
    this.ownerDocument.registerTree(node);
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of this.children) {
      this.ownerDocument.unregisterTree(child);
      child.parentNode = null;
    }
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'id') this.id = text;
    if (name === 'class') this.className = text;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = text;
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  addEventListener(type, handler) {
    this.eventListeners.set(type, handler);
  }

  dispatchEvent(event) {
    const type = typeof event === 'string' ? event : event?.type;
    const handler = this.eventListeners.get(type);
    if (handler) handler(event);
  }

  focus() {
    this.focused = true;
  }

  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  click() {
    const handler = this.eventListeners.get('click');
    if (!handler) return undefined;
    return handler({
      type: 'click',
      target: this,
      currentTarget: this,
      preventDefault() {},
      stopPropagation() {}
    });
  }
}

class FakeDocument {
  constructor() {
    this.elementsById = new Map();
    this.body = new FakeElement('body', this);
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) || null;
  }

  querySelector(selector) {
    if (selector.startsWith('#')) return this.getElementById(selector.slice(1));
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (
          selector === child.tagName.toLowerCase()
          || (selector.startsWith('.') && child.className.split(/\s+/).includes(selector.slice(1)))
          || (selector.startsWith('#') && child.id === selector.slice(1))
        ) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this.body);
    return matches;
  }

  registerTree(element) {
    if (element.id) this.elementsById.set(element.id, element);
    for (const child of element.children) this.registerTree(child);
  }

  unregisterTree(element) {
    if (element.id && this.elementsById.get(element.id) === element) {
      this.elementsById.delete(element.id);
    }
    for (const child of element.children) this.unregisterTree(child);
  }
}

function findByDataset(element, key, value) {
  if (element.dataset?.[key] === value) return element;
  for (const child of element.children || []) {
    const match = findByDataset(child, key, value);
    if (match) return match;
  }
  return null;
}

function findByText(element, text) {
  if (element.textContent === text) return element;
  for (const child of element.children || []) {
    const match = findByText(child, text);
    if (match) return match;
  }
  return null;
}

function findClickableByText(element, text) {
  if ((element.children || []).some((child) => child.textContent === text) && element.eventListeners?.has('click')) {
    return element;
  }
  for (const child of element.children || []) {
    const match = findClickableByText(child, text);
    if (match) return match;
  }
  return null;
}

__directiveAssistButtonTestHooks.resetRecovery();
const fakeDocument = new FakeDocument();
const originalToastr = globalThis.toastr;
const toastMessages = [];
globalThis.document = fakeDocument;
globalThis.Event = class {
  constructor(type, options = {}) {
    this.type = type;
    Object.assign(this, options);
  }
};
globalThis.toastr = {
  info(message) {
    toastMessages.push(message);
  }
};

const quickButton = fakeDocument.createElement('button');
quickButton.id = 'extensionsMenuButton';
fakeDocument.body.appendChild(quickButton);
const chatInput = fakeDocument.createElement('textarea');
chatInput.id = 'send_textarea';
chatInput.value = 'rough order text';
fakeDocument.body.appendChild(chatInput);

let assistPayload = null;
let reconciliationCall = null;
let commandBearingView = {
  schemaVersion: 1,
  tracks: {
    inspiration: { track: 'inspiration', label: 'Inspiration', points: 2, pointCap: 2, marks: 1, rank: 1, rankTitle: 'Bearing I' },
    resolve: { track: 'resolve', label: 'Resolve', points: 1, pointCap: 2, marks: 1, rank: 1, rankTitle: 'Bearing I' }
  },
  reserve: { capacity: 2, current: 2 },
  readied: null
};
const commandBearingCalls = [];
let resolveAssistResult = null;
const assistResultReady = new Promise((resolve) => {
  resolveAssistResult = resolve;
});
const installed = installDirectiveAssistButton({
  async runAssist(payload) {
    assistPayload = payload;
    if (payload.action === 'checkResolve' || payload.action === 'checkInspiration') {
      const track = payload.action === 'checkResolve' ? 'resolve' : 'inspiration';
      return {
        assistResult: {
          kind: 'directive.commandBearingFitCheck',
          ok: true,
          action: payload.action,
          track,
          label: track === 'resolve' ? 'Resolve' : 'Inspiration',
          title: `Check ${track === 'resolve' ? 'Resolve' : 'Inspiration'}`,
          fit: 'strong',
          summary: `${track === 'resolve' ? 'Resolve' : 'Inspiration'} is a strong fit.`,
          whatWorks: ['The action accepts a visible cost.'],
          missing: ['Name the accountable order if the sentence stays vague.'],
          suggestions: ['Keep the action anchored in the character decision.'],
          replacementText: ''
        }
      };
    }
    await assistResultReady;
    return {
      assistResult: {
        ok: true,
        action: payload.action,
        label: 'Frame as Order',
        title: 'Frame as Order',
        replacementText: 'Commander Talia Serrin says, "Priya, coordinate with Bronn."',
        notes: ['Test note.'],
        warnings: [],
        brief: {
          summary: 'Talia is acting as XO.'
        }
      }
    };
  },
  async runReconciliation(actionId, payload) {
    reconciliationCall = { actionId, payload };
    return { ok: true };
  },
  async runCommandBearing(action, payload = {}) {
    commandBearingCalls.push({ action, payload: cloneJson(payload) });
    if (action === 'ready') {
      commandBearingView = {
        ...cloneJson(commandBearingView),
        readied: {
          id: `readied-${payload.track}`,
          track: payload.track,
          status: 'readied',
          expiresOn: 'nextPlayerMessage'
        }
      };
    }
    if (action === 'cancel') {
      commandBearingView = {
        ...cloneJson(commandBearingView),
        readied: null
      };
    }
    return {
      commandBearingPlayerView: cloneJson(commandBearingView),
      view: {
        commandBearingPlayerView: cloneJson(commandBearingView)
      }
    };
  }
});
assert.equal(installed, true);
const assistButton = fakeDocument.getElementById(DIRECTIVE_ASSIST_BUTTON_ID);
assert(assistButton, 'Directive Assist should install a chat-input button');
assert.equal(fakeDocument.body.children.indexOf(assistButton), fakeDocument.body.children.indexOf(quickButton) + 1);
const assistButtonIcon = assistButton.children.find((child) => child?.dataset?.glyph === 'route-ship');
assert(assistButtonIcon, 'Directive Assist launcher should use the shelf ship glyph');
assert.match(assistButtonIcon.className, /directive-vector-glyph/);
const assistButtonSpinner = assistButton.children.find((child) => child?.className === 'directive-assist-button-spinner');
assert(assistButtonSpinner, 'Directive Assist launcher should include a busy spinner');
assert.equal(assistButton.getAttribute('aria-busy'), 'false');
await assistButton.click();
const assistMenu = fakeDocument.getElementById(DIRECTIVE_ASSIST_MENU_ID);
assert.equal(assistMenu.hidden, false);
assert.deepEqual(commandBearingCalls[0], { action: 'view', payload: {} });
const inspirationCount = findByDataset(assistMenu, 'directiveCommandBearingCount', 'inspiration');
const resolveCount = findByDataset(assistMenu, 'directiveCommandBearingCount', 'resolve');
assert.equal(inspirationCount.textContent, '2 pts');
assert.equal(inspirationCount.getAttribute('aria-label'), 'Inspiration points: 2');
assert.equal(resolveCount.textContent, '1 pt');
assert.equal(resolveCount.getAttribute('aria-label'), 'Resolve points: 1');
const resolveReadyButton = findByDataset(assistMenu, 'directiveCommandBearingTrack', 'resolve');
assert(resolveReadyButton, 'Assist menu should expose Ready Resolve.');
assert(findByText(resolveReadyButton, 'Ready'), 'Assist menu should label the compact action Ready.');
assert.equal(resolveReadyButton.getAttribute('aria-label'), 'Ready Resolve');
assert.equal(resolveReadyButton.dataset.directiveCommandBearingAction, 'ready');
await resolveReadyButton.click();
assert.deepEqual(commandBearingCalls.at(-1), { action: 'ready', payload: { track: 'resolve' } });
const resolveCancelButton = findByDataset(assistMenu, 'directiveCommandBearingTrack', 'resolve');
assert.equal(resolveCancelButton.dataset.directiveCommandBearingAction, 'cancel');
assert(findByText(resolveCancelButton, 'Cancel'), 'Assist menu should label the compact cancel action Cancel.');
assert.equal(resolveCancelButton.getAttribute('aria-label'), 'Cancel Readied Resolve point');
await resolveCancelButton.click();
assert.deepEqual(commandBearingCalls.at(-1), { action: 'cancel', payload: { readiedId: 'readied-resolve' } });
for (const actionId of ['draftInCharacter', 'briefMe', 'frameAsOrder', 'frameAsReport']) {
  const action = findByDataset(assistMenu, 'directiveAssistAction', actionId);
  assert(action, `Directive Assist menu should expose ${actionId}`);
  assert.equal(action.dataset.directiveTour, `assist.action.${actionId}`);
}
for (const actionId of ['continueScene', 'cutWithinScene']) {
  const action = findByDataset(assistMenu, 'directiveAssistAction', actionId);
  assert(action, `Directive Assist menu should expose ${actionId}`);
  assert.equal(action.dataset.directiveTour, `assist.action.${actionId}`);
}
const continueShortcut = __directiveAssistButtonTestHooks.createSceneNavigationShortcutResult({
  action: 'continueScene',
  chatInput
});
assert.equal(continueShortcut.source, 'local-scene-navigation-shortcut');
assert.equal(continueShortcut.replacementText, 'Continue the scene.');
const cutShortcut = __directiveAssistButtonTestHooks.createSceneNavigationShortcutResult({
  action: 'cutWithinScene',
  chatInput
});
assert.equal(cutShortcut.source, 'local-scene-navigation-shortcut');
assert.equal(cutShortcut.replacementText, 'Cut within the current scene to rough order text');
const checkResolveAction = findByDataset(assistMenu, 'directiveAssistAction', 'checkResolve');
assert(checkResolveAction, 'Directive Assist menu should expose Check Resolve.');
assert.equal(checkResolveAction.getAttribute('aria-label'), 'Check Resolve');
await checkResolveAction.click();
assert.deepEqual(assistPayload, {
  action: 'checkResolve',
  inputText: 'rough order text'
});
const fitPreview = fakeDocument.getElementById(DIRECTIVE_ASSIST_PREVIEW_ID);
assert.equal(fitPreview.hidden, false);
assert(findByText(fitPreview, 'Resolve is a strong fit.'), 'Fit check should render its report.');
assert(findByText(fitPreview, 'What works'), 'Fit check should label what works.');
assert(findByText(fitPreview, 'Missing'), 'Fit check should label missing alignment.');
assert(findByText(fitPreview, 'Tip'), 'Fit check should label the player-authored improvement tip.');
assert.equal(findClickableByText(fitPreview, 'Apply to Chat'), null, 'Fit checks must not offer to rewrite the player message.');
const orderAction = findByDataset(assistMenu, 'directiveAssistAction', 'frameAsOrder');
assert(orderAction, 'Directive Assist menu should expose Frame as Order');
const markedReconciliationAction = findByDataset(assistMenu, 'directiveReconciliationAction', 'reconcileMarked');
assert(markedReconciliationAction, 'Directive Assist menu should expose Reconcile Marked Passage');
assert.equal(markedReconciliationAction.dataset.directiveTour, 'assist.reconciliation.reconcileMarked');
assert.equal(markedReconciliationAction.dataset.directiveTooltip, 'Reconcile the marked start and end passage. Missing markers will be reported without changing state.');
const pendingReconciliationAction = findByDataset(assistMenu, 'directiveReconciliationAction', 'openPending');
assert(pendingReconciliationAction, 'Directive Assist menu should expose Open Pending Reconciliation');
assert.equal(pendingReconciliationAction.dataset.directiveTour, 'assist.reconciliation.openPending');
assert.equal(pendingReconciliationAction.dataset.directiveTooltip, 'Review consequential or conflicting reconciliation items that were not applied automatically.');
const orderActionPending = orderAction.click();
assert.deepEqual(assistPayload, {
  action: 'frameAsOrder',
  inputText: 'rough order text'
});
assert.equal(toastMessages.at(-1), 'Frame as Order is generating.');
assert.equal(assistButton.dataset.directiveAssistBusy, 'true');
assert.equal(assistButton.getAttribute('aria-busy'), 'true');
resolveAssistResult();
await orderActionPending;
assert.equal(assistButton.dataset.directiveAssistBusy, 'false');
assert.equal(assistButton.getAttribute('aria-busy'), 'false');
await pendingReconciliationAction.click();
assert.deepEqual(reconciliationCall, {
  actionId: 'reconciliation.openPending',
  payload: {}
});
const preview = fakeDocument.getElementById(DIRECTIVE_ASSIST_PREVIEW_ID);
assert.equal(preview.hidden, false);
assert.equal(chatInput.value, 'rough order text');
const cancelButton = findClickableByText(preview, 'Cancel');
assert(cancelButton, 'Directive Assist preview should expose a cancel control');
assert.equal(cancelButton.dataset.directiveAssistPreviewAction, 'cancel');
assert.equal(cancelButton.dataset.directiveTour, 'assist.preview.cancel');
const cancelIcon = cancelButton.children.find((child) => child?.dataset?.glyph === 'action-close');
assert(cancelIcon, 'Directive Assist preview cancel should use the shared action-close glyph');
assert.match(cancelIcon.className, /directive-vector-glyph/);
const applyButton = findClickableByText(preview, 'Apply to Chat') || findByText(preview, 'Apply to Chat');
assert(applyButton, 'Directive Assist preview should require Apply to Chat before replacing input');
assert.equal(applyButton.dataset.directiveAssistPreviewAction, 'applyToChat');
assert.equal(applyButton.dataset.directiveTour, 'assist.preview.applyToChat');
const tryAgainButton = findClickableByText(preview, 'Try Again');
assert(tryAgainButton, 'Directive Assist preview should expose Try Again');
assert.equal(tryAgainButton.dataset.directiveAssistPreviewAction, 'tryAgain');
assert.equal(tryAgainButton.dataset.directiveTour, 'assist.preview.tryAgain');
applyButton.click();
assert.equal(chatInput.value, 'Commander Talia Serrin says, "Priya, coordinate with Bronn."');
assert.equal(__directiveAssistButtonTestHooks.getLastRecovery().original, 'rough order text');
globalThis.toastr = originalToastr;

console.log('Directive Assist tests passed.');
