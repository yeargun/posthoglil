import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {buildPackage} from './compiler-package.mjs'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const dev=process.argv.includes('--dev')
await buildPackage({root, profiles:[{name:dev?'development':'public',config:dev?'lilscript.dev.toml':'lilscript.toml',mode:dev?'development':'production'}],
  aliases:{'posthog.raw.js':'posthog.esm.js'},
  assets:[{source:'types/posthog.d.ts',destination:'posthog.d.ts'}]})
