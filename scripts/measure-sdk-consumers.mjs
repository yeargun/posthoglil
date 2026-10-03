import {mkdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {root,upstreamVersion} from './sdk-source.mjs'
import {fixtures,installConsumers,buildConsumer} from './sdk-consumers.mjs'
import {measureFile} from './codec.mjs'

const {projects,receipt}=installConsumers()
const output=join(root,'artifacts/sdk-consumers')
mkdirSync(output,{recursive:true})
const result={schema:1,date:new Date().toISOString(),upstreamVersion,packageIntegrity:receipt.integrity,defaultObjective:receipt.defaultObjective,
  method:'Identical application source, real npm installs under posthog-js, default tree shaking, production minification and ES2020 target. One default package artifact is measured with all three codecs; no side-effect overrides. Builds run sequentially. Split assets are compressed separately and summed.',
  buildTimeScope:'One warm-machine application build per row; installed dependencies, no output writes or transport compression in timing. Not SDK compilation time.',rows:[]}
for(const fixture of fixtures)for(const bundler of ['esbuild','rolldown']) {
  const row={fixture:fixture.id,optimized:fixture.optimized,bundler}
  for(const variant of ['original','candidate']) {
    const built=await buildConsumer({directory:projects[variant],fixture,bundler,output:join(output,fixture.id,bundler,variant)})
    for(const file of built.files)Object.assign(file,measureFile(join(root,file.file)))
    built.total=Object.fromEntries(['raw','gzip9','brotli11'].map(metric=>[metric,built.files.reduce((sum,file)=>sum+file[metric],0)]))
    row[variant]=built
  }
  row.savingsPercent=Object.fromEntries(['raw','gzip9','brotli11'].map(metric=>[metric,100*(1-row.candidate.total[metric]/row.original.total[metric])]))
  result.rows.push(row)
  console.log(fixture.id,bundler,JSON.stringify({original:row.original.total,candidate:row.candidate.total,savings:row.savingsPercent}))
  writeFileSync(join(output,'results.json'),JSON.stringify(result,null,2)+'\n')
}
