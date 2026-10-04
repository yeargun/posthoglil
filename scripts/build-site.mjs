// The Pages site: seven PostHog submodules, each compared on its own with PostHog's build of the
// same code (react-markdownlil's layout). Every number is checked against the files the page links
// before anything is written; only wins publish.
import assert from 'node:assert/strict'
import {cp,mkdir,rm,writeFile,readFile} from 'node:fs/promises'
import {dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {gzipSync,brotliCompressSync,constants as z} from 'node:zlib'
const root=join(dirname(fileURLToPath(import.meta.url)),'..')
const output=join(root,'_site'), showcase=join(root,'artifacts/showcase')
const sizes=buf=>({raw:buf.length,gzip9:gzipSync(buf,{level:9}).length,brotli11:brotliCompressSync(buf,{params:{[z.BROTLI_PARAM_QUALITY]:11,[z.BROTLI_PARAM_LGWIN]:22,[z.BROTLI_PARAM_SIZE_HINT]:buf.length}}).length})
const index=JSON.parse(await readFile(join(showcase,'modules/index.json'),'utf8'))
const totals={raw:{lil:0,orig:0},gzip:{lil:0,orig:0},brotli:{lil:0,orig:0}}
for(const {id} of index.modules.filter(m=>m.id!=='all')){
  const c=JSON.parse(await readFile(join(showcase,'modules',id,'comparison.json'),'utf8'))
  for(const row of c.objectives){
    for(const side of ['lilscript','original'])assert.deepEqual(sizes(await readFile(join(showcase,row[side].artifact))),row[side].sizes,`${id} ${row.objective} ${side}`)
    assert.ok(row.lilscript.sizes[row.metric]<=row.original.sizes[row.metric],`${id} ${row.objective} is not a win`)
    totals[row.objective].lil+=row.lilscript.sizes[row.metric];totals[row.objective].orig+=row.original.sizes[row.metric]
  }
  for(const lane of c.minifiers)assert.deepEqual(sizes(await readFile(join(showcase,lane.artifact))),lane.sizes,`${id} ${lane.tool}`)
}
const all=JSON.parse(await readFile(join(showcase,'modules/all/comparison.json'),'utf8'))
for(const row of all.objectives){assert.equal(row.lilscript.sizes[row.metric],totals[row.objective].lil);assert.equal(row.original.sizes[row.metric],totals[row.objective].orig)}
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true})
for(const file of ['index.html','styles.css','objective-comparison.css','objective-comparison.js','views.js','app.js','playground.js'])await cp(join(root,'site',file),join(output,file))
for(const dir of ['files','modules'])await cp(join(showcase,dir),join(output,dir),{recursive:true})
await cp(join(showcase,'evidence.json'),join(output,'evidence.json'))
for(const file of ['LICENSE','NOTICE.md'])await cp(join(root,file),join(output,file))
await cp(join(root,'licenses'),join(output,'licenses'),{recursive:true})
await writeFile(join(output,'.nojekyll'),'')
console.log('Built the PostHog submodule showcase at',output)
