import assert from 'node:assert/strict';

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
