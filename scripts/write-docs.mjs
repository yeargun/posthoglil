import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {root} from './sdk-source.mjs'
const read=file=>JSON.parse(readFileSync(join(root,file),'utf8'))
const sdk=read('artifacts/sdk/results.json'),utilities=read('artifacts/utilities/results.json'),validation=read('artifacts/sdk/validation.json'),performance=read('artifacts/sdk/performance.json'),pkg=read('artifacts/package/receipt.json')
const n=value=>new Intl.NumberFormat('en-US').format(value)
const delta=value=>Math.abs(value).toFixed(2)+'% '+(value>0?'smaller':value<0?'larger':'same')
const sdkRows=sdk.surfaces.flatMap(surface=>surface.objectives.map(row=>`| ${surface.id} | ${row.objective} | ${n(row.baseline[row.metric])} | ${n(row.artifact[row.metric])} | ${delta(row.savingsPercent)} | ${row.baseline.lane} |`)).join('\n')
const utilityRows=utilities.rows.map(module=>`| ${module.label} | ${module.objectives.map(row=>delta(row.savingsPercent)).join(' | ')} |`).join('\n')
const runtimeRows=performance.rows.filter(row=>row.objective==='brotli').flatMap(row=>Object.entries(row.metrics).map(([metric,m])=>`| ${row.surface} | ${metric} | ${m.originalMedianMs.toFixed(2)} ms | ${m.candidateMedianMs.toFixed(2)} ms | ${m.verdict}; paired 95% interval ${m.confidence95Percent.map(x=>x.toFixed(1)+'%').join(' to ')} |`)).join('\n')
const buildRows=sdk.surfaces.flatMap(surface=>surface.objectives.map(row=>`| ${surface.id} | ${row.objective} | ${row.originalBuildSeconds.toFixed(3)} s | ${row.totalBuildSeconds.toFixed(3)} s |`)).join('\n')
const docs=`# PostHog × LilScript

A complete browser SDK integration experiment, plus standalone utility ports, pinned to **posthog-js ${sdk.upstream.version}** at [\`${sdk.upstream.commit}\`](https://github.com/PostHog/posthog-js/tree/${sdk.upstream.commit}). The upstream source submodule is unmodified. The npm latest tag was checked on ${sdk.generatedAt.slice(0,10)}.

**The full-SDK experiment works in the tested browser journeys, but it has not established a size or general performance win.** Against the strongest minified original, the candidate is approximately 0.5–1.4% larger across the SDK objectives below. Five standalone utility groups have compression wins; error tracking is larger. These are different scopes.

[Interactive results and preview](https://yeargun.github.io/posthoglil/) · [SDK receipts](artifacts/sdk/results.json) · [Runtime samples](artifacts/sdk/performance.json) · [Validation](artifacts/sdk/validation.json)

## Complete SDK size

Each candidate is independently compiled for its named objective. The baseline is the smallest original for that codec among the exact npm artifact and the unchanged pinned source bundled through Terser, Oxc and esbuild. Numbers are bytes. Raw, gzip-9 and Brotli-11 rows refer to different, separately targeted candidate files.

| SDK | Objective | Minified original | Candidate | Difference | Winning original |
| --- | --- | ---: | ---: | --- | --- |
${sdkRows}

The standard row is the initial client: optional extension downloads are additional. The full row is upstream's **full/no-external** entry. It embeds replay, surveys, logs, exception autocapture, tracing headers, web vitals and dead clicks; product tours, conversations, toolbar and chat integrations are not embedded. No extra recorder script is fetched in the full browser test.

The receipt includes every minifier lane, all three codec sizes per artifact, SHA-256 hashes and the same-pipeline comparison. Generic bundler/minifier gains are not attributed to LilScript. The SDK mixes qualified LilScript internals with upstream client, transport, persistence, UI and recorder code; it is not a complete rewrite of every SDK implementation.

## Runtime

${performance.samples} measured pairs plus ${performance.warmupPairs} warmup pairs per surface/objective; alternating order, fresh browser contexts, Chromium ${performance.browser}. The table shows the default Brotli builds. Positive paired improvement means faster; an interval spanning zero supports no clear difference. These are exploratory microbenchmarks, not end-user latency guarantees.

| SDK | Workload | Original median | Candidate median | Paired result |
| --- | --- | ---: | ---: | --- |
${runtimeRows}

Import times include parse, evaluation and module scheduling from a fresh Blob URL, excluding source download. Init uses memory persistence, autocapture, bootstrapped flags and disabled recording. Capture times cover preparation and queueing of 1,000 events after 100 warmup calls; each sample asserts 1,000 accepted events. Upload, ingestion and replay processing are not timed. The results do not support a consistent event-processing speedup.

## Build time

One measured run per stage, warm filesystem and compiler cache disabled. Candidate time includes compilation, source bundling and its selected minifier. Original time is the same source bundler and the candidate's selected minifier; the npm publisher's build time is unknown. Installation, lane search, declarations, packaging and transport compression are excluded. Different output scopes are not presented as build speedups.

| SDK | Objective | Matching original pipeline | Candidate pipeline |
| --- | --- | ---: | ---: |
${buildRows}

## Standalone utilities

These percentages cover the listed utility exports, not the SDK. The utility kernel includes explicitly extracted router, queue and rate-limit helper contracts. Other fixtures re-export the pinned upstream modules. See [utility receipts](artifacts/utilities/results.json) for bytes, per-objective build costs and original minifier lanes.

| Utility group | Raw objective | gzip objective | Brotli objective |
| --- | --- | --- | --- |
${utilityRows}

The utility package API remains \`@itslil/posthog-js\` with \`surveys\`, \`error-tracking\`, \`otlp\`, \`autocapture\` and \`replay-core\` subpaths. Repository artifacts are refreshed; this task does not publish a new utility npm release. The separate SDK preview below preserves the PostHog client API.

## Try the SDK preview

Download [\`${pkg.tarball}\`](https://yeargun.github.io/posthoglil/downloads/${pkg.tarball}), then install it under the existing dependency name:

\`\`\`sh
npm install posthog-js@file:./${pkg.tarball}
\`\`\`

\`\`\`ts
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'

posthog.init('your-project-token', { api_host: 'https://us.i.posthog.com' })
posthog.capture('checkout', { plan: 'pro' })
\`\`\`

The package is an **unpublished experimental preview**, not an official PostHog release or a recommended size upgrade. Its default root and \`posthog-js/full/no-external\` entries use the Brotli-targeted candidate. ESM and CommonJS are provided. The package retains the exact canonical upstream \`dist/module.d.ts\`; React, full and root declarations share that class identity. Install under \`posthog-js\` so upstream React imports resolve to the same singleton. Other subpaths retain the upstream runtime bytes and make no optimization claim. \`SDK-BUILD.json\` inside the tarball lists all replaced files; rebuilt source maps accompany every replaced ESM/CJS file, including embedded upstream TypeScript and compiled LilScript JavaScript. Mapping back to LilScript source is not supplied.

## Compatibility evidence

${validation.coverage.map(item=>'- '+item).join('\n')}

This is ${validation.scope.toLowerCase()} Hosted PostHog ingestion, every optional feature, canvas recording, CSP variants and Firefox/WebKit are not certified by these tests. Recordings are tested against a local collector and decoded to verify actual DOM data and password masking.

Public names, configuration keys and event payloads remain API boundaries. Only private SDK linker exports can lose function names. Standalone utility constructors retain their names, arity, prototypes, descriptors and host subclassing behavior. Exported constructors use LilScript's native constructor boundary. Dynamic host objects are not treated as freely renameable closed-world records.

## Reproduce

Use the committed lockfile and submodule. Builds are sequential; do not launch multiple compiler commands together. Recompilation needs the LilScript executable matching SHA-256 \`${sdk.surfaces[0].objectives[0].compiler.sha256}\` and the canonical codec executable. The compiler was rebuilt from the current workspace, then its fingerprint was checked again after validation.

\`\`\`sh
git submodule update --init
npm ci
export LILSCRIPT_COMPILER=/path/to/lilscript
export LILSCRIPT_CODEC=/path/to/lilscript-codec
npm run build
npx playwright install chromium
npm run test:all
npm run measure:runtime
npm run write:results
node scripts/write-docs.mjs
npm run check:site
\`\`\`

\`npm run build\` compiles the standalone raw/gzip/Brotli utilities, discovers live internal SDK exports, compiles the SDK objectives, measures the unchanged original lanes and prepares the SDK tarball. Utility ESM, CJS and browser wrappers come from compiler delivery manifests. SDK assembly/minification and its CJS format adaptation are separately identified. The SDK browser target follows upstream's ES2015/browser targets; tests currently use Chromium only.

\`npm run test:all\` works from committed generated artifacts without the compiler. It runs utility checks, the selected upstream suites, real browser journeys and the packed React/TypeScript consumer. Runtime benchmarking is separate so correctness checks do not compete for CPU during timing. Test source and raw receipts are available for inspection. Use the recorded compiler fingerprint when reproducing the compilation.

## Sponsorship

Sponsorship would fund further compiler work and broader compatibility/performance validation. The evidence supports useful standalone utility savings and a working integration prototype. It does **not** yet support a claim that LilScript delivers a substantially smaller or consistently faster complete PostHog SDK. [Discuss an integration trial or sponsorship](https://github.com/yeargun/posthoglil/issues).

Independent work by yeargun. No affiliation with or endorsement by PostHog is implied. See [NOTICE](NOTICE.md), [LICENSE](LICENSE) and [dependency licenses](licenses).
`
writeFileSync(join(root,'README.md'),docs)
console.log('Wrote current/upstream-only README')
