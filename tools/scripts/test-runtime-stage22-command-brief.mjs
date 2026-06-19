import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  commitProvisionalDirectorTurnRuntime,
  createProvisionalDirectorTurnRuntime
} from '../../src/runtime/director-turn-runtime.mjs';
import { renderMissionPanel } from '../../src/ui/mission-panel.js';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
    this.value = '';
    this.type = '';
    this.disabled = false;
    this.rows = 0;
    this.title = '';
    this._className = '';
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = String(value || '');
  }

  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === 'class') this.className = normalized;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = normalized;
    }
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  addEventListener() {}

  querySelectorAll(selector) {
    const matches = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (selector === '[data-input-path]' && typeof child.dataset.inputPath === 'string') {
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
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

function textOf(element) {
  return [
    element.textContent || '',
    ...element.children.map(textOf)
  ].join(' ');
}

function assertHiddenTermsAbsent(text) {
  for (const term of [
    'Lantern',
    'Compact recovery team',
    'no pathogen',
    'false quarantine order',
    'transponder modules'
  ]) {
    assert.equal(text.toLowerCase().includes(term.toLowerCase()), false, `must not leak hidden term "${term}"`);
  }
}

const competenceFixture = readJson('tests/fixtures/competence/chapter-1-opening.competence.fixture.json');
const projection = readJson('packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json');
const crewDataset = readJson('packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json');
const graph = readJson('packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json');
graph.competencePolicy = cloneJson(competenceFixture.policy);

const campaignState = cloneJson(projection.initialState);
campaignState.player.name = 'Talia Serrin';
campaignState.player.creationStatus = 'ready';

const preview = createProvisionalDirectorTurnRuntime({
  campaignState,
  graph,
  projection,
  crewDataset,
  graphPath: 'packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json',
  projectionPath: 'packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json',
  turnId: 'turn.stage22.command-brief.001',
  playerInput: 'Take us in and prepare to help. Start verifying the signal while we assess rescue posture.',
  sceneSnapshotOverrides: {
    knownFactIds: ['chapter-1.relief-convoy-distress-packet'],
    conditionIds: ['chapter-1.relief-convoy-distress-packet']
  }
});

const packet = preview.turnPacket.competencePacket;
assert.equal(packet.kind, 'directive.competencePacket');
assert.deepEqual(
  packet.routineActions.map((action) => action.id),
  [
    'routine.distress.log-auth-preserve',
    'routine.distress.medical-engineering-ready'
  ]
);
assert.equal(packet.commandBrief.commandQuestion.id, 'question.initial-convoy-posture');
assert.equal(preview.competencePacket.commandBrief.knownFacts.length, 2);
assertHiddenTermsAbsent(JSON.stringify(packet));

const committed = commitProvisionalDirectorTurnRuntime({
  campaignState,
  turnPacket: preview.turnPacket
});
const commandCompetence = committed.campaignState.commandCompetence;
assert.equal(commandCompetence.assumedActionsLedger.length, 2);
assert.equal(commandCompetence.assumedActionsLedger[0].sourceOutcomeId, committed.turnPacket.outcomePacket.id);
assert.equal(commandCompetence.authorityNotesLedger.some((record) => record.id === 'authority.xo-captain-final-authority'), true);
assert.equal(committed.campaignState.turnLedger.entries.at(-1).competencePacket.kind, 'directive.competencePacket');

globalThis.document = new FakeDocument();
const body = document.createElement('main');
renderMissionPanel(body, {
  campaignState,
  pendingDirectorTurn: preview.turnPacket,
  activePackage: {
    campaign: {
      chapters: []
    }
  },
  starships: {
    saves: []
  }
}, {
  previewDirectorTurn() {},
  commitProvisionalDirectorTurn() {},
  discardProvisionalDirectorTurn() {},
  refresh() {},
  saveCurrentGame() {},
  saveCurrentGameAs() {},
  retryNarrationForLastTurn() {},
  previewOutcomeReplacement() {},
  deleteCommittedOutcome() {}
});
const renderedText = textOf(body);
assert.match(renderedText, /Command Brief/);
assert.match(renderedText, /Routine Response/);
assert.match(renderedText, /Relief Convoy Twelve is powered and in formation/);
assert.match(renderedText, /Command Question/);
assertHiddenTermsAbsent(renderedText);
delete globalThis.document;

console.log('Stage 22 Command Brief runtime tests passed: competence preview, commit ledgers, Mission panel render');
