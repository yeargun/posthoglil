import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {existsSync,readFileSync} from 'node:fs'
import {dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import test from 'node:test'
const root=join(dirname(fileURLToPath(import.meta.url)),'..')
const site=join(root,'_site')
const html=readFileSync(join(site,'index.html'),'utf8')
const evidence=JSON.parse(readFileSync(join(site,'evidence.json'),'utf8'))
const index=JSON.parse(readFileSync(join(site,'modules/index.json'),'utf8'))
const comparison=id=>JSON.parse(readFileSync(join(site,'modules',id,'comparison.json'),'utf8'))
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex')

test('every published file exists and matches its recorded hash',()=>{
  const files=Object.entries(evidence.files)
  assert.equal(files.length,42)
  for(const [path,hash] of files){assert.ok(existsSync(join(site,path)),path);assert.equal(sha(join(site,path)),hash,path)}
})

test('all seven, then each module: every cell a win, linked to its file',()=>{
  assert.deepEqual(index.modules.map(m=>m.id),['all','error-tracking','user-agent','autocapture-utils','feature-flags','metrics','uuidv7','gzip'])
  for(const {id} of index.modules.slice(1)){
    const c=comparison(id)
    assert.equal(c.schemaVersion,4)
    for(const row of c.objectives){
      assert.ok(row.ratio<=1,`${id} ${row.objective}`)
      assert.equal(sha(join(site,row.lilscript.artifact)),row.lilscript.sha256)
      assert.equal(sha(join(site,row.original.artifact)),row.original.sha256)
    }
    assert.equal(c.wins,3,id)
  }
  assert.equal(comparison('all').wins,21)
  assert.match(html,/21\/21/)
  for(const row of comparison('all').objectives)assert.ok(html.includes(row.lilscript.sizes[row.metric].toLocaleString('en-US')),row.objective)
})

test('behaviour: every gated upstream test passes',()=>{
  for(const [id,t] of Object.entries(evidence.tests.modules)){assert.ok(t.gated>0,id);assert.equal(t.passed,t.gated,id)}
})

test('speed: every module has measured workloads with a verdict',()=>{
  for(const {id} of index.modules.slice(1)){
    const rows=comparison(id).speed
    assert.ok(rows.length>=2,id)
    for(const w of rows)assert.ok(['faster','no clear difference','slower'].includes(w.verdict),`${id} ${w.name}`)
  }
})
