import assert from 'node:assert/strict'
import {cp,mkdir,rm,writeFile,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {root,upstreamVersion} from './sdk-source.mjs'
const output=join(root,'_site')
const sdk=JSON.parse(await readFile(join(root,'artifacts/sdk/results.json'),'utf8'))
const validation=JSON.parse(await readFile(join(root,'artifacts/sdk/validation.json'),'utf8'))
const pkg=JSON.parse(await readFile(join(root,'artifacts/package/receipt.json'),'utf8'))
assert.equal(sdk.upstream.version,upstreamVersion);assert.equal(validation.upstreamVersion,upstreamVersion);assert.equal(validation.ok,true);assert.equal(pkg.integrity,validation.package.integrity,'Preview tarball must be the tested package')
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true})
for(const file of ['index.html','app.js','styles.css'])await cp(join(root,'site',file),join(output,file))
await cp(join(root,'artifacts/sdk'),join(output,'sdk'),{recursive:true})
await cp(join(root,'artifacts/utilities'),join(output,'utility-originals'),{recursive:true})
await mkdir(join(output,'utilities'),{recursive:true})
for(const id of ['posthog','surveys','error-tracking','otlp','autocapture','replay-core'])for(const extension of ['esm.js','raw.js','gzip.js','cjs','d.ts'])await cp(join(root,'dist',`${id}.${extension}`),join(output,'utilities',`${id}.${extension}`))
await mkdir(join(output,'evidence'),{recursive:true})
for(const [source,target] of [['sdk/results.json','sdk.json'],['utilities/results.json','utilities.json'],['sdk/performance.json','performance.json'],['sdk/validation.json','validation.json'],['package/receipt.json','package.json']])await cp(join(root,'artifacts',source),join(output,'evidence',target))
await mkdir(join(output,'downloads'),{recursive:true})
await cp(join(root,'artifacts/package',pkg.tarball),join(output,'downloads',pkg.tarball))
for(const file of ['LICENSE','NOTICE.md'])await cp(join(root,file),join(output,file))
await cp(join(root,'licenses'),join(output,'licenses'),{recursive:true})
await writeFile(join(output,'.nojekyll'),'')
console.log('Built verified PostHog showcase at',output)
