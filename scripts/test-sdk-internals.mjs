import {spawnSync} from 'node:child_process'
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {root} from './sdk-source.mjs'
mkdirSync(join(root,'reports/full-sdk'),{recursive:true})
const rows=[]
for(const surface of ['standard','full'])for(const objective of ['raw','gzip','brotli']) {
  const file=`dist/sdk-internals/${objective}/${surface}.mjs`
  const result=spawnSync(process.execPath,['--test','--test-concurrency=1','test/sdk-errors.test.mjs','test/sdk-steps.test.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,POSTHOGLIL_SDK_ERRORS_ARTIFACT:file}})
  const log=result.stdout+result.stderr
  writeFileSync(join(root,`reports/full-sdk/errors-${surface}-${objective}.log`),log)
  if(result.status!==0)throw Error(log)
  const tests=Number(log.match(/^# tests (\d+)$/m)?.[1])
  if(tests!==35||!/^# fail 0$/m.test(log))throw Error('Incomplete SDK error-pipeline tests')
  rows.push({surface,objective,file,tests,sha256:createHash('sha256').update(readFileSync(join(root,file))).digest('hex')})
  console.log(surface,objective,tests,'default error pipeline and private buffer checks passed')
}
const delivery=spawnSync(process.execPath,['--test','--test-concurrency=1','test/sdk-delivery.test.mjs'],{cwd:root,encoding:'utf8'})
writeFileSync(join(root,'reports/full-sdk/delivery-tests.log'),delivery.stdout+delivery.stderr)
if(delivery.status!==0)throw Error(delivery.stdout+delivery.stderr)
writeFileSync(join(root,'reports/full-sdk/sdk-internals-validation.json'),JSON.stringify({ok:true,rows,deliveryTests:9},null,2)+'\n')
