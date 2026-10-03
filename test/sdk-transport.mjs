import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {chromium} from '@playwright/test'
import {root} from '../scripts/sdk-source.mjs'
mkdirSync(join(root,'reports/full-sdk'),{recursive:true})
const attempts=[]
let failNext=true
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost')
  if(url.pathname==='/app'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Retry fixture</title>');return}
  if(url.pathname.startsWith('/artifact/')){
    const file=resolve(root,url.pathname.slice(10));assert.ok(file.startsWith(root+'/'))
    res.setHeader('Content-Type','text/javascript');res.end(readFileSync(file));return
  }
  const chunks=[];for await(const part of req)chunks.push(part)
  const body=JSON.parse(Buffer.concat(chunks).toString())
  const status=failNext?503:200;failNext=false
  attempts.push({status,path:url.pathname,body})
  res.writeHead(status,{'Content-Type':'application/json'});res.end(status===503?'{"error":"fixture retry"}':'{"status":1}')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({args:['--no-sandbox']})
const report=[]
const sdk=JSON.parse(readFileSync(join(root,'artifacts/sdk/results.json'),'utf8'))
try{
  for(const surface of sdk.surfaces){
    const row=surface.objectives.find(x=>x.objective==='brotli')
    for(const [label,artifact] of [['original',row.baseline],['candidate',row.artifact]]){
      const begin=attempts.length;failNext=true
      const context=await browser.newContext()
      await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort())
      const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(String(error)))
      await page.clock.install({time:new Date('2026-10-03T00:00:00Z')})
      await page.goto(origin+'/app')
      await page.evaluate(async({origin,file})=>{
        const sdk=await import(origin+'/artifact/'+file),ph=sdk.default
        ph.init('phc_retry_local_only',{api_host:origin,asset_host:origin,persistence:'memory',capture_pageview:false,capture_pageleave:false,autocapture:false,disable_session_recording:true,disable_surveys:true,advanced_disable_flags:true,opt_out_useragent_filter:true,disable_compression:true,request_batching:true})
        ph.capture('batch.one',{index:1});ph.capture('batch.two',{index:2})
      },{origin,file:artifact.file})
      for(let i=0;i<12&&attempts.length-begin<2;i++){
        await page.clock.runFor(3500)
        await new Promise(resolve=>setTimeout(resolve,100))
      }
      const captured=attempts.slice(begin)
      assert.equal(captured.length,2,`${surface.id}/${label}: expected failed batch then retry`)
      assert.deepEqual(captured.map(x=>x.status),[503,200])
      const events=attempt=>Array.isArray(attempt.body)?attempt.body:attempt.body.batch??[attempt.body]
      assert.deepEqual(events(captured[0]).map(x=>x.event),['batch.one','batch.two'])
      assert.deepEqual(events(captured[1]).map(x=>x.uuid),events(captured[0]).map(x=>x.uuid),'Retry changed event identifiers')
      assert.deepEqual(events(captured[1]).map(x=>x.properties.index),[1,2])
      assert.deepEqual(errors,[])
      report.push({surface:surface.id,label,sha256:artifact.sha256,ok:true,batchSize:2,statuses:[503,200],identifiersPreserved:true})
      await context.close()
      console.log(surface.id,label,'batch + HTTP 503 retry passed')
    }
  }
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve))
  writeFileSync(join(root,'reports/full-sdk/transport.json'),JSON.stringify(report,null,2)+'\n')
}
