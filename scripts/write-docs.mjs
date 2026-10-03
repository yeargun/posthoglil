import {readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {root} from './sdk-source.mjs'
const read=file=>JSON.parse(readFileSync(join(root,file),'utf8'))
const sdk=read('artifacts/sdk/results.json'),utilities=read('artifacts/utilities/results.json'),validation=read('artifacts/sdk/validation.json'),pkg=read('artifacts/package/receipt.json')
const consumers=read('artifacts/sdk-consumers/results.json'),performance=read('artifacts/sdk-consumers/performance.json')
const n=value=>new Intl.NumberFormat('en-US').format(value)
const delta=value=>Math.abs(value).toFixed(2)+'% '+(value>0?'smaller':value<0?'larger':'same')
const labels={importMs:'Parse + evaluate',initMs:'Initialize',capture1000Ms:'Queue 1,000 events',exception100Ms:'Queue 100 exceptions'}
const appRows=consumers.rows.filter(row=>['standard','full'].includes(row.fixture))
const sizeRows=appRows.flatMap(row=>['raw','gzip9','brotli11'].map(metric=>`| ${row.fixture} | ${row.bundler} | ${metric} | ${n(row.original.total[metric])} | ${n(row.candidate.total[metric])} | ${delta(row.savingsPercent[metric])} |`)).join('\n')
const full=appRows.filter(row=>row.fixture==='full')
const savings=['raw','gzip9','brotli11'].map(metric=>{const values=full.map(row=>row.savingsPercent[metric]);return `${Math.min(...values).toFixed(2)}–${Math.max(...values).toFixed(2)}% ${metric}`}).join(', ')
const metrics=performance.rows.flatMap(row=>Object.values(row.metrics)),qualified=metrics.filter(m=>m.nonInferior).length
const runtimeRows=performance.rows.flatMap(row=>Object.entries(row.metrics).map(([key,m])=>`| ${row.surface} / ${row.objective} | ${labels[key]} | ${m.originalMedianMs.toFixed(2)} ms | ${m.candidateMedianMs.toFixed(2)} ms | ${m.pairedImprovementPercent.toFixed(1)}% [${m.confidence95Percent.map(v=>v.toFixed(1)).join(', ')}] | ${m.nonInferior?'Pass':'Not established'} |`)).join('\n')
const controlRows=sdk.surfaces.flatMap(surface=>surface.objectives.map(row=>`| ${surface.id} | ${row.objective} | ${n(row.baseline[row.metric])} | ${n(row.artifact[row.metric])} | ${delta(row.savingsPercent)} | ${row.baseline.lane} |`)).join('\n')
const buildRows=sdk.surfaces.flatMap(surface=>surface.objectives.map(row=>`| ${surface.id} | ${row.objective} | ${row.originalBuildSeconds.toFixed(3)} s | ${row.totalBuildSeconds.toFixed(3)} s |`)).join('\n')
const docs=`# PostHog × LilScript

One installable browser SDK with the same application imports, React bindings and canonical TypeScript declarations as **posthog-js ${sdk.upstream.version}**. The complete **full/no-external** entry saves **${savings}** in the two tested application bundlers. These are measurements of one fixed package runtime, not different packages selected for each codec.

**Status:** downloadable release candidate; not published to npm. All 14 optimized application/bundler cases are smaller in raw, gzip and Brotli. Four unchanged-entry cases equal the original. Runtime: **${qualified}/${metrics.length} workloads meet the predeclared 2% non-regression bound** at one-sided 95% confidence. ${qualified===metrics.length?'That bound applies only to the measured workloads.':'The evidence does not yet support a blanket “not slower” claim.'} The standard SDK has smaller gains, particularly after Rolldown minification; see every result below.

[Interactive results and download](https://yeargun.github.io/posthoglil/) · [Installed-package measurements](artifacts/sdk-consumers/results.json) · [Runtime samples](artifacts/sdk-consumers/performance.json) · [Validation](artifacts/sdk/validation.json)

## The package in a web application

Each side installs the real tarball under the same dependency key, \`posthog-js\`, and builds identical source with esbuild ${consumers.tools?.esbuild??sdk.tools.esbuild} or Rolldown ${consumers.tools?.rolldown??sdk.tools.rolldown}, normal tree shaking, ES2020 and production settings. The original is the exact npm release. All three sizes in a row measure the same output: raw bytes, gzip level 9 and Brotli quality 11/window 22. Optional source maps are excluded.

| SDK | App bundler | Format | Original npm app | PostHog Lil app | Difference |
| --- | --- | --- | ---: | ---: | --- |
${sizeRows}

The standard entry is the initial analytics client; optional extension downloads are additional. The full entry embeds the upstream full/no-external feature set, including replay, surveys, logs, exception autocapture, tracing headers, web vitals and dead clicks. Product tours, conversations, toolbar and chat integrations are not embedded. No feature is removed to obtain these figures.

The SDK combines typed LilScript internals with upstream client, transport, persistence, UI and recorder implementations. Generic bundling and minification account for much of the saving; the stricter source control below discloses the additional contribution from LilScript replacements. The upstream source submodule is unchanged, pinned at [\`${sdk.upstream.commit}\`](https://github.com/PostHog/posthog-js/tree/${sdk.upstream.commit}).

## Install without application changes

Download [\`${pkg.tarball}\`](https://yeargun.github.io/posthoglil/downloads/${pkg.tarball}), then:

\`\`\`sh
npm install posthog-js@file:./${pkg.tarball}
\`\`\`

\`\`\`ts
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'

posthog.init('your-project-token', { api_host: 'https://us.i.posthog.com' })
posthog.capture('checkout', { plan: 'pro' })
\`\`\`

Installing under \`posthog-js\` keeps upstream React imports on the same singleton. Only the root and \`posthog-js/full/no-external\` runtimes are replaced. Other subpaths keep upstream runtime bytes. ESM and CommonJS, the original package layout and exact canonical \`dist/module.d.ts\` are retained. \`SDK-BUILD.json\` lists replacements. Rebuilt source maps cover replaced ESM/CJS files, with embedded upstream TypeScript and compiled LilScript JavaScript; they do not map back to LilScript source.

The existing \`@itslil/posthog-js\` utility package has a separate API. The complete browser package is \`@itslil/posthog-browser\`; this candidate is available as a tarball and is not yet on the npm registry. It is an independent project, not an official PostHog release.

## Tree shaking

Nine application fixtures run through both bundlers: default SDK, constructor only, full SDK, side-effect import, one React hook, all React exports, React slim, no-external and dynamic import. Browser checks exercise the resulting modules.

Unused React exports are removed. \`react/slim\` stays independent of the SDK. Dynamic import leaves a small initial wrapper and loads the SDK chunk only on demand. The original SDK initializes its singleton on import, so even a constructor-only import retains most of the client; this behavior is preserved. No \`sideEffects: false\` override is applied.

[All fixtures, chunk sizes, hashes and build times](artifacts/sdk-consumers/results.json) · [Consumer tests](test/sdk-consumers.mjs)

## Runtime of the installed package

${performance.samples} measured pairs and ${performance.warmupPairs} warmup pairs per SDK/bundler, with alternating original/candidate order and fresh Chromium ${performance.browser} contexts. Run on ${performance.cpu} in ${performance.executionEnvironment?.kind??'the recorded environment'}, with fine-grained timers on a cross-origin-isolated local origin. An identical-artifact control records measurement noise separately. Positive improvement means faster. Brackets give the paired bootstrap 95% interval. The last column checks a predeclared one-sided 95% upper bound below 2% slowdown; it does not claim identical performance in every application.

| SDK / app bundler | Workload | Original median | Candidate median | Improvement [95% interval] | 2% bound |
| --- | --- | ---: | ---: | --- | --- |
${runtimeRows}

Import measures parsing, evaluation and module scheduling from a fresh Blob URL, excluding transfer. Init uses memory persistence, autocapture, bootstrapped flags and disabled recording. Capture measures synchronous preparation and queueing after warmup; every trial asserts all 1,000 events were accepted. Exceptions use 100 preconstructed simple errors, caused errors and aggregates with fixed stacks; all 100 events must be accepted. Upload, ingestion and replay processing are not timed. These are scoped microbenchmarks, not end-user latency guarantees.

[Every sample and methodology](artifacts/sdk-consumers/performance.json) · [Separate compiler-objective timings against optimized-original controls](artifacts/sdk/performance.json)

## The original with the same optimizations

This comparison applies the same source bundling and delivery tooling to the unchanged original. Each row uses an independent raw-, gzip- or Brotli-targeted LilScript compilation. The original is the smallest for that codec among the published npm file, Terser, Oxc, esbuild, both Terser/Oxc orders, Oxc plus private-property mangling, and raw literal-pooling alternatives. These are research artifacts; the installable package above has one fixed runtime per entry.

| SDK | Objective | Minified original | LilScript candidate | Difference | Original lane |
| --- | --- | ---: | ---: | --- | --- |
${controlRows}

Dependency aliases are shared only after identical package versions and file hashes are verified. Property mangling preserves protocol keys, cross-bundle hooks and injected release/chunk IDs. The installable package shares repeated string values while keeping named member accesses intact; it introduces no decoder or eval. This additional delivery pass is also measured on unchanged source in [the package-runtime receipt](artifacts/package-runtime/results.json).

Private encoder, traversal, cycle, serialization and breadcrumb records expose typed storage to the compiler. Public payload keys and constructor contracts remain intact; dynamic host objects are not treated as private records. Upstream implementations remain where the complete linked result is smaller.

## Build time

Application build times below use the same installed dependencies and bundler settings. Each is a single measured run, so warmup and machine noise can affect comparisons.

| SDK / app bundler | Original app build | Candidate app build |
| --- | ---: | ---: |
${appRows.map(row=>`| ${row.fixture} / ${row.bundler} | ${(row.original.buildMs/1000).toFixed(3)} s | ${(row.candidate.buildMs/1000).toFixed(3)} s |`).join('\n')}

Compiler-objective times include compilation, source bundling and the selected minifier. Original times use the matching source bundler/minifier. Filesystem caches are warm and compiler caching is disabled. Installation, lane search, declarations, packaging and final transport compression are excluded. The npm publisher's build time is unknown.

| SDK | Objective | Matching original pipeline | Candidate pipeline |
| --- | --- | ---: | ---: |
${buildRows}

## Compatibility evidence

${validation.coverage.map(item=>'- '+item).join('\n')}

${validation.scope} Hosted ingestion, every optional feature, canvas recording, CSP variants and Firefox/WebKit are not certified. Recorder tests use a local collector, decode real snapshots/mutations and inspect password masking, including compressed payloads.

## Standalone utilities

These savings cover each listed utility export surface, not the complete SDK. The kernel includes explicitly extracted router, queue and rate-limit helper contracts. Each row is compared with minified pinned upstream code.

| Utility group | Raw objective | gzip objective | Brotli objective |
| --- | --- | --- | --- |
${utilities.rows.map(row=>`| ${row.label} | ${row.objectives.map(item=>delta(item.savingsPercent)).join(' | ')} |`).join('\n')}

[Utility sizes and build costs](artifacts/utilities/results.json) · [24 named-import comparisons across two bundlers and three objectives](artifacts/tree-shaking/results.json). Standalone constructors preserve names, arity, prototypes, descriptors and subclassing behavior. Utility percentages are not SDK savings.

## Reproduce

Builds are sequential. Use the committed lockfile, pinned submodule, LilScript executable with SHA-256 \`${sdk.surfaces[0].objectives[0].compiler.sha256}\`, and the canonical codec executable.

\`\`\`sh
git submodule update --init
npm ci
export LILSCRIPT_COMPILER=/path/to/lilscript
export LILSCRIPT_CODEC=/path/to/lilscript-codec
npm run build
npm run measure:sdk-consumers
npx playwright install chromium
npm run test:all
npm run measure:runtime
npm run measure:consumer-runtime
npm run write:results
node scripts/write-docs.mjs
npm run check:site
\`\`\`

The compiler produces utility ESM/CJS/browser formats and the SDK's internal replacements. SDK assembly, delivery minification and CJS adaptation are separately recorded. \`test:all\` runs from committed compiler artifacts, rebuilding application bundles from the actual tarball; it does not need the closed compiler. Runtime timing is separate from correctness tests to avoid CPU contention.

## Sponsorship

Sponsorship would fund compiler work and broader SDK compatibility and performance testing. The evidence above distinguishes measured npm-package savings, optimized-original controls and runtime limitations. [Discuss an integration trial or sponsorship](https://github.com/yeargun/posthoglil/issues).

Independent work by yeargun. No affiliation with or endorsement by PostHog is implied. See [NOTICE](NOTICE.md), [LICENSE](LICENSE) and [dependency licenses](licenses).
`
writeFileSync(join(root,'README.md'),docs)
console.log('Wrote installed-package and current/upstream comparisons')
