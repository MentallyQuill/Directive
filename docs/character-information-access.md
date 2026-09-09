# Character information access

Directive records supported receipt or observation of consequential statements in its existing continuity event history. This is a narration mitigation, not proof that the model will never produce unsupported knowledge.

## Runtime ownership

The existing continuity analyst may add optional `informationAccess` to an `addFact`. It uses no new model role, provider, queue, database, or sequential generation stage. The ordinary accepted-pair gateway commits the event. The ordinary source dependency and branch machinery invalidates/rebinds it. Runtime prompt construction derives a read-only character view from surviving archived events.

Proposal metadata:

```json
{
  "recipientIds": ["priya-nayar"],
  "acquisition": "heard",
  "audienceEvidence": [
    {"sourceSlot": "currentPlayer", "evidenceQuote": "Sam tells Nayar,"}
  ]
}
```

The main fact's quote supports the particular statement; audience passages support access. At most 16 supplied person IDs and two audience passages are allowed. Methods are `heard`, `observed`, and `read`. Recipient IDs must be typed person references at the analyst parser boundary. Persisted audience passages become ordinary source anchors; every distinct supporting source contributes custody and invalidation. Null/absent metadata preserves legacy event hashes. Player speech may be recorded as a character claim with access evidence; it still cannot certify an attempted success as an objective fact.

Access records are statement-specific. A briefing about standby shuttles does not deliver an unmentioned staffing request or deadline. A current claim about an earlier conversation does not establish the earlier conversation. Private thoughts, out-of-character instructions, unshown documents, and unestablished speakerphone audiences are not deliveries. Audience interpretation is a semantic model responsibility; validators prove source custody and shape, not the meaning of arbitrary prose.

## Character projection

`characterInformation` is added to the existing narration packet. It records acquisition, original claim type, statement text, source event identity, and recording revision. It does not assert truth, belief, presence, or exhaustive knowledge. Authored professional competence stays in existing character guidance.

The projection reads archived addFact events rather than the world-fact projection. Thus a new global estimate does not erase a recipient's earlier estimate, and resolving/dormant threads does not erase acquired information. Within a turn, access events follow source passage order. A repeated identical evidence quote cannot mechanically disambiguate its occurrence; ambiguous access must remain unestablished.

The default packet cap is 4,000 serialized characters, eight people and six statements per person. Latest recipients/statements receive priority; omitted statement/person counts are explicit. Coverage is always partial: missing, truncated and pre-feature history never prove ignorance. Metadata does not authorize an unseen introduction, and unknown/newly minted people must first become supplied person references. Historical audience reconstruction beyond the supplied pair is not invented or automatically backfilled.

SillyTavern still owns narration and sees its wider conversation. Shared episode summaries and narrative context are explicitly distinguished from knowledge received by each character. The instruction covers dialogue, indirect speech, thoughts and actions. There is no post-generation semantic reviewer or quote-locking character agent. Consequently, this implementation cannot guarantee compliant narration or retrospectively repair a bad reply.

## Verification and evaluation

The alpha gate includes event/lineage tests, schema/parser tests, character projection tests and a fake-host runtime test. These prove bounded records, source invalidation, branch rebinding, retained historical access, legacy compatibility, malformed-output handling, accepted-pair atomicity, prompt delivery, and reuse without an added model call. They are not live model quality or provider-latency measurements.

Generate an offline A/B/C evaluation artifact:

```powershell
node tools/scripts/character-information-evaluation.mjs > character-information-evaluation.json
```

The eight manually labelled cases cover the Nayar leak, explicit briefing, speakerphone, late arrival, outdated estimate, reported claim, private thought and partial document. A uses a common baseline prompt; B adds only the information policy; C also adds an oracle projection. Transcript and provider settings must remain identical across arms. Input character counts are diagnostic, not token counts. The artifact explicitly remains `unrun`; generating it sends no requests and reads no live user data.

First use repeated, interleaved runs and blinded whole-response review to determine whether correct projections outperform the cheaper instruction alone. Measure unsupported knowledge, false ignorance, invented communication, professional competence, time to first story text and total wall time. Then substitute actual extracted records and the real host packet for a production evaluation. Track extraction misses, lookup/retry rates, median and tail latency separately. Choose acceptance thresholds before scoring; do not claim improvement from one favorable completion or from deterministic tests.

The pipeline adds no new sequential stage, but more extraction work/schema and prompt input can increase latency. Existing lookup/retry limits remain unchanged. No live installation, save, historical transcript, or provider configuration is modified by this source change.
