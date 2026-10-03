import {spawnSync} from 'node:child_process'
import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {root} from './sdk-source.mjs'
mkdirSync(join(root,'reports/full-sdk'),{recursive:true})
for(const objective of ['original','raw','gzip','brotli']){
  const result=spawnSync(process.execPath,[join(root,'node_modules/vitest/vitest.mjs'),'run','--config','test/upstream.config.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,POSTHOGLIL_UPSTREAM_ONLY:objective==='original'?'1':'0',POSTHOGLIL_OBJECTIVE:objective,POSTHOGLIL_TEST_STANDALONE:'0'}})
  if(result.status!==0)process.exit(result.status??1)
}
