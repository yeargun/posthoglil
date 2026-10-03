import {SourceMapConsumer,SourceMapGenerator} from '@jridgewell/source-map'

// Compose the minifier's bundle positions with the bundler's original sources.
// Generated LilScript intermediates remain explicit sources; do not invent .lil
// locations where the compiler has supplied no source-level mapping.
export function composeMaps(outerMap,innerMap){
  const outer=new SourceMapConsumer(outerMap),inner=new SourceMapConsumer(innerMap)
  const result=new SourceMapGenerator({file:outer.file})
  outer.eachMapping(mapping=>{
    const generated={line:mapping.generatedLine,column:mapping.generatedColumn}
    if(mapping.originalLine===null){result.addMapping({generated});return}
    const original=inner.originalPositionFor({line:mapping.originalLine,column:mapping.originalColumn})
    if(original.source===null){result.addMapping({generated});return}
    result.addMapping({generated,source:original.source,original:{line:original.line,column:original.column},name:original.name??mapping.name??undefined})
  })
  for(const source of inner.sources)result.setSourceContent(source,inner.sourceContentFor(source,true))
  return result.toJSON()
}
export const withoutMapComment=code=>code.replace(/\n?\/\/# sourceMappingURL=[^\r\n]*\s*$/,'').trimEnd()+'\n'
export const withMapComment=(code,name)=>withoutMapComment(code)+'//# sourceMappingURL='+name+'\n'
