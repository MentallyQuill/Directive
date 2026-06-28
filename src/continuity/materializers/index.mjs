import { materializeCrewIdentityFacts } from './crew-identity-facts.mjs';
import { materializeCommandLogFacts } from './command-log-facts.mjs';
import { materializeMissionFacts } from './mission-facts.mjs';
import { materializeRejectedClaimFacts } from './rejected-claim-facts.mjs';
import { materializeShipDatasetFacts } from './ship-dataset-facts.mjs';
import { materializeShipTravelFacts } from './ship-travel-facts.mjs';

export function materializeContinuityFacts(options = {}) {
  return [
    ...materializeCrewIdentityFacts(options),
    ...materializeShipDatasetFacts(options),
    ...materializeShipTravelFacts(options),
    ...materializeMissionFacts(options),
    ...materializeCommandLogFacts(options),
    ...materializeRejectedClaimFacts(options)
  ];
}

export {
  materializeCrewIdentityFacts,
  materializeCommandLogFacts,
  materializeMissionFacts,
  materializeRejectedClaimFacts,
  materializeShipDatasetFacts,
  materializeShipTravelFacts
};
