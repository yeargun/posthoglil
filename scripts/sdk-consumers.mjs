import {mkdirSync, readFileSync, writeFileSync, rmSync, existsSync} from 'node:fs'
import {join, relative} from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {build} from 'esbuild'
import {rolldown} from 'rolldown'
import {root, upstreamVersion} from './sdk-source.mjs'

export const sha256 = value => createHash('sha256').update(value).digest('hex')
export const fixtures = [
  {id:'standard', optimized:true, code:`import posthog, {PostHog} from 'posthog-js'; export {posthog as default, posthog, PostHog};`},
  {id:'constructor', optimized:true, code:`import {PostHog} from 'posthog-js'; export const client = new PostHog();`},
  {id:'full', optimized:true, code:`import posthog, {PostHog} from 'posthog-js/full/no-external'; export {posthog as default, posthog, PostHog};`},
  {id:'side-effect', optimized:true, code:`import 'posthog-js'; export const marker = 'SDK initialized';`},
  {id:'react-hook', optimized:true, code:`export {usePostHog} from 'posthog-js/react';`},
  {id:'react-all', optimized:true, code:`export * from 'posthog-js/react';`},
  {id:'react-slim', optimized:false, code:`export {usePostHog} from 'posthog-js/react/slim';`},
  {id:'no-external', optimized:false, code:`export {default, posthog, PostHog} from 'posthog-js/no-external';`},
  {id:'lazy', optimized:true, code:`export const load = () => import('posthog-js');`},
]

// Install the real packages under exactly the same dependency name. In particular,
// React's internal posthog-js imports must resolve to the installed SDK singleton.
export function installConsumers() {
  const receipt = JSON.parse(readFileSync(join(root,'artifacts/package/receipt.json'),'utf8'))
  const projects = {}
  for(const variant of ['original','candidate']) {
    const directory = join(root,'.tmp/sdk-apps',variant)
    mkdirSync(directory,{recursive:true})
    const sdk = variant === 'original' ? upstreamVersion : 'file:'+join(root,'artifacts/package',receipt.tarball)
    const identity = variant === 'original' ? upstreamVersion : receipt.integrity
    const stamp = join(directory,'.installed')
    if(!existsSync(stamp) || readFileSync(stamp,'utf8') !== identity) {
      writeFileSync(join(directory,'package.json'),JSON.stringify({name:'posthog-consumer',version:'1.0.0',private:true,type:'module',dependencies:{'posthog-js':sdk,react:'19.2.0','react-dom':'19.2.0'}},null,2)+'\n')
      rmSync(join(directory,'node_modules/posthog-js'),{recursive:true,force:true})
      rmSync(join(directory,'package-lock.json'),{force:true})
      const result=spawnSync('npm',['install','--ignore-scripts','--no-audit','--no-fund'],{cwd:directory,encoding:'utf8',maxBuffer:8*1024*1024})
      if(result.status!==0)throw Error(result.stdout+result.stderr)
      writeFileSync(stamp,identity)
    }
    projects[variant]=directory
  }
  return {projects,receipt}
}

export async function buildConsumer({directory,fixture,bundler,output}) {
  const input=join(directory,'consumer.mjs')
  writeFileSync(input,fixture.code+'\n')
  rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true})
  const started=performance.now()
  let files
  if(bundler==='esbuild') {
    const result=await build({entryPoints:[input],outdir:output,bundle:true,minify:true,write:false,metafile:true,format:'esm',splitting:true,platform:'browser',target:'es2020',legalComments:'none',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'})
    files=result.outputFiles.map(file=>({name:relative(output,file.path),code:file.text}))
  } else {
    const bundle=await rolldown({input,platform:'browser',tsconfig:false,transform:{target:'es2020',define:{'process.env.NODE_ENV':'"production"'}},onwarn(warning){throw Error(warning.message)}})
    try {
      const result=await bundle.generate({format:'es',minify:true,comments:false,entryFileNames:'consumer.js',chunkFileNames:'chunk-[hash].js'})
      files=result.output.map(file=>{
        if(file.type!=='chunk')throw Error('Unexpected consumer asset')
        return {name:file.fileName,code:file.code}
      })
    } finally {await bundle.close()}
  }
  const buildMs=performance.now()-started
  for(const file of files)writeFileSync(join(output,file.name),file.code)
  return {buildMs,files:files.map(({name,code})=>({file:relative(root,join(output,name)),sha256:sha256(code),entry:name==='consumer.js'}))}
}
