import assert from 'node:assert/strict';
import { normalizeNarrationSettings, createNarrationPolicy } from '../../src/narration/narration-policy.mjs';
import { getSillyTavernDirectiveNarrationSettings, updateSillyTavernDirectiveNarrationSettings } from '../../src/hosts/sillytavern/settings-store.mjs';
import { renderSettingsPanel } from '../../src/ui/settings-panel.js';
import { installFakeDom } from './helpers/fake-dom.mjs';
assert.deepEqual(normalizeNarrationSettings(null), { pov: 'third-person-limited', tense: 'past' });
assert.deepEqual(normalizeNarrationSettings({pov:'omniscient', tense:'future'}), normalizeNarrationSettings());
for (const pov of ['first-person','second-person','third-person-limited']) for (const tense of ['past','present']) {
 const policy = createNarrationPolicy({settings:{pov,tense},player:{name:'Avery'}});
 assert.equal(policy.pov,pov); assert.equal(policy.tense,tense); assert.equal(policy.playerName,'Avery');
 assert.match(policy.instruction,/available knowledge/); assert.match(policy.instruction,/Do not invent/);
}
let saves=0; const context={extensionSettings:{directive:{unrelated:true}},saveSettingsDebounced(){saves++;}};
assert.deepEqual(updateSillyTavernDirectiveNarrationSettings({pov:'first-person'},context),{pov:'first-person',tense:'past'});
updateSillyTavernDirectiveNarrationSettings({tense:'present'},context);
assert.deepEqual(getSillyTavernDirectiveNarrationSettings({...context}),{pov:'first-person',tense:'present'});
assert.equal(saves,2); assert.equal(context.extensionSettings.directive.unrelated,true);
const document=installFakeDom(); globalThis.localStorage={getItem:()=>null,setItem(){}};
const body=document.createElement('div'); const updates=[];
renderSettingsPanel(body,{narrationSettings:{pov:'second-person',tense:'present'}},{updateNarrationSettings:async patch=>updates.push(patch)});
const all=node=>[node,...node.children.flatMap(all)];
for (const [field,value] of [['pov','first-person'],['tense','past']]) {
 const control=all(body).find(node=>node.dataset.settingsControl===`narration-${field}`);
 assert.ok(control); assert.equal(control.value,field==='pov'?'second-person':'present');
 control.value=value; await control.dispatch('change');
}
assert.deepEqual(updates,[{pov:'first-person'},{tense:'past'}]);
console.log('PASS narration policy, persistence and settings controls');
