// src/runtime/turn-analysis-key.mjs
import { sha256Json } from '../storage/v1-state-delta-codec.mjs';

export async function createTurnAnalysisKey({
  envelope, interpreterRequest, directorRequest, providerFingerprints,
}) {
  return `turn-analysis.${await sha256Json({
    contract: 'directive.turnAnalysis.v1',
    envelope,
    interpreterRequest,
    directorRequest,
    providerFingerprints,
  })}`;
}
