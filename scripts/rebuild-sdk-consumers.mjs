import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {root} from './sdk-source.mjs'
import {fixtures,installConsumers,buildConsumer} from './sdk-consumers.mjs'

// CI can reproduce installed consumer bytes without access to the compiler or
// the private codec executable. Hashes bind these bytes to the measured receipt.
const result=JSON.parse(readFileSync(join(root,'artifacts/sdk-consumers/results.json'),'utf8'))
const {projects,receipt}=installConsumers()
assert.equal(result.packageIntegrity,receipt.integrity)
for(const row of result.rows) {
  const fixture=fixtures.find(fixture=>fixture.id===row.fixture)
  assert.ok(fixture)
  for(const variant of ['original','candidate']) {
    const output=dirname(join(root,row[variant].files.find(file=>file.entry).file))
    const rebuilt=await buildConsumer({directory:projects[variant],fixture,bundler:row.bundler,output})
    assert.deepEqual(rebuilt.files,row[variant].files.map(({file,sha256,entry})=>({file,sha256,entry})),`${row.fixture}/${row.bundler}/${variant}: consumer bytes changed`)
  }
  console.log('reproduced',row.fixture,row.bundler)
}
