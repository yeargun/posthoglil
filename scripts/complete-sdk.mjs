import {createHash} from 'node:crypto'
import {readFileSync,existsSync} from 'node:fs'
import {dirname,join,relative,resolve} from 'node:path'
import {root,vendor,upstreamVersion,upstreamCommit} from './sdk-source.mjs'

export const completeManifest=JSON.parse(readFileSync(join(root,'src/sdk/manifest.json'),'utf8'))
export const completeRows=[...(completeManifest.supportModules??[]),...completeManifest.modules]
export const overriddenSource=row=>row.bridge?join(root,row.bridge):join(vendor,row.source)
export const digest=value=>createHash('sha256').update(value).digest('hex')
export function implementationInputs(entry){
  const inputs=new Map()
  function visit(path){
    path=resolve(root,path)
    if(inputs.has(path))return
    const bytes=readFileSync(path),code=bytes.toString()
    inputs.set(path,{file:relative(root,path),sha256:digest(bytes)})
    for(const match of code.matchAll(/\bimport\s+(?!extern\b)[^;]*?\bfrom\s+"([^"\n]+\.lil)"\s*;/g))visit(resolve(dirname(path),match[1]))
  }
  visit(entry)
  return [...inputs.values()].sort((a,b)=>a.file.localeCompare(b.file))
}
export const completeDirectory=join(root,'dist/sdk-complete')
export function portOutput(row,objective='raw'){
  if(!['raw','gzip','brotli'].includes(objective))throw Error('Unknown compiler objective')
  return join(completeDirectory,objective,row.implementation.replace(/^src\//,'').replace(/\.lil$/,'.mjs'))
}
export function completeOverrides(objective='raw'){
  if(completeManifest.upstreamVersion!==upstreamVersion||completeManifest.upstreamCommit!==upstreamCommit)throw Error('Complete SDK manifest is stale')
  return new Map(completeRows.map(row=>{
    const output=portOutput(row,objective)
    if(!existsSync(output))throw Error(`Compile whole-module port first: ${row.source}`)
    const receipt=JSON.parse(readFileSync(output+'.json','utf8'))
    if(JSON.stringify(receipt.operators??[])!==JSON.stringify(row.operators??[]))throw Error(`Operator ABI changed: ${row.source}`)
    if(row.operators?.length&&receipt.operatorLinkerSha256!==digest(readFileSync(join(root,'scripts/sdk-js-operators.mjs'))))throw Error(`Operator ABI linker changed: ${row.source}`)
    if(JSON.stringify(receipt.objectLiterals??[])!==JSON.stringify(row.objectLiterals??[]))throw Error(`Object ABI changed: ${row.source}`)
    if((row.objectLiterals??[]).length&&receipt.objectLinkerSha256!==digest(readFileSync(join(root,'scripts/sdk-object-literals.mjs'))))throw Error(`Object ABI linker changed: ${row.source}`)
    if(JSON.stringify(receipt.classMembers??[])!==JSON.stringify(row.classMembers??[]))throw Error(`Class ABI changed: ${row.source}`)
    if(JSON.stringify(receipt.classBases??[])!==JSON.stringify(row.classBases??[]))throw Error(`Class base ABI changed: ${row.source}`)
    if(((row.classMembers??[]).length||(row.classBases??[]).length)&&receipt.linkerSha256!==digest(readFileSync(join(root,'scripts/sdk-class-members.mjs'))))throw Error(`Class ABI linker changed: ${row.source}`)
    if(receipt.objective!==objective)throw Error(`Wrong compiler objective: ${row.source}`)
    if(receipt.configSha256!==digest(readFileSync(join(root,'configs/sdk',objective+'.toml'))))throw Error(`Whole-module port config changed: ${row.source}`)
    const source=overriddenSource(row),implementation=join(root,row.implementation)
    if(receipt.upstreamSha256!==digest(readFileSync(source))||receipt.sourceSha256!==digest(readFileSync(implementation))||receipt.outputSha256!==digest(readFileSync(output)))throw Error(`Whole-module port receipt is stale: ${row.source}`)
    const groupSources=row.compilationGroup?completeRows.filter(other=>other.compilationGroup===row.compilationGroup).map(other=>other.implementation):[row.implementation]
    if(row.compilationGroup&&(receipt.group!==row.compilationGroup||JSON.stringify(receipt.groupSources)!==JSON.stringify(groupSources)))throw Error(`Connected SDK group changed: ${row.source}`)
    const inputs=[...new Map(groupSources.flatMap(implementationInputs).map(input=>[input.file,input])).values()].sort((a,b)=>a.file.localeCompare(b.file))
    if(JSON.stringify(receipt.inputs)!==JSON.stringify(inputs))throw Error(`Whole-module port dependency changed: ${row.source}`)
    if(row.compilationGroup&&!receipt.sharedArtifacts?.length)throw Error(`Missing connected artifacts: ${row.source}`)
    for(const artifact of receipt.sharedArtifacts??[])if(digest(readFileSync(join(root,artifact.file)))!==artifact.sha256)throw Error(`Connected SDK artifact changed: ${artifact.file}`)
    return [resolve(source),`export {${row.exports.join(',')}} from ${JSON.stringify(output)};`]
  }))
}
