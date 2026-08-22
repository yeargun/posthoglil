export type RequestRouterRegion = 'us' | 'eu' | 'custom'
export type RequestRouterTarget = 'api' | 'ui' | 'assets' | 'flags'

export type RouterConfig = {
  api_host: string
  flags_api_host?: string
  ui_host?: string
  asset_host?: string
}

const ingestionDomain = 'i.posthog.com'
const staticAssetPath = /^\/static\//

export function normalizeHost(host: string): string {
  return host.trim().replace(/\/$/, '')
}

export function apiHostFromConfig(apiHost: string): string {
  const host = normalizeHost(apiHost)
  if (host === 'https://app.posthog.com') {
    return 'https://us.i.posthog.com'
  }
  return host
}

export function flagsApiHostFromConfig(config: RouterConfig): string {
  if (config.flags_api_host) {
    return normalizeHost(config.flags_api_host)
  }
  return apiHostFromConfig(config.api_host)
}

export function uiHostFromConfig(config: RouterConfig): string {
  let host = config.ui_host?.replace(/\/$/, '')
  if (!host) {
    host = apiHostFromConfig(config.api_host).replace(`.${ingestionDomain}`, '.posthog.com')
  }
  if (host === 'https://app.posthog.com') {
    return 'https://us.posthog.com'
  }
  return host
}

export function regionForHost(apiHost: string): RequestRouterRegion {
  const host = apiHostFromConfig(apiHost)
  if (/https:\/\/(app|us|us-assets)(\.i)?\.posthog\.com/i.test(host)) {
    return 'us'
  }
  if (/https:\/\/(eu|eu-assets)(\.i)?\.posthog\.com/i.test(host)) {
    return 'eu'
  }
  return 'custom'
}

export function endpointFor(config: RouterConfig, target: RequestRouterTarget, path = ''): string {
  if (path) {
    path = path[0] === '/' ? path : `/${path}`
  }

  if (target === 'ui') {
    return uiHostFromConfig(config) + path
  }

  if (target === 'flags') {
    return flagsApiHostFromConfig(config) + path
  }

  if (target === 'assets' && staticAssetPath.test(path) && typeof config.asset_host === 'string') {
    const override = normalizeHost(config.asset_host)
    if (override) {
      return `${override}${path}`
    }
  }

  const region = regionForHost(config.api_host)
  if (region === 'custom') {
    return apiHostFromConfig(config.api_host) + path
  }

  const suffix = ingestionDomain + path
  if (target === 'assets') {
    return `https://${region}-assets.${suffix}`
  }
  return `https://${region}.${suffix}`
}
