// The showcase page in the react-markdownlil layout: hero and scoreboard, module pills (all seven,
// then each submodule), a live lab running both builds, three objectives measured separately
// (objective-comparison.js, unchanged), speed in Chromium, build time. Each module's data is a
// comparison.json in the ports' format; the first view is prerendered into the HTML.
//
//   node showcase/page/build.mjs [--results=…] [--perf=…] [--tests=…] [--reference=…] [--out=showcase/page/dist]
import {createHash} from 'node:crypto'
import {copyFileSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import os from 'node:os'
import {dirname,join,relative,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const here=join(root,'showcase/page')
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback
const read=path=>JSON.parse(readFileSync(resolve(root,path),'utf8'))
const meta=read('showcase/page/meta.json')
const results=read(arg('results','showcase/results.json'))
const perfPath=arg('perf',null), testsPath=arg('tests','reports/lil-sdk/g1-candidate/tests.json'), referencePath=arg('reference','reports/lil-sdk/g1-reference.json')
const tests=existsSync(resolve(root,testsPath))?read(testsPath):null
const reference=existsSync(resolve(root,referencePath))?read(referencePath):null
const benchmark=perfPath&&existsSync(resolve(root,perfPath))?read(perfPath):null
const out=resolve(root,arg('out','showcase/page/dist'))

const codecs=['raw','gzip','brotli'], metricKey={raw:'raw',gzip:'gzip9',brotli:'brotli11'}
const laneName={'terser-upstream':'PostHog’s build','esbuild':'esbuild','oxc':'Oxc (Rolldown)'}
const laneVersion={'terser-upstream':`Rolldown ${meta.versions.rolldown} + Terser ${meta.versions.terser}`,'esbuild':meta.versions.esbuild,'oxc':`Rolldown ${meta.versions.rolldown}`}
const n=x=>x.toLocaleString('en-US'), pct=(a,b)=>(a-b)/b*100
const signed=p=>`${p<0?'−':'+'}${Math.abs(p).toFixed(1)}%`
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c])
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex')
const sizes=s=>({raw:s.raw,gzip9:s.gzip,brotli11:s.brotli})

rmSync(out,{recursive:true,force:true});mkdirSync(join(out,'files'),{recursive:true})
const published={}
const file=(source,name)=>{const target=join(out,'files',name);mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);const href=`./files/${name}`;published[`files/${name}`]=sha(source);return {href,sha256:published[`files/${name}`]}}

// Behaviour, counted as the G1 gate counts it (see test/lil/g1-compare.mjs).
const testFiles={
  'error-tracking':['error-tracking/','posthog-exceptions.test'],'user-agent':['user-agent-utils.test'],'autocapture-utils':['autocapture-utils'],
  'feature-flags':['featureFlagUtils.spec','posthog.featureflags'],'metrics':['metrics/index.spec'],'uuidv7':['uuidv7.spec','test-uuid.test'],'gzip':['gzip.spec'],
}
const outcomes=report=>{const map=new Map();for(const f of report.testResults){const name=f.name.slice(f.name.indexOf('packages/'));for(const t of f.assertionResults)map.set(name+' :: '+t.fullName,t.status)}return map}
const candidateOutcomes=tests&&outcomes(tests), referenceOutcomes=reference&&outcomes(reference)
const testCounts=id=>{
  if(!candidateOutcomes||!referenceOutcomes)return null
  let gated=0,checks=0,neither=0;const files=new Set()
  for(const [key,status] of candidateOutcomes){const f=key.split(' :: ')[0];if(!testFiles[id].some(k=>f.includes(k)))continue;files.add(f)
    if(referenceOutcomes.get(key)==='passed'){gated++;if(status==='passed')checks++}else if(status!=='passed')neither++}
  return {checks,gated,neither,files:files.size}
}

// Browser timing: import and warm workload times, the shipped (Brotli) build against PostHog's.
const speedRows=id=>benchmark?benchmark.summary.filter(r=>r.module===id&&r.objective==='brotli'&&typeof r.posthogMedianMs==='number'&&['import','warm'].includes(r.metric)).map(r=>({
  module:meta.modules[id].name,name:r.metric==='import'?'import':r.workload,label:r.metric==='import'?'Import':r.workload,
  description:r.metric==='import'?'dynamic import from a fresh Blob URL: parse, compile, evaluate':meta.workloads?.[id]?.[r.workload]??'',
  posthogMs:r.posthogMedianMs,lilMs:r.lilMedianMs,improvementPercent:r.improvementPct,ci:r.ci95Pct,verdict:r.verdict})):[]

const machine={cpu:os.cpus()[0]?.model??'unknown',logicalCpus:os.cpus().length,memoryGiB:+(os.totalmem()/2**30).toFixed(1),os:`${os.type()} ${os.release()}`,node:process.version}
const exportsOf=path=>{const m=readFileSync(path,'utf8').match(/export\s*\{([^}]*)\}/g)??[];return m.flatMap(s=>s.slice(s.indexOf('{')+1,-1).split(',')).map(x=>x.trim().split(/\s+as\s+/).pop()).filter(Boolean).sort()}
const commonBuilds=id=>({
  measuredBy:'showcase/measure.mjs on branch lil/posthog-100 (one process, sequential, warm)',
  compiler:{revision:meta.compiler,binarySha256:meta.compilerSha256},
  lilscript:codecs.map(c=>({objective:c,command:['lilscript',`<${meta.modules[id]?.port??'port'}>`,'--config',`configs/lil/showcase-${c}.toml`,'--target','js-module','--jobs','1']})),
  upstream:{
    'terser-upstream':'Rolldown bundle (core marked side-effect free, as posthog-js’s rollup config), then Terser with posthog-js’s compress and mangle settings (private _ names mangled, its reserved list kept), ES2020',
    'esbuild':'esbuild bundle + minify, ES2020, browser platform','oxc':'Rolldown bundle with minify (Oxc), ES2020',
  },
  timing:'One warm run per build from source: bundling plus minifier for upstream lanes; the whole LilScript compilation on one thread. Installation and compression excluded.',
})

const modules=results.results.map(r=>{
  const id=r.id, info=meta.modules[id]
  const lanes=Object.fromEntries(Object.entries(r.upstream).map(([lane,s])=>[lane,{...s,link:file(s.file,`upstream/${lane}/${id}.mjs`)}]))
  const ours=Object.fromEntries(codecs.map(c=>[c,{...r.lilscript[c],link:file(r.lilscript[c].file,`lilscript/${c}/${id}.mjs`)}]))
  const wins=codecs.filter(c=>ours[c][c]<=r.best[c].bytes).length
  return {
    schemaVersion:4,id,name:'posthoglil',package:`posthog-js · ${info.name}`,title:info.name,tab:info.name,description:info.description,
    upstreamPath:info.upstream,portPath:info.port,measuredAt:results.date,compiler:{revision:meta.compiler,binarySha256:meta.compilerSha256},
    upstream:{package:'posthog-js',version:meta.upstreamVersion,commit:meta.upstreamCommit,external:[],sharedExports:exportsOf(ours.brotli.file),excludedExports:[]},
    scope:`${info.name}: ${info.upstream} bundled from posthog-js’s TypeScript with everything it imports; the LilScript port exports the same names and nothing is external.`,
    machine,
    objectives:codecs.map(c=>{const best=r.best[c].lane;return {objective:c,metric:metricKey[c],
      lilscript:{artifact:ours[c].link.href,sizes:sizes(ours[c]),sha256:ours[c].link.sha256,buildSeconds:ours[c].seconds,config:`configs/lil/showcase-${c}.toml`},
      original:{tool:laneName[best],version:laneVersion[best],artifact:lanes[best].link.href,sizes:sizes(lanes[best]),sha256:lanes[best].link.sha256,buildSeconds:lanes[best].seconds},
      ratio:ours[c][c]/r.best[c].bytes}}),
    minifiers:Object.entries(lanes).map(([lane,l])=>({tool:laneName[lane],version:laneVersion[lane],artifact:l.link.href,sizes:sizes(l),sha256:l.link.sha256,buildSeconds:l.seconds})),
    validation:testCounts(id),speed:speedRows(id),wins,cells:3,
    files:{posthog:lanes['terser-upstream'].link.href,lilscript:ours.brotli.link.href},
    linksBase:`./modules/${id}/`,builds:commonBuilds(id),
  }
})
const sum=f=>modules.reduce((a,m)=>a+f(m),0)
const totalSizes=pick=>({raw:sum(m=>pick(m,'raw')),gzip9:sum(m=>pick(m,'gzip')),brotli11:sum(m=>pick(m,'brotli'))})
const lilTotal=c=>sum(m=>m.objectives.find(o=>o.objective===c).lilscript.sizes[metricKey[c]])
const bestTotal=c=>sum(m=>m.objectives.find(o=>o.objective===c).original.sizes[metricKey[c]])
const testTotal=modules.reduce((a,m)=>m.validation?{checks:a.checks+m.validation.checks,gated:a.gated+m.validation.gated,neither:a.neither+m.validation.neither,files:a.files+m.validation.files}:a,{checks:0,gated:0,neither:0,files:0})
const all={
  schemaVersion:4,id:'all',name:'posthoglil',package:'posthog-js · seven submodules',title:'All seven submodules',tab:'All seven',
  description:'Totals of the seven submodules, each measured on its own. For each codec, a module’s original is its smallest upstream build (PostHog’s build, esbuild or Oxc); the LilScript side is the build compiled for that codec.',
  upstreamPath:'packages/{core,browser-common}/src/…',portPath:'src/posthog/…',measuredAt:results.date,compiler:modules[0].compiler,
  upstream:{package:'posthog-js',version:meta.upstreamVersion,commit:meta.upstreamCommit,external:[],sharedExports:[],excludedExports:[]},
  scope:'Seven submodules of posthog-js, each bundled from its TypeScript with everything it imports and compared on its own; the totals add them.',
  machine,
  objectives:codecs.map(c=>({objective:c,metric:metricKey[c],
    lilscript:{artifact:'./evidence.json',sizes:totalSizes((m,k)=>m.objectives.find(o=>o.objective===c).lilscript.sizes[metricKey[k]]),buildSeconds:+sum(m=>m.objectives.find(o=>o.objective===c).lilscript.buildSeconds).toFixed(2)},
    original:{tool:'smallest upstream per module',version:'',artifact:'./evidence.json',sizes:totalSizes((m,k)=>m.objectives.find(o=>o.objective===c).original.sizes[metricKey[k]]),buildSeconds:+sum(m=>m.objectives.find(o=>o.objective===c).original.buildSeconds).toFixed(3)},
    ratio:lilTotal(c)/bestTotal(c)})),
  minifiers:Object.keys(laneName).map(lane=>({tool:laneName[lane],version:laneVersion[lane],artifact:'./evidence.json',sizes:totalSizes((m,k)=>m.minifiers.find(x=>x.tool===laneName[lane]).sizes[metricKey[k]]),buildSeconds:+sum(m=>m.minifiers.find(x=>x.tool===laneName[lane]).buildSeconds).toFixed(3)})),
  validation:testTotal.gated?testTotal:null,speed:modules.flatMap(m=>m.speed),wins:sum(m=>m.wins),cells:modules.length*3,
  linksBase:'./modules/all/',builds:{...commonBuilds('all'),modules:modules.map(m=>m.id)},
}
mkdirSync(join(out,'modules'),{recursive:true})
for(const m of [all,...modules]){
  const {builds,...comparison}=m
  mkdirSync(join(out,'modules',m.id),{recursive:true})
  writeFileSync(join(out,'modules',m.id,'comparison.json'),JSON.stringify(comparison,null,1)+'\n')
  writeFileSync(join(out,'modules',m.id,'comparison-builds.json'),JSON.stringify(builds,null,1)+'\n')
}
writeFileSync(join(out,'modules/index.json'),JSON.stringify({modules:[all,...modules].map(m=>({id:m.id,tab:m.tab,title:m.title}))},null,1)+'\n')

// Prerender the first view with the same renderers the page runs.
const nodes={}
globalThis.document={querySelector:selector=>nodes[selector]??={innerHTML:''},getElementById:()=>null}
const {renderComparison}=await import(pathToFileURL(join(here,'objective-comparison.js')))
const {cardHtml,speedHtml}=await import(pathToFileURL(join(here,'views.js')))
const {builds:_,...allComparison}=all
renderComparison(allComparison)
const cells=all.wins, totalCells=all.cells
const totals=Object.fromEntries(codecs.map(c=>[c,{lil:lilTotal(c),posthog:sum(m=>m.minifiers.find(x=>x.tool==='PostHog’s build').sizes[metricKey[c]])}]))

const html=`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1" name="viewport"/>
<meta content="posthoglil: seven posthog-js ${esc(meta.upstreamVersion)} submodules rewritten in LilScript, each compared with PostHog’s own build of the same code — raw, gzip and Brotli objective builds, speed in Chromium, build times and a live lab." name="description"/>
<meta content="#f54e00" name="theme-color"/>
<title>itslil/posthog-js — seven posthog-js submodules through LilScript</title>
<link href="./styles.css" rel="stylesheet"/>
<link href="./objective-comparison.css" rel="stylesheet"/>
<script src="./app.js" type="module"></script>
</head>
<body>
<div aria-hidden="true" class="progress"></div>
<header class="nav shell">
<a aria-label="itslil/posthog-js home" class="wordmark" href="#top"><span class="mark">ph</span><span>itslil/posthog-js</span></a>
<nav aria-label="Main navigation">
<a href="#stack">modules</a>
<a href="#lab">playground</a>
<a href="#evidence">size</a>
<a href="#speed">speed</a>
<a href="#compiler">build time</a>
<a href="https://github.com/yeargun/posthoglil">GitHub ↗</a>
</nav>
</header>
<main id="top">
<section class="hero shell">
<div class="hero-copy">
<p class="eyebrow"><span class="live-dot"></span> posthog-js@${esc(meta.upstreamVersion)} · seven submodules · LilScript port</p>
<h1>PostHog,<br/><em>compiled.</em></h1>
<p class="lede">
            Seven submodules of <code>posthog-js@${esc(meta.upstreamVersion)}</code> rewritten in LilScript:
            exception capture, browser and device detection, autocapture utilities, feature-flag responses,
            the metrics client, UUIDv7 ids and request gzip. Each one is compared on its own with
            <code>PostHog’s own build</code> of the same code, and with esbuild and Oxc.
          </p>
<div class="hero-actions">
<a class="button primary" href="#stack">Compare modules</a>
<a class="button secondary" href="#lab">Playground</a>
</div>
</div>
<div aria-label="Compression results" class="scoreboard">
<div class="score-main">
<span class="score-label">LilScript versus the smallest of PostHog’s build, esbuild and Oxc · seven submodules</span>
<strong>${cells}/${totalCells}<span>cells smaller</span></strong>
<p>${n(totals.brotli.posthog)} B PostHog’s build → ${n(totals.brotli.lil)} B LilScript · Brotli-11, all seven</p>
</div>
<div class="score-grid">
${codecs.map(c=>`<div><strong>${Math.abs(pct(totals[c].lil,totals[c].posthog)).toFixed(1)}% smaller</strong><span>${c==='raw'?'raw':c==='gzip'?'gzip-9':'Brotli-11'} vs PostHog’s build, all seven</span></div>`).join('\n')}
<div><strong>${testTotal.gated?`${n(testTotal.checks)}/${n(testTotal.gated)}`:'—'}</strong><span>upstream tests passing on PostHog’s build pass on ours</span></div>
</div>
<p class="score-note">Raw, gzip and Brotli each use a separate LilScript compilation targeting that objective. Each submodule is compared on its own; the totals add the seven.</p>
</div>
</section>
<section aria-label="Rewritten submodules" class="ticker">
<div>${[...modules,...modules].map(m=>esc(m.title)).join(' <span>✦</span> ')}</div>
</section>
<section class="shell compare" id="stack">
<div class="section-heading">
<div>
<p class="eyebrow">Pick a module</p>
<h2>Size and speed,<br/>module by module.</h2>
</div>
<p>
            Each tab is one submodule; the first adds up all seven. Under it: the size of every build for
            raw, gzip and Brotli against PostHog’s own build, esbuild and Oxc, the speed in Chromium against
            PostHog’s build, the build time and the upstream tests — every measured file linked.
          </p>
</div>
<div class="compare-tabs"><div aria-label="Submodule" class="stack-tabs" id="stack-tabs" role="tablist">${[all,...modules].map((m,i)=>`<button type="button" role="tab" data-id="${m.id}" aria-selected="${i===0}">${esc(m.tab)}</button>`).join('')}</div></div>
<div id="stack-detail">${cardHtml(allComparison)}</div>
<div class="compare-block" id="evidence"><p class="eyebrow"><span data-module-label>${esc(all.title)}</span> · size</p><h3 class="compare-heading">Three objectives, measured separately.</h3><div id="compression-comparison">${nodes['#compression-comparison'].innerHTML}</div></div>
<div class="compare-block" id="speed"><p class="eyebrow"><span data-module-label>${esc(all.title)}</span> · speed · Chromium ${esc(String(benchmark?.environment?.browser??'').replace(/^chromium /,''))}</p><h3 class="compare-heading">Speed in the browser.</h3><div id="speed-root">${speedHtml(allComparison)}</div>
<p class="objective-note">Each sample is a fresh browser context on a local, cross-origin-isolated page; PostHog’s build and LilScript’s alternate in ABBA order, ${benchmark?.settings?.samples??''} samples per module. A time is the median of 15 repetitions after 5 untimed ones; the change is the median of the paired differences with a 95% bootstrap interval, and a verdict needs that interval to exclude zero. Both builds first run the same inputs and must give identical output. A control — PostHog’s build against an identical copy of itself — flagged ${benchmark?benchmark.summary.filter(r=>r.objective==='posthog-aa'&&r.verdict&&r.verdict!=='no clear difference').length:0} of ${benchmark?benchmark.summary.filter(r=>r.objective==='posthog-aa').length:0} rows, so changes of one or two percent are within noise. Import is slower where a module defines most of its functions as top-level arrows, which V8 parses more slowly in module code.</p></div>
<div class="compare-block" id="compiler"><p class="eyebrow"><span data-module-label>${esc(all.title)}</span> · same machine · sequential builds</p><h3 class="compare-heading">Build time.</h3><div id="objective-build-times">${nodes['#objective-build-times'].innerHTML}</div></div>
</section>
<section class="lab shell" id="lab">
<div class="section-heading">
<div>
<p class="eyebrow">The compiled runtime, in the browser</p>
<h2>Live<br/>lab.</h2>
</div>
<p>
            Left is the input. Right is what the selected build returns — LilScript’s or PostHog’s — and
            whether the other build returns the same. Both builds of the module load in this page.
          </p>
</div>
<div class="playground">
<div id="playground-root"><p class="lab-note">The lab runs with JavaScript enabled.</p></div>
</div>
</section>
<section class="closing shell">
<p class="eyebrow">posthog-js@${esc(meta.upstreamVersion)} · LilScript ${esc(meta.compiler)}</p>
<h2>Same behaviour.<br/>Smaller.</h2>
<div class="hero-actions" style="justify-content:center"><a class="button primary" href="#stack">See every module</a><a class="button secondary" href="./evidence.json">evidence.json ↗</a></div>
</section>
<p class="objective-note" style="padding:1rem 2rem">Not affiliated with PostHog. posthog-js is MIT-licensed; its license and notices ship with this site. Upstream tests are counted as the behaviour gate counts them: every test that passes against PostHog’s bundled, mangled build must pass against LilScript’s.</p>
</main>
<footer class="shell">
<span>itslil/posthog-js · MIT</span>
<span>posthog-js@${esc(meta.upstreamVersion)}, seven submodules rewritten in LilScript</span>
<a href="https://github.com/yeargun/posthoglil">source ↗</a>
</footer>
</body>
</html>
`
writeFileSync(join(out,'index.html'),html)
for(const f of ['styles.css','objective-comparison.css','objective-comparison.js','views.js','app.js','playground.js'])copyFileSync(join(here,f),join(out,f))
writeFileSync(join(out,'evidence.json'),JSON.stringify({generated:results.date,meta,results,files:published,perf:benchmark&&{date:benchmark.date,environment:benchmark.environment,settings:benchmark.settings,modules:Object.fromEntries(modules.map(m=>[m.id,{workloads:m.speed}]))},tests:{passed:testTotal.checks,gated:testTotal.gated,modules:Object.fromEntries(modules.map(m=>[m.id,m.validation&&{gated:m.validation.gated,passed:m.validation.checks,neither:m.validation.neither,files:m.validation.files}]))}},null,1)+'\n')
console.log(`wrote ${relative(root,join(out,'index.html'))}: ${cells}/${totalCells} cells won`)
