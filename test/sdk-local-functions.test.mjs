import assert from 'node:assert/strict'
import {test} from 'node:test'
import ts from 'typescript'
import {analyzeLocalFunctions} from '../scripts/sdk-local-functions.mjs'

const analyze=code=>analyzeLocalFunctions(ts.createSourceFile('/private-functions.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)).summary

test('recognizes a private direct call through the actual lexical binding',()=>{
  assert.deepEqual(analyze('const helper=x=>x+1; export function run(x){return helper(x)}'),[{name:'helper',arity:1,calls:1}])
  assert.deepEqual(analyze('function helper(x){return x+1} export function run(x){return helper(x)}'),[{name:'helper',arity:1,calls:1}])
})
test('does not confuse shadowed functions with an outer private helper',()=>{
  assert.deepEqual(analyze('const helper=x=>x+1; function run(helper){return helper()} export function result(x){return helper(x)+run(()=>2)}'),[{name:'helper',arity:1,calls:1},{name:'run',arity:1,calls:1}])
})
test('retains dynamic calls for exported, escaped and reflected functions',()=>{
  for(const tail of ['export {helper}', 'export {helper as publicHelper}', 'host(helper)', 'host({helper})', 'const saved={helper}', 'const saved=helper', 'helper.length', 'new helper(1)', 'helper.call(null,1)', 'eval("helper")']){
    assert.deepEqual(analyze(`const helper=x=>x+1; helper(1); ${tail}`),[],tail)
  }
  assert.deepEqual(analyze('export const helper=x=>x+1; helper(1)'),[])
})
test('refuses mutable bindings, assignments and non-exact argument lists',()=>{
  for(const code of ['let helper=x=>x; helper(1)','function helper(x){return x} helper=other; helper(1)','const helper=x=>x; helper()','const helper=x=>x; helper(1,2)','const helper=x=>x; helper(...items)'])assert.deepEqual(analyze(code),[],code)
})
test('keeps default, rest, async and generator functions on the dynamic path',()=>{
  for(const code of ['const helper=(x=1)=>x; helper(1)','const helper=(...x)=>x; helper(1)','async function helper(x){return x} helper(1)','function* helper(x){yield x} helper(1)'])assert.deepEqual(analyze(code),[],code)
})
