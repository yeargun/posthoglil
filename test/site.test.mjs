import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {test} from 'node:test'
import {root,upstreamVersion} from '../scripts/sdk-source.mjs'
const site=join(root,'_site')
const json=file=>JSON.parse(readFileSync(join(site,file),'utf8'))
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex')
const sdk=json('evidence/sdk.json')
test('all public comparisons refer to the current upstream pin and verified artifact bytes',()=>{
  assert.equal(sdk.upstream.version,upstreamVersion)
  for(const surface of sdk.surfaces){
    assert.deepEqual(surface.objectives.map(row=>row.objective),['raw','gzip','brotli'])
    for(const row of [...surface.originals,...surface.objectives.map(row=>row.artifact)])assert.equal(sha(join(site,row.file.replace('artifacts/',''))),row.sha256,row.file)
    for(const row of surface.objectives){
      assert.equal(row.savingsPercent,(1-row.artifact[row.metric]/row.baseline[row.metric])*100)
      assert.equal(row.baseline[row.metric],Math.min(...surface.originals.map(artifact=>artifact[row.metric])))
      assert.equal(row.artifact[row.metric],Math.min(...row.candidates.map(artifact=>artifact[row.metric])))
      assert.ok(row.totalBuildSeconds>0&&row.originalBuildSeconds>0)
      assert.match(row.compiler.sha256,/^[a-f0-9]{64}$/)
      assert.equal(sha(join(site,row.artifact.sourceMap.file.replace('artifacts/',''))),row.artifact.sourceMap.sha256)
    }
  }
})
test('runtime samples and validation cover every downloadable SDK objective',()=>{
  const performance=json('evidence/performance.json'),validation=json('evidence/validation.json')
  assert.equal(validation.ok,true);assert.equal(validation.journeys.length,6)
  for(const surface of sdk.surfaces)for(const row of surface.objectives){
    const runtime=performance.rows.find(x=>x.surface===surface.id&&x.objective===row.objective)
    assert.equal(runtime.candidateSha256,row.artifact.sha256)
    assert.equal(runtime.originalSha256,row.baseline.sha256)
    assert.equal(runtime.pairs.length,performance.samples)
    for(const pair of runtime.pairs)assert.equal(pair.candidate.accepted,1000)
  }
})
test('utility downloads are their separately targeted compiler outputs',()=>{
  for(const pack of json('evidence/utilities.json').rows)for(const row of pack.objectives){
    assert.equal(sha(join(site,'utilities',row.artifact.file.slice(5))),row.artifact.sha256)
    assert.equal(row.savingsPercent,(1-row.artifact[row.metric]/row.baseline[row.metric])*100)
    assert.equal(sha(join(site,'utility-originals',row.baseline.file.slice('artifacts/utilities/'.length))),row.baseline.sha256)
  }
})
test('the tested preview tarball and license notices are shipped',()=>{
  const pkg=json('evidence/package.json'),file=join(site,'downloads',pkg.tarball)
  assert.equal(pkg.integrity,json('evidence/validation.json').package.integrity)
  assert.equal('sha512-'+createHash('sha512').update(readFileSync(file)).digest('base64'),pkg.integrity)
  for(const name of ['LICENSE','NOTICE.md','licenses/rrweb-MIT-LICENSE','.nojekyll'])assert.ok(existsSync(join(site,name)))
})
test('named-import comparisons use the current consumers and strongest original for each codec',()=>{
  const evidence=json('evidence/tree-shaking.json')
  assert.equal(evidence.upstreamVersion,upstreamVersion)
  assert.equal(evidence.rows.length,24)
  for(const row of evidence.rows) {
    for(const artifact of [row.artifact,...row.originals])assert.equal(sha(join(site,artifact.file.replace('artifacts/',''))),artifact.sha256)
    assert.equal(row.baseline[row.metric],Math.min(...row.originals.map(artifact=>artifact[row.metric])))
    assert.equal(row.savingsPercent,(1-row.artifact[row.metric]/row.baseline[row.metric])*100)
  }
})
test('page leads with full-SDK scope and never projects utility results onto it',()=>{
  const html=readFileSync(join(site,'index.html'),'utf8'),app=readFileSync(join(site,'app.js'),'utf8')
  assert.ok(html.indexOf('id="headline"')<html.indexOf('id="utilities"'))
  assert.match(html,/Utility-level percentages are never presented as whole-SDK savings/)
  assert.match(html,/Published npm build time is unknown/)
  assert.doesNotMatch(html+'\n'+app,/previous release|previous version|since the previous|1\.418\.(10|11)/i)
  assert.match(app,/larger than the best minified original in this Brotli comparison/)
})
