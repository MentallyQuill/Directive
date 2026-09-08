import assert from 'node:assert/strict';
import { createSillyTavernGenerationClient } from '../../src/hosts/sillytavern/generation-client.mjs';
let auxiliaryCalls = 0;
const requests = [];
const client = createSillyTavernGenerationClient({
  contextFactory: () => ({ generateRaw: async request => { requests.push(request); return 'The hatch stood closed.'; } }),
  providerClient: { generate: async () => { auxiliaryCalls++; return { text: 'wrong lane' }; } }
});
assert.equal(typeof client.generateNarration, 'function', 'opening needs a current-model narration entry point');
const result = await client.generateNarration({systemPrompt:'Selected third person limited, past tense. Prose guidance.',prompt:'Opening direction',signal:new AbortController().signal});
assert.equal(auxiliaryCalls,0);
assert.equal(result.text,'The hatch stood closed.');
assert.match(requests[0].systemPrompt,/Prose guidance/);
assert.equal(requests[0].prompt,'Opening direction');
assert(requests[0].signal);
console.log('Current-model opening narration route passed.');
await client.generateNarration({messages:[{role:'system',content:'Narration policy.'},{role:'user',content:'Scene direction.'}]});
assert.equal(requests[1].systemPrompt,'Narration policy.');assert.equal(requests[1].prompt,'Scene direction.');
let fallbackPrompt='';
const fallback=createSillyTavernGenerationClient({contextFactory:()=>({generate:async prompt=>(fallbackPrompt=prompt,'Opening.')})});
await fallback.generateNarration({messages:[{role:'system',content:'Protected narration policy.'},{role:'user',content:'Scene data.'}]});
assert.match(fallbackPrompt,/Protected narration policy/);assert.match(fallbackPrompt,/Scene data/);
