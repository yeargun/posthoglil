// Release builds of the LilScript SDK: one whole-program compilation per published entry and
// objective, then raw / gzip-9 / Brotli-11 sizes against npm's file and the best minified-original
// lanes (Codex's measurements over the same upstream source, artifacts/sdk/results.json).
//
//   node scripts/lil-release.mjs [--entries=module.es] [--objectives=brotli,gzip,raw]
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {gzipSync,brotliCompressSync,constants as z} from 'node:zlib'
import {root} from './sdk-source.mjs'

const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback
const compiler=process.env.LILSCRIPT_COMPILER??join(process.env.HOME,'lilscript-work/bin/posthog100/lilscript')
const npmDist=join(process.env.HOME,'lilscript-work/portwork/posthog-100/npm/package/dist')
// entry -> [npm file, output format]
const ENTRIES={
  'module.es':['module.js','esm'],
  'module.no-external.es':['module.no-external.js','esm'],
  'module.slim.es':['module.slim.js','esm'],
  'module.slim.no-external.es':['module.slim.no-external.js','esm'],
  'main.cjs':['main.js','cjs'],
  'array':['array.js','iife'],
  'array.no-external':['array.no-external.js','iife'],
}
const entries=arg('entries','module.es').split(',')
const objectives=arg('objectives','brotli,gzip,raw').split(',')
const sizes=buf=>({raw:buf.length,gzip:gzipSync(buf,{level:9}).length,brotli:brotliCompressSync(buf,{params:{[z.BROTLI_PARAM_QUALITY]:11,[z.BROTLI_PARAM_LGWIN]:22,[z.BROTLI_PARAM_SIZE_HINT]:buf.length}}).length})

// best minified original per codec for the standard surface (module.es) from Codex's lanes
const bars={}
const results=join(root,'artifacts/sdk/results.json')
if(existsSync(results)){
  const standard=JSON.parse(readFileSync(results,'utf8')).surfaces.find(s=>s.id==='standard')
  for(const codec of ['raw','gzip9','brotli11']){
    const best=standard.originals.reduce((a,o)=>!a||o[codec]<a[codec]?o:a,null)
    bars[codec]={bytes:best[codec],lane:best.lane}
  }
}

const rows=[]
for(const entry of entries){
  const [npmFile,format]=ENTRIES[entry]??(()=>{throw Error(`unknown entry ${entry}`)})()
  const source=join(root,'src/posthog/browser/entrypoints',entry+'.lil')
  const npm=sizes(readFileSync(join(npmDist,npmFile)))
  for(const objective of objectives){
    const outDir=join(root,'dist/lil',objective);mkdirSync(outDir,{recursive:true})
    const out=join(outDir,npmFile)
    const target=format==='iife'?'js':'js-module'
    const args=[source,'--config',join(root,`configs/lil/release-${objective}.toml`),'--target',target,'--jobs','1','-o',out]
    if(format!=='iife')args.push('--format',format)
    const started=performance.now()
    const run=spawnSync(compiler,args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,env:{...process.env,RAYON_NUM_THREADS:'1'}})
    const seconds=(performance.now()-started)/1000
    if(run.status!==0){console.error(run.stderr||run.stdout);process.exit(1)}
    const s=sizes(readFileSync(out))
    rows.push({entry,objective,file:out,seconds:+seconds.toFixed(2),...s,npm})
    const codec=objective==='brotli'?'brotli':objective==='gzip'?'gzip':'raw'
    const pct=(a,b)=>((a-b)/b*100).toFixed(2)+'%'
    const bar=entry==='module.es'?bars[codec==='brotli'?'brotli11':codec==='gzip'?'gzip9':'raw']:null
    console.log(`${entry} ${objective}: ${s.raw} / ${s.gzip} / ${s.brotli} (raw/gzip/br) in ${seconds.toFixed(1)}s; ${codec} vs npm ${npm[codec]} ${pct(s[codec],npm[codec])}`+(bar?`; vs best minified original ${bar.bytes} (${bar.lane}) ${pct(s[codec],bar.bytes)}`:''))
  }
}
mkdirSync(join(root,'reports/lil-sdk'),{recursive:true})
writeFileSync(join(root,'reports/lil-sdk/release.json'),JSON.stringify({compiler,bars,rows},null,1)+'\n')
