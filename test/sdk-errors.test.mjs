import assert from 'node:assert/strict'
import {test} from 'node:test'
import {writeFileSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {root} from '../scripts/sdk-source.mjs'
import {bundleOfficialErrorTracking} from '../scripts/official-bundle.mjs'
mkdirSync(resolve(root,'.tmp'),{recursive:true})
const originalFile=resolve(root,'.tmp/sdk-errors-original.mjs')
writeFileSync(originalFile,await bundleOfficialErrorTracking(root))
const original=await import(pathToFileURL(originalFile))
const candidate=await import(pathToFileURL(resolve(root,process.env.POSTHOGLIL_SDK_ERRORS_ARTIFACT??'dist/sdk-internals/brotli/combined.mjs')))
const factory=candidate.buildErrorPropertiesBuilder??candidate.error_default_pipeline_buildErrorPropertiesBuilder
const names=['DOMExceptionCoercer','PromiseRejectionEventCoercer','ErrorEventCoercer','ErrorCoercer','EventCoercer','ObjectCoercer','StringCoercer','PrimitiveCoercer']
const buildOriginal=()=>new original.ErrorPropertiesBuilder(names.map(name=>new original[name]()),original.createDefaultStackParser())
const stack='Error: fixture\n    at checkout (https://example.test/app.js:14:9)\n    at main (https://example.test/app.js:30:2)'
const error=(message='fixture')=>Object.assign(new Error(message),{stack})
const cases=[undefined,null,false,true,0,NaN,Infinity,17n,Symbol('fixture'),'', 'TypeError: failed','Uncaught ReferenceError: absent',()=>{},[],{}, {message:'hello'}, {name:'Failure',message:'hello',stack}, {name:'Failure',level:'fatal'},Object.assign(Object.create(null),{message:'null prototype'}),new String('boxed'),new Number(3),new Event('fixture'),new DOMException('blocked','SecurityError'),error(),new AggregateError([error('one'),error('two')],'multiple')]
for(const value of cases) {
  test(`default error pipeline: ${typeof value} ${Object.prototype.toString.call(value)}`,()=>{
    for(const hint of [{},{syntheticException:{stack}},{mechanism:{handled:false,type:'auto.browser'},skipFirstLines:0}]) {
      assert.deepEqual(factory().buildFromUnknown(value,hint),buildOriginal().buildFromUnknown(value,hint))
    }
  })
}
test('default error pipeline preserves wrapper forwarding, cycles and aggregate budgets',()=>{
  const first=error('first'),second=error('second');first.cause=second;second.cause=first
  const values=[first,{[Symbol.toStringTag]:'ErrorEvent',message:'page failure',filename:'https://example.test/app.js',lineno:4,colno:2},{[Symbol.toStringTag]:'PromiseRejectionEvent',reason:first},new AggregateError(Array.from({length:80},(_,i)=>error(String(i))),'many')]
  for(const value of values)assert.deepEqual(factory().buildFromUnknown(value),buildOriginal().buildFromUnknown(value))
})
test('default error pipeline preserves getters, inspection order and repeated calls',()=>{
  function run(make) {
    const effects=[],builder=make(),input={}
    for(const name of ['name','message','level','stack','stacktrace'])Object.defineProperty(input,name,{enumerable:true,get(){effects.push(name);return name==='stack'?stack:name==='message'?'hello':undefined}})
    return {results:[builder.buildFromUnknown(input),builder.buildFromUnknown(input)],effects}
  }
  assert.deepEqual(run(factory),run(buildOriginal))
  for(const field of ['stack','stacktrace','cause','message','errors']) {
    function thrown(make) {
      const effects=[],input=field==='errors'?new AggregateError([error()],'aggregate'):error()
      input.stack=stack
      Object.defineProperty(input,field,{get(){effects.push(field);throw new RangeError('fixture getter')}})
      try{return {result:make().buildFromUnknown(input),effects}}
      catch(failure){return {failure:failure.name,effects}}
    }
    assert.deepEqual(thrown(factory),thrown(buildOriginal),field)
  }
  function revoked(make) {
    const proxy=Proxy.revocable({},{});proxy.revoke()
    try{return {result:make().buildFromUnknown(proxy.proxy)}}
    catch(failure){return {failure:failure.name}}
  }
  assert.deepEqual(revoked(factory),revoked(buildOriginal))
})
test('default error pipeline preserves repeated reads of a valid severity getter',()=>{
  function run(make) {
    const effects=[],input={message:'failure',stack}
    Object.defineProperty(input,'level',{get(){effects.push('level');return 'fatal'}})
    return {result:make().buildFromUnknown(input),effects}
  }
  assert.deepEqual(run(factory),run(buildOriginal))
})

test('default error pipeline does not coerce a dynamic object tag',()=>{
  function run(make) {
    const input=error(),builder=make(),saved=Object.prototype.toString
    const tag={ [Symbol.toPrimitive](){throw new Error('Object tags must not be coerced')} }
    Object.prototype.toString=function(){return tag}
    try {return builder.buildFromUnknown(input)}
    finally {Object.prototype.toString=saved}
  }
  assert.deepEqual(run(factory),run(buildOriginal))
})

test('default error pipeline preserves the result of the host String call',()=>{
  function run(make) {
    const input=error(),builder=make(),saved=globalThis.String
    globalThis.String=value=>({value,[Symbol.toPrimitive](){throw new Error('No second conversion')}})
    try {
      const result=builder.buildFromUnknown(input)
      return result.$exception_list.map(exception=>exception.value.value)
    } finally {globalThis.String=saved}
  }
  assert.deepEqual(run(factory),run(buildOriginal))
})
