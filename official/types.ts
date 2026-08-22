export type JsonType =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonType }
  | JsonType[]

export type FeatureFlagValue = boolean | string

export type FeatureFlagDetail = {
  key: string
  enabled: boolean
  variant?: string
  reason?: unknown
  metadata?: {
    id?: number
    version?: unknown
    payload?: string
    description?: unknown
  }
}

export type FeatureFlagResult = {
  key: string
  enabled: boolean
  variant?: string
  payload: JsonType | null
}

export type PostHogV1FlagsResponse = {
  featureFlags: Record<string, FeatureFlagValue>
  featureFlagPayloads: Record<string, JsonType>
  flags?: Record<string, FeatureFlagDetail>
}

export type PostHogV2FlagsResponse = {
  flags: Record<string, FeatureFlagDetail>
  featureFlags?: Record<string, FeatureFlagValue>
  featureFlagPayloads?: Record<string, JsonType>
}

export type PostHogFlagsResponse = PostHogV1FlagsResponse & PostHogV2FlagsResponse
export type PostHogFeatureFlagsResponse = PostHogFlagsResponse
export type PostHogFlagsAndPayloadsResponse = {
  featureFlags: Record<string, FeatureFlagValue>
  featureFlagPayloads: Record<string, JsonType>
}

export type PartialWithRequired<T, K extends keyof T> = Partial<T> & Pick<T, K>
