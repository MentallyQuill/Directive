import { createMissionPlayerProjection } from '../../mission/v1/player-projection.mjs';
import { validateMissionStateAuthority } from '../../mission/v1/mission-state-authority.mjs';
import { createMissionState } from '../../mission/v1/mission-state.mjs';
import {
    createEmptyStorySettlement,
    validateStorySettlement,
} from '../../story/story-settlement-contracts.mjs';
import { createPeoplePlayerProjection } from './people-projection.mjs';
import { createShipPlayerProjection } from './ship-projection.mjs';
import { createStoryPlayerProjection } from './story-projection.mjs';
import { projectV1CommandBearing } from '../../command/v1-command-bearing.mjs';
import { createPlayerIdentityProjection } from './player-identity-projection.mjs';

export const V1_PLAYER_PROJECTION_KIND = 'directive.playerProjection.v1';

function compact(value) {
    return String(value ?? '').trim();
}

function projectionError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function activeBranchId(campaignState = {}) {
    return compact(campaignState?.campaignChatBinding?.saveId)
        || compact(campaignState?.mission?.v1?.branchId)
        || compact(campaignState?.storySettlement?.branchId)
        || 'main';
}

function assertDefinitionBinding({
    campaignState = {},
    definition = {},
    missionState = null,
    runtimeAssets = {},
} = {}) {
    const expected = definition.packageBinding || {};
    const assetManifest = runtimeAssets?.packageData?.manifest || {};
    const activePackage = campaignState?.activeCampaignPackage || {};
    const missionBinding = missionState?.packageBinding || {};
    const definitionMismatch = !compact(definition.id)
        || !compact(definition.version)
        || !compact(expected.packageId)
        || !compact(expected.packageVersion)
        || !compact(assetManifest.id)
        || !compact(assetManifest.version)
        || !compact(activePackage.packageId)
        || !compact(activePackage.packageVersion)
        || compact(assetManifest.id) !== compact(expected.packageId)
        || compact(assetManifest.version) !== compact(expected.packageVersion)
        || compact(activePackage.packageId) !== compact(expected.packageId)
        || compact(activePackage.packageVersion) !== compact(expected.packageVersion)
        || (missionState && (
            compact(missionState.definitionId) !== compact(definition.id)
            || compact(missionState.definitionVersion) !== compact(definition.version)
            || compact(missionBinding.packageId) !== compact(expected.packageId)
            || compact(missionBinding.packageVersion) !== compact(expected.packageVersion)
            || compact(missionBinding.sourceId) !== compact(expected.sourceId)
        ));
    if (definitionMismatch) {
        throw projectionError(
            'DIRECTIVE_V1_PROJECTION_DEFINITION_MISMATCH',
            'The V1 player projection requires an exact mission definition and package binding.',
        );
    }
}

function assertPersistedState(definition, missionState, storySettlement) {
    const missionResult = validateMissionStateAuthority({ definition, state: missionState });
    const storyResult = validateStorySettlement(storySettlement);
    if (!missionResult.ok || !storyResult.ok) {
        throw projectionError(
            'DIRECTIVE_V1_PROJECTION_STATE_INVALID',
            'The V1 player projection requires valid committed mission and story state.',
        );
    }
}

function assertBranchBinding(branchId, missionState, storySettlement) {
    if ((missionState?.branchId && missionState.branchId !== branchId)
        || (storySettlement?.branchId && storySettlement.branchId !== branchId)) {
        throw projectionError(
            'DIRECTIVE_V1_PROJECTION_BRANCH_MISMATCH',
            'The V1 player projection cannot combine state from different save branches.',
        );
    }
}

export function createV1PlayerProjection({
    campaignState = {},
    runtimeAssets = {},
    definition = {},
} = {}) {
    const branchId = activeBranchId(campaignState);
    const persistedMissionState = campaignState?.mission?.v1 || null;
    assertDefinitionBinding({
        campaignState,
        definition,
        missionState: persistedMissionState,
        runtimeAssets,
    });
    const missionState = persistedMissionState || createMissionState({ definition, branchId });
    const storySettlement = campaignState?.storySettlement
        || createEmptyStorySettlement({ branchId });
    assertBranchBinding(branchId, missionState, storySettlement);
    assertPersistedState(definition, missionState, storySettlement);

    const mission = createMissionPlayerProjection({ definition, state: missionState });
    const story = createStoryPlayerProjection({ settlement: storySettlement });
    const ship = createShipPlayerProjection({
        campaignState,
        runtimeAssets,
        definition,
        missionProjection: mission,
    });
    const people = createPeoplePlayerProjection({
        campaignState,
        runtimeAssets,
        definition,
        missionProjection: mission,
        storySettlement,
    });
    const commandBearing = projectV1CommandBearing(campaignState.commandBearing);
    const player = createPlayerIdentityProjection({ campaignState });

    return {
        kind: V1_PLAYER_PROJECTION_KIND,
        packageId: definition.packageBinding.packageId,
        packageVersion: definition.packageBinding.packageVersion,
        branchId,
        revisions: {
            mission: mission.revision,
            story: story.revision,
        },
        player,
        mission,
        story,
        ship,
        people,
        commandBearing,
        sourceRefs: {
            definitionId: definition.id,
            definitionVersion: definition.version,
            packageId: definition.packageBinding.packageId,
            packageVersion: definition.packageBinding.packageVersion,
            missionRevision: mission.revision,
            storyRevision: story.revision,
        },
    };
}
