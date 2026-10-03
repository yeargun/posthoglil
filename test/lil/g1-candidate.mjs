// Compile every ported module (src/posthog/<package>/<path>.lil mirrors
// vendor/posthog-js/packages/<package>/src/<path>.ts) as one split LilScript build, then write
// the G1 substitution map. With --test, run the upstream test files given (or those that import
// a ported module) against the candidate.
//
//   node test/lil/g1-candidate.mjs [--config=configs/lil/g1.toml] [--test[=a.test.ts,b.spec.ts]]
import {spawnSync} from 'node:child_process'
import {existsSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync,statSync} from 'node:fs'
import {join,relative} from 'node:path'
import {root,vendor} from '../../scripts/sdk-source.mjs'

const arg=(name,fallback)=>{const a=process.argv.find(x=>x===`--${name}`||x.startsWith(`--${name}=`));return a===undefined?fallback:a.includes('=')?a.slice(name.length+3):true}
const compiler=process.env.LILSCRIPT_COMPILER??join(process.env.HOME,'lilscript-work/bin/posthog100/lilscript')
const config=join(root,arg('config','configs/lil/g1.toml'))
const sourceRoot=join(root,'src/posthog')
const out=join(root,'reports/lil-sdk/g1-candidate')

function walk(dir,files=[]){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())walk(p,files);else if(e.name.endsWith('.lil'))files.push(p)}return files}
const modules=[]
for(const file of walk(sourceRoot).sort()){
  const rel=relative(sourceRoot,file).replace(/\.lil$/,'')
  const [pkg,...rest]=rel.split('/')
  if(pkg==='lil')continue // shared LilScript-only modules (views, helpers) have no upstream twin
  const base=join(vendor,'packages',pkg,'src',...rest)
  const upstream=['.ts','.tsx'].map(x=>base+x).find(existsSync)
  if(!upstream)throw Error(`${relative(root,file)} mirrors no upstream module`)
  modules.push({file,upstream:relative(vendor,upstream),name:rel.replace(/[^A-Za-z0-9]+/g,'_')})
}
rmSync(join(out,'build'),{recursive:true,force:true})
mkdirSync(out,{recursive:true})
const args=[...modules.flatMap(m=>['--entry',`${m.name}=${m.file}`]),'--delivery','split','--config',config,
  '--target','js-module','--mode','production','--jobs','1','--out-dir',join(out,'build')]
const started=performance.now()
const compiled=spawnSync(compiler,args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,env:{...process.env,RAYON_NUM_THREADS:'1'}})
const seconds=((performance.now()-started)/1000).toFixed(2)
if(compiled.status!==0){process.stderr.write(compiled.stderr+compiled.stdout);process.exit(1)}
writeFileSync(join(out,'entries.json'),JSON.stringify(Object.fromEntries(modules.map(m=>[m.upstream,m.name])),null,1)+'\n')
const mapped=spawnSync(process.execPath,[join(root,'test/lil/g1-build.mjs'),'candidate',`--manifest=${join(out,'build/lilscript.manifest.json')}`,`--entries=${join(out,'entries.json')}`],{cwd:root,encoding:'utf8'})
if(mapped.status!==0){process.stderr.write(mapped.stderr+mapped.stdout);process.exit(1)}
console.log(`compiled ${modules.length} modules in ${seconds}s`)

const test=arg('test',false)
if(test){
  let files
  if(test===true){
    // upstream test files that import one of the ported modules
    const all=readFileSync(join(root,'test/lil/upstream-tests.txt'),'utf8').trim().split('\n')
    const stems=modules.map(m=>m.upstream.replace(/^packages\/[^/]+\/src\//,'').replace(/\.tsx?$/,''))
    files=all.filter(t=>{const code=readFileSync(join(vendor,t),'utf8');return stems.some(s=>code.includes(`/${s.split('/').at(-1)}'`)||code.includes(`/${s.split('/').at(-1)}"`))})
  }else files=test.split(',')
  console.log(`testing ${files.length} upstream test files against the candidate`)
  const env={...process.env,POSTHOGLIL_G1_MODE:'candidate',POSTHOGLIL_G1_MAP:join(out,'map.json'),POSTHOGLIL_G1_TESTS:files.join(','),POSTHOGLIL_G1_REPORT:join(out,'tests.json')}
  const run=spawnSync('flock',[join(process.env.HOME,'lilscript-work/portwork/posthog-100/heavy.lock'),process.execPath,join(root,'node_modules/vitest/vitest.mjs'),'run','--config','test/lil/upstream.config.mjs'],{cwd:root,encoding:'utf8',env,maxBuffer:256*1024*1024})
  writeFileSync(join(out,'tests.log'),run.stdout+run.stderr)
  const summary=(run.stdout+run.stderr).split('\n').filter(l=>/Test Files|Tests  /.test(l)).join('\n')
  console.log(summary)
}
