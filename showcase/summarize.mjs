// Summary of showcase/results.json and the per-group upstream test counts.
import {readFileSync,writeFileSync} from 'node:fs'
const {results}=JSON.parse(readFileSync(new URL('./results.json',import.meta.url)))
const tests=JSON.parse(readFileSync(new URL('./tests-showcase.json',import.meta.url)))
const groupTests={
  'error-tracking':['error-tracking/','posthog-exceptions.test'],
  'user-agent':['user-agent-utils.test'],
  'autocapture-utils':['autocapture-utils'],
  'feature-flags':['featureFlagUtils.spec','posthog.featureflags'],
  'metrics':['metrics/index.spec'],
  'uuidv7':['uuidv7.spec','test-uuid.test'],
  'gzip':['gzip.spec'],
}
const counts={}
for(const [id,keys] of Object.entries(groupTests)){
  let n=0,files=0
  for(const f of tests.testResults){if(keys.some(k=>f.name.includes(k))){files++;n+=f.assertionResults.filter(t=>t.status==='passed').length}}
  counts[id]={files,passed:n}
}
const pct=(a,b)=>((a-b)/b*100)
const rows=results.map(r=>{
  const out={id:r.id,title:r.title,tests:counts[r.id]}
  for(const c of ['raw','gzip','brotli']){
    out[c]={lil:r.lilscript[c][c],posthogBuild:r.upstream['terser-upstream'][c],best:r.best[c].bytes,bestLane:r.best[c].lane,
      vsPosthog:+pct(r.lilscript[c][c],r.upstream['terser-upstream'][c]).toFixed(1),vsBest:+pct(r.lilscript[c][c],r.best[c].bytes).toFixed(1)}
  }
  return out
})
const total={}
for(const c of ['raw','gzip','brotli']){
  const lil=rows.reduce((a,r)=>a+r[c].lil,0),ph=rows.reduce((a,r)=>a+r[c].posthogBuild,0),best=rows.reduce((a,r)=>a+r[c].best,0)
  total[c]={lil,posthogBuild:ph,best,vsPosthog:+pct(lil,ph).toFixed(1),vsBest:+pct(lil,best).toFixed(1)}
}
writeFileSync(new URL('./summary.json',import.meta.url),JSON.stringify({rows,total},null,1)+'\n')
for(const r of rows)console.log(r.id.padEnd(18),`tests ${r.tests.passed}/${r.tests.files}f`,['raw','gzip','brotli'].map(c=>`${c} ${r[c].lil} (vs PostHog build ${r[c].vsPosthog>0?'+':''}${r[c].vsPosthog}%, vs best ${r[c].vsBest>0?'+':''}${r[c].vsBest}%)`).join(' | '))
console.log('TOTAL',['raw','gzip','brotli'].map(c=>`${c} ${total[c].lil} vs PostHog ${total[c].posthogBuild} (${total[c].vsPosthog}%) vs best ${total[c].best} (${total[c].vsBest}%)`).join(' | '))
