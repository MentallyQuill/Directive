import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = 'packages/bundled/breckenridge/v1/';
let count = 0;
for (const file of fs.readdirSync(root).filter(file => file.endsWith('.mission-v1.json'))) {
    const definition = JSON.parse(fs.readFileSync(root+file,'utf8'));
    for (const objective of definition.objectives) {
        assert.equal(objective.scenePacing?.requirements?.length, 2, `${objective.id} needs authored participation requirements`);
        assert.ok(objective.scenePacing.requirements.every(text => typeof text === 'string' && text.length > 20 && text.length <= 240));
        count++;
    }
}
assert.equal(count, 50);
console.log('All 50 objectives have authored scene participation requirements.');
