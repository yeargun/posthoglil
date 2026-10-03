import {test} from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import {analyzePrimitiveTypes} from '../scripts/sdk-primitive-types.mjs'

const analyze=code=>analyzePrimitiveTypes(ts.createSourceFile('input.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS))
test('proves predicates and follows typed calls without trusting TS assertions',()=>{
  const result=analyze('export const isString=x=>typeof x==="string"; export function valid(x){return isString(x)&&x.length>0} const unknown=x=>x&&true;')
  assert.deepEqual(result.summary.map(row=>row.name).sort(),['isString','valid'])
  assert.equal(result.calls.size,1)
})
test('rejects defaults, mutable bindings, fallthrough, arithmetic and missing returns',()=>{
  const result=analyze('function defaulted(x=true){return x} let flag=true; function mutable(){return flag} function partial(x){if(x)return true} function plus(x){return x+1} function empty(){}')
  assert.equal(result.summary.length,0)
})
test('does not infer Number from a boxed-value predicate or trust reassigned helpers',()=>{
  const result=analyze('function isNumber(x){return Object.prototype.toString.call(x)==="[object Number]"} function helper(x){return !!x} helper=external; function consumer(x){return helper(x)}')
  assert.deepEqual(result.summary.map(row=>row.name),['isNumber'])
})
test('distinguishes shadowing, nested functions and const values',()=>{
  const result=analyze('const YES=true; function one(){return YES} function two(){const YES=external; return YES} function outer(){function inner(){return unknown} return true}')
  assert.deepEqual(result.summary.map(row=>row.name).sort(),['one','outer'])
})
test('direct eval disables inferred local contracts',()=>{
  assert.equal(analyze('function f(){return true} eval(source)').summary.length,0)
})
