import {createHash} from 'node:crypto'
import {existsSync,readFileSync,readdirSync} from 'node:fs'
import {join,relative} from 'node:path'

// npm installs aliases as separate directories. pnpm (used by upstream) gives
// aliases of the same package the same module identity. Restore that identity
// only for byte-identical, dependency-free packages: versions alone are not proof.
export function dependencyAliases(root) {
  const manifest=JSON.parse(readFileSync(join(root,'package.json'),'utf8'))
  const dependencies={...manifest.dependencies,...manifest.devDependencies}
  const aliases=[]
  function digest(directory) {
    const hash=createHash('sha256')
    function visit(path) {
      for(const entry of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
        if(entry.name==='node_modules')continue
        const file=join(path,entry.name)
        if(entry.isDirectory())visit(file)
        else if(entry.isFile()){hash.update(relative(directory,file));hash.update('\0');hash.update(readFileSync(file))}
        else throw Error(`Unsupported package entry: ${file}`)
      }
    }
    visit(directory);return hash.digest('hex')
  }
  for(const [name,specifier] of Object.entries(dependencies)) {
    if(!specifier.startsWith('npm:'))continue
    const directory=join(root,'node_modules',name)
    const pkg=JSON.parse(readFileSync(join(directory,'package.json'),'utf8'))
    const canonical=join(root,'node_modules',pkg.name)
    if(!existsSync(join(canonical,'package.json')))continue
    const other=JSON.parse(readFileSync(join(canonical,'package.json'),'utf8'))
    if(pkg.name!==other.name||pkg.version!==other.version)continue
    if(['dependencies','optionalDependencies','peerDependencies'].some(key=>Object.keys(pkg[key]??{}).length))continue
    const sha256=digest(directory)
    if(sha256!==digest(canonical))continue
    aliases.push({alias:name,canonical:pkg.name,version:pkg.version,sha256})
  }
  return aliases
}
