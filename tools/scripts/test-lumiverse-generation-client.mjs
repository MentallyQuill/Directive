import assert from 'node:assert/strict';

import { createLumiverseGenerationClient } from '../../src/hosts/lumiverse/generation-client.mjs';

const calls = [];
const client = createLumiverseGenerationClient({
  spindle: {
    generate: {
      async quiet(input) {
        calls.push({ method: 'quiet', input });
        return {
          content: `quiet:${input.messages[0].content}`,
          finish_reason: 'stop',
          usage: {
            total_tokens: 10
          }
        };
      },
      async raw(input) {
        calls.push({ method: 'raw', input });
        return {
          content: `raw:${input.messages[0].content}`,
          tool_calls: [
            {
              name: 'test_tool',
              args: {},
              call_id: 'tool-1'
            }
          ]
        };
      },
      async batch(input) {
        calls.push({ method: 'batch', input });
        return input.requests.map((request, index) => (
          index === 1
            ? {
                index,
                success: false,
                error: 'failed item'
              }
            : {
                index,
                success: true,
                content: `batch:${request.messages[0].content}`
            }
        ));
      },
      observe(chatId) {
        calls.push({ method: 'observe', chatId });
        return {
          chatId,
          dispose() {}
        };
      }
    }
  },
  modeByRole: {
    utilityJson: 'raw'
  }
});

const quiet = await client.generate('narration', {
  prompt: 'Narrate safely.'
});
assert.equal(quiet.providerId, 'lumiverse-spindle');
assert.equal(quiet.roleId, 'narration');
assert.equal(quiet.text, 'quiet:Narrate safely.');
assert.equal(quiet.finishReason, 'stop');
assert.equal(quiet.usage.total_tokens, 10);
assert.equal(calls[0].method, 'quiet');
assert.deepEqual(calls[0].input.messages, [
  {
    role: 'user',
    content: 'Narrate safely.'
  }
]);

const raw = await client.generate('utilityJson', {
  messages: [
    {
      role: 'system',
      content: 'Return JSON only.'
    }
  ],
  parameters: {
    temperature: 0.1
  },
  connectionId: 'connection-1',
  tools: [
    {
      name: 'directive_get_active_situation',
      parameters: {
        type: 'object'
      }
    }
  ]
});
assert.equal(raw.text, 'raw:Return JSON only.');
assert.equal(raw.toolCalls[0].name, 'test_tool');
assert.equal(calls[1].method, 'raw');
assert.equal(calls[1].input.connection_id, 'connection-1');
assert.equal(calls[1].input.parameters.temperature, 0.1);
assert.equal(calls[1].input.tools[0].name, 'directive_get_active_situation');

const batch = await client.batch([
  {
    roleId: 'continuityTracker',
    prompt: 'Track continuity.'
  },
  {
    roleId: 'crewDirector',
    prompt: 'Track crew.'
  }
], {
  concurrent: true
});
assert.equal(calls[2].method, 'batch');
assert.equal(calls[2].input.concurrent, true);
assert.equal(batch[0].text, 'batch:Track continuity.');
assert.equal(batch[0].success, true);
assert.equal(batch[1].success, false);
assert.equal(batch[1].error.code, 'DIRECTIVE_LUMIVERSE_BATCH_ITEM_FAILED');
assert.equal(batch[1].roleId, 'crewDirector');

const observer = client.observe('chat-1');
assert.equal(observer.chatId, 'chat-1');
assert.equal(calls[3].method, 'observe');

const unknownMode = createLumiverseGenerationClient({
  spindle: {
    generate: {
      async quiet() {
        return {};
      }
    }
  },
  defaultMode: 'stream'
});
await assert.rejects(
  () => unknownMode.generate('narration', {}),
  /Unknown Lumiverse generation mode/
);

assert.throws(
  () => createLumiverseGenerationClient({ spindle: {} }),
  /spindle\.generate/
);

console.log('Lumiverse generation client tests passed.');
