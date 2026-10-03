const $=selector=>document.querySelector(selector)
const bytes=n=>new Intl.NumberFormat('en-US').format(n)+' B'
const kb=n=>(n/1024).toFixed(1)+' KiB'
const seconds=n=>n.toFixed(n<1?3:2)+' s'
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const delta=n=>`<span class="${n>0?'positive':n<0?'negative':''}">${Math.abs(n).toFixed(2)}% ${n>0?'smaller':n<0?'larger':'same'}</span>`
const compactDelta=n=>`<span class="${n>0?'positive':n<0?'negative':''}">${n>0?'−':n<0?'+':''}${Math.abs(n).toFixed(2)}%</span>`
const artifactUrl=file=>file.startsWith('artifacts/sdk/')?'./sdk/'+file.slice('artifacts/sdk/'.length):file.startsWith('artifacts/tree-shaking/')?'./tree-shaking/'+file.slice('artifacts/tree-shaking/'.length):file.startsWith('dist/')?'./utilities/'+file.slice(5):'./utility-originals/'+file.slice('artifacts/utilities/'.length)
let surface='standard',sdk,utilities,performance,validation,pkg,treeShaking
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
  const labels={importMs:'Module parse + evaluation',initMs:'Synchronous initialization',capture1000Ms:'Prepare + queue 1,000 events',exception100Ms:'Prepare + queue 100 exceptions'}
  $('#performance').innerHTML=Object.entries(row.metrics).map(([key,m])=>`<article class="perf"><h3>${labels[key]}</h3><strong>${m.candidateMedianMs.toFixed(2)} ms</strong><p>Original ${m.originalMedianMs.toFixed(2)} ms · medians</p><p class="verdict-small">${escape(m.verdict)}</p><p>Paired improvement ${m.pairedImprovementPercent.toFixed(1)}%<br>95% interval: ${m.confidence95Percent.map(x=>x.toFixed(1)+'%').join(' to ')}</p></article>`).join('')
  $('#runtime-method').textContent=`${performance.samples} measured pairs and ${performance.warmupPairs} warmup pairs per build. Original/candidate order alternates; every sample uses a fresh browser context. Chromium ${performance.browser}. Positive paired improvement means faster. Recording, uploads and ingestion are outside these timings.`
}
function drawUtility(){
  const module=utilities.rows.find(row=>row.id===$('#utility-select').value)
  $('#utility-sizes').innerHTML=module.objectives.map(row=>`<tr><td><a href="${artifactUrl(row.artifact.file)}">${row.objective}</a></td><td>${bytes(row.baseline[row.metric])}<small>${escape(row.baseline.lane)}</small></td><td>${bytes(row.artifact[row.metric])}</td><td>${delta(row.savingsPercent)}</td><td>${seconds(row.originalBuildSeconds)}</td><td>${seconds(row.compilerSeconds)}</td></tr>`).join('')
}
function drawTreeShaking(){
  const bundler=$('#consumer-bundler').value,objective=$('#consumer-objective').value
  $('#consumer-sizes').innerHTML=treeShaking.rows.filter(row=>row.bundler===bundler&&row.objective===objective).map(row=>`<tr><td><code>${escape(row.name)}</code><small>${escape(row.id)}</small></td><td><a href="${artifactUrl(row.baseline.file)}">${bytes(row.baseline[row.metric])}</a></td><td><a href="${artifactUrl(row.artifact.file)}">${bytes(row.artifact[row.metric])}</a></td><td>${delta(row.savingsPercent)}</td></tr>`).join('')
}
async function initialize(){
  [sdk,utilities,performance,validation,pkg,treeShaking]=await Promise.all(['sdk','utilities','performance','validation','package','tree-shaking'].map(name=>json('./evidence/'+name+'.json')))
  $('#pin').textContent='posthog-js '+sdk.upstream.version+' · checked '+sdk.generatedAt.slice(0,10)
  const all=sdk.surfaces.flatMap(row=>row.objectives)
  const gains=all.filter(row=>row.savingsPercent>0).length
  const publishedGains=all.filter(row=>row.publishedSavingsPercent>0).length
  $('#verdict').textContent=`${publishedGains===6?'All six':publishedGains+' of six'} builds are smaller than the exact published PostHog package. Gains include bundling and minification. Against the original source with the same optimizations, ${gains===6?'all six':gains+' of six'} builds are smaller by the margins shown above.`
  $('#headline').innerHTML=sdk.surfaces.map(row=>`<article class="metric"><h3>${escape(row.label)} · exact npm comparison</h3><div class="table-scroll"><table><thead><tr><th>Format</th><th>Original</th><th>Candidate</th><th>Change</th></tr></thead><tbody>${row.objectives.map(item=>`<tr><td>${item.objective==='brotli'?'Brotli-11':item.objective==='gzip'?'gzip-9':'Raw'}</td><td>${kb(item.publishedOriginal[item.metric])}</td><td>${kb(item.artifact[item.metric])}</td><td>${compactDelta(item.publishedSavingsPercent)}</td></tr>`).join('')}</tbody></table></div><p>Each row uses its own compilation objective. ${row.id==='standard'?'Initial client; optional extension downloads are additional.':'Includes replay and the upstream full/no-external feature set.'}</p><p>Stronger original controls: ${row.objectives.map(item=>`${item.objective} ${delta(item.savingsPercent)}`).join(' · ')}.</p></article>`).join('')
  const performanceSummary=['standard','full'].map(id=>{
    const m=performance.rows.find(row=>row.surface===id&&row.objective==='brotli').metrics.exception100Ms
    const result=m.verdict==='no clear difference'?m.verdict:`${Math.abs(m.pairedImprovementPercent).toFixed(1)}% ${m.pairedImprovementPercent>0?'faster':'slower'}`
    return `${id==='standard'?'Standard':'Full'}: ${result}.`
  }).join(' ')
  const otherWorkloadsUnclear=performance.rows.every(row=>['importMs','initMs','capture1000Ms'].every(key=>row.metrics[key].verdict==='no clear difference'))
  const workloadNames={importMs:'module import',initMs:'initialization',capture1000Ms:'event preparation',exception100Ms:'exception preparation'}
  const slower=performance.rows.flatMap(row=>Object.entries(row.metrics).filter(([,metric])=>metric.verdict==='slower in this workload').map(([name])=>`${row.surface} / ${row.objective} / ${workloadNames[name]}`))
  $('#hero-runtime').textContent='100-exception workload, Brotli builds — '+performanceSummary+' Paired estimates against the optimized original; intervals below.'+(otherWorkloadsUnclear?' Module import, initialization and ordinary event capture show no clear difference.':'')+(slower.length?' Slower paired results in this run: '+slower.join('; ')+'.':'')
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
  $('#consumer-bundler').addEventListener('change',drawTreeShaking)
  $('#consumer-objective').addEventListener('change',drawTreeShaking)
  drawSizes();drawUtility();drawTreeShaking()
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
