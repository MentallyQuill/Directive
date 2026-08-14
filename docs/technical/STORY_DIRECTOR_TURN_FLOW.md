# Story Director Turn Flow

This diagram shows how Directive turns a player message into durable, replayable story state. The model proposes interpretation; deterministic runtime code validates and commits consequences; SillyTavern's main model narrates the next provisional response.

```mermaid
flowchart LR
    subgraph HOST["SillyTavern + Player"]
        A["Assistant response<br/>provisional"]
        B{"Swipe or<br/>send a reply"}
        C["Selected assistant variant<br/>+ player message"]
        H["Main model generates<br/>next provisional response"]
    end

    subgraph DIRECTIVE["Directive Story Director"]
        D1["Bind exact accepted pair<br/>package • save • campaign • chat • branch • hashes"]
        D2["Build closed set of<br/>eligible mission evidence"]
        D3["Utility: acceptedPairMissionEvidence<br/>propose evidence + elapsed time<br/><i>proposal only</i>"]
        D4["Deterministic validation<br/>sources • policies • predicates • targets"]
        D5["Deterministic planners derive<br/>time • mission • Story Settlement<br/>• Command Bearing"]
        D6{"Atomic state-gateway<br/>commit"}
        D7["Rebuild player projections<br/>+ chat-bound prompt packet"]
        D8["Optional checkpoint:<br/>bounded episodeEvaluator<br/><i>non-authoritative</i>"]
    end

    subgraph RECOVERY["Failure-closed recovery"]
        R1["Retry the same validated result<br/>up to two times"]
        R2["Block narration<br/>and expose manual Retry"]
        R3["Reject proposal<br/>without semantic mutation"]
    end

    A --> B
    B -- "swipe remains provisional" --> A
    B -- "player reply accepts one pair" --> C
    C --> D1 --> D2 --> D3 --> D4 --> D5
    D4 -- "invalid, stale, or unsupported" --> R3
    D5 -. "pending checkpoint" .-> D8
    D8 -. "bounded review result" .-> D6
    D5 --> D6
    D6 -- "success" --> D7 --> H --> A
    D6 -- "write failure" --> R1
    R1 -- "success" --> D7
    R1 -- "all attempts fail" --> R2
    R2 -. "same accepted-pair settlement" .-> D6

    classDef provisional fill:#1b1830,stroke:#7774b2,color:#f4f2ed;
    classDef accepted fill:#2d2115,stroke:#ffbd43,color:#fff1d2;
    classDef proposal fill:#20213a,stroke:#ffbd43,color:#fff1d2;
    classDef authority fill:#132431,stroke:#5e9dbb,color:#e6f5ff;
    classDef recovery fill:#241b1d,stroke:#d57666,color:#ffe9e2;

    class A,B,H provisional;
    class C,D1,D2 accepted;
    class D3,D8 proposal;
    class D4,D5,D6,D7 authority;
    class R1,R2,R3 recovery;
```

## Core boundary

**Model proposes. Runtime commits. Narrator continues.**

- Assistant swipes are provisional until a player reply accepts one exact pair.
- The Utility interpretation call has no direct authority over campaign state.
- Deterministic validation and planners derive the accepted consequences.
- Persistence retries reuse the validated interpretation instead of issuing new model calls.
- If durable settlement cannot be completed, narration is blocked rather than partially applied.
