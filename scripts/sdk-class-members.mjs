import ts from 'typescript'
import MagicString from 'magic-string'

// LilScript currently exposes constructor/prototype methods, but has no syntax
// for JS getters or static methods. These explicit ABI declarations materialize
// the corresponding native members. Bodies are compiled from LilScript; this
// pass neither imports upstream implementation code nor infers purity.
export function materializeClassMembers(code, members, upstreamCode, bases=[]) {
  if (!members.length&&!bases.length) return code
  const upstream = ts.createSourceFile('upstream.ts', upstreamCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const parsed = ts.createSourceFile('compiled.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const output = new MagicString(code)
  const collect = (node, predicate) => {
    const found = []
    const visit = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit) }
    visit(node)
    return found
  }
  const name = node => node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) ? node.name.text : undefined
  const isClass = node => ts.isClassDeclaration(node) || ts.isClassExpression(node)
  const isStatic = node => node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.StaticKeyword) ?? false
  for(const spec of bases){
    const original=collect(upstream,node=>isClass(node)&&name(node)===spec.class)
    const compiled=collect(parsed,node=>isClass(node)&&name(node)===spec.class)
    const expected=original[0]?.heritageClauses?.[0]?.types?.[0]?.expression
    const actual=compiled[0]?.heritageClauses?.[0]?.types?.[0]?.expression
    if(original.length!==1||compiled.length!==1||!expected||!ts.isIdentifier(expected)||expected.text!==spec.base||!actual||!ts.isIdentifier(actual))throw Error(`Class base ABI changed: ${spec.class}`)
    const imports=parsed.statements.filter(ts.isImportDeclaration).flatMap(node=>node.importClause?.namedBindings&&ts.isNamedImports(node.importClause.namedBindings)?node.importClause.namedBindings.elements:[]).filter(node=>(node.propertyName??node.name).text===spec.imported)
    if(imports.length!==1)throw Error(`Ambiguous base import: ${spec.imported}`)
    if(actual.text!==spec.base&&actual.text!==imports[0].name.text)throw Error(`Unexpected emitted class base: ${actual.text}`)
    // The compiler currently emits extern class heritage using its source name
    // while mangling the corresponding foreign value import. Resolve the ABI
    // identity through that actual ESM binding instead of assuming a global.
    output.overwrite(actual.getStart(parsed),actual.end,imports[0].name.text)
  }
  for (const spec of members) {
    if (!['get', 'set', 'static', 'method'].includes(spec.kind)) throw Error(`Unsupported class ABI kind: ${spec.kind}`)
    const originalClasses = collect(upstream, node => isClass(node) && name(node) === spec.class)
    const classes = collect(parsed, node => isClass(node) && name(node) === spec.class)
    if (classes.length !== 1 || originalClasses.length !== 1) throw Error(`Ambiguous class ABI: ${spec.class}`)
    const original = originalClasses[0].members.filter(node => name(node) === spec.name &&
      (spec.kind === 'get' ? ts.isGetAccessorDeclaration(node) && !isStatic(node) : spec.kind === 'set' ? ts.isSetAccessorDeclaration(node) && !isStatic(node) : ts.isMethodDeclaration(node) && isStatic(node)===(spec.kind==='static')))
    const implementations = classes[0].members.filter(node => name(node) === spec.implementation && ts.isMethodDeclaration(node))
    if (original.length !== 1 || implementations.length !== 1) throw Error(`Missing class ABI member: ${spec.class}.${spec.name}`)
    if (classes[0].members.some(node => name(node) === spec.name)) throw Error(`Duplicate class ABI member: ${spec.class}.${spec.name}`)
    const implementation = implementations[0]
    if (implementation.modifiers?.length || implementation.asteriskToken || !implementation.body) throw Error(`Unsupported ABI method: ${spec.implementation}`)
    if (implementation.parameters.length !== original[0].parameters.length) throw Error(`Class ABI arity changed: ${spec.class}.${spec.name}`)
    if (spec.kind === 'get' && implementation.parameters.length) throw Error(`Getter has parameters: ${spec.implementation}`)
    if (spec.kind === 'set' && implementation.parameters.length !== 1) throw Error(`Setter arity changed: ${spec.implementation}`)
    if (spec.kind === 'static' && collect(implementation.body, node => node.kind === ts.SyntaxKind.ThisKeyword || node.kind === ts.SyntaxKind.SuperKeyword).length) {
      throw Error(`Static ABI method uses an instance receiver: ${spec.implementation}`)
    }
    output.overwrite(implementation.getStart(parsed), implementation.name.end, `${spec.kind==='method'?'':spec.kind+' '}${JSON.stringify(spec.name)}`)
  }
  return output.toString()
}
