# Attribution

This independent project contains LilScript ports and a hybrid integration of PostHog JavaScript SDK **1.435.8**, pinned to commit `c9d890a4028b186a5e1b327161ea197001c0c46b` of https://github.com/PostHog/posthog-js.

Copyright 2020 PostHog / Hiberly, Inc. Copyright 2015 Mixpanel, Inc. PostHog code is licensed under Apache-2.0; portions and bundled dependencies carry MIT and other permissive licenses. Preserve the upstream LICENSE and the dependency notices supplied in the SDK package. The upstream SDK source remains unchanged in `vendor/posthog-js`.

The standalone utility files are LilScript compiler outputs. The SDK combines selected LilScript internals with upstream client, transport, persistence, UI and recorder code, then bundles and minifies the result. It is not an entirely rewritten SDK. The preview package retains the upstream package layout and declarations; entrypoints outside the root and `full/no-external` are upstream artifacts. Dependency license texts are included in `licenses/`, including the rrweb MIT license. See `SDK-BUILD.json` in the preview tarball for the changed files.

This project is not affiliated with or endorsed by PostHog. Sponsorship would support further independent compiler and compatibility work.
