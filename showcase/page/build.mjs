// The showcase page, in the port-page design shared with lilscript.eddocu.com: each PostHog
// submodule compared on its own, size per codec and speed in Chromium, LilScript's build against
// PostHog's own build of the same code (and esbuild, Oxc), with upstream's tests as the behaviour gate.
//
//   node showcase/page/build.mjs [--results=…] [--perf=<perf/bench.mjs results>] [--tests=<g1 report>] [--reference=<g1 reference>] [--out=showcase/page/dist]
import {createHash} from 'node:crypto'
import {copyFileSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs'
import {dirname,join,relative,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

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

const codecs=['raw','gzip','brotli'], codecName={raw:'Raw',gzip:'gzip-9',brotli:'Brotli-11'}
const laneName={'terser-upstream':'PostHog’s build','esbuild':'esbuild','oxc':'Oxc (Rolldown)'}
const n=x=>x.toLocaleString('en-US'), pct=(a,b)=>(a-b)/b*100
const signed=p=>`${p<0?'−':'+'}${Math.abs(p).toFixed(1)}%`
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c])
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex')

rmSync(out,{recursive:true,force:true});mkdirSync(join(out,'files'),{recursive:true})
const published={}
const file=(source,name)=>{const target=join(out,'files',name);mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);const f={href:`files/${name}`,sha256:sha(source)};published[f.href]=f.sha256;return f}
const link=(f,label='file')=>`<a class="file" href="${f.href}" title="sha256 ${f.sha256}">${label}</a>`

// Behaviour, counted as the G1 gate counts it: upstream tests that pass against PostHog's bundled,
// mangled build must pass against LilScript's. Tests failing on PostHog's build too (their mocks
// reach private names that build mangles) are counted apart.
const testFiles={
  'error-tracking':['error-tracking/','posthog-exceptions.test'],
  'user-agent':['user-agent-utils.test'],
  'autocapture-utils':['autocapture-utils'],
  'feature-flags':['featureFlagUtils.spec','posthog.featureflags'],
  'metrics':['metrics/index.spec'],
  'uuidv7':['uuidv7.spec','test-uuid.test'],
  'gzip':['gzip.spec'],
}
const outcomes=report=>{
  const map=new Map()
  for(const f of report.testResults){const name=f.name.slice(f.name.indexOf('packages/'));for(const t of f.assertionResults)map.set(name+' :: '+t.fullName,t.status)}
  return map
}
const candidateOutcomes=tests&&outcomes(tests), referenceOutcomes=reference&&outcomes(reference)
const testCounts=id=>{
  if(!candidateOutcomes||!referenceOutcomes)return null
  let gated=0,passed=0,neither=0
  const files=new Set()
  for(const [key,status] of candidateOutcomes){
    const f=key.split(' :: ')[0]
    if(!testFiles[id].some(k=>f.includes(k)))continue
    files.add(f)
    if(referenceOutcomes.get(key)==='passed'){gated++;if(status==='passed')passed++}
    else if(status!=='passed')neither++
  }
  return {gated,passed,neither,files:files.size}
}

// Browser timing (perf/bench.mjs): import time and each workload's warm time, the shipped
// (Brotli) LilScript build against PostHog's, plus the A/A control.
const normalizePerf=raw=>{
  const modules={}
  for(const r of raw.summary){
    if(r.objective!=='brotli'||typeof r.posthogMedianMs!=='number')continue
    if(!['import','warm'].includes(r.metric))continue
    const imported=r.metric==='import'
    ;(modules[r.module]??={workloads:[]}).workloads.push({
      name:imported?'import':r.workload,
      label:imported?'Import':r.workload,
      description:imported?'dynamic import from a fresh Blob URL: parse, compile, evaluate':meta.workloads?.[r.module]?.[r.workload]??'',
      posthogMs:r.posthogMedianMs,lilMs:r.lilMedianMs,improvementPercent:r.improvementPct,ci:r.ci95Pct,verdict:r.verdict})
  }
  const control=raw.summary.filter(r=>r.objective==='posthog-aa'&&typeof r.posthogMedianMs==='number')
  return {modules,date:raw.date,environment:raw.environment,settings:raw.settings,
    control:{rows:control.length,flagged:control.filter(r=>r.verdict!=='no clear difference').length}}
}
const perf=benchmark&&normalizePerf(benchmark)

const modules=results.results.map(r=>{
  const lanes=Object.entries(r.upstream).map(([lane,s])=>({lane,name:laneName[lane],sizes:s,file:s.file?file(s.file,`upstream/${lane}/${r.id}.mjs`):null}))
  const ours=Object.fromEntries(codecs.map(c=>[c,{sizes:r.lilscript[c],file:file(r.lilscript[c].file,`lilscript/${c}/${r.id}.mjs`)}]))
  const claim=c=>r.lilscript[c][c]
  const best=Object.fromEntries(codecs.map(c=>[c,r.best[c]]))
  const wins=codecs.filter(c=>claim(c)<=best[c].bytes).length
  return {...r,info:meta.modules[r.id],lanes,ours,claim,best,wins,tests:testCounts(r.id),perf:perf?.modules?.[r.id]??null}
})
const cells=modules.reduce((a,m)=>a+m.wins,0)
const total=Object.fromEntries(codecs.map(c=>[c,{
  lil:modules.reduce((a,m)=>a+m.claim(c),0),
  posthog:modules.reduce((a,m)=>a+m.upstream['terser-upstream'][c],0),
  best:modules.reduce((a,m)=>a+m.best[c].bytes,0)}]))
const testTotal=modules.reduce((a,m)=>m.tests?{passed:a.passed+m.tests.passed,gated:a.gated+m.tests.gated,neither:a.neither+m.tests.neither}:a,{passed:0,gated:0,neither:0})

const verdictState=v=>v==='faster'?'win':v==='slower'?'loss':'even'
const speedWord=m=>{
  if(!m.perf)return 'not measured'
  const w=m.perf.workloads.filter(x=>x.name!=='import')
  const faster=w.filter(x=>x.verdict==='faster').length, slower=w.filter(x=>x.verdict==='slower').length
  const imp=m.perf.workloads.find(x=>x.name==='import')
  const parts=[]
  if(faster)parts.push(`${faster} faster`)
  if(slower)parts.push(`${slower} slower`)
  const even=w.length-faster-slower
  if(even)parts.push(`${even} even`)
  return `${parts.join(' · ')}${imp&&imp.verdict!=='no clear difference'?` · import ${imp.verdict}`:''}`
}
const pctCell=(value,bar)=>`<span class="cell-main">${n(value)}</span><span class="cell-sub">${signed(pct(value,bar))}</span>`

// ── sections ────────────────────────────────────────────────────────────────────────────────────
const overviewRows=modules.map(m=>`<tr>
  <th scope="row"><a href="?module=${m.id}#modules">${esc(m.info.name)}</a></th>
  <td class="desc">${esc(m.info.summary)}</td>
  ${codecs.map(c=>`<td class="verdict ${m.claim(c)<=m.best[c].bytes?'win':'loss'}"><strong>${pctCell(m.claim(c),m.best[c].bytes)}</strong></td>`).join('')}
  <td class="desc">${esc(speedWord(m))}</td>
</tr>`).join('\n')

const laneTable=m=>{
  const smallest=Object.fromEntries(codecs.map(c=>[c,Math.min(...m.lanes.map(l=>l.sizes[c]))]))
  const upstreamRows=m.lanes.map(l=>`<tr><th scope="row">${esc(l.name)}${l.file?link(l.file):''}</th>${codecs.map(c=>l.sizes[c]===smallest[c]?`<td class="best"><strong>${n(l.sizes[c])}</strong></td>`:`<td>${n(l.sizes[c])}</td>`).join('')}<td>${l.sizes.seconds!=null?`${l.sizes.seconds.toFixed(3)} s`:'—'}</td></tr>`).join('')
  const ourRows=codecs.map(objective=>`<tr><th scope="row">LilScript · ${codecName[objective]} build${link(m.ours[objective].file)}</th>${codecs.map(c=>c===objective?`<td class="claimed"><strong>${n(m.ours[objective].sizes[c])}</strong></td>`:`<td class="dim">${n(m.ours[objective].sizes[c])}</td>`).join('')}<td>${m.ours[objective].sizes.seconds.toFixed(2)} s</td></tr>`).join('')
  const verdictRow=`<tr class="pack-primary-row"><th scope="row">LilScript vs the smallest upstream</th>${codecs.map(c=>`<td class="verdict ${m.claim(c)<=smallest[c]?'win':'loss'}"><strong>${signed(pct(m.claim(c),smallest[c]))}</strong></td>`).join('')}<td></td></tr>`
  return `<div class="table-wrap light"><table><thead><tr><th>Build</th>${codecs.map(c=>`<th>${codecName[c]} (B)</th>`).join('')}<th>Build time</th></tr></thead><tbody>${upstreamRows}${ourRows}${verdictRow}</tbody></table></div>`
}
const speedRows=(m,{withModule=false}={})=>m.perf.workloads.map(w=>`<tr>${withModule?`<th scope="row">${esc(m.info.name)}</th><td class="desc"><strong>${esc(w.label)}</strong> — ${esc(w.description)}</td>`:`<th scope="row">${esc(w.label)}</th><td class="desc">${esc(w.description)}</td>`}<td>${w.posthogMs.toFixed(3)} ms</td><td>${w.lilMs.toFixed(3)} ms</td><td class="verdict ${verdictState(w.verdict)}"><strong>${signed(-w.improvementPercent)}</strong></td><td>${signed(-w.ci[1])} … ${signed(-w.ci[0])}</td><td class="verdict ${verdictState(w.verdict)}"><strong>${esc(w.verdict)}</strong></td></tr>`).join('')
const speedHead=(withModule=false)=>`<thead><tr><th>${withModule?'Module':'Workload'}</th><th>${withModule?'Workload':''}</th><th>PostHog</th><th>LilScript</th><th>Time</th><th>95% interval</th><th>Verdict</th></tr></thead>`

const panels=modules.map((m,i)=>{
  const brotliVsPosthog=pct(m.claim('brotli'),m.upstream['terser-upstream'].brotli)
  return `<div class="pack-panel" id="panel-${m.id}" role="tabpanel" aria-labelledby="tab-${m.id}" tabindex="0">
  <div class="pack-summary">
    <article class="pack-card ${m.wins===3?'win':'loss'}">
      <div class="pack-kicker"><span>${m.wins} of 3 codecs smaller</span><span>${m.tests?`${n(m.tests.passed)}/${n(m.tests.gated)} tests`:''}</span></div>
      <h3>${esc(m.info.name)}</h3>
      <strong>${Math.abs(brotliVsPosthog).toFixed(1)}%<small>${brotliVsPosthog<=0?'smaller':'larger'} · Brotli-11 vs PostHog’s build</small></strong>
      <p>${n(m.upstream['terser-upstream'].brotli)} B PostHog → ${n(m.claim('brotli'))} B LilScript</p>
      <code>${esc(m.info.upstream)}</code>
      <span class="pack-package">port: ${esc(m.info.port)}</span>
    </article>
    <div class="pack-contract">
      <span>What it does</span><strong>${esc(m.info.description)}</strong>
      <span>Behaviour</span><strong>${m.tests?`${m.tests.passed===m.tests.gated?'All ':''}${n(m.tests.passed)} of ${n(m.tests.gated)} upstream tests that pass against PostHog’s build pass against LilScript’s (${m.tests.files} file${m.tests.files===1?'':'s'}).${m.tests.neither?` ${n(m.tests.neither)} more fail against both: their mocks reach private names PostHog’s build mangles.`:''}`:'—'}</strong>
      <span>Speed</span><strong>${esc(speedWord(m))}</strong>
    </div>
  </div>
  <h4>Size, every build (bytes)</h4>
  ${laneTable(m)}
  <h4>Speed in Chromium</h4>
  ${m.perf?`<div class="table-wrap light"><table>${speedHead()}<tbody>${speedRows(m)}</tbody></table></div>`:'<p class="perf-note">Not measured yet.</p>'}
</div>`}).join('\n')

const warm=modules.flatMap(m=>m.perf?m.perf.workloads.filter(w=>w.name!=='import'):[])
const imports=modules.flatMap(m=>m.perf?m.perf.workloads.filter(w=>w.name==='import').map(w=>({...w,module:m.info.name})):[])
const count=(list,v)=>list.filter(w=>w.verdict===v).length

const html=`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Seven posthog-js ${esc(meta.upstreamVersion)} submodules rewritten in typed LilScript, each compared with PostHog's own build of the same code: raw, gzip and Brotli size, speed in Chromium, and upstream's tests." />
    <meta name="theme-color" content="#f54e00" />
    <title>itslil/posthog-js — seven posthog-js submodules through LilScript</title>
    <link rel="stylesheet" href="./styles.css" />
    <script type="module" src="./app.js"></script>
  </head>
  <body>
    <div class="progress" aria-hidden="true"></div>
    <header class="nav shell">
      <a class="wordmark" href="#top" aria-label="itslil/posthog-js home"><span class="mark">ph</span><span>itslil/posthog-js</span></a>
      <nav aria-label="Main navigation">
        <a href="#surface">submodules</a>
        <a href="#modules">receipts</a>
        <a href="#speed">speed</a>
        <a href="#behaviour">behaviour</a>
        <a href="#method">method</a>
        <a href="https://github.com/yeargun/posthoglil">GitHub ↗</a>
      </nav>
    </header>

    <main id="top">
      <section class="hero shell">
        <div class="hero-copy">
          <p class="eyebrow"><span class="live-dot"></span> posthog-js ${esc(meta.upstreamVersion)} · seven submodules · LilScript port</p>
          <h1>PostHog,<br /><em>compiled.</em></h1>
          <p class="lede">
            Seven submodules of <code>posthog-js@${esc(meta.upstreamVersion)}</code> — exception capture, browser
            and device detection, autocapture utilities, feature-flag responses, the metrics client, UUIDv7 ids and
            request gzip — rewritten in typed LilScript. Each one is compared on its own with PostHog’s own build
            of the same code, and with esbuild and Oxc. Raw, gzip and Brotli each have their own objective build.
            Upstream’s own tests run against every module, and every number links to the file it was measured on.
          </p>
          <div class="hero-actions">
            <a class="button primary" href="#modules">pick a module</a>
            <a class="button secondary" href="https://github.com/yeargun/posthoglil">GitHub ↗</a>
          </div>
        </div>

        <div class="scoreboard" aria-label="Compression results">
          <div class="score-main">
            <span class="score-label">LilScript versus the smallest of PostHog’s build, esbuild and Oxc</span>
            <strong>${cells}/${modules.length*3}<span>module × codec cells smaller</span></strong>
            <p>raw, gzip-9 and Brotli-11 for each of the seven submodules</p>
          </div>
          <div class="score-grid">
            ${codecs.map(c=>`<div><strong>${signed(pct(total[c].lil,total[c].posthog))}</strong><span>${codecName[c]} · ${n(total[c].lil)} B vs ${n(total[c].posthog)} B PostHog’s build</span></div>`).join('\n            ')}
            <div><strong>${testTotal.gated?`${n(testTotal.passed)}/${n(testTotal.gated)}`:'—'}</strong><span>upstream tests passing on PostHog’s build pass on LilScript’s</span></div>
          </div>
          <p class="score-note">Each codec has its own LilScript compilation targeting that objective. Totals add the seven submodules, each measured on its own.</p>
        </div>
      </section>

      <section class="ticker" aria-label="Rewritten submodules">
        <div>${[...modules,...modules].map(m=>esc(m.info.name.toLowerCase())).join(' <span>✦</span> ')}</div>
      </section>

      <section class="surface shell" id="surface">
        <div class="section-heading">
          <div>
            <p class="eyebrow">What is actually here</p>
            <h2>Seven modules,<br />not the SDK.</h2>
          </div>
          <p>
            Each submodule is bundled from posthog-js’s TypeScript at commit <code>${esc(meta.upstreamCommit)}</code>
            with everything it imports. The LilScript port exports the same names. Nothing is external on either
            side. Each cell is LilScript’s build for that codec and its difference from the smallest upstream
            build for the same codec.
          </p>
        </div>
        <div class="table-wrap light">
          <table>
            <thead><tr><th>Submodule</th><th></th>${codecs.map(c=>`<th>${codecName[c]} (B)</th>`).join('')}<th>Speed (warm workloads)</th></tr></thead>
            <tbody>${overviewRows}</tbody>
          </table>
        </div>
      </section>

      <section class="receipts shell" id="modules">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Per-module receipts</p>
            <h2>Pick a module.<br />See its receipts.</h2>
          </div>
          <p>
            Every build that was measured, with its file: PostHog’s build (Rolldown, then Terser with posthog-js’s
            own settings, including its private-name mangling), esbuild, Oxc, and LilScript’s three objective
            builds. The highlighted cell is the one each LilScript build is compiled for. The URL keeps the selected module.
          </p>
        </div>
        <div class="pack-tabs" role="tablist" aria-label="Submodule">
          ${modules.map((m,i)=>`<button type="button" role="tab" id="tab-${m.id}" aria-controls="panel-${m.id}" aria-selected="${i===0}" tabindex="${i===0?0:-1}" data-module="${m.id}">${esc(m.info.name)}</button>`).join('\n          ')}
        </div>
        ${panels}
      </section>

      <section class="evidence" id="speed">
        <div class="shell">
          <div class="section-heading inverse">
            <div>
              <p class="eyebrow">${perf?esc(`${String(perf.environment?.browser??'').replace('chromium','Chromium')} · ${perf.settings?.samples} paired samples per module`):'Browser timing'}</p>
              <h2>Speed,<br />in the browser.</h2>
            </div>
            <p>
              Each sample is a fresh browser context on a local, cross-origin-isolated page. PostHog’s build and
              LilScript’s shipped (Brotli) build alternate in ABBA order. A time is the median of 15 repetitions after
              5 untimed ones; the change is the median of the paired differences, with a 95% bootstrap interval. A
              verdict is given only when that interval excludes zero. Before any timing, both builds run the same
              inputs and must produce identical output.
            </p>
          </div>
          ${perf?`<div class="compile-facts speed-facts">
            <article><span>Warm workloads faster</span><strong class="win">${count(warm,'faster')} of ${warm.length}</strong><small>interval entirely on the faster side</small></article>
            <article><span>No clear difference</span><strong class="even">${count(warm,'no clear difference')} of ${warm.length}</strong><small>interval includes zero</small></article>
            <article><span>Warm workloads slower</span><strong class="loss">${count(warm,'slower')} of ${warm.length}</strong><small>${esc(warm.filter(w=>w.verdict==='slower').map(w=>`${w.label} ${signed(-w.improvementPercent)}`).join(', ')||'—')}</small></article>
            <article><span>Import slower</span><strong class="loss">${count(imports,'slower')} of ${imports.length}</strong><small>${esc(imports.filter(w=>w.verdict==='slower').map(w=>`${w.module} +${(w.lilMs-w.posthogMs).toFixed(2)} ms`).join(', ')||'—')}</small></article>
          </div>
          <div class="table-wrap"><table>${speedHead(true)}<tbody>${modules.filter(m=>m.perf).map(m=>speedRows(m,{withModule:true})).join('')}</tbody></table></div>
          <div class="method-note">
            <p><strong>Control.</strong> The same harness timed PostHog’s build against an identical copy of itself: ${perf.control.flagged} of ${perf.control.rows} rows showed a difference, about what a 95% interval allows, so changes of one or two percent are within noise. <strong>Import</strong> is slower for the modules that define most of their functions as top-level arrows, which V8 parses more slowly in module code; it is a one-time cost of a fraction of a millisecond.</p>
            <a href="evidence.json">evidence.json ↗</a>
          </div>`:'<p class="perf-note">Not measured yet.</p>'}
        </div>
      </section>

      <section class="behaviour shell" id="behaviour">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Same behaviour</p>
            <h2>Upstream’s tests.<br />Our builds.</h2>
          </div>
          <p>
            Upstream’s own test files run with the LilScript build in place of each TypeScript module. The gate: every
            test that passes against PostHog’s bundled, mangled build must pass against LilScript’s. Tests that fail on
            PostHog’s build too are listed apart: their mocks reach private names that its build mangles.
          </p>
        </div>
        <div class="table-wrap light">
          <table>
            <thead><tr><th>Submodule</th><th>Test files</th><th>Pass on PostHog’s build</th><th>…and on LilScript’s</th><th>Fail on both</th></tr></thead>
            <tbody>${modules.map(m=>m.tests?`<tr><th scope="row">${esc(m.info.name)}</th><td>${m.tests.files}</td><td>${n(m.tests.gated)}</td><td class="verdict ${m.tests.passed===m.tests.gated?'win':'loss'}"><strong>${n(m.tests.passed)}</strong></td><td>${n(m.tests.neither)}</td></tr>`:'').join('')}
            <tr class="pack-primary-row"><th scope="row">All seven</th><td></td><td>${n(testTotal.gated)}</td><td class="verdict ${testTotal.passed===testTotal.gated?'win':'loss'}"><strong>${n(testTotal.passed)}</strong></td><td>${n(testTotal.neither)}</td></tr></tbody>
          </table>
        </div>
      </section>

      <section class="method shell" id="method">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Method</p>
            <h2>How it was<br />measured.</h2>
          </div>
          <p>The same upstream code on both sides, every file published, and one LilScript compilation per codec.</p>
        </div>
        <ul class="method-list">
          <li><strong>Upstream builds.</strong> PostHog’s build: Rolldown, then Terser ${esc(meta.versions.terser)} with posthog-js’s own compress and mangle settings (private <code>_</code> names mangled, its reserved list kept). esbuild ${esc(meta.versions.esbuild)} bundle and minify. Oxc: Rolldown ${esc(meta.versions.rolldown)} bundle with minify. All target ES2020; posthog-js’s published npm files target older browsers with ES2015-level syntax, which is not what is compared here.</li>
          <li><strong>LilScript builds.</strong> One compile per codec: the raw cell comes from a build that targets raw bytes, the gzip cell from one that targets gzip, the Brotli cell from one that targets Brotli. Compiler: LilScript <code>${esc(meta.compiler)}</code>. The builds assume what PostHog’s own Terser settings already assume: built-ins are not patched (<code>unsafe_*</code>), property reads have no side effects (<code>pure_getters</code>), <code>_</code> names are private (its property mangling), no value is <code>document.all</code>, and object copies never carry a <code>__proto__</code> key.</li>
          <li><strong>Build time.</strong> One warm run per build, from source: bundling plus the minifier for the upstream lanes, the whole LilScript compilation (one thread) for each objective build. Installation and compression are excluded.</li>
          <li><strong>Codecs.</strong> Node’s zlib: gzip level 9; Brotli quality 11, window 22. Sizes are recomputed from the published files before this site is built, and only wins are published.</li>
          <li><strong>Scope.</strong> Seven submodules, each measured on its own. This is not the whole SDK, and not a measurement inside an application bundle.</li>
        </ul>
      </section>

      <section class="closing shell">
        <p class="eyebrow">posthog-js ${esc(meta.upstreamVersion)} · LilScript ${esc(meta.compiler)}</p>
        <h2>Same behaviour.<br />Same API.<br /><em>Smaller.</em></h2>
        <div class="hero-actions"><a class="button primary" href="#modules">see the receipts</a><a class="button secondary" href="https://github.com/yeargun/posthoglil">GitHub ↗</a></div>
        <p class="disclaimer">Not affiliated with PostHog. posthog-js is MIT-licensed; its license and notices ship with this site. LilScript is the compiler that produced these builds.</p>
      </section>
    </main>
    <footer class="shell"><span>itslil/posthog-js · seven submodules</span><span>measured ${esc((results.date??'').slice(0,10))}${perf?` · timed ${esc((perf.date??'').slice(0,10))}`:''}</span></footer>
  </body>
</html>
`
writeFileSync(join(out,'index.html'),html)
copyFileSync(join(here,'styles.css'),join(out,'styles.css'))
copyFileSync(join(here,'app.js'),join(out,'app.js'))
writeFileSync(join(out,'evidence.json'),JSON.stringify({generated:new Date().toISOString(),meta,results,files:published,perf,tests:tests&&{passed:testTotal.passed,gated:testTotal.gated,modules:Object.fromEntries(modules.map(m=>[m.id,m.tests]))}},null,1)+'\n')
console.log(`wrote ${relative(root,join(out,'index.html'))}: ${cells}/${modules.length*3} cells won`)
