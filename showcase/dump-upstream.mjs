// Write PostHog's pipeline output (Rolldown + Terser with posthog-js's settings) for one group.
import {rolldown} from 'rolldown'
import {minify} from 'terser'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {groups} from './measure.mjs'
const root=new URL('..',import.meta.url).pathname, vendor=join(root,'vendor/posthog-js')
const aliases=[[/^@\/(.*)$/,'packages/core/src/$1'],[/^@posthog\/core\/surveys$/,'packages/core/src/surveys/index.ts'],[/^@posthog\/core$/,'packages/core/src/index.ts'],[/^@posthog\/types$/,'packages/types/src/index.ts'],[/^@posthog\/browser-common$/,'packages/browser-common/src/index.ts'],[/^@posthog\/browser-common\/(.*)$/,'packages/browser-common/src/$1.ts']]
const alias=id=>{for(const [re,t] of aliases)if(re.test(id))return join(vendor,id.replace(re,t));return null}
const reserved=JSON.parse(readFileSync(join(root,'test/lil/g2/reserved.json'),'utf8'))
for(const id of process.argv.slice(2)){
  const g=groups.find(x=>x.id===id)
  const b=await rolldown({input:g.upstream,platform:'browser',logLevel:'silent',tsconfig:false,treeshake:{moduleSideEffects:[{test:/\/packages\/core\/src\//,sideEffects:false}]},transform:{target:'es2020',assumptions:{setPublicClassFields:true},define:{__BROWSER_COMMON_VERSION__:'"0.9.1"'}},plugins:[{name:'a',async resolveId(i,imp){const p=alias(i);return p?this.resolve(p,imp,{skipSelf:true}):null}}]})
  const {output}=await b.generate({format:'esm'})
  const t=await minify(output[0].code,{module:true,toplevel:true,compress:{ecma:6,passes:2,pure_getters:true,unsafe_methods:true,unsafe_comps:true,unsafe_math:true,unsafe_proto:true,unsafe_regexp:true},mangle:{reserved:['$'],properties:{regex:/^_(?!_)/,reserved}},format:{comments:false}})
  mkdirSync(join(root,'showcase/out/posthog'),{recursive:true})
  writeFileSync(join(root,'showcase/out/posthog',id+'.mjs'),t.code)
  console.log(id,t.code.length)
}
