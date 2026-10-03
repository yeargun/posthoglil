import ts from 'typescript'
import MagicString from 'magic-string'

// An explicit ABI for JS exponentiation, which has no LilScript operator yet.
// Keep exponentiation itself; Math.pow would add an observable host lookup.
export function materializeOperators(code, operators=[]) {
  if (!operators.length) return code
  const plans=new Map(operators.map(plan=>[plan.intrinsic,plan]))
  if(plans.size!==operators.length||operators.some(plan=>plan.operator!=='**'))throw Error('Invalid operator ABI')
  const ast=ts.createSourceFile('operators.js',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),edits=new MagicString(code)
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
  const materialize=node=>{
    if(!ts.isCallExpression(node)||!ts.isIdentifier(node.expression)||!plans.has(node.expression.text))return
    if(node.arguments.length!==2||node.arguments.some(ts.isSpreadElement))throw Error('Invalid exponentiation ABI call')
    return `((${render(node.arguments[0])})**(${render(node.arguments[1])}))`
  }
  const visit=node=>{
    const replacement=materialize(node)
    if(replacement!==undefined){edits.overwrite(node.getStart(ast),node.end,replacement);return}
    ts.forEachChild(node,visit)
  }
  visit(ast)
  const result=edits.toString(),linked=ts.createSourceFile('linked.js',result,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
  const check=node=>{if(ts.isIdentifier(node)&&plans.has(node.text))throw Error(`Escaped operator ABI: ${node.text}`);ts.forEachChild(node,check)}
  check(linked)
  if(linked.parseDiagnostics.length)throw Error('Operator ABI emitted invalid JavaScript')
  return result
}
