# Directive Interface Design Bible

## Status

This document is the canonical interface direction for Directive.

The concept images in `docs/design/reference-concepts/` supersede the older generated material under `docs/design/visual-targets/` wherever the two conflict. The older visual-target folders remain historical iteration records, not current acceptance targets.

The design bible governs both SillyTavern and Lumiverse surfaces. Host constraints may change density and available controls, but they must not create a separate visual language.

## Product Character

Directive is a compact Starfleet command console, not a generic dashboard with science-fiction colors. The interface should communicate operational readiness, authoritative state, and the next valid command with minimal interpretation.

The visual hierarchy follows four layers:

1. Global shell: Directive identity, runtime state, route context, Back/Close/Refresh.
2. Route command spine: Campaign, Mission, Crew, Ship, Log, Settings, with one active drawer at a time.
3. Route-local navigation: segmented controls for dense workflows such as Command, Library & Import, Records, Context, Side Work, Recovery, Systems, Safety, Packs, and Assist.
4. Operational content: status tiles, records, action groups, diagnostics, and player-safe narrative context.

## Governing Principles

- UX is authoritative. LCARS geometry must improve grouping, scanability, and task completion.
- The first viewport must establish identity, state, and the next useful action.
- Primary route navigation stays in the persistent left command spine on SillyTavern desktop/tablet and moves to the bottom route bar at phone width.
- The active drawer header carries product identity, telemetry, route context, collapse, and full-screen actions, not duplicate route navigation.
- Drawer geometry is user-resizable from the bottom-left handle and is remembered locally.
- Desktop uses wider information architecture, not merely enlarged mobile cards.
- Mobile reorders and compresses content while preserving control priority and touch-safe targets.
- Package art is operational context. It must not become a decorative marketing hero that pushes all controls below the fold.
- Hidden simulation values never enter the player-facing DOM. Public continuity is expressed as prose or safe categorical state.
- Real controls must look interactive. Structural LCARS blocks must not resemble disabled buttons.

## Visual Grammar

### Canvas

Use near-black terminal surfaces with restrained depth. Cards are dark blue-black or charcoal, separated by fine amber, lavender, teal, coral, and blue lines. Avoid broad gray dashboard chrome.

### LCARS Structure

Use:

- a segmented left rail as a persistent structural anchor;
- rounded end caps and asymmetric corner radii;
- thick bars for primary commands and route selection;
- thin horizontal rules for section hierarchy;
- department accent stripes on personnel and systems records;
- dark negative space between content groups.

Do not use ornamental blocks without a structural role.

### Color Roles

- Amber/orange: primary action, route emphasis, package command, engineering readiness.
- Lavender: secondary navigation, package metadata, continuity and memory systems.
- Blue: science, medical, analysis, storage, and informational actions.
- Coral/red: command identity, recovery, warning, destructive action.
- Teal/green: nominal, ready, verified, committed, safe state.

Color is never the only status signal. Pair it with text, iconography, shape, or position.

### Typography

Use a condensed display face where available for labels, route names, card titles, and command actions. Use a highly readable sans-serif for body copy, values, and long records. Labels are concise and uppercase; body text uses sentence case.

Minimum practical sizes:

- mobile body: approximately 12 px equivalent;
- mobile labels: approximately 9-10 px equivalent, only when short;
- desktop body: approximately 12-14 px equivalent;
- touch controls: at least 40 px high where host geometry permits.

### Imagery

The bundled package owns all ship and crew imagery. Use generated derivatives through package asset records, never hardcoded filesystem URLs in route panels.

- Campaign: square or moderate landscape package identity crop.
- Character Creator: compact ship context strip; no implied player portrait.
- Crew: portrait thumbnails in roster rows and one larger selected-officer image.
- Ship: one operational hero image followed by status groups; do not repeat the same ship art on every card.
- Mission: portraits only when the player-safe scene context names the officer.
- Log and Settings: imagery only when it clarifies source or diagnostics.

## Responsive Shell

### Desktop, 1280-1920 px

- Full top command header with product identity, telemetry, route context, and global actions.
- Visible left LCARS rail.
- Left command spine with numbered LCARS route segments, optional route labels, and an active hinge into the drawer.
- Route body uses split panes, tables, and wider operational grids where that reduces scrolling.
- Dense record screens may use a three-column layout: status/quick actions, primary records, import or diagnostics.

### Tablet, 768-1279 px

- Preserve the left command spine, active hinge, and single drawer.
- Collapse tertiary telemetry before shrinking primary controls.
- Use two-column content where possible; stack diagnostic sidebars below primary records when required.

### Mobile, approximately 390-430 px

- Full-height shell with reduced left rail.
- Compact top title and explicit Close action.
- Six-route command spine remains persistent; only one drawer is active.
- Route-local segmented controls remain inside the scroll body.
- Content is one column unless two small status tiles remain readable.
- Tall rosters use bounded vertical scrolling rather than clipped horizontal cards.
- Sticky navigation may overlay the final scroll region only when bottom padding preserves access to the last control.

## Surface Blueprints

### Campaign

Campaign is the campaign launcher and record-management surface.

Command view:

- package status and active package identity;
- U.S.S. Breckenridge art, Ashes of Peace title, version, class, and readiness;
- one dominant Start Campaign, Continue Campaign, or Resume Draft action;
- secondary Import Package, New Draft, and Load Save actions;
- package readiness and runtime asset status below the primary command.

Library & Import view:

- installed package health;
- data-only package chooser and drop target;
- persisted import result and validation diagnostics;
- package rows with version, readiness, and update state.

Records view:

- desktop: status sidebar, save/draft records, and package import sidebar;
- mobile: status and quick actions first, followed by saves, drafts, then import diagnostics;
- current save must be visually unmistakable without relying only on green.

### Character Creator

- package and campaign context at the top using a compact ship image;
- visible locked role: Commander, Executive Officer;
- Identity, Service, Personality, Review progression;
- Save Draft, Begin, and Back in a stable command bar;
- concise field-level validation and no hidden package facts.

### Mission

Command is the default mission view.

- mission title, phase, player, ship, campaign, mode, narration, and autosave state;
- latest committed outcome;
- player intent input with explicit Preview Outcome action;
- preview, commit, discard, save, and recovery controls only when valid;
- Command Brief, Domain Reports, Procedure Checks, objectives, directives, and pressures grouped by function.

Context view prioritizes objectives, directives, public pressures, and command guidance.

Side Work view prioritizes Open Orders, follow-ups, active scene progress, and awaiting-review outcomes. Empty states should explain when new work can appear and direct the player back to the command brief.

Recovery view separates safe save/narration actions from destructive outcome actions. Risk actions use a distinct red/coral zone and explicit irreversible copy.

### Crew

- roster readiness summary;
- bounded roster list with portrait, rank, name, billet, and public continuity state;
- selected officer detail with portrait, division, species, duty state, package role, and player-safe continuity prose;
- no raw relationship or development values;
- player character may use a neutral commander placeholder until custom portrait support exists.

### Ship

- one Breckenridge operational hero with name, class, registry when known, campaign context, and nominal/advisory state;
- immediate readiness tiles for condition, restrictions, damage, and technical debt;
- operational meters and command structure below the hero;
- current condition report and caveats grouped by severity;
- unresolved registry data remains explicitly pending rather than inferred from artwork.

### Log

- search and filter controls before the timeline;
- latest record visually prominent;
- chronological committed outcomes, visible consequences, committed inputs, and assisted summary state;
- detail expansion is local to each record;
- no hidden Director records or raw simulation state.

### Settings

- runtime, simulation, storage, appearance, and provider-assist overview;
- local tabs for Systems, Safety, Packs, and Assist;
- State Safety actions grouped by risk and outcome;
- diagnostics summary and repair controls;
- Theme Pack and Icon Pack controls remain the intended customization path as those systems mature.

## Lumiverse Parity

Lumiverse uses the same shared command-spine shell as SillyTavern: one floating shelf, one resizable route drawer, the same route order, the same color grammar, and the same action hierarchy. The Lumiverse drawer tab is only a launcher/reopen affordance. The trusted Lumiverse frontend may receive the full runtime view required by the shared panels; tools, interceptors, and prompt blocks still receive only player-safe summaries.

Minimum parity requirements:

- all six primary routes;
- route-specific Campaign, Mission, Crew, Ship, Log, and Settings panels through the shared runtime shell;
- campaign initialize, quick start, load, save, preview, commit, sidecar, and Open Orders actions;
- persistent floating command shelf and drawer controls;
- no Lumiverse-only generic white dashboard styling;
- player-safe information boundaries identical to SillyTavern.

## Interaction And Accessibility

- Every icon-only button requires an accessible label and tooltip/title.
- Selected route and subtab states use text/shape plus color.
- Disabled actions remain legible and explain their unavailable state through surrounding context.
- Keyboard focus must remain visible.
- Inputs and buttons retain native semantics.
- Long record sets use local scroll regions only when the region remains discoverable and does not trap the page.
- Motion is optional and must respect reduced-motion preferences when introduced.

## Acceptance Checklist

A surface is accepted when:

- it reads as the same Directive product on mobile, desktop, SillyTavern, and Lumiverse;
- the next useful action is clear in the first viewport;
- no text overlaps, clips, or becomes illegible at 390-430 px;
- desktop content uses available width to reduce unnecessary scrolling;
- package imagery supports the task;
- player-safe boundaries remain intact;
- route, action, and state controls are functional;
- deterministic tests and the alpha gate pass;
- representative desktop and mobile screenshots have been reviewed against the canonical concepts.
