import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import ts from 'typescript'
import {minify} from 'terser'
import {transform} from 'esbuild'
import {minify as oxcMinify} from 'vite'
import {composeMaps} from './source-maps.mjs'
import {vendor} from './sdk-source.mjs'

// Read the pinned upstream exceptions rather than inventing a property ABI.
const config=ts.createSourceFile('rollup.config.mjs',readFileSync(join(vendor,'packages/browser/rollup.config.mjs'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
const reserved=new Set()
function visit(node){
  if(ts.isPropertyAssignment(node)&&node.name.getText(config)==='reserved'&&ts.isArrayLiteralExpression(node.initializer)){
    for(const element of node.initializer.elements)if(ts.isStringLiteral(element))reserved.add(element.text)
  }
  ts.forEachChild(node,visit)
}
visit(config)
const require=createRequire(import.meta.url)
for(const name of require(join(vendor,'packages/browser/terser-cross-bundle-properties.cjs')).crossBundlePrivateProperties)reserved.add(name)
export const propertyReserved=[...reserved].sort()
export const lanes=['terser','oxc','esbuild']
export async function minifySdk(code,{surface,lane='terser',sourceMap}={}){
  if(lane==='terser'){
    const result=await minify(code,{
      module:true,toplevel:true,sourceMap:sourceMap?{filename:'sdk.mjs'}:false,
      compress:{ecma:6,passes:2,pure_getters:true,unsafe_methods:true,unsafe_comps:true,unsafe_math:true,unsafe_proto:true,unsafe_regexp:true},
      mangle:{reserved:['$'],properties:surface==='standard'?{regex:/^_(?!_)/,reserved:propertyReserved}:false},
      format:{comments:false},
    })
    if(!result.code)throw Error('Terser emitted no SDK')
    return sourceMap?{code:result.code+'\n',map:composeMaps(result.map,sourceMap)}:result.code+'\n'
  }
  if(lane==='oxc'){
    const result=await oxcMinify('sdk.mjs',code,{module:true,compress:true,mangle:true,sourcemap:!!sourceMap,codegen:{removeWhitespace:true,legalComments:'none'}})
    if(result.errors?.length||!result.code)throw Error(JSON.stringify(result.errors))
    return sourceMap?{code:result.code+'\n',map:composeMaps(result.map,sourceMap)}:result.code+'\n'
  }
  if(lane==='esbuild'){
    const result=await transform(code,{loader:'js',format:'esm',minify:true,target:'es2015',legalComments:'none',sourcemap:sourceMap?'external':false,sourcefile:'sdk.mjs'})
    return sourceMap?{code:result.code,map:composeMaps(result.map,sourceMap)}:result.code
  }
  throw Error(`Unknown minifier: ${lane}`)
}
