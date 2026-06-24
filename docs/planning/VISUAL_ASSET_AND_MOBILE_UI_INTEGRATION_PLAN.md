# Visual Asset And Mobile UI Integration Plan

> Status update, 2026-06-21: the asset, Theme Pack, Icon Pack, compact-card, and phone-width portions remain relevant. The original shared desktop bottom-navigation assumption is superseded by [Command Spine Migration](COMMAND_SPINE_MIGRATION.md). SillyTavern and Lumiverse now use the shared left command spine with one resizable drawer; phone width keeps the bottom route fallback.

## Purpose

This plan defines how Directive should integrate the Breckenridge senior staff visual bible, crew portraits, and U.S.S. Breckenridge ship art into the runtime UI without creating separate desktop and mobile products.

The target is one clean, mobile-compatible Directive shell that works in both SillyTavern and Lumiverse:

- shared host-neutral routes,
- shared bottom route navigation,
- top-right global shell actions on desktop/shelf layouts,
- Saga-style bottom route navigation and shell action strip,
- scroll-local content actions,
- package-owned visual assets,
- Saga-style Theme Pack support adapted to Directive tokens,
- Saga-style Icon Pack support adapted to Directive route/action icons,
- Saga mobile-inspired visual density, interaction rhythm, and customization flow,
- no bottom-right floating shell controls,
- no host-specific UI fork.

Directive is pre-alpha, so implementation can update current package and UI structures in place instead of preserving legacy placeholders.

## Source Inputs

The current art intake consists of:

| Asset | Intended use | Source size | Notes |
|---|---|---:|---|
| `USS_Breckenridge.png` | ship package hero, Campaign card, Ship panel header | 1254 x 1254 | Current U.S.S. Breckenridge identity image. |
| `Captain_Mara_Whitaker_Primary.png` | Whitaker formal portrait | 1254 x 1254 | Primary captain identity image. |
| `Captain_Mara_Whitaker_Heroic.png` | optional Whitaker variant | 1254 x 1254 | Present in the portrait folder; confirm whether to treat as a crisis/heroic variant. |
| `Commander_Miriam_Sato.png` | Sato formal portrait | 1254 x 1254 | Chief Medical Officer identity image. |
| `Lieutenant_Commander_Hadrik_Bronn.png` | Bronn formal portrait | 1254 x 1254 | Chief Tactical and Security Officer identity image. |
| `Lieutenant_Commander_Imani_Cross.png` | Cross formal portrait | 1254 x 1254 | Chief Engineer identity image. |
| `Lieutenant_Commander_Rowan_Saye.png` | Saye formal portrait | 1254 x 1254 | Chief Science Officer identity image. |
| `Lieutenant_Kieran_Vale.png` | Vale formal portrait | 1254 x 1254 | Flight Control Officer identity image. |
| `Lieutenant_Priya_Nayar.png` | Nayar formal portrait | 1254 x 1254 | Operations Officer identity image. |
| `Directive_Breckenridge_Senior_Staff_Visual_Design_Bible_v0.3.md` | visual source document | text | Should become the source of truth for future portrait variants and visual QA. |

The Breckenridge visual bible establishes grounded cinematic realism, Voyager-era duty uniforms, division colors, rank pips, character-specific posture, and render continuity rules. It also says the player-created Executive Officer is intentionally not included; the player portrait path should remain a future character-creator feature rather than a fixed asset in the Breckenridge package.

Directive's UI visual bible is UX-first and LCARS-led. Crew portraits and ship art should be framed by an original LCARS-inspired command interface rather than a generic card dashboard, but LCARS styling should be adapted until it improves hierarchy, scanability, and task completion. See [../design/LCARS_VISUAL_IDENTITY.md](../design/LCARS_VISUAL_IDENTITY.md) for the governing UI art direction.

## Product Direction

The portraits should make the Crew and Mission surfaces feel like a living command team, not a gallery bolted onto the side of a test fixture.

The ship art should make the Campaign and Ship surfaces immediately read as the Breckenridge package without turning the runtime into a landing page. Directive is an operational tool inside a chat host, so the imagery should be rich but compact:

- use portraits as identity anchors,
- use the ship image as package and ship-state context,
- keep controls dense and touch-safe,
- keep text and state legible over decorative ambition,
- keep hidden relationship/development values hidden,
- load optimized derivatives, not original multi-megabyte PNGs.

When this plan says "borrow from Saga mobile," it means the full mobile product language, not only viewport behavior. Directive should borrow Saga's Theme Pack model, Icon Pack model, compact visual styling, touch-first interaction flow, bottom route navigation, route/subview usability, settings customization patterns, and visual smoke expectations. Bottom route navigation is now the shared shell direction across SillyTavern and Lumiverse surfaces.

## Saga Borrowing Scope

Directive should treat Saga's mobile runtime as the donor design system for:

- Theme Packs: data-only theme definitions, bundled/custom packs, swatches, accessibility checks, active runtime CSS variables, and controls that follow the active pack instead of hardcoded accents.
- Icon Packs: data-owned icon mappings, bundled/custom sets, image/icon fallbacks, route and action icon slots, and Settings previews.
- Visual language: compact cards, dense operational rows, subtle borders, warm/data accent behavior, restrained surfaces, and icon-forward controls.
- UX flow: a small number of primary routes, route-local details/subviews, one dominant next action per surface, touch-safe controls, stable scroll containment, and settings-driven personalization.
- Verification: desktop, phone-width, and host-shelf visual smoke for theme application, icon loading, text fit, active states, and no overflow.

Directive should not copy Saga namespaces or storage keys. Use Directive-owned names, files, CSS variables, storage domains, schemas, and route IDs. The intended relationship is design-system inheritance, not source-tree inheritance.

## Asset Ownership Model

The assets should belong to the Breckenridge package, not to individual UI panels.

Recommended package path:

```text
assets/packages/breckenridge/
  source/
    visual-bible/
    portraits/
    ship/
  images/
    crew/
    ship/
    package/
```

Recommended package metadata:

```json
{
  "assets": {
    "images": [
      {
        "id": "breckenridge.ship.primary",
        "kind": "ship.hero",
        "subjectId": "uss-breckenridge",
        "variants": {
          "hero": "assets/packages/breckenridge/images/ship/uss-breckenridge.hero.webp",
          "card": "assets/packages/breckenridge/images/ship/uss-breckenridge.card.webp",
          "thumb": "assets/packages/breckenridge/images/ship/uss-breckenridge.thumb.webp"
        },
        "alt": "U.S.S. Breckenridge in space",
        "focalPoint": { "x": 0.55, "y": 0.48 }
      },
      {
        "id": "breckenridge.crew.mara-whitaker.primary",
        "kind": "crew.portrait.formal",
        "subjectId": "mara-whitaker",
        "variants": {
          "detail": "assets/packages/breckenridge/images/crew/mara-whitaker.detail.webp",
          "card": "assets/packages/breckenridge/images/crew/mara-whitaker.card.webp",
          "thumb": "assets/packages/breckenridge/images/crew/mara-whitaker.thumb.webp"
        },
        "alt": "Captain Mara Whitaker"
      }
    ]
  }
}
```

The current `assets.images` schema is intentionally loose. The first implementation can add this object shape in the bundled package, then tighten `schemas/packages/assets.schema.json` after the UI consumes it successfully.

## Derivative Strategy

Do not load the original 1254px PNGs directly in routine runtime panels.

Create deterministic derivatives:

| Variant | Target | Use |
|---|---:|---|
| `detail` | 768px square, WebP or optimized PNG | crew detail view and larger modal/sheet art. |
| `card` | 384px square, WebP or optimized PNG | Crew cards, Campaign package card, Ship compact hero. |
| `thumb` | 96px square, WebP or optimized PNG | roster rows, Mission speaker strip, Command Log source marks. |
| `ship.hero` | 960px square or 1280px wide crop after visual test | Campaign and Ship visual headers. |
| `placeholder` | CSS/initials fallback, no external dependency | player-created XO and missing asset fallback. |

Add a repeatable asset-build script before committing derivatives:

```text
tools/scripts/build-breckenridge-assets.mjs
```

The script should:

- read only package-owned source paths,
- generate deterministic filenames,
- preserve square face crops for portraits,
- preserve a safe focal point for the ship,
- write a manifest summary with dimensions and byte sizes,
- fail if an expected source asset is missing,
- avoid mutating package JSON unless explicitly requested.

If the repo does not already have an image library available, choose one during implementation and commit the dependency deliberately. The planning assumption is that asset generation is a build step, not hand-edited output.

## Data Wiring

Use stable package IDs that already exist:

| Officer ID | UI subject | Portrait entry |
|---|---|---|
| `mara-whitaker` | Captain Mara Whitaker | `breckenridge.crew.mara-whitaker.primary` |
| `kieran-vale` | Lieutenant Kieran Vale | `breckenridge.crew.kieran-vale.primary` |
| `priya-nayar` | Lieutenant Priya Nayar | `breckenridge.crew.priya-nayar.primary` |
| `hadrik-bronn` | Lieutenant Commander Hadrik Bronn | `breckenridge.crew.hadrik-bronn.primary` |
| `rowan-saye` | Lieutenant Commander Rowan Saye | `breckenridge.crew.rowan-saye.primary` |
| `miriam-sato` | Commander Miriam Sato | `breckenridge.crew.miriam-sato.primary` |
| `imani-cross` | Lieutenant Commander Imani Cross | `breckenridge.crew.imani-cross.primary` |
| `player-commander` | player-created Executive Officer | generated initials/custom portrait placeholder, not a package portrait |

Add a small package asset resolver under `src/packages` or `src/ui`:

```text
resolvePackageImage(packageData, { kind, subjectId, variant })
```

Rules:

- panels ask for an image by `subjectId`, `kind`, and `variant`;
- panels never construct Breckenridge filenames;
- if the variant is unavailable, fall back to the next smaller/larger variant;
- if no asset exists, return a typed placeholder model;
- host adapters may rewrite asset URLs, but do not change panel structure.

## UI Integration

### Shared Shell

Directive already has the right shell direction:

- `src/ui/directive-compact-shell.js` owns the shared frame,
- `src/ui/directive-routes.mjs` owns routes,
- `styles/directive.css` makes the SillyTavern panel full-screen on phone width,
- `src/hosts/lumiverse/frontend.js` mounts the same shared shell in Lumiverse.

Keep that model. Do not build a desktop UI and a mobile UI. Build one responsive control surface:

- desktop: top-right constrained panel, same routes, same cards, same controls;
- phone: full-screen shell, same routes, Saga-style bottom route bar, integrated bottom Back affordance when route history exists, explicit Close action;
- Lumiverse shelf: same bottom route bar and top-right action cluster, host theme tokens where available;
- future nested surfaces: route-local subnav or action row inside the shared shell, never panel-owned bottom bars.

### Theme Packs

Directive should implement a Saga-style Theme Pack system as part of the UI foundation, not as a late cosmetic layer.

Theme Packs should be data-only JSON records. They should not import CSS or execute code. A pack should define semantic color roles that the runtime maps into Directive CSS variables:

| Directive token role | Purpose |
|---|---|
| `--directive-bg` | root shell background. |
| `--directive-bg-alt` | secondary shell/background layers. |
| `--directive-surface` | cards, route sections, and framed tool surfaces. |
| `--directive-surface-alt` | alternate rows, selected surfaces, and recessed fields. |
| `--directive-border` | default divider and frame line. |
| `--directive-border-strong` | active state, focus-adjacent border, and important separators. |
| `--directive-text` | primary text. |
| `--directive-muted` | secondary text. |
| `--directive-accent` | primary non-department accent. |
| `--directive-focus` | focus rings and keyboard-visible state. |
| `--directive-button` | default button background. |
| `--directive-button-hover` | hover/active button background. |
| `--directive-button-text` | button text and icon color. |
| `--directive-input` | input/select/textarea background. |
| `--directive-input-border` | input/select/textarea border. |
| `--directive-success` | successful status and safe completion. |
| `--directive-warning` | procedural warning and accepted risk. |
| `--directive-danger` | destructive, invalid, or severe state. |
| `--directive-command` | command division accent. |
| `--directive-operations` | operations/security/engineering division accent. |
| `--directive-science` | science/medical division accent. |

The first Directive bundled Theme Pack should intentionally feel like a Starfleet operational panel descended from Saga's mobile shell: dark enough for host overlays, warm enough to avoid a flat slate read, and accented by department colors and data highlights rather than a single dominant hue.

Theme Pack rules:

- every reusable control routes through active Theme Pack tokens first;
- hardcoded gold, blue, red, or slate values are allowed only as fallback values inside CSS variables;
- Theme Packs can influence route icons, button states, card surfaces, focus states, and image frame treatment;
- package art may inform default colors, but package art should not silently override the active Theme Pack;
- Lumiverse host tokens can seed the default pack, but Directive's active Theme Pack should drive the Directive shell after it is loaded;
- Settings should expose active Theme Pack, installed packs, swatches, accessibility/readability status, import/export direction, reset, and future custom overrides.

### Icon Packs

Directive should also borrow Saga's Icon Pack idea.

Icon Packs should map semantic slots to icon assets or classes. Panels should ask for slots, not filenames:

```text
route.campaign
route.mission
route.crew
route.ship
route.log
route.settings
action.back
action.refresh
action.start
action.resume
action.load
action.save
action.preview
action.commit
action.openOrders
status.success
status.warning
status.danger
division.command
division.operations
division.science
```

Supported first-pass icon sources:

- host-safe Font Awesome or existing host icon classes,
- package-owned raster icons where an Icon Pack supplies them,
- built-in Directive fallback icons,
- text/initial fallback only where an icon cannot be loaded.

Icon Pack rules:

- route/action buttons should be icon-forward, with text only where it improves clarity at the current width;
- unfamiliar icons need tooltips or accessible labels;
- missing custom icons fall back deterministically without changing layout dimensions;
- custom icon assets remain passive files and go through the same unsafe-path and active-content rejection used for package assets;
- active Theme Pack color tokens style icon frames and active states.

### Campaign

Use the ship image as the first-viewport package identity.

Plan:

- replace the current text-only package card header with a compact media header;
- show the Breckenridge image in a stable square or wide crop with `aspect-ratio`;
- keep package health, campaign title, role, drafts, saves, and actions readable below;
- keep `Start Campaign`, `Resume Draft`, and `Load Save` in local action rows;
- avoid a marketing hero. This is a launcher surface, not a landing page.

### Character Creator

Use art sparingly in the creator:

- show a compact Breckenridge ship strip in the campaign context step;
- show Whitaker as the command authority only where the locked-role context matters;
- keep player XO appearance authored by text fields until a custom portrait feature exists;
- avoid implying the player has one of the package portraits.

### Mission

Mission should use portraits as live context, not decoration.

Plan:

- add a compact current-context strip near the top of the Mission body;
- include the ship thumbnail, active phase, and one relevant officer portrait when a package-visible officer is briefing, warning, or counseling;
- support multiple officers as a horizontally scrollable portrait rail only when the scene packet names them;
- keep outcome controls, Open Orders controls, warnings, and Command Bearing controls as the visual priority;
- never expose Director-only facts through portrait labels, captions, or alt text.

### Crew

Crew is the primary portrait surface.

Plan:

- convert the roster from text-only cards to touch-sized rows with portrait thumbnails, rank, billet, species, and public continuity status;
- add a selected-officer detail panel or same-route detail section using the `detail` portrait;
- surface public role, package role, active public continuity, and currently known relationship posture in prose only;
- keep hidden relationship values and hidden development values out of the DOM;
- use division accent stripes or small header accents for command, operations, and science/medical, but keep gray/black and image colors dominant.

Recommended mobile geometry:

- thumbnail: 56px to 72px square,
- row min-height: 76px,
- detail image: `aspect-ratio: 1 / 1`, max-height bounded by viewport,
- action targets: at least 34px today, move toward 40px for touch comfort.

### Ship

Ship should use the Breckenridge art as an operational state header.

Plan:

- add a ship visual header with name, class, condition, and registry when known;
- keep condition, damage, restrictions, and technical debt as scannable state groups below;
- use overlays only when text remains readable against the crop;
- avoid making every Ship card repeat the same image.

### Log

Use visual identity lightly:

- optional small source avatar for entries tied to a public officer or ship system;
- no portrait on every row if it makes the log noisy;
- no hidden-source avatar for Director-only state.

### Settings

Settings remains a control plane, but it should carry the Saga-style customization flow.

Plan:

- add a Theme Pack section with active pack, swatches, installed packs, import/export direction, reset, and accessibility status;
- add an Icon Pack section with active pack, route/action previews, loaded/missing icon state, import/export direction, and reset;
- add an Asset Diagnostics section only when it helps verify package portraits, ship art, icon assets, or missing fallbacks;
- keep decorative ship or crew art out of Settings unless it is part of a preview or diagnostics row.

## Saga Mobile Lessons To Borrow

Borrow these Saga systems and patterns:

- Theme Pack model, active token routing, swatches, accessibility checks, and Settings gallery flow,
- Icon Pack model, route/action icon slots, previews, and missing-icon fallback behavior,
- visual language and interaction rhythm of Saga's mobile shell,
- full-viewport shell at phone widths,
- one outer route body with controlled scrolling,
- stable nested scroll regions only when necessary,
- touch-sized controls,
- compact cards and action rows,
- route-local detail/subview stacks,
- theme-token awareness,
- icon-forward actions with text retained only when it improves clarity,
- visual smoke tests at desktop and phone widths.

Do not borrow these Saga patterns:

- desktop rail/drawer assumptions,
- Saga route names,
- Basic/Advanced mode assumptions,
- Loredeck/Lorecard domain classes,
- Saga storage, DOM, CSS, or global identifiers.

Directive translation:

```text
Saga mobile bottom route bar
-> Directive phone bottom route bar owned by the shared shell.

Saga mobile action bar
-> Directive phone bottom shell action strip, with desktop/shelf actions remaining top-right.

Saga mobile subviews
-> Directive route-local detail state, with Back in the shared shell action area for the active viewport.

Saga mobile dense cards
-> Directive compact operational rows with portraits and stable aspect ratios.

Saga Theme Packs
-> Directive data-only Theme Packs with Directive tokens and active-pack-controlled controls.

Saga Icon Packs
-> Directive data-only Icon Packs with route/action/status/division slots and deterministic fallbacks.

Saga Settings customization flow
-> Directive Settings surfaces for active Theme Pack, Icon Pack, previews, import/export, accessibility, and reset.
```

## Visual Style

Use the provided art to carry character and ship identity. The CSS should stay restrained.

Direction:

- neutral operational base with enough warmth to avoid a one-note slate shell;
- department accents used as thin structural cues, not loud badges;
- command red, operations gold, and science/medical teal-blue used sparingly and consistently;
- Theme Packs own color decisions through semantic tokens;
- Icon Packs own route/action artwork through semantic slots;
- default Directive should feel like Saga's polished mobile runtime adapted for a Starfleet command tool;
- border radius stays at 8px or less;
- no nested cards;
- no decorative gradient orbs;
- no oversized hero type inside compact panels;
- no text over image unless contrast is tested at phone width and Lumiverse shelf width;
- image crops must preserve faces, rank collars when possible, and ship silhouette.

Portrait treatment:

- formal portraits anchor the Crew roster and details;
- future environmental portraits can appear in Mission when a scene is tied to a workspace;
- crisis portraits can appear only when campaign state justifies that tone;
- the visual bible's continuity checklist should become the QA checklist for future art.

## Implementation Sequence

### Stage A: Theme And Icon Foundation

- Define Directive Theme Pack JSON shape and default bundled pack.
- Define Directive Icon Pack JSON shape and default bundled pack.
- Add runtime theme application that emits Directive CSS variables from the active Theme Pack.
- Add an icon resolver that maps semantic icon slots to Font Awesome classes, raster assets, or fallbacks.
- Route existing shell buttons, route tabs, cards, forms, and action rows through Theme Pack tokens.
- Route existing route/action icons through Icon Pack slots instead of hardcoded classes where practical.
- Add Settings previews for active Theme Pack and Icon Pack.

Acceptance:

- controls visibly follow the active Theme Pack tokens;
- route/action icons resolve from semantic slots with deterministic fallbacks;
- Theme Packs remain data-only and cannot execute CSS or script;
- Icon Pack raster assets are passive files only;
- the bottom-navigation shell keeps the same structure in SillyTavern and Lumiverse.

### Stage B: Source Intake

- Copy the visual bible into `docs/source`.
- Copy original source art into ignored `source-images/packages/breckenridge/` when local rebuild inputs are needed.
- Add provenance notes to the package README.
- Confirm whether `Captain_Mara_Whitaker_Heroic.png` is an approved variant.

Acceptance:

- optimized runtime files are present in repo-owned passive asset paths;
- original source files are kept outside the tracked extension bundle;
- no runtime panel imports source PNGs directly;
- docs index links the visual bible source document once copied.

### Stage C: Asset Manifest And Derivatives

- Add structured `assets.images` entries to the Breckenridge package.
- Generate web derivatives for portrait `detail`, `card`, and `thumb`.
- Generate ship `hero`, `card`, and `thumb` derivatives.
- Add package diagnostics for missing image paths and duplicate asset IDs.
- Remove `Crew portraits` from package unresolved only after portrait paths validate.

Acceptance:

- package validation still passes;
- package diagnostics warn or fail clearly for missing assets;
- derivatives have recorded dimensions and byte sizes;
- imported packages continue to reject active content.

### Stage D: Asset Resolver

- Add a package image resolver.
- Add tests for lookup by subject, kind, variant, and fallback.
- Ensure SillyTavern and Lumiverse can consume the same resolved path model.

Acceptance:

- UI modules do not build filenames manually;
- missing portraits render deterministic placeholders;
- player-created XO uses placeholder/custom path, not a fixed package portrait.

### Stage E: Mobile-Compatible Visual UI

- Update Campaign with ship image package headers.
- Update Crew with portrait rows and a portrait detail surface.
- Update Ship with a compact ship visual header.
- Add Mission context strip for active ship/officer context.
- Add Log source avatar support only where player-safe.
- Add Settings Theme Pack, Icon Pack, and asset diagnostics surfaces.

Acceptance:

- same route structure in SillyTavern and Lumiverse;
- no panel-owned bottom nav or bottom-right shell controls;
- route text fits at phone width and Lumiverse shelf width;
- cards do not nest;
- all image boxes have stable `aspect-ratio` and fallback states;
- controls and icons visibly respond to active Theme Pack and Icon Pack choices.

### Stage F: Visual Smoke And Host Checks

- Add desktop and phone-width visual smoke targets for Campaign, Mission, Crew, Ship, Log, and Settings.
- Add a Lumiverse shelf smoke check for the same bottom-navigation markers plus one image load marker.
- Add smoke checks for active Theme Pack token routing and Icon Pack fallback state.
- Add a no-floating-control scan and shared-shell mobile navigation scan to the alpha gate.
- Run package validators and the alpha gate.

Acceptance:

- desktop screenshot shows the visual assets without crowding controls;
- phone screenshot shows readable route nav and non-overlapping content;
- Lumiverse shelf shows bottom route navigation, top-right actions, and loaded or gracefully-fallback images;
- Theme Pack changes affect controls, active states, inputs, borders, and icon frames;
- Icon Pack changes affect route/action icons without layout shifts;
- hidden relationship/development values are absent from DOM text;
- alpha gate remains green.

## Testing Plan

Required deterministic tests:

- Theme Pack JSON validation,
- active Theme Pack token application,
- controls using Theme Pack button/input/border/text tokens rather than standalone hardcoded accents,
- Icon Pack JSON validation,
- route/action icon slot resolution and fallback behavior,
- package image metadata validation,
- asset resolver fallback behavior,
- Crew roster portrait rendering without hidden raw values,
- Ship visual header fallback behavior,
- Campaign image header fallback behavior,
- Mission context strip hidden-truth safety,
- shared bottom-navigation route/action markers,
- phone bottom-navigation markers,
- no-floating-control regression scan.

Required visual/manual checks:

- SillyTavern desktop panel,
- SillyTavern phone-width panel,
- Lumiverse shelf width,
- default Theme Pack appearance,
- alternate Theme Pack application,
- active Icon Pack route/action previews,
- missing Icon Pack asset fallback,
- image load failure fallback,
- long names and billets,
- route nav wrapping,
- high contrast text over any image crop.

Asset budget checks:

- original source images may remain large in source folders;
- runtime derivatives should stay small enough for Lumiverse shelf loading;
- lazy load non-visible detail images where practical;
- do not preload every detail portrait before the Crew route is opened.

Theme/Icon budget checks:

- Theme Pack payloads should stay small JSON records;
- Icon Pack payloads should not embed large base64 images;
- custom raster icons should be passive files with size and format validation;
- Settings should hydrate installed Theme/Icon records without bloating ordinary runtime state.

## Open Decisions

1. Should original source assets ship with the extension, or should release artifacts include derivatives only and keep originals in development/docs assets?
2. Should `Captain_Mara_Whitaker_Heroic.png` become an approved crisis/heroic variant, or stay out of the runtime until a full variant set exists?
3. Should first derivatives be WebP, optimized PNG, or both for host compatibility?
4. Should ship art stay square everywhere, or should the build script create a tested wide crop for Campaign and Ship headers?
5. How should the player-created XO portrait work later: initials placeholder, custom upload, generated portrait, or host avatar bridge?
6. Should the visual bible be promoted into a package source document immediately, or should it first be merged with the existing senior staff character bible?
7. Should Directive import Saga Theme Packs directly through a compatibility converter, or define native Directive Theme Packs and offer manual conversion later?
8. Should Directive import Saga Icon Packs directly through a compatibility converter, or define native Directive Icon Packs and offer manual conversion later?
9. Which bundled Theme Pack should be the initial default: a close Saga mobile descendant, a Breckenridge command-panel pack, or both with one selected by default?
10. Should Icon Pack support begin with Font Awesome slot mappings only, or should the first slice include custom raster icon assets?

## First Concrete Development Slice

The best next implementation slice should start with the shared design system, then prove it on the highest-value portrait surface:

1. Define Directive Theme Pack and Icon Pack JSON shapes with one bundled default of each.
2. Add runtime Theme Pack token application and Icon Pack slot resolution.
3. Route the shared shell, route buttons, and core action buttons through Theme/Icon resolvers.
4. Copy the visual bible and source art into repo-owned passive paths.
5. Add `assets.images` records for the ship and seven formal staff portraits.
6. Add a package image resolver with placeholder fallback.
7. Update only the Crew panel to use portrait thumbnails and a selected-officer detail.
8. Add focused tests for Theme Pack routing, Icon Pack fallback, asset resolver lookup, hidden-value safety, phone bottom navigation, and no floating-control regression.

That slice proves the Saga-derived design system, the asset model, and the most important portrait surface without risking the whole runtime UI at once.
