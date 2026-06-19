import { spawnSync } from 'node:child_process';
import path from 'node:path';

const TESTS = Object.freeze([
  'tools/scripts/test-host-contract-fake.mjs',
  'tools/scripts/test-host-import-boundaries.mjs',
  'tools/scripts/test-sillytavern-generation-client.mjs',
  'tools/scripts/test-sillytavern-host-factory.mjs',
  'tools/scripts/test-lumiverse-storage-adapter.mjs',
  'tools/scripts/test-lumiverse-generation-client.mjs',
  'tools/scripts/test-lumiverse-events-adapter.mjs',
  'tools/scripts/test-lumiverse-interceptor-adapter.mjs',
  'tools/scripts/test-lumiverse-prompt-blocks.mjs',
  'tools/scripts/test-lumiverse-tools-adapter.mjs',
  'tools/scripts/test-lumiverse-host-factory.mjs',
  'tools/scripts/test-lumiverse-entrypoints.mjs',
  'tools/scripts/test-generation-router.mjs',
  'tools/scripts/test-prompt-injection-safety.mjs',
  'tools/scripts/test-sidecar-job-runner.mjs',
  'tools/scripts/test-host-sidecar-orchestrator.mjs',
  'tools/scripts/test-command-log-summary-sidecar.mjs',
  'tools/scripts/test-logical-storage-paths.mjs',
  'tools/scripts/test-logical-storage-adapter.mjs'
]);

for (const testPath of TESTS) {
  const result = spawnSync(process.execPath, [path.normalize(testPath)], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe'
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    process.stderr.write(`Dual-host scaffold test failed: ${testPath}\n`);
    process.exit(result.status || 1);
  }
}

console.log('Dual-host scaffold tests passed.');
