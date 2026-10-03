// G1 substitution builds: each module of an upstream entry graph is replaced by one entry file
// of a split build, so upstream's own test files run against a bundled implementation.
//
//   node test/lil/g1-build.mjs reference [--entry=module.es.ts]
//     upstream's source, esbuild split build, then upstream's npm private-name mangling
//     (terser, /^_(?!_)/ minus the reserved list in rollup.config.mjs). A test that passes
//     here depends only on what the published build exposes.
//   node test/lil/g1-build.mjs candidate --manifest=<lilscript.manifest.json> --entries=<entries.json>
//     the LilScript split build (one compiler entry per ported module); entries.json maps
//     upstream module paths (relative to vendor/posthog-js) to compiler entry names.
//
// Writes reports/lil-sdk/g1-<mode>/map.json: absolute upstream path -> stub module that
// re-exports the substituted implementation.
import {build} from 'esbuild'
import {minify} from 'terser'
import {mkdirSync,readFileSync,rmSync,writeFileSync,existsSync,readdirSync} from 'node:fs'
import {dirname,join,relative,resolve} from 'node:path'
import {root,vendor} from '../../scripts/sdk-source.mjs'

const mode=process.argv[2]
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback
const entry=arg('entry','module.es.ts')
const out=join(root,'reports/lil-sdk',`g1-${mode}`)

const aliases=[
  [/^@\/(.*)$/,'packages/core/src/$1'],
  [/^@posthog\/core\/surveys$/,'packages/core/src/surveys/index.ts'],
  [/^@posthog\/core$/,'packages/core/src/index.ts'],
  [/^@posthog\/types$/,'packages/types/src/index.ts'],
  [/^@posthog\/browser-common$/,'packages/browser-common/src/index.ts'],
  [/^@posthog\/browser-common\/(.*)$/,'packages/browser-common/src/$1.ts'],
  [/^@posthog\/rrweb-utils$/,'packages/rrweb/utils/src/index.ts'],
]
const aliasPlugin=(isExternal)=>({name:'posthog-aliases',setup(b){
  b.onResolve({filter:/.*/},async args=>{
    if(args.pluginData==='aliased')return
    let request=args.path
    for(const [re,target] of aliases){
      if(re.test(request)){request=join(vendor,request.replace(re,target));break}
    }
    if(!request.startsWith('.')&&!request.startsWith('/'))return {path:request,external:true}
    const result=await b.resolve(request,{resolveDir:args.resolveDir,kind:args.kind,pluginData:'aliased'})
    if(result.errors.length)return result
    if(isExternal(result.path))return {path:result.path,external:true}
    return result
  })
}})

// the same TypeScript settings as the vitest run (test/lil/upstream.config.mjs)
const tsconfigRaw={compilerOptions:{target:'ES2020',useDefineForClassFields:false,jsx:'react-jsx',jsxImportSource:'preact'}}

async function graph(entryFile){
  const result=await build({entryPoints:[entryFile],bundle:true,write:false,metafile:true,format:'esm',platform:'browser',
    jsx:'automatic',jsxImportSource:'preact',tsconfigRaw,loader:{'.css':'empty'},logLevel:'silent',plugins:[aliasPlugin(()=>false)]})
  return Object.keys(result.metafile.inputs).map(p=>resolve(root,p)).filter(p=>p.startsWith(vendor+'/packages/')&&/\.(ts|tsx)$/.test(p))
}

function reservedNames(){
  const text=readFileSync(join(vendor,'packages/browser/rollup.config.mjs'),'utf8')
  const start=text.indexOf('regex: /^_(?!_)/')
  const end=text.indexOf('reserved: [',text.indexOf('],',text.indexOf('reserved: [',start)+1))
  const region=text.slice(start,end)
  const names=[...region.matchAll(/^\s*'([^']+)',/gm)].map(m=>m[1])
  const cross=readFileSync(join(vendor,'packages/browser/terser-cross-bundle-properties.cjs'),'utf8')
  const globals=[...cross.match(/globallyReservedPrivateProperties = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1])
  return [...new Set([...names,...globals])]
}

function writeMap(entriesByModule,outputs){
  // entriesByModule: absolute upstream path -> absolute output entry file
  const stubs=join(out,'stubs')
  mkdirSync(stubs,{recursive:true})
  const map={}
  let index=0
  for(const [modulePath,file] of entriesByModule){
    const code=readFileSync(file,'utf8')
    const hasDefault=/export\s*\{[^}]*\bas default\b|export default\b|\bdefault\s*\}/.test(code)||/[,{]\s*default\s*[,}]/.test(code.match(/export\s*\{[^}]*\}/g)?.join('')??'')
    const stub=join(stubs,`m${index++}.mjs`)
    writeFileSync(stub,`export * from ${JSON.stringify(file)};\n${hasDefault?`export {default} from ${JSON.stringify(file)};\n`:''}`)
    map[modulePath]=stub
  }
  writeFileSync(join(out,'map.json'),JSON.stringify(map,null,1)+'\n')
  return map
}

if(mode==='reference'){
  rmSync(out,{recursive:true,force:true})
  const entryFile=join(vendor,'packages/browser/src/entrypoints',entry)
  const modules=(await graph(entryFile)).filter(p=>!p.includes('/src/entrypoints/'))
  const set=new Set(modules)
  const names=new Map(modules.map((p,i)=>[p,`m${i}`]))
  const result=await build({entryPoints:Object.fromEntries(modules.map(p=>[names.get(p),p])),bundle:true,splitting:true,format:'esm',
    platform:'browser',target:'es2020',outdir:join(out,'build'),metafile:true,jsx:'automatic',jsxImportSource:'preact',tsconfigRaw,
    loader:{'.css':'empty'},logLevel:'warning',plugins:[aliasPlugin(p=>p.startsWith(vendor+'/')&&!set.has(p))]})
  // upstream's npm build: terser property mangling with a shared name cache across files
  const nameCache={}
  const reserved=reservedNames()
  for(const file of readdirSync(join(out,'build')).filter(f=>f.endsWith('.js'))){
    const path=join(out,'build',file)
    nameCache.vars={props:{}} // as upstream's finalTerser: property names shared, top-level names per file
    const minified=await minify(readFileSync(path,'utf8'),{module:true,compress:false,nameCache,
      mangle:{keep_classnames:true,keep_fnames:true,properties:{regex:/^_(?!_)/,reserved}},format:{comments:false,beautify:true}})
    writeFileSync(path,minified.code)
  }
  const entries=new Map()
  for(const [output,meta] of Object.entries(result.metafile.outputs)){
    if(!meta.entryPoint)continue
    entries.set(resolve(root,meta.entryPoint),resolve(root,output))
  }
  writeMap(entries)
  writeFileSync(join(out,'modules.json'),JSON.stringify(modules.map(p=>relative(vendor,p)),null,1)+'\n')
  console.log(`reference: ${modules.length} modules of ${entry}, ${reserved.length} reserved names, map ${join(out,'map.json')}`)
}else if(mode==='candidate'){
  const manifestPath=resolve(arg('manifest'))
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'))
  const entryNames=JSON.parse(readFileSync(resolve(arg('entries')),'utf8'))
  const delivery=manifest.outputs[0]
  const entries=new Map()
  for(const [upstream,name] of Object.entries(entryNames)){
    const e=delivery.entries.find(x=>x.name===name)
    if(!e)throw Error(`compiler output has no entry ${name}`)
    entries.set(join(vendor,upstream),join(dirname(manifestPath),e.file))
  }
  mkdirSync(out,{recursive:true})
  writeMap(entries)
  console.log(`candidate: ${entries.size} modules substituted, map ${join(out,'map.json')}`)
}else throw Error('usage: g1-build.mjs reference|candidate')
