import assert from 'node:assert/strict';

import {
  createLumiverseToolAdapter,
  normalizeDirectiveToolRegistration
} from '../../src/hosts/lumiverse/tools-adapter.mjs';

function createFakeSpindleTools() {
  const handlers = new Map();
  return {
    registered: [],
    unregistered: [],
    on(eventName, handler) {
      handlers.set(eventName, handler);
      return () => handlers.delete(eventName);
    },
    registerTool(tool) {
      this.registered.push(tool);
    },
    unregisterTool(name) {
      this.unregistered.push(name);
    },
    async invoke(payload) {
      return handlers.get('TOOL_INVOCATION')?.(payload);
    },
    hasInvocationHandler() {
      return handlers.has('TOOL_INVOCATION');
    }
  };
}

const normalized = normalizeDirectiveToolRegistration({
  name: 'directive_get_active_situation',
  displayName: 'Active Situation',
  description: 'Return player-safe Directive situation context.',
  councilEligible: true
});
assert.equal(normalized.display_name, 'Active Situation');
assert.equal(normalized.council_eligible, true);
assert.deepEqual(normalized.parameters, {
  type: 'object',
  properties: {},
  additionalProperties: false
});

const spindle = createFakeSpindleTools();
const adapter = createLumiverseToolAdapter({ spindle });

adapter.registerTool({
  name: 'directive_get_active_situation',
  display_name: 'Active Situation',
  description: 'Return player-safe Directive situation context.',
  parameters: {
    type: 'object',
    properties: {
      includeOrders: {
        type: 'boolean'
      }
    },
    additionalProperties: false
  },
  council_eligible: true
}, async (invocation) => {
  assert.equal(invocation.toolName, 'directive_get_active_situation');
  assert.equal(invocation.args.includeOrders, true);
  assert.equal(invocation.councilMember.name, 'Analyst');
  return {
    summary: 'Convoy window is narrowing.'
  };
});

assert.equal(spindle.registered.length, 1);
assert.equal(spindle.registered[0].name, 'directive_get_active_situation');
assert.equal(spindle.registered[0].council_eligible, true);
assert.equal(adapter.registeredTools().length, 1);
assert.equal(spindle.hasInvocationHandler(), true);

const result = await spindle.invoke({
  toolName: 'directive_get_active_situation',
  args: {
    includeOrders: true
  },
  requestId: 'request-1',
  councilMember: {
    name: 'Analyst'
  },
  contextMessages: [
    {
      role: 'user',
      content: 'Status?'
    }
  ]
});
assert.equal(result, '{"summary":"Convoy window is narrowing."}');

const unknown = await spindle.invoke({
  toolName: 'directive_missing_tool',
  args: {}
});
assert.equal(unknown, 'Unknown Directive tool: directive_missing_tool');

adapter.registerTool({
  name: 'directive_get_failure',
  display_name: 'Failure',
  description: 'Throw for failure containment.'
}, async () => {
  throw new Error('tool offline');
});
const failed = await spindle.invoke({
  toolName: 'directive_get_failure',
  args: {}
});
assert.equal(failed, 'Directive tool directive_get_failure failed: tool offline');
adapter.unregisterTool('directive_get_failure');

adapter.unregisterTool('directive_get_active_situation');
assert.equal(spindle.unregistered.includes('directive_get_active_situation'), true);
assert.equal(adapter.registeredTools().length, 0);

adapter.registerTool({
  name: 'directive_get_ship_status',
  display_name: 'Ship Status',
  description: 'Return player-safe ship status.'
}, async () => 'Ship stable.');
adapter.disposeAll();
assert.equal(spindle.unregistered.includes('directive_get_ship_status'), true);
assert.equal(spindle.hasInvocationHandler(), false);

assert.throws(
  () => normalizeDirectiveToolRegistration({
    name: 'directive:get_bad',
    display_name: 'Bad',
    description: 'Bad'
  }),
  /Invalid Lumiverse tool name/
);

console.log('Lumiverse tools adapter tests passed.');
