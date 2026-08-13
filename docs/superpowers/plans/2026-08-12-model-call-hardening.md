# Model-Call Hardening Implementation Plan

**Goal:** Make Directive's existing auxiliary calls smaller, stricter, cancelable, and truthfully represented without increasing call count or routing main narration away from SillyTavern.

## 1. Make role ownership truthful

- Remove the unused Directive `narration` role from provider routing and the Settings runtime map.
- Add an explicit `episodeEvaluator` Reasoning role for bounded behind-the-curtain story analysis.
- Retain accepted-pair mission evidence on Utility and character creation on Reasoning.
- Update Settings copy to describe the Reasoning lane as Directive-owned analysis/creation, not narration.

## 2. Reduce and constrain accepted-pair work

- Filter candidate policies by their current deterministic predicate before prompt construction.
- Add a candidate-derived native JSON schema to the accepted-pair request.
- Keep strict local parsing and validation as final authority.

## 3. Constrain episode evaluation

- Add a strict native JSON schema to the episode-evaluator request.
- Route the existing periodic evaluator to Reasoning only; never call both lanes.
- Certify the route against the existing borrowed-behavior fixture and preserve the current checkpoint cadence.

## 4. Propagate cancellation and timeout

- Pass AbortSignals through interpreter/evaluator requests and router options.
- Abort the underlying provider request when the bounded timeout wins.
- Let SillyTavern generation-stop cancel active Directive analysis cleanly.

## 5. Verify and land

- Run focused routing, provider, interpreter, evaluator, runtime, Settings, and cancellation suites.
- Run the complete repository gate, review the diff, merge to `main`, rerun the gate, and push.
