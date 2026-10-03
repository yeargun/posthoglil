import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises'
import {join,basename} from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {transform} from 'esbuild'
import {composeMaps,withoutMapComment,withMapComment} from './source-maps.mjs'
import {root,upstreamVersion} from './sdk-source.mjs'
import {checkUpstreamPin} from './check-upstream-pin.mjs'

checkUpstreamPin()

// Preserve the published package layout and exact canonical declarations.
// The tarball installs under the posthog-js dependency key, keeping existing
// app imports and upstream React bindings pointed at the same SDK instance.
const output=join(root,'.tmp/browser-package')
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true})
await cp(join(root,'node_modules/posthog-upstream'),output,{recursive:true})
const manifest=JSON.parse(await readFile(join(output,'package.json'),'utf8'))
manifest.name='@itslil/posthog-browser'
manifest.version=upstreamVersion+'-lil.1'
manifest.description='PostHog browser analytics SDK with optimized LilScript internals; upstream API, React bindings and package layout.'
manifest.repository={type:'git',url:'git+https://github.com/yeargun/posthoglil.git'}
manifest.homepage='https://yeargun.github.io/posthoglil/'
manifest.bugs={url:'https://github.com/yeargun/posthoglil/issues'}
manifest.publishConfig={access:'public'}
manifest.scripts={};delete manifest.devDependencies
manifest.dependencies=Object.fromEntries(Object.entries(manifest.dependencies).map(([name,version])=>[name,version.replace(/^\^/,'')]))
manifest.files.push('SDK-BUILD.json','NOTICE.md','licenses/**')
await cp(join(root,'licenses'),join(output,'licenses'),{recursive:true})
await writeFile(join(output,'package.json'),JSON.stringify(manifest,null,2)+'\n')
const results=JSON.parse(await readFile(join(root,'artifacts/package-runtime/results.json'),'utf8'))
const replacements=[]
for(const surface of results.rows){
  const selected=surface.candidate
  const code=await readFile(join(root,selected.file),'utf8')
  await cp(join(root,selected.sourceMap.file),join(output,'dist',basename(selected.sourceMap.file)))
  const names=surface.surface==='standard'?['module.js','module.mjs']:['module.full.no-external.js']
  for(const name of names){
    await writeFile(join(output,'dist',name),code)
    await rm(join(output,'dist',name+'.map'),{force:true})
    replacements.push({file:'dist/'+name,sha256:selected.sha256,objective:'package',sourceObjective:surface.compilerObjective})
  }
  const cjsName=surface.surface==='standard'?'main.js':'module.full.no-external.cjs'
  const adapted=await transform(withoutMapComment(code),{loader:'js',format:'cjs',target:'es2015',minifyWhitespace:true,legalComments:'none',sourcemap:'external',sourcefile:'sdk.mjs'})
  const cjs=withMapComment(adapted.code,cjsName+'.map')
  const cjsMap=composeMaps(adapted.map,JSON.parse(await readFile(join(root,selected.sourceMap.file),'utf8')))
  await writeFile(join(output,'dist',cjsName+'.map'),JSON.stringify({...cjsMap,file:cjsName})+'\n')
  await writeFile(join(output,'dist',cjsName),cjs)
  replacements.push({file:'dist/'+cjsName,sha256:createHash('sha256').update(cjs).digest('hex'),objective:'package',sourceObjective:surface.compilerObjective,formatAdapter:'esbuild CJS'})
}
const receipt={upstreamVersion,packageVersion:manifest.version,status:'release candidate; not published to npm',installAs:'posthog-js',optimizedEntries:['posthog-js','posthog-js/full/no-external'],otherEntries:'Exact upstream runtime artifacts; no size claim for these entries.',defaultObjective:'package',compilerObjective:results.compilerObjective,runtimeReceipt:'artifacts/package-runtime/results.json',sourceMaps:'Rebuilt maps with embedded upstream TypeScript and generated LilScript JavaScript for every replaced ESM/CJS entry. LilScript source-level mapping is not supplied.',declarations:'Exact upstream dist/module.d.ts; shared by the entrypoint manifests.',replacements}
await writeFile(join(output,'SDK-BUILD.json'),JSON.stringify(receipt,null,2)+'\n')
await writeFile(join(output,'NOTICE.md'),await readFile(join(root,'NOTICE.md')))
await writeFile(join(output,'README.md'),`# PostHog LilScript SDK preview\n\nExperimental posthog-js ${upstreamVersion} integration. Install this tarball under the posthog-js dependency key to retain existing imports and React bindings. See https://yeargun.github.io/posthoglil/ for scope, size and runtime measurements. This is an independent project, not an official PostHog release.\n\nOnly the root and full/no-external runtime entries contain LilScript internals. Other entrypoints remain upstream. SDK-BUILD.json records exact changes.\n`)
await mkdir(join(root,'artifacts/package'),{recursive:true})
const packed=spawnSync('npm',['pack',output,'--pack-destination',join(root,'artifacts/package'),'--json','--ignore-scripts'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024})
if(packed.status!==0)throw Error(packed.stderr)
const [info]=JSON.parse(packed.stdout)
await writeFile(join(root,'artifacts/package/receipt.json'),JSON.stringify({...receipt,tarball:info.filename,integrity:info.integrity,shasum:info.shasum,size:info.size,unpackedSize:info.unpackedSize},null,2)+'\n')
console.log(info.filename,info.size,'bytes')
