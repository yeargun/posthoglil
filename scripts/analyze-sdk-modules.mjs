import {writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {bundleSdk,replacements,root,upstreamVersion,upstreamCommit} from './sdk-source.mjs'
import {minifySdk} from './sdk-minify.mjs'
import {measureFile} from './codec.mjs'

const output=join(root,'reports/full-sdk/ablation')
mkdirSync(output,{recursive:true})
const report={upstreamVersion,upstreamCommit,method:'One module substitution at a time; raw-targeted LilScript intermediates; identical pinned-source bundler and upstream Terser policy.',rows:[]}
for(const surface of ['standard','full']){
  const modules=replacements.filter(row=>surface==='full'?row.id.startsWith('replay-'):!row.id.startsWith('replay-'))
  const baselineFile=join(output,`${surface}-original.mjs`)
  writeFileSync(baselineFile,await minifySdk((await bundleSdk({surface})).code,{surface}))
  const baseline=measureFile(baselineFile)
  for(const row of modules){
    const file=join(output,`${surface}-${row.id}.mjs`)
    const started=performance.now()
    writeFileSync(file,await minifySdk((await bundleSdk({surface,objective:'raw',enabled:[row.id]})).code,{surface}))
    const size=measureFile(file)
    const delta=Object.fromEntries(Object.keys(size).map(key=>[key,size[key]-baseline[key]]))
    report.rows.push({surface,module:row.id,baseline,size,delta,seconds:(performance.now()-started)/1000})
    writeFileSync(join(output,'results.json'),JSON.stringify(report,null,2)+'\n')
    console.log(surface,row.id,JSON.stringify(delta))
  }
}
