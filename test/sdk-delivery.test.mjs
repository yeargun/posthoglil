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
test('private mangling preserves quoted protocol fields and public payloads',async()=>{
  const source=`const key='_wireData';class State{constructor(){this._privateCounter=3;this._wireData=4}_readCounter(){return this._privateCounter}get(){return this._readCounter()+this[key]}};export const result=[new State().get(),{['_wireData']:5}];`
  const output=await minifySdk(source,{surface:'full',lane:'oxc-private'})
  assert.ok(!output.includes('_privateCounter'))
  assert.ok(output.includes('_wireData'))
  assert.deepEqual((await load(output)).result,(await load(source)).result)
  const pooled=await optimizeSdkDelivery(output,{surface:'full',objective:'raw'})
  assert.deepEqual((await load(pooled.output)).result,(await load(source)).result)
})
