import {resolve} from 'node:path'
import {build} from 'esbuild'
import {rolldown} from 'rolldown'
import {root} from './sdk-source.mjs'

// Small, useful imports from public package entry points. Real module effects
// must survive: neither bundler gets a sideEffects override or purity plugin.
export const consumers = [
  {id:'posthog',name:'clampToRange',maxRaw:2048,unrelated:'Invalid UUID'},
  {id:'error-tracking',name:'getUtf8ByteLength',maxRaw:1024,unrelated:'Primitive value captured as exception'},
  {id:'otlp',name:'msToUnixNano',maxRaw:512,unrelated:'resourceMetrics'},
  {id:'replay-core',name:'effectivePayloadLimitBytes',maxRaw:512,unrelated:'recordHeaders'},
]
export const bundlers = ['esbuild','rolldown']

export async function bundleConsumer(file,name,bundler) {
  const source=`export {${name}} from ${JSON.stringify(resolve(root,file))};`
  if(bundler==='esbuild') {
    const result=await build({stdin:{contents:source,resolveDir:root,sourcefile:'consumer.mjs'},bundle:true,minify:true,treeShaking:true,write:false,format:'esm',platform:'browser',target:'esnext',legalComments:'none'})
    return result.outputFiles[0].text
  }
  if(bundler!=='rolldown')throw Error('Unknown consumer bundler')
  const bundle=await rolldown({input:'\0consumer',platform:'browser',tsconfig:false,plugins:[{
    name:'consumer-entry',resolveId(id){if(id==='\0consumer')return id},load(id){if(id==='\0consumer')return source},
  }],onwarn(warning){throw Error(warning.message)}})
  try {
    const result=await bundle.generate({format:'es',minify:true,comments:false})
    if(result.output.length!==1)throw Error('Expected one consumer chunk')
    return result.output[0].code
  } finally {await bundle.close()}
}
