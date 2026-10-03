import {mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {compilerPath} from './compiler-package.mjs'
import {root} from './sdk-source.mjs'
const compiler=await compilerPath(root,process.env.LILSCRIPT_COMPILER??join(root,'.tmp/bin/lilscript'))
mkdirSync(join(root,'.tmp'),{recursive:true})
for(const id of ['posthog','surveys','error-tracking','otlp','autocapture','replay-core']){
  if(id==='posthog'&&process.argv.includes('--packs'))continue
  const entry=id==='posthog'?'entry.lil':id+'-entry.lil'
  const result=spawnSync(compiler,[join(root,'src',entry),'--config',join(root,'lilscript.dev.toml'),'--target','js-module','--mode','development','--jobs','1','--cache','off','-o',join(root,'.tmp',id+'.dev.js')],{cwd:root,stdio:'inherit'})
  if(result.status!==0)process.exit(result.status??1)
}
