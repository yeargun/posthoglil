import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {join,resolve,extname} from 'node:path'
import {gunzipSync,inflateSync} from 'node:zlib'
import {chromium} from '@playwright/test'
import ts from 'typescript'
import {root,upstreamVersion} from '../scripts/sdk-source.mjs'
mkdirSync(join(root,'reports/full-sdk'),{recursive:true})

const declarations=ts.createSourceFile('module.d.ts',readFileSync(join(root,'node_modules/posthog-upstream/dist/module.d.ts'),'utf8'),ts.ScriptTarget.Latest,true)
// Upstream also emits internal underscore methods in .d.ts, then mangles them.
// Check the public methods plus its explicitly supported compatibility hooks.
const preservedHooks=new Set(['_overrideSDKInfo','_calculate_event_properties','_isIdentified','_addCaptureHook','_send_request'])
const publicMethods=[]
function collect(node){
  if(ts.isClassDeclaration(node)&&node.name?.text==='PostHog'){
    for(const member of node.members){
      if(member.modifiers?.some(mod=>[ts.SyntaxKind.PrivateKeyword,ts.SyntaxKind.ProtectedKeyword,ts.SyntaxKind.StaticKeyword].includes(mod.kind)))continue
      if(ts.isMethodDeclaration(member)||(ts.isPropertyDeclaration(member)&&member.type&&ts.isFunctionTypeNode(member.type))){const name=member.name.getText(declarations);if(!name.startsWith('_')||preservedHooks.has(name))publicMethods.push(name)}
    }
  }
  ts.forEachChild(node,collect)
}
collect(declarations)
assert.ok(publicMethods.length>50,'Public API declaration extraction failed')
const received=[]
const flags={featureFlags:{enabled:true,disabled:false,variant:'blue'},featureFlagPayloads:{variant:{color:'blue'}},errorsWhileComputingFlags:false}
const config={supportedCompression:[],autocapture_opt_out:false,sessionRecording:{endpoint:'/s/',consoleLogRecordingEnabled:true},capturePerformance:false,surveys:[],...flags}
function decode(buffer,url){
  try{
    if(url.searchParams.get('compression')==='gzip-js')return JSON.parse(gunzipSync(buffer))
    const string=buffer.toString();if(string[0]==='{'||string[0]==='[')return JSON.parse(string)
    const form=new URLSearchParams(string);const data=form.get('data')??url.searchParams.get('data')
    if(data){try{return JSON.parse(Buffer.from(data,'base64').toString())}catch{return JSON.parse(data)}}
  }catch{return {undecoded:true,bytes:buffer.length}}
  return null
}
const html='<!doctype html><html><head><title>PostHog SDK parity</title></head><body><main id="root"><button id="buy" data-plan="pro">Choose Pro</button><input id="password" type="password" value="NEVER_CAPTURE_THIS_SECRET"><div class="ph-no-capture"><button id="private">Private</button></div><div id="change">Initial DOM</div></main></body></html>'
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost')
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'});res.end();return}
  if(url.pathname==='/app'){res.setHeader('Content-Type','text/html');res.end(html);return}
  if(url.pathname.startsWith('/artifact/')){
    const file=resolve(root,url.pathname.slice('/artifact/'.length))
    if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return}
    res.setHeader('Content-Type',extname(file)==='.css'?'text/css':'text/javascript');res.end(readFileSync(file));return
  }
  if(url.pathname.endsWith('/lazy-recorder.js')||url.pathname.endsWith('/recorder.js')){
    res.setHeader('Content-Type','text/javascript');res.end(readFileSync(join(root,'node_modules/posthog-upstream/dist/lazy-recorder.js')))
    received.push({path:url.pathname,method:req.method,body:null,asset:'published recorder'})
    return
  }
  if(url.pathname.endsWith('/config.js')){
    res.setHeader('Content-Type','text/javascript')
    res.end(`window._POSTHOG_REMOTE_CONFIG=window._POSTHOG_REMOTE_CONFIG||{};window._POSTHOG_REMOTE_CONFIG.phc_local_parity_only=${JSON.stringify({config})};`)
    return
  }
  const chunks=[];for await(const part of req)chunks.push(part)
  const body=Buffer.concat(chunks)
  received.push({path:url.pathname,method:req.method,body:decode(body,url),raw:body.toString(),query:Object.fromEntries(url.searchParams)})
  res.setHeader('Content-Type','application/json');res.setHeader('Access-Control-Allow-Origin','*')
  if(url.pathname.includes('flags')||url.pathname.includes('decide'))res.end(JSON.stringify(config))
  else if(url.pathname.endsWith('config'))res.end(JSON.stringify(config))
  else if(url.pathname.includes('surveys'))res.end('{"surveys":[]}')
  else res.end('{"status":1}')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
const output=[]
const benchmark=JSON.parse(readFileSync(join(root,'artifacts/sdk/results.json'),'utf8'))
const settle=ms=>new Promise(resolve=>setTimeout(resolve,ms))

function decodeReplay(value){
  if(typeof value==='string'&&value.charCodeAt(0)===31&&value.charCodeAt(1)===139)return decodeReplay(JSON.parse(gunzipSync(Buffer.from(value,'latin1')).toString('utf8')))
  if(Array.isArray(value))return value.map(decodeReplay)
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,decodeReplay(item)]))
  return value
}

function stable(value){
  if(Array.isArray(value))return value.map(stable)
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['uuid','timestamp','sent_at','offset','$insert_id','$session_id','$window_id','$device_id','$time','$session_duration','$time_since_last_event','$event_sequence','$session_entry_timestamp','$session_start_timestamp','$session_start_time','$sdk_debug_extensions_init_time_ms','$sdk_debug_replay_internal_buffer_length'].includes(key)).map(([key,val])=>[key,stable(val)]))
  if(typeof value==='string')return value.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,'<uuid>')
  return value
}

async function journey(label,file,surface){
  const begin=received.length
  const context=await browser.newContext({viewport:{width:1280,height:800},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'})
  await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort())
  const page=await context.newPage();const errors=[]
  page.on('pageerror',error=>errors.push(String(error)))
  await page.clock.setFixedTime(new Date('2026-10-03T00:00:00Z'))
  await page.goto(origin+'/app')
  const result=await page.evaluate(async({file,origin,surface,publicMethods})=>{
    globalThis._posthogReleaseId='release-fixture'
    globalThis._posthogChunkIds={'Error: chunk\n    at checkout (https://example.test/app.js:10:5)':'chunk-fixture'}
    const sdk=await import(origin+'/artifact/'+file)
    const ph=sdk.default
    globalThis.sdkUnderTest=ph
    const loaded=[];const seen=[]
    globalThis.observedSDKEvents=seen
    ph.init('phc_local_parity_only',{
      api_host:origin,ui_host:origin,asset_host:origin,
      capture_pageview:false,capture_pageleave:false,autocapture:true,
      disable_session_recording:surface!=='full',disable_surveys:surface!=='full',advanced_enable_surveys:surface==='full',
      capture_performance:false,disable_compression:true,
      opt_out_useragent_filter:true,
      persistence:'localStorage',request_batching:false,
      rate_limiting:{events_per_second:100000,events_burst_limit:100000},
      bootstrap:{distinctID:'anonymous-fixture',isIdentifiedID:false,featureFlags:{enabled:true,disabled:false,variant:'blue'},featureFlagPayloads:{variant:{color:'blue'}}},
      loaded:instance=>loaded.push(instance===ph),
      before_send:event=>{seen.push({event:event.event,properties:{...event.properties}});return event},
    })
    ph.register({workspace:'fixture',nested:{_publicKey:'unchanged'},_custom_property:'kept'})
    ph.register_once({first:'one'});ph.register_once({first:'two'})
    const custom={price:12,plan:'pro',nested:{flag:false,array:[1,2,3]}}
    const before=JSON.stringify(custom)
    ph.capture('checkout',custom)
    ph.identify('person-123',{email:'fixture@example.test'},{signup:'docs'})
    ph.group('company','company-7',{name:'Example'})
    ph.capture('identified checkout',{amount:25})
    const feature={enabled:ph.isFeatureEnabled('enabled'),disabled:ph.isFeatureEnabled('disabled'),variant:ph.getFeatureFlag('variant'),payload:ph.getFeatureFlagPayload('variant')}
    const identity={id:ph.get_distinct_id(),groups:ph.getGroups(),first:ph.get_property('first')}
    const beforeOut=seen.length;ph.opt_out_capturing();ph.capture('must not send');const consent={out:ph.has_opted_out_capturing(),blocked:seen.length===beforeOut};ph.opt_in_capturing({captureEventName:false});consent.in=ph.has_opted_in_capturing()
    ph.set_config({before_send:event=>event.event==='drop me'||event.properties?._parity_probe?null:(seen.push({event:event.event,properties:{...event.properties}}),event)})
    ph.capture('drop me');ph.capture('after consent')
    // Exercise observable getters after the final minifier, not just in the
    // compiler's linker input. The probe is dropped before HTTP transmission.
    const getterReads=[]
    const getterProbe={name:'Fixture',message:'Getter semantics',stack:'Error: getter\n    at checkout (https://example.test/app.js:10:5)'}
    Object.defineProperty(getterProbe,'level',{get(){getterReads.push('level');return 'fatal'}})
    ph.captureException(getterProbe,{_parity_probe:true})
    const exports=Object.keys(sdk).sort()
    const methods=[...new Set(publicMethods)].sort().map(name=>({name,type:typeof ph[name],arity:ph[name]?.length}))
    if(methods.some(method=>method.type!=='function'))throw Error('A declared public method is missing: '+JSON.stringify(methods.filter(method=>method.type!=='function')))
    const api={sameSingleton:sdk.posthog===ph,instance:ph instanceof sdk.PostHog,exports,methods,version:ph.version??ph.config?.lib_version}
    let vitals
    if(surface==='full') {
      const flavors=globalThis.__PosthogExtensions__?.postHogWebVitalsCallbacksByFlavor
      const names=['web-vitals','web-vitals-soft-navs','web-vitals-with-attribution','web-vitals-with-attribution-soft-navs']
      vitals=await Promise.all(names.map(name=>new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('Missing FCP callback: '+name)),5000)
        const callbacks=flavors?.[name]
        if(!callbacks||['onCLS','onFCP','onINP','onLCP'].some(key=>typeof callbacks[key]!=='function'))throw Error('Missing Web Vitals flavor: '+name)
        callbacks.onFCP(metric=>{
          clearTimeout(timer)
          resolve({name,metric:metric.name,valid:typeof metric.value==='number'&&Number.isFinite(metric.value)&&metric.value>=0,attributed:!!metric.attribution})
        })
      })))
    }
    return {api,loaded,feature,identity,consent,vitals,getterReads,captureOrder:seen.map(event=>event.event),inputUnchanged:JSON.stringify(custom)===before}
  },{file,origin,surface,publicMethods})
  await page.click('#buy')
  await page.click('#private')
  await page.fill('#password','STILL_PRIVATE')
  // Commit the change before survey autofocus, whose effect timing varies.
  await page.locator('#password').blur()
  await page.evaluate(()=>{
    document.querySelector('#change').textContent='Updated DOM captured by replay'
    const err=new Error('fixture error');err.stack='Error: fixture error\n    at checkout (https://example.test/app.js:10:5)'
    globalThis.sdkUnderTest.addExceptionStep('checkout breadcrumb',{cart:3,nested:{kept:true}})
    globalThis.sdkUnderTest.captureException(err)
    globalThis.sdkUnderTest.capture('browser journey complete')
  })
  if(surface==='full') {
    await page.evaluate(()=>{
      const target=document.createElement('div');target.id='survey-fixture';document.body.appendChild(target)
      globalThis.sdkUnderTest.renderSurvey({id:'survey-fixture',name:'Delivery fixture',type:'popover',questions:[{id:'answer',type:'open',question:'How was checkout?'}],conditions:{},start_date:'2026-01-01T00:00:00Z',end_date:null,appearance:{showThankYouMessage:false}},'#survey-fixture')
    })
    // The UI announces visibility in an effect. Wait for that lifecycle event
    // before input so its token debit cannot race the first form interaction.
    await page.waitForFunction(()=>globalThis.observedSDKEvents.some(event=>event.event==='survey shown'))
    await page.locator('#survey-fixture textarea').fill('Checkout worked')
    await page.locator('#survey-fixture [aria-label="Submit survey"]').click()
  }
  {
    await page.evaluate(()=>{globalThis.sdkUnderTest.set_config({disable_session_recording:false});globalThis.sdkUnderTest.startSessionRecording(true)})
    await page.waitForFunction(()=>globalThis.sdkUnderTest.sessionRecordingStarted(),{timeout:15000})
    await page.evaluate(()=>document.querySelector('#change').textContent='Replay mutation after start')
    await settle(2200)
  }
  const state=await page.evaluate(()=>({recording:globalThis.sdkUnderTest.sessionRecordingStarted(),id:globalThis.sdkUnderTest.get_distinct_id(),config:{autocapture:globalThis.sdkUnderTest.config.autocapture}}))
  await page.evaluate(()=>globalThis.sdkUnderTest.stopSessionRecording())
  await settle(100)
  const requests=received.slice(begin)
  writeFileSync(join(root,`reports/full-sdk/${surface}-${label}-requests.json`),JSON.stringify(requests,null,2)+'\n')
  const events=requests.flatMap(request=>Array.isArray(request.body)?request.body:Array.isArray(request.body?.batch)?request.body.batch:request.body?.event?[request.body]:[])
  assert.deepEqual(errors,[],`${label} browser errors`)
  assert.equal(result.api.sameSingleton,true);assert.equal(result.api.instance,true)
  assert.deepEqual(result.loaded,[true]);assert.equal(result.inputUnchanged,true)
  assert.equal(result.identity.id,'person-123');assert.equal(result.identity.first,'one')
  assert.deepEqual(result.feature,{enabled:true,disabled:false,variant:'blue',payload:{color:'blue'}})
  assert.deepEqual(result.consent,{out:true,blocked:true,in:true})
  if(surface==='full') {
    assert.equal(result.vitals.length,4)
    assert.ok(result.vitals.every(row=>row.metric==='FCP'&&row.valid))
    assert.ok(result.vitals.every(row=>row.attributed===row.name.includes('with-attribution')))
  }
  for(const name of ['checkout','identified checkout','after consent','$autocapture','$exception','browser journey complete'])assert.ok(events.some(event=>event.event===name),`${label}: missing ${name}; got ${events.map(event=>event.event)}`)
  assert.ok(!events.some(event=>['must not send','drop me'].includes(event.event)))
  const exception=events.find(event=>event.event==='$exception')
  assert.equal(exception.properties.$release_id,'release-fixture')
  assert.deepEqual(exception.properties.$exception_steps,[{$message:'checkout breadcrumb',$timestamp:'2026-10-03T00:00:00.000Z',cart:3,nested:{kept:true}}])
  assert.ok(exception.properties.$exception_list.some(error=>error.stacktrace?.frames.some(frame=>frame.chunk_id==='chunk-fixture')),'Injected chunk ID was not attached')
  if(surface==='full') {
    const survey=events.find(event=>event.event==='survey sent')
    assert.ok(survey,'Survey response did not reach the collector')
    assert.equal(survey.properties.$survey_id,'survey-fixture')
    assert.ok(Object.entries(survey.properties).some(([key,value])=>key.startsWith('$survey_response')&&value==='Checkout worked'),'Survey response changed')
  }
  assert.ok(!JSON.stringify(requests).includes('NEVER_CAPTURE_THIS_SECRET'))
  assert.ok(!JSON.stringify(requests).includes('STILL_PRIVATE'))
  const clicks=events.filter(event=>event.event==='$autocapture')
  assert.ok(!JSON.stringify(clicks).includes('Private'))
  {
    assert.equal(state.recording,true)
    assert.ok(events.some(event=>event.event==='$snapshot'),`${label}: replay emitted no snapshot`)
    const snapshots=decodeReplay(events.filter(event=>event.event==='$snapshot').flatMap(event=>event.properties.$snapshot_data))
    assert.ok(snapshots.some(event=>event.type===2&&event.data?.node),'Missing structured full DOM snapshot')
    assert.ok(snapshots.some(event=>event.type===3&&event.data?.source===0),'Missing incremental DOM mutation')
    assert.ok(JSON.stringify(snapshots).includes('Replay mutation after start'),'Recorder did not deliver the changed DOM text')
    assert.ok(!JSON.stringify(snapshots).includes('NEVER_CAPTURE_THIS_SECRET'),'Password leaked inside compressed replay data')
    assert.ok(!JSON.stringify(snapshots).includes('STILL_PRIVATE'),'Updated password leaked inside compressed replay data')
  }
  // Observer callbacks can queue different numbers of recorder events before a
  // click; validate the counter but compare the actual DOM snapshots separately.
  for(const event of events) {
    const count=event.properties?.$sdk_debug_replay_internal_buffer_length
    if(count!==undefined)assert.ok(Number.isInteger(count)&&count>=0)
  }
  // Concurrent HTTP requests may arrive in either order; capture callback order
  // is compared independently above. Keep every event and user property.
  const comparable=events.filter(event=>['checkout','identified checkout','after consent','$autocapture','$exception','browser journey complete','survey sent'].includes(event.event)).map(stable).sort((a,b)=>a.event.localeCompare(b.event))
  writeFileSync(join(root,`reports/full-sdk/${surface}-${label}-events.json`),JSON.stringify(comparable,null,2)+'\n')
  // Identity survives a fresh page + SDK instance, then reset clears it.
  await page.goto(origin+'/app')
  const persistence=await page.evaluate(async({file,origin})=>{
    const sdk=await import(origin+'/artifact/'+file)
    const ph=sdk.default
    ph.init('phc_local_parity_only',{api_host:origin,asset_host:origin,persistence:'localStorage',capture_pageview:false,capture_pageleave:false,autocapture:false,disable_session_recording:true,disable_surveys:true,advanced_disable_feature_flags:true,opt_out_useragent_filter:true,bootstrap:{featureFlags:{}}})
    const retained=ph.get_distinct_id()
    ph.reset()
    const reset=ph.get_distinct_id()!==retained
    const secondary=ph.init('phc_secondary_local',{api_host:origin,persistence:'memory',capture_pageview:false,autocapture:false,disable_session_recording:true,disable_surveys:true,advanced_disable_feature_flags:true,opt_out_useragent_filter:true},'secondary')
    secondary.identify('secondary-user')
    const isolated=ph.get_distinct_id()!=='secondary-user'&&secondary.get_distinct_id()==='secondary-user'
    return {retained,reset,isolated}
  },{file,origin})
  assert.deepEqual(persistence,{retained:'person-123',reset:true,isolated:true})
  if(surface==='full')assert.ok(!requests.some(request=>request.asset==='published recorder'),'Full SDK unexpectedly fetched a recorder')
  else assert.ok(requests.some(request=>request.asset==='published recorder'),'Standard SDK did not exercise the lazy recorder ABI')
  await context.close()
  return {label,surface,file,sha256:createHash('sha256').update(readFileSync(join(root,file))).digest('hex'),ok:true,result,persistence,events:comparable,eventNames:events.map(event=>event.event),requests:requests.map(({path,method})=>({path,method})),errors}
}

try{
  const selected=process.argv[2]
  for(const surface of ['standard','full']){
    if(selected&&selected!==surface)continue
    const row=benchmark.surfaces.find(row=>row.id===surface)
    const published=await journey('published',row.originals.find(item=>item.lane==='published').file,surface)
    for(const objective of row.objectives){
      const baseline=await journey('original-'+objective.objective,objective.baseline.file,surface)
      const candidate=await journey('lilscript-'+objective.objective,objective.artifact.file,surface)
      assert.deepEqual(candidate.result,baseline.result,`${surface}/${objective.objective}: public API state changed`)
      assert.deepEqual(candidate.events,baseline.events,`${surface}/${objective.objective}: captured event properties changed`)
      assert.deepEqual(candidate.result,published.result,`${surface}/${objective.objective}: published SDK API state changed`)
      assert.deepEqual(candidate.events,published.events,`${surface}/${objective.objective}: published SDK event properties changed`)
      output.push({surface,objective:objective.objective,upstreamVersion,published,baseline,candidate,ok:true})
      console.log(surface,objective.objective,'browser journey passed',candidate.eventNames)
    }
  }
}finally{
  writeFileSync(join(root,'reports/full-sdk/browser-journeys.json'),JSON.stringify(output,null,2)+'\n')
  await browser.close();server.close()
}
