import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,copyFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {root,upstreamVersion,upstreamCommit} from './sdk-source.mjs'
const read=file=>JSON.parse(readFileSync(join(root,file),'utf8'))
const hash=file=>createHash('sha256').update(readFileSync(join(root,file))).digest('hex')
const sdk=read('artifacts/sdk/results.json')
const suites=['original','raw','gzip','brotli'].map(objective=>{
  const r=read(`reports/full-sdk/upstream-${objective}.json`)
  assert.equal(r.success,true);assert.equal(r.numFailedTests,0);assert.equal(r.numPendingTests,0)
  return {objective,total:r.numTotalTests,passed:r.numPassedTests,reportSha256:hash(`reports/full-sdk/upstream-${objective}.json`)}
})
const upstreamTests=suites[0].total
assert.ok(upstreamTests>=480,'The selected upstream test inventory must not shrink')
assert.ok(suites.every(row=>row.total===upstreamTests&&row.passed===upstreamTests))
const upstreamInputs=read('reports/full-sdk/upstream-inputs.json')
assert.deepEqual(upstreamInputs.map(row=>row.objective),['raw','gzip','brotli'])
for(const row of upstreamInputs)assert.equal(hash(row.file),row.sha256)
const internals=read('reports/full-sdk/sdk-internals-validation.json')
assert.equal(internals.ok,true);assert.equal(internals.rows.length,6);assert.equal(internals.deliveryTests,11)
for(const row of internals.rows){assert.equal(row.tests,38);assert.equal(hash(row.file),row.sha256)}
const journeys=read('reports/full-sdk/browser-journeys.json');assert.equal(journeys.length,6);assert.ok(journeys.every(row=>row.ok))
for(const row of journeys) {
  const selected=sdk.surfaces.find(surface=>surface.id===row.surface).objectives.find(objective=>objective.objective===row.objective)
  for(const [tested,expected] of [[row.candidate,selected.artifact],[row.baseline,selected.baseline],[row.published,selected.publishedOriginal]]){
    assert.equal(tested.file,expected.file);assert.equal(tested.sha256,expected.sha256);assert.equal(hash(tested.file),tested.sha256)
  }
}
const transport=read('reports/full-sdk/transport.json');assert.equal(transport.length,4);assert.ok(transport.every(row=>row.ok))
for(const row of transport){
  const selected=sdk.surfaces.find(surface=>surface.id===row.surface).objectives.find(objective=>objective.objective==='brotli')
  assert.equal(row.sha256,(row.label==='original'?selected.baseline:selected.artifact).sha256)
}
const pkg=read('reports/full-sdk/package-validation.json');assert.equal(pkg.ok,true)
const packageReceipt=read('artifacts/package/receipt.json')
assert.equal(pkg.integrity,packageReceipt.integrity)
const consumers=read('reports/full-sdk/consumer-validation.json')
assert.equal(consumers.ok,true);assert.equal(consumers.packageIntegrity,pkg.integrity)
const consumerSizes=read('artifacts/sdk-consumers/results.json')
assert.equal(consumerSizes.packageIntegrity,pkg.integrity);assert.equal(consumerSizes.rows.length,18)
for(const row of consumerSizes.rows){
  for(const variant of ['original','candidate'])for(const file of row[variant].files)assert.equal(hash(file.file),file.sha256)
  for(const metric of ['raw','gzip9','brotli11']){
    if(row.optimized)assert.ok(row.candidate.total[metric]<row.original.total[metric])
    else assert.equal(row.candidate.total[metric],row.original.total[metric])
  }
}
const consumerJourneys=read('reports/full-sdk/consumer-journeys.json')
assert.equal(consumerJourneys.length,4);assert.ok(consumerJourneys.every(row=>row.ok))
const consumerPerformance=read('artifacts/sdk-consumers/performance.json')
assert.equal(consumerPerformance.packageIntegrity,pkg.integrity);assert.equal(consumerPerformance.rows.length,4)
for(const row of consumerPerformance.rows){
  const size=consumerSizes.rows.find(item=>item.fixture===row.surface&&item.bundler===row.objective)
  const journey=consumerJourneys.find(item=>item.surface===row.surface&&item.objective===row.objective)
  assert.ok(journey,'The measured application needs a full browser journey')
  for(const [variant,label] of [['candidate','candidate'],['original','baseline']]){
    const file=size[variant].files.find(file=>file.entry)
    assert.equal(row[variant+'Sha256'],file.sha256)
    assert.equal(journey[label].sha256,file.sha256)
  }
  assert.equal(row.pairs.length,consumerPerformance.samples)
  assert.ok(row.pairs.every(pair=>['original','candidate'].every(variant=>pair[variant].accepted===1000&&pair[variant].acceptedExceptions===100)))
}
const perf=read('artifacts/sdk/performance.json');assert.equal(perf.rows.length,6)
const artifacts=sdk.surfaces.flatMap(surface=>surface.objectives.map(row=>({surface:surface.id,objective:row.objective,...row.artifact})))
for(const file of artifacts){
  assert.equal(hash(file.file),file.sha256)
  const sample=perf.rows.find(row=>row.surface===file.surface&&row.objective===file.objective)
  const original=sdk.surfaces.find(row=>row.id===file.surface).objectives.find(row=>row.objective===file.objective).baseline
  assert.equal(sample.candidateSha256,file.sha256)
  assert.equal(sample.originalSha256,original.sha256)
  assert.equal(hash(original.file),original.sha256)
  assert.equal(sample.pairs.length,perf.samples)
  assert.ok(sample.pairs.every(row=>row.original.accepted===1000&&row.candidate.accepted===1000&&row.original.acceptedExceptions===100&&row.candidate.acceptedExceptions===100))
}
const counts=[...readFileSync(join(root,'reports/full-sdk/utilities-tests.log'),'utf8').matchAll(/^# tests (\d+)$/gm)].map(match=>Number(match[1]))
assert.equal(counts.length,3)
for(const name of ['utilities','tree-shaking']){
  const checked=read('reports/full-sdk/'+name+'-validation.json')
  assert.equal(checked.ok,true)
  assert.equal(hash('reports/full-sdk/'+name+'-tests.log'),checked.logSha256)
  for(const input of checked.inputs)assert.equal(hash(input.file),input.sha256)
}
const treeShaking=read('artifacts/tree-shaking/results.json')
assert.equal(treeShaking.rows.length,24)
const treeCounts=[...readFileSync(join(root,'reports/full-sdk/tree-shaking-tests.log'),'utf8').matchAll(/^# tests (\d+)$/gm)].map(match=>Number(match[1]))
assert.deepEqual(treeCounts,[24])
for(const row of treeShaking.rows)for(const artifact of [row.artifact,...row.originals]) {
  assert.equal(hash(artifact.file),artifact.sha256)
  assert.equal(hash(artifact.source),artifact.sourceSha256)
}
const result={schema:1,generatedAt:new Date().toISOString(),upstreamVersion,upstreamCommit,ok:true,
  upstreamTestsPerObjective:upstreamTests,upstreamSuites:suites,upstreamInputs,utilityTests:counts.reduce((a,b)=>a+b,0),browser:'Chromium '+perf.browser,
  scope:'Selected upstream suites, targeted differential/ABI tests and browser journeys. This is not the entire PostHog test suite or a cross-browser certification.',
  coverage:[
    `${upstreamTests} selected, unmodified upstream tests pass for each of raw, gzip and Brotli; the upstream baseline passes the same suites.`,
    `${counts.reduce((a,b)=>a+b,0)} utility/API checks, including constructor reflection, inherited setters, host subclassing and variadic parser calls.`,
    '24 named-import checks: esbuild and Rolldown remove unrelated utility code and execute the selected export for each raw/gzip/Brotli objective.',
    '30 default error-pipeline differential checks pass for each of six SDK linker artifacts, including cyclic causes, aggregate limits, getters, host coercion boundaries and exception inspection order.',
    'Eight private breadcrumb-buffer checks pass for each of six SDK linker artifacts, including nontruncated encoder lengths, UTF-8 limits, serialization/getter effects, configuration changes and mixed add/clear transitions.',
    'Eleven delivery-transform checks preserve quoted protocol keys, public property access, Proxy traps, evaluation order, super calls, template literals and direct-eval boundaries.',
    'Six SDK browser comparisons against both the exact published npm SDK and the optimized original: matching public exports/methods, loaded callbacks, flags, identify, groups, consent, capture hooks and event payloads.',
    'Identity survives reload; reset and named-instance isolation are checked.',
    'Autocapture and exceptions reach a local HTTP collector. Passwords and no-capture controls are excluded.',
    'Real recorder full snapshots and DOM mutations are received and decoded; password checks also inspect compressed replay payloads.',
    'Standard SDK works with the published lazy recorder. Full/no-external records without fetching a recorder script.',
    'All four full-SDK Web Vitals callback flavors emit a real First Contentful Paint metric; attribution is checked. Injected release IDs and chunk IDs reach exception payloads.',
    'The full SDK renders an actual survey form, accepts text input and sends the matching response to the collector.',
    'Batching and an HTTP 503 retry preserve event IDs and properties in the Brotli SDKs.',
    'Packed tarball: CommonJS, React provider/hooks, SSR, strict TypeScript and byte-identical canonical upstream declarations and rebuilt ESM/CJS source maps.',
    'Nine unchanged application fixtures built with both esbuild and Rolldown: one installed package is smaller in raw/gzip/Brotli for all 14 optimized cases; four unchanged-entry cases match the original exactly.',
    'Real package tree shaking: unused React exports are removed, react/slim remains independent, and dynamic import defers the SDK chunk. Singleton initialization is preserved without overriding sideEffects.',
    'Four additional browser journeys run the installed and rebundled standard/full SDKs, checking API and event parity, persistence, replay payloads, surveys and web vitals.',
  ],
  artifacts,package:pkg,transport,internals,treeShaking:{tests:24,source:'artifacts/tree-shaking/results.json',sha256:hash('artifacts/tree-shaking/results.json')},
  journeys:journeys.map(row=>({surface:row.surface,objective:row.objective,ok:row.ok,originalFile:row.baseline.file,candidateFile:row.candidate.file,publicMethods:row.candidate.result.api.methods,exports:row.candidate.result.api.exports,events:row.candidate.eventNames,persistence:row.candidate.persistence})),
  consumers:{...consumers,source:'artifacts/sdk-consumers/results.json',sha256:hash('artifacts/sdk-consumers/results.json'),journeys:consumerJourneys.map(row=>({surface:row.surface,bundler:row.objective,ok:row.ok})),
    performance:{source:'artifacts/sdk-consumers/performance.json',sha256:hash('artifacts/sdk-consumers/performance.json'),samples:consumerPerformance.samples,nonInferiorityMarginPercent:consumerPerformance.nonInferiorityMarginPercent,executionEnvironment:consumerPerformance.executionEnvironment,allWorkloadsNonInferior:consumerPerformance.rows.every(row=>Object.values(row.metrics).every(metric=>metric.nonInferior))}},
  performance:{samples:perf.samples,warmupPairs:perf.warmupPairs,rows:perf.rows.length,source:'artifacts/sdk/performance.json'}}
writeFileSync(join(root,'artifacts/sdk/validation.json'),JSON.stringify(result,null,2)+'\n')
mkdirSync(join(root,'artifacts/validation'),{recursive:true})
for(const row of suites)copyFileSync(join(root,`reports/full-sdk/upstream-${row.objective}.json`),join(root,`artifacts/validation/upstream-${row.objective}.json`))
console.log(result.utilityTests,`utility checks; ${upstreamTests} upstream tests × 3 objectives; 6 paired browser journeys; package and transport checks passed`)
