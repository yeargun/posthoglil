import {writeFileSync,mkdirSync,readFileSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {bundleSdk,root,upstreamVersion,upstreamCommit,replacements} from './sdk-source.mjs'
import {checkUpstreamPin} from './check-upstream-pin.mjs'

checkUpstreamPin()

mkdirSync(join(root,'reports/full-sdk'),{recursive:true})
const config=join(root,'configs/sdk/modules.json')
const enabled=existsSync(config)?JSON.parse(readFileSync(config,'utf8')).modules:undefined
for(const surface of ['standard','full']){
  const {code}=await bundleSdk({surface,probe:true,enabled})
  const exports=[...new Set([...code.matchAll(/__posthog_lil_plan__\("([^"]+)"\)/g)].map(match=>match[1]))].sort()
  if(!exports.length)throw Error('Reachability probe emitted no live exports')
  const result={upstreamVersion,upstreamCommit,surface,exports,modules:replacements.filter(row=>exports.some(name=>name.startsWith(row.id.replaceAll('-','_')+'_'))).map(row=>row.id)}
  writeFileSync(join(root,`reports/full-sdk/plan-${surface}.json`),JSON.stringify(result,null,2)+'\n')
  console.log(surface,exports.length,'live internal exports',result.modules)
}
