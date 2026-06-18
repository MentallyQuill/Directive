# Tool Scripts

Node-based local scripts for validation, smoke checks, audits, fixture tests, and release gates.

## Current Fast Checks

```powershell
node tools\scripts\validate-starship-package.mjs
node tools\scripts\validate-campaign-projection.mjs
node tools\scripts\validate-crew-dataset.mjs
node tools\scripts\test-crew-retrieval-fixture.mjs
node tools\scripts\validate-mission-graph.mjs
node tools\scripts\test-mission-graph-fixture.mjs
node tools\scripts\validate-mission-director-contract.mjs
node tools\scripts\test-mission-director-loop.mjs
node tools\scripts\verify-repo-structure.mjs
```

`test-mission-director-loop.mjs` runs the executable Director loop against the Hesperus fixture and compares generated packets to the established turn contract fixture.
