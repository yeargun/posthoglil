import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {root} from '../scripts/sdk-source.mjs'
import {bundleOfficialErrorTracking} from '../scripts/official-bundle.mjs'
mkdirSync(resolve(root,'.tmp'),{recursive:true})
const file=resolve(root,'.tmp/sdk-steps-original.mjs')
writeFileSync(file,await bundleOfficialErrorTracking(root))
const original=await import(pathToFileURL(file))
const candidate=await import(pathToFileURL(resolve(root,process.env.POSTHOGLIL_SDK_ERRORS_ARTIFACT??'dist/sdk-internals/brotli/full.mjs')))
const makeCandidate=config=>candidate.error_tracking_ExceptionStepsBuffer(config)
const makeOriginal=config=>new original.ExceptionStepsBuffer(config)
const step=(message='checkout',properties={})=>({$message:message,$timestamp:123,...properties})
const compare=run=>assert.deepEqual(run(makeCandidate),run(makeOriginal))

test('private SDK steps preserve JSON snapshots and reject malformed steps',()=>compare(make=>{
  const buffer=make(),circular=step('cycle');circular.self=circular
  const nested=step('nested',{data:{value:1}})
  for(const value of [null,undefined,0,[],{},{$message:'x'},step(''),step('  '),step('x',{$timestamp:null}),step('unicode 🦔'),circular,nested])buffer.add(value)
  nested.data.value=2
  const first=buffer.getAttachable();first.pop()
  return buffer.getAttachable()
}))

test('private SDK steps obey UTF-8 byte limits, config shrink, clear and reuse',()=>compare(make=>{
  const one=step('🦔'),bytes=new TextEncoder().encode(JSON.stringify(one)).length
  const buffer=make({max_bytes:bytes*2}),out=[]
  buffer.add(one);buffer.add(step('é'));buffer.add(one);out.push(buffer.getAttachable())
  buffer.setConfig({max_bytes:bytes});out.push(buffer.getAttachable())
  buffer.setConfig({max_bytes:0});buffer.add(one);out.push(buffer.getAttachable())
  buffer.setConfig(null);buffer.add(one);out.push(buffer.getAttachable())
  buffer.clear();out.push(buffer.getAttachable());buffer.add(step('again'));out.push(buffer.getAttachable())
  return out
}))

test('private SDK steps match mixed add/config/clear transitions',()=>compare(make=>{
  const buffer=make(),out=[];let seed=9473
  const limits=[undefined,0,42,128,256,Infinity,-Infinity,NaN,-1,3.5,new Number(Infinity),new Number(NaN)]
  for(let i=0;i<300;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0
    if(seed%13===0)buffer.clear()
    else if(seed%5===0)buffer.setConfig({enabled:!!(seed&1),max_bytes:limits[seed%limits.length]})
    else buffer.add(step('event '+i,{payload:'🦔'.repeat(seed%15)}))
    out.push(buffer.getAttachable())
  }
  return out
}))

test('private SDK steps preserve serialization getter order and thrown getters',()=>compare(make=>{
  const effects=[],buffer=make()
  for(const throwing of [false,true]){
    const input=step('getters')
    Object.defineProperty(input,'data',{enumerable:true,get(){effects.push('data');if(throwing)throw Error('fixture');return 3}})
    buffer.add(input)
  }
  buffer.add({toJSON(){effects.push('toJSON');return step('custom')}})
  return {effects,steps:buffer.getAttachable()}
}))

test('private SDK steps preserve config getter order and failure state',()=>compare(make=>{
  const effects=[],buffer=make();buffer.add(step())
  const config={get enabled(){effects.push('enabled');return false},get max_bytes(){effects.push('max_bytes');return 55}}
  buffer.setConfig(config)
  try{buffer.setConfig({get enabled(){throw new RangeError('config')}})}catch(error){effects.push(error.name)}
  const boxed=new Number(55);boxed.valueOf=()=>{effects.push('valueOf');return 55};buffer.setConfig({max_bytes:boxed})
  buffer.add(step('after'))
  return {effects,steps:buffer.getAttachable()}
}))

test('private SDK steps work without TextEncoder and preserve fallback failures',()=>{
  const saved=globalThis.TextEncoder
  try{globalThis.TextEncoder=undefined;compare(make=>{
    const buffer=make({max_bytes:140}),failures=[]
    for(const value of [step('ascii'),step('hé🦔'),step('\ud800')]){
      try{buffer.add(value)}catch(error){failures.push(error.name)}
    }
    return {failures,steps:buffer.getAttachable()}
  })}finally{globalThis.TextEncoder=saved}
})

test('private SDK steps retain dynamic TextEncoder calls and unusual lengths',()=>{
  const saved=globalThis.TextEncoder
  try{compare(make=>{
    const effects=[],buffer=make({max_bytes:100})
    for(const length of [NaN,-1,0,Infinity,101]){
      globalThis.TextEncoder=class{constructor(){effects.push('new')}encode(value){effects.push(value);return {length}}}
      buffer.add(step('length '+length))
    }
    return {effects,steps:buffer.getAttachable()}
  })}finally{globalThis.TextEncoder=saved}
})
