import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Source snapshots are regenerated; annotations and corpus expectations are never generated.
// Changed definitions retain their old annotations but are explicitly marked for review.
const file = 'docs/testing/ashes-objective-support-matrix.json';
const matrix = JSON.parse(fs.readFileSync(file, 'utf8'));
const previous = new Map(matrix.missions.map(m => [m.missionId,m]));
const directory = 'packages/bundled/breckenridge/v1';
const keys = ['playerText','scenePacing','evidencePolicies','events','outcomes','facts','reportRoutes','commandBearingAwards','outcomeDimensions','closeWhen','terminalDispositions','transitions'];
matrix.missions = fs.readdirSync(directory).filter(f => f.endsWith('.mission-v1.json')).sort().map(name => {
    const sourcePath = `${directory}/${name}`;
    const bytes = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n');
    const source = JSON.parse(bytes);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const old = previous.get(source.id);
    const changed = !old || old.sha256 !== sha256;
    const result = { ...old, sourcePath, sha256, missionId:source.id, definitionVersion:source.version };
    for (const key of keys) result[key] = source[key] ?? (key === 'closeWhen' ? null : []);
    result.objectives = source.objectives.map(definition => {
        const prior = old?.objectives.find(o => o.objectiveId === definition.id);
        const operators = new Set();
        function walk(v) { if (!v || typeof v !== 'object') return; for (const [k,c] of Object.entries(v)) { if (['all','any','not','eventOccurred','factKnown','outcomeIs','objectiveState','objectiveDisposition','worldFact','missionStatus','capabilityAvailable','shipCapabilityAvailable'].includes(k)) operators.add(k); walk(c); } }
        walk(definition);
        return { ...prior, objectiveId:definition.id, definition, predicateOperators:[...operators].sort(), structuralTags:prior?.structuralTags ?? [], review:changed ? { ...prior?.review, status:'pending-semantic-review', sourceChange:'Source hash changed; retained annotations and case hashes require explicit review.' } : prior.review };
    });
    return result;
});
matrix.sourceRevision = execFileSync('git', ['rev-parse','HEAD'], { encoding:'utf8' }).trim();
matrix.hashNormalization = 'SHA-256 of UTF-8 source text with CRLF normalized to LF; no other normalization.';
matrix.missionCount = matrix.missions.length;
matrix.objectiveCount = matrix.missions.reduce((n,m) => n+m.objectives.length,0);
fs.writeFileSync(file, JSON.stringify(matrix,null,2)+'\n');
console.log('Regenerated source snapshots; retained review annotations and case expectations. Run test-objective-support-matrix.mjs to detect review/corpus drift.');
