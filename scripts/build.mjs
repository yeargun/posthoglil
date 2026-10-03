// Rebuild the complete utility group so all manifests remain consistent.
await import(process.argv.includes('--dev')?'./build-dev.mjs':'./build-utilities.mjs')
