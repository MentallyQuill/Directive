import assert from 'node:assert/strict';

import { buildCampaignView } from '../../src/ui/view-models/campaign-view.mjs';

const view = buildCampaignView({
  saves: [
    {
      id: 'save-a',
      current: false,
      updatedAt: '2026-07-20T10:00:00.000Z',
      metadata: {
        campaignId: 'campaign-a',
        campaignTitle: 'Ashes of Peace',
        packageId: 'package-a',
        playerName: 'Mara Venn',
        playerRole: 'Executive Officer',
        shipName: 'U.S.S. Breckenridge',
        activeMissionTitle: 'A Ship Underway',
        campaignStatus: 'active',
        summary: 'A reconstruction mission in the Asterion Reach.'
      }
    },
    {
      id: 'save-b',
      current: true,
      updatedAt: '2026-07-22T10:00:00.000Z',
      metadata: {
        campaignId: 'campaign-b',
        campaignTitle: 'Black Current',
        packageId: 'package-b',
        playerName: 'Tarin Sol',
        playerRole: 'Executive Officer',
        shipName: 'U.S.S. Serein',
        activeMissionTitle: 'Wreckfall',
        campaignStatus: 'active',
        campaignChatBinding: { chatId: 'black-current-chat' }
      }
    },
    {
      id: 'autosave-b',
      current: false,
      slotType: 'autosave',
      updatedAt: '2026-07-22T11:00:00.000Z',
      metadata: { campaignId: 'campaign-b' }
    }
  ],
  packages: [
    {
      packageId: 'package-a',
      title: 'Ashes of Peace',
      image: { kind: 'ship.hero', subjectId: 'breckenridge' },
      premise: 'Package-owned premise.'
    },
    {
      packageId: 'package-b',
      title: 'Black Current',
      image: { kind: 'ship.hero', subjectId: 'serein' },
      premise: 'A disaster-response campaign.'
    }
  ],
  checkpoints: [
    {
      kind: 'directive.manualCheckpoint.v1',
      id: 'checkpoint-b',
      campaignId: 'campaign-b',
      name: 'Before Wreckfall',
      createdAt: '2026-07-22T09:00:00.000Z',
      summary: { chapter: 'Prelude' }
    },
    {
      kind: 'directive.campaignSave',
      id: 'legacy-branch',
      campaignId: 'campaign-b',
      name: 'Old Branch'
    }
  ],
  selectedCampaignId: 'campaign-a'
});

assert.deepEqual(view.campaigns.map((campaign) => campaign.id), ['campaign-b', 'campaign-a'], 'active campaign must sort first');
assert.equal(view.selectedCampaignId, 'campaign-a', 'selection must not activate a campaign');
assert.equal(view.campaigns[0].active, true);
assert.equal(view.campaigns[0].activeTimeline.saveId, 'save-b');
assert.equal(view.campaigns[0].canOpenChat, true);
assert.equal(view.campaigns[0].canSaveGame, true);
assert.equal(view.campaigns[1].canOpenChat, false);
assert.equal(view.campaigns[0].checkpoints.length, 1);
assert.equal(view.campaigns[0].checkpoints[0].id, 'checkpoint-b');
assert.equal(view.campaigns[0].checkpoints.some((checkpoint) => checkpoint.id === 'legacy-branch'), false);
assert.equal(view.campaigns.some((campaign) => campaign.activeTimeline.saveId === 'autosave-b'), false);
assert.deepEqual(view.campaigns[0].image, { kind: 'ship.hero', subjectId: 'serein' });
assert.equal(JSON.stringify(view).includes('/files/'), false);

console.log('Expanded Campaign view tests passed.');
