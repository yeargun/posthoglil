const $=selector=>document.querySelector(selector)
const bytes=n=>new Intl.NumberFormat('en-US').format(n)+' B'
const kb=n=>(n/1024).toFixed(1)+' KiB'
const seconds=n=>n.toFixed(n<1?3:2)+' s'
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const delta=n=>`<span class="${n>0?'positive':n<0?'negative':''}">${Math.abs(n).toFixed(2)}% ${n>0?'smaller':n<0?'larger':'same'}</span>`
const artifactUrl=file=>file.startsWith('artifacts/sdk/')?'./sdk/'+file.slice('artifacts/sdk/'.length):file.startsWith('dist/')?'./utilities/'+file.slice(5):'./utility-originals/'+file.slice('artifacts/utilities/'.length)
let surface='standard',sdk,utilities,performance,validation,pkg
async function json(path){const response=await fetch(path);if(!response.ok)throw Error(`Could not load ${path}`);return response.json()}
function drawSizes(){
  const current=sdk.surfaces.find(row=>row.id===surface)
  $('#scope').textContent=surface==='standard'?'Standard SDK: initial client JavaScript. Replay and other optional extensions load separately. The browser journey also exercises the published lazy recorder; its additional download is not included in this initial-bundle figure.':'Full / no external scripts: the upstream full/no-external feature set, including the recorder. No additional recorder script is needed. No product tours, conversations, toolbar or chat integrations are implied.'
  $('#sdk-sizes').innerHTML=current.objectives.map(row=>`<tr><td><a href="${artifactUrl(row.artifact.file)}">${row.objective==='brotli'?'Brotli-11':row.objective==='gzip'?'gzip-9':'Raw'}</a><small>separate ${row.objective} objective</small></td><td>${bytes(row.baseline[row.metric])}<small>${escape(row.baseline.lane)}</small></td><td>${bytes(row.artifact[row.metric])}<small>${escape(row.artifact.lane)} finish</small></td><td>${delta(row.savingsPercent)}</td><td>${seconds(row.originalBuildSeconds)}<small>matching source pipeline</small></td><td>${seconds(row.totalBuildSeconds)}</td></tr>`).join('')
  const artifacts=[...current.originals.map(row=>({...row,label:'Original · '+row.lane})),...current.objectives.map(row=>({...row.artifact,label:'LilScript · '+row.objective}))]
  $('#all-artifacts').innerHTML=artifacts.map(row=>`<tr><td><a href="${artifactUrl(row.file)}">${escape(row.label)}</a></td><td>${bytes(row.raw)}</td><td>${bytes(row.gzip9)}</td><td>${bytes(row.brotli11)}</td><td class="mono" title="${row.sha256}">${row.sha256.slice(0,16)}…</td></tr>`).join('')
  drawPerformance()
}
function drawPerformance(){
  const objective=$('#runtime-objective').value
  const row=performance.rows.find(row=>row.surface===surface&&row.objective===objective)
  const labels={importMs:'Module parse + evaluation',initMs:'Synchronous initialization',capture1000Ms:'Prepare + queue 1,000 events'}
  $('#performance').innerHTML=Object.entries(row.metrics).map(([key,m])=>`<article class="perf"><h3>${labels[key]}</h3><strong>${m.candidateMedianMs.toFixed(2)} ms</strong><p>Original ${m.originalMedianMs.toFixed(2)} ms · medians</p><p class="verdict-small">${escape(m.verdict)}</p><p>Paired improvement ${m.pairedImprovementPercent.toFixed(1)}%<br>95% interval: ${m.confidence95Percent.map(x=>x.toFixed(1)+'%').join(' to ')}</p></article>`).join('')
  $('#runtime-method').textContent=`${performance.samples} measured pairs and ${performance.warmupPairs} warmup pairs per build. Original/candidate order alternates; every sample uses a fresh browser context. Chromium ${performance.browser}. Positive paired improvement means faster. Recording, uploads and ingestion are outside these timings.`
}
function drawUtility(){
  const module=utilities.rows.find(row=>row.id===$('#utility-select').value)
  $('#utility-sizes').innerHTML=module.objectives.map(row=>`<tr><td><a href="${artifactUrl(row.artifact.file)}">${row.objective}</a></td><td>${bytes(row.baseline[row.metric])}<small>${escape(row.baseline.lane)}</small></td><td>${bytes(row.artifact[row.metric])}</td><td>${delta(row.savingsPercent)}</td><td>${seconds(row.originalBuildSeconds)}</td><td>${seconds(row.compilerSeconds)}</td></tr>`).join('')
}
async function initialize(){
  [sdk,utilities,performance,validation,pkg]=await Promise.all(['sdk','utilities','performance','validation','package'].map(name=>json('./evidence/'+name+'.json')))
  $('#pin').textContent='posthog-js '+sdk.upstream.version+' · checked '+sdk.generatedAt.slice(0,10)
  const headlines=sdk.surfaces.map(s=>({surface:s,...s.objectives.find(o=>o.objective==='brotli')}))
  const gains=headlines.every(row=>row.savingsPercent>0)
  $('#verdict').textContent=gains?'Both complete SDK builds are smaller in this Brotli comparison. Review the scope, runtime measurements and compatibility evidence below.':'The complete SDK candidate is larger than the best minified original today. It is an integration preview, not a demonstrated SDK size upgrade. Standalone utility results are separate.'
  $('#headline').innerHTML=headlines.map(row=>`<article class="metric"><h3>${escape(row.surface.label)} · Brotli-11</h3><span class="large">${kb(row.artifact.brotli11)}</span><span class="delta">${delta(row.savingsPercent)}</span><p>Minified original ${kb(row.baseline.brotli11)} · ${escape(row.baseline.lane)}<br>Whole SDK scope shown below; no extrapolation from utility results.</p></article>`).join('')
  const performanceSummary=['standard','full'].map(id=>{const row=performance.rows.find(row=>row.surface===id&&row.objective==='brotli');return `${id==='standard'?'Standard':'Full'}: capture processing ${row.metrics.capture1000Ms.verdict}; initialization ${row.metrics.initMs.verdict}.`}).join(' ')
  $('#hero-runtime').textContent='Runtime, Brotli builds — '+performanceSummary
  $('#download').href='./downloads/'+pkg.tarball
  $('#install').textContent=`# Download the preview tarball, then install under the existing name:\nnpm install posthog-js@file:./${pkg.tarball}\n\n# Experimental; not published to the npm registry.`
  $('#test-count').textContent=`${validation.upstreamTestsPerObjective} selected upstream tests × 3 objectives`
  $('#checks').innerHTML=validation.coverage.map(text=>`<li>${escape(text)}</li>`).join('')
  $('#provenance').textContent=`Upstream ${sdk.upstream.commit} · Compiler SHA-256 ${sdk.surfaces[0].objectives[0].compiler.sha256} · ${sdk.codec}. Rebuilding LilScript requires the matching compiler binary; validation and measurement scripts are public.`
  $('#utility-select').innerHTML=utilities.rows.map(row=>`<option value="${row.id}">${escape(row.label)}</option>`).join('')
  for(const button of document.querySelectorAll('[data-surface]'))button.addEventListener('click',()=>{
    surface=button.dataset.surface
    for(const item of document.querySelectorAll('[data-surface]'))item.setAttribute('aria-pressed',String(item===button))
    drawSizes()
  })
  $('#runtime-objective').addEventListener('change',drawPerformance)
  $('#utility-select').addEventListener('change',drawUtility)
  drawSizes();drawUtility()
}
let demo
async function captureDemo(kind){
  $('#demo-output').textContent='Loading the compiled full SDK…'
  try{
    if(!demo){
      const module=await import('./sdk/full/brotli.mjs');demo=module.default
      demo.init('phc_local_showcase_only',{api_host:location.origin,asset_host:location.origin,capture_pageview:false,capture_pageleave:false,autocapture:false,persistence:'memory',disable_session_recording:true,disable_surveys:true,disable_external_dependency_loading:true,advanced_disable_flags:true,opt_out_useragent_filter:true,bootstrap:{distinctID:'local-demo',isIdentifiedID:false,featureFlags:{}},before_send:event=>{
        if(!event)return null
        $('#demo-output').textContent=JSON.stringify({event:event.event,properties:event.properties},null,2)
        return null
      }})
    }
    if(kind==='error'){
      const error=new Error('Example checkout error');error.stack='Error: Example checkout error\n    at checkout (https://example.test/app.js:10:5)'
      demo.captureException(error)
    }else demo.capture('showcase.checkout',{plan:'pro',amount:29,_custom_property:'preserved'})
  }catch(error){$('#demo-output').textContent='Preview could not run: '+error.message}
}
$('#demo-capture').addEventListener('click',()=>captureDemo('event'))
$('#demo-error').addEventListener('click',()=>captureDemo('error'))
initialize().catch(error=>{$('#verdict').textContent='Measurements could not load. '+error.message;console.error(error)})
