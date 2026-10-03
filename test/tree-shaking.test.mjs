import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {test} from 'node:test'
import {root} from '../scripts/sdk-source.mjs'
import {bundleConsumer,consumers,bundlers} from '../scripts/tree-shaking.mjs'

const hash=code=>createHash('sha256').update(code).digest('hex')
const evidence=JSON.parse(readFileSync(join(root,'artifacts/tree-shaking/results.json'),'utf8'))
for(const bundler of bundlers)for(const consumer of consumers)for(const objective of ['raw','gzip','brotli']) {
  test(`${bundler}: ${consumer.name}, ${objective} objective`,async()=>{
    const row=evidence.rows.find(row=>row.id===consumer.id&&row.bundler===bundler&&row.objective===objective)
    assert.ok(row)
    const code=await bundleConsumer(row.artifact.source,consumer.name,bundler)
    assert.equal(hash(code),row.artifact.sha256,'receipt must describe the current consumer')
    for(const artifact of [row.artifact,...row.originals]) {
      assert.equal(hash(readFileSync(join(root,artifact.source))),artifact.sourceSha256)
      assert.equal(hash(readFileSync(join(root,artifact.file))),artifact.sha256)
    }
    const source=readFileSync(join(root,row.artifact.source),'utf8')
    assert.ok(Buffer.byteLength(code)<=consumer.maxRaw,'small-import budget must exclude namespace/parser initialization')
    assert.ok(Buffer.byteLength(code)<Buffer.byteLength(source)/4,'unrelated package code must be removable')
    assert.ok(!code.includes(consumer.unrelated),'unrelated subsystem must disappear')
    const api=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
    assert.deepEqual(Object.keys(api),[consumer.name])
    if(consumer.id==='posthog') {
      const warnings=[],logger={warn:message=>warnings.push(message)}
      assert.equal(api.clampToRange(4,0,10,logger),4)
      assert.equal(api.clampToRange(20,0,10,logger),10)
      assert.equal(warnings.length,1)
    } else if(consumer.id==='error-tracking') {
      assert.equal(api.getUtf8ByteLength('é 😀'),7)
    } else if(consumer.id==='otlp') {
      assert.equal(api.msToUnixNano(1234),'1234000000')
    } else {
      assert.equal(api.effectivePayloadLimitBytes({payloadSizeLimitBytes:2048}),2048)
      assert.equal(api.effectivePayloadLimitBytes({}),1_000_000)
    }
  })
}
