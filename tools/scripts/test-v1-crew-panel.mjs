import assert from 'node:assert/strict';

import { renderCrewPanel } from '../../src/ui/crew-panel.js';
import { createPeopleDetail } from '../../src/ui/people-journal.js';

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
    this.className = '';
    this.listeners = new Map();
    this.clickCount = 0;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  async click() {
    this.clickCount += 1;
    return this.listeners.get('click')?.({ preventDefault() {}, stopPropagation() {} });
  }

  async dispatch(type) {
    return this.listeners.get(type)?.({ preventDefault() {}, stopPropagation() {} });
  }

  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === 'class') this.className = normalized;
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

function allElements(element) {
  return [element, ...element.children.flatMap(allElements)];
}

function elementsByClass(element, className) {
  return allElements(element).filter((item) => String(item.className || '').split(/\s+/).includes(className));
}

function textOf(element) {
  return [element.textContent || '', ...element.children.map(textOf)].join(' ').replace(/\s+/g, ' ').trim();
}

globalThis.document = new FakeDocument();

const body = document.createElement('main');
const importedFiles = [];
let removedPortraits = 0;
let refreshes = 0;
renderCrewPanel(body, {
  campaignState: { campaign: { title: 'Ashes of Peace' } },
  media: { playerPortraitImportSupported: true },
  v1PlayerProjection: {
    kind: 'directive.playerProjection.v1',
    time: { kind: 'directive.timePlayerProjection.v1', stardate: 53068.4, secondOfDay: 30600, clockDisplay: '08:30:00', stardateDisplay: '53068.4' },
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
      portrait: {
        kind: 'directive.playerPortrait',
        asset: {
          path: '/user/files/directive-player-portrait-campaign-1.webp',
          alt: 'Portrait of Commander Ren Okada',
          focalPoint: { x: 0.4, y: 0.6 }
        }
      }
    },
    mission: { kind: 'directive.missionPlayerProjection.v1' },
    people: {
      kind: 'directive.peoplePlayerProjection.v1',
      people: [{
        id: 'captain-whitaker',
        name: 'Captain Whitaker',
        billet: 'Commanding Officer',
        profileSummary: 'An experienced captain.',
        relationshipPosture: null,
        moments: []
      }]
    },
    ship: { kind: 'directive.shipPlayerProjection.v1' },
    commandBearing: {
      kind: 'directive.commandBearingPlayerProjection.v1',
      balance: 1,
      capacity: 3,
      latestAwardReason: null,
      pendingEdge: null,
      latestSpend: null
    }
  }
}, {
  async importCampaignPlayerPortrait(options) { importedFiles.push(options.file); },
  async removeCampaignPlayerPortrait() { removedPortraits += 1; },
  async refresh() { refreshes += 1; }
});

const playerCards = elementsByClass(body, 'people-detail');
assert.equal(playerCards.length, 2, 'desktop and phone compositions render from the same commander record');
assert.match(textOf(playerCards[0]), /Ren Okada/);
assert.match(textOf(playerCards[0]), /Commander \/ Executive Officer/);
assert.match(textOf(playerCards[0]), /Human/);
assert.match(textOf(playerCards[0]), /Attentive and deliberate/);

const portraits = elementsByClass(playerCards[0], 'directive-player-portrait-image');
assert.equal(portraits.length, 1);
assert.equal(portraits[0].src, '/user/files/directive-player-portrait-campaign-1.webp');
assert.equal(portraits[0].alt, 'Portrait of Commander Ren Okada');

const all = allElements(body);
const playerIndex = all.indexOf(playerCards[0]);
const commandBearingIndex = all.indexOf(elementsByClass(body, 'directive-command-bearing-strip')[0]);
assert.ok(commandBearingIndex >= 0 && commandBearingIndex < playerIndex);
const portraitControlGroups = elementsByClass(body, 'directive-crew-player-portrait-controls');
assert.equal(portraitControlGroups.length, 2);
for (const group of portraitControlGroups) {
  assert.equal(String(group.parentNode.className).split(/\s+/).includes('people-detail-portrait'), true);
  assert.doesNotMatch(textOf(group), /Add image|Replace image|Remove image/);
}
assert.equal(elementsByClass(body, 'directive-crew-player-portrait-upload').length, 2);
assert.equal(elementsByClass(body, 'directive-crew-player-portrait-remove').length, 2);
assert.equal(elementsByClass(body, 'directive-crew-player-portrait-upload-icon').length, 2);
assert.equal(elementsByClass(body, 'directive-crew-player-portrait-remove-icon').length, 2);

const portraitInputs = elementsByClass(body, 'directive-crew-player-portrait-input');
assert.equal(portraitInputs.length, 2);
await elementsByClass(body, 'directive-crew-player-portrait-upload')[0].click();
assert.equal(portraitInputs[0].clickCount, 1);
const replacementFile = { name: 'replacement.webp', type: 'image/webp' };
portraitInputs[0].files = [replacementFile];
await portraitInputs[0].dispatch('change');
assert.deepEqual(importedFiles, [replacementFile]);
assert.equal(refreshes, 1);
assert.equal(portraitInputs[0].value, '');

globalThis.confirm = () => { throw new Error('Crew portrait removal must use inline confirmation.'); };
const desktopPortraitControls = portraitControlGroups[0];
await elementsByClass(desktopPortraitControls, 'directive-crew-player-portrait-remove')[0].click();
assert.equal(removedPortraits, 0);
assert.equal(refreshes, 1);
assert.equal(elementsByClass(desktopPortraitControls, 'directive-crew-player-portrait-upload').length, 0);
assert.equal(elementsByClass(desktopPortraitControls, 'directive-crew-player-portrait-remove').length, 0);
assert.equal(elementsByClass(desktopPortraitControls, 'directive-crew-player-portrait-confirm').length, 1);
assert.equal(elementsByClass(desktopPortraitControls, 'directive-crew-player-portrait-cancel').length, 1);

await elementsByClass(desktopPortraitControls, 'directive-crew-player-portrait-cancel')[0].click();
assert.equal(elementsByClass(desktopPortraitControls, 'directive-crew-player-portrait-upload').length, 1);
assert.equal(elementsByClass(desktopPortraitControls, 'directive-crew-player-portrait-remove').length, 1);
assert.equal(removedPortraits, 0);
assert.equal(refreshes, 1);

await elementsByClass(desktopPortraitControls, 'directive-crew-player-portrait-remove')[0].click();
await elementsByClass(desktopPortraitControls, 'directive-crew-player-portrait-confirm')[0].click();
assert.equal(removedPortraits, 1);
assert.equal(refreshes, 2);

const whitakerRecord = {
  id: 'captain-whitaker',
  name: 'Captain Whitaker',
  billet: 'Commanding Officer',
  isPlayer: false,
  portrait: null,
  species: 'Human',
  service: {
    organization: 'starfleet',
    department: 'command',
    rankCode: 'captain',
    rankLabel: 'Captain'
  },
  publicRecord: {
    age: '47',
    birthplace: 'Kingston, Ontario, Earth',
    serviceBackground: 'Science operations, diplomacy, executive command',
    assignmentHistory: "Commanding officer since the Breckenridge's 2372 commission"
  }
};
const npcDetail = createPeopleDetail({ packageData: { assets: { images: [] } } }, whitakerRecord, {
  view: { media: { playerPortraitImportSupported: true } },
  actions: {
    async importCampaignPlayerPortrait() {},
    async removeCampaignPlayerPortrait() {}
  }
});
assert.equal(elementsByClass(npcDetail, 'directive-crew-player-portrait-controls').length, 0);
const mobileNpcDetail = createPeopleDetail(
  { packageData: { assets: { images: [] } } },
  whitakerRecord,
  { mobile: true }
);
for (const detail of [npcDetail, mobileNpcDetail]) {
  const text = textOf(detail);
  assert.match(text, /Human/);
  assert.match(text, /Service record/);
  assert.match(text, /Age 47/);
  assert.match(text, /Birthplace Kingston, Ontario, Earth/);
  assert.match(text, /Service background Science operations, diplomacy, executive command/);
  assert.match(text, /Assignment history Commanding officer since the Breckenridge's 2372 commission/);
  assert.equal(elementsByClass(detail, 'people-service-record').length, 1);
}

const publicContactDetail = createPeopleDetail({ packageData: { assets: { images: [] } } }, {
  id: 'person.emergent.ari',
  name: 'Ari Sol',
  billet: 'Damage-control specialist',
  isPlayer: false,
  portrait: null,
  species: 'Human',
  service: null,
  publicRecord: {
    affiliation: 'U.S.S. Breckenridge engineering division',
    birthplace: 'Nairobi, Earth'
  }
});
assert.match(textOf(publicContactDetail), /Public record/);
assert.match(textOf(publicContactDetail), /Affiliation U\.S\.S\. Breckenridge engineering division/);

const recordWithoutAssignmentHistory = createPeopleDetail({ packageData: { assets: { images: [] } } }, {
  ...whitakerRecord,
  publicRecord: {
    age: '47',
    birthplace: 'Kingston, Ontario, Earth',
    serviceBackground: 'Science operations, diplomacy, executive command'
  }
});
assert.doesNotMatch(textOf(recordWithoutAssignmentHistory), /Assignment history/);

const playerWithoutPortrait = createPeopleDetail({ packageData: { assets: { images: [] } } }, {
  id: 'player-commander',
  name: 'Ren Okada',
  billet: 'Executive Officer',
  isPlayer: true,
  portrait: null
}, {
  view: { media: { playerPortraitImportSupported: true } },
  actions: {
    async importCampaignPlayerPortrait() {},
    async removeCampaignPlayerPortrait() {}
  }
});
assert.equal(elementsByClass(playerWithoutPortrait, 'directive-crew-player-portrait-upload').length, 1);
assert.equal(elementsByClass(playerWithoutPortrait, 'directive-crew-player-portrait-remove')[0].disabled, true);

const unsupportedPlayerDetail = createPeopleDetail({ packageData: { assets: { images: [] } } }, {
  id: 'player-commander',
  name: 'Ren Okada',
  billet: 'Executive Officer',
  isPlayer: true,
  portrait: {
    kind: 'directive.playerPortrait',
    asset: { path: '/user/files/directive-player-portrait-existing.webp' }
  }
}, {
  view: { media: { playerPortraitImportSupported: false } },
  actions: {
    async importCampaignPlayerPortrait() {},
    async removeCampaignPlayerPortrait() {}
  }
});
assert.equal(elementsByClass(unsupportedPlayerDetail, 'directive-crew-player-portrait-upload')[0].disabled, true);
assert.equal(elementsByClass(unsupportedPlayerDetail, 'directive-crew-player-portrait-remove')[0].disabled, true);

delete globalThis.document;
delete globalThis.confirm;

console.log('PASS V1 Crew panel commander presentation');
