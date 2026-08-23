import { build as esbuild } from "esbuild"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

export async function bundleOfficialKernel(root = defaultRoot) {
  return bundleOfficialEntry(join(root, "official", "entry.ts"), root)
}

export async function bundleOfficialEntry(entryPoint, root = defaultRoot) {
  return bundle({ entryPoints: [entryPoint] }, root)
}

async function bundle(input, root) {
  const result = await esbuild({
    absWorkingDir: root,
    ...input,
    bundle: true,
    format: "esm",
    platform: "neutral",
    write: false,
    legalComments: "none",
    target: "esnext",
    tsconfigRaw: { compilerOptions: {} },
    alias: {
      "@": join(root, "vendor", "posthog-js", "packages", "core", "src"),
    },
  })
  const code = result.outputFiles[0]?.text
  if (typeof code !== "string" || code.length === 0) {
    throw new Error("esbuild did not emit official kernel JavaScript")
  }
  return code
}

export async function bundleOfficialSurveys(root = defaultRoot) {
  return bundleOfficialEntry(
    join(root, "vendor", "posthog-js", "packages", "core", "src", "surveys", "index.ts"),
    root,
  )
}

export async function bundleOfficialErrorTracking(root = defaultRoot) {
  return bundleOfficialEntry(
    join(root, "vendor", "posthog-js", "packages", "core", "src", "error-tracking", "index.ts"),
    root,
  )
}

export async function bundleOfficialOtlp(root = defaultRoot) {
  return bundle(
    {
      stdin: {
        contents: `
          export {
            buildOtlpLogRecord,
            buildOtlpLogsPayload,
            buildResourceAttributes,
            getOtlpSeverityNumber,
            getOtlpSeverityText,
            toOtlpAnyValue,
            toOtlpKeyValueList,
          } from "./vendor/posthog-js/packages/core/src/logs/logs-utils.ts"
          export {
            DEFAULT_HISTOGRAM_BOUNDS,
            bucketIndexFor,
            buildMetricsResourceAttributes,
            buildOtlpMetricsPayload,
            msToUnixNano,
            seriesKey,
          } from "./vendor/posthog-js/packages/core/src/metrics/metrics-utils.ts"
          export { resolveMetricsConfig } from "./vendor/posthog-js/packages/core/src/metrics/config.ts"
        `,
        loader: "ts",
        resolveDir: root,
        sourcefile: "posthog-otlp-benchmark-entry.ts",
      },
    },
    root,
  )
}
