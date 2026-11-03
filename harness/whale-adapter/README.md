# Pinned whale compatibility adapter

Upstream: [Sutera-Diffusus/dsh-whale-musume](https://github.com/Sutera-Diffusus/dsh-whale-musume), npm version 2.5.0, MIT license, copyright 2026 Sutera-Diffusus.

NexusMCP embeds the official Cordis runtime. The host is re-exported unchanged. The generated client only changes the ModuleLoader registration ID to this adapter's package ID; upstream assets, settings and behavior remain intact. `scripts/build-harness.mjs` verifies the original ID and copies the upstream license into distribution artifacts. No global engine-check bypass is enabled.

See [the tested compatibility scope](../../docs/HARNESS-COMPATIBILITY.md). Generated client code and dependencies are not committed to Git.
