import { spawnSync } from 'node:child_process';
import {
  bundledCampaignPackagePaths,
  bundledCampaignProjectionPairs,
  bundledCrewDatasetPairs,
  bundledShipDatasetPairs,
  bundledMissionGraphTriples
} from '../../src/packages/bundled-package-registry.mjs';

const campaignPackageChecks = bundledCampaignPackagePaths().map((packagePath) => [
  'validate-campaign-package.mjs',
  'schemas/campaign-package.schema.json',
  packagePath
]);

const campaignProjectionChecks = bundledCampaignProjectionPairs().map(([projectionPath, packagePath]) => [
  'validate-campaign-projection.mjs',
  projectionPath,
  packagePath
]);

const crewDatasetChecks = bundledCrewDatasetPairs().map(([packagePath, crewDatasetPath]) => [
  'validate-crew-dataset.mjs',
  'schemas/packages/crew-dataset.schema.json',
  packagePath,
  crewDatasetPath
]);

const shipDatasetChecks = bundledShipDatasetPairs().map(([packagePath, shipDatasetPath]) => [
  'validate-ship-dataset.mjs',
  'schemas/packages/ship-dataset.schema.json',
  packagePath,
  shipDatasetPath
]);

const missionGraphChecks = bundledMissionGraphTriples().map(([packagePath, crewDatasetPath, missionGraphPath]) => [
  'validate-mission-graph.mjs',
  'schemas/mission/mission-graph.schema.json',
  packagePath,
  crewDatasetPath,
  missionGraphPath
]);

const checks = [
  'test-extension-shell.mjs',
  'test-provider-response-parser.mjs',
  'test-directive-provider-routing.mjs',
  'test-model-call-authority-matrix.mjs',
  'test-define-selection.mjs',
  'test-sillytavern-chat-prompt-adapters.mjs',
  'test-sillytavern-preset-manager.mjs',
  'test-sillytavern-event-wiring.mjs',
  'test-sillytavern-runtime-lifecycle.mjs',
  'test-sillytavern-generation-client.mjs',
  'test-sillytavern-host-factory.mjs',
  'test-campaign-time-header.mjs',
  'test-time-advance-adjudicator.mjs',
  'test-player-safe-prompt-context.mjs',
  'test-continuity-projection-foundation.mjs',
  'test-continuity-projection-plan-validator.mjs',
  'test-continuity-projection-planner-client.mjs',
  'test-continuity-ledger-materializers.mjs',
  'test-continuity-projection-diagnostics.mjs',
  'test-continuity-director-packets.mjs',
  'test-factual-grounding-matrix-prompt-proof.mjs',
  'test-continuity-matrix-five-user-soak-coordinator.mjs',
  'test-state-delta-gateway.mjs',
  'test-scene-handshake-settler.mjs',
  'test-scene-reconciliation.mjs',
  'test-scene-reconciliation-open-world.mjs',
  'test-mission-components.mjs',
  'test-open-world-model-contracts.mjs',
  'test-open-world-thread-engine.mjs',
  'test-open-world-dynamic-quest-e2e.mjs',
  'test-open-world-delegation-lifecycle.mjs',
  'test-open-world-context-budget.mjs',
  'test-open-world-quest-ledger-contracts.mjs',
  'test-open-world-quest-director-contracts.mjs',
  'test-open-world-reaction-engine-contracts.mjs',
  'test-open-world-story-arc-contracts.mjs',
  'test-open-world-context-plan-contracts.mjs',
  'test-open-world-director-coordinator-contracts.mjs',
  'test-open-world-data-contracts.mjs',
  'test-open-world-ui-runtime-contracts.mjs',
  'test-open-world-docs-contract.mjs',
  'test-schema-v2-conversion-preflight.mjs',
  'test-campaign-sidecar-scheduler.mjs',
  'test-message-recovery.mjs',
  'test-sillytavern-message-actions.mjs',
  'test-mission-components-capture.mjs',
  'test-chat-native-activation-conclusion.mjs',
  'test-chat-turn-orchestrator.mjs',
  'test-chat-turn-terminal-outcome.mjs',
  'test-turn-intent-classifier-fixtures.mjs',
  'test-chat-response-recovery.mjs',
  'test-chat-native-runtime-flow.mjs',
  'test-current-chat-campaign-scope.mjs',
  'test-directive-guidance.mjs',
  'test-directive-training-scenario.mjs',
  'test-directive-training-render-targets.mjs',
  'test-directive-assist.mjs',
  'test-character-creator-assist.mjs',
  'test-player-portrait-assets.mjs',
  'test-command-spine-layout.mjs',
  'test-runtime-shell-creator-flow.mjs',
  'test-ship-panel-state-records.mjs',
  'test-visual-system-foundation.mjs',
  'test-bundled-package-registry.mjs',
  'test-runtime-package-library.mjs',
  'test-runtime-model-call-journal.mjs',
  'test-runtime-active-save-guard.mjs',
  'test-runtime-mission-asset-selector.mjs',
  'test-runtime-ui-preferences.mjs',
  'test-runtime-creator-service.mjs',
  ...campaignPackageChecks,
  'test-campaign-package-context.mjs',
  'test-campaign-package-importer.mjs',
  'test-package-update-diagnostics.mjs',
  'test-campaign-start-and-save.mjs',
  'test-sillytavern-file-api.mjs',
  'test-directive-storage-repository.mjs',
  'test-campaign-start-service.mjs',
  'test-runtime-campaign-start-controller.mjs',
  'test-end-condition-evaluator.mjs',
  'test-drowned-constellation-end-conditions.mjs',
  'test-black-current-end-conditions.mjs',
  'test-broken-accord-end-conditions.mjs',
  'test-unseen-border-end-conditions.mjs',
  'test-enemys-garden-end-conditions.mjs',
  'test-campaign-end-condition-service.mjs',
  'test-terminal-catastrophic-command.mjs',
  'test-end-condition-ui-contracts.mjs',
  ...campaignProjectionChecks,
  ...crewDatasetChecks,
  ...shipDatasetChecks,
  'test-rich-crew-voice-capsules.mjs',
  'test-rich-crew-runtime-hydration.mjs',
  'test-crew-retrieval-fixture.mjs',
  'test-director-retrieval-orchestration.mjs',
  'test-generation-router.mjs',
  'test-command-competence-planner.mjs',
  'test-command-competence-no-gotcha.mjs',
  'test-runtime-stage22-command-brief.mjs',
  'test-host-contract-fake.mjs',
  'test-host-import-boundaries.mjs',
  'test-host-sidecar-orchestrator.mjs',
  'test-logical-storage-adapter.mjs',
  'test-sidecar-job-runner.mjs',
  'test-logical-storage-paths.mjs',
  'test-prompt-injection-safety.mjs',
  'test-stage30-runtime-hygiene.mjs',
  'test-host-scaffold.mjs',
  ...missionGraphChecks,
  'test-mission-graph-fixture.mjs',
  'test-mission-state-delta-contract.mjs',
  'validate-mission-director-contract.mjs',
  'test-mission-director-loop.mjs',
  'test-transaction-state.mjs',
  'test-runtime-director-turn.mjs',
  'test-runtime-host-injection.mjs',
  'test-runtime-stage9-turn-loop.mjs',
  'test-command-log-summary-sidecar.mjs',
  'test-simulation-mode-policy.mjs',
  'test-campaign-difficulty-runtime.mjs',
  'test-runtime-stage18-rerun-branch-recovery.mjs',
  'test-command-bearing.mjs',
  'test-crew-bplots.mjs',
  'test-thread-ledger.mjs',
  'verify-repo-structure.mjs'
];

for (const check of checks) {
  const [script, ...args] = Array.isArray(check) ? check : [check];
  const scriptPath = `tools/scripts/${script}`;
  console.log(`\n[alpha-gate] node ${[scriptPath, ...args].join(' ')}`);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    console.error(`\n[alpha-gate] failed: ${scriptPath}`);
    process.exit(result.status || 1);
  }
}

console.log(`\n[alpha-gate] passed ${checks.length} checks.`);
