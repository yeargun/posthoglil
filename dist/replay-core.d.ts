export interface CapturedNetworkRequest {
  name: string
  requestHeaders?: Record<string, unknown>
  responseHeaders?: Record<string, unknown>
  requestBody?: string | null
  responseBody?: string | null
  entryType?: string
  startTime?: number
  duration?: number
  endTime?: number
  timeOrigin?: number
  timestamp?: number
  isInitial?: boolean
  [key: string]: unknown
}

export interface NetworkRecordOptions {
  initiatorTypes?: string[]
  maskRequestFn?: (request: CapturedNetworkRequest) => CapturedNetworkRequest | undefined
  recordHeaders?: boolean
  recordBody?: boolean
  recordInitialRequests?: boolean
  recordPerformance?: boolean
  performanceEntryTypeToObserve?: string[]
  payloadSizeLimitBytes?: number
  payloadHostDenyList?: string[]
  streamNetworkBody?: boolean
}

export interface SnapshotBuffer<T = unknown> {
  size: number
  data: T[]
  sizes: number[]
  sessionId: string
  windowId: string
}

export const MAX_PAYLOAD_SIZE_BYTES: 1000000
export const FULL_SNAPSHOT_EVENT_TYPE: 2
export const META_EVENT_TYPE: 4
export const INCREMENTAL_SNAPSHOT_EVENT_TYPE: 3
export const PLUGIN_EVENT_TYPE: 6
export const MUTATION_SOURCE_TYPE: 0
export const MAX_MESSAGE_SIZE: 5000000
export const SEVEN_MEGABYTES: number
export const CONSOLE_LOG_PLUGIN_NAME: "rrweb/console@1"
export const replacementImageURI: string
export const defaultNetworkOptions: Required<NetworkRecordOptions>
export function effectivePayloadLimitBytes(options: Pick<NetworkRecordOptions, "payloadSizeLimitBytes">): number
export function isInitialMaskFallback(request: CapturedNetworkRequest | undefined): boolean
export function buildNetworkRequestOptions(
  instanceConfig: {
    api_host: string
    capture_performance?: boolean
    session_recording: {
      recordHeaders?: boolean
      recordBody?: boolean
      streamNetworkBody?: boolean
      maskNetworkRequestFn?: (request: { url: string }) => { url?: string } | null | undefined
      maskCapturedNetworkRequestFn?: (request: CapturedNetworkRequest) => CapturedNetworkRequest | null | undefined
    }
  },
  remoteOptions: Pick<NetworkRecordOptions, "recordHeaders" | "recordBody" | "recordPerformance" | "payloadHostDenyList">,
  isIngestionEndpoint?: (url: string) => boolean,
): NetworkRecordOptions
export function circularReferenceReplacer(): (this: unknown, key: string, value: unknown) => unknown
export function estimateSize(value: unknown): number
export function estimateCompressedEventSize(value: unknown): number
export function ensureMaxMessageSize<T>(event: T): { event: T; size: number }
export function truncateLargeConsoleLogs<T>(event: T): T
export function splitBuffer<T>(buffer: SnapshotBuffer<T>, sizeLimit?: number): SnapshotBuffer<T>[]
