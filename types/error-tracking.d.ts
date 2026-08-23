export type SeverityLevel = "fatal" | "error" | "warning" | "log" | "info" | "debug"
export type Platform = "node:javascript" | "web:javascript" | "hermes"

export interface Mechanism {
  handled?: boolean
  type?: "generic" | "onunhandledrejection" | "onuncaughtexception" | "onconsole" | "middleware"
  source?: string
  synthetic?: boolean
}

export interface EventHint {
  mechanism?: Partial<Mechanism>
  syntheticException?: Error | null
  skipFirstLines?: number
}

export interface StackFrame {
  platform: Platform
  filename?: string
  function?: string
  module?: string
  lineno?: number
  colno?: number
  abs_path?: string
  context_line?: string
  pre_context?: string[]
  post_context?: string[]
  in_app?: boolean
  instruction_addr?: string
  addr_mode?: string
  vars?: Record<string, unknown>
  chunk_id?: string
  [key: string]: unknown
}

export interface ExceptionLike {
  type: string
  value: string
  synthetic: boolean
  stack?: string
  cause?: ExceptionLike
  level?: SeverityLevel
}

export interface Exception {
  type?: string
  value?: string
  mechanism?: Mechanism
  module?: string
  thread_id?: number
  stacktrace?: { frames?: StackFrame[]; type: "raw" }
}

export interface ErrorProperties {
  $exception_list: Exception[]
  $exception_level?: SeverityLevel
}

export type StackParser = (stack: string, skipFirstLines?: number) => StackFrame[]
export type StackLineParser = (line: string, platform: Platform) => StackFrame | undefined
export type StackFrameModifierFn = (frames: StackFrame[]) => Promise<StackFrame[]> | StackFrame[]

export interface CoercingContext extends EventHint {
  apply(input: unknown): ExceptionLike
  next(input: unknown): ExceptionLike | undefined
}

export interface ErrorTrackingCoercer<T> {
  match(input: unknown): input is T
  coerce(input: T, context: CoercingContext): ExceptionLike | undefined
}

export class DOMExceptionCoercer implements ErrorTrackingCoercer<DOMException> {
  match(input: unknown): input is DOMException
  coerce(input: DOMException, context: CoercingContext): ExceptionLike
}
export class ErrorCoercer implements ErrorTrackingCoercer<Error> {
  match(input: unknown): input is Error
  coerce(input: Error, context: CoercingContext): ExceptionLike
}
export class ErrorEventCoercer implements ErrorTrackingCoercer<{ message: string; error?: unknown }> {
  match(input: unknown): input is { message: string; error?: unknown }
  coerce(input: { message: string; error?: unknown }, context: CoercingContext): ExceptionLike
}
export class EventCoercer implements ErrorTrackingCoercer<Event> {
  match(input: unknown): input is Event
  coerce(input: Event, context: CoercingContext): ExceptionLike
}
export class ObjectCoercer implements ErrorTrackingCoercer<Record<string, unknown>> {
  match(input: unknown): input is Record<string, unknown>
  coerce(input: Record<string, unknown>, context: CoercingContext): ExceptionLike | undefined
  getType(input: Record<string, unknown>): string
  getValue(input: object): string
}
export type PrimitiveType = null | undefined | boolean | number | string | symbol | bigint
export class PrimitiveCoercer implements ErrorTrackingCoercer<PrimitiveType> {
  match(input: unknown): input is PrimitiveType
  coerce(input: PrimitiveType, context: CoercingContext): ExceptionLike | undefined
}
export class PromiseRejectionEventCoercer implements ErrorTrackingCoercer<object> {
  match(input: unknown): input is object
  coerce(input: object, context: CoercingContext): ExceptionLike | undefined
}
export class StringCoercer implements ErrorTrackingCoercer<string> {
  match(input: unknown): input is string
  coerce(input: string, context: CoercingContext): ExceptionLike
  getInfos(input: string): [string, string]
}

export class ErrorPropertiesBuilder {
  constructor(coercers: ErrorTrackingCoercer<unknown>[], stackParser: StackParser, modifiers?: StackFrameModifierFn[])
  buildFromUnknown(input: unknown, hint?: EventHint): ErrorProperties
  modifyFrames(exceptionList: ErrorProperties["$exception_list"]): Promise<ErrorProperties["$exception_list"]>
  buildCoercingContext(mechanism: Mechanism, hint: EventHint, depth?: number): CoercingContext
}

export interface ExceptionStepsConfig {
  enabled?: boolean
  max_bytes?: number
}
export interface ResolvedExceptionStepsConfig {
  enabled: boolean
  max_bytes: number
}
export interface ExceptionStep extends Record<string, unknown> {
  $message: string
  $timestamp: string | number
}

export const EXCEPTION_STEP_INTERNAL_FIELDS: {
  readonly MESSAGE: "$message"
  readonly TIMESTAMP: "$timestamp"
}
export const DEFAULT_EXCEPTION_STEPS_CONFIG: ResolvedExceptionStepsConfig
export function resolveExceptionStepsConfig(
  config?: ExceptionStepsConfig | null,
): ResolvedExceptionStepsConfig
export function stripReservedExceptionStepFields(properties?: Record<string, unknown> | null): {
  sanitizedProperties: Record<string, unknown>
  droppedKeys: string[]
}
export class ExceptionStepsBuffer {
  constructor(config?: ExceptionStepsConfig | null)
  setConfig(config?: ExceptionStepsConfig | null): void
  add(step: ExceptionStep): void
  getAttachable(): ExceptionStep[]
  clear(): void
  size(): number
}
export class ReduceableCache<K, V> {
  constructor(maxSize: number)
  get(key: K): V | undefined
  set(key: K, value: V): void
  reduce(): void
}

export const chromeStackLineParser: StackLineParser
export const geckoStackLineParser: StackLineParser
export const winjsStackLineParser: StackLineParser
export const opera10StackLineParser: StackLineParser
export const opera11StackLineParser: StackLineParser
export const nodeStackLineParser: StackLineParser
export function createStackParser(platform: Platform, ...parsers: StackLineParser[]): StackParser
export function createDefaultStackParser(): StackParser
export function reverseAndStripFrames(stack: ReadonlyArray<StackFrame>): StackFrame[]
export function getInjectedReleaseId(): string | undefined
export function getUtf8ByteLength(value: string): number
