export type LogSeverityLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal"
export type LogAttributeValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | LogAttributeValue[]
  | { [key: string]: LogAttributeValue }

export interface CaptureLogger {
  debug(message: string): void
}

export type OtlpAnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number }
  | { arrayValue: { values: OtlpAnyValue[] } }
  | { kvlistValue: { values: OtlpKeyValue[] } }

export interface OtlpKeyValue {
  key: string
  value: OtlpAnyValue
}

export interface CaptureLogOptions {
  body: string
  level?: LogSeverityLevel
  attributes?: Record<string, LogAttributeValue>
  trace_id?: string
  span_id?: string
  trace_flags?: number
}

export interface LogSdkContext {
  distinctId?: string
  sessionId?: string
  windowId?: string
  sessionStartTimestamp?: number
  lastActivityTimestamp?: number
  currentUrl?: string
  screenName?: string
  appState?: string
  activeFeatureFlags?: string[]
}

export interface OtlpLogRecord {
  timeUnixNano: string
  observedTimeUnixNano: string
  severityNumber: number
  severityText: string
  body: { stringValue: string }
  attributes: OtlpKeyValue[]
  traceId?: string
  spanId?: string
  flags?: number
}

export interface MetricsConfig {
  serviceName?: string
  serviceVersion?: string
  environment?: string
  resourceAttributes?: Record<string, LogAttributeValue>
  beforeSend?: (payload: unknown) => unknown
  flushIntervalMs?: number
  maxSeriesPerFlush?: number
}

export interface ResolvedMetricsConfig extends MetricsConfig {
  flushIntervalMs: number
  maxSeriesPerFlush: number
}

export function getOtlpSeverityText(level: LogSeverityLevel): string
export function getOtlpSeverityNumber(level: LogSeverityLevel): number
export function toOtlpAnyValue(value: LogAttributeValue, logger?: CaptureLogger): OtlpAnyValue
export function toOtlpKeyValueList(
  attributes: Record<string, LogAttributeValue>,
  logger?: CaptureLogger,
): OtlpKeyValue[]
export function buildOtlpLogRecord(
  options: CaptureLogOptions,
  sdkContext: LogSdkContext,
  logger?: CaptureLogger,
): OtlpLogRecord
export function buildResourceAttributes(
  config: MetricsConfig,
  sdkName: string,
  sdkVersion: string,
): Record<string, LogAttributeValue>
export function buildOtlpLogsPayload(
  logRecords: OtlpLogRecord[],
  resourceAttributes: Record<string, LogAttributeValue>,
  scopeName: string,
  scopeVersion: string,
): unknown

export const DEFAULT_HISTOGRAM_BOUNDS: number[]
export function msToUnixNano(milliseconds: number): string
export function seriesKey(
  type: string,
  name: string,
  unit: string | undefined,
  attributes: Record<string, LogAttributeValue> | undefined,
): string
export function bucketIndexFor(value: number, bounds: number[]): number
export function resolveMetricsConfig(config: MetricsConfig | undefined): ResolvedMetricsConfig
export function buildMetricsResourceAttributes(
  config: ResolvedMetricsConfig,
  scopeName: string,
  scopeVersion: string,
): Record<string, LogAttributeValue>
export function buildOtlpMetricsPayload(
  metrics: unknown[],
  resourceAttributes: Record<string, LogAttributeValue>,
  scopeName: string,
  scopeVersion: string,
): unknown
