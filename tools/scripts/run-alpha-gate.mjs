import { spawnSync } from 'node:child_process';

const checks = [
  'test-extension-shell.mjs',
  'test-runtime-shell-creator-flow.mjs',
  'validate-starship-package.mjs',
  'test-starship-package-context.mjs',
  'test-starship-package-importer.mjs',
  'test-package-update-diagnostics.mjs',
  'test-campaign-start-and-save.mjs',
  'test-directive-file-api.mjs',
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
  'test-runtime-stage26-28-first-response-pressure.mjs',
  'test-runtime-stage29-30-pressure-handoff.mjs',
  'test-stage30-runtime-hygiene.mjs',
  'validate-mission-graph.mjs',
  [
    'validate-mission-graph.mjs',
    'schemas/mission/mission-graph.schema.json',
    'packages/bundled/breckinridge/ashes-of-peace.starship-package.json',
    'packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json',
    'packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json'
  ],
  'test-mission-graph-fixture.mjs',
  'validate-mission-director-contract.mjs',
  'test-mission-director-loop.mjs',
  'test-transaction-state.mjs',
  'test-runtime-director-turn.mjs',
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
