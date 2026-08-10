# Ashes of Peace V1 Authoring Reference

Ashes of Peace is Directive V1's only playable and fully native campaign. Its package ID is `directive:campaign-package:breckenridge-ashes-of-peace`.

## Campaign shape

The player is the newly assigned executive officer of the U.S.S. Breckenridge. Captain Mara Whitaker is an experienced autonomous commanding officer who can guide, challenge, or disclose without taking the player's decisions away. The senior staff have concise authored voices and can initiate relevant reports or objections.

Ashes contains thirteen ordered mission definitions: Prelude, eight numbered chapters, three Open Orders interludes, and an epilogue with an authored campaign conclusion. Transitions are deterministic, but each mission may support non-linear objective order and multiple outcome dimensions.

## Hesperus reference behavior

The Prelude demonstrates fair discovery and partial success:

- command handover and staff readiness are primary work;
- the Hesperus rescue becomes required only after its distress is known;
- the rescue may succeed fully, succeed with cost, be safely handed off, or fail after informed action or a known deadline;
- record falsification is not shown until evidence is discovered and disclosed;
- accountability becomes optional only after falsification is known;
- missing undisclosed fraud does not fail the mission;
- Whitaker, engineering, operations, medical, or security may deliver appropriate facts through authored Duty Report routes;
- terminal outcome dimensions preserve rescue quality, cost, accountability, command readiness, and arrival.

## Source precedence

The files under `packages/bundled/breckenridge/v1/` are runtime authority. The campaign and character-bible documents under `docs/source/` are creative references. If prose in a source document conflicts with a V1 definition, update the definition deliberately; never add a runtime compatibility branch.

## Certification

`tools/scripts/test-ashes-v1-campaign.mjs` validates all thirteen mission contracts and every authored scenario fixture. A new Ashes change is incomplete until the aggregate V1 gate and a live SillyTavern narrative soak both pass.
