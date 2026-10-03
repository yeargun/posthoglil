// G2 systems under test, each an IIFE that sets `window.__sut` to the entry's exports.
//   node test/lil/g2/build.mjs npm [entry]        npm's published dist file (default module.js)
//   node test/lil/g2/build.mjs source [entry]     upstream's source entry, bundled by esbuild (sanity lane)
//   node test/lil/g2/build.mjs file <path.mjs>    any ESM build (the LilScript release build)
// Writes reports/lil-sdk/g2/sut-<name>.js and prints its path.
import {build} from 'esbuild'
import {mkdirSync,writeFileSync} from 'node:fs'
import {join,resolve,basename} from 'node:path'
import {root,vendor} from '../../../scripts/sdk-source.mjs'

const npmDist=join(process.env.HOME,'lilscript-work/portwork/posthog-100/npm/package/dist')
const out=join(root,'reports/lil-sdk/g2')
mkdirSync(out,{recursive:true})
const [kind,arg]=process.argv.slice(2)
async function iife(entryPoints,extra={}){
  const r=await build({entryPoints,bundle:true,format:'iife',globalName:'__sut',write:false,platform:'browser',logLevel:'error',target:'es2019',...extra})
  return r.outputFiles[0].text+'\nwindow.__sut = __sut;\n'
}
let name,code
if(kind==='npm'){
  const entry=arg??'module.js'
  name='npm-'+entry.replace(/\.js$/,'')
  code=await iife([join(npmDist,entry)])
}else if(kind==='source'){
  const entry=arg??'module.es.ts'
  name='source-'+entry.replace(/\.ts$/,'')
  const aliases=[[/^@\/(.*)$/,'packages/core/src/$1'],[/^@posthog\/core\/surveys$/,'packages/core/src/surveys/index.ts'],[/^@posthog\/core$/,'packages/core/src/index.ts'],[/^@posthog\/types$/,'packages/types/src/index.ts'],[/^@posthog\/browser-common$/,'packages/browser-common/src/index.ts'],[/^@posthog\/browser-common\/(.*)$/,'packages/browser-common/src/$1.ts'],[/^@posthog\/rrweb-utils$/,'packages/rrweb/utils/src/index.ts']]
  const plugin={name:'workspace',setup(b){
    b.onResolve({filter:/package\.json$/},()=>({path:'pkg',namespace:'pkg'}))
    b.onLoad({filter:/.*/,namespace:'pkg'},()=>({contents:'export default {version:"1.435.8"}',loader:'js'}))
    b.onResolve({filter:/.*/},async a=>{if(a.pluginData==='x')return;let r=a.path;for(const [re,t] of aliases){if(re.test(r)){r=join(vendor,r.replace(re,t));break}}if(!r.startsWith('.')&&!r.startsWith('/'))return;return b.resolve(r,{resolveDir:a.resolveDir,kind:a.kind,pluginData:'x'})})
  }}
  code=await iife([join(vendor,'packages/browser/src/entrypoints',entry)],{plugins:[plugin],tsconfigRaw:{compilerOptions:{useDefineForClassFields:false}},jsx:'automatic',jsxImportSource:'preact',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'}})
}else if(kind==='file'){
  name='file-'+basename(arg).replace(/\.m?js$/,'')
  code=await iife([resolve(arg)])
}else throw Error('usage: build.mjs npm|source|file …')
const file=join(out,`sut-${name}.js`)
writeFileSync(file,code)
console.log(file)
