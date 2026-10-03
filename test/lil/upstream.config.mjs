// Upstream's own test suite, run against one of three implementations of the SDK modules:
//   POSTHOGLIL_G1_MODE=original   upstream source as-is (no substitution)
//   POSTHOGLIL_G1_MODE=reference  upstream bundled per module (split build) + upstream's private-name mangling
//   POSTHOGLIL_G1_MODE=candidate  the LilScript build (split build, one entry per ported module)
// A substitution map (JSON: upstream absolute path -> output file) comes from POSTHOGLIL_G1_MAP.
import {defineConfig} from 'vitest/config'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {root,vendor} from '../../scripts/sdk-source.mjs'

const mode=process.env.POSTHOGLIL_G1_MODE??'original'
const map=mode==='original'?new Map():new Map(Object.entries(JSON.parse(readFileSync(process.env.POSTHOGLIL_G1_MAP,'utf8'))))
const files=(process.env.POSTHOGLIL_G1_TESTS??'').split(',').filter(Boolean)
const report=process.env.POSTHOGLIL_G1_REPORT??join(root,`reports/lil-sdk/g1-${mode}.json`)

export default defineConfig({
  root,
  esbuild:{jsx:'automatic',jsxImportSource:'preact',tsconfigRaw:JSON.stringify({compilerOptions:{target:'ES2020',useDefineForClassFields:false,jsx:'react-jsx',jsxImportSource:'preact'}})},
  resolve:{alias:[
    // foreign imports of not-yet-ported upstream modules from LilScript sources
    {find:/^@upstream\/([^/]+)\/(.*)$/,replacement:join(vendor,'packages/$1/src/$2')},
    {find:/^@\/(.*)$/,replacement:join(vendor,'packages/core/src/$1')},
    {find:/^@posthog\/core\/surveys$/,replacement:join(vendor,'packages/core/src/surveys/index.ts')},
    {find:/^@posthog\/core$/,replacement:join(vendor,'packages/core/src/index.ts')},
    {find:/^@posthog\/types$/,replacement:join(vendor,'packages/types/src/index.ts')},
    {find:/^@posthog\/browser-common\/tests\/client-conformance$/,replacement:join(vendor,'packages/browser-common/tests/helpers/client-conformance.ts')},
    {find:/^@posthog\/browser-common$/,replacement:join(vendor,'packages/browser-common/src/index.ts')},
    {find:/^@posthog\/browser-common\/(.*)$/,replacement:join(vendor,'packages/browser-common/src/$1.ts')},
    {find:/^@posthog\/rrweb-utils$/,replacement:join(vendor,'packages/rrweb/utils/src/index.ts')},
  ]},
  plugins:mode==='original'?[]:[{
    name:'posthoglil-g1-substitution',enforce:'pre',
    load(id){const file=map.get(id.split('?')[0]);return file?readFileSync(file,'utf8'):null},
  }],
  test:{
    globals:true,clearMocks:true,environment:'jsdom',environmentOptions:{jsdom:{url:'http://localhost/'}},
    environmentMatchGlobs:[['**/packages/core/**','node']],
    setupFiles:[join(root,'test/complete-sdk-setup.mjs')],
    fileParallelism:false,pool:'forks',poolOptions:{forks:{minForks:1,maxForks:1,isolate:true}},
    include:files.map(file=>'vendor/posthog-js/'+file),
    testTimeout:20000,
    reporters:['default','json'],outputFile:{json:report},
  },
})
