# V1 Architecture Documentation Packet Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create one discoverable, internally consistent V1 architecture documentation packet covering unified story tracking, mission objectives and closure, fair discovery and crew initiative, Ashes migration, UI projection, Command Bearing simplification, and explicit retirement of brittle legacy systems.

**Architecture:** A short master authority map identifies the focused companion contracts and controls documentation precedence. Mission mechanics, Ashes content migration, and V1 UI/legacy retirement remain separate reviewable documents, while existing Story Settlement and Fair Discovery specs retain their focused ownership. Older documents receive explicit V1 status banners instead of being silently rewritten as though their implementations no longer exist.

**Tech Stack:** Markdown architecture/specification documents, repository documentation index, PowerShell/`rg` consistency checks, Git.

## Global Constraints

- Ashes of Peace is the only complete V1-native campaign requirement.
- Other campaign names and images remain visible as greyed, unselectable teaser cards.
- Story Settlement is the sole semantic story authority; no new tracking ledger may compete with it.
- Mission progress is evidence-backed and deterministic after bounded model interpretation.
- Mission objectives may be non-linear and must remain spoiler-safe.
- Hidden information may cause world events but cannot produce evaluative punishment before fair player awareness.
- Command Bearing remains one neutral reserve; Inspiration, Resolve, Marks, ranks, and inferred-completion awards are not V1 authority.
- The SillyTavern send-tray ship icon opens Directive in V1; Directive Assist is outside the required V1 path.
- Native SillyTavern swipes and edits remain permitted. Directive does not attempt to prevent cheating.
- Protected-editing and player-facing Scene Reconciliation UI are not V1 systems; passive source-mutation detection and exact CORE/SRE/REPAIR recovery remain.
- Only actual objective deadlines display countdown or urgency UI. Narrative pressure without a deadline does not display a timer.
- Documentation must distinguish target V1 contracts from current/as-coded runtime behavior.
- Preserve unrelated dirty worktree changes and stage only documentation files owned by this packet.

---

### Task 1: Master V1 Authority Map and Supersession Register

**Files:**
- Create: `docs/architecture/V1_GAMEPLAY_ARCHITECTURE.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`

**Interfaces:**
- Consumes: approved Unified Story Settlement and Fair Discovery specs plus the decisions in this plan's Global Constraints.
- Produces: the canonical entry point and precedence rules consumed by every later documentation task.

- [x] **Step 1: Write the master decision map**

Define the V1 product outcome, authority chain, companion-document table, cross-system data flow, current-versus-target distinction, and non-goals.

- [x] **Step 2: Add the supersession register**

Classify Story Settlement, Fair Discovery, the new mission spec, the new UI/retirement spec, and the Ashes migration plan as target V1 authority. Classify older Assist, Scene Handshake, Scene Reconciliation, Outcome Integrity, Mission Components, Narrative Thread, Command Bearing track/rank, and legacy quest-progression documents as current/historical/deferred where appropriate.

- [x] **Step 3: Add the master document to the documentation index**

Place it first in the Architecture section and describe it as the entry point for the complete V1 gameplay architecture packet.

- [x] **Step 4: Verify the map**

Run:

```powershell
rg -n "V1 Gameplay Architecture|Supersession|Unified Story Settlement|Fair Discovery|Mission State|Ashes V1|UI and Legacy" docs/architecture/V1_GAMEPLAY_ARCHITECTURE.md docs/DOCUMENTATION_INDEX.md
```

Expected: every companion contract and every retired/deferred legacy family appears in the authority map.

### Task 2: Mission State and Objective Resolution Contract

**Files:**
- Create: `docs/superpowers/specs/2026-08-09-mission-state-and-objective-resolution-design.md`
- Modify: `docs/superpowers/specs/2026-08-09-fair-discovery-and-crew-initiative-design.md`
- Modify: `docs/superpowers/specs/2026-08-08-unified-story-settlement-design.md`

**Interfaces:**
- Consumes: Story Settlement typed effects, Fair Discovery knowledge constraints, existing predicate vocabulary, Mission Director proposal/validation boundary, and authoritative time state.
- Produces: objective schema, evidence contract, mission reducer, closure/transition rules, deadline rules, and narrator transition packet used by UI and migration documents.

- [x] **Step 1: Define objective identity and classes**

Specify stable objective IDs; required, optional, and conditional classification; mechanical status separate from player visibility; and terminal dispositions that do not require numeric percentage progress.

- [x] **Step 2: Define non-linear dependency and evidence semantics**

Use predicates over committed facts, events, outcomes, clocks, and objective states. A model proposes bounded evidence claims with source references; deterministic code validates and reduces them. Player prose never proves its own success.

- [x] **Step 3: Define mission outcome and closure**

Separate primary success dimensions from optional branch outcomes. Required objectives determine closure; optional and conditional branches may enhance, mix, hand off, waive, or remain unactivated without blocking completion. Define deterministic next-phase/mission activation.

- [x] **Step 4: Define urgency and deadline ownership**

Only authored deadlines tied to objective consequences display countdowns. Define start, pause, advance, expiry, consequence, and player-safe projection. Narrative urgency without a clock remains prose/pressure, not timer UI.

- [x] **Step 5: Define narration boundary and recovery**

Code emits an authorized mission-transition packet after closure. The model narrates the committed result and next setup but cannot independently complete, reopen, or activate mission state. Cover provider failure, stale evidence, swipe/edit/delete invalidation, and branch reconstruction.

- [x] **Step 6: Add reciprocal bindings**

Link the new mission contract from Story Settlement and Fair Discovery without duplicating their detailed rules.

- [x] **Step 7: Verify coverage**

Run:

```powershell
rg -n "required|optional|conditional|non-linear|evidence|closure|deadline|transition packet|next mission|player visibility" docs/superpowers/specs/2026-08-09-mission-state-and-objective-resolution-design.md
```

Expected: every term maps to a normative section and acceptance criterion.

### Task 3: Ashes V1 Campaign Migration Design

**Files:**
- Create: `docs/planning/ASHES_V1_MIGRATION_PLAN.md`
- Modify: `docs/authoring/ASHES_OF_PEACE_AUTHORING_REFERENCE.md`
- Modify: `docs/authoring/CAMPAIGN_AUTHORING_GUIDE.md`

**Interfaces:**
- Consumes: target mission-objective schema, Fair Discovery, Story Settlement, UI projection requirements, and current bundled Ashes mission/package data.
- Produces: content conversion order, mapping rules, validation gates, Hesperus reference conversion, and explicit non-Ashes V1 exclusion.

- [x] **Step 1: Inventory migration units**

Define migration ownership for campaign metadata, mission graphs, phases, objectives, facts, pressures, clocks, crew reveal/report routes, outcome dimensions, transitions, and UI fixtures.

- [x] **Step 2: Define contract-first sequencing**

Pin the target schemas and validators before converting Ashes. Convert Prelude/Hesperus as the reference vertical slice, then remaining Ashes missions. Do not architect around legacy non-Ashes structures.

- [x] **Step 3: Define Hesperus conversion**

Remove fraud spoilers from initial summary/objectives, add routine records review, clue/confirmation facts, conditional accountability objective, rescue-first closure, outcome matrix, and Whitaker/crew report routes.

- [x] **Step 4: Define catalog teaser migration**

Preserve non-Ashes campaign name and image metadata only for V1 selection. Require an explicit unavailable/coming-soon state, grey presentation, disabled selection, and no loading of legacy campaign gameplay data.

- [x] **Step 5: Define fixture and acceptance gates**

Include schema validation, graph reachability, spoiler linting, objective closure matrices, deadline tests, report delivery, Story Settlement projection, UI projection, branches/swipes, and a complete Ashes campaign certification run.

- [x] **Step 6: Add authoring guidance**

Add concise target-V1 sections to the Ashes reference and general authoring guide. Keep current schema documentation labeled as current/as-coded until implementation changes it.

- [x] **Step 7: Verify migration scope**

Run:

```powershell
rg -n "Ashes|Hesperus|Prelude|coming-soon|unselectable|objective|reveal|deadline|certification|non-Ashes" docs/planning/ASHES_V1_MIGRATION_PLAN.md docs/authoring/ASHES_OF_PEACE_AUTHORING_REFERENCE.md docs/authoring/CAMPAIGN_AUTHORING_GUIDE.md
```

Expected: Ashes is the sole V1 conversion target and every mission-content domain has an owner and gate.

### Task 4: V1 UI and Legacy Retirement Contract

**Files:**
- Create: `docs/superpowers/specs/2026-08-09-v1-ui-and-legacy-retirement-design.md`
- Modify: `docs/superpowers/specs/2026-07-20-player-facing-information-architecture-design.md`
- Modify: `docs/design/TARGET_USER_FLOW.md`

**Interfaces:**
- Consumes: mission/objective projection, Story Settlement aggregates and Focus, Fair Discovery Duty Reports, neutral Command Bearing, and Ashes campaign availability.
- Produces: one canonical UI home per datum, launcher behavior, route-level projection, legacy feature disposition, and high-value-information acceptance rules.

- [x] **Step 1: Define launcher and chat relationship**

The send-tray ship icon opens Directive. Chat remains primary play. Required Duty Reports attach to the relevant assistant chat row and may be mirrored in Mission. Directive Assist is not required for V1 and cannot own the launcher.

- [x] **Step 2: Define route ownership**

Campaign owns library/teasers/saves; Mission owns active mission, objectives, true deadlines, known facts, evidence, history, and Focus; Crew owns people and meaningful relationship moments; Ship owns one current operational aggregate; Settings owns preferences and deliberately disclosed troubleshooting.

- [x] **Step 3: Define objective presentation**

Show available objectives without implying order unless dependency requires it. Distinguish required and optional without exposing hidden branches. Show progress through states and evidence, not generic percentages. Render mission completion and mixed optional outcomes concisely.

- [x] **Step 4: Define Command Bearing presentation**

Show one neutral reserve and its valid spend/readied state. Remove Inspiration/Resolve, Marks, ranks, evidence mining, and inferred objective rewards from V1 player UI.

- [x] **Step 5: Define legacy retirement and native host behavior**

Remove player-facing Scene Reconciliation, protected-edit interception, restrictive outcome editor, tracking-review panels, and anti-cheating assumptions from the V1 target. Preserve native SillyTavern edit/swipe affordances plus passive source mutation detection and exact recovery.

- [x] **Step 6: Bind and supersede the July UI spec**

Add a target-V1 status section explaining that Story Settlement and the new mission/UI contracts supersede the July spec's old canonical-tracker assumption while retaining its five-route and high-value-information principles.

- [x] **Step 7: Verify UI ownership**

Run:

```powershell
rg -n "ship icon|Directive Assist|Campaign|Mission|Crew|Ship|Settings|required|optional|deadline|Command Bearing|Reconciliation|protected|native SillyTavern" docs/superpowers/specs/2026-08-09-v1-ui-and-legacy-retirement-design.md
```

Expected: every agreed player-visible datum and retired interaction has one explicit owner or disposition.

### Task 5: Legacy Document Status Banners

**Files:**
- Modify: `docs/design/DIRECTIVE_ASSIST.md`
- Modify: `docs/design/SCENE_HANDSHAKE_PROTOCOL.md`
- Modify: `docs/design/OUTCOME_INTEGRITY.md`
- Modify: `docs/design/COMMAND_BEARING_SYSTEM.md`
- Modify: `docs/design/MISSION_COMPONENTS.md`
- Modify: `docs/design/NARRATIVE_THREAD_ENGINE.md`
- Modify: `docs/planning/SCENE_RECONCILIATION_PLAN.md`
- Modify: `docs/architecture/MISSION_DIRECTOR_AS_CODED.md`

**Interfaces:**
- Consumes: master supersession register and focused target specs.
- Produces: visible status/precedence markers that prevent future work from treating stale designs or as-coded behavior as V1 target authority.

- [x] **Step 1: Add concise status banners**

Each document must state whether it is current/as-coded, historical, deferred post-V1, partially retained, or superseded for V1, with direct links to the controlling target documents.

- [x] **Step 2: Preserve useful history**

Do not delete old design rationale or claim runtime removal before implementation. Explicitly separate retained mechanics from retired UI/semantic authority.

- [x] **Step 3: Verify every conflicting family is marked**

Run:

```powershell
rg -n "V1 status|superseded|deferred|as-coded|Story Settlement|V1 Gameplay Architecture" docs/design/DIRECTIVE_ASSIST.md docs/design/SCENE_HANDSHAKE_PROTOCOL.md docs/design/OUTCOME_INTEGRITY.md docs/design/COMMAND_BEARING_SYSTEM.md docs/design/MISSION_COMPONENTS.md docs/design/NARRATIVE_THREAD_ENGINE.md docs/planning/SCENE_RECONCILIATION_PLAN.md docs/architecture/MISSION_DIRECTOR_AS_CODED.md
```

Expected: every file has an explicit status and target-authority link near its opening.

### Task 6: Cross-System Test and Documentation Integrity Plan

**Files:**
- Create: `docs/testing/V1_GAMEPLAY_ARCHITECTURE_TEST_PLAN.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`

**Interfaces:**
- Consumes: acceptance criteria from every target V1 companion spec and the Ashes migration plan.
- Produces: one verification matrix for deterministic contracts, provider variation, player prose variation, UI projection, source mutation, migration, and live Ashes certification.

- [x] **Step 1: Build the traceability matrix**

Map each V1 invariant to fixture, contract, integration, UI, and live proof requirements. Name the intended proof layer without inventing implementation file names that are not yet designed.

- [x] **Step 2: Cover failure and abuse cases**

Include narrator omission, malformed model evidence, optional discovery omission, required disclosure recovery, hidden deadline, premature mission closure, repeated report spam, swipe/edit/delete, branch, stale async result, native host edits, and player metagame assertions.

- [x] **Step 3: Define Ashes release gate**

Require full Prelude/Hesperus and remaining Ashes mission traversal across multiple play styles, non-linear ordering, optional branches, missed discoveries, deadlines, Command Bearing, save/reload, and campaign completion.

- [x] **Step 4: Add the test plan to the documentation index**

Place it in Testing as the target V1 gameplay architecture verification contract.

### Task 7: Packet-Wide Consistency Review and Commit

**Files:**
- Verify: every file created or modified by Tasks 1-6.

**Interfaces:**
- Consumes: the complete documentation packet.
- Produces: a committed, reviewable documentation-only change with no placeholders or conflicting target authority.

- [x] **Step 1: Run placeholder and ambiguity scans**

```powershell
rg -n "TBD|TODO|FIXME|PLACEHOLDER|\?\?\?|implement later|as needed|and/or" docs/architecture/V1_GAMEPLAY_ARCHITECTURE.md docs/superpowers/specs/2026-08-09-*.md docs/planning/ASHES_V1_MIGRATION_PLAN.md docs/testing/V1_GAMEPLAY_ARCHITECTURE_TEST_PLAN.md
```

Expected: no unresolved placeholder language in target contracts.

- [x] **Step 2: Run contradiction scans**

```powershell
rg -n "Inspiration|Resolve|Marks|Bearing Rank|protected edit|Scene Reconciliation|Directive Assist|technicalDebt|percentage|0 minutes remaining" docs/architecture/V1_GAMEPLAY_ARCHITECTURE.md docs/superpowers/specs/2026-08-09-*.md docs/superpowers/specs/2026-08-08-unified-story-settlement-design.md
```

Expected: matches occur only in explicit retirement, migration, or prohibition statements.

- [x] **Step 3: Verify links and formatting**

Run `git diff --check`, confirm every new relative link target exists, and inspect the Documentation Index ordering.

- [x] **Step 4: Review staged scope**

Stage only documentation packet files. Confirm the staged file list contains no runtime, UI, style, fixture, attachment, or unrelated in-progress documentation files.

- [x] **Step 5: Commit**

Use:

```text
docs(architecture): define V1 gameplay packet
```
