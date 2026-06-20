import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeStarshipPackageArchive,
  normalizeStarshipPackageZip
} from '../../src/packages/starship-package-importer.mjs';

const root = process.cwd();
const packageData = JSON.parse(fs.readFileSync(path.resolve(root, 'packages/bundled/breckenridge/ashes-of-peace.starship-package.json'), 'utf8'));

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function localHeader(nameBytes, data, localOffset = 0) {
  const buffer = Buffer.alloc(30 + nameBytes.length + data.length);
  buffer.writeUInt32LE(0x04034b50, 0);
  buffer.writeUInt16LE(20, 4);
  buffer.writeUInt16LE(0, 6);
  buffer.writeUInt16LE(0, 8);
  buffer.writeUInt16LE(0, 10);
  buffer.writeUInt16LE(0, 12);
  buffer.writeUInt32LE(0, 14);
  buffer.writeUInt32LE(data.length, 18);
  buffer.writeUInt32LE(data.length, 22);
  buffer.writeUInt16LE(nameBytes.length, 26);
  buffer.writeUInt16LE(0, 28);
  nameBytes.copy(buffer, 30);
  data.copy(buffer, 30 + nameBytes.length);
  return { buffer, localOffset };
}

function centralHeader(nameBytes, data, localOffset) {
  const buffer = Buffer.alloc(46 + nameBytes.length);
  buffer.writeUInt32LE(0x02014b50, 0);
  buffer.writeUInt16LE(20, 4);
  buffer.writeUInt16LE(20, 6);
  buffer.writeUInt16LE(0, 8);
  buffer.writeUInt16LE(0, 10);
  buffer.writeUInt16LE(0, 12);
  buffer.writeUInt16LE(0, 14);
  buffer.writeUInt32LE(0, 16);
  buffer.writeUInt32LE(data.length, 20);
  buffer.writeUInt32LE(data.length, 24);
  buffer.writeUInt16LE(nameBytes.length, 28);
  buffer.writeUInt16LE(0, 30);
  buffer.writeUInt16LE(0, 32);
  buffer.writeUInt16LE(0, 34);
  buffer.writeUInt16LE(0, 36);
  buffer.writeUInt32LE(0, 38);
  buffer.writeUInt32LE(localOffset, 42);
  nameBytes.copy(buffer, 46);
  return buffer;
}

function endOfCentralDirectory(entryCount, centralSize, centralOffset) {
  const buffer = Buffer.alloc(22);
  buffer.writeUInt32LE(0x06054b50, 0);
  buffer.writeUInt16LE(0, 4);
  buffer.writeUInt16LE(0, 6);
  buffer.writeUInt16LE(entryCount, 8);
  buffer.writeUInt16LE(entryCount, 10);
  buffer.writeUInt32LE(centralSize, 12);
  buffer.writeUInt32LE(centralOffset, 16);
  buffer.writeUInt16LE(0, 20);
  return buffer;
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.path, 'utf8');
    const data = Buffer.from(entry.text, 'utf8');
    const local = localHeader(nameBytes, data, localOffset);
    localParts.push(local.buffer);
    centralParts.push(centralHeader(nameBytes, data, localOffset));
    localOffset += local.buffer.length;
  }
  const centralOffset = localOffset;
  const central = Buffer.concat(centralParts);
  return Buffer.concat([
    ...localParts,
    central,
    endOfCentralDirectory(entries.length, central.length, centralOffset)
  ]);
}

const validZip = createStoredZip([
  {
    path: 'package/ashes-of-peace.starship-package.json',
    text: JSON.stringify(packageData)
  },
  {
    path: 'package/README.md',
    text: '# Ashes of Peace'
  }
]);
const validResult = normalizeStarshipPackageZip({
  fileName: 'ashes-of-peace.directive-starship.zip',
  bytes: validZip,
  importedAt: '2026-06-18T00:00:00.000Z'
});
assert.equal(validResult.ok, true);
assert.equal(validResult.packageRecord.packageId, 'directive:starship-package:breckenridge-ashes-of-peace');
assert.equal(validResult.packageRecord.packageData.ship.name, 'U.S.S. Breckenridge');
assert.deepEqual(validResult.packageRecord.assetPaths, ['package/README.md']);

const unsafePathResult = normalizeStarshipPackageArchive({
  fileName: 'unsafe.directive-starship.zip',
  entries: [
    { path: '../evil.json', text: '{}' },
    { path: 'package/ashes-of-peace.starship-package.json', text: JSON.stringify(packageData) }
  ]
});
assert.equal(unsafePathResult.ok, false);
assert.equal(unsafePathResult.diagnostics.issues.some((item) => item.code === 'unsafe-path'), true);

const activeContentResult = normalizeStarshipPackageArchive({
  fileName: 'active.directive-starship.zip',
  entries: [
    { path: 'package/ashes-of-peace.starship-package.json', text: JSON.stringify(packageData) },
    { path: 'package/script.js', text: 'alert(1)' }
  ]
});
assert.equal(activeContentResult.ok, false);
assert.equal(activeContentResult.diagnostics.issues.some((item) => item.code === 'active-content-rejected'), true);

const missingFields = cloneJson(packageData);
delete missingFields.manifest;
const missingFieldsResult = normalizeStarshipPackageArchive({
  fileName: 'missing.directive-starship.zip',
  entries: [
    { path: 'package/ashes-of-peace.starship-package.json', text: JSON.stringify(missingFields) }
  ]
});
assert.equal(missingFieldsResult.ok, false);
assert.equal(missingFieldsResult.diagnostics.issues.some((item) => item.code === 'package-spine-invalid'), true);

const mismatchResult = normalizeStarshipPackageArchive({
  fileName: 'mismatch.directive-starship.zip',
  expectedPackageId: 'directive:starship-package:other',
  entries: [
    { path: 'package/ashes-of-peace.starship-package.json', text: JSON.stringify(packageData) }
  ]
});
assert.equal(mismatchResult.ok, false);
assert.equal(mismatchResult.diagnostics.issues.some((item) => item.code === 'package-id-mismatch'), true);

const invalidSchema = cloneJson(packageData);
invalidSchema.manifest.transportExtension = '.zip';
const invalidSchemaResult = normalizeStarshipPackageArchive({
  fileName: 'invalid.directive-starship.zip',
  entries: [
    { path: 'package/ashes-of-peace.starship-package.json', text: JSON.stringify(invalidSchema) }
  ]
});
assert.equal(invalidSchemaResult.ok, false);
assert.equal(invalidSchemaResult.diagnostics.issues.some((item) => item.code === 'package-transport-invalid'), true);

console.log('Starship package importer tests passed.');
