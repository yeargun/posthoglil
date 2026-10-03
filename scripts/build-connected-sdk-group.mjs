import {spawnSync} from 'node:child_process'
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs'
import {dirname, join, relative, resolve} from 'node:path'
import ts from 'typescript'
import MagicString from 'magic-string'
import {root} from './sdk-source.mjs'
import {digest, portOutput, implementationInputs, overriddenSource} from './complete-sdk.mjs'
import {summarizeOptimization} from './sdk-optimization-report.mjs'
import {materializeOperators} from './sdk-js-operators.mjs'

// One compiler invocation owns the entire connected graph. Split delivery keeps
// a single instance of shared state when different SDK entries are imported.
export function buildConnectedGroup({rows, group, objective, mode, compiler, compilerSha256, config, configSha256}) {
  if (!/^[a-z0-9-]+$/.test(group)) throw Error(`Invalid compilation group: ${group}`)
  if (rows.some(row => row.classMembers?.length || row.classBases?.length || row.objectLiterals?.length)) {
    throw Error(`Connected group ${group} needs a native ABI linker before including these modules`)
  }
  const directory = join(root, 'dist/sdk-complete', objective, 'groups', group)
  mkdirSync(directory, {recursive:true})
  const names = new Map(rows.map(row => [row, row.implementation.split('/').at(-1).replace(/\.lil$/, '')]))
  if (new Set(names.values()).size !== rows.length) throw Error('Duplicate connected entry name')
  const args = [...rows.flatMap(row => ['--entry', `${names.get(row)}=${join(root,row.implementation)}`]),
    '--delivery','split','--config',config,'--target','js-module','--mode',mode,'--jobs','1',
    '--cache','off','--logical-work','2000000000','--explain','json','--out-dir',directory]
  console.log(`Compiling connected ${group}: ${rows.length} modules (${objective}, one worker)`)
  const started = performance.now()
  const child = spawnSync(compiler,args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,env:{...process.env,RAYON_NUM_THREADS:'1'}})
  const reportFile = join(root,'reports/complete-port/compiler',objective,`${group}.group.json`)
  mkdirSync(dirname(reportFile),{recursive:true})
  writeFileSync(reportFile+'.log',child.stdout+child.stderr)
  if(child.status!==0)throw Error(child.stderr||child.stdout||`Compiler exited ${child.status}`)
  writeFileSync(reportFile,child.stderr)
  const optimization=summarizeOptimization(JSON.parse(child.stderr),objective)
  const manifest=JSON.parse(readFileSync(join(directory,'lilscript.manifest.json'),'utf8'))
  if(manifest.outputs.length!==1)throw Error('Expected one connected output')
  const delivery=manifest.outputs[0], files=new Set(delivery.files.map(file=>file.file))
  const inputs=[...new Map(rows.flatMap(row=>implementationInputs(row.implementation)).map(input=>[input.file,input])).values()].sort((a,b)=>a.file.localeCompare(b.file))
  const externals=new Map()
  for(const input of inputs){
    for(const match of readFileSync(join(root,input.file),'utf8').matchAll(/\bimport\s+extern\b[^;]*?\bfrom\s+"([^"\n]+)"\s*;/g)){
      if(!match[1].startsWith('.'))continue
      const target=resolve(dirname(join(root,input.file)),match[1])
      if(externals.has(match[1])&&externals.get(match[1])!==target)throw Error(`Ambiguous foreign module: ${match[1]}`)
      externals.set(match[1],target)
    }
  }
  for(const file of delivery.files){
    const path=join(directory,file.file),code=readFileSync(path,'utf8')
    const ast=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=new MagicString(code)
    for(const statement of ast.statements){
      if(!ts.isImportDeclaration(statement)&&!ts.isExportDeclaration(statement))continue
      const specifier=statement.moduleSpecifier
      if(!specifier||!ts.isStringLiteral(specifier)||!specifier.text.startsWith('.'))continue
      const relativeFile=relative(directory,resolve(dirname(path),specifier.text))
      if(files.has(relativeFile))continue
      const target=externals.get(specifier.text)
      if(!target)throw Error(`Unknown connected foreign request: ${specifier.text}`)
      let next=relative(dirname(path),target)
      if(!next.startsWith('.'))next='./'+next
      edits.overwrite(specifier.getStart(ast),specifier.end,JSON.stringify(next))
    }
    writeFileSync(path,materializeOperators(edits.toString(),rows.flatMap(row=>row.operators??[])))
  }
  const sharedArtifacts=[...files].map(file=>({file:relative(root,join(directory,file)),sha256:digest(readFileSync(join(directory,file)))}))
  const seconds=(performance.now()-started)/1000
  for(const row of rows){
    const entry=delivery.entries.find(entry=>entry.name===names.get(row))
    if(!entry)throw Error(`Missing connected entry: ${names.get(row)}`)
    const output=portOutput(row,objective),target=join(directory,entry.file)
    const code=readFileSync(target,'utf8'),ast=ts.createSourceFile(target,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
    const exported=new Set(ast.statements.flatMap(s=>ts.isExportDeclaration(s)&&s.exportClause&&ts.isNamedExports(s.exportClause)?s.exportClause.elements.map(e=>e.name.text):[]))
    for(const name of row.exports)if(!exported.has(name))throw Error(`Connected export missing: ${row.source}#${name}`)
    mkdirSync(dirname(output),{recursive:true})
    let specifier=relative(dirname(output),target)
    if(!specifier.startsWith('.'))specifier='./'+specifier
    writeFileSync(output,`export {${row.exports.join(',')}} from ${JSON.stringify(specifier)};\n`)
    writeFileSync(output+'.json',JSON.stringify({schema:5,group,groupSources:rows.map(row=>row.implementation),objective,mode,configSha256,
      upstream:row.source,upstreamSha256:digest(readFileSync(overriddenSource(row))),source:row.implementation,
      sourceSha256:digest(readFileSync(join(root,row.implementation))),inputs,compilerSha256,sharedArtifacts,
      operators:row.operators??[],operatorLinkerSha256:digest(readFileSync(join(root,'scripts/sdk-js-operators.mjs'))),
      outputSha256:digest(readFileSync(output)),optimization,compilerReport:{file:relative(root,reportFile),sha256:digest(child.stderr)},
      // Count this compilation once when several of its facades reach a bundle.
      buildId:`${group}:${objective}`,seconds,command:[compiler,...args]},null,2)+'\n')
  }
  console.log(`  ${files.size} files; shared state emitted once; ${seconds.toFixed(2)}s`)
}
