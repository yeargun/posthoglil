import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs'
import {join,relative} from 'node:path'
import {createHash} from 'node:crypto'
import {build,transform} from 'esbuild'
import {root,upstreamVersion,upstreamCommit} from './sdk-source.mjs'
import {minifyLane} from './minify-lanes.mjs'
import {measureFile} from './codec.mjs'
import {bundleOfficialKernel,bundleOfficialSurveys,bundleOfficialErrorTracking,bundleOfficialOtlp,bundleOfficialAutocapture,bundleOfficialReplayCore} from './official-bundle.mjs'
const bundles={posthog:bundleOfficialKernel,surveys:bundleOfficialSurveys,'error-tracking':bundleOfficialErrorTracking,otlp:bundleOfficialOtlp,autocapture:bundleOfficialAutocapture,'replay-core':bundleOfficialReplayCore}
const labels={posthog:'Utility kernel',surveys:'Survey utilities','error-tracking':'Error tracking',otlp:'OTLP encoders',autocapture:'Autocapture utilities','replay-core':'Replay configuration and buffers'}
const hash=code=>createHash('sha256').update(code).digest('hex')
const buildReceipt=JSON.parse(readFileSync(join(root,'artifacts/utilities/build.json'),'utf8'))
const result={schema:1,upstreamVersion,upstreamCommit,scope:'Standalone utility exports only. These percentages are not whole-SDK savings.',buildTimeScope:'Sequential one-run measurements; warm filesystem, no compiler cache. Raw/gzip: ESM. Brotli: ESM+CJS; kernel also UMD. Original time includes equivalent format adaptation. Dependency installation, minifier search, declarations and transport compression excluded.',compilerSha256:buildReceipt.compilerSha256,rows:[]}
for(const [id,bundle] of Object.entries(bundles)){
  const dir=join(root,'artifacts/utilities',id);mkdirSync(dir,{recursive:true})
  const start=performance.now();const source=await bundle(root);const bundleSeconds=(performance.now()-start)/1000
  const originals=[]
  for(const lane of ['oxc-mangle','terser-mangle','esbuild-esnext']){
    const begin=performance.now();const code=await minifyLane(source,`${id}.mjs`,lane);const minifySeconds=(performance.now()-begin)/1000
    const path=join(dir,`original-${lane}.mjs`);writeFileSync(path,code)
    const adaptStart=performance.now()
    await transform(code,{loader:'js',format:'cjs',minifyWhitespace:true,legalComments:'none'})
    if(id==='posthog')await build({stdin:{contents:code,loader:'js'},write:false,format:'iife',globalName:'posthogOriginal',bundle:true,minifyWhitespace:true,legalComments:'none'})
    originals.push({lane,file:relative(root,path),...measureFile(path),sha256:hash(code),bundleSeconds,minifySeconds,formatSeconds:(performance.now()-adaptStart)/1000})
  }
  const rows=[]
  for(const objective of ['raw','gzip','brotli']){
    const metric=objective==='raw'?'raw':objective==='gzip'?'gzip9':'brotli11'
    const filename=objective==='brotli'?`${id}.esm.js`:`${id}.${objective}.js`
    const path=join(root,'dist',filename)
    const artifact={file:relative(root,path),...measureFile(path),sha256:hash(readFileSync(path))}
    const compilerArtifact=buildReceipt.artifacts[filename]
    if(artifact.sha256!==compilerArtifact.sha256)throw Error('Utility artifact no longer matches its compiler receipt')
    const baseline=[...originals].sort((a,b)=>a[metric]-b[metric])[0]
    const profile=buildReceipt.profiles.find(row=>row.name===`${id}-${objective}`)
    rows.push({objective,metric,artifact,baseline,savingsPercent:(1-artifact[metric]/baseline[metric])*100,compilerSeconds:profile.compileWallMs/1000,originalBuildSeconds:baseline.bundleSeconds+baseline.minifySeconds+(objective==='brotli'?baseline.formatSeconds:0),sourceSha256:profile.sourceSha256,configSha256:profile.configSha256})
  }
  result.rows.push({id,label:labels[id],originals,objectives:rows})
  writeFileSync(join(root,'artifacts/utilities/results.json'),JSON.stringify(result,null,2)+'\n')
  console.log(id,rows.map(row=>`${row.objective} ${row.savingsPercent.toFixed(2)}% smaller`).join('; '))
}
