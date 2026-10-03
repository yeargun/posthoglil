import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {root} from './sdk-source.mjs'
import {checkUpstreamPin} from './check-upstream-pin.mjs'
checkUpstreamPin()
mkdirSync(join(root,'reports/full-sdk'),{recursive:true})
const inputs=[]
for(const objective of ['original','raw','gzip','brotli']){
  const result=spawnSync(process.execPath,[join(root,'node_modules/vitest/vitest.mjs'),'run','--config','test/upstream.config.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,POSTHOGLIL_UPSTREAM_ONLY:objective==='original'?'1':'0',POSTHOGLIL_OBJECTIVE:objective,POSTHOGLIL_TEST_STANDALONE:'0'}})
  if(result.status!==0)process.exit(result.status??1)
  if(objective!=='original') {
    const file=`dist/sdk-internals/${objective}/combined.mjs`
    inputs.push({objective,file,sha256:createHash('sha256').update(readFileSync(join(root,file))).digest('hex')})
  }
}
writeFileSync(join(root,'reports/full-sdk/upstream-inputs.json'),JSON.stringify(inputs,null,2)+'\n')
