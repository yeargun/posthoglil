import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {createServer} from 'node:http'
import {build} from 'esbuild'
import {SourceMapConsumer} from '@jridgewell/source-map'
import {chromium} from '@playwright/test'
import {root} from '../scripts/sdk-source.mjs'
mkdirSync(join(root,'reports/full-sdk'),{recursive:true})

const receipt=JSON.parse(readFileSync(join(root,'artifacts/package/receipt.json'),'utf8'))
const consumer=join(root,'.tmp/sdk-consumer')
mkdirSync(consumer,{recursive:true})
writeFileSync(join(consumer,'package.json'),JSON.stringify({name:'posthog-sdk-consumer',version:'1.0.0',private:true,dependencies:{'posthog-js':'file:'+join(root,'artifacts/package',receipt.tarball),react:'19.2.0','react-dom':'19.2.0'}},null,2))
rmSync(join(consumer,'node_modules/posthog-js'),{recursive:true,force:true})
rmSync(join(consumer,'package-lock.json'),{force:true})
const installed=spawnSync('npm',['install','--ignore-scripts','--no-audit','--no-fund'],{cwd:consumer,encoding:'utf8',maxBuffer:8*1024*1024})
if(installed.status!==0)throw Error(installed.stderr)
const require=createRequire(join(consumer,'package.json'))
const candidate=require('posthog-js'),original=createRequire(import.meta.url)('posthog-upstream')
assert.deepEqual(Object.keys(candidate).sort(),Object.keys(original).sort())
assert.equal(candidate.default,candidate.posthog)
assert.ok(candidate.default instanceof candidate.PostHog)
assert.equal(typeof require('posthog-js/full/no-external').default.capture,'function')
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex')
assert.equal(sha(join(consumer,'node_modules/posthog-js/dist/module.d.ts')),sha(join(root,'node_modules/posthog-upstream/dist/module.d.ts')))
for(const replacement of receipt.replacements){
  const file=join(consumer,'node_modules/posthog-js',replacement.file)
  assert.equal(sha(file),replacement.sha256,'packed file matches the measured replacement')
  const code=readFileSync(file,'utf8'),url=code.match(/sourceMappingURL=([^\s]+)/)?.[1]
  assert.ok(url,'replaced SDK entry has an external source map')
  const map=new SourceMapConsumer(JSON.parse(readFileSync(join(dirname(file),url),'utf8')))
  assert.ok(map.sources.some(source=>source.endsWith('/posthog-core.ts')))
  assert.ok(map.sources.some(source=>source.includes('dist/sdk-internals/')))
  assert.ok(map.hasContentsOfAllSources(),'embedded sources allow debugging without this checkout')
  let coreMappings=0
  const generatedLines=code.split('\n'),sourceLines=new Map()
  map.eachMapping(mapping=>{
    if(!mapping.source?.endsWith('/posthog-core.ts'))return
    coreMappings++
    if(!sourceLines.has(mapping.source))sourceLines.set(mapping.source,map.sourceContentFor(mapping.source).split('\n'))
    const original=sourceLines.get(mapping.source)[mapping.originalLine-1]
    assert.ok(original!==undefined&&mapping.originalColumn<=original.length,'source location exists')
    assert.ok(generatedLines[mapping.generatedLine-1]?.length>=mapping.generatedColumn,'generated location exists')
  })
  assert.ok(coreMappings>100,'runtime maps contain real upstream implementation positions')
}

for(const path of ['react','full','full/no-external','no-external','customizations','rrweb','rrweb-types','rrweb-plugin-console-record'])assert.ok(require.resolve('posthog-js/'+path))
const React=require('react'),{renderToString}=require('react-dom/server'),{PostHogProvider}=require('posthog-js/react')
const rendered=renderToString(React.createElement(PostHogProvider,{client:candidate.default},React.createElement('span',null,'SSR works')))
assert.equal(rendered,'<span>SSR works</span>')
writeFileSync(join(consumer,'consumer.tsx'),`import posthog, { PostHog } from 'posthog-js'
import full from 'posthog-js/full/no-external'
import { PostHogProvider, usePostHog, useFeatureFlagEnabled } from 'posthog-js/react'
import { createRoot } from 'react-dom/client'
const compatible: PostHog = full
let events = 0
posthog.init('phc_consumer_local_only', { api_host: location.origin, persistence: 'memory', capture_pageview: false, capture_pageleave:false, autocapture:false, disable_session_recording:true, disable_surveys:true, advanced_disable_flags:true, opt_out_useragent_filter:true, bootstrap:{distinctID:'consumer',featureFlags:{premium:true}}, before_send:event=>{if(event?.event==='react click')events++;return null} })
function Child(){ const client=usePostHog(); const premium=useFeatureFlagEnabled('premium'); return <button id="react-capture" onClick={()=>{client.capture('react click',{_public_key:'intact'});document.querySelector('#result')!.textContent=String(client===posthog)+':'+events}}>Premium {String(premium)}</button> }
createRoot(document.querySelector('#root')!).render(<PostHogProvider client={posthog}><Child/></PostHogProvider>)
void compatible
`)
writeFileSync(join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noEmit:true,skipLibCheck:false,target:'ES2020',module:'ESNext',moduleResolution:'Bundler',jsx:'react-jsx',lib:['ES2020','DOM'],types:['react','react-dom']},include:['consumer.tsx']},null,2))
const types=spawnSync(process.execPath,[join(root,'node_modules/typescript/bin/tsc'),'--project',join(consumer,'tsconfig.json')],{cwd:consumer,encoding:'utf8',maxBuffer:8*1024*1024})
writeFileSync(join(root,'reports/full-sdk/consumer-types.log'),types.stdout+types.stderr)
if(types.status!==0)throw Error(types.stdout+types.stderr)
const bundled=await build({absWorkingDir:consumer,entryPoints:['consumer.tsx'],bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'})
const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(bundled.outputFiles[0].text)}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><div id="root"></div><output id="result"></output><script src="/app.js"></script>')}})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({args:['--no-sandbox']})
try{
  const page=await browser.newPage();const errors=[]
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort())
  page.on('pageerror',error=>errors.push(String(error)))
  await page.goto(origin)
  await page.waitForSelector('#react-capture')
  assert.equal(await page.textContent('#react-capture'),'Premium true')
  await page.click('#react-capture')
  assert.equal(await page.textContent('#result'),'true:1')
  assert.deepEqual(errors,[])
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
const result={ok:true,tarball:receipt.tarball,integrity:receipt.integrity,checks:['Installed packed tarball under unchanged posthog-js dependency key','CommonJS default/named export and constructor identity parity','Full/no-external CommonJS import','Canonical declaration SHA-256 matches upstream exactly','Packed runtime hashes match; ESM/CJS source maps trace upstream TypeScript and compiled LilScript JavaScript with embedded sources','Strict TypeScript React consumer; full client assignable to canonical PostHog type','Published subpath resolution retained','React SSR with PostHogProvider','Real browser React provider, feature-flag hook, singleton identity and capture callback']}
writeFileSync(join(root,'reports/full-sdk/package-validation.json'),JSON.stringify(result,null,2)+'\n')
console.log(result.checks.join('\n'))
