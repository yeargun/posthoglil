import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs'
import {join,relative} from 'node:path'
import {bundleSdk,root,vendor,upstreamVersion,upstreamCommit} from './sdk-source.mjs'
import {checkUpstreamPin} from './check-upstream-pin.mjs'
import {completeManifest,digest} from './complete-sdk.mjs'

checkUpstreamPin()
const reportDirectory=join(root,'reports/complete-port')
mkdirSync(reportDirectory,{recursive:true})
const entryDirectory=join(vendor,'packages/browser/src/entrypoints')
// The pinned upstream build publishes every file in this directory. Include
// even internal-looking entries; a manifest omission must never create coverage.
const entries=readdirSync(entryDirectory).filter(name=>name.endsWith('.ts')).sort().map(name=>join(entryDirectory,name))
for(const file of ['packages/react/src/index.ts','packages/react/src/slim.ts','packages/react/src/surveys/index.ts']){
  if(existsSync(join(vendor,file)))entries.push(join(vendor,file))
}
const modules=new Map(),surfaces=[]
for(const entryFile of entries){
  const source=relative(vendor,entryFile)
  console.log('Inventory',source)
  const {metafile}=await bundleSdk({entryFile})
  const owned=[]
  for(const path of metafile.modules){
    if(!path.startsWith(vendor+'/')||!existsSync(path))continue
    const key=relative(vendor,path)
    if(!modules.has(key)){
      const bytes=readFileSync(path)
      modules.set(key,{source:key,kind:/\.[cm]?[jt]sx?$/.test(key)?'script':key.endsWith('.css')?'stylesheet':'metadata',sourceBytes:bytes.length,sourceSha256:digest(bytes),entries:[],implementation:completeManifest.modules.find(row=>row.source===key)?.implementation??null})
    }
    modules.get(key).entries.push(source)
    owned.push(key)
  }
  surfaces.push({entry:source,modules:owned,workers:metafile.workers.map(worker=>({entry:relative(vendor,worker.entry),modules:worker.modules.filter(path=>path.startsWith(vendor+'/')).map(path=>relative(vendor,path))}))})
  writeFileSync(join(reportDirectory,'inventory.json'),JSON.stringify({schema:1,complete:false,upstreamVersion,upstreamCommit,scope:completeManifest.scope,entries:surfaces,modules:[...modules.values()]},null,2)+'\n')
}
const rows=[...modules.values()].sort((a,b)=>a.source.localeCompare(b.source))
const scripts=rows.filter(row=>row.kind==='script'),assets=rows.filter(row=>row.kind!=='script')
const missing=scripts.filter(row=>!row.implementation)
const result={schema:2,complete:missing.length===0,upstreamVersion,upstreamCommit,scope:completeManifest.scope,manifestSha256:digest(readFileSync(join(root,'src/sdk/manifest.json'))),entryCount:surfaces.length,moduleCount:scripts.length,assetCount:assets.length,wholeModuleImplementations:scripts.length-missing.length,remainingModuleCount:missing.length,entries:surfaces,modules:rows}
writeFileSync(join(reportDirectory,'inventory.json'),JSON.stringify(result,null,2)+'\n')
const lines=['# Complete PostHog SDK port — private coverage report','',`Upstream: ${upstreamVersion} (${upstreamCommit}).`,'',`Status: **${result.wholeModuleImplementations}/${scripts.length} linked source modules have whole-module LilScript implementations; ${missing.length} remain.** Embedded worker sources are included. ${assets.length} stylesheets/metadata files are recorded separately. This is source coverage, not a size saving or a release certification. Passing this inventory alone does not establish behavioral compatibility.`, '', '| Source module | Implementation | Referencing entries |','| --- | --- | ---: |',...scripts.map(row=>`| ${row.source} | ${row.implementation??'Pending'} | ${row.entries.length} |`),'','## Delivery assets','',...assets.map(row=>`- ${row.source}: ${row.kind}; SHA-256 ${row.sourceSha256}`),'']
writeFileSync(join(reportDirectory,'COVERAGE.md'),lines.join('\n'))
console.log(`${result.wholeModuleImplementations}/${scripts.length} whole-module implementations across ${surfaces.length} entries; ${assets.length} delivery assets`)
if(process.argv.includes('--require-complete')&&missing.length)throw Error(`Complete SDK is not ready: ${missing.length} source modules remain unported`)
