import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  commandAuthorityProfile,
  commandAuthorityPromptBlock,
  commandAuthorityPromptLines
} from '../../src/context/command-authority-guidance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function packageJson(relativePath) {
  return readJson(path.join(repoRoot, relativePath));
}

function baseState(packageData, overrides = {}) {
  const lockedRole = packageData.characterCreation?.lockedRole || {};
  return {
    campaign: { id: packageData.storyArcs?.campaign?.id || packageData.manifest?.slug || 'campaign' },
    player: {
      id: 'player-commander',
      name: 'Test Commander',
      rank: lockedRole.rank || 'Commander',
      billet: lockedRole.billet || 'Executive Officer',
      role: lockedRole.commandAuthority || ''
    },
    crew: {
      seniorCrewIds: (packageData.crew?.senior || []).map((crew) => crew.id).filter(Boolean)
    },
    captainState: {
      crewId: lockedRole.captainId || packageData.ship?.commandStructure?.commandingOfficer || packageData.ship?.commandStructure?.captainId || null
    },
    ...overrides
  };
}

function assertPromptContains(lines, pattern, message) {
  assert.match(lines.join('\n'), pattern, message);
}

const ashes = packageJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const ashesState = baseState(ashes);
const ashesProfile = commandAuthorityProfile({ campaignState: ashesState, packageData: ashes });
assert.equal(ashesProfile.playerAuthorityMode, 'xo');
assert.equal(ashesProfile.commandRecipientId, 'mara-whitaker');
assert.notEqual(ashesProfile.commandRecipientId, ashesProfile.playerAgencyTargetId);
assertPromptContains(
  commandAuthorityPromptLines({ campaignState: ashesState, packageData: ashes }),
  /Do not treat player agency as automatic command authority/
);

const ashesConnProfile = commandAuthorityProfile({
  campaignState: baseState(ashes, {
    commandAuthority: {
      playerAuthorityMode: 'delegated-xo',
      delegationScope: 'conn',
      commandRecipientId: 'player-commander',
      majorDecisionAuthorityId: 'mara-whitaker',
      connHolderId: 'player-commander',
      commanderPresence: 'offscreen',
      commanderStatus: 'active'
    }
  }),
  packageData: ashes
});
assert.equal(ashesConnProfile.commandRecipientId, 'player-commander');
assert.equal(ashesConnProfile.majorDecisionAuthorityId, 'mara-whitaker');

const eudora = packageJson('packages/bundled/eudora-vale/broken-accord.campaign-package.json');
const actingLines = commandAuthorityPromptLines({
  packageData: eudora,
  campaignState: baseState(eudora, {
    commandAuthority: {
      playerAuthorityMode: 'acting-captain',
      delegationScope: 'acting-command',
      commandRecipientId: 'player-commander',
      majorDecisionAuthorityId: 'player-commander',
      connHolderId: 'player-commander',
      commanderPresence: 'dead',
      commanderStatus: 'deceased'
    }
  })
});
assertPromptContains(actingLines, /Command recipient: Commander Test Commander/);
assertPromptContains(actingLines, /Crew may route formal status reports and command options to the player/);

const actingPackages = [
  ['Aster Vale', 'packages/bundled/aster-vale/unseen-border.campaign-package.json'],
  ['Celandine', 'packages/bundled/celandine/enemys-garden.campaign-package.json'],
  ['Eudora Vale', 'packages/bundled/eudora-vale/broken-accord.campaign-package.json'],
  ['Glass Harbor', 'packages/bundled/glass-harbor/drowned-constellation.campaign-package.json'],
  ['Serein', 'packages/bundled/serein/black-current.campaign-package.json']
];

for (const [label, relativePath] of actingPackages) {
  const packageData = packageJson(relativePath);
  const profile = commandAuthorityProfile({ campaignState: baseState(packageData), packageData });
  assert.equal(profile.commandRecipientId, 'player-commander', `${label}: player should be command recipient`);
  assert.ok(['acting-captain', 'captain'].includes(profile.playerAuthorityMode), `${label}: player should have acting/captain mode`);
  const block = commandAuthorityPromptBlock({ campaignState: baseState(packageData), packageData });
  assert.equal(block.id, 'command-authority');
  assert.match(block.content, /Command recipient:/);
}

console.log('Command authority guidance tests passed.');
