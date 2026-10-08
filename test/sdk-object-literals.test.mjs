import assert from 'node:assert/strict'
import {test} from 'node:test'
import {materializeObjectLiterals} from '../scripts/sdk-object-literals.mjs'

const plan={intrinsic:'__literal',arguments:3,fields:[{kind:'spread',value:0},{kind:'computed',key:1,value:2}]}
const linked=materializeObjectLiterals('function build(source,key,value){return __literal(()=>source,()=>key,()=>value())}',[plan])
const build=Function(`return (${linked})`)()
const original=(source,key,value)=>({...source,[key]:value()})

test('native objects retain proxy/getter/key-coercion order, Symbols and own __proto__ data',()=>{
  const symbol=Symbol('source')
  const run=build=>{
    const events=[],source={first:1,[symbol]:3}
    Object.defineProperty(source,'__proto__',{value:{marker:true},enumerable:true})
    const proxy=new Proxy(source,{
      ownKeys(target){events.push('keys');return Reflect.ownKeys(target)},
      getOwnPropertyDescriptor(target,key){events.push('descriptor:'+String(key));return Reflect.getOwnPropertyDescriptor(target,key)},
      get(target,key){events.push('value:'+String(key));return Reflect.get(target,key)},
    })
    const key={[Symbol.toPrimitive](hint){events.push('key:'+hint);return 'last'}}
    const result=build(proxy,key,()=>{events.push('last value');return 4})
    assert.equal(Object.getPrototypeOf(result),Object.prototype)
    assert.equal(Object.hasOwn(result,'__proto__'),true)
    assert.equal(result[symbol],3)
    return {events,descriptors:Object.getOwnPropertyDescriptors(result)}
  }
  assert.deepEqual(run(build),run(original))
})

test('an abrupt spread or key coercion prevents later field evaluation',()=>{
  for(const failAt of ['spread','key']){
    const run=build=>{
      const events=[]
      const source={get first(){events.push('first');if(failAt==='spread')throw Error('spread');return 1}}
      const key={[Symbol.toPrimitive](){events.push('key');throw Error('key')}}
      assert.throws(()=>build(source,key,()=>events.push('last')),new RegExp(failAt))
      return events
    }
    assert.deepEqual(run(build),run(original))
  }
})

test('native data fields bypass inherited setters and ignore nullish spreads',()=>{
  let calls=0
  Object.defineProperty(Object.prototype,'__abiField',{set(){calls++},configurable:true})
  try{
    for(const source of [null,undefined])assert.deepEqual(build(source,'__abiField',()=>3),{__abiField:3})
    assert.equal(calls,0)
  }finally{delete Object.prototype.__abiField}
})

test('nested literals preserve lexical receivers and lazy field reads',()=>{
  const outer={intrinsic:'__outer',arguments:2,fields:[{kind:'computed',key:0,value:1}]}
  const inner={intrinsic:'__inner',arguments:1,fields:[{kind:'data',key:'value',value:0}]}
  const code=materializeObjectLiterals('function make(){let value=0;return __outer(()=>{value++;return this.key},()=>__inner(()=>value))}',[outer,inner])
  const make=Function(`return (${code})`)()
  assert.deepEqual(make.call({key:'nested'}),{nested:{value:1}})
})

test('prototype initializer and an own __proto__ data property remain distinct',()=>{
  const code=materializeObjectLiterals('function make(proto){return __p(()=>proto,()=>2)}',[{intrinsic:'__p',arguments:2,fields:[{kind:'prototype',value:0},{kind:'data',key:'__proto__',value:1}]}])
  const make=Function(`return (${code})`)(),proto={inherited:1},result=make(proto)
  assert.equal(Object.getPrototypeOf(result),proto)
  assert.equal(result.__proto__,2)
})

test('rejects an intrinsic that escaped or changed arity',()=>{
  assert.throws(()=>materializeObjectLiterals('const escaped=__literal',[plan]),/Unresolved/)
  assert.throws(()=>materializeObjectLiterals('__literal(()=>1)',[plan]),/arity/)
})
