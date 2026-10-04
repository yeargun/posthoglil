// The Pages site: seven PostHog submodules, each compared on its own with PostHog's build of the
// same code (size per codec, speed in Chromium, upstream tests). Every number is checked against
// the files the page links before anything is written.
import assert from 'node:assert/strict'
import {cp,mkdir,rm,writeFile,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {gzipSync,brotliCompressSync,constants as z} from 'node:zlib'
import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=join(dirname(fileURLToPath(import.meta.url)),'..')
const output=join(root,'_site'), showcase=join(root,'artifacts/showcase')
const evidence=JSON.parse(await readFile(join(showcase,'evidence.json'),'utf8'))
const sizes=buf=>({raw:buf.length,gzip:gzipSync(buf,{level:9}).length,brotli:brotliCompressSync(buf,{params:{[z.BROTLI_PARAM_QUALITY]:11,[z.BROTLI_PARAM_LGWIN]:22,[z.BROTLI_PARAM_SIZE_HINT]:buf.length}}).length})
for(const r of evidence.results.results){
  for(const [lane,recorded] of Object.entries(r.upstream)){
    const measured=sizes(await readFile(join(showcase,'files/upstream',lane,r.id+'.mjs')))
    for(const codec of ['raw','gzip','brotli'])assert.equal(measured[codec],recorded[codec],`${r.id} ${lane} ${codec}`)
  }
  for(const codec of ['raw','gzip','brotli']){
    const measured=sizes(await readFile(join(showcase,'files/lilscript',codec,r.id+'.mjs')))
    assert.equal(measured[codec],r.lilscript[codec][codec],`${r.id} lilscript ${codec}`)
    // Only wins are published.
    assert.ok(r.lilscript[codec][codec]<=Math.min(...Object.values(r.upstream).map(lane=>lane[codec])),`${r.id} ${codec} is not a win`)
  }
}
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true})
for(const file of ['index.html','styles.css','app.js'])await cp(join(root,'site',file),join(output,file))
await cp(join(showcase,'files'),join(output,'files'),{recursive:true})
await cp(join(showcase,'evidence.json'),join(output,'evidence.json'))
for(const file of ['LICENSE','NOTICE.md'])await cp(join(root,file),join(output,file))
await cp(join(root,'licenses'),join(output,'licenses'),{recursive:true})
await writeFile(join(output,'.nojekyll'),'')
console.log('Built the PostHog submodule showcase at',output)
