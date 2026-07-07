import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildArchitectureRedesignDocPromotionPreflight } from './preflight-architecture-redesign-doc-promotion.mjs';

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'directive-doc-promotion-preflight-'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function writeBomJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `\uFEFF${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
  return filePath;
}

function releaseBundleReport(overrides = {}) {
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

function writeDocs(root, { staleClaim = false } = {}) {
  const docsRoot = path.join(root, 'docs');
  writeText(path.join(docsRoot, 'DOCUMENTATION_INDEX.md'), [
    '# Directive Documentation',
    '',
    '- [Architecture Redesign Proposal](planning/ARCHITECTURE_REDESIGN_PROPOSAL.md)',
    '- [Architecture Redesign Implementation Plan](planning/ARCHITECTURE_REDESIGN_IMPLEMENTATION_PLAN.md)',
    ''
  ].join('\n'));
  writeText(path.join(docsRoot, 'planning', 'ARCHITECTURE_REDESIGN_PROPOSAL.md'), '# Proposal\n');
  writeText(path.join(docsRoot, 'planning', 'ARCHITECTURE_REDESIGN_IMPLEMENTATION_PLAN.md'), '# Plan\n');
  writeText(path.join(docsRoot, 'technical', 'PLAYER_TURN_SEQUENCE.md'), staleClaim
    ? 'Old note: hot path runtime writes full campaign saves after every turn.\n'
    : 'Current note: hot path writes compact CORE/v2 refs, not full campaign saves.\n');
  return docsRoot;
}

const passRoot = makeRoot();
const passDocsRoot = writeDocs(passRoot);
const passReleaseReport = writeJson(path.join(passRoot, 'release-bundle-preflight.json'), releaseBundleReport());
const passReport = buildArchitectureRedesignDocPromotionPreflight({
  docsRoot: passDocsRoot,
  releaseBundlePreflight: passReleaseReport,
  strict: true
});
assert.equal(passReport.status, 'pass');
assert.equal(passReport.checks.find((entry) => entry.id === 'release-bundle-preflight').status, 'pass');
assert.equal(passReport.checks.find((entry) => entry.id === 'documentation-index-links').status, 'pass');
assert.equal(passReport.checks.find((entry) => entry.id === 'stale-hot-save-doc-claims').status, 'pass');

const missingReleaseRoot = makeRoot();
const missingReleaseDocsRoot = writeDocs(missingReleaseRoot);
const missingReleaseReport = buildArchitectureRedesignDocPromotionPreflight({
  docsRoot: missingReleaseDocsRoot,
  releaseBundlePreflight: path.join(missingReleaseRoot, 'missing-release.json'),
  strict: true
});
assert.equal(missingReleaseReport.status, 'fail');
assert.equal(missingReleaseReport.checks.find((entry) => entry.id === 'release-bundle-preflight').status, 'fail');

const staleClaimRoot = makeRoot();
const staleClaimDocsRoot = writeDocs(staleClaimRoot, { staleClaim: true });
const staleClaimReleaseReport = writeJson(path.join(staleClaimRoot, 'release-bundle-preflight.json'), releaseBundleReport());
const staleClaimReport = buildArchitectureRedesignDocPromotionPreflight({
  docsRoot: staleClaimDocsRoot,
  releaseBundlePreflight: staleClaimReleaseReport,
  strict: true
});
assert.equal(staleClaimReport.status, 'fail');
const staleClaimCheck = staleClaimReport.checks.find((entry) => entry.id === 'stale-hot-save-doc-claims');
assert.equal(staleClaimCheck.status, 'fail');
assert.deepEqual(staleClaimCheck.details.files, ['technical/PLAYER_TURN_SEQUENCE.md']);

const bomRoot = makeRoot();
const bomDocsRoot = writeDocs(bomRoot);
const bomReleaseReport = writeBomJson(path.join(bomRoot, 'release-bundle-preflight.json'), releaseBundleReport());
const bomReport = buildArchitectureRedesignDocPromotionPreflight({
  docsRoot: bomDocsRoot,
  releaseBundlePreflight: bomReleaseReport,
  strict: true
});
assert.equal(bomReport.status, 'pass');

fs.rmSync(passRoot, { recursive: true, force: true });
fs.rmSync(missingReleaseRoot, { recursive: true, force: true });
fs.rmSync(staleClaimRoot, { recursive: true, force: true });
fs.rmSync(bomRoot, { recursive: true, force: true });

console.log('Architecture redesign doc promotion preflight tests passed.');
