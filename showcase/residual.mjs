// How much of each group's gap is LilScript's output layer: PostHog's own Terser settings applied
// on top of LilScript's Brotli-objective build (a pass the compiler should not need).
import {minify} from 'terser'
import {readFileSync,writeFileSync} from 'node:fs'
import {sizes} from './measure.mjs'
const {results}=JSON.parse(readFileSync(new URL('./results.json',import.meta.url)))
const reserved=JSON.parse(readFileSync(new URL('../test/lil/g2/reserved.json',import.meta.url)))
const opts={module:true,toplevel:true,compress:{ecma:2020,passes:2,pure_getters:true,unsafe_methods:true,unsafe_comps:true,unsafe_math:true,unsafe_proto:true,unsafe_regexp:true},mangle:{reserved:['$'],properties:{regex:/^_(?!_)/,reserved}},format:{comments:false}}
const out=[]
let a=0,b=0,c=0
for(const r of results){
  const code=readFileSync(r.lilscript.brotli.file,'utf8')
  const t=sizes(Buffer.from((await minify(code,opts)).code))
  const ph=r.upstream['terser-upstream'].brotli
  out.push({id:r.id,lil:r.lilscript.brotli.brotli,lilPlusTerser:t.brotli,posthog:ph})
  a+=r.lilscript.brotli.brotli;b+=t.brotli;c+=ph
  console.log(r.id.padEnd(18),'lil',r.lilscript.brotli.brotli,'lil+terser',t.brotli,'posthog',ph,`gap ${((r.lilscript.brotli.brotli-ph)/ph*100).toFixed(1)}% -> ${((t.brotli-ph)/ph*100).toFixed(1)}%`)
}
console.log('TOTAL lil',a,'lil+terser',b,'posthog',c,`gap ${((a-c)/c*100).toFixed(1)}% -> ${((b-c)/c*100).toFixed(1)}%`)
writeFileSync(new URL('./residual.json',import.meta.url),JSON.stringify(out,null,1)+'\n')
