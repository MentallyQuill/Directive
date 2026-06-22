import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const activeDocs = [
  'docs/testing/TESTING_STRATEGY.md',
  'docs/packages/CAMPAIGN_PACKAGE_MODEL.md',
  'docs/packages/CAMPAIGN_PACKAGE_SCHEMA.md',
  'docs/packages/CAMPAIGN_STATE_PROJECTION.md',
  'docs/architecture/PERSISTENCE_AND_CONTINUITY.md',
  'docs/architecture/CHAT_NATIVE_RUNTIME.md',
  'docs/campaigns/ASHES_OF_PEACE_CAMPAIGN.md'
];

for (const filePath of activeDocs) {
  const text = fs.readFileSync(path.resolve(root, filePath), 'utf8');
  assert.doesNotMatch(text, /\bmainCampaign\b/, `${filePath} should not prescribe schema-v1 mainCampaign`);
  assert.doesNotMatch(text, /\bsideMissions\b/, `${filePath} should not prescribe schema-v1 sideMissions`);
  assert.doesNotMatch(text, /\bsideMissionRules\b/, `${filePath} should not prescribe schema-v1 sideMissionRules`);
  assert.doesNotMatch(text, /\bmissionTemplates\b/, `${filePath} should not prescribe schema-v1 missionTemplates`);
}

console.log('Open-world docs contract passed: active docs avoid schema-v1 roots');
