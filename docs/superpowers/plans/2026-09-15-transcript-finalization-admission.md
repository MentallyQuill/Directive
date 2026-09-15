# Serialize transcript finalization and admit owned writers

Implement the reviewed lifecycle design from the complete-history integration plan. The previous application-ownership and transcript-projection slices are prerequisites, not evidence that live chronology is complete. Use independent implementation and review for runtime, host and shell/opening boundaries.

Generation reserves an exact campaign/save/chat/entity owner with explicit preparation, production, finalization and failure phases. Only internal preparation work receives that owner's admission; descriptor strings never grant it. Unrelated state work fails promptly at queue execution and is rechecked synchronously before application. Do not park a writer waiting for generation end: preparation itself uses the settlement queue.

The shell calls runtime completion synchronously and detaches its promise so later native listeners are not blocked. Runtime finalizes footer/source/metadata inside one owned queue transaction, with provider and downstream queued work outside. Source or persistence failure retains truthful ownership; Stop revokes further work without pretending an unresolved native mutation has stopped. Old completion cannot release a new owner's reservation or mutate another selected chat.

Opening generation stays outside the queue. Its final posting callback owns the serialized final binding/empty-chat check, append and readback. A lifecycle epoch check after the callback prevents late completion after Stop from reporting ready.

Native activity must be synchronously observable, including non-streaming generation. An explicit asynchronous preparation hook may load the native module; the synchronous observation returns idle, active or unsupported. Missing native evidence is not idle. Existing hosts without the optional seam remain compatible while capture is disabled; complete capture enrollment must require supported activity evidence.

The native global activity flag remains active between group members. Read the separate native reply flag as an additional strict-boolean status; only an exact owned reply may finalize in that gap. Neither status establishes event identity or durable chat persistence. Native streaming completion can precede its final save. Keep this slice's in-memory finalization evidence separate from the future durable captured-history protocol.

- [x] Reproduce deferred shell ownership and opening callback/late-Stop gaps; implement shell and opening seam regressions.
- [x] Implement exact runtime owner and finalization/admission behavior with public-runtime deferred mutation tests.
- [x] Implement and verify synchronous host activity observation and fake-host control, with a separate per-reply status for group-member gaps.
- [x] Independently review integrated lifecycle, Stop/retry, selection and deadlock behavior; run relevant tests and full release gate (246 checks).
- [x] Publish verified changes, verify installed provenance and bounded native reload/idle behavior without provider-soak claims (c69a8a584; 673 installed/served files).

Runtime capture, baseline enrollment, non-prefix mutation protocol, inherited archive ownership and historical branch reconstruction remain required. This step must not relax branch refusal or claim completed chronology.
