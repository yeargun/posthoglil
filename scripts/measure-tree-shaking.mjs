import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join,relative} from 'node:path'
import {root,upstreamVersion} from './sdk-source.mjs'
import {bundleConsumer,consumers,bundlers} from './tree-shaking.mjs'
import {measureFile} from './codec.mjs'

const hash=code=>createHash('sha256').update(code).digest('hex')
const utilities=JSON.parse(readFileSync(join(root,'artifacts/utilities/results.json'),'utf8'))
const output=join(root,'artifacts/tree-shaking');mkdirSync(output,{recursive:true})
const result={schema:1,upstreamVersion,scope:'Named imports from the complete standalone utility ESM artifacts, rebundled with default side-effect analysis and minification. These are consumer sizes, not complete SDK savings. No module side-effect override is applied.',rows:[]}
function save(code,name,source) {
  const file=join(output,name);writeFileSync(file,code)
  return {file:relative(root,file),sha256:hash(code),source,sourceSha256:hash(readFileSync(join(root,source))),...measureFile(file)}
}
for(const consumer of consumers)for(const bundler of bundlers) {
  const pack=utilities.rows.find(row=>row.id===consumer.id)
  const originals=[]
  for(const original of pack.originals) {
    const code=await bundleConsumer(original.file,consumer.name,bundler)
    originals.push({...save(code,`${consumer.id}-${bundler}-original-${original.lane}.mjs`,original.file),lane:original.lane})
  }
  for(const row of pack.objectives) {
    const code=await bundleConsumer(row.artifact.file,consumer.name,bundler)
    const artifact=save(code,`${consumer.id}-${bundler}-${row.objective}.mjs`,row.artifact.file)
    const baseline=[...originals].sort((a,b)=>a[row.metric]-b[row.metric])[0]
    result.rows.push({id:consumer.id,name:consumer.name,bundler,objective:row.objective,metric:row.metric,artifact,baseline,originals,savingsPercent:(1-artifact[row.metric]/baseline[row.metric])*100})
  }
  console.log('measured named import',consumer.name,bundler)
}
writeFileSync(join(output,'results.json'),JSON.stringify(result,null,2)+'\n')
