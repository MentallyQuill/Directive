import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanRoots = ['src', 'tools', 'packages', 'schemas'];
const ignoredDirs = new Set(['.git', 'node_modules']);
const errors = [];
const forbiddenIdentifier = new RegExp(['sa', 'ga'].join(''), 'i');

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) {
      continue;
    }
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const text = fs.readFileSync(absolute, 'utf8');
    if (forbiddenIdentifier.test(text)) {
      errors.push(path.relative(root, absolute).replaceAll(path.sep, '/'));
    }
  }
}

for (const scanRoot of scanRoots) {
  walk(path.resolve(root, scanRoot));
}

if (errors.length > 0) {
  console.error('Stage 30 runtime hygiene failed: legacy runtime identifier found in scanned runtime/package/schema paths.');
  for (const filePath of errors) {
    console.error(`- ${filePath}`);
  }
  process.exit(1);
}

console.log('Stage 30 runtime hygiene tests passed: no legacy runtime identifiers in src/tools/packages/schemas');
