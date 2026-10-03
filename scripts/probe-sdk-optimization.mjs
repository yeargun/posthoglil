// Isolated effort/resource experiment. Never overwrites registered artifacts.
// All compilation, bundling and compression is deliberately sequential.
import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve,relative,basename} from 'node:path'
import ts from 'typescript'
import MagicString from 'magic-string'
import {root,vendor,bundleSdk} from './sdk-source.mjs'
import {completeManifest,completeOverrides,portOutput,digest} from './complete-sdk.mjs'
import {materializeClassMembers} from './sdk-class-members.mjs'
import {materializeObjectLiterals} from './sdk-object-literals.mjs'
import {summarizeOptimization} from './sdk-optimization-report.mjs'
import {minifySdk} from './sdk-minify.mjs'
import {measureFile} from './codec.mjs'

const option=(name,fallback)=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3)??fallback
const modules=option('modules','posthog-core').split(',')
const effort=Number(option('effort','15')),work=Number(option('logical-work','20000000000'))
const protection=option('protect-effort','default')
const objectives=option('objectives','raw,gzip,brotli').split(',')
if(!Number.isInteger(effort)||effort<0||effort>16||!Number.isSafeInteger(work)||work<=0||!['default','true','false'].includes(protection)||objectives.some(value=>!['raw','gzip','brotli'].includes(value)))throw Error('Invalid effort, work limit, protection or objectives')
const selected=modules.map(name=>{
  const row=completeManifest.modules.find(row=>basename(row.implementation,'.lil')===name||row.source===name)
  if(!row)throw Error(`Unregistered module: ${name}`)
  return row
})
const compiler=resolve(process.env.LILSCRIPT_COMPILER??join(root,'.tmp/bin/lilscript'))
const directory=join(root,'reports/complete-port/effort-probes',`${selected.map(row=>basename(row.implementation,'.lil')).join('+')}-effort${effort}-work${work}${protection==='default'?'':'-protection'+protection}`)
mkdirSync(directory,{recursive:true})
const results={generatedAt:new Date().toISOString(),effort,work,protection,compilerSha256:digest(readFileSync(compiler)),scope:'Private effort/resource probe of selected modules within the current partial implementation. Not a qualified release or runtime result.',modules:selected.map(row=>row.source),rows:[]}
const persist=()=>writeFileSync(join(directory,'results.json'),JSON.stringify(results,null,2)+'\n')
for(const objective of objectives){
  const overrides=completeOverrides(objective),experiments=[]
  const config=join(directory,objective+'.toml')
  const policy=readFileSync(join(root,'configs/sdk',objective+'.toml'),'utf8').replace(/level\s*=\s*\d+/,`level = ${effort}`)
  if(protection!=='default'&&/^\[policy\.search\]/m.test(policy))throw Error('Review existing search policy before overriding protection')
  writeFileSync(config,policy+(protection==='default'?'':`\n[policy.search]\nprotect_effort = ${protection}\n`))
  for(const row of selected){
    const previous=JSON.parse(readFileSync(portOutput(row,objective)+'.json','utf8'))
    const output=join(directory,objective+'-'+basename(row.implementation,'.lil')+'.mjs')
    const args=[join(root,row.implementation),'--config',config,'--target','js-module','--mode','production','--jobs','1','--cache','off','--logical-work',String(work),'--explain','json','-o',output]
    console.log(`Probing ${objective} ${row.source}, effort ${effort}, work ${work}`)
    const child=spawnSync(compiler,args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,env:{...process.env,RAYON_NUM_THREADS:'1'}})
    writeFileSync(output+'.explain.json',child.stderr)
    if(child.status!==0)throw Error(child.stderr||child.stdout||`Compiler exited ${child.status}`)
    const explanation=JSON.parse(child.stderr),optimization=summarizeOptimization(explanation,objective)
    const raw=readFileSync(output,'utf8'),text=new MagicString(raw),ast=ts.createSourceFile(output,raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
    for(const node of ast.statements){
      if(!ts.isImportDeclaration(node)&&!ts.isExportDeclaration(node))continue
      const specifier=node.moduleSpecifier
      if(!specifier||!ts.isStringLiteral(specifier)||!specifier.text.startsWith('.'))continue
      const relocation=previous.importRelocations.find(item=>item.from===specifier.text)
      if(!relocation)throw Error(`Unknown probe import ${specifier.text}`)
      text.overwrite(specifier.getStart(ast),specifier.end,JSON.stringify(join(root,relocation.target)))
    }
    const linked=materializeObjectLiterals(materializeClassMembers(text.toString(),row.classMembers??[],readFileSync(join(vendor,row.source),'utf8'),row.classBases??[]),row.objectLiterals??[])
    writeFileSync(output,linked)
    overrides.set(join(vendor,row.source),`export {${row.exports.join(',')}} from ${JSON.stringify(output)};`)
    experiments.push({source:row.source,sourceSha256:previous.sourceSha256,output:relative(root,output),outputSha256:digest(linked),optimization,command:[compiler,...args]})
    console.log(`  ${optimization.seconds.toFixed(2)}s; requested-tier inventory reached: ${optimization.search.inventoryReached}; stop: ${optimization.search.stop??'none'}`)
  }
  for(const surface of ['standard','full']){
    const row={surface,objective,experiments,variants:[]}
    results.rows.push(row)
    for(const variant of ['original','registered','probe']){
      const bundled=await bundleSdk({surface,overrides:variant==='original'?new Map():variant==='registered'?completeOverrides(objective):overrides})
      if(bundled.extras.length)throw Error('Unaccounted delivery asset')
      for(const lane of ['oxc','terser']){
        const code=await minifySdk(bundled.code,{surface,lane}),file=join(directory,`${surface}-${objective}-${variant}-${lane}.mjs`)
        writeFileSync(file,code)
        row.variants.push({variant,lane,file:relative(root,file),sha256:digest(code),...measureFile(file)})
      }
    }
    const metric={raw:'raw',gzip:'gzip9',brotli:'brotli11'}[objective]
    console.log(surface,objective,...['original','registered','probe'].map(variant=>`${variant}: ${Math.min(...row.variants.filter(r=>r.variant===variant).map(r=>r[metric]))}`))
    persist()
  }
}
