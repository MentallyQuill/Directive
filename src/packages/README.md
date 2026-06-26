# Package Source

Runtime package schema adapters, package loading, package library records, bundled-package discovery, and import/export helpers.

`campaign-package-context.mjs` is the first pure adapter. It turns validated package JSON into Campaign-tab summary data and package-driven Character Creator context without mutating package templates.

`bundled-package-registry.mjs` is the authoritative source for bundled package paths, projections, crew datasets, mission graphs, asset roots, package status, and product-facing manifest titles. Runtime loading and the alpha gate consume this registry instead of maintaining separate hardcoded path lists.

`package-contract.mjs` owns strict package manifest and release-facing asset policy checks shared by import diagnostics and local validators.
