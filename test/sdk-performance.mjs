import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import os from 'node:os'
import {chromium} from '@playwright/test'
import {root} from '../scripts/sdk-source.mjs'
mkdirSync(join(root,'reports/full-sdk'),{recursive:true})

const results=JSON.parse(readFileSync(join(root,'artifacts/sdk/results.json'),'utf8'))
const samples=Number(process.env.POSTHOGLIL_BENCH_SAMPLES??15)
if(samples<10)throw Error('At least ten paired samples are required')
const server=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*')
  if(req.url==='/app'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>SDK performance fixture</title><main><button id="button">Capture</button></main>');return}
  for await(const _ of req){}
  res.setHeader('Content-Type','application/json');res.end('{"status":1,"featureFlags":{},"featureFlagPayloads":{}}')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({args:['--no-sandbox']})
const metadata={date:new Date().toISOString(),browser:browser.version(),node:process.version,cpu:os.cpus()[0].model,loadBefore:os.loadavg(),samples,warmupPairs:2,eventsPerSample:1000,
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
  return {originalMedianMs:median(pairs.map(x=>x.original[key])),candidateMedianMs:median(pairs.map(x=>x.candidate[key])),pairedImprovementPercent:median(ratios),confidence95Percent:ci,verdict:ci[0]>0?'faster in this workload':ci[1]<0?'slower in this workload':'no clear difference'}
}
async function sample(file){
  const context=await browser.newContext()
  await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort())
  const page=await context.newPage();await page.goto(origin+'/app')
  const code=readFileSync(join(root,file),'utf8')
  const measured=await page.evaluate(async({code,origin})=>{
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
  for(const surface of results.surfaces)for(const objective of surface.objectives){
    const pairs=[]
    for(let i=-2;i<samples;i++){
      const pair={}
      for(const label of i%2===0?['original','candidate']:['candidate','original'])pair[label]=await sample(label==='original'?objective.baseline.file:objective.artifact.file)
      if(i>=0)pairs.push(pair)
    }
    const row={surface:surface.id,objective:objective.objective,original:objective.baseline.file,originalSha256:objective.baseline.sha256,candidate:objective.artifact.file,candidateSha256:objective.artifact.sha256,pairs,metrics:Object.fromEntries(['importMs','initMs','capture1000Ms','exception100Ms'].map(key=>[key,summarize(pairs,key)]))}
    metadata.rows.push(row)
    mkdirSync(join(root,'artifacts/sdk'),{recursive:true})
    writeFileSync(join(root,'artifacts/sdk/performance.json'),JSON.stringify(metadata,null,2)+'\n')
    console.log(surface.id,objective.objective,JSON.stringify(row.metrics))
  }
  metadata.loadAfter=os.loadavg()
  writeFileSync(join(root,'artifacts/sdk/performance.json'),JSON.stringify(metadata,null,2)+'\n')
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
