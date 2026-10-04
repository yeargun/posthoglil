import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {existsSync,readFileSync} from 'node:fs'
import {join} from 'node:path'
import test from 'node:test'
import {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=join(dirname(fileURLToPath(import.meta.url)),'..')
const site=join(root,'_site')
const html=readFileSync(join(site,'index.html'),'utf8')
const evidence=JSON.parse(readFileSync(join(site,'evidence.json'),'utf8'))
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex')
const modules=evidence.results.results

test('every linked file exists and matches its published hash',()=>{
  const links=[...html.matchAll(/href="(files\/[^"]+)" title="sha256 ([a-f0-9]{64})"/g)]
  assert.ok(links.length>=modules.length*6)
  for(const [,href,hash] of links){
    assert.ok(existsSync(join(site,href)),href)
    assert.equal(sha(join(site,href)),hash,href)
  }
})

test('seven submodules, each shown with its sizes and every cell a win',()=>{
  assert.equal(modules.length,7)
  for(const r of modules){
    const name=evidence.meta.modules[r.id].name
    assert.ok(html.includes(`id="${r.id}"`),r.id)
    assert.ok(html.includes(name.replace(/&/g,'&amp;')),name)
    for(const codec of ['raw','gzip','brotli']){
      const ours=r.lilscript[codec][codec]
      assert.ok(ours<=Math.min(...Object.values(r.upstream).map(lane=>lane[codec])),`${r.id} ${codec}`)
      assert.ok(html.includes(ours.toLocaleString('en-US')),`${r.id} ${codec} ${ours}`)
    }
  }
  assert.match(html,/21 of 21/)
})

test('behaviour: every gated upstream test passes',()=>{
  for(const [id,t] of Object.entries(evidence.tests.modules)){
    assert.ok(t.gated>0,id)
    assert.equal(t.passed,t.gated,id)
  }
})

test('speed: every module has measured workloads with a verdict',()=>{
  assert.ok(evidence.perf,'browser timing results')
  for(const r of modules){
    const rows=evidence.perf.modules[r.id]?.workloads
    assert.ok(rows?.length,r.id)
    for(const w of rows)assert.ok(['faster','no clear difference','slower'].includes(w.verdict),`${r.id} ${w.name}`)
  }
})
