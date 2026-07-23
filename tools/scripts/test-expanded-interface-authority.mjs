import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const contract = read('docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md');
const integrationPrep = read('docs/planning/INTERFACE_REDESIGN_INTEGRATION_PREP.md');
const assetPlan = read('docs/planning/VISUAL_ASSET_AND_MOBILE_UI_INTEGRATION_PLAN.md');
const designBaseline = read('docs/design/DIRECTIVE_DESIGN_BASELINE.md');
const runtimeReadme = read('src/runtime/README.md');
const uiReadme = read('src/ui/README.md');
const hostsReadme = read('src/hosts/README.md');
const sillyTavernReadme = read('src/hosts/sillytavern/README.md');
const stylesReadme = read('styles/README.md');
const guidance = read('src/guidance/directive-guidance-content.mjs');

assert.match(contract, /Approved mockup coverage:[^\n]*Campaign, Mission, People, Ship, and Settings/i);
assert.doesNotMatch(contract, /Pending mockup coverage:\s*Settings/i);
assert.match(contract, /src\/runtime\/runtime-shell\.js/);
assert.match(contract, /src\/ui\/directive-expanded-shell\.js/);
assert.doesNotMatch(contract, /src\/ui\/directive-compact-shell\.js/);
assert.doesNotMatch(contract, /Do not begin broad production rewrites until their mockups and value contracts are approved/i);
assert.doesNotMatch(contract, /final Ship information hierarchy and layout/i);
assert.doesNotMatch(contract, /final Settings player\/advanced split/i);
assert.match(contract, /Diagnostics export is privacy-bounded/i);
assert.match(contract, /system prompts, credentials and API keys, endpoint URLs, private model reasoning, hidden campaign facts, raw private relationship values/i);
assert.match(contract, /Story transcript inclusion is a separate explicit opt-in/i);
assert.match(contract, /no legacy save or mutable-branch compatibility is supported/i);
assert.match(contract, /not migrated, relabeled, imported, or exposed through a compatibility utility/i);

for (const [name, source] of [
  ['integration prep', integrationPrep],
  ['visual asset plan', assetPlan]
]) {
  assert.match(source, /Historical authority note:/i, `${name} must declare its historical authority boundary`);
  assert.match(source, /Campaign, Mission, People, Ship, and Settings/i, `${name} must name the approved route set`);
}

assert.match(designBaseline, /Campaign, Mission, People, Ship, and Settings/i);
assert.doesNotMatch(designBaseline, /command[- ]spine|resizable route drawer|Initial tabs:[\s\S]{0,180}\bCrew\b[\s\S]{0,180}\bLog\b/i);

for (const [name, source] of [
  ['runtime README', runtimeReadme],
  ['UI README', uiReadme],
  ['hosts README', hostsReadme],
  ['SillyTavern README', sillyTavernReadme],
  ['styles README', stylesReadme],
  ['player guidance', guidance]
]) {
  assert.doesNotMatch(source, /command[- ]spine|resizable drawer|click the same open route again to collapse it/i, `${name} must describe the expanded interface, not the retired shelf-and-drawer shell`);
}

console.log('Expanded interface authority tests passed.');
