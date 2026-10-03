import {existsSync, readFileSync, readdirSync} from 'node:fs'
import {dirname, join, resolve, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {rolldown} from 'rolldown'
import ts from 'typescript'
import {transform as transformCss,Features} from 'lightningcss'
import {dependencyAliases} from './dependency-aliases.mjs'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const upstreamVersion = '1.435.8'
export const upstreamCommit = 'c9d890a4028b186a5e1b327161ea197001c0c46b'
export const vendor = join(root, 'vendor/posthog-js')
export const canonicalDependencies = dependencyAliases(root)

export const surfaces = {
  standard: 'module.es.ts',
  full: 'module.full.no-external.es.ts',
}

// Only explicitly listed, differentially checked exports cross this boundary.
// Other exports continue to come from the pinned, unmodified upstream module.
export const replacements = [
  {id:'error-default-pipeline', declarations:true, source:'browser/src/posthog-exceptions.ts', lil:'sdk-errors.lil', exports:['buildErrorPropertiesBuilder']},
  {id:'flags', source:'core/src/featureFlagUtils.ts', lil:'flags.lil', complete:true, exports:['getEnabledFromValue','getVariantFromValue','MINIMAL_FLAG_CALLED_EVENT_CAMPAIGN_PROPERTIES','MINIMAL_FLAG_CALLED_EVENT_PROPERTIES','normalizeFlagsResponse','getFlagValuesFromFlags','getPayloadsFromFlags','getFeatureFlagValue','parsePayload','createFlagsResponseFromFlagsAndPayloads','updateFlagValue','flagDetailsToResults','minimizeFlagCalledEventProperties']},
  {id:'numbers', complete:true, source:'core/src/utils/number-utils.ts', lil:'number.lil', exports:['clampToRange','getRemoteConfigBool','getRemoteConfigNumber','isValidSampleRate']},
  {id:'strings', source:'core/src/utils/string-utils.ts', lil:'string.lil', exports:['includes','trim','stripLeadingDollar','isDistinctIdStringLike','getPersonPropertiesHash']},
  {id:'types', complete:true, source:'core/src/utils/type-utils.ts', lil:'types.lil', exports:['hasOwnProperty','isArray','isFunction','isNativeFunction','isObject','isUndefined','isString','isNull','isNullish','isBoolean','isFormData','isFile','isPlainError','isError','isErrorEvent','isEvent','isPlainObject','isNumber','isEmptyObject','isEmptyString','isPositiveNumber','isPrimitive','isBuiltin','isYesLike','isNoLike','isKnownUnsafeEditableEvent','isKnownUnsafeEditableEventProperty','yesLikeValues','noLikeValues']},
  {id:'bots', complete:true, source:'core/src/utils/bot-detection.ts', lil:'bot.lil', exports:['DEFAULT_BLOCKED_UA_STRS','isBlockedUA']},
  {id:'autocapture', complete:true, source:'browser-common/src/utils/autocapture-utils.ts', lil:'autocapture-entry.lil', exports:['DEFAULT_AUTOCAPTURE_IGNORE_LIST','elementMatchesCSSSelector','DEFAULT_CONTENT_IGNORELIST_WITH_STEPPERS','MAX_DOM_ANCESTOR_DEPTH','autocaptureCompatibleElements','getClassNames','getDirectAndNestedSpanText','getElementsChainString','getEventTarget','getNestedSpanText','getParentElement','getSafeText','isAngularStyleAttr','isSensitiveElement','isTextSelectionTarget','makeSafeText','shouldCaptureDeadClick','shouldCaptureDomEvent','shouldCaptureElement','shouldCaptureRageclick','shouldCaptureValue','shouldSkipDeadClick','splitClassString']},
  {id:'replay-config', complete:true, source:'browser/src/extensions/replay/external/config.ts', lil:'replay-core.lil', exports:['buildNetworkRequestOptions','defaultNetworkOptions','effectivePayloadLimitBytes','isInitialMaskFallback','MAX_PAYLOAD_SIZE_BYTES']},
  {id:'replay-utils', complete:true, source:'browser/src/extensions/replay/external/sessionrecording-utils.ts', lil:'replay-core.lil', exports:['CONSOLE_LOG_PLUGIN_NAME','FULL_SNAPSHOT_EVENT_TYPE','INCREMENTAL_SNAPSHOT_EVENT_TYPE','MAX_MESSAGE_SIZE','META_EVENT_TYPE','MUTATION_SOURCE_TYPE','PLUGIN_EVENT_TYPE','SEVEN_MEGABYTES','UNSTRINGIFIABLE_EVENT_SIZE','circularReferenceReplacer','ensureMaxMessageSize','estimateCompressedEventSize','estimateSize','replacementImageURI','splitBuffer','truncateLargeConsoleLogs']},
  {id:'surveys', complete:true, source:'core/src/surveys/index.ts', lil:'surveys-entry.lil', exports:['SURVEY_LANGUAGE_PROPERTY','applySurveyTranslation','buildSurveyResponseProperties','canSurveyActivateRepeatedly','detectSurveyLanguage','doesSurveyActivateByEvent','findBestTranslationMatch','getBaseLanguage','getLanguageFromStoredPersonProperties','getLengthFromRules','getRequirementsHint','getSurveyInteractionProperty','getSurveyIterationKey','getSurveyOldResponseKey','getSurveyResponseKey','getSurveyResponseValue','getValidationError','isSurveyIterationBased','isSurveyKeyForSurvey','normalizeLanguageCode','surveyHasResponses','recordSurveyAnswer','buildSurveyResponseEventProperties','isValidRegex','isMatchingRegex','propertyComparisons','matchPropertyFilters','shuffle','getDisplayOrderChoices']},
  {id:'error-tracking', sdkFactories:{ExceptionStepsBuffer:{lil:'error-core.lil',export:'createSdkExceptionStepsBuffer'}}, constructors:['DOMExceptionCoercer','ErrorCoercer','ErrorEventCoercer','ErrorPropertiesBuilder','EventCoercer','ExceptionStepsBuffer','ObjectCoercer','PrimitiveCoercer','PromiseRejectionEventCoercer','ReduceableCache','StringCoercer'], complete:true, source:'core/src/error-tracking/index.ts', lil:'error-tracking-entry.lil', exports:['DEFAULT_EXCEPTION_STEPS_CONFIG','DOMExceptionCoercer','EXCEPTION_STEP_INTERNAL_FIELDS','ErrorCoercer','ErrorEventCoercer','ErrorPropertiesBuilder','EventCoercer','ExceptionStepsBuffer','ObjectCoercer','PrimitiveCoercer','PromiseRejectionEventCoercer','ReduceableCache','StringCoercer','chromeStackLineParser','createDefaultStackParser','createStackParser','geckoStackLineParser','getInjectedReleaseId','getUtf8ByteLength','nodeStackLineParser','opera10StackLineParser','opera11StackLineParser','resolveExceptionStepsConfig','reverseAndStripFrames','stripReservedExceptionStepFields','winjsStackLineParser']},
  {id:'otlp-resource', source:'core/src/utils/otlp-resource.ts', lil:'otlp.lil', exports:['buildOtlpResourceAttributes','toOtlpResourceKeyValueList']},
  {id:'json-strings', source:'core/src/utils/json-utils.ts', lil:'json.lil', exports:['sanitizeString']},
  {id:'otlp-values', complete:true, source:'core/src/utils/otlp-any-value.ts', lil:'otlp.lil', exports:['toOtlpAnyValue','toOtlpKeyValueList']},
  {id:'otlp-logs', complete:true, source:'core/src/logs/logs-utils.ts', lil:'otlp.lil', exports:['getOtlpSeverityText','getOtlpSeverityNumber','buildOtlpLogRecord','buildResourceAttributes','buildOtlpLogsPayload']},
  {id:'otlp-metrics', complete:true, source:'core/src/metrics/metrics-utils.ts', lil:'otlp.lil', exports:['DEFAULT_HISTOGRAM_BOUNDS','msToUnixNano','seriesKey','bucketIndexFor','buildMetricsResourceAttributes','buildOtlpMetricsPayload']},
  {id:'otlp-config', complete:true, source:'core/src/metrics/config.ts', lil:'otlp.lil', exports:['resolveMetricsConfig']},
]

const workspace = new Map()
function discover(directory, depth=0) {
  if (depth > 3) return
  const manifest=join(directory,'package.json')
  if (existsSync(manifest)) {
    const pkg=JSON.parse(readFileSync(manifest,'utf8'))
    if (pkg.name?.startsWith('@posthog/')) workspace.set(pkg.name,directory)
  }
  for (const dir of readdirSync(directory,{withFileTypes:true})) {
    if (dir.isDirectory() && !['node_modules','src','dist','lib','test','tests','__tests__'].includes(dir.name)) discover(join(directory,dir.name),depth+1)
  }
}
discover(join(vendor,'packages'))

function sourcePath(base) {
  for (const file of [base,base+'.ts',base+'.tsx',base+'.js',join(base,'index.ts'),join(base,'index.tsx')]) {
    if (existsSync(file) && !readdirSafe(file)) return file
  }
  return undefined
}
function readdirSafe(file) { try {readdirSync(file);return true} catch {return false} }

export function workspaceSourcePlugin({objective, enabled=replacements.map(row=>row.id), applied=[],layout='separate',probe=false,plan,surface}={}) {
  const selected=new Map(replacements.filter(row=>enabled.includes(row.id)).map(row=>[join(vendor,'packages',row.source),row]))
  return {
    name:'pinned-posthog-source',
    setup(build) {
      for(const row of canonicalDependencies) {
        build.onResolve({filter:new RegExp('^'+row.alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:/|$)')},args=>({path:fileURLToPath(import.meta.resolve(row.canonical+args.path.slice(row.alias.length)))}))
      }
      // Match PostHog's build: CSS imports export text for the component to inject.
      // An unused replay stylesheet must not become a new network dependency.
      build.onLoad({filter:/\.css$/},args=>{
        const result=transformCss({filename:args.path,code:readFileSync(args.path),minify:true,include:Features.Nesting|Features.MediaQueries})
        return {contents:`export default ${JSON.stringify(result.code.toString())}`,loader:'js'}
      })
      // rrweb's source uses Vite's inline-worker import convention. Resolve it
      // identically for both sides, including the real canvas worker payload.
      build.onResolve({filter:/\?worker&inline$/},args=>({path:resolve(args.resolveDir,args.path.split('?')[0]),namespace:'posthog-worker'}))
      build.onLoad({filter:/.*/,namespace:'posthog-worker'},async args=>{
        const esbuild=await import('esbuild')
        const worker=await esbuild.build({entryPoints:[args.path],bundle:true,write:false,format:'iife',platform:'browser',target:'es2015',minify:true,logLevel:'silent'})
        const code=worker.outputFiles[0].text
        return {contents:`export default function InlineWorker(options){const url=URL.createObjectURL(new Blob([${JSON.stringify(code)}],{type:"text/javascript"}));try{return new Worker(url,options)}finally{URL.revokeObjectURL(url)}}`,loader:'js'}
      })
      build.onResolve({filter:/^posthog-original:/}, args=>({path:args.path.slice('posthog-original:'.length),namespace:'posthog-original'}))
      build.onLoad({filter:/.*/,namespace:'posthog-original'}, args=>({contents:readFileSync(args.path,'utf8'),loader:args.path.endsWith('.tsx')?'tsx':'ts',resolveDir:dirname(args.path)}))
      build.onResolve({filter:/^(@posthog\/|@\/)/}, args=>{
        // The recorder's own pinned build uses recording-only dependency entries.
        // See packages/rrweb/record/vite.config.ts; do not pull the replay player in.
        if(args.path==='@posthog/rrweb')return {path:join(vendor,'packages/rrweb/rrweb/src/entries/record.ts')}
        if(args.path==='@posthog/rrweb-snapshot')return {path:join(vendor,'packages/rrweb/rrweb-snapshot/src/record.ts')}
        if (args.path.startsWith('@/')) return {path:sourcePath(join(vendor,'packages/core/src',args.path.slice(2)))}
        const [scope,name,...parts]=args.path.split('/')
        const base=workspace.get(`${scope}/${name}`)
        if (!base) return undefined
        const file=sourcePath(join(base,'src',...(parts.length?parts:['index'])))
        if (!file) throw Error(`Missing pinned workspace source: ${args.path} from ${args.importer}`)
        return {path:file}
      })
      if (objective||probe) build.onLoad({filter:/\.[cm]?[jt]sx?$/,namespace:'file'},args=>{
        const row=selected.get(args.path)
        if (!row) return undefined
        let original=row.complete?'':`export * from ${JSON.stringify('posthog-original:'+args.path)};`
        if(row.declarations) {
          original=readFileSync(args.path,'utf8')
          const source=ts.createSourceFile(args.path,original,ts.ScriptTarget.Latest,true)
          const declarations=source.statements.filter(node=>ts.isFunctionDeclaration(node)&&row.exports.includes(node.name?.text))
          if(declarations.length!==row.exports.length||declarations.some(node=>!node.body))throw Error(`Declaration boundary changed: ${args.path}`)
          for(const declaration of declarations.reverse())original=original.slice(0,declaration.getStart(source))+original.slice(declaration.end)
        }
        const key=name=>`${row.id.replaceAll('-','_')}_${name}`
        if(probe)return {contents:original+'\n'+row.exports.map(name=>`export const ${name}=/* @__PURE__ */ globalThis.__posthog_lil_plan__(${JSON.stringify(key(name))});`).join('\n'),loader:row.declarations?'ts':'js',resolveDir:dirname(args.path)}
        const artifact=join(root,'dist/sdk-internals',objective,plan?surface+'.mjs':layout==='combined'?'combined.mjs':row.id+'.mjs')
        if (!existsSync(artifact)) throw Error(`Compile the ${objective} internals first: ${row.id}`)
        applied.push(row.id)
        const included=row.exports.filter(name=>!plan||plan.includes(key(name)))
        const factories=plan?included.filter(name=>row.sdkFactories?.[name]):[]
        const names=included.filter(name=>!factories.includes(name)).map(name=>layout==='combined'||plan?`${key(name)} as ${name}`:name)
        // These constructors are private to the complete SDK. Public utility
        // entry points continue to export the original constructor ABI.
        const factoryWrappers=factories.map(name=>`import {${key(name)} as __factory_${name}} from ${JSON.stringify(artifact)};\nexport function ${name}(config){return __factory_${name}(config)}`).join('\n')
        const unused=row.exports.filter(name=>!included.includes(name)).map(name=>`export const ${name}=/* @__PURE__ */ globalThis.__posthog_lil_unexpected__(${JSON.stringify(key(name))});`).join('\n')
        return {contents:row.declarations?`import {${names.join(',')}} from ${JSON.stringify(artifact)};\nexport {${included.join(',')}};\n${original}\n${unused}`:`${original}\nexport {${names.join(',')}} from ${JSON.stringify(artifact)};\n${factoryWrappers}\n${unused}`,loader:row.declarations?'ts':'js',resolveDir:dirname(args.path)}
      })
    },
  }
}

// Use the same modern syntax targets as the pinned upstream production build.
// Both original and candidate pass through this exact source resolver and bundler.
export async function bundleSdk({surface='standard',objective,enabled,format='esm',minify=false,layout='separate',probe=false,plan,sourceMap=false}={}) {
  if(!surfaces[surface])throw Error(`Unknown SDK surface: ${surface}`)
  const applied=[]
  const resolveHooks=[],loadHooks=[]
  workspaceSourcePlugin({objective,enabled,applied,layout,probe,plan,surface}).setup({
    onResolve:(options,run)=>resolveHooks.push({options,run}),
    onLoad:(options,run)=>loadHooks.push({options,run}),
  })
  const unpack=id=>id.startsWith('\0posthog:')?JSON.parse(id.slice(9)):{path:id,namespace:'file'}
  const pack=value=>value.namespace&&value.namespace!=='file'?'\0posthog:'+JSON.stringify(value):value.path
  const bundle=await rolldown({
    input:join(vendor,'packages/browser/src/entrypoints',surfaces[surface]),
    platform:'browser',tsconfig:false,
    transform:{
      target:['es2015','chrome63','firefox60','ios10.3','opera51','safari12.1'],
      assumptions:{setPublicClassFields:true},
      jsx:{runtime:'automatic',importSource:'preact'},
      define:{'process.env.NODE_ENV':'"production"'},
    },
    treeshake:{moduleSideEffects:[{test:/\/packages\/core\/src\//,sideEffects:false}]},
    plugins:[{
      name:'pinned-posthog-source',
      async resolveId(id,importer){
        const from=importer?unpack(importer):undefined
        for(const hook of resolveHooks){
          if(!hook.options.filter.test(id))continue
          const result=await hook.run({path:id,importer:from?.path,resolveDir:from?dirname(from.path):root})
          if(result?.path)return pack(result)
        }
        if(from&&from.namespace!=='file'&&id.startsWith('.'))return (await this.resolve(resolve(dirname(from.path),id),undefined,{skipSelf:true}))
        return null
      },
      async load(id){
        const value=unpack(id)
        for(const hook of loadHooks){
          if((hook.options.namespace??'file')!==value.namespace||!hook.options.filter.test(value.path))continue
          const result=await hook.run(value)
          if(result)return {code:result.contents,moduleType:result.loader==='tsx'?'tsx':result.loader==='ts'?'ts':'js'}
        }
        return null
      },
    }],
    onwarn(warning){if(warning.code!=='SOURCEMAP_ERROR')throw Error(warning.message)},
  })
  try{
    const result=await bundle.generate({format:format==='esm'?'es':format,name:format==='iife'?'posthogSDK':undefined,minify,exports:'named',file:join(root,'.tmp/sdk-unminified.mjs'),sourcemap:sourceMap?'hidden':false,sourcemapPathTransform:(source,mapPath)=>relative(root,resolve(dirname(mapPath),source))})
    const chunks=result.output.filter(row=>row.type==='chunk')
    if(chunks.length!==1)throw Error('Expected one self-contained SDK chunk')
    const code=chunks[0].code
    if(!probe&&/__posthog_lil_(?:plan|unexpected)__/.test(code))throw Error('SDK reachability plan is incomplete; regenerate and recompile it')
    const extras=result.output.filter(row=>row.type!=='chunk'&&!row.fileName.endsWith('.map')).map(row=>({path:row.fileName,contents:Buffer.from(row.source)}))
    return {code,map:chunks[0].map,extras,applied:[...new Set(applied)].sort(),metafile:{modules:Object.keys(chunks[0].modules)}}
  }finally{await bundle.close()}
}
