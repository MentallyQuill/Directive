# Directive SillyTavern Multi-User Soak Readiness

Run: 2026-06-24T06-58-56-483Z
Mode: live
Status: pass
Base URL: http://127.0.0.1:8000

## Users

- directive-soak-a: passwordConfigured=false, placeholder=false
- directive-soak-b: passwordConfigured=false, placeholder=false
- directive-soak-c: passwordConfigured=false, placeholder=false

## Checks

- pass: user-count - At least two SillyTavern users are configured for parallel readiness.
- pass: placeholder-users - Explicit soak user handles are configured.
- pass: reserved-human-user - No human-only SillyTavern account is assigned to automated soak work.
- pass: base-url - SillyTavern base URL is configured.
- pass: playwright-import - Playwright imports successfully.
- pass: live-user-storage-isolation - Each configured SillyTavern user saw only its own Directive /user/files probe.

## Live Results

- directive-soak-a: pass - ownVisible=true, othersVisible=0
- directive-soak-b: pass - ownVisible=true, othersVisible=0
- directive-soak-c: pass - ownVisible=true, othersVisible=0

