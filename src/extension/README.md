# Extension Source

SillyTavern extension entrypoint, bootstrap, lifecycle, event wiring, menu button, and runtime mount code.

The extension layer owns Directive identity and host integration only: manifest entrypoint composition, lifecycle hook exports, extensions-menu launcher, global bridge, runtime action registration, and runtime app setup. Campaign start and save behavior stays in `src/campaign`, `src/storage`, and `src/runtime/campaign-start-controller.mjs`; bundled package loading and screen-level orchestration stays in `src/runtime/runtime-app.mjs`.
