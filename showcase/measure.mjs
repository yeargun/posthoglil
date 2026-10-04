// Size of PostHog submodules: upstream's TypeScript built by today's best minifiers versus the
// typed LilScript port compiled by LilScript. Both sides export the same names and contain every
// line of code those exports need (shared helpers included); nothing is external.
//
//   upstream lanes (best per codec is the bar):
//     terser-upstream  esbuild bundle → Terser with posthog-js's own rollup settings, including its
//                      private-name mangling (/^_(?!_)/ minus rollup.config.mjs's reserved list)
//     esbuild          esbuild bundle + minify
//     oxc              Rolldown bundle + Oxc minify
//   lilscript lanes: one whole-program compilation per objective (configs/lil/showcase-*.toml)
//
//   node showcase/measure.mjs [group,...]   → showcase/results.json
import {build} from 'esbuild'
import {rolldown} from 'rolldown'
import {minify} from 'terser'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {gzipSync,brotliCompressSync,constants as z} from 'node:zlib'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const vendor=join(root,'vendor/posthog-js')
const compiler=process.env.LILSCRIPT_COMPILER??join(process.env.HOME,'lilscript-work/bin/posthog100/lilscript')
const V=p=>join(vendor,'packages',p), S=p=>join(root,'src/posthog',p)

export const groups=[
  {id:'error-tracking',title:'Exception capture pipeline',upstream:join(root,'showcase/entries/error-tracking.ts'),lil:join(root,'showcase/entries/error-tracking.lil')},
  {id:'user-agent',title:'Browser, OS and device detection',upstream:V('core/src/utils/user-agent-utils.ts'),lil:S('core/utils/user-agent-utils.lil')},
  {id:'autocapture-utils',title:'Autocapture DOM utilities',upstream:V('browser-common/src/utils/autocapture-utils.ts'),lil:S('browser-common/utils/autocapture-utils.lil')},
  {id:'feature-flags',title:'Feature flag response utilities',upstream:V('core/src/featureFlagUtils.ts'),lil:S('core/featureFlagUtils.lil')},
  {id:'metrics',title:'Metrics client (OTLP)',upstream:V('core/src/metrics/index.ts'),lil:S('core/metrics/index.lil')},
  {id:'uuidv7',title:'UUIDv7 event and session IDs',upstream:V('browser-common/src/utils/uuidv7.ts'),lil:S('browser-common/utils/uuidv7.lil')},
  {id:'gzip',title:'Request gzip compression',upstream:V('core/src/gzip.ts'),lil:S('core/gzip.lil')},
]

export const sizes=buf=>({raw:buf.length,gzip:gzipSync(buf,{level:9}).length,brotli:brotliCompressSync(buf,{params:{[z.BROTLI_PARAM_QUALITY]:11,[z.BROTLI_PARAM_LGWIN]:22,[z.BROTLI_PARAM_SIZE_HINT]:buf.length}}).length})

const aliases=[[/^@\/(.*)$/,'packages/core/src/$1'],[/^@posthog\/core\/surveys$/,'packages/core/src/surveys/index.ts'],[/^@posthog\/core$/,'packages/core/src/index.ts'],[/^@posthog\/types$/,'packages/types/src/index.ts'],[/^@posthog\/browser-common$/,'packages/browser-common/src/index.ts'],[/^@posthog\/browser-common\/(.*)$/,'packages/browser-common/src/$1.ts']]
const alias=id=>{for(const [re,t] of aliases)if(re.test(id))return join(vendor,id.replace(re,t));return null}
const esbuildAliases={name:'posthog-aliases',setup(b){
  b.onResolve({filter:/package\.json$/},()=>({path:'pkg',namespace:'pkg'}))
  b.onLoad({filter:/.*/,namespace:'pkg'},()=>({contents:'export default {version:"1.435.8"}',loader:'js'}))
  b.onResolve({filter:/.*/},async a=>{if(a.pluginData==='x')return;const p=alias(a.path);if(!p)return;return b.resolve(p,{resolveDir:a.resolveDir,kind:a.kind,pluginData:'x'})})
}}
const tsconfigRaw={compilerOptions:{useDefineForClassFields:false}}
const reserved=JSON.parse(readFileSync(join(root,'test/lil/g2/reserved.json'),'utf8'))
const upstreamTerser={module:true,toplevel:true,compress:{ecma:6,passes:2,pure_getters:true,unsafe_methods:true,unsafe_comps:true,unsafe_math:true,unsafe_proto:true,unsafe_regexp:true},
  mangle:{reserved:['$'],properties:{regex:/^_(?!_)/,reserved}},format:{comments:false}}

async function esbuildBundle(entry,minify=false){
  const r=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'browser',target:'es2020',minify,
    plugins:[esbuildAliases],tsconfigRaw,define:{__BROWSER_COMMON_VERSION__:'"0.9.1"'},logLevel:'error',absWorkingDir:root})
  return r.outputFiles[0].text
}
async function rolldownBundle(entry,minify){
  const bundle=await rolldown({input:entry,platform:'browser',logLevel:'silent',tsconfig:false,
    // as posthog-js's rollup.config.mjs: @posthog/core is a pure utility package
    treeshake:{moduleSideEffects:[{test:/\/packages\/core\/src\//,sideEffects:false}]},
    transform:{target:'es2020',assumptions:{setPublicClassFields:true},define:{__BROWSER_COMMON_VERSION__:'"0.9.1"'}},
    plugins:[{name:'posthog-aliases',async resolveId(id,importer){const p=alias(id);return p?this.resolve(p,importer,{skipSelf:true}):null}}]})
  const {output}=await bundle.generate({format:'esm',minify})
  return output[0].code
}
const oxcBundle=entry=>rolldownBundle(entry,true)
function lilscript(entry,objective){
  const out=join(root,'showcase/out',objective,entry.split('/').pop().replace(/\.lil$/,'.mjs'))
  mkdirSync(dirname(out),{recursive:true})
  const started=performance.now()
  const run=spawnSync(compiler,[entry,'--config',join(root,`configs/lil/showcase-${objective}.toml`),'--target','js-module','--jobs','1','-o',out],{encoding:'utf8',maxBuffer:64<<20,env:{...process.env,RAYON_NUM_THREADS:'1'}})
  if(run.status!==0)throw Error(run.stderr||run.stdout)
  const code=readFileSync(out,'utf8')
  if(/from\s*["']@upstream\//.test(code))throw Error(`${entry} still imports upstream code`)
  return {file:out,seconds:+((performance.now()-started)/1000).toFixed(2),...sizes(Buffer.from(code))}
}

export async function measure(group){
  // PostHog's own pipeline: Rolldown (core side-effect free) + Terser with posthog-js's settings
  // Each lane is timed from source: bundling plus its minifier (warm process, no output writes).
  const timed=async f=>{const t=performance.now();const text=await f();return {text,seconds:+((performance.now()-t)/1000).toFixed(3)}}
  const lanes={}
  const code={
    'terser-upstream':await timed(async()=>(await minify(await rolldownBundle(group.upstream,false),upstreamTerser)).code),
    'esbuild':await timed(()=>esbuildBundle(group.upstream,true)),
    'oxc':await timed(()=>oxcBundle(group.upstream)),
  }
  for(const [lane,{text,seconds}] of Object.entries(code)){
    // Every measured upstream file is kept, so each published number can be checked.
    const file=join(root,'showcase/out/lanes',lane,group.id+'.mjs')
    mkdirSync(dirname(file),{recursive:true});writeFileSync(file,text)
    lanes[lane]={file,seconds,...sizes(Buffer.from(text))}
  }
  const best={}
  for(const codec of ['raw','gzip','brotli']){
    const [lane,s]=Object.entries(lanes).reduce((a,b)=>b[1][codec]<a[1][codec]?b:a)
    best[codec]={lane,bytes:s[codec]}
  }
  const lil={}
  for(const objective of ['raw','gzip','brotli'])lil[objective]=lilscript(group.lil,objective)
  const result={id:group.id,title:group.title,upstream:lanes,best,lilscript:lil,
    delta:Object.fromEntries(['raw','gzip','brotli'].map(c=>[c,+((lil[c][c]-best[c].bytes)/best[c].bytes*100).toFixed(2)]))}
  return result
}

if(import.meta.url===`file://${process.argv[1]}`){
  const want=process.argv[2]?.split(',')
  const results=[]
  for(const group of groups.filter(g=>!want||want.includes(g.id))){
    const r=await measure(group)
    results.push(r)
    const f=c=>`${r.lilscript[c][c]} vs ${r.best[c].bytes} (${r.best[c].lane}) ${r.delta[c]>0?'+':''}${r.delta[c]}%`
    console.log(`${r.id.padEnd(18)} raw ${f('raw')} | gzip ${f('gzip')} | brotli ${f('brotli')}`)
  }
  writeFileSync(join(root,'showcase/results.json'),JSON.stringify({compiler,date:new Date().toISOString(),results},null,1)+'\n')
}
