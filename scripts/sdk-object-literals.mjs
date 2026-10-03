import ts from 'typescript'
import MagicString from 'magic-string'

// An explicit JS ABI primitive for native ordinary-object construction.
// Each source expression is compiled inside a zero-argument thunk, so the
// compiler cannot eagerly evaluate a later field before an earlier spread.
// Materialization restores native CopyDataProperties, computed-key coercion,
// own-data-property definitions and their original left-to-right ordering.
export function materializeObjectLiterals(code, literals) {
  if (!literals.length) return code
  const ast=ts.createSourceFile('compiled.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const plans=new Map(literals.map(plan=>[plan.intrinsic,plan]))
  const edits=new MagicString(code)
  const render=node=>{
    const sub=new MagicString(code.slice(node.getStart(ast),node.end))
    const visit=child=>{
      const replacement=materialize(child)
      if(replacement!==undefined){sub.overwrite(child.getStart(ast)-node.getStart(ast),child.end-node.getStart(ast),replacement);return}
      ts.forEachChild(child,visit)
    }
    ts.forEachChild(node,visit)
    return sub.toString()
  }
  const invoke=thunk=>{
    // Inline expression arrows only. This introduces no binding or receiver
    // changes: their bodies already use lexical this and lexical variables.
    if(ts.isArrowFunction(thunk)&&!thunk.parameters.length&&!thunk.modifiers?.length){
      if(!ts.isBlock(thunk.body))return materialize(thunk.body)??render(thunk.body)
      if(thunk.body.statements.length===1&&ts.isReturnStatement(thunk.body.statements[0])&&thunk.body.statements[0].expression){
        const value=thunk.body.statements[0].expression
        return materialize(value)??render(value)
      }
    }
    return `(${render(thunk)})()`
  }
  const materialize=node=>{
    if(!ts.isCallExpression(node)||!ts.isIdentifier(node.expression))return undefined
    const plan=plans.get(node.expression.text)
    if(!plan)return undefined
    if(node.arguments.length!==plan.arguments)throw Error(`Native object ABI arity changed: ${plan.intrinsic}`)
    const take=index=>{
      if(!Number.isInteger(index)||index<0||index>=node.arguments.length)throw Error('Invalid object ABI argument')
      return `(${invoke(node.arguments[index])})`
    }
    const fields=plan.fields.map(field=>{
      if(field.kind==='spread')return `...${take(field.value)}`
      if(field.kind==='computed')return `[${take(field.key)}]:${take(field.value)}`
      if(field.kind==='data')return `${field.key==='__proto__'?'["__proto__"]':JSON.stringify(field.key)}:${take(field.value)}`
      if(field.kind==='prototype')return `__proto__:${take(field.value)}`
      throw Error(`Unknown native object ABI field: ${field.kind}`)
    })
    return `({${fields.join(',')}})`
  }
  const visit=node=>{
    const replacement=materialize(node)
    if(replacement!==undefined){edits.overwrite(node.getStart(ast),node.end,replacement);return}
    ts.forEachChild(node,visit)
  }
  visit(ast)
  const result=edits.toString()
  const linked=ts.createSourceFile('linked.js',result,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const check=node=>{if(ts.isIdentifier(node)&&plans.has(node.text))throw Error(`Unresolved native object ABI reference: ${node.text}`);ts.forEachChild(node,check)}
  check(linked)
  if(linked.parseDiagnostics.length)throw Error('Native object ABI emitted invalid JavaScript')
  return result
}
