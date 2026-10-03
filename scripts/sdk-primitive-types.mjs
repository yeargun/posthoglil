import ts from 'typescript'

// Infer from the erased JS algorithm, never from a TS assertion or predicate.
// In particular "x is number" in PostHog accepts boxed Numbers and is not a
// primitive proof. Boolean results are safe even for dynamic comparisons; we
// deliberately do not infer arithmetic as Number (BigInt also uses +, -, *).
export function analyzePrimitiveTypes(source) {
  const options={allowJs:true,checkJs:true,noLib:true,noResolve:true,noEmit:true,types:[],strictNullChecks:true}
  const host=ts.createCompilerHost(options)
  host.getSourceFile=name=>name===source.fileName?source:undefined
  host.fileExists=name=>name===source.fileName
  host.readFile=name=>name===source.fileName?source.text:undefined
  const checker=ts.createProgram([source.fileName],options,host).getTypeChecker()
  const functions=new Map(),bindings=new Map(),calls=new Set(),bySymbol=new Map()
  let directEval=false
  const boolean=type=>!!(type.flags&ts.TypeFlags.BooleanLike)||!!(type.flags&ts.TypeFlags.Union)&&type.types.every(boolean)
  const add=(declaration,fn)=>{
    if(fn.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)||fn.asteriskToken)return
    const signature=checker.getSignatureFromDeclaration(fn)
    if(!signature||!boolean(checker.getReturnTypeOfSignature(signature)))return
    functions.set(fn,'bool')
    if(declaration.name&&ts.isIdentifier(declaration.name)){
      const symbol=checker.getSymbolAtLocation(declaration.name)
      if(symbol)bySymbol.set(symbol,{declaration,fn,arity:fn.parameters.length,minimum:fn.parameters.findIndex(p=>!!p.initializer)})
    }
  }
  for(const statement of source.statements){
    if(ts.isFunctionDeclaration(statement))add(statement,statement)
    if(ts.isVariableStatement(statement)&&(statement.declarationList.flags&ts.NodeFlags.Const)){
      for(const declaration of statement.declarationList.declarations){
        if(!ts.isIdentifier(declaration.name)||!declaration.initializer)continue
        if(ts.isArrowFunction(declaration.initializer))add(declaration,declaration.initializer)
        if(boolean(checker.getTypeAtLocation(declaration.name)))bindings.set(declaration,'bool')
      }
    }
  }
  const invalid=new Set(),pending=[]
  const visit=node=>{
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='eval')directEval=true
    if(ts.isIdentifier(node)){
      const candidate=bySymbol.get(checker.getSymbolAtLocation(node)),parent=node.parent
      if(candidate){
        if(ts.isBinaryExpression(parent)&&parent.left===node&&parent.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&parent.operatorToken.kind<=ts.SyntaxKind.LastAssignment)invalid.add(candidate.fn)
        if((ts.isPrefixUnaryExpression(parent)||ts.isPostfixUnaryExpression(parent))&&[ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(parent.operator))invalid.add(candidate.fn)
        if(ts.isCallExpression(parent)&&parent.expression===node&&!parent.arguments.some(ts.isSpreadElement)&&!candidate.fn.parameters.some(p=>p.dotDotDotToken)&&parent.arguments.length===candidate.arity)pending.push([parent,candidate.fn])
      }
    }
    ts.forEachChild(node,visit)
  }
  visit(source)
  if(directEval)return {functions:new Map(),bindings:new Map(),calls:new Set(),summary:[]}
  for(const fn of invalid)functions.delete(fn)
  // JS inference can infer a default parameter as boolean even though callers
  // may pass any value. Require a value proof for every return as well as the
  // no-fallthrough check supplied by strictNullChecks.
  const provenFunctions=new Set()
  const provenBoolean=(node,seen=new Set())=>{
    if(!node||seen.has(node))return false
    seen=new Set(seen).add(node)
    if(node.kind===ts.SyntaxKind.TrueKeyword||node.kind===ts.SyntaxKind.FalseKeyword)return true
    if(ts.isParenthesizedExpression(node))return provenBoolean(node.expression,seen)
    if(ts.isPrefixUnaryExpression(node)&&node.operator===ts.SyntaxKind.ExclamationToken)return true
    if(ts.isBinaryExpression(node)){
      if(['==','!=','===','!==','<','>','<=','>=','in','instanceof'].includes(node.operatorToken.getText(source)))return true
      if(['&&','||'].includes(node.operatorToken.getText(source)))return provenBoolean(node.left,seen)&&provenBoolean(node.right,seen)
    }
    if(ts.isConditionalExpression(node))return provenBoolean(node.whenTrue,seen)&&provenBoolean(node.whenFalse,seen)
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression))return provenFunctions.has(bySymbol.get(checker.getSymbolAtLocation(node.expression))?.fn)
    if(ts.isIdentifier(node)){
      const declarations=checker.getSymbolAtLocation(node)?.declarations
      const declaration=declarations?.length===1?declarations[0]:undefined
      return !!declaration&&ts.isVariableDeclaration(declaration)&&!!(declaration.parent.flags&ts.NodeFlags.Const)&&provenBoolean(declaration.initializer,seen)
    }
    return false
  }
  const allReturnsProven=fn=>{
    if(!ts.isBlock(fn.body))return provenBoolean(fn.body)
    const returns=[]
    const visit=node=>{
      if(node!==fn&&ts.isFunctionLike(node))return
      if(ts.isReturnStatement(node))returns.push(node.expression)
      ts.forEachChild(node,visit)
    }
    visit(fn.body)
    return returns.length>0&&returns.every(node=>provenBoolean(node))
  }
  for(let changed=true;changed;){
    changed=false
    for(const fn of functions.keys())if(!provenFunctions.has(fn)&&allReturnsProven(fn)){provenFunctions.add(fn);changed=true}
  }
  for(const fn of functions.keys())if(!provenFunctions.has(fn))functions.delete(fn)
  for(const declaration of bindings.keys())if(!provenBoolean(declaration.initializer))bindings.delete(declaration)
  for(const [call,fn] of pending)if(functions.has(fn))calls.add(call)
  return {functions,bindings,calls,summary:[...functions].map(([fn,result])=>({name:fn.name?.text??fn.parent.name?.text,result}))}
}
