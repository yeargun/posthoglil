import {defineConfig} from 'vitest/config'
import {join} from 'node:path'
import {root,vendor} from '../scripts/sdk-source.mjs'
import {completeManifest,completeOverrides} from '../scripts/complete-sdk.mjs'

const original=process.env.POSTHOGLIL_COMPLETE_ORIGINAL==='1'
const objective=process.env.POSTHOGLIL_COMPLETE_OBJECTIVE??'raw'
const overrides=original?new Map():completeOverrides(objective)
const requested=process.env.POSTHOGLIL_COMPLETE_TESTS?.split(',')
export default defineConfig({
  root,
  esbuild:{jsx:'automatic',jsxImportSource:'preact',tsconfigRaw:JSON.stringify({compilerOptions:{target:'ES2020',useDefineForClassFields:false,jsx:'react-jsx',jsxImportSource:'preact'}})},
  resolve:{alias:[
    {find:/^@\/(.*)$/,replacement:join(vendor,'packages/core/src/$1')},
    {find:/^@posthog\/core\/surveys$/,replacement:join(vendor,'packages/core/src/surveys/index.ts')},
    {find:/^@posthog\/core$/,replacement:join(vendor,'packages/core/src/index.ts')},
    {find:/^@posthog\/types$/,replacement:join(vendor,'packages/types/src/index.ts')},
    {find:/^@posthog\/browser-common\/tests\/client-conformance$/,replacement:join(vendor,'packages/browser-common/tests/helpers/client-conformance.ts')},
    {find:/^@posthog\/browser-common$/,replacement:join(vendor,'packages/browser-common/src/index.ts')},
    {find:/^@posthog\/browser-common\/(.*)$/,replacement:join(vendor,'packages/browser-common/src/$1.ts')},
    {find:/^@posthog\/rrweb-utils$/,replacement:join(vendor,'packages/rrweb/utils/src/index.ts')},
  ]},
  plugins:original?[]:[{
    name:'whole-module-lilscript-ports',enforce:'pre',
    load(id){return overrides.get(id.split('?')[0])??null},
  }],
  test:{
    globals:true,clearMocks:true,environment:'jsdom',environmentOptions:{jsdom:{url:'http://localhost/'}},
    environmentMatchGlobs:[['**/packages/core/**','node']],
    setupFiles:[join(root,'test/complete-sdk-setup.mjs')],
    fileParallelism:false,pool:'forks',poolOptions:{forks:{minForks:1,maxForks:1,isolate:true}},
    include:[...(requested??[...new Set(completeManifest.modules.flatMap(row=>row.tests))]).map(file=>'vendor/posthog-js/'+file),...(!requested?['test/complete-sdk-behavior.test.ts']:[])],
    reporters:['default','json'],outputFile:{json:join(root,`reports/complete-port/tests-${original?'original':'candidate'}.json`)},
  },
})
