import {mkdirSync,writeFileSync} from 'node:fs'
import {join,relative} from 'node:path'
import {bundleSdk,root,vendor} from './sdk-source.mjs'
import {completeOverrides,digest} from './complete-sdk.mjs'
import {measureFile} from './codec.mjs'

const fixtures=[
  {id:'router-region',source:'packages/browser/src/utils/request-router.ts',names:['RequestRouterRegion']},
  {id:'uuid-timestamp',source:'packages/browser-common/src/utils/uuidv7.ts',names:['uuid7ToTimestampMs']},
  {id:'query-param',source:'packages/browser-common/src/utils/request-utils.ts',names:['getQueryParam']},
  {id:'sdk-constructor',source:'packages/browser/src/entrypoints/module.es.ts',names:['PostHog']},
]
const directory=join(root,'reports/complete-port/tree-shaking')
mkdirSync(directory,{recursive:true})
const rows=[]
for(const fixture of fixtures){
  const entryFile=join(directory,fixture.id+'.entry.mjs')
  writeFileSync(entryFile,`export {${fixture.names.join(',')}} from ${JSON.stringify(join(vendor,fixture.source))};\n`)
  const row={...fixture,variants:[]}
  for(const variant of ['original','candidate']){
    const result=await bundleSdk({entryFile,minify:true,overrides:variant==='original'?new Map():completeOverrides('brotli')})
    const file=join(directory,fixture.id+'.'+variant+'.mjs')
    writeFileSync(file,result.code)
    row.variants.push({variant,file:relative(root,file),sha256:digest(result.code),...measureFile(file)})
  }
  rows.push(row)
  console.log(fixture.id,...row.variants.map(row=>`${row.variant}: ${row.raw} raw bytes`))
}
writeFileSync(join(directory,'results.json'),JSON.stringify({scope:'Source-module import pruning diagnostic. This is not an installed npm consumer or package-level tree-shaking qualification.',rows},null,2)+'\n')
