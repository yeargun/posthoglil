import { transform as esbuildTransform } from "esbuild"
import { minify as terserMinify } from "terser"
async function viteOxcMinify(filename, source, options) {
  const vite = await import("vite")
  if (typeof vite.minify !== "function") throw new Error("Install the pinned Vite 8 dependency.")
  return vite.minify(filename, source, options)
}

function requireCode(label, code) {
  if (typeof code !== "string" || code.length === 0) {
    throw new Error(`${label} did not produce JavaScript`)
  }
  return code
}

function formatOxcErrors(errors) {
  return errors
    .map((error) => [error.severity, error.message, error.codeframe].filter(Boolean).join(": "))
    .join("\n")
}

async function oxcLane(source, filename, mangle) {
  const result = await viteOxcMinify(filename, source, {
    module: true,
    compress: true,
    mangle,
    codegen: {
      removeWhitespace: true,
      legalComments: "none",
    },
    sourcemap: false,
  })
  if (result.errors?.length > 0) {
    throw new Error(`Vite/Oxc minification failed:\n${formatOxcErrors(result.errors)}`)
  }
  return requireCode("Vite/Oxc", result.code)
}

async function terserLane(source, mangle, passes) {
  const result = await terserMinify(source, {
    module: true,
    compress: { passes },
    mangle,
    format: { comments: false },
  })
  return requireCode("Terser", result.code)
}

export async function minifyLane(source,filename,lane){
  if(lane==='oxc-mangle')return oxcLane(source,filename,true)
  if(lane==='oxc-nomangle')return oxcLane(source,filename,false)
  if(lane==='terser-mangle')return terserLane(source,true,3)
  if(lane==='terser-nomangle')return terserLane(source,false,3)
  if(lane==='terser-passes-1')return terserLane(source,true,1)
  if(lane==='esbuild-esnext'||lane==='esbuild-es2018')return requireCode('esbuild',(await esbuildTransform(source,{sourcefile:filename,loader:'js',format:'esm',target:lane==='esbuild-esnext'?'esnext':'es2018',minify:true,legalComments:'none'})).code)
  throw Error(`Unknown minifier lane: ${lane}`)
}
export async function minifyLanes(source,filename){
  const results={}
  for(const lane of ['oxc-mangle','oxc-nomangle','terser-mangle','terser-nomangle','terser-passes-1','esbuild-esnext','esbuild-es2018'])results[lane]=await minifyLane(source,filename,lane)
  return results
}
