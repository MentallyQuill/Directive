import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildCampaignReplyHeader,
  createCampaignReplyHeaderPromptBlock,
  formatShipTime,
  formatStardate,
  prefixCampaignReplyHeader,
  resolveCampaignMinuteOfDay,
  stripCampaignReplyHeader
} from '../../src/time/campaign-time-header.mjs';

assert.equal(formatStardate(47238.4), '47238.4');
assert.equal(formatStardate(4238.35), '04238.4');
assert.equal(formatShipTime(0), '0000 hours');
assert.equal(formatShipTime(1110), '1830 hours');

const elapsedState = {
  campaign: {
    currentStardate: 53049.2
  },
  worldState: {
    elapsedHours: 18.5,
    openingMinuteOfDay: 0
  }
};

assert.equal(resolveCampaignMinuteOfDay(elapsedState), 1110);
assert.equal(buildCampaignReplyHeader(elapsedState), '*Stardate 53049.2 | 1830 hours*');

const daytimeOpeningState = {
  campaign: {
    currentStardate: 53049.2,
    openingMinuteOfDay: 510
  },
  worldState: {
    elapsedHours: 0
  }
};

assert.equal(resolveCampaignMinuteOfDay(daytimeOpeningState), 510);
assert.equal(buildCampaignReplyHeader(daytimeOpeningState), '*Stardate 53049.2 | 0830 hours*');

const bundledOpeningTimes = [
  {
    file: 'packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json',
    title: 'Ashes of Peace',
    minute: 510,
    shipTime: '0830 hours'
  },
  {
    file: 'packages/bundled/glass-harbor/drowned-constellation.campaign-projection.json',
    title: 'Drowned Constellation',
    minute: 855,
    shipTime: '1415 hours'
  },
  {
    file: 'packages/bundled/serein/black-current.campaign-projection.json',
    title: 'Black Current',
    minute: 195,
    shipTime: '0315 hours'
  },
  {
    file: 'packages/bundled/eudora-vale/broken-accord.campaign-projection.json',
    title: 'Broken Accord',
    minute: 615,
    shipTime: '1015 hours'
  },
  {
    file: 'packages/bundled/aster-vale/unseen-border.campaign-projection.json',
    title: 'Unseen Border',
    minute: 405,
    shipTime: '0645 hours'
  },
  {
    file: 'packages/bundled/celandine/enemys-garden.campaign-projection.json',
    title: "Enemy's Garden",
    minute: 1040,
    shipTime: '1720 hours'
  }
];

assert.equal(
  new Set(bundledOpeningTimes.map((entry) => entry.minute)).size,
  bundledOpeningTimes.length,
  'bundled campaign opening ship times should stay varied'
);

for (const entry of bundledOpeningTimes) {
  const projection = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), entry.file), 'utf8'));
  const state = projection.initialState;
  assert.equal(state.campaign.openingMinuteOfDay, entry.minute, `${entry.title} campaign opening minute`);
  assert.equal(state.worldState.openingMinuteOfDay, entry.minute, `${entry.title} world opening minute`);
  assert.equal(resolveCampaignMinuteOfDay(state), entry.minute, `${entry.title} resolved opening minute`);
  assert.match(buildCampaignReplyHeader(state), new RegExp(`\\| ${entry.shipTime.replace(' ', '\\s+')}\\*$`), `${entry.title} opening header`);
}

const explicitClockState = {
  campaign: {
    openingStardate: 40123.7
  },
  campaignTime: {
    shipClock: {
      hour: 23,
      minute: 5
    }
  }
};

assert.equal(buildCampaignReplyHeader(explicitClockState), '*Stardate 40123.7 | 2305 hours*');

const staleHeaderText = '*Stardate 40123.7 | 2305 hours*\n\nBridge reports remain steady.';
assert.equal(stripCampaignReplyHeader(staleHeaderText), 'Bridge reports remain steady.');
assert.equal(
  prefixCampaignReplyHeader(staleHeaderText, elapsedState),
  '*Stardate 53049.2 | 1830 hours*\n\nBridge reports remain steady.'
);
assert.equal(
  prefixCampaignReplyHeader('*Stardate 40123.7 | 2305 hours*', elapsedState),
  '*Stardate 53049.2 | 1830 hours*'
);

const promptBlock = createCampaignReplyHeaderPromptBlock(elapsedState);
assert.equal(promptBlock.id, 'reply-header');
assert.equal(promptBlock.title, 'Reply Header');
assert.equal(promptBlock.mustInclude, true);
assert.match(promptBlock.content, /\*Stardate 53049\.2 \| 1830 hours\*/);
assert.match(promptBlock.content, /display artifact/);
assert.match(promptBlock.content, /Do not infer time passage/);

console.log('Campaign time header tests passed: stardate formatting, ship clock resolution, stale-header replacement, and prompt block contract');
