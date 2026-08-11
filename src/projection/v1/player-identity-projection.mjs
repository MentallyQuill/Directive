import {
  DIRECTIVE_STORAGE_IMAGE_EXTENSIONS,
  assertDirectiveUserFilesPath
} from '../../storage/directive-storage-filenames.mjs';

export const PLAYER_IDENTITY_PROJECTION_KIND = 'directive.playerIdentityProjection.v1';

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function projectDossier(dossier = {}) {
  return {
    identitySummary: dossier.identitySummary,
    serviceSummary: dossier.serviceSummary,
    briefBiography: dossier.briefBiography,
    traits: dossier.traits,
    publicReputation: dossier.publicReputation,
    optionalOpenThread: dossier.optionalOpenThread
  };
}

function projectPortrait(portrait) {
  if (portrait === null || portrait === undefined) return portrait;
  if (portrait.kind !== 'directive.playerPortrait') {
    throw new Error('Directive V1 requires an exact player portrait descriptor.');
  }
  assertDirectiveUserFilesPath(portrait.asset?.path, {
    allowedExtensions: DIRECTIVE_STORAGE_IMAGE_EXTENSIONS
  });
  return copy(portrait);
}

export function createPlayerIdentityProjection({ campaignState = {} } = {}) {
  const player = campaignState.player || {};
  return {
    kind: PLAYER_IDENTITY_PROJECTION_KIND,
    id: player.id,
    name: player.name,
    pronounsOrAddress: player.pronounsOrAddress,
    rank: player.rank,
    billet: player.billet,
    role: player.role,
    categoryId: 'ships-company',
    service: {
      organization: 'starfleet',
      department: 'command',
      rankCode: 'commander',
      rankLabel: 'Commander'
    },
    species: copy(player.species),
    appearance: player.appearance,
    firstImpression: player.firstImpression,
    dossier: projectDossier(player.dossier),
    portrait: projectPortrait(player.portrait)
  };
}
