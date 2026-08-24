export interface AutocaptureElementProperties {
  $el_text?: string
  tag_name?: string
  attr__href?: string
  attr__id?: string
  attr__class?: string | string[]
  nth_child?: number
  nth_of_type?: number
  [key: string]: unknown
}

export interface AutocaptureConfig {
  url_allowlist?: Array<string | RegExp>
  url_ignorelist?: Array<string | RegExp>
  dom_event_allowlist?: string[]
  element_allowlist?: string[]
  css_selector_allowlist?: string[]
  css_selector_ignorelist?: string[]
}

export const MAX_DOM_ANCESTOR_DEPTH: 1000
export const autocaptureCompatibleElements: string[]
export const DEFAULT_CONTENT_IGNORELIST_WITH_STEPPERS: string[]
export function splitClassString(value: string): string[]
export function getClassNames(element: Element): string[]
export function makeSafeText(value: string | null | undefined): string | null
export function getSafeText(element: Element): string
export function getEventTarget(event: Event): Element | null
export function getParentElement(element: Element): Element | false
export function shouldCaptureDeadClick(element: Element | null, config?: boolean | { css_selector_ignorelist?: string[] }): boolean
export function isTextSelectionTarget(element: Element | null): boolean
export function shouldCaptureRageclick(
  element: Element | null,
  config?: boolean | { css_selector_ignorelist?: string[] | false; content_ignorelist?: boolean | string[]; ignore_text_selection?: boolean },
): boolean
export function shouldSkipDeadClick(element: Element | null): boolean
export function shouldCaptureDomEvent(
  element: Element,
  event: Event,
  config?: AutocaptureConfig,
  captureOnAnyElement?: boolean,
  allowedEventTypes?: string[],
  instance?: { config?: { get_current_url?: (url: string) => string } },
): boolean
export function shouldCaptureElement(element: Element): boolean
export function isSensitiveElement(element: Element): boolean
export function shouldCaptureValue(value: unknown, anchorRegexes?: boolean): boolean
export function isAngularStyleAttr(attributeName: string): boolean
export function getDirectAndNestedSpanText(element: Element): string
export function getNestedSpanText(element: Element): string
export function getElementsChainString(elements: AutocaptureElementProperties[]): string
