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

function browserWorkspacePlugin(root) {
  const vendor = join(root, "vendor", "posthog-js", "packages")
  return {
    name: "posthog-workspace-source",
    setup(build) {
      build.onResolve({ filter: /^@posthog\/browser-common(?:\/.*)?$/ }, (args) => {
        if (args.path === "@posthog/browser-common") {
          return { path: join(vendor, "browser-common", "src", "index.ts") }
        }
        return {
          path: join(
            vendor,
            "browser-common",
            "src",
            `${args.path.slice("@posthog/browser-common/".length)}.ts`,
          ),
        }
      })
      build.onResolve({ filter: /^@posthog\/core$/ }, () => ({
        // Browser modules in these benchmark lanes import only the utility
        // surface. Resolving the public barrel would also pull unrelated core
        // side effects into an otherwise tree-shakeable source benchmark.
        path: join(vendor, "core", "src", "utils", "index.ts"),
      }))
      build.onResolve({ filter: /^@posthog\/types$/ }, () => ({
        path: join(vendor, "types", "src", "index.ts"),
      }))
    },
  }
}

async function bundleBrowser(input, root) {
  return bundle({ ...input, plugins: [browserWorkspacePlugin(root)] }, root)
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

export async function bundleOfficialAutocapture(root = defaultRoot) {
  return bundleBrowser(
    {
      entryPoints: [
        join(root, "vendor", "posthog-js", "packages", "browser-common", "src", "utils", "autocapture-utils.ts"),
      ],
    },
    root,
  )
}

export async function bundleOfficialReplayCore(root = defaultRoot) {
  return bundleBrowser(
    {
      stdin: {
        contents: `
          export * from "./vendor/posthog-js/packages/browser/src/extensions/replay/external/config.ts"
          export * from "./vendor/posthog-js/packages/browser/src/extensions/replay/external/sessionrecording-utils.ts"
        `,
        loader: "ts",
        resolveDir: root,
        sourcefile: "posthog-replay-core-benchmark-entry.ts",
      },
    },
    root,
  )
}
