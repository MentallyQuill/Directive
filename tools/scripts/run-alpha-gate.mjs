import { spawnSync } from 'node:child_process';

const checks = [
  'test-extension-shell.mjs',
  'test-provider-response-parser.mjs',
  'test-directive-provider-routing.mjs',
  'test-sillytavern-chat-prompt-adapters.mjs',
  'test-sillytavern-event-wiring.mjs',
  'test-sillytavern-runtime-lifecycle.mjs',
  'test-player-safe-prompt-context.mjs',
  'test-state-delta-gateway.mjs',
  'test-campaign-sidecar-scheduler.mjs',
  'test-message-recovery.mjs',
  'test-chat-native-activation-conclusion.mjs',
  'test-chat-turn-orchestrator.mjs',
  'test-chat-response-recovery.mjs',
  'test-chat-native-runtime-flow.mjs',
  'test-directive-assist.mjs',
  'test-character-creator-assist.mjs',
  'test-player-portrait-assets.mjs',
  'test-command-spine-layout.mjs',
  'test-runtime-shell-creator-flow.mjs',
  'test-visual-system-foundation.mjs',
  'validate-campaign-package.mjs',
  'test-campaign-package-context.mjs',
  'test-campaign-package-importer.mjs',
  'test-package-update-diagnostics.mjs',
  'test-campaign-start-and-save.mjs',
  'test-sillytavern-file-api.mjs',
  'test-directive-storage-repository.mjs',
  'test-campaign-start-service.mjs',
  'test-runtime-campaign-start-controller.mjs',
  'validate-campaign-projection.mjs',
  'validate-crew-dataset.mjs',
  'test-crew-retrieval-fixture.mjs',
  'test-director-retrieval-orchestration.mjs',
  'test-command-competence-planner.mjs',
  'test-command-competence-no-gotcha.mjs',
  'test-runtime-stage22-command-brief.mjs',
  'test-runtime-stage23-25-chapter1-opening.mjs',
  'test-pressure-ledger.mjs',
  'test-open-orders-review.mjs',
  'test-open-orders-scene.mjs',
  'test-open-orders-resolution.mjs',
  'test-runtime-stage26-28-first-response-pressure.mjs',
  'test-runtime-stage29-30-pressure-handoff.mjs',
  'test-runtime-stage31-chapter1-boarding-threshold.mjs',
  'test-runtime-stage32-chapter1-fronts.mjs',
  'test-runtime-stage33-chapter1-first-contact.mjs',
  'test-runtime-stage34-chapter1-discovery.mjs',
  'test-runtime-stage35-chapter1-pell-contact.mjs',
  'test-runtime-stage36-chapter1-joint-inspection.mjs',
  'test-runtime-stage37-chapter1-cargo-pulse.mjs',
  'test-runtime-stage38-chapter1-hardware-recovery.mjs',
  'test-runtime-stage39-chapter1-resolution-terms.mjs',
  'test-runtime-stage40-chapter1-false-colors-transition.mjs',
  'test-runtime-mvp-chapter1-complete.mjs',
  'test-runtime-mvp-fresh-journey.mjs',
  'test-side-mission-opportunity-detector.mjs',
  'test-side-mission-provider-assist.mjs',
  'test-runtime-stage41-chapter2-transparency-terms.mjs',
  'test-runtime-stage42-chapter2-orison-evidence.mjs',
  'test-runtime-stage43-chapter2-aegis-medical.mjs',
  'test-runtime-stage44-chapter2-security-access.mjs',
  'test-runtime-stage45-chapter2-joint-charter.mjs',
  'test-runtime-stage46-chapter2-quiet-channels-continuity.mjs',
  'test-stage30-runtime-hygiene.mjs',
  'test-dual-host-scaffold.mjs',
  'validate-mission-graph.mjs',
  [
    'validate-mission-graph.mjs',
    'schemas/mission/mission-graph.schema.json',
    'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json',
    'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
    'packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json'
  ],
  [
    'validate-mission-graph.mjs',
    'schemas/mission/mission-graph.schema.json',
    'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json',
    'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json',
    'packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json'
  ],
  'test-mission-graph-fixture.mjs',
  'test-mission-state-delta-contract.mjs',
  'validate-mission-director-contract.mjs',
  'test-mission-director-loop.mjs',
  'test-transaction-state.mjs',
  'test-runtime-director-turn.mjs',
  'test-runtime-host-injection.mjs',
  'test-runtime-stage9-turn-loop.mjs',
  'test-runtime-stage10-prelude-autosave.mjs',
  'test-runtime-stage11-readiness.mjs',
  'test-runtime-stage12-fallback-command.mjs',
  'test-runtime-stage13-command-rhythm.mjs',
  'test-runtime-stage14-hesperus-aftermath.mjs',
  'test-runtime-stage15-combined-load.mjs',
  'test-runtime-stage16-prelude-completion.mjs',
  'test-simulation-mode-policy.mjs',
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
