// Migration scaffold, not a release gate. Unsupported syntax is rejected, and
// generated modules must pass the unchanged upstream tests before registration.
import ts from 'typescript'
import {readFileSync, writeFileSync, existsSync} from 'node:fs'
import {dirname, join, relative, resolve} from 'node:path'
import {root, vendor} from './sdk-source.mjs'
import {analyzeLocalFunctions} from './sdk-local-functions.mjs'
import {analyzePrimitiveTypes} from './sdk-primitive-types.mjs'
import {createHash} from 'node:crypto'

const sourcePath = resolve(vendor, process.argv[2])
const outputPath = resolve(root, process.argv[3])
const nativeObjects=process.argv.includes('--native-objects'),objectLiterals=[]
let propertyCopyNeeded=false
// Explicitly reviewed immutable captures for private async closures. LilScript
// supports named async functions; it does not yet support async lambda syntax.
// This is a source migration directive, never an inferred optimizer assumption.
const asyncClosures=new Map(process.argv.filter(arg=>arg.startsWith('--async-closure=')).map(arg=>{
  const [name,list]=arg.slice(16).split(':');return [name,{captures:list?list.split(','):[],used:false}]
}))
if (!sourcePath.startsWith(vendor + '/') || !outputPath.startsWith(join(root, 'src/sdk/'))) throw Error('Expected a pinned source and an SDK implementation path')
const original = readFileSync(sourcePath, 'utf8')
const upstreamConfig=ts.findConfigFile(dirname(sourcePath),ts.sys.fileExists)
const upstreamOptions=upstreamConfig?ts.getParsedCommandLineOfConfigFile(upstreamConfig,{}, {...ts.sys,onUnRecoverableConfigFileDiagnostic:diagnostic=>{throw Error(ts.flattenDiagnosticMessageText(diagnostic.messageText,'\n'))}})?.options:{}
const js = ts.transpileModule(original, {fileName:sourcePath, compilerOptions:{target:ts.ScriptTarget.ES2019, module:ts.ModuleKind.ESNext, useDefineForClassFields:false, removeComments:true, jsx:upstreamOptions?.jsx??ts.JsxEmit.React,jsxImportSource:upstreamOptions?.jsxImportSource}}).outputText
const source = ts.createSourceFile(sourcePath, js, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const localFunctions=process.argv.includes('--typed-local-calls')?analyzeLocalFunctions(source):{declarations:new Set(),calls:new Set(),summary:[]}
const primitiveTypes=process.argv.includes('--typed-primitives')?analyzePrimitiveTypes(source):{functions:new Map(),bindings:new Map(),calls:new Set(),summary:[]}
const linkedManifestPath=process.argv.find(arg=>arg.startsWith('--linked-modules='))?.slice(17)
const linkedModules=linkedManifestPath?JSON.parse(readFileSync(resolve(root,linkedManifestPath),'utf8')).modules:[]
const moduleId=createHash('sha256').update(relative(vendor,sourcePath)).digest('hex').slice(0,12)
const reserved = new Set('int float number string bool void auto func struct record enum class extends super return init if else while for in of break continue extern import export from as pure true false null new is match async generator yield await throw try catch finally ref object'.split(' '))
const identifier = name => reserved.has(name) ? `ph_${name}` : name
const bindings = new Set(), references = new Set(), classNames = new Set(), imports = [], exports = [], members = [], deferredFunctions=[]
const externalBases=new Map()
for(const node of source.statements)if(ts.isClassDeclaration(node)&&node.heritageClauses?.length){
  if(node.heritageClauses.length!==1||node.heritageClauses[0].types.length!==1)throw Error('Review multiple class bases')
  const base=node.heritageClauses[0].types[0].expression, ctor=node.members.find(ts.isConstructorDeclaration), first=ctor?.body?.statements[0]
  if(!ts.isIdentifier(base)||!first||!ts.isExpressionStatement(first)||!ts.isCallExpression(first.expression)||first.expression.expression.kind!==ts.SyntaxKind.SuperKeyword)throw Error('Review nontrivial base constructor')
  const name=identifier(base.text),arity=first.expression.arguments.length
  if(externalBases.has(name)&&externalBases.get(name)!==arity)throw Error('Review variadic base constructor')
  externalBases.set(name,arity);classNames.add(name)
}
let sequence = 0, receiver = 'JS.undefined()', returnType='JsValue'
const fresh = () => `__port_${sequence++}`
const q = JSON.stringify
const fail = node => {const p=source.getLineAndCharacterOfPosition(node.getStart(source)); throw Error(`${relative(vendor,sourcePath)}:${p.line+1}: unsupported ${ts.SyntaxKind[node.kind]}: ${node.getText(source).slice(0,140)}`)}
const value = code => `(${code} as JsValue)`
const truth = code => `${value(code)}.truthy()`
const withReceiver = (next, fn) => {const old=receiver;receiver=next;try{return fn()}finally{receiver=old}}
const withReturnType = (type, fn) => {const old=returnType;returnType=type;try{return fn()}finally{returnType=old}}
const resultValue=code=>returnType==='JsValue'?value(code):`(JS.assume(${value(code)}) as ${returnType})`
const isExport = node => node.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.ExportKeyword)
const isAsync = node => node.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.AsyncKeyword)
const bind = name => {bindings.add(identifier(name));return identifier(name)}
const ref = name => {const id=identifier(name);references.add(id);return classNames.has(id)?value(id):id}
const iife = statements => `(() => { ${statements} })()`
const key = node => ts.isComputedPropertyName(node)?expression(node.expression):q(node.text)
const block = node => ts.isBlock(node)?node.statements.map(statement).join('\n'):statement(node)
function foreignSpecifier(specifier,node){
  if(!specifier.startsWith('.'))return specifier
  const base=resolve(dirname(sourcePath),specifier),target=[base,base+'.ts',base+'.tsx',join(base,'index.ts')].find(path=>existsSync(path))
  if(!target)fail(node)
  const path=relative(dirname(outputPath),target)
  return path.startsWith('.')?path:'./'+path
}
function linkedModule(specifier){
  if(!specifier.startsWith('.'))return undefined
  const base=resolve(dirname(sourcePath),specifier)
  return linkedModules.find(row=>[base,base+'.ts',base+'.tsx',join(base,'index.ts')].includes(resolve(vendor,row.source)))
}

function binding(pattern, initializer) {
  if (ts.isIdentifier(pattern)) return `JsValue ${bind(pattern.text)} = ${initializer};`
  const temp=fresh(), lines=[`JsValue ${temp} = ${initializer};`]
  if (ts.isObjectBindingPattern(pattern)) {
    if (!pattern.elements.length) fail(pattern)
    for(const entry of pattern.elements) {
      if(entry.dotDotDotToken) fail(entry)
      let lookup=`${temp}[${key(entry.propertyName??entry.name)}]`
      if(entry.initializer){const item=fresh();lines.push(`JsValue ${item} = ${lookup};`);lookup=`if (JS.isUndefined(${item})) { ${value(expression(entry.initializer))} } else { ${item} }`}
      lines.push(binding(entry.name,lookup))
    }
    return lines.join('\n')
  }
  if (ts.isArrayBindingPattern(pattern)) {
    // Keep the iterator protocol, including early IteratorClose. This scaffold
    // accepts only simple bindings; defaults/rest need separate review.
    if(!pattern.elements.length||pattern.elements.some(entry=>!ts.isOmittedExpression(entry)&&(!ts.isBindingElement(entry)||entry.initializer||entry.dotDotDotToken||!ts.isIdentifier(entry.name))))fail(pattern)
    // Elisions are used only for the SDK's locally constructed Object.entries
    // tuples. Review that provenance before qualifying a generated module.
    for(const entry of pattern.elements)if(!ts.isOmittedExpression(entry))lines.push(`JsValue ${bind(entry.name.text)} = JS.undefined();`)
    const index=fresh(), item=fresh()
    lines.push(`int ${index} = 0;`, `for (JsValue ${item} of ${temp}) {`)
    pattern.elements.forEach((entry,i)=>{if(!ts.isOmittedExpression(entry))lines.push(`if (${index} === ${i}) { ${identifier(entry.name.text)} = ${item}; }`)})
    lines.push(`${index} += 1; if (${index} === ${pattern.elements.length}) break;`, '}')
    return lines.join('\n')
  }
  fail(pattern)
}

function parameters(node) {
  const prefix=[], params=[], names=[]
  let defaultSeen=false
  for(const param of node.parameters){
    const name=ts.isIdentifier(param.name)?bind(param.name.text):fresh()
    names.push(name)
    defaultSeen ||= !!param.initializer
    params.push(`JsValue${param.dotDotDotToken?'...':''} ${name}${param.initializer?' = '+expression(param.initializer):defaultSeen&&!param.dotDotDotToken?' = JS.undefined()':''}`)
    if(!ts.isIdentifier(param.name))prefix.push(binding(param.name,name))
  }
  return {text:params.join(', '),prefix:prefix.join('\n'),names}
}

function callable(node, methodName) {
  if (node.asteriskToken || (isAsync(node)&&!methodName)) fail(node)
  const ordinary=ts.isFunctionExpression(node)||ts.isFunctionDeclaration(node)||(!methodName&&(ts.isMethodDeclaration(node)||ts.isGetAccessorDeclaration(node)||ts.isSetAccessorDeclaration(node))), nextReceiver=ordinary?fresh():methodName?'(this as JsValue)':receiver
  return withReturnType(primitiveTypes.functions.get(node)??'JsValue',()=>withReceiver(nextReceiver,()=>{
    const params=parameters(node)
    const body=ts.isBlock(node.body)?block(node.body):`return ${resultValue(expression(node.body))};`
    return `${isAsync(node)?'async ':''}${methodName??''}(${ordinary?'this JsValue '+nextReceiver+(params.text?', ':''):''}${params.text})${methodName?'':' =>'} { ${params.prefix}\n${body}\n${methodName==='init'||returnType!=='JsValue'?'':'return JS.undefined();'} }`
  }))
}

function expression(node) {
  if(!node)return 'JS.undefined()'
  if(ts.isIdentifier(node))return node.text==='undefined'?'JS.undefined()':ref(node.text)
  if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))return q(node.text)
  if(ts.isNumericLiteral(node)){const n=Number(node.text);return Number.isInteger(n)&&Math.abs(n)<1e21?`${n}.0`:String(n)}
  if(node.kind===ts.SyntaxKind.TrueKeyword)return 'true'
  if(node.kind===ts.SyntaxKind.FalseKeyword)return 'false'
  if(node.kind===ts.SyntaxKind.NullKeyword)return 'null'
  if(node.kind===ts.SyntaxKind.ThisKeyword)return receiver
  if(ts.isParenthesizedExpression(node))return `(${expression(node.expression)})`
  if(ts.isPropertyAccessExpression(node))return `${value(expression(node.expression))}[${q(node.name.text)}]`
  if(ts.isElementAccessExpression(node))return `${value(expression(node.expression))}[${expression(node.argumentExpression)}]`
  if(ts.isTypeOfExpression(node))return `JS.typeOf(${expression(node.expression)})`
  if(ts.isVoidExpression(node))return ts.isNumericLiteral(node.expression)?'JS.undefined()':iife(`${expression(node.expression)}; return JS.undefined();`)
  if(ts.isDeleteExpression(node)){
    const target=node.expression
    if(ts.isPropertyAccessExpression(target))return iife(`JS.delete(${expression(target.expression)}, ${q(target.name.text)}); return true;`)
    if(ts.isElementAccessExpression(target))return iife(`JS.delete(${expression(target.expression)}, ${expression(target.argumentExpression)}); return true;`)
    fail(node)
  }
  if(ts.isConditionalExpression(node))return `if (${truth(expression(node.condition))}) { ${value(expression(node.whenTrue))} } else { ${value(expression(node.whenFalse))} }`
  if(ts.isPrefixUnaryExpression(node)){
    const arg=expression(node.operand)
    if(node.operator===ts.SyntaxKind.ExclamationToken)return `!${truth(arg)}`
    if(node.operator===ts.SyntaxKind.PlusToken)return `JS.number(${arg})`
    if(node.operator===ts.SyntaxKind.MinusToken)return `(-${value(arg)})`
    if(node.operator===ts.SyntaxKind.PlusPlusToken||node.operator===ts.SyntaxKind.MinusMinusToken){
      const apply=place=>`(${place} = JS.number(${place}) ${node.operator===ts.SyntaxKind.PlusPlusToken?'+':'-'} 1.0)`
      if(ts.isIdentifier(node.operand))return apply(arg)
      if(ts.isPropertyAccessExpression(node.operand)){const owner=fresh();return iife(`JsValue ${owner} = ${expression(node.operand.expression)}; return ${apply(`${owner}[${q(node.operand.name.text)}]`)};`)}
    }
    fail(node)
  }
  if(ts.isAwaitExpression(node))return `(await (JS.assume(${expression(node.expression)}) as Task<JsValue>))`
  if(ts.isPostfixUnaryExpression(node)){
    const old=fresh(), operand=node.operand
    const apply=place=>`number ${old} = JS.number(${place}); ${place} = ${old} ${node.operator===ts.SyntaxKind.PlusPlusToken?'+':'-'} 1.0; return ${old};`
    if(ts.isIdentifier(operand))return iife(apply(ref(operand.text)))
    if(ts.isPropertyAccessExpression(operand)){const owner=fresh();return iife(`JsValue ${owner} = ${expression(operand.expression)}; ${apply(`${owner}[${q(operand.name.text)}]`)}`)}
    fail(node)
  }
  if(ts.isBinaryExpression(node)){
    const op=node.operatorToken.getText(source)
    if(op==='='&&ts.isObjectLiteralExpression(node.left)){
      const temp=fresh(),lines=[`JsValue ${temp} = ${expression(node.right)};`]
      for(const prop of node.left.properties){
        if(ts.isShorthandPropertyAssignment(prop)&&!prop.objectAssignmentInitializer)lines.push(`${ref(prop.name.text)} = ${temp}[${q(prop.name.text)}];`)
        else if(ts.isPropertyAssignment(prop)&&!ts.isComputedPropertyName(prop.name)&&(ts.isIdentifier(prop.initializer)||ts.isPropertyAccessExpression(prop.initializer)||ts.isElementAccessExpression(prop.initializer)))lines.push(`${expression(prop.initializer)} = ${temp}[${key(prop.name)}];`)
        else fail(prop)
      }
      return iife(lines.join('\n')+`return ${temp};`)
    }
    const left=expression(node.left),right=expression(node.right)
    if(op==='in')return `JS.in(${left}, ${right})`
    if(op==='instanceof')return `(${left} instanceof ${right})`
    if(['&','|','^','<<','>>','>>>'].includes(op))return `(JS.number(${left}).toInt() ${op} JS.number(${right}).toInt())`
    if(op==='=')return `(${left} = ${right})`
    if(['+=','-=','*=','/=','%='].includes(op)){
      if(ts.isIdentifier(node.left))return `(${left} = (${value(left)} ${op[0]} ${value(right)}))`
      if(ts.isPropertyAccessExpression(node.left)){
        const owner=fresh(), place=`${owner}[${q(node.left.name.text)}]`
        return iife(`JsValue ${owner} = ${expression(node.left.expression)}; return (${place} = (${value(place)} ${op[0]} ${value(right)}));`)
      }
      fail(node)
    }
    if(!['+','-','*','/','%','==','!=','===','!==','<','>','<=','>=','&&','||'].includes(op))fail(node)
    return `(${value(left)} ${op} ${value(right)})`
  }
  if(ts.isCallExpression(node)){
    if(node.expression.kind===ts.SyntaxKind.SuperKeyword)return `super(${node.arguments.map(expression).join(', ')})`
    const callee=expression(node.expression)
    // A function-value cast detaches a method's receiver. Keep reference calls
    // as member calls so DOM, Map/Set and SDK methods receive the original this.
    return `${localFunctions.calls.has(node)||primitiveTypes.calls.has(node)||ts.isPropertyAccessExpression(node.expression)||ts.isElementAccessExpression(node.expression)?callee:value(callee)}(${node.arguments.map(expression).join(', ')})`
  }
  if(ts.isNewExpression(node)){
    if(node.arguments?.some(ts.isSpreadElement))fail(node)
    if((node.arguments?.length??0)>6){references.add('Reflect');return `Reflect.construct(${expression(node.expression)}, JS.array(${node.arguments.map(expression).join(', ')}))`}
    return `JS.construct(${expression(node.expression)}${node.arguments?.length?', '+node.arguments.map(expression).join(', '):''})`
  }
  if(ts.isArrowFunction(node)||ts.isFunctionExpression(node))return callable(node)
  if(ts.isSpreadElement(node))return `...${expression(node.expression)}`
  if(ts.isRegularExpressionLiteral(node)){
    references.add('RegExp')
    const text=node.getText(source),end=text.lastIndexOf('/')
    return `JS.construct(RegExp, ${q(text.slice(1,end))}, ${q(text.slice(end+1))})`
  }
  if(ts.isTemplateExpression(node))return '`'+node.head.rawText+node.templateSpans.map(span=>'${'+expression(span.expression)+'}'+span.literal.rawText).join('')+'`'
  if(ts.isArrayLiteralExpression(node)){
    if(!node.elements.some(entry=>ts.isSpreadElement(entry)||ts.isOmittedExpression(entry)))return `JS.array(${node.elements.map(expression).join(', ')})`
    const temp=fresh(),lines=[`JsValue ${temp} = JS.array();`]
    for(const entry of node.elements){
      if(ts.isSpreadElement(entry)){const item=fresh();lines.push(`for (JsValue ${item} of ${expression(entry.expression)}) { ${temp}.push(${item}); }`)}
      else if(ts.isOmittedExpression(entry))fail(entry)
      else lines.push(`${temp}.push(${expression(entry)});`)
    }
    return iife(lines.join('\n')+`return ${temp};`)
  }
  if(ts.isObjectLiteralExpression(node)){
    if(nativeObjects&&node.properties.every(prop=>ts.isSpreadAssignment(prop)||ts.isPropertyAssignment(prop)||ts.isShorthandPropertyAssignment(prop))&&node.properties.some(prop=>ts.isSpreadAssignment(prop)||ts.isComputedPropertyName(prop.name)||prop.name.text==='__proto__')){
      const intrinsic='__lil_object_'+moduleId+'_'+sequence++,args=[],fields=[]
      const add=expr=>{const index=args.length;args.push(`() => ${value(expression(expr))}`);return index}
      for(const prop of node.properties){
        if(ts.isSpreadAssignment(prop))fields.push({kind:'spread',value:add(prop.expression)})
        else{
          const entry=ts.isComputedPropertyName(prop.name)?{kind:'computed',key:add(prop.name.expression)}:{kind:prop.name.text==='__proto__'&&ts.isPropertyAssignment(prop)?'prototype':'data',key:prop.name.text}
          entry.value=add(ts.isShorthandPropertyAssignment(prop)?prop.name:prop.initializer);fields.push(entry)
        }
      }
      objectLiterals.push({intrinsic,arguments:args.length,fields});references.add(intrinsic)
      return `${intrinsic}(${args.join(', ')})`
    }
    if(node.properties.every(prop=>(ts.isPropertyAssignment(prop)||ts.isShorthandPropertyAssignment(prop))&&!ts.isComputedPropertyName(prop.name))){
      return `object { ${node.properties.map(prop=>`${key(prop.name)}: ${ts.isShorthandPropertyAssignment(prop)?ref(prop.name.text):expression(prop.initializer)}`).join(', ')} }`
    }
    propertyCopyNeeded=true
    const temp=fresh(),lines=[`JsValue ${temp} = JS.object();`]
    for(const prop of node.properties){
      if(ts.isSpreadAssignment(prop))lines.push(`copyProperties(${temp}, ${expression(prop.expression)});`)
      else if(ts.isPropertyAssignment(prop)||ts.isShorthandPropertyAssignment(prop))lines.push(`setOwn(${temp}, ${key(prop.name)}, ${ts.isShorthandPropertyAssignment(prop)?ref(prop.name.text):expression(prop.initializer)});`)
      else if(ts.isMethodDeclaration(prop))lines.push(`setOwn(${temp}, ${key(prop.name)}, ${callable(prop)});`)
      else if(ts.isGetAccessorDeclaration(prop)||ts.isSetAccessorDeclaration(prop)){
        references.add('Object')
        lines.push(`Object.defineProperty(${temp}, ${key(prop.name)}, object {${ts.isGetAccessorDeclaration(prop)?'get':'set'}: ${callable(prop)}, enumerable: true, configurable: true});`)
      }
      else fail(prop)
    }
    return iife(lines.join('\n')+`return ${temp};`)
  }
  fail(node)
}

function statement(node) {
  if(ts.isImportDeclaration(node)){
    const linked=linkedModule(node.moduleSpecifier.text)
    const path=linked?relative(dirname(outputPath),join(root,linked.implementation)):undefined
    const specifier=linked?(path.startsWith('.')?path:'./'+path):foreignSpecifier(node.moduleSpecifier.text,node)
    if(!node.importClause){imports.push(`import extern ${q(specifier)};`);return ''}
    const names=[]
    if(node.importClause.name)names.push(`default as ${bind(node.importClause.name.text)}`)
    if(node.importClause.namedBindings){
      if(!ts.isNamedImports(node.importClause.namedBindings))fail(node)
      for(const entry of node.importClause.namedBindings.elements)names.push(`${(entry.propertyName??entry.name).text} as ${bind(entry.name.text)}`)
    }
    if(linked){
      imports.push(`import { ${names.join(', ')} } from ${q(specifier)};`)
      return ''
    }
    imports.push(`import extern { ${names.join(', ')} } from ${q(specifier)};`)
    return names.map(name=>{const local=name.split(' as ').at(-1);return `extern JsValue ${local};`+(externalBases.has(local)?`\nextern class ${local} {init(${Array.from({length:externalBases.get(local)},(_,i)=>'JsValue argument'+i).join(', ')});}`:'')}).join('\n')
  }
  if(ts.isVariableStatement(node))return node.declarationList.declarations.map(decl=>{
    if(isExport(node)){if(!ts.isIdentifier(decl.name))fail(decl);exports.push({local:identifier(decl.name.text),name:decl.name.text})}
    if(decl.initializer&&ts.isArrowFunction(decl.initializer)&&isAsync(decl.initializer)){
      const arrow=decl.initializer, spec=asyncClosures.get(decl.name.text)
      if(!ts.isIdentifier(decl.name)||!spec||spec.used||arrow.parameters.length||node.parent===source)fail(decl)
      spec.used=true
      const impl=fresh(), owner=fresh(), capturedReceiver=receiver
      bindings.add(impl)
      deferredFunctions.push(()=>withReceiver(owner,()=>`async JsValue ${impl}(JsValue ${owner}${spec.captures.map(name=>', JsValue '+identifier(name)).join('')}) {${block(arrow.body)}\nreturn JS.undefined();}`))
      return `JsValue ${bind(decl.name.text)} = () => ${impl}(${capturedReceiver}${spec.captures.map(name=>', '+ref(name)).join('')});`
    }
    if(node.parent===source&&decl.initializer&&ts.isArrowFunction(decl.initializer)){
      const arrow=decl.initializer
      if(!ts.isIdentifier(decl.name)||isAsync(arrow)||arrow.parameters.some(p=>p.dotDotDotToken))fail(decl)
      const name=bind(decl.name.text), impl=fresh(), p=parameters(arrow), args=p.names
      bindings.add(impl)
      const result=primitiveTypes.functions.get(arrow)??'JsValue'
      deferredFunctions.push(()=>withReturnType(result,()=>`${result} ${impl}(${args.map(name=>'JsValue '+name).join(', ')}) {${p.prefix}\n${ts.isBlock(arrow.body)?block(arrow.body):'return '+resultValue(expression(arrow.body))+';'}\n${result==='JsValue'?'return JS.undefined();':''}}`))
      const type=localFunctions.declarations.has(decl)||primitiveTypes.functions.has(arrow)?`func(${args.map(()=>'JsValue').join(', ')})->${result}`:'JsValue'
      return `${type} ${name} = (${p.text}) => ${impl}(${args.join(', ')});`
    }
    if(primitiveTypes.bindings.has(decl))return `${primitiveTypes.bindings.get(decl)} ${bind(decl.name.text)} = JS.assume(${value(expression(decl.initializer))});`
    return binding(decl.name,expression(decl.initializer))
  }).join('\n')
  if(ts.isFunctionDeclaration(node)){
    if(!node.name||!node.body||node.asteriskToken)fail(node)
    if(node.parent!==source){
      // Local declarations whose uses precede this point or recursively refer
      // to their initializer are rejected by LilScript's binding checks.
      return `JsValue ${bind(node.name.text)} = ${callable(node)};`
    }
    const name=bind(node.name.text)
    if(isExport(node))exports.push({local:name,name:node.name.text})
    const result=primitiveTypes.functions.get(node)??'JsValue'
    deferredFunctions.push(()=>withReturnType(result,()=>withReceiver('JS.undefined()',()=>{const p=parameters(node);return `${isAsync(node)?'async ':''}${result} ${name}(${p.text}) {${p.prefix}\n${block(node.body)}\n${result==='JsValue'?'return JS.undefined();':''}}`})))
    return ''
  }
  if(ts.isClassDeclaration(node)){
    if(!node.name)fail(node)
    const name=bind(node.name.text);classNames.add(name)
    const bodies=node.members.map(member=>{
      if(ts.isConstructorDeclaration(member))return callable(member,'init')
      if(ts.isMethodDeclaration(member)||ts.isGetAccessorDeclaration(member)||ts.isSetAccessorDeclaration(member)){
        if(!ts.isIdentifier(member.name))fail(member)
        const stat=member.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.StaticKeyword),get=ts.isGetAccessorDeclaration(member),set=ts.isSetAccessorDeclaration(member)
        const rename=reserved.has(member.name.text)
        const impl=get?'__lil_get_'+member.name.text:set?'__lil_set_'+member.name.text:stat?'__lil_static_'+member.name.text:rename?'__lil_method_'+member.name.text:member.name.text
        if(get||set||stat||rename)members.push({class:name,implementation:impl,kind:get?'get':set?'set':stat?'static':'method',name:member.name.text})
        return callable(member,'JsValue '+impl)
      }
      fail(member)
    })
    // Publishing the local constructor keeps native prototype/identity semantics.
    // The overriding module forwards only the upstream public exports.
    exports.push({local:name,name:node.name.text,constructor:true,internal:!isExport(node)})
    return `export class ${name}${node.heritageClauses?.length?' extends '+identifier(node.heritageClauses[0].types[0].expression.text):''} {\n${bodies.join('\n\n')}\n}\nexport constructor ${name};`
  }
  if(ts.isBlock(node))return `{\n${block(node)}\n}`
  if(ts.isExpressionStatement(node)){
    if(ts.isCallExpression(node.expression)&&node.expression.expression.kind===ts.SyntaxKind.SuperKeyword)return expression(node.expression)+';'
    if(ts.isPostfixUnaryExpression(node.expression)&&ts.isIdentifier(node.expression.operand)){
      const name=ref(node.expression.operand.text)
      return `${name} = JS.number(${name}) ${node.expression.operator===ts.SyntaxKind.PlusPlusToken?'+':'-'} 1.0;`
    }
    return '('+expression(node.expression)+');'
  }
  if(ts.isReturnStatement(node))return `return ${resultValue(expression(node.expression))};`
  if(ts.isIfStatement(node))return `if (${truth(expression(node.expression))}) {${block(node.thenStatement)}}${node.elseStatement?' else {'+block(node.elseStatement)+'}':''}`
  if(ts.isThrowStatement(node))return `throw ${expression(node.expression)};`
  if(ts.isTryStatement(node))return `try {${block(node.tryBlock)}}${node.catchClause?' catch ('+`JsValue ${node.catchClause.variableDeclaration?bind(node.catchClause.variableDeclaration.name.text):fresh()}`+') {'+block(node.catchClause.block)+'}':''}${node.finallyBlock?' finally {'+block(node.finallyBlock)+'}':''}`
  if(ts.isForOfStatement(node)||ts.isForInStatement(node)){
    if(!ts.isVariableDeclarationList(node.initializer)||node.initializer.declarations.length!==1)fail(node)
    const pattern=node.initializer.declarations[0].name, name=ts.isIdentifier(pattern)?bind(pattern.text):fresh()
    if(ts.isForInStatement(node)&&!ts.isIdentifier(pattern))fail(node)
    return `for (${ts.isForInStatement(node)?'string':'JsValue'} ${name} ${ts.isForInStatement(node)?'in':'of'} ${expression(node.expression)}) {${ts.isIdentifier(pattern)?'':binding(pattern,name)}\n${block(node.statement)}}`
  }
  if(ts.isForStatement(node)){
    if(node.initializer&&ts.isVariableDeclarationList(node.initializer)&&node.initializer.declarations.length!==1)fail(node)
    const decl=node.initializer&&ts.isVariableDeclarationList(node.initializer)?node.initializer.declarations[0]:undefined
    let step
    if(node.incrementor&&ts.isPostfixUnaryExpression(node.incrementor)&&ts.isIdentifier(node.incrementor.operand)){
      const name=ref(node.incrementor.operand.text);step=`${name} = JS.number(${name}) ${node.incrementor.operator===ts.SyntaxKind.PlusPlusToken?'+':'-'} 1.0`
    }else step=expression(node.incrementor)
    const init=decl?binding(decl.name,expression(decl.initializer)):node.initializer?expression(node.initializer)+';':';'
    return `for (${init} ${node.condition?truth(expression(node.condition)):'true'}; ${step}) {${block(node.statement)}}`
  }
  if(ts.isWhileStatement(node))return `while (${truth(expression(node.expression))}) {${block(node.statement)}}`
  if(ts.isSwitchStatement(node)){
    // Keep case expressions lazy and ordered, support fallthrough and native
    // break/return. A continue targeting an enclosing loop needs a distinct
    // completion representation and is deliberately refused here.
    const check=node=>{if(ts.isContinueStatement(node))fail(node);ts.forEachChild(node,check)}
    check(node.caseBlock)
    const subject=fresh(),choice=fresh(),clauses=node.caseBlock.clauses
    const lines=[`JsValue ${subject} = ${expression(node.expression)};`,`int ${choice} = -1;`]
    let first=true, fallback=-1
    clauses.forEach((clause,i)=>{if(ts.isDefaultClause(clause))fallback=i;else{lines.push(`${first?'':'else '}if (${subject} === ${value(expression(clause.expression))}) { ${choice} = ${i}; }`);first=false}})
    if(fallback>=0)lines.push(`${first?'':'else '}{${choice} = ${fallback};}`)
    lines.push('while (true) {')
    clauses.forEach((clause,i)=>lines.push(`if (${choice} >= 0 && ${choice} <= ${i}) {${clause.statements.map(statement).join('\n')}}`))
    lines.push('break;','}')
    return '{'+lines.join('\n')+'}'
  }
  if(ts.isDoStatement(node)){const first=fresh();return `{bool ${first} = true; while (${first} || ${truth(expression(node.expression))}) {${first} = false; ${block(node.statement)}}}`}
  if(ts.isBreakStatement(node)||ts.isContinueStatement(node)){if(node.label)fail(node);return ts.isBreakStatement(node)?'break;':'continue;'}
  if(ts.isExportDeclaration(node)){
    if(!node.exportClause||!ts.isNamedExports(node.exportClause))fail(node)
    if(node.moduleSpecifier){
      const names=[], declarations=[]
      for(const entry of node.exportClause.elements){const local=bind(fresh());names.push(`${(entry.propertyName??entry.name).text} as ${local}`);exports.push({local,name:entry.name.text});declarations.push(`extern JsValue ${local};`)}
      imports.push(`import extern {${names.join(', ')}} from ${q(foreignSpecifier(node.moduleSpecifier.text,node))};`)
      return declarations.join('\n')
    }
    for(const entry of node.exportClause.elements)exports.push({local:ref((entry.propertyName??entry.name).text),name:entry.name.text})
    return ''
  }
  if(ts.isExportAssignment(node)){
    if(node.isExportEquals)fail(node)
    const local=fresh();bindings.add(local);exports.push({local,name:'default'})
    return `JsValue ${local} = ${expression(node.expression)};`
  }
  if(ts.isEmptyStatement(node))return ''
  fail(node)
}
const body=source.statements.map(statement).join('\n\n')+'\n\n'+deferredFunctions.map(emit=>emit()).join('\n\n')
for(const [name,spec] of asyncClosures)if(!spec.used)throw Error(`Unused async closure directive: ${name}`)
const globals=[...references].filter(name=>!bindings.has(name))
const classBases=source.statements.filter(node=>ts.isClassDeclaration(node)&&node.heritageClauses?.length).map(node=>{
  const base=node.heritageClauses[0].types[0].expression.text
  const imported=source.statements.filter(ts.isImportDeclaration).flatMap(node=>node.importClause?.namedBindings&&ts.isNamedImports(node.importClause.namedBindings)?node.importClause.namedBindings.elements:[]).filter(entry=>entry.name.text===base)
  if(imported.length!==1)throw Error(`Review local class inheritance: ${node.name.text}`)
  return {class:node.name.text,base,imported:(imported[0].propertyName??imported[0].name).text}
})
const code=[`// Whole-module migration from ${relative(vendor,sourcePath)}.`, '// Derived from the pinned PostHog source under its repository license.', '// Review this scaffold and qualify it against upstream before registration.', ...imports, ...(propertyCopyNeeded?['import extern {copyProperties, setOwn} from "./property-copy.bridge.mjs";\nextern JsValue copyProperties;\nextern JsValue setOwn;']:[]), ...globals.map(name=>`extern JsValue ${name};`), body, ...exports.filter(entry=>entry.constructor!==true).map(entry=>`export { ${entry.local} as ${entry.name} };`), ''].join('\n')
writeFileSync(outputPath,code)
writeFileSync(outputPath+'.migration.json',JSON.stringify({source:relative(vendor,sourcePath),implementation:relative(root,outputPath),exports:exports.filter(entry=>!entry.internal).map(entry=>entry.name),classMembers:members,classBases,objectLiterals,localFunctions:localFunctions.summary,primitiveTypes:primitiveTypes.summary,asyncClosures:[...asyncClosures].map(([name,spec])=>({name,captures:spec.captures})),qualified:false},null,2)+'\n')
console.log(`Wrote unqualified scaffold: ${relative(root,outputPath)}`)
