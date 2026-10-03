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
assert.ok(suites.every(row=>row.total===480&&row.passed===480))
const journeys=read('reports/full-sdk/browser-journeys.json');assert.equal(journeys.length,6);assert.ok(journeys.every(row=>row.ok))
const transport=read('reports/full-sdk/transport.json');assert.equal(transport.length,4);assert.ok(transport.every(row=>row.ok))
const pkg=read('reports/full-sdk/package-validation.json');assert.equal(pkg.ok,true)
const perf=read('artifacts/sdk/performance.json');assert.equal(perf.rows.length,6)
const artifacts=sdk.surfaces.flatMap(surface=>surface.objectives.map(row=>({surface:surface.id,objective:row.objective,...row.artifact})))
for(const file of artifacts){
  assert.equal(hash(file.file),file.sha256)
  const sample=perf.rows.find(row=>row.surface===file.surface&&row.objective===file.objective)
  assert.equal(sample.candidateSha256,file.sha256)
  assert.equal(sample.pairs.length,perf.samples)
  assert.ok(sample.pairs.every(row=>row.original.accepted===1000&&row.candidate.accepted===1000))
}
const counts=[...readFileSync(join(root,'reports/full-sdk/utilities-tests.log'),'utf8').matchAll(/^# tests (\d+)$/gm)].map(match=>Number(match[1]))
assert.equal(counts.length,3)
const result={schema:1,generatedAt:new Date().toISOString(),upstreamVersion,upstreamCommit,ok:true,
  upstreamTestsPerObjective:480,upstreamSuites:suites,utilityTests:counts.reduce((a,b)=>a+b,0),browser:'Chromium '+perf.browser,
  scope:'Selected upstream suites, targeted differential/ABI tests and browser journeys. This is not the entire PostHog test suite or a cross-browser certification.',
  coverage:[
    '480 selected, unmodified upstream tests pass for each of raw, gzip and Brotli; the upstream baseline passes the same suites.',
    `${counts.reduce((a,b)=>a+b,0)} utility/API checks, including constructor reflection and host subclassing.`,
    'Six paired browser journeys: matching public exports/methods, loaded callbacks, flags, identify, groups, consent, capture hooks and event payloads.',
    'Identity survives reload; reset and named-instance isolation are checked.',
    'Autocapture and exceptions reach a local HTTP collector. Passwords and no-capture controls are excluded.',
    'Real recorder full snapshots and DOM mutations are received and decoded; password checks also inspect compressed replay payloads.',
    'Standard SDK works with the published lazy recorder. Full/no-external records without fetching a recorder script.',
    'Batching and an HTTP 503 retry preserve event IDs and properties in the Brotli SDKs.',
    'Packed tarball: CommonJS, React provider/hooks, SSR, strict TypeScript and byte-identical canonical upstream declarations and rebuilt ESM/CJS source maps.',
  ],
  artifacts,package:pkg,transport,
  journeys:journeys.map(row=>({surface:row.surface,objective:row.objective,ok:row.ok,originalFile:row.baseline.file,candidateFile:row.candidate.file,publicMethods:row.candidate.result.api.methods,exports:row.candidate.result.api.exports,events:row.candidate.eventNames,persistence:row.candidate.persistence})),
  performance:{samples:perf.samples,warmupPairs:perf.warmupPairs,rows:perf.rows.length,source:'artifacts/sdk/performance.json'}}
writeFileSync(join(root,'artifacts/sdk/validation.json'),JSON.stringify(result,null,2)+'\n')
mkdirSync(join(root,'artifacts/validation'),{recursive:true})
for(const row of suites)copyFileSync(join(root,`reports/full-sdk/upstream-${row.objective}.json`),join(root,`artifacts/validation/upstream-${row.objective}.json`))
console.log(result.utilityTests,'utility checks; 480 upstream tests × 3 objectives; 6 paired browser journeys; package and transport checks passed')
