import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {createServer} from 'node:http'
import {chromium} from '@playwright/test'
import {root} from '../scripts/sdk-source.mjs'
import {fixtures,sha256} from '../scripts/sdk-consumers.mjs'

const result=JSON.parse(readFileSync(join(root,'artifacts/sdk-consumers/results.json'),'utf8'))
const receipt=JSON.parse(readFileSync(join(root,'artifacts/package/receipt.json'),'utf8'))
assert.equal(result.packageIntegrity,receipt.integrity,'Measure the package that is being tested')
assert.equal(result.rows.length,fixtures.length*2)
for(const row of result.rows) {
  for(const variant of ['original','candidate'])for(const file of row[variant].files)assert.equal(sha256(readFileSync(join(root,file.file))),file.sha256)
  for(const metric of ['raw','gzip9','brotli11']) {
    if(row.optimized)assert.ok(row.candidate.total[metric]<row.original.total[metric],`${row.fixture}/${row.bundler}/${metric}: installed SDK must be smaller`)
    else assert.equal(row.candidate.total[metric],row.original.total[metric],'Unchanged entry retains upstream size')
  }
  if(row.fixture==='lazy')for(const variant of ['original','candidate']) {
    assert.ok(row[variant].files.length>1,'Dynamic import retains a separate SDK chunk')
    assert.ok(row[variant].files.find(file=>file.entry).raw<1024,'SDK must not be retained in the initial lazy entry')
  }
  if(row.fixture==='react-slim')for(const variant of ['original','candidate'])assert.ok(row[variant].total.raw<16000,'Slim hook must not pull in the SDK')
}
for(const bundler of ['esbuild','rolldown'])for(const variant of ['original','candidate']) {
  const hook=result.rows.find(row=>row.fixture==='react-hook'&&row.bundler===bundler)[variant]
  const all=result.rows.find(row=>row.fixture==='react-all'&&row.bundler===bundler)[variant]
  assert.ok(hook.total.raw<all.total.raw,'Unused React exports are removable with the default bundler settings')
}
const server=createServer((req,res)=>{
  const file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname)
  if(file.startsWith(join(root,'artifacts/sdk-consumers')+'/')) {
    try{res.setHeader('Content-Type','text/javascript');res.end(readFileSync(file));return}catch{}
  }
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><main>Consumer fixture</main>')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({args:['--no-sandbox']})
try {
  for(const row of result.rows) {
    const outputs=[]
    for(const variant of ['original','candidate']) {
      const context=await browser.newContext(),requests=[],errors=[]
      await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort())
      const page=await context.newPage()
      page.on('pageerror',error=>errors.push(String(error)))
      page.on('request',request=>requests.push(request.url()))
      await page.goto(origin)
      const file=row[variant].files.find(file=>file.entry).file
      const observed=await page.evaluate(async({url,fixture})=>{
        const module=await import(url)
        if(fixture==='lazy')return Object.keys(module).sort()
        if(module.default)return {exports:Object.keys(module).sort(),singleton:module.default===module.posthog,constructor:module.default instanceof module.PostHog,capture:typeof module.default.capture}
        if(module.client)return {capture:typeof module.client.capture,identify:typeof module.client.identify}
        if(module.usePostHog)return {exports:Object.keys(module).sort(),hook:typeof module.usePostHog}
        return {marker:module.marker}
      },{url:origin+'/'+file,fixture:row.fixture})
      if(row.fixture==='lazy') {
        assert.equal(requests.filter(url=>url.endsWith('.js')).length,1,'Importing the lazy wrapper must not eagerly load the SDK')
        const loaded=await page.evaluate(async url=>{
          const module=await (await import(url)).load()
          return {singleton:module.default===module.posthog,constructor:module.default instanceof module.PostHog,capture:typeof module.default.capture}
        },origin+'/'+file)
        assert.deepEqual(loaded,{singleton:true,constructor:true,capture:'function'})
      }
      assert.deepEqual(errors,[])
      outputs.push(observed)
      await context.close()
    }
    assert.deepEqual(outputs[1],outputs[0],`${row.fixture}/${row.bundler}: consumer export behavior changed`)
    console.log(row.fixture,row.bundler,'size, imports and tree-shaking checks passed')
  }
} finally {await browser.close();await new Promise(resolve=>server.close(resolve))}
writeFileSync(join(root,'reports/full-sdk/consumer-validation.json'),JSON.stringify({ok:true,packageIntegrity:receipt.integrity,fixtures:fixtures.length,bundlers:2,checks:'One installed package wins raw/gzip/Brotli for every optimized fixture; unchanged subpaths are equal. Default side-effect analysis, React named-export elimination, slim hook isolation, lazy chunking, runtime exports and constructor/singleton identity.'},null,2)+'\n')
