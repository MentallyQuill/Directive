import assert from 'node:assert/strict';

import { createPlayerIdentityProjection } from '../../src/projection/v1/player-identity-projection.mjs';

const campaignState = {
  player: {
    id: 'player-commander',
    creationStatus: 'complete',
    name: 'Ren Okada',
    pronounsOrAddress: 'he/him',
    rank: 'Commander',
    billet: 'Executive Officer',
    role: 'Second-in-command of the U.S.S. Breckenridge',
    species: {
      id: 'human',
      label: 'Human',
      summary: 'A Human Starfleet officer.'
    },
    appearance: 'Attentive and deliberate.',
    firstImpression: 'Measured until action is required.',
    dossier: {
      detailLevel: 'full',
      generatedBy: 'provider-or-player-edit',
      identitySummary: 'A deliberate command officer.',
      serviceSummary: 'Experienced in tactical and security work.',
      briefBiography: 'Ren Okada was shaped by wartime service.',
      traits: 'Perceptive, candid, and decisive.',
      publicReputation: 'A decisive officer learning to build peace.',
      optionalOpenThread: '',
      editedByPlayer: true
    },
    portrait: {
      kind: 'directive.playerPortrait',
      owner: { kind: 'campaign', id: 'campaign-1', subjectId: 'player-commander' },
      asset: {
        path: '/user/files/directive-player-portrait-campaign-1.webp',
        fileName: 'directive-player-portrait-campaign-1.webp',
        mimeType: 'image/webp',
        alt: 'Player character portrait',
        fit: 'cover',
        focalPoint: { x: 0.5, y: 0.5 }
      }
    },
    adjudicationProfile: {
      specialistBoundary: 'Director-only adjudication detail.'
    }
  }
};

const projection = createPlayerIdentityProjection({ campaignState });
assert.deepEqual(projection, {
  kind: 'directive.playerIdentityProjection.v1',
  id: 'player-commander',
  name: 'Ren Okada',
  pronounsOrAddress: 'he/him',
  rank: 'Commander',
  billet: 'Executive Officer',
  role: 'Second-in-command of the U.S.S. Breckenridge',
  species: {
    id: 'human',
    label: 'Human',
    summary: 'A Human Starfleet officer.'
  },
  appearance: 'Attentive and deliberate.',
  firstImpression: 'Measured until action is required.',
  dossier: {
    identitySummary: 'A deliberate command officer.',
    serviceSummary: 'Experienced in tactical and security work.',
    briefBiography: 'Ren Okada was shaped by wartime service.',
    traits: 'Perceptive, candid, and decisive.',
    publicReputation: 'A decisive officer learning to build peace.',
    optionalOpenThread: ''
  },
  portrait: {
    kind: 'directive.playerPortrait',
    owner: { kind: 'campaign', id: 'campaign-1', subjectId: 'player-commander' },
    asset: {
      path: '/user/files/directive-player-portrait-campaign-1.webp',
      fileName: 'directive-player-portrait-campaign-1.webp',
      mimeType: 'image/webp',
      alt: 'Player character portrait',
      fit: 'cover',
      focalPoint: { x: 0.5, y: 0.5 }
    }
  }
});
assert.equal(Object.hasOwn(projection, 'adjudicationProfile'), false);
assert.equal(Object.hasOwn(projection, 'creationStatus'), false);

projection.species.label = 'Changed';
projection.dossier.briefBiography = 'Changed';
projection.portrait.asset.path = '/user/files/changed.webp';
assert.equal(campaignState.player.species.label, 'Human');
assert.equal(campaignState.player.dossier.briefBiography, 'Ren Okada was shaped by wartime service.');
assert.equal(campaignState.player.portrait.asset.path, '/user/files/directive-player-portrait-campaign-1.webp');

assert.throws(
  () => createPlayerIdentityProjection({
    campaignState: {
      player: {
        ...campaignState.player,
        portrait: {
          ...campaignState.player.portrait,
          asset: { ...campaignState.player.portrait.asset, path: 'https://example.invalid/commander.webp' }
        }
      }
    }
  }),
  /under \/user\/files\//
);

console.log('PASS V1 player identity projection');
