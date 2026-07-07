import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildArchitectureRedesignFinalCompletionPreflight } from './preflight-architecture-redesign-final-completion.mjs';

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'directive-final-completion-preflight-'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function releaseBundlePreflight(overrides = {}) {
  return {
    kind: 'directive.architectureRedesign.releaseBundlePreflight.v1',
    status: 'pass',
    strict: true,
    checks: [
      { id: 'implementation-complete-baseline', status: 'pass' },
      { id: 'continuity-full-certification-preflight', status: 'pass' },
      { id: 'message-mutation-actuation-live-proof', status: 'pass' }
    ],
    ...overrides
  };
}

function docPromotionPreflight(overrides = {}) {
  return {
    kind: 'directive.architectureRedesign.docPromotionPreflight.v1',
    status: 'pass',
    strict: true,
    checks: [
      { id: 'release-bundle-preflight', status: 'pass' },
      { id: 'documentation-index-links', status: 'pass' },
      { id: 'stale-hot-save-doc-claims', status: 'pass' }
    ],
    ...overrides
  };
}

const passRoot = makeRoot();
const passReleasePath = writeJson(path.join(passRoot, 'architecture-redesign-release-bundle-preflight.json'), releaseBundlePreflight());
const passDocsPath = writeJson(path.join(passRoot, 'architecture-redesign-doc-promotion-preflight.json'), docPromotionPreflight());
const passReport = buildArchitectureRedesignFinalCompletionPreflight({
  releaseBundlePreflight: passReleasePath,
  docPromotionPreflight: passDocsPath,
  strict: true
});
assert.equal(passReport.status, 'pass');
assert.equal(passReport.checks.find((entry) => entry.id === 'release-bundle-preflight').status, 'pass');
assert.equal(passReport.checks.find((entry) => entry.id === 'doc-promotion-preflight').status, 'pass');

const missingReleaseRoot = makeRoot();
const missingReleaseDocsPath = writeJson(path.join(missingReleaseRoot, 'architecture-redesign-doc-promotion-preflight.json'), docPromotionPreflight());
const missingReleaseReport = buildArchitectureRedesignFinalCompletionPreflight({
  releaseBundlePreflight: path.join(missingReleaseRoot, 'missing-release-bundle-preflight.json'),
  docPromotionPreflight: missingReleaseDocsPath,
  strict: true
});
assert.equal(missingReleaseReport.status, 'fail');
assert.equal(missingReleaseReport.checks.find((entry) => entry.id === 'release-bundle-preflight').status, 'fail');

const warningDocsRoot = makeRoot();
const warningDocsReleasePath = writeJson(path.join(warningDocsRoot, 'architecture-redesign-release-bundle-preflight.json'), releaseBundlePreflight());
const warningDocsPath = writeJson(path.join(warningDocsRoot, 'architecture-redesign-doc-promotion-preflight.json'), docPromotionPreflight({
  status: 'warning',
  checks: [
    { id: 'release-bundle-preflight', status: 'pass' },
    { id: 'documentation-index-links', status: 'warning' }
  ]
}));
const warningDocsReport = buildArchitectureRedesignFinalCompletionPreflight({
  releaseBundlePreflight: warningDocsReleasePath,
  docPromotionPreflight: warningDocsPath,
  strict: true
});
assert.equal(warningDocsReport.status, 'fail');
const warningDocsCheck = warningDocsReport.checks.find((entry) => entry.id === 'doc-promotion-preflight');
assert.equal(warningDocsCheck.status, 'fail');
assert.deepEqual(warningDocsCheck.details.failingChecks, [{ id: 'documentation-index-links', status: 'warning' }]);

fs.rmSync(passRoot, { recursive: true, force: true });
fs.rmSync(missingReleaseRoot, { recursive: true, force: true });
fs.rmSync(warningDocsRoot, { recursive: true, force: true });

console.log('Architecture redesign final completion preflight tests passed.');
