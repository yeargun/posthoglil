import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {root} from './sdk-source.mjs'
import {completeRows,completeOverrides,digest,portOutput} from './complete-sdk.mjs'

const rows=[]
for(const objective of ['raw','gzip','brotli']){
  completeOverrides(objective) // Refuse to analyze stale compiler inputs.
  for(const row of completeRows){
    const receipt=JSON.parse(readFileSync(portOutput(row,objective)+'.json','utf8'))
    if(!receipt.optimization||!receipt.compilerReport)throw Error(`Recompile with optimizer reporting: ${row.implementation}`)
    if(digest(readFileSync(join(root,receipt.compilerReport.file)))!==receipt.compilerReport.sha256)throw Error(`Compiler report changed: ${row.implementation}`)
    rows.push({source:row.source??row.bridge,implementation:row.implementation,objective,outputSha256:receipt.outputSha256,...receipt.optimization})
  }
}
const directory=join(root,'reports/complete-port')
mkdirSync(directory,{recursive:true})
writeFileSync(join(directory,'optimization.json'),JSON.stringify({generatedAt:new Date().toISOString(),scope:'Compiler observations for the registered whole-module implementations. These are not bundle savings or a compatibility qualification.',rows},null,2)+'\n')
const text=['# PostHog optimizer audit — private engineering report','',
  'A permitted optimization is not evidence that it was applicable or selected. These rows come from the compiler explanations for the exact registered artifacts. Aggregate visits may revisit the same allocation in different rule rounds; they are not unique object counts. Structural inventory refers to the requested effort tier; protected lower-tier runs have separate counters in the full report. Structural search is additional work beyond the baseline optimization rules.','',
  '| Module | Objective | Effort | Scalarized allocations | Host escape / aggregate visits | Property mangling selected | Structural inventory |',
  '| --- | --- | ---: | ---: | ---: | --- | --- |',
  ...rows.map(row=>`| ${row.implementation} | ${row.objective} | ${row.effort} | ${row.rules.scalarizedAllocations} | ${row.rules.aggregateVisits.host_escape??0} / ${row.rules.aggregateVisits.total??0} | ${row.selected.propertyMangling?'Yes':'No'} | ${row.search.inventoryReached?'Reached':row.search.structuralSearchEnabled?'Not reached':'Disabled at this effort'} |`),
  '', 'Full search-stop reasons and per-build hashes are recorded in optimization.json. Final delivery size must be measured after linking and minification against minified original, separately for raw, gzip and Brotli.','']
writeFileSync(join(directory,'OPTIMIZATION.md'),text.join('\n'))
console.log(`Recorded ${rows.length} objective/module optimization reports`)
