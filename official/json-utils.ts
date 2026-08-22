export function sanitizeString(value: string): string {
  let output = ''
  for (let index = 0; index < value.length; index++) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1)
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        output += value[index] + value[index + 1]
        index++
      } else {
        output += '\ufffd'
      }
    } else {
      output += codeUnit >= 0xdc00 && codeUnit <= 0xdfff ? '\ufffd' : value[index]
    }
  }
  return output
}
