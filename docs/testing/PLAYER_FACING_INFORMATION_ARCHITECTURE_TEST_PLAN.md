# Player-Facing Information Architecture Test Plan

**Status:** Required implementation and release contract

**Design:** `docs/superpowers/specs/2026-07-20-player-facing-information-architecture-design.md`

**Implementation:** `docs/superpowers/plans/2026-07-20-player-facing-information-architecture.md`

## Purpose

Prove that Directive's player UI is simpler, useful information remains discoverable, and quest selection is presentation state only. A visually correct screenshot is insufficient: tests must also prove that clicking a quest cannot alter game state, prompts, time, tracking, mechanics, or model-call activity.

## Release Gates

All gates are mandatory:

1. Exactly five top-level routes render in the approved order.
2. Mission renders one unified quest list/detail surface and no subtabs.
3. Quest selection persists per campaign/chat and survives drawer reopen and reload.
4. Invalid selection falls back to the active mission, then first available quest.
5. Quest selection mutates only UI preferences.
6. Player-safe evidence/history is discoverable in Mission, Crew, or Ship.
7. Hidden, latent, watchlisted, operator-only, and diagnostic records remain absent.
8. Recovery and troubleshooting controls appear only in their contextual or advanced states.
9. Focused scripts and the full alpha gate pass.
10. Live Playwright passes at desktop and phone viewports against the installed extension copy.

## Test Environments

- **Deterministic local:** Node assertion scripts with fixed state and DOM fixtures.
- **Runtime integration:** in-memory host/storage adapters and stubbed provider journals.
- **Live browser:** running SillyTavern with a dedicated non-human user such as `directive-soak-a`.
- **Production evidence:** `default-user` may be inspected read-only, but automated UI tests must not change its chats, saves, preferences, or layout.

## Required Live Artifacts

Store under `artifacts/player-facing-ui/<run-id>/`:

- repository commit and dirty-state summary;
- repository and installed extension hashes for changed source files;
- SillyTavern base URL and non-human user handle;
- campaign, save, and chat ids;
- viewport name and dimensions;
- before/after canonical state hashes and revisions;
- before/after UI preference hash;
- before/after prompt revision, game time, and provider-call count;
- desktop and phone screenshots;
- DOM/layout assertion summary;
- console errors and failed network requests, redacted.

Never store credentials, cookies, CSRF tokens, provider payloads, raw prompts, hidden campaign truth, or provider reasoning.

## Layer 1: Route and Information Architecture Contracts

Run:

```powershell
node tools/scripts/test-player-facing-route-contracts.mjs
node tools/scripts/test-command-spine-layout.mjs
```

| Case | Expected |
| --- | --- |
| Route registry | `campaign, mission, crew, ship, settings` |
| No active campaign, empty route | Campaign |
| Active campaign, empty route | Mission |
| Active campaign, persisted `log` | Mission |
| No campaign, persisted `log` | Campaign |
| Valid remembered `crew` | Crew remains selected |
| Desktop route buttons | Five, unique ids, one selected |
| Phone route buttons | Five, unique ids, one selected |
| Runtime shell source | No `renderCommandLogPanel` import or dispatch |

## Layer 2: Projection and Privacy Contracts

Run: `node tools/scripts/test-player-facing-information.mjs`

### Mission projection matrix

| Source record | Destination | Expected |
| --- | --- | --- |
| Main mission | Mission | First when active |
| Available open-world quest | Mission | Unified list with `side`/`open-world` marker |
| Crew-linked quest | Mission | Unified list with `crew` marker |
| Quest evidence | Selected quest Known So Far/history | Visible |
| Quest message | Selected quest history | Visible |
| Completed quest | Completed group | Collapsed by default |
| Hidden/watchlisted thread | None | Excluded |
| Raw prompt/provider diagnostic | None | Excluded |

### Crew and Ship projection matrix

| Source record | Destination | Expected |
| --- | --- | --- |
| Character statement | Crew person detail | Visible when player-known |
| Relationship change | Crew person detail/history | Visible |
| Command Bearing raw evaluator evidence | None | Excluded |
| Technical discovery | Ship history | Visible |
| Active damage/restriction | Ship | Visible |
| Zero/no-change condition | Ship | Omitted |
| Internal reconciliation diagnostic | None | Excluded |

Assert stable ordering, id deduplication, a maximum of three first-level Known So Far facts, and no mutation of input fixtures.

## Layer 3: Quest Selection Isolation

Run:

```powershell
node tools/scripts/test-runtime-ui-preferences.mjs
node tools/scripts/test-quest-selection-ui-only.mjs
```

For every selection case capture before and after:

- serialized canonical `campaignState` hash;
- campaign revision;
- mechanics revision;
- prompt-context revision;
- canonical scene time and countdown values;
- active mission/objective ids;
- tracking queues and last-delta refs;
- provider-call journal length;
- host transcript hash;
- UI preference document hash.

Expected: only the UI preference hash changes.

| Case | Expected selection |
| --- | --- |
| Stored id exists | Stored id |
| Stored id removed | Active mission id |
| No stored id | Active mission id |
| No active mission | First projected quest id |
| No quests | `null` and concise empty state |
| Same quest clicked twice | No canonical mutation; preference remains stable |
| Same quest id in another chat | Separate campaign/chat preference scope |
| Blank or malformed id | Rejected without persistence |
| Hidden quest id requested | Rejected as unavailable |

Explicitly assert zero prompt flushes, model calls, settlement jobs, campaign writes, and chat writes.

## Layer 4: Panel DOM Contracts

Run:

```powershell
node tools/scripts/test-player-facing-panel-contracts.mjs
node tools/scripts/test-extension-shell.mjs
node tools/scripts/test-ship-panel-state-records.mjs
node tools/scripts/test-open-world-ui-runtime-contracts.mjs
node tools/scripts/test-end-condition-ui-contracts.mjs
node tools/scripts/test-visual-system-foundation.mjs
```

### Mission

- One quest navigation landmark and one quest detail region.
- One selected quest row with `aria-selected="true"`.
- Category/status text does not become another tab bar.
- Current objective and actionable deadline are visible.
- Known So Far contains one to three first-level facts.
- Related history is collapsed by default.
- Inactive/completed groups are collapsed and omitted when empty.
- Pending required decision may appear as one contextual alert.
- Recovery is absent in healthy state and present only in an actionable recovery fixture.

### Crew

- First level shows identity, role, availability/posture, standing, and involvement.
- Selecting a person exposes player-known statements, facts, and history.
- Raw Command Bearing evidence/review/accounting panels are absent.
- Current Pressure, Command Context, Recent Command Memory, and Open Threads are not separate first-level panels.

### Ship

- Identity, capability/resources, condition, and active constraints are visible.
- Overall condition is rendered once.
- Empty damage/restriction categories are omitted.
- Technical discoveries/history are discoverable through Ship.

### Campaign and Settings

- Campaign cards prioritize identity and primary action.
- Duplicate phase/chat/ship/outcome fields are absent from first-level cards.
- Settings first level contains editable preferences.
- Advanced and Developer & Troubleshooting disclosures are closed by default.
- Opening a disclosure does not persist another UI state field.

### Forbidden normal-player labels

Assert absence from the healthy player route render:

```text
Bound Chat
Prompt Context
Tracked Turns
Committed Revision
Turn Route
Latest Committed Outcome
Recovery Console
Continuity Matrix
Model-call Diagnostics
Open Threads
Open World
Components
Intel
Log
```

The words may remain in internal source, diagnostics, or advanced content; the assertion applies to the healthy normal-player DOM.

## Layer 5: Keyboard and Accessibility

Deterministic DOM and Playwright both verify:

1. Tab reaches every top-level route exactly once.
2. Enter/Space selects a quest row.
3. Selected row exposes `aria-selected="true"` and remains visibly focused.
4. Native disclosures toggle by keyboard and expose expanded state.
5. Focus stays on the selected row after detail refresh.
6. Route and quest status do not rely on color alone.
7. Every icon-only control has an accessible name and tooltip.
8. No hidden/collapsed control remains in the tab order.

## Layer 6: Live Playwright Procedure

### Preconditions

1. Start SillyTavern and install/sync the repository extension copy.
2. Verify changed installed files hash-match the repository.
3. Use a dedicated campaign/chat under `directive-soak-a`.
4. Seed at least one active, available, inactive, and completed quest plus linked crew and ship records.
5. Clear only that soak user's Directive layout and quest-selection preferences.

Run:

```powershell
node tools/scripts/test-live-soak-prep.mjs
$env:DIRECTIVE_SILLYTAVERN_USER='directive-soak-a'
node tools/scripts/test-player-facing-ui-playwright.mjs
```

### Browser scenario

1. Authenticate and assert the browser session user is `directive-soak-a`.
2. Open the seeded chat and Directive drawer.
3. Assert Mission is the active default route.
4. Assert route order and absence of Log/Intel.
5. Capture the pre-selection state bundle and screenshot.
6. Select the available quest using role and accessible name.
7. Assert selected row and detail change.
8. Read storage/runtime evidence and prove only UI preferences changed.
9. Close and reopen the drawer; assert selection persists.
10. Reload the page; assert selection persists.
11. Expand completed quests with keyboard and inspect one completed detail.
12. Navigate Crew and verify a linked statement/history.
13. Navigate Ship and verify a linked technical record.
14. Navigate Settings and verify advanced groups begin closed.
15. Run the recovery fixture: absent before fault, visible during fault, absent after resolution.
16. Capture final screenshot, DOM summary, console errors, and failed requests.

Repeat at:

| Viewport | Size |
| --- | --- |
| Phone | 390 x 845 |
| Narrow tablet | 720 x 900 |
| Desktop | 1280 x 900 |
| Wide desktop | 1440 x 1000 |

### Layout assertions

- Drawer and route controls stay inside viewport.
- No horizontal overflow exceeds one pixel.
- Text and icon bounds do not overlap adjacent controls.
- Quest title, status, objective, and longest fixture word remain inside their containers.
- Desktop list/detail tracks remain stable before and after selection.
- Phone has one vertical scroll owner; nested quest/history regions do not trap scrolling.
- Opening completed/history disclosures does not cover following content.
- The next section remains reachable at every viewport.

## Layer 7: Full Regression

Run: `node tools/scripts/run-alpha-gate.mjs`

The gate must retain canonical behavior tests for open-world actions, Command Bearing, mission components, recovery, end conditions, save/load, and post-visible settlement even when their former player panels are removed. Removing a panel is not permission to weaken domain behavior.

## Failure Triage

| Failure | First inspection |
| --- | --- |
| Quest click changes state revision | `selectMissionQuest` action and panel callback |
| Selection does not persist | UI preference normalization and campaign/chat scope key |
| Wrong fallback quest | `resolveSelectedQuestId` and active mission id source |
| Hidden fact appears | projection visibility filter and relation join |
| History disappears | canonical-to-contextual relation projection |
| Log route returns | route registry, persisted route normalization, mobile nav snapshot |
| Recovery always visible | contextual alert projection and healthy-state fixture |
| Phone scroll traps | nested `overflow-y` rules and drawer scroll owner |
| Repo tests pass, browser differs | installed extension hash and served path |

## Acceptance Record

Record:

- commit tested;
- focused script results;
- alpha gate result;
- live user, campaign, save, and chat ids;
- installed-copy hash result;
- viewport results and artifact paths;
- exact before/after mutation proof;
- known residual risks.

Do not approve release from screenshots alone or from repository-only tests when the served extension copy was not verified.
