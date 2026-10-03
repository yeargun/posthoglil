// The G1 gate: every upstream test that passes against the bundled, mangled upstream reference
// must pass against the candidate. Tests that fail on the reference depend on what upstream's
// npm build already hides (private names, module mocks) and are reported, not gated.
//
//   node test/lil/g1-compare.mjs [candidate.json] [--reference=reports/lil-sdk/g1-reference.json]
// Exit code 1 when the gate fails.
import {readFileSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {root} from '../../scripts/sdk-source.mjs'

const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback
const candidatePath=resolve(process.argv.slice(2).find(a=>!a.startsWith('--'))??join(root,'reports/lil-sdk/g1-candidate/tests.json'))
const referencePath=resolve(arg('reference',join(root,'reports/lil-sdk/g1-reference.json')))
const originalPath=resolve(arg('original',join(root,'reports/lil-sdk/g1-original.json')))

function outcomes(path){
  const report=JSON.parse(readFileSync(path,'utf8'))
  const map=new Map()
  for(const file of report.testResults){
    const name=file.name.slice(file.name.indexOf('packages/'))
    if(!file.assertionResults.length&&file.status==='failed')map.set(name+' :: <suite>',{status:'failed',message:(file.message??'').split('\n')[0]})
    for(const t of file.assertionResults)map.set(name+' :: '+t.fullName,{status:t.status,message:(t.failureMessages?.[0]??'').split('\n')[0]})
  }
  return map
}
const candidate=outcomes(candidatePath)
const reference=outcomes(referencePath)
const original=existsSync(originalPath)?outcomes(originalPath):new Map()
const files=new Set([...candidate.keys()].map(k=>k.split(' :: ')[0]))

const gate=[],extra=[],missing=[]
let gated=0,passed=0
for(const [id,ref] of reference){
  if(!files.has(id.split(' :: ')[0]))continue
  const cand=candidate.get(id)
  if(ref.status!=='passed')continue
  gated++
  if(!cand){missing.push(id);continue}
  if(cand.status==='passed')passed++
  else gate.push({id,message:cand.message})
}
for(const [id,cand] of candidate){
  const ref=reference.get(id)
  if(cand.status==='passed'&&ref&&ref.status!=='passed')extra.push(id)
}
const lost=[...candidate].filter(([id,c])=>c.status!=='passed'&&original.get(id)?.status==='passed'&&reference.get(id)?.status!=='passed').length
console.log(`G1 over ${files.size} test files: ${passed}/${gated} reference-passing tests pass on the candidate; ${gate.length} fail, ${missing.length} missing.`)
console.log(`Not gated: ${lost} tests pass on the original but fail on both the reference and the candidate (they read what the npm build hides); ${extra.length} pass on the candidate only.`)
for(const g of gate.slice(0,60))console.log('  FAIL '+g.id+'\n       '+g.message.slice(0,220))
for(const m of missing.slice(0,20))console.log('  MISSING '+m)
process.exit(gate.length||missing.length?1:0)
