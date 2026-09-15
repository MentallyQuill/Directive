# Transcript identity for captured history

This bounded step implements the transcript identity required by the existing captured-history store. It is part of the approved player-promise stabilization plan; use independent implementation and review. Runtime activation requires the subsequent complete-writer integration and historical consumer work.

The projector accepts the complete versioned host transcript snapshot, validates and detaches it before asynchronous hashing, and returns a versioned row-hash vector plus separate selection provenance. Preserve every row and every persistable field, including unknown metadata, footers, displayed text, all swipe variants, report custody and message identity aliases. Do not interpret malformed source metadata as valid authority or silently repair it. No bookkeeping exclusions are introduced in this version.

Hash a domain-tagged representation of each complete row and its position using the existing canonical SHA256 codec. Hash the row-hash array using the existing storage vector convention. Chat and binding provenance stays outside row hashes so an identical parent/child prefix can compare equal. A complete snapshot hash binds that provenance separately. Only the existing host snapshot contract's explicitly allowed native Date normalization and media compatibility aliases apply.

- [x] Implement focused RED/GREEN coverage for exact/reloaded snapshots, property order, append/prefix behavior, all source-changing edits, provenance changes, unsupported shapes, bounds, and mutation during hashing.
- [x] Verify actual adapter footer removal and metadata/swipe attachment change identity; do not hide those changes through projection exclusions.
- [x] Independently review the module and regressions; add the focused check to the release gate and run relevant checks.
- [ ] Publish the scoped verified implementation and record its limited scope. Do not enable runtime capture or earlier branches in this step.

Remaining integration requirements: finalize assistant annotations before authority capture, carry immutable operation and before/after state context through every writer, prevent foreign or intermediate writes, define explicit non-prefix edit handling, preserve inherited archive ownership, and reconstruct earlier native branches from verified history. The projector alone proves none of those behaviors.
