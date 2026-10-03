import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {root} from './sdk-source.mjs'

const name=process.argv[2]
const commands={
  utilities:[['npm','test'],['npm','run','test:packs:release'],['npm','run','test:packs:package']],
  'tree-shaking':[[process.execPath,'--test','--test-concurrency=1','test/tree-shaking.test.mjs']],
}[name]
if(!commands)throw Error('Expected utilities or tree-shaking')
const directory=join(root,'reports/full-sdk');mkdirSync(directory,{recursive:true})
let log=''
for(const command of commands){
  const run=spawnSync(command[0],command.slice(1),{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024})
  const output=(run.stdout??'')+(run.stderr??'');log+=output;process.stdout.write(output)
  writeFileSync(join(directory,name+'-tests.log'),log)
  if(run.status!==0)throw Error(`${name} command failed: ${command.join(' ')}`)
}
const hash=file=>createHash('sha256').update(readFileSync(join(root,file))).digest('hex')
const files=name==='utilities'?readdirSync(join(root,'dist')).filter(file=>/\.(?:esm\.js|cjs|umd\.js|d\.ts)$/.test(file)).map(file=>'dist/'+file):['artifacts/tree-shaking/results.json']
writeFileSync(join(directory,name+'-validation.json'),JSON.stringify({ok:true,checkedAt:new Date().toISOString(),commands,logSha256:hash('reports/full-sdk/'+name+'-tests.log'),inputs:files.map(file=>({file,sha256:hash(file)}))},null,2)+'\n')
