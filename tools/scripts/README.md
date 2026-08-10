# Directive V1 scripts

`run-alpha-gate.mjs` is the only aggregate gate. It executes the focused contract tests listed in that file and stops on the first failure.

The retained scripts cover exact V1 packages and storage, accepted-pair custody, time, mission evidence/reduction, Story Settlement, Duty Reports, Command Bearing, projections, transitions, SillyTavern integration, the five-route UI, provider routing, character creation, and all Ashes scenario fixtures.

Do not add tests for removed runtimes or speculative features. A new test belongs here only when it protects a current V1 contract or a confirmed regression in current code.

Run:

```powershell
npm.cmd run test:browser:install
npm.cmd test
```

The browser install command provisions the Playwright-pinned Chromium used by the campaign-library presentation regression. Run it once after `npm.cmd install` and again whenever the Playwright version changes.
