# Command Competence Source

Pure helpers for Command Competence planning.

This boundary supplies professional context between intent parsing and Mission Director adjudication:

- routine professional actions the player character would already perform
- professional knowledge and command questions
- Domain Reports and Request Counsel
- Procedural Warnings and Authority Notes
- no-gotcha consequence checks
- packet and journal records that can later be committed transactionally

Modules in this folder must not render UI, call providers, mutate campaign state, or hardcode a single mission path.
