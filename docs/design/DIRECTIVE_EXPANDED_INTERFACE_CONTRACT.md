# Directive Expanded Interface Contract

## Status

This is the living design and integration authority for Directive's player-facing expanded interface redesign.

It captures the decisions proven in the current interactive mockup and will be updated as Ship, Settings, and remaining states are designed. It supersedes route-specific layout and save-control guidance in [Directive Interface Design Bible](DIRECTIVE_INTERFACE_DESIGN_BIBLE.md) where the documents conflict. The older document remains useful for general visual identity, accessibility, and host-parity guidance.

This document does not claim that the production UI or runtime save migration is complete.

## Executable Reference

- Interactive HTML: [directive-expanded-interface.html](mockups/directive-expanded-interface.html)
- Working preview URL: `http://localhost:55835/`
- Current mockup coverage: Campaign, Mission, People, Ship, desktop/console layout, phone layout, route navigation, quest/person/ship-issue expansion, presentation-only ordering, campaign selection, Open Chat, Save Game, Load Game, and Delete Save.
- Pending mockup coverage: Settings, complete empty/error/recovery states, controller navigation, and production host mounting.

The HTML is a behavioral design artifact, not production source. Approved behavior must be implemented through Directive's shared UI and runtime APIs rather than copying mock data or hardcoded asset URLs from the mockup.

## Product Role

Directive's expanded interface is the player's campaign memory and command journal. It is analogous to the map, quest, people, and records screens in a modern narrative RPG, adapted to a chat-native Star Trek command game.

The player opens it to answer five questions:

1. What am I currently trying to accomplish?
2. What other quests or obligations are available?
3. What do I know about the people involved?
4. What is true about my ship and its current condition?
5. Which campaign or saved checkpoint do I want to resume?

It is not an operator console, save-debugger, model-call inspector, or duplicate chat browser.

## Product Identity

The target is a modern Voyager-era LCARS game menu:

- LCARS is structural, not a color skin.
- AAA clarity constrains the science-fiction styling.
- Large ship and character artwork creates identity and context.
- Dense information is permitted only when it helps the player make a decision.
- Negative space is intentional, but empty surfaces without useful content are not.
- The interface should feel authored, not generated from generic dashboard cards.

Directive should feel closer to a modern RPG journal than a web administration panel. Hogwarts Legacy, Fallout 4, Baldur's Gate 3, and Red Dead Redemption 2 are interaction references, not visual templates.

## Governing Rules

### Less Is More

Every player-facing field must answer a player question or support a player action. Remove fields that only prove that Directive is tracking something.

Do not expose:

- raw save health, binding ids, revisions, hashes, or commit status;
- the latest tracking mutation;
- package diagnostics in the normal campaign flow;
- recovery tools without a current recoverable problem;
- duplicate links to the current chat;
- speculative countdowns, invented urgency, or mock data that the runtime cannot support;
- hidden simulation state or private character knowledge.

### Selection Is Presentation

Selecting a quest, person, campaign, category, or save changes only the interface until the player invokes an explicit command.

- Quest selection foregrounds its details. It does not change mission priority, Director behavior, simulation state, or prompt weighting.
- Campaign selection previews that campaign. It does not load it.
- Save selection previews actions for that checkpoint. It does not load it.
- Person selection changes the detail pane. It does not alter relationships or quest ownership.
- Presentation selection may persist locally so the most recently viewed record remains selected.

### One Pattern Per Job

Quest lists, People categories, and mobile record lists use shared collection primitives where their behavior is the same. Do not build separate drag, collapse, edit, and expansion systems for each route.

### Player State And UI State Stay Separate

Player-authored organization is UI preference state. Campaign facts remain runtime state.

```js
const uiPreferences = {
  selectedQuestByCampaign: {},
  selectedPersonByCampaign: {},
  selectedCampaignId: null,
  categoryOrderByCampaign: {},
  recordOrderByCategory: {},
  collapsedCategoryIds: [],
};
```

No field above may be consumed as narrative authority.

## Global Shell

### Routes

The approved primary routes are:

1. Campaign
2. Mission
3. People
4. Ship
5. Settings

There is no separate Intel route. Information belongs with the object it informs:

- mission evidence, discoveries, and objectives live in Mission;
- character knowledge and relationship history live in People;
- ship discoveries, condition, and systems knowledge live in Ship.

There is no separate Situation route. The foreground quest and unified quest list provide that function inside Mission.

### Desktop And Console

- Directive opens as a viewport-bound expanded menu rather than a narrow shelf with pop-outs.
- The top bar contains product identity, route context, and Close.
- There is no Back button on a primary route.
- A narrow static LCARS rail provides identity without consuming interactive width.
- Rail segments keep their colors and small numeric/abbreviation details.
- The bottom route bar remains visible inside the shell.
- Route content never increases the shell beyond the viewport.
- Long master and detail panes scroll independently.

```css
.directive-shell {
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

.directive-workspace {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.route-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.master-list,
.detail-scroll {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
```

### Phone

- The phone preview is a separate responsive composition, not a scaled desktop layout.
- The bottom route bar remains available.
- Quests, people, campaigns, and saves render as compact vertical records.
- Tapping a record expands its details in place; tapping it again collapses it.
- Opening one peer record closes the previous peer record.
- Quest and People records may expose a dedicated drag handle for presentation-only ordering.
- The chevron rotates or flips around its center.
- No menu-overlay round trip is required to choose another record.
- The final record remains reachable above the bottom navigation.

## Visual Contract

### LCARS Structure

- Use asymmetric caps, rails, segmented rules, and structural color bands.
- Keep the left rail narrow and static. Do not animate active-route illumination.
- Use route color on headings, selection markers, and the active bottom control.
- Structural segments must not resemble unlabeled buttons.
- Avoid decorative lines that cut through primary artwork.

### Palette

- Canvas: near-black with a slight blue-violet bias.
- Campaign/action: amber and gold.
- Mission: lilac.
- People: blue.
- Ship: violet.
- Settings/warning: coral.
- Text: warm off-white with restrained muted text.

The canvas should be darker than the early mobile reference, but not so black that the top region loses depth.

### Typography And Controls

- Condensed display typography is used for route labels, headings, and commands.
- Body copy uses a readable sans-serif.
- Route labels and icons must remain legible at console viewing distance.
- Familiar icons accompany commands; icon-only controls require labels and tooltips.
- Primary commands are visually stronger than save management and destructive actions.
- Cards use restrained radii and are reserved for records or framed tools.

### Scrollbars

All Directive-owned scroll regions use one scoped, unobtrusive scrollbar treatment. Do not theme the host page scrollbar.

- Use a transparent track with no visible trough or arrow buttons.
- Use a thin `7px` thumb for Chromium/WebKit and `scrollbar-width: thin` elsewhere.
- Derive the thumb from the active route accent at low contrast.
- Increase thumb contrast only on hover and active interaction.
- Use a fully rounded thumb with transparent inset border so it does not read as another LCARS bar.
- Apply the same treatment to vertical and horizontal scrollbars, corners, master lists, detail panes, modals, and future route-local scrollers.
- Preserve a minimum practical thumb length and keyboard/wheel scrolling behavior.

```css
.directive-shell,
.directive-shell * {
  scrollbar-width: thin;
  scrollbar-color:
    color-mix(in srgb, var(--route-accent) 38%, #252936)
    transparent;
}

.directive-shell *::-webkit-scrollbar {
  width: 7px;
  height: 7px;
}

.directive-shell *::-webkit-scrollbar-track,
.directive-shell *::-webkit-scrollbar-corner {
  background: transparent;
}

.directive-shell *::-webkit-scrollbar-thumb {
  min-height: 32px;
  background: color-mix(in srgb, var(--route-accent) 38%, #252936);
  background-clip: padding-box;
  border: 2px solid transparent;
  border-radius: 999px;
}

.directive-shell *::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--route-accent) 62%, #303542);
  background-clip: padding-box;
}

.directive-shell *::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}
```

### Imagery

- Campaign uses a large, inspectable ship image.
- People uses package-owned portraits in rows and a large selected-person render.
- Mission does not require a contact portrait. Future quest imagery should use a curated mission-image set rather than assuming every quest has a rendered contact.
- Production UI resolves package assets through shared media APIs. It must not hardcode Ashes filenames.

## Campaign Route

### Purpose

Campaign answers: which playthrough and checkpoint should I continue?

It is not a package-health dashboard. Campaign creation and import remain available but subordinate to continuing an existing game.

### Desktop Layout

- Left: unified campaign list, active campaign first, then most recently played.
- Right: selected campaign artwork, identity, concise premise, actions, and saved checkpoints.
- Completed campaigns remain ordinary loadable campaigns. Do not add archive, review, or completion-only commands.

### Campaign Fields

Show only:

- campaign title;
- player name and role;
- hero image;
- active or complete label when relevant;
- assignment or setting;
- current chapter;
- last played date;
- short premise;
- saved checkpoints.

### Campaign Commands

The active campaign exposes one primary command:

- **Open Chat**: return to the active timeline's bound chat without deliberately changing campaign state.

An inactive campaign does not expose `Load Campaign`. The player selects one of its saved games and invokes `Load Game`.

### Save Model

Directive uses game-save semantics rather than exposing storage operations.

- Autosave remains automatic and normally invisible.
- **Save Game** creates a named reusable checkpoint.
- Saving does not move the player to another chat or change the active timeline.
- A checkpoint preserves the corresponding chat at the save point.
- **Load Game** creates a new playable continuation from the checkpoint and opens the correct derived chat.
- Loading does not mutate or consume the checkpoint.
- **Delete Save** removes a checkpoint after confirmation.

```text
Active timeline
  -> Save Game
       -> immutable checkpoint
            -> Load Game
                 -> new active timeline and chat
```

Player-facing actions:

```text
[ Open Chat ]

SAVED GAMES                              [ Save Game ]

Before the Distress Call
Ready Room Handover

Selected checkpoint: Before the Distress Call
[ Load Game ]  [ Delete Save ]
```

### Save Runtime Contract

The current runtime behavior must change. Existing `Save Game` overwrites the active save, while `Save Game As...` creates and activates a mutable chat branch. The redesign replaces both visible commands with one checkpoint-producing `Save Game`.

Proposed checkpoint record:

```js
const manualCheckpoint = {
  kind: 'directive.manualCheckpoint.v1',
  id: checkpointId,
  campaignId,
  name,
  createdAt,
  chapterId,
  sourceSaveId,
  sourceChatId,
  preservedChatBinding,
  coreManifestRef,
  immutable: true,
};
```

Proposed shared runtime actions:

```js
async function saveGame({ name }) {
  const source = await requireMatchingActiveCampaignChat();
  const checkpointId = ids.next('checkpoint');
  const preservedChat = await host.chat.cloneCampaignChat({
    sourceChatId: source.binding.chatId,
    open: false,
  });

  return checkpoints.create({
    id: checkpointId,
    name,
    source,
    preservedChat,
    immutable: true,
    activate: false,
  });
}

async function loadGame({ checkpointId }) {
  const checkpoint = await checkpoints.require(checkpointId);
  const activeSaveId = ids.next('save');
  const playableChat = await host.chat.cloneCampaignChat({
    sourceChatId: checkpoint.preservedChatBinding.chatId,
    open: true,
  });

  const state = await core.forkCheckpoint({
    checkpoint,
    targetSaveId: activeSaveId,
    targetChatId: playableChat.chatId,
  });

  await prompts.rebuild({ state, binding: playableChat.binding });
  return { state, playableChat, loadedFromCheckpointId: checkpointId };
}
```

The real operation crosses host chat and Directive storage boundaries. Implement it with an idempotent journal so interrupted clone, checkpoint, binding, CORE fork, prompt rebuild, and open-chat steps can resume safely.

Completed campaign checkpoints use the same load path. Completed state may suppress active gameplay prompts according to campaign rules, but the UI does not invent a separate completed-campaign workflow.

## Mission Route

### Purpose

Mission answers: what am I trying to accomplish, what progress has been made, and what other quests can I inspect?

### Layout

- Desktop uses a compact unified quest list and a selected quest detail pane.
- The active or most recently selected quest is foregrounded.
- Other quests and completed quests remain in the same list and may be collapsed.
- Phone uses expandable quest records rather than a separate selection menu.

### Quest Content

The selected quest may show:

- title and quest type;
- concise premise or situation description;
- current objective;
- task checklist with completed tasks crossed out and muted;
- progress expressed through completed tasks;
- relevant location, people, evidence, or known constraints;
- active, available, or complete status.

Do not show generated urgency or countdowns unless they exist in authoritative player-safe campaign state.

Quest selection is presentation-only. The last selected quest may persist as UI preference state.

```js
function selectQuestForDisplay({ campaignId, questId }) {
  uiPreferences.selectedQuestByCampaign[campaignId] = questId;
  return renderMission({ selectedQuestId: questId });
}
```

The function above must not invoke the Mission Director, alter quest priority, or write campaign state.

## People Route

### Purpose

People is the player's character memory. It covers crew and encountered NPCs, not only the ship's duty roster.

### Desktop Composition

- At desktop widths of `900px` and above, the People roster is a fixed `240px` master pane.
- Roster portrait thumbnails remain `48px` square. Do not reduce them to recover width.
- A `4px` blue divider sits on the roster's right edge and replaces the former blue inset on the detail panel.
- The selected-person portrait receives `clamp(250px, 42%, 350px)` of the detail pane, transferring the roster's added `10px` from the portrait rather than the written detail column.
- The desktop/tablet portrait is `calc(70% - 20px)` of the detail pane's height, with a `280px` minimum. Its lower `34%` fades into the detail background so the image ends softly instead of forming a full-height wall.
- The written detail column consumes the remaining width and scrolls independently.
- At `641-899.98px`, use a `210px` roster and `clamp(190px, 40%, 240px)` portrait fallback.
- Phone does not inherit either split-pane rule or the portrait fade; its compact portrait remains `200px` high.

```css
@media (min-width: 900px) {
  .people-layout {
    grid-template-columns: 240px minmax(0, 1fr);
  }

  .people-roster {
    border-right: 4px solid var(--people-accent);
  }

  .people-detail {
    grid-template-columns: clamp(250px, 42%, 350px) minmax(0, 1fr);
    box-shadow: none;
  }

  .people-row img {
    width: 48px;
    height: 48px;
  }
}

@media (min-width: 641px) {
  .people-detail__portrait {
    align-self: start;
    height: calc(70% - 20px);
    min-height: 280px;
  }

  .people-detail__portrait::after {
    content: "";
    position: absolute;
    inset: auto 0 0;
    height: 34%;
    pointer-events: none;
    background: linear-gradient(
      180deg,
      transparent 0%,
      color-mix(in srgb, var(--surface-high) 38%, transparent) 42%,
      var(--surface-high) 100%
    );
  }
}
```

### Categories

Recommended baseline categories:

- Ship's Company
- Starfleet and Federation
- Local Authorities
- Allies and Contacts
- Adversaries and Persons of Interest
- Unknown or Unsorted

Only categories supported by current campaign data should render. Empty baseline categories may stay collapsed or be omitted according to the final empty-state decision.

### Unified Collection System

Categories and person records use the same collection system as other reorderable records:

- collapse and expand;
- drag through a dedicated handle;
- keyboard reordering;
- user-created category add, rename, reorder, and remove;
- person reordering within and across categories;
- baseline categories and package-owned people cannot be deleted;
- model-proposed categorization is advisory because players can organize records themselves.

```js
const peopleCollection = {
  categories: [
    { id: 'ships-company', label: "Ship's Company", system: true },
    { id: 'contacts', label: 'Allies and Contacts', system: true },
    { id: 'custom-1', label: 'Reach Delegates', system: false },
  ],
  placements: {
    'mara-whitaker': 'ships-company',
    'envoy-tarel': 'custom-1',
  },
};
```

### Person Detail

The approved core is intentionally small:

1. Identity: image, name, public role, affiliation/category.
2. Current involvement: linked active quest and why this person matters now.
3. Known information: concise player-known facts relevant to decisions.
4. Relationship and history: collapsed by default, with a short relationship summary and important prior interactions.

Do not expose approval scores, hidden motives, complete biographies, or speculative facts.

### Starfleet Rank And Division Marks

Starfleet people use a compact Voyager-era presentation treatment in both collection rows and detail views:

- a thin division-color bar;
- the person's public rank text;
- small solid and hollow rank pips.

This is metadata, not a uniform illustration or combadge treatment. The same renderer is used on desktop and phone. Non-Starfleet people render none of these marks.

The player-controlled People category is independent from service metadata. Moving a Starfleet officer into a custom category cannot change their division color or pips. Rank and department come from the authoritative player-safe person record, and the UI deterministically maps them to presentation values:

```js
const VOYAGER_DIVISION_BY_DEPARTMENT = Object.freeze({
  command: 'command',
  flight: 'command',
  tactical: 'operations',
  security: 'operations',
  operations: 'operations',
  engineering: 'operations',
  science: 'science',
  medical: 'science',
});

const VOYAGER_RANK_PIPS = Object.freeze({
  captain: ['solid', 'solid', 'solid', 'solid'],
  commander: ['solid', 'solid', 'solid'],
  lieutenant_commander: ['solid', 'solid', 'hollow'],
  lieutenant: ['solid', 'solid'],
  lieutenant_junior_grade: ['solid', 'hollow'],
  ensign: ['solid'],
});

function starfleetMarks(person) {
  if (person.service?.organization !== 'starfleet') return null;
  return {
    division: VOYAGER_DIVISION_BY_DEPARTMENT[person.service.department],
    pips: VOYAGER_RANK_PIPS[person.service.rankCode] || [],
    rankLabel: person.service.rankLabel,
  };
}
```

Promotions update `service.rankCode` and `service.rankLabel`; department changes update `service.department`. The renderer owns all color and pip derivation. It must not parse role, billet, category, dialogue, or biography text.

### Scrolling

Desktop People is viewport-bound:

- the collection toolbar remains visible;
- the roster scrolls beneath it;
- the selected portrait remains framed;
- person details scroll independently;
- the bottom route bar remains fixed inside Directive.

This is required behavior, not optional polish.

## Ship Route

Ship is the player's operational status board. It answers four questions: what ship am I commanding, where is it, what can it do, and what currently constrains my decisions.

### Information Contract

Show only:

- package-owned ship image, name, class, and registry;
- player-safe current condition and explicit alert status when one exists;
- committed position, course, and travel state;
- active damage, restrictions, and known issues in one prioritized Operational Issues list;
- issue title, practical effect, type, status, and responsible department or officer;
- a short package-authored list of capabilities that can materially change player strategy.

Do not show:

- invented readiness percentages or health meters;
- generic system specifications;
- exhaustive technical telemetry;
- crew details already owned by People;
- mission objectives already owned by Mission;
- empty damage, restriction, or issue panels;
- completed repair history or long service-history prose;
- ETA unless an authoritative campaign clock or navigation record supplies it.

Unknown optional values are omitted rather than rendered as `Unknown`, `None`, or an empty card.

### Desktop Composition

1. A wide package-owned ship image establishes identity. Name, class, registry, and concise condition sit over the lower image gradient.
2. A compact Current Operation strip shows committed position, course, and flight status.
3. Operational Issues receives the wider content column and orders records by player consequence: critical damage, active restrictions, significant known issues, then lower-priority concerns.
4. Operational Capabilities receives the narrower column and contains only a few campaign-relevant capabilities.
5. The Ship journal scrolls internally when required; the Directive shell and route bar remain viewport-bound.

### Phone Composition

- Use a shorter ship hero with the same identity fields.
- Arrange Current Operation as two compact columns, allowing the third value to span both columns.
- Present Operational Issues as the initially expanded disclosure.
- Present Operational Capabilities as a collapsed disclosure.
- Keep the route bar available and avoid reproducing the desktop two-column board.

### Ship Collection Interaction

Operational Issues and Operational Capabilities use the same shared reorderable-record primitive used by other sortable collections. The visual treatment and interaction contract must not fork by list type.

- Each record has a dedicated handle using the approved category-handle icon.
- Mouse dragging begins from the handle. Touch and pen require a short `175ms` long press before dragging so ordinary vertical scrolling remains reliable.
- `ArrowUp` and `ArrowDown` on a focused handle provide equivalent keyboard ordering.
- A body-level drag preview and exact-height placeholder preserve layout while dragging.
- The nearest list, not the page, auto-scrolls when the pointer approaches its top or bottom edge.
- Desktop lists scroll inside their respective board columns. Phone lists scroll inside the open disclosure with a maximum height of `min(42dvh, 360px)`.
- Reordering is presentation-only. It cannot change issue severity, capability availability, mission priority, model context, or simulation behavior.
- Player ordering is scoped to campaign and ship. Newly tracked records append in authoritative default order; IDs no longer present in authoritative state are removed from the preference projection.

Operational Issues may expand when the record has useful structured detail. Opening one issue closes its peer. Expansion is also presentation-only and may persist as the most recently viewed issue.

The current expandable detail contract is limited to fields Directive can already source and refresh reliably: operational effect, status, severity, owner, linked assignment title, and last-updated time. Omit absent values. Do not infer workarounds, milestones, quest links, or system relationships from prose merely to fill the panel.

Operational Capabilities remain non-expandable until Directive owns a structured capability-state contract with player-relevant dynamic fields. A static summary plus sortable placement is sufficient today.

```js
const scopeKey = `${campaignId}:${shipId}`;

uiPreferences.shipCollections[scopeKey] = {
  issueOrder: ['ship.issue-a', 'ship.issue-b'],
  capabilityOrder: ['ship.capability-a', 'ship.capability-b'],
  expandedIssueId: 'ship.issue-a',
};

function projectOrderedRecords(authoritativeRecords, preferredIds = []) {
  const byId = new Map(authoritativeRecords.map(record => [record.id, record]));
  const preferred = preferredIds.flatMap(id => byId.delete(id) ? [id] : []);
  return [...preferred, ...byId.keys()].map(id =>
    authoritativeRecords.find(record => record.id === id)
  );
}
```

Production should implement this through the existing shared collection controller rather than retaining the mockup's page-local drag functions.

### Trackable Projection

```js
const shipView = {
  identity: {
    name: 'U.S.S. Breckenridge',
    className: 'Intrepid-class',
    registry: 'NCC-74638',
    imageRef: 'ship.hero',
    condition: 'Post-refit shakedown',
  },
  operation: {
    position: 'Personnel transfer waypoint',
    course: 'Asterion Reach',
    travelState: 'Impulse / Station-keeping',
  },
  issues: [{
    id: 'ship.command-network-certificate-compatibility',
    type: 'knownIssue',
    title: 'Command-network certificate mismatch',
    effect: 'Secure command handoffs require additional verification.',
    status: 'active',
    owner: 'Operations',
  }],
  capabilities: [{
    id: 'ship.long-range-sensor-processing',
    label: 'Long-range sensor processing',
    summary: 'Upgraded analysis for extended-range detection and survey work.',
  }],
};
```

Identity and capabilities come from the active campaign package and ship dataset. Operation values come only from committed navigation or scene state. Issues come from player-visible structured damage, restriction, and technical-risk records. Resolved issues leave this surface rather than accumulating as history.

## Settings Route

Settings remains a primary route for player-chosen controls. The approved baseline separates ordinary player controls under General from provider routing and diagnostics under Advanced.

Settings should prioritize options the player intentionally changes. Diagnostics, repair, storage verification, and provider tooling must be contextual or placed behind an explicit advanced/system surface rather than dominating the normal experience.

General Settings does not contain campaign-specific controls. Remove Turn Recovery History, Autosave Frequency, Outcome Integrity, Review Provider, and the entire active-campaign settings section. Campaign behavior remains campaign-owned and automatic rather than becoming player-facing settings bloat.

Do not import the older card-heavy Settings reference wholesale.

## Information Value Test

Before adding a field, ask:

1. Can Directive source it reliably from authoritative or player-safe state?
2. Will it change what the player understands or decides?
3. Does it belong to this route rather than another?
4. Is it already visible nearby?
5. Can it remain current without excessive model calls?

If the answer to 1 or 2 is no, do not add it. If the answer to 4 is yes, remove the duplicate.

## Shared View Models

UI panels consume player-safe view models rather than raw campaign state.

```js
const campaignView = {
  campaigns: [{
    id,
    title,
    playerName,
    playerRole,
    image,
    status,
    setting,
    chapter,
    lastPlayedAt,
    premise,
    activeTimeline: { saveId, chatBindingAvailable },
    checkpoints: [{ id, name, chapter, createdAt, loadable }],
  }],
};

const missionView = {
  selectedQuestId,
  quests: [{ id, title, type, status, description, objective, tasks, context }],
};

const peopleView = {
  selectedPersonId,
  categories,
  people: [{
    id,
    name,
    image,
    role,
    affiliation,
    service: {
      organization: 'starfleet',
      department: 'command',
      rankCode: 'captain',
      rankLabel: 'Captain',
    },
    involvement,
    knownFacts,
    relationship,
    history,
  }],
};
```

Panels do not infer missing facts from prose and do not directly mutate runtime state.

## Production Integration Map

### Shared Shell

Primary files:

- `src/ui/directive-compact-shell.js`
- `src/ui/runtime-ui-kit.js`
- `styles/directive.css`

Required work:

- migrate from shelf/drawer geometry to viewport-bound expanded geometry;
- retain host Close behavior;
- remove primary-route Back behavior;
- implement stable bottom route navigation and narrow LCARS rail;
- add reusable bounded master/detail and mobile accordion primitives.

### Campaign

Primary files:

- `src/ui/campaign-panel.js`
- `src/runtime/runtime-app.mjs`
- `src/runtime/runtime-shell.js`
- `src/runtime/campaign-start-controller.mjs`
- storage and CORE v2 checkpoint/fork modules reached by those actions.

Required work:

- replace Command/Library/Records dashboard composition with unified campaign master/detail;
- remove `Load Campaign`, visible overwrite-style `Save Game`, and `Save Game As...` wording;
- expose `openCampaignChat`, `saveGame`, `loadGame`, and `deleteSave` through the shared action contract;
- implement immutable checkpoint creation without active-chat retargeting;
- implement copy-on-load playable chat and CORE state fork;
- keep automatic persistence and stable-turn autosaves separate from manual checkpoints.

### Mission

Primary file: `src/ui/mission-panel.js`.

Required work:

- replace redundant active/dashboard content with unified quest collection and detail;
- preserve presentation-only selection;
- map authoritative player-safe objectives and tasks into the checklist;
- use shared phone accordion and reordering primitives.

### People

Primary file: `src/ui/crew-panel.js`.

Required work:

- rename visible Crew route to People while preserving internal migration only as needed during the pre-alpha cutover;
- project encountered non-crew NPCs into the same player-safe view;
- project authoritative Starfleet organization, department, and rank fields into the player-safe person view;
- derive Voyager-era division bars and rank pips through one shared renderer used by rows and details on desktop and phone;
- add category/record preference persistence;
- implement shared collapse, drag, keyboard reorder, rename, add, and remove behavior;
- keep roster and detail scrolling internal on desktop.

### Ship And Settings

Primary files:

- `src/ui/ship-panel.js`
- `src/ui/settings-panel.js`

Do not begin broad production rewrites until their mockups and value contracts are approved.

## Suggested Component Contracts

```js
renderCollection({
  categories,
  records,
  selectedRecordId,
  movableCategories: true,
  movableRecords: true,
  editableCategory: (category) => !category.system,
  removableCategory: (category) => !category.system,
  onSelect,
  onReorderCategory,
  onReorderRecord,
  onRenameCategory,
});
```

```js
renderResponsiveRecordList({
  records,
  openRecordId,
  renderSummary,
  renderDetail,
  onToggle,
  reorder: {
    pointer: true,
    keyboard: true,
    handleIcon: 'category-handle',
  },
});
```

These are directionally real contracts. Final names should follow existing repo conventions after implementation discovery.

## Testing Contract

### Deterministic UI Tests

Test:

- direct route selection with no history Back state;
- quest and person selection remains presentation-only;
- selected UI state persistence is campaign-scoped;
- category and record reorder does not mutate campaign state;
- system categories and people cannot be deleted;
- custom categories can be added, renamed, reordered, and removed safely;
- inactive campaign selection does not load state;
- Open Chat appears only for the active timeline;
- Save Game creates an immutable checkpoint and leaves active save/chat identity unchanged;
- Load Game preserves the checkpoint, creates a new active save/chat identity, rebuilds prompt context, and opens the new chat;
- completed campaign checkpoints use the same load path;
- Delete Save requires confirmation and cannot delete the active timeline through the checkpoint UI.

### Playwright Matrix

Required viewports:

- desktop: `1440 x 900`;
- compact desktop/console: `1024 x 768`;
- phone: `390 x 844`;
- narrow phone: `360 x 800`.

At each viewport verify:

- Directive does not exceed the viewport;
- the bottom route bar is reachable and stable;
- no horizontal overflow exists;
- text does not overlap or clip;
- Campaign, Mission, and People controls are functional;
- desktop People roster and details scroll independently;
- all Directive-owned scrollbars use the scoped thin route-accent treatment with transparent tracks;
- phone records expand and collapse in place;
- drag handles remain distinct from expansion targets;
- chevrons transform around their center;
- hero and portrait images fill their frames without unintended bars;
- Starfleet division colors and rank pips update deterministically from department and rank without parsing prose;
- moving a person between categories does not alter service marks;
- non-Starfleet people do not receive Starfleet service marks;
- keyboard focus remains visible.

Example assertion:

```js
await expect(page.locator('.directive-shell')).toHaveCSS('overflow', 'hidden');

const geometry = await page.locator('.directive-shell').evaluate((shell) => ({
  shellHeight: shell.clientHeight,
  viewportHeight: window.innerHeight,
  horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}));

expect(geometry.shellHeight).toBeLessThanOrEqual(geometry.viewportHeight);
expect(geometry.horizontalOverflow).toBe(0);
```

### Runtime Save Tests

Add focused tests proving:

1. Save Game clones/preserves the source chat without opening it.
2. Save Game does not retarget the active binding.
3. The checkpoint's CORE authority is immutable.
4. Load Game clones the checkpoint chat into a new playable chat.
5. Load Game forks CORE state to a new save and chat binding.
6. The original checkpoint can be loaded repeatedly.
7. Interrupted save/load journals resume idempotently.
8. Wrong-chat and missing-chat guards fail with contextual recovery.
9. Stable-turn autosaves continue independently.
10. Prompt context is rebuilt only for the newly active chat.

### Visual Acceptance

Capture and review every implemented route in desktop and phone modes. Automated geometry checks are necessary but do not replace screenshot review for visual hierarchy, crop quality, density, and LCARS character.

## Removal And Relocation Register

Remove from the primary player experience:

- Campaign Active/Command dashboard duplication;
- latest committed outcome outside its relevant Mission context;
- standing recovery console;
- raw autosave and binding telemetry;
- separate Intel route;
- separate Situation route;
- `Load Campaign`;
- overwrite-style visible `Save Game`;
- `Save Game As...` terminology;
- primary-route Back button;
- animated LCARS rail activation experiment;
- contact portraits on quests as a required field.

Relocate:

- campaign evidence and discoveries to Mission;
- character knowledge and history to People;
- ship facts and discoveries to Ship;
- advanced diagnostics and repair to contextual Settings surfaces;
- manual Save Game into the Saved Games section.

## Open Decisions

The following remain intentionally unresolved and should be added here after review:

- final Ship information hierarchy and layout;
- final Settings player/advanced split;
- whether empty baseline People categories are omitted or shown collapsed;
- final campaign creation/import entry placement;
- final controller focus and bumper/tab behavior;
- checkpoint retention limits and whether autosaves are ever exposed in the normal Saved Games list;
- terminology for a loaded continuation if the host must expose it in records.

## Definition Of Done

The redesign is complete only when:

- all five routes have approved desktop and phone mockups;
- this document reflects those approvals;
- production view models expose only required player-safe data;
- the shared shell and collection primitives replace duplicate systems;
- game-save semantics are implemented atomically and tested;
- SillyTavern and future host surfaces share the same interaction model;
- Playwright geometry and interaction tests pass at all target viewports;
- reviewed screenshots meet the modern LCARS visual contract;
- the full Directive gate passes without weakening runtime or hidden-state contracts.
