# Notices

`@itslil/posthog-js` is an independent LilScript reimplementation of
**selected algorithms** from [`posthog-js@1.418.10`](https://github.com/PostHog/posthog-js).
It is not affiliated with or endorsed by PostHog, Inc.

This port contains a capture kernel plus independent surveys, error-tracking,
pure OTLP, autocapture utilities, and replay-core subpaths; it is not the published
browser SDK. The active session recorder, product tours, heatmaps, web vitals,
the PostHog client class, network transport, and persistence adapters are absent.

The public algorithms derive from:

- [PostHog/posthog-js](https://github.com/PostHog/posthog-js), Apache-2.0 AND MIT
- [LiosK/uuidv7](https://github.com/LiosK/uuidv7), Apache-2.0 (vendored by PostHog)

The original license notices are preserved in [LICENSE](./LICENSE).

The LilScript compiler is developed separately at
[yeargun/lilscript](https://github.com/yeargun/lilscript).
