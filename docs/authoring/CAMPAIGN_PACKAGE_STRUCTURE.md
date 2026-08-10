# V1 Campaign Package Structure

Directive V1 loads one exact data-only campaign package, one crew dataset, one ship dataset, and an ordered set of mission definitions.

The campaign package has exactly eight roots:

```text
manifest
campaign
ship
crew
characterCreation
world
guardrails
assets
```

`manifest.kind` is `directive.campaignPackage.v1`. The manifest binds the package ID, version, opening mission, opening time, and bundled status. Runtime saves repeat the exact package ID and version; mismatches are rejected.

Crew and ship datasets are concise V1 narrative resources, not card indexes. Crew records contain identity, a public profile summary, and bounded narration guidance. The ship dataset contains identity, a public capability summary, narration guidance, and a few hard facts.

Each `directive.missionDefinition.v1` binds to the same package ID/version and a unique campaign source ID. Mission IDs and transition targets must be stable. Every mission needs authored scenario fixtures proving important success, partial-success, optional, deadline, informed-failure, and spoiler cases.

Assets are package-relative records. Preview campaigns may use a separate static registry entry, but they do not receive partial package objects or runtime activation paths.
