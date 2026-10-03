import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {join,relative,basename,dirname} from 'node:path'
import os from 'node:os'
import {withMapComment} from './source-maps.mjs'
import {bundleSdk,root,upstreamVersion,upstreamCommit} from './sdk-source.mjs'
import {minifySdk,lanes,propertyReserved} from './sdk-minify.mjs'
import {measureFile} from './codec.mjs'

const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const destination=join(root,'artifacts/sdk')
mkdirSync(destination,{recursive:true})
const enabled=JSON.parse(readFileSync(join(root,'configs/sdk/modules.json'),'utf8')).modules
const report={schema:1,generatedAt:new Date().toISOString(),upstream:{name:'posthog-js',version:upstreamVersion,commit:upstreamCommit},
  codec:'lilscript-codec: gzip level 9 (zlib 1.3.1), Brotli quality 11 / window 22 (Brotli 1.1.0)',
  scope:'Complete standard browser SDK and full/no-external browser SDK. Standard loads optional extensions separately; these requests are excluded from the initial JavaScript size.',
  method:'Sequential, uncached compilation. Identical source bundler and minifier lanes for each side. Each candidate is compiled for its named objective. Compare against the smallest minified original for that codec, including the exact npm artifact.',
  buildTimeScope:'One measured run per stage on this machine; dependencies already installed and filesystem caches warm. Compilation + source bundling + selected minifier. Search/other minifier lanes, dependency install, declaration generation, packaging and compression excluded. Source-map generation and composition are included. Published npm build time is unknown.',
  machine:{node:process.version,cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem(),platform:os.platform(),release:os.release(),load:os.loadavg()},
  tools:Object.fromEntries(['esbuild','terser','vite','rolldown','lightningcss','typescript'].map(name=>[name,JSON.parse(readFileSync(join(root,'node_modules',name,'package.json'),'utf8')).version])),
  dependencyLockSha256:hash(readFileSync(join(root,'package-lock.json'))),enabledModules:enabled,propertyReserved,surfaces:[]}
function save(path,output,extra={}){
  let code=output
  if(typeof output!=='string'&&!Buffer.isBuffer(output)){
    const mapName=basename(dirname(path))+'-'+basename(path,'.mjs')+'.map'
    const mapPath=join(dirname(path),mapName)
    writeFileSync(mapPath,JSON.stringify({...output.map,file:basename(path)})+'\n')
    extra.sourceMap={file:relative(root,mapPath),sha256:hash(readFileSync(mapPath)),scope:'Upstream TypeScript and generated LilScript JavaScript; embedded source content.'}
    code=withMapComment(output.code,mapName)
  }
  writeFileSync(path,code)
  const bytes=readFileSync(path)
  return {file:relative(root,path),...measureFile(path),sha256:hash(bytes),...extra}
}
for(const surface of ['standard','full']){
  const dir=join(destination,surface);mkdirSync(dir,{recursive:true})
  const result={id:surface,label:surface==='standard'?'Standard browser SDK':'Full / no external scripts',originals:[],objectives:[]}
  const published=join(root,'node_modules/posthog-upstream/dist',surface==='standard'?'module.mjs':'module.full.no-external.js')
  const publishedMap=join(dir,basename(published)+'.map');copyFileSync(published+'.map',publishedMap)
  result.originals.push(save(join(dir,'published.mjs'),readFileSync(published),{lane:'published',source:relative(root,published),seconds:null,sourceMap:{file:relative(root,publishedMap),sha256:hash(readFileSync(publishedMap)),scope:'Exact published upstream map.'}}))
  let started=performance.now()
  const original=await bundleSdk({surface,sourceMap:true})
  const originalBundleSeconds=(performance.now()-started)/1000
  if(original.extras.length)throw Error('Unaccounted original assets')
  for(const lane of lanes){
    started=performance.now()
    const code=await minifySdk(original.code,{surface,lane,sourceMap:original.map})
    result.originals.push(save(join(dir,`original-${lane}.mjs`),code,{lane,bundleSeconds:originalBundleSeconds,minifySeconds:(performance.now()-started)/1000}))
  }
  for(const objective of ['raw','gzip','brotli']){
    const metric=objective==='gzip'?'gzip9':objective==='brotli'?'brotli11':'raw'
    const plan=JSON.parse(readFileSync(join(root,`reports/full-sdk/plan-${surface}.json`),'utf8'))
    const compiler=JSON.parse(readFileSync(join(root,`reports/full-sdk/internals/${objective}/${surface}/build.json`),'utf8'))
    if(compiler.objective!==objective||compiler.mode!=='production')throw Error('Invalid compiler receipt')
    started=performance.now()
    const bundled=await bundleSdk({surface,objective,enabled,plan:plan.exports,sourceMap:true})
    const bundleSeconds=(performance.now()-started)/1000
    if(bundled.extras.length)throw Error('Unaccounted candidate assets')
    const candidates=[]
    for(const lane of lanes){
      started=performance.now()
      const code=await minifySdk(bundled.code,{surface,lane,sourceMap:bundled.map})
      candidates.push(save(join(dir,`${objective}-${lane}.mjs`),code,{lane,minifySeconds:(performance.now()-started)/1000}))
    }
    candidates.sort((a,b)=>a[metric]-b[metric]||a.lane.localeCompare(b.lane))
    const best=candidates[0]
    const file=join(dir,`${objective}.mjs`);copyFileSync(join(root,best.file),file)
    const baseline=[...result.originals].sort((a,b)=>a[metric]-b[metric]||a.lane.localeCompare(b.lane))[0]
    const matched=result.originals.find(row=>row.lane===best.lane)
    const compilerIdentity={sha256:compiler.compilerSha256,sourceSha256:compiler.sourceSha256,configSha256:compiler.configSha256,entrySha256:compiler.entrySha256,outputSha256:compiler.outputSha256,seconds:compiler.seconds}
    const row={objective,metric,artifact:{...best,file:relative(root,file)},baseline,matchedOriginal:matched,candidates,compiler:compilerIdentity,bundleSeconds,
      totalBuildSeconds:compiler.seconds+bundleSeconds+best.minifySeconds,
      originalBuildSeconds:matched.bundleSeconds+matched.minifySeconds,
      savingsPercent:(1-best[metric]/baseline[metric])*100,
      samePipelineSavingsPercent:(1-best[metric]/matched[metric])*100}
    result.objectives.push(row)
    console.log(surface,objective,`${best[metric]} vs ${baseline[metric]} (${row.savingsPercent.toFixed(2)}% smaller)`,best.lane,'baseline',baseline.lane)
  }
  report.surfaces.push(result)
  writeFileSync(join(destination,'results.json'),JSON.stringify(report,null,2)+'\n')
}
