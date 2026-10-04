// The showcase page: each PostHog submodule compared on its own, size per codec and speed in a
// browser, LilScript's build against PostHog's own build of the same code (and esbuild, Oxc).
//
//   node showcase/page/build.mjs [--results=showcase/results.json] [--perf=<perf results>] [--tests=<g1 report>] [--out=showcase/page/dist]
import {createHash} from 'node:crypto'
import {copyFileSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {basename,dirname,join,relative,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback
const meta=JSON.parse(readFileSync(join(root,'showcase/page/meta.json'),'utf8'))
const results=JSON.parse(readFileSync(resolve(root,arg('results','showcase/results.json')),'utf8'))
const perfPath=arg('perf',null), testsPath=arg('tests','reports/lil-sdk/g1-candidate/tests.json'), referencePath=arg('reference','reports/lil-sdk/g1-reference.json')
// Browser timing from perf/bench.mjs: per module, its import time and each workload's warm time
// (median of timed repetitions per fresh context), LilScript's shipped (Brotli) build vs PostHog's.
const benchmark=perfPath&&existsSync(resolve(root,perfPath))?JSON.parse(readFileSync(resolve(root,perfPath),'utf8')):null
const perf=benchmark&&normalizePerf(benchmark)
function normalizePerf(raw){
  const modules={}
  for(const r of raw.summary){
    if((r.objective!=='brotli'&&r.objective!==undefined)||typeof r.posthogMedianMs!=='number')continue
    if(r.metric&&!['import','warm','steady','timed'].includes(r.metric))continue
    const name=r.workload==='import'||r.metric==='import'?'Import (parse and evaluate)':r.workload
    ;(modules[r.module]??={workloads:[]}).workloads.push({name,posthogMs:r.posthogMedianMs,lilMs:r.lilMedianMs,improvementPercent:r.improvementPct,ci:r.ci95Pct,verdict:r.verdict,description:name.startsWith('Import')?'dynamic import of the module from a fresh Blob URL: parse, compile, evaluate':meta.workloads?.[r.module]?.[r.workload]??''})
  }
  const env=raw.environment??{}
  return {modules,date:raw.date,environment:env,settings:raw.settings,
    method:`Chromium ${String(env.browser??'').replace(/^chromium /,'')} (headless) on ${env.cpu??'this host'}. Each sample is a fresh browser context on a local cross-origin-isolated page; PostHog’s build and LilScript’s alternate in ABBA order, ${raw.settings?.samples??''} samples per module. Times are medians; the change is the median of paired differences with a 95% bootstrap interval, and a verdict is given only when that interval excludes zero. Both builds first run the same inputs and must produce identical output.`}
}
const tests=existsSync(resolve(root,testsPath))?JSON.parse(readFileSync(resolve(root,testsPath),'utf8')):null
const reference=existsSync(resolve(root,referencePath))?JSON.parse(readFileSync(resolve(root,referencePath),'utf8')):null
const out=resolve(root,arg('out','showcase/page/dist'))

const codecs=['raw','gzip','brotli'], codecName={raw:'Raw',gzip:'Gzip',brotli:'Brotli'}
const laneName={'terser-upstream':'PostHog’s build','esbuild':'esbuild','oxc':'Oxc (Rolldown)'}
const n=x=>x.toLocaleString('en-US'), pct=(a,b)=>(a-b)/b*100
const signed=p=>`${p<0?'−':'+'}${Math.abs(p).toFixed(1)}%`
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c])
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex')

rmSync(out,{recursive:true,force:true});mkdirSync(join(out,'files'),{recursive:true})
const file=(source,name)=>{const target=join(out,'files',name);mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);return {href:`files/${name}`,sha256:sha(source)}}

// Upstream tests per submodule: the files that exercise it, from the behaviour gate's report.
const testFiles={
  'error-tracking':['error-tracking/','posthog-exceptions.test'],
  'user-agent':['user-agent-utils.test'],
  'autocapture-utils':['autocapture-utils'],
  'feature-flags':['featureFlagUtils.spec','posthog.featureflags'],
  'metrics':['metrics/index.spec'],
  'uuidv7':['uuidv7.spec','test-uuid.test'],
  'gzip':['gzip.spec'],
}
// The gate's count: upstream tests that pass against PostHog's own bundled, mangled build must
// pass against LilScript's. Tests failing on PostHog's build too (their mocks reach private names
// that build mangles) are counted apart.
const outcomes=report=>{
  const map=new Map()
  for(const f of report.testResults){const name=f.name.slice(f.name.indexOf('packages/'));for(const t of f.assertionResults)map.set(name+' :: '+t.fullName,t.status)}
  return map
}
const candidateOutcomes=tests&&outcomes(tests), referenceOutcomes=reference&&outcomes(reference)
const testCounts=id=>{
  if(!candidateOutcomes||!referenceOutcomes)return null
  let gated=0,passed=0,neither=0,files=new Set()
  for(const [key,status] of candidateOutcomes){
    const file=key.split(' :: ')[0]
    if(!testFiles[id].some(k=>file.includes(k)))continue
    files.add(file)
    if(referenceOutcomes.get(key)==='passed'){gated++;if(status==='passed')passed++}
    else if(status!=='passed')neither++
  }
  return {gated,passed,neither,files:files.size}
}

const modules=results.results.map(r=>{
  const m=meta.modules[r.id]
  const lanes=Object.entries(r.upstream).map(([lane,s])=>({lane,name:laneName[lane],sizes:s,file:s.file?file(s.file,`upstream/${lane}/${r.id}.mjs`):null}))
  const ours=Object.fromEntries(codecs.map(c=>[c,{bytes:r.lilscript[c][c],seconds:r.lilscript[c].seconds,file:file(r.lilscript[c].file,`lilscript/${c}/${r.id}.mjs`),all:r.lilscript[c]}]))
  const best=Object.fromEntries(codecs.map(c=>[c,r.best[c]]))
  const wins=codecs.filter(c=>ours[c].bytes<=best[c].bytes).length
  return {...r,meta:m,lanes,ours,best,wins,tests:testCounts(r.id),perf:perf?.modules?.[r.id]??null}
})
const cells=modules.reduce((a,m)=>a+m.wins,0)
const total=Object.fromEntries(codecs.map(c=>{
  const lil=modules.reduce((a,m)=>a+m.ours[c].bytes,0), posthog=modules.reduce((a,m)=>a+m.upstream['terser-upstream'][c],0), best=modules.reduce((a,m)=>a+m.best[c].bytes,0)
  return [c,{lil,posthog,best}]
}))
const testTotal=modules.reduce((a,m)=>m.tests?{passed:a.passed+m.tests.passed,total:a.total+m.tests.gated}:a,{passed:0,total:0})

const verdictClass={faster:'good','no clear difference':'even',slower:'bad'}
const speedSummary=m=>{
  if(!m.perf)return '<span class="muted">not measured yet</span>'
  const rows=m.perf.workloads
  const faster=rows.filter(w=>w.verdict==='faster').length, slower=rows.filter(w=>w.verdict==='slower').length
  return slower?`<span class="bad">${slower} of ${rows.length} slower</span>`:faster?`<span class="good">${faster} of ${rows.length} faster</span>, rest even`:'<span class="even">no clear difference</span>'
}

const sizeCell=(m,c)=>{
  const ours=m.ours[c].bytes,b=m.best[c]
  return `<td><strong>${n(ours)}</strong><span class="delta ${ours<=b.bytes?'good':'bad'}">${signed(pct(ours,b.bytes))}</span><span class="vs">vs ${n(b.bytes)} ${esc(laneName[b.lane])}</span></td>`
}

const overview=modules.map(m=>`<tr>
  <th scope="row"><a href="#${m.id}">${esc(m.meta.name)}</a><span class="sub">${esc(m.meta.summary)}</span></th>
  ${codecs.map(c=>sizeCell(m,c)).join('')}
  <td>${speedSummary(m)}</td>
</tr>`).join('\n')

const laneTable=m=>{
  const smallest=Object.fromEntries(codecs.map(c=>[c,Math.min(...m.lanes.map(l=>l.sizes[c]))]))
  const rows=m.lanes.map(l=>`<tr><th scope="row">${esc(l.name)}${l.file?` <a class="file" href="${l.file.href}" title="sha256 ${l.file.sha256}">file</a>`:''}</th>${codecs.map(c=>`<td class="${l.sizes[c]===smallest[c]?'bar':''}">${n(l.sizes[c])}</td>`).join('')}</tr>`).join('')
  const ourRow=`<tr class="ours"><th scope="row">LilScript, one build per column${codecs.map(c=>` <a class="file" href="${m.ours[c].file.href}" title="sha256 ${m.ours[c].file.sha256}">${c}</a>`).join('')}</th>${codecs.map(c=>`<td><strong>${n(m.ours[c].bytes)}</strong> <span class="delta ${m.ours[c].bytes<=smallest[c]?'good':'bad'}">${signed(pct(m.ours[c].bytes,smallest[c]))}</span></td>`).join('')}</tr>`
  return `<table class="lanes"><thead><tr><th>Build</th>${codecs.map(c=>`<th>${codecName[c]} (bytes)</th>`).join('')}</tr></thead><tbody>${rows}${ourRow}</tbody></table>`
}

const speedTable=m=>{
  if(!m.perf)return '<p class="muted">Browser timing for this module has not been measured yet.</p>'
  const rows=m.perf.workloads.map(w=>`<tr><th scope="row">${esc(w.name)}<span class="sub">${esc(w.description??'')}</span></th><td>${w.posthogMs.toFixed(3)} ms</td><td>${w.lilMs.toFixed(3)} ms</td><td class="${verdictClass[w.verdict]??''}">${signed(-w.improvementPercent)} <span class="vs">95% CI ${signed(-w.ci[1])} to ${signed(-w.ci[0])}</span></td><td class="${verdictClass[w.verdict]??''}">${esc(w.verdict)}</td></tr>`).join('')
  return `<table class="speed"><thead><tr><th>Workload</th><th>PostHog’s build</th><th>LilScript</th><th>Time change</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table>`
}

const details=modules.map(m=>`<section class="module" id="${m.id}">
  <header><h3>${esc(m.meta.name)}</h3><p>${esc(m.meta.description)}</p>
  <p class="paths">Upstream <code>${esc(m.meta.upstream)}</code> · port <code>${esc(m.meta.port)}</code></p></header>
  <h4>Size</h4>${laneTable(m)}
  <h4>Speed in Chromium</h4>${speedTable(m)}
  <h4>Behaviour</h4><p>${m.tests?`${m.tests.passed===m.tests.gated?'All':''} ${n(m.tests.passed)} of ${n(m.tests.gated)} upstream tests that pass against PostHog’s own build pass against the LilScript build (${m.tests.files} test file${m.tests.files===1?'':'s'} that exercise${m.tests.files===1?'s':''} this module).${m.tests.neither?` ${n(m.tests.neither)} more fail against both builds: their mocks reach private names that PostHog’s build mangles.`:''}`:'Upstream tests: see the gate below.'}</p>
</section>`).join('\n')

const html=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PostHog × LilScript</title>
<meta name="description" content="Seven posthog-js submodules rewritten in typed LilScript, each compared with PostHog's own build of the same code: size in raw, gzip and Brotli, and speed in a browser.">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<main>
<header class="hero">
  <p class="eyebrow">posthog-js ${esc(meta.upstreamVersion)} · seven submodules · LilScript</p>
  <h1>Same behaviour. Same API. <em>Smaller.</em></h1>
  <p class="lede">We rewrote seven submodules of posthog-js in typed LilScript and compiled them with the LilScript compiler. Each one is compared, on its own, with PostHog’s own build of the same code: Rolldown and Terser with the settings from posthog-js’s rollup config, including its private-name mangling. Each is also compared with esbuild and with Oxc, the minifier inside Rolldown. Every number on this page comes from the files linked next to it.</p>
  <div class="score">
    <div class="big"><strong>${cells} of ${modules.length*3}</strong><span>module × codec comparisons won against the smallest of PostHog’s build, esbuild and Oxc</span></div>
    ${codecs.map(c=>`<div><strong>${signed(pct(total[c].lil,total[c].posthog))}</strong><span>${codecName[c]}: ${n(total[c].lil)} bytes vs ${n(total[c].posthog)} for PostHog’s build, all seven together</span></div>`).join('')}
    <div><strong>${testTotal.total?`${n(testTotal.passed)} / ${n(testTotal.total)}`:'—'}</strong><span>upstream tests that pass against PostHog’s own build of these modules, passing against LilScript’s</span></div>
  </div>
</header>

<section>
<h2>The seven submodules</h2>
<p>Each size cell is the LilScript build for that codec, and its difference from the <em>smallest</em> upstream build for the same codec.</p>
<div class="scroll"><table class="overview"><thead><tr><th>Submodule</th>${codecs.map(c=>`<th>${codecName[c]}</th>`).join('')}<th>Speed</th></tr></thead><tbody>
${overview}
</tbody></table></div>
</section>

<section>
<h2>Module by module</h2>
${details}
</section>

<section class="method">
<h2>How this was measured</h2>
<ul>
<li><strong>Same code on both sides.</strong> The upstream side is posthog-js ${esc(meta.upstreamVersion)} (commit <code>${esc(meta.upstreamCommit)}</code>), each submodule bundled from its TypeScript source with everything it imports. The LilScript side is a typed port that exports the same names. Nothing on either side is external.</li>
<li><strong>Upstream builds.</strong> PostHog’s build: Rolldown, then Terser ${esc(meta.versions.terser)} with posthog-js’s own compress and mangle settings (private <code>_</code> names mangled, its reserved list kept). esbuild ${esc(meta.versions.esbuild)} bundle and minify. Oxc: Rolldown ${esc(meta.versions.rolldown)} bundle with minify. All target ES2020. PostHog’s published npm files target older browsers with ES2015-level syntax; that is not what is compared here.</li>
<li><strong>LilScript builds.</strong> One compile per codec column: the raw column comes from a build that targets raw bytes, the gzip column from one that targets gzip, the Brotli column from one that targets Brotli. Compiler: LilScript ${esc(meta.compiler)}. The builds assume what PostHog’s own Terser settings already assume: built-ins are not patched (<code>unsafe_*</code>), property reads have no side effects (<code>pure_getters</code>), <code>_</code> names are private (its property mangling), no value is <code>document.all</code>, and object copies never carry a <code>__proto__</code> key.</li>
<li><strong>Codecs.</strong> Node’s zlib: gzip level 9; Brotli quality 11, window 22.</li>
<li><strong>Behaviour.</strong> Upstream’s own test files run against the LilScript builds in place of the TypeScript modules. The gate: every upstream test that passes against PostHog’s bundled, mangled reference must pass against the LilScript build. ${tests&&reference?`This run: ${n(testTotal.passed)} of ${n(testTotal.total)} gated tests for these seven modules passed.`:''}</li>
<li><strong>Speed.</strong> ${perf?esc(perf.method):'Not measured yet.'}</li>
<li><strong>Scope.</strong> These are submodules measured on their own, not the whole SDK.</li>
</ul>
<p class="muted">Generated ${esc(new Date().toISOString().slice(0,10))} from <code>showcase/results.json</code>${perf?' and the browser timing results':''}.</p>
</section>
</main>
</body>
</html>
`
writeFileSync(join(out,'index.html'),html)
copyFileSync(join(root,'showcase/page/styles.css'),join(out,'styles.css'))
writeFileSync(join(out,'evidence.json'),JSON.stringify({generated:new Date().toISOString(),meta,results,perf,tests:tests&&{passed:tests.numPassedTests,total:tests.numTotalTests,modules:Object.fromEntries(modules.map(m=>[m.id,m.tests]))}},null,1)+'\n')
console.log(`wrote ${relative(root,join(out,'index.html'))}: ${cells}/${modules.length*3} cells won`)
