import ts from 'typescript'

// Recover call edges that the dynamic migration scaffold otherwise hides.
// Only private functions whose every reference is an exact-arity direct call
// qualify. In particular, this is not an assumption about callback purity,
// external types, function identity, or the shape of JavaScript objects.
export function analyzeLocalFunctions(source) {
  const options={allowJs:true,noLib:true,noResolve:true,noEmit:true,types:[]}
  const host=ts.createCompilerHost(options)
  host.getSourceFile=name=>name===source.fileName?source:undefined
  host.fileExists=name=>name===source.fileName
  host.readFile=name=>name===source.fileName?source.text:undefined
  const program=ts.createProgram([source.fileName],options,host),checker=program.getTypeChecker()
  const candidates=new Map()
  const exported=node=>node.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.ExportKeyword)
  const add=(declaration,fn)=>{
    if(!declaration.name||!ts.isIdentifier(declaration.name)||fn.asteriskToken||fn.modifiers?.some(mod=>mod.kind===ts.SyntaxKind.AsyncKeyword)||fn.parameters.some(param=>param.initializer||param.dotDotDotToken))return
    const symbol=checker.getSymbolAtLocation(declaration.name)
    if(!symbol||symbol.declarations?.length!==1)return
    candidates.set(symbol,{name:declaration.name.text,declaration,arity:fn.parameters.length,calls:[],eligible:true})
  }
  for(const node of source.statements){
    if(exported(node))continue
    if(ts.isFunctionDeclaration(node))add(node,node)
    if(ts.isVariableStatement(node)&&(node.declarationList.flags&ts.NodeFlags.Const)){
      for(const declaration of node.declarationList.declarations)if(declaration.initializer&&ts.isArrowFunction(declaration.initializer))add(declaration,declaration.initializer)
    }
  }
  let directEval=false
  const visit=node=>{
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='eval')directEval=true
    if(ts.isShorthandPropertyAssignment(node)){
      const candidate=candidates.get(checker.getShorthandAssignmentValueSymbol(node))
      if(candidate)candidate.eligible=false
    }
    if(ts.isExportSpecifier(node)){
      const candidate=candidates.get(checker.getExportSpecifierLocalTargetSymbol(node))
      if(candidate)candidate.eligible=false
    }
    if(ts.isIdentifier(node)){
      const candidate=candidates.get(checker.getSymbolAtLocation(node))
      if(candidate&&node!==candidate.declaration.name){
        const call=node.parent
        if(ts.isCallExpression(call)&&call.expression===node&&call.arguments.length===candidate.arity&&!call.arguments.some(ts.isSpreadElement))candidate.calls.push(call)
        else candidate.eligible=false
      }
    }
    ts.forEachChild(node,visit)
  }
  visit(source)
  const functions=directEval?[]:[...candidates.values()].filter(candidate=>candidate.eligible&&candidate.calls.length)
  return {declarations:new Set(functions.map(fn=>fn.declaration)),calls:new Set(functions.flatMap(fn=>fn.calls)),summary:functions.map(fn=>({name:fn.name,arity:fn.arity,calls:fn.calls.length}))}
}
