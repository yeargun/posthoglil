import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import os from 'node:os'
import {createHash} from 'node:crypto'
import {chromium} from '@playwright/test'
import {root} from '../scripts/sdk-source.mjs'
mkdirSync(join(root,'reports/full-sdk'),{recursive:true})

const results=JSON.parse(readFileSync(join(root,'artifacts/sdk/results.json'),'utf8'))
const consumers=process.env.POSTHOGLIL_CONSUMER_RESULTS?JSON.parse(readFileSync(join(root,process.env.POSTHOGLIL_CONSUMER_RESULTS),'utf8')):null
const jobs=consumers?consumers.rows.filter(row=>['standard','full'].includes(row.fixture)).map(row=>({surface:row.fixture,objective:row.bundler,baseline:row.original.files.find(file=>file.entry),artifact:row.candidate.files.find(file=>file.entry)})):results.surfaces.flatMap(surface=>surface.objectives.map(row=>({surface:surface.id,...row})))
const outputFile=join(root,process.env.POSTHOGLIL_PERFORMANCE_OUTPUT??(consumers?'artifacts/sdk-consumers/performance.json':'artifacts/sdk/performance.json'))
for(const job of jobs)for(const artifact of [job.baseline,job.artifact])assert.equal(createHash('sha256').update(readFileSync(join(root,artifact.file))).digest('hex'),artifact.sha256,'Runtime input must match its size receipt')
const samples=Number(process.env.POSTHOGLIL_BENCH_SAMPLES??15)
if(samples<10)throw Error('At least ten paired samples are required')
const server=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*')
  // Fine-grained timers avoid quantizing a short initialization measurement
  // into 0.1 ms steps. Both variants use the same isolated local origin.
  res.setHeader('Cross-Origin-Opener-Policy','same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy','require-corp')
  if(req.url==='/app'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>SDK performance fixture</title><main><button id="button">Capture</button></main>');return}
  for await(const _ of req){}
  res.setHeader('Content-Type','application/json');res.end('{"status":1,"featureFlags":{},"featureFlagPayloads":{}}')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({args:['--no-sandbox']})
const metadata={date:new Date().toISOString(),browser:browser.version(),node:process.version,cpu:os.cpus()[0].model,loadBefore:os.loadavg(),samples,warmupPairs:2,eventsPerSample:1000,
  executionEnvironment:process.env.GITHUB_ACTIONS==='true'?{kind:'isolated GitHub Actions job',repository:process.env.GITHUB_REPOSITORY,runId:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA}:{kind:'local shared worker'},
  timer:'performance.now on a cross-origin-isolated local origin (COOP/COEP); every sample asserts isolation.',
  ...(consumers?{packageIntegrity:consumers.packageIntegrity,nonInferiorityMarginPercent:2,comparison:consumers.benchmarkComparison??'Real installed and rebundled package against the exact published npm package, with identical application and bundler settings. The predeclared practical performance gate is a one-sided 95% upper bound below 2% slowdown for each measured workload.'}:{}),
  importScope:'Import a fresh Blob URL: JavaScript parse, evaluate and module scheduling; source text transfer and Blob creation excluded. No network download is timed.',
  initScope:'Synchronous init with memory persistence, flags bootstrap, autocapture enabled, replay disabled. Full build includes recorder code but recording is not timed.',
  captureScope:'Synchronous preparation and queueing of 1,000 capture calls after 100 warmup calls. before_send returns each event unchanged. Rate limits raised; actual accepted count asserted. HTTP upload, ingestion and replay processing excluded.',
  exceptionScope:'Synchronous preparation and queueing of 100 captureException calls after 20 warmups. Preconstructed fixtures: 50 simple errors, 25 errors with a cause and 25 two-member aggregates, all with fixed two-frame stacks. Error construction is excluded. Every sample asserts 100 accepted exception events. Upload and ingestion are excluded.',
  statistics:'Alternating original/candidate order, separate fresh browser contexts. Medians; paired bootstrap 95% interval for median relative improvement, 5,000 deterministic resamples. Positive means candidate faster. Exploratory microbenchmark, not a user-perceived latency or throughput guarantee.',rows:[]}
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return (sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2}
let seed=0x73c81d
function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
function summarize(pairs,key){
  const ratios=pairs.map(pair=>100*(1-pair.candidate[key]/pair.original[key]))
  const boot=Array.from({length:5000},()=>median(Array.from({length:pairs.length},()=>ratios[Math.floor(random()*pairs.length)]))).sort((a,b)=>a-b)
  const ci=[boot[Math.floor(boot.length*.025)],boot[Math.floor(boot.length*.975)]]
  const slowdownUpper95Percent=-boot[Math.floor(boot.length*.05)]
  return {originalMedianMs:median(pairs.map(x=>x.original[key])),candidateMedianMs:median(pairs.map(x=>x.candidate[key])),pairedImprovementPercent:median(ratios),confidence95Percent:ci,...(consumers?{slowdownUpper95Percent,nonInferior:slowdownUpper95Percent<metadata.nonInferiorityMarginPercent}:{}),verdict:ci[0]>0?'faster in this workload':ci[1]<0?'slower in this workload':'no clear difference'}
}
async function sample(file){
  const context=await browser.newContext()
  await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort())
  const page=await context.newPage();await page.goto(origin+'/app')
  const code=readFileSync(join(root,file),'utf8')
  const measured=await page.evaluate(async({code,origin})=>{
    if(!crossOriginIsolated)throw Error('The timing fixture must be cross-origin isolated')
    const blob=URL.createObjectURL(new Blob([code],{type:'text/javascript'}))
    const start=performance.now();const sdk=await import(blob);const imported=performance.now()
    let accepted=0,acceptedExceptions=0
    const ph=sdk.default
    const options={api_host:origin,asset_host:origin,capture_pageview:false,capture_pageleave:false,autocapture:true,disable_session_recording:true,disable_surveys:true,disable_external_dependency_loading:true,advanced_disable_flags:true,advanced_disable_feature_flags:true,advanced_disable_feature_flags_on_first_load:true,persistence:'memory',request_batching:true,disable_compression:true,opt_out_useragent_filter:true,rate_limiting:{events_per_second:10000000,events_burst_limit:10000000},bootstrap:{distinctID:'performance-fixture',isIdentifiedID:true,featureFlags:{}},before_send:event=>{if(event.event==='bench')accepted++;return event}}
    const initStart=performance.now();ph.init('phc_performance_local_only',options);const initialized=performance.now()
    for(let i=0;i<100;i++)ph.capture('warmup',{index:i,plan:'pro'})
    const captureStart=performance.now()
    for(let i=0;i<1000;i++)ph.capture('bench',{index:i,plan:'pro',nested:{ok:true,items:[1,2,3]},_public_property:'unchanged'})
    const captured=performance.now()
    const exceptionStack='Error: benchmark\n    at checkout (https://example.test/app.js:10:5)\n    at main (https://example.test/app.js:20:3)'
    const makeError=()=>Object.assign(new Error('benchmark'),{stack:exceptionStack})
    const exceptions=Array.from({length:100},(_,i)=>i%4===0?Object.assign(new AggregateError([makeError(),makeError()],'benchmark'),{stack:exceptionStack}):i%4===1?Object.assign(makeError(),{cause:makeError()}):makeError())
    ph.set_config({before_send:event=>{if(event.event==='$exception')acceptedExceptions++;return event}})
    for(let i=0;i<20;i++)ph.captureException(exceptions[i])
    acceptedExceptions=0
    const exceptionStart=performance.now()
    for(const error of exceptions)ph.captureException(error)
    const exceptionsCaptured=performance.now()
    URL.revokeObjectURL(blob)
    ph.opt_out_capturing()
    return {importMs:imported-start,initMs:initialized-initStart,capture1000Ms:captured-captureStart,exception100Ms:exceptionsCaptured-exceptionStart,accepted,acceptedExceptions}
  },{code,origin})
  await context.close()
  assert.equal(measured.accepted,1000,'Benchmark hit an opt-out/rate-limit/no-op path')
  assert.equal(measured.acceptedExceptions,100,'Exception benchmark hit a suppression/no-op path')
  for(const key of ['importMs','initMs','capture1000Ms','exception100Ms'])assert.ok(measured[key]>0,`${key} timer resolution too low`)
  return measured
}
try{
  const controlSamples=Number(process.env.POSTHOGLIL_BENCH_CONTROL_PAIRS??0)
  if(controlSamples){
    const control=jobs.find(job=>job.surface==='standard'&&job.objective==='rolldown')??jobs[0]
    const pairs=[]
    for(let i=-2;i<controlSamples;i++){
      const pair={}
      for(const label of i%2===0?['original','candidate']:['candidate','original'])pair[label]=await sample(control.baseline.file)
      if(i>=0)pairs.push(pair)
    }
    metadata.identicalArtifactControl={file:control.baseline.file,sha256:control.baseline.sha256,samples:controlSamples,pairs,metrics:Object.fromEntries(['importMs','initMs','capture1000Ms','exception100Ms'].map(key=>[key,summarize(pairs,key)]))}
    console.log('identical-artifact timing control',JSON.stringify(metadata.identicalArtifactControl.metrics))
  }
  for(const objective of jobs){
    const pairs=[]
    for(let i=-2;i<samples;i++){
      const pair={}
      for(const label of i%2===0?['original','candidate']:['candidate','original'])pair[label]=await sample(label==='original'?objective.baseline.file:objective.artifact.file)
      if(i>=0)pairs.push(pair)
    }
    const row={surface:objective.surface,objective:objective.objective,original:objective.baseline.file,originalSha256:objective.baseline.sha256,candidate:objective.artifact.file,candidateSha256:objective.artifact.sha256,pairs,metrics:Object.fromEntries(['importMs','initMs','capture1000Ms','exception100Ms'].map(key=>[key,summarize(pairs,key)]))}
    metadata.rows.push(row)
    mkdirSync(join(root,'artifacts/sdk'),{recursive:true})
    writeFileSync(outputFile,JSON.stringify(metadata,null,2)+'\n')
    console.log(objective.surface,objective.objective,JSON.stringify(row.metrics))
  }
  metadata.loadAfter=os.loadavg()
  writeFileSync(outputFile,JSON.stringify(metadata,null,2)+'\n')
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
