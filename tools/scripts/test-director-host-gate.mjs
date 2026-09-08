import assert from 'node:assert/strict';
import { setSillyTavernDirectiveRuntimeBridge, clearSillyTavernDirectiveRuntimeBridge, directiveGenerationInterceptor } from '../../src/hosts/sillytavern/runtime-bridge.mjs';
for (const bound of [true, false]) {
  let aborts = 0;
  setSillyTavernDirectiveRuntimeBridge({ app: {isCurrentChatBound: () => bound}, turnOrchestrator: {interceptGeneration: async () => { throw new Error('analysis failed'); }}, directiveHost: {logger:{error(){}}} });
  const result = await directiveGenerationInterceptor([], 100, () => aborts++, 'normal');
  assert.equal(aborts, bound ? 1 : 0);
  assert.equal(result.handled, bound);
  if (bound) assert.equal(result.abortDefaultGeneration, true);
  clearSillyTavernDirectiveRuntimeBridge();
}
console.log('Director native host gate tests passed.');
