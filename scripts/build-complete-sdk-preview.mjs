import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join,relative} from 'node:path'
import {spawnSync} from 'node:child_process'
import {bundleSdk,root,vendor,upstreamVersion,upstreamCommit} from './sdk-source.mjs'
import {minifySdk} from './sdk-minify.mjs'
import {measureFile} from './codec.mjs'
import {completeManifest,completeRows,completeOverrides,digest,portOutput} from './complete-sdk.mjs'
import {checkUpstreamPin} from './check-upstream-pin.mjs'

checkUpstreamPin()
const inventoryRun=spawnSync(process.execPath,['scripts/inventory-complete-sdk.mjs'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024})
if(inventoryRun.status!==0)throw Error(inventoryRun.stderr||inventoryRun.stdout)
const inventory=JSON.parse(readFileSync(join(root,'reports/complete-port/inventory.json'),'utf8'))
if(!inventory.complete&&!process.argv.includes('--allow-incomplete'))throw Error(`Full reimplementation is incomplete: ${inventory.remainingModuleCount}/${inventory.moduleCount} modules remain. --allow-incomplete creates private development evidence only.`)
const directory=join(root,'reports/complete-port/bundles')
mkdirSync(directory,{recursive:true})
const objectives=['raw','gzip','brotli'],lanes=['oxc','terser']
const report={schema:1,generatedAt:new Date().toISOString(),complete:inventory.complete,releaseReady:false,upstreamVersion,upstreamCommit,coverage:{ported:inventory.wholeModuleImplementations,total:inventory.moduleCount},
  scope:'Private development preview of new whole-module ports. Remaining modules use pinned upstream source. No npm package or website is replaced. Each compression objective has its own LilScript compilation. Full includes upstream extensions; standard loads separately measured recorder assets.',
  buildTimeScope:'One warm-cache local run. LilScript compilation plus source bundling plus the selected minifier. Dependency installation, type generation, packaging, codec time and unused minifier searches are excluded. Published npm build time is unknown.',
  manifestSha256:digest(readFileSync(join(root,'src/sdk/manifest.json'))),surfaces:[],lazyAssets:{original:{},candidate:{}}}
function save(file,code,details={}){
  writeFileSync(file,code)
  return {file:relative(root,file),sha256:digest(readFileSync(file)),...measureFile(file),...details}
}
function persist(){writeFileSync(join(directory,'results.json'),JSON.stringify(report,null,2)+'\n')}
for(const surface of ['standard','full']){
  const dir=join(directory,surface);mkdirSync(dir,{recursive:true})
  let started=performance.now()
  const original=await bundleSdk({surface})
  const originalBundleSeconds=(performance.now()-started)/1000
  if(original.extras.length)throw Error('Unaccounted original delivery asset')
  const originals=[]
  for(const lane of lanes){
    started=performance.now()
    const code=await minifySdk(original.code,{surface,lane})
    originals.push(save(join(dir,'original-'+lane+'.mjs'),code,{lane,bundleSeconds:originalBundleSeconds,minifySeconds:(performance.now()-started)/1000}))
  }
  const published=join(root,'node_modules/posthog-upstream/dist',surface==='standard'?'module.mjs':'module.full.no-external.js')
  originals.push(save(join(dir,'published.mjs'),readFileSync(published),{lane:'published'}))
  const result={id:surface,originals,objectives:[]};report.surfaces.push(result)
  for(const objective of objectives){
    const receipts=completeRows.map(row=>JSON.parse(readFileSync(portOutput(row,objective)+'.json','utf8')))
    if(receipts.some(row=>row.mode!=='production'))throw Error('Compile all preview inputs in production mode')
    started=performance.now()
    const candidate=await bundleSdk({surface,overrides:completeOverrides(objective)})
    const bundleSeconds=(performance.now()-started)/1000
    if(candidate.extras.length)throw Error('Unaccounted candidate delivery asset')
    const candidates=[]
    for(const lane of lanes){
      started=performance.now()
      const code=await minifySdk(candidate.code,{surface,lane})
      candidates.push(save(join(dir,objective+'-'+lane+'.mjs'),code,{lane,minifySeconds:(performance.now()-started)/1000}))
    }
    const metric=objective==='raw'?'raw':objective==='gzip'?'gzip9':'brotli11'
    const best=[...candidates].sort((a,b)=>a[metric]-b[metric])[0]
    const baseline=[...originals].sort((a,b)=>a[metric]-b[metric])[0]
    const matchedOriginal=originals.find(row=>row.lane===best.lane)
    const linked=receipts.filter(receipt=>candidate.metafile.modules.includes(portOutput(completeRows.find(row=>row.implementation===receipt.source),objective)))
    const compilerSeconds=[...new Map(linked.map(row=>[row.buildId??row.source,row])).values()].reduce((sum,row)=>sum+row.seconds,0)
    const row={objective,metric,artifact:best,baseline,matchedOriginal,candidates,compilerSeconds,bundleSeconds,totalBuildSeconds:compilerSeconds+bundleSeconds+best.minifySeconds,originalBuildSeconds:matchedOriginal.bundleSeconds+matchedOriginal.minifySeconds,savingsPercent:100*(1-best[metric]/baseline[metric]),compilerReceipts:linked}
    result.objectives.push(row);persist()
    console.log(surface,objective,`${best[metric]} vs ${baseline[metric]}: ${Math.abs(row.savingsPercent).toFixed(2)}% ${row.savingsPercent>=0?'smaller':'larger'}`)
  }
}
// Exercise the standard SDK's separately loaded recorder from the same source
// graph and port map as the main package. These bytes are not initial-load bytes.
for(const [filename,entry] of [['lazy-recorder.js','lazy-recorder.ts'],['recorder.js','posthog-recorder.ts']]){
  for(const variant of ['original',...objectives]){
    const dir=join(directory,'lazy',variant);mkdirSync(dir,{recursive:true})
    const bundled=await bundleSdk({entryFile:join(vendor,'packages/browser/src/entrypoints',entry),format:'iife',minify:true,overrides:variant==='original'?new Map():completeOverrides(variant)})
    if(bundled.extras.length)throw Error('Unaccounted recorder asset')
    const asset=save(join(dir,filename),bundled.code)
    if(variant==='original')report.lazyAssets.original[filename]=asset
    else (report.lazyAssets.candidate[variant]??={})[filename]=asset
  }
}
persist()
