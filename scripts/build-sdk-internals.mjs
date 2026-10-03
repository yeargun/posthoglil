import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {root,replacements} from './sdk-source.mjs'

const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
const compiler=resolve(process.env.LILSCRIPT_COMPILER??join(root,'.tmp/bin/lilscript'))
if (!existsSync(compiler)) throw Error('Set LILSCRIPT_COMPILER to a freshly built LilScript executable')
const compilerHash=digest(readFileSync(compiler))
const sourceHash=digest(readdirSync(join(root,'src')).filter(name=>name.endsWith('.lil')).sort().map(name=>name+'\0'+readFileSync(join(root,'src',name),'utf8')).join('\0'))
const objectives=process.argv.find(x=>x.startsWith('--objectives='))?.split('=')[1].split(',')??['raw','gzip','brotli']
const ids=process.argv.find(x=>x.startsWith('--modules='))?.split('=')[1].split(',')
const dev=process.argv.includes('--dev')
const combined=process.argv.includes('--combined')
const surface=process.argv.find(x=>x.startsWith('--surface='))?.split('=')[1]
const plan=surface?JSON.parse(readFileSync(join(root,`reports/full-sdk/plan-${surface}.json`),'utf8')):null
const selected=replacements.filter(row=>(!ids||ids.includes(row.id))&&(!plan||plan.modules.includes(row.id))).map(row=>({...row,exports:row.exports.filter(name=>!plan||plan.exports.includes(`${row.id.replaceAll('-','_')}_${name}`))})).filter(row=>row.exports.length)
const builds=combined||plan?[{id:surface??'combined',exports:[],lil:null,entrySource:selected.map(row=>{
  const key=name=>`${row.id.replaceAll('-','_')}_${name}`
  const factories=plan?row.sdkFactories??{}:{}
  const imports=row.exports.map(name=>{
    const factory=factories[name]
    return `import {${factory?.export??name} as ${key(name)}} from "../../src/${factory?.lil??row.lil}";`
  }).join('\n')
  const exported=row.exports.map(name=>`${row.id.replaceAll('-','_')}_${name}`).join(', ')
  const constructors=(row.constructors??[]).filter(name=>row.exports.includes(name)&&!factories[name]).map(name=>`export constructor ${row.id.replaceAll('-','_')}_${name};`).join('\n')
  return `${imports}\nexport {${exported}};\n${constructors}`
}).join('\n')}]:selected
for (const objective of objectives) {
  if (!['raw','gzip','brotli'].includes(objective)) throw Error('Unknown objective')
  for (const row of builds) {
    const directory=join(root,'dist/sdk-internals',objective)
    const evidence=join(root,'reports/full-sdk/internals',objective,row.id)
    mkdirSync(directory,{recursive:true});mkdirSync(evidence,{recursive:true})
    mkdirSync(join(root,'.tmp/sdk-entries'),{recursive:true})
    const entry=join(root,'.tmp/sdk-entries',row.id+'.lil')
    const names=row.exports.join(', ')
    writeFileSync(entry,row.entrySource??`import { ${names} } from "../../src/${row.lil}";\nexport { ${names} };\n${(row.constructors??[]).map(name=>`export constructor ${name};`).join("\n")}\n`)
    const config=join(root,'configs/sdk',objective+'.toml')
    // These are linker inputs. Final SDK minification runs after linking, and
    // the measured effort sweep found no delivery gain from tiers 13–16.
    const configText=`[policy]\nversion = 3\n[javascript]\npriority = "size-first"\nassume_pristine_builtins = false\n# Private linker boundaries; public API names are preserved separately.\nkeep_published_function_names = false\n[effort]\nlevel = 8\n[objective]\ncodecs = "${objective}"\n[mangle]\nidentifiers = true\nproperties = true\npool_strings = true\n`
    writeFileSync(config,configText)
    const output=join(directory,row.id+'.mjs')
    const receipt=join(evidence,'build.json')
    const identity={compilerSha256:compilerHash,sourceSha256:sourceHash,configSha256:digest(configText),entrySha256:digest(readFileSync(entry))}
    if(existsSync(receipt)&&existsSync(output)&&!process.argv.includes('--fresh')){
      const saved=JSON.parse(readFileSync(receipt,'utf8'))
      if(Object.entries(identity).every(([k,v])=>saved[k]===v)&&saved.outputSha256===digest(readFileSync(output))){console.log('cached',objective,row.id);continue}
    }
    const args=[entry,'--config',config,'--target','js-module','--mode',dev?'development':'production','--jobs','1','--cache','off','--logical-work','2000000000','-o',output]
    console.log('compiling',objective,row.id)
    const started=performance.now()
    const result=spawnSync(compiler,args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,RAYON_NUM_THREADS:'1'}})
    const seconds=(performance.now()-started)/1000
    writeFileSync(join(evidence,'compiler.log'),result.stdout+result.stderr)
    if(result.status!==0)throw Error(`${row.id}: ${result.stderr||result.stdout}`)
    const bytes=readFileSync(output)
    writeFileSync(receipt,JSON.stringify({...identity,id:row.id,objective,mode:dev?'development':'production',command:[compiler,...args],seconds,raw:bytes.length,outputSha256:digest(bytes)},null,2)+'\n')
    console.log('compiled',objective,row.id,bytes.length,seconds.toFixed(3)+'s')
  }
}
