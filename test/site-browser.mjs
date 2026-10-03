import assert from 'node:assert/strict'
import {readFileSync,mkdirSync} from 'node:fs'
import {join,resolve,extname} from 'node:path'
import {createServer} from 'node:http'
import {chromium} from '@playwright/test'
import {root} from '../scripts/sdk-source.mjs'
const output=join(root,'_site'),reports=join(root,'reports/site')
mkdirSync(reports,{recursive:true})
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.map':'application/json','.tgz':'application/gzip'}
const server=createServer((request,response)=>{
  try{
    const path=resolve(output,'.'+decodeURIComponent(new URL(request.url,'http://localhost').pathname))
    assert.ok(path===output||path.startsWith(output+'/'))
    const file=path===output?join(path,'index.html'):path
    response.setHeader('Content-Type',types[extname(file)]??'text/plain')
    response.end(readFileSync(file))
  }catch{response.statusCode=404;response.end('Not found')}
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({args:['--no-sandbox']})
try{
  for(const [name,viewport] of [['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]]){
    const page=await browser.newPage({viewport}),errors=[],requests=[]
    page.on('pageerror',error=>errors.push(String(error)))
    page.on('request',request=>requests.push({url:request.url(),method:request.method()}))
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort())
    await page.goto(origin,{waitUntil:'networkidle'})
    await page.waitForSelector('#sdk-sizes tr')
    assert.equal(await page.locator('#headline .metric').count(),2)
    assert.equal(await page.locator('#headline tbody tr').count(),6)
    for(const bundler of ['rolldown','esbuild']){
      await page.selectOption('#app-bundler',bundler)
      assert.equal(await page.locator('#headline tbody tr').count(),6)
      assert.match(await page.textContent('#headline'),new RegExp(bundler))
      assert.match(await page.textContent('#hero-runtime'),/measured workloads/)
      assert.equal(await page.inputValue('#runtime-objective'),'package-'+bundler)
    }
    assert.match(await page.textContent('#verdict'),/same optimizations/)
    assert.doesNotMatch(await page.textContent('#verdict'),/Loading|could not load/)
    assert.equal(await page.locator('#sdk-sizes tr').count(),3)
    assert.match(await page.textContent('#scope'),/Standard SDK/)
    await page.click('[data-surface="full"]')
    assert.match(await page.textContent('#scope'),/Full \/ no external scripts/)
    assert.equal(await page.getAttribute('[data-surface="full"]','aria-pressed'),'true')
    for(const objective of ['package-esbuild','package-rolldown','raw','gzip','brotli']){
      await page.selectOption('#runtime-objective',objective)
      assert.equal(await page.locator('#performance .perf').count(),4)
    }
    for(const id of ['posthog','surveys','error-tracking','otlp','autocapture','replay-core']){
      await page.selectOption('#utility-select',id)
      assert.equal(await page.locator('#utility-sizes tr').count(),3)
      assert.ok((await page.getAttribute('#utility-sizes a','href')).includes(id))
    }
    for(const bundler of ['esbuild','rolldown'])for(const objective of ['raw','gzip','brotli']){
      await page.selectOption('#consumer-bundler',bundler)
      await page.selectOption('#consumer-objective',objective)
      assert.equal(await page.locator('#consumer-sizes tr').count(),4)
      assert.ok((await page.getAttribute('#consumer-sizes a','href')).includes(bundler))
    }
    await page.click('#demo-capture')
    await page.waitForFunction(()=>document.querySelector('#demo-output').textContent.includes('showcase.checkout'))
    const event=JSON.parse(await page.textContent('#demo-output'))
    assert.equal(event.properties._custom_property,'preserved')
    await page.click('#demo-error')
    await page.waitForFunction(()=>document.querySelector('#demo-output').textContent.includes('$exception'))
    assert.match(await page.textContent('#demo-output'),/Example checkout error/)
    const download=await page.getAttribute('#download','href')
    const response=await page.request.get(new URL(download,origin).href)
    assert.equal(response.status(),200);assert.ok((await response.body()).length>100000)
    assert.deepEqual(errors,[])
    assert.deepEqual(requests.filter(request=>request.method!=='GET'||!request.url.startsWith(origin)),[],'demo must make no uploads or external requests')
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no page-wide horizontal overflow')
    await page.click('[data-surface="standard"]')
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}))
    await page.screenshot({path:join(reports,name+'-hero.png')})
    await page.screenshot({path:join(reports,name+'.png'),fullPage:true})
    console.log(name+': controls, comparisons, demo events/exceptions, local-only traffic, download and layout passed')
    await page.close()
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
