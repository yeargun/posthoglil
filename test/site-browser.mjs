import assert from 'node:assert/strict'
import {readFileSync,mkdirSync} from 'node:fs'
import {dirname,join,resolve,extname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer} from 'node:http'
import {chromium} from '@playwright/test'
const root=join(dirname(fileURLToPath(import.meta.url)),'..')
const output=join(root,'_site'),reports=join(root,'reports/site')
mkdirSync(reports,{recursive:true})
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'}
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
const origin=`http://127.0.0.1:${server.address().port}/`
const browser=await chromium.launch({args:['--no-sandbox']})
try{
  for(const [name,viewport] of [['desktop',{width:1440,height:1050}],['mobile',{width:390,height:844}]]){
    const page=await browser.newPage({viewport}),errors=[],external=[]
    page.on('pageerror',error=>errors.push(String(error)))
    // The template's fonts are the only outside requests.
    const allowed=url=>url.startsWith(origin)||/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)
    await page.route('**/*',route=>{const url=route.request().url();if(!allowed(url)){external.push(url);return route.abort()}return url.startsWith(origin)?route.continue():route.abort()})
    await page.goto(origin,{waitUntil:'networkidle'})
    assert.equal(await page.locator('#stack-tabs [role="tab"]').count(),8)
    await page.waitForFunction(()=>document.querySelector('#lab-note')?.textContent.includes('Same output'))
    await page.click('#stack-tabs [data-id="metrics"]')
    await page.waitForFunction(()=>document.querySelector('#stack-detail h3')?.textContent==='Metrics client')
    assert.match(page.url(),/[?&]module=metrics/)
    assert.match(await page.textContent('#compression-comparison'),/3,569 B/)
    await page.waitForFunction(()=>document.querySelector('#lab-module')?.value==='metrics'&&document.querySelector('#lab-note')?.textContent.includes('Same output'))
    await page.selectOption('#lab-module','feature-flags')
    await page.waitForFunction(()=>document.querySelector('#lab-note')?.textContent.includes('Same output')&&document.querySelector('#lab-output')?.textContent.includes('featureFlags'))
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${name}: horizontal overflow`)
    assert.deepEqual(errors,[]);assert.deepEqual(external,[])
    await page.screenshot({path:join(reports,`${name}.png`),fullPage:true})
    await page.close()
  }
}finally{await browser.close();server.close()}
console.log('Site browser check passed')
