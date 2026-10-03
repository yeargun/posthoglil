import {mkdir,writeFile,cp,readdir,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {buildPackage} from './compiler-package.mjs'
import {root} from './sdk-source.mjs'
const ids=['posthog','surveys','error-tracking','otlp','autocapture','replay-core']
const selected=ids
const profiles=[]
await mkdir(join(root,'configs/utilities'),{recursive:true})
for(const id of selected)for(const objective of ['raw','gzip','brotli']){
  const name=`${id}-${objective}`
  const entry=id==='posthog'?'entry.lil':`${id}-entry.lil`
  const filename=objective==='brotli'?`${id}.esm.js`:`${id}.${objective}.js`
  let config=`[policy]\nversion = 3\n[javascript]\npriority = "size-first"\nassume_pristine_builtins = false\nkeep_published_function_names = true\n[effort]\nlevel = 13\n[objective]\ncodecs = "${objective}"\n[mangle]\nidentifiers = true\nproperties = true\npool_strings = true\n[delivery]\nmode = "single"\ndirectory = "."\nselect = ["index"]\nentry_names = "${filename}"\n[delivery.entries]\nindex = "../../src/${entry}"\n`
  if(objective==='brotli')config+=`[[delivery.also]]\nname = "cjs"\nentries = ["index"]\nformat = "cjs"\nes_module_marker = "always"\nentry_names = "${id}.cjs"\n`
  if(id==='posthog'&&objective==='brotli'){
    config=config.replace('[delivery.entries]\n','[delivery.entries]\nbrowser = "../../src/browser.lil"\n')
    config+='[[delivery.also]]\nname = "browser"\nentries = ["browser"]\nformat = "iife"\nexports = "default"\nglobal = "posthogLil"\nglobal_binding = "property"\nentry_names = "posthog.umd.js"\n'
  }
  const path=`configs/utilities/${name}.toml`;await writeFile(join(root,path),config)
  profiles.push({name,config:path,mode:'production'})
}
// Stage this independently owned group so rebuilding utilities retains the SDK.
const report=await buildPackage({root,profiles,destination:'.tmp/utilities-release',sideEffects:false,
  assets:selected.map(id=>({source:`types/${id}.d.ts`,destination:`${id}.d.ts`}))})
await mkdir(join(root,'dist'),{recursive:true})
for(const name of await readdir(join(root,'.tmp/utilities-release')))await cp(join(root,'.tmp/utilities-release',name),join(root,'dist',name),{recursive:true})
await mkdir(join(root,'artifacts/utilities'),{recursive:true})
await writeFile(join(root,'artifacts/utilities/build.json'),JSON.stringify(report,null,2)+'\n')

const manifest=JSON.parse(await readFile(join(root,'dist/lilscript.manifest.json'),'utf8'))
const packagePath=join(root,'package.json'),pkg=JSON.parse(await readFile(packagePath,'utf8'))
pkg.sideEffects=[...new Set(manifest.outputs.flatMap(row=>row.side_effects.map(file=>'./dist/'+file)))].sort()
await writeFile(packagePath,JSON.stringify(pkg,null,2)+'\n')
