import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const expectedDirs = [
  'assets',
  'assets/branding',
  'assets/documentation',
  'assets/icons',
  'assets/packages',
  'content',
  'content/campaigns',
  'content/campaigns/breckenridge',
  'content/campaigns/breckenridge/campaign',
  'content/campaigns/breckenridge/crew',
  'content/campaigns/breckenridge/guardrails',
  'content/campaigns/breckenridge/missions',
  'content/campaigns/breckenridge/quests',
  'content/campaigns/glass-harbor',
  'content/campaigns/glass-harbor/campaign',
  'content/campaigns/glass-harbor/crew',
  'content/campaigns/glass-harbor/guardrails',
  'content/campaigns/glass-harbor/missions',
  'content/campaigns/glass-harbor/quests',
  'content/campaigns/glass-harbor/side-missions',
  'content/campaigns/glass-harbor/world',
  'content/campaigns/serein',
  'content/campaigns/serein/campaign',
  'content/campaigns/serein/crew',
  'content/campaigns/serein/guardrails',
  'content/campaigns/serein/missions',
  'content/campaigns/serein/quests',
  'content/campaigns/serein/side-missions',
  'content/campaigns/serein/world',
  'content/campaigns/eudora-vale',
  'content/campaigns/eudora-vale/campaign',
  'content/campaigns/eudora-vale/crew',
  'content/campaigns/eudora-vale/guardrails',
  'content/campaigns/eudora-vale/missions',
  'content/campaigns/eudora-vale/quests',
  'content/campaigns/eudora-vale/side-missions',
  'content/campaigns/eudora-vale/world',
  'packages',
  'packages/bundled',
  'packages/bundled/breckenridge',
  'packages/bundled/glass-harbor',
  'packages/bundled/serein',
  'packages/bundled/eudora-vale',
  'packages/examples',
  'schemas',
  'schemas/common',
  'schemas/packages',
  'schemas/campaign',
  'schemas/endings',
  'schemas/mission',
  'schemas/directors',
  'schemas/generation',
  'schemas/quests',
  'schemas/reactions',
  'schemas/story',
  'schemas/threads',
  'schemas/world',
  'schemas/sidecars',
  'src',
  'src/extension',
  'src/hosts',
  'src/hosts/fake',
  'src/hosts/sillytavern',
  'src/hosts/lumiverse',
  'src/runtime',
  'src/ui',
  'src/jobs',
  'src/packages',
  'src/creators',
  'src/retrieval',
  'src/directors',
  'src/campaign',
  'src/command',
  'src/context',
  'src/quests',
  'src/reactions',
  'src/story',
  'src/threads',
  'src/world',
  'src/competence',
  'src/pressures',
  'src/mission',
  'src/story',
  'src/reactions',
  'src/world',
  'src/threads',
  'src/quests',
  'src/adjudication',
  'src/simulation',
  'src/actors',
  'src/providers',
  'src/generation',
  'src/context',
  'src/storage',
  'src/settings',
  'src/theme',
  'styles',
  'tests',
  'tests/contracts',
  'tests/fixtures',
  'tests/fixtures/mission',
  'tests/fixtures/competence',
  'tests/fixtures/retrieval',
  'tests/browser',
  'tests/visual',
  'tests/storage',
  'tests/unit',
  'tools',
  'tools/scripts',
  'tools/scripts/lib'
];

const errors = [];

for (const dir of expectedDirs) {
  const absolute = path.resolve(root, dir);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    errors.push(`${dir}: missing directory`);
    continue;
  }

  const readme = path.join(absolute, 'README.md');
  if (!fs.existsSync(readme) || !fs.statSync(readme).isFile()) {
    errors.push(`${dir}: missing README.md ownership note`);
  }
}

const forbiddenDirs = [
  'src/lorecards',
  'src/loredecks',
  'content/loredecks',
  'src/side-missions'
];

for (const dir of forbiddenDirs) {
  if (fs.existsSync(path.resolve(root, dir))) {
    errors.push(`${dir}: legacy project folder should not exist in Directive`);
  }
}

if (errors.length) {
  console.error('Repo structure verification failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Verified ${expectedDirs.length} Directive scaffold directories.`);
