import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join,relative,basename} from 'node:path'
import {createHash} from 'node:crypto'
import {root} from './sdk-source.mjs'
import {minifySdk} from './sdk-minify.mjs'
import {optimizeSdkDelivery} from './sdk-delivery.mjs'
import {withoutMapComment,withMapComment} from './source-maps.mjs'
import {measureFile} from './codec.mjs'

const sdk=JSON.parse(readFileSync(join(root,'artifacts/sdk/results.json'),'utf8'))
const directory=join(root,'artifacts/package-runtime');mkdirSync(directory,{recursive:true})
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex')
const result={schema:1,upstreamVersion:sdk.upstream.version,compilerObjective:'gzip',
  method:'One fixed ESM runtime per entry, measured in all three codecs. Starting from the gzip-targeted SDK, an additional Terser/Oxc pass is followed by sharing string values at least 12 characters long used at least 3 times. Named property accesses stay intact. The identical delivery pass is applied to the matched unchanged-source control. No decoder, eval, feature removal or side-effect override.',rows:[]}
for(const surface of sdk.surfaces) {
  const input=surface.objectives.find(row=>row.objective==='gzip')
  const row={surface:surface.id,compilerObjective:'gzip',publishedOriginal:input.publishedOriginal}
  for(const [variant,artifact] of [['candidate',input.artifact],['original',input.matchedOriginal]]) {
    const started=performance.now()
    const compressed=await minifySdk(withoutMapComment(readFileSync(join(root,artifact.file),'utf8')),{surface:surface.id,lane:'terser-oxc',sourceMap:JSON.parse(readFileSync(join(root,artifact.sourceMap.file),'utf8'))})
    const {output,receipt}=await optimizeSdkDelivery(compressed,{surface:surface.id,objective:'package'})
    const file=join(directory,`${surface.id}-${variant}.mjs`),mapFile=file+'.map'
    writeFileSync(mapFile,JSON.stringify({...output.map,file:basename(file)})+'\n')
    writeFileSync(file,withMapComment(output.code,basename(mapFile)))
    row[variant]={file:relative(root,file),sha256:hash(file),sourceMap:{file:relative(root,mapFile),sha256:hash(mapFile)},source:artifact.file,sourceSha256:artifact.sha256,delivery:receipt,deliverySeconds:(performance.now()-started)/1000,...measureFile(file)}
  }
  row.savingsPercent=Object.fromEntries(['raw','gzip9','brotli11'].map(metric=>[metric,100*(1-row.candidate[metric]/row.publishedOriginal[metric])]))
  result.rows.push(row)
  console.log('package runtime',surface.id,JSON.stringify(row.savingsPercent))
}
writeFileSync(join(directory,'results.json'),JSON.stringify(result,null,2)+'\n')
