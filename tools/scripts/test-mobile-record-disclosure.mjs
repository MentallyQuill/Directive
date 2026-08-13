import assert from 'node:assert/strict';
import { installFakeDom } from './helpers/fake-dom.mjs';
import { bindSingleOpenDisclosure } from '../../src/ui/mobile-record-disclosure.js';

const document = installFakeDom();

function record(key) {
  const trigger = document.createElement('button');
  trigger.id = `trigger-${key}`;
  const panel = document.createElement('section');
  panel.id = `panel-${key}`;
  document.body.append(trigger, panel);
  return { key, trigger, panel };
}

const alpha = record('alpha');
const beta = record('beta');
const opened = [];
const controller = bindSingleOpenDisclosure({
  records: [alpha, beta],
  initialOpenKey: 'alpha',
  onOpen: (key) => opened.push(key)
});

assert.equal(controller.getOpenKey(), 'alpha');
assert.equal(alpha.trigger.getAttribute('aria-expanded'), 'true');
assert.equal(alpha.trigger.getAttribute('aria-controls'), alpha.panel.id);
assert.equal(alpha.panel.hidden, false);
assert.equal(beta.trigger.getAttribute('aria-expanded'), 'false');
assert.equal(beta.panel.hidden, true);
assert.deepEqual(opened, [], 'initial state must not masquerade as a user selection');

const alphaTrigger = alpha.trigger;
const betaPanel = beta.panel;
beta.trigger.focus();
await beta.trigger.click();

assert.equal(controller.getOpenKey(), 'beta');
assert.equal(alpha.trigger.getAttribute('aria-expanded'), 'false');
assert.equal(alpha.panel.hidden, true);
assert.equal(beta.trigger.getAttribute('aria-expanded'), 'true');
assert.equal(beta.panel.hidden, false);
assert.equal(document.activeElement, beta.trigger, 'disclosure must preserve activating focus');
assert.equal(alpha.trigger, alphaTrigger, 'disclosure must patch existing triggers');
assert.equal(beta.panel, betaPanel, 'disclosure must patch existing panels');
assert.deepEqual(opened, ['beta']);

await beta.trigger.click();

assert.equal(controller.getOpenKey(), null);
assert.equal(alpha.panel.hidden, true);
assert.equal(beta.panel.hidden, true);
assert.deepEqual(opened, ['beta'], 'collapse-all must not select a record');

controller.setOpenKey('missing');
assert.equal(controller.getOpenKey(), null, 'unknown keys must collapse safely');

console.log('PASS mobile record disclosure');
