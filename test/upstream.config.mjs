import {defineConfig} from 'vitest/config'
import {join,resolve} from 'node:path'
import {root,vendor,replacements} from '../scripts/sdk-source.mjs'

const objective=process.env.POSTHOGLIL_OBJECTIVE??'raw'
const original=process.env.POSTHOGLIL_UPSTREAM_ONLY==='1'
const mapping=new Map(replacements.map(row=>[join(vendor,'packages',row.source),row]))
const surveys=replacements.find(row=>row.id==='surveys')
const error=replacements.find(row=>row.id==='error-tracking')
const errorRoot=join(vendor,'packages/core/src/error-tracking/')
function match(path){
  if(path.includes('.spec.'))return undefined
  if(path.startsWith(join(vendor,'packages/core/src/surveys/')))return surveys
  if(path.startsWith(errorRoot)&&!path.endsWith('/types.ts')&&!path.endsWith('/chunk-ids.ts')&&!path.endsWith('/parsers/base.ts'))return error
  return mapping.get(path)
}

export default defineConfig({
  root,
  esbuild:{tsconfigRaw:JSON.stringify({compilerOptions:{target:'ES2020',useDefineForClassFields:false}})},
  resolve:{alias:[
    {find:/^@\/(.*)$/,replacement:join(vendor,'packages/core/src/$1')},
    {find:/^@posthog\/core\/surveys$/,replacement:join(vendor,'packages/core/src/surveys/index.ts')},
    {find:/^@posthog\/core$/,replacement:join(vendor,'packages/core/src/index.ts')},
    {find:/^@posthog\/types$/,replacement:join(vendor,'packages/types/src/index.ts')},
    {find:/^@posthog\/browser-common$/,replacement:join(vendor,'packages/browser-common/src/index.ts')},
    {find:/^@posthog\/browser-common\/(.*)$/,replacement:join(vendor,'packages/browser-common/src/$1.ts')},
  ]},
  plugins:original?[]:[{
    name:'qualified-lilscript-substitution',enforce:'pre',
    async resolveId(id,importer,options){
      if(id.startsWith('\0posthog-lil:'))return id
      if(id.includes('?original')||id.includes('sdk-internals'))return undefined
      const resolved=await this.resolve(id,importer,{...options,skipSelf:true})
      if(!resolved)return undefined
      const path=resolved.id.split('?')[0]
      const row=match(path)
      if(!row)return undefined
      return '\0posthog-lil:'+path
    },
    load(id){
      if(!id.startsWith('\0posthog-lil:'))return undefined
      const path=id.slice('\0posthog-lil:'.length)
      const row=match(path)
      const standalone=process.env.POSTHOGLIL_TEST_STANDALONE==='1' && (row.id==='error-tracking'||row.id.startsWith('otlp-'))
      const artifact=standalone?join(root,'.tmp',row.id==='error-tracking'?'error-tracking.latest.js':'otlp.latest.js'):join(root,'dist/sdk-internals',objective,'combined.mjs')
      const names=row.exports.map(name=>standalone?name:`${row.id.replaceAll('-','_')}_${name} as ${name}`).join(',')
      return `${row.complete?'':`export * from ${JSON.stringify(path+'?original')};`} export {${names}} from ${JSON.stringify(artifact)};`
    },
  }],
  test:{
    globals:true,clearMocks:true,environment:'node',fileParallelism:false,
    environmentMatchGlobs:[['**/browser-common/**','jsdom']],
    setupFiles:[join(vendor,'tooling/vitest/setup-fake-timers.ts')],
    poolOptions:{threads:{singleThread:true}},
    include:[
      'vendor/posthog-js/packages/core/src/__tests__/featureFlagUtils.spec.ts',
      'vendor/posthog-js/packages/core/src/utils/number-utils.spec.ts',
      'vendor/posthog-js/packages/core/src/utils/type-utils.spec.ts',
      'vendor/posthog-js/packages/core/src/utils/string-utils.spec.ts',
      'vendor/posthog-js/packages/core/src/utils/otlp-resource.spec.ts',
      'vendor/posthog-js/packages/core/src/error-tracking/**/*.spec.ts',
      'vendor/posthog-js/packages/core/src/utils/otlp-any-value.spec.ts',
      'vendor/posthog-js/packages/core/src/logs/logs-utils.spec.ts',
      'vendor/posthog-js/packages/core/src/metrics/metrics-utils.spec.ts',
      'vendor/posthog-js/packages/core/src/metrics/config.spec.ts',
      'vendor/posthog-js/packages/core/src/surveys/*.spec.ts',
      'vendor/posthog-js/packages/browser-common/tests/utils/autocapture-utils.spec.ts',
    ],
    reporters:['default','json'],outputFile:{json:resolve(root,`reports/full-sdk/upstream-${original?'original':objective}.json`)},
  },
})
