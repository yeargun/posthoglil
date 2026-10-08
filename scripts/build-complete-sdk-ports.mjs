import {spawnSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {dirname,join,resolve,relative} from 'node:path'
import ts from 'typescript'
import MagicString from 'magic-string'
import {materializeClassMembers} from './sdk-class-members.mjs'
import {materializeObjectLiterals} from './sdk-object-literals.mjs'
import {summarizeOptimization} from './sdk-optimization-report.mjs'
import {buildConnectedGroup} from './build-connected-sdk-group.mjs'
import {materializeOperators} from './sdk-js-operators.mjs'
import {root,vendor} from './sdk-source.mjs'
import {checkUpstreamPin} from './check-upstream-pin.mjs'
import {completeRows,overriddenSource,completeDirectory,digest,portOutput,implementationInputs} from './complete-sdk.mjs'

checkUpstreamPin()
const compiler=resolve(process.env.LILSCRIPT_COMPILER??join(root,'.tmp/bin/lilscript'))
const compilerSha256=digest(readFileSync(compiler))
mkdirSync(completeDirectory,{recursive:true})
const reportDirectory=join(root,'reports/complete-port')
mkdirSync(reportDirectory,{recursive:true})
const selected=process.argv.find(value=>value.startsWith('--modules='))?.slice(10).split(',')
const objective=process.argv.find(value=>value.startsWith('--objective='))?.slice(12)??'raw'
if(!['raw','gzip','brotli'].includes(objective))throw Error(`Unknown objective: ${objective}`)
const mode=process.argv.includes('--production')?'production':'development'
const config=join(root,'configs/sdk',objective+'.toml')
const configSha256=digest(readFileSync(config))
const compiledGroups=new Set()
for(const row of completeRows){
  if(selected&&!selected.includes(row.source)&&!selected.includes(row.implementation.split('/').at(-1).replace('.lil','')))continue
  if(row.compilationGroup){
    if(compiledGroups.has(row.compilationGroup))continue
    buildConnectedGroup({rows:completeRows.filter(other=>other.compilationGroup===row.compilationGroup),group:row.compilationGroup,objective,mode,compiler,compilerSha256,config,configSha256})
    compiledGroups.add(row.compilationGroup)
    continue
  }
  const source=join(root,row.implementation),output=portOutput(row,objective)
  mkdirSync(dirname(output),{recursive:true})
  const args=[source,'--config',config,'--target','js-module','--mode',mode,'--jobs','1','--cache','off','--logical-work','2000000000','--explain','json','-o',output]
  console.log('Compiling',row.source??row.implementation)
  const start=performance.now()
  const child=spawnSync(compiler,args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,RAYON_NUM_THREADS:'1'}})
  writeFileSync(join(reportDirectory,row.implementation.split('/').at(-1)+'.log'),child.stdout+child.stderr)
  if(child.status!==0)throw Error(child.stderr||child.stdout||`Compiler exited ${child.status}`)
  const explanation=JSON.parse(child.stderr),optimization=summarizeOptimization(explanation,objective)
  const reportFile=join(reportDirectory,'compiler',objective,row.implementation.split('/').at(-1)+'.json')
  mkdirSync(dirname(reportFile),{recursive:true})
  writeFileSync(reportFile,child.stderr)
  const inputs=implementationInputs(row.implementation)
  // Foreign specifiers are a linker contract: the compiler preserves their
  // spelling. Relocate only actual import/export specifiers when moving output
  // away from the source directory; never rewrite matching string literals.
  const externals=new Map()
  for(const input of inputs){
    for(const match of readFileSync(join(root,input.file),'utf8').matchAll(/\bimport\s+extern\b[^;]*?\bfrom\s+"([^"\n]+)"\s*;/g)){
      if(!match[1].startsWith('.'))continue
      const target=resolve(dirname(join(root,input.file)),match[1])
      if(externals.has(match[1])&&externals.get(match[1])!==target)throw Error(`Ambiguous foreign module spelling: ${match[1]}`)
      externals.set(match[1],target)
    }
  }
  const generated=readFileSync(output,'utf8'),compilerOutputSha256=digest(generated)
  const parsed=ts.createSourceFile(output,generated,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const relocated=new MagicString(generated),importRelocations=[]
  for(const statement of parsed.statements){
    if(!ts.isImportDeclaration(statement)&&!ts.isExportDeclaration(statement))continue
    const specifier=statement.moduleSpecifier
    if(!specifier||!ts.isStringLiteral(specifier)||!specifier.text.startsWith('.'))continue
    const target=externals.get(specifier.text)
    if(!target)throw Error(`Unknown relative compiler import: ${specifier.text}`)
    const next=relative(dirname(output),target)
    const value=next.startsWith('.')?next:'./'+next
    relocated.overwrite(specifier.getStart(parsed),specifier.end,JSON.stringify(value))
    importRelocations.push({from:specifier.text,to:value,target:relative(root,target)})
  }
  const classMembers=row.classMembers??[],classBases=row.classBases??[]
  const objectLiterals=row.objectLiterals??[]
  const linked=materializeOperators(materializeObjectLiterals(materializeClassMembers(relocated.toString(),classMembers,readFileSync(overriddenSource(row),'utf8'),classBases),objectLiterals),row.operators??[])
  const linkedAst=ts.createSourceFile(output,linked,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const exported=new Set(linkedAst.statements.flatMap(statement=>ts.isExportDeclaration(statement)&&statement.exportClause&&ts.isNamedExports(statement.exportClause)?statement.exportClause.elements.map(entry=>entry.name.text):[]))
  for(const name of row.exports)if(!exported.has(name))throw Error(`Missing compiled export ${name}: ${row.source}`)
  writeFileSync(output,linked)
  writeFileSync(output+'.json',JSON.stringify({schema:4,objective,mode,configSha256,upstream:row.source??row.bridge,upstreamSha256:digest(readFileSync(overriddenSource(row))),source:row.implementation,sourceSha256:digest(readFileSync(source)),inputs,compilerSha256,compilerOutputSha256,importRelocations,classMembers,classBases,objectLiterals,objectLinkerSha256:digest(readFileSync(join(root,'scripts/sdk-object-literals.mjs'))),linkerSha256:digest(readFileSync(join(root,'scripts/sdk-class-members.mjs'))),outputSha256:digest(readFileSync(output)),optimization,compilerReport:{file:relative(root,reportFile),sha256:digest(child.stderr)},seconds:(performance.now()-start)/1000,command:[compiler,...args]},null,2)+'\n')
  console.log(`  scalarized ${optimization.rules.scalarizedAllocations}; property mangling ${optimization.selected.propertyMangling?'selected':'not selected'}; structural inventory ${optimization.search.inventoryReached?'reached':optimization.search.structuralSearchEnabled?'not reached':'disabled at this effort'}`)
}
