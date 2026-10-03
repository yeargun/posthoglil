import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {root,upstreamVersion,upstreamCommit} from './sdk-source.mjs'
import {checkUpstreamPin} from './check-upstream-pin.mjs'
import {completeManifest,completeRows,completeOverrides,digest,portOutput} from './complete-sdk.mjs'

checkUpstreamPin()
const objectives=process.argv.find(arg=>arg.startsWith('--objectives='))?.slice(13).split(',')??['raw','gzip','brotli']
const directory=join(root,'reports/complete-port/validation')
mkdirSync(directory,{recursive:true})
const report={schema:1,complete:false,matchesUpstream:false,upstreamVersion,upstreamCommit,node:process.version,manifestSha256:digest(readFileSync(join(root,'src/sdk/manifest.json'))),runs:[]}
let baseline
const requiredFiles=[...new Set(completeManifest.modules.flatMap(row=>row.tests))].map(file=>join(root,'vendor/posthog-js',file)).concat(join(root,'test/complete-sdk-behavior.test.ts'))
for(const file of requiredFiles)assert.ok(existsSync(file),`Missing requested test file: ${file}`)
function outcomes(result){
  return result.testResults.flatMap(file=>file.assertionResults.map(test=>({id:file.name.slice(root.length+1)+'::'+test.fullName,status:test.status,messages:test.failureMessages}))).sort((a,b)=>a.id.localeCompare(b.id))
}
for(const variant of ['original',...objectives]){
  const original=variant==='original'
  if(!original)completeOverrides(variant)
  console.log('Testing complete-port implementation:',variant,'(one worker)')
  const resultPath=join(root,`reports/complete-port/tests-${original?'original':'candidate'}.json`)
  rmSync(resultPath,{force:true})
  const child=spawnSync(process.execPath,[join(root,'node_modules/vitest/vitest.mjs'),'run','--config','test/complete-sdk.config.mjs'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,POSTHOGLIL_COMPLETE_ORIGINAL:original?'1':'0',POSTHOGLIL_COMPLETE_OBJECTIVE:original?'raw':variant}})
  writeFileSync(join(directory,variant+'.log'),child.stdout+child.stderr)
  const result=JSON.parse(readFileSync(resultPath,'utf8'))
  writeFileSync(join(directory,variant+'.json'),JSON.stringify(result,null,2)+'\n')
  const tests=outcomes(result)
  const collectedFiles=new Set(result.testResults.map(file=>file.name))
  for(const file of requiredFiles)assert.ok(collectedFiles.has(file),`Requested test file did not run: ${file}`)
  assert.equal(result.testResults.filter(file=>file.status==='failed'&&!file.assertionResults.length).length,0,'A test suite failed before collecting tests')
  assert.ok(tests.length>1000,'The full requested test set did not run')
  const failures=tests.filter(test=>test.status==='failed')
  if(original)baseline=tests
  else assert.deepEqual(tests,baseline,`${variant}: upstream test identities, outcomes or failure messages changed`)
  const artifacts=original?[]:completeRows.map(row=>({file:portOutput(row,variant).slice(root.length+1),sha256:digest(readFileSync(portOutput(row,variant)))}))
  const run={variant,exitCode:child.status,passed:result.numPassedTests,failed:result.numFailedTests,total:result.numTotalTests,failures,artifacts}
  report.runs.push(run)
  writeFileSync(join(directory,'results.json'),JSON.stringify(report,null,2)+'\n')
  console.log(`${variant}: ${run.passed} passed, ${run.failed} failed; ${original?'baseline recorded':'same outcomes as unchanged upstream'}`)
}
report.complete=true
report.matchesUpstream=true
writeFileSync(join(directory,'results.json'),JSON.stringify(report,null,2)+'\n')
if(process.argv.includes('--require-green')&&report.runs.some(row=>row.failed))throw Error('Upstream and candidate still have failing tests; see validation/results.json')
