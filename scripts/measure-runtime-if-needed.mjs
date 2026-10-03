import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {join} from 'node:path'
import {root} from './sdk-source.mjs'

const sdk=JSON.parse(readFileSync(join(root,'artifacts/sdk/results.json'),'utf8'))
let current=false
try{
  const measured=JSON.parse(readFileSync(join(root,'artifacts/sdk/performance.json'),'utf8'))
  current=measured.executionEnvironment?.kind==='isolated GitHub Actions job'&&measured.rows.length===6&&sdk.surfaces.every(surface=>surface.objectives.every(row=>{
    const sample=measured.rows.find(item=>item.surface===surface.id&&item.objective===row.objective)
    return sample?.candidateSha256===row.artifact.sha256&&sample?.originalSha256===row.baseline.sha256&&[row.artifact,row.baseline].every(file=>createHash('sha256').update(readFileSync(join(root,file.file))).digest('hex')===file.sha256)
  }))
}catch{}
if(current)console.log('Retained isolated compiler-objective timings: all six original/candidate hashes still match')
else{
  const result=spawnSync(process.execPath,['test/sdk-performance.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,POSTHOGLIL_BENCH_SAMPLES:'30'}})
  if(result.status!==0)process.exit(result.status??1)
}
