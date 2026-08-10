# Package Source

Exact V1 bundled package access.

- `bundled-package-registry.mjs` names Ashes as the only playable package and supplies static disabled preview metadata for future campaigns.
- `campaign-package-context.mjs` exposes validated Ashes campaign and Character Creator context.
- `package-image-resolver.mjs` resolves package-owned media variants.

There is no runtime package importer or package-format migration path in V1.
