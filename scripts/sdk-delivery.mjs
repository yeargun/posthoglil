import ts from 'typescript'
import MagicString from 'magic-string'
import {minify} from 'terser'
import {composeMaps} from './source-maps.mjs'

// These are delivery transformations, not claims about the LilScript compiler.
// No payload/property name is changed by literal pooling. Pool only a complete
// ESM chunk: imports/cycles and direct eval need their own initialization proof.
export function poolLiterals(code) {
  const ast=ts.createSourceFile('sdk.mjs',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const groups=new Map(),identifiers=new Set();let unsafe=false
  function visit(node) {
    const parent=node.parent
    if(ts.isIdentifier(node))identifiers.add(node.text)
    if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)&&node.moduleSpecifier||ts.isWithStatement(node)||ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='eval')unsafe=true
    let value,start=node.getStart(ast),end=node.end,property=false
    if(ts.isStringLiteral(node)&&!ts.isExpressionStatement(parent)&&parent.name!==node&&!ts.isImportSpecifier(parent)&&!ts.isExportSpecifier(parent))value=node.text
    if(ts.isPropertyAccessExpression(node)&&!node.questionDotToken&&!ts.isPrivateIdentifier(node.name)) {
      value=node.name.text;start=node.expression.end;property=true
    }
    if(value?.length>=3) {
      if(!groups.has(value))groups.set(value,[])
      groups.get(value).push({start,end,property})
    }
    ts.forEachChild(node,visit)
  }
  visit(ast)
  if(unsafe)return {code,map:null,bindings:0,references:0,skipped:'imports, with or direct eval'}
  const selected=[...groups].filter(([value,uses])=>uses.length>=2&&uses.length*(JSON.stringify(value).length-3)>JSON.stringify(value).length+6).sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0]))
  if(!selected.length)return {code,map:null,bindings:0,references:0}
  let prefix='__lil_literal_'
  while([...identifiers].some(name=>name.startsWith(prefix)))prefix+='x'
  const edits=new MagicString(code),declarations=[];let references=0
  for(const [i,[value,uses]] of selected.entries()) {
    const name=prefix+i
    declarations.push(`${name}=${JSON.stringify(value)}`)
    for(const use of uses) {
      // Parentheses also separate tokens in minified `return"x"` / `case"x"`.
      edits.overwrite(use.start,use.end,use.property?`[${name}]`:`(${name})`)
      references++
    }
  }
  // Keep a directive prologue, even though the only production caller is ESM.
  let insertion=0
  for(const statement of ast.statements) {
    if(!ts.isExpressionStatement(statement)||!ts.isStringLiteral(statement.expression))break
    insertion=statement.end
  }
  edits.appendLeft(insertion,`;const ${declarations.join(',')};`)
  return {code:edits.toString(),map:edits.generateMap({hires:true,includeContent:true,source:'sdk.mjs'}).toString(),bindings:selected.length,references}
}

export async function optimizeSdkDelivery(output,{surface,objective}) {
  const mapped=typeof output!=='string'
  let code=mapped?output.code:output,map=mapped?output.map:null
  const receipt={literalPool:{bindings:0,references:0}}
  if(objective==='raw') {
    const pooled=poolLiterals(code)
    receipt.literalPool={bindings:pooled.bindings,references:pooled.references}
    if(pooled.map&&map)map=composeMaps(pooled.map,map)
    code=pooled.code
  }
  if(objective!=='raw')return {output,receipt}
  const result=await minify(code,{
    module:true,compress:false,
    // Property mangling must run before pooling. A computed key referring to
    // a pooled string must never become detached from its method definition.
    mangle:{reserved:['$'],properties:false},
    format:{comments:false},sourceMap:map?{filename:'sdk.mjs'}:false,
  })
  if(!result.code)throw Error('SDK delivery optimization emitted no code')
  return {output:map?{code:result.code+'\n',map:composeMaps(result.map,map)}:result.code+'\n',receipt}
}
