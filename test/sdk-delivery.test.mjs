import assert from 'node:assert/strict'
import {test} from 'node:test'
import {poolLiterals,optimizeSdkDelivery} from '../scripts/sdk-delivery.mjs'
import {minifySdk} from '../scripts/sdk-minify.mjs'

const load=code=>import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
const fixture=`
const events=[];
const target={longProperty:7, otherProperty:9};
const value=new Proxy(target,{get(t,k){events.push(['get',k]);return t[k]},set(t,k,v){events.push(['set',k,v]);t[k]=v;return true}});
class Base {get longProperty(){return 3}set longProperty(v){events.push(['super',v])}}
class Derived extends Base {run(){super.longProperty=4;return super.longProperty}}
function read(which){switch(which){case 'longProperty':return value.longProperty;default:return value.otherProperty}}
value.longProperty=read('longProperty')+read('longProperty');
const result={same:read('longProperty'),other:read('otherProperty'),base:new Derived().run(),missing:null?.longProperty,events};
export {result};
`
for(const surface of ['standard','full'])for(const objective of ['raw','gzip','brotli']) {
  test(`delivery preserves ${surface}/${objective} property traps and evaluation`,async()=>{
    const {output}=await optimizeSdkDelivery(fixture,{surface,objective})
    assert.deepEqual((await load(output)).result,(await load(fixture)).result)
  })
}
test('literal pooling preserves directive prologues and public method names',async()=>{
  const source=`"use strict";export const value={"longProperty"(){return "longProperty"},another(){return "longProperty"}};export function check(){return [value.longProperty.name,value.longProperty(),value.another()]}`
  const result=poolLiterals(source)
  assert.ok(result.bindings>0)
  assert.match(result.code,/^"use strict";/)
  assert.deepEqual((await load(result.code)).check(),(await load(source)).check())
})
test('literal pooling keeps eval and module-cycle boundaries untouched',()=>{
  for(const source of ['export function f(){return eval("longProperty")}', 'import {value} from "./other.mjs";export function f(){return "longProperty"+value.longProperty}']){
    assert.equal(poolLiterals(source).code,source)
  }
})
test('pooling recognizes cooked template literals and preserves tagged raw text',async()=>{
  const source='export function read(){return [`repeated long value\\n`,`repeated long value\\n`,String.raw`repeated long value\\n`,String.raw`repeated long value\\n`]}';
  const result=poolLiterals(source,{propertyAccesses:false})
  assert.equal(result.bindings,1)
  assert.equal(result.references,2)
  assert.deepEqual((await load(result.code)).read(),(await load(source)).read())
})
test('package pooling shares values while retaining named member access and receiver behavior',async()=>{
  const name='longPublicMethodNameForPackage'
  const calls=Array.from({length:8},()=>`value.${name}()`).join(',')
  const source=`const keys=[];const value=new Proxy({${name}(){return this===value}},{get(target,key,receiver){keys.push(key);return Reflect.get(target,key,receiver)}});export const result=[${calls},value.${name}.name,keys,"repeated protocol value","repeated protocol value","repeated protocol value"]`
  const {output,receipt}=await optimizeSdkDelivery(source,{surface:'standard',objective:'package'})
  assert.equal(receipt.literalPool.bindings,1)
  assert.equal(receipt.literalPool.references,3)
  assert.ok(output.includes('.'+name),'Named property access must remain named')
  assert.deepEqual((await load(output)).result,(await load(source)).result)
})
test('private mangling preserves quoted protocol fields and public payloads',async()=>{
  const source=`const key='_wireData';class State{constructor(){this._privateCounter=3;this._wireData=4}_readCounter(){return this._privateCounter}get(){return this._readCounter()+this[key]}};export const result=[new State().get(),{['_wireData']:5}];`
  const output=await minifySdk(source,{surface:'full',lane:'oxc-private'})
  assert.ok(!output.includes('_privateCounter'))
  assert.ok(output.includes('_wireData'))
  assert.deepEqual((await load(output)).result,(await load(source)).result)
  const pooled=await optimizeSdkDelivery(output,{surface:'full',objective:'raw'})
  assert.deepEqual((await load(pooled.output)).result,(await load(source)).result)
})
