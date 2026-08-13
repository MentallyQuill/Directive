import assert from 'node:assert/strict';

import { renderShipPanel } from '../../src/ui/ship-panel.js';

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
    this.title = '';
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
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
  ].join(' ').replace(/\s+/g, ' ').trim();
}

function allElements(element) {
  return [
    element,
    ...element.children.flatMap(allElements)
  ];
}

function elementsByClass(element, className) {
  return allElements(element).filter((item) => String(item.className || '').split(/\s+/).includes(className));
}

globalThis.document = new FakeDocument();

const body = document.createElement('main');
renderShipPanel(body, {
  activePackage: { assets: {} },
  campaignState: { campaign: { title: 'Ashes of Peace' } },
  v1PlayerProjection: {
    kind: 'directive.playerProjection.v1',
    player: {
      kind: 'directive.playerIdentityProjection.v1',
      id: 'player-commander',
      name: 'Ren Okada',
      rank: 'Commander',
      billet: 'Executive Officer'
    },
    mission: { kind: 'directive.missionPlayerProjection.v1' },
    people: { kind: 'directive.peoplePlayerProjection.v1' },
    commandBearing: { kind: 'directive.commandBearingPlayerProjection.v1' },
    ship: {
      kind: 'directive.shipPlayerProjection.v1',
      shipId: 'uss-breckenridge',
      id: 'uss-breckenridge',
      name: 'U.S.S. Breckenridge',
      class: 'Intrepid-class',
      registry: 'NCC-74656',
      capabilitySummary: 'A long-range explorer returned to service after modernization.',
      operationalStatus: {
        status: 'serviceable',
        summary: 'Certified for service while integrated validation continues.',
        readiness: null,
        materialLimitations: [{
          id: 'warp-temporary-limit',
          summary: 'Maximum warp is temporarily restricted pending integrated validation.'
        }],
        readinessObjectiveLink: null
      }
    }
  }
});

const renderedText = textOf(body);
assert.match(renderedText, /Maximum warp is temporarily restricted pending integrated validation/);
assert.match(renderedText, /Certified for service while integrated validation continues/);
assert.match(renderedText, /Operational status/);
assert.match(renderedText, /Material limitations/);
assert.doesNotMatch(renderedText, /\[object Object\]/);
assert.equal(elementsByClass(body, 'ship-operational-status').length, 1);
assert.equal(elementsByClass(body, 'ship-board-section').length, 1);

delete globalThis.document;

console.log('Ship panel tests passed: one player-safe operational aggregate renders without tracking spam');
